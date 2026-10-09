import { useState } from 'react';
import { useCommunityData } from '../lib/useCommunityData';
import { readHash, updateHash } from '../lib/urlState';
import { MappingStatusBadge, RelationTag, ConceptName } from './CommunityParts';
import { Waypoints } from 'lucide-react';

const FILTERS = ['all', 'approved', 'asserted', 'pending', 'rejected'];

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
    <div className="page-pad" style={{ maxWidth: 1200 }}>
      <h2 className="page-title"><Waypoints size={22} color="var(--accent)" /> Mappings</h2>
      <p className="page-subtitle">
        <strong>Approved</strong> mappings went through review and are stored as SKOS triples in <code>VOCAB:MAPPINGS</code>.{' '}
        <strong>Asserted</strong> mappings are stated in a vocabulary&apos;s own data and were not reviewed.
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
              <tr><th>Source</th><th>Relation</th><th>Target</th><th>Status</th><th>Justification</th><th>Proposed by</th><th>Reviewed by</th></tr>
            </thead>
            <tbody>
              {rows.map((m, i) => (
                <tr key={i}>
                  <td><ConceptName uri={m.source} data={data} /></td>
                  <td><RelationTag iri={m.relation} /></td>
                  <td><ConceptName uri={m.target} data={data} /></td>
                  <td><MappingStatusBadge status={m.status} /></td>
                  <td style={{ maxWidth: 320 }}>{m.proposal?.description || <span className="muted">—</span>}</td>
                  <td>{m.proposal?.proposedBy || <span className="muted">—</span>}</td>
                  <td>{m.proposal?.reviewer ? <>{m.proposal.reviewer}{m.proposal.reviewComment && <div className="muted" style={{ fontSize: '0.75rem' }}>{m.proposal.reviewComment}</div>}</> : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
