import React from 'react';

const OPTIONS = [
  { value: '30d',  label: 'Last 30 days' },
  { value: '90d',  label: 'Last 90 days' },
  { value: '12m',  label: 'Last 12 months' },
  { value: 'all',  label: 'All time' },
];

export default function DateRangeFilter({ value, onChange }) {
  return (
    <div className="tab-row" style={{ marginBottom: 0 }}>
      {OPTIONS.map(o => (
        <button
          key={o.value}
          className={`tab-btn${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
