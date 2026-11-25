// Complaints reduce a cleaner's QC score: points are taken off their QC average for every
// complaint dated inside the window being looked at. Addressed complaints still count.
const POINTS = { minor: 0.5, moderate: 1, serious: 4 };

// Window used where a score has no date range of its own (all-time averages, watchlist, etc.).
const DEFAULT_DAYS = 90;

function todayNZ() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
}

function shift(date, { days = 0, months = 0 }) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d + days));
  return dt.toISOString().slice(0, 10);
}

// '30d' | '90d' | '180d' | '12m' | 'all' → first date in the window (null = no start).
function periodStart(period, today = todayNZ()) {
  if (!period || period === 'all') return null;
  const m = /^(\d+)([dm])$/.exec(period);
  if (!m) return shift(today, { days: -DEFAULT_DAYS });
  return m[2] === 'd' ? shift(today, { days: -Number(m[1]) }) : shift(today, { months: -Number(m[1]) });
}

function defaultWindow(today = todayNZ()) {
  return { from: shift(today, { days: -DEFAULT_DAYS }), to: today };
}

function emptyDeduction() {
  return { points: 0, minor: 0, moderate: 0, serious: 0, count: 0 };
}

function addRow(acc, severity, cnt) {
  if (!(severity in POINTS)) return;
  acc[severity] += cnt;
  acc.count += cnt;
  acc.points = Math.round((acc.points + POINTS[severity] * cnt) * 10) / 10;
}

function windowClause({ from, to }) {
  const parts = [];
  const params = [];
  if (from) { parts.push('date >= ?'); params.push(from); }
  if (to) { parts.push('date <= ?'); params.push(to); }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
}

function complaintDeduction(db, staffId, win = defaultWindow()) {
  const w = windowClause(win);
  const acc = emptyDeduction();
  for (const r of db.prepare(`SELECT severity, COUNT(*) AS cnt FROM complaints WHERE staff_id = ?${w.sql} GROUP BY severity`)
    .all(staffId, ...w.params)) addRow(acc, r.severity, r.cnt);
  return acc;
}

// { [staff_id]: deduction } for every cleaner with at least one complaint in the window.
function deductionsByStaff(db, win = defaultWindow()) {
  const w = windowClause(win);
  const out = {};
  for (const r of db.prepare(`SELECT staff_id, severity, COUNT(*) AS cnt FROM complaints WHERE 1 = 1${w.sql} GROUP BY staff_id, severity`)
    .all(...w.params)) {
    out[r.staff_id] = out[r.staff_id] || emptyDeduction();
    addRow(out[r.staff_id], r.severity, r.cnt);
  }
  return out;
}

// One decimal place, rounding via 2 decimals first so 79.0499999… (float noise) and 79.05 agree.
// The browser uses the same rule (frontend/src/lib/complaintScore.js).
function round1(x) {
  return Math.round(Math.round(x * 100) / 10) / 10;
}

// QC average after complaint points; never below 0; null when there are no checks to adjust.
function adjustScore(avg, points) {
  if (avg == null) return null;
  return Math.max(0, round1(round1(avg) - (points || 0)));
}

module.exports = { round1, POINTS, DEFAULT_DAYS, todayNZ, periodStart, defaultWindow, complaintDeduction, deductionsByStaff, adjustScore };
