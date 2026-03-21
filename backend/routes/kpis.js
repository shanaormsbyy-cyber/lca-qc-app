const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function getDateFilter(range) {
  const today = new Date();
  const dates = { from: null, to: today.toISOString().slice(0, 10) };
  if (range === '30d') {
    const d = new Date(today); d.setDate(d.getDate() - 30);
    dates.from = d.toISOString().slice(0, 10);
  } else if (range === '90d') {
    const d = new Date(today); d.setDate(d.getDate() - 90);
    dates.from = d.toISOString().slice(0, 10);
  } else if (range === '12m') {
    const d = new Date(today); d.setFullYear(d.getFullYear() - 1);
    dates.from = d.toISOString().slice(0, 10);
  } else if (range === 'custom') {
    dates.from = null; // handled by caller
  }
  return dates;
}

// Manager leaderboard
router.get('/managers', (req, res) => {
  const { range = 'all', from, to } = req.query;
  const { from: rangeFrom, to: rangeTo } = getDateFilter(range);
  const dateFrom = from || rangeFrom;
  const dateTo = to || rangeTo;

  const managers = db.prepare('SELECT id, name FROM managers').all();

  const result = managers.map(mgr => {
    const qcAll = db.prepare(`SELECT COUNT(*) as cnt, AVG(score_pct) as avg_score FROM qc_checks WHERE assigned_to_id=? AND status='complete'`).get(mgr.id);
    const qcRange = db.prepare(`SELECT COUNT(*) as cnt FROM qc_checks WHERE assigned_to_id=? AND status='complete' ${dateFrom ? 'AND date >= ?' : ''} ${dateTo ? 'AND date <= ?' : ''}`).get(...[mgr.id, dateFrom, dateTo].filter(Boolean));
    const trainAll = db.prepare(`SELECT COUNT(*) as cnt FROM training_sessions WHERE assigned_to_id=? AND status='complete'`).get(mgr.id);
    const trainRange = db.prepare(`SELECT COUNT(*) as cnt FROM training_sessions WHERE assigned_to_id=? AND status='complete' ${dateFrom ? 'AND date >= ?' : ''} ${dateTo ? 'AND date <= ?' : ''}`).get(...[mgr.id, dateFrom, dateTo].filter(Boolean));
    const traineesSignedOff = db.prepare(`SELECT COUNT(DISTINCT trainee_id) as cnt FROM training_sessions WHERE assigned_to_id=? AND status='complete' AND completion_pct=100`).get(mgr.id);
    const pendingTasks = db.prepare(`SELECT COUNT(*) as cnt FROM (SELECT id FROM qc_checks WHERE assigned_to_id=? AND status='pending' UNION ALL SELECT id FROM training_sessions WHERE assigned_to_id=? AND status='pending')`).get(mgr.id, mgr.id);
    const lastQC = db.prepare(`SELECT MAX(date) as d FROM qc_checks WHERE assigned_to_id=? AND status='complete'`).get(mgr.id);
    const lastTrain = db.prepare(`SELECT MAX(date) as d FROM training_sessions WHERE assigned_to_id=? AND status='complete'`).get(mgr.id);
    const lastActivity = [lastQC?.d, lastTrain?.d].filter(Boolean).sort().reverse()[0] || null;

    return {
      ...mgr,
      qc_checks_all: qcAll.cnt,
      qc_checks_range: qcRange.cnt,
      avg_qc_score: qcAll.avg_score ? Math.round(qcAll.avg_score) : null,
      training_all: trainAll.cnt,
      training_range: trainRange.cnt,
      trainees_signed_off: traineesSignedOff.cnt,
      pending_tasks: pendingTasks.cnt,
      last_activity: lastActivity,
    };
  });

  res.json(result);
});

// Individual manager drill-down
router.get('/managers/:id', (req, res) => {
  const { range = 'all', from, to } = req.query;
  const mgrId = req.params.id;
  const mgr = db.prepare('SELECT id, name FROM managers WHERE id=?').get(mgrId);
  if (!mgr) return res.status(404).json({ error: 'Not found' });

  const { from: rangeFrom, to: rangeTo } = getDateFilter(range);
  const dateFrom = from || rangeFrom;
  const dateTo = to || rangeTo;

  // Monthly QC chart (last 12 months)
  const qcMonthly = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, COUNT(*) as count
    FROM qc_checks
    WHERE assigned_to_id=? AND status='complete'
      AND date >= date('now', '-12 months')
    GROUP BY month ORDER BY month
  `).all(mgrId);

  // Monthly training chart (last 12 months)
  const trainMonthly = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, COUNT(*) as count
    FROM training_sessions
    WHERE assigned_to_id=? AND status='complete'
      AND date >= date('now', '-12 months')
    GROUP BY month ORDER BY month
  `).all(mgrId);

  // QC checks list
  let qcWhere = `qc.assigned_to_id=${mgrId} AND qc.status='complete'`;
  if (dateFrom) qcWhere += ` AND qc.date >= '${dateFrom}'`;
  if (dateTo) qcWhere += ` AND qc.date <= '${dateTo}'`;
  const qcChecks = db.prepare(`
    SELECT qc.id, qc.date, qc.score_pct, p.name as property_name, s.name as staff_name
    FROM qc_checks qc
    JOIN properties p ON p.id=qc.property_id
    JOIN staff s ON s.id=qc.staff_id
    WHERE ${qcWhere}
    ORDER BY qc.date DESC
  `).all();

  // Training sessions list
  let trainWhere = `ts.assigned_to_id=${mgrId} AND ts.status='complete'`;
  if (dateFrom) trainWhere += ` AND ts.date >= '${dateFrom}'`;
  if (dateTo) trainWhere += ` AND ts.date <= '${dateTo}'`;
  const trainSessions = db.prepare(`
    SELECT ts.id, ts.date, ts.completion_pct, s.name as trainee_name, tc.name as checklist_name
    FROM training_sessions ts
    JOIN staff s ON s.id=ts.trainee_id
    JOIN training_checklists tc ON tc.id=ts.checklist_id
    WHERE ${trainWhere}
    ORDER BY ts.date DESC
  `).all();

  // Trainee performance: trainees trained by this manager + their avg QC scores since training
  const traineePerf = db.prepare(`
    SELECT s.id, s.name,
      MAX(ts.signed_off_at) as trained_at,
      tc.name as checklist_name,
      (SELECT AVG(qc2.score_pct) FROM qc_checks qc2
       WHERE qc2.staff_id=s.id AND qc2.status='complete'
         AND qc2.date >= date(MAX(ts.date))
      ) as avg_score_since_training
    FROM training_sessions ts
    JOIN staff s ON s.id=ts.trainee_id
    JOIN training_checklists tc ON tc.id=ts.checklist_id
    WHERE ts.assigned_to_id=? AND ts.status='complete' AND ts.completion_pct=100
    GROUP BY s.id
  `).all(mgrId);

  res.json({ mgr, qcMonthly, trainMonthly, qcChecks, trainSessions, traineePerf });
});

// Trainee performance tracker
router.get('/trainees', (req, res) => {
  const { range = 'all', from, to } = req.query;
  const { from: rangeFrom, to: rangeTo } = getDateFilter(range);
  const dateFrom = from || rangeFrom;
  const dateTo = to || rangeTo;

  const trainees = db.prepare(`
    SELECT s.id, s.name, s.role,
      m.name as trainer_name,
      MAX(ts.date) as training_completed,
      tc.name as checklist_name,
      ts.completion_pct
    FROM staff s
    LEFT JOIN training_sessions ts ON ts.trainee_id=s.id AND ts.status='complete' AND ts.completion_pct=100
    LEFT JOIN managers m ON m.id=ts.assigned_to_id
    LEFT JOIN training_checklists tc ON tc.id=ts.checklist_id
    GROUP BY s.id
    ORDER BY s.name
  `).all();

  trainees.forEach(t => {
    let where = `staff_id=${t.id} AND status='complete'`;
    if (t.training_completed) where += ` AND date >= '${t.training_completed}'`;
    if (dateFrom) where += ` AND date >= '${dateFrom}'`;
    if (dateTo) where += ` AND date <= '${dateTo}'`;
    const avg = db.prepare(`SELECT AVG(score_pct) as avg FROM qc_checks WHERE ${where}`).get();
    t.avg_qc_score = avg.avg ? Math.round(avg.avg) : null;
    const cnt = db.prepare(`SELECT COUNT(*) as cnt FROM qc_checks WHERE ${where}`).get();
    t.total_qc_checks = cnt.cnt;
  });

  res.json(trainees);
});

// Property performance breakdown
router.get('/properties', (req, res) => {
  const { range = 'all', from, to } = req.query;
  const { from: rangeFrom, to: rangeTo } = getDateFilter(range);
  const dateFrom = from || rangeFrom;
  const dateTo = to || rangeTo;

  let where = `qc.status='complete'`;
  if (dateFrom) where += ` AND qc.date >= '${dateFrom}'`;
  if (dateTo) where += ` AND qc.date <= '${dateTo}'`;

  const props = db.prepare(`
    SELECT p.id, p.name, p.address, p.airbnb_id,
      COUNT(qc.id) as total_checks,
      AVG(qc.score_pct) as avg_score,
      MAX(qc.date) as last_check_date
    FROM properties p
    LEFT JOIN qc_checks qc ON qc.property_id=p.id AND ${where}
    GROUP BY p.id
    ORDER BY avg_score ASC
  `).all();

  props.forEach(p => {
    const topMgr = db.prepare(`
      SELECT m.name, COUNT(*) as cnt
      FROM qc_checks qc
      JOIN managers m ON m.id=qc.assigned_to_id
      WHERE qc.property_id=? AND qc.status='complete'
      GROUP BY m.id ORDER BY cnt DESC LIMIT 1
    `).get(p.id);
    p.top_manager = topMgr?.name || null;
    p.avg_score = p.avg_score ? Math.round(p.avg_score) : null;
  });

  res.json(props);
});

module.exports = router;
