import { useRef, useEffect, useState, useMemo } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { toPrefixed, getNamespace } from '../lib/sparql';
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

export default function GraphView() {
  const { classes, properties, getTermStatus } = useStardog();
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [showDeprecated, setShowDeprecated] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);

  // Discover namespaces dynamically and assign colors
  const nsColorMap = useMemo(() => {
    const nsList = [...new Set(classes.map(c => getNamespace(c.uri)))];
    const map = {};
    nsList.forEach((ns, i) => { map[ns] = COLOR_PALETTE[i % COLOR_PALETTE.length]; });
    return map;
  }, [classes]);

  const nsLegend = useMemo(() => {
    return Object.entries(nsColorMap).map(([ns, color]) => ({
      ns, color, label: nsLabel(ns),
    }));
  }, [nsColorMap]);

  // The force simulation stalls the page past a few thousand nodes (50,000 terms: 1.3 s freezes),
  // and such a picture is unreadable anyway. Draw the best-connected classes up to this cap.
  const MAX_NODES = 1000;

  const { nodes, links, hiddenCount } = useMemo(() => {
    const filteredClasses = showDeprecated
      ? classes
      : classes.filter(c => !['Deprecated', 'Retired'].includes(getTermStatus(c.uri)));

    const classUris = new Set(filteredClasses.map(c => c.uri));
    const nodes = filteredClasses.map(c => ({
      id: c.uri, label: c.label || toPrefixed(c.uri),
      ns: getNamespace(c.uri), status: getTermStatus(c.uri),
    }));

    const links = [];
    for (const p of properties) {
      if (p.type !== 'ObjectProperty') continue;
      const domains = p.domains || (p.domain ? [p.domain] : []);
      const ranges = p.ranges || (p.range ? [p.range] : []);
      for (const d of domains) {
        for (const r of ranges) {
          if (classUris.has(d) && classUris.has(r) && d !== r) {
            links.push({ source: d, target: r, label: p.label || toPrefixed(p.uri) });
          }
        }
      }
    }
    if (nodes.length <= MAX_NODES) return { nodes, links, hiddenCount: 0 };
    const degree = new Map();
    for (const l of links) for (const id of [l.source, l.target]) degree.set(id, (degree.get(id) || 0) + 1);
    const kept = [...nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0)).slice(0, MAX_NODES);
    const keptIds = new Set(kept.map(n => n.id));
    return {
      nodes: kept,
      links: links.filter(l => keptIds.has(l.source) && keptIds.has(l.target)),
      hiddenCount: nodes.length - kept.length,
    };
  }, [classes, properties, getTermStatus, showDeprecated]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    svg.append('defs').selectAll('marker')
      .data(['arrow'])
      .join('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'rgba(148,163,184,0.4)');

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'rgba(148,163,184,0.2)')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    const linkLabel = g.append('g')
      .selectAll('text')
      .data(links)
      .join('text')
      .text(d => d.label)
      .attr('font-size', 8)
      .attr('fill', 'rgba(148,163,184,0.4)')
      .attr('text-anchor', 'middle')
      .attr('font-family', 'Inter, sans-serif');

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
      );

    node.append('circle')
      .attr('r', 20)
      .attr('fill', d => nsColorMap[d.ns] || '#6366f1')
      .attr('fill-opacity', 0.15)
      .attr('stroke', d => STATUS_BORDER[d.status] || '#22c55e')
      .attr('stroke-width', 2.5);

    node.append('circle')
      .attr('r', 5)
      .attr('fill', d => nsColorMap[d.ns] || '#6366f1');

    node.append('text')
      .text(d => d.label)
      .attr('dy', 32)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('fill', '#94a3b8')
      .attr('font-family', 'Inter, sans-serif');

    node.on('mouseover', function (event, d) {
      d3.select(this).select('circle').transition().attr('r', 24).attr('fill-opacity', 0.25);
      link.attr('stroke', l =>
        l.source.id === d.id || l.target.id === d.id ? 'rgba(99,102,241,0.6)' : 'rgba(148,163,184,0.1)'
      ).attr('stroke-width', l =>
        l.source.id === d.id || l.target.id === d.id ? 2.5 : 1
      );
      setTooltip({ x: event.pageX - container.getBoundingClientRect().left, y: event.pageY - container.getBoundingClientRect().top, text: `${d.label}\n${toPrefixed(d.id)}\nStatus: ${d.status}` });
    }).on('mouseout', function () {
      d3.select(this).select('circle').transition().attr('r', 20).attr('fill-opacity', 0.15);
      link.attr('stroke', 'rgba(148,163,184,0.2)').attr('stroke-width', 1.5);
      setTooltip(null);
    });

    simulation.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      linkLabel.attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    simulation.on('end', () => {
      const bounds = g.node().getBBox();
      const padding = 40;
      const scale = Math.min(width / (bounds.width + padding * 2), height / (bounds.height + padding * 2), 1.5);
      const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
      const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    });

    return () => simulation.stop();
  }, [nodes, links, nsColorMap]);

  return (
    <div style={{ height: '100%', position: 'relative' }} ref={containerRef}>
      {hiddenCount > 0 && (
        <div className="list-cap-note" style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, maxWidth: 420 }}>
          Showing the {MAX_NODES.toLocaleString()} best-connected classes; {hiddenCount.toLocaleString()} more are not drawn. Use the Explorer to find any term.
        </div>
      )}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setShowDeprecated(!showDeprecated)}
          style={{ fontSize: '0.72rem' }}>
          {showDeprecated ? 'Hide' : 'Show'} Deprecated
        </button>
      </div>

      {/* Dynamic legend – collapsible */}
      <div
        style={{
          position: 'absolute', bottom: 12, left: 12, zIndex: 10,
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)', backdropFilter: 'blur(8px)',
          boxShadow: 'var(--shadow-md)',
          fontSize: '0.72rem', color: 'var(--text-secondary)',
          maxWidth: '60vw', overflow: 'hidden',
          transition: 'box-shadow 0.25s ease',
        }}
      >
        {/* Clickable header */}
        <div
          onClick={() => setLegendOpen(prev => !prev)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', cursor: 'pointer', userSelect: 'none',
            fontWeight: 600, letterSpacing: '0.02em',
          }}
          title={legendOpen ? 'Collapse legend' : 'Expand legend'}
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{
              transition: 'transform 0.25s ease',
              transform: legendOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              flexShrink: 0,
            }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span>Legend</span>
          {!legendOpen && (
            <span style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
              {nsLegend.slice(0, 5).map(item => (
                <span key={item.ns} style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
              ))}
              {nsLegend.length > 5 && (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: '8px' }}>+{nsLegend.length - 5}</span>
              )}
            </span>
          )}
        </div>

        {/* Collapsible body */}
        <div
          style={{
            maxHeight: legendOpen ? 300 : 0,
            opacity: legendOpen ? 1 : 0,
            transition: 'max-height 0.3s ease, opacity 0.25s ease, padding 0.3s ease',
            padding: legendOpen ? '4px 12px 8px' : '0 12px',
            display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          {nsLegend.map(item => (
            <span key={item.ns} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              {item.label}
            </span>
          ))}
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          <span>Border = lifecycle status</span>
        </div>
      </div>

      {tooltip && (
        <div className="graph-tooltip" style={{ left: tooltip.x + 10, top: tooltip.y - 10 }}>
          {tooltip.text.split('\n').map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      <svg ref={svgRef} style={{ width: '100%', height: '100%', background: 'var(--bg-primary)' }} />

      {nodes.length === 0 && (
        <div className="empty-state" style={{ position: 'absolute', inset: 0 }}>
          <h3>No Classes to Display</h3>
          <p>Connect to a Stardog database with an ontology to see the knowledge graph.</p>
        </div>
      )}
    </div>
  );
}

