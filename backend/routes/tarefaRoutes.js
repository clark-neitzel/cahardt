const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const prisma = require('../config/database');
const uploadTarefa = require('../middlewares/uploadTarefaMiddleware');

// ─────────────────────────────────────────────────────────────
// Tarefas da Equipe — agenda com alerta sonoro no horário.
//
// Convenções de data/hora: tudo em texto no fuso LOCAL do usuário
// ('YYYY-MM-DD' e 'HH:MM'). O relógio que vale é o do aparelho de quem
// recebe o alerta — o frontend sempre manda sua data/hora local.
//
// Regras de edição/exclusão:
//   - tarefa criada pelo Admin  → só admin edita/exclui (responsável só conclui)
//   - tarefa criada por si      → o criador e o admin
//   - tarefa criada por colega  → o criador e o admin
//
// Permissões (JSON `permissoes` do Vendedor):
//   - Pode_Criar_Tarefas_Para_Outros → criar tarefa com responsável ≠ si mesmo
//   - Pode_Ver_Agenda_Colegas        → ver agenda de outros (somente leitura)
//   - Pode_Ver_Parecer_Tarefas       → relatório "parecer do dia"
// ─────────────────────────────────────────────────────────────

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;
const RECORRENCIAS = ['NUNCA', 'DIARIA', 'DIAS_UTEIS', 'SEMANAL', 'MENSAL'];
const TOLERANCIA_MIN = 15; // concluída até 15 min após o horário conta como "no horário"

const isAdmin = (req) => !!req.user?.permissoes?.admin;
const podeCriarParaOutros = (req) => isAdmin(req) || !!req.user?.permissoes?.Pode_Criar_Tarefas_Para_Outros;
const podeVerAgendaColegas = (req) => isAdmin(req) || !!req.user?.permissoes?.Pode_Ver_Agenda_Colegas;
const podeVerParecer = (req) => isAdmin(req) || !!req.user?.permissoes?.Pode_Ver_Parecer_Tarefas;

const minutos = (hhmm) => {
    const [h, m] = String(hhmm || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

// dia da semana de 'YYYY-MM-DD' sem depender do fuso do servidor (0=dom ... 6=sáb)
const diaSemana = (dataStr) => new Date(`${dataStr}T12:00:00Z`).getUTCDay();

// a tarefa "toca" no dia dataRef?
function ocorreNoDia(tarefa, dataRef) {
    if (dataRef < tarefa.dataInicio) return false;
    if (tarefa.recorrenciaFim && dataRef > tarefa.recorrenciaFim) return false;
    switch (tarefa.recorrencia) {
        case 'NUNCA': return dataRef === tarefa.dataInicio;
        case 'DIARIA': return true;
        case 'DIAS_UTEIS': {
            const d = diaSemana(dataRef);
            return d >= 1 && d <= 5;
        }
        case 'SEMANAL': return diaSemana(dataRef) === diaSemana(tarefa.dataInicio);
        case 'MENSAL': return dataRef.slice(8) === tarefa.dataInicio.slice(8);
        default: return false;
    }
}

// lista de datas 'YYYY-MM-DD' entre de..ate (inclusive), com trava de tamanho
function datasDoIntervalo(de, ate, maxDias = 62) {
    const datas = [];
    const d = new Date(`${de}T12:00:00Z`);
    const fim = new Date(`${ate}T12:00:00Z`);
    while (d <= fim && datas.length < maxDias) {
        datas.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return datas;
}

const parsePerms = (p) => {
    if (!p) return {};
    if (typeof p === 'string') { try { return JSON.parse(p); } catch { return {}; } }
    return p;
};

const resumoTarefa = (t, req) => ({
    id: t.id,
    titulo: t.titulo,
    descricao: t.descricao,
    dataInicio: t.dataInicio,
    hora: t.hora,
    recorrencia: t.recorrencia,
    recorrenciaFim: t.recorrenciaFim,
    insistir: t.insistir,
    criadoPor: t.criadoPor ? { id: t.criadoPor.id, nome: t.criadoPor.nome } : null,
    responsavel: t.responsavel ? { id: t.responsavel.id, nome: t.responsavel.nome } : null,
    criadaPeloAdmin: !!parsePerms(t.criadoPorPermissoes).admin,
    anexos: (t.anexos || []).map(a => ({ id: a.id, tipo: a.tipo, nome: a.nome, url: a.url })),
    podeEditar: isAdmin(req) || t.criadoPorId === req.user.id,
});

// busca a tarefa e resolve se o usuário pode editar/excluir
async function carregarComPermissaoDeEdicao(req, res) {
    const tarefa = await prisma.tarefa.findUnique({
        where: { id: req.params.id },
        include: { criadoPor: { select: { id: true, nome: true, permissoes: true } } },
    });
    if (!tarefa) {
        res.status(404).json({ error: 'Tarefa não encontrada.' });
        return null;
    }
    if (!isAdmin(req) && tarefa.criadoPorId !== req.user.id) {
        res.status(403).json({ error: 'Só quem criou a tarefa (ou o administrador) pode alterá-la.' });
        return null;
    }
    return tarefa;
}

// ── GET /equipe — nomes para o seletor "para quem" e filtro de agenda ──
router.get('/equipe', async (req, res) => {
    try {
        const vendedores = await prisma.vendedor.findMany({
            where: { ativo: true, login: { not: null } },
            select: { id: true, nome: true },
            orderBy: { nome: 'asc' },
        });
        res.json(vendedores);
    } catch (error) {
        console.error('[Tarefas] Erro ao listar equipe:', error);
        res.status(500).json({ error: 'Erro ao listar equipe.' });
    }
});

// ── GET / — agenda (expande recorrências em ocorrências por dia) ──
// ?de=YYYY-MM-DD&ate=YYYY-MM-DD&vendedorId=<id|todos> (padrão: o próprio usuário)
router.get('/', async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!RE_DATA.test(de || '') || !RE_DATA.test(ate || '') || de > ate) {
            return res.status(400).json({ error: 'Informe o período: ?de=YYYY-MM-DD&ate=YYYY-MM-DD.' });
        }
        const vendedorId = req.query.vendedorId || req.user.id;
        if (vendedorId !== req.user.id && !podeVerAgendaColegas(req)) {
            return res.status(403).json({ error: 'Sem permissão para ver a agenda de colegas.' });
        }

        const whereResp = vendedorId === 'todos' ? {} : { responsavelId: vendedorId };
        const tarefas = await prisma.tarefa.findMany({
            where: {
                ativo: true,
                ...whereResp,
                OR: [
                    { recorrencia: 'NUNCA', dataInicio: { gte: de, lte: ate } },
                    { recorrencia: { not: 'NUNCA' }, dataInicio: { lte: ate } },
                ],
            },
            include: {
                criadoPor: { select: { id: true, nome: true, permissoes: true } },
                responsavel: { select: { id: true, nome: true } },
                anexos: true,
                ocorrencias: { where: { dataRef: { gte: de, lte: ate } } },
            },
        });

        const datas = datasDoIntervalo(de, ate);
        const ocorrencias = [];
        for (const t of tarefas) {
            const base = resumoTarefa({ ...t, criadoPorPermissoes: t.criadoPor?.permissoes }, req);
            for (const dataRef of datas) {
                if (!ocorreNoDia(t, dataRef)) continue;
                const oc = t.ocorrencias.find(o => o.dataRef === dataRef);
                ocorrencias.push({
                    ...base,
                    dataRef,
                    status: oc?.status === 'CONCLUIDA' ? 'CONCLUIDA' : 'PENDENTE',
                    concluidaHora: oc?.concluidaHora || null,
                    adiamentos: oc?.adiamentos || 0,
                });
            }
        }
        ocorrencias.sort((a, b) => (a.dataRef + a.hora).localeCompare(b.dataRef + b.hora));
        res.json({ ocorrencias });
    } catch (error) {
        console.error('[Tarefas] Erro ao listar agenda:', error);
        res.status(500).json({ error: 'Erro ao carregar a agenda.' });
    }
});

// ── GET /pendentes — o que já "tocou" e não foi concluído (para o pop-up) ──
// ?data=YYYY-MM-DD&hora=HH:MM (data/hora LOCAIS do aparelho do usuário)
router.get('/pendentes', async (req, res) => {
    try {
        const { data, hora } = req.query;
        if (!RE_DATA.test(data || '') || !RE_HORA.test(hora || '')) {
            return res.status(400).json({ error: 'Informe ?data=YYYY-MM-DD&hora=HH:MM.' });
        }
        const tarefas = await prisma.tarefa.findMany({
            where: {
                ativo: true,
                responsavelId: req.user.id,
                dataInicio: { lte: data },
            },
            include: {
                criadoPor: { select: { id: true, nome: true, permissoes: true } },
                responsavel: { select: { id: true, nome: true } },
                anexos: true,
                ocorrencias: { where: { dataRef: data } },
            },
        });

        const pendentes = tarefas
            .filter(t => ocorreNoDia(t, data))
            .filter(t => minutos(t.hora) <= minutos(hora))
            .filter(t => t.ocorrencias[0]?.status !== 'CONCLUIDA')
            .map(t => ({
                ...resumoTarefa({ ...t, criadoPorPermissoes: t.criadoPor?.permissoes }, req),
                dataRef: data,
                adiamentos: t.ocorrencias[0]?.adiamentos || 0,
            }))
            // mais recente primeiro: é ela que o pop-up mostra; as demais ficam no sino
            .sort((a, b) => minutos(b.hora) - minutos(a.hora));

        res.json({ pendentes });
    } catch (error) {
        console.error('[Tarefas] Erro ao buscar pendentes:', error);
        res.status(500).json({ error: 'Erro ao buscar tarefas pendentes.' });
    }
});

// ── POST / — criar tarefa (uma por responsável) ──
router.post('/', async (req, res) => {
    try {
        const {
            titulo, descricao, dataInicio, hora,
            recorrencia = 'NUNCA', recorrenciaFim = null,
            insistir = true, responsaveis, linksAjuda = [],
        } = req.body;

        if (!titulo || !String(titulo).trim()) return res.status(400).json({ error: 'Informe o título da tarefa.' });
        if (!RE_DATA.test(dataInicio || '')) return res.status(400).json({ error: 'Data inválida (use YYYY-MM-DD).' });
        if (!RE_HORA.test(hora || '')) return res.status(400).json({ error: 'Horário inválido (use HH:MM).' });
        if (!RECORRENCIAS.includes(recorrencia)) return res.status(400).json({ error: 'Repetição inválida.' });
        if (recorrenciaFim && !RE_DATA.test(recorrenciaFim)) return res.status(400).json({ error: 'Data final de repetição inválida.' });

        const ids = Array.isArray(responsaveis) && responsaveis.length > 0 ? [...new Set(responsaveis)] : [req.user.id];
        if (ids.some(id => id !== req.user.id) && !podeCriarParaOutros(req)) {
            return res.status(403).json({ error: 'Sem permissão para criar tarefas para outras pessoas.' });
        }

        const validos = await prisma.vendedor.findMany({
            where: { id: { in: ids }, ativo: true },
            select: { id: true },
        });
        if (validos.length !== ids.length) {
            return res.status(400).json({ error: 'Responsável inválido ou inativo.' });
        }

        const links = (Array.isArray(linksAjuda) ? linksAjuda : [])
            .filter(l => l && l.url)
            .map(l => ({ tipo: 'LINK', nome: String(l.nome || l.url).slice(0, 120), url: String(l.url) }));

        const criadas = await prisma.$transaction(async (tx) => {
            const resultado = [];
            for (const responsavelId of ids) {
                const t = await tx.tarefa.create({
                    data: {
                        titulo: String(titulo).trim(),
                        descricao: descricao ? String(descricao) : null,
                        dataInicio, hora, recorrencia,
                        recorrenciaFim: recorrenciaFim || null,
                        insistir: insistir !== false,
                        criadoPorId: req.user.id,
                        responsavelId,
                        anexos: links.length ? { create: links } : undefined,
                    },
                    include: {
                        criadoPor: { select: { id: true, nome: true, permissoes: true } },
                        responsavel: { select: { id: true, nome: true } },
                        anexos: true,
                    },
                });
                resultado.push(t);
            }
            return resultado;
        }, { timeout: 20000, maxWait: 10000 });

        res.status(201).json({
            message: `Tarefa criada para ${criadas.length} pessoa(s).`,
            tarefas: criadas.map(t => resumoTarefa({ ...t, criadoPorPermissoes: t.criadoPor?.permissoes }, req)),
        });
    } catch (error) {
        console.error('[Tarefas] Erro ao criar tarefa:', error);
        res.status(500).json({ error: 'Erro ao criar a tarefa.' });
    }
});

// ── PUT /:id — editar (só criador ou admin) ──
router.put('/:id', async (req, res) => {
    try {
        const tarefa = await carregarComPermissaoDeEdicao(req, res);
        if (!tarefa) return;

        const { titulo, descricao, dataInicio, hora, recorrencia, recorrenciaFim, insistir, responsavelId } = req.body;
        const data = {};
        if (titulo !== undefined) {
            if (!String(titulo).trim()) return res.status(400).json({ error: 'O título não pode ficar vazio.' });
            data.titulo = String(titulo).trim();
        }
        if (descricao !== undefined) data.descricao = descricao ? String(descricao) : null;
        if (dataInicio !== undefined) {
            if (!RE_DATA.test(dataInicio)) return res.status(400).json({ error: 'Data inválida.' });
            data.dataInicio = dataInicio;
        }
        if (hora !== undefined) {
            if (!RE_HORA.test(hora)) return res.status(400).json({ error: 'Horário inválido.' });
            data.hora = hora;
        }
        if (recorrencia !== undefined) {
            if (!RECORRENCIAS.includes(recorrencia)) return res.status(400).json({ error: 'Repetição inválida.' });
            data.recorrencia = recorrencia;
        }
        if (recorrenciaFim !== undefined) {
            if (recorrenciaFim && !RE_DATA.test(recorrenciaFim)) return res.status(400).json({ error: 'Data final de repetição inválida.' });
            data.recorrenciaFim = recorrenciaFim || null;
        }
        if (insistir !== undefined) data.insistir = insistir !== false;
        if (responsavelId !== undefined && responsavelId !== tarefa.responsavelId) {
            if (responsavelId !== req.user.id && !podeCriarParaOutros(req)) {
                return res.status(403).json({ error: 'Sem permissão para passar a tarefa para outra pessoa.' });
            }
            data.responsavelId = responsavelId;
        }

        const atualizada = await prisma.tarefa.update({
            where: { id: tarefa.id },
            data,
            include: {
                criadoPor: { select: { id: true, nome: true, permissoes: true } },
                responsavel: { select: { id: true, nome: true } },
                anexos: true,
            },
        });
        res.json({ tarefa: resumoTarefa({ ...atualizada, criadoPorPermissoes: atualizada.criadoPor?.permissoes }, req) });
    } catch (error) {
        console.error('[Tarefas] Erro ao editar tarefa:', error);
        res.status(500).json({ error: 'Erro ao editar a tarefa.' });
    }
});

// ── DELETE /:id — excluir (só criador ou admin) ──
router.delete('/:id', async (req, res) => {
    try {
        const tarefa = await carregarComPermissaoDeEdicao(req, res);
        if (!tarefa) return;

        await prisma.tarefa.delete({ where: { id: tarefa.id } }); // cascade: anexos + ocorrências

        // limpeza dos arquivos no disco (fora do fluxo crítico)
        try {
            const dir = path.join(__dirname, '../uploads/tarefas', tarefa.id);
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        } catch (fsErr) {
            console.error('[Tarefas] Falha ao limpar arquivos (tarefa já excluída):', fsErr.message);
        }

        res.json({ message: 'Tarefa excluída.' });
    } catch (error) {
        console.error('[Tarefas] Erro ao excluir tarefa:', error);
        res.status(500).json({ error: 'Erro ao excluir a tarefa.' });
    }
});

// ── POST /:id/concluir — responsável (ou admin) conclui a ocorrência do dia ──
// body: { dataRef: 'YYYY-MM-DD', hora: 'HH:MM' } (locais do usuário)
router.post('/:id/concluir', async (req, res) => {
    try {
        const { dataRef, hora } = req.body;
        if (!RE_DATA.test(dataRef || '')) return res.status(400).json({ error: 'Informe dataRef (YYYY-MM-DD).' });

        const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.id } });
        if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada.' });
        if (tarefa.responsavelId !== req.user.id && tarefa.criadoPorId !== req.user.id && !isAdmin(req)) {
            return res.status(403).json({ error: 'Só o responsável pela tarefa pode concluí-la.' });
        }
        if (!ocorreNoDia(tarefa, dataRef)) {
            return res.status(400).json({ error: 'Esta tarefa não ocorre nesse dia.' });
        }

        // idempotente: concluir de novo não duplica nem sobrescreve o horário original
        const existente = await prisma.tarefaOcorrencia.findUnique({
            where: { tarefaId_dataRef: { tarefaId: tarefa.id, dataRef } },
        });
        if (existente?.status === 'CONCLUIDA') {
            return res.json({ message: 'Tarefa já estava concluída.', concluidaHora: existente.concluidaHora });
        }

        const horaConclusao = RE_HORA.test(hora || '') ? hora : null;
        const oc = await prisma.tarefaOcorrencia.upsert({
            where: { tarefaId_dataRef: { tarefaId: tarefa.id, dataRef } },
            create: {
                tarefaId: tarefa.id, dataRef,
                status: 'CONCLUIDA', concluidaEm: new Date(), concluidaHora: horaConclusao,
            },
            update: { status: 'CONCLUIDA', concluidaEm: new Date(), concluidaHora: horaConclusao },
        });
        res.json({ message: 'Tarefa concluída!', concluidaHora: oc.concluidaHora, adiamentos: oc.adiamentos });
    } catch (error) {
        console.error('[Tarefas] Erro ao concluir tarefa:', error);
        res.status(500).json({ error: 'Erro ao concluir a tarefa.' });
    }
});

// ── POST /:id/adiar — registra o "lembrar em 5 min" (para o parecer) ──
// body: { dataRef: 'YYYY-MM-DD' }
router.post('/:id/adiar', async (req, res) => {
    try {
        const { dataRef } = req.body;
        if (!RE_DATA.test(dataRef || '')) return res.status(400).json({ error: 'Informe dataRef (YYYY-MM-DD).' });

        const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.id } });
        if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada.' });
        if (tarefa.responsavelId !== req.user.id) {
            return res.status(403).json({ error: 'Só o responsável pode adiar o lembrete.' });
        }

        const oc = await prisma.tarefaOcorrencia.upsert({
            where: { tarefaId_dataRef: { tarefaId: tarefa.id, dataRef } },
            create: { tarefaId: tarefa.id, dataRef, adiamentos: 1 },
            update: { adiamentos: { increment: 1 } },
        });
        res.json({ adiamentos: oc.adiamentos });
    } catch (error) {
        console.error('[Tarefas] Erro ao adiar tarefa:', error);
        res.status(500).json({ error: 'Erro ao registrar o adiamento.' });
    }
});

// ── Anexos ──
// arquivos (imagem/PDF): campo 'arquivos', até 5 por vez
router.post('/:id/anexos', (req, res, next) => {
    carregarComPermissaoDeEdicao(req, res).then(tarefa => {
        if (!tarefa) return;
        req._tarefa = tarefa;
        uploadTarefa.array('arquivos', 5)(req, res, (err) => {
            if (err) return res.status(400).json({ error: err.message || 'Falha no upload.' });
            next();
        });
    }).catch(next);
}, async (req, res) => {
    try {
        const arquivos = req.files || [];
        if (arquivos.length === 0) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        const anexos = [];
        for (const f of arquivos) {
            const anexo = await prisma.tarefaAnexo.create({
                data: {
                    tarefaId: req._tarefa.id,
                    tipo: f.mimetype === 'application/pdf' ? 'ARQUIVO' : 'IMAGEM',
                    nome: f.originalname,
                    url: `/uploads/tarefas/${req._tarefa.id}/${f.filename}`,
                },
            });
            anexos.push(anexo);
        }
        res.status(201).json({ anexos });
    } catch (error) {
        console.error('[Tarefas] Erro ao anexar arquivos:', error);
        res.status(500).json({ error: 'Erro ao salvar os anexos.' });
    }
});

// link de ajuda avulso
router.post('/:id/anexos/link', async (req, res) => {
    try {
        const tarefa = await carregarComPermissaoDeEdicao(req, res);
        if (!tarefa) return;
        const { nome, url } = req.body;
        if (!url) return res.status(400).json({ error: 'Informe o link.' });
        const anexo = await prisma.tarefaAnexo.create({
            data: { tarefaId: tarefa.id, tipo: 'LINK', nome: String(nome || url).slice(0, 120), url: String(url) },
        });
        res.status(201).json({ anexo });
    } catch (error) {
        console.error('[Tarefas] Erro ao anexar link:', error);
        res.status(500).json({ error: 'Erro ao salvar o link.' });
    }
});

router.delete('/anexos/:anexoId', async (req, res) => {
    try {
        const anexo = await prisma.tarefaAnexo.findUnique({
            where: { id: req.params.anexoId },
            include: { tarefa: true },
        });
        if (!anexo) return res.status(404).json({ error: 'Anexo não encontrado.' });
        if (!isAdmin(req) && anexo.tarefa.criadoPorId !== req.user.id) {
            return res.status(403).json({ error: 'Só quem criou a tarefa pode remover anexos.' });
        }
        await prisma.tarefaAnexo.delete({ where: { id: anexo.id } });
        if (anexo.tipo !== 'LINK') {
            try {
                const abs = path.join(__dirname, '..', anexo.url.replace(/^\//, ''));
                if (abs.startsWith(path.join(__dirname, '../uploads/tarefas')) && fs.existsSync(abs)) fs.unlinkSync(abs);
            } catch (fsErr) {
                console.error('[Tarefas] Falha ao remover arquivo do disco:', fsErr.message);
            }
        }
        res.json({ message: 'Anexo removido.' });
    } catch (error) {
        console.error('[Tarefas] Erro ao remover anexo:', error);
        res.status(500).json({ error: 'Erro ao remover o anexo.' });
    }
});

// ── GET /parecer — relatório do dia por funcionário (admin) ──
// ?data=YYYY-MM-DD&horaAtual=HH:MM&dataHoje=YYYY-MM-DD (horaAtual/dataHoje = relógio local de quem consulta)
router.get('/parecer', async (req, res) => {
    try {
        if (!podeVerParecer(req)) {
            return res.status(403).json({ error: 'Sem permissão para ver o parecer de tarefas.' });
        }
        const { data } = req.query;
        if (!RE_DATA.test(data || '')) return res.status(400).json({ error: 'Informe ?data=YYYY-MM-DD.' });
        const dataHoje = RE_DATA.test(req.query.dataHoje || '') ? req.query.dataHoje : data;
        const horaAtual = RE_HORA.test(req.query.horaAtual || '') ? req.query.horaAtual : '23:59';

        const tarefas = await prisma.tarefa.findMany({
            where: { ativo: true, dataInicio: { lte: data } },
            include: {
                criadoPor: { select: { id: true, nome: true } },
                responsavel: { select: { id: true, nome: true } },
                ocorrencias: { where: { dataRef: data } },
            },
        });

        const doDia = tarefas.filter(t => ocorreNoDia(t, data));
        const porFuncionario = {};
        for (const t of doDia) {
            const oc = t.ocorrencias[0];
            const jaVenceu = data < dataHoje || (data === dataHoje && minutos(t.hora) <= minutos(horaAtual));
            let status;
            if (oc?.status === 'CONCLUIDA') {
                const atrasada = oc.concluidaHora && (minutos(oc.concluidaHora) - minutos(t.hora)) > TOLERANCIA_MIN;
                status = atrasada ? 'CONCLUIDA_ATRASO' : 'CONCLUIDA_NO_HORARIO';
            } else {
                status = jaVenceu ? 'NAO_CONCLUIDA' : 'AGUARDANDO';
            }

            const chave = t.responsavelId;
            if (!porFuncionario[chave]) {
                porFuncionario[chave] = {
                    vendedorId: chave,
                    nome: t.responsavel?.nome || '—',
                    total: 0, noHorario: 0, comAtraso: 0, naoConcluidas: 0, aguardando: 0, adiamentos: 0,
                    tarefas: [],
                };
            }
            const f = porFuncionario[chave];
            f.total++;
            f.adiamentos += oc?.adiamentos || 0;
            if (status === 'CONCLUIDA_NO_HORARIO') f.noHorario++;
            else if (status === 'CONCLUIDA_ATRASO') f.comAtraso++;
            else if (status === 'NAO_CONCLUIDA') f.naoConcluidas++;
            else f.aguardando++;
            f.tarefas.push({
                id: t.id,
                titulo: t.titulo,
                hora: t.hora,
                criadoPor: t.criadoPor?.nome || '—',
                status,
                concluidaHora: oc?.concluidaHora || null,
                adiamentos: oc?.adiamentos || 0,
            });
        }

        const funcionarios = Object.values(porFuncionario)
            .map(f => ({ ...f, tarefas: f.tarefas.sort((a, b) => a.hora.localeCompare(b.hora)) }))
            .sort((a, b) => a.nome.localeCompare(b.nome));

        const totais = funcionarios.reduce((acc, f) => ({
            total: acc.total + f.total,
            noHorario: acc.noHorario + f.noHorario,
            comAtraso: acc.comAtraso + f.comAtraso,
            naoConcluidas: acc.naoConcluidas + f.naoConcluidas,
            aguardando: acc.aguardando + f.aguardando,
        }), { total: 0, noHorario: 0, comAtraso: 0, naoConcluidas: 0, aguardando: 0 });

        res.json({ data, totais, funcionarios });
    } catch (error) {
        console.error('[Tarefas] Erro no parecer:', error);
        res.status(500).json({ error: 'Erro ao gerar o parecer.' });
    }
});

module.exports = router;
