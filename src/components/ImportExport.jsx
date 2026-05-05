import { useState } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { toPrefixed, getNamespace, getLocalName } from '../lib/sparql';
import { ArrowDownUp, Download, Upload, FileText, Check } from 'lucide-react';

export default function ImportExport() {
  const { classes, properties, shaclShapes, instanceCounts, govStatuses } = useStardog();
  const [exportFormat, setExportFormat] = useState('turtle');
  const [exported, setExported] = useState(false);

  const exportTurtle = () => {
    const prefixes = [
      '@prefix ex:   <http://example.org/ontology#> .',
      '@prefix org:  <http://example.org/ontology/org#> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '@prefix owl:  <http://www.w3.org/2002/07/owl#> .',
      '@prefix so:   <https://schema.org/> .',
      '@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .',
      '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .',
      '',
    ];

    const lines = [...prefixes];

    // Classes
    lines.push('# ── Classes ──');
    for (const c of classes) {
      const pref = toPrefixed(c.uri);
      lines.push(`${pref} a ${c.type || 'owl:Class'} ;`);
      if (c.label) lines.push(`    rdfs:label "${c.label}" ;`);
      if (c.comment) lines.push(`    rdfs:comment "${c.comment}" ;`);
      // Remove trailing ; and add .
      lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, ' .');
      lines.push('');
    }

    // Properties
    lines.push('# ── Properties ──');
    for (const p of properties) {
      const pref = toPrefixed(p.uri);
      const typeStr = p.type === 'ObjectProperty' ? 'owl:ObjectProperty' : 'owl:DatatypeProperty';
      lines.push(`${pref} a ${typeStr} ;`);
      if (p.label) lines.push(`    rdfs:label "${p.label}" ;`);
      if (p.comment) lines.push(`    rdfs:comment "${p.comment}" ;`);
      for (const d of (p.domains || [])) lines.push(`    so:domainIncludes ${toPrefixed(d)} ;`);
      for (const r of (p.ranges || [])) lines.push(`    so:rangeIncludes ${toPrefixed(r)} ;`);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, ' .');
      lines.push('');
    }

    return lines.join('\n');
  };

  const exportCSV = () => {
    const rows = [['URI', 'Label', 'Type', 'Comment', 'Status', 'Instances'].join(',')];
    for (const c of classes) {
      rows.push([
        c.uri, `"${c.label || ''}"`, c.type || 'owl:Class',
        `"${(c.comment || '').replace(/"/g, '""')}"`,
        govStatuses[c.uri] || 'Active',
        instanceCounts[c.uri] || 0,
      ].join(','));
    }
    for (const p of properties) {
      rows.push([
        p.uri, `"${p.label || ''}"`, p.type || 'Property',
        `"${(p.comment || '').replace(/"/g, '""')}"`,
        govStatuses[p.uri] || 'Active', '',
      ].join(','));
    }
    return rows.join('\n');
  };

  const exportJsonLd = () => {
    const context = {
      'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
      'owl': 'http://www.w3.org/2002/07/owl#',
      'ex': 'http://example.org/ontology#',
      'org': 'http://example.org/ontology/org#',
    };
    const graph = classes.map(c => ({
      '@id': c.uri,
      '@type': c.type || 'owl:Class',
      'rdfs:label': c.label || undefined,
      'rdfs:comment': c.comment || undefined,
    }));
    return JSON.stringify({ '@context': context, '@graph': graph }, null, 2);
  };

  const handleExport = () => {
    let content, filename, mimeType;
    switch (exportFormat) {
      case 'turtle':
        content = exportTurtle(); filename = 'vocabulary.ttl'; mimeType = 'text/turtle'; break;
      case 'csv':
        content = exportCSV(); filename = 'vocabulary.csv'; mimeType = 'text/csv'; break;
      case 'jsonld':
        content = exportJsonLd(); filename = 'vocabulary.jsonld'; mimeType = 'application/ld+json'; break;
      default:
        content = exportTurtle(); filename = 'vocabulary.ttl'; mimeType = 'text/turtle';
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ArrowDownUp size={22} color="var(--accent)" /> Import & Export
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Export your vocabulary in standard formats for sharing or backup.
      </p>

      {/* Export */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={15} /> Export Vocabulary
          </span>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
          Export {classes.length} classes and {properties.length} properties.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'turtle', label: 'Turtle (.ttl)', desc: 'Standard RDF serialization' },
            { id: 'jsonld', label: 'JSON-LD (.jsonld)', desc: 'JSON linked data' },
            { id: 'csv', label: 'CSV (.csv)', desc: 'Spreadsheet compatible' },
          ].map(fmt => (
            <button key={fmt.id}
              className={`btn ${exportFormat === fmt.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setExportFormat(fmt.id)}
              style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', padding: '10px 14px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{fmt.label}</span>
              <span style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: 400 }}>{fmt.desc}</span>
            </button>
          ))}
        </div>

        <button className="btn btn-primary w-full" onClick={handleExport}
          style={{ justifyContent: 'center', padding: '12px' }}>
          {exported ? <><Check size={15} /> Exported!</> : <><Download size={15} /> Export {exportFormat.toUpperCase()}</>}
        </button>
      </div>

      {/* Info */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={15} /> Vocabulary Summary
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr><td style={{ fontWeight: 600 }}>Classes</td><td>{classes.length}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Properties</td><td>{properties.length}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>SHACL Constraints</td><td>{shaclShapes.length}</td></tr>
              <tr><td style={{ fontWeight: 600 }}>Total Instances</td><td>{Object.values(instanceCounts).reduce((a, b) => a + b, 0).toLocaleString()}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
