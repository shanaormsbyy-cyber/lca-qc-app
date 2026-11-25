const express = require('express');
const { emit } = require('../emitter');
const { today } = require('../lib/dates');
const { shadowStatus } = require('../lib/progress');
const { recordUse, removeUses } = require('../lib/usage');
const { makeUpload, handleUpload, uploadedFiles, cleanupFiles } = require('../middleware/upload');
const { photosFor, saveAttachments } = require('./competencies');

function shiftCountSetting(db) {
  const v = Number(db.prepare("SELECT value FROM settings WHERE key = 'shadow_shift_count'").get()?.value);
  return Number.isInteger(v) && v > 0 ? v : 5;
}

function shiftsOf(db, periodId) {
  return db.prepare(`SELECT sh.*, p.name AS property_name, m.name AS mentor_name FROM shadow_shifts sh
    LEFT JOIN properties p ON p.id = sh.property_id LEFT JOIN managers m ON m.id = sh.mentor_id
    WHERE sh.shadow_period_id = ? ORDER BY sh.shift_number`).all(periodId);
}

function summarise(db, period, t) {
  const shifts = shiftsOf(db, period.id);
  const latestDated = shifts.filter(s => s.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const reviewedAts = shifts.filter(s => s.reviewed_at).map(s => s.reviewed_at).sort();
  return {
    ...period,
    shifts_reviewed: shifts.filter(s => s.reviewed).length,
    property_name: latestDated ? latestDated.property_name : null,
    latest_review_at: reviewedAts.length ? reviewedAts[reviewedAts.length - 1] : null,
    status: shadowStatus(period, shifts, t),
    period_status: period.status,
  };
}

module.exports = (db, { uploadsDir }) => {
  const router = express.Router();
  const upload = makeUpload(uploadsDir);
  const baseSql = `SELECT sp.*, s.name AS staff_name, m.name AS mentor_name FROM shadow_periods sp
    JOIN staff s ON s.id = sp.staff_id LEFT JOIN managers m ON m.id = sp.mentor_id`;

  router.get('/', (req, res) => {
    const t = today();
    const params = [];
    let sql = baseSql + ' WHERE s.archived = 0';
    if (req.query.mentor_id) { sql += ' AND sp.mentor_id = ?'; params.push(Number(req.query.mentor_id)); }
    if (req.query.staff_id) { sql += ' AND sp.staff_id = ?'; params.push(Number(req.query.staff_id)); }
    sql += ' ORDER BY sp.created_at DESC, sp.id DESC';
    let rows = db.prepare(sql).all(...params).map(p => summarise(db, p, t));
    if (req.query.status) rows = rows.filter(r => r.status === req.query.status);
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const p = db.prepare(baseSql + ' WHERE sp.id = ?').get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Not found' });
    const methodsOf = db.prepare('SELECT system_id FROM shadow_shift_methods WHERE shift_id = ? ORDER BY system_id');
    const shifts = shiftsOf(db, p.id).map(s => ({
      ...s, system_ids: methodsOf.all(s.id).map(r => r.system_id), photos: photosFor(db, 'shadow_shift', s.id),
    }));
    res.json({ ...summarise(db, p, today()), shifts });
  });

  router.post('/', (req, res) => {
    const { staff_id, mentor_id } = req.body || {};
    if (!staff_id) return res.status(400).json({ error: 'Trainee is required' });
    const id = db.tx(() => {
      const ob = db.prepare("SELECT id FROM onboardings WHERE staff_id = ? AND status = 'active'").get(staff_id);
      const n = shiftCountSetting(db);
      const pid = Number(db.prepare('INSERT INTO shadow_periods (staff_id, mentor_id, onboarding_id, shift_count) VALUES (?, ?, ?, ?)')
        .run(staff_id, mentor_id || req.manager.id, ob ? ob.id : null, n).lastInsertRowid);
      const ins = db.prepare('INSERT INTO shadow_shifts (shadow_period_id, shift_number, mentor_id) VALUES (?, ?, ?)');
      for (let i = 1; i <= n; i++) ins.run(pid, i, mentor_id || req.manager.id);
      return pid;
    });
    emit();
    res.json({ id });
  });

  router.put('/:id/shifts/:shiftId', (req, res) => {
    const s = db.prepare('SELECT * FROM shadow_shifts WHERE id = ? AND shadow_period_id = ?').get(Number(req.params.shiftId), Number(req.params.id));
    if (!s) return res.status(404).json({ error: 'Not found' });
    const b = req.body || {};
    db.prepare('UPDATE shadow_shifts SET date = ?, property_id = ?, mentor_id = ? WHERE id = ?').run(
      b.date !== undefined ? (b.date || null) : s.date,
      b.property_id !== undefined ? (b.property_id || null) : s.property_id,
      b.mentor_id !== undefined ? (b.mentor_id || null) : s.mentor_id,
      s.id,
    );
    emit();
    res.json({ ok: true });
  });

  router.post('/:id/shifts/:shiftId/review', handleUpload(upload.array('photos', 10)), (req, res) => {
    const s = db.prepare('SELECT * FROM shadow_shifts WHERE id = ? AND shadow_period_id = ?').get(Number(req.params.shiftId), Number(req.params.id));
    const fail = (status, error) => { cleanupFiles(req); res.status(status).json({ error }); };
    if (!s) return fail(404, 'Not found');
    let systemIds = [];
    try { systemIds = JSON.parse(req.body.system_ids || '[]').map(Number).filter(Boolean); } catch (_) { return fail(400, 'Invalid coaching methods'); }
    const known = new Set(db.prepare('SELECT id FROM training_systems').all().map(r => r.id));
    if (systemIds.some(id => !known.has(id))) return fail(400, 'Unknown coaching method');
    try { db.tx(() => {
      db.prepare('UPDATE shadow_shifts SET reviewed = 1, review_notes = ?, reviewed_at = ?, reviewed_by = ?, date = COALESCE(date, ?) WHERE id = ?')
        .run(req.body.notes || null, today(), req.manager.id, today(), s.id);
      db.prepare('DELETE FROM shadow_shift_methods WHERE shift_id = ?').run(s.id);
      removeUses(db, 'shadow', s.id);
      const ins = db.prepare('INSERT OR IGNORE INTO shadow_shift_methods (shift_id, system_id) VALUES (?, ?)');
      for (const sid of systemIds) { ins.run(s.id, sid); recordUse(db, sid, 'shadow', s.id); }
      saveAttachments(db, 'shadow_shift', s.id, uploadedFiles(req));
    }); } catch (e) { cleanupFiles(req); throw e; }
    emit();
    res.json({ ok: true });
  });

  router.post('/:id/signoff', (req, res) => {
    const p = db.prepare('SELECT * FROM shadow_periods WHERE id = ?').get(Number(req.params.id));
    if (!p) return res.status(404).json({ error: 'Not found' });
    if (shadowStatus(p, shiftsOf(db, p.id), today()) !== 'ready') {
      return res.status(400).json({ error: 'All shifts must be reviewed before sign-off' });
    }
    db.prepare("UPDATE shadow_periods SET status = 'signed_off', signed_off_at = ?, signed_off_by = ? WHERE id = ?").run(today(), req.manager.id, p.id);
    emit();
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    for (const s of db.prepare('SELECT id FROM shadow_shifts WHERE shadow_period_id = ?').all(id)) removeUses(db, 'shadow', s.id);
    db.prepare('DELETE FROM shadow_periods WHERE id = ?').run(id);
    emit();
    res.json({ ok: true });
  });

  return router;
};
