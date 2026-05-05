import { useMemo } from 'react';
import { useStardog } from '../contexts/StardogContext';
import { getNamespace, toPrefixed } from '../lib/sparql';
import { BarChart3, Shield, Users, Layers, Hash, GitBranch, CheckCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#a78bfa', '#14b8a6'];

export default function AnalyticsView() {
  const { classes, properties, instanceCounts, shaclShapes, namedGraphs, govStatuses, govStewards } = useStardog();

  // Terms by status
  const statusData = useMemo(() => {
    const counts = { Active: 0, Draft: 0, UnderReview: 0, Deprecated: 0, Retired: 0 };
    const allTerms = [...classes.map(c => c.uri), ...properties.map(p => p.uri)];
    for (const uri of allTerms) {
      const s = govStatuses[uri] || 'Active';
      if (counts[s] !== undefined) counts[s]++;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  }, [classes, properties, govStatuses]);

  // By namespace
  const nsData = useMemo(() => {
    const counts = {};
    for (const c of classes) {
      const ns = getNamespace(c.uri);
      const label = ns.split('/').filter(Boolean).pop()?.replace('#', '') || ns;
      counts[label] = (counts[label] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [classes]);

  // Instance distribution (top 10)
  const instanceData = useMemo(() => {
    return Object.entries(instanceCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([uri, count]) => ({
        name: toPrefixed(uri).replace(/^[^:]+:/, ''),
        count,
      }));
  }, [instanceCounts]);

  // Stewardship coverage
  const totalTerms = classes.length + properties.length;
  const stewardedCount = Object.keys(govStewards).length;
  const stewardPct = totalTerms > 0 ? Math.round((stewardedCount / totalTerms) * 100) : 0;

  // SHACL coverage
  const classesWithShacl = new Set(shaclShapes.map(s => s.targetClass)).size;
  const shaclPct = classes.length > 0 ? Math.round((classesWithShacl / classes.length) * 100) : 0;

  const STATUS_COLORS = { Active: '#22c55e', Draft: '#eab308', UnderReview: '#3b82f6', Deprecated: '#f97316', Retired: '#ef4444' };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        <BarChart3 size={22} color="var(--accent)" /> Vocabulary Health
      </h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
        Governance metrics and vocabulary composition overview.
      </p>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <SummaryCard icon={<Hash size={18} />} label="Classes" value={classes.length} color="var(--accent)" />
        <SummaryCard icon={<GitBranch size={18} />} label="Properties" value={properties.length} color="#a78bfa" />
        <SummaryCard icon={<Shield size={18} />} label="SHACL Shapes" value={shaclShapes.length} color="var(--info)" />
        <SummaryCard icon={<Layers size={18} />} label="Named Graphs" value={namedGraphs.length} color="var(--warning)" />
        <SummaryCard icon={<Users size={18} />} label="Stewardship" value={`${stewardPct}%`} color={stewardPct > 50 ? 'var(--success)' : 'var(--danger)'} />
        <SummaryCard icon={<CheckCircle size={18} />} label="SHACL Coverage" value={`${shaclPct}%`} color={shaclPct > 50 ? 'var(--success)' : 'var(--warning)'} />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Status Distribution */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Terms by Lifecycle Status</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={80} innerRadius={45} paddingAngle={3}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={STATUS_COLORS[entry.name] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {statusData.map(d => (
              <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[d.name] }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>

        {/* By Namespace */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Classes by Namespace</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={nsData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={80} innerRadius={45} paddingAngle={3}>
                {nsData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {nsData.map((d, i) => (
              <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length] }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>

        {/* Instance Distribution */}
        {instanceData.length > 0 && (
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div className="card-title" style={{ marginBottom: 16 }}>Instance Distribution (Top 10)</div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={instanceData}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}
