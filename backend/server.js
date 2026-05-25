const express = require('express');

const cors = require('cors');
const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const db = require('./db');

// ── Migration: make qc_checks.staff_id nullable (was NOT NULL) ──────────────
// Must run FIRST, before any other prepared statements are left open,
// because node-sqlite3-wasm DDL fails if any read statement is still active.
{
  const s = db.prepare("PRAGMA table_info(qc_checks)");
  const cols = s.all([]);
  s.finalize();
  const col = cols.find(c => c.name === 'staff_id');
  if (col && col.notnull === 1) {
    console.log('Migrating qc_checks: making staff_id nullable…');
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec('DROP TABLE IF EXISTS qc_checks_new');
    db.exec(`CREATE TABLE qc_checks_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      staff_id INTEGER REFERENCES staff(id),
      checklist_id INTEGER NOT NULL REFERENCES qc_checklists(id),
      scheduled_by_id INTEGER NOT NULL REFERENCES managers(id),
      assigned_to_id INTEGER NOT NULL REFERENCES managers(id),
      date TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      total_score REAL DEFAULT 0,
      max_score REAL DEFAULT 0,
      score_pct REAL DEFAULT 0,
      signed_off_by TEXT,
      signed_off_at TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    db.exec('INSERT INTO qc_checks_new SELECT * FROM qc_checks');
    db.exec('DROP TABLE qc_checks');
    db.exec('ALTER TABLE qc_checks_new RENAME TO qc_checks');
    db.exec('PRAGMA foreign_keys=ON');
    console.log('Migration complete: staff_id is now nullable.');
  }
}

// Auto-migrate: add check_type column to qc_checks
{
  const s = db.prepare('PRAGMA table_info(qc_checks)');
  const cols = s.all([]);
  s.finalize();
  if (!cols.find(c => c.name === 'check_type')) {
    db.exec("ALTER TABLE qc_checks ADD COLUMN check_type TEXT DEFAULT 'staff'");
    console.log('Migration complete: added check_type column to qc_checks.');
  }
}

// Fix check_type for existing property health checks that were saved with default 'staff'
{
  const fixed = db.prepare(`
    UPDATE qc_checks
    SET check_type = 'property'
    WHERE (check_type IS NULL OR check_type != 'property')
      AND checklist_id IN (SELECT id FROM qc_checklists WHERE default_for = 'property')
  `).run();
  if (fixed.changes > 0) console.log(`Migration: fixed check_type=property for ${fixed.changes} existing property health check(s).`);
}

// Auto-migrate: add item_id column to qc_check_photos
{
  const s = db.prepare('PRAGMA table_info(qc_check_photos)');
  const cols = s.all([]);
  s.finalize();
  if (!cols.find(c => c.name === 'item_id')) {
    db.exec('ALTER TABLE qc_check_photos ADD COLUMN item_id INTEGER');
    console.log('Migration complete: added item_id column to qc_check_photos.');
  }
}

// Auto-migrate: add default_for column to qc_checklists
{
  const s = db.prepare('PRAGMA table_info(qc_checklists)');
  const cols = s.all([]);
  s.finalize();
  if (!cols.find(c => c.name === 'default_for')) {
    db.exec('ALTER TABLE qc_checklists ADD COLUMN default_for TEXT');
    console.log('Migration complete: added default_for column to qc_checklists.');
  }
}

// Migrate user-created training checklists into qc_checklists (flatten sections → items)
// Skips "New Hire Induction" (induction-only) and any already present in qc_checklists by name.
{
  const trainingCLs = db.prepare(
    "SELECT * FROM training_checklists WHERE name NOT LIKE '%Induction%'"
  ).all();
  const existingQC = new Set(
    db.prepare('SELECT name FROM qc_checklists').all().map(r => r.name)
  );
  for (const tcl of trainingCLs) {
    if (existingQC.has(tcl.name)) continue;
    const sections = db.prepare(
      'SELECT * FROM training_checklist_sections WHERE checklist_id=? ORDER BY order_idx'
    ).all(tcl.id);
    const allItems = [];
    for (const sec of sections) {
      const items = db.prepare(
        'SELECT * FROM training_checklist_items WHERE section_id=? ORDER BY order_idx'
      ).all(sec.id);
      for (const item of items) {
        allItems.push({ text: item.text, category: sec.name || '', score_type: 'pass_fail', weight: 1 });
      }
    }
    db.exec('BEGIN');
    try {
      const res = db.prepare(
        'INSERT INTO qc_checklists (name, description) VALUES (?, ?)'
      ).run(tcl.name, tcl.description || '');
      const qcId = res.lastInsertRowid;
      for (let i = 0; i < allItems.length; i++) {
        const it = allItems[i];
        db.prepare(
          'INSERT INTO qc_checklist_items (checklist_id, text, category, score_type, weight, order_idx) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(qcId, it.text, it.category, it.score_type, it.weight, i);
      }
      db.exec('COMMIT');
      console.log(`Migrated training checklist "${tcl.name}" into qc_checklists (${allItems.length} items).`);
    } catch (e) {
      db.exec('ROLLBACK');
      console.error(`Failed to migrate checklist "${tcl.name}":`, e.message);
    }
  }
}

// Auto-seed if this is a fresh database
{
  const s = db.prepare('SELECT COUNT(*) as cnt FROM managers');
  const { cnt } = s.get([]);
  s.finalize();
  if (cnt === 0) {
    console.log('Fresh database detected — running seed...');
    require('./seed');
    console.log('Seed complete.');
  }
}

// KOSH properties and LCA staff auto-migration removed —
// these were one-time imports that re-inserted deleted records on every deploy.
// Properties and staff are now managed entirely through the UI.

// Auto-migrate Jacqueline Kirker as a manager
{
  const sel = db.prepare('SELECT username FROM managers');
  const existingManagers = new Set(sel.all([]).map(r => r.username));
  sel.finalize();
  if (!existingManagers.has('jacqueline')) {
    const hash = bcrypt.hashSync('lca123', 10);
    const ins = db.prepare('INSERT INTO managers (username, password_hash, name) VALUES (?, ?, ?)');
    ins.run('jacqueline', hash, 'Jacqueline Kirker');
    ins.finalize();
    console.log('Added manager: Jacqueline Kirker (username: jacqueline, password: lca123)');
  }
}

const { addClient, removeClient, emit } = require('./emitter');

const app = express();
app.use(cors());
app.use(express.json());

// SSE live-sync endpoint — clients subscribe here
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  // Send initial heartbeat so the connection is established
  res.write(': connected\n\n');
  addClient(res);
  req.on('close', () => removeClient(res));
});

// After any mutating API call, broadcast a change event to all connected clients
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const orig = res.json.bind(res);
    res.json = (body) => {
      orig(body);
      emit('change');
    };
  }
  next();
});

const UPLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/app/data/uploads'
  : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

// Auto-migrate: warnings tables
{
  const s = db.prepare('PRAGMA table_info(warnings)');
  const cols = s.all();
  s.finalize();
  if (cols.length === 0) {
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE warnings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          staff_id INTEGER NOT NULL REFERENCES staff(id),
          level TEXT NOT NULL,
          reason TEXT NOT NULL,
          details TEXT NOT NULL DEFAULT '',
          corrective_actions TEXT NOT NULL DEFAULT '',
          issued_by TEXT NOT NULL,
          issued_at TEXT NOT NULL,
          acknowledged_at TEXT,
          acknowledged_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.exec(`
        CREATE TABLE warning_check_links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          warning_id INTEGER NOT NULL REFERENCES warnings(id) ON DELETE CASCADE,
          check_id INTEGER NOT NULL REFERENCES qc_checks(id) ON DELETE CASCADE
        )
      `);
      db.exec(`
        CREATE TABLE warning_edits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          warning_id INTEGER NOT NULL REFERENCES warnings(id) ON DELETE CASCADE,
          edited_by TEXT NOT NULL,
          edited_at TEXT NOT NULL,
          prev_level TEXT NOT NULL,
          prev_reason TEXT NOT NULL,
          prev_details TEXT NOT NULL,
          prev_corrective_actions TEXT NOT NULL
        )
      `);
      db.exec('COMMIT');
      console.log('Migration complete: created warnings, warning_check_links, warning_edits tables.');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

// Auto-migrate: voice_transcript column on qc_checks
{
  const s = db.prepare('PRAGMA table_info(qc_checks)');
  const cols = s.all();
  s.finalize();
  if (!cols.find(c => c.name === 'voice_transcript')) {
    db.exec('ALTER TABLE qc_checks ADD COLUMN voice_transcript TEXT');
    console.log('Migration complete: added voice_transcript column to qc_checks.');
  }
}

// Auto-migrate: slack_email column on staff
{
  const s = db.prepare('PRAGMA table_info(staff)');
  const cols = s.all();
  s.finalize();
  if (!cols.find(c => c.name === 'slack_email')) {
    db.exec('ALTER TABLE staff ADD COLUMN slack_email TEXT');
    console.log('Migration complete: added slack_email column to staff.');
  }
}

// Auto-migrate: reclean columns on qc_checks
{
  const s = db.prepare('PRAGMA table_info(qc_checks)');
  const cols = s.all();
  s.finalize();
  if (!cols.find(c => c.name === 'reclean_required')) {
    db.exec('ALTER TABLE qc_checks ADD COLUMN reclean_required INTEGER DEFAULT NULL');
    console.log('Migration complete: added reclean_required to qc_checks.');
  }
  if (!cols.find(c => c.name === 'reclean_minutes')) {
    db.exec('ALTER TABLE qc_checks ADD COLUMN reclean_minutes INTEGER DEFAULT NULL');
    console.log('Migration complete: added reclean_minutes to qc_checks.');
  }
}

// Auto-migrate: coaching_sessions table
{
  const s = db.prepare("PRAGMA table_info(coaching_sessions)");
  const cols = s.all();
  s.finalize();
  if (cols.length === 0) {
    db.exec(`
      CREATE TABLE coaching_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES staff(id),
        manager_id INTEGER NOT NULL REFERENCES managers(id),
        date TEXT NOT NULL,
        topic TEXT NOT NULL,
        problem_type TEXT NOT NULL CHECK(problem_type IN ('cant', 'didnt', 'wont')),
        how_coached TEXT NOT NULL,
        outcome TEXT NOT NULL,
        followup_date TEXT,
        sessions_required INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    console.log('Migration complete: created coaching_sessions table.');
  }
}

// Auto-migrate: complaints table
{
  const s = db.prepare("PRAGMA table_info(complaints)");
  const cols = s.all();
  s.finalize();
  if (cols.length === 0) {
    db.exec(`
      CREATE TABLE complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES staff(id),
        property_id INTEGER REFERENCES properties(id),
        source TEXT NOT NULL CHECK(source IN ('guest', 'property_manager', 'property_owner')),
        severity TEXT NOT NULL CHECK(severity IN ('minor', 'moderate', 'serious')),
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        resolution TEXT,
        resolved_at TEXT,
        issued_by TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    console.log('Migration complete: created complaints table.');
  }
}

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/staff',      require('./routes/staff'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/managers',   require('./routes/managers'));
app.use('/api/training',   require('./routes/training'));
app.use('/api/qc',         require('./routes/qc'));
app.use('/api/scheduling', require('./routes/scheduling'));
app.use('/api/kpis',       require('./routes/kpis'));
app.use('/api/heatpump',   require('./routes/heatpump'));
app.use('/api/staff-portal', require('./routes/staff-portal'));
app.use('/api/warnings', require('./routes/warnings'));
app.use('/api/coaching', require('./routes/coaching'));
app.use('/api/complaints', require('./routes/complaints'));

// Serve built frontend
const frontendBuild = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendBuild));
app.get('*', (req, res) => {
  const index = path.join(frontendBuild, 'index.html');
  res.sendFile(index, err => {
    if (err) res.status(404).send('Frontend not built. Run: cd frontend && npm run build');
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  console.log(`\nLCA QC API running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Network: http://${ip}:${PORT}  ← use this on other devices`));
  console.log('');
});
