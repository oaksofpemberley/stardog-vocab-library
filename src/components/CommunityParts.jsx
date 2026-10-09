import { useState } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { createProposal } from '../lib/governance';
import { MAPPING_RELATIONS, relationLabel } from '../lib/communities';
import { useDraft } from '../lib/useDraft';
import { Send } from 'lucide-react';

const MAPPING_STATUS_CLASS = { approved: 'active', asserted: 'review', pending: 'draft', rejected: 'retired', retired: 'deprecated' };
const MAPPING_STATUS_TITLE = {
  approved: 'Approved through review; stored in VOCAB:MAPPINGS',
  asserted: 'Stated in a vocabulary\'s own data; not reviewed',
  pending: 'Proposed; waiting for review',
  rejected: 'Proposed and rejected in review',
  retired: 'Was approved, then removed through review; kept here as history',
};

export function MappingStatusBadge({ status }) {
  return (
    <span className={`status-badge status-${MAPPING_STATUS_CLASS[status] || 'draft'}`} title={MAPPING_STATUS_TITLE[status]}>
      {status}
    </span>
  );
}

export function RelationTag({ iri }) {
  return <span className="relation-tag">{relationLabel(iri)}</span>;
}

/** "label · Group" for a concept */
export function ConceptName({ uri, data }) {
  const c = data.conceptByUri.get(uri);
  return (
    <span>
      <strong>{data.conceptLabel(uri)}</strong>
      <span style={{ color: 'var(--text-muted)' }}> · {data.schemeLabel(c?.scheme)}</span>
    </span>
  );
}

/**
 * Propose a mapping between two of the given concepts. The proposal goes to the Review Queue;
 * nothing is written to the vocabularies until it is approved. Unsent input is kept as a draft.
 */
export function ProposeMappingForm({ concepts, data, draftKey, onProposed }) {
  const { endpoint, db, token, connection } = useStardog();
  const initial = { source: concepts[0]?.uri || '', target: concepts[1]?.uri || '', relation: MAPPING_RELATIONS[1].iri, justification: '' };
  const [form, setForm] = useDraft(`${db}:mapping:${draftKey}`, initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const help = MAPPING_RELATIONS.find(r => r.iri === form.relation)?.help;

  const submit = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const title = `${data.conceptLabel(form.source)} (${data.schemeLabel(data.conceptByUri.get(form.source)?.scheme)}) ` +
        `${relationLabel(form.relation)} ${data.conceptLabel(form.target)} (${data.schemeLabel(data.conceptByUri.get(form.target)?.scheme)})`;
      await createProposal(endpoint, db, token, {
        type: 'mapping', title, description: form.justification,
        proposedBy: connection.username || 'anonymous',
        mappingSource: form.source, mappingRelation: form.relation, mappingTarget: form.target,
      });
      setForm(initial);
      setMessage({ ok: true, text: 'Proposed. It appears in the Review Queue and becomes a mapping once approved.' });
      onProposed?.();
    } catch (e) {
      setMessage({ ok: false, text: `Not saved: ${e.message}` });
    } finally {
      setSaving(false);
    }
  };

  const option = (c) => (
    <option key={c.uri} value={c.uri}>{c.prefLabel || data.conceptLabel(c.uri)} — {data.schemeLabel(c.scheme)}</option>
  );

  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Propose a mapping</span></div>
      <div className="mapping-form">
        <div className="form-group">
          <label className="form-label">Source term</label>
          <select className="select" value={form.source} onChange={set('source')}>{concepts.map(option)}</select>
        </div>
        <div className="form-group">
          <label className="form-label">Relation</label>
          <select className="select" value={form.relation} onChange={set('relation')}>
            {MAPPING_RELATIONS.map(r => <option key={r.iri} value={r.iri}>{r.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Target term</label>
          <select className="select" value={form.target} onChange={set('target')}>{concepts.map(option)}</select>
        </div>
      </div>
      <p className="form-help">{help}</p>
      <div className="form-group">
        <label className="form-label">Justification (required)</label>
        <textarea className="textarea" value={form.justification} onChange={set('justification')}
          placeholder="Why are these related, and where does the difference matter?" />
      </div>
      {message && <div className={`connection-status ${message.ok ? 'success' : 'error'}`} role="status" style={{ marginTop: 10 }}>{message.text}</div>}
      <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={submit}
        disabled={saving || !form.justification.trim() || form.source === form.target}>
        <Send size={14} /> Propose mapping
      </button>
    </div>
  );
}
