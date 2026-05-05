import { useState, useEffect, useCallback } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { fetchAuditLog } from '../lib/governance';
import { toPrefixed } from '../lib/sparql';
import { History, Filter } from 'lucide-react';

export default function AuditLog() {
  const { endpoint, db, token } = useStardog();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await fetchAuditLog(endpoint, db, token));
    } catch { setEntries([]); }
    setLoading(false);
  }, [endpoint, db, token]);

  useEffect(() => { load(); }, [load]);

  const filtered = filterAction === 'all'
    ? entries
    : entries.filter(e => e.action.includes(filterAction));

  const actionTypes = [...new Set(entries.map(e => e.action))];

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={22} color="var(--accent)" /> Audit Log
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            {entries.length} entries · Immutable change history
          </p>
        </div>
        <select className="select" style={{ width: 'auto', minWidth: 160 }}
          value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="all">All Actions</option>
          {actionTypes.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="timeline" style={{ paddingLeft: 28 }}>
          {filtered.map(entry => {
            const actionType = entry.action.includes('approved') ? 'approved' :
              entry.action.includes('rejected') ? 'rejected' :
              entry.action.includes('deprecated') ? 'deprecated' :
              entry.action.includes('created') || entry.action.includes('proposal') ? 'created' : 'modified';
            return (
              <div key={entry.id} className="timeline-item">
                <div className={`timeline-dot ${actionType}`} />
                <div className="timeline-time">{new Date(entry.timestamp).toLocaleString()}</div>
                <div className="timeline-text">
                  <span className="timeline-actor">{entry.actor}</span>{' '}
                  <span>{entry.action.replace(/_/g, ' ')}</span>
                </div>
                {entry.termUri && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {toPrefixed(entry.termUri)}
                  </div>
                )}
                {entry.note && (
                  <div style={{
                    fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 4,
                    padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(15,23,42,0.4)', borderLeft: '2px solid var(--border)',
                  }}>
                    {entry.note}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <History size={48} />
          <h3>No Audit Entries</h3>
          <p>Changes to terms, proposals, and stewardship will appear here as an immutable audit trail.</p>
        </div>
      )}
    </div>
  );
}
