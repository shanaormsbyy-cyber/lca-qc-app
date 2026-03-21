const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const db = require('./db');

// Auto-seed if this is a fresh database
const { cnt } = db.prepare('SELECT COUNT(*) as cnt FROM managers').get();
if (cnt === 0) {
  console.log('Fresh database detected — running seed...');
  require('./seed');
  console.log('Seed complete.');
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
const insertProp = db.prepare('INSERT INTO properties (name, address, airbnb_id) VALUES (?, ?, ?)');
const existingProps = new Set(db.prepare('SELECT name FROM properties').all().map(r => r.name));
let migratedCount = 0;
for (const name of koshProperties) {
  if (!existingProps.has(name)) {
    insertProp.run(name, '', '');
    migratedCount++;
  }
}
if (migratedCount > 0) console.log(`Migrated ${migratedCount} KOSH properties into database.`);

const app = express();
app.use(cors());
app.use(express.json());

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
  // Print local network IPs so other devices know where to connect
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
