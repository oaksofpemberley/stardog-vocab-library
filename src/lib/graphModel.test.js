import { describe, it, expect } from 'vitest';
import { buildGraph, neighbourhood, selectView, termsByClass, searchNodes, startNode, MAX_WHOLE } from './graphModel';
import { layoutRows } from './layout';

const C = (uri, label, type = 'owl:Class') => ({ uri: `urn:x:${uri}`, label, type });
const id = (s) => `urn:x:${s}`;

describe('buildGraph', () => {
  const classes = [C('Req', 'Requirement'), C('Comp', 'Component'), C('Thing', 'Thing'), C('Model', 'model', 'skos:Concept'),
    C('Scheme', 'SE', 'skos:ConceptScheme'), C('Punned', 'Punned')];
  const properties = [
    { uri: 'urn:x:satisfies', label: 'satisfies', type: 'ObjectProperty', domains: [id('Comp')], ranges: [id('Req')] },
    { uri: 'urn:x:satisfies', label: 'satisfies', type: 'ObjectProperty', domains: [id('Comp')], ranges: [id('Req')] },
    { uri: 'urn:x:name', label: 'name', type: 'DatatypeProperty', domains: [id('Comp')], ranges: [] },
  ];
  const subclasses = [{ child: id('Req'), parent: id('Thing') }, { child: id('Comp'), parent: id('Thing') }, { child: id('Req'), parent: id('Req') }];

  it('draws only ontology classes, with property and subclass edges, once each', () => {
    const g = buildGraph({ classes, properties, subclasses, conceptUris: new Set([id('Punned')]) });
    expect(g.nodes.map(n => n.label).sort()).toEqual(['Component', 'Requirement', 'Thing']);
    expect(g.edges.map(e => `${e.kind}:${e.label}`).sort()).toEqual(['property:satisfies', 'subclass:is a', 'subclass:is a']);
  });

  it('leaves the hierarchy out when switched off', () => {
    expect(buildGraph({ classes, properties, subclasses, showHierarchy: false }).edges).toHaveLength(1);
  });
});

describe('neighbourhood and selectView', () => {
  // chain a-b-c-d-e plus isolated z
  const nodes = ['a', 'b', 'c', 'd', 'e', 'z'].map(s => ({ id: s, label: s }));
  const edges = [['a', 'b'], ['c', 'b'], ['c', 'd'], ['d', 'e']].map(([source, target]) => ({ source, target }));

  it('follows edges in both directions up to the given number of hops', () => {
    expect([...neighbourhood(edges, 'c', 1)].sort()).toEqual(['b', 'c', 'd']);
    expect([...neighbourhood(edges, 'c', 2)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('shows a small graph whole, and a focused one around the chosen class', () => {
    expect(selectView({ nodes, edges }).nodes).toHaveLength(6);
    const v = selectView({ nodes, edges, focus: 'a', hops: 1 });
    expect(v.nodes.map(n => n.id)).toEqual(['a', 'b']);
    expect(v.edges).toHaveLength(1);
  });

  it('opens a large graph on its best-connected class, and hides unconnected classes when showing all', () => {
    const many = Array.from({ length: MAX_WHOLE + 10 }, (_, i) => ({ id: `n${i}`, label: `n${i}` }));
    const hub = many.slice(1, 6).map(n => ({ source: 'n0', target: n.id }));
    const v = selectView({ nodes: many, edges: hub, hops: 1 });
    expect(v).toMatchObject({ focus: 'n0', auto: true });
    expect(v.nodes).toHaveLength(6);
    const all = selectView({ nodes: many, edges: hub, showAll: true });
    expect(all.focus).toBe(null);
    expect(all.nodes).toHaveLength(6);
    expect(all.hidden).toBe(MAX_WHOLE + 4);
    expect(selectView({ nodes: many, edges: hub, showAll: true, hideUnconnected: false }).nodes).toHaveLength(MAX_WHOLE + 10);
  });
});

describe('termsByClass', () => {
  const S = 'http://www.w3.org/2004/02/skos/core#';
  it('lists the groups\' terms mapped to each class, read from the term side', () => {
    const conceptByUri = new Map([['urn:se:Req', { prefLabel: 'requirement', scheme: 'urn:se' }], ['urn:te:Req', { prefLabel: 'requirement', scheme: 'urn:te' }]]);
    const mappings = [
      { source: 'urn:se:Req', relation: `${S}exactMatch`, target: id('Req'), status: 'approved' },
      { source: id('Req'), relation: `${S}narrowMatch`, target: 'urn:te:Req', status: 'pending' },
      { source: id('Req'), relation: `${S}closeMatch`, target: id('Other'), status: 'approved' }, // class to class: not a term
    ];
    const t = termsByClass([id('Req'), id('Comp')], mappings, conceptByUri);
    expect([...t.keys()]).toEqual([id('Req')]);
    expect(t.get(id('Req')).map(x => [x.scheme, x.relation.replace(S, ''), x.status])).toEqual([
      ['urn:se', 'exactMatch', 'approved'], ['urn:te', 'broadMatch', 'pending'],
    ]);
  });
});

describe('searchNodes', () => {
  const nodes = ['Requirement', 'Requirement Specification', 'Software Requirement', 'Component'].map((l, i) => ({ id: `urn:x:N${i}`, label: l }));
  it('ranks exact, then prefix, then contains, then IRI matches', () => {
    expect(searchNodes(nodes, 'requirement').map(n => n.label)).toEqual(['Requirement', 'Requirement Specification', 'Software Requirement']);
    expect(searchNodes(nodes, 'N3').map(n => n.label)).toEqual(['Component']);
    expect(searchNodes(nodes, '  ')).toEqual([]);
  });
});

describe('layoutRows', () => {
  it('wraps a wide layer onto rows of at most maxPerRow, centred', () => {
    const ids = ['root', ...Array.from({ length: 30 }, (_, i) => `c${i}`)];
    const links = ids.slice(1).map(c => ({ source: 'root', target: c }));
    const pos = layoutRows(ids, links, { maxPerRow: 12 });
    expect(pos.get('root')).toEqual({ row: 0, col: 0, layer: 0 });
    const rows = new Map();
    for (const [k, p] of pos) if (k !== 'root') rows.set(p.row, (rows.get(p.row) || 0) + 1);
    expect([...rows.values()]).toEqual([12, 12, 6]);
    expect(Math.max(...[...pos.values()].map(p => Math.abs(p.col)))).toBeLessThanOrEqual(5.5);
  });

  it('puts children under their own parent (fewer crossings)', () => {
    const ids = ['A', 'B', 'a1', 'b1'];
    const pos = layoutRows(ids, [{ source: 'A', target: 'a1' }, { source: 'B', target: 'b1' }]);
    expect(pos.get('a1').col < pos.get('b1').col).toBe(pos.get('A').col < pos.get('B').col);
  });
});

describe('startNode', () => {
  it('starts at the root with the most classes below it, not at the class with the most direct subclasses', () => {
    const nodes = ['entity', 'continuant', 'occurrent', 'artifact', 'other'].map(id => ({ id, label: id }))
      .concat(Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, label: `a${i}` })));
    const sub = (child, parent) => ({ source: child, target: parent, kind: 'subclass' });
    const edges = [sub('continuant', 'entity'), sub('occurrent', 'entity'), sub('artifact', 'continuant'),
      ...Array.from({ length: 20 }, (_, i) => sub(`a${i}`, 'artifact'))];
    expect(startNode(nodes, edges)).toBe('entity');
  });
  it('falls back to the best-connected class without a hierarchy', () => {
    const nodes = ['a', 'b', 'c'].map(id => ({ id, label: id }));
    expect(startNode(nodes, [{ source: 'a', target: 'b', kind: 'property' }, { source: 'c', target: 'b', kind: 'property' }])).toBe('b');
  });
});
