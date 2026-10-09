import { useState, useEffect, useCallback } from 'react';
import { StardogProvider, useStardog } from './contexts/StardogContext';
import ConnectionSetup from './components/ConnectionSetup';
import Explorer from './components/Explorer';
import ReviewQueue from './components/ReviewQueue';
import AuditLog from './components/AuditLog';
import AnalyticsView from './components/AnalyticsView';
import GraphView from './components/GraphView';
import DesignerView from './components/DesignerView';
import ImportExport from './components/ImportExport';
import ErrorBoundary from './components/ErrorBoundary';
import GroupsView from './components/GroupsView';
import SharedTermsView from './components/SharedTermsView';
import MappingsView from './components/MappingsView';
import { readHash, updateHash } from './lib/urlState';
import { loadText, saveText } from './lib/storage';
import {
  BookOpen, Scale, BarChart3, Network, ArrowDownUp, LayoutGrid,
  Database, ListChecks, History, LogOut, Moon, Sun, Palette, Users, GitCompareArrows, Waypoints,
} from 'lucide-react';
import './index.css';

const THEMES = [
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'stardog', label: 'Stardog', icon: Palette },
];

function AppContent() {
  const { connected, connection, classes, loading, databases, refreshDatabases, switchDatabase, disconnect } = useStardog();
  // The current page lives in the URL hash so a refresh returns to it
  const [activeView, setActiveView] = useState(() => readHash().get('view') || 'explore');
  const [theme, setTheme] = useState(() => loadText('local', 'vocab_theme') || 'dark');

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    saveText('local', 'vocab_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (connected) updateHash({ view: activeView });
  }, [connected, activeView]);

  useEffect(() => {
    if (connected) refreshDatabases().catch(() => {});
  }, [connected, refreshDatabases]);

  const cycleTheme = useCallback(() => {
    const idx = THEMES.findIndex(t => t.id === theme);
    setTheme(THEMES[(idx + 1) % THEMES.length].id);
  }, [theme]);

  if (!connected) return <ConnectionSetup />;

  const navItems = [
    { section: 'Explore' },
    { id: 'explore', label: 'Vocabulary Explorer', icon: BookOpen },
    { id: 'graph', label: 'Graph View', icon: Network },
    { id: 'designer', label: 'Designer View', icon: LayoutGrid },
    { section: 'Communities' },
    { id: 'groups', label: 'Groups', icon: Users },
    { id: 'shared', label: 'Shared Terms', icon: GitCompareArrows },
    { id: 'mappings', label: 'Mappings', icon: Waypoints },
    { section: 'Govern' },
    { id: 'queue', label: 'Review Queue', icon: ListChecks },
    { id: 'audit', label: 'Audit Log', icon: History },
    { section: 'Analyze' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { section: 'Tools' },
    { id: 'import', label: 'Import / Export', icon: ArrowDownUp },
  ];

  const renderView = () => {
    switch (activeView) {
      case 'explore': return <Explorer />;
      case 'graph': return <GraphView />;
      case 'designer': return <DesignerView />;
      case 'groups': return <GroupsView />;
      case 'shared': return <SharedTermsView />;
      case 'mappings': return <MappingsView />;
      case 'queue': return <ReviewQueue />;
      case 'audit': return <AuditLog />;
      case 'analytics': return <AnalyticsView />;
      case 'import': return <ImportExport />;
      default: return <Explorer />;
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className="app-sidebar">
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, var(--accent), #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Scale size={17} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.2 }}>Vocab Governance</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{classes.length} terms loaded</div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 4 }}>
          {navItems.map((item, i) => {
            if (item.section) {
              return <div key={i} className="nav-section">{item.section}</div>;
            }
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                onClick={() => setActiveView(item.id)}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Connection info + theme */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Database size={14} color="var(--success)" />
            {databases.length > 0 ? (
              <select
                className="select"
                title="Switch database"
                value={connection.db}
                disabled={loading}
                onChange={e => switchDatabase(e.target.value)}
                style={{ flex: 1, minWidth: 0, fontSize: '0.75rem', padding: '4px 6px' }}
              >
                {!databases.includes(connection.db) && <option value={connection.db}>{connection.db}</option>}
                {databases.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1 }} className="truncate">
                {connection.db}
              </span>
            )}
          </div>
          {/* Theme switcher */}
          <div style={{
            display: 'flex', gap: 4, marginBottom: 8,
            padding: 3, background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-md)',
          }}>
            {THEMES.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  title={t.label}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    padding: '5px 6px', borderRadius: 'var(--radius-sm)',
                    fontSize: '0.68rem', fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer', transition: 'all 0.15s',
                    border: 'none',
                    background: theme === t.id ? 'var(--accent)' : 'transparent',
                    color: theme === t.id ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  <Icon size={12} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <button className="btn btn-ghost btn-sm w-full" onClick={disconnect}
            style={{ justifyContent: 'center' }}>
            <LogOut size={13} /> Disconnect
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main className="app-content" key={connection.db}>
        {/* Keyed per page and database: a crash in one view never blanks the whole app */}
        <ErrorBoundary key={activeView}>
          {renderView()}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StardogProvider>
      <AppContent />
    </StardogProvider>
  );
}
