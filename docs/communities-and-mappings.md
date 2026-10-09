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

**Accepted when:** the sample data shows "orders of magnitude" with three different definitions side by side, together with the one mapping asserted in the source data.

### R3. Mappings are governed like terms
- R3.1 Supported relations are the SKOS mapping properties: `exactMatch`, `closeMatch`, `broadMatch`, `narrowMatch`, `relatedMatch`. Each is explained in plain words in the UI.
- R3.2 A mapping proposal records source, relation, target, justification, proposer and date. A justification is required.
- R3.3 Mapping proposals go through the existing Review Queue. Approving or rejecting records the reviewer, date and comment, and writes an audit entry.
- R3.4 Approved mappings are written as plain SKOS triples to a dedicated named graph, `VOCAB:MAPPINGS`, so any SPARQL client or Voicebox can use them. Neither group's vocabulary graph is modified: the mapping belongs to the relationship, not to either group.
- R3.5 A Mappings view lists all mappings with their origin and status:
  - **asserted**: found in a vocabulary's own data;
  - **approved**: governed, materialized in `VOCAB:MAPPINGS`;
  - **pending** or **rejected**: proposals.

**Accepted when:** proposing a `closeMatch` between two groups' terms, then approving it, makes the triple appear in `VOCAB:MAPPINGS`, the Mappings view shows it as approved with the justification and approver, and rejecting another proposal writes nothing to `VOCAB:MAPPINGS`.

### R4. Approved proposals apply their change
- R4.1 Proposal types and what approval does:

  | Type | Proposed fields | Approval writes |
  |------|-----------------|-----------------|
  | Add term | group, IRI, label, definition | a new `skos:Concept` in the group's graph |
  | Modify term | new label and/or new definition | replaces the label/definition in the term's own graph |
  | Deprecate term | — | status `Deprecated` and `owl:deprecated true` in the term's graph |
  | Map terms | source, relation, target, justification | the mapping triple in `VOCAB:MAPPINGS` |

- R4.2 The change, the proposal's new status and the audit entry are written in **one** update request, so they are applied together or not at all.
- R4.3 Every write in an approval is conditional on the proposal still being `pending`, so approving twice (two reviewers, a double click) cannot apply a change twice.
- R4.4 Rejecting writes nothing outside the governance graph.
- R4.5 Resolved proposals show whether the change was applied.

**Accepted when:** each of the four types, once approved, produces exactly the triples in the table, verified directly in Stardog.

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
| `gov:mappingSource`, `gov:mappingRelation`, `gov:mappingTarget` | mapping |
| `gov:appliedDate` | set when an approval applied the change |

The proposal record is the mapping's provenance (who proposed it, why, who approved it, when). This follows the spirit of SSSOM mapping metadata without needing a separate store. Approved mappings themselves are plain SKOS triples in `VOCAB:MAPPINGS`.

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
- **Mappings:** a table of all mappings with origin and status, justification, proposer and reviewer, filterable by status.

The **Review Queue** "New proposal" form gains the add/modify fields and the mapping type. Cards show the structured change. Resolved cards show "applied".

### Sample data
`samples/multi-community-vocabulary.trig` has three groups (Computer Science, Physics, Business Administration), each in its own named graph. Several labels overlap ("orders of magnitude", "model", "validation", "resolution"), each group defines them differently, and one mapping is asserted in the data so asserted and governed mappings can be compared.

## Out of scope (possible next steps)
- Removing or superseding an approved mapping (today: propose the replacement, and reject or deprecate in data).
- Per-user identity in the audit trail (needs per-user Stardog accounts; see README security notes).
- Fuzzy or semantic matching of labels (today: exact match after normalization). Voicebox or embeddings could suggest candidate mappings later.
- Editing language-tagged labels per language.
- OWL classes as group members (groups are SKOS concept schemes).
