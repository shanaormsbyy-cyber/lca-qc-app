// Complaints take points off a cleaner's QC score (minor 0.5, moderate 1, serious 4).
// Pages showing all-time QC averages subtract complaint points from the last 90 days.
import api from '../api';

export async function fetchDeductions() {
  try {
    const r = await api.get('/complaints/deductions');
    return r.data.deductions || {};
  } catch (_) {
    return {};
  }
}

export function pointsFor(deductions, staffId) {
  return deductions && deductions[staffId] ? deductions[staffId].points : 0;
}

// Same rounding rule as the server (backend/lib/complaintScore.js) so numbers always match.
export function round1(x) {
  return Math.round(Math.round(x * 100) / 10) / 10;
}

export function adjust(avg, points) {
  if (avg == null) return null;
  return Math.max(0, round1(round1(avg) - (points || 0)));
}

export function fmtScore(v) {
  if (v == null) return '—';
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

// "83% checks − 4 complaints" — shown under a score when complaints changed it.
export function breakdownText(checksAvg, points) {
  if (!points || checksAvg == null) return null;
  return `${fmtScore(round1(checksAvg))} checks − ${points} for complaints`;
}
