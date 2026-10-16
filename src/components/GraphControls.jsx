import { useState } from 'react';
import { searchNodes } from '../lib/graphModel';
import { toPrefixed } from '../lib/sparql';
import { Search, Crosshair, Maximize2, ZoomIn, ZoomOut, Expand } from 'lucide-react';

/**
 * The toolbar shared by Graph View and Designer View (docs/graph-views.md, G2–G4):
 * Find, Focus (1–3 links) / Show all, the switches, zoom buttons, and what is drawn.
 */
export default function GraphControls({ title, icon, controls, graph, view, zoom, termCount }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = searchNodes(graph.nodes, query);
  const labelOf = (id) => graph.nodes.find(n => n.id === id)?.label || toPrefixed(id);

  const pick = (node) => {
    setQuery('');
    setActive(0);
    controls.setFocus(node.id);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) pick(results[active]);
    else if (e.key === 'Escape') setQuery('');
  };

  const toggle = (key, label, help) => (
    <label className="graph-toggle" title={help}>
      <input type="checkbox" checked={Boolean(controls[key])} onChange={e => controls.set({ [key]: e.target.checked })} /> {label}
    </label>
  );

  return (
    <div className="graph-toolbar">
      <div className="graph-toolbar-row">
        <div className="graph-toolbar-title">{icon}<span>{title}</span>
          <span className="designer-count">{view.nodes.length} of {graph.nodes.length} classes · {view.edges.length} links{termCount ? ` · ${termCount} group terms` : ''}</span>
        </div>

        <div className="graph-find">
          <Search size={14} className="graph-find-icon" />
          <input className="input" value={query} placeholder="Find a class…" aria-label="Find a class"
            role="combobox" aria-expanded={results.length > 0} aria-controls="graph-find-results"
            onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} />
          {results.length > 0 && (
            <ul className="graph-find-results" id="graph-find-results" role="listbox">
              {results.map((n, i) => (
                <li key={n.id} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
                  onMouseDown={e => { e.preventDefault(); pick(n); }} onMouseEnter={() => setActive(i)}>
                  <strong>{n.label}</strong> <span className="mono-muted">{toPrefixed(n.id)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="graph-zoom" role="group" aria-label="Zoom">
          <button className="btn btn-ghost btn-sm" onClick={zoom.out} aria-label="Zoom out" title="Zoom out"><ZoomOut size={15} /></button>
          <button className="btn btn-ghost btn-sm" onClick={zoom.in} aria-label="Zoom in" title="Zoom in"><ZoomIn size={15} /></button>
          <button className="btn btn-ghost btn-sm" onClick={zoom.fit} aria-label="Fit to screen" title="Fit to screen"><Maximize2 size={15} /></button>
        </div>
      </div>

      <div className="graph-toolbar-row">
        {view.focus ? (
          <div className="graph-scope">
            <Crosshair size={14} />
            <span>Around <strong>{labelOf(view.focus)}</strong>,</span>
            <span className="graph-hops" role="group" aria-label="Links out">
              {[1, 2, 3].map(h => (
                <button key={h} className={`btn btn-xs ${controls.hops === h ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => controls.set({ hops: h })} aria-pressed={controls.hops === h}>{h}</button>
              ))}
            </span>
            <span>link{controls.hops === 1 ? '' : 's'} out</span>
            <button className="btn btn-secondary btn-xs" onClick={controls.showEverything}><Expand size={12} /> Show all</button>
          </div>
        ) : (
          <div className="graph-scope">
            <span>Whole graph{view.hidden > 0 ? ` (${view.hidden} unconnected classes hidden)` : ''}</span>
            {controls.selected && (
              <button className="btn btn-secondary btn-xs" onClick={() => controls.setFocus(controls.selected)}><Crosshair size={12} /> Focus on selected</button>
            )}
          </div>
        )}
        <div className="graph-toggles">
          {toggle('hierarchy', 'Hierarchy', 'Draw subclass links (rdfs:subClassOf)')}
          {toggle('terms', 'Group terms', 'Draw the groups\' vocabulary terms mapped to each class')}
          {!view.focus && (
            <label className="graph-toggle" title="Classes with no links at all">
              <input type="checkbox" checked={!view.hideUnconnected} onChange={e => controls.set({ unconnected: !e.target.checked })} /> Unconnected
            </label>
          )}
          {toggle('deprecated', 'Deprecated', 'Show deprecated and retired classes')}
        </div>
      </div>

      {view.auto && (
        <div className="list-cap-note graph-note" role="status">
          {graph.nodes.length.toLocaleString()} classes are too many to read at once, so this starts at
          {graph.edges.some(e => e.kind === 'subclass') ? ' the top of the class hierarchy. ' : ' the best-connected class. '}
          Use <strong>Find</strong> to jump to any class, or <button className="link-button" onClick={controls.showEverything}>show all</button>.
        </div>
      )}
    </div>
  );
}
