import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { querySparql, listDatabases, getBindings, val, hasPendingWrites, requestToken, fetchIdentity, tokenAccount } from '../lib/sparql';
import { CLASSES_QUERY, PROPERTIES_QUERY, INSTANCE_COUNTS_QUERY, NAMED_GRAPHS_QUERY, SHACL_SHAPES_QUERY } from '../lib/ontologyQueries';
import { fetchStatuses, fetchStewards, setActingAccount } from '../lib/governance';
import { loadJson, saveJson, loadText, saveText, removeKey } from '../lib/storage';
import { readHash, updateHash } from '../lib/urlState';

const StardogContext = createContext(null);

// What survives a refresh, and where:
const CONNECTION_KEY = 'vocab_connection';   // localStorage: endpoint, db, username — no secrets
const TOKEN_KEY = 'vocab_token';             // sessionStorage: kept across refresh, dropped when the tab closes
const AUTO_CONNECT_KEY = 'vocab_auto_connect'; // localStorage: reconnect on load until the user disconnects

function initialConnection() {
  const saved = loadJson('local', CONNECTION_KEY) || {};
  // Older versions kept the Bearer token in localStorage; move it to sessionStorage
  if (saved.token) {
    saveText('session', TOKEN_KEY, saved.token);
    delete saved.token;
    saveJson('local', CONNECTION_KEY, saved);
  }
  return {
    endpoint: saved.endpoint ?? import.meta.env.VITE_STARDOG_ENDPOINT ?? '',
    // The URL wins, so each tab (and each bookmark) keeps its own database across refreshes
    db: readHash().get('db') || saved.db || import.meta.env.VITE_STARDOG_DB || '',
    token: loadText('session', TOKEN_KEY) || import.meta.env.VITE_STARDOG_TOKEN || '',
    username: saved.username ?? '',
  };
}

export function StardogProvider({ children }) {
  const [connection, setConnection] = useState(initialConnection);
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
  const [databases, setDatabases] = useState([]);
  // The Stardog account requests run as, as reported by Stardog (null = unknown).
  // signedIn = the user's own account (token); otherwise the proxy's shared account.
  const [identity, setIdentity] = useState(null);

  // Incremented on every load / list request; late replies from an older request are dropped
  const loadGen = useRef(0);
  const listGen = useRef(0);

  const { endpoint, db, token, username } = connection;

  const updateConnection = useCallback((updates) => {
    setConnection(prev => {
      const next = { ...prev, ...updates };
      saveJson('local', CONNECTION_KEY, { endpoint: next.endpoint, db: next.db, username: next.username });
      if (next.token) saveText('session', TOKEN_KEY, next.token);
      else removeKey('session', TOKEN_KEY);
      return next;
    });
  }, []);

  const query = useCallback((q) => querySparql(endpoint, db, token, q), [endpoint, db, token]);

  // targetDb / tokenOverride let a switch or a sign-in load before connection state re-renders
  const loadOntology = useCallback(async (targetDb, tokenOverride) => {
    const db = targetDb || connection.db;
    const token = tokenOverride ?? connection.token;
    const gen = ++loadGen.current;
    const isCurrent = () => gen === loadGen.current;
    setLoading(true);
    setError(null);
    // Clear the previous database's data so a switch never shows stale terms
    setClasses([]); setProperties([]); setInstanceCounts({}); setNamedGraphs([]);
    setShaclShapes([]); setGovStatuses({}); setGovStewards({});
    try {
      // Phase 1: Essential queries (classes + properties) — must succeed
      const classRes = await querySparql(endpoint, db, token, CLASSES_QUERY);
      const propRes = await querySparql(endpoint, db, token, PROPERTIES_QUERY);
      if (!isCurrent()) return;
      setClasses(getBindings(classRes).map(b => ({
        uri: val(b, 'class'), label: val(b, 'label'), comment: val(b, 'comment'), type: val(b, 'type'),
      })));
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

      // Mark as connected — the essential data is loaded
      setConnected(true);
      setLoading(false);
      saveText('local', AUTO_CONNECT_KEY, '1');
      updateHash({ db });

      // Who Stardog says we are: recorded on every governance write, and used for owner approval
      fetchIdentity(endpoint, token).then(account => {
        if (!isCurrent()) return;
        setIdentity(account ? { account, signedIn: Boolean(token) && tokenAccount(token) === account } : null);
        setActingAccount(account);
      });

      // Phase 2: Non-blocking optional queries — failures don't block the UI
      querySparql(endpoint, db, token, INSTANCE_COUNTS_QUERY).then(countRes => {
        if (!isCurrent()) return;
        const counts = {};
        for (const b of getBindings(countRes)) counts[val(b, 'type')] = parseInt(val(b, 'count'), 10);
        setInstanceCounts(counts);
      }).catch(e => console.warn('[Vocab] Instance counts failed (non-critical):', e.message));

      querySparql(endpoint, db, token, NAMED_GRAPHS_QUERY).then(graphRes => {
        if (isCurrent()) setNamedGraphs(getBindings(graphRes).map(b => val(b, 'g')));
      }).catch(e => console.warn('[Vocab] Named graphs failed (non-critical):', e.message));

      querySparql(endpoint, db, token, SHACL_SHAPES_QUERY).then(shaclRes => {
        if (!isCurrent()) return;
        setShaclShapes(getBindings(shaclRes).map(b => ({
          shape: val(b, 'shape'), targetClass: val(b, 'targetClass'), path: val(b, 'path'),
          name: val(b, 'name'), datatype: val(b, 'datatype'),
          minCount: val(b, 'minCount'), maxCount: val(b, 'maxCount'),
          pattern: val(b, 'pattern'), nodeKind: val(b, 'nodeKind'),
        })));
      }).catch(e => console.warn('[Vocab] SHACL shapes failed (non-critical):', e.message));

      // Phase 3: Governance — read-only on connect, so browsing a database never writes to it.
      // VOCAB:GOVERNANCE is created by the first governance action (status, steward, note, proposal).
      Promise.all([
        fetchStatuses(endpoint, db, token).catch(() => ({})),
        fetchStewards(endpoint, db, token).catch(() => ({})),
      ]).then(([statuses, stewards]) => {
        if (!isCurrent()) return;
        setGovStatuses(statuses);
        setGovStewards(stewards);
      });
    } catch (e) {
      if (!isCurrent()) return;
      console.error('[Vocab] Critical load error:', e);
      setError(e.message);
      setConnected(false);
      setLoading(false);
    }
  }, [endpoint, connection.db, connection.token]);

  /** Sign in as a Stardog user: the password is exchanged for a Stardog token and not kept */
  const signIn = useCallback(async (username, password) => {
    const newToken = await requestToken(endpoint, username, password);
    updateConnection({ token: newToken });
    return loadOntology(undefined, newToken);
  }, [endpoint, updateConnection, loadOntology]);

  /** Back to the shared (proxy) account */
  const signOut = useCallback(() => {
    updateConnection({ token: '' });
    return loadOntology(undefined, '');
  }, [updateConnection, loadOntology]);

  const refreshDatabases = useCallback(async () => {
    const gen = ++listGen.current;
    if (!endpoint) { setDatabases([]); return []; }
    try {
      const list = await listDatabases(endpoint, token);
      if (gen === listGen.current) setDatabases(list);
      return list;
    } catch (e) {
      // Never keep showing another server's (or another token's) database list
      if (gen === listGen.current) setDatabases([]);
      throw e;
    }
  }, [endpoint, token]);

  const switchDatabase = useCallback((nextDb) => {
    updateConnection({ db: nextDb });
    updateHash({ db: nextDb, term: null });
    return loadOntology(nextDb);
  }, [updateConnection, loadOntology]);

  const disconnect = useCallback(() => {
    removeKey('local', AUTO_CONNECT_KEY);
    removeKey('local', CONNECTION_KEY);
    removeKey('session', TOKEN_KEY);
    window.location.hash = '';
    window.location.reload();
  }, []);

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

  // After a refresh, reconnect automatically (until the user explicitly disconnects)
  const autoConnectTried = useRef(false);
  useEffect(() => {
    if (autoConnectTried.current) return;
    autoConnectTried.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync with the remote server on mount
    if (loadText('local', AUTO_CONNECT_KEY) === '1' && endpoint && connection.db) loadOntology();
  }, [loadOntology, endpoint, connection.db]);

  // Warn before a refresh or close would cut off a governance write that is still in flight
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hasPendingWrites()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const getTermStatus = useCallback((uri) => govStatuses[uri] || 'Active', [govStatuses]);
  const getTermSteward = useCallback((uri) => govStewards[uri] || null, [govStewards]);

  return (
    <StardogContext.Provider value={{
      connection, updateConnection, connected, loading, error,
      classes, properties, instanceCounts, namedGraphs, shaclShapes,
      govStatuses, govStewards, getTermStatus, getTermSteward,
      loadOntology, refreshGovernance, query,
      databases, refreshDatabases, switchDatabase, disconnect,
      identity, signIn, signOut,
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
