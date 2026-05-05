import { useState, useEffect, useCallback } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { fetchProposals, createProposal, reviewProposal } from '../lib/governance';
import { toPrefixed } from '../lib/sparql';
import { ListChecks, Plus, Check, X, Clock, FileText } from 'lucide-react';

export default function ReviewQueue() {
  const { endpoint, db, token, connection, classes, refreshGovernance } = useStardog();
  const actor = connection.username || 'anonymous';
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewComment, setReviewComment] = useState('');

  // New proposal form
  const [newType, setNewType] = useState('modify');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newTermUri, setNewTermUri] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProposals(await fetchProposals(endpoint, db, token));
    } catch { setProposals([]); }
    setLoading(false);
  }, [endpoint, db, token]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createProposal(endpoint, db, token, {
      termUri: newTermUri, type: newType,
      title: newTitle, description: newDesc, proposedBy: actor,
    });
    setShowCreate(false);
    setNewTitle(''); setNewDesc(''); setNewTermUri('');
    await load();
  };

  const handleReview = async (proposalId, decision) => {
    if (!reviewComment.trim() && decision === 'rejected') return;
    await reviewProposal(endpoint, db, token, proposalId, decision, actor, reviewComment || 'Approved');
    await refreshGovernance();
    setReviewingId(null);
    setReviewComment('');
    await load();
  };

  const pending = proposals.filter(p => p.status === 'pending');
  const resolved = proposals.filter(p => p.status !== 'pending');

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListChecks size={22} color="var(--accent)" /> Review Queue
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            {pending.length} pending proposal{pending.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> New Proposal
        </button>
      </div>

      {/* Create Proposal Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Change Proposal</div>
            <div className="modal-subtitle">Propose a change to the vocabulary.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="select" value={newType} onChange={e => setNewType(e.target.value)}>
                  <option value="add">Add New Term</option>
                  <option value="modify">Modify Existing Term</option>
                  <option value="deprecate">Deprecate Term</option>
                </select>
              </div>
              {newType !== 'add' && (
                <div className="form-group">
                  <label className="form-label">Target Term</label>
                  <select className="select" value={newTermUri} onChange={e => setNewTermUri(e.target.value)}>
                    <option value="">Select a term...</option>
                    {classes.map(c => (
                      <option key={c.uri} value={c.uri}>{c.label || toPrefixed(c.uri)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="input" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="Brief description of the change" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="textarea" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Detailed justification for this change..." />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Submit Proposal</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Proposals */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Pending Review
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map(p => (
              <div key={p.id} className="card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={`status-badge status-${p.type === 'deprecate' ? 'deprecated' : p.type === 'add' ? 'draft' : 'review'}`}>
                        {p.type}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.title}</span>
                    </div>
                    {p.description && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0' }}>{p.description}</p>}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                      <span>by {p.proposedBy}</span>
                      <span>{new Date(p.date).toLocaleDateString()}</span>
                      {p.termUri && <span style={{ fontFamily: 'var(--font-mono)' }}>{toPrefixed(p.termUri)}</span>}
                    </div>
                  </div>

                  {reviewingId === p.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 16, minWidth: 200 }}>
                      <input className="input" placeholder="Review comment..." value={reviewComment}
                        onChange={e => setReviewComment(e.target.value)} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-success btn-sm" onClick={() => handleReview(p.id, 'approved')}><Check size={13} /> Approve</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReview(p.id, 'rejected')}><X size={13} /> Reject</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => setReviewingId(p.id)}>Review</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Resolved
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {resolved.slice(0, 20).map(p => (
              <div key={p.id} style={{
                padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: 10, opacity: 0.7,
              }}>
                <span className={`status-badge status-${p.status === 'approved' ? 'active' : 'retired'}`}>{p.status}</span>
                <span style={{ flex: 1, fontSize: '0.85rem' }}>{p.title}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(p.date).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {proposals.length === 0 && !loading && (
        <div className="empty-state">
          <FileText size={48} />
          <h3>No Proposals Yet</h3>
          <p>Create your first change proposal to start governing your vocabulary.</p>
        </div>
      )}
    </div>
  );
}
