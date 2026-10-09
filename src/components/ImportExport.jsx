import { useState } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { toTurtle, toJsonLd, toCsv } from '../lib/exporters';
import { ArrowDownUp, Download, FileText, Check } from 'lucide-react';

export default function ImportExport() {
  const { classes, properties, shaclShapes, instanceCounts, govStatuses } = useStardog();
  const [exportFormat, setExportFormat] = useState('turtle');
  const [exported, setExported] = useState(false);
  const [exportError, setExportError] = useState(null);

  const handleExport = () => {
    const vocab = { classes, properties, govStatuses, instanceCounts };
    let content, filename, mimeType;
    setExportError(null);
    try {
      switch (exportFormat) {
        case 'csv':
          content = toCsv(vocab); filename = 'vocabulary.csv'; mimeType = 'text/csv;charset=utf-8'; break;
        case 'jsonld':
          content = toJsonLd(vocab); filename = 'vocabulary.jsonld'; mimeType = 'application/ld+json'; break;
        default:
          content = toTurtle(vocab); filename = 'vocabulary.ttl'; mimeType = 'text/turtle';
      }
    } catch (e) {
      setExportError(`Export failed: ${e.message}`);
      return;
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
        {exportError && <div className="connection-status error" role="alert" style={{ marginTop: 12 }}>{exportError}</div>}
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
