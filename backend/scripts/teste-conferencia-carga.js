/**
 * CENÁRIO DE TESTE LOCAL da conferência de carga por bipagem (Fase 1).
 *
 * ⚠️ SÓ RODA NO BANCO LOCAL (`hardt_local`). Ele ESCREVE em pedidos/amostras reais da
 * cópia local para montar o cenário — NUNCA apontar para produção.
 *
 * Monta, de forma idempotente (limpa a execução anterior antes):
 *   - uma carga de teste com: 1 pedido comum com NF-e AUTORIZADA de produção,
 *     1 especial ZZ#777777 e 1 amostra AM#777777 (mesmo número de propósito — prova
 *     que numerações diferentes não se confundem);
 *   - uma nota de HOMOLOGAÇÃO com a MESMA chave apontando para outro pedido (prova
 *     que o filtro `ambiente: 'producao'` está valendo);
 *   - 1 pedido livre (FORA_DA_CARGA) e 1 pedido em outra carga (EM_OUTRA_CARGA).
 *
 * Uso:  JWT_SECRET=<segredo local> node scripts/teste-conferencia-carga.js
 * Imprime os ids e um token JWT válido por 2h para usar no curl.
 */
// ⛔ TRAVA DE RUNTIME — este script ESCREVE em pedidos e amostras reais (renumera para
// 777777, marca especial, troca de carga, apaga notas e embarques). Rodado por engano
// contra produção, ele estraga pedidos faturados de verdade. O comentário do cabeçalho
// não basta: o processo aborta AQUI, antes de abrir conexão e antes de qualquer escrita.
require('dotenv').config(); // o `.env` é quem define a DATABASE_URL local (index.js faz o mesmo)
const URL_BANCO = process.env.DATABASE_URL || '';
if (!URL_BANCO.includes('hardt_local')) {
    console.error('⛔ ABORTADO: este script só roda no banco LOCAL `hardt_local`.');
    console.error('   DATABASE_URL atual: ' + (URL_BANCO ? URL_BANCO.replace(/:\/\/[^@]*@/, '://***@') : '(vazia)'));
    console.error('   Ele reescreve pedidos e amostras REAIS — nunca aponte para produção.');
    process.exit(1);
}

const prisma = require('../config/database');
const { calcularDV } = require('../utils/chaveNfe');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../config/jwtSecret');

const N = 777777; // ZZ#777777 e AM#777777 vão COEXISTIR de propósito

function chaveValida(base43) { return base43 + String(calcularDV(base43)); }

// Chaves sintéticas com DV calculado de verdade (o parser recusa DV errado).
const CHAVE       = chaveValida('4126081234567800019755001000012345100012345'); // nota do pedido da carga
const CHAVE_LIVRE = chaveValida('4126081234567800019755001000091900012345678'); // pedido fora de carga
const CHAVE_OUTRA = chaveValida('4126081234567800019755001000091800012345678'); // pedido em outra carga

// Zera a conferência (mesmos 4 campos de conferenciaCargaService.RESET_CONFERENCIA).
const RESET = { cargaConferidaEm: null, cargaConferidaPorId: null, cargaConferidaPorNome: null, cargaConferidaOrigem: null };

(async () => {
    const admin = (await prisma.vendedor.findMany({ where: { ativo: true }, select: { id: true, nome: true, permissoes: true } }))
        .find(v => { const p = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {}); return p.admin || p.Pode_Acessar_Embarque; });
    if (!admin) throw new Error('Nenhum vendedor ativo com permissão de embarque no banco local.');

    // ── LIMPEZA da execução anterior ───────────────────────────────────────────
    // Idempotência: o script pode rodar quantas vezes for preciso e sempre monta o
    // MESMO cenário limpo. Sem isto, a 2ª execução criava um SEGUNDO ZZ#777777 e
    // deixava marcas de conferência velhas (os itens já nasciam "verdes").
    await prisma.notaFiscalApp.deleteMany({ where: { ref: { startsWith: 'teste-conf-' } } });
    const velhos = await prisma.embarque.findMany({ where: { versoes: { some: { acao: 'TESTE_CONFERENCIA' } } }, select: { id: true } });
    for (const e of velhos) {
        await prisma.pedido.updateMany({ where: { embarqueId: e.id }, data: { embarqueId: null, ...RESET } });
        await prisma.amostra.updateMany({ where: { embarqueId: e.id }, data: { embarqueId: null, ...RESET } });
        await prisma.embarqueVersaoLog.deleteMany({ where: { embarqueId: e.id } });
        await prisma.embarque.delete({ where: { id: e.id } });
    }
    // Solta também o que ficou marcado fora das cargas de teste (ex.: item movido no meio do teste).
    await prisma.pedido.updateMany({ where: { nfeChave: { in: [CHAVE, CHAVE_LIVRE, CHAVE_OUTRA] } }, data: { ...RESET } });
    await prisma.amostra.updateMany({ where: { numero: N }, data: { ...RESET } });

    // ── Elenco fixo do cenário ────────────────────────────────────────────────
    // REUSA o especial de teste se ele já existe (é o que impede criar um 2º ZZ#777777).
    let pEsp = await prisma.pedido.findFirst({ where: { numero: N, especial: true }, orderBy: { createdAt: 'asc' } });
    const usados = pEsp ? [pEsp.id] : [];
    const proximo = async () => {
        const p = await prisma.pedido.findFirst({
            where: {
                id: { notIn: usados }, cancelado: false, devolucaoFinalizada: false,
                especial: false, bonificacao: false, numero: { not: null }
            },
            orderBy: { createdAt: 'desc' }
        });
        if (!p) throw new Error('Faltam pedidos comuns no banco local para montar o cenário.');
        usados.push(p.id);
        return p;
    };

    const p1 = await proximo();          // pedido comum da carga, com NF-e autorizada
    if (!pEsp) pEsp = await proximo();   // vira o especial ZZ#777777
    const pLivre = await proximo();      // fora de qualquer carga → FORA_DA_CARGA
    const pOutra = await proximo();      // em outra carga → EM_OUTRA_CARGA
    const pExtra = await proximo();      // dono da nota de HOMOLOGAÇÃO (não pode ser conferido)

    const carga = await prisma.embarque.create({ data: { dataSaida: new Date(), responsavelId: admin.id } });
    const outra = await prisma.embarque.create({ data: { dataSaida: new Date(), responsavelId: admin.id } });
    for (const e of [carga, outra]) {
        await prisma.embarqueVersaoLog.create({ data: { embarqueId: e.id, versao: 1, acao: 'TESTE_CONFERENCIA', alteracoes: {} } });
    }

    // P1: pedido da carga com NF-e AUTORIZADA de produção (bipe pela chave)
    await prisma.pedido.update({ where: { id: p1.id }, data: { embarqueId: carga.id, situacaoCA: 'FATURADO', nfeChave: null, ...RESET } });
    await prisma.notaFiscalApp.create({ data: { ref: 'teste-conf-1', ambiente: 'producao', tipo: 'VENDA', status: 'AUTORIZADO', numero: 12345, serie: 1, chave: CHAVE, pedidoId: p1.id } });
    // Nota de HOMOLOGAÇÃO com a MESMA chave apontando para OUTRO pedido: se o filtro
    // `ambiente: 'producao'` cair, o bipe passa a conferir o pedido errado.
    await prisma.notaFiscalApp.create({ data: { ref: 'teste-conf-homolog', ambiente: 'homologacao', tipo: 'VENDA', status: 'AUTORIZADO', numero: 12345, serie: 1, chave: CHAVE, pedidoId: pExtra.id } });

    // ZZ#777777 na carga
    await prisma.pedido.update({ where: { id: pEsp.id }, data: { embarqueId: carga.id, especial: true, bonificacao: false, numero: N, statusEnvio: 'RECEBIDO', situacaoCA: 'FATURADO', nfeChave: null, ...RESET } });

    // AM#777777 na carga — MESMO número do especial, de propósito.
    // REUSA a amostra de teste se ela já existe, pelo mesmo motivo do ZZ acima:
    // `Amostra.numero` NÃO é @unique, então pegar sempre "a mais recente" faria a 2ª
    // execução renumerar OUTRA amostra e deixar DUAS AM#777777 no banco. Aí o
    // `resolverItem` (orderBy createdAt asc) escolheria a antiga, fora da carga, e o
    // cenário passaria a devolver FORA_DA_CARGA no AM — teste falhando sem defeito no
    // código de produção.
    const am = await prisma.amostra.findFirst({ where: { numero: N }, orderBy: { createdAt: 'asc' } })
        || await prisma.amostra.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!am) throw new Error('Não há amostra no banco local para montar o cenário.');
    await prisma.amostra.update({ where: { id: am.id }, data: { embarqueId: carga.id, numero: N, status: 'LIBERADO', ...RESET } });

    // Pedido LIVRE, apto a entrar (bipável pela chave da nota do CA)
    await prisma.pedido.update({ where: { id: pLivre.id }, data: { embarqueId: null, situacaoCA: 'FATURADO', statusEnvio: 'RECEBIDO', nfeChave: CHAVE_LIVRE, ...RESET } });
    // Pedido em OUTRA carga
    await prisma.pedido.update({ where: { id: pOutra.id }, data: { embarqueId: outra.id, situacaoCA: 'FATURADO', nfeChave: CHAVE_OUTRA, ...RESET } });

    const token = jwt.sign({ id: admin.id, login: 'teste', nome: admin.nome, permissoes: { admin: true } }, JWT_SECRET, { expiresIn: '2h' });
    console.log(JSON.stringify({
        cargaId: carga.id, outraCargaId: outra.id,
        CHAVE, CHAVE_LIVRE, CHAVE_OUTRA,
        p1: p1.id, p1numero: p1.numero, especialId: pEsp.id, especialNumero: N,
        amostraId: am.id, amostraNumero: N,
        pLivreId: pLivre.id, pLivreNumero: pLivre.numero,
        pOutraId: pOutra.id, pOutraNumero: pOutra.numero,
        pExtraId: pExtra.id, admin: admin.nome, token
    }, null, 2));
    await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
