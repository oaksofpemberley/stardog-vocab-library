/**
 * Governance CRUD operations — persisted to Stardog via VOCAB:GOVERNANCE named graph.
 *
 * All values are written with sparqlString/sparqlIri (never raw interpolation), and each
 * change is sent together with its audit entry in ONE update request, so Stardog commits
 * both or neither.
 */
import { updateSparql, querySparql, getBindings, val, sparqlString as str, sparqlIri as iri } from './sparql';
import { homeGraphQuery } from './ontologyQueries';
import { MAPPING_RELATION_IRIS, GOVERNED_MAPPINGS_GRAPH } from './communities';

const GOV_GRAPH = 'VOCAB:GOVERNANCE';
const GOV_NS = 'http://vocab.gov/ontology#';
const G = `<${GOV_GRAPH}>`;
const RDFS_LABEL = '<http://www.w3.org/2000/01/rdf-schema#label>';
const RDFS_COMMENT = '<http://www.w3.org/2000/01/rdf-schema#comment>';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const OWL_DEPRECATED = '<http://www.w3.org/2002/07/owl#deprecated>';

export const STATUSES = ['Draft', 'UnderReview', 'Active', 'Deprecated', 'Retired'];
export const PROPOSAL_TYPES = ['add', 'modify', 'deprecate', 'mapping', 'unmap'];
const DECISIONS = ['approved', 'rejected'];

/** Governance-vocabulary predicate/class IRI */
const g = (local) => `<${GOV_NS}${local}>`;
const now = () => `${str(new Date().toISOString())}^^<http://www.w3.org/2001/XMLSchema#dateTime>`;

/** Collision-free id (time-sortable prefix + 128 random bits; works outside secure contexts too) */
function newId(kind) {
  const rand = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${GOV_NS}${kind}/${Date.now()}-${rand}`;
}

/**
 * The Stardog account the app is signed in as (Stardog confirms it at sign-in, see fetchIdentity),
 * recorded on every audit entry, proposal and review next to the self-reported name. Set by
 * StardogContext. The stored value is written by the client, so it is a record, not proof.
 */
let actingAccount = null;
export function setActingAccount(account) { actingAccount = account || null; }

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
      ${actingAccount ? `${g('auditAccount')} ${str(actingAccount)} ;` : ''}
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
    SELECT ?term ?steward ?stewardName ?account WHERE {
      GRAPH ${G} {
        ?term ${g('hasSteward')} ?steward .
        OPTIONAL { ?steward ${RDFS_LABEL} ?stewardName }
        OPTIONAL { ?steward ${g('stardogAccount')} ?account }
      }
    }
  `;
  const res = await querySparql(endpoint, db, token, query);
  const map = {};
  for (const b of getBindings(res)) {
    map[val(b, 'term')] = { uri: val(b, 'steward'), name: val(b, 'stewardName') || val(b, 'steward'), account: val(b, 'account') || null };
  }
  return map;
}

/**
 * Assign a steward (for a group: its owner) to a term.
 * With { account }, the steward is that Stardog account, which can then be required to
 * approve changes to the group (see the requireOwnerApproval setting).
 */
export async function assignSteward(endpoint, db, token, termUri, stewardName, actor, { account } = {}) {
  const t = iri(termUri);
  const s = iri(account
    ? `${GOV_NS}account/${encodeURIComponent(account)}`
    : `${GOV_NS}steward/${encodeURIComponent(stewardName)}`);
  const update = `
    WITH ${G}
    DELETE { ${t} ${g('hasSteward')} ?old }
    INSERT {
      ${t} ${g('hasSteward')} ${s} .
      ${s} ${RDFS_LABEL} ${str(stewardName)} .
      ${account ? `${s} ${g('stardogAccount')} ${str(account)} .` : ''}
    }
    WHERE { OPTIONAL { ${t} ${g('hasSteward')} ?old } } ;
    INSERT DATA { GRAPH ${G} { ${auditTriples(termUri, 'steward_assigned', actor, `Assigned to ${stewardName}${account ? ' (Stardog account)' : ''}`)} } }
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
        ${auditTriples(termUri, 'note_added', actor, note)}
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

/**
 * Create a change proposal (and its audit entry, atomically).
 * Structured fields say exactly what approval will apply (see docs/communities-and-mappings.md):
 *   add:       proposedScheme, proposedIri, proposedLabel, proposedDefinition?
 *   modify:    termUri, proposedLabel? and/or proposedDefinition? (neither = discussion only)
 *   deprecate: termUri
 *   mapping:   mappingSource, mappingRelation (SKOS mapping property), mappingTarget; description = justification
 *   unmap:     the same three fields, naming an approved mapping to remove; description = reason
 */
export async function createProposal(endpoint, db, token, proposal) {
  const { type, title, description, proposedBy, changes,
    proposedLabel, proposedDefinition, proposedIri, proposedScheme,
    mappingSource, mappingRelation, mappingTarget } = proposal;
  let { termUri } = proposal;
  requireOneOf(type, PROPOSAL_TYPES, 'proposal type');
  if ((type === 'modify' || type === 'deprecate') && !termUri) throw new Error('Select the term this proposal applies to.');
  if (type === 'add') {
    if (!proposedScheme) throw new Error('Select the group the new term belongs to.');
    if (!proposedIri || !proposedLabel) throw new Error('A new term needs an IRI and a label.');
    iri(proposedIri); // validate early, with a clear message
  }
  if (type === 'mapping' || type === 'unmap') {
    if (!mappingSource || !mappingTarget) throw new Error('Select both terms to map.');
    if (mappingSource === mappingTarget) throw new Error('A term cannot be mapped to itself.');
    requireOneOf(mappingRelation, MAPPING_RELATION_IRIS, 'mapping relation');
    if (!String(description || '').trim()) {
      throw new Error(type === 'unmap' ? 'Explain why this mapping should be removed.' : 'Explain why these terms are related (justification).');
    }
    termUri = mappingSource;
  }
  const opt = (pred, value, asIri = false) => (value ? `${g(pred)} ${asIri ? iri(value) : str(value)} ;` : '');
  const id = newId('proposal');
  const update = `
    INSERT DATA {
      GRAPH ${G} {
        ${iri(id)} a ${g('ChangeProposal')} ;
          ${termUri ? `${g('targetTerm')} ${iri(termUri)} ;` : ''}
          ${opt('proposedLabel', proposedLabel)}
          ${opt('proposedDefinition', proposedDefinition)}
          ${opt('proposedIri', proposedIri, true)}
          ${opt('proposedScheme', proposedScheme, true)}
          ${opt('mappingSource', mappingSource, true)}
          ${opt('mappingRelation', mappingRelation, true)}
          ${opt('mappingTarget', mappingTarget, true)}
          ${g('proposalType')} ${str(type)} ;
          ${g('proposalTitle')} ${str(title)} ;
          ${g('proposalDescription')} ${str(description)} ;
          ${g('proposedBy')} ${str(proposedBy)} ;
          ${actingAccount ? `${g('proposedByAccount')} ${str(actingAccount)} ;` : ''}
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
    SELECT ?id ?term ?type ?title ?desc ?by ?byAccount ?date ?status ?reviewer ?reviewerAccount ?reviewComment ?applied
           ?pLabel ?pDef ?pIri ?pScheme ?mSource ?mRelation ?mTarget WHERE {
      GRAPH ${G} {
        ?id a ${g('ChangeProposal')} ;
            ${g('proposalType')} ?type ;
            ${g('proposalTitle')} ?title ;
            ${g('proposedBy')} ?by ;
            ${g('proposedDate')} ?date ;
            ${g('proposalStatus')} ?status .
        OPTIONAL { ?id ${g('targetTerm')} ?term }
        OPTIONAL { ?id ${g('proposalDescription')} ?desc }
        OPTIONAL { ?id ${g('reviewedBy')} ?reviewer }
        OPTIONAL { ?id ${g('proposedByAccount')} ?byAccount }
        OPTIONAL { ?id ${g('reviewedByAccount')} ?reviewerAccount }
        OPTIONAL { ?id ${g('reviewComment')} ?reviewComment }
        OPTIONAL { ?id ${g('appliedDate')} ?applied }
        OPTIONAL { ?id ${g('proposedLabel')} ?pLabel }
        OPTIONAL { ?id ${g('proposedDefinition')} ?pDef }
        OPTIONAL { ?id ${g('proposedIri')} ?pIri }
        OPTIONAL { ?id ${g('proposedScheme')} ?pScheme }
        OPTIONAL { ?id ${g('mappingSource')} ?mSource }
        OPTIONAL { ?id ${g('mappingRelation')} ?mRelation }
        OPTIONAL { ?id ${g('mappingTarget')} ?mTarget }
      }
    }
    ORDER BY DESC(?date)
  `;
  const res = await querySparql(endpoint, db, token, query);
  return getBindings(res).map(b => ({
    id: val(b, 'id'), termUri: val(b, 'term'), type: val(b, 'type'),
    title: val(b, 'title'), description: val(b, 'desc'),
    proposedBy: val(b, 'by'), proposedByAccount: val(b, 'byAccount'), date: val(b, 'date'), status: val(b, 'status'),
    reviewer: val(b, 'reviewer'), reviewerAccount: val(b, 'reviewerAccount'), reviewComment: val(b, 'reviewComment'), appliedDate: val(b, 'applied'),
    proposedLabel: val(b, 'pLabel'), proposedDefinition: val(b, 'pDef'),
    proposedIri: val(b, 'pIri'), proposedScheme: val(b, 'pScheme'),
    mappingSource: val(b, 'mSource'), mappingRelation: val(b, 'mRelation'), mappingTarget: val(b, 'mTarget'),
  }));
}

/* ── Owner approval (optional, per database) ── */

const SETTINGS = `${GOV_NS}settings`;

/** Governance settings for this database. requireOwnerApproval: changes need their groups' account owners. */
export async function fetchSettings(endpoint, db, token) {
  const res = await querySparql(endpoint, db, token,
    `SELECT ?v WHERE { GRAPH ${G} { ${iri(SETTINGS)} ${g('requireOwnerApproval')} ?v } }`);
  const v = getBindings(res)[0];
  return { requireOwnerApproval: v ? val(v, 'v') === 'true' : false };
}

export async function setRequireOwnerApproval(endpoint, db, token, enabled, actor) {
  const s = iri(SETTINGS);
  const update = `
    WITH ${G}
    DELETE { ${s} ${g('requireOwnerApproval')} ?old }
    INSERT { ${s} ${g('requireOwnerApproval')} ${enabled ? 'true' : 'false'} . }
    WHERE { OPTIONAL { ${s} ${g('requireOwnerApproval')} ?old } } ;
    INSERT DATA { GRAPH ${G} { ${auditTriples(SETTINGS, `owner_approval_${enabled ? 'required' : 'not_required'}`, actor)} } }
  `;
  await updateSparql(endpoint, db, token, update);
}

/** Owner approvals recorded so far: Map proposal id → [accounts] */
export async function fetchOwnerApprovals(endpoint, db, token) {
  const res = await querySparql(endpoint, db, token,
    `SELECT ?p ?account WHERE { GRAPH ${G} { ?a a ${g('OwnerApproval')} ; ${g('approvalOf')} ?p ; ${g('account')} ?account } }`);
  const map = new Map();
  for (const b of getBindings(res)) {
    const id = val(b, 'p');
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(val(b, 'account'));
  }
  return map;
}

/** Where an approved change to a term is written: the graph holding its rdf:type (null = default graph) */
export async function findHome(endpoint, db, token, termUri) {
  const rows = getBindings(await querySparql(endpoint, db, token, homeGraphQuery(termUri)));
  return {
    graph: rows[0] ? val(rows[0], 'g') : null,
    isConcept: rows.some(r => val(r, 'type') === `${SKOS}Concept`),
  };
}

/** Triples inside the given named graph, or the default graph when graph is null */
const inGraph = (graph, body) => (graph ? `GRAPH ${iri(graph)} { ${body} }` : body);

/** Does approving this proposal change the vocabulary (beyond the governance record)? */
export function hasStructuredChange(p) {
  return p.type === 'mapping' || p.type === 'unmap' || p.type === 'deprecate' || p.type === 'add' ||
    (p.type === 'modify' && Boolean(p.proposedLabel || p.proposedDefinition));
}

/**
 * Build the single update request that records a review and, when approved, applies the change.
 * Every operation is guarded by the proposal still being "pending" and the status is changed
 * last, so the whole request is all-or-nothing and approving twice applies nothing twice.
 * homes: { term?: {graph, isConcept}, scheme?: {graph} } from findHome().
 *
 * Owner approval: when requiredAccounts is non-empty, only those Stardog accounts may review.
 * This is enforced by the app, not by Stardog: the accounts are written by the client, so anyone
 * with write access to the database can bypass or forge them. Use Stardog permissions for hard limits.
 * An approval is recorded per account, and the change is applied (and the proposal closed)
 * only in the request where the last required account approves; the check runs inside
 * Stardog's transaction, so two owners approving at the same time still apply it once.
 * A rejection by any required owner closes the proposal.
 */
export function buildReviewUpdate(proposal, decision, reviewer, comment, homes = {}, { requiredAccounts = [] } = {}) {
  requireOneOf(decision, DECISIONS, 'decision');
  // Always the account the app signed in as; callers cannot review on another account's behalf
  const account = actingAccount;
  const gated = requiredAccounts.length > 0;
  if (gated && !requiredAccounts.includes(account)) {
    throw new Error(`Only the owners of the affected groups can review this: ${requiredAccounts.join(', ')}.`);
  }
  const p = iri(proposal.id);
  const pending = `GRAPH ${G} { ${p} ${g('proposalStatus')} "pending" }`;
  const ops = [];
  let ready = pending;
  if (gated && decision === 'approved') {
    ops.push(`INSERT { GRAPH ${G} {
        ${iri(newId('approval'))} a ${g('OwnerApproval')} ; ${g('approvalOf')} ${p} ;
          ${g('account')} ${str(account)} ; ${g('approvalDate')} ${now()} .
        ${auditTriples(proposal.termUri || proposal.id, 'owner_approved', reviewer, comment)}
      } }
      WHERE { ${pending} FILTER NOT EXISTS { GRAPH ${G} { ?mine ${g('approvalOf')} ${p} ; ${g('account')} ${str(account)} } } }`);
    // Everything below happens only once every required owner has approved
    ready += requiredAccounts
      .map(a => ` FILTER EXISTS { GRAPH ${G} { ?approval ${g('approvalOf')} ${p} ; ${g('account')} ${str(a)} } }`)
      .join('');
  }
  const apply = decision === 'approved' && hasStructuredChange(proposal);
  ops.push(`INSERT { GRAPH ${G} { ${auditTriples(proposal.termUri || proposal.id, `proposal_${decision}`, reviewer, comment)} } } WHERE { ${ready} }`);

  if (apply) {
    const t = proposal.termUri ? iri(proposal.termUri) : null;
    const home = homes.term?.graph || null;
    const concept = homes.term?.isConcept;
    switch (proposal.type) {
      case 'mapping': {
        requireOneOf(proposal.mappingRelation, MAPPING_RELATION_IRIS, 'mapping relation');
        const triple = `${iri(proposal.mappingSource)} ${iri(proposal.mappingRelation)} ${iri(proposal.mappingTarget)} .`;
        ops.push(`INSERT { GRAPH ${iri(GOVERNED_MAPPINGS_GRAPH)} { ${triple} } } WHERE { ${ready} }`);
        break;
      }
      case 'unmap': {
        requireOneOf(proposal.mappingRelation, MAPPING_RELATION_IRIS, 'mapping relation');
        const triple = `${iri(proposal.mappingSource)} ${iri(proposal.mappingRelation)} ${iri(proposal.mappingTarget)} .`;
        ops.push(`DELETE { GRAPH ${iri(GOVERNED_MAPPINGS_GRAPH)} { ${triple} } } WHERE { ${ready} }`);
        break;
      }
      case 'deprecate':
        ops.push(`DELETE { GRAPH ${G} { ${t} ${g('hasStatus')} ?oldStatus } }
          INSERT { GRAPH ${G} { ${t} ${g('hasStatus')} ${g('Deprecated')} } }
          WHERE { ${ready} OPTIONAL { GRAPH ${G} { ${t} ${g('hasStatus')} ?oldStatus } } }`);
        ops.push(`INSERT { ${inGraph(home, `${t} ${OWL_DEPRECATED} true .`)} } WHERE { ${ready} }`);
        break;
      case 'modify': {
        const replace = (pred, value, v) => ops.push(`DELETE { ${inGraph(home, `${t} ${pred} ?${v} .`)} }
          INSERT { ${inGraph(home, `${t} ${pred} ${str(value)} .`)} }
          WHERE { ${ready} OPTIONAL { ${inGraph(home, `${t} ${pred} ?${v} .`)} } }`);
        if (proposal.proposedLabel) replace(concept ? `<${SKOS}prefLabel>` : RDFS_LABEL, proposal.proposedLabel, 'oldLabel');
        if (proposal.proposedDefinition) replace(concept ? `<${SKOS}definition>` : RDFS_COMMENT, proposal.proposedDefinition, 'oldDefinition');
        break;
      }
      case 'add': {
        const n = iri(proposal.proposedIri);
        const body = `${n} a <${SKOS}Concept> ;
            <${SKOS}inScheme> ${iri(proposal.proposedScheme)} ;
            ${proposal.proposedDefinition ? `<${SKOS}definition> ${str(proposal.proposedDefinition)} ;` : ''}
            <${SKOS}prefLabel> ${str(proposal.proposedLabel)} .`;
        ops.push(`INSERT { ${inGraph(homes.scheme?.graph || null, body)} } WHERE { ${ready} }`);
        break;
      }
    }
  }

  ops.push(`DELETE { GRAPH ${G} { ${p} ${g('proposalStatus')} ?old } }
    INSERT {
      GRAPH ${G} {
        ${p} ${g('proposalStatus')} ${str(decision)} ;
             ${g('reviewedBy')} ${str(reviewer)} ;
             ${account ? `${g('reviewedByAccount')} ${str(account)} ;` : ''}
             ${g('reviewDate')} ${now()} ;
             ${apply ? `${g('appliedDate')} ${now()} ;` : ''}
             ${g('reviewComment')} ${str(comment)} .
      }
    }
    WHERE { GRAPH ${G} { ${p} ${g('proposalStatus')} ?old } FILTER(?old = "pending") ${ready.slice(pending.length)} }`);
  return ops.join(' ;\n');
}

/**
 * Review a proposal (approve/reject). Approval applies the proposed change in the same request
 * (or, with owner approval, in the request of the last required owner). options: see buildReviewUpdate.
 */
export async function reviewProposal(endpoint, db, token, proposal, decision, reviewer, comment, options = {}) {
  const homes = {};
  if (decision === 'approved' && hasStructuredChange(proposal)) {
    if (proposal.termUri && (proposal.type === 'modify' || proposal.type === 'deprecate')) homes.term = await findHome(endpoint, db, token, proposal.termUri);
    if (proposal.type === 'add') homes.scheme = await findHome(endpoint, db, token, proposal.proposedScheme);
  }
  await updateSparql(endpoint, db, token, buildReviewUpdate(proposal, decision, reviewer, comment, homes, options));
}

/** Fetch audit log */
export async function fetchAuditLog(endpoint, db, token, termUri) {
  const termFilter = termUri ? `?entry ${g('targetTerm')} ${iri(termUri)} .` : '';
  const query = `
    SELECT ?entry ?term ?action ?actor ?account ?timestamp ?note WHERE {
      GRAPH ${G} {
        ?entry a ${g('AuditEntry')} ;
               ${g('auditAction')} ?action ;
               ${g('auditActor')} ?actor ;
               ${g('auditTimestamp')} ?timestamp .
        OPTIONAL { ?entry ${g('targetTerm')} ?term }
        OPTIONAL { ?entry ${g('editorialNote')} ?note }
        OPTIONAL { ?entry ${g('auditAccount')} ?account }
        ${termFilter}
      }
    }
    ORDER BY DESC(?timestamp)
    LIMIT 200
  `;
  const res = await querySparql(endpoint, db, token, query);
  return getBindings(res).map(b => ({
    id: val(b, 'entry'), termUri: val(b, 'term'), action: val(b, 'action'),
    actor: val(b, 'actor'), account: val(b, 'account'), timestamp: val(b, 'timestamp'), note: val(b, 'note'),
  }));
}
