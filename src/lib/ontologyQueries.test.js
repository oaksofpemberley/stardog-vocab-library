import { describe, it, expect } from 'vitest';
import { Parser } from 'sparqljs';
import { impactQuery, isBuiltInTerm, PROPERTIES_QUERY, propertiesFromBindings } from './ontologyQueries';

const lit = (value) => ({ type: 'literal', value });
const iri = (value) => ({ type: 'uri', value });
const row = (prop, type, key, value) => ({
  prop: iri(prop), type: lit(type),
  ...(key ? { key: lit(key), value: key === 'label' || key === 'comment' ? lit(value) : iri(value) } : {}),
});

describe('PROPERTIES_QUERY', () => {
  it('is valid SPARQL that returns one row per property value, not a cross product of OPTIONALs', () => {
    const parsed = new Parser().parse(PROPERTIES_QUERY);
    expect(parsed.variables.map(v => v.value)).toEqual(['prop', 'type', 'key', 'value']);
    // Chained OPTIONALs multiply every duplicated value: 288M rows on a database with 22 copies of its ontology
    expect(parsed.where.filter(p => p.type === 'optional')).toHaveLength(1);
  });
});

describe('propertiesFromBindings', () => {
  const P = 'http://example.org/v#operatedBy';
  it('merges the same property repeated across graphs into one entry with distinct domains and ranges', () => {
    const rows = [];
    for (let g = 0; g < 3; g++) {
      rows.push(row(P, 'ObjectProperty', 'label', 'operated by'), row(P, 'ObjectProperty', 'comment', 'Who runs it'),
        row(P, 'ObjectProperty', 'soDomain', 'http://example.org/v#Aircraft'), row(P, 'ObjectProperty', 'soDomain', 'http://example.org/v#Ship'),
        row(P, 'ObjectProperty', 'soRange', 'http://example.org/v#Org'));
    }
    expect(propertiesFromBindings(rows)).toEqual([{
      uri: P, label: 'operated by', comment: 'Who runs it', type: 'ObjectProperty',
      domain: 'http://example.org/v#Aircraft', range: 'http://example.org/v#Org',
      domains: ['http://example.org/v#Aircraft', 'http://example.org/v#Ship'], ranges: ['http://example.org/v#Org'],
    }]);
  });

  it('prefers schema.org domainIncludes/rangeIncludes over rdfs:domain/range, and falls back to them', () => {
    const [both, rdfsOnly] = propertiesFromBindings([
      row('http://example.org/v#a', 'ObjectProperty', 'rdfsDomain', 'http://example.org/v#R'),
      row('http://example.org/v#a', 'ObjectProperty', 'soDomain', 'http://example.org/v#S'),
      row('http://example.org/v#b', 'DatatypeProperty', 'rdfsDomain', 'http://example.org/v#R'),
      row('http://example.org/v#b', 'DatatypeProperty', 'rdfsRange', 'http://www.w3.org/2001/XMLSchema#string'),
    ]);
    expect(both.domains).toEqual(['http://example.org/v#S']);
    expect(rdfsOnly.domains).toEqual(['http://example.org/v#R']);
    expect(rdfsOnly.ranges).toEqual(['http://www.w3.org/2001/XMLSchema#string']);
  });

  it('keeps properties with no label or domain, drops built-in vocabularies, and sorts by label', () => {
    const props = propertiesFromBindings([
      row('http://example.org/v#z', 'ObjectProperty', 'label', 'zeta'),
      row('http://www.w3.org/2004/02/skos/core#broader', 'ObjectProperty'),
      row('http://example.org/v#bare', 'DatatypeProperty'),
      row('http://example.org/v#a', 'ObjectProperty', 'label', 'alpha'),
    ]);
    expect(props.map(p => p.uri)).toEqual(['http://example.org/v#bare', 'http://example.org/v#a', 'http://example.org/v#z']);
    expect(props[0]).toMatchObject({ label: '', domain: '', range: '', domains: [], ranges: [] });
  });
});

describe('impactQuery', () => {
  it('is valid SPARQL and counts SKOS mappings in both directions', () => {
    const q = impactQuery('http://example.org/vocab/physics#OrdersOfMagnitude');
    expect(() => new Parser().parse(q)).not.toThrow();
    for (const rel of ['exactMatch', 'closeMatch', 'broadMatch', 'narrowMatch', 'relatedMatch']) expect(q).toContain(`skos:${rel}`);
    expect(q).toContain('?relatedTerm ?mapping <http://example.org/vocab/physics#OrdersOfMagnitude>');
    expect(q).toContain('<http://example.org/vocab/physics#OrdersOfMagnitude> ?mapping ?relatedTerm');
  });
});

describe('isBuiltInTerm', () => {
  it('recognizes standard and app-internal vocabularies, not the user\'s terms', () => {
    expect(isBuiltInTerm('http://www.w3.org/2004/02/skos/core#prefLabel')).toBe(true);
    expect(isBuiltInTerm('http://purl.org/dc/terms/creator')).toBe(true);
    expect(isBuiltInTerm('http://vocab.gov/ontology#ChangeProposal')).toBe(true);
    expect(isBuiltInTerm('http://example.org/vocab/physics#OrdersOfMagnitude')).toBe(false);
    expect(isBuiltInTerm('http://www.w3.org/ns/prov#Activity')).toBe(false);
  });
});
