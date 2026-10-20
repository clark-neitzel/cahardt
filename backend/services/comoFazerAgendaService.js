// Como Fazer ↔ Tarefas (agenda). Grava direto em `tarefa` / `tarefaOcorrencia`.
// Tudo IDEMPOTENTE e chamado FORA de transação (quem chama trata o erro: falha aqui nunca
// desfaz publicação nem execução). NUNCA envia WhatsApp.
const prisma = require('../config/database');
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');

// ───────── data/hora em São Paulo ─────────
const hojeSP = (d) => getDataReferencia(d);
function horaSP(d = new Date()) {
    const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    const h = partes.find(p => p.type === 'hour').value.replace('24', '00');
    const m = partes.find(p => p.type === 'minute').value;
    return `${h}:${m}`;
}
/** instante em SP como texto 'YYYY-MM-DDTHH:MM' (comparável como string) */
const instanteSP = (d = new Date()) => `${hojeSP(d)}T${horaSP(d)}`;
const minutosDe = (hhmm) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
/** HH:MM de "agora + n minutos" no dia de hoje (se virar o dia, trava em 23:59) */
function horaMaisMinutos(n) {
    const alvo = minutosDe(horaSP()) + n;
    if (alvo >= 24 * 60) return '23:59';
    return `${String(Math.floor(alvo / 60)).padStart(2, '0')}:${String(alvo % 60).padStart(2, '0')}`;
}

const nomeDesvio = (s, max = 120) => String(s || '').slice(0, max);

async function vendedoresAtivos(ids) {
    if (!ids?.length) return [];
    return prisma.vendedor.findMany({ where: { id: { in: ids }, ativo: true }, select: { id: true, nome: true, permissoes: true } });
}

const temPainel = (v) => {
    let p = v.permissoes;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = {}; } }
    return !!(p && (p.admin === true || p.Pode_Ver_Painel_Como_Fazer === true));
};

/**
 * Garante 1 Tarefa recorrente por (horário × encarregado) para a rotina PUBLICADA; desativa
 * (ativo=false, nunca deleta) o que sobrou. Rodar 2× produz o mesmo estado.
 * `conteudo` = linha de ComoFazerConteudo. `usuarioId` = Vendedor.id de quem disparou (criador das tarefas novas).
 */
async function sincronizarTarefasDaRotina(conteudo, usuarioId) {
    const existentes = await prisma.tarefa.findMany({ where: { origem: 'COMO_FAZER', origemRef: conteudo.id } });

    let desejadas = [];
    if (conteudo.tipo === 'ROTINA' && conteudo.status === 'PUBLICADO' && (conteudo.horarios || []).length > 0) {
        const resp = await vendedoresAtivos(conteudo.responsaveisIds || []);
        for (const hora of conteudo.horarios) for (const v of resp) desejadas.push({ hora, responsavelId: v.id });
    }
    const precisaDeAlarme = conteudo.tipo === 'ROTINA' && conteudo.status === 'PUBLICADO' && (conteudo.horarios || []).length > 0;
    const chave = (hora, resp) => `${hora}|${resp}`;
    const setDesejado = new Set(desejadas.map(d => chave(d.hora, d.responsavelId)));
    const porChave = new Map();
    for (const t of existentes) porChave.set(chave(t.hora, t.responsavelId), t);

    const hoje = hojeSP();
    const dias = conteudo.recorrencia === 'DIAS_SEMANA' ? (conteudo.diasSemana || []) : [];
    let criadas = 0, desativadas = 0, atualizadas = 0;

    for (const d of desejadas) {
        const ex = porChave.get(chave(d.hora, d.responsavelId));
        if (!ex) {
            await prisma.tarefa.create({
                data: {
                    titulo: conteudo.titulo,
                    descricao: 'Toque em Fazer agora para preencher o checklist.',
                    dataInicio: hoje,
                    hora: d.hora,
                    recorrencia: conteudo.recorrencia || 'NUNCA',
                    diasSemana: dias,
                    insistir: true,
                    criadoPorId: usuarioId || conteudo.criadoPorId || d.responsavelId,
                    responsavelId: d.responsavelId,
                    origem: 'COMO_FAZER',
                    origemRef: conteudo.id,
                },
            });
            criadas++;
        } else {
            const mudou = !ex.ativo || ex.recorrencia !== (conteudo.recorrencia || 'NUNCA')
                || ex.titulo !== conteudo.titulo || JSON.stringify(ex.diasSemana || []) !== JSON.stringify(dias);
            if (mudou) {
                await prisma.tarefa.update({
                    where: { id: ex.id },
                    data: {
                        ativo: true,
                        titulo: conteudo.titulo,
                        recorrencia: conteudo.recorrencia || 'NUNCA',
                        diasSemana: dias,
                        ...(ex.ativo ? {} : { dataInicio: hoje }), // reativada: conta de hoje em diante
                    },
                });
                atualizadas++;
            }
        }
    }
    for (const t of existentes) {
        if (t.ativo && !setDesejado.has(chave(t.hora, t.responsavelId))) {
            await prisma.tarefa.update({ where: { id: t.id }, data: { ativo: false } });
            desativadas++;
        }
    }
    // há horário mas ninguém ativo para receber: não pode parecer que deu certo
    if (precisaDeAlarme && desejadas.length === 0) {
        return { ok: false, criadas, desativadas, atualizadas, erro: 'Nenhum encarregado ativo para receber os avisos desta rotina. Escolha um encarregado ativo.' };
    }
    return { ok: true, criadas, desativadas, atualizadas };
}

/** Marca como CONCLUIDA a ocorrência do dia das tarefas da rotina (todas as encarregadas). */
async function concluirTarefasDaExecucao({ conteudoId, dataRef, horaAlvo }) {
    if (!horaAlvo) return 0;
    const tarefas = await prisma.tarefa.findMany({
        where: { origem: 'COMO_FAZER', origemRef: conteudoId, hora: horaAlvo, ativo: true },
        select: { id: true },
    });
    const agora = new Date();
    const hhmm = horaSP(agora);
    for (const t of tarefas) {
        const ex = await prisma.tarefaOcorrencia.findUnique({ where: { tarefaId_dataRef: { tarefaId: t.id, dataRef } } });
        if (ex?.status === 'CONCLUIDA') continue;
        await prisma.tarefaOcorrencia.upsert({
            where: { tarefaId_dataRef: { tarefaId: t.id, dataRef } },
            create: { tarefaId: t.id, dataRef, status: 'CONCLUIDA', concluidaEm: agora, concluidaHora: hhmm },
            update: { status: 'CONCLUIDA', concluidaEm: agora, concluidaHora: hhmm },
        });
    }
    return tarefas.length;
}

// cria (ou reaproveita, por origem+origemRef+responsavel) uma tarefa avulsa de hoje
async function tarefaAvulsa({ origem, origemRef, titulo, descricao, responsavelId, criadoPorId, linkPainel }) {
    const ja = await prisma.tarefa.findFirst({ where: { origem, origemRef, responsavelId } });
    if (ja) return { id: ja.id, criada: false };
    const t = await prisma.tarefa.create({
        data: {
            titulo: nomeDesvio(titulo, 200), descricao, dataInicio: hojeSP(), hora: horaMaisMinutos(1),
            recorrencia: 'NUNCA', diasSemana: [], insistir: true,
            criadoPorId: criadoPorId || responsavelId, responsavelId, origem, origemRef,
        },
    });
    if (linkPainel) {
        try {
            await prisma.tarefaAnexo.create({ data: { tarefaId: t.id, tipo: 'LINK', nome: 'Ver no painel', url: linkPainel } });
        } catch (e) { console.error('[ComoFazer] anexo da tarefa:', e.message); }
    }
    return { id: t.id, criada: true };
}

/**
 * Tarefa de DESVIO para cada encarregado. `desvios` = [{ rotulo, mensagem, valor, limite }].
 * Idempotente por (origemRef = execucaoId, responsável). Devolve { ids:[], criada:boolean }.
 */
async function criarTarefaDesvio({ execucao, conteudo, desvios, quemFez }) {
    const resp = await vendedoresAtivos(conteudo.responsaveisIds || []);
    const ids = [];
    let criada = false;
    const primeiro = desvios[0];
    for (const v of resp) {
        const linhas = desvios.map(d => `• ${d.rotulo}: ${d.valorTxt}${d.limite ? ` (esperado ${d.limite})` : ''}${d.mensagem ? ` — ${d.mensagem}` : ''}`);
        const r = await tarefaAvulsa({
            origem: 'COMO_FAZER_DESVIO', origemRef: execucao.id,
            titulo: `Desvio: ${conteudo.titulo} — ${primeiro.rotulo} ${primeiro.valorTxt}`,
            descricao: `${linhas.join('\n')}\nFeito por: ${quemFez || 'não identificado'} às ${horaSP()} (${execucao.dataRef}).`,
            responsavelId: v.id, criadoPorId: v.id,
            linkPainel: temPainel(v) ? `/rh/como-fazer?aba=rotinas&execucao=${execucao.id}` : null,
        });
        ids.push(r.id);
        if (r.criada) criada = true;
    }
    return { ids, criada };
}

/** Chamado "preciso do encarregado" (máquina) — uma tarefa por encarregado. */
async function criarTarefaChamado({ conteudo, quemPediu, secaoTitulo }) {
    const resp = await vendedoresAtivos(conteudo.responsaveisIds || []);
    const ids = [];
    const ref = `${conteudo.id}`;
    for (const v of resp) {
        // chamados repetidos são permitidos (o anti-spam está na rota); cada um é uma tarefa nova
        const t = await prisma.tarefa.create({
            data: {
                titulo: nomeDesvio(`Chamado: ${conteudo.titulo} — ${quemPediu}`, 200),
                descricao: `${quemPediu} está chamando o encarregado${secaoTitulo ? ` (situação: ${secaoTitulo})` : ''}.`,
                dataInicio: hojeSP(), hora: horaMaisMinutos(1), recorrencia: 'NUNCA', diasSemana: [], insistir: true,
                criadoPorId: v.id, responsavelId: v.id, origem: 'COMO_FAZER_CHAMADO', origemRef: ref,
            },
        });
        ids.push(t.id);
    }
    return { ids };
}

/** Lembrete de treinamento pendente para o usuário ligado à pessoa. */
async function criarTarefaLembrete({ conteudo, vendedorAlvoId, criadoPorId }) {
    const r = await tarefaAvulsa({
        origem: 'COMO_FAZER_LEMBRETE', origemRef: `${conteudo.id}:${hojeSP()}`,
        titulo: `Treinamento pendente: ${conteudo.titulo}`,
        descricao: 'Abra o Como Fazer e faça o treinamento.',
        responsavelId: vendedorAlvoId, criadoPorId,
    });
    return r;
}

module.exports = {
    hojeSP, horaSP, instanteSP, minutosDe, horaMaisMinutos,
    sincronizarTarefasDaRotina, concluirTarefasDaExecucao,
    criarTarefaDesvio, criarTarefaChamado, criarTarefaLembrete,
};
