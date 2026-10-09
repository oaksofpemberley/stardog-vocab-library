import { describe, it, expect } from 'vitest';
import { Parser } from 'sparqljs';
import { impactQuery, isBuiltInTerm } from './ontologyQueries';

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
