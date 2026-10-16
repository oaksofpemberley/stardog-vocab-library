import { toPrefixed, statusKey, getLocalName } from '../lib/sparql';
import TermReferences from './TermReferences';
import { Crosshair, BookOpen, X } from 'lucide-react';

/**
 * Details of the selected class in Graph View and Designer View (G3.3): status, links to the
 * Explorer and to focus, its relationships (click to move there), properties and the groups'
 * terms that reference it.
 */
export default function GraphDetailPanel({ id, graph, properties, community, color, onSelect, onFocus, onOpen, onClose }) {
  const node = graph.nodes.find(n => n.id === id);
  if (!node) return null;
  const labelOf = (uri) => graph.nodes.find(n => n.id === uri)?.label || getLocalName(uri);
  const status = graph.status.get(id) || 'Active';
  const rels = graph.edges.filter(e => e.source === id || e.target === id)
    .map(e => ({ ...e, out: e.source === id, other: e.source === id ? e.target : e.source }))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'subclass' ? -1 : 1) || labelOf(a.other).localeCompare(labelOf(b.other)));
  const props = properties.filter(p => (p.domains || []).includes(id));

  return (
    <aside className="designer-detail graph-detail" aria-label={`Details of ${node.label}`}>
      <div className="designer-detail-header">
        <div className="designer-detail-color" style={{ background: color }} />
        <div style={{ minWidth: 0 }}>
          <div className="designer-detail-name">{node.label}</div>
          <div className="designer-detail-uri">{toPrefixed(id)}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ marginLeft: 'auto' }} aria-label="Close details"><X size={14} /></button>
      </div>
      <div className="designer-detail-section graph-detail-actions">
        <span className={`status-badge status-${statusKey(status)}`}>{status}</span>
        <button className="btn btn-secondary btn-xs" onClick={() => onFocus(id)}><Crosshair size={12} /> Focus here</button>
        <button className="btn btn-secondary btn-xs" onClick={() => onOpen(id)}><BookOpen size={12} /> Open in Explorer</button>
      </div>

      <TermReferences uri={id} community={community} compact />

      {rels.length > 0 && (
        <div className="designer-detail-section">
          <div className="designer-detail-section-title">Relationships ({rels.length})</div>
          {rels.map((r, i) => (
            <button key={i} className="designer-detail-rel graph-rel" onClick={() => onSelect(r.other)} title={`Go to ${labelOf(r.other)}`}>
              <span className="designer-detail-rel-arrow">{r.out ? '→' : '←'}</span>
              <span className="designer-detail-rel-label">{r.kind === 'subclass' ? (r.out ? 'is a' : 'has subclass') : r.label}</span>
              <span className="designer-detail-rel-target">{labelOf(r.other)}</span>
            </button>
          ))}
        </div>
      )}

      {props.length > 0 && (
        <div className="designer-detail-section">
          <div className="designer-detail-section-title">Properties ({props.length})</div>
          {props.map(p => (
            <div key={p.uri} className="designer-detail-prop">
              <span className="chip">{p.type === 'ObjectProperty' ? 'Object' : 'Datatype'}</span>
              <span>{p.label || getLocalName(p.uri)}</span>
              {(p.ranges?.[0] || p.range) && <span className="designer-detail-prop-range">→ {getLocalName(p.ranges?.[0] || p.range)}</span>}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
