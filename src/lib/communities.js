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
 * - an approved "unmap" proposal whose triple is gone → "retired" (kept as history)
 * Approved rows carry their proposal (justification, reviewer) and any pending removal.
 * Proposals arrive newest first, so the first one per triple is the latest.
 */
export function mergeMappings(triples, proposals) {
  const key = (s, r, t) => `${s}|${r}|${t}`;
  const pKey = (p) => key(p.mappingSource, p.mappingRelation, p.mappingTarget);
  const hasTriple = (p) => p.mappingSource && p.mappingTarget;
  const maps = proposals.filter(p => p.type === 'mapping' && hasTriple(p));
  const unmaps = proposals.filter(p => p.type === 'unmap' && hasTriple(p));
  const latest = (list) => {
    const m = new Map();
    for (const p of list) if (!m.has(pKey(p))) m.set(pKey(p), p);
    return m;
  };
  const approvedByKey = latest(maps.filter(p => p.status === 'approved'));
  const removalPendingByKey = latest(unmaps.filter(p => p.status === 'pending'));

  const rows = [];
  const seen = new Set();
  const governedNow = new Set();
  for (const t of triples) {
    const k = key(t.source, t.relation, t.target);
    const governed = t.graph === GOVERNED_MAPPINGS_GRAPH;
    const status = governed ? 'approved' : 'asserted';
    if (seen.has(`${k}|${status}`)) continue;
    seen.add(`${k}|${status}`);
    if (governed) governedNow.add(k);
    rows.push({
      ...t, status,
      proposal: governed ? approvedByKey.get(k) || null : null,
      removalPending: governed ? removalPendingByKey.get(k) || null : null,
    });
  }
  for (const p of maps) {
    if (p.status === 'approved') continue; // shown via its triple, or as retired below
    rows.push({ source: p.mappingSource, relation: p.mappingRelation, target: p.mappingTarget, graph: null, status: p.status, proposal: p });
  }
  for (const [k, u] of latest(unmaps.filter(p => p.status === 'approved'))) {
    if (governedNow.has(k)) continue; // re-approved after it was retired
    rows.push({
      source: u.mappingSource, relation: u.mappingRelation, target: u.mappingTarget, graph: null,
      status: 'retired', proposal: approvedByKey.get(k) || null, retiredBy: u,
    });
  }
  return rows;
}

/* ── Similar (not identical) labels across groups ── */

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'by', 'with']);
const stem = (w) => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/** Content words of a label, lightly stemmed: "Orders of Magnitude" → {order, magnitude} */
export function labelTokens(label) {
  return new Set(normalizeLabel(label).split(/[^a-z0-9]+/).filter(t => t && !STOPWORDS.has(t)).map(stem));
}

const jaccard = (a, b) => {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared || 1);
};

/** Unordered key for a pair of concepts */
export const pairKey = (a, b) => [a, b].sort().join('|');

/**
 * Candidate mappings: concepts in different groups whose labels share most of their words
 * but are not identical (identical labels are already listed as shared terms).
 *
 * Scales to large vocabularies: candidates come only from words used by at most `maxWordUse`
 * concepts. A word like "data" or "system" that appears in thousands of labels says little about
 * similarity, and pairing everything that shares it would be quadratic (it ran out of memory at
 * ~20,000 concepts). Such words still count in the score of pairs found through rarer words.
 * At most `limit` suggestions are returned, best first.
 * @param exclude Set of pairKey()s to skip (e.g. pairs that already have a mapping)
 * @returns {{key, score, a, b, labelA, labelB}[]} best first
 */
export const SIMILAR_LIMIT = 300;

export function findSimilarTerms(concepts, { threshold = 0.5, exclude = new Set(), maxWordUse = 50, limit = SIMILAR_LIMIT } = {}) {
  const prepared = concepts.map(c => ({
    c,
    labels: [c.prefLabel, ...(c.altLabels || [])].filter(Boolean)
      .map(text => ({ text, norm: normalizeLabel(text), tokens: labelTokens(text) })),
  }));
  const byToken = new Map();
  prepared.forEach((p, i) => {
    for (const l of p.labels) for (const t of l.tokens) {
      if (!byToken.has(t)) byToken.set(t, new Set());
      byToken.get(t).add(i);
    }
  });

  const results = new Map();
  for (const indices of byToken.values()) {
    if (indices.size > maxWordUse) continue; // too common to suggest anything
    const list = [...indices];
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const a = prepared[list[x]], b = prepared[list[y]];
        if (a.c.uri === b.c.uri || (a.c.scheme || '') === (b.c.scheme || '')) continue;
        const k = pairKey(a.c.uri, b.c.uri);
        if (results.has(k) || exclude.has(k)) continue;
        if (a.labels.some(la => b.labels.some(lb => la.norm === lb.norm))) { results.set(k, null); continue; }
        let best = null;
        for (const la of a.labels) for (const lb of b.labels) {
          const score = jaccard(la.tokens, lb.tokens);
          if (!best || score > best.score) best = { score, labelA: la.text, labelB: lb.text };
        }
        results.set(k, best && best.score >= threshold ? { key: `similar:${k}`, a: a.c, b: b.c, ...best } : null);
      }
    }
  }
  return [...results.values()].filter(Boolean)
    .sort((p, q) => q.score - p.score || p.labelA.localeCompare(q.labelA))
    .slice(0, limit);
}
