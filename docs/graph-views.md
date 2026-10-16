# Graph View and Designer View: navigating real ontologies

Requirements for making both pictures usable on large ontologies, and for showing groups' vocabulary terms in them.

## Problem

Measured on a 1,538-class ontology (BFO/CCO-based, ontology spread over 22 named graphs):
- **Graph View** drew the 1,000 best-connected classes as a ring of unlabeled dots. Most classes have no object property between them, so almost nothing was connected.
- **Designer View** put 1,400 unconnected classes in one row, 287,682 px wide.
- Neither view drew `rdfs:subClassOf`, although the class hierarchy (1,553 links) is most of that ontology's structure.
- SKOS concepts and concept schemes were drawn as unconnected class nodes.
- There was no way to find a class by name, to see only part of the graph, or (in Graph View) to see a class's details.
- Neither view showed which groups' terms reference a class, so "how many vocabulary terms point at this concept?" could only be answered on the term page.

## Requirements

### G1. Structure
- G1.1 Edges are drawn for object properties (domain → range, labelled with the property) and for `rdfs:subClassOf` (child → parent, labelled "is a", drawn differently). The hierarchy can be switched off.
- G1.2 Only ontology classes are nodes. SKOS concepts and concept schemes are never class nodes (see G4).

### G2. Find and focus
- G2.1 A **Find** box matches class labels and IRIs as you type; picking a result selects the class and moves the view to it.
- G2.2 **Focus** shows the selected class and everything within 1, 2 or 3 links of it (either direction), instead of the whole graph. **Show all** returns to the whole graph. The focused class is kept in the URL.
- G2.3 When the whole graph would show more than 150 classes, the view opens focused on the best-connected class, 2 links out, and says so, with Find and Show all next to the message.
- G2.4 Unconnected classes can be hidden. With Show all on a large graph they are hidden by default.

### G3. Reading the picture
- G3.1 Zoom in, zoom out and fit-to-screen buttons, in addition to the scroll wheel and dragging.
- G3.2 When zoomed out, class names are hidden, except for the selected class and its neighbours; edge labels show only when zoomed in or on hover.
- G3.3 Clicking a class opens a details panel in both views: name, IRI, status, **Open in Explorer**, **Focus here**, its relationships (each one clickable, to move to that class), properties, and the vocabulary terms that reference it.
- G3.4 Graph View computes a large layout before drawing it, so the page stays responsive.
- G3.5 Designer View wraps a layer that has more than 12 classes onto further rows, and orders each row to put connected classes near each other.

### G4. Vocabulary terms in the picture
- G4.1 A **Group terms** switch draws, around each visible class, the groups' terms mapped to it (asserted, approved or pending, as in R9 of [communities-and-mappings.md](communities-and-mappings.md)). Each term is a small label coloured by group, joined to the class by a dashed line marked with the relation; pending links are fainter.
- G4.2 Each class with referencing terms shows their count, even when the switch is off.
- G4.3 The details panel lists the terms (as on the term page).

### Non-functional
- N1 The graph model (edges, neighbourhoods, term overlay, search) is pure functions with unit tests.
- N2 On the 1,538-class ontology, opening either view and focusing a class responds within a second, and Graph View stays interactive.

**Accepted when:** on the 1,538-class ontology, both views open focused with readable labels, Find jumps to a named class, Show all with the hierarchy draws a connected tree instead of a ring or a single row, and the MBSE demo shows "requirement" from two groups attached to the Requirement class in both views.

**Verified on 2026-10-16:**
- 1,538-class ontology: both views open around "entity", the top of the hierarchy (81 classes). Find → "Measurement Unit of Area" focused it, selected it, and put it in the URL.
- Show all draws all 1,538 classes as one connected structure. Graph View: 1.4 s, then a steady 122 fps (before: a ring of 1,000 unlabeled dots). Designer View: 3.4 s, a 2,293 × 20,842 px tree (before: one row 287,682 px wide).
- MBSE demo: Requirement shows "requirement" from Systems Engineering (exact match, approved) and Test & Evaluation (related match, pending, drawn fainter); Simulation Model shows "model" from Modeling & Simulation. "Open in Explorer" opens the class with the same list.
