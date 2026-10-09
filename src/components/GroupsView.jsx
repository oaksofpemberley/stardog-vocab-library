import { useState } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { assignSteward } from '../lib/governance';
import { toPrefixed } from '../lib/sparql';
import { useCommunityData } from '../lib/useCommunityData';
import { useDraft } from '../lib/useDraft';
import { Users, UserCheck, ChevronDown, ChevronRight } from 'lucide-react';

/** Communities > Groups: each SKOS concept scheme as a group with an owner and its concepts */
export default function GroupsView() {
  const data = useCommunityData();
  const { schemes, concepts, mappings, loading, error } = data;

  if (loading) return <div className="page-pad muted">Loading groups…</div>;
  if (error) return <div className="page-pad"><div className="connection-status error" role="alert">{error}</div></div>;

  const conceptsOf = (scheme) => concepts.filter(c => c.scheme === scheme).sort((a, b) => a.prefLabel.localeCompare(b.prefLabel));
  const mappingCount = (scheme) => {
    const inScheme = new Set(conceptsOf(scheme).map(c => c.uri));
    return mappings.filter(m => inScheme.has(m.source) || inScheme.has(m.target)).length;
  };

  return (
    <div className="page-pad" style={{ maxWidth: 1100 }}>
      <h2 className="page-title"><Users size={22} color="var(--accent)" /> Groups</h2>
      <p className="page-subtitle">
        Each group keeps its own vocabulary (a SKOS concept scheme). Owners are assigned through governance and recorded in the audit log.
      </p>

      {schemes.length === 0 ? (
        <div className="empty-state">
          <Users size={48} />
          <h3>No groups in this database</h3>
          <p>Groups are SKOS concept schemes (<code>skos:ConceptScheme</code>) with concepts linked by <code>skos:inScheme</code>. Load <code>samples/multi-community-vocabulary.trig</code> to try it.</p>
        </div>
      ) : (
        <div className="group-grid">
          {schemes.map(s => (
            <GroupCard key={s.uri} scheme={s} data={data} concepts={conceptsOf(s.uri)} mappingCount={mappingCount(s.uri)} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({ scheme, data, concepts, mappingCount }) {
  const { endpoint, db, token, connection, refreshGovernance } = useStardog();
  const [ownerInput, setOwnerInput] = useDraft(`${db}:owner:${scheme.uri}`, '');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const owner = data.ownerOf(scheme.uri);

  const assignOwner = async () => {
    if (!ownerInput.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await assignSteward(endpoint, db, token, scheme.uri, ownerInput.trim(), connection.username || 'anonymous');
      await refreshGovernance();
      setOwnerInput('');
    } catch (e) {
      setSaveError(`Not saved: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card group-card">
      <div className="group-card-title">{scheme.label || toPrefixed(scheme.uri)}</div>
      <div className="mono-muted">{toPrefixed(scheme.uri)}</div>
      {scheme.definition && <p className="group-card-desc">{scheme.definition}</p>}

      <div className="group-stats">
        <span><strong>{concepts.length}</strong> concepts</span>
        <span><strong>{mappingCount}</strong> mappings</span>
      </div>

      <div className="group-owner">
        <UserCheck size={14} />
        {owner ? (
          <span>
            Owner: <strong>{owner.name}</strong>
            {!owner.governed && <span className="muted"> (declared in data)</span>}
          </span>
        ) : <span className="muted">No owner assigned</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" placeholder={owner ? 'Change owner' : 'Assign owner (name or team)'} value={ownerInput}
          onChange={e => setOwnerInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && assignOwner()} />
        <button className="btn btn-secondary btn-sm" onClick={assignOwner} disabled={saving || !ownerInput.trim()}>Assign</button>
      </div>
      {saveError && <div className="connection-status error" role="alert" style={{ marginTop: 8 }}>{saveError}</div>}

      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {expanded ? 'Hide' : 'Show'} concepts
      </button>
      {expanded && (
        <dl className="concept-list">
          {concepts.map(c => (
            <div key={c.uri}>
              <dt>{c.prefLabel || toPrefixed(c.uri)}{c.altLabels.length > 0 && <span className="muted"> ({c.altLabels.join(', ')})</span>}</dt>
              <dd>{c.definition || <span className="muted">No definition</span>}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
