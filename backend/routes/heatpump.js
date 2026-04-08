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
    cb(null, `hp_${req.params.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();
router.use(requireAuth);

// Get all heat pump records (one per property) with property info
router.get('/records', (req, res) => {
  const records = db.prepare(`
    SELECT hr.*, p.name AS property_name, p.address AS property_address
    FROM heatpump_records hr
    JOIN properties p ON p.id = hr.property_id
    ORDER BY
      CASE WHEN hr.due_date IS NULL OR hr.due_date = '' THEN 1 ELSE 0 END,
      hr.due_date ASC
  `).all();
  res.json(records);
});

// Get single record with photos
router.get('/records/:id', (req, res) => {
  const record = db.prepare(`
    SELECT hr.*, p.name AS property_name, p.address AS property_address
    FROM heatpump_records hr
    JOIN properties p ON p.id = hr.property_id
    WHERE hr.id = ?
  `).get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  record.photos = db.prepare('SELECT * FROM heatpump_photos WHERE record_id=? ORDER BY uploaded_at DESC').all(record.id);
  res.json(record);
});

// Create record for a property
router.post('/records', (req, res) => {
  const { property_id, due_date, notes } = req.body;
  // Check if record already exists for this property
  const existing = db.prepare('SELECT id FROM heatpump_records WHERE property_id=?').get(property_id);
  if (existing) return res.status(400).json({ error: 'Record already exists for this property' });
  const result = db.prepare('INSERT INTO heatpump_records (property_id, due_date, notes) VALUES (?, ?, ?)').run(property_id, due_date || null, notes || '');
  res.json({ id: result.lastInsertRowid });
});

// Update record (due date, last completed, notes)
router.put('/records/:id', (req, res) => {
  const { due_date, last_completed, notes } = req.body;
  db.prepare('UPDATE heatpump_records SET due_date=?, last_completed=?, notes=? WHERE id=?')
    .run(due_date || null, last_completed || null, notes || '', req.params.id);
  res.json({ ok: true });
});

// Mark as completed (sets last_completed to now, advances due_date by interval)
router.post('/records/:id/complete', (req, res) => {
  const record = db.prepare('SELECT * FROM heatpump_records WHERE id=?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Not found' });
  const now = new Date().toISOString().slice(0, 10);
  // Advance due date by configurable interval (default 90 days)
  const freqRow = db.prepare("SELECT value FROM settings WHERE key='heatpump_freq_days'").get();
  const freqDays = parseInt(freqRow?.value || '90') || 90;
  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + freqDays);
  const nextDueStr = nextDue.toISOString().slice(0, 10);
  db.prepare('UPDATE heatpump_records SET last_completed=?, due_date=? WHERE id=?')
    .run(now, nextDueStr, req.params.id);
  res.json({ ok: true, last_completed: now, due_date: nextDueStr });
});

// Delete record
router.delete('/records/:id', (req, res) => {
  // Delete associated photos from disk
  const photos = db.prepare('SELECT filename FROM heatpump_photos WHERE record_id=?').all(req.params.id);
  for (const p of photos) {
    const filepath = path.join(UPLOADS_DIR, p.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  db.prepare('DELETE FROM heatpump_records WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Upload photo
router.post('/records/:id/photos', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const result = db.prepare('INSERT INTO heatpump_photos (record_id, filename, original_name) VALUES (?, ?, ?)')
    .run(req.params.id, req.file.filename, req.file.originalname);
  res.json({ id: result.lastInsertRowid, filename: req.file.filename });
});

// Delete photo
router.delete('/photos/:photoId', (req, res) => {
  const photo = db.prepare('SELECT * FROM heatpump_photos WHERE id=?').get(req.params.photoId);
  if (!photo) return res.status(404).json({ error: 'Not found' });
  const filepath = path.join(UPLOADS_DIR, photo.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  db.prepare('DELETE FROM heatpump_photos WHERE id=?').run(req.params.photoId);
  res.json({ ok: true });
});

// Add all properties that aren't tracked yet
router.post('/records/add-all', (req, res) => {
  const missing = db.prepare(`
    SELECT id FROM properties
    WHERE id NOT IN (SELECT property_id FROM heatpump_records)
  `).all();
  let count = 0;
  for (const p of missing) {
    db.prepare('INSERT INTO heatpump_records (property_id) VALUES (?)').run(p.id);
    count++;
  }
  res.json({ added: count });
});

// Get properties that don't have a heat pump record yet (for adding new ones)
router.get('/available-properties', (req, res) => {
  const properties = db.prepare(`
    SELECT p.id, p.name, p.address
    FROM properties p
    WHERE p.id NOT IN (SELECT property_id FROM heatpump_records)
    ORDER BY p.name
  `).all();
  res.json(properties);
});

module.exports = router;
