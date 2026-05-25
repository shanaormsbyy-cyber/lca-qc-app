const express = require('express');
const { askClaude, getSettings } = require('../services/assistant');

const router = express.Router();

// In-memory conversation history per WhatsApp number (cleared on restart)
const conversations = {};
const MAX_HISTORY = 20; // keep last 20 turns per user

function twilioResponse(text) {
  // Twilio expects TwiML XML for WhatsApp replies
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(text)}</Message>
</Response>`;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function validateTwilio(req) {
  const settings = getSettings();
  const authToken = settings.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  // Skip validation if no token configured (dev/sandbox mode)
  if (!authToken) return true;

  // Basic check: ensure request comes with expected Twilio fields
  return req.body && req.body.From && req.body.Body;
}

router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  res.set('Content-Type', 'text/xml');

  if (!validateTwilio(req)) {
    return res.send(twilioResponse('Unauthorized'));
  }

  const from = req.body.From || '';
  const text = (req.body.Body || '').trim();

  if (!text) {
    return res.send(twilioResponse('Hi! Ask me anything about your LCA team — scores, complaints, coaching, overdue checks.'));
  }

  // Handle "clear" / "reset" to start fresh
  if (/^(clear|reset|start over)$/i.test(text)) {
    conversations[from] = [];
    return res.send(twilioResponse('Conversation cleared. Ask me anything about your team!'));
  }

  // Build conversation history
  if (!conversations[from]) conversations[from] = [];
  conversations[from].push({ role: 'user', content: text });

  // Trim to max history
  if (conversations[from].length > MAX_HISTORY) {
    conversations[from] = conversations[from].slice(-MAX_HISTORY);
  }

  try {
    const reply = await askClaude(conversations[from]);
    conversations[from].push({ role: 'assistant', content: reply });

    // WhatsApp messages have a 1600 char limit — split if needed
    if (reply.length <= 1550) {
      return res.send(twilioResponse(reply));
    }

    // Split on paragraph breaks, send first chunk and note there's more
    const chunks = reply.match(/.{1,1500}(\n|$)/gs) || [reply.slice(0, 1500)];
    return res.send(twilioResponse(chunks[0] + (chunks.length > 1 ? '\n\n_(reply continues — ask "more" to see the rest)_' : '')));

  } catch (err) {
    console.error('WhatsApp assistant error:', err.message);
    return res.send(twilioResponse(`Sorry, something went wrong: ${err.message}`));
  }
});

module.exports = router;
