/**
 * Governance CRUD operations — persisted to Stardog via VOCAB:GOVERNANCE named graph.
 */
import { updateSparql, querySparql, getBindings, val } from './sparql';

const GOV_GRAPH = 'VOCAB:GOVERNANCE';
const GOV_NS = 'http://vocab.gov/ontology#';

/** Bootstrap the governance graph if it doesn't exist */
export async function bootstrapGovernanceGraph(endpoint, db, token) {
  const checkQuery = `ASK { GRAPH <${GOV_GRAPH}> { ?s ?p ?o } }`;
  try {
    const res = await querySparql(endpoint, db, token, checkQuery);
    if (res.boolean === true) return false; // already exists
  } catch {
    // graph doesn't exist, create it
  }

  const bootstrap = `
    INSERT DATA {
      GRAPH <${GOV_GRAPH}> {
        <${GOV_NS}GovernanceGraph> a <${GOV_NS}System> ;
          <http://www.w3.org/2000/01/rdf-schema#label> "Vocabulary Governance Graph" ;
          <http://www.w3.org/2000/01/rdf-schema#comment> "Stores term lifecycle status, change proposals, audit entries, stewardship assignments, and editorial notes." ;
          <${GOV_NS}createdDate> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
      }
    }
  `;
  await updateSparql(endpoint, db, token, bootstrap);
  return true;
}

/** Fetch all governance statuses */
export async function fetchStatuses(endpoint, db, token) {
  const query = `
    SELECT ?term ?status WHERE {
      GRAPH <${GOV_GRAPH}> {
        ?term <${GOV_NS}hasStatus> ?status .
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
  const update = `
    WITH <${GOV_GRAPH}>
    DELETE { <${termUri}> <${GOV_NS}hasStatus> ?old }
    INSERT {
      <${termUri}> <${GOV_NS}hasStatus> <${GOV_NS}${status}> .
    }
    WHERE { OPTIONAL { <${termUri}> <${GOV_NS}hasStatus> ?old } }
  `;
  await updateSparql(endpoint, db, token, update);
  await addAuditEntry(endpoint, db, token, termUri, `status_changed_to_${status}`, actor);
}

/** Fetch all stewardship assignments */
export async function fetchStewards(endpoint, db, token) {
  const query = `
    SELECT ?term ?steward ?stewardName WHERE {
      GRAPH <${GOV_GRAPH}> {
        ?term <${GOV_NS}hasSteward> ?steward .
        OPTIONAL { ?steward <http://www.w3.org/2000/01/rdf-schema#label> ?stewardName }
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
  const stewardUri = `${GOV_NS}steward/${encodeURIComponent(stewardName)}`;
  const update = `
    WITH <${GOV_GRAPH}>
    DELETE { <${termUri}> <${GOV_NS}hasSteward> ?old }
    INSERT {
      <${termUri}> <${GOV_NS}hasSteward> <${stewardUri}> .
      <${stewardUri}> <http://www.w3.org/2000/01/rdf-schema#label> "${stewardName}" .
    }
    WHERE { OPTIONAL { <${termUri}> <${GOV_NS}hasSteward> ?old } }
  `;
  await updateSparql(endpoint, db, token, update);
  await addAuditEntry(endpoint, db, token, termUri, 'steward_assigned', actor, `Assigned to ${stewardName}`);
}

/** Add editorial note */
export async function addEditorialNote(endpoint, db, token, termUri, note, actor) {
  const noteId = `${GOV_NS}note/${Date.now()}`;
  const update = `
    INSERT DATA {
      GRAPH <${GOV_GRAPH}> {
        <${noteId}> a <${GOV_NS}EditorialNote> ;
          <${GOV_NS}targetTerm> <${termUri}> ;
          <${GOV_NS}noteText> "${note.replace(/"/g, '\\"')}" ;
          <${GOV_NS}author> "${actor}" ;
          <${GOV_NS}createdDate> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
      }
    }
  `;
  await updateSparql(endpoint, db, token, update);
}

/** Fetch editorial notes for a term */
export async function fetchNotes(endpoint, db, token, termUri) {
  const query = `
    SELECT ?note ?text ?author ?date WHERE {
      GRAPH <${GOV_GRAPH}> {
        ?note a <${GOV_NS}EditorialNote> ;
              <${GOV_NS}targetTerm> <${termUri}> ;
              <${GOV_NS}noteText> ?text ;
              <${GOV_NS}author> ?author ;
              <${GOV_NS}createdDate> ?date .
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

/** Create a change proposal */
export async function createProposal(endpoint, db, token, proposal) {
  const { termUri, type, title, description, proposedBy, changes } = proposal;
  const id = `${GOV_NS}proposal/${Date.now()}`;
  const changesStr = JSON.stringify(changes || {}).replace(/"/g, '\\"');
  const update = `
    INSERT DATA {
      GRAPH <${GOV_GRAPH}> {
        <${id}> a <${GOV_NS}ChangeProposal> ;
          <${GOV_NS}targetTerm> <${termUri || ''}> ;
          <${GOV_NS}proposalType> "${type}" ;
          <${GOV_NS}proposalTitle> "${title.replace(/"/g, '\\"')}" ;
          <${GOV_NS}proposalDescription> "${description.replace(/"/g, '\\"')}" ;
          <${GOV_NS}proposedBy> "${proposedBy}" ;
          <${GOV_NS}proposedDate> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
          <${GOV_NS}proposalStatus> "pending" ;
          <${GOV_NS}proposedChanges> "${changesStr}" .
      }
    }
  `;
  await updateSparql(endpoint, db, token, update);
  await addAuditEntry(endpoint, db, token, termUri || id, 'proposal_created', proposedBy, title);
  return id;
}

/** Fetch all proposals */
export async function fetchProposals(endpoint, db, token) {
  const query = `
    SELECT ?id ?term ?type ?title ?desc ?by ?date ?status WHERE {
      GRAPH <${GOV_GRAPH}> {
        ?id a <${GOV_NS}ChangeProposal> ;
            <${GOV_NS}proposalType> ?type ;
            <${GOV_NS}proposalTitle> ?title ;
            <${GOV_NS}proposedBy> ?by ;
            <${GOV_NS}proposedDate> ?date ;
            <${GOV_NS}proposalStatus> ?status .
        OPTIONAL { ?id <${GOV_NS}targetTerm> ?term }
        OPTIONAL { ?id <${GOV_NS}proposalDescription> ?desc }
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

/** Review a proposal (approve/reject) */
export async function reviewProposal(endpoint, db, token, proposalId, decision, reviewer, comment) {
  const update = `
    WITH <${GOV_GRAPH}>
    DELETE { <${proposalId}> <${GOV_NS}proposalStatus> ?old }
    INSERT {
      <${proposalId}> <${GOV_NS}proposalStatus> "${decision}" ;
                       <${GOV_NS}reviewedBy> "${reviewer}" ;
                       <${GOV_NS}reviewDate> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
                       <${GOV_NS}reviewComment> "${comment.replace(/"/g, '\\"')}" .
    }
    WHERE { <${proposalId}> <${GOV_NS}proposalStatus> ?old }
  `;
  await updateSparql(endpoint, db, token, update);
  await addAuditEntry(endpoint, db, token, proposalId, `proposal_${decision}`, reviewer, comment);
}

/** Add audit entry */
export async function addAuditEntry(endpoint, db, token, targetTerm, action, actor, note) {
  const id = `${GOV_NS}audit/${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const noteTriple = note ? `<${id}> <${GOV_NS}editorialNote> "${note.replace(/"/g, '\\"')}" .` : '';
  const update = `
    INSERT DATA {
      GRAPH <${GOV_GRAPH}> {
        <${id}> a <${GOV_NS}AuditEntry> ;
          <${GOV_NS}targetTerm> <${targetTerm}> ;
          <${GOV_NS}auditAction> "${action}" ;
          <${GOV_NS}auditActor> "${actor}" ;
          <${GOV_NS}auditTimestamp> "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        ${noteTriple}
      }
    }
  `;
  await updateSparql(endpoint, db, token, update);
}

/** Fetch audit log */
export async function fetchAuditLog(endpoint, db, token, termUri) {
  const termFilter = termUri ? `?entry <${GOV_NS}targetTerm> <${termUri}> .` : '';
  const query = `
    SELECT ?entry ?term ?action ?actor ?timestamp ?note WHERE {
      GRAPH <${GOV_GRAPH}> {
        ?entry a <${GOV_NS}AuditEntry> ;
               <${GOV_NS}auditAction> ?action ;
               <${GOV_NS}auditActor> ?actor ;
               <${GOV_NS}auditTimestamp> ?timestamp .
        OPTIONAL { ?entry <${GOV_NS}targetTerm> ?term }
        OPTIONAL { ?entry <${GOV_NS}editorialNote> ?note }
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
