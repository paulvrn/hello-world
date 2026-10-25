// Liens de téléchargement signés et à durée limitée pour les documents transmis aux sous-traitants :
// un lien copié ou transféré cesse de fonctionner après FILE_LINK_TTL_MINUTES.
const crypto = require('node:crypto');

const SECRET = process.env.FILE_LINK_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TTL_MS = (Number(process.env.FILE_LINK_TTL_MINUTES) || 60) * 60 * 1000;
// Au-delà, la consultation n'est plus accessible (documents et réponse).
const CONSULTATION_TTL_DAYS = Number(process.env.CONSULTATION_TTL_DAYS) || 60;

function sign(...parts) {
  return crypto.createHmac('sha256', SECRET).update(parts.join(':')).digest('base64url');
}

function signedFileQuery(consultationId, fileId, now = Date.now()) {
  const exp = now + TTL_MS;
  return `exp=${exp}&sig=${sign(consultationId, fileId, exp)}`;
}

function verifyFileLink(consultationId, fileId, exp, sig, now = Date.now()) {
  if (!exp || !sig || Number(exp) < now) return false;
  const expected = Buffer.from(sign(consultationId, fileId, exp));
  const given = Buffer.from(String(sig));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function consultationExpired(consultation, now = Date.now()) {
  const sent = new Date(consultation.sent_at.replace(' ', 'T') + 'Z').getTime();
  return now - sent > CONSULTATION_TTL_DAYS * 24 * 3600 * 1000;
}

module.exports = { signedFileQuery, verifyFileLink, consultationExpired, CONSULTATION_TTL_DAYS };
