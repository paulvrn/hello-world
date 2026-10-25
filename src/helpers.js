const { STEPS } = require('./labels');

const BASE_URL = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

/**
 * États de la frise pour un projet : done | current | action | todo | skipped.
 * project.step = dernière étape atteinte.
 */
function timeline(project) {
  return STEPS.map((s) => {
    let state;
    if (s.n < project.step) state = 'done';
    else if (s.n > project.step) state = 'todo';
    else if (s.n === 2) state = project.clarification_answer ? 'done' : 'action';
    else if (s.n === 3) state = 'action'; // devis à valider par le client
    else if (s.n === 5) state = 'current';
    else state = 'done';
    if (s.n === 2 && project.step > 2 && !project.clarification_request) state = 'skipped';
    return { ...s, state };
  });
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(value) {
  if (!value) return '';
  const d = new Date(value.replace(' ', 'T') + 'Z');
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
}

function fmtSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

// Champ numérique optionnel issu d'un formulaire.
function num(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

module.exports = { BASE_URL, timeline, fmtDate, fmtDateTime, fmtSize, num, flash };
