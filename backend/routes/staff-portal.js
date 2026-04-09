const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireStaffAuth, requireAuth, SECRET } = require('../middleware/auth');

const router = express.Router();

// ─── Staff Login ────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const cred = db.prepare(`
    SELECT sc.*, s.name AS staff_name, s.id AS staff_id
    FROM staff_credentials sc
    JOIN staff s ON s.id = sc.staff_id
    WHERE sc.username = ?
  `).get(username);
  if (!cred || !bcrypt.compareSync(password, cred.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { id: cred.staff_id, name: cred.staff_name, username: cred.username, role: 'staff' },
    SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, user: { id: cred.staff_id, name: cred.staff_name, username: cred.username } });
});

router.get('/me', requireStaffAuth, (req, res) => {
  const staff = db.prepare('SELECT id, name, role FROM staff WHERE id = ?').get(req.staffUser.id);
  if (!staff) return res.status(404).json({ error: 'Staff not found' });
  res.json({ id: staff.id, name: staff.name, role: staff.role, username: req.staffUser.username });
});

// ─── Read-only: my QC checks ───────────────────────────────────────────────
router.get('/my-checks', requireStaffAuth, (req, res) => {
  const checks = db.prepare(`
    SELECT qc.id, qc.property_id, qc.staff_id, qc.checklist_id, qc.date, qc.status,
           qc.total_score, qc.max_score, qc.score_pct, qc.notes, qc.check_type, qc.created_at,
           p.name AS property_name, cl.name AS checklist_name
    FROM qc_checks qc
    LEFT JOIN properties p ON p.id = qc.property_id
    LEFT JOIN qc_checklists cl ON cl.id = qc.checklist_id
    WHERE qc.staff_id = ? AND qc.status = 'complete'
    ORDER BY qc.date DESC
  `).all(req.staffUser.id);
  res.json(checks);
});

// ─── Read-only: single check with items + photos ────────────────────────────
router.get('/my-checks/:id', requireStaffAuth, (req, res) => {
  const check = db.prepare(`
    SELECT qc.id, qc.property_id, qc.staff_id, qc.checklist_id, qc.date, qc.status,
           qc.total_score, qc.max_score, qc.score_pct, qc.notes, qc.check_type, qc.created_at,
           p.name AS property_name, s.name AS staff_name, cl.name AS checklist_name
    FROM qc_checks qc
    LEFT JOIN properties p ON p.id = qc.property_id
    LEFT JOIN staff s ON s.id = qc.staff_id
    LEFT JOIN qc_checklists cl ON cl.id = qc.checklist_id
    WHERE qc.id = ? AND qc.staff_id = ?
  `).get(req.params.id, req.staffUser.id);
  if (!check) return res.status(404).json({ error: 'Not found' });

  check.items = db.prepare(`
    SELECT ci.*, cli.text, cli.category, cli.score_type, cli.weight
    FROM qc_check_items ci
    JOIN qc_checklist_items cli ON cli.id = ci.item_id
    WHERE ci.check_id = ?
    ORDER BY cli.order_idx
  `).all(check.id);

  check.photos = db.prepare('SELECT * FROM qc_check_photos WHERE check_id=? ORDER BY uploaded_at').all(check.id);

  res.json(check);
});

// ─── Read-only: my score stats ──────────────────────────────────────────────
router.get('/my-stats', requireStaffAuth, (req, res) => {
  const checks = db.prepare(`
    SELECT score_pct, date FROM qc_checks
    WHERE staff_id = ? AND status = 'complete' AND score_pct IS NOT NULL
    ORDER BY date ASC
  `).all(req.staffUser.id);

  const total = checks.length;
  if (total === 0) return res.json({ total: 0, average: 0, best: 0, latest: 0, trend: [] });

  const scores = checks.map(c => c.score_pct);
  const average = Math.round(scores.reduce((a, b) => a + b, 0) / total);
  const best = Math.round(Math.max(...scores));
  const latest = Math.round(scores[scores.length - 1]);

  // Monthly trend (last 12 months)
  const trend = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.toISOString().slice(0, 7); // YYYY-MM
    const monthChecks = checks.filter(c => c.date && c.date.startsWith(month));
    if (monthChecks.length > 0) {
      const avg = Math.round(monthChecks.reduce((a, c2) => a + c2.score_pct, 0) / monthChecks.length);
      trend.push({ month, avg, count: monthChecks.length });
    } else {
      trend.push({ month, avg: null, count: 0 });
    }
  }

  res.json({ total, average, best, latest, trend });
});

// ─── Staff: my commonly flagged issues (last 30 days, 3+ occurrences) ───────
router.get('/my-flags', requireStaffAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT qi.text, qi.category, COUNT(*) as flag_count
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    JOIN qc_checks qc ON qc.id = qci.check_id
    WHERE qc.staff_id = ? AND qc.status = 'complete'
      AND qci.score = 0
      AND qc.date >= date('now', '-30 days')
    GROUP BY qi.text, qi.category
    HAVING COUNT(*) >= 3
    ORDER BY qi.category, flag_count DESC
  `).all(req.staffUser.id);

  // Group by category/room
  const grouped = {};
  for (const r of rows) {
    const cat = r.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ text: r.text, count: r.flag_count });
  }
  res.json(grouped);
});

// ─── Staff: change own password ─────────────────────────────────────────────
router.post('/change-password', requireStaffAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  const cred = db.prepare('SELECT * FROM staff_credentials WHERE staff_id = ?').get(req.staffUser.id);
  if (!cred) return res.status(404).json({ error: 'No credentials found' });
  if (!bcrypt.compareSync(currentPassword, cred.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE staff_credentials SET password_hash = ? WHERE staff_id = ?').run(hash, req.staffUser.id);
  res.json({ ok: true });
});

// ─── Manager-only: manage staff credentials ─────────────────────────────────
router.get('/credentials', requireAuth, (req, res) => {
  const creds = db.prepare(`
    SELECT sc.id, sc.staff_id, sc.username, s.name AS staff_name, sc.created_at
    FROM staff_credentials sc
    JOIN staff s ON s.id = sc.staff_id
    ORDER BY s.name
  `).all();
  res.json(creds);
});

router.post('/credentials', requireAuth, (req, res) => {
  const { staff_id, username, password } = req.body;
  if (!staff_id || !username || !password) return res.status(400).json({ error: 'staff_id, username and password required' });
  const existing = db.prepare('SELECT id FROM staff_credentials WHERE staff_id=? OR username=?').get(staff_id, username);
  if (existing) return res.status(400).json({ error: 'Staff member already has login or username taken' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO staff_credentials (staff_id, username, password_hash) VALUES (?, ?, ?)').run(staff_id, username, hash);
  res.json({ id: result.lastInsertRowid });
});

router.put('/credentials/:id', requireAuth, (req, res) => {
  const { username, password } = req.body;
  if (username) {
    const taken = db.prepare('SELECT id FROM staff_credentials WHERE username=? AND id!=?').get(username, req.params.id);
    if (taken) return res.status(400).json({ error: 'Username already taken' });
    db.prepare('UPDATE staff_credentials SET username=? WHERE id=?').run(username, req.params.id);
  }
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE staff_credentials SET password_hash=? WHERE id=?').run(hash, req.params.id);
  }
  res.json({ ok: true });
});

router.delete('/credentials/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM staff_credentials WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
