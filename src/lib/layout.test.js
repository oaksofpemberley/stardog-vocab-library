import { describe, it, expect } from 'vitest';
import { assignLayers } from './layout';

const links = (pairs) => pairs.map(([source, target]) => ({ source, target }));

describe('assignLayers', () => {
  it('layers a chain top-down', () => {
    const layers = assignLayers(['a', 'b', 'c'], links([['a', 'b'], ['b', 'c']]));
    expect([...layers]).toEqual([['a', 0], ['b', 1], ['c', 2]]);
  });

  it('terminates on cycles (Person worksFor Org, Org employs Person)', () => {
    const layers = assignLayers(['Person', 'Org'], links([['Person', 'Org'], ['Org', 'Person']]));
    expect(layers.size).toBe(2);
    expect(new Set(layers.values())).toEqual(new Set([0, 1]));
  });

  it('terminates when every node is in a cycle (no roots)', () => {
    const layers = assignLayers(['a', 'b', 'c'], links([['a', 'b'], ['b', 'c'], ['c', 'a']]));
    expect([...layers.values()].every(Number.isInteger)).toBe(true);
  });

  it('is linear on many-path DAGs (previously exponential)', () => {
    // 40 levels × 2 nodes, each linked to both nodes of the next level: 2^40 paths
    const ids = [], pairs = [];
    for (let l = 0; l < 40; l++) for (const s of ['x', 'y']) ids.push(`${s}${l}`);
    for (let l = 0; l < 39; l++) for (const s of ['x', 'y']) for (const t of ['x', 'y']) pairs.push([`${s}${l}`, `${t}${l + 1}`]);
    const start = performance.now();
    const layers = assignLayers(ids, links(pairs));
    expect(performance.now() - start).toBeLessThan(200);
    expect(layers.get('y39')).toBe(39);
  });

  it('ignores self-loops and links to unknown nodes', () => {
    const layers = assignLayers(['a'], links([['a', 'a'], ['a', 'zzz']]));
    expect(layers.get('a')).toBe(0);
  });
});
