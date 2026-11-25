const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { getLoc, and, staffInLoc, listLocations } = require('../lib/location');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { archived } = req.query;
  const loc = getLoc(req);
  const locClause = and(loc, staffInLoc('id', loc));
  if (archived === 'true') {
    res.json(db.prepare(`SELECT * FROM staff WHERE archived=1${locClause} ORDER BY name`).all());
  } else {
    res.json(db.prepare(`SELECT * FROM staff WHERE (archived=0 OR archived IS NULL)${locClause} ORDER BY name`).all());
  }
});

// Area names for the location filter and the location fields.
router.get('/locations', (req, res) => {
  res.json(listLocations(db));
});

router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM staff WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

router.post('/:id/archive', (req, res) => {
  try {
    db.prepare("UPDATE staff SET archived=1, archived_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/restore', (req, res) => {
  try {
    db.prepare("UPDATE staff SET archived=0, archived_at=NULL WHERE id=?").run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  const { name, role, start_date, location } = req.body;
  const loc = (location || '').trim() || getLoc(req) || null;
  const result = db.prepare('INSERT INTO staff (name, role, start_date, location) VALUES (?, ?, ?, ?)').run(name, role, start_date, loc);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, role, start_date, inactive_until, slack_email, location } = req.body;
  if (location !== undefined) db.prepare('UPDATE staff SET location=? WHERE id=?').run((location || '').trim() || null, req.params.id);
  if (name !== undefined) db.prepare('UPDATE staff SET name=?, role=?, start_date=? WHERE id=?').run(name, role, start_date, req.params.id);
  if (inactive_until !== undefined) db.prepare('UPDATE staff SET inactive_until=? WHERE id=?').run(inactive_until || null, req.params.id);
  if (slack_email !== undefined) db.prepare('UPDATE staff SET slack_email=? WHERE id=?').run(slack_email || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.exec('BEGIN');
  try {
    // QC checks this person was on: shared checks stay for the other team members (this person is just
    // taken off them); checks that were only theirs are deleted along with their items.
    const theirChecks = db.prepare(`
      SELECT check_id AS id FROM qc_check_staff WHERE staff_id=?
      UNION SELECT id FROM qc_checks WHERE staff_id=?
    `).all(id, id);
    for (const c of theirChecks) {
      const others = db.prepare('SELECT staff_id FROM qc_check_staff WHERE check_id=? AND staff_id<>? ORDER BY rowid').all(c.id, id);
      if (others.length) {
        db.prepare('DELETE FROM qc_check_staff WHERE check_id=? AND staff_id=?').run(c.id, id);
        db.prepare('UPDATE qc_checks SET staff_id=? WHERE id=? AND staff_id=?').run(others[0].staff_id, c.id, id);
      } else {
        db.prepare('DELETE FROM qc_check_items WHERE check_id=?').run(c.id);
        db.prepare('DELETE FROM qc_check_staff WHERE check_id=?').run(c.id);
        db.prepare('DELETE FROM qc_checks WHERE id=?').run(c.id);
      }
    }

    // Delete training session items for all training sessions belonging to this staff member
    const trainSessions = db.prepare('SELECT id FROM training_sessions WHERE trainee_id=?').all(id);
    for (const s of trainSessions) {
      db.prepare('DELETE FROM training_session_items WHERE session_id=?').run(s.id);
    }
    db.prepare('DELETE FROM training_sessions WHERE trainee_id=?').run(id);

    db.prepare('DELETE FROM staff WHERE id=?').run(id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
