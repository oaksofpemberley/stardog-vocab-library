/**
 * Generic Stardog SPARQL client — read + write operations.
 * Works with any Stardog endpoint.
 */

/**
 * Quote a value as a SPARQL/Turtle string literal. Every user- or data-supplied
 * literal must go through this — raw interpolation allows SPARQL injection.
 */
export function sparqlString(value) {
  const escaped = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

/** Wrap an absolute IRI in <>, rejecting anything that could break out of the IRI. */
export function sparqlIri(iri) {
  const s = String(iri ?? '');
  // SPARQL IRIREF forbids <>"{}|^`\ and control/space characters; require a scheme
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (!/^[A-Za-z][A-Za-z0-9+.-]*:[^\u0000- <>"{}|^`\\]*$/.test(s)) {
    throw new Error(`Invalid IRI: ${s.slice(0, 80)}`);
  }
  return `<${s}>`;
}

/** Map a governance status (e.g. "UnderReview") to its CSS/filter key (e.g. "review"). */
export function statusKey(status) {
  if (!status) return 'active';
  return status === 'UnderReview' ? 'review' : status.toLowerCase();
}

// Writes in flight, so the app can warn before a refresh/close cuts one off
let pendingWrites = 0;
export const hasPendingWrites = () => pendingWrites > 0;

export async function querySparql(endpoint, db, token, query, timeoutMs = 30000) {
  // Default graph = union of all local graphs. named-graph-uri is required too: with only
  // default-graph-uri, the dataset has NO named graphs and every GRAPH <...> pattern
  // (including all governance reads from VOCAB:GOVERNANCE) silently returns nothing.
  const url = `${endpoint}/${encodeURIComponent(db)}/query?default-graph-uri=tag:stardog:api:context:local&named-graph-uri=tag:stardog:api:context:local`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': 'application/sparql-results+json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: query,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`SPARQL Query Error (${res.status}): ${await res.text()}`);
    return res.json();
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Query timed out (30s). The query may be too complex for this database.', { cause: e });
    throw e;
  }
}

export async function updateSparql(endpoint, db, token, update) {
  const url = `${endpoint}/${encodeURIComponent(db)}/update`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  pendingWrites++;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sparql-update',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: update,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`SPARQL Update Error (${res.status}): ${await res.text()}`);
    return true;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Update timed out (15s).', { cause: e });
    throw e;
  } finally {
    pendingWrites--;
  }
}

/** List the databases on the server (needs admin read access) */
export async function listDatabases(endpoint, token) {
  const res = await fetch(`${endpoint}/admin/databases`, {
    headers: {
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`List databases failed (${res.status}): ${await res.text()}`);
  const { databases = [] } = await res.json();
  return [...databases].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Base64 for HTTP Basic credentials (handles non-ASCII usernames/passwords) */
function base64(text) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

/**
 * Sign in as a Stardog user: exchange username/password for a Stardog-issued token.
 * Only the token is kept; the password is used for this one request.
 */
export async function requestToken(endpoint, username, password) {
  const res = await fetch(`${endpoint}/admin/token`, {
    headers: { 'Accept': 'application/json', 'Authorization': `Basic ${base64(`${username}:${password}`)}` },
  });
  if (res.status === 401) throw new Error('Wrong Stardog username or password.');
  if (!res.ok) throw new Error(`Stardog could not issue a sign-in token (${res.status}).`);
  return (await res.json()).token;
}

/** The account inside a Stardog-issued token (JWT "sub" claim), or null */
export function tokenAccount(jwt) {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0)));
    return JSON.parse(json).sub || null;
  } catch {
    return null;
  }
}

/**
 * Which Stardog account the current credentials belong to (token, or the proxy's shared
 * account), as stated by Stardog itself: it issues a token for the authenticated caller.
 * Returns null if the server cannot say (e.g. token issuing is disabled).
 */
export async function fetchIdentity(endpoint, token) {
  try {
    const res = await fetch(`${endpoint}/admin/token`, {
      headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    });
    if (!res.ok) return null;
    return tokenAccount((await res.json()).token);
  } catch {
    return null;
  }
}

/** Stardog accounts, for picking a group owner (needs permission to list users; null if not allowed) */
export async function listUsers(endpoint, token) {
  try {
    const res = await fetch(`${endpoint}/admin/users`, {
      headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
    });
    if (!res.ok) return null;
    return ((await res.json()).users || []).sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
}

/** Extract bindings array from SPARQL JSON result */
export function getBindings(result) {
  return result?.results?.bindings || [];
}

/** Get value from a binding */
export function val(binding, key) {
  return binding?.[key]?.value || '';
}

/** Build a prefixed display name from a URI */
export function toPrefixed(uri) {
  const prefixes = {
    'http://example.org/ontology#': 'ex:',
    'http://example.org/ontology/org#': 'org:',
    'http://www.w3.org/2002/07/owl#': 'owl:',
    'http://www.w3.org/2000/01/rdf-schema#': 'rdfs:',
    'https://schema.org/': 'so:',
    'http://www.w3.org/ns/shacl#': 'sh:',
    'http://www.w3.org/2001/XMLSchema#': 'xsd:',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#': 'rdf:',
    'http://www.w3.org/2004/02/skos/core#': 'skos:',
    'http://vocab.gov/ontology#': 'gov:',
  };
  for (const [ns, prefix] of Object.entries(prefixes)) {
    if (uri.startsWith(ns)) return prefix + uri.slice(ns.length);
  }
  // fallback: take last segment
  const hash = uri.lastIndexOf('#');
  const slash = uri.lastIndexOf('/');
  const idx = Math.max(hash, slash);
  return idx > -1 ? uri.slice(idx + 1) : uri;
}

/** Extract namespace from a URI */
export function getNamespace(uri) {
  const hash = uri.lastIndexOf('#');
  const slash = uri.lastIndexOf('/');
  const idx = Math.max(hash, slash);
  return idx > -1 ? uri.slice(0, idx + 1) : uri;
}

/** Extract local name from a URI */
export function getLocalName(uri) {
  const hash = uri.lastIndexOf('#');
  const slash = uri.lastIndexOf('/');
  const idx = Math.max(hash, slash);
  return idx > -1 ? uri.slice(idx + 1) : uri;
}
