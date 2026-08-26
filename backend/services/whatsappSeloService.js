// ─────────────────────────────────────────────────────────────────────────────
// Selo do WhatsApp do cliente pelo USO REAL
//
// Não adianta o vendedor jurar que o número está certo: o que prova é a fila de
// envios do bot (`bot_whatsapp_envios`). Se já saiu mensagem para aquele número,
// ele está EM USO. Se o bot recusou POR CAUSA DO NÚMERO, está COM PROBLEMA.
//
// ── DUAS ARMADILHAS que este arquivo existe para não cair ────────────────────
//
// 1) `bot_whatsapp_envios.telefone` é gravado COM DDI 55 (botWhatsappService
//    normaliza antes de mandar); o cadastro guarda 10-11 dígitos SEM o 55.
//    Um `WHERE telefone = Telefone_Celular` NUNCA casa — e o pior: não dá erro
//    nenhum, o selo simplesmente nunca acende. Por isso o casamento é feito por
//    uma CHAVE TOLERANTE (tira o 55 e tira o 9º dígito), a mesma de
//    iaClienteService.chaveTelefone.
//
// 2) `ENVIADO` significa "o BOT aceitou a mensagem", NÃO "o cliente recebeu" —
//    o bot responde 2xx no POST e não existe callback de entrega. Por isso o
//    rótulo honesto é EM_USO ("mensagem já saiu para esse número"). NUNCA
//    escrever "entregue" em lugar nenhum desta funcionalidade.
//
// Roda 1x por dia no scheduler. NÃO calcular por cliente na listagem — a tela
// de clientes carrega ~2000 registros de uma vez.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');

const DIAS_JANELA = 180;

// ── Como um erro vira "problema do número" ───────────────────────────────────
//
// O que CHEGA ao banco em `codigoErro` é o que `botWhatsappService.postEnviar`
// devolve: `corpo?.codigo` do bot, ou `http_<status>` quando o bot não mandou
// código. Atenção: `telefone_invalido` NÃO chega aqui — ele é gerado localmente
// num `return` ANTES do `registrar()`, então nunca vira linha em
// `bot_whatsapp_envios`. Ele fica na lista abaixo só por segurança, para o dia em
// que o bot passar a devolver esse código; sozinho, ele deixaria o selo
// permanentemente em zero (foi o que o revisor pegou).
//
// A regra que realmente acende o selo é a de faixa: um **4xx que não é
// reagendável** é o bot dizendo "esse destinatário não serve" — 401/403/429 e
// afins já estão em CODIGOS_REAGENDAR (falha nossa/passageira) e ficam de fora.
// 5xx nunca conta: é problema do lado de lá.
//
// Enquanto não descobrimos os códigos REAIS que o bot manda, a rota de
// diagnóstico `GET /api/whatsapp-clientes/diag-codigos-erro` lista os
// `codigoErro` distintos com contagem — é por ela que a lista abaixo será
// ajustada com dado de verdade, em vez de palpite.
const { CODIGOS_REAGENDAR } = require('./botWhatsappService');

const CODIGOS_DO_NUMERO = [
    'telefone_invalido',
    'numero_invalido',
    'numero_sem_whatsapp',
    'telefone_sem_whatsapp',
    'destinatario_invalido',
];

/** O código de erro registrado acusa o NÚMERO do cliente (e não uma falha nossa)? */
const ehProblemaDoNumero = (codigo) => {
    if (!codigo) return false;
    if (Array.isArray(CODIGOS_REAGENDAR) && CODIGOS_REAGENDAR.includes(codigo)) return false; // falha passageira/nossa
    if (codigo === 'rede' || codigo === 'timeout') return false;
    if (codigo === 'texto_longo' || codigo === 'texto_vazio') return false;                   // erro da mensagem, não do número
    if (CODIGOS_DO_NUMERO.includes(codigo)) return true;
    const m = /^http_(\d{3})$/.exec(codigo);
    if (m) {
        const s = Number(m[1]);
        // 4xx sem código do bot: o destinatário foi recusado. Exceto os status que são
        // notoriamente NOSSOS ou passageiros:
        //   400 payload malformado (campo errado que NÓS mandamos)
        //   401 chave errada · 403 modo de emergência/janela · 408 tempo esgotado
        //   404 rota do bot mudou de lugar (o /enviar deixou de existir onde procuramos)
        //   409 conflito · 413 payload grande · 429 teto de envios
        // 400 e 404 são os mais perigosos: numa troca de rota ou num campo errado, TODO
        // cliente com envio falho na janela viraria "Número com problema" de uma vez —
        // culpando o cliente por defeito nosso e mandando o escritório ligar para gente
        // cujo número está certo. 5xx é sempre problema do lado de lá e nunca conta.
        const NOSSOS = [400, 401, 403, 404, 408, 409, 413, 429];
        return s >= 400 && s < 500 && !NOSSOS.includes(s);
    }
    return false;
};

const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

/** Chave tolerante: sem DDI 55 e sem o 9º dígito (cópia de iaClienteService). */
function chaveTelefone(raw) {
    let d = soDigitos(raw);
    if (!d) return '';
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
    return d;
}

/**
 * Recalcula o selo de todos os clientes ativos.
 * Retorna { avaliados, emUso, comProblema, limpos, gravados }.
 */
const recalcular = async () => {
    const desde = new Date(Date.now() - DIAS_JANELA * 24 * 60 * 60 * 1000);

    const clientes = await prisma.cliente.findMany({
        where: { Ativo: true },
        select: {
            UUID: true,
            Telefone_Celular: true,
            recebeAvisoPedido: true,
            whatsappStatus: { select: { selo: true } },
        },
    });

    const envios = await prisma.botWhatsappEnvio.findMany({
        where: { createdAt: { gte: desde } },
        select: { telefone: true, status: true, codigoErro: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });

    // chave tolerante → { ok: bool, erroNumero: {codigo, em} | null }
    const porChave = new Map();
    for (const e of envios) {
        const k = chaveTelefone(e.telefone);
        if (!k) continue;
        if (!porChave.has(k)) porChave.set(k, { ok: false, erroNumero: null });
        const reg = porChave.get(k);
        if (e.status === 'ENVIADO' || e.status === 'DUPLICADO') {
            reg.ok = true;
        } else if (e.status === 'ERRO' && ehProblemaDoNumero(e.codigoErro)) {
            reg.erroNumero = { codigo: e.codigoErro, em: e.createdAt };
        }
    }

    let emUso = 0, comProblema = 0, limpos = 0, gravados = 0;

    for (const c of clientes) {
        const k = chaveTelefone(c.Telefone_Celular);
        const reg = k ? porChave.get(k) : null;

        let selo = null;
        let motivo = null;
        if (reg?.ok) {
            selo = 'EM_USO';
            motivo = `Mensagem já saiu para esse número nos últimos ${DIAS_JANELA} dias`;
        } else if (reg?.erroNumero && c.recebeAvisoPedido !== false) {
            // Cliente que optou por não receber aviso não gera envio de pedido —
            // não dá para acusar o número dele com base na ausência/erro de envio.
            selo = 'COM_PROBLEMA';
            motivo = `O bot recusou o envio por causa do número (${reg.erroNumero.codigo})`;
        }

        if (selo === 'EM_USO') emUso++;
        else if (selo === 'COM_PROBLEMA') comProblema++;
        else limpos++;

        const seloAtual = c.whatsappStatus?.selo ?? null;
        if (seloAtual === selo) continue;           // nada mudou — não escreve à toa
        if (selo === null && !c.whatsappStatus) continue; // nunca teve registro: não criar linha vazia

        const dados = { selo, seloMotivo: motivo, seloEm: selo ? new Date() : null };
        try {
            await prisma.clienteWhatsappStatus.upsert({
                where: { clienteUuid: c.UUID },
                update: dados,
                create: { clienteUuid: c.UUID, ...dados },
            });
            gravados++;
        } catch (e) {
            console.error(`[WhatsappSelo] falha ao gravar selo de ${c.UUID}:`, e.message);
        }
    }

    console.log(`[WhatsappSelo] ${clientes.length} clientes · em uso ${emUso} · com problema ${comProblema} · ${gravados} atualizados`);
    return { avaliados: clientes.length, emUso, comProblema, limpos, gravados };
};

/**
 * Diagnóstico: quais `codigoErro` o bot REALMENTE grava, com contagem.
 * Existe porque a lista de códigos "do número" foi escrita sem dado real — é por
 * aqui que ela vai ser ajustada com o que aparece em produção. Somente leitura.
 */
const diagnosticoCodigos = async ({ dias = DIAS_JANELA } = {}) => {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const linhas = await prisma.botWhatsappEnvio.groupBy({
        by: ['codigoErro', 'status'],
        where: { createdAt: { gte: desde } },
        _count: { _all: true },
    });
    const codigos = linhas
        .map(l => ({
            codigoErro: l.codigoErro,
            status: l.status,
            quantidade: l._count._all,
            contaComoProblemaDoNumero: l.status === 'ERRO' && ehProblemaDoNumero(l.codigoErro),
        }))
        .sort((a, b) => b.quantidade - a.quantidade);
    return {
        janelaDias: dias,
        total: codigos.reduce((s, c) => s + c.quantidade, 0),
        codigos,
        listaFixaDoNumero: CODIGOS_DO_NUMERO,
        observacao: 'contaComoProblemaDoNumero=true é o que acende o selo "Com problema". Se a coluna vier toda false com erros reais na lista, a regra precisa dos códigos que aparecem aqui.',
    };
};

// Trava simples de concorrência: a varredura roda em série sobre todos os clientes
// ativos. Dois cliques no botão da tela (ou botão + job da madrugada) rodando junto
// só duplicariam escrita no banco compartilhado sem mudar o resultado.
let _rodando = null;
const recalcularComTrava = async () => {
    if (_rodando) return _rodando;
    _rodando = (async () => {
        try { return await recalcular(); }
        finally { _rodando = null; }
    })();
    return _rodando;
};
const estaRodando = () => !!_rodando;

module.exports = {
    recalcular,
    recalcularComTrava,
    estaRodando,
    diagnosticoCodigos,
    ehProblemaDoNumero,
    chaveTelefone,
    DIAS_JANELA,
    CODIGOS_DO_NUMERO,
};
