// Trava em memória: um pg_dump por vez no processo.
// O backup automático (backupService) e o download do Luke (analytics)
// compartilham a mesma trava — dois dumps ao mesmo tempo pesam no Postgres.
// Some com o processo. Não é um lock no banco.

let holder = null;

function tentar(quem) {
    if (holder) return false;
    holder = quem;
    return true;
}

function liberar(quem) {
    if (holder === quem) holder = null;
}

function holderAtual() {
    return holder;
}

module.exports = { tentar, liberar, holderAtual };
