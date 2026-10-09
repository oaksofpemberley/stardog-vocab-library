import { useState, useEffect, useCallback } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { setTermStatus, assignSteward, addEditorialNote, fetchNotes, fetchAuditLog, STATUSES } from '../lib/governance';
import { useDraft } from '../lib/useDraft';
import { statusKey } from '../lib/sparql';
import { Shield, User, MessageSquare, Clock, Send, ChevronDown } from 'lucide-react';

const STATUS_DISPLAY = { Draft: 'Draft', UnderReview: 'Under Review', Active: 'Active', Deprecated: 'Deprecated', Retired: 'Retired' };

export default function GovernancePanel({ termUri, termLabel }) {
  const { endpoint, db, token, connection, getTermStatus, getTermSteward, refreshGovernance } = useStardog();
  const actor = connection.username || 'anonymous';
  const status = getTermStatus(termUri);
  const steward = getTermSteward(termUri);

  const [notes, setNotes] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  // Unsent input survives a refresh (per database and term) until it is saved
  const [newNote, setNewNote] = useDraft(`${db}:note:${termUri}`, '');
  const [newSteward, setNewSteward] = useDraft(`${db}:steward:${termUri}`, '');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Run a governance write; on failure keep the input and show why, so nothing is silently lost
  const save = async (write, onSuccess) => {
    setSaving(true);
    setSaveError(null);
    try {
      await write();
      onSuccess?.();
    } catch (e) {
      console.error('[Vocab] Governance save failed:', e);
      setSaveError(`Not saved: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const loadData = useCallback(async () => {
    const [n, a] = await Promise.all([
      fetchNotes(endpoint, db, token, termUri).catch(() => []),
      fetchAuditLog(endpoint, db, token, termUri).catch(() => []),
    ]);
    setNotes(n);
    setAuditEntries(a);
  }, [endpoint, db, token, termUri]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStatusChange = (newStatus) => {
    setShowStatusMenu(false);
    return save(async () => {
      await setTermStatus(endpoint, db, token, termUri, newStatus, actor);
      await refreshGovernance();
      await loadData();
    });
  };

  const handleAssignSteward = () => {
    if (!newSteward.trim()) return;
    return save(async () => {
      await assignSteward(endpoint, db, token, termUri, newSteward.trim(), actor);
      await refreshGovernance();
      await loadData();
    }, () => setNewSteward(''));
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    return save(async () => {
      await addEditorialNote(endpoint, db, token, termUri, newNote.trim(), actor);
      await loadData();
    }, () => setNewNote(''));
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {saveError && (
        <div className="connection-status error" role="alert">{saveError}</div>
      )}
      {/* Status Section */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={15} color="var(--accent)" /> Lifecycle Status
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={`status-badge status-${statusKey(status)}`} style={{ fontSize: '0.85rem', padding: '4px 14px' }}>
            {STATUS_DISPLAY[status] || status}
          </span>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowStatusMenu(!showStatusMenu)}>
              Change <ChevronDown size={12} />
            </button>
            {showStatusMenu && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: 4, minWidth: 160,
                boxShadow: 'var(--shadow-lg)',
              }}>
                {STATUSES.filter(s => s !== status).map(s => (
                  <button key={s} className="btn btn-ghost btn-sm w-full"
                    style={{ justifyContent: 'flex-start', borderRadius: 'var(--radius-sm)' }}
                    onClick={() => handleStatusChange(s)} disabled={saving}>
                    <span className={`status-dot ${statusKey(s)}`} />
                    {STATUS_DISPLAY[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stewardship Section */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={15} color="var(--accent)" /> Stewardship
          </span>
        </div>
        {steward ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8rem', fontWeight: 700, color: '#fff',
            }}>{steward.name?.[0]?.toUpperCase() || '?'}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{steward.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Term Steward</div>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>No steward assigned.</p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="Steward name or email" value={newSteward}
            onChange={e => setNewSteward(e.target.value)} style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && handleAssignSteward()} />
          <button className="btn btn-primary btn-sm" onClick={handleAssignSteward} disabled={saving}>Assign</button>
        </div>
      </div>

      {/* Editorial Notes */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={15} color="var(--accent)" /> Editorial Notes
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{notes.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="input" placeholder="Add a note..." value={newNote}
            onChange={e => setNewNote(e.target.value)} style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && handleAddNote()} />
          <button className="btn btn-primary btn-sm btn-icon" onClick={handleAddNote} disabled={saving}>
            <Send size={14} />
          </button>
        </div>
        {notes.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notes.slice(0, 10).map(n => (
              <div key={n.id} style={{
                padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(71,85,105,0.15)',
              }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{n.text}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {n.author} · {new Date(n.date).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No notes yet.</p>
        )}
      </div>

      {/* Recent Audit Entries */}
      {auditEntries.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={15} color="var(--accent)" /> Recent Activity
            </span>
          </div>
          <div className="timeline">
            {auditEntries.slice(0, 8).map(entry => {
              const actionType = entry.action.includes('approved') ? 'approved' :
                entry.action.includes('rejected') ? 'rejected' :
                entry.action.includes('deprecated') ? 'deprecated' :
                entry.action.includes('created') ? 'created' : 'modified';
              return (
                <div key={entry.id} className="timeline-item">
                  <div className={`timeline-dot ${actionType}`} />
                  <div className="timeline-time">{new Date(entry.timestamp).toLocaleString()}</div>
                  <div className="timeline-text">
                    <span className="timeline-actor">{entry.actor}</span>
                    {entry.account && <span className="owner-account-tag" title="Stardog account verified by the server">{entry.account}</span>}{' '}
                    {entry.action.replace(/_/g, ' ')}
                    {entry.note && <span style={{ color: 'var(--text-muted)' }}> — {entry.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
