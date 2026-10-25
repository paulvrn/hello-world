// Contenu des e-mails envoyés par la plateforme.
const { all } = require('./db');
const { sendMail } = require('./mailer');
const {
  REGIONS, MATURITIES, CONTEXTS, FILE_KINDS, QUALITY_STANDARDS, TESTS, CERTIFICATIONS, COMPONENT_SUPPLY, listOf,
} = require('./labels');
const { BASE_URL, fmtDate } = require('./helpers');

const ADMIN_EMAIL = () => process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || 'admin@example.com';
const trackUrl = (p) => `${BASE_URL}/suivi/${p.tracking_token}`;
const adminUrl = (p) => `${BASE_URL}/admin/projets/${p.id}`;

const names = (value, dict) => listOf(value, dict).map((k) => dict[k]).join(', ');

// Exigences techniques, communes au récapitulatif client et au descriptif sous-traitant.
function requirements(p) {
  return [
    `Norme de fabrication : ${QUALITY_STANDARDS[p.quality_standard] || 'non précisée'}`,
    `Tests exigés : ${names(p.tests_required, TESTS) || 'non précisés'}`,
    `Certifications exigées : ${names(p.certifications_required, CERTIFICATIONS) || 'aucune'}`,
    `Composants : ${COMPONENT_SUPPLY[p.components_supply] || 'non précisé'}`,
  ];
}

function recap(project) {
  const files = all('SELECT kind, original_name FROM project_files WHERE project_id = ? ORDER BY id', project.id);
  return [
    `Référence : ${project.ref}`,
    `Projet : ${project.title}`,
    `Société : ${project.contact_company}`,
    `Contact : ${project.contact_name} – ${project.contact_email}${project.contact_phone ? ' – ' + project.contact_phone : ''}`,
    `Lieu de fabrication souhaité : ${REGIONS[project.region]}`,
    `Quantité : ${project.quantity}${project.lot_cadence ? ` (${project.lot_cadence})` : ''}`,
    `Maturité : ${MATURITIES[project.maturity]}`,
    ...requirements(project),
    `Lieu de livraison : ${project.delivery_place || 'non précisé'}`,
    `Contraintes réglementaires : ${project.regulatory_constraints || '—'}`,
    `Contexte : ${CONTEXTS[project.context]}`,
    `Délai souhaité : ${project.desired_deadline ? fmtDate(project.desired_deadline) : 'non précisé'}`,
    `Prix cible : ${project.target_price || 'non précisé'}`,
    `Précisions : ${project.notes || '—'}`,
    'Documents :',
    ...files.map((f) => `  - ${FILE_KINDS[f.kind]} : ${f.original_name}`),
  ].join('\n');
}

const notify = {
  verification(email, verifyToken) {
    sendMail({
      to: email,
      subject: 'Confirmez votre adresse e-mail',
      text: `Bonjour,\n\nPour activer votre compte, cliquez sur ce lien :\n${BASE_URL}/verifier/${verifyToken}\n`,
    });
  },

  projectSubmitted(p) {
    sendMail({
      to: p.contact_email,
      subject: `[${p.ref}] Confirmation de votre demande de câblage`,
      text: `Bonjour ${p.contact_name},\n\nNous avons bien reçu votre demande. Voici le récapitulatif :\n\n${recap(p)}\n\n`
        + `Suivez l'avancement de votre projet : ${trackUrl(p)}\n`
        + `Créez un compte pour suivre tous vos projets et faire de nouvelles demandes : ${BASE_URL}/inscription?email=${encodeURIComponent(p.contact_email)}\n\nÀ bientôt.`,
    });
    sendMail({
      to: ADMIN_EMAIL(),
      subject: `Nouvelle demande ${p.ref} – ${p.contact_company}`,
      text: `Nouvelle demande reçue.\n\n${recap(p)}\n\nÉvaluer et présélectionner les sous-traitants : ${adminUrl(p)}`,
    });
  },

  clarificationRequested(p) {
    sendMail({
      to: p.contact_email,
      subject: `[${p.ref}] Quelques précisions sur votre projet`,
      text: `Bonjour ${p.contact_name},\n\nPour avancer sur votre projet « ${p.title} », nous avons besoin des précisions suivantes :\n\n${p.clarification_request}\n\nRépondre : ${trackUrl(p)}`,
    });
  },

  clarificationAnswered(p) {
    sendMail({
      to: ADMIN_EMAIL(),
      subject: `[${p.ref}] Précisions reçues du client`,
      text: `${p.contact_company} a répondu :\n\n${p.clarification_answer}\n\n${adminUrl(p)}`,
    });
  },

  quoteSent(p) {
    sendMail({
      to: p.contact_email,
      subject: `[${p.ref}] Votre devis est disponible`,
      text: `Bonjour ${p.contact_name},\n\nVotre devis pour « ${p.title} » :\n\nPrix : ${p.quote_price}\nDélai : ${p.quote_lead_time}\n${p.quote_comment ? '\n' + p.quote_comment + '\n' : ''}\nConsulter et valider : ${trackUrl(p)}`,
    });
  },

  orderPlaced(p) {
    sendMail({
      to: ADMIN_EMAIL(),
      subject: `[${p.ref}] Commande reçue de ${p.contact_company}`,
      text: `Le client a validé le devis.\nRéférence de commande : ${p.order_reference || '—'}\n\n${adminUrl(p)}`,
    });
    sendMail({
      to: p.contact_email,
      subject: `[${p.ref}] Commande bien reçue`,
      text: `Bonjour ${p.contact_name},\n\nNous avons bien reçu votre commande. Nous vous tiendrons informé du lancement de la production.\n\n${trackUrl(p)}`,
    });
  },

  stepChanged(p, label, extra = '') {
    sendMail({
      to: p.contact_email,
      subject: `[${p.ref}] ${label}`,
      text: `Bonjour ${p.contact_name},\n\nVotre projet « ${p.title} » : ${label.toLowerCase()}.${extra ? '\n\n' + extra : ''}\n\n${trackUrl(p)}`,
    });
  },

  // Consultation anonymisée : aucune information sur le client final.
  consultation(p, supplier, consultation) {
    return sendMail({
      to: supplier.email,
      subject: `Consultation câblage ${p.ref} – ${p.quantity} pièce(s)`,
      text: `Bonjour${supplier.contact_name ? ' ' + supplier.contact_name : ''},\n\n`
        + `Nous recherchons un sous-traitant pour le projet de câblage filaire ${p.ref}.\n`
        + `Consultation restreinte : ${consultation.panel_size} fabricant(s) consulté(s).\n\n${p.supplier_brief}\n\n`
        + `Plans, nomenclature et formulaire de réponse : ${BASE_URL}/consultation/${consultation.token}\n\n`
        + 'Merci de ne pas diffuser ces documents.\n\nCordialement.',
    });
  },

  questionAsked(p, supplier, question) {
    sendMail({
      to: ADMIN_EMAIL(),
      subject: `[${p.ref}] Question de ${supplier.company}`,
      text: `${question}\n\nRépondre (la réponse sera partagée à tous les sous-traitants consultés) : ${adminUrl(p)}#questions`,
    });
  },

  // Réponse partagée à tous les sous-traitants consultés, sans dire qui a posé la question.
  questionAnswered(p, supplier, consultation, q) {
    sendMail({
      to: supplier.email,
      subject: `Consultation ${p.ref} : réponse à une question`,
      text: `Bonjour${supplier.contact_name ? ' ' + supplier.contact_name : ''},\n\n`
        + `Une précision a été apportée sur la consultation ${p.ref}, pour que tous les fabricants chiffrent sur la même base.\n\n`
        + `Question : ${q.question}\nRéponse : ${q.answer}\n\n${BASE_URL}/consultation/${consultation.token}#questions\n\nCordialement.`,
    });
  },

  // Retour au sous-traitant sur l'issue de la consultation (retenu ou non).
  consultationOutcome(p, c, status, feedback) {
    const intro = status === 'won'
      ? `Bonne nouvelle : votre offre pour la consultation ${p.ref} est retenue. Nous revenons vers vous pour la suite.`
      : `Merci pour votre offre sur la consultation ${p.ref}. Elle n'a pas été retenue cette fois-ci.`;
    sendMail({
      to: c.email,
      subject: `Consultation ${p.ref} : ${status === 'won' ? 'offre retenue' : 'résultat'}`,
      text: `Bonjour${c.contact_name ? ' ' + c.contact_name : ''},\n\n${intro}${feedback ? `\n\n${feedback}` : ''}\n\nCordialement.`,
    });
  },

  supplierResponded(p, supplier, c) {
    sendMail({
      to: ADMIN_EMAIL(),
      subject: `[${p.ref}] ${supplier.company} : ${c.status === 'quoted' ? 'offre reçue' : 'décline'}`,
      text: c.status === 'quoted'
        ? `Prix : ${c.price}\nDélai : ${c.lead_time}\n${c.comment || ''}\n\n${adminUrl(p)}`
        : `${c.comment || 'Pas de commentaire.'}\n\n${adminUrl(p)}`,
    });
  },
};

// Brief par défaut proposé à l'admin pour les sous-traitants (sans données client).
function defaultBrief(p) {
  return [
    `Désignation : ${p.title}`,
    `Quantité : ${p.quantity}${p.lot_cadence ? ` (${p.lot_cadence})` : ''}`,
    `Maturité : ${MATURITIES[p.maturity]}`,
    `Lieu de fabrication : ${REGIONS[p.region]}`,
    ...requirements(p),
    p.regulatory_constraints ? `Contraintes réglementaires : ${p.regulatory_constraints}` : null,
    `Délai souhaité : ${p.desired_deadline ? fmtDate(p.desired_deadline) : 'à préciser'}`,
    p.est_hours != null ? `Charge estimée : ${p.est_hours} h` : null,
    p.complexity != null ? `Complexité : ${p.complexity}/5` : null,
  ].filter(Boolean).join('\n');
}

module.exports = { notify, recap, defaultBrief };
