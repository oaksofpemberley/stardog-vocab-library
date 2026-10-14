import { useState, useEffect, useCallback, useMemo } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { querySparql, getBindings, val, getLocalName } from './sparql';
import { SCHEMES_QUERY, CONCEPTS_QUERY, MAPPINGS_QUERY } from './ontologyQueries';
import { fetchProposals, fetchSettings, fetchOwnerApprovals } from './governance';
import { mergeMappings, findSimilarTerms, pairKey, groupsOfProposal as groupsOf, approvalsNeeded as approvalsFor } from './communities';

/**
 * Groups (concept schemes), their concepts, all mappings and governance proposals
 * for the current database, plus lookups shared by the Communities views.
 */
export function useCommunityData() {
  const { endpoint, db, token, getTermSteward } = useStardog();
  const [state, setState] = useState({
    loading: true, error: null, schemes: [], concepts: [], triples: [], proposals: [],
    settings: { requireOwnerApproval: false }, ownerApprovals: new Map(),
  });

  const load = useCallback(async () => {
    // Only the first load shows a loading state; reloads keep the view (and any message) on screen
    setState(s => ({ ...s, error: null }));
    try {
      const [schemeRes, conceptRes, mappingRes, proposals, settings, ownerApprovals] = await Promise.all([
        querySparql(endpoint, db, token, SCHEMES_QUERY),
        querySparql(endpoint, db, token, CONCEPTS_QUERY),
        querySparql(endpoint, db, token, MAPPINGS_QUERY),
        fetchProposals(endpoint, db, token).catch(() => []),
        fetchSettings(endpoint, db, token).catch(() => ({ requireOwnerApproval: false })),
        fetchOwnerApprovals(endpoint, db, token).catch(() => new Map()),
      ]);
      setState({
        loading: false,
        error: null,
        schemes: getBindings(schemeRes).map(b => ({
          uri: val(b, 'scheme'), label: val(b, 'label'), definition: val(b, 'definition'),
          declaredOwner: val(b, 'declaredOwner'), conceptCount: parseInt(val(b, 'concepts') || '0', 10),
        })),
        concepts: getBindings(conceptRes).map(b => ({
          uri: val(b, 'concept'), scheme: val(b, 'scheme'), prefLabel: val(b, 'prefLabel'),
          definition: val(b, 'definition'), altLabels: val(b, 'altLabels').split('\u001f').filter(Boolean),
        })),
        triples: getBindings(mappingRes).map(b => ({
          source: val(b, 'source'), relation: val(b, 'relation'), target: val(b, 'target'), graph: val(b, 'g'),
        })),
        proposals,
        settings,
        ownerApprovals,
      });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, [endpoint, db, token]);

  useEffect(() => { load(); }, [load]);

  const derived = useMemo(() => {
    const schemeByUri = new Map(state.schemes.map(s => [s.uri, s]));
    const conceptByUri = new Map(state.concepts.map(c => [c.uri, c]));
    const schemeLabel = (uri) => (uri ? schemeByUri.get(uri)?.label || getLocalName(uri) : 'No group');
    const conceptLabel = (uri) => conceptByUri.get(uri)?.prefLabel || getLocalName(uri);
    // Owner: the governed steward of the scheme, else an owner declared in the data
    const ownerOf = (schemeUri) => {
      const steward = getTermSteward(schemeUri);
      if (steward) return { name: steward.name, account: steward.account, governed: true };
      const declared = schemeByUri.get(schemeUri)?.declaredOwner;
      if (!declared) return null;
      return { name: /^[a-z][a-z0-9+.-]*:\/\//i.test(declared) ? getLocalName(declared) : declared, governed: false };
    };
    const schemeUris = new Set(schemeByUri.keys());
    const groupsOfProposal = (p) => groupsOf(p, state.concepts, schemeUris);
    const approvalsNeeded = (p) => approvalsFor(p, {
      requireOwnerApproval: state.settings.requireOwnerApproval, concepts: state.concepts, schemeUris, stewardOf: getTermSteward,
    });
    const mappings = mergeMappings(state.triples, state.proposals);
    // Suggestions are a to-do list: pairs that already have any mapping (even pending) are left out
    const mapped = new Set(mappings.filter(m => m.status !== 'retired' && m.status !== 'rejected').map(m => pairKey(m.source, m.target)));
    return {
      schemeByUri, conceptByUri, schemeLabel, conceptLabel, ownerOf, mappings, groupsOfProposal, approvalsNeeded,
      similar: findSimilarTerms(state.concepts, { exclude: mapped }),
    };
  }, [state, getTermSteward]);

  return { ...state, ...derived, reload: load };
}
