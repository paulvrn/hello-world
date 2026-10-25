const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { get, all, run, transaction, addEvent, UPLOAD_DIR } = require('../db');
const { token, requireRole } = require('../auth');
const { upload, originalName } = require('../files');
const { evaluate, preselect, WAVE_SIZE, MAX_PANEL } = require('../matching');
const { supplierStats, statsLabel } = require('../stats');
const { parseCsv } = require('../csv');
const { MATURITIES, SUPPLIER_REGIONS, PROCESSES, CERTIFICATIONS, listOf } = require('../labels');
const { flash, num } = require('../helpers');
const { notify, defaultBrief } = require('../notify');
const { criteriaFromBody } = require('./supplier');

const router = express.Router();
router.use(requireRole('admin'));

router.get('/', (req, res) => {
  const projects = all(`SELECT p.*,
      (SELECT COUNT(*) FROM consultations c WHERE c.project_id = p.id) AS consulted,
      (SELECT COUNT(*) FROM consultations c WHERE c.project_id = p.id AND c.status IN ('quoted', 'won', 'lost')) AS quotes
    FROM projects p ORDER BY p.admin_seen, p.id DESC`);
  res.render('admin/projects', { projects });
});

// ---- Projet ----

function loadProject(req, res, next) {
  req.project = get('SELECT * FROM projects WHERE id = ?', Number(req.params.id));
  if (!req.project) return res.sendStatus(404);
  next();
}

router.get('/projets/:id', loadProject, (req, res) => {
  const p = req.project;
  if (!p.admin_seen) run('UPDATE projects SET admin_seen = 1 WHERE id = ?', p.id);
  const consultations = all(`SELECT c.*, s.company, s.email FROM consultations c JOIN suppliers s ON s.id = c.supplier_id
    WHERE c.project_id = ? ORDER BY c.id`, p.id);
  const consulted = new Set(consultations.map((c) => c.supplier_id));
  const stats = supplierStats();
  const candidates = all('SELECT * FROM suppliers WHERE active = 1 ORDER BY company')
    .filter((s) => !consulted.has(s.id))
    .map((s) => ({ ...s, ...evaluate(p, s), stats: stats.get(s.id), statsLabel: statsLabel(stats.get(s.id)) }))
    .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
  const checked = new Set(preselect(candidates, consultations.length));
  res.render('admin/project', {
    checked,
    waveSize: WAVE_SIZE,
    maxPanel: MAX_PANEL,
    questions: all(`SELECT q.*, s.company FROM questions q LEFT JOIN consultations c ON c.id = q.consultation_id
      LEFT JOIN suppliers s ON s.id = c.supplier_id WHERE q.project_id = ? ORDER BY q.id`, p.id),
    project: p,
    brief: p.supplier_brief || defaultBrief(p),
    files: all('SELECT * FROM project_files WHERE project_id = ? ORDER BY kind, id', p.id),
    events: all('SELECT * FROM project_events WHERE project_id = ? ORDER BY id DESC', p.id),
    consultations,
    candidates,
  });
});

router.post('/projets/:id/evaluation', loadProject, (req, res) => {
  const complexity = num(req.body.complexity);
  run(`UPDATE projects SET est_hours = ?, complexity = ?, supplier_brief = ?, updated_at = datetime('now') WHERE id = ?`,
    num(req.body.est_hours), complexity == null ? null : Math.min(5, Math.max(1, Math.round(complexity))),
    req.body.supplier_brief?.trim() || null, req.project.id);
  flash(req, 'success', 'Évaluation enregistrée : la présélection est mise à jour.');
  res.redirect(`/admin/projets/${req.project.id}#matching`);
});

router.post('/projets/:id/consultations', loadProject, async (req, res) => {
  const p = req.project;
  const ids = [].concat(req.body.suppliers || []).map(Number);
  if (!ids.length) {
    flash(req, 'error', 'Sélectionnez au moins un sous-traitant.');
    return res.redirect(`/admin/projets/${p.id}#matching`);
  }
  if (!p.supplier_brief) run('UPDATE projects SET supplier_brief = ? WHERE id = ?', defaultBrief(p), p.id);
  const project = get('SELECT * FROM projects WHERE id = ?', p.id);
  const already = get('SELECT COUNT(*) AS n FROM consultations WHERE project_id = ?', p.id).n;
  const fresh = [...new Set(ids)].filter((id) => get('SELECT id FROM suppliers WHERE id = ?', id)
    && !get('SELECT id FROM consultations WHERE project_id = ? AND supplier_id = ?', p.id, id));
  // Panel restreint : au-delà de MAX_PANEL fabricants, l'élargissement doit être volontaire (projet atypique).
  if (already + fresh.length > MAX_PANEL && req.body.widen !== '1') {
    flash(req, 'error', `Consultation limitée à ${MAX_PANEL} fabricants par projet (${already} déjà consulté(s)). Cochez « élargir volontairement » pour un projet atypique.`);
    return res.redirect(`/admin/projets/${p.id}#matching`);
  }
  const panelSize = already + fresh.length;
  let sent = 0;
  for (const id of fresh) {
    const supplier = get('SELECT * FROM suppliers WHERE id = ?', id);
    const t = token();
    run('INSERT INTO consultations (project_id, supplier_id, token, panel_size) VALUES (?, ?, ?, ?)', p.id, id, t, panelSize);
    if (await notify.consultation(project, supplier, { token: t, panel_size: panelSize })) sent++;
  }
  addEvent(p.id, `Consultation envoyée à ${sent} sous-traitant(s) (vague ${already ? 'complémentaire' : 'initiale'})`, false);
  addEvent(p.id, 'Votre demande est à l\'étude auprès de nos partenaires');
  flash(req, 'success', `${sent} consultation(s) envoyée(s).`);
  res.redirect(`/admin/projets/${p.id}#consultations`);
});

router.post('/projets/:id/precisions', loadProject, (req, res) => {
  const p = req.project;
  const question = req.body.clarification_request?.trim();
  if (!question || p.step > 2) return res.redirect(`/admin/projets/${p.id}`);
  run(`UPDATE projects SET step = 2, clarification_request = ?, clarification_answer = NULL, updated_at = datetime('now') WHERE id = ?`, question, p.id);
  addEvent(p.id, 'Précisions demandées');
  notify.clarificationRequested(get('SELECT * FROM projects WHERE id = ?', p.id));
  flash(req, 'success', 'Demande de précisions envoyée au client.');
  res.redirect(`/admin/projets/${p.id}`);
});

router.post('/projets/:id/devis', loadProject, (req, res) => {
  const p = req.project;
  const { quote_price: price, quote_lead_time: lead, quote_comment: comment } = req.body;
  if (!price?.trim() || !lead?.trim() || p.step > 3) {
    flash(req, 'error', 'Prix et délai obligatoires.');
    return res.redirect(`/admin/projets/${p.id}#etapes`);
  }
  run(`UPDATE projects SET step = 3, quote_price = ?, quote_lead_time = ?, quote_comment = ?, updated_at = datetime('now') WHERE id = ?`,
    price.trim(), lead.trim(), comment?.trim() || null, p.id);
  addEvent(p.id, 'Devis envoyé');
  notify.quoteSent(get('SELECT * FROM projects WHERE id = ?', p.id));
  flash(req, 'success', 'Devis envoyé au client.');
  res.redirect(`/admin/projets/${p.id}#etapes`);
});

router.post('/projets/:id/production', loadProject, (req, res) => {
  const p = req.project;
  if (p.step !== 4) return res.redirect(`/admin/projets/${p.id}`);
  run("UPDATE projects SET step = 5, updated_at = datetime('now') WHERE id = ?", p.id);
  addEvent(p.id, 'Production lancée');
  notify.stepChanged(p, 'Production lancée');
  res.redirect(`/admin/projets/${p.id}#etapes`);
});

router.post('/projets/:id/expedition', loadProject, (req, res) => {
  const p = req.project;
  if (p.step !== 5) return res.redirect(`/admin/projets/${p.id}`);
  const info = req.body.tracking_info?.trim() || null;
  run("UPDATE projects SET step = 6, tracking_info = ?, updated_at = datetime('now') WHERE id = ?", info, p.id);
  addEvent(p.id, `Expédié${info ? ' – ' + info : ''}`);
  notify.stepChanged(p, 'Commande expédiée', info ? `Suivi : ${info}` : '');
  res.redirect(`/admin/projets/${p.id}#etapes`);
});

// Réponse à une question de sous-traitant : partagée à tous les sous-traitants consultés.
router.post('/projets/:id/questions/:qid', loadProject, (req, res) => {
  const p = req.project;
  const q = get('SELECT * FROM questions WHERE id = ? AND project_id = ?', Number(req.params.qid), p.id);
  const answer = req.body.answer?.trim();
  if (!q || !answer) return res.redirect(`/admin/projets/${p.id}#questions`);
  run("UPDATE questions SET answer = ?, answered_at = datetime('now') WHERE id = ?", answer, q.id);
  const recipients = all(`SELECT s.*, c.token FROM consultations c JOIN suppliers s ON s.id = c.supplier_id
    WHERE c.project_id = ? AND c.status IN ('sent', 'viewed', 'quoted')`, p.id);
  for (const s of recipients) notify.questionAnswered(p, s, { token: s.token }, { ...q, answer });
  addEvent(p.id, `Réponse à une question partagée à ${recipients.length} sous-traitant(s)`, false);
  flash(req, 'success', `Réponse partagée à ${recipients.length} sous-traitant(s).`);
  res.redirect(`/admin/projets/${p.id}#questions`);
});

// Question posée directement par l'admin (ex. précision du client à diffuser à tous).
router.post('/projets/:id/questions', loadProject, (req, res) => {
  const p = req.project;
  const question = req.body.question?.trim();
  if (question) run('INSERT INTO questions (project_id, question) VALUES (?, ?)', p.id, question);
  res.redirect(`/admin/projets/${p.id}#questions`);
});

// Issue de la consultation : sous-traitant retenu et retour personnalisé aux autres.
router.post('/projets/:id/issue', loadProject, (req, res) => {
  const p = req.project;
  const winner = num(req.body.winner);
  const consultations = all(`SELECT c.*, s.company, s.email, s.contact_name FROM consultations c
    JOIN suppliers s ON s.id = c.supplier_id WHERE c.project_id = ? AND c.status IN ('quoted', 'won', 'lost')`, p.id);
  let sent = 0;
  for (const c of consultations) {
    const status = c.id === winner ? 'won' : 'lost';
    const feedback = req.body[`feedback_${c.id}`]?.trim() || null;
    const changed = status !== c.status || (feedback && feedback !== c.feedback);
    if (!changed) continue;
    run(`UPDATE consultations SET status = ?, feedback = COALESCE(?, feedback),
      feedback_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE feedback_at END WHERE id = ?`, status, feedback, feedback, c.id);
    if (req.body.notify === '1') {
      notify.consultationOutcome(p, c, status, feedback);
      sent++;
    }
  }
  addEvent(p.id, winner ? `Sous-traitant retenu : ${consultations.find((c) => c.id === winner)?.company}` : 'Consultation close sans suite', false);
  flash(req, 'success', `Issue enregistrée${sent ? `, ${sent} retour(s) envoyé(s)` : ''}.`);
  res.redirect(`/admin/projets/${p.id}#consultations`);
});

router.post('/projets/:id/note', loadProject, (req, res) => {
  if (req.body.message?.trim()) addEvent(req.project.id, req.body.message.trim(), req.body.visible === '1');
  res.redirect(`/admin/projets/${req.project.id}#historique`);
});

// ---- Fichiers ----

function loadFile(req, res, next) {
  req.file_ = get('SELECT * FROM project_files WHERE id = ?', Number(req.params.fileId));
  if (!req.file_) return res.sendStatus(404);
  next();
}

router.get('/fichiers/:fileId', loadFile, (req, res) => {
  const f = req.file_;
  const stored = req.query.version === 'anon' ? f.anon_stored_name : f.stored_name;
  if (!stored) return res.sendStatus(404);
  res.download(path.join(UPLOAD_DIR, stored), (req.query.version === 'anon' ? 'ANONYME-' : '') + f.original_name);
});

router.post('/fichiers/:fileId/partage', loadFile, (req, res) => {
  const f = req.file_;
  const share = req.body.share === '1';
  if (share && !f.anon_stored_name) {
    // Fichier non nettoyable automatiquement : l'admin confirme qu'il ne contient pas d'info client.
    if (req.body.confirm !== '1') {
      flash(req, 'error', 'Ce fichier n\'a pas de version anonymisée : déposez une version caviardée ou confirmez qu\'il ne contient aucune information client.');
      return res.redirect(`/admin/projets/${f.project_id}#fichiers`);
    }
    run('UPDATE project_files SET anon_stored_name = stored_name, anon_manual = 1 WHERE id = ?', f.id);
  }
  run('UPDATE project_files SET share_with_suppliers = ? WHERE id = ?', share ? 1 : 0, f.id);
  res.redirect(`/admin/projets/${f.project_id}#fichiers`);
});

router.post('/fichiers/:fileId/anonyme', loadFile, upload.single('file'), (req, res) => {
  const f = req.file_;
  if (!req.file) return res.redirect(`/admin/projets/${f.project_id}#fichiers`);
  if (f.anon_stored_name && f.anon_stored_name !== f.stored_name) fs.rm(path.join(UPLOAD_DIR, f.anon_stored_name), { force: true }, () => {});
  run('UPDATE project_files SET anon_stored_name = ?, anon_manual = 1, share_with_suppliers = 1 WHERE id = ?', req.file.filename, f.id);
  flash(req, 'success', `Version caviardée de « ${f.original_name} » enregistrée (${originalName(req.file)}).`);
  res.redirect(`/admin/projets/${f.project_id}#fichiers`);
});

// ---- Sous-traitants ----

router.get('/sous-traitants', (req, res) => {
  const suppliers = all(`SELECT s.*, (SELECT COUNT(*) FROM consultations c WHERE c.supplier_id = s.id) AS consulted,
    (SELECT COUNT(*) FROM consultations c WHERE c.supplier_id = s.id AND c.status IN ('quoted', 'won', 'lost')) AS quotes
    FROM suppliers s ORDER BY s.active DESC, s.company`);
  const stats = supplierStats();
  res.render('admin/suppliers', { suppliers: suppliers.map((s) => ({ ...s, statsLabel: statsLabel(stats.get(s.id)) })) });
});

router.get('/sous-traitants/nouveau', (req, res) => {
  res.render('admin/supplier-form', { supplier: { region: 'france', maturities: Object.keys(MATURITIES).join(','), active: 1 } });
});

router.get('/sous-traitants/:id', (req, res) => {
  const supplier = get('SELECT * FROM suppliers WHERE id = ?', Number(req.params.id));
  if (!supplier) return res.sendStatus(404);
  const consultations = all(`SELECT c.*, p.ref, p.title FROM consultations c JOIN projects p ON p.id = c.project_id
    WHERE c.supplier_id = ? ORDER BY c.id DESC`, supplier.id);
  res.render('admin/supplier-form', { supplier, consultations });
});

router.post('/sous-traitants', (req, res) => saveSupplier(req, res, null));
router.post('/sous-traitants/:id', (req, res) => saveSupplier(req, res, Number(req.params.id)));

function saveSupplier(req, res, id) {
  const c = { ...criteriaFromBody(req.body), email: req.body.email?.trim(), active: req.body.active === '1' ? 1 : 0,
    admin_notes: req.body.admin_notes?.trim() || null };
  if (!c.company || !c.email) {
    flash(req, 'error', 'Société et e-mail obligatoires.');
    return res.redirect(id ? `/admin/sous-traitants/${id}` : '/admin/sous-traitants/nouveau');
  }
  if (id) {
    run(`UPDATE suppliers SET ${Object.keys(c).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(c), id);
  } else {
    run(`INSERT INTO suppliers (${Object.keys(c).join(', ')}) VALUES (${Object.keys(c).map(() => '?').join(', ')})`, ...Object.values(c));
  }
  flash(req, 'success', 'Sous-traitant enregistré.');
  res.redirect('/admin/sous-traitants');
}

const REGION_ALIASES = { fr: 'france', france: 'france', eu: 'europe', europe: 'europe', us: 'usa', usa: 'usa' };

router.post('/sous-traitants-import', upload.single('csv'), (req, res) => {
  if (!req.file) return res.redirect('/admin/sous-traitants');
  const rows = parseCsv(fs.readFileSync(req.file.path, 'utf8'));
  fs.rm(req.file.path, { force: true }, () => {});
  let created = 0;
  let skipped = 0;
  transaction(() => {
    for (const r of rows) {
      if (!r.company || !r.email || get('SELECT id FROM suppliers WHERE email = ?', r.email)) { skipped++; continue; }
      const region = REGION_ALIASES[(r.region || '').toLowerCase()] || (SUPPLIER_REGIONS[r.region] ? r.region : 'other');
      const maturities = (r.maturities || 'proto,first_series,mature').split(/[,|]/).map((m) => m.trim()).filter((m) => MATURITIES[m]);
      const keys = (value, dict) => listOf(String(value || '').replace(/\|/g, ','), dict).join(',') || null;
      run(`INSERT INTO suppliers (company, contact_name, email, phone, country, region, capabilities, min_hours, max_hours,
           min_complexity, max_complexity, min_quantity, max_quantity, maturities, processes, certifications, sources_components, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import')`,
        r.company, r.contact_name || null, r.email, r.phone || null, r.country || null, region, r.capabilities || null,
        num(r.min_hours), num(r.max_hours), num(r.min_complexity), num(r.max_complexity), num(r.min_quantity), num(r.max_quantity),
        maturities.join(','), keys(r.processes, PROCESSES), keys(r.certifications, CERTIFICATIONS),
        /^(1|oui|yes|true|x)$/i.test(String(r.sources_components || '').trim()) ? 1 : 0);
      created++;
    }
  });
  flash(req, 'success', `${created} sous-traitant(s) importé(s)${skipped ? `, ${skipped} ligne(s) ignorée(s) (incomplètes ou déjà présentes)` : ''}.`);
  res.redirect('/admin/sous-traitants');
});

router.get('/emails', (req, res) => {
  res.render('admin/emails', { emails: all('SELECT * FROM emails ORDER BY id DESC LIMIT 200') });
});

module.exports = router;
