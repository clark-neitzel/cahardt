/**
 * "CADASTRO A CORRIGIR" de clientes EXISTENTES (pedido do dono, 11/2026) — ponto ÚNICO.
 *
 * A regra de nome mora em utils/nomeCadastro.js (CPF = nome+sobrenome; CNPJ = razão+fantasia).
 * Aqui mora o que depende de banco/chave:
 *   - a CHAVE em AppConfig (`cadastro_nome_config`, nasce DESLIGADA);
 *   - o estado derivado do cliente (`cadastroACorrigir`) — SEM coluna nova, calculado de
 *     Documento/Nome/NomeFantasia;
 *   - a lista de afetados (cache de 60s) para o filtro/tela de pendências;
 *   - a trava `exigirCadastroOk`, chamada ao criar/enviar pedido, aprovar fila, criar amostra e
 *     emitir NF-e de venda.
 *
 * Tipos:
 *   CPF_NOME_UNICO     → BLOQUEIA a venda (quando a chave está ligada).
 *   CNPJ_SEM_FANTASIA  → SÓ AVISO, nunca bloqueia.
 *
 * Nunca chamar a trava em: emitirDevolucao, devolução, baixa/Caixa/Asaas/cobrança, atendimento,
 * edição do cadastro, ficha, entrada na fila do site/Ana (criarPedidoSite), catálogo personalizado.
 */
const prisma = require('../config/database');
const { situacaoNomeCadastro } = require('../utils/nomeCadastro');

const CHAVE = 'cadastro_nome_config';
const PADRAO = { bloquearCpfNomeUnico: false };
const CODIGO_ERRO = 'CADASTRO_A_CORRIGIR';
const TIPOS = ['CPF_NOME_UNICO', 'CNPJ_SEM_FANTASIA'];

// ── Configuração ─────────────────────────────────────────────────────────────
let _cfgCache = null;
let _cfgEm = 0;
const CFG_TTL_MS = 30000;

const normalizarCfg = (valor) => ({
    bloquearCpfNomeUnico: !!(valor && typeof valor === 'object' && valor.bloquearCpfNomeUnico === true),
});

/** Leitura FRESCA (sem cache) — usada na hora de decidir bloqueio. FAIL-OPEN: erro = desligado. */
const lerConfigFresca = async () => {
    try {
        const linha = await prisma.appConfig.findUnique({ where: { key: CHAVE } });
        return normalizarCfg(linha?.value);
    } catch (e) {
        console.error('[CadastroNome] Falha ao ler a chave (segue SEM bloquear):', e.message);
        return { ...PADRAO };
    }
};

/** Leitura com cache curto (30s) — para telas/listas (o campo `bloqueia` do aviso). Fail-open. */
const getConfig = async () => {
    if (_cfgCache && Date.now() - _cfgEm < CFG_TTL_MS) return _cfgCache;
    _cfgCache = await lerConfigFresca();
    _cfgEm = Date.now();
    return _cfgCache;
};

const limparCacheConfig = () => { _cfgCache = null; _cfgEm = 0; };

/** Grava a chave (só o ADMIN chama — a rota confere). Invalida os caches e devolve o estado novo. */
const salvarConfig = async (parcial = {}) => {
    const atual = await lerConfigFresca();
    const novo = { ...atual };
    if (parcial.bloquearCpfNomeUnico !== undefined) novo.bloquearCpfNomeUnico = parcial.bloquearCpfNomeUnico === true;
    await prisma.appConfig.upsert({
        where: { key: CHAVE },
        update: { value: novo },
        create: { key: CHAVE, value: novo },
    });
    limparCacheConfig();
    return { anterior: atual, atual: novo };
};

// ── Estado derivado do cliente ───────────────────────────────────────────────
/** Situação crua (sem a chave): null | { tipo, campo, mensagem }. */
const situacaoDe = (c) => situacaoNomeCadastro({
    documento: c?.Documento,
    nome: c?.Nome,
    nomeFantasia: c?.NomeFantasia,
});

/**
 * Formato do contrato com o frontend: null se ok, senão
 * { tipo, campo, mensagem, bloqueia }  — bloqueia = (tipo CPF && chave ligada).
 * `cfg` = { bloquearCpfNomeUnico } (passe uma vez por requisição; não consulta o banco aqui).
 */
const cadastroACorrigir = (c, cfg) => {
    const s = situacaoDe(c);
    if (!s) return null;
    return {
        tipo: s.tipo,
        campo: s.campo,
        mensagem: s.mensagem,
        bloqueia: s.tipo === 'CPF_NOME_UNICO' && !!cfg?.bloquearCpfNomeUnico,
    };
};

/**
 * Formato para a API da IA (aditivo, v1.8.0): null se ok, senão { bloqueado, tipo, mensagem }.
 * `bloqueado` = esta venda seria RECUSADA agora (CPF de nome único + chave ligada). Avisa a Ana de que o
 * pedido que ela tirar para este cliente vai cair na fila, mas a equipe não conseguirá aprovar até corrigir.
 */
const paraIA = (c, cfg) => {
    const r = cadastroACorrigir(c, cfg);
    return r ? { bloqueado: r.bloqueia, tipo: r.tipo, mensagem: r.mensagem } : null;
};

// ── Lista de afetados (cache 60s) ────────────────────────────────────────────
let _afetados = null; // Map<UUID, { tipo, campo, mensagem, Ativo, idVendedor, Nome }>
let _afetadosEm = 0;
const AFETADOS_TTL_MS = 60000;

/** Chamar quando um cliente é criado/atualizado (criar, atualizar, atualizarLote). */
const limparCache = () => { _afetados = null; _afetadosEm = 0; };

const mapaAfetados = async () => {
    if (_afetados && Date.now() - _afetadosEm < AFETADOS_TTL_MS) return _afetados;
    const linhas = await prisma.cliente.findMany({
        where: { Documento: { not: null } },
        select: { UUID: true, Nome: true, NomeFantasia: true, Documento: true, Ativo: true, idVendedor: true },
    });
    const m = new Map();
    for (const c of linhas) {
        const s = situacaoDe(c);
        if (s) m.set(c.UUID, { ...s, Ativo: c.Ativo, idVendedor: c.idVendedor, Nome: c.Nome || '' });
    }
    _afetados = m;
    _afetadosEm = Date.now();
    return m;
};

/**
 * UUIDs dos clientes afetados, para o filtro `?cadastroACorrigir=1` do GET /clientes.
 * `tipo` opcional restringe a um dos TIPOS.
 */
const idsAfetados = async ({ tipo } = {}) => {
    const m = await mapaAfetados();
    const ids = [];
    for (const [uuid, s] of m) if (!tipo || s.tipo === tipo) ids.push(uuid);
    return ids;
};

/**
 * Dados da tela "Cadastros a corrigir (nome)": config + contagem + itens.
 *   escopo padrão = só ATIVOS (inativo não vende); `ativo='todos'` inclui os inativos.
 *   `vendedor` (id) e `tipo` restringem os ITENS; a `contagem` respeita ativo+vendedor mas NÃO o `tipo`
 *   (para os chips da tela mostrarem os dois totais). `limite` máx. 500, `pagina` a partir de 1.
 */
const painel = async ({ vendedor, tipo, ativo, limite, pagina } = {}) => {
    const cfg = await getConfig();
    const m = await mapaAfetados();
    const lim = Math.min(500, Math.max(1, parseInt(limite, 10) || 500));
    const pag = Math.max(1, parseInt(pagina, 10) || 1);
    const naEscopo = [];
    for (const [uuid, s] of m) {
        if (ativo !== 'todos' && ativo !== 'false' && s.Ativo !== true) continue;
        if (ativo === 'false' && s.Ativo !== false) continue;
        if (vendedor && s.idVendedor !== vendedor) continue;
        naEscopo.push([uuid, s]);
    }
    const contagem = { cpfNomeUnico: 0, cnpjSemFantasia: 0 };
    for (const [, s] of naEscopo) {
        if (s.tipo === 'CPF_NOME_UNICO') contagem.cpfNomeUnico++; else contagem.cnpjSemFantasia++;
    }
    const filtrados = naEscopo
        .filter(([, s]) => !tipo || s.tipo === tipo)
        .sort((a, b) => a[1].Nome.localeCompare(b[1].Nome, 'pt-BR'));
    const total = filtrados.length;
    const fatia = filtrados.slice((pag - 1) * lim, pag * lim);
    const ids = fatia.map(([uuid]) => uuid);
    const clientes = ids.length ? await prisma.cliente.findMany({
        where: { UUID: { in: ids } },
        select: {
            UUID: true, Codigo: true, Nome: true, NomeFantasia: true, Documento: true, Tipo_Pessoa: true, Ativo: true,
            idVendedor: true, Telefone: true, Telefone_Celular: true,
            vendedor: { select: { nome: true } },
        },
    }) : [];
    const porId = new Map(clientes.map(c => [c.UUID, c]));
    const itens = [];
    for (const [uuid, s] of fatia) {
        const c = porId.get(uuid);
        if (!c) continue;
        itens.push({
            UUID: c.UUID, Codigo: c.Codigo, Nome: c.Nome, NomeFantasia: c.NomeFantasia, Documento: c.Documento,
            tipo: s.tipo, campo: s.campo, mensagem: s.mensagem,
            Tipo_Pessoa: c.Tipo_Pessoa, Ativo: c.Ativo, idVendedor: c.idVendedor,
            vendedorNome: c.vendedor?.nome || null,
            telefone: c.Telefone_Celular || c.Telefone || null,
        });
    }
    return { config: { bloquearCpfNomeUnico: cfg.bloquearCpfNomeUnico }, contagem, itens, total, pagina: pag, limite: lim };
};

// ── Trava ────────────────────────────────────────────────────────────────────
const montarMensagem = (nome) =>
    `${nome} está com o cadastro a corrigir: CPF exige nome e sobrenome (ex.: Maria Silva). `
    + 'Peça a quem edita clientes para corrigir (Clientes → abrir o cliente).';

/** Erro de bloqueio já no formato do contrato: HTTP 403 { error, codigo, clienteId, clienteNome, motivos }. */
const erroBloqueio = (cliente, clienteId, acao) => {
    const nome = String(cliente?.Nome || '').trim() || 'Este cliente';
    const motivo = { tipo: 'CPF_NOME_UNICO', campo: 'Nome', mensagem: situacaoNomeCadastro({ documento: cliente?.Documento, nome: cliente?.Nome })?.mensagem };
    const payload = {
        error: montarMensagem(nome),
        codigo: CODIGO_ERRO,
        clienteId,
        clienteNome: nome,
        motivos: [motivo],
    };
    const err = new Error(payload.error);
    err.status = 403;       // kitFestaController.erro
    err.statusHttp = 403;   // pedidoController.atualizar
    err.codigo = CODIGO_ERRO;
    err.payload = payload;
    err.acao = acao || null;
    return err;
};

/**
 * Trava central. Lança erro 403 CADASTRO_A_CORRIGIR se (e só se) a chave estiver LIGADA e o
 * cliente for CPF de nome único. FAIL-OPEN: qualquer exceção na checagem NÃO bloqueia a venda.
 * Só consulta o cliente quando a chave está ligada (desligada = zero custo extra além de 1 leitura).
 */
const exigirCadastroOk = async (clienteId, { acao } = {}) => {
    if (!clienteId) return;
    let bloqueio = null;
    try {
        const cfg = await lerConfigFresca(); // sempre fresca na hora de decidir
        if (!cfg.bloquearCpfNomeUnico) return;
        const c = await prisma.cliente.findUnique({
            where: { UUID: clienteId },
            select: { Nome: true, NomeFantasia: true, Documento: true },
        });
        if (!c) return;
        const s = situacaoDe(c);
        if (!s || s.tipo !== 'CPF_NOME_UNICO') return;
        bloqueio = erroBloqueio(c, clienteId, acao);
    } catch (e) {
        console.error('[CadastroNome] Falha na checagem (venda segue liberada):', e.message);
        return;
    }
    throw bloqueio;
};

/** O erro é o 403 desta trava? (para controllers/rotas responderem com o `payload` do contrato) */
const ehErroBloqueio = (e) => !!e && e.codigo === CODIGO_ERRO && !!e.payload;

module.exports = {
    CHAVE, PADRAO, CODIGO_ERRO, TIPOS,
    getConfig, lerConfigFresca, salvarConfig, limparCacheConfig,
    situacaoDe, cadastroACorrigir, paraIA,
    mapaAfetados, idsAfetados, limparCache, painel,
    exigirCadastroOk, ehErroBloqueio,
};
