require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const routes  = require('./src/routes');
const db      = require('./src/db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', routes);

// Serve dashboard for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  ICP Score app running at http://localhost:${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}`);
  console.log(`  API:       http://localhost:${PORT}/api`);

  // Initialize DB and migrate from JSON if needed
  try {
    db.getDb(); // triggers schema creation
    db.migrateFromJsonStore();
    const count = db.getContactCount();
    const lastSync = db.getLastSync('contacts');
    console.log(`  Database:  ${count} contacts cached${lastSync ? ', last sync ' + lastSync.ended_at : ''}`);
  } catch (err) {
    console.error('  DB init error:', err.message);
  }
  console.log('');
});
