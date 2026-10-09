import { useState, useEffect } from 'react';
import { useStardog } from '../contexts/StardogContext';
import GovernancePanel from './GovernancePanel';
import ImpactAnalysis from './ImpactAnalysis';
import { toPrefixed, getNamespace, getLocalName, statusKey } from '../lib/sparql';
import { propertiesForClass, instanceCountQuery } from '../lib/ontologyQueries';
import { querySparql, getBindings, val } from '../lib/sparql';
import { readHash, updateHash } from '../lib/urlState';
import { Hash, Link2, ExternalLink, Shield, ChevronRight, FileText, AlertTriangle } from 'lucide-react';

export default function TermDetail({ term }) {
  const { endpoint, db, token, properties: allProps, instanceCounts, shaclShapes, getTermStatus } = useStardog();
  // The open tab is kept in the URL so a refresh returns to it
  const [activeTab, setActiveTabState] = useState(() => readHash().get('tab') || 'overview');
  const setActiveTab = (tab) => { setActiveTabState(tab); updateHash({ tab: tab === 'overview' ? null : tab }); };
  const [termProps, setTermProps] = useState([]);
  const [instanceCount, setInstanceCount] = useState(null);

  const status = getTermStatus(term.uri);
  const isClass = term.kind === 'class';

  // Fetch properties for this class
  useEffect(() => {
    if (!isClass) return;
    const loadProps = async () => {
      try {
        const res = await querySparql(endpoint, db, token, propertiesForClass(term.uri));
        setTermProps(getBindings(res).map(b => ({
          uri: val(b, 'prop'), label: val(b, 'label'), comment: val(b, 'comment'),
          type: val(b, 'type'), range: val(b, 'soRange') || val(b, 'rdfsRange'),
        })));
      } catch { setTermProps([]); }
    };
    loadProps();
    setInstanceCount(instanceCounts[term.uri] ?? null);
  }, [term.uri, isClass, endpoint, db, token, instanceCounts]);

  // SHACL constraints for this class
  const constraints = shaclShapes.filter(s => s.targetClass === term.uri && s.path);

  // For properties, find domain classes
  const domainClasses = !isClass
    ? allProps.filter(p => p.uri === term.uri).flatMap(p => p.domains || [])
    : [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'governance', label: 'Governance' },
    { id: 'impact', label: 'Impact' },
  ];

  return (
    <div className="fade-in" style={{ maxWidth: 800 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: isClass ? 'rgba(99,102,241,0.15)' : 'rgba(139,92,246,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isClass ? <Hash size={18} color="var(--accent)" /> : <Link2 size={18} color="#a78bfa" />}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
              {term.label || getLocalName(term.uri)}
            </h2>
            <span className="uri" style={{ fontSize: '0.72rem' }}>{toPrefixed(term.uri)}</span>
          </div>
          <span className={`status-badge status-${statusKey(status)}`}>{status === 'UnderReview' ? 'Under Review' : status}</span>
        </div>
        {term.comment && (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            {term.comment}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab-item ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="fade-in">
          {/* Metadata cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
            <MetaCard label="Type" value={term.type || (isClass ? 'owl:Class' : 'Property')} />
            <MetaCard label="Namespace" value={getNamespace(term.uri).split('/').filter(Boolean).pop()?.replace('#', '') || '—'} />
            {isClass && <MetaCard label="Instances" value={instanceCount ?? '—'} />}
            {isClass && <MetaCard label="Properties" value={termProps.length} />}
            {isClass && <MetaCard label="SHACL Constraints" value={constraints.length} />}
          </div>

          {/* Properties table (for classes) */}
          {isClass && termProps.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">Properties</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{termProps.length} total</span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {termProps.map(p => (
                      <tr key={p.uri}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.label || toPrefixed(p.uri)}</div>
                          {p.comment && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{p.comment}</div>}
                        </td>
                        <td>
                          <span className="chip">{p.type === 'ObjectProperty' ? 'Object' : 'Datatype'}</span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                          {p.range ? toPrefixed(p.range) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SHACL constraints */}
          {constraints.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Shield size={15} color="var(--accent)" /> SHACL Constraints
                </span>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Property</th><th>Constraint</th><th>Value</th></tr>
                  </thead>
                  <tbody>
                    {constraints.map((c, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                          {c.name || toPrefixed(c.path)}
                        </td>
                        <td>
                          {c.minCount && <span className="chip" style={{ marginRight: 4 }}>min: {c.minCount}</span>}
                          {c.maxCount && <span className="chip" style={{ marginRight: 4 }}>max: {c.maxCount}</span>}
                          {c.datatype && <span className="chip">type: {toPrefixed(c.datatype)}</span>}
                          {c.pattern && <span className="chip">pattern</span>}
                          {c.nodeKind && <span className="chip">{toPrefixed(c.nodeKind)}</span>}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {c.pattern || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Domain classes (for properties) */}
          {!isClass && domainClasses.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Used by Classes (Domain)</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {domainClasses.map(d => (
                  <span key={d} className="chip">{toPrefixed(d)}</span>
                ))}
              </div>
            </div>
          )}

          {/* URI */}
          <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)',
            background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>FULL URI</div>
            <code style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
              {term.uri}
            </code>
          </div>
        </div>
      )}

      {activeTab === 'governance' && (
        <GovernancePanel termUri={term.uri} termLabel={term.label || toPrefixed(term.uri)} />
      )}

      {activeTab === 'impact' && (
        <ImpactAnalysis termUri={term.uri} termLabel={term.label || toPrefixed(term.uri)} />
      )}
    </div>
  );
}

function MetaCard({ label, value }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = typeof value === 'string' && value.length > 16;
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 'var(--radius-md)',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      overflow: 'hidden', minWidth: 0,
      cursor: isLong ? 'pointer' : 'default',
      transition: 'border-color 0.15s',
    }}
      title={typeof value === 'string' ? value : undefined}
      onClick={() => isLong && setExpanded(!expanded)}
    >
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{
        fontSize: isLong ? '0.82rem' : '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2,
        overflow: expanded ? 'visible' : 'hidden',
        textOverflow: expanded ? 'unset' : 'ellipsis',
        whiteSpace: expanded ? 'normal' : 'nowrap',
        wordBreak: expanded ? 'break-all' : 'normal',
      }}>
        {value}
      </div>
    </div>
  );
}
