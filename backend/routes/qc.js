const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/app/data/uploads'
  : path.join(__dirname, '..', 'uploads');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `qc_${req.params.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();
router.use(requireAuth);

// ─── Checklists ───────────────────────────────────────────────────────────────

const parseRS = cl => {
  try { cl.repeatable_sections = JSON.parse(cl.repeatable_sections || '[]'); } catch { cl.repeatable_sections = []; }
  return cl;
};

router.get('/checklists', (req, res) => {
  const checklists = db.prepare('SELECT * FROM qc_checklists ORDER BY name').all();
  checklists.forEach(cl => {
    parseRS(cl);
    cl.items = db.prepare('SELECT * FROM qc_checklist_items WHERE checklist_id=? ORDER BY order_idx').all(cl.id);
  });
  res.json(checklists);
});

router.get('/checklists/:id', (req, res) => {
  const cl = db.prepare('SELECT * FROM qc_checklists WHERE id=?').get(req.params.id);
  if (!cl) return res.status(404).json({ error: 'Not found' });
  parseRS(cl);
  cl.items = db.prepare('SELECT * FROM qc_checklist_items WHERE checklist_id=? ORDER BY order_idx').all(cl.id);
  res.json(cl);
});

router.post('/checklists', (req, res) => {
  const { name, description, items, repeatable_sections } = req.body;
  let clId;
  db.exec('BEGIN');
  try {
    const result = db.prepare('INSERT INTO qc_checklists (name, description, repeatable_sections) VALUES (?, ?, ?)').run(name, description || '', JSON.stringify(repeatable_sections || []));
    clId = result.lastInsertRowid;
    (items || []).forEach((item, i) => {
      db.prepare('INSERT INTO qc_checklist_items (checklist_id, text, category, score_type, weight, order_idx) VALUES (?, ?, ?, ?, ?, ?)')
        .run(clId, item.text, item.category || '', item.score_type || 'pass_fail', item.weight || 1, i);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ id: clId });
});

router.put('/checklists/:id', (req, res) => {
  const { name, description, items, repeatable_sections } = req.body;
  const clId = req.params.id;
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE qc_checklists SET name=?, description=?, repeatable_sections=? WHERE id=?').run(name, description || '', JSON.stringify(repeatable_sections || []), clId);

    // Get existing item ids for this checklist
    const existing = db.prepare('SELECT id FROM qc_checklist_items WHERE checklist_id=? ORDER BY order_idx').all(clId);

    // Update existing rows in-place where possible; insert extras; delete removed
    (items || []).forEach((item, i) => {
      if (existing[i]) {
        db.prepare('UPDATE qc_checklist_items SET text=?, category=?, score_type=?, weight=?, order_idx=? WHERE id=?')
          .run(item.text, item.category || '', item.score_type || 'pass_fail', item.weight || 1, i, existing[i].id);
      } else {
        db.prepare('INSERT INTO qc_checklist_items (checklist_id, text, category, score_type, weight, order_idx) VALUES (?, ?, ?, ?, ?, ?)')
          .run(clId, item.text, item.category || '', item.score_type || 'pass_fail', item.weight || 1, i);
      }
    });
    // Remove any extra old rows (items were deleted by user) — only safe if not referenced
    for (let i = (items || []).length; i < existing.length; i++) {
      const used = db.prepare('SELECT COUNT(*) as cnt FROM qc_check_items WHERE item_id=?').get(existing[i].id);
      if (used.cnt === 0) {
        db.prepare('DELETE FROM qc_checklist_items WHERE id=?').run(existing[i].id);
      }
      // If in use, leave the row — it won't appear in future checks but historical data stays intact
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});

router.delete('/checklists/:id', (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) as cnt FROM qc_checks WHERE checklist_id=?').get(req.params.id);
  if (inUse.cnt > 0) {
    return res.status(409).json({ error: `This checklist is used by ${inUse.cnt} QC check(s) and cannot be deleted. Remove those checks first, or archive this checklist instead.` });
  }
  db.prepare('DELETE FROM qc_checklists WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.put('/checklists/:id/set-default', (req, res) => {
  const { default_for } = req.body; // 'staff', 'property', or null to clear
  if (default_for && !['staff', 'property'].includes(default_for)) {
    return res.status(400).json({ error: 'default_for must be staff, property, or null' });
  }
  // Clear any existing default for this type
  if (default_for) {
    db.prepare("UPDATE qc_checklists SET default_for=NULL WHERE default_for=?").run(default_for);
  }
  db.prepare("UPDATE qc_checklists SET default_for=? WHERE id=?").run(default_for || null, req.params.id);
  res.json({ ok: true });
});

// ─── Checks ───────────────────────────────────────────────────────────────────

router.get('/checks', (req, res) => {
  const checks = db.prepare(`
    SELECT qc.*,
      p.name as property_name,
      s.name as staff_name,
      cl.name as checklist_name,
      m1.name as scheduled_by_name,
      m2.name as assigned_to_name
    FROM qc_checks qc
    JOIN properties p ON p.id = qc.property_id
    LEFT JOIN staff s ON s.id = qc.staff_id
    JOIN qc_checklists cl ON cl.id = qc.checklist_id
    JOIN managers m1 ON m1.id = qc.scheduled_by_id
    JOIN managers m2 ON m2.id = qc.assigned_to_id
    ORDER BY qc.date DESC
  `).all();
  res.json(checks);
});

router.get('/checks/:id', (req, res) => {
  const check = db.prepare(`
    SELECT qc.*,
      p.name as property_name,
      s.name as staff_name,
      cl.name as checklist_name,
      m1.name as scheduled_by_name,
      m2.name as assigned_to_name
    FROM qc_checks qc
    JOIN properties p ON p.id = qc.property_id
    LEFT JOIN staff s ON s.id = qc.staff_id
    JOIN qc_checklists cl ON cl.id = qc.checklist_id
    JOIN managers m1 ON m1.id = qc.scheduled_by_id
    JOIN managers m2 ON m2.id = qc.assigned_to_id
    WHERE qc.id = ?
  `).get(req.params.id);
  if (!check) return res.status(404).json({ error: 'Not found' });

  const items = db.prepare(`
    SELECT qci.id, qci.check_id, qci.item_id, qci.score, qci.notes, qci.na,
           qi.text, qi.score_type, qi.weight, qi.order_idx,
           COALESCE(qci.room_label, qi.category) as category
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    WHERE qci.check_id = ?
    ORDER BY qci.id
  `).all(req.params.id);
  check.items = items;
  res.json(check);
});

router.post('/checks', (req, res) => {
  const { property_id, staff_id, checklist_id, assigned_to_id, date, notes, check_type, room_counts } = req.body;
  let checkId;
  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      INSERT INTO qc_checks (property_id, staff_id, checklist_id, scheduled_by_id, assigned_to_id, date, notes, check_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(property_id, staff_id, checklist_id, req.manager.id, assigned_to_id, date, notes || '', check_type || 'staff');
    checkId = result.lastInsertRowid;

    const checklist = db.prepare('SELECT * FROM qc_checklists WHERE id=?').get(checklist_id);
    let repeatableSections = [];
    try { repeatableSections = JSON.parse(checklist.repeatable_sections || '[]'); } catch { repeatableSections = []; }

    const templateItems = db.prepare('SELECT * FROM qc_checklist_items WHERE checklist_id=? ORDER BY order_idx').all(checklist_id);

    // Group template items by category, preserving first-appearance order
    const categoryOrder = [];
    const itemsByCategory = {};
    templateItems.forEach(item => {
      const cat = item.category || '';
      if (!itemsByCategory[cat]) { categoryOrder.push(cat); itemsByCategory[cat] = []; }
      itemsByCategory[cat].push(item);
    });

    // Insert items, expanding repeatable sections by room_counts
    categoryOrder.forEach(cat => {
      const catItems = itemsByCategory[cat];
      if (repeatableSections.includes(cat)) {
        const count = Math.min(Math.max(parseInt(room_counts?.[cat]) || 1, 1), 20);
        for (let n = 1; n <= count; n++) {
          const label = count > 1 ? `${cat} ${n}` : null;
          catItems.forEach(item => {
            db.prepare('INSERT INTO qc_check_items (check_id, item_id, room_label) VALUES (?, ?, ?)').run(checkId, item.id, label);
          });
        }
      } else {
        catItems.forEach(item => {
          db.prepare('INSERT INTO qc_check_items (check_id, item_id, room_label) VALUES (?, ?, ?)').run(checkId, item.id, null);
        });
      }
    });

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ id: checkId });
});

router.put('/checks/:id', (req, res) => {
  const { assigned_to_id, date, notes, status, signed_off_by, items } = req.body;
  db.exec('BEGIN');
  try {
    if (items) {
      items.forEach(item => {
        db.prepare('UPDATE qc_check_items SET score=?, notes=?, na=? WHERE id=?')
          .run(item.score ?? 0, item.notes || '', item.na ? 1 : 0, item.id);
      });

      // Recalculate score — N/A items excluded from both total and max
      const checkItems = db.prepare(`
        SELECT qci.score, qci.na, qi.score_type, qi.weight
        FROM qc_check_items qci
        JOIN qc_checklist_items qi ON qi.id = qci.item_id
        WHERE qci.check_id = ?
      `).all(req.params.id);

      let total = 0, max = 0;
      checkItems.forEach(ci => {
        if (ci.na) return;
        const w = ci.weight || 1;
        if (ci.score_type === 'pass_fail') {
          total += (ci.score || 0) * w;
          max += w;
        } else {
          total += (ci.score || 0) * w;
          max += 5 * w;
        }
      });
      const pct = max ? (total / max) * 100 : 0;
      db.prepare('UPDATE qc_checks SET total_score=?, max_score=?, score_pct=? WHERE id=?')
        .run(total, max, pct, req.params.id);
    }

    const updates = [];
    const params = [];
    if (assigned_to_id !== undefined) { updates.push('assigned_to_id=?'); params.push(assigned_to_id); }
    if (date !== undefined) { updates.push('date=?'); params.push(date); }
    if (notes !== undefined) { updates.push('notes=?'); params.push(notes); }
    if (status !== undefined) { updates.push('status=?'); params.push(status); }
    if (signed_off_by !== undefined) {
      updates.push('signed_off_by=?', 'signed_off_at=?');
      params.push(signed_off_by, new Date().toISOString());
    }
    if (updates.length) {
      params.push(req.params.id);
      db.prepare(`UPDATE qc_checks SET ${updates.join(',')} WHERE id=?`).run(...params);
    }

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});

router.delete('/checks/:id', (req, res) => {
  db.prepare('DELETE FROM qc_checks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ─── Photos ───────────────────────────────────────────────────────────────────

router.get('/checks/:id/photos', (req, res) => {
  const photos = db.prepare('SELECT * FROM qc_check_photos WHERE check_id=? ORDER BY uploaded_at').all(req.params.id);
  res.json(photos);
});

router.post('/checks/:id/photos', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { category, item_id } = req.body;
  const result = db.prepare('INSERT INTO qc_check_photos (check_id, category, item_id, filename, original_name) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.id, category || '', item_id ? parseInt(item_id) : null, req.file.filename, req.file.originalname);
  res.json({ id: result.lastInsertRowid, filename: req.file.filename });
});

router.delete('/photos/:photoId', (req, res) => {
  const photo = db.prepare('SELECT * FROM qc_check_photos WHERE id=?').get(req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  const filepath = path.join(UPLOADS_DIR, photo.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  db.prepare('DELETE FROM qc_check_photos WHERE id=?').run(req.params.photoId);
  res.json({ ok: true });
});

module.exports = router;
