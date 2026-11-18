/**
 * Regime tributário do cliente PJ (Simples / MEI / Normal), consultado na Receita via
 * BrasilAPI (principal) e CNPJá open (fallback). Grava em `cliente_fiscal` (tabela lateral).
 *
 * Regras:
 *  - Só CNPJ numérico de 14 dígitos. PF e CNPJ alfanumérico: pula, sem erro.
 *  - 404 = "não consta" -> DESCONHECIDO. Erro de rede/429/5xx: NÃO grava NORMAL e NÃO apaga o
 *    regime anterior; grava só `regimeErro`.
 *  - Sem $transaction (uma escrita por cliente) e nenhuma chamada de rede dentro de transação.
 */
const axios = require('axios');
const prisma = require('../config/database');
const { normalizarDoc } = require('../utils/documento');

const PAUSA_MS = 1100;
const LOTE_PADRAO = 60;
const DIAS_RECONSULTA = 30;
const DIAS_COMPRA_RECENTE = 60;
const TIMEOUT_MS = 12000;
const MSG_INDISPONIVEL = 'Não foi possível consultar a Receita agora. Tente de novo em alguns minutos.';
const MSG_NAO_ENCONTRADO = 'A Receita não encontrou este CNPJ.';

let _rodando = false;
const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cnpjNumerico(doc) {
    const d = normalizarDoc(doc);
    return /^\d{14}$/.test(d) ? d : null;
}

function _data(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

function _regimeDe({ mei, simples }) {
    if (mei) return 'MEI';
    if (simples) return 'SIMPLES';
    return 'NORMAL';
}

/** Classifica o erro HTTP: 'NAO_CONSTA' | 'LIMITE' | 'FALHA' */
function _tipoErro(err) {
    const st = err?.response?.status;
    if (st === 404) return 'NAO_CONSTA';
    if (st === 429) return 'LIMITE';
    return 'FALHA';
}

async function _brasilApi(cnpj) {
    const { data } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { timeout: TIMEOUT_MS });
    return {
        fonte: 'BrasilAPI',
        regime: _regimeDe({ mei: data.opcao_pelo_mei === true, simples: data.opcao_pelo_simples === true }),
        dataExclusaoSimples: _data(data.data_exclusao_do_simples),
        porte: data.porte || null,
        cnaePrincipal: data.cnae_fiscal != null ? String(data.cnae_fiscal) : null,
    };
}

async function _cnpja(cnpj) {
    const { data } = await axios.get(`https://open.cnpja.com/office/${cnpj}`, { timeout: TIMEOUT_MS });
    const c = data?.company || {};
    return {
        fonte: 'CNPJa',
        regime: _regimeDe({ mei: c.simei?.optant === true, simples: c.simples?.optant === true }),
        dataExclusaoSimples: null,
        porte: c.size?.acronym || c.size?.text || null,
        cnaePrincipal: data?.mainActivity?.id != null ? String(data.mainActivity.id) : null,
    };
}

/**
 * Consulta o regime. Retorna:
 *  { ok:true, regime, dataExclusaoSimples, porte, cnaePrincipal, fonte }
 *  { ok:false, pulado:true }                       (PF / CNPJ não numérico)
 *  { ok:false, limite:true, erro }                 (429 - quem chama deve parar a rodada)
 *  { ok:false, erro }                              (fora do ar)
 */
async function consultarRegime(cnpjBruto) {
    const cnpj = cnpjNumerico(cnpjBruto);
    if (!cnpj) return { ok: false, pulado: true, erro: 'Só CNPJ numérico de 14 dígitos é consultado.' };

    let erroPrim;
    try {
        return { ok: true, ...(await _brasilApi(cnpj)) };
    } catch (e) {
        erroPrim = e;
        if (_tipoErro(e) === 'NAO_CONSTA') {
            return { ok: true, fonte: 'BrasilAPI', regime: 'DESCONHECIDO', dataExclusaoSimples: null, porte: null, cnaePrincipal: null };
        }
    }
    // Fallback CNPJá
    try {
        return { ok: true, ...(await _cnpja(cnpj)) };
    } catch (e2) {
        const limite = _tipoErro(erroPrim) === 'LIMITE' || _tipoErro(e2) === 'LIMITE';
        const tecnico = `Receita indisponível (${erroPrim?.response?.status || erroPrim?.code || erroPrim?.message}; fallback ${e2?.response?.status || e2?.code || e2?.message})`;
        console.error('[Regime]', cnpj, tecnico);
        return {
            ok: false, limite,
            erro: _tipoErro(e2) === 'NAO_CONSTA' ? MSG_NAO_ENCONTRADO : MSG_INDISPONIVEL,
            erroTecnico: tecnico,
        };
    }
}

function paraRegimeFiscal(f) {
    if (!f || !f.regimeConsultadoEm) return null;
    return {
        regime: f.regimeTributario || null,
        dataExclusaoSimples: f.dataExclusaoSimples || null,
        porte: f.porte || null,
        cnaePrincipal: f.cnaePrincipal || null,
        consultadoEm: f.regimeConsultadoEm,
        fonte: f.regimeFonte || null,
        // o detalhe técnico fica só no banco/log; a tela recebe frase simples
        erro: f.regimeErro ? MSG_INDISPONIVEL : null,
    };
}

const SELECT_REGIME = {
    regimeTributario: true, dataExclusaoSimples: true, porte: true, cnaePrincipal: true,
    regimeConsultadoEm: true, regimeFonte: true, regimeErro: true,
};

/**
 * Consulta e grava o regime de um cliente. Nunca lança.
 * { ok:true, regimeFiscal } | { ok:false, erro, pulado?, limite? }
 */
async function atualizarCliente(uuid) {
    try {
        const cli = await prisma.cliente.findUnique({ where: { UUID: uuid }, select: { Documento: true } });
        if (!cli) return { ok: false, erro: 'Cliente não encontrado.', naoEncontrado: true };

        const r = await consultarRegime(cli.Documento);
        if (r.pulado) return { ok: false, pulado: true, erro: r.erro };

        if (!r.ok) {
            // Não apaga o regime anterior: só registra o erro.
            await prisma.clienteFiscal.upsert({
                where: { clienteUuid: uuid },
                create: { clienteUuid: uuid, regimeErro: r.erroTecnico || r.erro },
                update: { regimeErro: r.erroTecnico || r.erro },
            });
            return { ok: false, erro: r.erro, limite: !!r.limite };
        }

        const dados = {
            regimeTributario: r.regime,
            dataExclusaoSimples: r.dataExclusaoSimples,
            porte: r.porte,
            cnaePrincipal: r.cnaePrincipal,
            regimeConsultadoEm: new Date(),
            regimeFonte: r.fonte,
            regimeErro: null,
        };
        const f = await prisma.clienteFiscal.upsert({
            where: { clienteUuid: uuid },
            create: { clienteUuid: uuid, ...dados },
            update: dados,
            select: SELECT_REGIME,
        });
        return { ok: true, regimeFiscal: paraRegimeFiscal(f) };
    } catch (err) {
        console.error('[Regime] falha ao atualizar', uuid, err.message);
        return { ok: false, erro: MSG_INDISPONIVEL };
    }
}

/** Zera o regime (CNPJ mudou). Não cria linha se não existir. */
async function zerarRegime(uuid) {
    await prisma.clienteFiscal.updateMany({
        where: { clienteUuid: uuid },
        data: {
            regimeTributario: null, dataExclusaoSimples: null, porte: null, cnaePrincipal: null,
            regimeConsultadoEm: null, regimeFonte: null, regimeErro: null,
        },
    });
}

/** Dispara a consulta sem bloquear quem chama (cadastro / alteração de CNPJ). */
function agendarConsulta(uuid) {
    setImmediate(() => {
        atualizarCliente(uuid).catch((e) => console.error('[Regime] consulta pós-cadastro falhou:', e.message));
    });
}

/**
 * Monta a fila (ordem de prioridade) de clientes a consultar: [{ uuid, documento }], até `limite`.
 */
async function montarFila(limite) {
    const agora = new Date();
    const d30 = new Date(agora.getTime() - DIAS_RECONSULTA * 86400000);
    const d60 = new Date(agora.getTime() - DIAS_COMPRA_RECENTE * 86400000);
    const jan1 = new Date(agora.getFullYear(), 0, 1);

    const base = { Ativo: true, Tipo_Pessoa: 'JURIDICA', Documento: { not: null } };
    const fila = [];
    const vistos = new Set();
    const add = (lista) => {
        for (const c of lista) {
            if (fila.length >= limite) return;
            if (vistos.has(c.UUID) || !cnpjNumerico(c.Documento)) continue;
            vistos.add(c.UUID);
            fila.push({ uuid: c.UUID, documento: normalizarDoc(c.Documento) });
        }
    };
    const sel = { UUID: true, Documento: true };
    // "nunca": sem linha fiscal OU sem consulta e sem erro anterior. Quem já falhou (regimeErro e
    // regimeConsultadoEm nulo) vai para o FIM da fila (passo 5), senão CNPJs que sempre falham
    // ocupariam o começo da fila todo dia e os demais nunca seriam consultados.
    const nunca = { OR: [{ fiscal: { is: null } }, { fiscal: { is: { regimeConsultadoEm: null, regimeErro: null } } }] };
    const velhoOuNunca = { OR: [...nunca.OR, { fiscal: { is: { regimeConsultadoEm: { lt: d30 } } } }] };
    const folga = limite * 3; // sobra p/ descartar CNPJ alfanumérico

    // (1) comprou nos últimos 60 dias e nunca consultado / consulta > 30 dias
    add(await prisma.cliente.findMany({
        where: { ...base, AND: [velhoOuNunca, { pedidos: { some: { dataVenda: { gte: d60 }, especial: false } } }] },
        select: sel, take: folga, orderBy: { Nome: 'asc' },
    }));
    // (2) nunca consultados
    if (fila.length < limite) {
        add(await prisma.cliente.findMany({ where: { ...base, ...nunca }, select: sel, take: folga, orderBy: { Nome: 'asc' } }));
    }
    // (3) rodada extra de janeiro: consulta anterior a 1º de janeiro do ano corrente
    if (fila.length < limite) {
        add(await prisma.cliente.findMany({
            where: { ...base, fiscal: { is: { regimeConsultadoEm: { lt: jan1 } } } },
            select: sel, take: folga, orderBy: { Nome: 'asc' },
        }));
    }
    // (4) consulta mais antiga (> 30 dias)
    if (fila.length < limite) {
        add(await prisma.cliente.findMany({
            where: { ...base, fiscal: { is: { regimeConsultadoEm: { lt: d30 } } } },
            select: sel, take: folga, orderBy: { fiscal: { regimeConsultadoEm: 'asc' } },
        }));
    }
    // (5) por último: nunca consultados que já falharam (retenta só depois de todos os outros)
    if (fila.length < limite) {
        add(await prisma.cliente.findMany({
            where: { ...base, fiscal: { is: { regimeConsultadoEm: null, regimeErro: { not: null } } } },
            select: sel, take: folga, orderBy: { Nome: 'asc' },
        }));
    }
    return fila;
}

/**
 * Lote diário. `dryRun` só monta a fila (não chama a Receita nem grava).
 */
async function rodarLote({ limite = LOTE_PADRAO, dryRun = false } = {}) {
    if (_rodando) return { dryRun: !!dryRun, jaRodando: true, total: 0, processados: 0, porRegime: {}, amostra: [] };
    _rodando = true;
    try {
        const lim = Math.max(1, Math.min(Number(limite) || LOTE_PADRAO, 500));
        const fila = await montarFila(lim);
        const res = { dryRun: !!dryRun, total: fila.length, processados: 0, porRegime: {}, amostra: [], parouPorLimite: false, erros: 0 };

        if (dryRun) {
            res.amostra = fila.slice(0, 20).map((c) => ({ uuid: c.uuid, documento: c.documento }));
            return res;
        }

        for (let i = 0; i < fila.length; i++) {
            if (i > 0) await _sleep(PAUSA_MS);
            const r = await atualizarCliente(fila[i].uuid);
            if (r.ok) {
                res.processados++;
                const k = r.regimeFiscal?.regime || 'DESCONHECIDO';
                res.porRegime[k] = (res.porRegime[k] || 0) + 1;
                if (res.amostra.length < 20) res.amostra.push({ uuid: fila[i].uuid, documento: fila[i].documento, regime: k, porte: r.regimeFiscal?.porte, fonte: r.regimeFiscal?.fonte });
            } else if (!r.pulado) {
                res.erros++;
                if (r.limite) { res.parouPorLimite = true; break; } // 429: para a rodada
            }
        }
        return res;
    } finally {
        _rodando = false;
    }
}

module.exports = {
    consultarRegime, atualizarCliente, rodarLote, zerarRegime, agendarConsulta,
    cnpjNumerico, SELECT_REGIME, paraRegimeFiscal, montarFila,
};
