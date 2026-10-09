import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser } from 'sparqljs';
import { sparqlString, sparqlIri } from './sparql';
import * as gov from './governance';

// Capture the SPARQL each governance call would send, without touching Stardog
let sent;
beforeEach(() => {
  sent = [];
  vi.stubGlobal('fetch', async (url, opts) => {
    sent.push(opts.body);
    return { ok: true, json: async () => ({}), text: async () => '' };
  });
});

const operations = (update) => new Parser().parse(update).updates;
const literals = (update) => operations(update)
  .flatMap(op => [...(op.insert || []), ...(op.delete || [])])
  .flatMap(q => q.triples)
  .map(t => t.object)
  .filter(o => o.termType === 'Literal')
  .map(o => o.value);

const ADD = { type: 'add', title: 't', description: '', proposedBy: 'me', proposedScheme: 'urn:scheme', proposedIri: 'urn:new', proposedLabel: 'New term' };
const PAYLOAD = 'x" . } WHERE {} ; DROP ALL ; DELETE { <urn:a> <urn:b> "c';
const NASTY = 'Dwayne "The Rock" Johnson \\ C:\\path\nsecond line\ttab';

describe('sparqlString / sparqlIri', () => {
  it('escapes quotes, backslashes and line breaks', () => {
    expect(sparqlString('a"b\\c\nd')).toBe('"a\\"b\\\\c\\nd"');
  });
  it('rejects IRIs that could break out of <...>', () => {
    expect(() => sparqlIri('urn:a> } ; DROP ALL ; <urn:b')).toThrow(/Invalid IRI/);
    expect(() => sparqlIri('not an iri')).toThrow(/Invalid IRI/);
    expect(sparqlIri('http://example.org/a#B')).toBe('<http://example.org/a#B>');
  });
});

describe('governance writes are injection-safe and atomic', () => {
  const cases = {
    'status change (actor)': () => gov.setTermStatus('E', 'db', '', 'urn:t', 'Active', PAYLOAD),
    'steward assignment': () => gov.assignSteward('E', 'db', '', 'urn:t', PAYLOAD, 'me'),
    'editorial note': () => gov.addEditorialNote('E', 'db', '', 'urn:t', PAYLOAD, PAYLOAD),
    'proposal': () => gov.createProposal('E', 'db', '', { termUri: 'urn:t', type: 'modify', title: PAYLOAD, description: PAYLOAD, proposedBy: PAYLOAD }),
    'review': () => gov.reviewProposal('E', 'db', '', { id: 'urn:p', type: 'modify' }, 'rejected', PAYLOAD, PAYLOAD),
  };
  for (const [name, call] of Object.entries(cases)) {
    it(`${name}: one request, valid SPARQL, no DROP`, async () => {
      await call();
      expect(sent).toHaveLength(1);
      const ops = operations(sent[0]);
      expect(ops.some(op => op.type === 'drop' || op.type === 'clear')).toBe(false);
      expect(literals(sent[0])).toContain(PAYLOAD); // stored verbatim as data
    });
  }

  it('stores quotes, backslashes and newlines exactly as typed', async () => {
    await gov.addEditorialNote('E', 'db', '', 'urn:t', NASTY, 'me');
    expect(literals(sent[0])).toContain(NASTY);
  });

  it('writes the change and its audit entry in the same request', async () => {
    await gov.setTermStatus('E', 'db', '', 'urn:t', 'Deprecated', 'me');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('AuditEntry');
    expect(sent[0]).toContain('hasStatus');
  });

  it('rejects values outside the allowed lists', async () => {
    await expect(gov.setTermStatus('E', 'db', '', 'urn:t', 'Active> . } ; DROP ALL', 'me')).rejects.toThrow(/Invalid status/);
    await expect(gov.reviewProposal('E', 'db', '', { id: 'urn:p', type: 'modify' }, 'maybe', 'me', '')).rejects.toThrow(/Invalid decision/);
    expect(sent).toHaveLength(0);
  });

  it('requires a target term for modify/deprecate, and omits it for add', async () => {
    await expect(gov.createProposal('E', 'db', '', { type: 'deprecate', title: 't', description: '', proposedBy: 'me' })).rejects.toThrow(/Select the term/);
    const id = await gov.createProposal('E', 'db', '', ADD);
    const proposalTriples = operations(sent[0])[0].insert[0].triples.filter(t => t.subject.value === id);
    expect(proposalTriples.some(t => t.predicate.value.endsWith('targetTerm'))).toBe(false);
  });

  it('gives every record a unique id', async () => {
    const ids = await Promise.all(Array.from({ length: 50 }, () =>
      gov.createProposal('E', 'db', '', ADD)));
    expect(new Set(ids).size).toBe(50);
  });
});
