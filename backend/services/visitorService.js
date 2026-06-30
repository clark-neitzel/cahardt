// Rastreio anônimo de visitantes nos sites públicos.
// Armazena em memória — sem banco, sem dados pessoais.
// Sessão expira se não pingar por 90 s (2 pings perdidos).

const sessions = new Map(); // sessionId → { pagina, temCarrinho, lastSeen }
const TIMEOUT_MS = 90_000;

function ping(sessionId, pagina, temCarrinho) {
  sessions.set(sessionId, { pagina, temCarrinho: !!temCarrinho, lastSeen: Date.now() });
}

function getStats() {
  const now = Date.now();
  const stats = { total: 0, inicio: 0, congelados: 0, kitFesta: 0, comCarrinho: 0 };
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > TIMEOUT_MS) { sessions.delete(id); continue; }
    stats.total++;
    if (s.pagina === 'inicio')      stats.inicio++;
    if (s.pagina === 'congelados')  stats.congelados++;
    if (s.pagina === 'kit-festa')   stats.kitFesta++;
    if (s.temCarrinho)              stats.comCarrinho++;
  }
  return stats;
}

// Limpeza a cada 5 min para não acumular memória
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastSeen > TIMEOUT_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000);

module.exports = { ping, getStats };
