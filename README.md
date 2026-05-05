# Stardog Vocabulary Governance Library

A modern, browser-based vocabulary governance tool for browsing, managing, and analyzing ontologies stored in [Stardog](https://www.stardog.com/) Knowledge Graphs.

![React](https://img.shields.io/badge/React-19-blue) ![Vite](https://img.shields.io/badge/Vite-8-purple) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Ontology Explorer** — Browse classes and properties with namespace-grouped sidebar, search, and status filtering
- **Graph Visualization** — Interactive D3-powered force-directed graph of class relationships with namespace coloring and lifecycle status indicators
- **Governance Workflows** — Assign lifecycle statuses (Active, Draft, Under Review, Deprecated, Retired) to any term with full audit logging
- **Impact Analysis** — Analyze upstream/downstream dependencies before making changes to your vocabulary
- **SHACL Constraints** — View SHACL shapes and validation rules associated with classes
- **Import & Export** — Export vocabularies as Turtle, JSON-LD, or CSV
- **Analytics Dashboard** — Visualize vocabulary health metrics with interactive charts
- **Theme Support** — Dark, Light, and Stardog brand themes

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A running [Stardog](https://www.stardog.com/) instance with at least one database containing an OWL/RDFS ontology

### Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/stardog-vocab-library.git
cd stardog-vocab-library

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser, then enter your Stardog connection details:

| Field | Example |
|-------|---------|
| Endpoint | `https://your-instance.stardog.cloud:5820` |
| Database | `my_knowledge_graph` |
| Bearer Token | Your Stardog API token |

### Environment Variables (optional)

Copy `.env.example` to `.env` to pre-fill connection settings:

```bash
cp .env.example .env
```

```env
VITE_STARDOG_ENDPOINT=https://your-instance.stardog.cloud:5820
VITE_STARDOG_DB=my_knowledge_graph
VITE_STARDOG_TOKEN=
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
│   ├── ConnectionSetup.jsx    # Stardog connection form
│   ├── Explorer.jsx           # Main ontology browser
│   ├── GovernancePanel.jsx    # Lifecycle status management
│   ├── GraphView.jsx          # D3 force-directed graph
│   ├── ImpactAnalysis.jsx     # Dependency analysis
│   ├── ImportExport.jsx       # Vocabulary export (Turtle/JSON-LD/CSV)
│   ├── NamespaceSidebar.jsx   # Namespace-grouped term list
│   ├── ReviewQueue.jsx        # Governance review workflow
│   ├── SearchBar.jsx          # Search and filter controls
│   └── TermDetail.jsx         # Class/property detail view
├── contexts/
│   └── StardogContext.jsx     # Stardog connection & data state
├── lib/
│   └── sparql.js              # Generic SPARQL client
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
