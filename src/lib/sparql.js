/**
 * Generic Stardog SPARQL client — read + write operations.
 * Works with any Stardog endpoint.
 */

export async function querySparql(endpoint, db, token, query, timeoutMs = 30000) {
  const url = `${endpoint}/${db}/query?default-graph-uri=tag:stardog:api:context:local`;
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
    if (e.name === 'AbortError') throw new Error('Query timed out (30s). The query may be too complex for this database.');
    throw e;
  }
}

export async function updateSparql(endpoint, db, token, update) {
  const url = `${endpoint}/${db}/update`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

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
    if (e.name === 'AbortError') throw new Error('Update timed out (15s).');
    throw e;
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
