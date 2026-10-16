import { useRef, useEffect, useState, useMemo } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { toPrefixed, getNamespace, getLocalName, statusKey } from '../lib/sparql';
import { assignLayers } from '../lib/layout';
import { useCommunityData } from '../lib/useCommunityData';
import TermReferences from './TermReferences';
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
const LAYER_GAP_Y = 160;
const NODE_GAP_X = 200;
const BADGE_R = 14;

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

export default function DesignerView() {
  const { classes, properties, getTermStatus } = useStardog();
  // Which groups' terms reference the selected class (R9)
  const community = useCommunityData();
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  /* ── Derive graph data ── */
  const { nodes, links } = useMemo(() => {
    const classUris = new Set(classes.map(c => c.uri));

    // Count properties per class (domain)
    const propCounts = {};
    for (const p of properties) {
      const domains = p.domains;
      for (const d of domains) {
        if (classUris.has(d)) propCounts[d] = (propCounts[d] || 0) + 1;
      }
    }

    // Build links from object properties
    const links = [];
    const linkSet = new Set();
    for (const p of properties) {
      if (p.type !== 'ObjectProperty') continue;
      const domains = p.domains;
      const ranges = p.ranges;
      for (const d of domains) {
        for (const r of ranges) {
          const key = `${d}→${r}`;
          if (classUris.has(d) && classUris.has(r) && d !== r && !linkSet.has(key)) {
            linkSet.add(key);
            links.push({
              source: d, target: r,
              label: p.label || getLocalName(p.uri),
            });
          }
        }
      }
    }

    // Assign colors
    const nodes = classes.map((c, i) => ({
      id: c.uri,
      label: c.label || getLocalName(c.uri),
      ns: getNamespace(c.uri),
      status: getTermStatus(c.uri),
      color: NODE_COLORS[i % NODE_COLORS.length],
      propCount: propCounts[c.uri] || 0,
    }));

    return { nodes, links };
  }, [classes, properties, getTermStatus]);

  /* ── Hierarchical layout computation ── */
  const layout = useMemo(() => {
    if (nodes.length === 0) return { positioned: [], edges: [] };

    const nodeMap = new Map(nodes.map(n => [n.id, { ...n }]));
    // Longest-path layering in O(V+E); cycles (A→B→A) are tolerated, not followed forever
    const layers = assignLayers(nodes.map(n => n.id), links);

    // Group by layer
    const layerGroups = {};
    for (const [id, layer] of layers) {
      if (!layerGroups[layer]) layerGroups[layer] = [];
      layerGroups[layer].push(id);
    }

    // Position nodes
    const positioned = [];
    const posMap = new Map();
    const sortedLayers = Object.keys(layerGroups).map(Number).sort((a, b) => a - b);

    for (const layerIdx of sortedLayers) {
      const group = layerGroups[layerIdx];
      const totalWidth = (group.length - 1) * NODE_GAP_X;
      const startX = -totalWidth / 2;

      group.forEach((id, i) => {
        const node = nodeMap.get(id);
        const x = startX + i * NODE_GAP_X;
        const y = layerIdx * LAYER_GAP_Y;
        const pos = { ...node, x, y };
        positioned.push(pos);
        posMap.set(id, pos);
      });
    }

    // Build edges with positions
    const edges = links.map(l => {
      const src = posMap.get(l.source);
      const tgt = posMap.get(l.target);
      if (!src || !tgt) return null;
      return { ...l, sx: src.x, sy: src.y, tx: tgt.x, ty: tgt.y };
    }).filter(Boolean);

    return { positioned, edges };
  }, [nodes, links]);

  /* ── D3 rendering ── */
  useEffect(() => {
    if (!svgRef.current || !containerRef.current || layout.positioned.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Defs for arrowheads and drop shadows
    const defs = svg.append('defs');

    defs.append('marker')
      .attr('id', 'designer-arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', NODE_R + 8)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', 'var(--text-muted)');

    // Drop shadow filter
    const shadow = defs.append('filter').attr('id', 'node-shadow')
      .attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
    shadow.append('feDropShadow')
      .attr('dx', 0).attr('dy', 2).attr('stdDeviation', 4)
      .attr('flood-color', 'rgba(0,0,0,0.25)');

    const g = svg.append('g');

    // Zoom + pan
    const zoom = d3.zoom()
      .scaleExtent([0.15, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // ── Draw edges ──
    const edgeGroup = g.append('g').attr('class', 'edges');

    for (const edge of layout.edges) {
      const dx = edge.tx - edge.sx;
      const dy = edge.ty - edge.sy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Curved path
      const midX = (edge.sx + edge.tx) / 2;
      const midY = (edge.sy + edge.ty) / 2;
      const curvature = Math.min(40, dist * 0.15);
      // Offset perpendicular to the line for curve
      const nx = -dy / dist * curvature;
      const ny = dx / dist * curvature;
      const cx = midX + nx;
      const cy = midY + ny;

      const path = `M${edge.sx},${edge.sy} Q${cx},${cy} ${edge.tx},${edge.ty}`;

      edgeGroup.append('path')
        .attr('d', path)
        .attr('fill', 'none')
        .attr('stroke', 'var(--text-muted)')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', 'none')
        .attr('marker-end', 'url(#designer-arrow)')
        .attr('opacity', 0.6);

      // Edge label
      const labelX = cx;
      const labelY = cy;

      // Background for label
      const labelText = edge.label;
      edgeGroup.append('rect')
        .attr('x', labelX - labelText.length * 3.2 - 4)
        .attr('y', labelY - 8)
        .attr('width', labelText.length * 6.4 + 8)
        .attr('height', 16)
        .attr('rx', 4)
        .attr('fill', 'var(--bg-primary)')
        .attr('opacity', 0.9);

      edgeGroup.append('text')
        .attr('x', labelX)
        .attr('y', labelY + 4)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10)
        .attr('font-weight', 600)
        .attr('font-family', 'Inter, sans-serif')
        .attr('fill', 'var(--text-secondary)')
        .text(labelText);
    }

    // ── Draw nodes ──
    const nodeGroup = g.append('g').attr('class', 'nodes');

    for (const node of layout.positioned) {
      const ng = nodeGroup.append('g')
        .attr('transform', `translate(${node.x},${node.y})`)
        .attr('cursor', 'pointer');

      // Outer ring (status)
      const statusColor = STATUS_RING[node.status] || STATUS_RING.Active;
      ng.append('circle')
        .attr('r', NODE_R + 3)
        .attr('fill', 'none')
        .attr('stroke', statusColor)
        .attr('stroke-width', 2.5)
        .attr('stroke-dasharray', node.status === 'Draft' ? '4,3' : 'none');

      // Main circle
      ng.append('circle')
        .attr('r', NODE_R)
        .attr('fill', node.color)
        .attr('filter', 'url(#node-shadow)');

      // Label inside circle
      const lines = wrapLabel(node.label);
      const startY = -(lines.length - 1) * 7;
      lines.forEach((line, i) => {
        ng.append('text')
          .attr('x', 0)
          .attr('y', startY + i * 14)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', '#fff')
          .attr('font-size', lines.length > 2 ? 9 : 10.5)
          .attr('font-weight', 700)
          .attr('font-family', 'Inter, sans-serif')
          .text(line);
      });

      // Property count badge
      if (node.propCount > 0) {
        const badgeG = ng.append('g')
          .attr('transform', `translate(${NODE_R - 4},${NODE_R - 4})`);

        badgeG.append('rect')
          .attr('x', -BADGE_R).attr('y', -BADGE_R)
          .attr('width', BADGE_R * 2).attr('height', BADGE_R * 2)
          .attr('rx', 4)
          .attr('fill', 'var(--bg-secondary)')
          .attr('stroke', 'var(--border)')
          .attr('stroke-width', 1);

        badgeG.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', 'var(--text-primary)')
          .attr('font-size', 11)
          .attr('font-weight', 700)
          .attr('font-family', 'Inter, sans-serif')
          .text(node.propCount);
      }

      // Hover + click
      ng.on('mouseover', function (event) {
        d3.select(this).select('circle:nth-child(2)')
          .transition().duration(150)
          .attr('r', NODE_R + 4);
        const rect = container.getBoundingClientRect();
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          label: node.label,
          uri: toPrefixed(node.id),
          status: node.status,
          props: node.propCount,
        });
      }).on('mouseout', function () {
        d3.select(this).select('circle:nth-child(2)')
          .transition().duration(150)
          .attr('r', NODE_R);
        setTooltip(null);
      }).on('click', () => {
        setSelectedNode(prev => prev?.id === node.id ? null : node);
      });
    }

    // Auto-fit on initial render
    const bounds = g.node().getBBox();
    const pad = 60;
    const scale = Math.min(
      width / (bounds.width + pad * 2),
      height / (bounds.height + pad * 2),
      1.2
    );
    const tx = width / 2 - (bounds.x + bounds.width / 2) * scale;
    const ty = height / 2 - (bounds.y + bounds.height / 2) * scale;
    svg.transition().duration(600).call(
      zoom.transform,
      d3.zoomIdentity.translate(tx, ty).scale(scale)
    );

  }, [layout]);

  /* ── Detail panel for selected node ── */
  const selectedLinks = useMemo(() => {
    if (!selectedNode) return [];
    return layout.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);
  }, [selectedNode, layout.edges]);

  const selectedProps = useMemo(() => {
    if (!selectedNode) return [];
    return properties.filter(p => {
      const domains = p.domains;
      return domains.includes(selectedNode.id);
    });
  }, [selectedNode, properties]);

  return (
    <div className="designer-view" ref={containerRef}>
      {/* Toolbar */}
      <div className="designer-toolbar">
        <div className="designer-toolbar-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
          <span>Designer View</span>
          <span className="designer-count">{nodes.length} classes · {links.length} relationships</span>
        </div>
      </div>

      {/* SVG Canvas */}
      <svg ref={svgRef} className="designer-canvas" />

      {/* Tooltip */}
      {tooltip && (
        <div className="designer-tooltip" style={{ left: tooltip.x + 14, top: tooltip.y - 14 }}>
          <div className="designer-tooltip-label">{tooltip.label}</div>
          <div className="designer-tooltip-uri">{tooltip.uri}</div>
          <div className="designer-tooltip-meta">
            <span className={`status-badge status-${statusKey(tooltip.status)}`}>{tooltip.status}</span>
            <span>{tooltip.props} properties</span>
          </div>
        </div>
      )}

      {/* Detail sidebar */}
      {selectedNode && (
        <div className="designer-detail">
          <div className="designer-detail-header">
            <div className="designer-detail-color" style={{ background: selectedNode.color }} />
            <div>
              <div className="designer-detail-name">{selectedNode.label}</div>
              <div className="designer-detail-uri">{toPrefixed(selectedNode.id)}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedNode(null)}
              style={{ marginLeft: 'auto' }}>✕</button>
          </div>
          <div className="designer-detail-section">
            <div className="designer-detail-section-title">Status</div>
            <span className={`status-badge status-${statusKey(selectedNode.status)}`}>
              {selectedNode.status}
            </span>
          </div>
          <TermReferences uri={selectedNode.id} community={community} compact />
          {selectedProps.length > 0 && (
            <div className="designer-detail-section">
              <div className="designer-detail-section-title">Properties ({selectedProps.length})</div>
              {selectedProps.map(p => (
                <div key={p.uri} className="designer-detail-prop">
                  <span className="designer-detail-prop-type">
                    {p.type === 'ObjectProperty' ? '🔗' : '📝'}
                  </span>
                  <span>{p.label || getLocalName(p.uri)}</span>
                  {(p.ranges?.length > 0 || p.range) && (
                    <span className="designer-detail-prop-range">
                      → {getLocalName(p.ranges?.[0] || p.range)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {selectedLinks.length > 0 && (
            <div className="designer-detail-section">
              <div className="designer-detail-section-title">Relationships ({selectedLinks.length})</div>
              {selectedLinks.map((l, i) => (
                <div key={i} className="designer-detail-rel">
                  <span className="designer-detail-rel-arrow">
                    {l.source === selectedNode.id ? '→' : '←'}
                  </span>
                  <span className="designer-detail-rel-label">{l.label}</span>
                  <span className="designer-detail-rel-target">
                    {getLocalName(l.source === selectedNode.id ? l.target : l.source)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="empty-state" style={{ position: 'absolute', inset: 0 }}>
          <h3>No Classes to Display</h3>
          <p>Connect to a Stardog database with an ontology to see the hierarchical designer view.</p>
        </div>
      )}
    </div>
  );
}
