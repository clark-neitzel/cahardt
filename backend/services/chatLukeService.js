// Chat do Luke (BPO financeiro): conversa contínua de cada usuário com o Luke (agente externo), com texto, foto e PDF.
//
// Regras que NÃO podem quebrar (docs/plano-chat-luke-webhook.md):
//  - Anexo = tabela `anexos` (entidadeTipo 'CHAT_LUKE', entidadeId = id da mensagem) via anexoService: magic bytes, sha256,
//    pasta persistente (../uploads/anexos) e 404 ARQUIVO_PERDIDO. Só abre por rota do chat (routes/anexos.js bloqueia CHAT_LUKE).
//  - A mensagem do usuário e o evento do webhook nascem na MESMA `$transaction` (com timeout). Arquivos gravados ANTES;
//    "acordar a fila" e auditoria DEPOIS, fora da transação, em try/catch próprio. Nunca rede dentro da transação.
//  - O webhook não é pré-requisito: webhook desligado/fora do ar não impede gravar a mensagem.
//  - A resposta do Luke NÃO gera evento (sem laço). Texto do Luke/usuário é TEXTO PURO: o front nunca renderiza como HTML.
//  - Estado da solicitação na bolha é DERIVADO na leitura (vínculo × agente_solicitacoes); só 4 status são gravados.
//  - Permissão sempre `=== true` (objeto, nunca `!!`); admin passa.
const crypto = require('crypto');
const prisma = require('../config/database');
const anexoService = require('./anexoService');
const luke = require('./lukeWebhookService');
const { isoNowTZ, inicioDiaSP } = require('../utils/dataSP');

const CHAVE_CONFIG = 'chat_luke';
const ASSUNTOS = ['LANCAMENTO', 'NOTA', 'CORRECAO', 'DUVIDA', 'FECHAMENTO'];
const LIMITE_TEXTO_USUARIO = 4000;
const LIMITE_TEXTO_LUKE = 8000;
const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;
const MAX_ANEXOS_MENSAGEM = 5;
const LIMITE_POR_MINUTO = 20;
const PADRAO_LIMITES = { pedidosDia: 20, anexosDia: 30, duvidasDia: 50 };
const TIPOS_ACEITOS = ['jpeg', 'png', 'webp', 'pdf']; // XML do anexoService NÃO vale no chat
const ESTADOS_PENDENTES = ['PENDENTE', 'EXECUTANDO'];
const ESTADOS_PROBLEMA = ['ERRO', 'ERRO_INDETERMINADO', 'RECUSADA', 'EXPIRADA'];
const STATUS_LUKE = ['RESPONDIDO', 'ERRO', 'AGUARDANDO_AUTORIZACAO'];
const SOBREPOSICAO_POLLING_MS = 3000; // `depoisDe` relê 3 s para trás (commit tardio): o cliente deduplica por id
const ROTA_SOLICITACOES = '/admin/agentes/solicitacoes';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAVE_IDEM = /^[\x21-\x7e]{1,100}$/;
const TTL_CONFIG_MS = 5000;

class ChatErro extends Error {
    constructor(status, mensagem, codigo, extra) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
        if (extra) this.extra = extra;
    }
}

// ───────────────────────── permissão ─────────────────────────
const ehAdmin = (perms) => !!perms && typeof perms === 'object' && perms.admin === true;
/** Pode usar o chat: admin ou Pode_Usar_Chat_Luke === true (nunca `!!`). */
function podeUsar(perms) {
    return !!perms && typeof perms === 'object' && (perms.admin === true || perms.Pode_Usar_Chat_Luke === true);
}
function permissoesDe(v) {
    if (!v) return {};
    if (typeof v === 'string') { try { return JSON.parse(v) || {}; } catch (_) { return {}; } }
    return typeof v === 'object' ? v : {};
}

// ───────────────────────── configuração (AppConfig 'chat_luke') ─────────────────────────
let cacheConfig = null;
function inteiroOuNulo(v) { return Number.isInteger(v) && v >= 0 && v <= 100000 ? v : null; }

/** { agenteId, ativo, limites:{pedidosDia,anexosDia,duvidasDia} }. `ativo` só desliga com `=== false` (ausente = ligado). */
async function lerConfig({ fresco = false } = {}) {
    if (!fresco && cacheConfig && Date.now() < cacheConfig.ate) return cacheConfig.valor;
    const row = await prisma.appConfig.findUnique({ where: { key: CHAVE_CONFIG } });
    const v = row && row.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
    const l = v.limites && typeof v.limites === 'object' ? v.limites : {};
    const valor = {
        agenteId: typeof v.agenteId === 'string' && v.agenteId ? v.agenteId : null,
        ativo: v.ativo !== false,
        limites: {
            pedidosDia: inteiroOuNulo(l.pedidosDia) ?? PADRAO_LIMITES.pedidosDia,
            anexosDia: inteiroOuNulo(l.anexosDia) ?? PADRAO_LIMITES.anexosDia,
            duvidasDia: inteiroOuNulo(l.duvidasDia) ?? PADRAO_LIMITES.duvidasDia,
        },
    };
    cacheConfig = { ate: Date.now() + TTL_CONFIG_MS, valor };
    return valor;
}

async function exigirAtivo() {
    const cfg = await lerConfig();
    if (!cfg.ativo) throw new ChatErro(503, 'O chat com o Luke está desligado no momento.', 'CHAT_DESLIGADO');
    return cfg;
}

/** Gravação pelo admin (merge): { agenteId?: string|null, ativo?: boolean, limites?: {..} }. */
async function salvarConfig(entrada, ator) {
    const atual = await lerConfig({ fresco: true });
    const novo = { agenteId: atual.agenteId, ativo: atual.ativo, limites: { ...atual.limites } };
    if (entrada.agenteId !== undefined) {
        if (entrada.agenteId === null || entrada.agenteId === '') novo.agenteId = null;
        else {
            if (typeof entrada.agenteId !== 'string' || entrada.agenteId.length > 100) throw new ChatErro(400, 'agenteId inválido.', 'AGENTE_INVALIDO');
            const v = await prisma.vendedor.findUnique({ where: { id: entrada.agenteId }, select: { id: true, agente: true, ativo: true } });
            if (!v || v.agente !== true || v.ativo === false) throw new ChatErro(400, 'O usuário informado não é um agente ativo.', 'AGENTE_INVALIDO');
            novo.agenteId = v.id;
        }
    }
    if (entrada.ativo !== undefined) {
        if (typeof entrada.ativo !== 'boolean') throw new ChatErro(400, '`ativo` deve ser true ou false.', 'ATIVO_INVALIDO');
        novo.ativo = entrada.ativo;
    }
    if (entrada.limites !== undefined) {
        if (!entrada.limites || typeof entrada.limites !== 'object') throw new ChatErro(400, '`limites` deve ser um objeto.', 'LIMITE_INVALIDO');
        for (const k of Object.keys(PADRAO_LIMITES)) {
            if (entrada.limites[k] === undefined) continue;
            const n = inteiroOuNulo(entrada.limites[k]);
            if (n === null) throw new ChatErro(400, `${k} deve ser um número inteiro de 0 a 100000.`, 'LIMITE_INVALIDO');
            novo.limites[k] = n;
        }
    }
    await prisma.appConfig.upsert({ where: { key: CHAVE_CONFIG }, update: { value: novo }, create: { key: CHAVE_CONFIG, value: novo } });
    cacheConfig = null;
    await auditar('CHAT_LUKE_CONFIG_ALTERADA', 'ChatLukeConfig', CHAVE_CONFIG, { de: atual, para: novo }, ator);
    return novo;
}

async function limiteIndividual(usuarioId) {
    return prisma.chatLukeLimite.findUnique({ where: { usuarioId }, select: { pedidosDia: true, anexosDia: true, duvidasDia: true } });
}

/** Limites efetivos de uma pessoa (null = sem limite diário: administrador). */
async function limitesDe(usuarioId, perms) {
    if (ehAdmin(perms)) return null;
    const [cfg, ind] = await Promise.all([lerConfig(), limiteIndividual(usuarioId)]);
    return {
        pedidosDia: ind && ind.pedidosDia != null ? ind.pedidosDia : cfg.limites.pedidosDia,
        anexosDia: ind && ind.anexosDia != null ? ind.anexosDia : cfg.limites.anexosDia,
        duvidasDia: ind && ind.duvidasDia != null ? ind.duvidasDia : cfg.limites.duvidasDia,
    };
}

async function usoDoDia(usuarioId) {
    const desde = inicioDiaSP(isoNowTZ());
    const where = { autor: 'USUARIO', usuarioId, criadoEm: { gte: desde } };
    const [pedidos, soma] = await Promise.all([
        prisma.chatLukeMensagem.count({ where }),
        prisma.chatLukeMensagem.aggregate({ where, _sum: { qtdAnexos: true } }),
    ]);
    return { pedidos, anexos: (soma && soma._sum && soma._sum.qtdAnexos) || 0 };
}

/** Saldo do dia para a tela. admin => null. */
async function saldoDoDia(usuarioId, perms) {
    const lim = await limitesDe(usuarioId, perms);
    if (!lim) return null;
    const uso = await usoDoDia(usuarioId);
    return {
        pedidosDia: lim.pedidosDia, pedidosUsados: uso.pedidos, pedidosRestantes: Math.max(0, lim.pedidosDia - uso.pedidos),
        anexosDia: lim.anexosDia, anexosUsados: uso.anexos, anexosRestantes: Math.max(0, lim.anexosDia - uso.anexos),
    };
}

/** Limite diário da AJUDA ("Tirar dúvida"): conta ia_uso_log origem CLIPPY do usuário no dia (fuso de São Paulo). Admin: sem limite. */
async function checarLimiteDuvidas(usuarioId, perms) {
    const lim = await limitesDe(usuarioId, perms);
    if (!lim) return { ok: true, limite: null };
    const usadas = await prisma.iaUsoLog.count({ where: { origem: 'CLIPPY', usuarioId: String(usuarioId), criadoEm: { gte: inicioDiaSP(isoNowTZ()) } } });
    return { ok: usadas < lim.duvidasDia, limite: lim.duvidasDia, usadas };
}

// freio por minuto (em memória, por instância): vale para todos, inclusive admin
const janelaMinuto = new Map();
function registrarMinuto(usuarioId, agora = Date.now()) {
    const lista = (janelaMinuto.get(usuarioId) || []).filter((t) => agora - t < 60000);
    if (lista.length >= LIMITE_POR_MINUTO) {
        janelaMinuto.set(usuarioId, lista);
        throw new ChatErro(429, 'Muitas mensagens em pouco tempo. Aguarde um minuto e envie de novo.', 'CHAT_LIMITE_MINUTO');
    }
    lista.push(agora);
    janelaMinuto.set(usuarioId, lista);
}

// ───────────────────────── auditoria (fora do fluxo principal) ─────────────────────────
async function auditar(acao, entidade, entidadeId, detalhes, ator) {
    try {
        await prisma.auditLog.create({
            data: {
                acao, entidade, entidadeId: String(entidadeId), detalhes: JSON.stringify(detalhes || {}),
                usuarioId: String((ator && ator.id) || 'sistema'), usuarioNome: String((ator && ator.nome) || 'Sistema'),
            },
        });
    } catch (e) {
        console.error(`[ChatLuke] falha ao gravar auditoria ${acao} (operação já efetivada):`, e.message);
    }
}

// ───────────────────────── texto ─────────────────────────
/** Tira caracteres de controle (um \u0000 derruba o INSERT no Postgres) e apara. Mantém \n e \t. */
function limparTexto(t) {
    if (t == null) return '';
    return String(t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim();
}

function lerChave(chave, prefixo) {
    if (chave == null || chave === '') return null;
    const c = String(chave).trim();
    if (!CHAVE_IDEM.test(c)) throw new ChatErro(400, 'Idempotency-Key inválida (1 a 100 caracteres visíveis, sem espaço).', 'IDEMPOTENCY_KEY_INVALIDA');
    return `${prefixo}:${c}`;
}

function lerData(v, campo) {
    if (v == null || v === '') return null;
    const d = new Date(String(v));
    if (!Number.isFinite(d.getTime())) throw new ChatErro(400, `${campo} deve ser uma data ISO válida.`, 'CURSOR_INVALIDO');
    return d;
}

function lerLimite(v, padrao, max) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : padrao;
}

// ───────────────────────── conversa ─────────────────────────
async function obterOuCriarConversa(usuario) {
    const achada = await prisma.chatLukeConversa.findUnique({ where: { usuarioId: usuario.id } });
    if (achada) return achada;
    let nome = usuario.nome;
    if (!nome) {
        try { nome = (await prisma.vendedor.findUnique({ where: { id: usuario.id }, select: { nome: true } }))?.nome; } catch (_) { /* nome é só informativo */ }
    }
    // upsert por usuarioId (único): dois "primeiros acessos" simultâneos viram UMA conversa
    return prisma.chatLukeConversa.upsert({
        where: { usuarioId: usuario.id },
        update: {},
        create: { usuarioId: usuario.id, usuarioNome: String(nome || 'Usuário').slice(0, 200) },
    });
}

// ───────────────────────── anexos: formatação e validação ─────────────────────────
const tipoDoAnexo = (mime) => (mime === 'application/pdf' ? 'pdf' : 'foto');

function ehHeic(head) {
    if (head.length < 12 || head.slice(4, 8).toString('latin1') !== 'ftyp') return false;
    return /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)/.test(head.slice(8, 12).toString('latin1'));
}

/** Confere UM arquivo temporário do multer: tamanho, tipo REAL pelo conteúdo (só JPG/PNG/WebP/PDF) e MIME declarado. */
function validarArquivo(f) {
    const nome = anexoService.corrigirNome(f.originalname) || 'arquivo';
    const fs = require('fs');
    const tam = fs.statSync(f.path).size;
    if (tam === 0) throw new ChatErro(400, `"${nome}" está vazio.`, 'ARQUIVO_INVALIDO');
    if (tam > LIMITE_ANEXO_BYTES) throw new ChatErro(413, `"${nome}" tem mais de 10 MB. Reduza o arquivo e tente de novo.`, 'ANEXO_GRANDE');
    const head = anexoService.lerCabecalho(f.path);
    if (ehHeic(head)) throw new ChatErro(415, `"${nome}" está em HEIC (formato do iPhone). Tire a foto de novo pelo botão da câmera do chat, que converte para JPG automaticamente.`, 'TIPO_NAO_ACEITO');
    const real = anexoService.detectarPeloConteudo(head);
    if (!real || !TIPOS_ACEITOS.includes(real)) throw new ChatErro(415, `"${nome}" não é um arquivo aceito. Envie foto (JPG, PNG ou WebP) ou PDF.`, 'TIPO_NAO_ACEITO');
    const declarado = String(f.mimetype || '').toLowerCase();
    if (!anexoService.MIMES_DECLARADOS[real].includes(declarado)) {
        throw new ChatErro(415, `"${nome}" não confere: o conteúdo é ${anexoService.CANONICO[real].ext.toUpperCase()}, mas veio como "${declarado || 'desconhecido'}". Arquivo recusado.`, 'TIPO_NAO_ACEITO');
    }
}

const apagarTemps = (arquivos) => arquivos.forEach((f) => { try { require('fs').unlinkSync(f.path); } catch (_) { /* já movido/apagado */ } });

async function removerAnexosSalvos(anexos, usuario) {
    for (const a of anexos) {
        try { await anexoService.remover(a, usuario); }
        catch (e) { console.error('[ChatLuke] não limpou um anexo órfão:', e.message); }
    }
}

// ───────────────────────── leitura: enriquecer mensagens ─────────────────────────
function resolverStatusSolicitacao(s, agora) {
    if (s.status === 'PENDENTE' && s.expiraEm && new Date(s.expiraEm).getTime() <= agora) return 'EXPIRADA'; // vencida e a varredura ainda não passou
    return s.status;
}

function derivarEstado(m, sols) {
    if (sols.some((s) => ESTADOS_PENDENTES.includes(s.status))) return 'AGUARDANDO_AUTORIZACAO';
    if (m.status === 'ERRO' || sols.some((s) => ESTADOS_PROBLEMA.includes(s.status))) return 'ERRO';
    return m.status;
}

/**
 * Anexa a cada mensagem os anexos e as solicitações ligadas (2 consultas em lote + 1 das solicitações; sem N+1).
 * visao: 'usuario' (urls /api/chat-luke, link p/ admin) | 'agente' (urls /api/agente/v1/chat, consultaUrl).
 */
async function enriquecer(mensagens, { visao, admin = false } = {}) {
    if (!mensagens.length) return [];
    const ids = mensagens.map((m) => m.id);
    const [anexosRows, vinculos] = await Promise.all([
        prisma.anexo.findMany({
            where: { entidadeTipo: 'CHAT_LUKE', ativo: true, entidadeId: { in: ids } },
            select: { id: true, entidadeId: true, nomeOriginal: true, mime: true, tamanho: true, criadoEm: true },
            orderBy: { criadoEm: 'asc' },
        }),
        prisma.chatLukeMensagemSolicitacao.findMany({
            where: { mensagemId: { in: ids } },
            select: { mensagemId: true, solicitacaoId: true, origem: true },
        }),
    ]);
    const solIds = [...new Set(vinculos.map((v) => v.solicitacaoId))];
    const solRows = solIds.length
        ? await prisma.agenteSolicitacao.findMany({ where: { id: { in: solIds } }, select: { id: true, status: true, resumo: true, expiraEm: true } })
        : [];
    const agora = Date.now();
    const solPorId = new Map(solRows.map((s) => [s.id, { id: s.id, status: resolverStatusSolicitacao(s, agora), resumo: s.resumo }]));
    const base = visao === 'agente' ? '/api/agente/v1/chat/anexos' : '/api/chat-luke/anexos';
    const anexosPorMsg = new Map();
    for (const a of anexosRows) {
        const l = anexosPorMsg.get(a.entidadeId) || [];
        l.push({ id: a.id, tipo: tipoDoAnexo(a.mime), mime: a.mime, tamanho: a.tamanho, nome: a.nomeOriginal, url: `${base}/${a.id}` });
        anexosPorMsg.set(a.entidadeId, l);
    }
    const solPorMsg = new Map();
    for (const v of vinculos) {
        const s = solPorId.get(v.solicitacaoId);
        if (!s) continue; // solicitação apagada: some do cartão
        const l = solPorMsg.get(v.mensagemId) || [];
        l.push(s);
        solPorMsg.set(v.mensagemId, l);
    }
    return mensagens.map((m) => {
        const sols = solPorMsg.get(m.id) || [];
        return {
            id: m.id, conversaId: m.conversaId, autor: m.autor, texto: m.texto, assunto: m.assunto, tipo: m.tipo,
            status: m.status, estado: derivarEstado(m, sols), respondeA: m.respondeA, qtdAnexos: m.qtdAnexos,
            anexos: anexosPorMsg.get(m.id) || [],
            solicitacoes: sols.map((s) => (visao === 'agente'
                ? { id: s.id, status: s.status, resumo: s.resumo, consultaUrl: `/api/agente/v1/solicitacoes/${s.id}` }
                : { id: s.id, status: s.status, resumo: s.resumo, rota: admin ? ROTA_SOLICITACOES : null })),
            criadoEm: m.criadoEm, atualizadoEm: m.atualizadoEm,
        };
    });
}

/**
 * Página de mensagens de uma conversa.
 *  modo 'estado' (usuário): `depoisDe` = atualizadoEm (pega mudança de estado também); `antesDe` = criadoEm (histórico).
 *  modo 'novas'  (agente):  `depoisDe`/`antesDe` = criadoEm (só mensagens novas/antigas).
 * Devolve { mensagens, cursor, temMais }. `cursor` = maior atualizadoEm devolvido (use em `depoisDe` no modo 'estado').
 */
async function paginar(conversaId, { antesDe, depoisDe, limit }, { modo, visao, admin }) {
    const lim = lerLimite(limit, 50, modo === 'novas' ? 200 : 100);
    const dAntes = lerData(antesDe, 'antesDe');
    const dDepois = lerData(depoisDe, 'depoisDe');
    let linhas; let temMais = false;
    if (dDepois && !dAntes) {
        const campo = modo === 'estado' ? 'atualizadoEm' : 'criadoEm';
        const corte = modo === 'estado' ? new Date(dDepois.getTime() - SOBREPOSICAO_POLLING_MS) : dDepois;
        linhas = await prisma.chatLukeMensagem.findMany({ where: { conversaId, [campo]: { gt: corte } }, orderBy: { [campo]: 'asc' }, take: lim + 1 });
        if (linhas.length > lim) { temMais = true; linhas = linhas.slice(0, lim); }
    } else {
        const where = { conversaId, ...(dAntes ? { criadoEm: { lt: dAntes } } : {}) };
        const desc = await prisma.chatLukeMensagem.findMany({ where, orderBy: { criadoEm: 'desc' }, take: lim + 1 });
        if (desc.length > lim) { temMais = true; desc.length = lim; }
        linhas = desc.reverse();
    }
    const mensagens = await enriquecer(linhas, { visao, admin });
    let cursor = dDepois ? dDepois.toISOString() : null;
    for (const m of linhas) {
        const t = new Date(m.atualizadoEm).getTime();
        if (!cursor || t > new Date(cursor).getTime()) cursor = new Date(m.atualizadoEm).toISOString();
    }
    return { mensagens, cursor, temMais };
}

// ───────────────────────── usuário: abrir, enviar, ler ─────────────────────────
async function abrirConversa(usuario, perms) {
    const cfg = await lerConfig();
    const conversa = await obterOuCriarConversa(usuario);
    const pagina = await paginar(conversa.id, {}, { modo: 'estado', visao: 'usuario', admin: ehAdmin(perms) });
    return {
        conversa: { id: conversa.id, ultimaMensagemEm: conversa.ultimaMensagemEm, lidaUsuarioEm: conversa.lidaUsuarioEm },
        conectado: !!cfg.agenteId,
        ativo: cfg.ativo,
        admin: ehAdmin(perms),
        saldo: await saldoDoDia(usuario.id, perms),
        ...pagina,
    };
}

async function listarDoUsuario(usuario, perms, params) {
    const conversa = await obterOuCriarConversa(usuario);
    return paginar(conversa.id, params || {}, { modo: 'estado', visao: 'usuario', admin: ehAdmin(perms) });
}

async function carregarExistente(conversaId, chave, ctx) {
    const m = await prisma.chatLukeMensagem.findUnique({ where: { conversaId_chaveIdempotencia: { conversaId, chaveIdempotencia: chave } } });
    if (!m) return null;
    return (await enriquecer([m], ctx))[0];
}

/**
 * Envia a mensagem do usuário. `arquivos`: temporários do multer (já em ../uploads/anexos/_tmp). Em QUALQUER erro os temporários
 * e os anexos já gravados são limpos (nada sobra no disco). Devolve { mensagem, duplicada, avisos }.
 */
async function enviarMensagemUsuario({ usuario, perms, texto, assunto, arquivos = [], chaveIdempotencia }) {
    let salvos = [];
    try {
        await exigirAtivo();
        const t = limparTexto(texto);
        if (!t && !arquivos.length) throw new ChatErro(400, 'Escreva uma mensagem ou anexe um arquivo.', 'MENSAGEM_VAZIA');
        if (t.length > LIMITE_TEXTO_USUARIO) throw new ChatErro(400, `A mensagem pode ter no máximo ${LIMITE_TEXTO_USUARIO} caracteres.`, 'TEXTO_GRANDE');
        if (arquivos.length > MAX_ANEXOS_MENSAGEM) throw new ChatErro(400, `Envie no máximo ${MAX_ANEXOS_MENSAGEM} arquivos por mensagem.`, 'LIMITE_ARQUIVOS');
        let a = assunto == null || assunto === '' ? null : String(assunto).toUpperCase();
        if (a && !ASSUNTOS.includes(a)) throw new ChatErro(400, `assunto deve ser um de: ${ASSUNTOS.join(', ')}.`, 'ASSUNTO_INVALIDO');
        const chave = lerChave(chaveIdempotencia, 'u');

        const conversa = await obterOuCriarConversa(usuario);
        const ctx = { visao: 'usuario', admin: ehAdmin(perms) };

        // repetição do MESMO envio (rede ruim): devolve a mensagem já gravada, sem gastar limite nem gravar de novo
        if (chave) {
            const ja = await carregarExistente(conversa.id, chave, ctx);
            if (ja) { apagarTemps(arquivos); return { mensagem: ja, duplicada: true, avisos: [] }; }
        }

        registrarMinuto(usuario.id);

        const lim = await limitesDe(usuario.id, perms);
        if (lim) {
            const uso = await usoDoDia(usuario.id);
            if (uso.pedidos + 1 > lim.pedidosDia) {
                throw new ChatErro(429, `Você usou os ${lim.pedidosDia} pedidos de hoje. Volta amanhã ou fale com o administrador.`, 'CHAT_LIMITE_DIA', { limite: lim.pedidosDia, usados: uso.pedidos });
            }
            if (arquivos.length && uso.anexos + arquivos.length > lim.anexosDia) {
                throw new ChatErro(429, `Você usou os ${lim.anexosDia} anexos de hoje. Volta amanhã ou fale com o administrador.`, 'CHAT_LIMITE_ANEXOS', { limite: lim.anexosDia, usados: uso.anexos });
            }
        }

        arquivos.forEach(validarArquivo); // tudo ou nada: um arquivo ruim recusa a mensagem inteira

        const mensagemId = crypto.randomUUID();
        const avisos = [];
        for (const f of arquivos) {
            try {
                const r = await anexoService.salvar({
                    entidadeTipo: 'CHAT_LUKE', entidadeId: mensagemId, tipo: 'COMPROVANTE', arquivo: f,
                    usuario: { id: usuario.id, nome: usuario.nome },
                });
                salvos.push(r.anexo);
                (r.avisos || []).forEach((av) => avisos.push({ codigo: av.codigo, arquivo: anexoService.corrigirNome(f.originalname), mensagem: 'Este comprovante já foi enviado antes.' }));
            } catch (e) {
                if (e instanceof anexoService.AnexoErro) {
                    throw new ChatErro(e.codigo === 'ARQUIVO_GRANDE' ? 413 : (e.codigo === 'ARQUIVO_INVALIDO' ? 415 : e.status), e.message, e.codigo === 'ARQUIVO_GRANDE' ? 'ANEXO_GRANDE' : (e.codigo === 'ARQUIVO_INVALIDO' ? 'TIPO_NAO_ACEITO' : e.codigo));
                }
                throw e;
            }
        }

        let criada;
        try {
            criada = await prisma.$transaction(async (tx) => {
                const m = await tx.chatLukeMensagem.create({
                    data: {
                        id: mensagemId, conversaId: conversa.id, autor: 'USUARIO', usuarioId: usuario.id, texto: t || null,
                        assunto: a, tipo: 'TEXTO', status: 'ENVIADO', chaveIdempotencia: chave, qtdAnexos: salvos.length,
                    },
                });
                await tx.chatLukeConversa.update({ where: { id: conversa.id }, data: { ultimaMensagemEm: m.criadoEm } });
                // só id/tipo/assunto/contagem: texto e arquivo o Luke busca pela API dele
                await luke.enfileirarChat({ conversaId: conversa.id, mensagemId: m.id, assunto: a, qtdAnexos: salvos.length }, tx);
                return m;
            }, { timeout: 20000, maxWait: 10000 });
        } catch (e) {
            if (e && e.code === 'P2002' && chave) { // outro envio idêntico venceu a corrida: devolve o dele e descarta os arquivos deste
                await removerAnexosSalvos(salvos, usuario);
                salvos = [];
                const ja = await carregarExistente(conversa.id, chave, ctx);
                if (ja) return { mensagem: ja, duplicada: true, avisos: [] };
            }
            throw e;
        }

        // mensagem COMMITADA: de agora em diante nenhum erro pode apagar os anexos dela (o catch só limpa o que ficou órfão)
        salvos = [];
        // fora da transação: nada daqui desfaz a mensagem já gravada
        luke.acordarFila();
        auditar('CHAT_LUKE_MENSAGEM_ENVIADA', 'ChatLukeMensagem', criada.id, { conversaId: conversa.id, assunto: a, qtdAnexos: criada.qtdAnexos, tamanhoTexto: t.length }, usuario);

        const [mensagem] = await enriquecer([criada], ctx);
        return { mensagem, duplicada: false, avisos };
    } catch (e) {
        apagarTemps(arquivos);
        if (salvos.length) await removerAnexosSalvos(salvos, usuario);
        throw e;
    }
}

/** Marca como lido (até `ate`, no máximo "agora"). */
async function marcarLida(usuario, ate) {
    const conversa = await obterOuCriarConversa(usuario);
    const agora = new Date();
    let ateD = lerData(ate, 'ate') || agora;
    if (ateD.getTime() > agora.getTime()) ateD = agora;
    // nunca anda para trás
    const r = await prisma.chatLukeConversa.updateMany({
        where: { id: conversa.id, OR: [{ lidaUsuarioEm: null }, { lidaUsuarioEm: { lt: ateD } }] },
        data: { lidaUsuarioEm: ateD },
    });
    return { ok: true, atualizado: r.count === 1 };
}

async function naoLidas(usuarioId) {
    const conversa = await prisma.chatLukeConversa.findUnique({ where: { usuarioId }, select: { id: true, lidaUsuarioEm: true } });
    if (!conversa) return 0;
    return prisma.chatLukeMensagem.count({
        where: { conversaId: conversa.id, autor: { in: ['LUKE', 'SISTEMA'] }, ...(conversa.lidaUsuarioEm ? { criadoEm: { gt: conversa.lidaUsuarioEm } } : {}) },
    });
}

/** Contador do mascote: não lidas (+ pendentes de autorização para admin). */
async function resumo(usuario, perms) {
    const cfg = await lerConfig();
    if (!cfg.ativo) return { ativo: false, conectado: false, naoLidas: 0, pendentesAutorizacao: ehAdmin(perms) ? 0 : null };
    const [nl, pend] = await Promise.all([
        naoLidas(usuario.id),
        ehAdmin(perms) ? prisma.agenteSolicitacao.count({ where: { status: 'PENDENTE', expiraEm: { gt: new Date() } } }) : Promise.resolve(null),
    ]);
    return { ativo: true, conectado: !!cfg.agenteId, naoLidas: nl, pendentesAutorizacao: pend };
}

/** Anexo do chat para o DONO da conversa (outro usuário recebe 404, sem revelar que existe). */
async function anexoDoUsuario(usuarioId, anexoId) {
    if (!UUID.test(String(anexoId))) throw new ChatErro(404, 'Anexo não encontrado.', 'NAO_ENCONTRADO');
    const a = await anexoService.porId(String(anexoId));
    if (!a || !a.ativo || a.entidadeTipo !== 'CHAT_LUKE') throw new ChatErro(404, 'Anexo não encontrado.', 'NAO_ENCONTRADO');
    const m = await prisma.chatLukeMensagem.findUnique({ where: { id: a.entidadeId }, select: { id: true, conversa: { select: { usuarioId: true } } } });
    if (!m || m.conversa.usuarioId !== usuarioId) throw new ChatErro(404, 'Anexo não encontrado.', 'NAO_ENCONTRADO');
    return a;
}

/** Anexo do chat para o AGENTE configurado (qualquer conversa do chat). */
async function anexoParaAgente(anexoId) {
    if (!UUID.test(String(anexoId))) throw new ChatErro(404, 'Anexo não encontrado.', 'NAO_ENCONTRADO');
    const a = await anexoService.porId(String(anexoId));
    if (!a || !a.ativo || a.entidadeTipo !== 'CHAT_LUKE') throw new ChatErro(404, 'Anexo não encontrado.', 'NAO_ENCONTRADO');
    return a;
}

/** Entrega o binário (Content-Type do MIME gravado, nosniff, sem cache). ARQUIVO_PERDIDO vira 404 claro, nunca 500. */
function entregarAnexo(res, a) {
    let aberto;
    try { aberto = anexoService.abrirStream(a); }
    catch (e) {
        if (e instanceof anexoService.AnexoErro) return res.status(e.status).json({ error: e.message, codigo: e.codigo });
        throw e;
    }
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nomeOriginal)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    aberto.stream.on('error', (err) => {
        console.error('[ChatLuke] leitura do anexo:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Erro ao ler o arquivo.', codigo: 'ERRO_INTERNO' }); else res.destroy();
    });
    aberto.stream.pipe(res);
}

// ───────────────────────── agente (Luke) ─────────────────────────
/** O agente do token é o configurado? (todo GET de /api/agente/v1 é liberado a qualquer agente: o chat exige o agente certo.) */
async function agenteHabilitado(agenteId) {
    const cfg = await lerConfig();
    if (!cfg.ativo) throw new ChatErro(503, 'O chat com o Luke está desligado no momento.', 'NAO_CONFIGURADA');
    if (!cfg.agenteId || cfg.agenteId !== agenteId) {
        throw new ChatErro(403, 'Este agente não está habilitado para atender o chat do Luke.', 'AGENTE_CHAT_NAO_HABILITADO');
    }
    return cfg;
}

async function usuariosPorId(ids) {
    const lista = [...new Set(ids)];
    if (!lista.length) return new Map();
    const rows = await prisma.vendedor.findMany({ where: { id: { in: lista } }, select: { id: true, nome: true, permissoes: true } });
    return new Map(rows.map((v) => [v.id, { id: v.id, nome: v.nome, admin: ehAdmin(permissoesDe(v.permissoes)) }]));
}

function paraUsuarioAgente(conversa, mapa) {
    return mapa.get(conversa.usuarioId) || { id: conversa.usuarioId, nome: conversa.usuarioNome, admin: false };
}

async function listarConversasAgente({ atualizadasDepois, limit }) {
    const depois = lerData(atualizadasDepois, 'atualizadasDepois');
    const lim = lerLimite(limit, 50, 200);
    const where = { ultimaMensagemEm: depois ? { gt: depois } : { not: null } };
    const conversas = await prisma.chatLukeConversa.findMany({ where, orderBy: { ultimaMensagemEm: 'desc' }, take: lim });
    if (!conversas.length) return [];
    const usuarios = await usuariosPorId(conversas.map((c) => c.usuarioId));
    // última mensagem de cada conversa (1 consulta por conversa, no máx. 200) + pendência
    const itens = [];
    for (const c of conversas) {
        const ultima = await prisma.chatLukeMensagem.findFirst({ where: { conversaId: c.id }, orderBy: { criadoEm: 'desc' } });
        const [enr] = ultima ? await enriquecer([ultima], { visao: 'agente' }) : [];
        itens.push({
            id: c.id,
            usuario: paraUsuarioAgente(c, usuarios),
            atualizadoEm: c.ultimaMensagemEm,
            ultimaMensagem: enr ? { id: enr.id, autor: enr.autor, texto: enr.texto ? enr.texto.slice(0, 300) : null, status: enr.status, estado: enr.estado, criadoEm: enr.criadoEm } : null,
            aguardandoAutorizacao: !!enr && enr.estado === 'AGUARDANDO_AUTORIZACAO',
        });
    }
    return itens;
}

async function conversaParaAgente(conversaId) {
    if (!UUID.test(String(conversaId))) throw new ChatErro(404, 'Conversa não encontrada.', 'NAO_ENCONTRADO');
    const c = await prisma.chatLukeConversa.findUnique({ where: { id: String(conversaId) } });
    if (!c) throw new ChatErro(404, 'Conversa não encontrada.', 'NAO_ENCONTRADO');
    return c;
}

async function mensagensParaAgente(conversa, params) {
    const pagina = await paginar(conversa.id, params || {}, { modo: 'novas', visao: 'agente' });
    return { ...pagina, conversa: { id: conversa.id, usuario: paraUsuarioAgente(conversa, await usuariosPorId([conversa.usuarioId])), criadoEm: conversa.criadoEm, ultimaMensagemEm: conversa.ultimaMensagemEm } };
}

/** Resposta do Luke no chat. NÃO gera evento de webhook. Devolve { mensagem, duplicada }. */
async function responderComoLuke({ agente, conversaId, corpo, chaveIdempotencia }) {
    await agenteHabilitado(agente.id);
    const conversa = await conversaParaAgente(conversaId);
    const b = corpo && typeof corpo === 'object' ? corpo : {};
    const texto = limparTexto(b.texto);
    if (!texto) throw new ChatErro(400, 'O campo `texto` é obrigatório.', 'MENSAGEM_VAZIA');
    if (texto.length > LIMITE_TEXTO_LUKE) throw new ChatErro(400, `O texto pode ter no máximo ${LIMITE_TEXTO_LUKE} caracteres.`, 'TEXTO_GRANDE');
    const chave = lerChave(chaveIdempotencia, 'l');

    let status = 'RESPONDIDO';
    if (b.status !== undefined && b.status !== null) {
        const s = String(b.status).toUpperCase();
        if (!STATUS_LUKE.includes(s)) throw new ChatErro(400, `status deve ser um de: ${STATUS_LUKE.join(', ')}.`, 'STATUS_INVALIDO');
        status = s === 'ERRO' ? 'ERRO' : 'RESPONDIDO'; // "aguardando autorização" é derivado das solicitações ligadas
    }

    let solicitacaoIds = [];
    if (b.solicitacaoIds !== undefined && b.solicitacaoIds !== null) {
        if (!Array.isArray(b.solicitacaoIds) || b.solicitacaoIds.length > 20 || b.solicitacaoIds.some((x) => typeof x !== 'string' || !UUID.test(x))) {
            throw new ChatErro(400, '`solicitacaoIds` deve ser uma lista (até 20) de ids de solicitação.', 'SOLICITACAO_INVALIDA');
        }
        solicitacaoIds = [...new Set(b.solicitacaoIds)];
        if (solicitacaoIds.length) {
            const donas = await prisma.agenteSolicitacao.findMany({ where: { id: { in: solicitacaoIds }, agenteId: agente.id }, select: { id: true } });
            const ok = new Set(donas.map((s) => s.id));
            const faltam = solicitacaoIds.filter((id) => !ok.has(id));
            if (faltam.length) throw new ChatErro(400, 'Há solicitação inexistente ou que não é deste agente.', 'SOLICITACAO_INVALIDA', { ids: faltam });
        }
    }

    let respondeA = null;
    if (b.respondeA !== undefined && b.respondeA !== null && b.respondeA !== '') {
        if (typeof b.respondeA !== 'string' || !UUID.test(b.respondeA)) throw new ChatErro(400, '`respondeA` deve ser o id de uma mensagem do usuário.', 'RESPONDE_A_INVALIDO');
        const alvo = await prisma.chatLukeMensagem.findFirst({ where: { id: b.respondeA, conversaId: conversa.id, autor: 'USUARIO' }, select: { id: true } });
        if (!alvo) throw new ChatErro(400, 'A mensagem de `respondeA` não existe nesta conversa.', 'RESPONDE_A_INVALIDO');
        respondeA = alvo.id;
    }

    const ctx = { visao: 'agente' };
    if (chave) {
        const ja = await carregarExistente(conversa.id, chave, ctx);
        if (ja) return { mensagem: ja, duplicada: true };
    }

    const mensagemId = crypto.randomUUID();
    let criada;
    try {
        criada = await prisma.$transaction(async (tx) => {
            const m = await tx.chatLukeMensagem.create({
                data: { id: mensagemId, conversaId: conversa.id, autor: 'LUKE', usuarioId: null, texto, tipo: 'TEXTO', status, respondeA, chaveIdempotencia: chave },
            });
            if (solicitacaoIds.length) {
                await tx.chatLukeMensagemSolicitacao.createMany({ data: solicitacaoIds.map((solicitacaoId) => ({ mensagemId, solicitacaoId, origem: 'LUKE' })), skipDuplicates: true });
            }
            // a(s) mensagem(ns) do usuário que ele respondeu saem de "Luke processando"
            await tx.chatLukeMensagem.updateMany({
                where: respondeA
                    ? { id: respondeA, status: { in: ['ENVIADO', 'PROCESSANDO'] } }
                    : { conversaId: conversa.id, autor: 'USUARIO', status: { in: ['ENVIADO', 'PROCESSANDO'] }, criadoEm: { lte: m.criadoEm } },
                data: { status },
            });
            await tx.chatLukeConversa.update({ where: { id: conversa.id }, data: { ultimaMensagemEm: m.criadoEm } });
            return m;
        }, { timeout: 20000, maxWait: 10000 });
    } catch (e) {
        if (e && e.code === 'P2002' && chave) {
            const ja = await carregarExistente(conversa.id, chave, ctx);
            if (ja) return { mensagem: ja, duplicada: true };
        }
        throw e;
    }
    auditar('CHAT_LUKE_RESPOSTA', 'ChatLukeMensagem', criada.id, { conversaId: conversa.id, solicitacaoIds, respondeA, tamanhoTexto: texto.length }, { id: agente.id, nome: agente.nome });
    const [mensagem] = await enriquecer([criada], ctx);
    return { mensagem, duplicada: false };
}

// ───────────────────────── vínculo conversa → solicitação (headers X-Origem-*) ─────────────────────────
/**
 * Liga uma solicitação recém-criada (202) à mensagem do usuário que a originou. Só vale quando quem pediu é o agente
 * configurado do chat. Id inválido/inexistente NÃO falha: só vira aviso no log (header velho nunca bloqueia o financeiro).
 */
async function vincularOrigem(solicitacaoId, origem, agenteId) {
    if (!origem || !origem.conversaId) return { vinculado: false };
    const cfg = await lerConfig();
    if (!cfg.agenteId || cfg.agenteId !== agenteId) { console.warn('[ChatLuke] X-Origem-* ignorado: o agente não é o do chat.'); return { vinculado: false }; }
    const conversa = await prisma.chatLukeConversa.findUnique({ where: { id: origem.conversaId }, select: { id: true } });
    if (!conversa) { console.warn('[ChatLuke] X-Origem-Conversa desconhecida: vínculo ignorado.'); return { vinculado: false }; }
    const m = await prisma.chatLukeMensagem.findFirst({
        where: origem.mensagemId ? { id: origem.mensagemId, conversaId: conversa.id, autor: 'USUARIO' } : { conversaId: conversa.id, autor: 'USUARIO' },
        orderBy: { criadoEm: 'desc' }, select: { id: true },
    });
    if (!m) { console.warn('[ChatLuke] X-Origem-Mensagem não pertence à conversa: vínculo ignorado.'); return { vinculado: false }; }
    await prisma.chatLukeMensagemSolicitacao.createMany({ data: [{ mensagemId: m.id, solicitacaoId, origem: 'HEADER' }], skipDuplicates: true });
    await prisma.chatLukeMensagem.updateMany({ where: { id: m.id }, data: { atualizadoEm: new Date() } }); // o polling do chat percebe o cartão novo
    return { vinculado: true, conversaId: conversa.id, mensagemId: m.id };
}

// ───────────────────────── admin: limite individual ─────────────────────────
async function listarLimites() {
    const rows = await prisma.chatLukeLimite.findMany({ orderBy: { atualizadoEm: 'desc' }, take: 500 });
    const nomes = await usuariosPorId(rows.map((r) => r.usuarioId));
    return rows.map((r) => ({
        usuarioId: r.usuarioId, usuarioNome: nomes.get(r.usuarioId)?.nome || null,
        pedidosDia: r.pedidosDia, anexosDia: r.anexosDia, duvidasDia: r.duvidasDia, atualizadoEm: r.atualizadoEm,
    }));
}

async function salvarLimite(usuarioId, entrada, ator) {
    if (!usuarioId || String(usuarioId).length > 100) throw new ChatErro(400, 'usuarioId inválido.', 'USUARIO_INVALIDO');
    const v = await prisma.vendedor.findUnique({ where: { id: String(usuarioId) }, select: { id: true } });
    if (!v) throw new ChatErro(404, 'Usuário não encontrado.', 'NAO_ENCONTRADO');
    const dados = {};
    for (const k of Object.keys(PADRAO_LIMITES)) {
        if (entrada[k] === undefined) continue;
        if (entrada[k] === null) { dados[k] = null; continue; } // null = volta ao padrão geral
        const n = inteiroOuNulo(entrada[k]);
        if (n === null) throw new ChatErro(400, `${k} deve ser um número inteiro de 0 a 100000 (ou null para voltar ao padrão).`, 'LIMITE_INVALIDO');
        dados[k] = n;
    }
    if (!Object.keys(dados).length) throw new ChatErro(400, 'Informe pedidosDia, anexosDia e/ou duvidasDia.', 'LIMITE_INVALIDO');
    const row = await prisma.chatLukeLimite.upsert({
        where: { usuarioId: v.id }, update: { ...dados, atualizadoPorNome: ator?.nome || null }, create: { usuarioId: v.id, ...dados, atualizadoPorNome: ator?.nome || null },
    });
    await auditar('CHAT_LUKE_LIMITE_ALTERADO', 'ChatLukeLimite', v.id, dados, ator);
    return { usuarioId: row.usuarioId, pedidosDia: row.pedidosDia, anexosDia: row.anexosDia, duvidasDia: row.duvidasDia };
}

async function removerLimite(usuarioId, ator) {
    const r = await prisma.chatLukeLimite.deleteMany({ where: { usuarioId: String(usuarioId) } });
    if (r.count) await auditar('CHAT_LUKE_LIMITE_REMOVIDO', 'ChatLukeLimite', usuarioId, {}, ator);
    return { removido: r.count === 1 };
}

function _resetarParaTeste() { cacheConfig = null; janelaMinuto.clear(); }

module.exports = {
    ChatErro, ASSUNTOS, PADRAO_LIMITES, LIMITE_ANEXO_BYTES, MAX_ANEXOS_MENSAGEM, LIMITE_POR_MINUTO,
    podeUsar, ehAdmin, permissoesDe, lerConfig, salvarConfig, exigirAtivo, limitesDe, saldoDoDia, checarLimiteDuvidas,
    limparTexto, validarArquivo, apagarTemps,
    abrirConversa, listarDoUsuario, enviarMensagemUsuario, marcarLida, naoLidas, resumo, anexoDoUsuario, anexoParaAgente, entregarAnexo,
    agenteHabilitado, listarConversasAgente, conversaParaAgente, mensagensParaAgente, responderComoLuke,
    vincularOrigem, listarLimites, salvarLimite, removerLimite, enriquecer, derivarEstado, _resetarParaTeste,
};
