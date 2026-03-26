// Formats a YYYY-MM-DD date string as DD-MM-YYYY (NZ format)
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}-${m}-${y}`;
}
