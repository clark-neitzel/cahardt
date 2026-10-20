// Como Fazer — consultas do painel do gestor (treinamentos, execuções, relatório, lembrete).
const prisma = require('../config/database');
const auth = require('./comoFazerAuthService');
const agenda = require('./comoFazerAgendaService');
const base = require('./comoFazerService');
const { ocorreNoDia, datasDoIntervalo } = require('./tarefaRecorrenciaService');

const { ErroCF, statusTreino, STATUS_FALTA, aplica } = base;
const { hojeSP, horaSP, minutosDe } = agenda;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const GRACA_NAO_FEITA_MIN = 60; // rotina de hoje só vira "não feita" 60 min depois do horário

function periodo({ de, ate }) {
    const hoje = hojeSP();
    const fim = RE_DATA.test(ate || '') ? ate : hoje;
    const ini = RE_DATA.test(de || '') ? de : base.diasAtras(fim, -6);
    if (ini > fim) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Período inválido.');
    return { de: ini, ate: fim };
}

const setorCodigo = (s) => (s ? auth.setorPorCodigo(s)?.codigo || null : null);

async function conteudosPublicados(setor, tipo) {
    return prisma.comoFazerConteudo.findMany({
        where: { status: 'PUBLICADO', ...(setor ? { setores: { has: setor } } : {}), ...(tipo ? { tipo } : {}) },
        orderBy: [{ ordem: 'asc' }, { titulo: 'asc' }],
    });
}

// ───────── matriz de treinamentos ─────────
async function treinamentos(setorParam) {
    const setor = setorCodigo(setorParam) || 'COZINHA';
    const agora = new Date();
    const conteudos = await conteudosPublicados(setor);
    const funcs = await prisma.funcionario.findMany({
        where: { ativo: true, setor }, orderBy: { nome: 'asc' },
        select: { id: true, nome: true, foto: true, cargo: true, setor: true, vendedorId: true, senhaNumerica: true, dataAdmissao: true, createdAt: true },
    });
    const treinos = await prisma.comoFazerTreinamento.findMany({
        where: { conteudoId: { in: conteudos.map(c => c.id) }, funcionarioId: { in: funcs.map(f => f.id) } },
    });
    const lim30 = new Date(agora.getTime() - 30 * 86400000);
    const linhas = funcs.map(f => {
        const celulas = {};
        for (const c of conteudos) {
            const t = treinos.find(x => x.funcionarioId === f.id && x.conteudoId === c.id && x.versaoTreinoNumero === c.versaoTreinoNumero && x.ciclo === 1) || null;
            celulas[c.id] = { status: statusTreino(c, t, agora, f), versaoNumero: t?.versaoNumero ?? null };
        }
        return {
            id: f.id, nome: f.nome, foto: f.foto || null, cargo: f.cargo || null,
            novo: new Date(f.dataAdmissao || f.createdAt) > lim30,
            semUsuario: !f.vendedorId, semPin: !f.senhaNumerica, celulas,
        };
    });

    // avisos de cadastro (plano §10): quem está sem setor e encarregado sem funcionário ligado
    const semSetor = await prisma.funcionario.findMany({ where: { ativo: true, setor: null }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } });
    const vend = await prisma.vendedor.findMany({ where: { ativo: true }, select: { id: true, nome: true, permissoes: true, funcionarios: { select: { id: true } } } }).catch(() => []);
    const encarregadosSemFuncionario = vend
        .filter(v => {
            // só permissão EXPLÍCITA (admin tem a permissão implícita e não entra no aviso)
            let p = v.permissoes;
            if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = {}; } }
            return p?.Pode_Confirmar_Treinamento === true && !(v.funcionarios || []).length;
        })
        .map(v => ({ vendedorId: v.id, nome: v.nome }));

    return {
        setor,
        conteudos: conteudos.map(c => ({ id: c.id, titulo: c.titulo, tipo: c.tipo, icone: c.icone || null })),
        funcionarios: linhas, semSetor, encarregadosSemFuncionario,
    };
}

async function lembrar(cf, { funcionarioId, conteudoId }) {
    if (!funcionarioId || !conteudoId) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Informe a pessoa e o conteúdo.');
    const f = await prisma.funcionario.findUnique({ where: { id: funcionarioId }, select: { id: true, vendedorId: true } });
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id: conteudoId } });
    if (!f || !c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Pessoa ou conteúdo não encontrado.');
    if (!f.vendedorId) throw new ErroCF(409, 'SEM_USUARIO', 'Esta pessoa não tem usuário no app. Lembre pelo tablet.');
    const r = await agenda.criarTarefaLembrete({ conteudo: c, vendedorAlvoId: f.vendedorId, criadoPorId: cf.vendedorId });
    return { tarefaId: r.id };
}

// ───────── execuções + "não feitas" calculadas ─────────
async function naoFeitas(conteudos, de, ate) {
    const hoje = hojeSP();
    const agoraMin = minutosDe(horaSP());
    const resultado = [];
    const rotinas = conteudos.filter(c => c.tipo === 'ROTINA' && (c.horarios || []).length && c.primeiraPublicacaoEm);
    if (!rotinas.length) return resultado;
    const execs = await prisma.comoFazerExecucao.findMany({
        where: { conteudoId: { in: rotinas.map(c => c.id) }, dataRef: { gte: de, lte: ate } },
        select: { conteudoId: true, dataRef: true, horaAlvo: true },
    });
    const feito = new Set(execs.map(e => `${e.conteudoId}|${e.dataRef}|${e.horaAlvo}`));
    for (const c of rotinas) {
        const pseudo = base.pseudoTarefa(c);
        const iniReal = pseudo.dataInicio > de ? pseudo.dataInicio : de;
        const fimReal = ate > hoje ? hoje : ate;
        if (iniReal > fimReal) continue;
        for (const dia of datasDoIntervalo(iniReal, fimReal)) {
            if (!ocorreNoDia(pseudo, dia)) continue;
            for (const h of c.horarios) {
                if (dia === hoje && minutosDe(h) + GRACA_NAO_FEITA_MIN > agoraMin) continue;
                if (`${dia}T${h}` <= base.horarioDesde(c, h)) continue; // antes de o horário passar a valer: não é "não feita"
                if (feito.has(`${c.id}|${dia}|${h}`)) continue;
                resultado.push({ conteudo: c, dia, hora: h });
            }
        }
    }
    return resultado;
}

async function execucoes({ de, ate, setor, conteudoId, situacao }) {
    const p = periodo({ de, ate });
    const sit = String(situacao || 'todas').toUpperCase();
    const cod = setorCodigo(setor);
    const conteudos = await prisma.comoFazerConteudo.findMany({
        where: { tipo: 'ROTINA', ...(conteudoId ? { id: conteudoId } : {}), ...(cod ? { setores: { has: cod } } : {}) },
    });
    const porId = new Map(conteudos.map(c => [c.id, c]));
    const itens = [];

    if (sit !== 'NAO_FEITA') {
        const lista = await prisma.comoFazerExecucao.findMany({
            where: { conteudoId: { in: conteudos.map(c => c.id) }, dataRef: { gte: p.de, lte: p.ate }, ...(sit === 'DESVIO' ? { temDesvio: true } : {}), ...(sit === 'OK' ? { temDesvio: false } : {}) },
            include: { versao: { select: { passos: true } } },
            orderBy: { concluidaEm: 'desc' },
        });
        for (const e of lista) {
            const c = porId.get(e.conteudoId);
            const func = await base.nomeDeQuemFez(e);
            const fotos = (Array.isArray(e.respostas) ? e.respostas : []).map(r => r.foto).filter(Boolean);
            const desv = (Array.isArray(e.respostas) ? e.respostas : []).filter(r => r.desvio);
            const rot = new Map();
            for (const s of (e.versao?.passos?.secoes || [])) for (const ps of (s.passos || [])) if (ps.pergunta) rot.set(ps.id, ps.pergunta.rotulo || ps.texto);
            itens.push({
                quando: e.concluidaEm, dataRef: e.dataRef, horaAlvo: e.horaAlvo, conteudoId: e.conteudoId, titulo: c?.titulo || '',
                funcionario: func, situacao: e.temDesvio ? 'DESVIO' : 'OK',
                detalhe: desv.length ? desv.map(d => `${rot.get(d.passoId) || ''}: ${d.valor}${d.mensagem ? ` — ${d.mensagem}` : ''}`).join(' · ') : '',
                fotos, execucaoId: e.id, semEncarregado: e.temDesvio && !(e.desvioTarefaIds || []).length,
            });
        }
    }
    if (sit === 'NAO_FEITA' || sit === 'TODAS') {
        const publicados = conteudos.filter(c => c.status === 'PUBLICADO');
        for (const nf of await naoFeitas(publicados, p.de, p.ate)) {
            itens.push({
                quando: `${nf.dia}T${nf.hora}:00`, dataRef: nf.dia, horaAlvo: nf.hora, conteudoId: nf.conteudo.id, titulo: nf.conteudo.titulo,
                funcionario: null, situacao: 'NAO_FEITA', detalhe: `Rotina das ${nf.hora} não foi feita.`, fotos: [], execucaoId: null, semEncarregado: false,
            });
        }
    }
    // ordena tudo no mesmo referencial: 'YYYY-MM-DDTHH:MM' em São Paulo (execução usa o instante de conclusão; não feita, dia+hora do horário)
    const chaveOrdem = (i) => (i.quando instanceof Date ? agenda.instanteSP(i.quando) : String(i.quando).slice(0, 16));
    itens.sort((a, b) => chaveOrdem(b).localeCompare(chaveOrdem(a)));
    return { periodo: p, itens };
}

async function resumo({ setor, de, ate }) {
    const p = periodo({ de, ate });
    let faltando = 0, vencendo = 0;
    // um setor só quando informado; senão soma todos (cada setor consultado uma única vez)
    const setoresAlvo = setorCodigo(setor) ? [setorCodigo(setor)] : auth.SETORES.map(s => s.codigo);
    for (const cod of setoresAlvo) {
        const ts = await treinamentos(cod);
        for (const f of ts.funcionarios) for (const cel of Object.values(f.celulas)) {
            if (STATUS_FALTA.includes(cel.status)) faltando++;
            if (cel.status === 'VENCENDO') vencendo++;
        }
    }
    const cod = setorCodigo(setor);
    const conteudos = await prisma.comoFazerConteudo.findMany({ where: { tipo: 'ROTINA', ...(cod ? { setores: { has: cod } } : {}) } });
    const execs = await prisma.comoFazerExecucao.findMany({
        where: { conteudoId: { in: conteudos.map(c => c.id) }, dataRef: { gte: p.de, lte: p.ate } }, select: { temDesvio: true, horaAlvo: true },
    });
    const nf = (await naoFeitas(conteudos.filter(c => c.status === 'PUBLICADO'), p.de, p.ate)).length;
    const noPrazo = execs.filter(e => e.horaAlvo).length;
    const total = noPrazo + nf;
    return {
        periodo: p,
        kpis: {
            treinamentosFaltando: faltando, reciclagensVencendo: vencendo,
            rotinasComDesvio: execs.filter(e => e.temDesvio).length,
            pctRotinasNoPrazo: total ? Math.round((noPrazo / total) * 100) : 100,
        },
    };
}

// ───────── relatório p/ impressão (Vigilância) ─────────
async function relatorio({ conteudoId, de, ate }) {
    if (!conteudoId) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Informe o conteúdo.');
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id: conteudoId } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    const p = periodo({ de, ate });
    const v = c.versaoPublicadaId ? await prisma.comoFazerVersao.findUnique({ where: { id: c.versaoPublicadaId } }) : null;
    const treinos = await prisma.comoFazerTreinamento.findMany({ where: { conteudoId }, orderBy: { aprendeuEm: 'desc' } });
    const ids = [...new Set([...treinos.map(t => t.funcionarioId), ...treinos.map(t => t.confirmadoPorFuncionarioId).filter(Boolean)])];
    const funcs = await prisma.funcionario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } });
    const nome = (id) => funcs.find(f => f.id === id)?.nome || null;
    const ex = c.tipo === 'ROTINA' ? await execucoes({ de: p.de, ate: p.ate, conteudoId, situacao: 'todas' }) : { itens: [] };
    return {
        conteudo: { id: c.id, tipo: c.tipo, codigo: c.codigo, titulo: c.titulo, icone: c.icone, setores: c.setores, status: c.status },
        encarregados: await base.resolverEncarregados(c.responsaveisIds),
        versaoPublicada: v ? { numero: v.numero, publicadaEm: v.publicadaEm, publicadaPor: await base.resolverPublicadaPor(v.publicadaPorId), doc: v.passos } : null,
        periodo: p,
        treinados: treinos.map(t => ({ nome: nome(t.funcionarioId), aprendeuEm: t.aprendeuEm, confirmadoPor: t.confirmadoPorFuncionarioId ? nome(t.confirmadoPorFuncionarioId) : null, confirmadoEm: t.confirmadoEm, versaoNumero: t.versaoNumero })),
        execucoes: ex.itens,
    };
}

module.exports = { treinamentos, lembrar, execucoes, resumo, relatorio };
