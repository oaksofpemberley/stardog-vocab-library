import { useState, useMemo } from 'react';
import { useStardog } from '../contexts/StardogContext';
import NamespaceSidebar from './NamespaceSidebar';
import TermDetail from './TermDetail';
import SearchBar from './SearchBar';
import { getNamespace, toPrefixed } from '../lib/sparql';

export default function Explorer() {
  const { classes, properties } = useStardog();
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // All terms = classes + properties as unified list
  const allTerms = useMemo(() => {
    const terms = [
      ...classes.map(c => ({ ...c, kind: 'class' })),
      ...properties.map(p => ({ ...p, kind: 'property' })),
    ];
    return terms;
  }, [classes, properties]);

  // Filtered terms
  const filteredTerms = useMemo(() => {
    let result = allTerms;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.label?.toLowerCase().includes(q) ||
        t.uri?.toLowerCase().includes(q) ||
        t.comment?.toLowerCase().includes(q) ||
        toPrefixed(t.uri).toLowerCase().includes(q)
      );
    }
    return result;
  }, [allTerms, searchQuery]);

  const selected = selectedTerm
    ? allTerms.find(t => t.uri === selectedTerm) || null
    : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search bar */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <SearchBar value={searchQuery} onChange={setSearchQuery} statusFilter={statusFilter} onStatusFilter={setStatusFilter} />
      </div>

      {/* Three-panel layout */}
      <div className="split-h" style={{ flex: 1, minHeight: 0 }}>
        {/* Left: Namespace sidebar */}
        <div className="panel-left split-panel">
          <NamespaceSidebar
            terms={filteredTerms}
            selectedUri={selectedTerm}
            onSelect={setSelectedTerm}
            statusFilter={statusFilter}
          />
        </div>

        {/* Center: Term detail */}
        <div className="panel-center split-panel" style={{ padding: 20 }}>
          {selected ? (
            <TermDetail term={selected} key={selected.uri} />
          ) : (
            <div className="empty-state" style={{ height: '100%' }}>
              <BookOpenIcon />
              <h3>Select a Term</h3>
              <p>Choose a class or property from the sidebar to view its details, governance status, and relationships.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BookOpenIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}
