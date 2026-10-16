import { useRef, useEffect, useMemo, useCallback } from 'react';
import { toPrefixed } from '../lib/sparql';
import { relationLabel } from '../lib/communities';
import { layoutRows } from '../lib/layout';
import { selectView, termsByClass, GROUP_COLORS } from '../lib/graphModel';
import { useGraphData } from '../lib/useGraphData';
import { useGraphControls } from '../lib/useGraphControls';
import { updateHash } from '../lib/urlState';
import GraphControls from './GraphControls';
import GraphDetailPanel from './GraphDetailPanel';
import { LayoutGrid } from 'lucide-react';
import * as d3 from 'd3';

/* ── Color palette — one distinct color per class ── */
const NODE_COLORS = [
  '#ef6a3f', '#4caf50', '#2196f3', '#ff9800', '#9c27b0',
  '#00bcd4', '#e91e63', '#8bc34a', '#ff5722', '#3f51b5',
  '#009688', '#ffc107', '#673ab7', '#cddc39', '#f44336',
  '#03a9f4', '#795548', '#607d8b', '#ffeb3b', '#1abc9c',
];

const STATUS_RING = {
  Active: '#22c55e', Draft: '#eab308', UnderReview: '#3b82f6',
  Deprecated: '#f97316', Retired: '#ef4444',
};

/* ── Layout constants ── */
const NODE_R = 38;
const ROW_GAP = 150;      // between wrapped rows
const LAYER_GAP = 60;     // extra space where a new layer starts
const GAP_X = 200;
const GAP_X_TERMS = 290;  // room for term labels beside each class
const BADGE_R = 14;
const MAX_TERM_PILLS = 4;

/** Wrap text to fit inside circle */
function wrapLabel(text, maxChars = 12) {
  if (text.length <= maxChars) return [text];
  const words = text.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3); // max 3 lines
}

export default function DesignerView({ onNavigate }) {
  const controls = useGraphControls();
  const { graph, community, properties } = useGraphData({ showHierarchy: controls.hierarchy, showDeprecated: controls.deprecated });
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const panTo = useRef(null);

  // One colour per class, stable while focusing around the graph
  const colorOf = useMemo(() => {
    const idx = new Map(graph.nodes.map((n, i) => [n.id, i]));
    return (id) => NODE_COLORS[(idx.get(id) ?? 0) % NODE_COLORS.length];
  }, [graph.nodes]);
  const groupColor = useMemo(() => {
    const idx = new Map(community.schemes.map((s, i) => [s.uri, i]));
    return (scheme) => GROUP_COLORS[(idx.get(scheme) ?? 0) % GROUP_COLORS.length];
  }, [community.schemes]);

  const view = useMemo(() => selectView({
    nodes: graph.nodes, edges: graph.edges, focus: controls.focus, hops: controls.hops,
    showAll: controls.showAll, hideUnconnected: controls.unconnected,
  }), [graph, controls.focus, controls.hops, controls.showAll, controls.unconnected]);

  const terms = useMemo(() => termsByClass(view.nodes.map(n => n.id), community.mappings, community.conceptByUri),
    [view.nodes, community.mappings, community.conceptByUri]);
  const termCount = [...terms.values()].reduce((a, t) => a + t.length, 0);

  /* ── Layout: layered top-down, wide layers wrapped (G3.5); parents above subclasses ── */
  const layout = useMemo(() => {
    const ids = view.nodes.map(n => n.id);
    // With a hierarchy, rows follow it alone (property links are still drawn); otherwise the property links
    const sub = view.edges.filter(e => e.kind === 'subclass');
    const layering = sub.length ? sub.map(e => ({ source: e.target, target: e.source })) : view.edges;
    const label = new Map(view.nodes.map(n => [n.id, n.label]));
    const grid = layoutRows(ids, layering, { labelOf: id => label.get(id) });
    const gapX = controls.terms && terms.size > 0 ? GAP_X_TERMS : GAP_X;
    const pos = new Map();
    for (const n of view.nodes) {
      const p = grid.get(n.id);
      pos.set(n.id, { ...n, x: p.col * gapX, y: p.row * ROW_GAP + p.layer * LAYER_GAP });
    }
    return pos;
  }, [view, controls.terms, terms]);

  const select = controls.setSelected;
  const goTo = useCallback((id) => {
    if (view.nodes.some(n => n.id === id)) { panTo.current = id; controls.setSelected(id); }
    else controls.setFocus(id);
  }, [view.nodes, controls]);
  const openInExplorer = (id) => { updateHash({ term: id, tab: null, focus: null }); onNavigate?.('explore'); };

  /* ── D3 rendering ── */
  useEffect(() => {
    if (!svgRef.current || layout.size === 0) return;
    const svgEl = svgRef.current;
    const width = svgEl.clientWidth;
    const height = svgEl.clientHeight;
    d3.select(svgEl).selectAll('*').remove();
    const svg = d3.select(svgEl).attr('width', width).attr('height', height);

    const defs = svg.append('defs');
    defs.append('marker').attr('id', 'designer-arrow').attr('viewBox', '0 -5 10 10').attr('refX', NODE_R + 8).attr('refY', 0)
      .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', 'var(--text-muted)');
    defs.append('marker').attr('id', 'designer-isa').attr('viewBox', '0 -6 12 12').attr('refX', NODE_R + 10).attr('refY', 0)
      .attr('markerWidth', 9).attr('markerHeight', 9).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5Z').attr('fill', 'var(--bg-primary)').attr('stroke', 'var(--text-secondary)').attr('stroke-width', 1.2);
    const shadow = defs.append('filter').attr('id', 'node-shadow').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
    shadow.append('feDropShadow').attr('dx', 0).attr('dy', 2).attr('stdDeviation', 4).attr('flood-color', 'rgba(0,0,0,0.25)');

    const g = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.03, 3]).on('zoom', (event) => {
      g.attr('transform', event.transform);
      svg.classed('lod-far', event.transform.k < 0.35).classed('lod-near', event.transform.k >= 0.7);
    });
    svg.call(zoom).on('dblclick.zoom', null);
    zoomRef.current = { svg, zoom, width, height };

    // ── Edges ──
    const edgeGroup = g.append('g').attr('class', 'edges');
    for (const edge of view.edges) {
      const s = layout.get(edge.source), t = layout.get(edge.target);
      if (!s || !t) continue;
      const dx = t.x - s.x, dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const curvature = edge.kind === 'subclass' ? 0 : Math.min(40, dist * 0.15);
      const cx = (s.x + t.x) / 2 - dy / dist * curvature;
      const cy = (s.y + t.y) / 2 + dx / dist * curvature;
      edgeGroup.append('path').datum(edge)
        .attr('class', `dedge dedge-${edge.kind}`)
        .attr('d', `M${s.x},${s.y} Q${cx},${cy} ${t.x},${t.y}`)
        .attr('marker-end', edge.kind === 'subclass' ? 'url(#designer-isa)' : 'url(#designer-arrow)');
      if (edge.kind === 'property') {
        const lg = edgeGroup.append('g').attr('class', 'edge-label-group');
        lg.append('rect').attr('x', cx - edge.label.length * 3.2 - 4).attr('y', cy - 8)
          .attr('width', edge.label.length * 6.4 + 8).attr('height', 16).attr('rx', 4).attr('fill', 'var(--bg-primary)').attr('opacity', 0.9);
        lg.append('text').attr('x', cx).attr('y', cy + 4).attr('text-anchor', 'middle').attr('class', 'dedge-label').text(edge.label);
      }
    }

    // ── Nodes ──
    const nodeGroup = g.append('g').attr('class', 'nodes');
    for (const node of layout.values()) {
      const status = graph.status.get(node.id) || 'Active';
      const nodeTerms = terms.get(node.id) || [];
      const ng = nodeGroup.append('g').datum(node).attr('class', 'dnode').attr('data-id', node.id)
        .attr('transform', `translate(${node.x},${node.y})`).attr('cursor', 'pointer');

      ng.append('circle').attr('class', 'dnode-ring').attr('r', NODE_R + 3).attr('fill', 'none')
        .attr('stroke', STATUS_RING[status] || STATUS_RING.Active).attr('stroke-width', 2.5)
        .attr('stroke-dasharray', status === 'Draft' ? '4,3' : 'none');
      ng.append('circle').attr('class', 'dnode-body').attr('r', NODE_R).attr('fill', colorOf(node.id)).attr('filter', 'url(#node-shadow)');
      const lines = wrapLabel(node.label);
      const startY = -(lines.length - 1) * 7;
      lines.forEach((line, i) => {
        ng.append('text').attr('x', 0).attr('y', startY + i * 14).attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('fill', '#fff').attr('font-size', lines.length > 2 ? 9 : 10.5).attr('font-weight', 700)
          .attr('font-family', 'Inter, sans-serif').text(line);
      });

      const propCount = properties.filter(p => (p.domains || []).includes(node.id)).length;
      if (propCount > 0) {
        const b = ng.append('g').attr('transform', `translate(${NODE_R - 4},${NODE_R - 4})`);
        b.append('rect').attr('x', -BADGE_R).attr('y', -BADGE_R).attr('width', BADGE_R * 2).attr('height', BADGE_R * 2).attr('rx', 4)
          .attr('fill', 'var(--bg-secondary)').attr('stroke', 'var(--border)');
        b.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central').attr('fill', 'var(--text-primary)')
          .attr('font-size', 11).attr('font-weight', 700).text(propCount);
      }
      // How many groups' terms reference this class (G4.2)
      if (nodeTerms.length > 0) {
        const b = ng.append('g').attr('class', 'term-badge').attr('transform', `translate(${-NODE_R + 4},${-NODE_R + 4})`);
        b.append('circle').attr('r', 11);
        b.append('text').attr('text-anchor', 'middle').attr('dy', 4).text(nodeTerms.length);
      }
      // The terms themselves, beside the class (G4.1)
      if (controls.terms && nodeTerms.length > 0) {
        const shown = nodeTerms.slice(0, MAX_TERM_PILLS);
        const extra = nodeTerms.length - shown.length;
        const total = shown.length + (extra > 0 ? 1 : 0);
        shown.forEach((t, i) => {
          const y = (i - (total - 1) / 2) * 25;
          ng.append('path').attr('class', `term-link${t.status === 'pending' ? ' edge-pending' : ''}`)
            .attr('d', `M${NODE_R},0 C${NODE_R + 14},0 ${NODE_R + 10},${y} ${NODE_R + 24},${y}`).attr('stroke', groupColor(t.scheme));
          const pill = ng.append('g').attr('class', `gnode-term${t.status === 'pending' ? ' term-pending' : ''}`)
            .attr('transform', `translate(${NODE_R + 24},${y})`);
          const text = pill.append('text').attr('class', 'term-label').attr('x', 8).attr('dy', 4).text(t.label);
          const w = text.node().getComputedTextLength() + 16;
          pill.insert('rect', 'text').attr('class', 'term-pill').attr('rx', 10).attr('height', 21).attr('y', -10.5).attr('width', w)
            .attr('stroke', groupColor(t.scheme)).attr('fill', groupColor(t.scheme));
          pill.append('title').text(`${t.label} (${community.schemeLabel(t.scheme)}): ${relationLabel(t.relation)}, ${t.status}. Click to open in the Explorer.`);
          pill.on('click', (event) => { event.stopPropagation(); openInExplorer(t.uri); });
        });
        if (extra > 0) {
          ng.append('text').attr('class', 'term-more').attr('x', NODE_R + 26).attr('y', ((total - 1) / 2) * 25 + 4).text(`+${extra} more`);
        }
      }
      ng.append('title').text(`${node.label}\n${toPrefixed(node.id)}\nStatus: ${status}${nodeTerms.length ? `\n${nodeTerms.length} group term(s) reference this` : ''}`);
      ng.on('click', (event) => { event.stopPropagation(); select(node.id); });
      ng.on('dblclick', (event) => { event.stopPropagation(); controls.setFocus(node.id); });
    }
    svg.on('click', () => select(null));

    const fit = (duration = 500) => {
      const b = g.node().getBBox();
      if (!b.width || !b.height) return;
      const { width: w, height: h } = zoomRef.current;
      const scale = Math.min(w / (b.width + 120), h / (b.height + 120), 1.2);
      svg.transition().duration(duration).call(zoom.transform,
        d3.zoomIdentity.translate(w / 2 - (b.x + b.width / 2) * scale, h / 2 - (b.y + b.height / 2) * scale).scale(scale));
    };
    zoomRef.current.fit = fit;
    fit(0);
    // controls/select/openInExplorer are stable or read at event time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, view.edges, terms, controls.terms, colorOf, groupColor, graph.status, properties]);

  /* ── Selection highlight (no relayout) ── */
  useEffect(() => {
    if (!svgRef.current) return;
    const sel = controls.selected;
    const svg = d3.select(svgRef.current);
    svg.selectAll('.dnode').classed('selected', d => d.id === sel);
    svg.selectAll('.dedge').classed('hl', d => Boolean(sel) && (d.source === sel || d.target === sel));
  }, [controls.selected, layout]);

  /* ── Move to a class chosen in the details panel ── */
  useEffect(() => {
    if (!panTo.current || panTo.current !== controls.selected) return;
    panTo.current = null;
    const z = zoomRef.current;
    const p = layout.get(controls.selected);
    if (!z || !p) return;
    const k = Math.max(d3.zoomTransform(z.svg.node()).k, 0.8);
    z.svg.transition().duration(450).call(z.zoom.transform, d3.zoomIdentity.translate(z.width / 2 - p.x * k, z.height / 2 - p.y * k).scale(k));
  }, [controls.selected, layout]);

  /* ── Keep the drawing sized to the canvas (the toolbar can change height) ── */
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = '';
    const ro = new ResizeObserver(() => {
      const z = zoomRef.current;
      const size = `${el.clientWidth}x${el.clientHeight}`;
      if (!z || size === last) return;
      const first = last === '';
      last = size;
      if (first) return;
      z.width = el.clientWidth; z.height = el.clientHeight;
      z.svg.attr('width', z.width).attr('height', z.height);
      z.fit?.(0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomApi = {
    in: () => zoomRef.current && zoomRef.current.svg.transition().duration(250).call(zoomRef.current.zoom.scaleBy, 1.4),
    out: () => zoomRef.current && zoomRef.current.svg.transition().duration(250).call(zoomRef.current.zoom.scaleBy, 1 / 1.4),
    fit: () => zoomRef.current?.fit?.(),
  };

  return (
    <div className="designer-view">
      <GraphControls title="Designer View" icon={<LayoutGrid size={16} />} controls={controls} graph={graph} view={view} zoom={zoomApi}
        termCount={controls.terms ? termCount : 0} />
      <div className="graph-stage">
        <svg ref={svgRef} className="designer-canvas" aria-label="Class diagram" />
        {view.nodes.length === 0 && (
          <div className="empty-state" style={{ position: 'absolute', inset: 0 }}>
            <h3>No Classes to Display</h3>
            <p>Connect to a Stardog database with an ontology (OWL classes) to see the hierarchical designer view.</p>
          </div>
        )}
        {controls.selected && (
          <GraphDetailPanel id={controls.selected} graph={graph} properties={properties} community={community}
            color={colorOf(controls.selected)}
            onSelect={goTo} onFocus={controls.setFocus} onOpen={openInExplorer} onClose={() => select(null)} />
        )}
      </div>
    </div>
  );
}
