const path = require('node:path');
const express = require('express');
const { get, all, run, addEvent, UPLOAD_DIR } = require('../db');
const { hashPassword, token, requireRole } = require('../auth');
const { neutralName } = require('../files');
const { SUPPLIER_REGIONS, MATURITIES, PROCESSES, CERTIFICATIONS, listOf } = require('../labels');
const { flash, num } = require('../helpers');
const { notify } = require('../notify');
const { signedFileQuery, verifyFileLink, consultationExpired, CONSULTATION_TTL_DAYS } = require('../links');

const router = express.Router();

// Champs « conditions de sollicitation » communs à l'inscription, au profil et à la fiche admin.
function criteriaFromBody(b) {
  const maturities = [].concat(b.maturities || []).filter((m) => MATURITIES[m]);
  const clampComplexity = (v) => (v == null ? null : Math.min(5, Math.max(1, Math.round(v))));
  return {
    company: b.company?.trim(),
    contact_name: b.contact_name?.trim() || null,
    phone: b.phone?.trim() || null,
    country: b.country?.trim() || null,
    region: SUPPLIER_REGIONS[b.region] ? b.region : 'other',
    capabilities: b.capabilities?.trim() || null,
    min_hours: num(b.min_hours),
    max_hours: num(b.max_hours),
    min_complexity: clampComplexity(num(b.min_complexity)),
    max_complexity: clampComplexity(num(b.max_complexity)),
    min_quantity: num(b.min_quantity),
    max_quantity: num(b.max_quantity),
    maturities: maturities.join(','),
    processes: listOf([].concat(b.processes || []).join(','), PROCESSES).join(',') || null,
    certifications: listOf([].concat(b.certifications || []).join(','), CERTIFICATIONS).join(',') || null,
    sources_components: b.sources_components === '1' ? 1 : 0,
  };
}

router.get('/sous-traitants/inscription', (req, res) => {
  res.render('supplier-register', { values: { maturities: Object.keys(MATURITIES).join(','), region: 'france' }, errors: [] });
});

router.post('/sous-traitants/inscription', (req, res) => {
  const b = req.body;
  const values = { ...b, ...criteriaFromBody(b) };
  const errors = [];
  if (!values.company) errors.push('Merci d\'indiquer le nom de votre société.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '')) errors.push('Adresse e-mail invalide.');
  if ((b.password || '').length < 8) errors.push('Le mot de passe doit contenir au moins 8 caractères.');
  if (b.email && get('SELECT id FROM users WHERE email = ?', b.email.trim())) errors.push('Un compte existe déjà avec cet e-mail.');
  if (!values.maturities) errors.push('Cochez au moins un type de série.');
  if (b.nda !== '1') errors.push('Merci d\'accepter l\'engagement de confidentialité et de non-contournement.');
  if (errors.length) return res.status(400).render('supplier-register', { values, errors });

  const verifyToken = token();
  const { lastInsertRowid: userId } = run(`INSERT INTO users (email, password_hash, role, name, company, verify_token)
    VALUES (?, ?, 'supplier', ?, ?, ?)`, b.email.trim(), hashPassword(b.password), values.contact_name, values.company, verifyToken);
  const c = criteriaFromBody(b);
  run(`INSERT INTO suppliers (user_id, email, source, nda_accepted_at, ${Object.keys(c).join(', ')})
       VALUES (?, ?, 'self', datetime('now'), ${Object.keys(c).map(() => '?').join(', ')})`, userId, b.email.trim(), ...Object.values(c));
  notify.verification(b.email.trim(), verifyToken);
  req.session.userId = Number(userId);
  flash(req, 'success', 'Inscription enregistrée. Confirmez votre adresse via l\'e-mail que nous venons de vous envoyer.');
  res.redirect('/fournisseur');
});

// ---- Espace sous-traitant connecté ----

router.get('/fournisseur', requireRole('supplier'), (req, res) => {
  const supplier = get('SELECT * FROM suppliers WHERE user_id = ?', req.user.id);
  const consultations = supplier ? all(`SELECT c.*, p.ref, p.title, p.quantity FROM consultations c
    JOIN projects p ON p.id = c.project_id WHERE c.supplier_id = ? ORDER BY c.id DESC`, supplier.id) : [];
  res.render('supplier-home', { supplier, consultations, errors: [] });
});

router.post('/fournisseur/profil', requireRole('supplier'), (req, res) => {
  const supplier = get('SELECT * FROM suppliers WHERE user_id = ?', req.user.id);
  const c = criteriaFromBody(req.body);
  if (!c.company || !c.maturities) {
    flash(req, 'error', 'La société et au moins un type de série sont obligatoires.');
    return res.redirect('/fournisseur');
  }
  run(`UPDATE suppliers SET ${Object.keys(c).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(c), supplier.id);
  flash(req, 'success', 'Vos conditions ont été mises à jour.');
  res.redirect('/fournisseur');
});

// ---- Consultation anonymisée (lien reçu par e-mail, sans connexion) ----

function loadConsultation(req, res, next) {
  const c = get('SELECT * FROM consultations WHERE token = ?', req.params.token);
  if (!c) return res.status(404).render('message', { title: 'Consultation introuvable', message: 'Ce lien est invalide ou a expiré.' });
  if (consultationExpired(c)) {
    return res.status(410).render('message', { title: 'Consultation expirée', message: `Ce lien n'est plus valide (${CONSULTATION_TTL_DAYS} jours après l'envoi). Contactez-nous si vous avez encore besoin des documents.` });
  }
  req.consultation = c;
  req.project = get('SELECT * FROM projects WHERE id = ?', c.project_id);
  req.supplier = get('SELECT * FROM suppliers WHERE id = ?', c.supplier_id);
  next();
}

function sharedFiles(projectId) {
  return all('SELECT * FROM project_files WHERE project_id = ? AND share_with_suppliers = 1 AND anon_stored_name IS NOT NULL ORDER BY kind, id', projectId);
}

router.get('/consultation/:token', loadConsultation, (req, res) => {
  const c = req.consultation;
  if (c.status === 'sent') run("UPDATE consultations SET status = 'viewed' WHERE id = ?", c.id);
  const p = req.project;
  // Seules les informations non identifiantes sont transmises à la vue.
  const project = {
    ref: p.ref, quantity: p.quantity, maturity: p.maturity, region: p.region,
    desired_deadline: p.desired_deadline, supplier_brief: p.supplier_brief, closed: p.step >= 4 || ['won', 'lost'].includes(c.status),
  };
  const ndaAccepted = Boolean(req.supplier.nda_accepted_at);
  const shared = ndaAccepted ? sharedFiles(p.id) : [];
  const files = shared.map((f) => ({
    id: f.id, kind: f.kind, size: f.size, name: neutralName(p, f, shared), query: signedFileQuery(c.id, f.id),
  }));
  // Questions/réponses : on ne montre ni l'auteur de la question, ni les questions sans réponse des autres.
  const questions = all(`SELECT id, question, answer, consultation_id = ? AS mine FROM questions
    WHERE project_id = ? AND (answer IS NOT NULL OR consultation_id = ?) ORDER BY id`, c.id, p.id, c.id);
  res.render('consultation', {
    project, files, questions, ndaAccepted, supplier: req.supplier,
    consultation: { ...c, status: c.status === 'sent' ? 'viewed' : c.status },
  });
});

// Acceptation de l'engagement de confidentialité (sous-traitants importés, sans compte).
router.post('/consultation/:token/engagement', loadConsultation, (req, res) => {
  if (req.body.nda === '1' && !req.supplier.nda_accepted_at) {
    run("UPDATE suppliers SET nda_accepted_at = datetime('now') WHERE id = ?", req.supplier.id);
    addEvent(req.project.id, `${req.supplier.company} : engagement de confidentialité accepté`, false);
  }
  res.redirect(`/consultation/${req.consultation.token}`);
});

router.post('/consultation/:token/questions', loadConsultation, (req, res) => {
  const { consultation: c, project: p, supplier } = req;
  const question = req.body.question?.trim();
  if (question && supplier.nda_accepted_at && p.step < 4) {
    run('INSERT INTO questions (project_id, consultation_id, question) VALUES (?, ?, ?)', p.id, c.id, question);
    addEvent(p.id, `${supplier.company} : question posée`, false);
    notify.questionAsked(p, supplier, question);
    flash(req, 'success', 'Question transmise. La réponse sera partagée avec tous les fabricants consultés.');
  }
  res.redirect(`/consultation/${c.token}#questions`);
});

router.get('/consultation/:token/fichiers/:fileId', loadConsultation, (req, res) => {
  const fileId = Number(req.params.fileId);
  if (!req.supplier.nda_accepted_at || !verifyFileLink(req.consultation.id, fileId, req.query.exp, req.query.sig)) {
    return res.status(403).render('message', { title: 'Lien expiré', message: `Ce lien de téléchargement a expiré. Rouvrez la page de la consultation pour obtenir un nouveau lien.` });
  }
  const files = sharedFiles(req.project.id);
  const file = files.find((f) => f.id === fileId);
  if (!file) return res.sendStatus(404);
  res.download(path.join(UPLOAD_DIR, file.anon_stored_name), neutralName(req.project, file, files));
});

router.post('/consultation/:token', loadConsultation, (req, res) => {
  const { consultation: c, project: p, supplier } = req;
  const decline = req.body.action === 'decline';
  if (['won', 'lost'].includes(c.status) || p.step >= 4 || !supplier.nda_accepted_at) return res.redirect(`/consultation/${c.token}`);
  if (!decline && (!req.body.price?.trim() || !req.body.lead_time?.trim())) {
    flash(req, 'error', 'Merci d\'indiquer un prix et un délai.');
    return res.redirect(`/consultation/${c.token}`);
  }
  run(`UPDATE consultations SET status = ?, price = ?, lead_time = ?, comment = ?, responded_at = datetime('now') WHERE id = ?`,
    decline ? 'declined' : 'quoted', decline ? null : req.body.price.trim(), decline ? null : req.body.lead_time.trim(),
    req.body.comment?.trim() || null, c.id);
  addEvent(p.id, `${supplier.company} : ${decline ? 'décline' : 'offre reçue'}`, false);
  notify.supplierResponded(p, supplier, get('SELECT * FROM consultations WHERE id = ?', c.id));
  flash(req, 'success', decline ? 'Merci pour votre retour.' : 'Votre offre a bien été transmise. Merci !');
  res.redirect(`/consultation/${c.token}`);
});

module.exports = router;
module.exports.criteriaFromBody = criteriaFromBody;
