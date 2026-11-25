const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getLoc, staffInLoc, propInLoc, staffIdSet } = require('../lib/location');

const router = express.Router();
router.use(requireAuth);

const { round1, POINTS, periodStart, todayNZ, defaultWindow, deductionsByStaff, adjustScore } = require('../lib/complaintScore');

// GET /api/complaints — all complaints, optional ?staff_id= filter
router.get('/', (req, res) => {
  const { staff_id, period = 'all' } = req.query;

  let dateClause = '';
  if (period === '30d') {
    dateClause = "AND c.date >= date('now', '-30 days')";
  } else if (period === '90d') {
    dateClause = "AND c.date >= date('now', '-90 days')";
  } else if (period === '180d') {
    dateClause = "AND c.date >= date('now', '-180 days')";
  } else if (period === '12m') {
    dateClause = "AND c.date >= date('now', '-12 months')";
  }

  const loc = getLoc(req);
  const staffClause = staff_id ? 'AND c.staff_id = ?' : '';
  const params = staff_id ? [staff_id] : [];

  const rows = db.prepare(`
    SELECT c.*,
           s.name  AS staff_name,
           p.name  AS property_name,
           m.name  AS issued_by_name
    FROM complaints c
    LEFT JOIN staff s      ON s.id = c.staff_id
    LEFT JOIN properties p ON p.id = c.property_id
    LEFT JOIN managers m   ON m.name = c.issued_by
    WHERE 1=1 ${staffClause} ${dateClause}${loc ? ` AND (${staffInLoc('c.staff_id', loc)} OR ${propInLoc('c.property_id', loc)})` : ''}
    ORDER BY c.date DESC, c.created_at DESC
  `).all(...params);

  res.json(rows);
});

// GET /api/complaints/deductions — { [staff_id]: { points, minor, moderate, serious, count } }
// Complaint points over the default 90-day window, for pages that show all-time QC averages.
router.get('/deductions', (req, res) => {
  res.json({ points: POINTS, window_days: 90, deductions: deductionsByStaff(db, defaultWindow()) });
});

// GET /api/complaints/scores?period=90d — how complaints change each affected cleaner's QC score
// in the selected period: checks average in the period, complaint points, adjusted score,
// and whether the watchlist trigger is met (1+ serious or 2+ moderate in the last 90 days).
router.get('/scores', (req, res) => {
  const period = req.query.period || '90d';
  const win = { from: periodStart(period), to: todayNZ() };
  const deductions = deductionsByStaff(db, win);
  const trigger = deductionsByStaff(db, defaultWindow());
  const checksAvg = db.prepare(`
    SELECT AVG(score_pct) AS avg, COUNT(*) AS cnt FROM qc_checks
    WHERE staff_id = ? AND status = 'complete' AND (check_type = 'staff' OR check_type IS NULL)
      ${win.from ? 'AND date >= ?' : ''} AND date <= ?
  `);
  const loc = getLoc(req);
  const inLoc = loc ? staffIdSet(db, loc) : null;
  const rows = Object.entries(deductions).map(([staffId, d]) => {
    if (inLoc && !inLoc.has(Number(staffId))) return null;
    const s = db.prepare('SELECT id, name FROM staff WHERE id = ?').get(Number(staffId));
    if (!s) return null;
    const c = checksAvg.get(...[s.id, win.from, win.to].filter(v => v !== null));
    const avg = c.avg == null ? null : round1(c.avg);
    const t = trigger[s.id] || { serious: 0, moderate: 0 };
    return {
      staff_id: s.id, name: s.name, ...d,
      checks_avg: avg, checks: c.cnt, adjusted: adjustScore(avg, d.points),
      watchlist_trigger: t.serious >= 1 || t.moderate >= 2,
    };
  }).filter(Boolean).sort((a, b) => b.points - a.points);
  res.json({ period, from: win.from, to: win.to, points: POINTS, cleaners: rows });
});

// GET /api/complaints/:id
router.get('/:id', (req, res) => {
  const row = db.prepare(`
    SELECT c.*,
           s.name  AS staff_name,
           p.name  AS property_name
    FROM complaints c
    LEFT JOIN staff s      ON s.id = c.staff_id
    LEFT JOIN properties p ON p.id = c.property_id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// POST /api/complaints
router.post('/', (req, res) => {
  const { staff_id, property_id, source, severity, date, description, resolution } = req.body;
  if (!staff_id || !source || !severity || !date || !description) {
    return res.status(400).json({ error: 'staff_id, source, severity, date and description are required' });
  }
  const resolvedAt = resolution ? new Date().toISOString() : null;
  const result = db.prepare(`
    INSERT INTO complaints (staff_id, property_id, source, severity, date, description, resolution, resolved_at, issued_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(staff_id, property_id || null, source, severity, date, description, resolution || null, resolvedAt, req.manager.name);
  res.json({ id: result.lastInsertRowid, ok: true });
});

// PUT /api/complaints/:id
router.put('/:id', (req, res) => {
  const { source, severity, date, description, resolution, property_id } = req.body;
  const existing = db.prepare('SELECT * FROM complaints WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const resolvedAt = resolution && !existing.resolved_at ? new Date().toISOString() : existing.resolved_at;

  db.prepare(`
    UPDATE complaints SET
      source=?, severity=?, date=?, description=?,
      resolution=?, resolved_at=?, property_id=?
    WHERE id=?
  `).run(
    source ?? existing.source,
    severity ?? existing.severity,
    date ?? existing.date,
    description ?? existing.description,
    resolution !== undefined ? resolution : existing.resolution,
    resolvedAt,
    property_id !== undefined ? (property_id || null) : existing.property_id,
    req.params.id
  );
  res.json({ ok: true });
});

// DELETE /api/complaints/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM complaints WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
