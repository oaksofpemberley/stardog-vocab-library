import { useState, useEffect, useCallback } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { fetchProposals, reviewProposals, hasStructuredChange, PROPOSAL_TYPE_LABEL as TYPE_LABEL } from '../lib/governance';
import { toPrefixed } from '../lib/sparql';
import { relationLabel } from '../lib/communities';
import { useDraft } from '../lib/useDraft';
import { useCommunityData } from '../lib/useCommunityData';
import ProposalModal from './ProposalModal';
import { ListChecks, Plus, Check, X, FileText, Layers, ChevronDown, ChevronRight } from 'lucide-react';

const TYPE_BADGE = { add: 'draft', modify: 'review', deprecate: 'deprecated', mapping: 'active', unmap: 'retired' };

export default function ReviewQueue() {
  const { endpoint, db, token, connection, classes, refreshGovernance, loadOntology, identity } = useStardog();
  const actor = connection.username || 'anonymous';
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewError, setReviewError] = useState(null);

  // The form's unsent input (ProposalModal) and whether it is open survive a refresh, per database
  const [showCreate, setShowCreate] = useDraft(`${db}:proposal-open`, false);
  const [review, setReview] = useDraft(`${db}:review`, { id: null, comment: '' });
  const setReviewingId = (id) => { setReviewError(null); setReview({ id, comment: '' }); };
  const [expandedBatch, setExpandedBatch] = useState(null);

  // Shared labels ("model" in three groups) are told apart by their group
  const community = useCommunityData();
  const termName = (uri) => {
    const label = classes.find(c => c.uri === uri)?.label || toPrefixed(uri);
    const concept = community.conceptByUri.get(uri);
    return concept?.scheme ? `${label} — ${community.schemeLabel(concept.scheme)}` : label;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProposals(await fetchProposals(endpoint, db, token));
    } catch { setProposals([]); }
    setLoading(false);
  }, [endpoint, db, token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch from Stardog on mount
  useEffect(() => { load(); }, [load]);

  /** Owner approval: who must approve this proposal, who has, and whether the current account may review */
  const approvalState = (p) => {
    const needed = community.approvalsNeeded(p);
    const required = [...new Set(needed.map(n => n.account))];
    const approvedBy = community.ownerApprovals.get(p.id) || [];
    const me = identity?.account || null;
    return {
      needed, required, approvedBy,
      canReview: required.length === 0 || required.includes(me),
      alreadyApproved: Boolean(me) && approvedBy.includes(me),
    };
  };

  /** Review one proposal, or a whole batch in one request (all applied or none) */
  const handleReview = async (list, decision) => {
    if (!review.comment.trim() && decision === 'rejected') { setReviewError('A comment is required to reject.'); return; }
    setReviewError(null);
    try {
      // Every proposal in a batch touches the same group, so the same owners must approve
      const { required } = approvalState(list[0]);
      await reviewProposals(endpoint, db, token, list, decision, actor, review.comment || 'Approved',
        { requiredAccounts: required });
      setReview({ id: null, comment: '' });
      await refreshGovernance();
      await Promise.all([load(), community.reload()]);
      // An approved change may have edited the vocabulary itself: reload it
      if (decision === 'approved' && list.some(p => hasStructuredChange(p) && p.type !== 'mapping')) loadOntology();
    } catch (e) {
      console.error('[Vocab] Review failed:', e);
      setReviewError(`Review not saved: ${e.message}`);
    }
  };

  const pending = proposals.filter(p => p.status === 'pending');
  const resolved = proposals.filter(p => p.status !== 'pending');
  // A bulk add shows as one card (in the order of its newest proposal); everything else one card each
  const cards = [];
  const batches = new Map();
  for (const p of pending) {
    if (!p.batch) { cards.push({ key: p.id, items: [p] }); continue; }
    if (!batches.has(p.batch)) { const card = { key: p.batch, batch: p.batch, items: [] }; batches.set(p.batch, card); cards.push(card); }
    batches.get(p.batch).items.push(p);
  }

  /** What approving this proposal will change (or changed) */
  const ChangeSummary = ({ p }) => {
    const lines = [];
    if (p.type === 'mapping' && p.mappingSource) lines.push(<><strong>{termName(p.mappingSource)}</strong> {relationLabel(p.mappingRelation)} <strong>{termName(p.mappingTarget)}</strong> → VOCAB:MAPPINGS</>);
    if (p.type === 'unmap' && p.mappingSource) lines.push(<>Remove <strong>{termName(p.mappingSource)}</strong> {relationLabel(p.mappingRelation)} <strong>{termName(p.mappingTarget)}</strong> from VOCAB:MAPPINGS</>);
    if (p.type === 'add' && p.proposedIri) lines.push(<>New term <strong>{p.proposedLabel}</strong> in <strong>{termName(p.proposedScheme)}</strong> <span className="mono-muted">{p.proposedIri}</span></>);
    if (p.type === 'modify' && p.proposedLabel) lines.push(<>Label → <strong>{p.proposedLabel}</strong></>);
    if (p.type === 'modify' && p.proposedDefinition) lines.push(<>Definition → <strong>{p.proposedDefinition}</strong></>);
    if (p.type === 'deprecate') lines.push(<>Status → <strong>Deprecated</strong>, and owl:deprecated in the vocabulary</>);
    if (lines.length === 0) return null;
    return <div className="change-summary">{lines.map((l, i) => <div key={i}>{l}</div>)}</div>;
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListChecks size={22} color="var(--accent)" /> Review Queue
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            {pending.length} pending proposal{pending.length !== 1 ? 's' : ''} · approving a proposal applies its change
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> New Proposal
        </button>
      </div>

      {showCreate && (
        <ProposalModal community={community} draftKey={`${db}:proposal`}
          onClose={() => setShowCreate(false)} onCreated={() => Promise.all([load(), community.reload()])} />
      )}

      {/* Pending Proposals */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Pending Review
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cards.map(card => card.batch && card.items.length > 1 && expandedBatch !== card.batch ? (
              <BatchCard key={card.key} items={card.items} state={approvalState(card.items[0])}
                groupLabel={community.schemeLabel} onExpand={() => setExpandedBatch(card.batch)}
                reviewing={review.id === card.batch} onStartReview={() => setReviewingId(card.batch)}
                review={review} setReview={setReview} reviewError={reviewError} identity={identity}
                onReview={(decision) => handleReview(card.items, decision)} />
            ) : (
              <div key={card.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {card.batch && card.items.length > 1 && (
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setExpandedBatch(null)}>
                    <ChevronDown size={13} /> Bulk add: {card.items.length} terms to {community.schemeLabel(card.items[0].proposedScheme)} (review together)
                  </button>
                )}
                {card.items.map(p => (
              <div key={p.id} className="card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={`status-badge status-${TYPE_BADGE[p.type] || 'review'}`}>{TYPE_LABEL[p.type] || p.type}</span>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.title}</span>
                    </div>
                    <ChangeSummary p={p} />
                    <ApprovalLine state={approvalState(p)} groupLabel={community.schemeLabel} />
                    {p.description && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0', whiteSpace: 'pre-wrap' }}>{p.description}</p>}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
                      <span>by {p.proposedBy}</span>
                      <span>{new Date(p.date).toLocaleDateString()}</span>
                      {p.termUri && <span style={{ fontFamily: 'var(--font-mono)' }}>{toPrefixed(p.termUri)}</span>}
                    </div>
                  </div>

                  {!approvalState(p).canReview ? (
                    <span className="muted" style={{ fontSize: '0.75rem', maxWidth: 200, textAlign: 'right' }}>
                      {identity?.account ? `Only ${approvalState(p).required.join(' and ')} can review this` : 'Sign in with a Stardog account to review'}
                    </span>
                  ) : review.id === p.id ? (
                    <ReviewForm review={review} setReview={setReview} reviewError={reviewError}
                      alreadyApproved={approvalState(p).alreadyApproved} onReview={(decision) => handleReview([p], decision)} />
                  ) : (
                    <button className="btn btn-secondary btn-sm" onClick={() => setReviewingId(p.id)}>Review</button>
                  )}
                </div>
              </div>
                ))}
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
                display: 'flex', alignItems: 'center', gap: 10, opacity: 0.8,
              }}>
                <span className={`status-badge status-${p.status === 'approved' ? 'active' : 'retired'}`}>{p.status}</span>
                {p.appliedDate && <span className="status-badge status-review" title={`Applied ${new Date(p.appliedDate).toLocaleString()}`}>applied</span>}
                <span style={{ flex: 1, fontSize: '0.85rem' }}>{p.title}</span>
                {p.reviewer && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>by {p.reviewer}</span>}
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

/** "Needs approval from: Physics — alice ✓ · Business — bob" */
function ApprovalLine({ state, groupLabel }) {
  if (state.needed.length === 0) return null;
  return (
    <div className="approval-line">
      <span>Needs approval from:</span>
      {state.needed.map(n => {
        const done = state.approvedBy.includes(n.account);
        return (
          <span key={`${n.scheme}|${n.account}`} className={`approval-chip ${done ? 'done' : ''}`}>
            {groupLabel(n.scheme)}: {n.account} {done ? '✓ approved' : '(waiting)'}
          </span>
        );
      })}
    </div>
  );
}

/** Comment box with Approve / Reject (label says "all" for a batch) */
function ReviewForm({ review, setReview, reviewError, alreadyApproved, onReview, count = 1 }) {
  const all = count > 1 ? ` all ${count}` : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 16, minWidth: 200 }}>
      <input className="input" placeholder="Review comment..." value={review.comment} aria-label="Review comment"
        onChange={e => setReview(r => ({ ...r, comment: e.target.value }))} />
      {reviewError && <div className="connection-status error" role="alert">{reviewError}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-success btn-sm" onClick={() => onReview('approved')} disabled={alreadyApproved}
          title={alreadyApproved ? 'You already approved; waiting for the other owner' : undefined}>
          <Check size={13} /> Approve{all}
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => onReview('rejected')}><X size={13} /> Reject{all}</button>
      </div>
    </div>
  );
}

/** A bulk add, reviewed as one: lists its terms; approving applies them all in one request */
function BatchCard({ items, state, groupLabel, onExpand, reviewing, onStartReview, review, setReview, reviewError, identity, onReview }) {
  const first = items[0];
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, 8);
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="status-badge status-draft"><Layers size={11} style={{ verticalAlign: '-1px' }} /> Bulk add</span>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{items.length} terms to {groupLabel(first.proposedScheme)}</span>
          </div>
          <ul className="batch-terms">
            {shown.map(p => (
              <li key={p.id}><strong>{p.proposedLabel}</strong>{p.proposedDefinition && <span className="muted"> — {p.proposedDefinition}</span>}</li>
            ))}
          </ul>
          {items.length > 8 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {open ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
          <ApprovalLine state={state} groupLabel={groupLabel} />
          {first.description && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0', whiteSpace: 'pre-wrap' }}>{first.description}</p>}
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
            <span>by {first.proposedBy}</span>
            <span>{new Date(first.date).toLocaleDateString()}</span>
            {first.batchSize > items.length && <span>{first.batchSize - items.length} of the {first.batchSize} already reviewed</span>}
          </div>
        </div>
        {!state.canReview ? (
          <span className="muted" style={{ fontSize: '0.75rem', maxWidth: 200, textAlign: 'right' }}>
            {identity?.account ? `Only ${state.required.join(' and ')} can review this` : 'Sign in with a Stardog account to review'}
          </span>
        ) : reviewing ? (
          <ReviewForm review={review} setReview={setReview} reviewError={reviewError} count={items.length}
            alreadyApproved={state.alreadyApproved} onReview={onReview} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 16 }}>
            <button className="btn btn-secondary btn-sm" onClick={onStartReview}>Review all</button>
            <button className="btn btn-ghost btn-sm" onClick={onExpand}>One by one</button>
          </div>
        )}
      </div>
    </div>
  );
}
