import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser } from 'sparqljs';
import { findSharedTerms, findSimilarTerms, labelTokens, pairKey, normalizeLabel, mergeMappings, MAPPING_RELATIONS, approvalsNeeded, linksOf, inverseRelation } from './communities';
import * as gov from './governance';

const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const concept = (uri, scheme, prefLabel, altLabels = []) => ({ uri, scheme, prefLabel, altLabels });

describe('findSharedTerms', () => {
  const concepts = [
    concept('cs:OoM', 'cs:S', 'orders of magnitude'),
    concept('phys:OoM', 'phys:S', 'Orders of  Magnitude '),
    concept('biz:OoM', 'biz:S', 'ballpark', ['orders of magnitude']),
    concept('cs:Model', 'cs:S', 'model'),
    concept('cs:Model2', 'cs:S', 'model'), // same scheme twice: not shared
    concept('phys:Unc', 'phys:S', 'uncertainty'),
  ];

  it('matches labels across groups ignoring case and whitespace, including altLabels', () => {
    const shared = findSharedTerms(concepts);
    expect(shared).toHaveLength(1);
    expect(shared[0].key).toBe('orders of magnitude');
    expect(shared[0].schemes.sort()).toEqual(['biz:S', 'cs:S', 'phys:S']);
    expect(shared[0].concepts.map(c => c.uri).sort()).toEqual(['biz:OoM', 'cs:OoM', 'phys:OoM']);
  });

  it('normalizes labels', () => {
    expect(normalizeLabel('  Orders\tof   MAGNITUDE ')).toBe('orders of magnitude');
  });
});

describe('mergeMappings', () => {
  const close = `${SKOS}closeMatch`;
  it('labels origin and status, and attaches provenance to approved mappings', () => {
    const rows = mergeMappings(
      [
        { source: 'a', relation: close, target: 'b', graph: 'VOCAB:MAPPINGS' },
        { source: 'c', relation: `${SKOS}relatedMatch`, target: 'd', graph: 'urn:vocab:physics' },
      ],
      [
        { type: 'mapping', status: 'approved', mappingSource: 'a', mappingRelation: close, mappingTarget: 'b', description: 'why', reviewer: 'r' },
        { type: 'mapping', status: 'pending', mappingSource: 'e', mappingRelation: close, mappingTarget: 'f' },
        { type: 'modify', status: 'pending' },
      ],
    );
    expect(rows.map(r => r.status)).toEqual(['approved', 'asserted', 'pending']);
    expect(rows[0].proposal.description).toBe('why');
  });
});

describe('approvals apply the proposed change (buildReviewUpdate)', () => {
  const parse = (u) => new Parser().parse(u).updates;
  // All quads an update would INSERT / DELETE, as "graph|s|p|o" strings
  const quads = (ops, key) => ops.flatMap(op => (op[key] || []).flatMap(b => b.triples.map(t =>
    `${b.name?.value || 'default'}|${t.subject.value}|${t.predicate.value}|${t.object.value}`)));
  const P = { id: 'http://vocab.gov/ontology#proposal/1', status: 'pending' };

  it('mapping → SKOS triple in VOCAB:MAPPINGS, guarded by pending, status last', () => {
    const ops = parse(gov.buildReviewUpdate({ ...P, type: 'mapping', termUri: 'urn:a', mappingSource: 'urn:a', mappingRelation: `${SKOS}closeMatch`, mappingTarget: 'urn:b' }, 'approved', 'rev', 'ok'));
    expect(quads(ops, 'insert')).toContain(`VOCAB:MAPPINGS|urn:a|${SKOS}closeMatch|urn:b`);
    // every operation is conditional on the proposal still being pending
    for (const op of ops) expect(JSON.stringify(op.where)).toContain('pending');
    expect(quads([ops.at(-1)], 'insert').some(q => q.includes('proposalStatus|approved'))).toBe(true);
    expect(quads([ops.at(-1)], 'insert').some(q => q.includes('appliedDate'))).toBe(true);
  });

  it('rejection writes nothing outside the governance graph', () => {
    const ops = parse(gov.buildReviewUpdate({ ...P, type: 'mapping', termUri: 'urn:a', mappingSource: 'urn:a', mappingRelation: `${SKOS}closeMatch`, mappingTarget: 'urn:b' }, 'rejected', 'rev', 'no'));
    expect(quads(ops, 'insert').every(q => q.startsWith('VOCAB:GOVERNANCE|'))).toBe(true);
    expect(quads(ops, 'insert').some(q => q.includes('appliedDate'))).toBe(false);
  });

  it('modify → replaces prefLabel/definition of a concept in its home graph', () => {
    const ops = parse(gov.buildReviewUpdate({ ...P, type: 'modify', termUri: 'urn:t', proposedLabel: 'New "label"', proposedDefinition: 'Def' }, 'approved', 'rev', 'ok',
      { term: { graph: 'urn:vocab:cs', isConcept: true } }));
    const ins = quads(ops, 'insert'), del = quads(ops, 'delete');
    expect(ins).toContain(`urn:vocab:cs|urn:t|${SKOS}prefLabel|New "label"`);
    expect(ins).toContain(`urn:vocab:cs|urn:t|${SKOS}definition|Def`);
    expect(del.some(q => q.startsWith(`urn:vocab:cs|urn:t|${SKOS}prefLabel|`))).toBe(true);
  });

  it('modify on an OWL class uses rdfs:label / rdfs:comment', () => {
    const ops = parse(gov.buildReviewUpdate({ ...P, type: 'modify', termUri: 'urn:t', proposedLabel: 'L' }, 'approved', 'rev', 'ok', { term: { graph: 'urn:g', isConcept: false } }));
    expect(quads(ops, 'insert')).toContain('urn:g|urn:t|http://www.w3.org/2000/01/rdf-schema#label|L');
  });

  it('deprecate → status Deprecated and owl:deprecated true in the home graph', () => {
    const ops = parse(gov.buildReviewUpdate({ ...P, type: 'deprecate', termUri: 'urn:t' }, 'approved', 'rev', 'ok', { term: { graph: 'urn:g', isConcept: true } }));
    const ins = quads(ops, 'insert');
    expect(ins).toContain('VOCAB:GOVERNANCE|urn:t|http://vocab.gov/ontology#hasStatus|http://vocab.gov/ontology#Deprecated');
    expect(ins).toContain('urn:g|urn:t|http://www.w3.org/2002/07/owl#deprecated|true');
  });

  it('add → new skos:Concept in the scheme\'s graph', () => {
    const ops = parse(gov.buildReviewUpdate({ ...P, type: 'add', proposedScheme: 'urn:s', proposedIri: 'urn:new', proposedLabel: 'New' }, 'approved', 'rev', 'ok', { scheme: { graph: 'urn:vocab:cs' } }));
    const ins = quads(ops, 'insert');
    expect(ins).toContain(`urn:vocab:cs|urn:new|http://www.w3.org/1999/02/22-rdf-syntax-ns#type|${SKOS}Concept`);
    expect(ins).toContain(`urn:vocab:cs|urn:new|${SKOS}inScheme|urn:s`);
  });

  it('a modify proposal without structured fields is discussion only (nothing applied)', () => {
    const ops = parse(gov.buildReviewUpdate({ ...P, type: 'modify', termUri: 'urn:t' }, 'approved', 'rev', 'ok'));
    expect(quads(ops, 'insert').every(q => q.startsWith('VOCAB:GOVERNANCE|'))).toBe(true);
  });
});

describe('mapping proposals', () => {
  let sent;
  beforeEach(() => {
    sent = [];
    vi.stubGlobal('fetch', async (url, opts) => { sent.push(opts.body); return { ok: true, json: async () => ({}), text: async () => '' }; });
  });
  const base = { type: 'mapping', title: 't', description: 'because', proposedBy: 'me', mappingSource: 'urn:a', mappingTarget: 'urn:b', mappingRelation: MAPPING_RELATIONS[1].iri };

  it('validates relation, both ends and a justification', async () => {
    await expect(gov.createProposal('E', 'db', '', { ...base, mappingRelation: 'http://evil/x' })).rejects.toThrow(/Invalid mapping relation/);
    await expect(gov.createProposal('E', 'db', '', { ...base, mappingTarget: 'urn:a' })).rejects.toThrow(/itself/);
    await expect(gov.createProposal('E', 'db', '', { ...base, description: '  ' })).rejects.toThrow(/justification/);
    expect(sent).toHaveLength(0);
    await expect(gov.createProposal('E', 'db', '', { ...base, type: 'unmap', description: '' })).rejects.toThrow(/removed/);
    await gov.createProposal('E', 'db', '', base);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('mappingRelation');
  });
});

describe('findSimilarTerms', () => {
  const concepts = [
    concept('phys:OoM', 'phys:S', 'orders of magnitude'),
    concept('biz:ROM', 'biz:S', 'rough order of magnitude', ['ROM']),
    concept('cs:OoM', 'cs:S', 'orders of magnitude'),          // identical label: a shared term, not "similar"
    concept('phys:Unc', 'phys:S', 'uncertainty'),
    concept('biz:FU', 'biz:S', 'forecast uncertainty'),
    concept('phys:MU', 'phys:S', 'measurement uncertainty'),   // same group as phys:Unc: never paired with it
    concept('cs:Cache', 'cs:S', 'cache'),
  ];

  it('stems and drops stop words', () => {
    expect([...labelTokens('Orders of Magnitude')]).toEqual(['order', 'magnitude']);
  });

  it('pairs near-identical labels across different groups only', () => {
    const pairs = findSimilarTerms(concepts).map(p => [pairKey(p.a.uri, p.b.uri), Math.round(p.score * 100)]);
    expect(pairs).toContainEqual([pairKey('phys:OoM', 'biz:ROM'), 67]);
    expect(pairs).toContainEqual([pairKey('cs:OoM', 'biz:ROM'), 67]);
    expect(pairs).toContainEqual([pairKey('phys:Unc', 'biz:FU'), 50]);
    expect(pairs.some(([k]) => k === pairKey('phys:OoM', 'cs:OoM'))).toBe(false); // identical → Shared Terms
    expect(pairs.some(([k]) => k === pairKey('phys:Unc', 'phys:MU'))).toBe(false); // same group
    expect(pairs.every(([, score]) => score >= 50)).toBe(true);
  });

  it('skips excluded pairs (e.g. already mapped)', () => {
    const exclude = new Set([pairKey('phys:OoM', 'biz:ROM')]);
    expect(findSimilarTerms(concepts, { exclude }).some(p => pairKey(p.a.uri, p.b.uri) === pairKey('phys:OoM', 'biz:ROM'))).toBe(false);
  });
});

describe('mapping retirement', () => {
  const close = `${SKOS}closeMatch`;
  const m = { mappingSource: 'a', mappingRelation: close, mappingTarget: 'b' };
  it('flags a pending removal on the approved mapping', () => {
    const rows = mergeMappings([{ source: 'a', relation: close, target: 'b', graph: 'VOCAB:MAPPINGS' }],
      [{ ...m, type: 'unmap', status: 'pending', description: 'obsolete' }, { ...m, type: 'mapping', status: 'approved' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].removalPending.description).toBe('obsolete');
  });
  it('shows a removed mapping as retired, with who removed it and why', () => {
    const rows = mergeMappings([], [
      { ...m, type: 'unmap', status: 'approved', description: 'groups merged', reviewer: 'r2' },
      { ...m, type: 'mapping', status: 'approved', description: 'orig' },
    ]);
    expect(rows.map(r => r.status)).toEqual(['retired']);
    expect(rows[0].retiredBy.description).toBe('groups merged');
    expect(rows[0].proposal.description).toBe('orig');
  });
  it('approving removal deletes the triple from VOCAB:MAPPINGS; rejecting deletes nothing', () => {
    const P = { id: 'http://vocab.gov/ontology#proposal/2', type: 'unmap', termUri: 'urn:a', mappingSource: 'urn:a', mappingRelation: close, mappingTarget: 'urn:b' };
    const del = (decision) => new Parser().parse(gov.buildReviewUpdate(P, decision, 'rev', 'c')).updates
      .flatMap(op => (op.delete || []).filter(b => b.name?.value === 'VOCAB:MAPPINGS').flatMap(b => b.triples));
    expect(del('approved').map(t => `${t.subject.value} ${t.object.value}`)).toEqual(['urn:a urn:b']);
    expect(del('rejected')).toHaveLength(0);
  });
});

describe('findSimilarTerms at scale', () => {
  it('stays bounded when one word is used by thousands of terms', () => {
    // 20,000 concepts that all share the word "system": pairing them all would be ~200M pairs
    const many = Array.from({ length: 20000 }, (_, i) => concept(`urn:c:${i}`, `urn:s:${i % 10}`, `system ${i}`));
    many.push(concept('urn:x:1', 'urn:s:1', 'rare widget'), concept('urn:x:2', 'urn:s:2', 'rare widget assembly'));
    const start = performance.now();
    const pairs = findSimilarTerms(many);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(pairs.map(p => pairKey(p.a.uri, p.b.uri))).toContain(pairKey('urn:x:1', 'urn:x:2'));
  });
  it('returns at most `limit` suggestions, best first', () => {
    // 200 pairs across two groups: "alphaK betaK deltaK" vs "alphaK betaK" (2 of 3 words in common)
    const many = Array.from({ length: 400 }, (_, i) => {
      const k = Math.floor(i / 2);
      return concept(`urn:c:${i}`, `urn:s:${i % 2}`, i % 2 ? `alpha${k} beta${k}` : `alpha${k} beta${k} delta${k}`);
    });
    const pairs = findSimilarTerms(many, { limit: 25 });
    expect(pairs).toHaveLength(25);
    expect(pairs.every((p, i) => i === 0 || pairs[i - 1].score >= p.score)).toBe(true);
  });
});

describe('approvalsNeeded (owner approval)', () => {
  const concepts = [concept('cs:Model', 'cs:S', 'model'), concept('phys:Model', 'phys:S', 'model'), concept('biz:Model', 'biz:S', 'model')];
  const schemeUris = new Set(['cs:S', 'phys:S', 'biz:S']);
  const stewards = { 'cs:S': { account: 'alice' }, 'phys:S': { account: 'bob' }, 'biz:S': { name: 'Biz team' } };
  const ctx = { requireOwnerApproval: true, concepts, schemeUris, stewardOf: (u) => stewards[u] || null };
  const accounts = (p, c = ctx) => approvalsNeeded(p, c).map(x => x.account).sort();

  it('needs both owners for a mapping across two account-owned groups', () => {
    expect(accounts({ type: 'mapping', mappingSource: 'cs:Model', mappingTarget: 'phys:Model' })).toEqual(['alice', 'bob']);
  });
  it('adds nobody for a group owned by a plain name', () => {
    expect(accounts({ type: 'mapping', mappingSource: 'cs:Model', mappingTarget: 'biz:Model' })).toEqual(['alice']);
    expect(accounts({ type: 'modify', termUri: 'biz:Model' })).toEqual([]);
  });
  it('uses the target group for a new term, and the scheme itself when the term is a group', () => {
    expect(accounts({ type: 'add', proposedScheme: 'phys:S' })).toEqual(['bob']);
    expect(accounts({ type: 'deprecate', termUri: 'cs:S' })).toEqual(['alice']);
  });
  it('needs nobody when owner approval is off', () => {
    expect(accounts({ type: 'modify', termUri: 'cs:Model' }, { ...ctx, requireOwnerApproval: false })).toEqual([]);
  });
});

describe('linksOf (which terms reference a concept)', () => {
  const S = 'http://www.w3.org/2004/02/skos/core#';
  const CLASS = 'http://example.org/dt#Model';
  const m = (source, rel, target, status) => ({ source, relation: `${S}${rel}`, target, status, proposal: null });

  it('lists terms mapped to a concept in either direction, read from the term side, without rejected or retired links', () => {
    const links = linksOf(CLASS, [
      m('urn:se:Model', 'closeMatch', CLASS, 'pending'),
      m(CLASS, 'narrowMatch', 'urn:ms:Model', 'approved'), // Model narrower-than ms:Model ⇔ ms:Model broader-than Model
      m('urn:te:Model', 'relatedMatch', CLASS, 'rejected'),
      m('urn:x:Old', 'exactMatch', CLASS, 'retired'),
      m('urn:a', 'exactMatch', 'urn:b', 'approved'),
      m('urn:se:Model', 'closeMatch', CLASS, 'pending'), // listed once
    ]);
    expect(links.map(l => [l.uri, l.relation.replace(S, ''), l.status])).toEqual([
      ['urn:ms:Model', 'broadMatch', 'approved'],
      ['urn:se:Model', 'closeMatch', 'pending'],
    ]);
  });

  it('inverts only broad/narrow', () => {
    expect(inverseRelation(`${S}broadMatch`)).toBe(`${S}narrowMatch`);
    expect(inverseRelation(`${S}closeMatch`)).toBe(`${S}closeMatch`);
  });
});
