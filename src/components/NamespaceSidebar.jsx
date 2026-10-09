import { useMemo, useState } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { getNamespace, toPrefixed, statusKey } from '../lib/sparql';
import { ChevronDown, ChevronRight, Hash, Link2 } from 'lucide-react';

/** Derive a readable label from a namespace URI */
function nsLabel(ns) {
  const cleaned = ns.replace(/[#/]$/, '');
  const last = cleaned.split('/').pop() || cleaned;
  // Capitalize and clean up
  return last.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}


export default function NamespaceSidebar({ terms, selectedUri, onSelect, statusFilter }) {
  const { instanceCounts, getTermStatus } = useStardog();
  const [collapsed, setCollapsed] = useState({});

  // Group terms by namespace
  const grouped = useMemo(() => {
    const map = {};
    for (const t of terms) {
      const ns = getNamespace(t.uri);
      if (!map[ns]) map[ns] = { classes: [], properties: [] };
      if (t.kind === 'class') map[ns].classes.push(t);
      else map[ns].properties.push(t);
    }
    return map;
  }, [terms]);

  // Filter by status
  const filteredGrouped = useMemo(() => {
    if (statusFilter === 'all') return grouped;
    const map = {};
    for (const [ns, group] of Object.entries(grouped)) {
      const classes = group.classes.filter(t => statusKey(getTermStatus(t.uri)) === statusFilter);
      const properties = group.properties.filter(t => statusKey(getTermStatus(t.uri)) === statusFilter);
      if (classes.length || properties.length) map[ns] = { classes, properties };
    }
    return map;
  }, [grouped, statusFilter, getTermStatus]);

  const toggle = (ns) => setCollapsed(p => ({ ...p, [ns]: !p[ns] }));

  return (
    <div style={{ padding: '8px 0' }}>
      {Object.entries(filteredGrouped).map(([ns, group]) => {
        const label = nsLabel(ns);
        const isOpen = !collapsed[ns];
        const total = group.classes.length + group.properties.length;

        return (
          <div key={ns} style={{ marginBottom: 4 }}>
            {/* Namespace header */}
            <button
              onClick={() => toggle(ns)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                padding: '8px 12px', background: 'transparent', border: 'none',
                color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem',
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
              <span style={{
                fontSize: '0.68rem', color: 'var(--text-muted)',
                background: 'var(--accent-glow)', padding: '1px 6px', borderRadius: 8,
              }}>{total}</span>
            </button>

            {isOpen && (
              <div>
                {group.classes.length > 0 && (
                  <div style={{ padding: '2px 0' }}>
                    <div style={{ padding: '4px 20px', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      CLASSES
                    </div>
                    {group.classes.map(t => (
                      <TermItem key={t.uri} term={t} selected={selectedUri === t.uri}
                        onClick={() => onSelect(t.uri)} count={instanceCounts[t.uri]}
                        status={getTermStatus(t.uri)} />
                    ))}
                  </div>
                )}
                {group.properties.length > 0 && (
                  <div style={{ padding: '2px 0' }}>
                    <div style={{ padding: '4px 20px', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      PROPERTIES
                    </div>
                    {group.properties.map(t => (
                      <TermItem key={t.uri} term={t} selected={selectedUri === t.uri}
                        onClick={() => onSelect(t.uri)} status={getTermStatus(t.uri)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {Object.keys(filteredGrouped).length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          No terms match the current filters.
        </div>
      )}
    </div>
  );
}

function TermItem({ term, selected, onClick, count, status }) {
  const statusClass = statusKey(status);
  const icon = term.kind === 'class' ? <Hash size={12} /> : <Link2 size={12} />;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '6px 12px 6px 24px', background: selected ? 'var(--accent-glow)' : 'transparent',
        border: 'none', borderLeft: selected ? '3px solid var(--accent)' : '3px solid transparent',
        color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'var(--font-sans)',
        transition: 'all 0.15s', textAlign: 'left',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--accent-glow)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      <span className={`status-dot ${statusClass}`} />
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ flex: 1 }} className="truncate">
        {term.label || toPrefixed(term.uri)}
      </span>
      {count !== undefined && (
        <span style={{
          fontSize: '0.68rem', color: 'var(--text-muted)',
          background: 'var(--accent-glow)', padding: '0 5px', borderRadius: 6, fontWeight: 500,
        }}>{count}</span>
      )}
    </button>
  );
}
