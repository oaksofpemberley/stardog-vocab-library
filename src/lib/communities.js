/**
 * Communities: groups (SKOS concept schemes), shared terms and mappings.
 * Pure functions, unit-tested in communities.test.js.
 */

const SKOS = 'http://www.w3.org/2004/02/skos/core#';

/** SKOS mapping relations, with the plain-language meaning shown in the UI */
export const MAPPING_RELATIONS = [
  { iri: `${SKOS}exactMatch`, label: 'exact match', help: 'Interchangeable in any context.' },
  { iri: `${SKOS}closeMatch`, label: 'close match', help: 'Interchangeable in some contexts, but not everywhere.' },
  { iri: `${SKOS}broadMatch`, label: 'broad match', help: 'The target is a broader concept than the source.' },
  { iri: `${SKOS}narrowMatch`, label: 'narrow match', help: 'The target is a narrower concept than the source.' },
  { iri: `${SKOS}relatedMatch`, label: 'related match', help: 'Associated, but different concepts. Not interchangeable.' },
];

export const MAPPING_RELATION_IRIS = MAPPING_RELATIONS.map(r => r.iri);
export const GOVERNED_MAPPINGS_GRAPH = 'VOCAB:MAPPINGS';

export const relationLabel = (iri) => MAPPING_RELATIONS.find(r => r.iri === iri)?.label || iri;

/** Labels match ignoring case, surrounding and repeated whitespace */
export function normalizeLabel(label) {
  return String(label || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Find labels used by concepts in two or more different schemes.
 * @param {{uri, scheme, prefLabel, altLabels: string[]}[]} concepts
 * @returns {{key: string, label: string, concepts: object[], schemes: string[]}[]}
 *   sorted by number of groups (most first), then label
 */
export function findSharedTerms(concepts) {
  const byLabel = new Map();
  for (const c of concepts) {
    const labels = new Set([c.prefLabel, ...(c.altLabels || [])].map(normalizeLabel).filter(Boolean));
    for (const key of labels) {
      if (!byLabel.has(key)) byLabel.set(key, new Map());
      byLabel.get(key).set(`${c.uri}|${c.scheme || ''}`, c);
    }
  }
  const shared = [];
  for (const [key, entries] of byLabel) {
    const list = [...entries.values()];
    const schemes = [...new Set(list.map(c => c.scheme || ''))];
    if (schemes.length < 2) continue;
    // Display the preferred label as written by one of the groups, if any uses it as prefLabel
    const label = list.find(c => normalizeLabel(c.prefLabel) === key)?.prefLabel || key;
    shared.push({ key, label, concepts: list, schemes });
  }
  return shared.sort((a, b) => b.schemes.length - a.schemes.length || a.key.localeCompare(b.key));
}

/**
 * Merge mappings found in the data with governed mapping proposals into one list.
 * - triples in VOCAB:MAPPINGS → "approved" (governed); other graphs → "asserted"
 * - mapping proposals that are pending/rejected are listed with that status
 * Approved proposals annotate their materialized triple with justification and reviewer.
 */
export function mergeMappings(triples, proposals) {
  const key = (s, r, t) => `${s}|${r}|${t}`;
  const mappingProposals = proposals.filter(p => p.type === 'mapping' && p.mappingSource && p.mappingTarget);
  const approvedByKey = new Map(mappingProposals
    .filter(p => p.status === 'approved')
    .map(p => [key(p.mappingSource, p.mappingRelation, p.mappingTarget), p]));

  const rows = [];
  const seen = new Set();
  for (const t of triples) {
    const k = key(t.source, t.relation, t.target);
    const governed = t.graph === GOVERNED_MAPPINGS_GRAPH;
    const status = governed ? 'approved' : 'asserted';
    if (seen.has(`${k}|${status}`)) continue;
    seen.add(`${k}|${status}`);
    rows.push({ ...t, status, proposal: governed ? approvedByKey.get(k) || null : null });
  }
  for (const p of mappingProposals) {
    if (p.status === 'approved') continue; // shown via its materialized triple
    rows.push({ source: p.mappingSource, relation: p.mappingRelation, target: p.mappingTarget, graph: null, status: p.status, proposal: p });
  }
  return rows;
}
