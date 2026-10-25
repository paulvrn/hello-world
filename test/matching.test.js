const test = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../src/matching');

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
