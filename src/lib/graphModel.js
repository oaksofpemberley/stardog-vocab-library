/**
 * What Graph View and Designer View draw (docs/graph-views.md): class nodes, property and
 * subclass edges, neighbourhoods for focus, the vocabulary-term overlay and search. Pure functions.
 */
import { getNamespace, toPrefixed } from './sparql.js';
import { linksOf } from './communities.js';

/** Group (concept scheme) colours for vocabulary terms in both views */
export const GROUP_COLORS = ['#e879f9', '#38bdf8', '#fbbf24', '#4ade80', '#fb7185', '#a3e635', '#c084fc', '#2dd4bf'];

/** Above this many classes, a view opens focused on one class instead of drawing everything (G2.3) */
export const MAX_WHOLE = 150;

/**
 * @param classes     [{uri, label, type}] from CLASSES_QUERY
 * @param properties  [{uri, label, type, domains, ranges}]
 * @param subclasses  [{child, parent}]
 * @param conceptUris SKOS concepts: never class nodes (G1.2)
 * @returns {{nodes: {id, label, ns}[], edges: {source, target, kind: 'property'|'subclass', label}[]}}
 */
export function buildGraph({ classes, properties, subclasses = [], conceptUris = new Set(), showHierarchy = true }) {
  const byId = new Map();
  for (const c of classes) {
    if (c.type !== 'owl:Class' || conceptUris.has(c.uri) || byId.has(c.uri)) continue;
    byId.set(c.uri, { id: c.uri, label: c.label || toPrefixed(c.uri), ns: getNamespace(c.uri) });
  }
  const edges = [];
  const seen = new Set();
  const add = (source, target, kind, label) => {
    if (source === target || !byId.has(source) || !byId.has(target)) return;
    const key = `${source}|${target}|${kind}|${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind, label });
  };
  for (const p of properties) {
    if (p.type !== 'ObjectProperty') continue;
    for (const d of p.domains || []) for (const r of p.ranges || []) add(d, r, 'property', p.label || toPrefixed(p.uri));
  }
  if (showHierarchy) for (const s of subclasses) add(s.child, s.parent, 'subclass', 'is a');
  return { nodes: [...byId.values()], edges };
}

/** Number of edges per node */
export function degrees(edges) {
  const d = new Map();
  for (const e of edges) for (const id of [e.source, e.target]) d.set(id, (d.get(id) || 0) + 1);
  return d;
}

/** Ids within `hops` edges of `start`, following edges in either direction */
export function neighbourhood(edges, start, hops) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  }
  const found = new Set([start]);
  let frontier = [start];
  for (let h = 0; h < hops && frontier.length; h++) {
    const next = [];
    for (const id of frontier) for (const n of adj.get(id) || []) if (!found.has(n)) { found.add(n); next.push(n); }
    frontier = next;
  }
  return found;
}

/**
 * Where to start on a large graph: the top of the class hierarchy (the root with the most
 * subclasses below it), which gives an overview. A best-connected class is usually a class with
 * hundreds of direct subclasses, the least readable place to start. Without a hierarchy: the
 * best-connected class.
 */
export function startNode(nodes, edges) {
  const children = new Map(), hasParent = new Set();
  for (const e of edges) {
    if (e.kind !== 'subclass') continue;
    hasParent.add(e.source);
    if (!children.has(e.target)) children.set(e.target, []);
    children.get(e.target).push(e.source);
  }
  const byLabel = (a, b) => a.label.localeCompare(b.label);
  const roots = nodes.filter(n => children.has(n.id) && !hasParent.has(n.id));
  if (roots.length) {
    const size = (id) => {
      const seen = new Set([id]);
      const stack = [id];
      while (stack.length) for (const c of children.get(stack.pop()) || []) if (!seen.has(c)) { seen.add(c); stack.push(c); }
      return seen.size;
    };
    const sized = roots.map(n => [size(n.id), n]);
    return sized.sort((a, b) => b[0] - a[0] || byLabel(a[1], b[1]))[0][1].id;
  }
  const deg = degrees(edges);
  return [...nodes].sort((a, b) => (deg.get(b.id) || 0) - (deg.get(a.id) || 0) || byLabel(a, b))[0].id;
}

/**
 * The part of the graph to draw.
 *   focus           a class id to centre on (with `hops`), or null for the whole graph
 *   showAll         the user asked for the whole graph
 *   hideUnconnected leave out classes with no edges (whole graph only; default: on when large)
 * Opens focused on the best-connected class when the whole graph is large and the user has not
 * asked for everything (G2.3); `auto` says so.
 */
export function selectView({ nodes, edges, focus = null, hops = 2, showAll = false, hideUnconnected = null }) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const deg = degrees(edges);
  let center = focus && byId.has(focus) ? focus : null;
  let auto = false;
  if (!center && !showAll && nodes.length > MAX_WHOLE && edges.length > 0) {
    center = startNode(nodes, edges);
    auto = true;
  }
  let keep;
  const hide = !center && (hideUnconnected ?? nodes.length > MAX_WHOLE);
  if (center) keep = neighbourhood(edges, center, hops);
  else keep = new Set(nodes.filter(n => !hide || deg.has(n.id)).map(n => n.id));
  return {
    nodes: nodes.filter(n => keep.has(n.id)),
    edges: edges.filter(e => keep.has(e.source) && keep.has(e.target)),
    focus: center, auto, hideUnconnected: hide,
    hidden: nodes.length - keep.size,
  };
}

/**
 * Groups' terms mapped to the drawn classes (G4): one entry per (class, term, relation, status),
 * relation read from the term's side.
 * @returns {Map<classId, {uri, label, scheme, relation, status}[]>}
 */
export function termsByClass(classIds, mappings, conceptByUri) {
  const out = new Map();
  for (const id of classIds) {
    const terms = linksOf(id, mappings)
      .filter(l => conceptByUri.has(l.uri))
      .map(l => {
        const c = conceptByUri.get(l.uri);
        return { uri: l.uri, label: c.prefLabel || toPrefixed(l.uri), scheme: c.scheme || '', relation: l.relation, status: l.status };
      });
    if (terms.length) out.set(id, terms);
  }
  return out;
}

/** Classes whose label or IRI contains the text: exact label first, then label prefix, label, IRI */
export function searchNodes(nodes, query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const rank = (n) => {
    const l = n.label.toLowerCase();
    if (l === q) return 0;
    if (l.startsWith(q)) return 1;
    if (l.includes(q)) return 2;
    if (n.id.toLowerCase().includes(q)) return 3;
    return -1;
  };
  return nodes.map(n => [rank(n), n]).filter(([r]) => r >= 0)
    .sort((a, b) => a[0] - b[0] || a[1].label.length - b[1].label.length || a[1].label.localeCompare(b[1].label))
    .slice(0, limit).map(([, n]) => n);
}
