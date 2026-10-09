import { useState } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { createProposal } from '../lib/governance';
import { relationLabel } from '../lib/communities';
import { useCommunityData } from '../lib/useCommunityData';
import { useDraft } from '../lib/useDraft';
import { readHash, updateHash } from '../lib/urlState';
import { MappingStatusBadge, RelationTag, ConceptName } from './CommunityParts';
import { Waypoints } from 'lucide-react';

const FILTERS = ['all', 'approved', 'asserted', 'pending', 'rejected', 'retired'];

/** Communities > Mappings: every mapping, where it came from, and its review state */
export default function MappingsView() {
  const data = useCommunityData();
  const [filter, setFilterState] = useState(() => readHash().get('mstatus') || 'all');
  const setFilter = (f) => { setFilterState(f); updateHash({ mstatus: f === 'all' ? null : f }); };

  if (data.loading) return <div className="page-pad muted">Loading mappings…</div>;
  if (data.error) return <div className="page-pad"><div className="connection-status error" role="alert">{data.error}</div></div>;

  const rows = filter === 'all' ? data.mappings : data.mappings.filter(m => m.status === filter);
  const count = (f) => (f === 'all' ? data.mappings.length : data.mappings.filter(m => m.status === f).length);

  return (
    <div className="page-pad" style={{ maxWidth: 1250 }}>
      <h2 className="page-title"><Waypoints size={22} color="var(--accent)" /> Mappings</h2>
      <p className="page-subtitle">
        <strong>Approved</strong> mappings went through review and are stored as SKOS triples in <code>VOCAB:MAPPINGS</code>.{' '}
        <strong>Asserted</strong> mappings are stated in a vocabulary&apos;s own data and were not reviewed.{' '}
        Removing an approved mapping is also a reviewed proposal; removed mappings stay listed as <strong>retired</strong>.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)}>
            {f} ({count(f)})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <Waypoints size={48} />
          <h3>No mappings</h3>
          <p>Propose mappings from Communities → Shared Terms, or from the Review Queue.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Source</th><th>Relation</th><th>Target</th><th>Status</th><th>Justification</th><th>Proposed by</th><th>Reviewed by</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={i}>
                  <td><ConceptName uri={m.source} data={data} /></td>
                  <td><RelationTag iri={m.relation} /></td>
                  <td><ConceptName uri={m.target} data={data} /></td>
                  <td>
                    <MappingStatusBadge status={m.status} />
                    {m.removalPending && <div className="muted" style={{ fontSize: '0.72rem', marginTop: 4 }}>removal pending</div>}
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    {m.proposal?.description || <span className="muted">—</span>}
                    {m.retiredBy && <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Removed: {m.retiredBy.description}</div>}
                  </td>
                  <td>{m.proposal?.proposedBy || <span className="muted">—</span>}</td>
                  <td>
                    {m.proposal?.reviewer
                      ? <>{m.proposal.reviewer}{m.proposal.reviewComment && <div className="muted" style={{ fontSize: '0.75rem' }}>{m.proposal.reviewComment}</div>}</>
                      : <span className="muted">—</span>}
                    {m.retiredBy?.reviewer && <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Removal approved by {m.retiredBy.reviewer}</div>}
                  </td>
                  <td>{m.status === 'approved' && !m.removalPending && <ProposeRemoval mapping={m} data={data} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Propose removing an approved mapping; like any change, it only happens once a reviewer approves it */
function ProposeRemoval({ mapping, data }) {
  const { endpoint, db, token, connection } = useStardog();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useDraft(`${db}:unmap:${mapping.source}|${mapping.relation}|${mapping.target}`, '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await createProposal(endpoint, db, token, {
        type: 'unmap', description: reason, proposedBy: connection.username || 'anonymous',
        title: `Remove: ${data.conceptLabel(mapping.source)} ${relationLabel(mapping.relation)} ${data.conceptLabel(mapping.target)}`,
        mappingSource: mapping.source, mappingRelation: mapping.relation, mappingTarget: mapping.target,
      });
      setReason('');
      await data.reload();
    } catch (e) {
      setError(`Not saved: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!open && !reason) return <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Propose removal</button>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
      <input className="input" placeholder="Why remove it? (required)" value={reason} onChange={e => setReason(e.target.value)} />
      {error && <div className="connection-status error" role="alert">{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-danger btn-sm" onClick={submit} disabled={saving || !reason.trim()}>Propose</button>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setReason(''); }}>Cancel</button>
      </div>
    </div>
  );
}
