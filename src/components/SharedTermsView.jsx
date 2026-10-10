import { useState, useMemo } from 'react';
import { toPrefixed } from '../lib/sparql';
import { findSharedTerms, SIMILAR_LIMIT } from '../lib/communities';
import { useCommunityData } from '../lib/useCommunityData';
import { readHash, updateHash } from '../lib/urlState';
import { MappingStatusBadge, RelationTag, ConceptName, ProposeMappingForm } from './CommunityParts';
import { GitCompareArrows, UserCheck } from 'lucide-react';

/** Communities > Shared Terms: one label, different meanings per group, side by side */
export default function SharedTermsView() {
  const data = useCommunityData();
  const shared = useMemo(() => findSharedTerms(data.concepts), [data.concepts]);
  // Near matches ("rough order of magnitude" vs "orders of magnitude"), shown in the same side-by-side view
  const similar = useMemo(() => data.similar.map(p => ({
    key: p.key, kind: 'similar', score: p.score,
    label: `${p.labelA} ↔ ${p.labelB}`,
    concepts: [p.a, p.b], schemes: [p.a.scheme, p.b.scheme],
  })), [data.similar]);
  // The selected label is in the URL so a refresh (or a shared link) returns to it
  const [selectedKey, setSelectedKey] = useState(() => readHash().get('label'));
  const select = (key) => { setSelectedKey(key); updateHash({ label: key }); };

  if (data.loading) return <div className="page-pad muted">Finding shared terms…</div>;
  if (data.error) return <div className="page-pad"><div className="connection-status error" role="alert">{data.error}</div></div>;

  // A selected similar pair stays on screen after it is mapped (it then leaves the suggestions list)
  const pairFromKey = (key) => {
    if (!key?.startsWith('similar:')) return null;
    const [a, b] = key.slice('similar:'.length).split('|').map(u => data.conceptByUri.get(u));
    return a && b ? { key, kind: 'similar', score: null, label: `${a.prefLabel} ↔ ${b.prefLabel}`, concepts: [a, b], schemes: [a.scheme, b.scheme] } : null;
  };
  const selected = [...shared, ...similar].find(s => s.key === selectedKey) || pairFromKey(selectedKey) || shared[0] || similar[0];

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
        {similar.length > 0 && (
          <div className="shared-list-head" style={{ marginTop: 12 }}>
            {similar.length >= SIMILAR_LIMIT ? <>Top <strong>{SIMILAR_LIMIT}</strong></> : <strong>{similar.length}</strong>} similar wordings, not yet mapped
          </div>
        )}
        {similar.map(s => (
          <button key={s.key} className={`shared-item ${selected?.key === s.key ? 'active' : ''}`} onClick={() => select(s.key)}>
            <span>
              {s.label}
              <span className="shared-item-groups">{data.schemeLabel(s.schemes[0])} ↔ {data.schemeLabel(s.schemes[1])}</span>
            </span>
            <span className="badge-count" title="Share of words in common">{Math.round(s.score * 100)}%</span>
          </button>
        ))}
      </div>

      <div className="panel-center split-panel" style={{ padding: 24 }}>
        {!selected ? (
          <div className="empty-state" style={{ height: '100%' }}>
            <GitCompareArrows size={48} />
            <h3>No shared or similar terms</h3>
            <p>No label is used, or closely worded, by concepts in two or more groups (SKOS concept schemes) in this database.</p>
          </div>
        ) : (
          <SharedTermDetail key={selected.key} term={selected} data={data} />
        )}
      </div>
    </div>
  );
}

// A label used by very many terms (e.g. one common word in a 20,000-term vocabulary) would draw
// thousands of cards and form options (~30 s); side by side only makes sense for a handful.
const MAX_COMPARED = 12;

function SharedTermDetail({ term, data }) {
  const shown = term.concepts.slice(0, MAX_COMPARED);
  const notShown = term.concepts.length - shown.length;
  const uris = new Set(term.concepts.map(c => c.uri));
  const between = data.mappings.filter(m => uris.has(m.source) && uris.has(m.target));

  return (
    <div className="fade-in">
      <h2 className="page-title"><GitCompareArrows size={22} color="var(--accent)" /> “{term.label}”</h2>
      <p className="page-subtitle">
        {term.kind === 'similar'
          ? `Similar wording in two groups${term.score != null ? ` (${Math.round(term.score * 100)}% of words in common)` : ''}. Compare the definitions; if they are related, propose a mapping.`
          : `Used by ${term.schemes.length} groups with different meanings. Mappings record how the meanings relate without merging them.`}
      </p>

      {notShown > 0 && (
        <div className="list-cap-note" style={{ margin: '0 0 12px' }}>
          This label is used by {term.concepts.length.toLocaleString()} terms. Showing {MAX_COMPARED}; {notShown.toLocaleString()} more
          are not shown. A label this common is usually too generic to map as one meaning.
        </div>
      )}
      <div className="compare-grid">
        {shown.map(c => {
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
            {between.slice(0, 50).map((m, i) => (
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

      <ProposeMappingForm concepts={shown} data={data} draftKey={term.key} onProposed={data.reload} />
    </div>
  );
}
