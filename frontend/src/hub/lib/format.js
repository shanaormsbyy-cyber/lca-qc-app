const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parse(d) {
  if (!d) return null;
  // Timestamps (YYYY-MM-DD HH:MM:SS, stored in UTC) → NZ calendar date.
  if (String(d).length > 10) {
    const ts = new Date(String(d).replace(' ', 'T') + (String(d).includes('Z') ? '' : 'Z'));
    if (!Number.isNaN(ts.getTime())) d = ts.toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
  }
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return null;
  return new Date(Date.UTC(y, m - 1, day));
}

export function fmtDate(d) {
  const dt = parse(d);
  return dt ? `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}` : '—';
}

export function fmtShort(d) {
  const dt = parse(d);
  return dt ? `${DAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()].toUpperCase()}` : '—';
}

export function fmtDayMonth(d) {
  const dt = parse(d);
  return dt ? `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}` : '—';
}

export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m || 0).padStart(2, '0')}${suffix}`;
}

export function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' });
}

export function addDays(date, n) {
  const dt = parse(date);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const PLAN_TYPES = {
  new_hire: { label: 'New Hire', tone: 'cyan' },
  development: { label: 'Development', tone: 'blue' },
  pip: { label: 'PIP', tone: 'amber' },
  cross_training: { label: 'Cross-Training', tone: 'purple' },
  reassessment: { label: 'Reassessment', tone: 'outline' },
};

export const LEVELS = {
  not_started: { label: 'Not Started', tone: 'grey' },
  introduced: { label: 'Introduced', tone: 'grey' },
  practicing: { label: 'Practicing', tone: 'amber' },
  competent: { label: 'Competent', tone: 'green' },
};

export const STAGES = ['Setup & Induction', 'Foundations Training', 'Room Competencies', 'Shadow Period', 'Final Assessment & Sign Off'];

export function fileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
