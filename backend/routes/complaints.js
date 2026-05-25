const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Severity weights for impact score calculation
const SEVERITY_WEIGHTS = { minor: 2, moderate: 5, serious: 10 };

// GET /api/complaints — all complaints, optional ?staff_id= filter
router.get('/', (req, res) => {
  const { staff_id, period = 'all' } = req.query;

  let dateClause = '';
  if (period === '90d') {
    dateClause = "AND c.date >= date('now', '-90 days')";
  } else if (period === '180d') {
    dateClause = "AND c.date >= date('now', '-180 days')";
  } else if (period === '12m') {
    dateClause = "AND c.date >= date('now', '-12 months')";
  }

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
    WHERE 1=1 ${staffClause} ${dateClause}
    ORDER BY c.date DESC, c.created_at DESC
  `).all(...params);

  res.json(rows);
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
  const { staff_id, property_id, source, severity, date, description } = req.body;
  if (!staff_id || !source || !severity || !date || !description) {
    return res.status(400).json({ error: 'staff_id, source, severity, date and description are required' });
  }
  const result = db.prepare(`
    INSERT INTO complaints (staff_id, property_id, source, severity, date, description, issued_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(staff_id, property_id || null, source, severity, date, description, req.manager.name);
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

// GET /api/complaints/impact/all — impact score per staff member (rolling 90d)
// Impact score: starts at 100, subtract severity weights for complaints in window
// Also flags staff with 2+ moderate or 1+ serious in 90d as "complaint risk"
router.get('/impact/all', (req, res) => {
  const staff = db.prepare('SELECT id, name FROM staff WHERE inactive_until IS NULL OR inactive_until <= date("now")').all();

  const results = staff.map(s => {
    const complaints = db.prepare(`
      SELECT severity, COUNT(*) as cnt
      FROM complaints
      WHERE staff_id = ? AND date >= date('now', '-90 days')
      GROUP BY severity
    `).all(s.id);

    let deduction = 0;
    let minorCount = 0, moderateCount = 0, seriousCount = 0;
    complaints.forEach(c => {
      const w = SEVERITY_WEIGHTS[c.severity] || 0;
      deduction += w * c.cnt;
      if (c.severity === 'minor')    minorCount    = c.cnt;
      if (c.severity === 'moderate') moderateCount = c.cnt;
      if (c.severity === 'serious')  seriousCount  = c.cnt;
    });

    const totalCount = minorCount + moderateCount + seriousCount;
    const impactScore = Math.max(0, 100 - deduction);
    const riskFlag = seriousCount >= 1 || moderateCount >= 2;

    return {
      id: s.id,
      name: s.name,
      impact_score: impactScore,
      deduction,
      total_complaints: totalCount,
      minor_count: minorCount,
      moderate_count: moderateCount,
      serious_count: seriousCount,
      risk_flag: riskFlag,
    };
  });

  // Only return staff who have at least one complaint or are flagged
  res.json(results.filter(r => r.total_complaints > 0));
});

module.exports = router;
