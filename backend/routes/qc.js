const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

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

router.get('/checklists', (req, res) => {
  const checklists = db.prepare('SELECT * FROM qc_checklists ORDER BY name').all();
  checklists.forEach(cl => {
    cl.items = db.prepare('SELECT * FROM qc_checklist_items WHERE checklist_id=? ORDER BY order_idx').all(cl.id);
  });
  res.json(checklists);
});

router.get('/checklists/:id', (req, res) => {
  const cl = db.prepare('SELECT * FROM qc_checklists WHERE id=?').get(req.params.id);
  if (!cl) return res.status(404).json({ error: 'Not found' });
  cl.items = db.prepare('SELECT * FROM qc_checklist_items WHERE checklist_id=? ORDER BY order_idx').all(cl.id);
  res.json(cl);
});

router.post('/checklists', (req, res) => {
  const { name, description, items } = req.body;
  let clId;
  db.exec('BEGIN');
  try {
    const result = db.prepare('INSERT INTO qc_checklists (name, description) VALUES (?, ?)').run(name, description || '');
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
  const { name, description, items } = req.body;
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE qc_checklists SET name=?, description=? WHERE id=?').run(name, description || '', req.params.id);
    db.prepare('DELETE FROM qc_checklist_items WHERE checklist_id=?').run(req.params.id);
    (items || []).forEach((item, i) => {
      db.prepare('INSERT INTO qc_checklist_items (checklist_id, text, category, score_type, weight, order_idx) VALUES (?, ?, ?, ?, ?, ?)')
        .run(req.params.id, item.text, item.category || '', item.score_type || 'pass_fail', item.weight || 1, i);
    });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ ok: true });
});

router.delete('/checklists/:id', (req, res) => {
  db.prepare('DELETE FROM qc_checklists WHERE id=?').run(req.params.id);
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
    SELECT qci.*, qi.text, qi.category, qi.score_type, qi.weight, qi.order_idx
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    WHERE qci.check_id = ?
    ORDER BY qi.order_idx
  `).all(req.params.id);
  check.items = items;
  res.json(check);
});

router.post('/checks', (req, res) => {
  const { property_id, staff_id, checklist_id, assigned_to_id, date, notes, check_type } = req.body;
  let checkId;
  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      INSERT INTO qc_checks (property_id, staff_id, checklist_id, scheduled_by_id, assigned_to_id, date, notes, check_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(property_id, staff_id, checklist_id, req.manager.id, assigned_to_id, date, notes || '', check_type || 'staff');
    checkId = result.lastInsertRowid;

    const items = db.prepare('SELECT * FROM qc_checklist_items WHERE checklist_id=? ORDER BY order_idx').all(checklist_id);
    items.forEach(item => {
      db.prepare('INSERT INTO qc_check_items (check_id, item_id) VALUES (?, ?)').run(checkId, item.id);
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
        db.prepare('UPDATE qc_check_items SET score=?, notes=? WHERE id=?')
          .run(item.score, item.notes || '', item.id);
      });

      // Recalculate score
      const checkItems = db.prepare(`
        SELECT qci.score, qi.score_type, qi.weight
        FROM qc_check_items qci
        JOIN qc_checklist_items qi ON qi.id = qci.item_id
        WHERE qci.check_id = ?
      `).all(req.params.id);

      let total = 0, max = 0;
      checkItems.forEach(ci => {
        const w = ci.weight || 1;
        if (ci.score_type === 'pass_fail') {
          total += ci.score * w;
          max += w;
        } else {
          total += ci.score * w;
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

// ─── Email Report ─────────────────────────────────────────────────────────────

router.post('/checks/:id/email', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Email address required' });

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
  if (!check) return res.status(404).json({ error: 'Check not found' });

  const items = db.prepare(`
    SELECT qci.score, qci.notes, qi.text, qi.category, qi.score_type, qi.weight, qi.order_idx
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    WHERE qci.check_id = ?
    ORDER BY qi.order_idx
  `).all(req.params.id);

  const scoreColor = pct => pct >= 85 ? '#00c896' : pct >= 70 ? '#f59e0b' : '#ef4444';
  const pct = Math.round(check.score_pct || 0);

  const itemRows = items.map((item, i) => {
    const scoreDisplay = item.score_type === 'pass_fail'
      ? (item.score ? '<span style="color:#00c896">PASS</span>' : '<span style="color:#ef4444">FAIL</span>')
      : `${item.score}/5`;
    return `
      <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${item.text}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280">${item.category || '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${scoreDisplay}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px">${item.notes || ''}</td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6">
  <div style="max-width:700px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
    <div style="background:#0a1628;padding:24px 28px">
      <div style="color:#00c896;font-size:20px;font-weight:bold">LCA Cleaning Services</div>
      <div style="color:#ffffff;font-size:14px;margin-top:4px">Quality Control Check Report</div>
    </div>
    <div style="padding:24px 28px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:6px 0;color:#6b7280;width:160px">Property</td><td style="padding:6px 0;font-weight:600">${check.property_name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Staff Member</td><td style="padding:6px 0;font-weight:600">${check.staff_name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Checklist</td><td style="padding:6px 0">${check.checklist_name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Date</td><td style="padding:6px 0">${check.date}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Assigned To</td><td style="padding:6px 0">${check.assigned_to_name}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Signed Off By</td><td style="padding:6px 0">${check.signed_off_by || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Overall Score</td><td style="padding:6px 0;font-size:22px;font-weight:bold;color:${scoreColor(pct)}">${pct}%</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#0a1628;color:#00c896">
            <th style="padding:10px 12px;text-align:left">#</th>
            <th style="padding:10px 12px;text-align:left">Item</th>
            <th style="padding:10px 12px;text-align:left">Category</th>
            <th style="padding:10px 12px;text-align:center">Score</th>
            <th style="padding:10px 12px;text-align:left">Notes</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div style="padding:16px 28px;background:#f9fafb;color:#9ca3af;font-size:12px">
      Generated by LCA QC App · ${new Date().toLocaleString()}
    </div>
  </div>
</body>
</html>`;

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(500).json({ error: 'Email is not configured on the server. Set SMTP_USER and SMTP_PASS environment variables.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: `QC Report — ${check.property_name} — ${check.date} — ${pct}%`,
      html,
    });

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send email: ' + e.message });
  }
});

module.exports = router;
