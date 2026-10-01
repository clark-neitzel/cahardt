/**
 * CONFERÊNCIA DO DINHEIRO DO CAIXA (08/2026)
 *
 * Passo obrigatório ANTES de fechar o caixa: quem recebe o dinheiro do
 * motorista/vendedor conta cédula por cédula na calculadora do app e assina.
 * Só depois disso o responsável consegue fechar — e quem conferiu não é quem
 * fecha (dois pares de olhos no dinheiro).
 *
 * Regras que não podem se perder:
 *  - O dono do caixa NUNCA confere o próprio dinheiro.
 *  - Quem conferiu NÃO fecha o mesmo caixa.
 *  - Diferença (falta ou sobra) dentro da `quebraCaixa` da pessoa fecha sozinha,
 *    sempre com motivo; acima exige senha de quem tem Pode_Autorizar_Diferenca_Caixa.
 *  - Se o valor a prestar mudar depois de conferido, a conferência CAI sozinha
 *    (é o que impede conferir cedo e lançar movimento depois).
 *  - Tudo isso só é EXIGIDO com a chave ligada (`caixaConferenciaConfig`).
 */

const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const cfgConferencia = require('../config/caixaConferenciaConfig');
const {
    diasDoCaixa, intervaloDoCaixa, ehFimDeSemana, dataCaixaDe, fromStr, toStr, hojeStr,
} = require('../utils/diasUteisCaixa');
const { ehResponsavelPelaCobranca } = require('./recebimentoEntregaService');

const PERM_CONFERIR = 'Pode_Conferir_Dinheiro_Caixa';
const PERM_AUTORIZAR_DIF = 'Pode_Autorizar_Diferenca_Caixa';
const PERM_FECHAR = 'Pode_Fechar_Caixa';

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const erro = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };

// ─────────────────────────────────────────────────────────────────────────────
// "Este dia teve ALGUM movimento?" — função pura, fonte única usada pela virada
// do dia (não enfileirar caixa de R$ 0,00 para conferência) e pelo /resumo e
// /fechar (não exigir conferência de dinheiro quando não há dinheiro nenhum).
// adiantamento > 0 também conta como movimento (é dinheiro entregue ao vendedor).
// ─────────────────────────────────────────────────────────────────────────────
const temMovimentoNoDia = ({
    entregasCount = 0, totalDespesas = 0, adiantamento = 0, cobrancasCount = 0, recebimentosTitulos = 0,
} = {}) => (
    Number(entregasCount) > 0
    || Number(totalDespesas) > 0
    || Number(adiantamento) > 0
    || Number(cobrancasCount) > 0
    || Number(recebimentosTitulos) > 0
);

// Cobrança em Rota que realmente virou dinheiro no caixa — MESMO critério usado
// para somar `cobrancasRotaDinheiro` (status cobrado/baixado + forma "dinheiro" +
// valor > 0). NAO_COBRADA, PENDENTE ou valor 0 não é movimento: ninguém recebeu
// nada. Fonte única — usada aqui e em routes/caixa.js (GET /resumo) para o mesmo
// critério de "este dia teve dinheiro de cobrança de rota?".
const cobrancaRotaTemDinheiro = (c) => ['COBRADA', 'BAIXADA'].includes(c?.status)
    && (c?.formaPagamentoNome || '').toLowerCase().includes('dinheiro')
    && Number(c?.valorCobrado || 0) > 0;

const permsDe = (vendedor) => {
    const p = vendedor?.permissoes;
    return typeof p === 'string' ? JSON.parse(p) : (p || {});
};

const podeConferir = (perms) => !!(perms.admin || perms[PERM_CONFERIR]);
const podeAutorizarDiferenca = (perms) => !!(perms.admin || perms[PERM_AUTORIZAR_DIF]);
const podeFechar = (perms) => !!(perms.admin || perms.Pode_Editar_Caixa || perms[PERM_FECHAR]);

// ─────────────────────────────────────────────────────────────────────────────
// VALOR A PRESTAR — mesma fórmula do /resumo e do /fechar (adiantamento +
// recebido em espécie + faltas de devolução + cobranças de rota em dinheiro +
// títulos baixados neste caixa − despesas). Qualquer mudança aqui tem que ser
// espelhada nos dois pontos de caixa.js, senão a conferência acusa "valor mudou".
// ─────────────────────────────────────────────────────────────────────────────
const calcularValorAPrestar = async (vendedorId, data, cfg = null) => {
    const conf = cfg || await cfgConferencia.get();
    const dias = diasDoCaixa(data, conf.soDiasUteis);
    const { inicio, fim } = intervaloDoCaixa(data, conf.soDiasUteis);

    const [caixa, despesas, entregas, todasCondicoes, cobrancas] = await Promise.all([
        prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId, dataReferencia: data } },
            include: { conferenciaDevolucao: true },
        }),
        prisma.despesa.findMany({ where: { vendedorId, dataReferencia: { in: dias } }, select: { valor: true } }),
        prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: inicio, lte: fim },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                embarque: { responsavelId: vendedorId },
            },
            select: {
                id: true, statusEntrega: true, opcaoCondicaoPagamento: true,
                pagamentosReais: { where: { valor: { gt: 0 } } },
                itensDevolvidos: { select: { id: true } },
            },
        }),
        prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { opcaoCondicao: true, nomeCondicao: true, debitaCaixa: true },
        }),
        prisma.cobrancaRota.findMany({
            where: { cobradoPorId: vendedorId, dataReferencia: { in: dias } },
            select: { status: true, valorCobrado: true, formaPagamentoNome: true },
        }),
    ]);

    const totalDespesas = round2(despesas.reduce((s, d) => s + Number(d.valor), 0));

    const mapaPorNome = Object.fromEntries(todasCondicoes.map(t => [t.nomeCondicao, t.debitaCaixa]));
    const mapaPorOpcao = {};
    for (const t of todasCondicoes) {
        if (mapaPorOpcao[t.opcaoCondicao] === undefined) mapaPorOpcao[t.opcaoCondicao] = t.debitaCaixa;
    }

    let totalRecebidoCaixa = 0;
    let totalRecebidoOutros = 0;
    entregas.forEach(e => {
        if (e.statusEntrega === 'DEVOLVIDO') return; // mercadoria voltou, não recebeu dinheiro
        e.pagamentosReais.forEach(p => {
            const val = Number(p.valor);
            let debita;
            if (p.formaPagamentoNome === 'PIX Asaas' && p.cobrancaAsaasId) debita = false;
            // responsável (escritório OU vendedor) fica devendo — não presta no dia
            // (decisão do dono, 08/2026; critério único em recebimentoEntregaService)
            else if (ehResponsavelPelaCobranca(p)) debita = false;
            else if (mapaPorNome[p.formaPagamentoNome] !== undefined) debita = mapaPorNome[p.formaPagamentoNome];
            else debita = mapaPorOpcao[e.opcaoCondicaoPagamento] || false;
            if (debita) totalRecebidoCaixa += val; else totalRecebidoOutros += val;
        });
    });

    const faltasDevolucao = caixa?.conferenciaDevolucao?.status === 'CONFERIDA'
        ? round2(caixa.conferenciaDevolucao.totalCobrado) : 0;

    const cobrancasComDinheiro = cobrancas.filter(cobrancaRotaTemDinheiro);
    const cobrancasRotaDinheiro = round2(cobrancasComDinheiro.reduce((s, c) => s + Number(c.valorCobrado || 0), 0));

    const recebimentosTitulos = caixa
        ? round2((await prisma.pagamentoParcela.aggregate({
            where: { caixaDiarioId: caixa.id, estornado: false },
            _sum: { valorRecebido: true },
        }))._sum.valorRecebido || 0)
        : 0;

    const adiantamento = round2(caixa?.adiantamento || 0);
    const valorAPrestar = round2(
        adiantamento + round2(totalRecebidoCaixa) + faltasDevolucao + cobrancasRotaDinheiro + recebimentosTitulos - totalDespesas
    );

    // Devolução pendente de conferência (mercadoria voltou e ainda não foi contada
    // na tela de devolução) — usado pelo estadoDoCaixa para o selo DEVOLUCAO_PENDENTE.
    const temDevolucoesDia = entregas.some(e => (e.itensDevolvidos?.length || 0) > 0 || e.statusEntrega === 'DEVOLVIDO');
    const devolucaoPendente = temDevolucoesDia && caixa?.conferenciaDevolucao?.status !== 'CONFERIDA';

    return {
        caixa,
        dias,
        valorAPrestar,
        adiantamento,
        totalDespesas,
        totalRecebidoCaixa: round2(totalRecebidoCaixa),
        totalRecebidoOutros: round2(totalRecebidoOutros),
        faltasDevolucao,
        cobrancasRotaDinheiro,
        recebimentosTitulos,
        entregasCount: entregas.length,
        temDevolucoesDia,
        devolucaoPendente,
        temMovimento: temMovimentoNoDia({
            entregasCount: entregas.length, totalDespesas, adiantamento,
            cobrancasCount: cobrancasComDinheiro.length, recebimentosTitulos,
        }),
    };
};

/** A conferência assinada ainda vale para o valor atual? */
const conferenciaDesatualizada = (caixa, valorAtual) => {
    if (!caixa?.dinheiroConferido) return false;
    if (caixa.valorEsperadoConferencia == null) return false;
    return Math.abs(round2(caixa.valorEsperadoConferencia) - round2(valorAtual)) > 0.009;
};

/**
 * Estado do caixa para a tela e para as filas.
 * ABERTO → DEVOLUCAO_PENDENTE → A_CONFERIR → A_FECHAR → FECHADO/CONFERIDO
 * (+ DESATUALIZADO quando o valor mudou).
 */
const estadoDoCaixa = (caixa, valorAtual, { devolucaoPendente = false } = {}) => {
    if (!caixa) return 'ABERTO';
    if (caixa.status === 'CONFERIDO') return 'CONFERIDO';
    if (caixa.status === 'FECHADO') return 'FECHADO';
    if (caixa.dinheiroConferido) {
        return conferenciaDesatualizada(caixa, valorAtual) ? 'A_CONFERIR' : 'A_FECHAR';
    }
    if (caixa.enviadoConferenciaEm) return 'A_CONFERIR';
    if (devolucaoPendente) return 'DEVOLUCAO_PENDENTE';
    return 'ABERTO';
};

// ─────────────────────────────────────────────────────────────────────────────
// Envio para conferência (impressão da folha, virada do dia ou botão manual)
// ─────────────────────────────────────────────────────────────────────────────
const enviarParaConferencia = async ({ vendedorId, data, usuario, origem = 'MANUAL' }) => {
    const caixa = await prisma.caixaDiario.upsert({
        where: { vendedorId_dataReferencia: { vendedorId, dataReferencia: data } },
        update: {},
        create: { vendedorId, dataReferencia: data },
    });

    if (caixa.status !== 'ABERTO') return { ok: false, motivo: 'caixa_nao_aberto', caixa };
    if (caixa.enviadoConferenciaEm) return { ok: true, jaEnviado: true, caixa }; // idempotente

    // Caixa sem NENHUM movimento no dia (sem entrega, despesa, adiantamento ou
    // cobrança) não entra na fila de conferência — não há dinheiro nenhum para
    // alguém contar. Mesmo critério (temMovimentoNoDia, via calcularValorAPrestar)
    // usado pela virada do dia e pelo /fechar. A impressão/botão seguem normais —
    // só não enfileira; `enviado:false`+`motivo` avisa o chamador sem ser erro
    // (formato de resposta antigo preservado; isto só ACRESCENTA o campo nesta
    // situação nova — front antigo em cache no PWA não lê esses campos e não quebra).
    const calc = await calcularValorAPrestar(vendedorId, data);
    if (!calc.temMovimento) {
        return { ok: true, enviado: false, motivo: 'SEM_MOVIMENTO', caixa };
    }

    const atualizado = await prisma.caixaDiario.update({
        where: { id: caixa.id },
        data: {
            enviadoConferenciaEm: new Date(),
            enviadoConferenciaPorId: usuario?.id || null,
            enviadoConferenciaPorNome: usuario?.nome || null,
            enviadoConferenciaOrigem: origem,
        },
    });
    return { ok: true, caixa: atualizado };
};

// ─────────────────────────────────────────────────────────────────────────────
// Conferência do dinheiro
// ─────────────────────────────────────────────────────────────────────────────
const VALORES_CEDULA = [200, 100, 50, 20, 10, 5, 2];
const VALORES_MOEDA = [1, 0.5, 0.25, 0.1, 0.05];

/** Soma a contagem física digitada. Campo vazio/ausente = zero. */
const somarContagem = (contagem) => {
    if (!contagem || typeof contagem !== 'object') return { total: 0, pecas: 0 };
    let total = 0;
    let pecas = 0;
    for (const v of VALORES_CEDULA) {
        const q = Math.max(0, Math.floor(Number(contagem.cedulas?.[String(v)] || 0)));
        total += q * v; pecas += q;
    }
    for (const v of VALORES_MOEDA) {
        const q = Math.max(0, Math.floor(Number(contagem.moedas?.[String(v)] || 0)));
        total += q * v; pecas += q;
    }
    for (const o of (Array.isArray(contagem.outros) ? contagem.outros : [])) {
        total += Number(o?.valor || 0);
    }
    return { total: round2(total), pecas };
};

const conferirDinheiro = async ({
    vendedorId, data, usuario, perms,
    contagem, valorContadoManual, observacao,
    motivoDiferenca, autorizadorId, autorizadorSenha,
}) => {
    if (!podeConferir(perms)) throw erro('Sem permissão para conferir o dinheiro do caixa.', 403);
    if (vendedorId === usuario.id && !perms.admin) {
        throw erro('Você não pode conferir o dinheiro do próprio caixa. Peça para outra pessoa conferir.', 403);
    }

    const calc = await calcularValorAPrestar(vendedorId, data);
    const caixa = calc.caixa;
    if (!caixa) throw erro('Caixa não encontrado.', 404);
    if (caixa.status !== 'ABERTO') throw erro('Este caixa já está fechado. Reabra antes de conferir.', 400);
    if (caixa.dinheiroConferido && !conferenciaDesatualizada(caixa, calc.valorAPrestar)) {
        throw erro(`Este caixa já foi conferido por ${caixa.dinheiroConferidoPorNome || 'outra pessoa'}.`, 400);
    }

    const esperado = calc.valorAPrestar;
    const { total: totalContado, pecas } = somarContagem(contagem);
    // Caixa de R$ 0,00 (dia sem dinheiro): confirma sem contagem.
    const contado = (contagem == null && valorContadoManual != null)
        ? round2(valorContadoManual)
        : totalContado;
    const diferenca = round2(contado - esperado);

    // ── Quebra de caixa: até quanto ESTA pessoa fecha sozinha ──
    const conferente = await prisma.vendedor.findUnique({
        where: { id: usuario.id },
        select: { nome: true, quebraCaixa: true },
    });
    const quebra = round2(conferente?.quebraCaixa || 0);

    let autorizador = null;
    if (Math.abs(diferenca) > 0.009) {
        if (!motivoDiferenca || !String(motivoDiferenca).trim()) {
            throw erro('Explique a diferença: o motivo é obrigatório quando o dinheiro não bate.', 400);
        }
        if (Math.abs(diferenca) > quebra + 0.009) {
            if (!autorizadorId || !autorizadorSenha) {
                throw erro(
                    `Diferença de R$ ${Math.abs(diferenca).toFixed(2)} passa da sua quebra de caixa (R$ ${quebra.toFixed(2)}). ` +
                    'Peça a senha de quem pode autorizar.',
                    400
                );
            }
            if (autorizadorId === usuario.id) {
                throw erro('Você não pode autorizar a própria diferença.', 403);
            }
            const autz = await prisma.vendedor.findUnique({
                where: { id: autorizadorId },
                select: { id: true, nome: true, senha: true, permissoes: true, ativo: true },
            });
            if (!autz || !autz.ativo) throw erro('Autorizador não encontrado ou inativo.', 400);
            if (!podeAutorizarDiferenca(permsDe(autz))) {
                throw erro(`${autz.nome} não tem permissão para autorizar diferença de caixa.`, 403);
            }
            const senhaOk = autz.senha ? await bcrypt.compare(String(autorizadorSenha), autz.senha) : false;
            if (!senhaOk) throw erro('Senha do autorizador incorreta.', 401);
            autorizador = autz;
        }
    }

    const atualizado = await prisma.caixaDiario.update({
        where: { id: caixa.id },
        data: {
            dinheiroConferido: true,
            dinheiroConferidoPorId: usuario.id,
            dinheiroConferidoPorNome: conferente?.nome || usuario.nome || null,
            dinheiroConferidoEm: new Date(),
            valorEsperadoConferencia: esperado,
            valorContado: contado,
            contagemDinheiro: contagem || null,
            obsConferenciaDinheiro: observacao || null,
            diferencaConferencia: diferenca,
            motivoDiferenca: Math.abs(diferenca) > 0.009 ? String(motivoDiferenca).trim() : null,
            autorizadorDiferencaId: autorizador?.id || null,
            autorizadorDiferencaNome: autorizador?.nome || null,
            quebraAplicada: quebra,
            // Se estava enviado só implicitamente (virada do dia não rodou), carimba agora.
            enviadoConferenciaEm: caixa.enviadoConferenciaEm || new Date(),
            enviadoConferenciaOrigem: caixa.enviadoConferenciaOrigem || 'MANUAL',
        },
    });

    return {
        caixa: atualizado,
        esperado,
        contado,
        diferenca,
        pecas,
        quebra,
        autorizadoPor: autorizador?.nome || null,
    };
};

const desfazerConferencia = async ({ vendedorId, data, usuario, perms, motivo = null }) => {
    const caixa = await prisma.caixaDiario.findUnique({
        where: { vendedorId_dataReferencia: { vendedorId, dataReferencia: data } },
    });
    if (!caixa) throw erro('Caixa não encontrado.', 404);
    if (!caixa.dinheiroConferido) throw erro('Este caixa não está conferido.', 400);
    if (caixa.status !== 'ABERTO') throw erro('Caixa já fechado — reabra o caixa para desfazer a conferência.', 400);
    if (!perms.admin && caixa.dinheiroConferidoPorId !== usuario.id) {
        throw erro('Só quem conferiu (ou o administrador) pode desfazer a conferência.', 403);
    }
    return prisma.caixaDiario.update({
        where: { id: caixa.id },
        data: {
            dinheiroConferido: false,
            dinheiroConferidoPorId: null,
            dinheiroConferidoPorNome: null,
            dinheiroConferidoEm: null,
            valorEsperadoConferencia: null,
            valorContado: null,
            contagemDinheiro: null,
            diferencaConferencia: null,
            motivoDiferenca: motivo || null,
            autorizadorDiferencaId: null,
            autorizadorDiferencaNome: null,
        },
    });
};

/**
 * Diferença no dinheiro → aviso na agenda.
 * O sistema NÃO lança vale nem desconto: o vale é um Contas a Pagar lançado à
 * mão pelo dono, quando ele decidir descontar (decisão de 08/2026). Aqui só
 * criamos o lembrete para a cobrança não se perder.
 */
const sugerirTarefaDiferenca = async ({ caixa, diferenca, criadoPor }) => {
    const cfg = await cfgConferencia.get();
    if (!cfg.tarefaDiferenca) return null;

    const dono = await prisma.vendedor.findUnique({
        where: { id: caixa.vendedorId }, select: { nome: true },
    });
    const falta = diferenca < 0;
    const valorTxt = Math.abs(diferenca).toFixed(2).replace('.', ',');
    const dataBR = String(caixa.dataReferencia).split('-').reverse().join('/');

    // Responsável: quem autorizou a diferença; senão quem conferiu.
    const responsavelId = caixa.autorizadorDiferencaId || caixa.dinheiroConferidoPorId || criadoPor.id;

    // Amanhã, 09:00 (data como texto no fuso local, padrão do módulo Tarefas)
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const dataInicio = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    return prisma.tarefa.create({
        data: {
            titulo: `Caixa ${dataBR}: ${falta ? 'falta' : 'sobra'} de R$ ${valorTxt} — ${dono?.nome || 'usuário'}`,
            descricao: `Conferência do dinheiro do caixa de ${dono?.nome || 'usuário'} em ${dataBR} fechou com `
                + `${falta ? 'FALTA' : 'SOBRA'} de R$ ${valorTxt}.\n`
                + `Motivo informado: ${caixa.motivoDiferenca || '—'}\n`
                + `Conferido por: ${caixa.dinheiroConferidoPorNome || '—'}`
                + (caixa.autorizadorDiferencaNome ? `\nAutorizado por: ${caixa.autorizadorDiferencaNome}` : '')
                + `\n\nSe for descontar da pessoa, lance o vale à mão no Contas a Pagar.`,
            dataInicio,
            hora: '09:00',
            recorrencia: 'NUNCA',
            insistir: true,
            criadoPorId: criadoPor.id,
            responsavelId,
        },
    });
};

/**
 * Caixa FECHADO não se altera (regra do dono, 08/2026).
 * Chamado pelas portas de entrada do dia (despesa, baixa, devolução, cobrança,
 * adiantamento). Devolve null quando pode lançar, ou a mensagem do bloqueio.
 */
const bloqueioPorCaixaFechado = async (vendedorId, dataReferencia) => {
    if (!vendedorId || !dataReferencia) return null;
    if (!(await cfgConferencia.exigeConferencia(dataReferencia))) return null;
    const caixa = await prisma.caixaDiario.findUnique({
        where: { vendedorId_dataReferencia: { vendedorId, dataReferencia } },
        select: { status: true, fechadoPorNome: true },
    });
    if (!caixa || caixa.status === 'ABERTO') return null;
    const dataBR = String(dataReferencia).split('-').reverse().join('/');
    return `O caixa de ${dataBR} já está fechado${caixa.fechadoPorNome ? ` (por ${caixa.fechadoPorNome})` : ''}. `
        + 'Peça a reabertura do caixa para lançar neste dia.';
};

// ─────────────────────────────────────────────────────────────────────────────
// Filas da agenda
// ─────────────────────────────────────────────────────────────────────────────
const dadosDoVendedor = (c) => ({
    vendedorId: c.vendedorId,
    vendedorNome: c.vendedor?.nome || 'Usuário',
    data: c.dataReferencia,
});

/**
 * Caixas esperando alguém contar o dinheiro.
 * O aviso na agenda só nasce no DIA SEGUINTE ao do caixa (pedido do dono):
 * conferiu no mesmo dia, nunca chegou a virar cobrança.
 */
const listarAConferir = async ({ usuario, perms, incluirHoje = false }) => {
    if (!podeConferir(perms)) return [];
    const cfg = await cfgConferencia.get();
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

    // Filtro de data num objeto só (chave repetida no `where` se sobrescreveria).
    const filtroData = {};
    if (!incluirHoje) filtroData.lt = hojeStr;                       // só cobra a partir do dia seguinte
    const corte = cfgConferencia.dataCorte(cfg);
    if (corte) filtroData.gte = corte;                               // não puxa caixa velho de antes da regra

    const caixas = await prisma.caixaDiario.findMany({
        where: {
            status: 'ABERTO',
            enviadoConferenciaEm: { not: null },
            ...(Object.keys(filtroData).length ? { dataReferencia: filtroData } : {}),
            // O dono nunca confere o próprio caixa — some da fila dele.
            ...(perms.admin ? {} : { vendedorId: { not: usuario.id } }),
        },
        include: { vendedor: { select: { nome: true } } },
        orderBy: { dataReferencia: 'asc' },
        take: 60,
    });

    const fila = [];
    for (const c of caixas) {
        const calc = await calcularValorAPrestar(c.vendedorId, c.dataReferencia, cfg);
        // Já conferido e ainda válido não é pendência.
        if (c.dinheiroConferido && !conferenciaDesatualizada(c, calc.valorAPrestar)) continue;
        fila.push({
            ...dadosDoVendedor(c),
            caixaId: c.id,
            valorAPrestar: calc.valorAPrestar,
            entregas: calc.entregasCount,
            temMovimento: calc.temMovimento,
            enviadoEm: c.enviadoConferenciaEm,
            origem: c.enviadoConferenciaOrigem,
            diasParado: Math.max(0, Math.round((new Date(`${hojeStr}T12:00:00`) - new Date(`${c.dataReferencia}T12:00:00`)) / 86400000)),
            reconferir: c.dinheiroConferido, // conferência caiu porque o valor mudou
            valorNaConferencia: c.valorEsperadoConferencia != null ? round2(c.valorEsperadoConferencia) : null,
        });
    }
    return fila;
};

/** Caixas com dinheiro conferido, esperando o fechamento. */
const listarAFechar = async ({ usuario, perms }) => {
    if (!podeFechar(perms)) return [];
    const cfg = await cfgConferencia.get();
    const caixas = await prisma.caixaDiario.findMany({
        where: {
            status: 'ABERTO',
            dinheiroConferido: true,
            ...(cfgConferencia.dataCorte(cfg) ? { dataReferencia: { gte: cfgConferencia.dataCorte(cfg) } } : {}),
            // Quem conferiu não fecha o mesmo caixa — some da fila dele.
            ...(perms.admin ? {} : { dinheiroConferidoPorId: { not: usuario.id } }),
        },
        include: { vendedor: { select: { nome: true } } },
        orderBy: { dataReferencia: 'asc' },
        take: 60,
    });

    const fila = [];
    for (const c of caixas) {
        const calc = await calcularValorAPrestar(c.vendedorId, c.dataReferencia, cfg);
        if (conferenciaDesatualizada(c, calc.valorAPrestar)) continue; // voltou para conferência
        fila.push({
            ...dadosDoVendedor(c),
            caixaId: c.id,
            valorAPrestar: calc.valorAPrestar,
            conferidoPor: c.dinheiroConferidoPorNome,
            conferidoEm: c.dinheiroConferidoEm,
            diferenca: c.diferencaConferencia != null ? round2(c.diferencaConferencia) : 0,
            autorizadoPor: c.autorizadorDiferencaNome,
        });
    }
    return fila;
};

/**
 * "Conferi hoje" / histórico de conferências desta pessoa.
 * O período filtra pelo MOMENTO DA CONFERÊNCIA, não pela data do caixa: conferir
 * hoje o caixa de sexta tem que aparecer em "conferi hoje" (era o oposto antes,
 * e o bloco vivia vazio).
 */
const minhasConferencias = async ({ usuario, de, ate }) => {
    const janela = {};
    if (de) janela.gte = new Date(`${de}T00:00:00`);
    if (ate) janela.lte = new Date(`${ate}T23:59:59.999`);

    const caixas = await prisma.caixaDiario.findMany({
        where: {
            dinheiroConferidoPorId: usuario.id,
            ...(de || ate ? { dinheiroConferidoEm: janela } : {}),
        },
        include: { vendedor: { select: { nome: true } } },
        orderBy: { dinheiroConferidoEm: 'desc' },
        take: 200,
    });
    return caixas.map(c => ({
        ...dadosDoVendedor(c),
        caixaId: c.id,
        conferidoEm: c.dinheiroConferidoEm,
        valorContado: c.valorContado != null ? round2(c.valorContado) : null,
        valorEsperado: c.valorEsperadoConferencia != null ? round2(c.valorEsperadoConferencia) : null,
        diferenca: c.diferencaConferencia != null ? round2(c.diferencaConferencia) : 0,
        motivoDiferenca: c.motivoDiferenca,
        autorizadoPor: c.autorizadorDiferencaNome,
        statusCaixa: c.status,
        fechadoPor: c.fechadoPorNome,
        fechadoEm: c.fechadoEm,
    }));
};

// ─────────────────────────────────────────────────────────────────────────────
// Resumo do dia — barra de pílulas (navegação por data) do Caixa Diário.
// Contrato: GET /api/caixa/resumo-dia?data=YYYY-MM-DD (ver docs/caixa-pilulas/plano.md).
// ─────────────────────────────────────────────────────────────────────────────
const ORDEM_STATUS_PILULA = ['A_CONFERIR', 'DEVOLUCAO_PENDENTE', 'ABERTO', 'A_FECHAR', 'FECHADO', 'CONFERIDO'];

const resumoDoDia = async (data, { usuario, podeVerOutros }) => {
    const cfg = await cfgConferencia.get();

    // Fim de semana com soDiasUteis: mesmo formato do /resumo (não há caixa neste dia).
    if (cfg.soDiasUteis && ehFimDeSemana(data)) {
        return {
            diaSemCaixa: true,
            dataSugerida: dataCaixaDe(data),
            mensagem: 'Sábado e domingo não abrem caixa — o movimento do fim de semana entra no caixa da segunda-feira.',
        };
    }

    const { dias, inicio, fim } = intervaloDoCaixa(data, cfg.soDiasUteis);

    // Candidatos do dia: quem tem pedido entregue, despesa ou cobrança de rota
    // nestes dias, ou já tem CaixaDiario aberto nesta data (baixa manual de título
    // fica coberta pelo caixa — toda baixa em espécie exige um CaixaDiario existente).
    const [despesasVend, entregasVend, cobrancasVend, caixasVend] = await Promise.all([
        prisma.despesa.findMany({ where: { dataReferencia: { in: dias } }, select: { vendedorId: true } }),
        prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: inicio, lte: fim },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
            },
            select: { embarque: { select: { responsavelId: true } } },
        }),
        prisma.cobrancaRota.findMany({ where: { dataReferencia: { in: dias } }, select: { cobradoPorId: true } }),
        prisma.caixaDiario.findMany({ where: { dataReferencia: data }, select: { vendedorId: true } }),
    ]);

    const candidatos = new Set([
        ...despesasVend.map(d => d.vendedorId),
        ...entregasVend.map(e => e.embarque?.responsavelId).filter(Boolean),
        ...cobrancasVend.map(c => c.cobradoPorId).filter(Boolean),
        ...caixasVend.map(c => c.vendedorId),
    ]);
    candidatos.delete(usuario.id);

    const outrosIds = podeVerOutros ? [...candidatos] : [];
    const todosIds = [usuario.id, ...outrosIds];

    const vendedoresInfo = await prisma.vendedor.findMany({
        where: { id: { in: todosIds } },
        select: { id: true, nome: true, ativo: true },
    });
    const infoPorId = Object.fromEntries(vendedoresInfo.map(v => [v.id, v]));

    // Em paralelo: calcularValorAPrestar já é pesado (várias queries por vendedor);
    // rodar em série aqui multiplicava o tempo da rota pelo número de candidatos.
    // Promise.all preserva a ordem de `todosIds` no array de resultado (ordem de
    // RESOLUÇÃO pode variar, a de POSIÇÃO não) — a ordem final de exibição de
    // qualquer forma vem do `.sort()` abaixo, não da ordem de cálculo.
    const calculosPorVendedor = await Promise.all(
        todosIds.map(vendedorId => calcularValorAPrestar(vendedorId, data, cfg))
    );

    const linhas = [];
    todosIds.forEach((vendedorId, idx) => {
        const calc = calculosPorVendedor[idx];
        const souEu = vendedorId === usuario.id;
        if (!souEu && !calc.temMovimento) return; // outros só entram com movimento no dia
        const info = infoPorId[vendedorId];
        linhas.push({
            vendedorId,
            vendedorNome: info?.nome || 'Usuário',
            ativo: info?.ativo !== false,
            status: estadoDoCaixa(calc.caixa, calc.valorAPrestar, { devolucaoPendente: calc.devolucaoPendente }),
            valorAPrestar: calc.valorAPrestar,
            entregasCount: calc.entregasCount,
            caixaId: calc.caixa?.id || null,
            temMovimento: calc.temMovimento,
        });
    });

    linhas.sort((a, b) => {
        const ra = ORDEM_STATUS_PILULA.indexOf(a.status);
        const rb = ORDEM_STATUS_PILULA.indexOf(b.status);
        if (ra !== rb) return ra - rb;
        return a.vendedorNome.localeCompare(b.vendedorNome, 'pt-BR');
    });

    const resumoContagem = {};
    for (const l of linhas) resumoContagem[l.status] = (resumoContagem[l.status] || 0) + 1;

    // Pendências anteriores: aviso de caixa parado — os 7 dias ANTES DE HOJE (não
    // da data em tela), excluindo a própria data exibida, só dias com A_CONFERIR
    // ou DEVOLUCAO_PENDENTE. Sem podeVerOutros, conta só o próprio caixa.
    const hoje = hojeStr();
    const diasAnteriores = [];
    for (let i = 1; i <= 7; i++) {
        const d = fromStr(hoje);
        d.setDate(d.getDate() - i);
        diasAnteriores.push(toStr(d));
    }
    const diasParaChecar = diasAnteriores.filter(d => d !== data);

    const caixasAbertosAntes = diasParaChecar.length
        ? await prisma.caixaDiario.findMany({
            where: {
                status: 'ABERTO',
                dataReferencia: { in: diasParaChecar },
                ...(podeVerOutros ? {} : { vendedorId: usuario.id }),
            },
            select: { vendedorId: true, dataReferencia: true },
        })
        : [];

    // Mesmo motivo do bloco acima: paraleliza o cálculo dos caixas dos 7 dias
    // anteriores em vez de uma query por vez, em série.
    const calculosAnteriores = await Promise.all(
        caixasAbertosAntes.map(c => calcularValorAPrestar(c.vendedorId, c.dataReferencia, cfg))
    );
    const porDia = {};
    caixasAbertosAntes.forEach((c, idx) => {
        const calcAnt = calculosAnteriores[idx];
        const statusAnt = estadoDoCaixa(calcAnt.caixa, calcAnt.valorAPrestar, { devolucaoPendente: calcAnt.devolucaoPendente });
        if (statusAnt === 'A_CONFERIR' || statusAnt === 'DEVOLUCAO_PENDENTE') {
            porDia[c.dataReferencia] = (porDia[c.dataReferencia] || 0) + 1;
        }
    });
    const pendenciasAnteriores = Object.entries(porDia)
        .map(([dataAnt, qtd]) => ({ data: dataAnt, qtd }))
        .sort((a, b) => b.data.localeCompare(a.data));

    return {
        data,
        podeVerOutros,
        caixas: linhas,
        resumoContagem,
        pendenciasAnteriores,
    };
};

module.exports = {
    PERM_CONFERIR, PERM_AUTORIZAR_DIF, PERM_FECHAR,
    VALORES_CEDULA, VALORES_MOEDA,
    round2, permsDe, podeConferir, podeAutorizarDiferenca, podeFechar,
    calcularValorAPrestar, conferenciaDesatualizada, estadoDoCaixa, somarContagem,
    temMovimentoNoDia, cobrancaRotaTemDinheiro, resumoDoDia,
    enviarParaConferencia, conferirDinheiro, desfazerConferencia,
    sugerirTarefaDiferenca, bloqueioPorCaixaFechado,
    listarAConferir, listarAFechar, minhasConferencias,
};
