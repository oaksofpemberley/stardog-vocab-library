import { useState, useEffect } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { assignSteward, setRequireOwnerApproval } from '../lib/governance';
import { toPrefixed, listUsers } from '../lib/sparql';
import { linksOf, relationLabel, inverseRelation } from '../lib/communities';
import { useCommunityData } from '../lib/useCommunityData';
import { useDraft } from '../lib/useDraft';
import ProposalModal from './ProposalModal';
import BulkAddTerms from './BulkAddTerms';
import { Users, UserCheck, ChevronDown, ChevronRight, ShieldCheck, Plus, Layers, Pencil, Link2 } from 'lucide-react';

/**
 * The proposal forms a group or term opens (R7–R9), pre-filled. Each keeps its own draft.
 * modal: { kind: 'add' | 'bulk', scheme } or { kind: 'edit' | 'link', concept }
 */
export function TermModals({ modal, community, onClose, onCreated }) {
  const { db } = useStardog();
  if (!modal) return null;
  const c = modal.concept;
  if (modal.kind === 'bulk') return <BulkAddTerms scheme={modal.scheme} community={community} onClose={onClose} onCreated={onCreated} />;
  if (modal.kind === 'add') {
    return <ProposalModal community={community} draftKey={`${db}:proposal:add:${modal.scheme}`} fixedType heading="Add term"
      initial={{ type: 'add', scheme: modal.scheme }} onClose={onClose} onCreated={onCreated} />;
  }
  if (modal.kind === 'edit') {
    return <ProposalModal community={community} draftKey={`${db}:proposal:edit:${c.uri}`} fixedType heading="Edit term"
      initial={{ type: 'modify', termUri: c.uri, label: c.prefLabel || '', definition: c.definition || '', origLabel: c.prefLabel || '', origDefinition: c.definition || '' }}
      onClose={onClose} onCreated={onCreated} />;
  }
  return <ProposalModal community={community} draftKey={`${db}:proposal:link:${c.uri}`} fixedType ontologyTargets heading="Link to ontology"
    initial={{ type: 'mapping', source: c.uri }} onClose={onClose} onCreated={onCreated} />;
}

/** Communities > Groups: each SKOS concept scheme as a group with an owner and its concepts */
export default function GroupsView() {
  const { endpoint, db, token, connection, identity, getTermSteward } = useStardog();
  const data = useCommunityData();
  const { schemes, concepts, mappings, loading, error, settings } = data;
  // Stardog accounts to suggest as owners (often just the user's own: most accounts may only list themselves)
  const [accounts, setAccounts] = useState(null);
  const [settingError, setSettingError] = useState(null);
  const [modal, setModal] = useState(null);
  useEffect(() => { listUsers(endpoint, token).then(setAccounts); }, [endpoint, token]);

  if (loading) return <div className="page-pad muted">Loading groups…</div>;
  if (error) return <div className="page-pad"><div className="connection-status error" role="alert">{error}</div></div>;

  const conceptsOf = (scheme) => concepts.filter(c => c.scheme === scheme).sort((a, b) => a.prefLabel.localeCompare(b.prefLabel));
  const mappingCount = (scheme) => {
    const inScheme = new Set(conceptsOf(scheme).map(c => c.uri));
    return mappings.filter(m => inScheme.has(m.source) || inScheme.has(m.target)).length;
  };

  // With owner approval on, only an account owner may switch it off (otherwise anyone could bypass it)
  const ownerAccounts = new Set(schemes.map(s => getTermSteward(s.uri)?.account).filter(Boolean));
  const canTurnOff = !settings.requireOwnerApproval || ownerAccounts.size === 0 || ownerAccounts.has(identity?.account);

  const toggleOwnerApproval = async (enabled) => {
    setSettingError(null);
    try {
      await setRequireOwnerApproval(endpoint, db, token, enabled, connection.username || 'anonymous');
      await data.reload();
    } catch (e) {
      setSettingError(`Not saved: ${e.message}`);
    }
  };

  return (
    <div className="page-pad" style={{ maxWidth: 1100 }}>
      <h2 className="page-title"><Users size={22} color="var(--accent)" /> Groups</h2>
      <p className="page-subtitle">
        Each group keeps its own vocabulary (a SKOS concept scheme). Owners are assigned through governance and recorded in the audit log.
      </p>

      {schemes.length > 0 && (
        <label className="card setting-row">
          <input type="checkbox" checked={settings.requireOwnerApproval} onChange={e => toggleOwnerApproval(e.target.checked)}
            disabled={!canTurnOff} title={canTurnOff ? undefined : 'Only a group owner (Stardog account) can turn this off'} />
          <span>
            <strong><ShieldCheck size={14} style={{ verticalAlign: '-2px' }} /> Require group owners to approve changes to their group</strong>
            <span className="form-help" style={{ display: 'block', margin: '4px 0 0' }}>
              Applies to groups whose owner is a Stardog account. A change to such a group must be approved by that account,
              and a mapping between two of them by both owners. The rule is enforced by this app; Stardog permissions still decide who can write to the database.
            </span>
            {!canTurnOff && <span className="form-help" style={{ display: 'block', margin: '4px 0 0' }}>Only a group owner signed in with their Stardog account can turn this off.</span>}
            {settingError && <span className="connection-status error" role="alert" style={{ display: 'block', marginTop: 8 }}>{settingError}</span>}
          </span>
        </label>
      )}

      {schemes.length === 0 ? (
        <div className="empty-state">
          <Users size={48} />
          <h3>No groups in this database</h3>
          <p>Groups are SKOS concept schemes (<code>skos:ConceptScheme</code>) with concepts linked by <code>skos:inScheme</code>. Load <code>samples/multi-community-vocabulary.trig</code> to try it.</p>
        </div>
      ) : (
        <div className="group-grid">
          {schemes.map(s => (
            <GroupCard key={s.uri} scheme={s} data={data} accounts={accounts} ownerApprovalOn={settings.requireOwnerApproval}
              concepts={conceptsOf(s.uri)} mappingCount={mappingCount(s.uri)} onOpen={setModal} />
          ))}
        </div>
      )}
      <TermModals modal={modal} community={data} onClose={() => setModal(null)} onCreated={data.reload} />
    </div>
  );
}

function GroupCard({ scheme, data, accounts, ownerApprovalOn, concepts, mappingCount, onOpen }) {
  const { endpoint, db, token, connection, refreshGovernance, identity, classes } = useStardog();
  const classLabel = (uri) => classes.find(c => c.uri === uri)?.label || toPrefixed(uri);
  // Owner input: a Stardog account (can be required to approve) or just a name
  const [draft, setDraft] = useDraft(`${db}:owner-v2:${scheme.uri}`, { kind: 'account', value: '' });
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const owner = data.ownerOf(scheme.uri);
  const set = (patch) => setDraft(d => ({ ...d, ...patch }));
  // With owner approval on, an account-owned group can only be handed over by its current owner
  const canChangeOwner = !ownerApprovalOn || !owner?.account || owner.account === identity?.account;

  const assignOwner = async () => {
    const value = draft.value.trim();
    if (!value) return;
    setSaving(true);
    setSaveError(null);
    try {
      await assignSteward(endpoint, db, token, scheme.uri, value, connection.username || 'anonymous',
        draft.kind === 'account' ? { account: value } : {});
      await refreshGovernance();
      setDraft({ kind: draft.kind, value: '' });
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
            {owner.account && <span className="owner-account-tag" title="Can be required to approve changes to this group">Stardog account</span>}
            {!owner.governed && <span className="muted"> (declared in data)</span>}
          </span>
        ) : <span className="muted">No owner assigned</span>}
      </div>
      {!canChangeOwner ? (
        <p className="form-help" style={{ margin: 0 }}>Only {owner.account} can hand this group to a new owner while owner approval is on.</p>
      ) : (
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="select" style={{ width: 'auto' }} value={draft.kind} onChange={e => set({ kind: e.target.value, value: '' })}
          aria-label="Owner type">
          <option value="account">Stardog account</option>
          <option value="name">Name</option>
        </select>
        {/* Typed, with suggestions: most accounts may only list themselves, so a closed list would hide everyone else */}
        <input className="input" value={draft.value} onChange={e => set({ value: e.target.value })}
          placeholder={draft.kind === 'account' ? 'Stardog username' : 'Name or team'}
          list={draft.kind === 'account' && accounts ? `accounts-${scheme.uri}` : undefined}
          aria-label={draft.kind === 'account' ? 'Stardog account' : 'Owner name'}
          onKeyDown={e => e.key === 'Enter' && assignOwner()} />
        {draft.kind === 'account' && accounts && (
          <datalist id={`accounts-${scheme.uri}`}>{accounts.map(a => <option key={a} value={a} />)}</datalist>
        )}
        <button className="btn btn-secondary btn-sm" onClick={assignOwner} disabled={saving || !draft.value.trim()}>Assign</button>
      </div>
      )}
      {saveError && <div className="connection-status error" role="alert" style={{ marginTop: 8 }}>{saveError}</div>}

      <div className="group-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => onOpen({ kind: 'add', scheme: scheme.uri })}><Plus size={13} /> Add term</button>
        <button className="btn btn-secondary btn-sm" onClick={() => onOpen({ kind: 'bulk', scheme: scheme.uri })}><Layers size={13} /> Bulk add</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {expanded ? 'Hide' : 'Show'} terms
        </button>
      </div>
      {expanded && (
        <dl className="concept-list">
          {concepts.map(c => {
            // Links to ontology classes (anything mapped that is not a group's term), read from this term's side
            const links = linksOf(c.uri, data.mappings).filter(l => !data.conceptByUri.has(l.uri));
            return (
              <div key={c.uri} className="concept-item">
                <dt>
                  <span>{c.prefLabel || toPrefixed(c.uri)}{c.altLabels.length > 0 && <span className="muted"> ({c.altLabels.join(', ')})</span>}</span>
                  <span className="concept-actions">
                    <button className="btn btn-ghost btn-xs" onClick={() => onOpen({ kind: 'edit', concept: c })} aria-label={`Edit ${c.prefLabel}`}><Pencil size={12} /> Edit</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => onOpen({ kind: 'link', concept: c })} aria-label={`Link ${c.prefLabel} to ontology`}><Link2 size={12} /> Link to ontology</button>
                  </span>
                </dt>
                <dd>{c.definition || <span className="muted">No definition</span>}</dd>
                <dd className="concept-links">
                  {links.length === 0 ? <span className="muted">Not linked to the ontology yet</span> : links.map(l => (
                    <span key={`${l.uri}|${l.relation}|${l.status}`} className={`link-chip link-${l.status}`} title={l.uri}>
                      {relationLabel(inverseRelation(l.relation))} → {classLabel(l.uri)}{l.status === 'pending' && ' (pending)'}
                    </span>
                  ))}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
