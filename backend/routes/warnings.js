const express = require('express');
const db = require('../db');
const { requireAuth, requireStaffAuth } = require('../middleware/auth');
const { notifyDisciplinary } = require('../services/slack');

const router = express.Router();

function ackStatus(w) {
  if (w.acknowledged_at) return 'acknowledged';
  const days = Math.floor((Date.now() - new Date(w.issued_at)) / 86400000);
  return days >= 3 ? 'overdue' : 'pending';
}

function linkedChecks(warningId) {
  return db.prepare(`
    SELECT qc.id, qc.date, qc.score_pct, p.name as property_name
    FROM warning_check_links wcl
    JOIN qc_checks qc ON qc.id = wcl.check_id
    JOIN properties p ON p.id = qc.property_id
    WHERE wcl.warning_id = ?
    ORDER BY qc.date DESC
  `).all(warningId);
}

// GET /api/warnings — list all warnings, optional ?staff_id=
router.get('/', requireAuth, (req, res) => {
  const { staff_id } = req.query;
  const rows = db.prepare(`
    SELECT w.*, s.name as staff_name
    FROM warnings w
    JOIN staff s ON s.id = w.staff_id
    ${staff_id ? 'WHERE w.staff_id = ?' : ''}
    ORDER BY w.issued_at DESC
  `).all(...(staff_id ? [staff_id] : []));

  res.json(rows.map(w => ({ ...w, ack_status: ackStatus(w) })));
});

// GET /api/warnings/my-warnings — staff portal: own warnings (no edit history)
router.get('/my-warnings', requireStaffAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM warnings WHERE staff_id = ? ORDER BY issued_at DESC
  `).all(req.staffUser.id);

  const result = rows.map(w => ({
    ...w,
    ack_status: ackStatus(w),
    linked_checks: linkedChecks(w.id),
  }));

  res.json(result);
});

// POST /api/warnings/my-warnings/:id/acknowledge
router.post('/my-warnings/:id/acknowledge', requireStaffAuth, (req, res) => {
  const w = db.prepare('SELECT * FROM warnings WHERE id = ? AND staff_id = ?').get(req.params.id, req.staffUser.id);
  if (!w) return res.status(404).json({ error: 'Not found' });
  if (w.acknowledged_at) return res.json({ ok: true });

  try {
    db.prepare(`
      UPDATE warnings SET acknowledged_at = datetime('now'), acknowledged_by = ? WHERE id = ?
    `).run(req.staffUser.name, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/warnings/:id — full detail with linked checks + edit history
router.get('/:id', requireAuth, (req, res) => {
  const w = db.prepare(`
    SELECT w.*, s.name as staff_name
    FROM warnings w
    JOIN staff s ON s.id = w.staff_id
    WHERE w.id = ?
  `).get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Not found' });

  const checks = linkedChecks(w.id);
  const edits = db.prepare('SELECT * FROM warning_edits WHERE warning_id = ? ORDER BY edited_at DESC').all(w.id);

  res.json({ ...w, ack_status: ackStatus(w), linked_checks: checks, edit_history: edits });
});

// POST /api/warnings — create warning
router.post('/', requireAuth, (req, res) => {
  const { staff_id, level, reason, details, corrective_actions, check_ids } = req.body;
  if (!staff_id || !level || !reason) {
    return res.status(400).json({ error: 'staff_id, level, and reason are required' });
  }
  const validLevels = ['verbal_note', 'written_warning', 'final_warning'];
  if (!validLevels.includes(level)) {
    return res.status(400).json({ error: 'Invalid level' });
  }

  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      INSERT INTO warnings (staff_id, level, reason, details, corrective_actions, issued_by, issued_at)
      VALUES (?, ?, ?, ?, ?, ?, date('now'))
    `).run(staff_id, level, reason, details || '', corrective_actions || '', req.manager.name);

    const warningId = result.lastInsertRowid;

    (check_ids || []).forEach(checkId => {
      db.prepare('INSERT INTO warning_check_links (warning_id, check_id) VALUES (?, ?)').run(warningId, checkId);
    });

    db.exec('COMMIT');
    notifyDisciplinary(warningId).catch(() => {});
    res.json({ id: warningId });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/warnings/:id — edit warning, preserve history
router.put('/:id', requireAuth, (req, res) => {
  const { level, reason, details, corrective_actions, check_ids } = req.body;
  const existing = db.prepare('SELECT * FROM warnings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO warning_edits (warning_id, edited_by, edited_at, prev_level, prev_reason, prev_details, prev_corrective_actions)
      VALUES (?, ?, datetime('now'), ?, ?, ?, ?)
    `).run(req.params.id, req.manager.name, existing.level, existing.reason, existing.details, existing.corrective_actions);

    db.prepare(`
      UPDATE warnings SET level = ?, reason = ?, details = ?, corrective_actions = ? WHERE id = ?
    `).run(
      level ?? existing.level,
      reason ?? existing.reason,
      details ?? existing.details,
      corrective_actions ?? existing.corrective_actions,
      req.params.id
    );

    if (check_ids !== undefined) {
      db.prepare('DELETE FROM warning_check_links WHERE warning_id = ?').run(req.params.id);
      (check_ids || []).forEach(checkId => {
        db.prepare('INSERT INTO warning_check_links (warning_id, check_id) VALUES (?, ?)').run(req.params.id, checkId);
      });
    }

    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/warnings/:id
router.delete('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT id FROM warnings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  try {
    db.prepare('DELETE FROM warnings WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
