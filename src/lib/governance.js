/**
 * Governance CRUD operations — persisted to Stardog via VOCAB:GOVERNANCE named graph.
 *
 * All values are written with sparqlString/sparqlIri (never raw interpolation), and each
 * change is sent together with its audit entry in ONE update request, so Stardog commits
 * both or neither.
 */
import { updateSparql, querySparql, getBindings, val, sparqlString as str, sparqlIri as iri } from './sparql';

const GOV_GRAPH = 'VOCAB:GOVERNANCE';
const GOV_NS = 'http://vocab.gov/ontology#';
const G = `<${GOV_GRAPH}>`;
const RDFS_LABEL = '<http://www.w3.org/2000/01/rdf-schema#label>';

export const STATUSES = ['Draft', 'UnderReview', 'Active', 'Deprecated', 'Retired'];
const PROPOSAL_TYPES = ['add', 'modify', 'deprecate'];
const DECISIONS = ['approved', 'rejected'];

/** Governance-vocabulary predicate/class IRI */
const g = (local) => `<${GOV_NS}${local}>`;
const now = () => `${str(new Date().toISOString())}^^<http://www.w3.org/2001/XMLSchema#dateTime>`;

/** Collision-free id (time-sortable prefix + 128 random bits; works outside secure contexts too) */
function newId(kind) {
  const rand = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${GOV_NS}${kind}/${Date.now()}-${rand}`;
}

function requireOneOf(value, allowed, what) {
  if (!allowed.includes(value)) throw new Error(`Invalid ${what}: ${value}`);
}

/** Triples for one audit entry (no GRAPH wrapper). targetTerm and note are optional. */
function auditTriples(targetTerm, action, actor, note) {
  return `
    ${iri(newId('audit'))} a ${g('AuditEntry')} ;
      ${targetTerm ? `${g('targetTerm')} ${iri(targetTerm)} ;` : ''}
      ${note ? `${g('editorialNote')} ${str(note)} ;` : ''}
      ${g('auditAction')} ${str(action)} ;
      ${g('auditActor')} ${str(actor)} ;
      ${g('auditTimestamp')} ${now()} .`;
}

/** Fetch all governance statuses */
export async function fetchStatuses(endpoint, db, token) {
  const query = `
    SELECT ?term ?status WHERE {
      GRAPH ${G} {
        ?term ${g('hasStatus')} ?status .
      }
    }
  `;
  const res = await querySparql(endpoint, db, token, query);
  const map = {};
  for (const b of getBindings(res)) {
    map[val(b, 'term')] = val(b, 'status').replace(GOV_NS, '');
  }
  return map;
}

/** Set term status */
export async function setTermStatus(endpoint, db, token, termUri, status, actor) {
  requireOneOf(status, STATUSES, 'status');
  const t = iri(termUri);
  const update = `
    WITH ${G}
    DELETE { ${t} ${g('hasStatus')} ?old }
    INSERT { ${t} ${g('hasStatus')} ${g(status)} . }
    WHERE { OPTIONAL { ${t} ${g('hasStatus')} ?old } } ;
    INSERT DATA { GRAPH ${G} { ${auditTriples(termUri, `status_changed_to_${status}`, actor)} } }
  `;
  await updateSparql(endpoint, db, token, update);
}

/** Fetch all stewardship assignments */
export async function fetchStewards(endpoint, db, token) {
  const query = `
    SELECT ?term ?steward ?stewardName WHERE {
      GRAPH ${G} {
        ?term ${g('hasSteward')} ?steward .
        OPTIONAL { ?steward ${RDFS_LABEL} ?stewardName }
      }
    }
  `;
  const res = await querySparql(endpoint, db, token, query);
  const map = {};
  for (const b of getBindings(res)) {
    map[val(b, 'term')] = { uri: val(b, 'steward'), name: val(b, 'stewardName') || val(b, 'steward') };
  }
  return map;
}

/** Assign steward to a term */
export async function assignSteward(endpoint, db, token, termUri, stewardName, actor) {
  const t = iri(termUri);
  const s = iri(`${GOV_NS}steward/${encodeURIComponent(stewardName)}`);
  const update = `
    WITH ${G}
    DELETE { ${t} ${g('hasSteward')} ?old }
    INSERT {
      ${t} ${g('hasSteward')} ${s} .
      ${s} ${RDFS_LABEL} ${str(stewardName)} .
    }
    WHERE { OPTIONAL { ${t} ${g('hasSteward')} ?old } } ;
    INSERT DATA { GRAPH ${G} { ${auditTriples(termUri, 'steward_assigned', actor, `Assigned to ${stewardName}`)} } }
  `;
  await updateSparql(endpoint, db, token, update);
}

/** Add editorial note */
export async function addEditorialNote(endpoint, db, token, termUri, note, actor) {
  const update = `
    INSERT DATA {
      GRAPH ${G} {
        ${iri(newId('note'))} a ${g('EditorialNote')} ;
          ${g('targetTerm')} ${iri(termUri)} ;
          ${g('noteText')} ${str(note)} ;
          ${g('author')} ${str(actor)} ;
          ${g('createdDate')} ${now()} .
      }
    }
  `;
  await updateSparql(endpoint, db, token, update);
}

/** Fetch editorial notes for a term */
export async function fetchNotes(endpoint, db, token, termUri) {
  const query = `
    SELECT ?note ?text ?author ?date WHERE {
      GRAPH ${G} {
        ?note a ${g('EditorialNote')} ;
              ${g('targetTerm')} ${iri(termUri)} ;
              ${g('noteText')} ?text ;
              ${g('author')} ?author ;
              ${g('createdDate')} ?date .
      }
    }
    ORDER BY DESC(?date)
  `;
  const res = await querySparql(endpoint, db, token, query);
  return getBindings(res).map(b => ({
    id: val(b, 'note'), text: val(b, 'text'),
    author: val(b, 'author'), date: val(b, 'date'),
  }));
}

/** Create a change proposal (and its audit entry, atomically). termUri is optional for "add" proposals. */
export async function createProposal(endpoint, db, token, proposal) {
  const { termUri, type, title, description, proposedBy, changes } = proposal;
  requireOneOf(type, PROPOSAL_TYPES, 'proposal type');
  if (type !== 'add' && !termUri) throw new Error('Select the term this proposal applies to.');
  const id = newId('proposal');
  const update = `
    INSERT DATA {
      GRAPH ${G} {
        ${iri(id)} a ${g('ChangeProposal')} ;
          ${termUri ? `${g('targetTerm')} ${iri(termUri)} ;` : ''}
          ${g('proposalType')} ${str(type)} ;
          ${g('proposalTitle')} ${str(title)} ;
          ${g('proposalDescription')} ${str(description)} ;
          ${g('proposedBy')} ${str(proposedBy)} ;
          ${g('proposedDate')} ${now()} ;
          ${g('proposalStatus')} "pending" ;
          ${g('proposedChanges')} ${str(JSON.stringify(changes || {}))} .
        ${auditTriples(termUri || id, 'proposal_created', proposedBy, title)}
      }
    }
  `;
  await updateSparql(endpoint, db, token, update);
  return id;
}

/** Fetch all proposals */
export async function fetchProposals(endpoint, db, token) {
  const query = `
    SELECT ?id ?term ?type ?title ?desc ?by ?date ?status WHERE {
      GRAPH ${G} {
        ?id a ${g('ChangeProposal')} ;
            ${g('proposalType')} ?type ;
            ${g('proposalTitle')} ?title ;
            ${g('proposedBy')} ?by ;
            ${g('proposedDate')} ?date ;
            ${g('proposalStatus')} ?status .
        OPTIONAL { ?id ${g('targetTerm')} ?term }
        OPTIONAL { ?id ${g('proposalDescription')} ?desc }
      }
    }
    ORDER BY DESC(?date)
  `;
  const res = await querySparql(endpoint, db, token, query);
  return getBindings(res).map(b => ({
    id: val(b, 'id'), termUri: val(b, 'term'), type: val(b, 'type'),
    title: val(b, 'title'), description: val(b, 'desc'),
    proposedBy: val(b, 'by'), date: val(b, 'date'), status: val(b, 'status'),
  }));
}

/** Review a proposal (approve/reject), atomically with its audit entry */
export async function reviewProposal(endpoint, db, token, proposalId, decision, reviewer, comment) {
  requireOneOf(decision, DECISIONS, 'decision');
  const p = iri(proposalId);
  const update = `
    WITH ${G}
    DELETE { ${p} ${g('proposalStatus')} ?old }
    INSERT {
      ${p} ${g('proposalStatus')} ${str(decision)} ;
           ${g('reviewedBy')} ${str(reviewer)} ;
           ${g('reviewDate')} ${now()} ;
           ${g('reviewComment')} ${str(comment)} .
    }
    WHERE { ${p} ${g('proposalStatus')} ?old } ;
    INSERT DATA { GRAPH ${G} { ${auditTriples(proposalId, `proposal_${decision}`, reviewer, comment)} } }
  `;
  await updateSparql(endpoint, db, token, update);
}

/** Fetch audit log */
export async function fetchAuditLog(endpoint, db, token, termUri) {
  const termFilter = termUri ? `?entry ${g('targetTerm')} ${iri(termUri)} .` : '';
  const query = `
    SELECT ?entry ?term ?action ?actor ?timestamp ?note WHERE {
      GRAPH ${G} {
        ?entry a ${g('AuditEntry')} ;
               ${g('auditAction')} ?action ;
               ${g('auditActor')} ?actor ;
               ${g('auditTimestamp')} ?timestamp .
        OPTIONAL { ?entry ${g('targetTerm')} ?term }
        OPTIONAL { ?entry ${g('editorialNote')} ?note }
        ${termFilter}
      }
    }
    ORDER BY DESC(?timestamp)
    LIMIT 200
  `;
  const res = await querySparql(endpoint, db, token, query);
  return getBindings(res).map(b => ({
    id: val(b, 'entry'), termUri: val(b, 'term'), action: val(b, 'action'),
    actor: val(b, 'actor'), timestamp: val(b, 'timestamp'), note: val(b, 'note'),
  }));
}
