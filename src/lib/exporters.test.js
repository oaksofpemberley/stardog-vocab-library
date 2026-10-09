import { describe, it, expect } from 'vitest';
import { Parser as TurtleParser } from 'n3';
import { toTurtle, toJsonLd, toCsv, csvCell } from './exporters';

const ONTO = 'http://example.org/flight/ontology#';
const vocab = {
  classes: [
    { uri: `${ONTO}Aircrew`, label: 'Aircrew "Data"', comment: 'Line one\nline two \\ backslash', type: 'owl:Class' },
    { uri: 'http://example.org/scheme/Physics', label: 'Physics', comment: '', type: 'skos:ConceptScheme' },
    { uri: 'urn:uuid:1234', label: '=HYPERLINK("http://evil")', comment: '', type: 'skos:Concept' },
  ],
  properties: [
    { uri: `${ONTO}assignedTo`, label: 'assigned to', comment: '', type: 'ObjectProperty', domains: [`${ONTO}Aircrew`], ranges: ['urn:uuid:1234'] },
  ],
};

describe('Turtle export', () => {
  it('parses back with every term, label and comment intact', () => {
    const quads = new TurtleParser().parse(toTurtle(vocab));
    const value = (s, p) => quads.find(q => q.subject.value === s && q.predicate.value.endsWith(p))?.object.value;
    expect(value(`${ONTO}Aircrew`, 'label')).toBe('Aircrew "Data"');
    expect(value(`${ONTO}Aircrew`, 'comment')).toBe('Line one\nline two \\ backslash');
    expect(value('urn:uuid:1234', '#type')).toBe('http://www.w3.org/2004/02/skos/core#Concept');
    expect(value(`${ONTO}assignedTo`, 'rangeIncludes')).toBe('urn:uuid:1234');
    expect(quads.filter(q => q.predicate.value.endsWith('#type'))).toHaveLength(4);
  });
});

describe('JSON-LD export', () => {
  it('includes properties as well as classes', () => {
    const doc = JSON.parse(toJsonLd(vocab));
    expect(doc['@graph']).toHaveLength(4);
    expect(doc['@graph'].find(n => n['@id'] === `${ONTO}assignedTo`)['schema:domainIncludes']).toEqual([{ '@id': `${ONTO}Aircrew` }]);
  });
});

describe('CSV export', () => {
  it('neutralises spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    for (const lead of ['+', '-', '@']) expect(csvCell(`${lead}1`).startsWith('"\'')).toBe(true);
    expect(toCsv(vocab)).not.toMatch(/(^|,)"=/m);
  });
  it('quotes every cell and keeps embedded quotes and newlines', () => {
    const csv = toCsv(vocab);
    expect(csv).toContain('"Aircrew ""Data"""');
    expect(csv).toContain('"Line one\nline two \\ backslash"');
  });
});
