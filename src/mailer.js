const nodemailer = require('nodemailer');
const { run } = require('./db');

// Sans SMTP_URL, les e-mails ne partent pas : ils sont journalisés et consultables dans /admin/emails.
const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
const FROM = process.env.MAIL_FROM || 'Plateforme Câblage <no-reply@example.com>';

async function sendMail({ to, subject, text, attachments }) {
  let status = transport ? 'sent' : 'logged';
  let error = null;
  if (transport) {
    try {
      await transport.sendMail({ from: FROM, to, subject, text, attachments });
    } catch (err) {
      status = 'error';
      error = err.message;
      console.error(`Échec d'envoi à ${to} :`, err.message);
    }
  }
  run('INSERT INTO emails (to_addr, subject, body, status, error) VALUES (?, ?, ?, ?, ?)',
    to, subject, text, status, error);
  return status !== 'error';
}

module.exports = { sendMail };
