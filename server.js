require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cors    = require('cors');
const path    = require('path');
const routes  = require('./src/routes');
const db      = require('./src/db');

const app  = express();
const PORT = process.env.PORT || 3000;

const AUTH_USERNAME = process.env.AUTH_USERNAME || 'CFMARKETING';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'CloudFuze@2026';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'cf-icp-score-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// --- Auth routes (unprotected) ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    req.session.authenticated = true;
    req.session.user = username;
    return res.json({ ok: true, message: 'Login successful' });
  }
  res.status(401).json({ ok: false, message: 'Invalid username or password' });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true, message: 'Logged out' });
  });
});

// --- Serve login page (unprotected) ---
app.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- Auth middleware: protect everything below ---
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }
  res.redirect('/login');
}

app.use(requireAuth);

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
