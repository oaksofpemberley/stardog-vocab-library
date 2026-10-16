# Communities, shared terms and governed mappings

Requirements and design for governing how different groups define and relate their terms.

## Problem

Teams in one organization work in different contexts, so the same phrase can mean different things. "Orders of magnitude" means one thing to a computer scientist (algorithmic complexity classes), another to a physicist (powers of ten in a measured quantity), and another to a business administrator (a rough sense of scale in a forecast). Forcing one shared definition loses meaning. What teams need is:

- each group keeps its own vocabulary, often a simple SKOS concept scheme rather than a full ontology;
- mappings between groups' terms that **preserve** the differences while letting people communicate ("our X is close to, broader than, or only related to their Y");
- a way to **manage and show** that work to people.

Stardog can already store SKOS vocabularies and mappings and expose them to queries. It does not, by itself, give teams the place to see where their meanings collide, to propose and review mappings, and to see who owns what. This feature adds that application layer on top of the governance workflow that already exists (statuses, stewards, proposals, reviews, audit log).

## Requirements

### R1. Groups are named concept schemes with owners
- R1.1 Each `skos:ConceptScheme` is shown as a group, with its label, description and number of concepts.
- R1.2 Each group has an owner. The owner is recorded through governance (the scheme's steward), with an audit entry. If no owner is assigned, a `dct:creator` or `dct:publisher` declared in the data is shown as the declared owner.
- R1.3 A group's concepts can be listed, with their definitions.

**Accepted when:** loading a database with three schemes shows three groups with correct concept counts, and assigning an owner shows the owner immediately, after a refresh, and in the audit log.

### R2. "Same term, different meanings"
- R2.1 The app finds labels (`skos:prefLabel` or `skos:altLabel`) used by concepts in two or more different schemes. Matching ignores case and extra whitespace.
- R2.2 For a selected label, each group's concept is shown side by side: group, owner, preferred label, alternative labels and definition.
- R2.3 Existing mappings between the side-by-side concepts are shown with their status.
- R2.4 From this view a user can propose a mapping between any two of the concepts.
- R2.5 Groups rarely word things identically, so the app also suggests **similar wordings**: concepts in different groups whose labels share most of their content words. Matching drops stop words and plural endings, and needs at least half the words in common. Pairs that already have a mapping (asserted, approved or pending) are left out, so the list is a to-do list. A suggestion opens the same side-by-side view and mapping form.

**Accepted when:**
- the sample data shows "orders of magnitude" with three different definitions side by side, together with the one mapping asserted in the source data;
- "rough order of magnitude" (Business) is suggested for both Physics and Computer Science "orders of magnitude";
- a suggested pair disappears from the suggestions once a mapping is proposed for it.

### R3. Mappings are governed like terms
- R3.1 Supported relations are the SKOS mapping properties: `exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch`. Each is explained in plain words in the UI.
- R3.2 A mapping proposal records source, relation, target, justification, proposer and date. A justification is required.
- R3.3 Mapping proposals go through the existing Review Queue. Approving or rejecting records the reviewer, date and comment, and writes an audit entry.
- R3.4 Approved mappings are written as plain SKOS triples to a dedicated named graph, `VOCAB:MAPPINGS`, so any SPARQL client or Voicebox can use them. Neither group's vocabulary graph is modified: the mapping belongs to the relationship, not to either group.
- R3.5 A Mappings view lists all mappings with their origin and status:
  - **asserted**: found in a vocabulary's own data;
  - **approved**: governed, materialized in `VOCAB:MAPPINGS`;
  - **pending** or **rejected**: proposals.

- R3.6 An approved mapping can be retired:
  - removal is proposed with a required reason and reviewed like any other change;
  - approval deletes the triple from `VOCAB:MAPPINGS`;
  - the Mappings view keeps the retired mapping as history, with its original justification, the removal reason and both reviewers;
  - mappings asserted in a group's own data are not removed this way, because they belong to that group.

**Accepted when:**
- proposing a `closeMatch` between two groups' terms, then approving it, makes the triple appear in `VOCAB:MAPPINGS`, and the Mappings view shows it as approved with the justification and approver;
- rejecting another proposal writes nothing to `VOCAB:MAPPINGS`;
- proposing and approving its removal deletes the triple, and the Mappings view lists it as retired.

### R4. Approved proposals apply their change
- R4.1 Proposal types and what approval does:

  | Type | Proposed fields | Approval writes |
  |------|-----------------|-----------------|
  | Add term | group, IRI, label, definition | a new `skos:Concept` in the group's graph |
  | Modify term | new label and/or new definition | replaces the label/definition in the term's own graph |
  | Deprecate term | — | status `Deprecated` and `owl:deprecated true` in the term's graph |
  | Map terms | source, relation, target, justification | the mapping triple in `VOCAB:MAPPINGS` |
  | Remove mapping | source, relation, target, reason | deletes that triple from `VOCAB:MAPPINGS` |

- R4.2 The change, the proposal's new status and the audit entry are written in **one** update request, so they are applied together or not at all.
- R4.3 Every write in an approval is conditional on the proposal still being `pending`, so approving twice (two reviewers, a double click) cannot apply a change twice.
- R4.4 Rejecting writes nothing outside the governance graph.
- R4.5 Resolved proposals show whether the change was applied.

**Accepted when:** each of the four types, once approved, produces exactly the triples in the table, verified directly in Stardog.

### R5. Ownership tied to Stardog accounts (optional)
- R5.1 Users can sign in with their own Stardog username and password. The password is exchanged once for a Stardog-issued token (`GET /admin/token`) and is never stored; the token is kept in sessionStorage. Without sign-in, requests run as the proxy's shared account.
- R5.2 The app asks Stardog which account it is acting as (the subject of a token Stardog issues for the current credentials) and shows it in the sidebar ("Signed in as …" or "Shared account: …").
- R5.3 Every audit entry, proposal and review records that account next to the self-reported name. Reviews always use the account the app signed in as; a caller cannot pass another one. The stored value is written by the client, so it is a record, not proof; Stardog's own audit log is the authority on who wrote what.
- R5.4 A group's owner can be a Stardog account (picked from the server's account list when the user may list accounts, otherwise typed) or a plain name.
- R5.5 A per-database setting, **Require group owners to approve changes to their group** (off by default), works as follows:
  - **Who must approve:** a proposal that touches a group owned by an account needs that account's approval. A mapping between two such groups needs both owners. Groups owned by a plain name add no requirement.
  - **Recording:** each owner's approval is recorded once. The change applies in the same request in which the last required owner approves; the check runs inside Stardog's transaction. Any required owner can reject.
  - **Review Queue:** shows each required owner as approved or waiting. Other accounts see who can review instead of the Approve button.
- R5.6 While the setting is on:
  - only a group's current account owner can hand that group to a new owner;
  - only an account owner can switch the setting off (anyone can switch it on).
- R5.7 These rules are enforced by the app, not by Stardog permissions. Anyone with write access to the database could change `VOCAB:GOVERNANCE` directly. If an owner account is lost, a Stardog administrator recovers by editing that graph, e.g. deleting `<http://vocab.gov/ontology#settings> gov:requireOwnerApproval ?v`.

**Accepted when:**
- signing in with a wrong password shows the app's error, with no browser login popup;
- signing in correctly shows the account, and the account is stamped on audit entries;
- with the setting on, a Physics ↔ Business mapping stays pending after one owner approves and applies after the second;
- a proposal touching only a group without an account owner can be approved by anyone;
- a proposal touching only another owner's group cannot be reviewed by a non-owner.

### R6. Stardog-enforced permissions (secured setup)
- R6.1 A setup script (`scripts/setup-secured-demo.sh`, HTTP API only, re-runnable) creates a database with `security.named.graphs=true` and grants per named graph:
  - everyone reads everything and writes `VOCAB:GOVERNANCE`;
  - each group owner also writes their group's vocabulary graph and `VOCAB:MAPPINGS`;
  - the app's shared proxy account (`vocab_app`) is not an admin.
- R6.2 Stardog refuses writes outside these grants, including direct SPARQL that bypasses the app.
- R6.3 Because an approval is one update request, a refused approval changes nothing; the proposal stays pending.
- R6.4 The app explains a refusal in plain words, naming the graph.
- R6.5 Owner account fields accept typed usernames with suggestions, because most accounts may only list themselves.

**Accepted when:**
- the shared account can propose but its approval is refused;
- alice's approval of a Physics ↔ Business mapping is recorded but applies nothing;
- bob's approval applies it;
- with the app's rule off, bob still cannot change the Physics vocabulary;
- `vocab_app` cannot create or drop databases.

All five were verified on 2026-10-09.

### R7. Create and edit a group's terms where people work
A vocabulary term is not an ontology concept. Each group writes down the words it uses; linking a word to the shared ontology is a separate, later step (R9).
- R7.1 Each group card has **Add term**. It opens an "Add term" proposal with the group already chosen: label (required), definition (optional), IRI (suggested from the group's namespace and the label, editable).
- R7.2 Each concept in a group's list, and each SKOS concept's own page, has **Edit**. It opens a "Modify term" proposal filled with the current label and definition. Only the fields that changed are proposed; a proposal that changes nothing cannot be sent.
- R7.3 New terms and edits go through the existing proposal flow (R4): nothing changes in the vocabulary until a reviewer approves, and owner approval (R5) applies.
- R7.4 A new term's IRI must not already be used by any term in the database or by another pending "Add term" proposal. The form says which term already uses it.
- R7.5 Unsent input is kept as a draft per group or term, so it never overwrites the Review Queue's own draft.

**Accepted when:** adding "test article" to Test & Evaluation from its group card and approving it puts a `skos:Concept` with that label and `skos:inScheme te:Scheme` in `urn:vocab:test`; editing its definition from the group list and approving it replaces the definition; proposing a term whose IRI exists is refused with the existing term named.

### R8. Bulk add terms to a group
- R8.1 Each group card has **Bulk add**. The user pastes rows or opens a `.csv`, `.tsv` or `.txt` file. Columns are `label`, `definition`, `iri` (a header row in any order is recognised; without one the columns are taken in that order). Comma- or tab-separated, with quoted fields as in RFC 4180.
- R8.2 Before sending, a preview lists every row with its IRI and one of:
  - **new**;
  - **also used by** other groups (a shared term, allowed: this is the point of groups);
  - **error**, not sent: missing label, invalid IRI, IRI already used (R7.4), IRI repeated in the batch, or label already in this group.
- R8.3 Sending creates one "Add term" proposal per valid row, all in **one** update request (all or none), tagged with a shared batch id and the batch size.
- R8.4 In the Review Queue, a batch shows as one card ("Bulk add: 25 terms to Test & Evaluation") listing its terms. A reviewer can approve or reject the whole batch in one request, or open it and review terms one by one.
- R8.5 At most 500 rows per batch.

**Accepted when:** pasting 5 rows (one with no label, one repeating an existing IRI, one whose label another group uses) previews 3 valid rows with the shared label flagged; sending creates 3 pending proposals in one batch; "Approve all" adds the 3 concepts and writes 3 approval audit entries in one request.

### R9. Link terms to the ontology, and find every term that references a concept
- R9.1 A term is linked to an ontology class (any `owl:Class` that is not a SKOS concept) with the SKOS mapping relations of R3, governed the same way. Linking is optional and can happen any time after the term exists.
- R9.2 Each concept in a group's list, and each SKOS concept's page, has **Link to ontology**: a mapping proposal with that term as the source and only ontology classes offered as targets. The group list shows each term's current links, or "not linked yet".
- R9.3 Every term page (class or concept) shows **Vocabulary terms that reference this**: each term from any group that is mapped to it, in either direction, with its group, the relation read from the term's side, and whether the link is asserted, approved or pending. Rejected and retired links are not listed.
- R9.4 The Designer's detail panel shows the same list for the selected class.
- R9.5 `vocab-gov references <iri>` prints the same list as JSON.

**Accepted when:** in the MBSE demo, linking Systems Engineering "requirement" (exact match, approved) and Test & Evaluation "requirement" (related match, left pending) to `dt:Requirement`, then opening `dt:Requirement`, lists both terms with their groups and statuses; the same two appear in the Designer panel and in `vocab-gov references`; the group lists show each link, and the link form offers only ontology classes.

R7–R9 were verified on 2026-10-16 on a copy of the MBSE demo database.

### Non-functional requirements
- N1 All user-supplied text is escaped and all IRIs validated (`sparqlString` / `sparqlIri`). No raw interpolation into SPARQL.
- N2 Nothing typed is lost on refresh. The selected view and shared label live in the URL, and unsent proposal input is kept as a draft.
- N3 Failed saves show an error and keep the input.
- N4 Works with any Stardog database. Databases without concept schemes show an empty state that explains what is needed.
- N5 Unit tests cover shared-term detection and the SPARQL each approval generates (parsed with a real SPARQL parser). A browser test covers the end-to-end flow on sample data.

## Design

### Data model

Vocabulary data is plain SKOS, in whatever graphs the groups loaded it:

```turtle
cs:OrdersOfMagnitude a skos:Concept ;
    skos:inScheme cs:Scheme ;
    skos:prefLabel "orders of magnitude"@en ;
    skos:definition "Differences in growth rate between complexity classes ..."@en .
```

Governance data stays in `VOCAB:GOVERNANCE` (namespace `gov: <http://vocab.gov/ontology#>`). Proposals gain structured fields:

| Predicate | Used by |
|-----------|---------|
| `gov:proposedLabel`, `gov:proposedDefinition` | add, modify |
| `gov:proposedIri`, `gov:proposedScheme` | add |
| `gov:mappingSource`, `gov:mappingRelation`, `gov:mappingTarget` | mapping, unmap |
| `gov:appliedDate` | set when an approval applied the change |

The proposal record is the mapping's provenance (who proposed it, why, who approved it, when). This follows the spirit of SSSOM mapping metadata without needing a separate store. Approved mappings themselves are plain SKOS triples in `VOCAB:MAPPINGS`.

Bulk proposals also carry `gov:proposalBatch` (shared id) and `gov:batchSize`.

Group owner = steward of the `skos:ConceptScheme` (existing `gov:hasSteward`), so ownership has the same audit trail as stewardship.

### Where an approved change is written
The term's **home graph** is the named graph that holds its `rdf:type` triple, excluding the governance and mapping graphs. A new term goes in its scheme's home graph. If a term is only in the default graph, the change is written to the default graph. A new label or definition uses `skos:prefLabel` / `skos:definition` for SKOS concepts and `rdfs:label` / `rdfs:comment` otherwise. New literals are written without a language tag.

### Approval request
One SPARQL update request, operations in this order, each guarded by `WHERE { GRAPH <VOCAB:GOVERNANCE> { <proposal> gov:proposalStatus "pending" } }`:
1. the audit entry;
2. the change (table in R4.1);
3. the proposal's status, reviewer, date, comment and `gov:appliedDate`.

Stardog runs a multi-operation request in one transaction. Because the status is changed last, the earlier operations see `pending`. A second approval finds nothing pending and writes nothing.

### UI
A new **Communities** section in the sidebar:
- **Groups:** one card per concept scheme with owner (assignable), description, concept count and mapping count; expands to list concepts and definitions.
- **Shared Terms:** a list of labels used by two or more groups. Selecting one shows the groups' definitions side by side, the mappings between them, and a "Propose mapping" form (source, relation with explanation, target, justification). The selected label is kept in the URL; the unsent form is kept as a draft.
- **Shared Terms** also lists **similar wordings** below the identical labels, with the share of words in common and the two groups involved.
- **Mappings:**
  - a table of all mappings with origin and status (approved, asserted, pending, rejected, retired), justification, proposer and reviewer, filterable by status;
  - approved rows have a "Propose removal" action.

The **Review Queue** "New proposal" form gains the add/modify fields and the mapping type. Cards show the structured change. Resolved cards show "applied".

### Sample data
`samples/multi-community-vocabulary.trig` has three groups (Computer Science, Physics, Business Administration), each in its own named graph. Several labels overlap ("orders of magnitude", "model", "validation", "resolution"), each group defines them differently, and one mapping is asserted in the data so asserted and governed mappings can be compared.

## Out of scope (possible next steps)
- The "both owners" rule in Stardog itself (it can restrict who writes `VOCAB:MAPPINGS`, not require two parties).
- An in-app view of Stardog's server audit log (it is enabled locally via `stardog.properties` and verified to record each update with the authenticated account; reading it needs server file access).
- Semantic matching of definitions. Similar-wording suggestions are lexical (labels only). Voicebox or embeddings could also compare definitions and suggest a relation.
- Editing language-tagged labels per language.
- OWL classes as group members (groups are SKOS concept schemes; OWL ontologies would need a membership convention such as `rdfs:isDefinedBy`).
- Alternative labels in new terms, and bulk import from SKOS files (for example exported from another vocabulary editor). Bulk add takes CSV/TSV only.
