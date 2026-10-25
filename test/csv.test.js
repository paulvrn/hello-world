const test = require('node:test');
const assert = require('node:assert');
const { parseCsv } = require('../src/csv');

test('lit un CSV « ; » avec guillemets et BOM', () => {
  const rows = parseCsv('company;email;capabilities\r\n"Câblage; Fils";a@b.fr;"dit ""top"""\r\n\r\n');
  assert.deepEqual(rows, [{ company: 'Câblage; Fils', email: 'a@b.fr', capabilities: 'dit "top"' }]);
});

test('détecte le séparateur virgule', () => {
  assert.deepEqual(parseCsv('company,email\nX,x@y.fr'), [{ company: 'X', email: 'x@y.fr' }]);
});
