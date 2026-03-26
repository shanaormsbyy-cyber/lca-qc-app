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

// Auto-migrate KOSH properties (insert any missing ones)
const koshProperties = [
  '12 Portal Crescent','11 Steele Road','11/182 London Street','1/19 Taylor Terrace',
  '7/35 Selwyn Street, Tauranga','1/10 Palmerston Street','5/240 Old Farm Road','10 Cook Street',
  '1/15 Beverley Crescent','6/240 Old Farm Road','74 Awatere Avenue','2/15 Beverley Crescent',
  '1/3 Glen Lynne Avenue','21 Mistry Place','3/3 Glen Lynne Avenue','16D Ridout Street',
  '45B Vercoe Road','45A Vercoe Road','11 Raddington Way','11A Raddington Way',
  '1/120 Beerescourt Road','2/2 Clematis Avenue','22/182 London Street','303/220 Tristram Street',
  '6A Shirley Place','6 Shirley Place','2/20 Hunter Street','1/22 Willoughby Street',
  '5/22 Willoughby Street','6/22 Willoughby Street','3/19 Beale Street','1/29 Palmerston Street',
  '16B Ridout Street','77A Awatere Avenue','163 River Road North','163 River Road South',
  '7/182 London Street',
];
{
  const insertProp = db.prepare('INSERT INTO properties (name, address, airbnb_id) VALUES (?, ?, ?)');
  const sel = db.prepare('SELECT name FROM properties');
  const existingProps = new Set(sel.all([]).map(r => r.name));
  sel.finalize();
  let migratedCount = 0;
  for (const name of koshProperties) {
    if (!existingProps.has(name)) {
      insertProp.run(name, '', '');
      migratedCount++;
    }
  }
  insertProp.finalize();
  if (migratedCount > 0) console.log(`Migrated ${migratedCount} KOSH properties into database.`);
}

// Auto-migrate staff members (insert any missing ones)
const lcaStaff = [
  'Arabella Tuck','Aroha Wise','Cassandra Hiwarau','Elijah Lasi','Gabby Elliott',
  'Hine Peautolu','James Jenkins','Jesse Palmer','Maria Florez',
  'Micayla Hughes','Milly Charlton','Paula Stacey','Tarlya Carey','Tarmz Brown',
  'Tea Manuel','Tegan Watson-King','Tirihana Tahatika','Vienna Pahi','Wiki King',
];
{
  const insertStaff = db.prepare('INSERT INTO staff (name, role, start_date) VALUES (?, ?, ?)');
  const sel = db.prepare('SELECT name FROM staff');
  const existingStaff = new Set(sel.all([]).map(r => r.name));
  sel.finalize();
  let migratedStaff = 0;
  for (const name of lcaStaff) {
    if (!existingStaff.has(name)) {
      insertStaff.run(name, 'Cleaner', '');
      migratedStaff++;
    }
  }
  insertStaff.finalize();
  if (migratedStaff > 0) console.log(`Migrated ${migratedStaff} staff members into database.`);
}

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

const app = express();
app.use(cors());
app.use(express.json());

const UPLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/app/data/uploads'
  : path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

app.use('/api/auth',       require('./routes/auth'));
app.use('/api/staff',      require('./routes/staff'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/managers',   require('./routes/managers'));
app.use('/api/training',   require('./routes/training'));
app.use('/api/qc',         require('./routes/qc'));
app.use('/api/scheduling', require('./routes/scheduling'));
app.use('/api/kpis',       require('./routes/kpis'));

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
