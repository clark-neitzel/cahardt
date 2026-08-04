/**
 * Rotinas automáticas da conferência do dinheiro do caixa.
 *
 *  1. VIRADA DO DIA — todo caixa que ficou ABERTO no dia que passou entra na fila
 *     de conferência sozinho (quem imprimiu a folha já entrou antes). É o que
 *     garante que nenhum dia escape, inclusive os de R$ 0,00.
 *  2. AVISO DE ATRASO — caixa parado há N dias (config) manda UMA mensagem por
 *     dia para cada pessoa que confere, juntando todos os caixas atrasados.
 *     Mensagem transacional interna, nos termos do contrato do bot.
 *
 * As duas são isoladas: erro aqui nunca derruba o servidor nem trava caixa.
 */

const prisma = require('../config/database');
const cfgConferencia = require('../config/caixaConferenciaConfig');
const confService = require('./caixaConferenciaService');
const bot = require('./botWhatsappService');
const { ehFimDeSemana, dataCaixaDe } = require('../utils/diasUteisCaixa');

const p2 = (n) => String(n).padStart(2, '0');
const toStr = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const dataBR = (s) => String(s).split('-').reverse().join('/');
const brl = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;

/** 1. Virada do dia: manda para conferência tudo que ficou aberto ontem ou antes. */
const enviarCaixasDaVirada = async () => {
    const cfg = await cfgConferencia.get();
    const hoje = toStr(new Date());

    // Janela curta de propósito: caixa esquecido de meses atrás não vira pendência
    // nova na agenda de ninguém (no primeiro deploy seriam dezenas de uma vez).
    const janela = new Date();
    janela.setDate(janela.getDate() - 15);
    const corte = cfgConferencia.dataCorte(cfg);
    const inicioJanela = [toStr(janela), corte].filter(Boolean).sort().pop();

    const abertos = await prisma.caixaDiario.findMany({
        where: {
            status: 'ABERTO',
            enviadoConferenciaEm: null,
            dataReferencia: { lt: hoje, gte: inicioJanela },
        },
        select: { id: true, vendedorId: true, dataReferencia: true },
        take: 300,
    });

    let enviados = 0;
    for (const c of abertos) {
        // Com "só dias úteis" ligado, caixa de sáb/dom não existe: o movimento é
        // prestado na segunda, então esses registros não entram na fila.
        if (cfg.soDiasUteis && ehFimDeSemana(c.dataReferencia)) continue;
        try {
            await prisma.caixaDiario.update({
                where: { id: c.id },
                data: {
                    enviadoConferenciaEm: new Date(),
                    enviadoConferenciaOrigem: 'VIRADA_DIA',
                },
            });
            enviados++;
        } catch (e) {
            console.error(`[CaixaConferencia] Falha ao enviar caixa ${c.id} na virada:`, e.message);
        }
    }
    if (enviados) console.log(`[CaixaConferencia] ${enviados} caixa(s) entraram na fila pela virada do dia.`);
    return { enviados, total: abertos.length };
};

/** 2. Aviso de caixa atrasado para quem confere. */
const avisarCaixasAtrasados = async () => {
    const cfg = await cfgConferencia.get();
    const dias = Number(cfg.whatsappAtrasoDias || 0);
    if (!dias) return { ok: false, motivo: 'aviso_desligado' };

    const hoje = new Date();
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() - dias);
    const limiteStr = toStr(limite);

    const atrasados = await prisma.caixaDiario.findMany({
        where: {
            status: 'ABERTO',
            dinheiroConferido: false,
            enviadoConferenciaEm: { not: null },
            dataReferencia: { lte: limiteStr, ...(cfgConferencia.dataCorte(cfg) ? { gte: cfgConferencia.dataCorte(cfg) } : {}) },
        },
        include: { vendedor: { select: { nome: true } } },
        orderBy: { dataReferencia: 'asc' },
        take: 40,
    });
    if (!atrasados.length) return { ok: true, caixas: 0, avisados: 0 };

    // Valor atual de cada um (o do fechamento ainda não existe)
    const linhas = [];
    for (const c of atrasados) {
        let valor = 0;
        try {
            valor = (await confService.calcularValorAPrestar(c.vendedorId, c.dataReferencia, cfg)).valorAPrestar;
        } catch { /* valor não é essencial para o aviso */ }
        const diasParado = Math.round((new Date(`${toStr(hoje)}T12:00:00`) - new Date(`${c.dataReferencia}T12:00:00`)) / 86400000);
        linhas.push(`• *${c.vendedor?.nome || 'Usuário'}* — ${dataBR(c.dataReferencia)} — ${brl(valor)} — _há ${diasParado} dia(s)_`);
    }

    // Quem confere (com telefone). O dono do caixa não é avisado do próprio.
    const equipe = await prisma.vendedor.findMany({
        where: { ativo: true, telefone: { not: null } },
        select: { id: true, nome: true, telefone: true, permissoes: true },
    });
    const conferentes = equipe.filter(v => confService.podeConferir(confService.permsDe(v)));
    if (!conferentes.length) return { ok: true, caixas: atrasados.length, avisados: 0, motivo: 'ninguem_confere' };

    const hojeRef = toStr(hoje);
    let avisados = 0;
    for (const pessoa of conferentes) {
        const minhas = atrasados.filter(c => c.vendedorId !== pessoa.id);
        if (!minhas.length) continue;
        const texto = '💵 *Caixa aguardando conferência*\n\n'
            + 'Tem caixa esperando alguém contar o dinheiro:\n\n'
            + linhas.filter((_, i) => atrasados[i].vendedorId !== pessoa.id).join('\n')
            + '\n\nEnquanto não conferir, esses caixas não podem ser fechados.';
        try {
            // Uma mensagem por pessoa por DIA: a referência carimba a data, então
            // uma segunda rodada no mesmo dia volta como "duplicado" (não reenvia).
            const r = await bot.enviar({
                telefone: pessoa.telefone,
                texto,
                tipo: 'interno',
                origem: 'caixa-conferencia',
                referencia: `caixa-conf-atraso-${pessoa.id}-${hojeRef}`,
            });
            if (r?.ok) avisados++;
        } catch (e) {
            console.error(`[CaixaConferencia] Falha ao avisar ${pessoa.nome}:`, e.message);
        }
    }
    if (avisados) console.log(`[CaixaConferencia] ${atrasados.length} caixa(s) atrasado(s); ${avisados} pessoa(s) avisada(s).`);
    return { ok: true, caixas: atrasados.length, avisados };
};

/** Rodada diária completa (virada + aviso). Nunca lança. */
const rodadaDiaria = async () => {
    const saida = { virada: null, aviso: null };
    try { saida.virada = await enviarCaixasDaVirada(); }
    catch (e) { console.error('[CaixaConferencia] Erro na virada do dia:', e.message); }
    try { saida.aviso = await avisarCaixasAtrasados(); }
    catch (e) { console.error('[CaixaConferencia] Erro no aviso de atraso:', e.message); }
    return saida;
};

module.exports = { enviarCaixasDaVirada, avisarCaixasAtrasados, rodadaDiaria, dataCaixaDe };
