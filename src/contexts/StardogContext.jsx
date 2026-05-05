import { createContext, useContext, useState, useCallback } from 'react';
import { querySparql, getBindings, val } from '../lib/sparql';
import { CLASSES_QUERY, PROPERTIES_QUERY, INSTANCE_COUNTS_QUERY, NAMED_GRAPHS_QUERY, SHACL_SHAPES_QUERY } from '../lib/ontologyQueries';
import { bootstrapGovernanceGraph, fetchStatuses, fetchStewards } from '../lib/governance';

const StardogContext = createContext(null);

export function StardogProvider({ children }) {
  const [connection, setConnection] = useState(() => {
    const saved = localStorage.getItem('vocab_connection');
    if (saved) return JSON.parse(saved);
    return {
      endpoint: import.meta.env.VITE_STARDOG_ENDPOINT || '',
      db: import.meta.env.VITE_STARDOG_DB || '',
      token: import.meta.env.VITE_STARDOG_TOKEN || '',
      username: '',
    };
  });
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Ontology data
  const [classes, setClasses] = useState([]);
  const [properties, setProperties] = useState([]);
  const [instanceCounts, setInstanceCounts] = useState({});
  const [namedGraphs, setNamedGraphs] = useState([]);
  const [shaclShapes, setShaclShapes] = useState([]);
  const [govStatuses, setGovStatuses] = useState({});
  const [govStewards, setGovStewards] = useState({});

  const { endpoint, db, token, username } = connection;

  const updateConnection = useCallback((updates) => {
    setConnection(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem('vocab_connection', JSON.stringify(next));
      return next;
    });
  }, []);

  const query = useCallback((q) => querySparql(endpoint, db, token, q), [endpoint, db, token]);

  const loadOntology = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Phase 1: Essential queries (classes + properties) — must succeed
      console.log('[Vocab] Loading classes...');
      const classRes = await querySparql(endpoint, db, token, CLASSES_QUERY);
      setClasses(getBindings(classRes).map(b => ({
        uri: val(b, 'class'), label: val(b, 'label'), comment: val(b, 'comment'), type: val(b, 'type'),
      })));
      console.log(`[Vocab] Loaded ${getBindings(classRes).length} classes`);

      console.log('[Vocab] Loading properties...');
      const propRes = await querySparql(endpoint, db, token, PROPERTIES_QUERY);
      const props = getBindings(propRes).map(b => ({
        uri: val(b, 'prop'), label: val(b, 'label'), comment: val(b, 'comment'),
        type: val(b, 'type'),
        domain: val(b, 'soDomain') || val(b, 'rdfsDomain'),
        range: val(b, 'soRange') || val(b, 'rdfsRange'),
      }));
      // Deduplicate props that appear multiple times due to multiple domains
      const propMap = {};
      for (const p of props) {
        if (!propMap[p.uri]) {
          propMap[p.uri] = { ...p, domains: p.domain ? [p.domain] : [], ranges: p.range ? [p.range] : [] };
        } else {
          if (p.domain && !propMap[p.uri].domains.includes(p.domain)) propMap[p.uri].domains.push(p.domain);
          if (p.range && !propMap[p.uri].ranges.includes(p.range)) propMap[p.uri].ranges.push(p.range);
        }
      }
      setProperties(Object.values(propMap));
      console.log(`[Vocab] Loaded ${Object.keys(propMap).length} properties`);

      // Mark as connected — the essential data is loaded
      setConnected(true);
      setLoading(false);

      // Phase 2: Non-blocking optional queries — failures don't block the UI
      console.log('[Vocab] Loading optional data (instance counts, graphs, SHACL)...');

      querySparql(endpoint, db, token, INSTANCE_COUNTS_QUERY).then(countRes => {
        const counts = {};
        for (const b of getBindings(countRes)) counts[val(b, 'type')] = parseInt(val(b, 'count'), 10);
        setInstanceCounts(counts);
        console.log(`[Vocab] Loaded instance counts for ${Object.keys(counts).length} types`);
      }).catch(e => console.warn('[Vocab] Instance counts failed (non-critical):', e.message));

      querySparql(endpoint, db, token, NAMED_GRAPHS_QUERY).then(graphRes => {
        setNamedGraphs(getBindings(graphRes).map(b => val(b, 'g')));
      }).catch(e => console.warn('[Vocab] Named graphs failed (non-critical):', e.message));

      querySparql(endpoint, db, token, SHACL_SHAPES_QUERY).then(shaclRes => {
        setShaclShapes(getBindings(shaclRes).map(b => ({
          shape: val(b, 'shape'), targetClass: val(b, 'targetClass'), path: val(b, 'path'),
          name: val(b, 'name'), datatype: val(b, 'datatype'),
          minCount: val(b, 'minCount'), maxCount: val(b, 'maxCount'),
          pattern: val(b, 'pattern'), nodeKind: val(b, 'nodeKind'),
        })));
      }).catch(e => console.warn('[Vocab] SHACL shapes failed (non-critical):', e.message));

      // Phase 3: Governance bootstrap — also non-blocking
      bootstrapGovernanceGraph(endpoint, db, token).then(() => {
        return Promise.all([
          fetchStatuses(endpoint, db, token).catch(() => ({})),
          fetchStewards(endpoint, db, token).catch(() => ({})),
        ]);
      }).then(([statuses, stewards]) => {
        setGovStatuses(statuses);
        setGovStewards(stewards);
        console.log('[Vocab] Governance loaded');
      }).catch(e => console.warn('[Vocab] Governance bootstrap failed (non-critical):', e.message));

    } catch (e) {
      console.error('[Vocab] Critical load error:', e);
      setError(e.message);
      setConnected(false);
      setLoading(false);
    }
  }, [endpoint, db, token]);

  const refreshGovernance = useCallback(async () => {
    try {
      const [statuses, stewards] = await Promise.all([
        fetchStatuses(endpoint, db, token),
        fetchStewards(endpoint, db, token),
      ]);
      setGovStatuses(statuses);
      setGovStewards(stewards);
    } catch { /* ignore */ }
  }, [endpoint, db, token]);

  const getTermStatus = useCallback((uri) => govStatuses[uri] || 'Active', [govStatuses]);
  const getTermSteward = useCallback((uri) => govStewards[uri] || null, [govStewards]);

  return (
    <StardogContext.Provider value={{
      connection, updateConnection, connected, loading, error,
      classes, properties, instanceCounts, namedGraphs, shaclShapes,
      govStatuses, govStewards, getTermStatus, getTermSteward,
      loadOntology, refreshGovernance, query,
      endpoint, db, token, username,
    }}>
      {children}
    </StardogContext.Provider>
  );
}

export function useStardog() {
  const ctx = useContext(StardogContext);
  if (!ctx) throw new Error('useStardog must be used within StardogProvider');
  return ctx;
}
