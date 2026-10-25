// Historique de chaque sous-traitant : taux de réponse, délai de réponse, taux de gain.
const { all } = require('./db');

const RESPONDED = "('quoted', 'declined', 'won', 'lost')";
const QUOTED = "('quoted', 'won', 'lost')";

function supplierStats() {
  const rows = all(`SELECT supplier_id,
      COUNT(*) AS consulted,
      SUM(status IN ${RESPONDED}) AS responded,
      SUM(status IN ${QUOTED}) AS quoted,
      SUM(status = 'won') AS won,
      SUM(status IN ('won', 'lost')) AS decided,
      AVG(CASE WHEN responded_at IS NOT NULL THEN julianday(responded_at) - julianday(sent_at) END) AS avg_days
    FROM consultations GROUP BY supplier_id`);
  return new Map(rows.map((r) => [r.supplier_id, {
    consulted: r.consulted,
    quoted: r.quoted,
    won: r.won,
    responseRate: r.consulted ? Math.round((100 * r.responded) / r.consulted) : null,
    avgDays: r.avg_days == null ? null : Math.round(r.avg_days * 10) / 10,
    // Taux de gain calculé sur les offres dont l'issue est connue.
    winRate: r.decided ? Math.round((100 * r.won) / r.decided) : null,
  }]));
}

function statsLabel(s) {
  if (!s || !s.consulted) return 'jamais consulté';
  return [
    `${s.consulted} consult.`,
    `réponse ${s.responseRate} %`,
    s.avgDays != null ? `en ${s.avgDays} j` : null,
    s.winRate != null ? `gain ${s.winRate} %` : null,
  ].filter(Boolean).join(' · ');
}

module.exports = { supplierStats, statsLabel };
