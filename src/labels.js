// Libellés et listes de valeurs partagés par les formulaires, la logique métier et les vues.

const REGIONS = {
  france: 'France',
  europe: 'Europe',
  usa: 'USA',
  any: 'Peu importe',
};

// Région géographique d'un sous-traitant (où il fabrique).
const SUPPLIER_REGIONS = {
  france: 'France',
  europe: 'Europe (hors France)',
  usa: 'USA',
  other: 'Autre',
};

const MATURITIES = {
  proto: 'Prototype',
  first_series: 'Premier de série (déjà prototypé)',
  mature: 'Série mature',
};

const CONTEXTS = {
  new_need: 'Nouveau besoin',
  panel_extension: 'Élargissement du panel de fournisseurs',
  supplier_replacement: 'Remplacement de fournisseur',
  outsourcing: "Externalisation d'une fabrication interne",
};

// Norme ou classe de fabrication attendue.
const QUALITY_STANDARDS = {
  ipc_1: 'IPC/WHMA-A-620 classe 1',
  ipc_2: 'IPC/WHMA-A-620 classe 2',
  ipc_3: 'IPC/WHMA-A-620 classe 3',
  customer: 'Spécification client',
  unknown: 'À définir / je ne sais pas',
};

const TESTS = {
  continuity: 'Test de continuité',
  insulation: 'Test d\'isolement / hipot',
  report: 'Rapport de test par pièce',
};

// Certifications pouvant être exigées du fabricant (et déclarées par les sous-traitants).
const CERTIFICATIONS = {
  iso9001: 'ISO 9001',
  en9100: 'EN 9100',
  iatf16949: 'IATF 16949',
  iso13485: 'ISO 13485',
  iris: 'IRIS / ISO 22163',
};

const COMPONENT_SUPPLY = {
  supplier: 'Approvisionnés par le fabricant',
  customer: 'Fournis par nos soins',
  mixed: 'Mixte',
  unknown: 'À définir',
};

// Procédés maîtrisés par les sous-traitants.
const PROCESSES = {
  crimping: 'Sertissage',
  board: 'Faisceaux sur planche',
  overmolding: 'Surmoulage',
  coax: 'Coaxial / RF',
  shielding: 'Blindage / reprise de tresse',
  aero: 'Connectique aéro / militaire',
  auto_test: 'Banc de test automatisé',
  cabinet: 'Câblage d\'armoire',
};

const STEPS = [
  { n: 1, key: 'submitted', label: 'Envoi du besoin' },
  { n: 2, key: 'clarification', label: 'Validation de précisions', optional: true },
  { n: 3, key: 'quote', label: 'Réception du devis' },
  { n: 4, key: 'order', label: 'Envoi de la commande' },
  { n: 5, key: 'production', label: 'Production' },
  { n: 6, key: 'shipping', label: 'Expédition' },
];

const FILE_KINDS = {
  plan: 'Plan',
  bom: 'Nomenclature',
  other: 'Autre document',
};

const CONSULTATION_STATUS = {
  sent: 'Envoyée',
  viewed: 'Consultée',
  quoted: 'Offre reçue',
  declined: 'Déclinée',
  won: 'Retenue',
  lost: 'Non retenue',
};

// Nom de la société qui opère la plateforme (mentions de confidentialité).
const COMPANY_NAME = process.env.COMPANY_NAME || 'SP2I';

// Liste de valeurs stockée en texte « a,b,c » → tableau de clés connues.
function listOf(value, dict) {
  return String(value || '').split(',').map((v) => v.trim()).filter((v) => dict[v]);
}

module.exports = {
  REGIONS, SUPPLIER_REGIONS, MATURITIES, CONTEXTS, QUALITY_STANDARDS, TESTS, CERTIFICATIONS, COMPONENT_SUPPLY, PROCESSES,
  STEPS, FILE_KINDS, CONSULTATION_STATUS, COMPANY_NAME, listOf,
};
