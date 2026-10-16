import { toPrefixed } from '../lib/sparql';
import { linksOf, relationLabel, inverseRelation } from '../lib/communities';

const STATUS_BADGE = { approved: 'active', asserted: 'review', pending: 'draft' };

/**
 * R9: the vocabulary terms (from any group) mapped to this term, read from their side
 * ("model — Systems Engineering · close match · pending"). For a SKOS concept, also its links
 * to ontology classes. compact = the Designer's side panel.
 */
export default function TermReferences({ uri, community, labelOf = toPrefixed, compact = false }) {
  if (community.loading) return null;
  const links = linksOf(uri, community.mappings);
  const isConcept = community.conceptByUri.has(uri);
  const terms = links.filter(l => community.conceptByUri.has(l.uri));
  const ontology = isConcept ? links.filter(l => !community.conceptByUri.has(l.uri)) : [];
  const groupCount = new Set(terms.map(l => community.conceptByUri.get(l.uri)?.scheme)).size;

  // A group's term: "model — Systems Engineering   close match   pending" (the term's relation to this one)
  const termRow = (l) => {
    const c = community.conceptByUri.get(l.uri);
    return (
      <li key={`${l.uri}|${l.relation}|${l.status}`} className="ref-row">
        <span className="ref-term">
          <strong>{c?.prefLabel || toPrefixed(l.uri)}</strong>
          {c?.scheme && <span className="muted"> — {community.schemeLabel(c.scheme)}</span>}
        </span>
        <span className="ref-relation">{relationLabel(l.relation)}</span>
        <span className={`status-badge status-${STATUS_BADGE[l.status]}`}>{l.status}</span>
      </li>
    );
  };
  // An ontology link, read from this concept's side: "close match   Model (dt:Model)   approved"
  const ontologyRow = (l) => (
    <li key={`${l.uri}|${l.relation}|${l.status}`} className="ref-row">
      <span className="ref-relation">{relationLabel(inverseRelation(l.relation))}</span>
      <span className="ref-term"><strong>{labelOf(l.uri)}</strong> <span className="mono-muted">{toPrefixed(l.uri)}</span></span>
      <span className={`status-badge status-${STATUS_BADGE[l.status]}`}>{l.status}</span>
    </li>
  );

  if (compact) {
    return (
      <div className="designer-detail-section">
        <div className="designer-detail-section-title">Vocabulary terms that reference this ({terms.length})</div>
        {terms.length === 0 ? <div className="muted" style={{ fontSize: '0.78rem' }}>None yet</div> : <ul className="ref-list">{terms.map(termRow)}</ul>}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {isConcept && (
        <>
          <div className="card-header"><span className="card-title">Linked to the ontology</span></div>
          {ontology.length === 0
            ? <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 12px' }}>Not linked yet. Use "Link to ontology" to propose a link to an ontology class.</p>
            : <ul className="ref-list" style={{ marginBottom: 12 }}>{ontology.map(ontologyRow)}</ul>}
        </>
      )}
      <div className="card-header">
        <span className="card-title">Vocabulary terms that reference this</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{terms.length} from {groupCount} group{groupCount === 1 ? '' : 's'}</span>
      </div>
      {terms.length === 0
        ? <p className="muted" style={{ fontSize: '0.82rem', margin: 0 }}>No group's term is mapped to this yet.</p>
        : <ul className="ref-list">{terms.map(termRow)}</ul>}
    </div>
  );
}
