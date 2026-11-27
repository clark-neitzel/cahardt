// Seed da MATRIZ do agente (POST /api/admin-exec/agente-matriz-seed) e o "desligar" (agente-matriz-desligar).
//
// O seed é o que faz a matriz PASSAR A VALER para um agente: grava as células com a regra padrão do dono
// (ver = SIM; criar = SIM só no trabalho de lançamento; o resto = PEDE) e o marcador `MATRIZ/ativa`.
//  - dry-run por padrão (só mostra o que faria); grava só com `?confirmar=1` exato;
//  - célula que o dono JÁ definiu é MANTIDA (reexecutar não desfaz o que ele ajustou na tela); `sobrescrever` força;
//  - exceções por FUNÇÃO continuam valendo (acima da célula); linhas de FAMÍLIA passam a ser ignoradas, MAS as
//    restritivas (BLOQUEADO/PEDE) são traduzidas em células fechadas do módulo — o seed nunca reabre o que o dono fechou;
//    família restritiva sem módulo: o confirmar é recusado;
//  - desligar apaga só o marcador: as células ficam guardadas e o agente volta à política antiga na hora, sem deploy.
const prisma = require('../config/database');
const politica = require('./agentePoliticaService');
const matriz = require('./agenteMatrizService');
const modulos = require('../config/agenteModulos');

const AUTOR = { id: 'admin-exec', nome: 'Seed da matriz (admin-exec)' };

function erro(status, msg) { const e = new Error(msg); e.status = status; return e; }

/** Acha o agente: pelo id informado; sem id, só se existir exatamente UM agente. */
async function acharAgente(agenteId) {
    if (agenteId) {
        const v = await prisma.vendedor.findUnique({ where: { id: String(agenteId) }, select: { id: true, nome: true, agente: true, ativo: true } });
        if (!v || v.agente !== true) throw erro(404, 'Agente não encontrado.');
        return v;
    }
    const todos = await prisma.vendedor.findMany({ where: { agente: true }, select: { id: true, nome: true, agente: true, ativo: true }, orderBy: { nome: 'asc' } });
    if (todos.length === 1) return todos[0];
    if (!todos.length) throw erro(404, 'Não há nenhum agente cadastrado.');
    const e = erro(400, 'Há mais de um agente: informe ?agenteId=.');
    e.agentes = todos.map((a) => ({ id: a.id, nome: a.nome, ativo: a.ativo }));
    throw e;
}

const RESTRICAO = { LIBERADO: 0, PEDE: 1, BLOQUEADO: 2 };
const maisRestrito = (a, b) => (RESTRICAO[b] > RESTRICAO[a] ? b : a);

/**
 * Linhas de FAMÍLIA do dono deixam de valer com a matriz ativa. Para o seed NÃO REABRIR o que ele fechou, cada
 * linha restritiva vira um TETO nas células do módulo daquela família:
 *   FAMILIA = BLOQUEADO -> todas as células do módulo (ver e escritas) ficam NAO;
 *   FAMILIA = PEDE      -> `ver` fica NAO (não existe "pedir" para ler) e as escritas ficam no máximo PEDE.
 * O teto vale para o módulo INTEIRO (mesmo que ele tenha outra família): mais fechado, nunca mais aberto.
 * Família sem módulo não tem para onde traduzir: o seed recusa gravar e pede ao dono para resolver a linha.
 */
function tetosDasFamilias(linhas) {
    const tetos = new Map(); // modulo -> { nivel, familias: [] }
    const semModulo = [];
    for (const l of linhas) {
        if (l.escopo !== 'FAMILIA' || (l.nivel !== 'BLOQUEADO' && l.nivel !== 'PEDE')) continue;
        const mod = modulos.moduloDaFamilia(l.chave);
        if (!mod) { semModulo.push({ chave: l.chave, nivel: l.nivel }); continue; }
        const t = tetos.get(mod.chave) || { nivel: 'LIBERADO', familias: [] };
        t.nivel = maisRestrito(t.nivel, l.nivel);
        t.familias.push(l.chave);
        tetos.set(mod.chave, t);
    }
    return { tetos, semModulo };
}

/** O que o seed faria (não grava nada). */
async function planejar(app, agente, { sobrescrever = false } = {}) {
    const linhas = await politica.linhasFrescas(agente.id);
    const ov = politica.montarMapas(linhas);
    const { tetos, semModulo } = tetosDasFamilias(linhas);
    const celulas = matriz.celulasAplicaveis(app).map((c) => {
        const atual = ov.modulo.get(c.chave) || null;
        const padraoN = modulos.nivelPadrao(c.modulo, c.acao);
        const teto = tetos.get(c.modulo);
        // teto da família: BLOQUEADO fecha tudo; PEDE fecha a leitura e limita a escrita a PEDE
        const tetoN = !teto ? null : (teto.nivel === 'BLOQUEADO' || c.acao === 'ver' ? 'BLOQUEADO' : 'PEDE');
        let alvo = !atual || sobrescrever ? padraoN : atual;
        let motivo = !atual ? 'CRIAR' : (sobrescrever && atual !== padraoN ? 'SOBRESCREVER' : 'MANTER');
        if (tetoN && RESTRICAO[tetoN] > RESTRICAO[alvo]) { alvo = tetoN; motivo = 'FECHAR_POR_FAMILIA'; }
        const gravar = alvo !== atual;
        if (!gravar && motivo !== 'FECHAR_POR_FAMILIA') motivo = 'MANTER';
        return {
            modulo: c.modulo, acao: c.acao, funcoes: c.funcoes,
            atual: atual ? modulos.NIVEL_PARA_TELA[atual] : null,
            padrao: modulos.NIVEL_PARA_TELA[padraoN],
            ficara: modulos.NIVEL_PARA_TELA[alvo],
            acaoDoSeed: motivo,
            ...(motivo === 'FECHAR_POR_FAMILIA' ? { porCausaDe: teto.familias } : {}),
            _nivel: alvo, _gravar: gravar, _chave: c.chave,
        };
    });
    const tabela = {};
    for (const c of celulas) { (tabela[c.modulo] = tabela[c.modulo] || {})[c.acao] = c.ficara; }
    return {
        agente: { id: agente.id, nome: agente.nome, ativo: agente.ativo },
        matrizJaAtiva: ov.matrizAtiva,
        totalLinhasPolitica: linhas.length,
        tabela,
        celulas,
        aCriar: celulas.filter((c) => c.acaoDoSeed === 'CRIAR').length,
        aSobrescrever: celulas.filter((c) => c.acaoDoSeed === 'SOBRESCREVER').length,
        mantidas: celulas.filter((c) => c.acaoDoSeed === 'MANTER').length,
        fechadasPorFamilia: celulas.filter((c) => c.acaoDoSeed === 'FECHAR_POR_FAMILIA').length,
        excecoesFuncaoMantidas: linhas.filter((l) => l.escopo === 'FUNCAO').map((l) => ({ chave: l.chave, nivel: l.nivel, motivo: l.motivo || null })),
        // linhas de FAMÍLIA: deixam de valer com a matriz. As restritivas foram TRADUZIDAS em células fechadas (acima).
        familiasIgnoradas: linhas.filter((l) => l.escopo === 'FAMILIA').map((l) => {
            const mod = modulos.moduloDaFamilia(l.chave);
            const restritiva = l.nivel === 'BLOQUEADO' || l.nivel === 'PEDE';
            return {
                chave: l.chave, nivel: l.nivel, modulo: mod ? mod.chave : null,
                traducao: !restritiva ? 'nenhuma (LIBERADO: a matriz decide)'
                    : !mod ? 'IMPOSSÍVEL: a família não pertence a nenhum módulo da matriz'
                        : l.nivel === 'BLOQUEADO' ? `todas as células de "${mod.rotulo}" ficam NAO` : `em "${mod.rotulo}": ver fica NAO e as escritas ficam no máximo PEDE`,
            };
        }),
        familiasSemModulo: semModulo,
    };
}

const publico = (plano) => ({ ...plano, celulas: plano.celulas.map(({ _nivel, _gravar, _chave, ...c }) => c) });

async function auditar(acao, agente, detalhes) {
    try {
        await prisma.auditLog.create({
            data: { acao, entidade: 'AgentePolitica', entidadeId: `${agente.id}:MATRIZ`, detalhes: JSON.stringify({ agenteId: agente.id, agenteNome: agente.nome, ...detalhes }), usuarioId: AUTOR.id, usuarioNome: AUTOR.nome },
        });
    } catch (e) {
        console.error(`[agente-matriz] falha ao gravar auditoria ${acao} (operação já efetivada):`, e.message);
    }
}

/** `confirmar` false = dry-run. */
async function semear(app, { agenteId, confirmar = false, sobrescrever = false } = {}) {
    const agente = await acharAgente(agenteId);
    const plano = await planejar(app, agente, { sobrescrever });
    if (!confirmar) {
        const impedido = plano.familiasSemModulo.length > 0;
        return {
            ok: true, dryRun: true, podeConfirmar: !impedido, ...publico(plano),
            comoConfirmar: impedido
                ? 'NÃO dá para confirmar ainda: há restrição por FAMÍLIA sem módulo na matriz (veja familiasSemModulo). Remova a linha ou troque por exceções de FUNÇÃO. Nada foi alterado.'
                : 'Repita com ?confirmar=1 para gravar. Nada foi alterado.',
        };
    }
    if (plano.familiasSemModulo.length) {
        const e = erro(422, `O seed não pode ligar a matriz: há restrição do dono por FAMÍLIA que não tem módulo na matriz para ser traduzida (${plano.familiasSemModulo.map((f) => `${f.chave} = ${f.nivel}`).join(', ')}). `
            + 'Com a matriz ativa as linhas de família deixam de valer. Remova essas linhas (DELETE /api/agentes/:id/politicas) ou troque-as por exceções de FUNÇÃO, e rode o seed de novo. Nada foi gravado.');
        e.extra = { familiasSemModulo: plano.familiasSemModulo };
        throw e;
    }
    const quem = { atualizadoPorId: AUTOR.id, atualizadoPorNome: AUTOR.nome };
    const aGravar = plano.celulas.filter((c) => c._gravar);
    await prisma.$transaction(async (tx) => {
        for (const c of aGravar) {
            const onde = { vendedorId: agente.id, escopo: 'MODULO', chave: c._chave };
            await tx.agentePolitica.upsert({
                where: { vendedorId_escopo_chave: onde },
                create: { ...onde, nivel: c._nivel, ...quem },
                update: { nivel: c._nivel, ...quem },
            });
        }
        const marcador = { vendedorId: agente.id, ...matriz.MARCADOR };
        await tx.agentePolitica.upsert({
            where: { vendedorId_escopo_chave: marcador },
            create: { ...marcador, nivel: 'LIBERADO', ...quem },
            update: { nivel: 'LIBERADO', ...quem },
        });
    }, { timeout: 20000, maxWait: 10000 });
    politica.invalidar(agente.id);
    await auditar('AGENTE_MATRIZ_SEMEADA', agente, { celulasGravadas: aGravar.length, mantidas: plano.mantidas, fechadasPorFamilia: plano.fechadasPorFamilia, sobrescrever, matrizJaEstavaAtiva: plano.matrizJaAtiva, tabela: plano.tabela });
    return { ok: true, dryRun: false, gravadas: aGravar.length, matrizAtiva: true, ...publico(plano), observacao: 'A matriz passa a valer em até 15 segundos (em outras instâncias do servidor).' };
}

/** Rollback sem deploy: apaga só o marcador. As células ficam. `confirmar` false = dry-run. */
async function desligar({ agenteId, confirmar = false } = {}) {
    const agente = await acharAgente(agenteId);
    const onde = { vendedorId: agente.id, ...matriz.MARCADOR };
    const existe = await prisma.agentePolitica.findUnique({ where: { vendedorId_escopo_chave: onde }, select: { nivel: true } });
    if (!confirmar) {
        return { ok: true, dryRun: true, agente: { id: agente.id, nome: agente.nome }, matrizAtiva: !!existe, comoConfirmar: 'Repita com ?confirmar=1 para desligar. Nada foi alterado.' };
    }
    let apagadas = 0;
    if (existe) {
        const r = await prisma.agentePolitica.deleteMany({ where: onde });
        apagadas = r.count;
        politica.invalidar(agente.id);
        await auditar('AGENTE_MATRIZ_DESLIGADA', agente, { via: 'admin-exec/agente-matriz-desligar' });
    }
    return { ok: true, dryRun: false, agente: { id: agente.id, nome: agente.nome }, estavaAtiva: !!existe, matrizAtiva: false, marcadorApagado: apagadas > 0, observacao: 'O agente voltou à política antiga (leitura liberada, escrita pede autorização). As células da matriz continuam guardadas.' };
}

module.exports = { semear, desligar, planejar, acharAgente };
