const { today: todayFn, addDays } = require('./dates');

function recordUse(db, systemId, source, sourceId, usedAt = todayFn()) {
  db.prepare('INSERT INTO system_uses (system_id, source, source_id, used_at) VALUES (?, ?, ?, ?)').run(systemId, source, sourceId, usedAt);
}

function removeUses(db, source, sourceId) {
  db.prepare('DELETE FROM system_uses WHERE source = ? AND source_id = ?').run(source, sourceId);
}

// Windows: last30 = (today-30, today], prev30 = (today-60, today-30].
function usageCounts(db, today) {
  const bySystem = {};
  for (const r of db.prepare('SELECT system_id, COUNT(*) n FROM system_uses GROUP BY system_id').all()) bySystem[r.system_id] = r.n;
  const d30 = addDays(today, -30);
  const d60 = addDays(today, -60);
  const last30 = db.prepare('SELECT COUNT(*) n FROM system_uses WHERE used_at > ? AND used_at <= ?').get(d30, today).n;
  const prev30 = db.prepare('SELECT COUNT(*) n FROM system_uses WHERE used_at > ? AND used_at <= ?').get(d60, d30).n;
  const changePct = prev30 === 0 ? null : Math.round(((last30 - prev30) / prev30) * 100);
  return { bySystem, last30, prev30, changePct };
}

module.exports = { recordUse, removeUses, usageCounts };
