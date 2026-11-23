// Trava "carga já separada": depois que a Separação de Carga (câmara fria) foi CONCLUÍDA,
// não entra mais pedido nessa carga (ele nunca seria separado e a contagem ficaria errada).
// Regra do dono (23/11/2026): quem precisa incluir mais um pedido cria uma NOVA carga.
//
// Só leitura (Prisma), sem transação. `client` pode ser o prisma ou um `tx` de dentro de $transaction.
// Separação apenas INICIADA (sem conclusão) NÃO trava — a Separação já mostra "a carga mudou".
// Remover pedido, editar data/motorista, cancelar, conferir e entregar NÃO usam esta trava.
const prisma = require('../config/database');

const CODIGO = 'CARGA_JA_SEPARADA';
const MENSAGEM = 'Esta carga já foi separada na câmara fria, então não dá mais para incluir pedidos nela. Crie uma nova carga para este pedido.';

// Devolve { embarqueId, numero } se a carga tem separação concluída; senão null.
async function cargaJaSeparada(embarqueId, client = prisma) {
    if (!embarqueId) return null;
    const c = await client.separacaoCargaConclusao.findFirst({
        where: { separacao: { embarqueId } },
        select: { id: true },
    });
    if (!c) return null;
    const emb = await client.embarque.findUnique({ where: { id: embarqueId }, select: { numero: true } });
    return { embarqueId, numero: emb?.numero ?? null };
}

// Dentre as cargas dadas, as que já foram separadas → Map(embarqueId → { embarqueId, numero })
async function cargasJaSeparadas(embarqueIds, client = prisma) {
    const ids = [...new Set((embarqueIds || []).filter(Boolean))];
    const out = new Map();
    for (const id of ids) {
        const r = await cargaJaSeparada(id, client);
        if (r) out.set(id, r);
    }
    return out;
}

// Corpo padrão da resposta 409.
function corpoErro({ embarqueId, numero }) {
    return { error: MENSAGEM, codigo: CODIGO, embarqueId, numero };
}

module.exports = { cargaJaSeparada, cargasJaSeparadas, corpoErro, CODIGO, MENSAGEM };
