import { describe, it, expect } from 'vitest';
import { suggestIri, parseTermTable, planNewTerms } from './terms';

const TE = 'http://example.org/mbse/test-and-evaluation#Scheme';
const MS = 'http://example.org/mbse/modeling-and-simulation#Scheme';

describe('suggestIri', () => {
  it("uses the group's namespace and the label in PascalCase", () => {
    expect(suggestIri(TE, 'test article')).toBe('http://example.org/mbse/test-and-evaluation#TestArticle');
    expect(suggestIri(TE, '  ')).toBe('');
  });
});

describe('parseTermTable', () => {
  it('reads comma-separated rows without a header as label, definition, iri', () => {
    expect(parseTermTable('fixture,Holds the unit,\nrig,"A frame, welded",urn:x:Rig\n')).toEqual([
      { line: 1, label: 'fixture', definition: 'Holds the unit', iri: '' },
      { line: 2, label: 'rig', definition: 'A frame, welded', iri: 'urn:x:Rig' },
    ]);
  });

  it('recognises a header in any order, tabs, quotes with "" and line breaks, and skips blank lines', () => {
    const text = 'IRI\tDefinition\tLabel\r\n\r\nurn:x:A\t"Says ""hi""\nover two lines"\talpha\n\tno iri\tbeta';
    expect(parseTermTable(text)).toEqual([
      { line: 3, label: 'alpha', definition: 'Says "hi"\nover two lines', iri: 'urn:x:A' },
      { line: 5, label: 'beta', definition: 'no iri', iri: '' },
    ]);
  });

  it('accepts a single column of labels', () => {
    expect(parseTermTable('label\none\ntwo').map(r => r.label)).toEqual(['one', 'two']);
    expect(parseTermTable('')).toEqual([]);
  });
});

describe('planNewTerms', () => {
  const concepts = [
    { uri: 'http://example.org/mbse/test-and-evaluation#Fidelity', scheme: TE, prefLabel: 'fidelity', altLabels: [] },
    { uri: 'http://example.org/mbse/modeling-and-simulation#Model', scheme: MS, prefLabel: 'model', altLabels: ['simulation model'] },
  ];
  const existing = new Map([['http://example.org/mbse/test-and-evaluation#UnitUnderTest', 'unit under test']]);
  const plan = (rows, extra = {}) => planNewTerms(rows.map((r, i) => ({ line: i + 1, definition: '', iri: '', ...r })),
    { scheme: TE, concepts, existing, ...extra });

  it('marks new terms, shared labels and each kind of error', () => {
    const out = plan([
      { label: 'test article' },
      { label: '' },
      { label: 'UUT', iri: 'http://example.org/mbse/test-and-evaluation#UnitUnderTest' },
      { label: 'Simulation Model' },
      { label: 'Fidelity' },
      { label: 'bad', iri: 'not an iri' },
      { label: 'test article' },
    ]);
    expect(out.map(r => [r.status, r.message])).toEqual([
      ['new', ''],
      ['error', 'No label'],
      ['error', 'IRI already used by "unit under test"'],
      ['shared', ''],
      ['error', 'Already in this group as "fidelity"'],
      ['error', 'Invalid IRI: not an iri'],
      ['error', 'Same IRI as line 1'],
    ]);
    expect(out[0].iri).toBe('http://example.org/mbse/test-and-evaluation#TestArticle');
    expect(out[3].sharedWith).toEqual([MS]);
  });

  it('refuses IRIs that a pending proposal would create, and repeated labels with different IRIs', () => {
    const out = plan([{ label: 'probe' }, { label: 'Probe', iri: 'urn:x:Probe2' }],
      { pendingIris: new Set() });
    expect(out[1]).toMatchObject({ status: 'error', message: 'Same label as line 1' });
    const pending = plan([{ label: 'probe' }], { pendingIris: new Set(['http://example.org/mbse/test-and-evaluation#Probe']) });
    expect(pending[0].status).toBe('error');
  });
});
