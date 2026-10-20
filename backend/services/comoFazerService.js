// Como Fazer — regras de negócio (aplicabilidade, status de treinamento, aprendi, confirmar,
// execuções com desvio calculado NO SERVIDOR, publicar, painel). As rotas só chamam daqui.
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const schema = require('./comoFazerSchema');
const auth = require('./comoFazerAuthService');
const agenda = require('./comoFazerAgendaService');
const { ocorreNoDia, datasDoIntervalo } = require('./tarefaRecorrenciaService');

const { hojeSP, horaSP, minutosDe } = agenda;

class ErroCF extends Error {
    constructor(status, codigo, mensagem, extra = {}) { super(mensagem); this.status = status; this.codigo = codigo; this.extra = extra; }
}

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const diasAtras = (dataStr, n) => { const d = new Date(`${dataStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dataSP = (d) => (d ? agenda.hojeSP(new Date(d)) : null);

// ───────── aplicabilidade e status ─────────
/** o conteúdo vale para este funcionário? (setor + cargo; cargos vazio = todos do setor) */
function aplica(conteudo, func) {
    if (!func) return false;
    if (!func.setor || !(conteudo.setores || []).includes(func.setor)) return false;
    const cargos = (conteudo.cargos || []).map(semAcento).filter(Boolean);
    if (!cargos.length) return true;
    return cargos.includes(semAcento(func.cargo));
}

/** ÚNICO lugar que calcula o status de treinamento (plano §3) */
function statusTreino(conteudo, treino, agora = new Date(), func = undefined) {
    if (func !== undefined && !aplica(conteudo, func)) return 'NAO_SE_APLICA';
    if (!treino || treino.versaoTreinoNumero !== conteudo.versaoTreinoNumero) return 'PENDENTE';
    if (treino.exigeConfirmacao && !treino.confirmadoEm) return 'AGUARDANDO_CONFIRMACAO';
    if (treino.validoAte) {
        const ms = new Date(treino.validoAte).getTime() - agora.getTime();
        if (ms < 0) return 'VENCIDO';
        if (ms <= 30 * 86400000) return 'VENCENDO';
    }
    return 'OK';
}
const STATUS_FALTA = ['PENDENTE', 'AGUARDANDO_CONFIRMACAO', 'VENCIDO'];

// ───────── leitura básica ─────────
async function funcionarioDoContexto(cf) {
    if (!cf?.funcionarioId) return null;
    return prisma.funcionario.findUnique({
        where: { id: cf.funcionarioId },
        select: { id: true, nome: true, foto: true, setor: true, cargo: true, ativo: true, vendedorId: true },
    });
}

async function conteudoPublicado(id) {
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    if (!c || c.status !== 'PUBLICADO' || !c.versaoPublicadaId) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    return c;
}

async function treinoAtual(funcionarioId, conteudo) {
    if (!funcionarioId) return null;
    return prisma.comoFazerTreinamento.findUnique({
        where: {
            funcionarioId_conteudoId_versaoTreinoNumero_ciclo: {
                funcionarioId, conteudoId: conteudo.id, versaoTreinoNumero: conteudo.versaoTreinoNumero, ciclo: 1,
            },
        },
    });
}

// ───────── rotina: "Fazer agora" ─────────
/** a partir de quando o horário `h` do conteúdo conta para "não feita" ('YYYY-MM-DDTHH:MM' em SP) */
function horarioDesde(c, h) {
    const m = c.horariosDesde && typeof c.horariosDesde === 'object' ? c.horariosDesde : {};
    return m[h] || (c.primeiraPublicacaoEm ? agenda.instanteSP(new Date(c.primeiraPublicacaoEm)) : '9999');
}
/** mapa horário -> desde, mantendo o que já valia; horário novo vale a partir de agora. `resetar` recomeça tudo de agora. */
function calcularHorariosDesde(c, horarios, resetar) {
    const antigo = !resetar && c.horariosDesde && typeof c.horariosDesde === 'object' ? c.horariosDesde : {};
    const agora = agenda.instanteSP();
    const out = {};
    for (const h of horarios) out[h] = antigo[h] || agora;
    return out;
}

const pseudoTarefa = (c) => ({
    dataInicio: dataSP(c.primeiraPublicacaoEm) || hojeSP(),
    recorrencia: c.recorrencia || 'NUNCA',
    recorrenciaFim: null,
    diasSemana: c.diasSemana || [],
});

/** execuções do dia (hoje) de vários conteúdos: Map conteudoId -> Set(horaAlvo|'*') */
async function execucoesDoDia(conteudoIds, dataRef) {
    if (!conteudoIds.length) return new Map();
    const lista = await prisma.comoFazerExecucao.findMany({
        where: { conteudoId: { in: conteudoIds }, dataRef }, select: { conteudoId: true, horaAlvo: true },
    });
    const m = new Map();
    for (const e of lista) {
        if (!m.has(e.conteudoId)) m.set(e.conteudoId, new Set());
        m.get(e.conteudoId).add(e.horaAlvo || '*');
    }
    return m;
}

/** { horaAlvo, fazerAgora } para o dia de hoje */
function rotinaAgora(c, feitasHoje) {
    const hoje = hojeSP();
    const horarios = [...(c.horarios || [])].sort();
    if (!horarios.length) return { fazerAgora: true, dataRef: hoje, horaAlvo: null, proximaEm: null };
    const agora = minutosDe(horaSP());
    const ocorre = ocorreNoDia(pseudoTarefa(c), hoje);
    let horaAlvo = null;
    if (ocorre) {
        const vencidas = horarios.filter(h => minutosDe(h) <= agora && !(feitasHoje && feitasHoje.has(h)));
        horaAlvo = vencidas.length ? vencidas[vencidas.length - 1] : null;
    }
    const prox = ocorre ? horarios.find(h => minutosDe(h) > agora) : null;
    return { fazerAgora: !!horaAlvo, dataRef: hoje, horaAlvo, proximaEm: prox || null };
}

const subtitulo = (c, novaVersaoEm) => {
    const tipoTxt = { ROTINA: 'Rotina', MAQUINA: 'Máquina', REGRA: 'Regra', DOSAGEM: 'Dosagem' }[c.tipo] || 'Conteúdo';
    let s = tipoTxt;
    if (c.tipo === 'ROTINA' && (c.horarios || []).length) s += ` · ${[...c.horarios].sort().join(' e ')}`;
    if (c.tipo === 'MAQUINA') s += ' · montar, usar, limpar';
    if (novaVersaoEm) s += ` · versão nova em ${novaVersaoEm}`;
    return s;
};
const ddmm = (d) => { const s = dataSP(d); return s ? `${s.slice(8)}/${s.slice(5, 7)}` : null; };

// ───────── /me ─────────
async function me(cf) {
    const f = await funcionarioDoContexto(cf);
    const pode = {
        confirmar: auth.temPermissao({ cf }, 'Pode_Confirmar_Treinamento'),
        editar: auth.temPermissao({ cf }, 'Pode_Editar_Como_Fazer'),
        painel: auth.temPermissao({ cf }, 'Pode_Ver_Painel_Como_Fazer'),
    };
    return {
        origem: cf.origem,
        funcionario: f ? { id: f.id, nome: f.nome, foto: f.foto || null, setor: f.setor || null, cargo: f.cargo || null } : null,
        setores: auth.SETORES.map(s => ({ slug: s.slug, nome: s.nome })),
        pode,
    };
}

// ───────── /home ─────────
async function home(cf, setorParam) {
    const func = await funcionarioDoContexto(cf);
    const setorAtual = auth.setorPorCodigo(setorParam)?.codigo || func?.setor || 'COZINHA';
    const agora = new Date();

    const publicados = await prisma.comoFazerConteudo.findMany({
        where: { status: 'PUBLICADO', versaoPublicadaId: { not: null } },
        orderBy: [{ ordem: 'asc' }, { titulo: 'asc' }],
    });
    const treinos = func
        ? await prisma.comoFazerTreinamento.findMany({ where: { funcionarioId: func.id, conteudoId: { in: publicados.map(c => c.id) } } })
        : [];
    const versoes = await prisma.comoFazerVersao.findMany({
        where: { id: { in: publicados.map(c => c.versaoPublicadaId) } }, select: { id: true, numero: true, publicadaEm: true },
    });
    const versaoPorId = new Map(versoes.map(v => [v.id, v]));
    const treinoPor = (c) => treinos.find(t => t.conteudoId === c.id && t.versaoTreinoNumero === c.versaoTreinoNumero && t.ciclo === 1) || null;
    const ultimoTreino = (c) => treinos.filter(t => t.conteudoId === c.id).sort((a, b) => b.versaoNumero - a.versaoNumero)[0] || null;

    const setores = auth.SETORES.map(s => {
        const doSetor = publicados.filter(c => (c.setores || []).includes(s.codigo));
        const aplicaveis = func ? doSetor.filter(c => aplica(c, func) || func.setor !== s.codigo) : doSetor;
        const pendentes = func
            ? doSetor.filter(c => func.setor === s.codigo && STATUS_FALTA.includes(statusTreino(c, treinoPor(c), agora, func))).length
            : 0;
        return { slug: s.slug, nome: s.nome, total: aplicaveis.length, pendentes };
    });

    const doSetorAtual = publicados.filter(c => (c.setores || []).includes(setorAtual));
    const hojeStr = hojeSP();
    const rotinasIds = doSetorAtual.filter(c => c.tipo === 'ROTINA').map(c => c.id);
    const feitas = await execucoesDoDia(rotinasIds, hojeStr);

    let itens = doSetorAtual.map(c => {
        const t = treinoPor(c);
        const status = func ? statusTreino(c, t, agora, func) : 'NAO_SE_APLICA';
        const versao = versaoPorId.get(c.versaoPublicadaId);
        const antigo = ultimoTreino(c);
        const novaVersao = !!(status === 'OK' && antigo && versao && antigo.versaoNumero < versao.numero);
        return {
            id: c.id, tipo: c.tipo, titulo: c.titulo, icone: c.icone || null,
            codigo: c.codigo || null,
            versaoNumero: versao?.numero ?? null,
            subtitulo: subtitulo(c, novaVersao ? ddmm(versao.publicadaEm) : null),
            status, novaVersao,
            rotina: c.tipo === 'ROTINA'
                ? { horarios: [...(c.horarios || [])].sort(), ...rotinaAgora(c, feitas.get(c.id)) }
                : null,
            _ordem: c.ordem,
        };
    });
    // funcionário só vê o que se aplica a ele; app sem funcionário vê tudo do setor
    if (func) itens = itens.filter(i => i.status !== 'NAO_SE_APLICA');
    const peso = (i) => (STATUS_FALTA.includes(i.status) ? 0 : 1);
    itens.sort((a, b) => peso(a) - peso(b) || a._ordem - b._ordem || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    itens.forEach(i => { delete i._ordem; });
    return { setorAtual, setores, itens };
}

/** encarregados (só ATIVOS) a partir de responsaveisIds: [{ vendedorId, nome }] */
async function resolverEncarregados(ids) {
    if (!ids?.length) return [];
    const lista = await prisma.vendedor.findMany({ where: { id: { in: ids }, ativo: true }, select: { id: true, nome: true } });
    return ids.map(i => lista.find(v => v.id === i)).filter(Boolean).map(v => ({ vendedorId: v.id, nome: v.nome }));
}
/** quem publicou a versão: { id, nome } | null */
async function resolverPublicadaPor(vendedorId) {
    if (!vendedorId) return null;
    const v = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { id: true, nome: true } });
    return v ? { id: v.id, nome: v.nome } : null;
}

// ───────── /conteudos/:id ─────────
async function abrirConteudo(cf, id, previa) {
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    let versao;
    if (previa) {
        if (!auth.temPermissao({ cf }, 'Pode_Editar_Como_Fazer')) throw new ErroCF(403, 'SEM_PERMISSAO', 'Você não tem permissão para isso.');
        versao = await prisma.comoFazerVersao.findFirst({ where: { conteudoId: id, status: 'RASCUNHO' }, orderBy: { numero: 'desc' } })
            || (c.versaoPublicadaId ? await prisma.comoFazerVersao.findUnique({ where: { id: c.versaoPublicadaId } }) : null);
        if (!versao) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    } else {
        if (c.status !== 'PUBLICADO' || !c.versaoPublicadaId) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
        versao = await prisma.comoFazerVersao.findUnique({ where: { id: c.versaoPublicadaId } });
        if (!versao) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    }

    const func = await funcionarioDoContexto(cf);
    let meuTreino = null;
    if (func) {
        const t = await treinoAtual(func.id, c);
        const status = statusTreino(c, t, new Date(), func);
        let confirmadoPor = null;
        if (t?.confirmadoPorFuncionarioId) {
            const q = await prisma.funcionario.findUnique({ where: { id: t.confirmadoPorFuncionarioId }, select: { nome: true } });
            confirmadoPor = q ? { nome: q.nome } : null;
        }
        meuTreino = { status, aprendeuEm: t?.aprendeuEm || null, confirmadoEm: t?.confirmadoEm || null, confirmadoPor };
    }
    let relacionado = null;
    if (c.relacionadoId) {
        const r = await prisma.comoFazerConteudo.findUnique({ where: { id: c.relacionadoId }, select: { id: true, titulo: true, tipo: true, status: true } });
        if (r && r.status === 'PUBLICADO') relacionado = { id: r.id, titulo: r.titulo, tipo: r.tipo };
    }
    return {
        id: c.id, tipo: c.tipo, titulo: c.titulo, icone: c.icone || null, codigo: c.codigo || null,
        setores: c.setores, cargos: c.cargos, exigeConfirmacao: c.exigeConfirmacao,
        encarregados: await resolverEncarregados(c.responsaveisIds),
        versao: { id: versao.id, numero: versao.numero, publicadaEm: versao.publicadaEm, publicadaPor: await resolverPublicadaPor(versao.publicadaPorId), doc: versao.passos && versao.passos.secoes ? versao.passos : schema.docVazio(c.tipo) },
        meuTreino,
        rotina: c.tipo === 'ROTINA' ? { horarios: [...(c.horarios || [])].sort(), recorrencia: c.recorrencia } : null,
        relacionado,
    };
}

// ───────── aprendi ─────────
async function aprendi(cf, id) {
    const c = await conteudoPublicado(id);
    const func = await funcionarioDoContexto(cf);
    if (!func) throw new ErroCF(409, 'SEM_FUNCIONARIO', 'Peça ao RH para ligar seu usuário ao seu cadastro de funcionário.');
    if (!aplica(c, func)) throw new ErroCF(409, 'NAO_SE_APLICA', 'Este conteúdo não é do seu setor ou cargo.');
    const versao = await prisma.comoFazerVersao.findUnique({ where: { id: c.versaoPublicadaId } });
    const existente = await treinoAtual(func.id, c);
    if (existente) return { criado: false, treinamento: { id: existente.id, status: statusTreino(c, existente, new Date(), func) } };
    let t;
    try {
        t = await prisma.comoFazerTreinamento.create({
            data: {
                conteudoId: c.id, versaoId: c.versaoPublicadaId, versaoNumero: versao?.numero || 0,
                versaoTreinoNumero: c.versaoTreinoNumero, ciclo: 1, funcionarioId: func.id,
                origem: cf.origem === 'TABLET' ? 'TABLET' : 'APP', exigeConfirmacao: !!c.exigeConfirmacao,
            },
        });
    } catch (e) {
        if (e.code !== 'P2002') throw e; // clique duplo: outra requisição já gravou
        t = await treinoAtual(func.id, c);
        return { criado: false, treinamento: { id: t.id, status: statusTreino(c, t, new Date(), func) } };
    }
    return { criado: true, treinamento: { id: t.id, status: statusTreino(c, t, new Date(), func) } };
}

// ───────── encarregados e confirmar ─────────
const temPermConfirmar = (vendedor) => {
    if (!vendedor || vendedor.ativo === false) return false;
    let p = vendedor.permissoes;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = {}; } }
    return !!(p && (p.admin === true || p.Pode_Confirmar_Treinamento === true));
};

async function encarregados(cf, setorParam) {
    const func = await funcionarioDoContexto(cf);
    const setor = auth.setorPorCodigo(setorParam)?.codigo || func?.setor || 'COZINHA';
    const lista = await prisma.funcionario.findMany({
        where: { ativo: true, setor, senhaNumerica: true, vendedorId: { not: null } },
        select: { id: true, nome: true, foto: true, vendedor: { select: { permissoes: true, ativo: true } } },
        orderBy: { nome: 'asc' },
    });
    return { encarregados: lista.filter(f => temPermConfirmar(f.vendedor)).map(f => ({ funcionarioId: f.id, nome: f.nome, foto: f.foto || null })) };
}

async function confirmar(cf, id, { treinandoId, encarregadoId, pin }, ip) {
    const c = await conteudoPublicado(id);
    if (!c.exigeConfirmacao) throw new ErroCF(409, 'NAO_EXIGE', 'Este conteúdo não precisa de confirmação do encarregado.');
    const treinando = cf.origem === 'TABLET' ? cf.funcionarioId : (treinandoId || cf.funcionarioId);
    if (cf.origem === 'TABLET' && treinandoId && treinandoId !== cf.funcionarioId) throw new ErroCF(403, 'SEM_PERMISSAO', 'Você só pode confirmar o seu próprio treinamento.');
    if (!treinando) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Informe quem está sendo treinado.');
    if (!encarregadoId) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Escolha o encarregado.');
    if (encarregadoId === treinando) throw new ErroCF(403, 'NAO_PODE_SE_CONFIRMAR', 'Você não pode confirmar o seu próprio treinamento.');

    const treino = await treinoAtual(treinando, c);
    if (!treino) throw new ErroCF(409, 'FALTA_APRENDI', 'Primeiro toque em "Aprendi".');
    if (treino.confirmadoEm) { // idempotente
        const q = treino.confirmadoPorFuncionarioId ? await prisma.funcionario.findUnique({ where: { id: treino.confirmadoPorFuncionarioId }, select: { nome: true } }) : null;
        return { treinamento: { status: 'OK', confirmadoPor: q ? { nome: q.nome } : null, confirmadoEm: treino.confirmadoEm } };
    }

    const enc = await prisma.funcionario.findUnique({
        where: { id: encarregadoId },
        select: { id: true, nome: true, ativo: true, senhaHash: true, senhaNumerica: true, vendedorId: true, vendedor: { select: { id: true, permissoes: true, ativo: true } } },
    });
    if (!enc || !enc.ativo || !enc.vendedorId || !temPermConfirmar(enc.vendedor)) throw new ErroCF(403, 'SEM_PERMISSAO', 'Esta pessoa não pode confirmar treinamentos.');
    if (!enc.senhaNumerica || !enc.senhaHash) throw new ErroCF(409, 'SEM_PIN', 'Esta pessoa ainda não tem senha de 4 números cadastrada.');

    const chaves = [`conf:${enc.id}`, `ip:${ip}`];
    const espera = auth.segundosBloqueado(chaves);
    if (espera > 0) throw new ErroCF(429, 'AGUARDE', 'Espere um pouco e tente de novo.', { segundos: espera });
    const ok = /^\d{4}$/.test(String(pin || '')) && await bcrypt.compare(String(pin), enc.senhaHash);
    if (!ok) {
        console.warn(`[ComoFazer] PIN de encarregado errado encarregado=${enc.id} ip=${ip}`);
        const r = auth.registrarErroPin(chaves);
        if (r.bloqueado) throw new ErroCF(429, 'AGUARDE', 'Muitos erros. Chame o encarregado e espere um pouco.', { segundos: r.segundos });
        throw new ErroCF(401, 'PIN_INCORRETO', 'Número errado.', { tentativasRestantes: r.tentativasRestantes });
    }
    auth.limparErrosPin(chaves);

    const agora = new Date();
    await prisma.$transaction(async (tx) => {
        await tx.comoFazerTreinamento.updateMany({
            where: { id: treino.id, confirmadoEm: null },
            data: { confirmadoEm: agora, confirmadoPorFuncionarioId: enc.id, confirmadoPorVendedorId: enc.vendedorId },
        });
    }, { timeout: 20000, maxWait: 10000 });
    const fresco = await prisma.comoFazerTreinamento.findUnique({ where: { id: treino.id } });
    let porNome = enc.nome;
    if (fresco.confirmadoPorFuncionarioId && fresco.confirmadoPorFuncionarioId !== enc.id) {
        const q = await prisma.funcionario.findUnique({ where: { id: fresco.confirmadoPorFuncionarioId }, select: { nome: true } });
        porNome = q?.nome || enc.nome;
    }
    return { treinamento: { status: 'OK', confirmadoPor: { nome: porNome }, confirmadoEm: fresco.confirmadoEm } };
}

// ───────── execuções ─────────
function numeroDe(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : null; }
    return null;
}
const limiteTxt = (q) => {
    const un = q.unidade ? ` ${q.unidade}` : '';
    if (q.min !== null && q.max !== null) return `${q.min} a ${q.max}${un}`;
    return '';
};

/** calcula respostas normalizadas + desvios a partir da versão publicada. NUNCA confia no cliente. */
function avaliarRespostas(doc, recebidas) {
    const porPasso = new Map((Array.isArray(recebidas) ? recebidas : []).filter(r => r && r.passoId).map(r => [String(r.passoId), r]));
    const respostas = [];
    const desvios = [];
    const faltam = [];
    for (const { passo } of schema.perguntasDoDoc(doc)) {
        const q = passo.pergunta;
        const r = porPasso.get(passo.id);
        const rotulo = q.rotulo || passo.texto;
        if (!r || r.valor === undefined || r.valor === null || r.valor === '') {
            if (q.tipo === 'FOTO') {
                if (r && r.foto) { /* ok, abaixo */ } else { if (q.obrigatoria) faltam.push(passo.id); continue; }
            } else { if (q.obrigatoria) faltam.push(passo.id); continue; }
        }
        const item = { passoId: passo.id, tipo: q.tipo, valor: null, desvio: false };
        if (q.tipo === 'NUMERO') {
            const n = numeroDe(r.valor);
            if (n === null) throw new ErroCF(400, 'VALOR_INVALIDO', `Valor inválido em "${rotulo}".`, { passoId: passo.id });
            item.valor = n;
            if ((q.min !== null && n < q.min) || (q.max !== null && n > q.max)) {
                item.desvio = true;
                item.mensagem = q.avisoDesvio || 'Fora do esperado. Avise o encarregado.';
                desvios.push({ passoId: passo.id, rotulo, mensagem: item.mensagem, valorTxt: `${n}${q.unidade ? ` ${q.unidade}` : ''}`, limite: limiteTxt(q) });
            }
        } else if (q.tipo === 'SIMNAO') {
            const v = String(r.valor).toUpperCase();
            const sim = ['SIM', 'S', 'TRUE', '1'].includes(v);
            const nao = ['NAO', 'NÃO', 'N', 'FALSE', '0'].includes(v);
            if (!sim && !nao) throw new ErroCF(400, 'VALOR_INVALIDO', `Responda sim ou não em "${rotulo}".`, { passoId: passo.id });
            item.valor = sim ? 'SIM' : 'NAO';
            if (item.valor !== (q.respostaEsperada || 'SIM')) {
                item.desvio = true;
                item.mensagem = q.avisoDesvio || 'Resposta fora do esperado. Avise o encarregado.';
                desvios.push({ passoId: passo.id, rotulo, mensagem: item.mensagem, valorTxt: item.valor === 'SIM' ? 'Sim' : 'Não', limite: '' });
            }
        } else if (q.tipo === 'FOTO') {
            if (!schema.midiaValida(r.foto)) {
                if (q.obrigatoria) { faltam.push(passo.id); continue; }
                continue;
            }
            item.foto = r.foto;
        }
        respostas.push(item);
    }
    if (faltam.length) throw new ErroCF(400, 'FALTAM_OBRIGATORIAS', 'Faltam respostas obrigatórias.', { passoIds: faltam });
    return { respostas, desvios };
}

const desviosDe = (doc, respostas) => {
    const rot = new Map(schema.perguntasDoDoc(doc).map(({ passo }) => [passo.id, passo.pergunta.rotulo || passo.texto]));
    return (respostas || []).filter(r => r.desvio).map(r => ({ passoId: r.passoId, rotulo: rot.get(r.passoId) || '', mensagem: r.mensagem || '' }));
};

async function nomeDeQuemFez(exec) {
    if (exec.funcionarioId) { const f = await prisma.funcionario.findUnique({ where: { id: exec.funcionarioId }, select: { nome: true } }); if (f) return f.nome; }
    if (exec.vendedorId) { const v = await prisma.vendedor.findUnique({ where: { id: exec.vendedorId }, select: { nome: true } }); if (v) return v.nome; }
    return null;
}

async function executar(cf, id, body) {
    const { chave, dataRef, horaAlvo: horaBody, tarefaId, respostas } = body || {};
    if (!chave || typeof chave !== 'string' || chave.length < 8 || chave.length > 80) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Falta o código do envio (chave).');

    // idempotência: mesma chave = mesma execução
    const ja = await prisma.comoFazerExecucao.findUnique({ where: { chave }, include: { versao: { select: { passos: true } } } });
    if (ja) return montarRespostaExecucao(ja, ja.versao.passos, false, 200);

    const c = await conteudoPublicado(id);
    if (c.tipo !== 'ROTINA') throw new ErroCF(409, 'NAO_E_ROTINA', 'Este conteúdo não é uma rotina.');
    const hoje = hojeSP();
    const ontem = diasAtras(hoje, -1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef || '') || (dataRef !== hoje && dataRef !== ontem)) throw new ErroCF(400, 'DATA_INVALIDA', 'Data inválida. Abra o checklist de novo.');

    const versao = await prisma.comoFazerVersao.findUnique({ where: { id: c.versaoPublicadaId } });
    const doc = versao.passos;
    const { respostas: respostasOk, desvios } = avaliarRespostas(doc, respostas);

    // horaAlvo: a que veio (precisa ser um horário da rotina) ou a última vencida ainda sem execução
    let horaAlvo = null;
    if (horaBody) {
        if (!(c.horarios || []).includes(horaBody)) throw new ErroCF(400, 'HORA_INVALIDA', 'Horário inválido para esta rotina.');
        horaAlvo = horaBody;
    } else if ((c.horarios || []).length) {
        const feitas = (await execucoesDoDia([c.id], dataRef)).get(c.id);
        const agora = dataRef === hoje ? minutosDe(horaSP()) : 24 * 60;
        const vencidas = [...c.horarios].sort().filter(h => minutosDe(h) <= agora && !(feitas && feitas.has(h)));
        horaAlvo = vencidas.length ? vencidas[vencidas.length - 1] : null;
    }

    let exec;
    try {
        exec = await prisma.comoFazerExecucao.create({
            data: {
                chave, conteudoId: c.id, versaoId: versao.id, versaoNumero: versao.numero,
                funcionarioId: cf.funcionarioId || null, vendedorId: cf.vendedorId || null,
                dataRef, horaAlvo, tarefaId: tarefaId ? String(tarefaId) : null,
                respostas: respostasOk, temDesvio: desvios.length > 0,
            },
        });
    } catch (e) {
        if (e.code === 'P2002') { // duas requisições com a mesma chave ao mesmo tempo
            const outra = await prisma.comoFazerExecucao.findUnique({ where: { chave }, include: { versao: { select: { passos: true } } } });
            if (outra) return montarRespostaExecucao(outra, outra.versao.passos, false, 200);
        }
        throw e;
    }

    // depois de gravar (FORA de transação, cada passo com seu try/catch): agenda não desfaz a execução
    try { await agenda.concluirTarefasDaExecucao({ conteudoId: c.id, dataRef, horaAlvo }); }
    catch (e) { console.error('[ComoFazer] concluir tarefas da execução (execução já gravada):', e.message); }

    let tarefaDesvio = { criada: false };
    if (desvios.length) {
        try {
            const quemFez = await nomeDeQuemFez(exec);
            const r = await agenda.criarTarefaDesvio({ execucao: exec, conteudo: c, desvios, quemFez });
            tarefaDesvio = { criada: r.criada };
            if (r.ids.length) exec = await prisma.comoFazerExecucao.update({ where: { id: exec.id }, data: { desvioTarefaIds: r.ids } });
        } catch (e) { console.error('[ComoFazer] tarefa de desvio (execução já gravada):', e.message); }
    }
    return montarRespostaExecucao(exec, doc, tarefaDesvio.criada, 201);
}

function montarRespostaExecucao(exec, doc, tarefaCriada, status) {
    return {
        status,
        corpo: {
            execucao: { id: exec.id, temDesvio: exec.temDesvio, desvios: desviosDe(doc, exec.respostas) },
            tarefaDesvio: { criada: !!tarefaCriada },
        },
    };
}

async function execucoesHoje(id) {
    const hoje = hojeSP();
    const lista = await prisma.comoFazerExecucao.findMany({ where: { conteudoId: id, dataRef: hoje }, orderBy: { concluidaEm: 'asc' } });
    const feitas = [];
    for (const e of lista) feitas.push({ horaAlvo: e.horaAlvo, execucaoId: e.id, por: await nomeDeQuemFez(e), em: e.concluidaEm, temDesvio: e.temDesvio });
    return { dataRef: hoje, feitas };
}

// ───────── chamar encarregado (anti-spam em memória) ─────────
const chamados = new Map(); // `${conteudoId}|${quem}` -> timestamp
async function chamarEncarregado(cf, id, secaoId) {
    const c = await conteudoPublicado(id);
    const func = await funcionarioDoContexto(cf);
    let quem = func?.nome;
    if (!quem && cf.vendedorId) quem = (await prisma.vendedor.findUnique({ where: { id: cf.vendedorId }, select: { nome: true } }))?.nome;
    quem = quem || 'Alguém';
    for (const [kk, ts] of chamados) { if (Date.now() - ts > 10 * 60 * 1000) chamados.delete(kk); } // limpeza
    const k = `${c.id}|${func?.id || cf.vendedorId}`;
    const ultimo = chamados.get(k) || 0;
    if (Date.now() - ultimo < 2 * 60 * 1000) throw new ErroCF(429, 'AGUARDE', 'O encarregado já foi avisado. Espere um pouco.', { segundos: Math.ceil((2 * 60 * 1000 - (Date.now() - ultimo)) / 1000) });
    if (!(c.responsaveisIds || []).length) throw new ErroCF(409, 'SEM_ENCARREGADO', 'Este conteúdo ainda não tem encarregado definido.');
    let secaoTitulo = null;
    if (secaoId) {
        const v = await prisma.comoFazerVersao.findUnique({ where: { id: c.versaoPublicadaId }, select: { passos: true } });
        secaoTitulo = (v?.passos?.secoes || []).find(s => s.id === secaoId)?.titulo || null;
    }
    const r = await agenda.criarTarefaChamado({ conteudo: c, quemPediu: quem, secaoTitulo });
    if (!r.ids.length) throw new ErroCF(409, 'SEM_ENCARREGADO', 'Nenhum encarregado ativo para avisar.');
    chamados.set(k, Date.now());
    return { tarefaId: r.ids[0], tarefaIds: r.ids };
}

// ───────── admin: criar / editar / rascunho / publicar ─────────
const SETORES_COD = auth.SETORES.map(s => s.codigo);
const RECORR = ['NUNCA', 'DIARIA', 'DIAS_UTEIS', 'SEMANAL', 'MENSAL', 'DIAS_SEMANA'];
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function metadadosValidos(b, parcial = false) {
    const out = {};
    const tem = (k) => b[k] !== undefined;
    if (!parcial || tem('titulo')) {
        const t = String(b.titulo || '').trim();
        if (!t) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Informe o título.');
        out.titulo = t.slice(0, 120);
    }
    if (tem('icone')) out.icone = b.icone ? String(b.icone).slice(0, 8) : null;
    if (tem('codigo')) out.codigo = b.codigo ? String(b.codigo).trim().toUpperCase().slice(0, 40) : null;
    if (tem('ordem')) out.ordem = Number.isInteger(Number(b.ordem)) ? Number(b.ordem) : 0;
    if (tem('setores')) {
        const s = [...new Set((Array.isArray(b.setores) ? b.setores : []).map(x => String(x).toUpperCase()))];
        if (s.some(x => !SETORES_COD.includes(x))) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Setor inválido.');
        out.setores = s;
    }
    if (tem('cargos')) out.cargos = [...new Set((Array.isArray(b.cargos) ? b.cargos : []).map(x => String(x).trim()).filter(Boolean))];
    if (tem('horarios')) {
        const h = [...new Set((Array.isArray(b.horarios) ? b.horarios : []).map(x => String(x).trim()))];
        if (h.some(x => !RE_HORA.test(x))) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Horário inválido (use HH:MM).');
        out.horarios = h.sort();
    }
    if (tem('recorrencia')) {
        if (!RECORR.includes(b.recorrencia)) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Repetição inválida.');
        out.recorrencia = b.recorrencia;
    }
    if (tem('diasSemana')) out.diasSemana = [...new Set((Array.isArray(b.diasSemana) ? b.diasSemana : []).map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (tem('responsaveisIds')) out.responsaveisIds = [...new Set((Array.isArray(b.responsaveisIds) ? b.responsaveisIds : []).map(String))];
    if (tem('relacionadoId')) out.relacionadoId = b.relacionadoId ? String(b.relacionadoId) : null;
    return out;
}

async function criarConteudo(cf, body) {
    const tipo = String(body?.tipo || '').toUpperCase();
    if (!schema.TIPOS.includes(tipo)) throw new ErroCF(400, 'DADOS_INVALIDOS', 'Tipo inválido.');
    const meta = metadadosValidos(body);
    if (meta.codigo) {
        const dup = await prisma.comoFazerConteudo.findUnique({ where: { codigo: meta.codigo } });
        if (dup) throw new ErroCF(409, 'CODIGO_REPETIDO', 'Já existe um conteúdo com esse código.');
    }
    const criado = await prisma.comoFazerConteudo.create({
        data: {
            tipo, ...meta, exigeConfirmacao: ['MAQUINA', 'REGRA'].includes(tipo), criadoPorId: cf.vendedorId,
            versoes: { create: { numero: 1, status: 'RASCUNHO', passos: schema.docVazio(tipo) } },
        },
    });
    return { id: criado.id };
}

async function atualizarConteudo(cf, id, body) {
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    const meta = metadadosValidos(body || {}, true);
    if (meta.codigo && meta.codigo !== c.codigo) {
        const dup = await prisma.comoFazerConteudo.findUnique({ where: { codigo: meta.codigo } });
        if (dup && dup.id !== id) throw new ErroCF(409, 'CODIGO_REPETIDO', 'Já existe um conteúdo com esse código.');
    }
    // "não feita" não é retroativa: horário novo (ou recorrência/dias mudados) só conta daqui para frente
    if (c.status === 'PUBLICADO' && (meta.horarios !== undefined || meta.recorrencia !== undefined || meta.diasSemana !== undefined)) {
        const igual = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
        const mudouRegra = (meta.recorrencia !== undefined && meta.recorrencia !== c.recorrencia) || (meta.diasSemana !== undefined && !igual(meta.diasSemana, c.diasSemana));
        meta.horariosDesde = calcularHorariosDesde(c, meta.horarios ?? c.horarios, mudouRegra);
    }
    const novo = await prisma.comoFazerConteudo.update({ where: { id }, data: meta });
    let agendaRes = null;
    const mudouAgenda = ['horarios', 'recorrencia', 'diasSemana', 'responsaveisIds', 'titulo'].some(k => meta[k] !== undefined);
    if (novo.status === 'PUBLICADO' && mudouAgenda) {
        try { agendaRes = await agenda.sincronizarTarefasDaRotina(novo, cf.vendedorId); }
        catch (e) { console.error('[ComoFazer] sincronizar agenda (metadados já salvos):', e.message); agendaRes = { ok: false, erro: 'Não consegui atualizar a agenda. Use "Refazer agenda".' }; }
    }
    return { conteudo: novo, agenda: agendaRes };
}

async function rascunhoDe(conteudoId) {
    return prisma.comoFazerVersao.findFirst({ where: { conteudoId, status: 'RASCUNHO' }, orderBy: { numero: 'desc' } });
}

async function salvarRascunho(cf, id, docBruto) {
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    if (!docBruto || typeof docBruto !== 'object') throw new ErroCF(400, 'DADOS_INVALIDOS', 'Documento inválido.');
    const { doc, avisos, erros } = schema.processarDoc(docBruto, c);
    let rasc = await rascunhoDe(id);
    if (!rasc) {
        const max = await prisma.comoFazerVersao.aggregate({ where: { conteudoId: id }, _max: { numero: true } });
        try {
            rasc = await prisma.comoFazerVersao.create({ data: { conteudoId: id, numero: (max._max.numero || 0) + 1, status: 'RASCUNHO', passos: doc } });
        } catch (e) {
            if (e.code !== 'P2002') throw e; // dois autosaves criando o rascunho juntos
            rasc = await rascunhoDe(id);
        }
    }
    await prisma.comoFazerVersao.update({ where: { id: rasc.id }, data: { passos: doc } });
    return { doc, avisos, erros };
}

async function publicar(cf, id, { zeraTreinamento = true } = {}) {
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    const rasc = await rascunhoDe(id);
    if (!rasc) throw new ErroCF(409, 'SEM_RASCUNHO', 'Não há alterações para publicar.');
    const { doc, erros } = schema.processarDoc(rasc.passos, c);
    if (erros.length) throw new ErroCF(400, 'VALIDACAO_FALHOU', erros[0], { erros });
    // rotina com horário precisa de ao menos 1 encarregado ATIVO (senão ninguém recebe o alarme)
    if (c.tipo === 'ROTINA' && (c.horarios || []).length && (c.responsaveisIds || []).length) {
        const ativos = await prisma.vendedor.count({ where: { id: { in: c.responsaveisIds }, ativo: true } });
        if (ativos === 0) {
            erros.push('Nenhum encarregado ativo: os escolhidos estão inativos ou não existem. Escolha um encarregado ativo.');
            throw new ErroCF(400, 'VALIDACAO_FALHOU', erros[0], { erros });
        }
    }
    const zera = zeraTreinamento !== false;
    const horariosDesde = calcularHorariosDesde(c, c.horarios || [], c.status !== 'PUBLICADO'); // reativar arquivado recomeça de agora

    const agora = new Date();
    await prisma.$transaction(async (tx) => {
        // trava contra clique duplo: só quem ainda encontra o rascunho como RASCUNHO publica
        const r = await tx.comoFazerVersao.updateMany({
            where: { id: rasc.id, status: 'RASCUNHO' },
            data: { status: 'PUBLICADA', passos: doc, zeraTreinamento: zera, publicadaEm: agora, publicadaPorId: cf.vendedorId },
        });
        if (r.count === 0) throw new ErroCF(409, 'SEM_RASCUNHO', 'Não há alterações para publicar.');
        await tx.comoFazerVersao.updateMany({ where: { conteudoId: id, status: 'PUBLICADA', id: { not: rasc.id } }, data: { status: 'SUBSTITUIDA' } });
        await tx.comoFazerConteudo.update({
            where: { id },
            data: {
                status: 'PUBLICADO', versaoPublicadaId: rasc.id, horariosDesde,
                ...(zera ? { versaoTreinoNumero: { increment: 1 } } : {}),
                ...(c.primeiraPublicacaoEm ? {} : { primeiraPublicacaoEm: agora }),
            },
        });
    }, { timeout: 20000, maxWait: 10000 });

    const atualizado = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    let agendaRes;
    try { agendaRes = await agenda.sincronizarTarefasDaRotina(atualizado, cf.vendedorId); }
    catch (e) { console.error('[ComoFazer] sincronizar agenda após publicar (publicação vale):', e.message); agendaRes = { ok: false, criadas: 0, desativadas: 0, erro: 'A publicação valeu, mas não consegui montar a agenda. Use "Refazer agenda".' }; }
    return { versao: { numero: rasc.numero }, agenda: agendaRes };
}

async function arquivar(cf, id) {
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    const novo = await prisma.comoFazerConteudo.update({ where: { id }, data: { status: 'ARQUIVADO', horariosDesde: {} } });
    let agendaRes = null;
    try { agendaRes = await agenda.sincronizarTarefasDaRotina(novo, cf.vendedorId); }
    catch (e) { console.error('[ComoFazer] sincronizar agenda ao arquivar:', e.message); agendaRes = { ok: false, erro: 'Arquivado, mas a agenda não foi atualizada.' }; }
    return { ok: true, agenda: agendaRes };
}

async function sincronizarAgenda(cf, id) {
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    return agenda.sincronizarTarefasDaRotina(c, cf.vendedorId);
}

async function listarAdmin({ tipo, setor, status }) {
    const where = {};
    if (tipo) where.tipo = String(tipo).toUpperCase();
    if (status) where.status = String(status).toUpperCase();
    if (setor) where.setores = { has: String(setor).toUpperCase() };
    const lista = await prisma.comoFazerConteudo.findMany({
        where, orderBy: [{ ordem: 'asc' }, { titulo: 'asc' }],
        include: { versoes: { select: { id: true, numero: true, status: true, passos: true }, orderBy: { numero: 'desc' } } },
    });
    const tarefasAtivas = await prisma.tarefa.groupBy({
        by: ['origemRef'], where: { origem: 'COMO_FAZER', ativo: true, origemRef: { in: lista.map(c => c.id) } }, _count: { _all: true },
    });
    const ativasPor = new Map(tarefasAtivas.map(t => [t.origemRef, t._count._all]));
    return {
        conteudos: lista.map(c => {
            const rasc = c.versoes.find(v => v.status === 'RASCUNHO');
            const pub = c.versoes.find(v => v.id === c.versaoPublicadaId);
            const atual = rasc || pub || c.versoes[0];
            let agendaInfo = null;
            if (c.tipo === 'ROTINA') {
                const esperado = c.status === 'PUBLICADO' ? (c.horarios || []).length * (c.responsaveisIds || []).length : 0;
                agendaInfo = { ok: (ativasPor.get(c.id) || 0) === esperado };
            }
            return {
                id: c.id, tipo: c.tipo, codigo: c.codigo, titulo: c.titulo, icone: c.icone, setores: c.setores, cargos: c.cargos,
                status: c.status, ordem: c.ordem, versaoAtual: pub?.numero ?? null, temRascunho: !!rasc,
                semFoto: schema.contarSemFoto(atual?.passos), agenda: agendaInfo,
            };
        }),
    };
}

async function detalheAdmin(id) {
    const c = await prisma.comoFazerConteudo.findUnique({
        where: { id }, include: { versoes: { orderBy: { numero: 'desc' } } },
    });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    const rasc = c.versoes.find(v => v.status === 'RASCUNHO');
    const pub = c.versoes.find(v => v.id === c.versaoPublicadaId);
    const atual = rasc || pub || c.versoes[0];
    const { versoes, ...meta } = c;
    const proc = atual ? schema.processarDoc(atual.passos, c) : { doc: schema.docVazio(c.tipo), avisos: [], erros: [] };
    return {
        ...meta,
        doc: proc.doc, avisos: proc.avisos, erros: proc.erros,
        encarregados: await resolverEncarregados(c.responsaveisIds),
        versaoAtual: atual ? { id: atual.id, numero: atual.numero, status: atual.status, publicadaEm: atual.publicadaEm || null, publicadaPor: await resolverPublicadaPor(atual.publicadaPorId) } : null,
        versoes: versoes.map(v => ({ id: v.id, numero: v.numero, status: v.status, publicadaEm: v.publicadaEm })),
    };
}

module.exports = {
    ErroCF, aplica, statusTreino, STATUS_FALTA, rotinaAgora, execucoesDoDia, pseudoTarefa, nomeDeQuemFez, funcionarioDoContexto,
    me, home, abrirConteudo, aprendi, encarregados, confirmar, executar, execucoesHoje, chamarEncarregado,
    criarConteudo, atualizarConteudo, salvarRascunho, publicar, arquivar, sincronizarAgenda, listarAdmin, detalheAdmin,
    temPermConfirmar, diasAtras, dataSP, horarioDesde, resolverEncarregados, resolverPublicadaPor,
};
