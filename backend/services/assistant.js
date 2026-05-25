const db = require('../db');

function getSettings() {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return s;
}

function buildContext() {
  const settings = getSettings();
  const threshold = parseFloat(settings.watchlist_threshold || '90');

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

  const complaints = db.prepare(`
    SELECT c.*, s.name as staff_name, p.name as property_name
    FROM complaints c
    LEFT JOIN staff s ON s.id = c.staff_id
    LEFT JOIN properties p ON p.id = c.property_id
    WHERE c.date >= date('now', '-90 days')
    ORDER BY c.date DESC
  `).all();

  const coaching = db.prepare(`
    SELECT cs.*, s.name as staff_name, m.name as manager_name
    FROM coaching_sessions cs
    LEFT JOIN staff s ON s.id = cs.staff_id
    LEFT JOIN managers m ON m.id = cs.manager_id
    ORDER BY cs.date DESC
    LIMIT 50
  `).all();

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

  const overdueStaff = db.prepare(`
    SELECT s.name, MAX(q.date) as last_check
    FROM staff s
    LEFT JOIN qc_checks q ON q.staff_id = s.id AND q.status = 'complete'
    WHERE s.inactive_until IS NULL OR s.inactive_until <= date('now')
    GROUP BY s.id
    HAVING last_check IS NULL OR last_check < date('now', '-' || ? || ' days')
    ORDER BY last_check ASC
  `).all(settings.qc_freq_staff_days || '30');

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
    `- ${s.name} (${s.role}): ${s.total_checks} checks, avg ${s.avg_score ?? 'N/A'}%, latest ${s.latest_score ?? 'N/A'}%, last checked ${s.last_check_date ?? 'never'}`
  ).join('\n');

  const complaintLines = complaints.length === 0 ? 'None in last 90 days.' : complaints.map(c =>
    `- ${c.staff_name}: ${c.severity} from ${c.source} on ${c.date}${c.property_name ? ` at ${c.property_name}` : ''} — "${c.description}"${c.resolution ? ` | Resolution: ${c.resolution}` : ' | Unresolved'}`
  ).join('\n');

  const coachingLines = coaching.length === 0 ? 'None on record.' : coaching.map(c =>
    `- ${c.staff_name}: ${c.status} session with ${c.manager_name} on ${c.date}${c.topic ? ` — ${c.topic}` : ''}${c.outcome ? ` | ${c.outcome}` : ''}`
  ).join('\n');

  const watchlistLines = watchlist.length === 0 ? 'Everyone above threshold.' : watchlist.map(w =>
    `- ${w.name}: avg ${w.avg_score}% (threshold ${threshold}%, ${w.checks} checks in 90d)`
  ).join('\n');

  const overdueLines = overdueStaff.length === 0 ? 'No one overdue.' : overdueStaff.map(s =>
    `- ${s.name}: last check ${s.last_check ?? 'never'}`
  ).join('\n');

  const propertyLines = properties.map(p =>
    `- ${p.name}: last check ${p.last_check ?? 'never'}, score ${p.last_score ?? 'N/A'}%`
  ).join('\n');

  return `You are an intelligent assistant for LCA Cleaning Services. You have real-time data from their QC management system. Today is ${today}.

Be concise, direct and professional. Use bullet points for lists. Keep WhatsApp replies under 1500 characters where possible — split into multiple short messages if needed. If asked about a specific person, summarise everything relevant about them.

== STAFF PERFORMANCE ==
${staffLines}

== WATCHLIST (below ${threshold}%) ==
${watchlistLines}

== OVERDUE QC ==
${overdueLines}

== COMPLAINTS (last 90 days) ==
${complaintLines}

== COACHING ==
${coachingLines}

== PROPERTIES ==
${propertyLines}

Answer only from this data. If something isn't here, say so clearly.`;
}

async function askClaude(messages) {
  const settings = getSettings();
  const apiKey = settings.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Anthropic API key not configured. Add it in Settings.');

  const ctx = buildContext();
  const system = buildSystemPrompt(ctx);

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
      system,
      messages,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Claude API error');
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

module.exports = { askClaude, getSettings };
