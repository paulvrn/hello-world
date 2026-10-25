const { REGIONS, MATURITIES } = require('./labels');

// Régions de fabrication acceptables pour chaque préférence client.
const ACCEPTED_SUPPLIER_REGIONS = {
  france: ['france'],
  europe: ['france', 'europe'],
  usa: ['usa'],
  any: null, // toutes
};

function inRange(value, min, max) {
  if (min != null && value < min) return false;
  if (max != null && value > max) return false;
  return true;
}

function rangeLabel(min, max, unit = '') {
  if (min == null && max == null) return 'sans limite';
  if (min == null) return `≤ ${max}${unit}`;
  if (max == null) return `≥ ${min}${unit}`;
  return `${min}–${max}${unit}`;
}

/**
 * Évalue l'adéquation entre un projet et un sous-traitant.
 * Retourne { match, checks } où chaque check vaut { ok, label } (ok = null : critère non évaluable).
 * Les critères non encore renseignés par l'admin (heures, complexité) ne sont pas bloquants.
 */
function evaluate(project, supplier) {
  const checks = [];

  const accepted = ACCEPTED_SUPPLIER_REGIONS[project.region];
  checks.push({
    ok: !accepted || accepted.includes(supplier.region),
    label: `Zone : client « ${REGIONS[project.region]} », fournisseur ${supplier.country || supplier.region}`,
  });

  const maturities = (supplier.maturities || '').split(',').filter(Boolean);
  checks.push({
    ok: maturities.includes(project.maturity),
    label: `Maturité « ${MATURITIES[project.maturity]} »`,
  });

  checks.push({
    ok: inRange(project.quantity, supplier.min_quantity, supplier.max_quantity),
    label: `Quantité ${project.quantity} (accepte ${rangeLabel(supplier.min_quantity, supplier.max_quantity)})`,
  });

  if (project.est_hours == null) {
    checks.push({ ok: null, label: 'Heures estimées : non renseignées' });
  } else {
    checks.push({
      ok: inRange(project.est_hours, supplier.min_hours, supplier.max_hours),
      label: `${project.est_hours} h estimées (accepte ${rangeLabel(supplier.min_hours, supplier.max_hours, ' h')})`,
    });
  }

  if (project.complexity == null) {
    checks.push({ ok: null, label: 'Complexité : non renseignée' });
  } else {
    checks.push({
      ok: inRange(project.complexity, supplier.min_complexity, supplier.max_complexity),
      label: `Complexité ${project.complexity}/5 (accepte ${rangeLabel(supplier.min_complexity, supplier.max_complexity)})`,
    });
  }

  const match = Boolean(supplier.active) && checks.every((c) => c.ok !== false);
  return { match, checks };
}

module.exports = { evaluate, ACCEPTED_SUPPLIER_REGIONS };
