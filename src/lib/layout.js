/**
 * Assign each node a layer (row) for a top-down diagram: a node sits one row below
 * the deepest node that points to it. Runs in O(V+E).
 *
 * Real ontologies have cycles (Person worksFor Organization, Organization employs Person).
 * A depth-first pass drops back-edges first, so layering works on the remaining acyclic
 * graph and cycles can never cause infinite recursion. Iterative, so large graphs cannot
 * overflow the call stack either.
 *
 * @param {string[]} ids   node ids
 * @param {{source: string, target: string}[]} links
 * @returns {Map<string, number>} id → layer (0 = top)
 */
export function assignLayers(ids, links) {
  const out = new Map(ids.map(id => [id, []]));
  const indegree = new Map(ids.map(id => [id, 0]));
  for (const { source, target } of links) {
    if (!out.has(source) || !out.has(target) || source === target) continue;
    out.get(source).push(target);
    indegree.set(target, indegree.get(target) + 1);
  }

  // DFS (roots first, so their edges are kept) to find back-edges and a topological order
  const NEW = 0, ACTIVE = 1, DONE = 2;
  const state = new Map(ids.map(id => [id, NEW]));
  const dagOut = new Map(ids.map(id => [id, []]));
  const order = [];
  const roots = ids.filter(id => indegree.get(id) === 0);
  for (const start of [...roots, ...ids]) {
    if (state.get(start) !== NEW) continue;
    const stack = [[start, 0]];
    state.set(start, ACTIVE);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const [id, i] = frame;
      const targets = out.get(id);
      if (i < targets.length) {
        frame[1]++;
        const t = targets[i];
        if (state.get(t) === ACTIVE) continue; // back-edge: part of a cycle, skip for layering
        dagOut.get(id).push(t);
        if (state.get(t) === NEW) { state.set(t, ACTIVE); stack.push([t, 0]); }
      } else {
        state.set(id, DONE);
        order.push(id);
        stack.pop();
      }
    }
  }

  // Longest path over the acyclic edges, in topological order
  const layer = new Map(ids.map(id => [id, 0]));
  for (const id of order.reverse()) {
    for (const t of dagOut.get(id)) {
      if (layer.get(t) < layer.get(id) + 1) layer.set(t, layer.get(id) + 1);
    }
  }
  return layer;
}

/**
 * Grid positions for a top-down diagram (docs/graph-views.md, G3.5): layers from assignLayers,
 * each layer ordered so a node sits near the nodes that point to it (one barycenter pass), and
 * wrapped onto further rows when it has more than `maxPerRow` nodes.
 * @param labelOf id → text, to order nodes with nothing above them
 * @returns {Map<string, {row: number, col: number, layer: number}>} col is centred on 0
 */
export function layoutRows(ids, links, { maxPerRow = 12, labelOf = (id) => id } = {}) {
  const layer = assignLayers(ids, links);
  const parents = new Map(ids.map(id => [id, []]));
  for (const { source, target } of links) {
    if (parents.has(target) && layer.has(source) && layer.get(source) < layer.get(target)) parents.get(target).push(source);
  }
  const byLayer = new Map();
  for (const id of ids) {
    const l = layer.get(id);
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(id);
  }
  const out = new Map();
  const xOf = new Map();
  let row = 0;
  for (const l of [...byLayer.keys()].sort((a, b) => a - b)) {
    const members = byLayer.get(l);
    const center = (id) => {
      const xs = parents.get(id).map(p => xOf.get(p)).filter(x => x !== undefined);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity;
    };
    const keyed = members.map(id => ({ id, c: center(id), label: String(labelOf(id)) }));
    keyed.sort((a, b) => a.c - b.c || a.label.localeCompare(b.label));
    for (let start = 0; start < keyed.length; start += maxPerRow) {
      const chunk = keyed.slice(start, start + maxPerRow);
      chunk.forEach(({ id }, i) => {
        const col = i - (chunk.length - 1) / 2;
        out.set(id, { row, col, layer: l });
        xOf.set(id, col);
      });
      row++;
    }
  }
  return out;
}
