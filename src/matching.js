const { REGIONS, MATURITIES, CERTIFICATIONS, listOf } = require('./labels');

// Consultation par vagues : 3 fabricants d'abord, 5 au plus sauf élargissement volontaire.
const WAVE_SIZE = Number(process.env.CONSULT_WAVE_SIZE) || 3;
const MAX_PANEL = Number(process.env.CONSULT_MAX_PANEL) || 5;
// Score minimal (en %) pour être coché d'office.
const MIN_SCORE = 75;

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
 * Retourne { match, score, checks } où chaque check vaut { ok, label } (ok = null : critère non évaluable).
 * match = tous les critères évaluables sont remplis ; score = part (en %) des critères évaluables remplis.
 * Les critères non encore renseignés par l'admin (heures, complexité) ne comptent pas.
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

  const required = listOf(project.certifications_required, CERTIFICATIONS);
  if (required.length) {
    const has = listOf(supplier.certifications, CERTIFICATIONS);
    const missing = required.filter((c) => !has.includes(c));
    checks.push({
      ok: !missing.length,
      label: missing.length ? `Certifications manquantes : ${missing.map((c) => CERTIFICATIONS[c]).join(', ')}`
        : `Certifications : ${required.map((c) => CERTIFICATIONS[c]).join(', ')}`,
    });
  }

  if (project.components_supply === 'supplier' || project.components_supply === 'mixed') {
    checks.push({ ok: Boolean(supplier.sources_components), label: 'Approvisionnement des composants' });
  }

  const evaluable = checks.filter((c) => c.ok !== null);
  const score = evaluable.length ? Math.round((100 * evaluable.filter((c) => c.ok).length) / evaluable.length) : 100;
  const match = Boolean(supplier.active) && checks.every((c) => c.ok !== false);
  return { match, score: supplier.active ? score : 0, checks };
}

/**
 * Sous-traitants cochés d'office pour la prochaine vague : les meilleurs scores (≥ MIN_SCORE),
 * dans la limite de la vague et du panel maximal. `candidates` porte déjà le résultat de evaluate().
 */
function preselect(candidates, alreadyConsulted = 0) {
  const room = Math.max(0, Math.min(WAVE_SIZE, MAX_PANEL - alreadyConsulted));
  return candidates
    .filter((s) => s.active && s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || (b.stats?.winRate ?? 0) - (a.stats?.winRate ?? 0))
    .slice(0, room)
    .map((s) => s.id);
}

module.exports = { evaluate, preselect, ACCEPTED_SUPPLIER_REGIONS, WAVE_SIZE, MAX_PANEL, MIN_SCORE };
