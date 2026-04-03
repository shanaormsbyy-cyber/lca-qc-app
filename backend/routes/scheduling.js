const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/settings', (req, res) => {
  const settings = {};
  db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  Object.entries(req.body).forEach(([k, v]) => upsert.run(k, String(v)));
  res.json({ ok: true });
});

router.get('/due', (req, res) => {
  const settings = {};
  db.prepare('SELECT * FROM settings').all().forEach(s => { settings[s.key] = s.value; });
  const staffDays = parseInt(settings.qc_freq_staff_days || '30');
  const propDays = parseInt(settings.qc_freq_property_days || '14');

  const today = new Date().toISOString().slice(0, 10);

  // Last QC check per staff member
  const staffChecks = db.prepare(`
    SELECT s.id, s.name, s.role,
      MAX(qc.date) as last_check_date,
      COUNT(qc.id) as total_checks
    FROM staff s
    LEFT JOIN qc_checks qc ON qc.staff_id = s.id AND qc.status = 'complete'
    GROUP BY s.id
  `).all();

  // Last QC check per property
  const propChecks = db.prepare(`
    SELECT p.id, p.name, p.address, p.airbnb_id, p.inactive_until,
      MAX(qc.date) as last_check_date,
      COUNT(qc.id) as total_checks
    FROM properties p
    LEFT JOIN qc_checks qc ON qc.property_id = p.id AND qc.status = 'complete'
    GROUP BY p.id
  `).all();

  function getDueInfo(lastDate, freqDays) {
    if (!lastDate) return { next_due: today, days_overdue: 999, status: 'overdue' };
    const last = new Date(lastDate);
    const next = new Date(last);
    next.setDate(next.getDate() + freqDays);
    const nextStr = next.toISOString().slice(0, 10);
    const diffMs = next - new Date(today);
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    let status = 'ok';
    if (daysLeft < 0) status = 'overdue';
    else if (daysLeft <= 7) status = 'due_soon';
    return { next_due: nextStr, days_left: daysLeft, status };
  }

  const staffDue = staffChecks.map(s => ({ ...s, ...getDueInfo(s.last_check_date, staffDays) }))
    .sort((a, b) => (a.days_left || -999) - (b.days_left || -999));

  const propDue = propChecks.map(p => {
    if (p.inactive_until && p.inactive_until >= today) {
      return { ...p, status: 'inactive', next_due: null, days_left: null };
    }
    return { ...p, ...getDueInfo(p.last_check_date, propDays) };
  }).sort((a, b) => {
    if (a.status === 'inactive') return 1;
    if (b.status === 'inactive') return -1;
    return (a.days_left || -999) - (b.days_left || -999);
  });

  res.json({ staff: staffDue, properties: propDue, staffDays, propDays });
});

module.exports = router;
