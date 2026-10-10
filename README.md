# Stardog Vocabulary Governance Library

A modern, browser-based vocabulary governance tool for browsing, managing, and analyzing ontologies stored in [Stardog](https://www.stardog.com/) Knowledge Graphs.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-8-purple) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Ontology Explorer** — Browse classes and properties with namespace-grouped sidebar, search, and status filtering
- **Graph Visualization** — Interactive D3-powered force-directed graph of class relationships with namespace coloring and lifecycle status indicators
- **Governance Workflows** — Assign lifecycle statuses (Active, Draft, Under Review, Deprecated, Retired) to any term with full audit logging
- **Communities** — Each group's SKOS concept scheme shown with its owner; **Shared Terms** puts one label's different meanings side by side and suggests similarly worded terms to map; **Mappings** lists asserted, approved, pending, rejected and retired mappings between groups (see [docs/communities-and-mappings.md](docs/communities-and-mappings.md))
- **Governed changes** — Proposals to add, modify, deprecate, map terms or remove a mapping go through review; approving one applies the change (mappings go to the `VOCAB:MAPPINGS` graph) together with its audit entry
- **Accounts and owner approval** — Optional sign-in with your Stardog account; group owners can be Stardog accounts, and an optional rule requires the owners of affected groups to approve changes (both owners for a mapping between two groups)
- **Designer View** — Hierarchical class diagram with property counts and lifecycle status
- **Impact Analysis** — Analyze upstream/downstream dependencies before making changes to your vocabulary
- **SHACL Constraints** — View SHACL shapes and validation rules associated with classes
- **Import & Export** — Export vocabularies as Turtle, JSON-LD, or CSV
- **Analytics Dashboard** — Visualize vocabulary health metrics with interactive charts
- **Theme Support** — Dark, Light, and Stardog brand themes

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ (required by Vite 8)
- A running [Stardog](https://www.stardog.com/) instance with at least one database containing an OWL/RDFS ontology

### Setup

```bash
# Clone the repository
git clone https://github.com/oaksofpemberley/stardog-vocab-library.git
cd stardog-vocab-library

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:5180](http://localhost:5180), pick a database from the dropdown, and connect. Switch databases any time from the selector at the bottom of the sidebar.

To try the Communities features, load the sample (three groups that define "orders of magnitude", "model", "validation" and more differently):

```bash
stardog-admin db create -n vocab_communities_demo \
  -o voicebox.enabled=true search.enabled=true search.semantic.enabled=true query.all.graphs=true \
  -- samples/multi-community-vocabulary.trig
stardog data add -g tag:stardog:api:context:schema -- vocab_communities_demo samples/voicebox-schema.ttl
```

The `-o` options and the second command are only needed for Voicebox (see below). In-app, **Help → Quick Start** walks through the whole flow.

### Configuration

Copy `.env.example` to `.env` (gitignored, never commit it) and set your values:

```bash
cp .env.example .env
```

The app talks to Stardog through the Vite dev proxy at `/stardog`, which avoids CORS. The proxy settings are read server-side only. They have no `VITE_` prefix, so credentials never reach the browser bundle.

**Local Stardog** (Docker or Stardog Desktop, the default):

```env
VITE_STARDOG_ENDPOINT=/stardog
STARDOG_URL=http://localhost:5820
STARDOG_USERNAME=<your user>
STARDOG_PASSWORD=<your password>
```

Leave the Bearer Token field empty. The proxy adds Basic auth.

**Stardog Cloud:**

```env
VITE_STARDOG_ENDPOINT=/stardog
STARDOG_URL=https://<your-endpoint>.stardog.cloud:5820
```

Paste a Bearer token into the connection form. A token entered in the app takes precedence over proxy credentials.

| Variable | Where it is used | Purpose |
|----------|------------------|---------|
| `VITE_STARDOG_ENDPOINT` | browser | Default endpoint in the connection form (`/stardog` = dev proxy) |
| `VITE_STARDOG_DB` | browser | Default database (optional; the form lists all databases) |
| `VITE_STARDOG_TOKEN` | browser | Optional default Bearer token |
| `STARDOG_URL` | dev proxy | Stardog server to forward to (default `http://localhost:5820`) |
| `STARDOG_USERNAME` / `STARDOG_PASSWORD` | dev proxy | Optional Basic auth added by the proxy |

The database list comes from `/admin/databases`, so the user needs permission to list databases. If listing fails, the form falls back to a free-text database field.

Connecting is read-only. The `VOCAB:GOVERNANCE` named graph is created in a database only when the first governance action (status, steward, note or proposal) is recorded there.

## Data and refresh behavior

Governance work (statuses, stewards, notes, proposals, reviews, audit entries) is written to Stardog, in the `VOCAB:GOVERNANCE` named graph of the database you are working in. It is never stored only in the browser. Each change is written in the same request as its audit entry, so both are saved or neither is.

What the browser keeps across a refresh:

| What | Where | Survives refresh | Survives clearing site data |
|------|-------|------------------|-----------------------------|
| Database, page, selected term, tab, search, filter | URL hash (`#db=…&view=…&term=…`) | Yes | Yes (it is in the URL) |
| Being connected | `localStorage` flag, cleared by **Disconnect** | Yes, reconnects automatically | No |
| Endpoint and your name | `localStorage` | Yes | No |
| Bearer token | `sessionStorage` | Yes | No (also cleared when the tab closes) |
| Unsent text (notes, steward, proposal form, review comment) | `localStorage` drafts, per database and term | Yes | No |

If a save is still in progress, the browser asks before leaving the page. If a save fails, the app shows the error and keeps what you typed.

## Voicebox

Approved changes are written to Stardog, so Stardog Voicebox can answer questions about them right away. For example: "Which terms in other groups are mapped to the Physics term 'orders of magnitude'?" or "Who approved that mapping, and why?" This only works if the database is set up for it:

1. **Database options:** `voicebox.enabled`, `search.enabled`, `search.semantic.enabled`, and `query.all.graphs=true`. The vocabularies, `VOCAB:MAPPINGS` and `VOCAB:GOVERNANCE` are all named graphs, and without `query.all.graphs` Voicebox only sees the default graph. Set the options when you create the database (as above). On an existing database, the first three can only be changed while it is offline.
2. **Schema:** load `samples/voicebox-schema.ttl` into `tag:stardog:api:context:schema`. Voicebox writes its queries from that graph. The file describes SKOS terms and mappings and the app's governance records.
   - It connects properties to classes with `schema:domainIncludes`, not `rdfs:domain`. Voicebox asks with reasoning on, and `rdfs:domain` would retype data.
   - It declares the mapping relations symmetric or inverse, as in the SKOS standard, so a mapping is found from either end.
   - It tells Voicebox that labels are language-tagged.

Without these, the app still works, but Voicebox says it cannot find the terms or mappings.

## Secured setup: Stardog enforces who may change what

The owner-approval rule above is enforced by the app. To have **Stardog itself** refuse changes, use named-graph security. The script below sets up a demo of it on a database built from the sample:

```bash
STARDOG_ADMIN_USER=admin STARDOG_ADMIN_PASSWORD=... scripts/setup-secured-demo.sh   # creates vocab_communities_secured
```

It uses only Stardog's HTTP API and is safe to re-run. Each run rebuilds the database and gives every account a new random password, written to `demo-accounts.local` (gitignored). It turns on `security.named.graphs` and grants:

| Account | Reads | May write | So it can |
|---------|-------|-----------|-----------|
| `vocab_app` (the app's shared proxy account) | everything in the database | `VOCAB:GOVERNANCE` | propose, comment and review; not apply any change |
| `alice` (Physics owner) | everything | `VOCAB:GOVERNANCE`, `urn:vocab:physics`, `VOCAB:MAPPINGS` | apply changes to Physics, write approved mappings |
| `bob` (Business owner) | everything | `VOCAB:GOVERNANCE`, `urn:vocab:business`, `VOCAB:MAPPINGS` | apply changes to Business, write approved mappings |
| `carol` (member) | everything | `VOCAB:GOVERNANCE` | propose and comment only |

Outside the secured database, `vocab_app` may read the databases in `VOCAB_APP_READ_DBS` (default: all, so the app can browse every database). It may write only those in `VOCAB_APP_WRITE_DBS` (default: the secured database and `vocab_communities_demo`). Anyone who can reach the app's dev server acts as `vocab_app`, so keep the write list short; to govern another database without signing in, add it there. The script passes credentials through a private temporary file and stdin, never on the command line.

Then put the `vocab_app` lines from `demo-accounts.local` in `.env`, restart `npm run dev`, sign in as alice, and in **Communities → Groups** assign Physics → account `alice` and Business Administration → account `bob`, then turn on owner approval. What to expect:

- **Writes Stardog refuses:** anything outside an account's grants, even through direct SPARQL that bypasses the app. The app explains the refusal ("Stardog refused this change: the Stardog account in use may not write to urn:vocab:physics…"). Because an approval is one transaction, a refused approval changes nothing and the proposal stays pending.
- **What the app adds on top:** the two-owner rule for a mapping between groups. Stardog can say who may write `VOCAB:MAPPINGS`, but not "both owners must agree".
- **Limits:**
  - Proposals and reviews must stay writable for everyone who takes part, so `VOCAB:GOVERNANCE` itself is not protected per entry.
  - With named-graph security, new graphs (a new group's vocabulary) need their own grants.
  - Stardog's own audit log is a server setting. The script does not change it; see below.

### Stardog's audit log: who really wrote what

The audit entries this app writes are a record kept by the app. Stardog's server audit log is an independent record: Stardog writes it, every entry carries the authenticated account, and neither the app nor database write access can change it (anyone with access to the server's files could). To turn it on, add this to `$STARDOG_HOME/stardog.properties` and restart Stardog:

```properties
logging.audit.enabled = true
logging.audit.type = json
logging.audit.file = audit.log
logging.audit.rotation.type = size
logging.audit.rotation.limit = 104857600
logging.audit.rotation.file.count = 10
logging.audit.rotation.compress = true
```

Each change then appears as a `Query` event carrying the full SPARQL update and `User=<account>`, followed by `TxCommit` (with the number of triples changed) or `TxRollback` (refused or failed). Read it with `stardog-admin log print --json $STARDOG_HOME/audit.log` or any JSON tool. A few things to know:

- It logs every server event, reads included, so it is verbose.
- It names the Stardog account, so changes made through the shared proxy account appear as `vocab_app`. Sign in personally when attribution matters.
- Only people with access to the server's files can read it.

## Security notes

- **Use a least-privilege Stardog account for the proxy, not `admin`.** `scripts/setup-secured-demo.sh` (below) creates `vocab_app` for this. It can read and write data but cannot create or drop databases or manage users. Put it in `.env` as `STARDOG_USERNAME` / `STARDOG_PASSWORD`.
- **The dev proxy is for local use.** Anyone who can reach port 5180 acts as the proxy's Stardog user. Vite listens on `localhost` only by default; do not start it with `--host` on a shared network. The proxy only adds credentials to same-origin requests, so other websites cannot use it (CSRF).
- **Sign in with personal Stardog accounts for accountable attribution.** The name in "Your Name" is self-reported. When users sign in, the app records the Stardog account Stardog itself reports (via a token it issues) on every audit entry, proposal and review. With the shared proxy login, everyone appears as the proxy's account. The password is used once to obtain a token and is never stored. The recorded account is written by the app, so someone writing to the database directly could forge it: treat it as a record, and use Stardog's own audit logging when you need proof of who changed what.
- **Owner approval is an app-enforced workflow, not a Stardog permission.** With "Require group owners to approve" on, the app only lets the owning accounts approve changes to their groups, hand groups over, or switch the rule off. Anyone with `write` on the database can still change the governance graph directly, so the audit log is a record, not tamper-proof evidence. For hard enforcement, use Stardog permissions on the graphs.
- The dev proxy strips `WWW-Authenticate` from Stardog's 401 responses, so a wrong sign-in password shows the app's error instead of a browser login popup.
- All values written to Stardog are escaped (`sparqlString`) and IRIs are validated (`sparqlIri`) in `src/lib/sparql.js`. Never build SPARQL by inserting raw text.
- CSV exports neutralise spreadsheet formulas (cells starting with `=`, `+`, `-`, `@`).
- Fonts are bundled with the app (no third-party requests), so it also works offline or air-gapped.

## How big a vocabulary it handles

Graph size (instance data) hardly matters: only the per-class instance counts read it, and on 5.8 million triples every query the app runs on connect finished in under 0.3 s. That count runs in the background with a 30-second limit; if it times out, the app just shows no counts. What grows with size is the **vocabulary** (classes, properties and SKOS concepts), because the app loads every term into the browser. Measured on a laptop with generated SKOS vocabularies (10 groups, realistic word frequencies):

| Terms | Load on connect | Explorer search (per keystroke) | Shared / similar terms (browser) | Browser memory |
|------:|---------------:|--------------------------------:|---------------------------------:|---------------:|
| 5,000 | ~1 s | fast | 13 ms / 32 ms | ~40 MB |
| 20,000 | ~1–2 s | 0.18 s | 25 ms / 77 ms | ~105 MB |
| 50,000 | ~2–3 s | 0.23 s | 48 ms / 173 ms | ~230 MB |

To stay responsive at that size, some views draw a capped number of items and say so:
- **Explorer:** lists the first 1,500 terms (search and filters still cover all of them).
- **Graph View:** draws the 1,000 best-connected classes.
- **Shared Terms:** compares up to 12 terms per label and lists the top 300 similar wordings. Words used by more than 50 terms are not used to suggest pairs.

Comfortable range: up to roughly 50,000 terms per database. Beyond that, initial load and browser memory grow linearly. A vocabulary in the hundreds of thousands of terms would need server-side paging, which the app does not do.

## Development

```bash
npm test        # unit tests (vitest): SPARQL escaping/injection, exports, diagram layout
npm run lint
npm run build
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 8 |
| Graph Viz | D3.js v7 |
| Charts | Recharts |
| Icons | Lucide React |
| Styling | Vanilla CSS with CSS custom properties |

## Project Structure

```
src/
├── components/
│   ├── AnalyticsView.jsx      # Vocabulary health dashboard
│   ├── AuditLog.jsx           # Change history viewer
│   ├── CommunityParts.jsx     # Mapping badges and the propose-mapping form
│   ├── ConnectionSetup.jsx    # Stardog connection form
│   ├── DesignerView.jsx       # Hierarchical class diagram
│   ├── ErrorBoundary.jsx      # Keeps a crash in one view from blanking the app
│   ├── Explorer.jsx           # Main ontology browser
│   ├── GovernancePanel.jsx    # Lifecycle status management
│   ├── GraphView.jsx          # D3 force-directed graph
│   ├── GroupsView.jsx         # Communities: groups (concept schemes) and owners
│   ├── ImpactAnalysis.jsx     # Dependency analysis
│   ├── ImportExport.jsx       # Vocabulary export (Turtle/JSON-LD/CSV)
│   ├── MappingsView.jsx       # Communities: all mappings and their status
│   ├── NamespaceSidebar.jsx   # Namespace-grouped term list
│   ├── ReviewQueue.jsx        # Governance review workflow
│   ├── SearchBar.jsx          # Search and filter controls
│   ├── SharedTermsView.jsx    # Communities: same term, different meanings
│   └── TermDetail.jsx         # Class/property detail view
├── contexts/
│   └── StardogContext.jsx     # Stardog connection & data state
├── lib/
│   ├── sparql.js              # SPARQL client, escaping (sparqlString/sparqlIri)
│   ├── governance.js          # Governance reads/writes (VOCAB:GOVERNANCE graph)
│   ├── ontologyQueries.js     # Ontology, scheme, concept and mapping queries
│   ├── communities.js         # Shared-term detection, mapping relations
│   ├── useCommunityData.js    # Data for the Communities views
│   ├── exporters.js           # Turtle / JSON-LD / CSV export
│   ├── layout.js              # Cycle-safe diagram layering
│   ├── storage.js             # Safe browser storage
│   ├── urlState.js            # Page state in the URL hash
│   ├── useDraft.js            # Unsent input that survives refresh
│   └── *.test.js              # Unit tests (npm test)
└── main.jsx                   # App entry point
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT
