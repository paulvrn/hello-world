const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const { UPLOAD_DIR, run } = require('./db');

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
});

// Multer décode les noms de fichiers en latin1 ; on les remet en UTF-8 (accents).
function originalName(file) {
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

function isPdf(file) {
  return file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
}

/**
 * Produit une copie d'un PDF sans métadonnées (auteur, société, logiciel, titre…).
 * Le contenu graphique (cartouche, logo) n'est pas modifié : l'admin peut déposer une version caviardée.
 */
async function stripPdfMetadata(storedName) {
  const src = path.join(UPLOAD_DIR, storedName);
  const pdf = await PDFDocument.load(fs.readFileSync(src), { updateMetadata: false, ignoreEncryption: true });
  pdf.setTitle('');
  pdf.setAuthor('');
  pdf.setSubject('');
  pdf.setKeywords([]);
  pdf.setCreator('');
  pdf.setProducer('');
  const anonName = `anon-${crypto.randomUUID()}.pdf`;
  fs.writeFileSync(path.join(UPLOAD_DIR, anonName), await pdf.save({ updateFieldAppearances: false }));
  return anonName;
}

// Enregistre les fichiers téléversés pour un projet.
// Seuls les PDF nettoyés sont partageables d'office ; les autres formats attendent la validation de l'admin.
async function saveProjectFiles(projectId, files, kind) {
  for (const file of files || []) {
    let anon = null;
    if (isPdf(file)) {
      try {
        anon = await stripPdfMetadata(file.filename);
      } catch (err) {
        console.warn(`Nettoyage PDF impossible (${file.filename}) :`, err.message);
      }
    }
    run(`INSERT INTO project_files (project_id, kind, original_name, stored_name, mime, size, anon_stored_name, share_with_suppliers)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      projectId, kind, originalName(file), file.filename, file.mimetype, file.size, anon, anon ? 1 : 0);
  }
}

// Nom neutre présenté aux sous-traitants (ne reprend pas le nom de fichier du client) : REF-plan-1.pdf…
function neutralName(project, file, files) {
  const index = files.filter((f) => f.kind === file.kind).findIndex((f) => f.id === file.id);
  const ext = path.extname(file.original_name).toLowerCase();
  return `${project.ref}-${file.kind}-${index + 1}${ext}`;
}

module.exports = { upload, originalName, saveProjectFiles, neutralName, isPdf };
