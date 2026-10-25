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
};

module.exports = { REGIONS, SUPPLIER_REGIONS, MATURITIES, CONTEXTS, STEPS, FILE_KINDS, CONSULTATION_STATUS };
