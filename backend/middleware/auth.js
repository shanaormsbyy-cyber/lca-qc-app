const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'lca-secret-2026';

function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace('Bearer ', '');
  try {
    req.manager = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireStaffAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.role !== 'staff') return res.status(403).json({ error: 'Staff access only' });
    req.staffUser = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth, requireStaffAuth, SECRET };
