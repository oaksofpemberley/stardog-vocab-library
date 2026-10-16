#!/usr/bin/env node
/**
 * vocab-gov: the Vocabulary Library's governance, without the browser (scripts, CI, AI agents).
 *
 * It calls the same src/lib functions as the app, so the same rules apply: values are escaped,
 * every change is written together with its audit entry, a proposal is applied only while it is
 * still pending, and owner approval is checked. Output is JSON on stdout; errors are JSON on
 * stderr with exit code 1. Run with --help for the commands.
 */
import { parseArgs } from 'node:util';
import * as gov from '../src/lib/governance.js';
import { querySparql, listDatabases, requestToken, fetchIdentity, getBindings, val, getLocalName } from '../src/lib/sparql.js';
import { CLASSES_QUERY, PROPERTIES_QUERY, SCHEMES_QUERY, CONCEPTS_QUERY, MAPPINGS_QUERY, isBuiltInTerm, propertiesFromBindings } from '../src/lib/ontologyQueries.js';
import { MAPPING_RELATIONS, relationLabel, mergeMappings, approvalsNeeded, schemesOf } from '../src/lib/communities.js';

const HELP = `vocab-gov: Vocabulary Library governance from the command line. Prints JSON.

Usage: vocab-gov <command> [args] --db <database> [options]

Read:
  databases                          Databases on the server
  whoami                             The Stardog account in use
  terms [--search text] [--limit n]  Terms with status and steward (default limit 100)
  term <iri>                         One term: status, steward, groups, notes, mappings, history
  groups                             Groups (SKOS concept schemes) and their owners
  mappings [--term iri]              Mappings: approved, asserted, pending, rejected, retired
  proposals [--status s]             Change proposals (pending, approved, rejected)
  history [--term iri]               Audit log, newest first (at most 200 entries)

Change (each one is written with its audit entry):
  set-status <iri> <status>          ${gov.STATUSES.join(' | ')}
  set-steward <iri> <name> [--account]   Steward (owner, for a group); --account: <name> is a Stardog account
  note <iri> <text>                  Add an editorial note
  propose <type> --title t --description d [fields]
      modify     --term iri [--label l] [--definition d]
      deprecate  --term iri
      add        --scheme iri --iri iri --label l [--definition d]
      mapping    --source iri --relation r --target iri   (r: ${MAPPING_RELATIONS.map(r => getLocalName(r.iri)).join(', ')})
      unmap      --source iri --relation r --target iri
  review <proposal> approve|reject [--comment c]   <proposal>: its IRI or a unique ending of it

Options:
  --db <name>        Database (or VOCAB_DB)
  --endpoint <url>   Stardog server (or STARDOG_URL; default http://localhost:5820)
  --as <name>        Name recorded on changes (default: the Stardog account)

Credentials: STARDOG_TOKEN, or STARDOG_USERNAME + STARDOG_PASSWORD (exchanged for a token).
Read from the environment, then from the repository's .env file.`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    db: { type: 'string' }, endpoint: { type: 'string' }, as: { type: 'string' },
    search: { type: 'string' }, limit: { type: 'string' }, term: { type: 'string' }, status: { type: 'string' },
    account: { type: 'boolean' }, comment: { type: 'string' },
    title: { type: 'string' }, description: { type: 'string' }, label: { type: 'string' }, definition: { type: 'string' },
    iri: { type: 'string' }, scheme: { type: 'string' }, source: { type: 'string' }, relation: { type: 'string' }, target: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

const fail = (message) => { throw new Error(message); };
const print = (value) => console.log(JSON.stringify(value, null, 2));

async function connect() {
  try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* no .env: environment only */ }
  const env = process.env;
  const endpoint = (opts.endpoint || env.STARDOG_URL || 'http://localhost:5820').replace(/\/$/, '');
  const db = opts.db || env.VOCAB_DB || '';
  const token = env.STARDOG_TOKEN ||
    (env.STARDOG_USERNAME && env.STARDOG_PASSWORD ? await requestToken(endpoint, env.STARDOG_USERNAME, env.STARDOG_PASSWORD) : '');
  // Who Stardog says we are: recorded on every change and used for owner approval, as in the app
  const account = await fetchIdentity(endpoint, token);
  gov.setActingAccount(account);
  return { endpoint, db, token, account, actor: opts.as || account || 'anonymous' };
}

/** Everything the governance rules look at, loaded the way the app loads it */
async function loadVocabulary(c, { withProperties = false } = {}) {
  const q = (query) => querySparql(c.endpoint, c.db, c.token, query).then(getBindings);
  const [classes, props, schemes, concepts, statuses, stewards, settings] = await Promise.all([
    q(CLASSES_QUERY), withProperties ? q(PROPERTIES_QUERY) : [], q(SCHEMES_QUERY), q(CONCEPTS_QUERY),
    gov.fetchStatuses(c.endpoint, c.db, c.token).catch(() => ({})),
    gov.fetchStewards(c.endpoint, c.db, c.token).catch(() => ({})),
    gov.fetchSettings(c.endpoint, c.db, c.token).catch(() => ({ requireOwnerApproval: false })),
  ]);
  const terms = new Map();
  for (const b of classes) terms.set(val(b, 'class'), { uri: val(b, 'class'), label: val(b, 'label'), definition: val(b, 'comment'), type: val(b, 'type') });
  for (const p of propertiesFromBindings(props)) if (!terms.has(p.uri)) terms.set(p.uri, { uri: p.uri, label: p.label, definition: p.comment, type: p.type });
  const v = {
    terms: [...terms.values()].filter(t => !isBuiltInTerm(t.uri)),
    schemes: schemes.map(b => ({ uri: val(b, 'scheme'), label: val(b, 'label'), declaredOwner: val(b, 'declaredOwner'), concepts: Number(val(b, 'concepts') || 0) })),
    concepts: concepts.map(b => ({ uri: val(b, 'concept'), scheme: val(b, 'scheme') })),
    statuses, stewards, settings,
  };
  v.schemeUris = new Set(v.schemes.map(s => s.uri));
  // A term with no recorded status counts as Active (as in the app)
  v.describe = (t) => ({ ...t, status: statuses[t.uri] || 'Active', steward: stewards[t.uri] || null,
    groups: schemesOf(t.uri, v.concepts, v.schemeUris) });
  v.required = (p) => [...new Set(approvalsNeeded(p, {
    requireOwnerApproval: settings.requireOwnerApproval, concepts: v.concepts, schemeUris: v.schemeUris, stewardOf: (u) => stewards[u] || null,
  }).map(n => n.account))];
  return v;
}

async function loadMappings(c) {
  const [rows, proposals] = await Promise.all([
    querySparql(c.endpoint, c.db, c.token, MAPPINGS_QUERY).then(getBindings),
    gov.fetchProposals(c.endpoint, c.db, c.token).catch(() => []),
  ]);
  const triples = rows.map(b => ({ source: val(b, 'source'), relation: val(b, 'relation'), target: val(b, 'target'), graph: val(b, 'g') }));
  return mergeMappings(triples, proposals).map(m => ({
    source: m.source, relation: relationLabel(m.relation), target: m.target, status: m.status, graph: m.graph || null,
    proposal: m.proposal?.id || null, justification: m.proposal?.description || null,
    removalPending: m.removalPending?.id || null, retiredBy: m.retiredBy?.id || null,
  }));
}

const RELATIONS = new Map(MAPPING_RELATIONS.flatMap(r => [[r.iri, r.iri], [getLocalName(r.iri).toLowerCase(), r.iri], [r.label, r.iri]]));
const relationIri = (r) => RELATIONS.get(String(r || '').toLowerCase()) || RELATIONS.get(r) ||
  fail(`Unknown relation "${r}". Use one of: ${MAPPING_RELATIONS.map(x => getLocalName(x.iri)).join(', ')}.`);

const statusName = (s) => gov.STATUSES.find(x => x.toLowerCase() === String(s || '').toLowerCase()) ||
  fail(`Unknown status "${s}". Use one of: ${gov.STATUSES.join(', ')}.`);

const need = (value, what) => value || fail(`Missing ${what}. Run vocab-gov --help.`);

const commands = {
  async databases(c) { return listDatabases(c.endpoint, c.token); },

  async whoami(c) { return { endpoint: c.endpoint, db: c.db || null, account: c.account, recordedAs: c.actor }; },

  async terms(c) {
    const v = await loadVocabulary(c, { withProperties: true });
    const search = (opts.search || '').toLowerCase();
    const limit = Number(opts.limit || 100);
    const found = v.terms.filter(t => !search || t.uri.toLowerCase().includes(search) || t.label.toLowerCase().includes(search));
    return { total: found.length, shown: Math.min(limit, found.length), terms: found.slice(0, limit).map(v.describe) };
  },

  async term(c, [uri]) {
    need(uri, 'term IRI');
    const [v, notes, history, mappings] = await Promise.all([
      loadVocabulary(c, { withProperties: true }),
      gov.fetchNotes(c.endpoint, c.db, c.token, uri),
      gov.fetchAuditLog(c.endpoint, c.db, c.token, uri),
      loadMappings(c),
    ]);
    const term = v.terms.find(t => t.uri === uri) || fail(`No term ${uri} in ${c.db}.`);
    return { ...v.describe(term), notes, mappings: mappings.filter(m => m.source === uri || m.target === uri), history };
  },

  async groups(c) {
    const v = await loadVocabulary(c);
    return {
      requireOwnerApproval: v.settings.requireOwnerApproval,
      groups: v.schemes.map(s => ({ ...s, owner: v.stewards[s.uri] || (s.declaredOwner ? { name: s.declaredOwner, declaredInData: true } : null) })),
    };
  },

  async mappings(c) {
    const all = await loadMappings(c);
    return opts.term ? all.filter(m => m.source === opts.term || m.target === opts.term) : all;
  },

  async proposals(c) {
    const [v, proposals, approvals] = await Promise.all([
      loadVocabulary(c), gov.fetchProposals(c.endpoint, c.db, c.token), gov.fetchOwnerApprovals(c.endpoint, c.db, c.token).catch(() => new Map()),
    ]);
    return proposals
      .filter(p => !opts.status || p.status === opts.status)
      .map(p => ({ ...p, requiredOwners: v.required(p), approvedBy: approvals.get(p.id) || [] }));
  },

  async history(c) { return gov.fetchAuditLog(c.endpoint, c.db, c.token, opts.term); },

  async 'set-status'(c, [uri, status]) {
    need(uri, 'term IRI');
    const name = statusName(need(status, 'status'));
    await gov.setTermStatus(c.endpoint, c.db, c.token, uri, name, c.actor);
    return { ok: true, term: uri, status: name };
  },

  async 'set-steward'(c, [uri, name]) {
    need(uri, 'term IRI'); need(name, 'steward name');
    const v = await loadVocabulary(c);
    // With owner approval on, an account-owned group can only be handed over by its current owner (as in the app)
    const owner = v.stewards[uri];
    if (v.schemeUris.has(uri) && v.settings.requireOwnerApproval && owner?.account && owner.account !== c.account) {
      fail(`Only ${owner.account} can hand this group to a new owner while owner approval is on.`);
    }
    await gov.assignSteward(c.endpoint, c.db, c.token, uri, name, c.actor, opts.account ? { account: name } : {});
    return { ok: true, term: uri, steward: name, account: opts.account ? name : null };
  },

  async note(c, [uri, ...text]) {
    need(uri, 'term IRI');
    const note = need(text.join(' ').trim(), 'note text');
    await gov.addEditorialNote(c.endpoint, c.db, c.token, uri, note, c.actor);
    return { ok: true, term: uri, note };
  },

  async propose(c, [type]) {
    need(type, 'proposal type');
    const isMap = type === 'mapping' || type === 'unmap';
    const id = await gov.createProposal(c.endpoint, c.db, c.token, {
      type, title: need(opts.title, '--title'), description: opts.description || '', proposedBy: c.actor,
      termUri: type === 'modify' || type === 'deprecate' ? opts.term : '',
      proposedLabel: type === 'add' || type === 'modify' ? opts.label : '',
      proposedDefinition: type === 'add' || type === 'modify' ? opts.definition : '',
      proposedIri: type === 'add' ? opts.iri : '', proposedScheme: type === 'add' ? opts.scheme : '',
      mappingSource: isMap ? opts.source : '', mappingRelation: isMap ? relationIri(opts.relation) : '', mappingTarget: isMap ? opts.target : '',
    });
    return { ok: true, proposal: id, status: 'pending' };
  },

  async review(c, [ref, verdict]) {
    need(ref, 'proposal');
    const decision = { approve: 'approved', reject: 'rejected' }[verdict] || fail('Say approve or reject.');
    if (decision === 'rejected' && !opts.comment) fail('A comment is required to reject (--comment).');
    const [v, proposals] = await Promise.all([loadVocabulary(c), gov.fetchProposals(c.endpoint, c.db, c.token)]);
    const matches = proposals.filter(p => p.id === ref || p.id.endsWith(ref));
    if (matches.length !== 1) fail(matches.length ? `"${ref}" matches ${matches.length} proposals; give more of its IRI.` : `No proposal ${ref}.`);
    const proposal = matches[0];
    if (proposal.status !== 'pending') fail(`This proposal is already ${proposal.status}.`);
    await gov.reviewProposal(c.endpoint, c.db, c.token, proposal, decision, c.actor, opts.comment || 'Approved', { requiredAccounts: v.required(proposal) });
    // With owner approval, an approval may be recorded while the proposal waits for another owner
    const after = (await gov.fetchProposals(c.endpoint, c.db, c.token)).find(p => p.id === proposal.id);
    const approvals = await gov.fetchOwnerApprovals(c.endpoint, c.db, c.token).catch(() => new Map());
    return { ok: true, proposal: proposal.id, status: after?.status, applied: Boolean(after?.appliedDate), approvedBy: approvals.get(proposal.id) || [] };
  },
};

async function main() {
  const [name, ...args] = positionals;
  if (opts.help || !name) { console.log(HELP); return; }
  const command = commands[name] || fail(`Unknown command "${name}". Run vocab-gov --help.`);
  const c = await connect();
  if (name !== 'databases' && name !== 'whoami' && !c.db) fail('Which database? Pass --db <name> (or set VOCAB_DB).');
  print(await command(c, args));
}

main().catch(e => {
  console.error(JSON.stringify({ error: e.message }));
  process.exitCode = 1;
});
