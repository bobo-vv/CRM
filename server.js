
// server.js — Fresh CRM (Webbase) for Render.com
// CommonJS to avoid ESM pitfalls; simple JSON DB; static frontend in /public

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { nanoid } = require('nanoid');

const app = express();
const PORT = process.env.PORT || 5050;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'crm.json');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// -------- Simple JSON DB --------
const defaultData = {
  users: [], companies: [], contacts: [], deals: [], activities: [], attachments: [], audit: []
};

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const json = JSON.parse(raw);
    return { ...defaultData, ...json };
  } catch (e) {
    console.error('DB load error:', e);
    return JSON.parse(JSON.stringify(defaultData));
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// Seed admin
async function seed() {
  if (!db.users.length) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    db.users.push({
      id: nanoid(10), email: ADMIN_EMAIL, name: 'Admin', role: 'admin',
      team: 'HQ', zone: 'BKK', password_hash: hash, created_at: new Date().toISOString()
    });
    saveDB(db);
    console.log(`✔ Seeded admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  }
}
seed();

// -------- Express setup --------
app.use(cors({ origin: true }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const today = new Date().toISOString().slice(0, 10);
    const dir = path.join(UPLOAD_DIR, today);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = String(file.originalname).replace(/[^a-zA-Z0-9_.\-ก-๙\s]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// -------- Helpers --------
const STAGES = ['new','qualify','proposal','negotiation','won','lost'];

function signToken(user) {
  return jwt.sign(
    { uid: user.id, role: user.role, team: user.team, zone: user.zone, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ ok: false, error: 'no token' });
  try {
    req.user = jwt.verify(t, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'invalid token' });
  }
}
function admin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ ok: false, error: 'forbidden' });
  next();
}
function canSee(user, row) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (row.owner_id === user.uid) return true;
  if (row.team && user.team && row.team === user.team) return true;
  return false;
}
function listFilter(arr, user, q) {
  let out = arr.filter(r => canSee(user, r));
  if (!q) return out;
  const qq = (q.q || '').toLowerCase();
  if (qq) out = out.filter(r => JSON.stringify(r).toLowerCase().includes(qq));
  if (q.stage) out = out.filter(r => r.stage === q.stage);
  if (q.owner) out = out.filter(r => r.owner_id === q.owner);
  if (q.team) out = out.filter(r => (r.team || '') === q.team);
  if (q.month) out = out.filter(r => (r.created_at || '').slice(0,7) === q.month);
  return out;
}
function audit(user, action, entity, entity_id, detail) {
  db.audit.unshift({ id: nanoid(10), at: new Date().toISOString(), by: user?.uid || null, action, entity, entity_id, detail });
  saveDB(db);
}
function toCSV(rows, cols) {
  const head = cols.join(',');
  const body = rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(',')).join('\n');
  return head + '\n' + body;
}

// -------- Health --------
app.get('/health', (_, res) => res.json({ ok: true }));

// -------- Auth --------
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(400).json({ ok: false, error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ ok: false, error: 'invalid credentials' });
  return res.json({ ok: true, token: signToken(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

app.get('/api/me', auth, (req, res) => {
  const u = db.users.find(x => x.id === req.user.uid);
  return res.json({ ok: true, user: u ? { id: u.id, email: u.email, name: u.name, role: u.role, team: u.team, zone: u.zone } : null });
});

app.post('/api/me/password', auth, async (req, res) => {
  const { current, next } = req.body || {};
  const u = db.users.find(x => x.id === req.user.uid);
  if (!u) return res.status(404).json({ ok: false, error: 'user not found' });
  const ok = await bcrypt.compare(current || '', u.password_hash);
  if (!ok) return res.status(400).json({ ok: false, error: 'current password incorrect' });
  u.password_hash = await bcrypt.hash(String(next || ''), 10);
  saveDB(db); audit(req.user, 'password_change', 'user', u.id, {});
  return res.json({ ok: true });
});

// -------- Users (admin) --------
app.get('/api/users', auth, admin, (req, res) => {
  const rows = db.users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, team: u.team, zone: u.zone, created_at: u.created_at }));
  res.json({ ok: true, data: rows });
});

app.post('/api/users', auth, admin, async (req, res) => {
  const { email, name, role='staff', team='HQ', zone='BKK', password='123456' } = req.body || {};
  if (db.users.some(u => u.email === email)) return res.status(400).json({ ok: false, error: 'email exists' });
  const row = {
    id: nanoid(10), email, name, role, team, zone,
    password_hash: await bcrypt.hash(String(password), 10),
    created_at: new Date().toISOString()
  };
  db.users.push(row); saveDB(db); audit(req.user, 'create', 'user', row.id, { email, role });
  res.json({ ok: true, data: { id: row.id, email, name, role, team, zone } });
});

// -------- Companies --------
app.get('/api/companies', auth, (req, res) => {
  const data = listFilter(db.companies, req.user, req.query);
  res.json({ ok: true, data });
});
app.post('/api/companies', auth, (req, res) => {
  const c = { id: nanoid(10), created_at: new Date().toISOString(), owner_id: req.user.uid, team: req.user.team, zone: req.user.zone, ...req.body };
  db.companies.unshift(c); saveDB(db); audit(req.user, 'create', 'company', c.id, { name: c.name });
  res.json({ ok: true, data: c });
});
app.put('/api/companies/:id', auth, (req, res) => {
  const i = db.companies.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'not found' });
  db.companies[i] = { ...db.companies[i], ...req.body, updated_at: new Date().toISOString() };
  saveDB(db); audit(req.user, 'update', 'company', db.companies[i].id, {});
  res.json({ ok: true, data: db.companies[i] });
});

// -------- Contacts --------
app.get('/api/contacts', auth, (req, res) => {
  const data = listFilter(db.contacts, req.user, req.query);
  res.json({ ok: true, data });
});
app.post('/api/contacts', auth, (req, res) => {
  const c = { id: nanoid(10), created_at: new Date().toISOString(), owner_id: req.user.uid, team: req.user.team, zone: req.user.zone, ...req.body };
  db.contacts.unshift(c); saveDB(db); audit(req.user, 'create', 'contact', c.id, { name: c.full_name });
  res.json({ ok: true, data: c });
});
app.put('/api/contacts/:id', auth, (req, res) => {
  const i = db.contacts.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'not found' });
  db.contacts[i] = { ...db.contacts[i], ...req.body, updated_at: new Date().toISOString() };
  saveDB(db); audit(req.user, 'update', 'contact', db.contacts[i].id, {});
  res.json({ ok: true, data: db.contacts[i] });
});

// -------- Deals --------
app.get('/api/deals', auth, (req, res) => {
  const data = listFilter(db.deals, req.user, req.query);
  res.json({ ok: true, data });
});
app.post('/api/deals', auth, (req, res) => {
  const d = {
    id: nanoid(10), title: '', stage: 'new', value: 0, company_id: null,
    owner_id: req.user.uid, team: req.user.team, zone: req.user.zone,
    ...req.body, created_at: new Date().toISOString()
  };
  if (!STAGES.includes(d.stage)) d.stage = 'new';
  db.deals.unshift(d); saveDB(db); audit(req.user, 'create', 'deal', d.id, { title: d.title, stage: d.stage });
  res.json({ ok: true, data: d });
});
app.put('/api/deals/:id', auth, (req, res) => {
  const i = db.deals.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'not found' });
  const up = { ...db.deals[i], ...req.body, updated_at: new Date().toISOString() };
  if (!STAGES.includes(up.stage)) up.stage = db.deals[i].stage;
  db.deals[i] = up; saveDB(db); audit(req.user, 'update', 'deal', up.id, {});
  res.json({ ok: true, data: up });
});
app.post('/api/deals/:id/move', auth, (req, res) => {
  const i = db.deals.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'not found' });
  const { stage } = req.body || {};
  if (!STAGES.includes(stage)) return res.status(400).json({ ok: false, error: 'bad stage' });
  db.deals[i].stage = stage; db.deals[i].updated_at = new Date().toISOString();
  saveDB(db); audit(req.user, 'move', 'deal', db.deals[i].id, { stage });
  res.json({ ok: true, data: db.deals[i] });
});

// -------- Activities (tasks) --------
app.get('/api/activities', auth, (req, res) => {
  let list = listFilter(db.activities, req.user, req.query);
  const { deal_id } = req.query;
  if (deal_id) list = list.filter(a => a.deal_id === deal_id);
  res.json({ ok: true, data: list });
});
app.post('/api/activities', auth, (req, res) => {
  const a = {
    id: nanoid(10), type: 'task', due_at: null, done: false, ...req.body,
    owner_id: req.user.uid, team: req.user.team, zone: req.user.zone,
    created_at: new Date().toISOString()
  };
  db.activities.unshift(a); saveDB(db); audit(req.user, 'create', 'activity', a.id, { type: a.type });
  res.json({ ok: true, data: a });
});
app.put('/api/activities/:id', auth, (req, res) => {
  const i = db.activities.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'not found' });
  db.activities[i] = { ...db.activities[i], ...req.body, updated_at: new Date().toISOString() };
  saveDB(db); audit(req.user, 'update', 'activity', db.activities[i].id, {});
  res.json({ ok: true, data: db.activities[i] });
});

// -------- Attachments --------
app.post('/api/files', auth, upload.array('files', 10), (req, res) => {
  const { entity, entity_id } = req.body || {};
  const files = (req.files || []).map(f => {
    const rel = path.relative(DATA_DIR, f.path).replace(/\\/g, '/');
    const url = '/uploads/' + rel.split('/').slice(1).join('/');
    const a = {
      id: nanoid(10), entity, entity_id, filename: f.originalname, url,
      uploaded_by: req.user.uid, team: req.user.team, zone: req.user.zone,
      created_at: new Date().toISOString()
    };
    db.attachments.push(a);
    return a;
  });
  saveDB(db); audit(req.user, 'upload', 'file', entity_id, { count: files.length });
  res.json({ ok: true, files });
});

// -------- KPI & CSV --------
app.get('/api/kpi', auth, (req, res) => {
  const deals = listFilter(db.deals, req.user, req.query);
  const total = deals.length;
  const won = deals.filter(d => d.stage === 'won');
  const wonCount = won.length;
  const estSum = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const wonSum = won.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const byStage = STAGES.map(s => ({ stage: s, count: deals.filter(d => d.stage === s).length }));
  res.json({ ok: true, data: { total, wonCount, estSum, wonSum, byStage } });
});

app.get('/api/export/:entity.csv', auth, (req, res) => {
  const ent = req.params.entity;
  const map = {
    deals: ['id','title','stage','value','company_id','owner_id','team','zone','created_at'],
    companies: ['id','name','phone','address','owner_id','team','zone','created_at'],
    contacts: ['id','full_name','email','phone','company_id','owner_id','team','zone','created_at'],
    activities: ['id','type','note','due_at','done','deal_id','owner_id','team','zone','created_at'],
    audit: ['id','at','by','action','entity','entity_id']
  };
  if (!map[ent]) return res.status(404).send('unknown entity');
  const rows = listFilter(db[ent], req.user, req.query);
  const csv = toCSV(rows, map[ent]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${ent}.csv`);
  res.send(csv);
});

// Fallback to index.html (SPA)
app.get('*', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log('CRM running on http://localhost:' + PORT));
