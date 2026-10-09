import { useState, useMemo, useEffect, useRef } from 'react';
import { HELP_ARTICLES, HELP_SECTIONS } from '../lib/helpContent';
import { searchHelp, tokenize } from '../lib/helpSearch';
import { readHash, updateHash } from '../lib/urlState';
import { Search, X, CheckCircle2, XCircle, Lightbulb, BookOpenText, ArrowRight, ArrowLeft } from 'lucide-react';

const byId = new Map(HELP_ARTICLES.map(a => [a.id, a]));

/**
 * Quick Start and Help: searchable articles from src/lib/helpContent.js.
 * The open article and the search live in the URL, so a refresh or a shared link returns to them.
 * onNavigate(view) opens an app page; onClose (shown before connecting) returns to the connection form.
 */
export default function HelpView({ start = 'overview', onNavigate, onClose }) {
  const [articleId, setArticleIdState] = useState(() => (byId.has(readHash().get('article')) ? readHash().get('article') : start));
  const [query, setQueryState] = useState(() => readHash().get('hq') || '');
  const contentRef = useRef(null);
  const searchRef = useRef(null);

  const setArticleId = (id) => { setArticleIdState(id); updateHash({ article: id }); contentRef.current?.scrollTo(0, 0); };
  const setQuery = (q) => { setQueryState(q); updateHash({ hq: q }); };

  const results = useMemo(() => searchHelp(HELP_ARTICLES, query), [query]);
  const terms = useMemo(() => tokenize(query), [query]);
  const article = byId.get(articleId) || byId.get(start);

  // "/" jumps to the search box, as on most documentation sites
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`split-h help-shell ${onClose ? 'standalone' : ''}`}>
      <aside className="panel-left split-panel help-nav">
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ margin: '0 0 10px' }}>
            <ArrowLeft size={13} /> Back to connect
          </button>
        )}
        <div className="help-search">
          <Search size={15} className="help-search-icon" />
          <input
            ref={searchRef}
            className="input"
            placeholder="Search help (press /)"
            aria-label="Search help"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setQuery('');
              if (e.key === 'Enter' && results[0]) setArticleId(results[0].article.id);
            }}
          />
          {query && <button className="help-search-clear" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}
        </div>

        {query.trim() ? (
          <div className="help-results" role="list" aria-label="Search results">
            <div className="help-results-count">
              {results.length === 0
                ? <>No results for “{query}”. Try fewer or different words, or read <button className="link-button" onClick={() => { setQuery(''); setArticleId('limits'); }}>What it can and can&apos;t do</button>.</>
                : <>{results.length} result{results.length === 1 ? '' : 's'}</>}
            </div>
            {results.map(r => (
              <button key={r.article.id} role="listitem"
                className={`help-result ${r.article.id === article.id ? 'active' : ''}`}
                onClick={() => setArticleId(r.article.id)}>
                <span className="help-result-section">{r.article.section}</span>
                <span className="help-result-title"><Highlight text={r.article.title} terms={terms} /></span>
                <span className="help-result-snippet"><Highlight text={r.snippet} terms={terms} /></span>
              </button>
            ))}
          </div>
        ) : (
          HELP_SECTIONS.map(section => (
            <div key={section} className="help-section">
              <div className="nav-section">{section}</div>
              {HELP_ARTICLES.filter(a => a.section === section).map(a => (
                <button key={a.id} className={`help-link ${a.id === article.id ? 'active' : ''}`} onClick={() => setArticleId(a.id)}>
                  {a.title}
                </button>
              ))}
            </div>
          ))
        )}
      </aside>

      <article className="panel-center split-panel help-article" ref={contentRef}>
        <div className="help-article-inner fade-in" key={article.id}>
          <div className="help-crumb"><BookOpenText size={13} /> {article.section}</div>
          <h1 className="help-title">{article.title}</h1>
          <p className="help-summary">{article.summary}</p>
          {article.body.map((block, i) => <Block key={i} block={block} terms={terms} onNavigate={onNavigate} />)}

          {article.related?.length > 0 && (
            <div className="help-related">
              <div className="help-related-head">Related</div>
              {article.related.map(id => (
                <button key={id} className="help-related-link" onClick={() => setArticleId(id)}>
                  {byId.get(id).title} <ArrowRight size={13} />
                </button>
              ))}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function Block({ block, terms, onNavigate }) {
  const t = (text) => <Inline text={text} terms={terms} />;
  switch (block.type) {
    case 'h': return <h2 className="help-h">{t(block.text)}</h2>;
    case 'p': return <p className="help-p">{t(block.text)}</p>;
    case 'steps': return <ol className="help-steps">{block.items.map((item, i) => <li key={i}>{t(item)}</li>)}</ol>;
    case 'list': return <ul className="help-list">{block.items.map((item, i) => <li key={i}>{t(item)}</li>)}</ul>;
    case 'story':
      return (
        <aside className="help-story">
          <div className="help-story-title">{t(block.title)}</div>
          <p>{t(block.text)}</p>
        </aside>
      );
    case 'tip':
      return <div className="help-tip"><Lightbulb size={15} /><span>{t(block.text)}</span></div>;
    case 'can':
    case 'cannot': {
      const can = block.type === 'can';
      const Icon = can ? CheckCircle2 : XCircle;
      return (
        <div className={`help-limits ${block.type}`}>
          <div className="help-limits-head"><Icon size={15} /> {can ? 'You can' : 'You can’t'}</div>
          <ul>{block.items.map((item, i) => <li key={i}>{t(item)}</li>)}</ul>
        </div>
      );
    }
    case 'table':
      return (
        <div className="table-wrap help-table">
          <table className="table">
            <thead><tr>{block.head.map((h, i) => <th key={i}>{t(h)}</th>)}</tr></thead>
            <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{t(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    case 'goto':
      // Before connecting there are no pages to open, so the button is left out
      return onNavigate ? (
        <button className="btn btn-secondary btn-sm help-goto" onClick={() => onNavigate(block.view)}>
          {block.label} <ArrowRight size={13} />
        </button>
      ) : null;
    default: return null;
  }
}

/** **bold** and `code`, with search words highlighted */
function Inline({ text, terms }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}><Highlight text={part.slice(2, -2)} terms={terms} /></strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="help-code">{part.slice(1, -1)}</code>;
    return <Highlight key={i} text={part} terms={terms} />;
  });
}

/** Marks words that start with a search word ("map" marks "mapping") */
function Highlight({ text, terms }) {
  if (!terms?.length) return text;
  const pattern = new RegExp(`\\b(${terms.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[a-z0-9]*`, 'gi');
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(pattern)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark key={m.index} className="help-mark">{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
