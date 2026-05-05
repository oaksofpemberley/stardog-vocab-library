/**
 * SPARQL queries for ontology introspection.
 * Supports both OWL and SKOS vocabularies.
 */

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

/** Discover all properties — uses separate var names to avoid Stardog rebind errors */
export const PROPERTIES_QUERY = `
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX so: <https://schema.org/>

SELECT DISTINCT ?prop ?label ?comment ?type ?soDomain ?rdfsDomain ?soRange ?rdfsRange WHERE {
  {
    ?prop a owl:ObjectProperty .
    BIND("ObjectProperty" AS ?type)
  } UNION {
    ?prop a owl:DatatypeProperty .
    BIND("DatatypeProperty" AS ?type)
  }
  OPTIONAL { ?prop rdfs:label ?label }
  OPTIONAL { ?prop rdfs:comment ?comment }
  OPTIONAL { ?prop so:domainIncludes ?soDomain }
  OPTIONAL { ?prop rdfs:domain ?rdfsDomain }
  OPTIONAL { ?prop so:rangeIncludes ?soRange }
  OPTIONAL { ?prop rdfs:range ?rdfsRange }
  FILTER(!isBlank(?prop))
}
ORDER BY ?label
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
    ?prop so:domainIncludes <${classUri}> .
  } UNION {
    ?prop rdfs:domain <${classUri}> .
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

SELECT ?relationship ?relatedTerm ?relatedLabel WHERE {
  {
    ?relatedTerm so:domainIncludes <${termUri}> .
    BIND("property with this domain" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    ?relatedTerm so:rangeIncludes <${termUri}> .
    BIND("property with this range" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    ?relatedTerm rdfs:domain <${termUri}> .
    BIND("rdfs:domain reference" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    ?relatedTerm rdfs:range <${termUri}> .
    BIND("rdfs:range reference" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  } UNION {
    ?relatedTerm sh:targetClass <${termUri}> .
    BIND("SHACL shape target" AS ?relationship)
    OPTIONAL { ?relatedTerm rdfs:label ?relatedLabel }
  }
}
`;
}

/** Instance count for a single class */
export function instanceCountQuery(classUri) {
  return `SELECT (COUNT(?s) AS ?count) WHERE { ?s a <${classUri}> }`;
}
