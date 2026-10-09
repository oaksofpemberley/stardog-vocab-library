import { useState, useMemo } from 'react';
import { toPrefixed } from '../lib/sparql';
import { findSharedTerms } from '../lib/communities';
import { useCommunityData } from '../lib/useCommunityData';
import { readHash, updateHash } from '../lib/urlState';
import { MappingStatusBadge, RelationTag, ConceptName, ProposeMappingForm } from './CommunityParts';
import { GitCompareArrows, UserCheck } from 'lucide-react';

/** Communities > Shared Terms: one label, different meanings per group, side by side */
export default function SharedTermsView() {
  const data = useCommunityData();
  const shared = useMemo(() => findSharedTerms(data.concepts), [data.concepts]);
  // The selected label is in the URL so a refresh (or a shared link) returns to it
  const [selectedKey, setSelectedKey] = useState(() => readHash().get('label'));
  const select = (key) => { setSelectedKey(key); updateHash({ label: key }); };

  if (data.loading) return <div className="page-pad muted">Finding shared terms…</div>;
  if (data.error) return <div className="page-pad"><div className="connection-status error" role="alert">{data.error}</div></div>;

  const selected = shared.find(s => s.key === selectedKey) || shared[0];

  return (
    <div className="split-h" style={{ height: '100%' }}>
      <div className="panel-left split-panel shared-list">
        <div className="shared-list-head">
          <strong>{shared.length}</strong> labels used by more than one group
        </div>
        {shared.map(s => (
          <button key={s.key} className={`shared-item ${selected?.key === s.key ? 'active' : ''}`} onClick={() => select(s.key)}>
            <span>{s.label}</span>
            <span className="badge-count" title="Groups using this label">{s.schemes.length}</span>
          </button>
        ))}
      </div>

      <div className="panel-center split-panel" style={{ padding: 24 }}>
        {!selected ? (
          <div className="empty-state" style={{ height: '100%' }}>
            <GitCompareArrows size={48} />
            <h3>No shared terms</h3>
            <p>No label is used by concepts in two or more groups (SKOS concept schemes) in this database.</p>
          </div>
        ) : (
          <SharedTermDetail key={selected.key} term={selected} data={data} />
        )}
      </div>
    </div>
  );
}

function SharedTermDetail({ term, data }) {
  const uris = new Set(term.concepts.map(c => c.uri));
  const between = data.mappings.filter(m => uris.has(m.source) && uris.has(m.target));

  return (
    <div className="fade-in">
      <h2 className="page-title"><GitCompareArrows size={22} color="var(--accent)" /> “{term.label}”</h2>
      <p className="page-subtitle">
        Used by {term.schemes.length} groups with different meanings. Mappings record how the meanings relate without merging them.
      </p>

      <div className="compare-grid">
        {term.concepts.map(c => {
          const owner = data.ownerOf(c.scheme);
          return (
            <div key={`${c.uri}|${c.scheme}`} className="card compare-card">
              <div className="compare-group">{data.schemeLabel(c.scheme)}</div>
              <div className="compare-owner">
                <UserCheck size={12} /> {owner ? owner.name : <span className="muted">No owner</span>}
              </div>
              <div className="compare-label">{c.prefLabel}</div>
              {c.altLabels.length > 0 && <div className="muted" style={{ fontSize: '0.78rem' }}>Also: {c.altLabels.join(', ')}</div>}
              <p className="compare-def">{c.definition || <span className="muted">No definition</span>}</p>
              <div className="mono-muted">{toPrefixed(c.uri)}</div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><span className="card-title">Mappings between these terms</span></div>
        {between.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.85rem' }}>None yet. Propose one below.</p>
        ) : (
          <div className="mapping-rows">
            {between.map((m, i) => (
              <div key={i} className="mapping-row">
                <ConceptName uri={m.source} data={data} />
                <RelationTag iri={m.relation} />
                <ConceptName uri={m.target} data={data} />
                <MappingStatusBadge status={m.status} />
                {m.proposal?.description && <div className="mapping-why">“{m.proposal.description}”</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <ProposeMappingForm concepts={term.concepts} data={data} draftKey={term.key} onProposed={data.reload} />
    </div>
  );
}
