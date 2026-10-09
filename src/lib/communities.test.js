import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser } from 'sparqljs';
import { findSharedTerms, normalizeLabel, mergeMappings, MAPPING_RELATIONS } from './communities';
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
    await gov.createProposal('E', 'db', '', base);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('mappingRelation');
  });
});
