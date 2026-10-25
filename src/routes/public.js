const express = require('express');
const { get, all, run, transaction, addEvent } = require('../db');
const { hashPassword, verifyPassword, token } = require('../auth');
const { upload, saveProjectFiles } = require('../files');
const { REGIONS, MATURITIES, CONTEXTS, QUALITY_STANDARDS, TESTS, CERTIFICATIONS, COMPONENT_SUPPLY, listOf } = require('../labels');
const { flash } = require('../helpers');
const { notify } = require('../notify');

const router = express.Router();

router.get('/', (req, res) => {
  const prefill = req.user?.role === 'client'
    ? { contact_email: req.user.email, contact_name: req.user.name, contact_company: req.user.company }
    : {};
  res.render('form', { values: prefill, errors: [] });
});

const projectUpload = upload.fields([
  { name: 'plan', maxCount: 10 },
  { name: 'bom', maxCount: 10 },
  { name: 'other', maxCount: 10 },
]);

function validateProject(b, files) {
  const errors = [];
  for (const [field, label] of [['title', 'la désignation du projet'], ['contact_company', 'la société'],
    ['contact_name', 'le nom du contact'], ['contact_email', "l'e-mail"]]) {
    if (!b[field]?.trim()) errors.push(`Merci d'indiquer ${label}.`);
  }
  if (b.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.contact_email)) errors.push("L'adresse e-mail n'est pas valide.");
  if (!REGIONS[b.region]) errors.push('Merci de choisir un lieu de fabrication.');
  if (!(Number(b.quantity) >= 1)) errors.push('La quantité doit être un nombre supérieur à 0.');
  if (!MATURITIES[b.maturity]) errors.push('Merci de préciser la maturité du produit.');
  if (!CONTEXTS[b.context]) errors.push('Merci de préciser le cadre de la demande.');
  if (!files.plan?.length) errors.push('Merci de joindre au moins un plan.');
  if (!files.bom?.length) errors.push('Merci de joindre la nomenclature.');
  if (b.quality_standard && !QUALITY_STANDARDS[b.quality_standard]) errors.push('Norme de fabrication inconnue.');
  if (!COMPONENT_SUPPLY[b.components_supply]) errors.push('Merci de préciser qui approvisionne les composants.');
  if (b.confidentiality_consent !== '1') errors.push('Merci d\'autoriser la consultation de partenaires de fabrication sous accord de confidentialité.');
  return errors;
}

function nextRef() {
  const year = new Date().getFullYear();
  const { n } = get('SELECT COUNT(*) AS n FROM projects WHERE ref LIKE ?', `CBL-${year}-%`);
  return `CBL-${year}-${String(n + 1).padStart(4, '0')}`;
}

router.post('/projets', projectUpload, async (req, res) => {
  const b = req.body;
  const files = req.files || {};
  const errors = validateProject(b, files);
  if (errors.length) return res.status(400).render('form', { values: b, errors });

  const project = transaction(() => {
    const ref = nextRef();
    const text = (k) => b[k]?.trim() || null;
    const list = (k, dict) => listOf([].concat(b[k] || []).join(','), dict).join(',') || null;
    const { lastInsertRowid } = run(`INSERT INTO projects
      (ref, title, client_user_id, contact_company, contact_name, contact_email, contact_phone, region, quantity,
       maturity, context, desired_deadline, target_price, notes, quality_standard, tests_required, certifications_required,
       lot_cadence, components_supply, delivery_place, regulatory_constraints, confidentiality_consent_at, tracking_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
      ref, b.title.trim(), req.user?.role === 'client' ? req.user.id : null, b.contact_company.trim(), b.contact_name.trim(),
      b.contact_email.trim(), text('contact_phone'), b.region, Math.round(Number(b.quantity)), b.maturity, b.context,
      b.desired_deadline || null, text('target_price'), text('notes'), b.quality_standard || null,
      list('tests_required', TESTS), list('certifications_required', CERTIFICATIONS), text('lot_cadence'),
      b.components_supply, text('delivery_place'), text('regulatory_constraints'), token());
    return get('SELECT * FROM projects WHERE id = ?', lastInsertRowid);
  });
  for (const kind of ['plan', 'bom', 'other']) await saveProjectFiles(project.id, files[kind], kind);
  addEvent(project.id, 'Demande envoyée');
  notify.projectSubmitted(project);

  res.redirect(`/suivi/${project.tracking_token}?nouveau=1`);
});

// ---- Suivi d'un projet par lien sécurisé (client avec ou sans compte) ----

function loadTracked(req, res, next) {
  const project = get('SELECT * FROM projects WHERE tracking_token = ?', req.params.token);
  if (!project) return res.status(404).render('message', { title: 'Projet introuvable', message: 'Ce lien de suivi est invalide.' });
  req.project = project;
  next();
}

// Mémorise les liens de suivi ouverts : détenir le lien prouve l'accès au projet,
// on peut donc le rattacher au compte créé dans la foulée sans attendre la vérification de l'e-mail.
function rememberTracked(req, p) {
  req.session.tracked = [...new Set([...(req.session.tracked || []), p.tracking_token])].slice(-20);
}

router.get('/suivi/:token', loadTracked, (req, res) => {
  const p = req.project;
  rememberTracked(req, p);
  res.render('tracking', {
    project: p,
    files: all('SELECT * FROM project_files WHERE project_id = ? ORDER BY id', p.id),
    events: all('SELECT * FROM project_events WHERE project_id = ? AND visible_to_client = 1 ORDER BY id DESC', p.id),
    isNew: req.query.nouveau === '1',
    hasAccount: Boolean(get('SELECT id FROM users WHERE email = ?', p.contact_email)),
  });
});

router.post('/suivi/:token/precisions', loadTracked, upload.array('files', 10), async (req, res) => {
  const p = req.project;
  if (p.step !== 2 || !req.body.answer?.trim()) return res.redirect(`/suivi/${p.tracking_token}`);
  run("UPDATE projects SET clarification_answer = ?, updated_at = datetime('now') WHERE id = ?", req.body.answer.trim(), p.id);
  await saveProjectFiles(p.id, req.files, 'other');
  addEvent(p.id, 'Précisions envoyées');
  notify.clarificationAnswered(get('SELECT * FROM projects WHERE id = ?', p.id));
  flash(req, 'success', 'Merci, vos précisions ont bien été transmises.');
  res.redirect(`/suivi/${p.tracking_token}`);
});

router.post('/suivi/:token/commande', loadTracked, upload.array('files', 5), async (req, res) => {
  const p = req.project;
  if (p.step !== 3) return res.redirect(`/suivi/${p.tracking_token}`);
  run("UPDATE projects SET step = 4, order_reference = ?, updated_at = datetime('now') WHERE id = ?",
    req.body.order_reference?.trim() || null, p.id);
  await saveProjectFiles(p.id, req.files, 'other');
  addEvent(p.id, 'Commande envoyée');
  notify.orderPlaced(get('SELECT * FROM projects WHERE id = ?', p.id));
  flash(req, 'success', 'Votre commande a bien été transmise.');
  res.redirect(`/suivi/${p.tracking_token}`);
});

// ---- Comptes ----

router.get('/inscription', (req, res) => {
  res.render('register', { values: { email: req.query.email || '' }, errors: [] });
});

router.post('/inscription', (req, res) => {
  const b = req.body;
  const errors = [];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '')) errors.push('Adresse e-mail invalide.');
  if ((b.password || '').length < 8) errors.push('Le mot de passe doit contenir au moins 8 caractères.');
  if (b.email && get('SELECT id FROM users WHERE email = ?', b.email.trim())) errors.push('Un compte existe déjà avec cet e-mail.');
  if (errors.length) return res.status(400).render('register', { values: b, errors });

  const verifyToken = token();
  const { lastInsertRowid } = run(`INSERT INTO users (email, password_hash, role, name, company, verify_token)
    VALUES (?, ?, 'client', ?, ?, ?)`, b.email.trim(), hashPassword(b.password), b.name?.trim() || null, b.company?.trim() || null, verifyToken);
  const userId = Number(lastInsertRowid);
  for (const t of req.session.tracked || []) {
    run('UPDATE projects SET client_user_id = ? WHERE tracking_token = ? AND client_user_id IS NULL AND contact_email = ?', userId, t, b.email.trim());
  }
  notify.verification(b.email.trim(), verifyToken);
  req.session.userId = userId;
  flash(req, 'success', 'Votre compte est créé. Un e-mail de confirmation vous a été envoyé : cliquez sur le lien pour y rattacher toutes vos demandes.');
  res.redirect('/mon-espace');
});

// Confirmation de l'adresse : rattache toutes les demandes (client) ou la fiche sous-traitant existante.
router.get('/verifier/:token', (req, res) => {
  const user = get('SELECT * FROM users WHERE verify_token = ?', req.params.token);
  if (!user) return res.status(404).render('message', { title: 'Lien invalide', message: 'Ce lien de confirmation est invalide ou a déjà été utilisé.' });
  transaction(() => {
    run('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?', user.id);
    if (user.role === 'client') {
      run('UPDATE projects SET client_user_id = ? WHERE contact_email = ? AND client_user_id IS NULL', user.id, user.email);
    }
    if (user.role === 'supplier') linkImportedSupplier(user);
  });
  req.session.userId = user.id;
  flash(req, 'success', 'Adresse e-mail confirmée, merci !');
  res.redirect(user.role === 'supplier' ? '/fournisseur' : '/mon-espace');
});

// Un sous-traitant déjà présent dans la base (import / saisie admin) récupère sa fiche
// une fois son e-mail confirmé ; la fiche créée à l'inscription est alors fusionnée.
function linkImportedSupplier(user) {
  const existing = get('SELECT * FROM suppliers WHERE email = ? AND user_id IS NULL ORDER BY id LIMIT 1', user.email);
  if (!existing) return;
  const own = get('SELECT * FROM suppliers WHERE user_id = ?', user.id);
  if (own) {
    run('UPDATE consultations SET supplier_id = ? WHERE supplier_id = ?', existing.id, own.id);
    run('DELETE FROM suppliers WHERE id = ?', own.id);
    const fields = ['company', 'contact_name', 'phone', 'country', 'region', 'capabilities', 'min_hours', 'max_hours',
      'min_complexity', 'max_complexity', 'min_quantity', 'max_quantity', 'maturities', 'processes', 'certifications',
      'sources_components', 'nda_accepted_at'];
    run(`UPDATE suppliers SET user_id = ?, ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
      user.id, ...fields.map((f) => own[f]), existing.id);
  } else {
    run('UPDATE suppliers SET user_id = ? WHERE id = ?', user.id, existing.id);
  }
}

router.get('/connexion', (req, res) => res.render('login', { error: null, email: '' }));

router.post('/connexion', (req, res) => {
  const user = get('SELECT * FROM users WHERE email = ?', (req.body.email || '').trim());
  if (!user || !verifyPassword(req.body.password || '', user.password_hash)) {
    return res.status(401).render('login', { error: 'E-mail ou mot de passe incorrect.', email: req.body.email });
  }
  const returnTo = req.session.returnTo;
  req.session.regenerate(() => {
    req.session.userId = user.id;
    const home = { admin: '/admin', supplier: '/fournisseur', client: '/mon-espace' }[user.role];
    res.redirect(returnTo && returnTo.startsWith('/') ? returnTo : home);
  });
});

router.post('/deconnexion', (req, res) => req.session.destroy(() => res.redirect('/')));

module.exports = router;
