// Training Hub — mounted inside the QC app.
// Tables live in the QC database; managers (trainers), staff (trainees) and properties are QC's own.
// API is namespaced under /api/hub/* and uses the QC manager login (requireAuth).
const { applySchema } = require('./schema');
const { seedSettings } = require('./seed');

const ROUTES = [
  'people', 'skills', 'competencies', 'systems', 'plans', 'foundations', 'shadow',
  'onboarding', 'resources', 'caddy', 'settings', 'overview', 'search',
];

function addTx(db) {
  if (db.tx) return;
  // Reentrant transaction helper the hub routes rely on: nested calls join the outer one.
  let depth = 0;
  db.tx = (fn) => {
    if (depth > 0) { depth++; try { return fn(); } finally { depth--; } }
    db.exec('BEGIN');
    depth = 1;
    try { const out = fn(); db.exec('COMMIT'); return out; }
    catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
    finally { depth = 0; }
  };
}

function mountHub(app, db, { uploadsDir, requireAuth }) {
  applySchema(db);
  addTx(db);
  seedSettings(db);
  for (const name of ROUTES) {
    app.use(`/api/hub/${name}`, requireAuth, require(`./routes/${name}`)(db, { uploadsDir }));
  }
  app.use('/api/hub/trainees', requireAuth, require('./routes/overview').traineesRouter(db));
  // JSON errors for hub routes (upload limits etc.) instead of Express's HTML error page.
  // eslint-disable-next-line no-unused-vars
  app.use('/api/hub', (err, req, res, next) => {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    console.error('[training-hub]', err);
    res.status(500).json({ error: 'Server error' });
  });
}

module.exports = { mountHub };
