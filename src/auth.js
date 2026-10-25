const crypto = require('node:crypto');
const { get } = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function token(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Charge l'utilisateur de la session dans req.user / res.locals.user.
function loadUser(req, res, next) {
  req.user = req.session.userId ? get('SELECT * FROM users WHERE id = ?', req.session.userId) : null;
  res.locals.user = req.user;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user && req.user.role === role) return next();
    req.session.returnTo = req.originalUrl;
    res.redirect('/connexion');
  };
}

module.exports = { hashPassword, verifyPassword, token, loadUser, requireRole };
