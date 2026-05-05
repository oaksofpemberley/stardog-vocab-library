import { Search, Filter } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'Review' },
  { value: 'deprecated', label: 'Deprecated' },
];

export default function SearchBar({ value, onChange, statusFilter, onStatusFilter }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <Search size={15} style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
        }} />
        <input
          className="input"
          placeholder="Search terms, properties, URIs..."
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ paddingLeft: 34 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 3 }}>
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`btn btn-sm ${statusFilter === opt.value ? '' : 'btn-ghost'}`}
            onClick={() => onStatusFilter(opt.value)}
            style={{
              background: statusFilter === opt.value ? 'var(--accent)' : undefined,
              color: statusFilter === opt.value ? '#fff' : undefined,
              fontSize: '0.72rem', padding: '4px 10px',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
