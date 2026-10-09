import { useState, useEffect } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { querySparql, getBindings, val, toPrefixed } from '../lib/sparql';
import { impactQuery, instanceCountQuery } from '../lib/ontologyQueries';
import { AlertTriangle, ArrowRight, Database, Shield, Layers } from 'lucide-react';

export default function ImpactAnalysis({ termUri, termLabel }) {
  const { endpoint, db, token } = useStardog();
  const [impacts, setImpacts] = useState([]);
  const [instanceCount, setInstanceCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [impactRes, countRes] = await Promise.all([
          querySparql(endpoint, db, token, impactQuery(termUri)),
          querySparql(endpoint, db, token, instanceCountQuery(termUri)).catch(() => null),
        ]);
        setImpacts(getBindings(impactRes).map(b => ({
          relationship: val(b, 'relationship'),
          term: val(b, 'relatedTerm'),
          label: val(b, 'relatedLabel'),
        })));
        if (countRes) {
          const bindings = getBindings(countRes);
          setInstanceCount(bindings[0] ? parseInt(val(bindings[0], 'count'), 10) : 0);
        }
      } catch { setImpacts([]); }
      setLoading(false);
    };
    load();
  }, [termUri, endpoint, db, token]);

  if (loading) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Analyzing impact...</div>;

  const totalImpacts = impacts.length + (instanceCount > 0 ? 1 : 0);
  const severity = totalImpacts === 0 ? 'safe' : totalImpacts <= 3 ? 'moderate' : 'high';
  const severityColor = severity === 'safe' ? 'var(--success)' : severity === 'moderate' ? 'var(--warning)' : 'var(--danger)';

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary */}
      <div className="card" style={{ borderColor: severityColor, borderWidth: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: severity === 'safe' ? 'var(--success-bg)' : severity === 'moderate' ? 'var(--warning-bg)' : 'var(--danger-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle size={20} color={severityColor} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
              {severity === 'safe' ? 'Safe to Modify' : severity === 'moderate' ? 'Moderate Impact' : 'High Impact'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {totalImpacts === 0 ? 'No dependencies found.' : `${totalImpacts} ${totalImpacts === 1 ? 'dependency' : 'dependencies'} detected.`}
            </div>
          </div>
        </div>
      </div>

      {/* Instance count */}
      {instanceCount > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Database size={16} color="var(--danger)" />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {instanceCount.toLocaleString()} instances
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Modifying or removing this term will affect existing data.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dependency list */}
      {impacts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Dependencies</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{impacts.length} found</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {impacts.map((imp, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(71,85,105,0.15)',
              }}>
                <ArrowRight size={14} color="var(--text-muted)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    {imp.label || toPrefixed(imp.term)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {imp.relationship}
                  </div>
                </div>
                <code style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {imp.term}
                </code>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalImpacts === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          This term has no detected dependencies. It can be safely modified or deprecated.
        </div>
      )}
    </div>
  );
}
