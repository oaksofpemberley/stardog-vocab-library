/**
 * New terms for a group: suggested IRIs, parsing pasted/uploaded rows, and checking a batch
 * before it is proposed (docs/communities-and-mappings.md, R7 and R8). Pure functions.
 */
import { getNamespace, sparqlIri } from './sparql.js';
import { normalizeLabel } from './communities.js';

export const MAX_BATCH = 500;

/** Suggested IRI for a new term: the group's namespace + the label in PascalCase */
export function suggestIri(schemeUri, label) {
  if (!schemeUri || !label) return '';
  const local = label.trim().split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('');
  return local ? getNamespace(schemeUri) + local : '';
}

/** Split delimited text into rows of cells. Quoted fields may hold the delimiter, "" and line breaks (RFC 4180). */
function splitRows(text, delimiter) {
  const rows = [];
  let row = [], cell = '', quoted = false, line = 1, rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === '\n') line++; cell += ch; }
    } else if (ch === '"' && cell.trim() === '') { cell = ''; quoted = true; }
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push({ line: rowLine, cells: row });
      row = []; cell = ''; line++; rowLine = line;
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push({ line: rowLine, cells: row }); }
  return rows.filter(r => r.cells.some(c => c.trim() !== ''));
}

const HEADER_NAMES = {
  label: ['label', 'preflabel', 'term', 'name'],
  definition: ['definition', 'description', 'comment'],
  iri: ['iri', 'uri', 'id'],
};

/**
 * Rows of new terms from pasted text or a .csv/.tsv/.txt file: columns label, definition, iri.
 * A header row (any order) is recognised; without one the columns are taken in that order.
 * Tab-separated if the first line has a tab, otherwise comma-separated.
 * @returns {{line: number, label: string, definition: string, iri: string}[]}
 */
export function parseTermTable(text) {
  const src = String(text || '');
  const firstLine = src.split(/\r?\n/).find(l => l.trim() !== '') || '';
  const rows = splitRows(src, firstLine.includes('\t') ? '\t' : ',');
  if (rows.length === 0) return [];
  let columns = { label: 0, definition: 1, iri: 2 };
  const head = rows[0].cells.map(c => c.trim().toLowerCase());
  if (head.some(h => HEADER_NAMES.label.includes(h))) {
    columns = Object.fromEntries(Object.entries(HEADER_NAMES).map(([k, names]) => [k, head.findIndex(h => names.includes(h))]));
    rows.shift();
  }
  const cell = (r, k) => (columns[k] >= 0 ? (r.cells[columns[k]] || '').trim() : '');
  return rows.map(r => ({ line: r.line, label: cell(r, 'label'), definition: cell(r, 'definition'), iri: cell(r, 'iri') }));
}

/**
 * Check new terms for one group before they are proposed. Each row gets its IRI (given or
 * suggested) and a status:
 *   'new'    nothing else in the database uses this label
 *   'shared' other groups use the same label (allowed: groups may mean different things by it)
 *   'error'  not sent; message says why
 * @param rows        from parseTermTable (or one row from a form)
 * @param scheme      the group's concept scheme IRI
 * @param concepts    [{uri, scheme, prefLabel, altLabels}] in the database
 * @param existing    Map IRI → label of every term in the database (classes, concepts, properties)
 * @param pendingIris Set of IRIs that pending "Add term" proposals would create
 */
export function planNewTerms(rows, { scheme, concepts = [], existing = new Map(), pendingIris = new Set() }) {
  const byLabel = new Map();
  for (const c of concepts) {
    for (const l of new Set([c.prefLabel, ...(c.altLabels || [])].map(normalizeLabel).filter(Boolean))) {
      if (!byLabel.has(l)) byLabel.set(l, []);
      byLabel.get(l).push(c);
    }
  }
  const seenIri = new Map(), seenLabel = new Map();
  return rows.map(row => {
    const label = row.label.trim();
    const iri = (row.iri || '').trim() || suggestIri(scheme, label);
    const out = { ...row, label, iri, status: 'new', message: '', sharedWith: [] };
    const fail = (message) => ({ ...out, status: 'error', message });
    if (!label) return fail('No label');
    try { sparqlIri(iri); } catch { return fail(`Invalid IRI: ${iri || '(empty)'}`); }
    if (existing.has(iri)) return fail(`IRI already used by "${existing.get(iri) || iri}"`);
    if (pendingIris.has(iri)) return fail('An "Add term" proposal for this IRI is already pending');
    const key = normalizeLabel(label);
    const inGroup = (byLabel.get(key) || []).find(c => c.scheme === scheme);
    if (inGroup) return fail(`Already in this group as "${inGroup.prefLabel}"`);
    if (seenIri.has(iri)) return fail(`Same IRI as line ${seenIri.get(iri)}`);
    if (seenLabel.has(key)) return fail(`Same label as line ${seenLabel.get(key)}`);
    seenIri.set(iri, row.line);
    seenLabel.set(key, row.line);
    const others = [...new Set((byLabel.get(key) || []).map(c => c.scheme).filter(s => s && s !== scheme))];
    return others.length ? { ...out, status: 'shared', sharedWith: others } : out;
  });
}
