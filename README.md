# Stardog Vocabulary Governance Library

A modern, browser-based vocabulary governance tool for browsing, managing, and analyzing ontologies stored in [Stardog](https://www.stardog.com/) Knowledge Graphs.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-8-purple) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Ontology Explorer** — Browse classes and properties with namespace-grouped sidebar, search, and status filtering
- **Graph Visualization** — Interactive D3-powered force-directed graph of class relationships with namespace coloring and lifecycle status indicators
- **Governance Workflows** — Assign lifecycle statuses (Active, Draft, Under Review, Deprecated, Retired) to any term with full audit logging
- **Communities** — Each group's SKOS concept scheme shown with its owner; **Shared Terms** puts one label's different meanings side by side and suggests similarly worded terms to map; **Mappings** lists asserted, approved, pending, rejected and retired mappings between groups (see [docs/communities-and-mappings.md](docs/communities-and-mappings.md))
- **Governed changes** — Proposals to add, modify, deprecate, map terms or remove a mapping go through review; approving one applies the change (mappings go to the `VOCAB:MAPPINGS` graph) together with its audit entry
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
stardog-admin db create -n vocab_communities_demo
stardog data add vocab_communities_demo samples/multi-community-vocabulary.trig
```

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

## Security notes

- **Use a least-privilege Stardog account for the proxy, not `admin`.** The app needs `read` on the databases it browses and `write` on the ones where you record governance. It never needs to create or drop databases or manage users. For example:

  ```bash
  stardog-admin role add vocab_app_role
  stardog-admin role grant -a read  -o "db:*" vocab_app_role
  stardog-admin role grant -a write -o "db:*" vocab_app_role
  # create a user (see: stardog-admin help user add), then:
  stardog-admin user addrole -R vocab_app_role vocab_app
  ```

  Put that user in `.env` as `STARDOG_USERNAME` / `STARDOG_PASSWORD`. Narrow `db:*` to specific databases where you can.
- **The dev proxy is for local use.** Anyone who can reach port 5180 acts as the proxy's Stardog user. Vite listens on `localhost` only by default; do not start it with `--host` on a shared network. The proxy only adds credentials to same-origin requests, so other websites cannot use it (CSRF).
- **The audit log is a record, not tamper-proof evidence.** The name in the audit trail is whatever the user typed in "Your Name", and anyone with `write` on the database can change the governance graph. For accountable attribution, give each person their own Stardog account (Bearer token) and rely on Stardog's own access controls and logs.
- All values written to Stardog are escaped (`sparqlString`) and IRIs are validated (`sparqlIri`) in `src/lib/sparql.js`. Never build SPARQL by inserting raw text.
- CSV exports neutralise spreadsheet formulas (cells starting with `=`, `+`, `-`, `@`).
- Fonts are bundled with the app (no third-party requests), so it also works offline or air-gapped.

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
