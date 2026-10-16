import { useState } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { createProposal, PROPOSAL_TYPE_LABEL as TYPE_LABEL } from '../lib/governance';
import { toPrefixed } from '../lib/sparql';
import { MAPPING_RELATIONS, relationLabel } from '../lib/communities';
import { suggestIri, planNewTerms } from '../lib/terms';
import { useDraft } from '../lib/useDraft';

const EMPTY_PROPOSAL = {
  type: 'modify', title: '', desc: '', termUri: '',
  label: '', definition: '', scheme: '', iri: '', source: '', relation: MAPPING_RELATIONS[1].iri, target: '',
};

/**
 * The change-proposal form. Nothing changes until a reviewer approves the proposal.
 * Opened from the Review Queue (any type), or pre-filled from a group or term page:
 *   initial   fields to start from (merged over EMPTY_PROPOSAL); origLabel/origDefinition mark an edit,
 *             so only the fields that changed are proposed
 *   draftKey  where unsent input is kept (one per group/term, so it never overwrites another draft)
 *   fixedType hide the type selector
 *   ontologyTargets offer only ontology classes as mapping targets ("Link to ontology")
 */
export default function ProposalModal({ community, draftKey, initial = {}, fixedType = false, ontologyTargets = false, heading, onClose, onCreated }) {
  const { endpoint, db, token, connection, classes, properties } = useStardog();
  const start = { ...EMPTY_PROPOSAL, ...initial };
  const [draft, setDraft, clearDraft] = useDraft(draftKey, start);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const field = (name) => ({ value: draft[name] ?? '', onChange: (e) => setDraft(d => ({ ...d, [name]: e.target.value })) });

  const terms = [...classes].sort((a, b) => (a.label || a.uri).localeCompare(b.label || b.uri));
  const groups = classes.filter(c => c.type === 'skos:ConceptScheme');
  const ontologyClasses = terms.filter(c => c.type === 'owl:Class' && !community.conceptByUri.has(c.uri));
  // Shared labels ("model" in three groups) are told apart by their group
  const termName = (uri) => {
    const label = classes.find(c => c.uri === uri)?.label || toPrefixed(uri);
    const concept = community.conceptByUri.get(uri);
    return concept?.scheme ? `${label} — ${community.schemeLabel(concept.scheme)}` : label;
  };

  // An edit proposes only what changed; from the Review Queue (no original), a filled field is a change
  const changed = (value, orig) => {
    const v = (value || '').trim();
    return v && v !== (orig || '').trim() ? v : '';
  };
  const newLabel = changed(draft.label, draft.origLabel);
  const newDefinition = changed(draft.definition, draft.origDefinition);

  // A new term's IRI must be unused, and its label new to the group (R7.4)
  const addCheck = draft.type === 'add' && draft.scheme && draft.label.trim()
    ? planNewTerms([{ line: 1, label: draft.label, definition: draft.definition, iri: draft.iri }], {
      scheme: draft.scheme, concepts: community.concepts,
      existing: new Map([...classes, ...properties].map(t => [t.uri, t.label || toPrefixed(t.uri)])),
      pendingIris: new Set(community.proposals.filter(p => p.type === 'add' && p.status === 'pending').map(p => p.proposedIri)),
    })[0]
    : null;

  const isMap = draft.type === 'mapping' || draft.type === 'unmap';
  const canSubmit = !saving && (
    draft.type === 'modify' ? Boolean(newLabel || newDefinition || (draft.origLabel === undefined && draft.title.trim()))
      : draft.type === 'add' ? Boolean(addCheck && addCheck.status !== 'error')
        : true);

  const close = (sent) => { if (sent) clearDraft(); onClose(); };

  const submit = async () => {
    setError(null);
    const d = draft;
    const iri = d.type === 'add' ? addCheck?.iri || '' : '';
    const title = d.title.trim() || (isMap
      ? `${d.type === 'unmap' ? 'Remove: ' : ''}${termName(d.source)} ${relationLabel(d.relation)} ${termName(d.target)}`
      : d.type === 'add' ? `Add "${d.label.trim()}"` : `${TYPE_LABEL[d.type]}: ${termName(d.termUri)}`);
    setSaving(true);
    try {
      await createProposal(endpoint, db, token, {
        type: d.type, title, description: d.desc, proposedBy: connection.username || 'anonymous',
        termUri: d.type === 'modify' || d.type === 'deprecate' ? d.termUri : '',
        proposedLabel: d.type === 'add' ? d.label.trim() : d.type === 'modify' ? newLabel : '',
        proposedDefinition: d.type === 'add' ? d.definition.trim() : d.type === 'modify' ? newDefinition : '',
        proposedIri: iri, proposedScheme: d.type === 'add' ? d.scheme : '',
        mappingSource: isMap ? d.source : '',
        mappingRelation: isMap ? d.relation : '',
        mappingTarget: isMap ? d.target : '',
      });
      close(true);
      await onCreated?.();
    } catch (e) {
      console.error('[Vocab] Proposal creation failed:', e);
      setError(`Failed to save proposal: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const targetOptions = ontologyTargets ? ontologyClasses : terms;

  return (
    <div className="modal-overlay" onClick={() => close(false)}>
      <div className="modal fade-in" onClick={e => e.stopPropagation()} role="dialog" aria-label={heading || 'New Change Proposal'}>
        <div className="modal-title">{heading || 'New Change Proposal'}</div>
        <div className="modal-subtitle">Nothing changes until a reviewer approves it in the Review Queue.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!fixedType && (
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="select" {...field('type')}>
                {Object.entries(TYPE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          )}

          {(draft.type === 'modify' || draft.type === 'deprecate') && (
            fixedType ? <div className="form-help" style={{ margin: 0 }}>Term: <strong>{termName(draft.termUri)}</strong></div> : (
              <div className="form-group">
                <label className="form-label">Target Term</label>
                <select className="select" {...field('termUri')}>
                  <option value="">Select a term...</option>
                  {terms.map(c => <option key={c.uri} value={c.uri}>{termName(c.uri)}</option>)}
                </select>
              </div>
            )
          )}

          {draft.type === 'add' && (
            fixedType ? <div className="form-help" style={{ margin: 0 }}>Group: <strong>{community.schemeLabel(draft.scheme)}</strong></div> : (
              <div className="form-group">
                <label className="form-label">Group</label>
                <select className="select" {...field('scheme')}>
                  <option value="">Select a group...</option>
                  {groups.map(g => <option key={g.uri} value={g.uri}>{g.label || toPrefixed(g.uri)}</option>)}
                </select>
              </div>
            )
          )}

          {(draft.type === 'add' || draft.type === 'modify') && (
            <>
              <div className="form-group">
                <label className="form-label">{draft.type === 'add' ? 'Label' : draft.origLabel !== undefined ? 'Label' : 'New label (optional)'}</label>
                <input className="input" {...field('label')} autoFocus={draft.type === 'add'} />
              </div>
              <div className="form-group">
                <label className="form-label">{draft.type === 'add' ? 'Definition (optional)' : draft.origLabel !== undefined ? 'Definition' : 'New definition (optional)'}</label>
                <textarea className="textarea" {...field('definition')} />
              </div>
            </>
          )}

          {draft.type === 'add' && (
            <div className="form-group">
              <label className="form-label">IRI</label>
              <input className="input" {...field('iri')} placeholder={suggestIri(draft.scheme, draft.label) || 'http://…'} />
              {addCheck?.status === 'error' && <span className="connection-status error" role="alert">{addCheck.message}</span>}
              {addCheck?.status === 'shared' && (
                <span className="form-help">Also a term in {addCheck.sharedWith.map(community.schemeLabel).join(', ')}. That is fine: each group keeps its own meaning, and you can map them later.</span>
              )}
            </div>
          )}

          {isMap && (
            <>
              <div className="form-group">
                <label className="form-label">{ontologyTargets ? 'Term' : 'Source term'}</label>
                {ontologyTargets ? <div className="form-help" style={{ margin: 0 }}><strong>{termName(draft.source)}</strong></div> : (
                  <select className="select" {...field('source')}>
                    <option value="">Select a term...</option>
                    {terms.map(c => <option key={c.uri} value={c.uri}>{termName(c.uri)}</option>)}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Relation</label>
                <select className="select" {...field('relation')}>
                  {MAPPING_RELATIONS.map(r => <option key={r.iri} value={r.iri}>{r.label}</option>)}
                </select>
                <span className="form-help">{MAPPING_RELATIONS.find(r => r.iri === draft.relation)?.help}</span>
              </div>
              <div className="form-group">
                <label className="form-label">{ontologyTargets ? 'Ontology concept' : 'Target term'}</label>
                <select className="select" {...field('target')}>
                  <option value="">{ontologyTargets && targetOptions.length === 0 ? 'No ontology classes (owl:Class) in this database' : 'Select a term...'}</option>
                  {targetOptions.map(c => <option key={c.uri} value={c.uri}>{termName(c.uri)}{ontologyTargets ? ` (${toPrefixed(c.uri)})` : ''}</option>)}
                </select>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Title <span className="muted">(optional)</span></label>
            <input className="input" {...field('title')} placeholder="Brief description of the change" />
          </div>
          <div className="form-group">
            <label className="form-label">{draft.type === 'mapping' ? 'Justification (required)' : draft.type === 'unmap' ? 'Reason (required)' : 'Description'}</label>
            <textarea className="textarea" {...field('desc')} placeholder={draft.type === 'mapping' ? 'Why are these related?' : 'Why this change?'} />
          </div>
        </div>
        {error && <div className="connection-status error" role="alert" style={{ marginTop: 12 }}>⚠️ {error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => close(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>Submit Proposal</button>
        </div>
      </div>
    </div>
  );
}
