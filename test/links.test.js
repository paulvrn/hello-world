const test = require('node:test');
const assert = require('node:assert');
const { signedFileQuery, verifyFileLink, consultationExpired } = require('../src/links');

const parse = (q) => Object.fromEntries(new URLSearchParams(q));

test('un lien de fichier signé est valable pour ce fichier et cette consultation uniquement', () => {
  const { exp, sig } = parse(signedFileQuery(7, 3));
  assert.equal(verifyFileLink(7, 3, exp, sig), true);
  assert.equal(verifyFileLink(7, 4, exp, sig), false);
  assert.equal(verifyFileLink(8, 3, exp, sig), false);
  assert.equal(verifyFileLink(7, 3, exp, 'x' + sig.slice(1)), false);
});

test('un lien signé expire', () => {
  const { exp, sig } = parse(signedFileQuery(7, 3, Date.now() - 2 * 3600 * 1000));
  assert.equal(verifyFileLink(7, 3, exp, sig), false);
});

test('une consultation expire après la durée prévue', () => {
  assert.equal(consultationExpired({ sent_at: new Date().toISOString().slice(0, 19).replace('T', ' ') }), false);
  assert.equal(consultationExpired({ sent_at: '2020-01-01 00:00:00' }), true);
});
