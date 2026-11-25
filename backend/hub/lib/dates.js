// All dates are plain 'YYYY-MM-DD' strings in the business's timezone (NZ).
const TZ = 'Pacific/Auckland';

function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// 'overdue' | 'today' | 'this_week' (within the next 7 days) | 'later'
function badgeFor(dueDate, todayStr) {
  if (dueDate < todayStr) return 'overdue';
  if (dueDate === todayStr) return 'today';
  if (dueDate <= addDays(todayStr, 7)) return 'this_week';
  return 'later';
}

module.exports = { today, addDays, badgeFor, TZ };
