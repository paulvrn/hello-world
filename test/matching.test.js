const test = require('node:test');
const assert = require('node:assert');
const { evaluate, preselect } = require('../src/matching');

const supplier = {
  active: 1, region: 'france', country: 'France', maturities: 'proto,first_series',
  min_hours: 10, max_hours: 200, min_complexity: 1, max_complexity: 3, min_quantity: 1, max_quantity: 1000,
};
const project = { region: 'europe', maturity: 'first_series', quantity: 50, est_hours: 60, complexity: 3 };

test('un sous-traitant français correspond à une demande « Europe »', () => {
  assert.equal(evaluate(project, supplier).match, true);
});

test('la zone, la maturité, la quantité, les heures et la complexité sont bloquantes', () => {
  assert.equal(evaluate({ ...project, region: 'usa' }, supplier).match, false);
  assert.equal(evaluate({ ...project, maturity: 'mature' }, supplier).match, false);
  assert.equal(evaluate({ ...project, quantity: 5000 }, supplier).match, false);
  assert.equal(evaluate({ ...project, est_hours: 500 }, supplier).match, false);
  assert.equal(evaluate({ ...project, complexity: 5 }, supplier).match, false);
});

test("heures et complexité non encore évaluées ne bloquent pas la présélection", () => {
  const r = evaluate({ ...project, est_hours: null, complexity: null }, supplier);
  assert.equal(r.match, true);
  assert.equal(r.checks.filter((c) => c.ok === null).length, 2);
});

test('« peu importe » accepte toutes les zones ; un sous-traitant inactif est exclu', () => {
  assert.equal(evaluate({ ...project, region: 'any' }, { ...supplier, region: 'other' }).match, true);
  assert.equal(evaluate(project, { ...supplier, active: 0 }).match, false);
});

test('le score mesure la part des critères évaluables remplis', () => {
  assert.equal(evaluate(project, supplier).score, 100);
  // 1 critère manqué sur 5 → 80 %
  assert.equal(evaluate({ ...project, quantity: 5000 }, supplier).score, 80);
  assert.equal(evaluate(project, { ...supplier, active: 0 }).score, 0);
});

test('certifications exigées et approvisionnement des composants', () => {
  const p = { ...project, certifications_required: 'iso9001,en9100', components_supply: 'supplier' };
  const r = evaluate(p, { ...supplier, certifications: 'iso9001', sources_components: 0 });
  assert.equal(r.match, false);
  assert.ok(r.checks.some((c) => c.ok === false && c.label.includes('EN 9100')));
  assert.equal(evaluate(p, { ...supplier, certifications: 'iso9001,en9100', sources_components: 1 }).match, true);
  // Composants fournis par le client : critère non évalué
  assert.equal(evaluate({ ...p, components_supply: 'customer' }, { ...supplier, certifications: 'iso9001,en9100' }).match, true);
});

test('présélection : les 3 meilleurs scores ≥ 75 %, dans la limite de 5 consultés', () => {
  const c = (id, score) => ({ id, score, active: 1 });
  const candidates = [c(1, 100), c(2, 60), c(3, 80), c(4, 100), c(5, 75), c(6, 90)];
  assert.deepEqual(preselect(candidates, 0), [1, 4, 6]);
  assert.deepEqual(preselect(candidates, 3), [1, 4]);
  assert.deepEqual(preselect(candidates, 5), []);
});
