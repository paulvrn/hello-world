const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { get, run } = require('./db');
const { hashPassword, loadUser, token } = require('./auth');
const labels = require('./labels');
const helpers = require('./helpers');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || token(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 },
}));
app.use(loadUser);
app.use((req, res, next) => {
  Object.assign(res.locals, labels, helpers);
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  res.locals.path = req.path;
  if (req.user?.role === 'admin') {
    res.locals.unseenCount = get('SELECT COUNT(*) AS n FROM projects WHERE admin_seen = 0').n;
  }
  next();
});

app.use(require('./routes/public'));
app.use('/mon-espace', require('./routes/client'));
app.use(require('./routes/supplier'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('message', { title: 'Page introuvable', message: "Cette page n'existe pas ou le lien a expiré." }));
app.use((err, req, res, next) => {
  console.error(err);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (50 Mo maximum).' : 'Une erreur est survenue.';
  res.status(err.status || 500).render('message', { title: 'Erreur', message });
});

// Compte administrateur initial.
function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  if (get("SELECT id FROM users WHERE role = 'admin'")) return;
  const password = process.env.ADMIN_PASSWORD || 'admin';
  run("INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, 'admin', 'Administrateur')", email, hashPassword(password));
  console.log(`Compte admin créé : ${email}${process.env.ADMIN_PASSWORD ? '' : ' / mot de passe « admin » (à changer !)'}`);
}

if (require.main === module) {
  ensureAdmin();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Plateforme démarrée sur ${helpers.BASE_URL}`));
}

module.exports = { app, ensureAdmin };
