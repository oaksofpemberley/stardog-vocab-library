import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { toPrefixed } from '../lib/sparql';
import { relationLabel } from '../lib/communities';
import { selectView, termsByClass, GROUP_COLORS } from '../lib/graphModel';
import { useGraphData } from '../lib/useGraphData';
import { useGraphControls } from '../lib/useGraphControls';
import { updateHash } from '../lib/urlState';
import GraphControls from './GraphControls';
import GraphDetailPanel from './GraphDetailPanel';
import { Share2 } from 'lucide-react';
import * as d3 from 'd3';

const COLOR_PALETTE = [
  '#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444',
  '#a78bfa', '#14b8a6', '#f97316', '#ec4899', '#84cc16',
];

const STATUS_BORDER = {
  Active: '#22c55e', Draft: '#eab308', UnderReview: '#3b82f6',
  Deprecated: '#f97316', Retired: '#ef4444',
};

/** Derive a short readable label from a namespace URI */
function nsLabel(ns) {
  const cleaned = ns.replace(/[#/]$/, '');
  const last = cleaned.split('/').pop() || cleaned;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

// Above this many drawn nodes the layout is computed before drawing (G3.4), instead of animating
const STATIC_LAYOUT_ABOVE = 300;

export default function GraphView({ onNavigate }) {
  const controls = useGraphControls();
  const { graph, community, properties } = useGraphData({ showHierarchy: controls.hierarchy, showDeprecated: controls.deprecated });
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomRef = useRef(null);
  const panTo = useRef(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const nsColorMap = useMemo(() => {
    const map = {};
    [...new Set(graph.nodes.map(n => n.ns))].forEach((ns, i) => { map[ns] = COLOR_PALETTE[i % COLOR_PALETTE.length]; });
    return map;
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

  const select = controls.setSelected;
  const goTo = useCallback((id) => {
    // Move to a class: select it, and focus on it if it is not drawn
    if (view.nodes.some(n => n.id === id)) { panTo.current = id; controls.setSelected(id); }
    else controls.setFocus(id);
  }, [view.nodes, controls]);
  const openInExplorer = (id) => { updateHash({ term: id, tab: null, focus: null }); onNavigate?.('explore'); };

  /* ── Draw ── */
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || view.nodes.length === 0) return;
    const svgEl = svgRef.current;
    const width = svgEl.clientWidth;
    const height = svgEl.clientHeight;
    d3.select(svgEl).selectAll('*').remove();
    const svg = d3.select(svgEl).attr('width', width).attr('height', height);

    const defs = svg.append('defs');
    for (const [idm, fill] of [['arrow-prop', 'rgba(148,163,184,0.55)'], ['arrow-sub', 'none']]) {
      defs.append('marker').attr('id', idm).attr('viewBox', '0 -5 10 10').attr('refX', 26).attr('refY', 0)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5Z').attr('fill', fill).attr('stroke', 'rgba(148,163,184,0.7)');
    }

    const g = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.05, 4]).on('zoom', (event) => {
      g.attr('transform', event.transform);
      // Level of detail (G3.2): names hidden when far, edge labels only when near
      svg.classed('lod-far', event.transform.k < 0.55).classed('lod-near', event.transform.k >= 1.1);
    });
    svg.call(zoom).on('dblclick.zoom', null);
    zoomRef.current = { svg, zoom, g, width, height };

    // Nodes: classes, plus groups' terms when switched on (G4.1)
    const nodes = view.nodes.map(n => ({ ...n, kind: 'class', status: graph.status.get(n.id), terms: terms.get(n.id) || [] }));
    const links = view.edges.map(e => ({ ...e }));
    if (controls.terms) {
      for (const n of nodes.filter(x => x.kind === 'class')) for (const t of n.terms) {
        const id = `term|${n.id}|${t.uri}|${t.relation}|${t.status}`;
        nodes.push({ id, kind: 'term', label: t.label, scheme: t.scheme, status: t.status, uri: t.uri, classId: n.id });
        links.push({ source: id, target: n.id, kind: 'term', label: relationLabel(t.relation), status: t.status, scheme: t.scheme });
      }
    }
    const center = view.focus;
    for (const n of nodes) if (n.id === center) { n.fx = width / 2; n.fy = height / 2; }

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id)
        .distance(l => (l.kind === 'term' ? 55 : l.kind === 'subclass' ? 80 : 130))
        .strength(l => (l.kind === 'term' ? 1 : 0.5)))
      .force('charge', d3.forceManyBody().strength(d => (d.kind === 'term' ? -60 : -320)))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => (d.kind === 'term' ? 34 : Math.min(70, 24 + d.label.length * 2))));

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('class', d => `edge edge-${d.kind}${d.status === 'pending' ? ' edge-pending' : ''}`)
      .attr('stroke', d => (d.kind === 'term' ? groupColor(d.scheme) : null))
      .attr('marker-end', d => (d.kind === 'property' ? 'url(#arrow-prop)' : d.kind === 'subclass' ? 'url(#arrow-sub)' : null));
    const linkLabel = g.append('g').selectAll('text').data(links.filter(l => l.kind !== 'subclass')).join('text')
      .attr('class', d => `edge-label edge-label-${d.kind}`).attr('text-anchor', 'middle').text(d => d.label);

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .attr('class', d => `gnode gnode-${d.kind}${d.kind === 'term' && d.status === 'pending' ? ' term-pending' : ''}`)
      .attr('data-id', d => d.id)
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); if (d.id !== center) { d.fx = null; d.fy = null; } }));

    const cls = node.filter(d => d.kind === 'class');
    cls.append('circle').attr('class', 'gnode-ring').attr('r', 18)
      .attr('fill', d => nsColorMap[d.ns] || '#6366f1').attr('fill-opacity', 0.18)
      .attr('stroke', d => STATUS_BORDER[d.status] || '#22c55e').attr('stroke-width', 2.5);
    cls.append('circle').attr('r', 5).attr('fill', d => nsColorMap[d.ns] || '#6366f1');
    cls.append('text').attr('class', 'node-label').attr('dy', 32).attr('text-anchor', 'middle').text(d => d.label);
    // How many groups' terms reference this class (G4.2)
    const badge = cls.filter(d => d.terms.length > 0).append('g').attr('class', 'term-badge').attr('transform', 'translate(14,-14)');
    badge.append('circle').attr('r', 8);
    badge.append('text').attr('text-anchor', 'middle').attr('dy', 3.5).text(d => d.terms.length);
    cls.append('title').text(d => `${d.label}\n${toPrefixed(d.id)}\nStatus: ${d.status}${d.terms.length ? `\n${d.terms.length} group term(s) reference this` : ''}`);
    cls.on('click', (event, d) => { event.stopPropagation(); select(d.id); });
    cls.on('dblclick', (event, d) => { event.stopPropagation(); controls.setFocus(d.id); });

    const trm = node.filter(d => d.kind === 'term');
    trm.append('rect').attr('class', 'term-pill').attr('rx', 9).attr('height', 18).attr('y', -9)
      .attr('stroke', d => groupColor(d.scheme)).attr('fill', d => groupColor(d.scheme));
    trm.append('text').attr('class', 'term-label').attr('text-anchor', 'middle').attr('dy', 4).text(d => d.label);
    trm.each(function () {
      const t = d3.select(this);
      const w = t.select('text').node().getComputedTextLength() + 16;
      t.select('rect').attr('width', w).attr('x', -w / 2);
    });
    trm.append('title').text(d => `${d.label} (${community.schemeLabel(d.scheme)})\n${d.status}. Click to open in the Explorer.`);
    trm.on('click', (event, d) => { event.stopPropagation(); openInExplorer(d.uri); });

    svg.on('click', () => select(null));

    const tick = () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y).attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      linkLabel.attr('x', d => (d.source.x + d.target.x) / 2).attr('y', d => (d.source.y + d.target.y) / 2 - 3);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    };
    const fit = (duration = 500) => {
      const b = g.node().getBBox();
      if (!b.width || !b.height) return;
      const { width: w, height: h } = zoomRef.current;
      const scale = Math.min(w / (b.width + 80), h / (b.height + 80), 1.4);
      svg.transition().duration(duration).call(zoom.transform,
        d3.zoomIdentity.translate(w / 2 - (b.x + b.width / 2) * scale, h / 2 - (b.y + b.height / 2) * scale).scale(scale));
    };
    zoomRef.current.fit = fit;
    zoomRef.current.positions = () => new Map(nodes.map(n => [n.id, n]));

    if (nodes.length > STATIC_LAYOUT_ABOVE) {
      // Large: settle the layout first, then draw once (no slow animation)
      simulation.stop();
      for (let i = 0; i < 300; i++) simulation.tick();
      tick();
      fit(0);
    } else {
      simulation.on('tick', tick);
      simulation.on('end', () => fit());
    }
    return () => simulation.stop();
    // controls/select/openInExplorer are stable or read at event time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, terms, controls.terms, nsColorMap, groupColor, graph.status]);

  /* ── Selection highlight (no relayout) ── */
  useEffect(() => {
    if (!svgRef.current) return;
    const sel = controls.selected;
    const near = new Set(sel ? [sel] : []);
    for (const e of view.edges) {
      if (e.source === sel) near.add(e.target);
      if (e.target === sel) near.add(e.source);
    }
    const svg = d3.select(svgRef.current);
    svg.selectAll('.gnode').classed('selected', d => d.id === sel).classed('keep', d => near.has(d.id) || d.classId === sel);
    svg.selectAll('.edge').classed('hl', d => Boolean(sel) && ((d.source.id ?? d.source) === sel || (d.target.id ?? d.target) === sel));
  }, [controls.selected, view]);

  /* ── Move to a class chosen in the details panel (a click on the canvas does not pan) ── */
  useEffect(() => {
    if (!panTo.current || panTo.current !== controls.selected) return;
    panTo.current = null;
    const z = zoomRef.current;
    const p = z?.positions?.().get(controls.selected);
    if (!p || p.x === undefined) return;
    const k = Math.max(d3.zoomTransform(z.svg.node()).k, 0.9);
    z.svg.transition().duration(450).call(z.zoom.transform, d3.zoomIdentity.translate(z.width / 2 - p.x * k, z.height / 2 - p.y * k).scale(k));
  }, [controls.selected]);

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

  const nsLegend = Object.entries(nsColorMap).map(([ns, color]) => ({ ns, color, label: nsLabel(ns) }));
  const legendGroups = community.schemes.filter(s => [...terms.values()].some(ts => ts.some(t => t.scheme === s.uri)));

  return (
    <div className="designer-view" ref={containerRef}>
      <GraphControls title="Graph View" icon={<Share2 size={16} />} controls={controls} graph={graph} view={view} zoom={zoomApi}
        termCount={controls.terms ? termCount : 0} />
      <div className="graph-stage">
        <svg ref={svgRef} className="graph-canvas" aria-label="Class graph" />

        {/* Legend – collapsible */}
        <div className="graph-legend">
          <button className="graph-legend-head" onClick={() => setLegendOpen(o => !o)} aria-expanded={legendOpen}>
            <span style={{ transform: legendOpen ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>›</span>
            Legend
            {!legendOpen && nsLegend.slice(0, 5).map(item => <span key={item.ns} className="legend-dot" style={{ background: item.color }} />)}
          </button>
          {legendOpen && (
            <div className="graph-legend-body">
              {nsLegend.map(item => (
                <span key={item.ns} className="legend-item"><span className="legend-dot" style={{ background: item.color }} />{item.label}</span>
              ))}
              {legendGroups.map(s => (
                <span key={s.uri} className="legend-item"><span className="legend-pill" style={{ borderColor: groupColor(s.uri) }} />{s.label || toPrefixed(s.uri)} term</span>
              ))}
              <span className="legend-item muted">Ring = status · → property · ▷ is a (subclass) · dashed = group term · number = terms that reference the class</span>
            </div>
          )}
        </div>

        {view.nodes.length === 0 && (
          <div className="empty-state" style={{ position: 'absolute', inset: 0 }}>
            <h3>No Classes to Display</h3>
            <p>Connect to a Stardog database with an ontology (OWL classes) to see the knowledge graph.</p>
          </div>
        )}
        {controls.selected && (
          <GraphDetailPanel id={controls.selected} graph={graph} properties={properties} community={community}
            color={nsColorMap[graph.nodes.find(n => n.id === controls.selected)?.ns]}
            onSelect={goTo} onFocus={controls.setFocus} onOpen={openInExplorer} onClose={() => select(null)} />
        )}
      </div>

    </div>
  );
}
