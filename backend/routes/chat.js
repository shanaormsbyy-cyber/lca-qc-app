const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { askClaude } = require('../services/assistant');

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  try {
    const reply = await askClaude(messages.map(m => ({ role: m.role, content: m.content })));
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
