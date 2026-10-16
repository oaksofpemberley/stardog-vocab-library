import { useState } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { createProposals } from '../lib/governance';
import { toPrefixed } from '../lib/sparql';
import { parseTermTable, planNewTerms, MAX_BATCH } from '../lib/terms';
import { useDraft } from '../lib/useDraft';
import { Upload } from 'lucide-react';

const STATUS_TEXT = { new: 'new', shared: 'also used by', error: 'not sent' };

/**
 * Bulk add terms to one group (R8): paste rows or open a CSV/TSV file, preview every row,
 * then propose all valid rows in one request. Nothing changes until a reviewer approves.
 */
export default function BulkAddTerms({ scheme, community, onClose, onCreated }) {
  const { endpoint, db, token, connection, classes, properties } = useStardog();
  const [draft, setDraft, clearDraft] = useDraft(`${db}:bulk-add:${scheme}`, { text: '', note: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const rows = parseTermTable(draft.text);
  const plan = planNewTerms(rows, {
    scheme, concepts: community.concepts,
    existing: new Map([...classes, ...properties].map(t => [t.uri, t.label || toPrefixed(t.uri)])),
    pendingIris: new Set(community.proposals.filter(p => p.type === 'add' && p.status === 'pending').map(p => p.proposedIri)),
  });
  const valid = plan.filter(r => r.status !== 'error');
  const tooMany = valid.length > MAX_BATCH;

  const openFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setDraft(d => ({ ...d, text }));
    e.target.value = '';
  };

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await createProposals(endpoint, db, token, valid.map(r => ({
        type: 'add', title: `Add "${r.label}"`, description: draft.note.trim(),
        proposedBy: connection.username || 'anonymous',
        proposedScheme: scheme, proposedIri: r.iri, proposedLabel: r.label, proposedDefinition: r.definition,
      })));
      clearDraft();
      onClose();
      await onCreated?.();
    } catch (e) {
      setError(`Not saved: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide fade-in" onClick={e => e.stopPropagation()} role="dialog" aria-label="Bulk add terms">
        <div className="modal-title">Bulk add terms to {community.schemeLabel(scheme)}</div>
        <div className="modal-subtitle">
          One term per line: <code>label, definition, iri</code> (comma- or tab-separated; a header row in any order is fine; definition and IRI are optional).
          Each term becomes an "Add term" proposal; nothing changes until a reviewer approves.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea className="textarea mono" rows={7} value={draft.text} aria-label="Terms to add"
            onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
            placeholder={'label,definition\ntest article,"The item being tested, as delivered"\nfixture,Holds the unit under test in place'} />
          <label className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
            <Upload size={13} /> Open CSV / TSV file
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={openFile} hidden />
          </label>

          {plan.length > 0 && (
            <>
              <div className="form-help" style={{ margin: 0 }} aria-live="polite">
                {plan.length} rows: <strong>{valid.length}</strong> will be proposed
                {plan.length - valid.length > 0 && <>, <strong>{plan.length - valid.length}</strong> not sent</>}
                {plan.some(r => r.status === 'shared') && <> · terms marked "also used by" are fine: each group keeps its own meaning, and you can map them later</>}
              </div>
              <div className="table-wrap bulk-preview">
                <table className="table">
                  <thead><tr><th>Line</th><th>Label</th><th>Definition</th><th>IRI</th><th>Check</th></tr></thead>
                  <tbody>
                    {plan.map(r => (
                      <tr key={r.line} className={r.status === 'error' ? 'row-error' : undefined}>
                        <td className="muted">{r.line}</td>
                        <td><strong>{r.label || '—'}</strong></td>
                        <td style={{ fontSize: '0.78rem' }}>{r.definition || <span className="muted">—</span>}</td>
                        <td className="mono-muted" style={{ wordBreak: 'break-all' }}>{r.iri ? toPrefixed(r.iri) : '—'}</td>
                        <td style={{ fontSize: '0.78rem' }}>
                          <span className={`status-badge status-${r.status === 'error' ? 'deprecated' : r.status === 'shared' ? 'review' : 'active'}`}>{STATUS_TEXT[r.status]}</span>
                          {r.status === 'shared' && <span> {r.sharedWith.map(community.schemeLabel).join(', ')}</span>}
                          {r.message && <div>{r.message}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Note for reviewers <span className="muted">(optional)</span></label>
            <input className="input" value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
              placeholder="Where these terms come from, or why they are needed" />
          </div>
        </div>

        {tooMany && <div className="connection-status error" role="alert" style={{ marginTop: 12 }}>At most {MAX_BATCH} terms at a time. Split the list.</div>}
        {error && <div className="connection-status error" role="alert" style={{ marginTop: 12 }}>⚠️ {error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || valid.length === 0 || tooMany}>
            Propose {valid.length} term{valid.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
