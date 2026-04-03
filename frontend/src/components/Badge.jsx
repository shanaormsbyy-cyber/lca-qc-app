import React from 'react';

export function ScoreBadge({ score }) {
  if (score == null) return <span className="badge badge-grey">—</span>;
  const cls = score >= 85 ? 'badge-green' : score >= 70 ? 'badge-amber' : 'badge-red';
  return <span className={`badge ${cls}`}>{Math.round(score)}%</span>;
}

export function ScoreBar({ score }) {
  if (score == null) return null;
  const cls = score >= 85 ? 'green' : score >= 70 ? 'amber' : 'red';
  return (
    <div className="score-bar" style={{ width: '100%' }}>
      <div className={`score-fill ${cls}`} style={{ width: `${Math.min(100, score)}%` }} />
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    pending:  ['badge-amber', 'Pending'],
    complete: ['badge-green', 'Complete'],
    overdue:  ['badge-red',   'Overdue'],
    due_soon: ['badge-amber', 'Due Soon'],
    ok:       ['badge-green', 'OK'],
  };
  const [cls, label] = map[status] || ['badge-grey', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function DueBadge({ status, daysLeft }) {
  if (status === 'inactive') return <span className="badge badge-grey">Inactive</span>;
  if (status === 'overdue') return <span className="badge badge-red">⚠ {Math.abs(daysLeft || 0)}d overdue</span>;
  if (status === 'due_soon') return <span className="badge badge-amber">⏰ Due in {daysLeft}d</span>;
  return <span className="badge badge-green">✓ {daysLeft}d left</span>;
}
