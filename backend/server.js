const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');

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
