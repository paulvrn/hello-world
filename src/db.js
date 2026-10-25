const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('client', 'supplier', 'admin')),
  name TEXT,
  company TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  client_user_id INTEGER REFERENCES users(id),
  contact_company TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL COLLATE NOCASE,
  contact_phone TEXT,
  region TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  maturity TEXT NOT NULL,
  context TEXT NOT NULL,
  desired_deadline TEXT,
  target_price TEXT,
  notes TEXT,
  quality_standard TEXT,
  tests_required TEXT,
  certifications_required TEXT,
  lot_cadence TEXT,
  components_supply TEXT,
  delivery_place TEXT,
  regulatory_constraints TEXT,
  confidentiality_consent_at TEXT,
  -- Champs renseignés par l'administrateur à la lecture du plan
  est_hours REAL,
  complexity INTEGER CHECK (complexity BETWEEN 1 AND 5),
  supplier_brief TEXT,
  -- Suivi
  step INTEGER NOT NULL DEFAULT 1,
  clarification_request TEXT,
  clarification_answer TEXT,
  quote_price TEXT,
  quote_lead_time TEXT,
  quote_comment TEXT,
  order_reference TEXT,
  tracking_info TEXT,
  tracking_token TEXT NOT NULL UNIQUE,
  admin_seen INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_files (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  -- Version anonymisée (métadonnées nettoyées automatiquement, ou version caviardée déposée par l'admin)
  anon_stored_name TEXT,
  anon_manual INTEGER NOT NULL DEFAULT 0,
  share_with_suppliers INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_events (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  visible_to_client INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  company TEXT NOT NULL,
  contact_name TEXT,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  country TEXT,
  region TEXT NOT NULL DEFAULT 'france',
  capabilities TEXT,
  -- Conditions auxquelles le sous-traitant accepte d'être sollicité (NULL = pas de limite)
  min_hours REAL,
  max_hours REAL,
  min_complexity INTEGER,
  max_complexity INTEGER,
  min_quantity INTEGER,
  max_quantity INTEGER,
  maturities TEXT NOT NULL DEFAULT 'proto,first_series,mature',
  processes TEXT,
  certifications TEXT,
  sources_components INTEGER NOT NULL DEFAULT 0,
  -- Engagement de confidentialité et de non-contournement accepté (inscription ou première consultation)
  nda_accepted_at TEXT,
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'import', 'self')),
  active INTEGER NOT NULL DEFAULT 1,
  admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'sent',
  price TEXT,
  lead_time TEXT,
  comment TEXT,
  -- Nombre de fabricants consultés annoncé au sous-traitant (« consultation restreinte à N »)
  panel_size INTEGER,
  feedback TEXT,
  feedback_at TEXT,
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT,
  UNIQUE (project_id, supplier_id)
);

-- Questions des sous-traitants : l'admin répond (au besoin après avoir interrogé le client),
-- et la réponse est partagée à tous les sous-traitants consultés sur le projet.
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  consultation_id INTEGER REFERENCES consultations(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT
);

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

const get = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function addEvent(projectId, message, visibleToClient = true) {
  run('INSERT INTO project_events (project_id, message, visible_to_client) VALUES (?, ?, ?)',
    projectId, message, visibleToClient ? 1 : 0);
}

module.exports = { db, get, all, run, transaction, addEvent, DATA_DIR, UPLOAD_DIR };
