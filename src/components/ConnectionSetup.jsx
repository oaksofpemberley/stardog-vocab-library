import { useState, useEffect } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { Database, Key, Globe, Server, Loader2, CheckCircle, XCircle, UserCheck } from 'lucide-react';

export default function ConnectionSetup({ onOpenHelp }) {
  const { connection, updateConnection, loadOntology, signIn, loading, error, databases, refreshDatabases } = useStardog();
  const [testResult, setTestResult] = useState(null);
  const [signInError, setSignInError] = useState(null);
  // Optional personal sign-in. The password lives only in this form and is exchanged for a token.
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');

  // Offer the server's databases as a dropdown; fall back to free text if listing fails
  useEffect(() => {
    const t = setTimeout(() => refreshDatabases().catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [connection.endpoint, connection.token, refreshDatabases]);

  const handleConnect = async () => {
    setTestResult(null);
    setSignInError(null);
    try {
      if (account && password) {
        await signIn(account, password);
        setPassword('');
      } else {
        await loadOntology();
      }
      setTestResult('success');
    } catch (e) {
      setSignInError(e.message);
      setTestResult('error');
    }
  };

  return (
    <div className="connection-page">
      <div className="connection-card fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent), #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Database size={22} color="#fff" />
          </div>
          <div>
            <h2>Vocabulary Governance</h2>
          </div>
        </div>
        <p className="subtitle">Connect to a Stardog Knowledge Graph to browse, govern, and analyze your vocabulary.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label"><Globe size={12} style={{ marginRight: 4 }} />Stardog Endpoint</label>
            <input
              className="input"
              placeholder="/stardog (dev proxy) or https://your-instance.stardog.cloud:5820"
              value={connection.endpoint}
              onChange={e => updateConnection({ endpoint: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label"><Server size={12} style={{ marginRight: 4 }} />Database</label>
            {databases.length > 0 ? (
              <select
                className="select"
                value={connection.db}
                onChange={e => updateConnection({ db: e.target.value })}
              >
                {!databases.includes(connection.db) && <option value={connection.db}>{connection.db || 'Select a database…'}</option>}
                {databases.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : (
              <input
                className="input"
                placeholder="my_knowledge_graph"
                value={connection.db}
                onChange={e => updateConnection({ db: e.target.value })}
              />
            )}
          </div>

          <div className="form-group">
            <label className="form-label"><UserCheck size={12} style={{ marginRight: 4 }} />Sign in as a Stardog user (optional)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input" placeholder="Stardog username" autoComplete="username" value={account} onChange={e => setAccount(e.target.value)} />
              <input className="input" type="password" placeholder="Password" autoComplete="current-password" value={password}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleConnect()} />
            </div>
            <span className="form-help" style={{ margin: '4px 0 0' }}>
              Leave empty to use the shared connection. Signing in records your Stardog account on governance actions and lets you approve changes for groups you own.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label"><Key size={12} style={{ marginRight: 4 }} />Or paste a Bearer token (optional)</label>
            <textarea
              className="textarea"
              placeholder="eyJhbGciOiJ..."
              value={connection.token}
              onChange={e => updateConnection({ token: e.target.value })}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', minHeight: 60 }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Your Name (for audit trail)</label>
            <input
              className="input"
              placeholder="jane.doe@org.com"
              value={connection.username || ''}
              onChange={e => updateConnection({ username: e.target.value })}
            />
          </div>

          <button className="btn btn-primary w-full" onClick={handleConnect} disabled={loading}
            style={{ justifyContent: 'center', padding: '12px 16px', fontSize: '0.95rem' }}>
            {loading ? <><Loader2 size={16} className="spin" /> Connecting...</> : 'Connect & Load Ontology'}
          </button>

          {testResult === 'success' && (
            <div className="connection-status success fade-in">
              <CheckCircle size={16} /> Connected successfully
            </div>
          )}
          {(testResult === 'error' || error) && (
            <div className="connection-status error fade-in">
              <XCircle size={16} /> {signInError || error || 'Connection failed'}
            </div>
          )}
        </div>

        <p style={{ marginTop: 20, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Endpoint and name are remembered in this browser. Passwords are never stored; a sign-in token is kept only until the tab closes.
        </p>
        {onOpenHelp && (
          <p style={{ marginTop: 8, fontSize: '0.8rem', textAlign: 'center' }}>
            New here? <button className="link-button" onClick={onOpenHelp}>Read the quick start</button>
          </p>
        )}
      </div>
    </div>
  );
}
