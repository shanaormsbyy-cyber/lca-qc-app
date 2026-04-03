const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM properties ORDER BY name').all());
});

router.get('/:id', (req, res) => {
  const property = db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);
  if (!property) return res.status(404).json({ error: 'Not found' });
  res.json(property);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  const result = db.prepare('INSERT INTO properties (name, address, airbnb_id) VALUES (?, ?, ?)').run(name, '', '');
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, access_code, inactive_until } = req.body;
  if (name !== undefined) db.prepare('UPDATE properties SET name=? WHERE id=?').run(name, req.params.id);
  if (access_code !== undefined) db.prepare('UPDATE properties SET access_code=? WHERE id=?').run(access_code, req.params.id);
  if (inactive_until !== undefined) db.prepare('UPDATE properties SET inactive_until=? WHERE id=?').run(inactive_until || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.exec('BEGIN');
  try {
    // Delete QC check items for all QC checks belonging to this property
    const qcChecks = db.prepare('SELECT id FROM qc_checks WHERE property_id=?').all(id);
    for (const c of qcChecks) {
      db.prepare('DELETE FROM qc_check_items WHERE check_id=?').run(c.id);
    }
    db.prepare('DELETE FROM qc_checks WHERE property_id=?').run(id);

    db.prepare('DELETE FROM properties WHERE id=?').run(id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
