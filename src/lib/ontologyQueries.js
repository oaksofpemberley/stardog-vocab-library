/**
 * SPARQL queries for ontology introspection.
 * Supports both OWL and SKOS vocabularies.
 */
import { sparqlIri, val } from './sparql.js';

/** Discover all classes (OWL + SKOS) */
export const CLASSES_QUERY = `
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?class ?label ?comment ?type WHERE {
  {
    ?class a owl:Class .
    BIND("owl:Class" AS ?type)
  } UNION {
    ?class a skos:Concept .
    BIND("skos:Concept" AS ?type)
  } UNION {
    ?class a skos:ConceptScheme .
    BIND("skos:ConceptScheme" AS ?type)
  }
  OPTIONAL { ?class rdfs:label ?rdfsLabel }
  OPTIONAL { ?class skos:prefLabel ?skosLabel }
  BIND(COALESCE(?rdfsLabel, ?skosLabel, "") AS ?label)
  OPTIONAL { ?class rdfs:comment ?rdfsComment }
  OPTIONAL { ?class skos:definition ?skosComment }
  BIND(COALESCE(?rdfsComment, ?skosComment, "") AS ?comment)
  FILTER(!isBlank(?class))
}
ORDER BY ?label
`;

/**
 * Discover all properties: one row per (property, key, value), merged by propertiesFromBindings.
 * One OPTIONAL over a UNION, not one OPTIONAL per attribute: chained OPTIONALs multiply every
 * value, and a database holding its ontology in 22 named graphs produced 288M rows (3+ minutes).
 */
export const PROPERTIES_QUERY = `
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX so: <https://schema.org/>

SELECT DISTINCT ?prop ?type ?key ?value WHERE {
  {
    ?prop a owl:ObjectProperty .
    BIND("ObjectProperty" AS ?type)
  } UNION {
    ?prop a owl:DatatypeProperty .
    BIND("DatatypeProperty" AS ?type)
  }
  FILTER(!isBlank(?prop))
  OPTIONAL {
    { ?prop rdfs:label ?value . BIND("label" AS ?key) }
    UNION { ?prop rdfs:comment ?value . BIND("comment" AS ?key) }
    UNION { ?prop so:domainIncludes ?value . BIND("soDomain" AS ?key) }
    UNION { ?prop rdfs:domain ?value . BIND("rdfsDomain" AS ?key) }
    UNION { ?prop so:rangeIncludes ?value . BIND("soRange" AS ?key) }
    UNION { ?prop rdfs:range ?value . BIND("rdfsRange" AS ?key) }
  }
}
`;

/**
 * Merge PROPERTIES_QUERY rows into one entry per property, sorted by label. schema.org
 * domainIncludes/rangeIncludes win over rdfs:domain/range when a property has both.
 */
export function propertiesFromBindings(bindings) {
  const byUri = new Map();
  for (const b of bindings) {
    const uri = val(b, 'prop');
    if (isBuiltInTerm(uri)) continue;
    let p = byUri.get(uri);
    if (!p) {
      p = { uri, label: '', comment: '', type: val(b, 'type'), soDomain: [], rdfsDomain: [], soRange: [], rdfsRange: [] };
      byUri.set(uri, p);
    }
    const key = val(b, 'key'), value = val(b, 'value');
    // Several labels (e.g. per language): keep the smallest, so the choice doesn't depend on row order
    if (key === 'label' || key === 'comment') { if (!p[key] || value < p[key]) p[key] = value; }
    else if (key && !p[key].includes(value)) p[key].push(value);
  }
  return [...byUri.values()]
    .map(({ soDomain, rdfsDomain, soRange, rdfsRange, ...p }) => {
      const domains = soDomain.length ? soDomain : rdfsDomain;
      const ranges = soRange.length ? soRange : rdfsRange;
      return { ...p, domain: domains[0] || '', range: ranges[0] || '', domains, ranges };
    })
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** Class hierarchy (child rdfs:subClassOf parent), named classes only; for Graph and Designer View */
export const SUBCLASS_QUERY = `
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?child ?parent WHERE {
  ?child rdfs:subClassOf ?parent .
  FILTER(isIRI(?child) && isIRI(?parent) && ?child != ?parent)
}
`;

/** Discover SKOS hierarchical relationships */
export const SKOS_HIERARCHY_QUERY = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?child ?parent WHERE {
  ?child skos:broader ?parent .
}
`;

/** Instance counts per class — LIMIT to avoid timeout on large DBs */
export const INSTANCE_COUNTS_QUERY = `
SELECT ?type (COUNT(?s) AS ?count) WHERE {
  ?s a ?type .
  FILTER(!isBlank(?type))
} GROUP BY ?type ORDER BY DESC(?count) LIMIT 100
`;

/** Named graphs */
export const NAMED_GRAPHS_QUERY = `
SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } } LIMIT 50
`;

/** SHACL shapes */
export const SHACL_SHAPES_QUERY = `
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?shape ?targetClass ?path ?name ?datatype ?minCount ?maxCount ?pattern ?nodeKind WHERE {
  ?shape a sh:NodeShape .
  ?shape sh:targetClass ?targetClass .
  OPTIONAL {
    ?shape sh:property ?propShape .
    ?propShape sh:path ?path .
    OPTIONAL { ?propShape sh:name ?name }
    OPTIONAL { ?propShape sh:datatype ?datatype }
    OPTIONAL { ?propShape sh:minCount ?minCount }
    OPTIONAL { ?propShape sh:maxCount ?maxCount }
    OPTIONAL { ?propShape sh:pattern ?pattern }
    OPTIONAL { ?propShape sh:nodeKind ?nodeKind }
  }
}
ORDER BY ?targetClass ?path
`;

/** Properties for a specific class — separate var names */
export function propertiesForClass(classUri) {
  return `
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX so: <https://schema.org/>

SELECT DISTINCT ?prop ?label ?comment ?type ?soRange ?rdfsRange WHERE {
  {
    ?prop so:domainIncludes ${sparqlIri(classUri)} .
  } UNION {
    ?prop rdfs:domain ${sparqlIri(classUri)} .
  }
  { ?prop a owl:ObjectProperty . BIND("ObjectProperty" AS ?type) }
  UNION
  { ?prop a owl:DatatypeProperty . BIND("DatatypeProperty" AS ?type) }
  OPTIONAL { ?prop rdfs:label ?label }
  OPTIONAL { ?prop rdfs:comment ?comment }
  OPTIONAL { ?prop so:rangeIncludes ?soRange }
  OPTIONAL { ?prop rdfs:range ?rdfsRange }
}
ORDER BY ?label
`;
}

/** Impact analysis for a term */
export function impactQuery(termUri) {
  return `
PREFIX so: <https://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?relationship ?relatedTerm ?relatedLabel WHERE {
  {
    ?relatedTerm so:domainIncludes ${sparqlIri(termUri)} .
    BIND("property with this domain" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    ?relatedTerm so:rangeIncludes ${sparqlIri(termUri)} .
    BIND("property with this range" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    ?relatedTerm rdfs:domain ${sparqlIri(termUri)} .
    BIND("rdfs:domain reference" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    ?relatedTerm rdfs:range ${sparqlIri(termUri)} .
    BIND("rdfs:range reference" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    ?relatedTerm sh:targetClass ${sparqlIri(termUri)} .
    BIND("SHACL shape target" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    # Other groups' terms mapped to or from this one: changing or deprecating it affects them
    VALUES ?mapping { skos:exactMatch skos:closeMatch skos:broadMatch skos:narrowMatch skos:relatedMatch }
    { ?relatedTerm ?mapping ${sparqlIri(termUri)} } UNION { ${sparqlIri(termUri)} ?mapping ?relatedTerm }
    BIND("mapped term (SKOS mapping)" AS ?relationship)
    OPTIONAL { ?relatedTerm skos:prefLabel ?relatedLabel }
  }
}
`;
}

/** Instance count for a single class */
export function instanceCountQuery(classUri) {
  return `SELECT (COUNT(?s) AS ?count) WHERE { ?s a ${sparqlIri(classUri)} }`;
}

/* ── Communities: SKOS concept schemes, concepts and mappings ── */

/** Concept schemes (groups) with label, description, declared owner and concept count */
export const SCHEMES_QUERY = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dct: <http://purl.org/dc/terms/>

SELECT ?scheme (SAMPLE(?l) AS ?label) (SAMPLE(?d) AS ?definition) (SAMPLE(?o) AS ?declaredOwner)
       (COUNT(DISTINCT ?c) AS ?concepts) WHERE {
  ?scheme a skos:ConceptScheme .
  OPTIONAL { ?scheme skos:prefLabel|rdfs:label|dct:title ?l }
  OPTIONAL { ?scheme skos:definition|rdfs:comment|dct:description ?d }
  OPTIONAL { ?scheme dct:creator|dct:publisher ?o }
  OPTIONAL { ?c skos:inScheme|skos:topConceptOf ?scheme }
  FILTER(!isBlank(?scheme))
}
GROUP BY ?scheme
ORDER BY ?label
`;

/** SKOS concepts with their scheme, labels and definition. altLabels are joined with U+001F. */
export const CONCEPTS_QUERY = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT ?concept ?scheme (SAMPLE(?pl) AS ?prefLabel) (SAMPLE(?def) AS ?definition)
       (GROUP_CONCAT(DISTINCT ?al; separator="\\u001f") AS ?altLabels) WHERE {
  ?concept a skos:Concept .
  OPTIONAL { ?concept skos:inScheme|skos:topConceptOf ?scheme }
  OPTIONAL { ?concept skos:prefLabel ?pl }
  OPTIONAL { ?concept skos:altLabel ?al }
  OPTIONAL { ?concept skos:definition ?def }
  FILTER(!isBlank(?concept))
}
GROUP BY ?concept ?scheme
`;

/** Every SKOS mapping triple, with the named graph it lives in (VOCAB:MAPPINGS = governed) */
export const MAPPINGS_QUERY = `
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

SELECT DISTINCT ?source ?relation ?target ?g WHERE {
  VALUES ?relation { skos:exactMatch skos:closeMatch skos:broadMatch skos:narrowMatch skos:relatedMatch }
  GRAPH ?g { ?source ?relation ?target }
}
`;

/** The named graph(s) holding a term's rdf:type, i.e. where an approved change to it is written */
export function homeGraphQuery(termUri) {
  return `
SELECT DISTINCT ?g ?type WHERE {
  GRAPH ?g { ${sparqlIri(termUri)} a ?type }
  FILTER(?g NOT IN (<VOCAB:GOVERNANCE>, <VOCAB:MAPPINGS>))
}
`;
}

/**
 * Namespaces of standard and app-internal vocabularies (SKOS itself, Dublin Core, the app's
 * governance terms, ...). They are often loaded into the schema graph so Voicebox understands
 * the data, but they are not the user's vocabulary, so the Explorer does not list them.
 */
export const BUILT_IN_NAMESPACES = [
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'http://www.w3.org/2000/01/rdf-schema#',
  'http://www.w3.org/2002/07/owl#',
  'http://www.w3.org/2001/XMLSchema#',
  'http://www.w3.org/2004/02/skos/core#',
  'http://purl.org/dc/terms/',
  'https://schema.org/',
  'http://vocab.gov/ontology#',
];

export const isBuiltInTerm = (uri) => BUILT_IN_NAMESPACES.some(ns => uri.startsWith(ns));
