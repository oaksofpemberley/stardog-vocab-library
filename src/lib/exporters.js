/**
 * Vocabulary export builders (pure functions, unit-tested).
 * Output must load back into Stardog / a spreadsheet without loss or surprises:
 *   - every namespace gets a declared prefix (or a full <IRI>), never a bare local name
 *   - every literal is escaped
 *   - CSV cells are quoted and guarded against spreadsheet formula injection
 */
import { sparqlString, sparqlIri, getNamespace, getLocalName } from './sparql';

const KNOWN_PREFIXES = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  schema: 'https://schema.org/',
};

/** Expand the app's compact type names ("owl:Class", "skos:Concept") to IRIs */
function typeIri(type, fallback) {
  const [prefix, local] = (type || fallback).split(':');
  return KNOWN_PREFIXES[prefix] ? KNOWN_PREFIXES[prefix] + local : KNOWN_PREFIXES.owl + 'Class';
}

const propertyTypeIri = (p) => KNOWN_PREFIXES.owl + (p.type === 'ObjectProperty' ? 'ObjectProperty' : 'DatatypeProperty');

/** Turtle (.ttl) */
export function toTurtle({ classes, properties }) {
  const prefixOf = new Map(Object.entries(KNOWN_PREFIXES).map(([p, ns]) => [ns, p]));
  let generated = 0;
  // Compact as prefix:local only when both parts are unambiguous; otherwise a full <IRI>
  const term = (uri) => {
    const ns = getNamespace(uri);
    const local = getLocalName(uri);
    if (ns === uri || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(local)) return sparqlIri(uri);
    if (!prefixOf.has(ns)) prefixOf.set(ns, `ns${++generated}`);
    return `${prefixOf.get(ns)}:${local}`;
  };

  const body = [];
  const block = (subject, typeUri, item, extra = []) => {
    const lines = [`${term(subject)} a ${term(typeUri)}`];
    if (item.label) lines.push(`rdfs:label ${sparqlString(item.label)}`);
    if (item.comment) lines.push(`rdfs:comment ${sparqlString(item.comment)}`);
    body.push(lines.concat(extra).join(' ;\n    ') + ' .', '');
  };

  body.push('# ── Classes ──');
  for (const c of classes) block(c.uri, typeIri(c.type, 'owl:Class'), c);

  body.push('# ── Properties ──');
  for (const p of properties) {
    block(p.uri, propertyTypeIri(p), p, [
      ...(p.domains || []).map(d => `schema:domainIncludes ${term(d)}`),
      ...(p.ranges || []).map(r => `schema:rangeIncludes ${term(r)}`),
    ]);
  }

  // Declare every prefix used (built after the body, which assigns generated prefixes)
  const header = [...prefixOf].map(([ns, p]) => `@prefix ${p}: ${sparqlIri(ns)} .`);
  return [...header, '', ...body].join('\n');
}

/** JSON-LD (.jsonld) — classes and properties, full IRIs throughout */
export function toJsonLd({ classes, properties }) {
  const ids = (list) => (list || []).map(u => ({ '@id': u }));
  const graph = [
    ...classes.map(c => ({
      '@id': c.uri,
      '@type': typeIri(c.type, 'owl:Class'),
      'rdfs:label': c.label || undefined,
      'rdfs:comment': c.comment || undefined,
    })),
    ...properties.map(p => ({
      '@id': p.uri,
      '@type': propertyTypeIri(p),
      'rdfs:label': p.label || undefined,
      'rdfs:comment': p.comment || undefined,
      'schema:domainIncludes': p.domains?.length ? ids(p.domains) : undefined,
      'schema:rangeIncludes': p.ranges?.length ? ids(p.ranges) : undefined,
    })),
  ];
  return JSON.stringify({ '@context': { rdfs: KNOWN_PREFIXES.rdfs, schema: KNOWN_PREFIXES.schema }, '@graph': graph }, null, 2);
}

/**
 * One CSV cell (RFC 4180). Cells starting with = + - @ (or tab/CR) would run as
 * formulas in Excel/Sheets, so they get a leading apostrophe (OWASP CSV injection).
 */
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** CSV (.csv) with a UTF-8 BOM so Excel reads non-ASCII labels correctly */
export function toCsv({ classes, properties, govStatuses = {}, instanceCounts = {} }) {
  const rows = [['URI', 'Label', 'Type', 'Comment', 'Status', 'Instances']];
  for (const c of classes) {
    rows.push([c.uri, c.label, c.type || 'owl:Class', c.comment, govStatuses[c.uri] || 'Active', instanceCounts[c.uri] || 0]);
  }
  for (const p of properties) {
    rows.push([p.uri, p.label, p.type || 'Property', p.comment, govStatuses[p.uri] || 'Active', '']);
  }
  return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
