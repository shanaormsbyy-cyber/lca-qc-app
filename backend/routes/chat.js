const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function getSettings() {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return s;
}

function buildContext() {
  // Staff + recent QC scores
  const staff = db.prepare(`
    SELECT s.id, s.name, s.role,
      COUNT(q.id) as total_checks,
      ROUND(AVG(q.score_pct), 1) as avg_score,
      MAX(q.date) as last_check_date,
      (SELECT score_pct FROM qc_checks WHERE staff_id=s.id AND status='complete' ORDER BY date DESC LIMIT 1) as latest_score
    FROM staff s
    LEFT JOIN qc_checks q ON q.staff_id = s.id AND q.status = 'complete'
    WHERE s.inactive_until IS NULL OR s.inactive_until <= date('now')
    GROUP BY s.id
    ORDER BY s.name
  `).all();

  // Complaints (last 90 days)
  const complaints = db.prepare(`
    SELECT c.*, s.name as staff_name, p.name as property_name
    FROM complaints c
    LEFT JOIN staff s ON s.id = c.staff_id
    LEFT JOIN properties p ON p.id = c.property_id
    WHERE c.date >= date('now', '-90 days')
    ORDER BY c.date DESC
  `).all();

  // Coaching sessions
  const coaching = db.prepare(`
    SELECT cs.*, s.name as staff_name, m.name as manager_name
    FROM coaching_sessions cs
    LEFT JOIN staff s ON s.id = cs.staff_id
    LEFT JOIN managers m ON m.id = cs.manager_id
    ORDER BY cs.date DESC
    LIMIT 50
  `).all();

  // Watchlist (below threshold)
  const settings = getSettings();
  const threshold = parseFloat(settings.watchlist_threshold || '90');
  const watchlist = db.prepare(`
    SELECT s.name, ROUND(AVG(q.score_pct),1) as avg_score, COUNT(q.id) as checks
    FROM staff s
    JOIN qc_checks q ON q.staff_id = s.id AND q.status = 'complete'
      AND q.date >= date('now', '-90 days')
    WHERE s.inactive_until IS NULL OR s.inactive_until <= date('now')
    GROUP BY s.id
    HAVING avg_score < ?
    ORDER BY avg_score ASC
  `).all(threshold);

  // Overdue QC
  const overdueStaff = db.prepare(`
    SELECT s.name, MAX(q.date) as last_check
    FROM staff s
    LEFT JOIN qc_checks q ON q.staff_id = s.id AND q.status = 'complete'
    WHERE s.inactive_until IS NULL OR s.inactive_until <= date('now')
    GROUP BY s.id
    HAVING last_check IS NULL OR last_check < date('now', '-' || ? || ' days')
    ORDER BY last_check ASC
  `).all(settings.qc_freq_staff_days || '30');

  // Properties
  const properties = db.prepare(`
    SELECT p.name,
      (SELECT date FROM qc_checks WHERE property_id=p.id AND status='complete' ORDER BY date DESC LIMIT 1) as last_check,
      (SELECT ROUND(score_pct,1) FROM qc_checks WHERE property_id=p.id AND status='complete' ORDER BY date DESC LIMIT 1) as last_score
    FROM properties p
    WHERE p.inactive_until IS NULL OR p.inactive_until <= date('now')
    ORDER BY p.name
  `).all();

  return { staff, complaints, coaching, watchlist, overdueStaff, properties, threshold, today: new Date().toISOString().slice(0, 10) };
}

function buildSystemPrompt(ctx) {
  const { staff, complaints, coaching, watchlist, overdueStaff, properties, threshold, today } = ctx;

  const staffLines = staff.map(s =>
    `- ${s.name} (${s.role}): ${s.total_checks} checks, avg score ${s.avg_score ?? 'N/A'}%, latest score ${s.latest_score ?? 'N/A'}%, last checked ${s.last_check_date ?? 'never'}`
  ).join('\n');

  const complaintLines = complaints.length === 0 ? 'None in last 90 days.' : complaints.map(c =>
    `- ${c.staff_name}: ${c.severity} complaint from ${c.source} on ${c.date}${c.property_name ? ` at ${c.property_name}` : ''} — "${c.description}"${c.resolution ? ` | Resolution: ${c.resolution}` : ' | Unresolved'}`
  ).join('\n');

  const coachingLines = coaching.length === 0 ? 'None on record.' : coaching.map(c =>
    `- ${c.staff_name}: ${c.status} session with ${c.manager_name} on ${c.date}${c.topic ? ` — Topic: ${c.topic}` : ''}${c.outcome ? ` | Outcome: ${c.outcome}` : ''}`
  ).join('\n');

  const watchlistLines = watchlist.length === 0 ? 'Everyone is above threshold.' : watchlist.map(w =>
    `- ${w.name}: avg ${w.avg_score}% (${w.checks} checks in 90d, threshold is ${threshold}%)`
  ).join('\n');

  const overdueLines = overdueStaff.length === 0 ? 'No one overdue.' : overdueStaff.map(s =>
    `- ${s.name}: last check ${s.last_check ?? 'never'}`
  ).join('\n');

  const propertyLines = properties.map(p =>
    `- ${p.name}: last check ${p.last_check ?? 'never'}, score ${p.last_score ?? 'N/A'}%`
  ).join('\n');

  return `You are an intelligent assistant for LCA Cleaning Services, a professional cleaning company. You have access to real-time data from their quality control management system. Today is ${today}.

Your job is to help managers quickly understand staff performance, complaints, coaching status, and property health. Be concise, direct, and professional. Use bullet points for lists. If asked about a specific person, pull together everything relevant about them.

== STAFF PERFORMANCE (90-day QC scores) ==
${staffLines}

== PERFORMANCE WATCHLIST (below ${threshold}% threshold, last 90 days) ==
${watchlistLines}

== OVERDUE QC CHECKS ==
${overdueLines}

== COMPLAINTS (last 90 days) ==
${complaintLines}

== COACHING SESSIONS ==
${coachingLines}

== PROPERTIES ==
${propertyLines}

Answer questions based on this data. If something isn't in the data, say so clearly. Don't make things up.`;
}

router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const settings = getSettings();
  const apiKey = settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Anthropic API key not configured. Add it in Settings.' });
  }

  const ctx = buildContext();
  const systemPrompt = buildSystemPrompt(ctx);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(502).json({ error: err.error?.message || 'Claude API error' });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
