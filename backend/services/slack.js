const db = require('../db');

function getSlackConfig() {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => { s[r.key] = r.value; });
  return {
    webhookUrl: s.slack_webhook_url || process.env.SLACK_WEBHOOK_URL || '',
    botToken:   s.slack_bot_token   || process.env.SLACK_BOT_TOKEN   || '',
    portalUrl:  (s.portal_base_url  || '').replace(/\/$/, ''),
    notifyCheckComplete:  s.slack_notify_check_complete  !== 'false',
    notifyBelowThreshold: s.slack_notify_below_threshold !== 'false',
  };
}

async function postToChannel(webhookUrl, text) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
}

async function sendDM(botToken, email, text) {
  const lookupRes = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  const lookupData = await lookupRes.json();
  if (!lookupData.ok || !lookupData.user?.id) {
    console.error('Slack DM: user not found for email', email, lookupData.error);
    return;
  }
  const userId = lookupData.user.id;

  const openRes = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: userId }),
  });
  const openData = await openRes.json();
  if (!openData.ok || !openData.channel?.id) {
    throw new Error(`conversations.open failed: ${openData.error}`);
  }
  const channelId = openData.channel.id;

  const msgRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: channelId, text }),
  });
  const msgData = await msgRes.json();
  if (!msgData.ok) throw new Error(`chat.postMessage failed: ${msgData.error}`);
}

async function notifyCheckComplete(checkId) {
  try {
    const cfg = getSlackConfig();
    if (!cfg.notifyCheckComplete || !cfg.botToken) return;

    const check = db.prepare('SELECT staff_id FROM qc_checks WHERE id = ?').get(checkId);
    if (!check?.staff_id) return;

    const staff = db.prepare('SELECT name, slack_email FROM staff WHERE id = ?').get(check.staff_id);
    if (!staff?.slack_email) return;

    const portalLink = cfg.portalUrl ? `${cfg.portalUrl}/portal` : 'the portal';
    await sendDM(cfg.botToken, staff.slack_email,
      `Your QC check has been completed. Please check the portal for more details: ${portalLink}`
    );
  } catch (e) {
    console.error('Slack notifyCheckComplete failed:', e.message);
  }
}

async function notifyBelowThreshold(checkId) {
  try {
    const cfg = getSlackConfig();
    if (!cfg.notifyBelowThreshold || !cfg.webhookUrl) return;

    const check = db.prepare(`
      SELECT qc.staff_id, qc.score_pct, p.name as property_name
      FROM qc_checks qc
      JOIN properties p ON p.id = qc.property_id
      WHERE qc.id = ?
    `).get(checkId);
    if (!check) return;

    const settingsRows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });
    const threshold = parseFloat(settings.watchlist_threshold || '90');

    const staff = db.prepare('SELECT name FROM staff WHERE id = ?').get(check.staff_id);
    if (!staff) return;

    const score = Math.round(check.score_pct);

    if (check.score_pct < threshold) {
      await postToChannel(cfg.webhookUrl,
        `⚠️ QC Alert: ${staff.name} scored ${score}% at ${check.property_name} — below the ${Math.round(threshold)}% target.`
      );
    }

    const allChecks = db.prepare(`
      SELECT score_pct FROM qc_checks
      WHERE staff_id = ? AND status = 'complete' AND (check_type = 'staff' OR check_type IS NULL)
      ORDER BY date ASC
    `).all(check.staff_id);

    if (allChecks.length < 2) return;

    const currentAvg = allChecks.reduce((s, c) => s + c.score_pct, 0) / allChecks.length;
    const prevChecks = allChecks.slice(0, -1);
    const prevAvg = prevChecks.reduce((s, c) => s + c.score_pct, 0) / prevChecks.length;

    if (prevAvg >= threshold && currentAvg < threshold) {
      await postToChannel(cfg.webhookUrl,
        `📉 Performance Alert: ${staff.name}'s average score has dropped to ${Math.round(currentAvg)}% — below the ${Math.round(threshold)}% acceptable average.`
      );
    }
  } catch (e) {
    console.error('Slack notifyBelowThreshold failed:', e.message);
  }
}

async function notifyDisciplinary(warningId) {
  try {
    const cfg = getSlackConfig();
    if (!cfg.botToken) return;

    const warning = db.prepare('SELECT staff_id, level FROM warnings WHERE id = ?').get(warningId);
    if (!warning) return;

    const staff = db.prepare('SELECT name, slack_email FROM staff WHERE id = ?').get(warning.staff_id);
    if (!staff?.slack_email) return;

    const levelLabels = {
      verbal_note:     'Verbal Note',
      written_warning: 'Written Warning',
      final_warning:   'Final Warning',
    };
    const levelLabel = levelLabels[warning.level] || warning.level;
    const portalLink = cfg.portalUrl ? `${cfg.portalUrl}/portal` : 'the portal';

    await sendDM(cfg.botToken, staff.slack_email,
      `You have received a ${levelLabel}. Please log in to the portal to view details and acknowledge it: ${portalLink}`
    );
  } catch (e) {
    console.error('Slack notifyDisciplinary failed:', e.message);
  }
}

module.exports = { notifyCheckComplete, notifyBelowThreshold, notifyDisciplinary };
