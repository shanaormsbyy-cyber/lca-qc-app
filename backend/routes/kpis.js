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
    let where = `staff_id=${t.id} AND status='complete' AND (check_type='staff' OR check_type IS NULL)`;
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

  let where = `qc.status='complete' AND (qc.check_type='property' OR qc.check_type IS NULL)`;
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

// Top performers
router.get('/top-performers', (req, res) => {
  const settingsRows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  settingsRows.forEach(s => { settings[s.key] = s.value; });
  const threshold = parseFloat(settings.top_performers_threshold || '90');
  const minChecks = parseInt(settings.top_performers_min_checks || '3');

  const staff = db.prepare('SELECT id, name, role FROM staff ORDER BY name').all();
  const topPerformers = [];

  staff.forEach(s => {
    const result = db.prepare(`
      SELECT COUNT(*) as cnt, AVG(score_pct) as avg
      FROM qc_checks
      WHERE staff_id=? AND status='complete' AND (check_type='staff' OR check_type IS NULL)
    `).get(s.id);

    if (result.cnt >= minChecks && result.avg != null && result.avg >= threshold) {
      const recent = db.prepare(`
        SELECT qc_checks.date, qc_checks.score_pct, properties.name as property_name
        FROM qc_checks
        JOIN properties ON properties.id = qc_checks.property_id
        WHERE qc_checks.staff_id=? AND qc_checks.status='complete' AND (qc_checks.check_type='staff' OR qc_checks.check_type IS NULL)
        ORDER BY qc_checks.date DESC LIMIT 3
      `).all(s.id);

      topPerformers.push({
        ...s,
        avg_score: Math.round(result.avg),
        total_checks: result.cnt,
        recent_checks: recent,
        threshold,
      });
    }
  });

  topPerformers.sort((a, b) => b.avg_score - a.avg_score);
  res.json({ topPerformers, threshold, minChecks });
});

// Performance watchlist
router.get('/watchlist', (req, res) => {
  const settingsRows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  settingsRows.forEach(s => { settings[s.key] = s.value; });
  const threshold = parseFloat(settings.watchlist_threshold || '70');

  const staff = db.prepare('SELECT id, name, role FROM staff ORDER BY name').all();
  const watchlist = [];

  staff.forEach(s => {
    const result = db.prepare(`
      SELECT COUNT(*) as cnt, AVG(score_pct) as avg
      FROM qc_checks
      WHERE staff_id=? AND status='complete' AND (check_type='staff' OR check_type IS NULL)
    `).get(s.id);

    if (result.cnt > 0 && result.avg != null && result.avg < threshold) {
      const recent = db.prepare(`
        SELECT qc_checks.date, qc_checks.score_pct, properties.name as property_name
        FROM qc_checks
        JOIN properties ON properties.id = qc_checks.property_id
        WHERE qc_checks.staff_id=? AND qc_checks.status='complete' AND (qc_checks.check_type='staff' OR qc_checks.check_type IS NULL)
        ORDER BY qc_checks.date DESC LIMIT 3
      `).all(s.id);

      watchlist.push({
        ...s,
        avg_score: Math.round(result.avg),
        total_checks: result.cnt,
        recent_checks: recent,
        threshold,
      });
    }
  });

  watchlist.sort((a, b) => a.avg_score - b.avg_score);
  res.json({ watchlist, threshold });
});

// Commonly flagged items
router.get('/flagged-items', (req, res) => {
  const { period = 'week' } = req.query;

  const settingsRows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  settingsRows.forEach(s => { settings[s.key] = s.value; });

  const minCount    = parseInt(settings.flag_min_count    || '3');
  const modMin      = parseInt(settings.flag_moderate_min || '3');
  const modMax      = parseInt(settings.flag_moderate_max || '4');
  const majMin      = parseInt(settings.flag_major_min    || '5');
  const majMax      = parseInt(settings.flag_major_max    || '7');
  const urgentMin   = parseInt(settings.flag_urgent_min   || '8');

  const days = period === 'month' ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT
      COALESCE(qi.category, 'General') as category,
      COUNT(*) as flag_count,
      COUNT(DISTINCT qi.text) as item_count,
      MAX(qc.date) as last_flagged,
      GROUP_CONCAT(qi.text) as item_texts_raw
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    JOIN qc_checks qc ON qc.id = qci.check_id
    WHERE qc.status = 'complete'
      AND qc.date >= ?
      AND (qci.na IS NULL OR qci.na = 0)
      AND (
        (qi.score_type = 'pass_fail' AND qci.score = 0)
        OR
        (qi.score_type = '1_to_5' AND qci.score <= 2)
      )
    GROUP BY COALESCE(qi.category, 'General')
    HAVING COUNT(*) >= ?
    ORDER BY flag_count DESC
  `).all(sinceStr, minCount);

  const getLabel = count => {
    if (count >= urgentMin) return { label: 'Urgent', color: 'red' };
    if (count >= majMin && count <= majMax) return { label: 'Major', color: 'amber' };
    if (count >= modMin && count <= modMax) return { label: 'Moderate', color: 'blue' };
    return { label: 'Noted', color: 'grey' };
  };

  const items = rows.map(r => {
    const uniqueTexts = [...new Set((r.item_texts_raw || '').split(',').filter(Boolean))];
    return {
      category: r.category,
      flag_count: r.flag_count,
      item_count: r.item_count,
      last_flagged: r.last_flagged,
      items: uniqueTexts.slice(0, 4),
      ...getLabel(r.flag_count),
    };
  });
  res.json({ items, period, settings: { minCount, modMin, modMax, majMin, majMax, urgentMin } });
});

// Trend breakdown for a specific flagged category
router.get('/flagged-items/trend', (req, res) => {
  const { category, weeks = 8 } = req.query;
  if (!category) return res.status(400).json({ error: 'category required' });

  const now = new Date();
  const trend = [];
  for (let w = parseInt(weeks) - 1; w >= 0; w--) {
    const end = new Date(now); end.setDate(end.getDate() - w * 7);
    const start = new Date(end); start.setDate(start.getDate() - 7);
    const fromStr = start.toISOString().slice(0, 10);
    const toStr   = end.toISOString().slice(0, 10);
    const row = db.prepare(`
      SELECT COUNT(*) as flag_count
      FROM qc_check_items qci
      JOIN qc_checklist_items qi ON qi.id = qci.item_id
      JOIN qc_checks qc ON qc.id = qci.check_id
      WHERE COALESCE(qi.category, 'General') = ?
        AND qc.status = 'complete'
        AND qc.date >= ? AND qc.date < ?
        AND (qci.na IS NULL OR qci.na = 0)
        AND ((qi.score_type = 'pass_fail' AND qci.score = 0) OR (qi.score_type = '1_to_5' AND qci.score <= 2))
    `).get(category, fromStr, toStr);
    trend.push({ label: fromStr.slice(5), flag_count: row.flag_count });
  }

  const items = db.prepare(`
    SELECT qi.text, COUNT(*) as flag_count, MAX(qc.date) as last_flagged
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    JOIN qc_checks qc ON qc.id = qci.check_id
    WHERE COALESCE(qi.category, 'General') = ?
      AND qc.status = 'complete'
      AND (qci.na IS NULL OR qci.na = 0)
      AND ((qi.score_type = 'pass_fail' AND qci.score = 0) OR (qi.score_type = '1_to_5' AND qci.score <= 2))
    GROUP BY qi.text
    ORDER BY flag_count DESC
  `).all(category);

  res.json({ category, trend, items });
});

// AI-style performance summary for a staff member
router.get('/staff/:id/insights', (req, res) => {
  const staffId = req.params.id;
  const today = new Date();
  const day30Ago = new Date(today); day30Ago.setDate(day30Ago.getDate() - 30);
  const day30Str = day30Ago.toISOString().slice(0, 10);

  // All completed checks for this staff member, ordered oldest→newest
  const checks = db.prepare(`
    SELECT qc.id, qc.date, qc.score_pct
    FROM qc_checks qc
    WHERE qc.staff_id = ? AND qc.status = 'complete'
    ORDER BY qc.date ASC
  `).all(staffId);

  if (checks.length === 0) {
    return res.json({ insights: [], summary: 'No completed QC checks yet — insights will appear once checks are recorded.' });
  }

  // All failed items across all checks, with date
  const failedItems = db.prepare(`
    SELECT qi.text, qi.category, qci.score, qi.score_type, qc.date,
      COUNT(*) OVER (PARTITION BY qi.text) as total_fails,
      MAX(qc.date) OVER (PARTITION BY qi.text) as last_fail,
      MIN(qc.date) OVER (PARTITION BY qi.text) as first_fail
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    JOIN qc_checks qc ON qc.id = qci.check_id
    WHERE qc.staff_id = ? AND qc.status = 'complete'
      AND (
        (qi.score_type = 'pass_fail' AND qci.score = 0)
        OR (qi.score_type = '1_to_5' AND qci.score <= 2)
      )
    ORDER BY qc.date DESC
  `).all(staffId);

  // Deduplicate by text to get unique issue summaries
  const issueMap = {};
  failedItems.forEach(row => {
    if (!issueMap[row.text]) {
      issueMap[row.text] = {
        text: row.text,
        category: row.category,
        total_fails: row.total_fails,
        last_fail: row.last_fail,
        first_fail: row.first_fail,
      };
    }
  });
  const issues = Object.values(issueMap);

  const insights = [];

  // ── 1. Score trend (last 3+ checks) ───────────────────────────────────────
  if (checks.length >= 3) {
    const recent = checks.slice(-3);
    const scores = recent.map(c => c.score_pct);
    const allUp = scores[1] > scores[0] && scores[2] > scores[1];
    const allDown = scores[1] < scores[0] && scores[2] < scores[1];
    const latestScore = scores[scores.length - 1];
    if (allUp) {
      insights.push({ type: 'positive', text: `Score has improved across the last 3 checks (${scores.map(s => Math.round(s) + '%').join(' → ')}). Keep reinforcing what's working.` });
    } else if (allDown) {
      insights.push({ type: 'warning', text: `Score has declined across the last 3 checks (${scores.map(s => Math.round(s) + '%').join(' → ')}). Review recent check items for patterns.` });
    }
    if (latestScore < 70) {
      insights.push({ type: 'alert', text: `Latest check score is ${Math.round(latestScore)}% — below the 70% threshold. Consider scheduling a follow-up check or coaching session.` });
    } else if (latestScore >= 90) {
      insights.push({ type: 'positive', text: `Latest check score is ${Math.round(latestScore)}% — excellent performance. Consistently strong results.` });
    }
  }

  // ── 2. Persistent recurring issues (3+ fails, still recent) ──────────────
  const persistent = issues.filter(i => i.total_fails >= 3 && i.last_fail >= day30Str);
  if (persistent.length > 0) {
    persistent.slice(0, 3).forEach(issue => {
      insights.push({ type: 'alert', text: `"${issue.text}" has failed ${issue.total_fails} times${issue.category ? ` (${issue.category})` : ''} and was last flagged on ${issue.last_fail.split('-').reverse().join('-')}. This is a persistent pattern — consider direct coaching on this item.` });
    });
  }

  // ── 3. Issues that dropped off (previously recurring, not seen in 30+ days) ─
  const resolved = issues.filter(i => i.total_fails >= 2 && i.last_fail < day30Str);
  if (resolved.length > 0) {
    resolved.slice(0, 2).forEach(issue => {
      insights.push({ type: 'positive', text: `"${issue.text}" was previously flagged ${issue.total_fails} times but hasn't appeared in over 30 days — showing improvement in this area.` });
    });
  }

  // ── 4. Category patterns ──────────────────────────────────────────────────
  const categoryCount = {};
  issues.forEach(i => {
    if (i.category) {
      if (!categoryCount[i.category]) categoryCount[i.category] = { fails: 0, items: [] };
      categoryCount[i.category].fails += i.total_fails;
      categoryCount[i.category].items.push(i.text);
    }
  });
  const weakCategories = Object.entries(categoryCount)
    .filter(([, v]) => v.fails >= 4)
    .sort((a, b) => b[1].fails - a[1].fails)
    .slice(0, 2);
  weakCategories.forEach(([cat, v]) => {
    insights.push({ type: 'warning', text: `${cat} is a consistently weak area with ${v.fails} total fails across ${v.items.length} different items. This category may benefit from targeted retraining.` });
  });

  // ── 5. Inactivity / not enough data ──────────────────────────────────────
  const lastCheck = checks[checks.length - 1];
  const daysSinceCheck = Math.floor((today - new Date(lastCheck.date)) / 86400000);
  if (daysSinceCheck > 45) {
    insights.push({ type: 'info', text: `Last QC check was ${daysSinceCheck} days ago (${lastCheck.date.split('-').reverse().join('-')}). Regular checks help maintain consistency.` });
  }

  // ── 6. Overall summary line ───────────────────────────────────────────────
  const avgScore = checks.reduce((s, c) => s + c.score_pct, 0) / checks.length;
  let summary;
  if (avgScore >= 90) summary = `Strong performer with an average score of ${Math.round(avgScore)}% across ${checks.length} checks.`;
  else if (avgScore >= 80) summary = `Solid performer averaging ${Math.round(avgScore)}% across ${checks.length} checks, with some areas to watch.`;
  else if (avgScore >= 70) summary = `Average performance of ${Math.round(avgScore)}% across ${checks.length} checks — room for improvement in key areas.`;
  else summary = `Below-target average of ${Math.round(avgScore)}% across ${checks.length} checks — recommend active coaching and follow-up.`;

  if (insights.length === 0) {
    insights.push({ type: 'positive', text: 'No recurring issues detected. Performance looks consistent across recent checks.' });
  }

  res.json({ insights, summary });
});

// AI-style insights for a property
router.get('/properties/:id/insights', (req, res) => {
  const propId = req.params.id;
  const today = new Date();
  const day30Ago = new Date(today); day30Ago.setDate(day30Ago.getDate() - 30);
  const day30Str = day30Ago.toISOString().slice(0, 10);

  const checks = db.prepare(`
    SELECT qc.id, qc.date, qc.score_pct
    FROM qc_checks qc
    WHERE qc.property_id = ? AND qc.status = 'complete' AND qc.check_type = 'property'
    ORDER BY qc.date ASC
  `).all(propId);

  if (checks.length === 0) {
    return res.json({ insights: [], summary: 'No completed property health checks yet — insights will appear once checks are recorded.' });
  }

  const failedItems = db.prepare(`
    SELECT qi.text, qi.category, qci.score, qi.score_type, qc.date,
      COUNT(*) OVER (PARTITION BY qi.text) as total_fails,
      MAX(qc.date) OVER (PARTITION BY qi.text) as last_fail,
      MIN(qc.date) OVER (PARTITION BY qi.text) as first_fail
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    JOIN qc_checks qc ON qc.id = qci.check_id
    WHERE qc.property_id = ? AND qc.status = 'complete' AND qc.check_type = 'property'
      AND (
        (qi.score_type = 'pass_fail' AND qci.score = 0)
        OR (qi.score_type = '1_to_5' AND qci.score <= 2)
      )
    ORDER BY qc.date DESC
  `).all(propId);

  const issueMap = {};
  failedItems.forEach(row => {
    if (!issueMap[row.text]) {
      issueMap[row.text] = { text: row.text, category: row.category, total_fails: row.total_fails, last_fail: row.last_fail, first_fail: row.first_fail };
    }
  });
  const issues = Object.values(issueMap);

  const insights = [];

  // Score trend
  if (checks.length >= 3) {
    const recent = checks.slice(-3);
    const scores = recent.map(c => c.score_pct);
    const allUp = scores[1] > scores[0] && scores[2] > scores[1];
    const allDown = scores[1] < scores[0] && scores[2] < scores[1];
    const latestScore = scores[scores.length - 1];
    if (allUp) {
      insights.push({ type: 'positive', text: `Property score has improved across the last 3 checks (${scores.map(s => Math.round(s) + '%').join(' → ')}). Maintenance actions are having a positive effect.` });
    } else if (allDown) {
      insights.push({ type: 'warning', text: `Property score has declined across the last 3 checks (${scores.map(s => Math.round(s) + '%').join(' → ')}). Consider a targeted inspection or deep clean.` });
    }
    if (latestScore < 70) {
      insights.push({ type: 'alert', text: `Latest health check score is ${Math.round(latestScore)}% — below the 70% threshold. Recommend scheduling a deep clean or maintenance visit.` });
    } else if (latestScore >= 90) {
      insights.push({ type: 'positive', text: `Latest health check score is ${Math.round(latestScore)}% — the property is in excellent condition.` });
    }
  }

  // Persistent recurring issues
  const persistent = issues.filter(i => i.total_fails >= 2 && i.last_fail >= day30Str);
  persistent.slice(0, 4).forEach(issue => {
    const rec = getRecommendation(issue.text, issue.category);
    insights.push({ type: 'alert', text: `"${issue.text}" has been flagged ${issue.total_fails} times${issue.category ? ` (${issue.category})` : ''} and was last noted on ${fmtDate(issue.last_fail)}. ${rec}` });
  });

  // Resolved issues
  const resolved = issues.filter(i => i.total_fails >= 2 && i.last_fail < day30Str);
  resolved.slice(0, 2).forEach(issue => {
    insights.push({ type: 'positive', text: `"${issue.text}" was previously flagged ${issue.total_fails} times but hasn't appeared in over 30 days — good improvement in this area.` });
  });

  // Category patterns
  const categoryCount = {};
  issues.forEach(i => {
    if (i.category) {
      if (!categoryCount[i.category]) categoryCount[i.category] = { fails: 0, items: [] };
      categoryCount[i.category].fails += i.total_fails;
      categoryCount[i.category].items.push(i.text);
    }
  });
  const weakCategories = Object.entries(categoryCount)
    .filter(([, v]) => v.fails >= 3)
    .sort((a, b) => b[1].fails - a[1].fails)
    .slice(0, 2);
  weakCategories.forEach(([cat, v]) => {
    insights.push({ type: 'warning', text: `${cat} is a recurring problem area with ${v.fails} total failures across ${v.items.length} different items. This area may need a dedicated maintenance response.` });
  });

  // Inactivity
  const lastCheck = checks[checks.length - 1];
  const daysSince = Math.floor((today - new Date(lastCheck.date)) / 86400000);
  if (daysSince > 30) {
    insights.push({ type: 'info', text: `Last health check was ${daysSince} days ago (${fmtDate(lastCheck.date)}). Regular checks help catch issues before they escalate.` });
  }

  const avgScore = checks.reduce((s, c) => s + c.score_pct, 0) / checks.length;
  let summary;
  if (avgScore >= 90) summary = `Excellent property condition with an average score of ${Math.round(avgScore)}% across ${checks.length} health checks.`;
  else if (avgScore >= 80) summary = `Good property condition averaging ${Math.round(avgScore)}% across ${checks.length} checks, with some maintenance areas to watch.`;
  else if (avgScore >= 70) summary = `Average property health of ${Math.round(avgScore)}% across ${checks.length} checks — targeted maintenance recommended.`;
  else summary = `Below-target average of ${Math.round(avgScore)}% across ${checks.length} checks — property requires active maintenance attention.`;

  if (insights.length === 0) {
    insights.push({ type: 'positive', text: 'No recurring issues detected. Property is well maintained.' });
  }

  res.json({ insights, summary });
});

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}-${m}-${y}`;
}

function getRecommendation(text, category) {
  const t = (text || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (t.includes('mould') || t.includes('mold')) return 'Recommend a mould treatment and improved ventilation.';
  if (t.includes('grout') || t.includes('tile')) return 'Recommend re-grouting or tile cleaning.';
  if (t.includes('stain')) return 'Recommend professional stain removal or surface replacement.';
  if (t.includes('silicon') || t.includes('sealant')) return 'Recommend re-sealing affected surfaces.';
  if (t.includes('dust') || t.includes('dusty')) return 'Recommend a thorough deep clean of surfaces and fixtures.';
  if (t.includes('broken') || t.includes('damage') || t.includes('cracked')) return 'Recommend repair or replacement of the affected item.';
  if (t.includes('light') || t.includes('bulb')) return 'Recommend replacing light fittings or bulbs.';
  if (t.includes('drain') || t.includes('plumb')) return 'Recommend a plumber inspection.';
  if (c.includes('bathroom') || c.includes('shower')) return 'Recommend a deep clean of bathroom surfaces and fixtures.';
  if (c.includes('kitchen')) return 'Recommend a deep clean of kitchen surfaces and appliances.';
  return 'Recommend a targeted maintenance inspection.';
}

// Common issues for a specific staff member
router.get('/staff/:id/common-issues', (req, res) => {
  const staffId = req.params.id;
  const minCount = 3;

  const rows = db.prepare(`
    SELECT qi.text, qi.category, qi.score_type,
      COUNT(*) as flag_count,
      MAX(qc.date) as last_flagged
    FROM qc_check_items qci
    JOIN qc_checklist_items qi ON qi.id = qci.item_id
    JOIN qc_checks qc ON qc.id = qci.check_id
    WHERE qc.status = 'complete'
      AND qc.staff_id = ?
      AND (
        (qi.score_type = 'pass_fail' AND qci.score = 0)
        OR
        (qi.score_type = '1_to_5' AND qci.score <= 2)
      )
    GROUP BY qi.text
    HAVING COUNT(*) >= ?
    ORDER BY flag_count DESC
  `).all(staffId, minCount);

  res.json(rows);
});

module.exports = router;
