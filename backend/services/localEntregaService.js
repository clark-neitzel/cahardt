// ─────────────────────────────────────────────────────────────────────────────
// Local de entrega (Entrega 2, 11/2026)
//
// ONDE entregar, quando é diferente do endereço do cadastro. O cadastro (clientes.End_*) continua sendo o
// endereço dos DOCUMENTOS (NF-e, boleto, cobrança) — NADA aqui escreve em `clientes` nem em `pedidos`.
// Tabelas laterais: clientes_local_entrega (1-1 com o cliente), clientes_local_entrega_log (trilha),
// pedidos_local_entrega (1-1 com o pedido: endereço avulso / cadastro forçado / carimbo do destino).
//
// Este serviço é a fonte única de gravação — a tela do cadastro, o "Novo pedido" e (Entrega 3) a Ana chamam
// as mesmas funções (ex.: gravarDoCliente({ clienteUuid, endereco, origem: 'ANA', autor })).
//
// A decisão de "qual endereço usar" é função PURA em utils/enderecoEntrega.js (resolverLocalEntrega).
// Flags (AppConfig 'local_entrega_config'): editor | exibir | operacao | mapa — TUDO desligado por padrão.
// Nesta fatia nenhum consumidor existente lê estas tabelas; só as rotas novas.
//
// Não geocodifica (aceita pontoGps já pronto "lat,lng"). Log/histórico ficam FORA de qualquer transação,
// em try/catch próprio: log lento ou com falha nunca derruba nem desfaz a gravação.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');
const {
    resolverLocalEntrega, pontoValido, montarTexto, enderecoDe,
} = require('../utils/enderecoEntrega');

const CONFIG_KEY = 'local_entrega_config';
const FLAGS = ['editor', 'exibir', 'operacao', 'mapa'];
const CACHE_MS = 30 * 1000;

const CAMPOS_ENDERECO = ['logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'cep', 'referencia'];
const LIMITES = { logradouro: 200, numero: 30, complemento: 100, bairro: 100, cidade: 100, estado: 2, cep: 9, referencia: 500 };

const erro = (status, mensagem, codigo) => Object.assign(new Error(mensagem), { status, codigo });

// ── Flags ────────────────────────────────────────────────────────────────────

const CONFIG_PADRAO = Object.freeze({ editor: false, exibir: false, operacao: false, mapa: false });
let _cacheConfig = null; // { em, valor }

// Leitura fresca e ESTRITA (propaga erro) — só para gravar. Quem consome flag usa lerConfig (que falha fechado).
const lerConfigEstrita = async () => {
    const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } });
    const v = (cfg && typeof cfg.value === 'object' && cfg.value) || {};
    const valor = {};
    for (const f of FLAGS) valor[f] = v[f] === true;
    return valor;
};

// Consumidores: se não conseguir ler a flag, tudo desligado (= comportamento antigo) e NÃO guarda no cache
const lerConfig = async () => {
    if (_cacheConfig && Date.now() - _cacheConfig.em < CACHE_MS) return { ..._cacheConfig.valor };
    try {
        const valor = await lerConfigEstrita();
        _cacheConfig = { em: Date.now(), valor };
        return { ...valor };
    } catch (e) {
        console.error('[LocalEntrega] falha ao ler config:', e.message);
        return { ...CONFIG_PADRAO };
    }
};

// patch parcial: só chaves conhecidas, só boolean estrito; devolve a config completa gravada.
// Se a leitura do estado atual falhar, PROPAGA o erro (não regrava as outras flags como false).
const gravarConfig = async (patch, autor) => {
    const atual = await lerConfigEstrita();
    const novo = { ...atual };
    for (const f of FLAGS) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, f)) {
            if (typeof patch[f] !== 'boolean') throw erro(400, `"${f}" deve ser true ou false.`);
            novo[f] = patch[f];
        }
    }
    await prisma.appConfig.upsert({
        where: { key: CONFIG_KEY },
        update: { value: novo },
        create: { key: CONFIG_KEY, value: novo },
    });
    _cacheConfig = null;
    const a = autorDe(autor);
    for (const f of FLAGS) {
        if (atual[f] !== novo[f]) {
            console.log('[LocalEntrega] flag alterada ' + JSON.stringify({ flag: f, de: atual[f], para: novo[f], autorId: a.id, autorNome: a.nome, em: new Date().toISOString() }));
        }
    }
    return novo;
};

const flagLigada = async (nome) => (await lerConfig())[nome] === true;

// ── Validação ────────────────────────────────────────────────────────────────

// Aceita só os campos conhecidos; strings aparadas; '' vira null; respeita tamanhos.
// Devolve { ...8 campos, pontoGps } — campos AUSENTES no input ficam `undefined` (= não alterar).
function validarEndereco(input, { exigirConteudo = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw erro(400, 'Informe o endereço do local de entrega.');
    const out = {};
    for (const c of CAMPOS_ENDERECO) {
        if (!Object.prototype.hasOwnProperty.call(input, c) || input[c] === undefined) { out[c] = undefined; continue; }
        const bruto = input[c];
        if (bruto === null) { out[c] = null; continue; }
        if (typeof bruto !== 'string' && typeof bruto !== 'number') throw erro(400, `Campo "${c}" inválido.`);
        if (String(bruto).includes('\u0000')) throw erro(400, `Campo "${c}" contém caractere inválido.`);
        let t = String(bruto).trim();
        if (c === 'estado') t = t.toUpperCase();
        if (c === 'cep' && t) {
            const dig = t.replace(/\D/g, '');
            if (dig.length !== 8) throw erro(400, 'CEP inválido (use 8 dígitos).');
            t = `${dig.slice(0, 5)}-${dig.slice(5)}`;
        }
        if (c === 'estado' && t && !/^[A-Z]{2}$/.test(t)) throw erro(400, 'Estado inválido (use a sigla com 2 letras, ex.: SC).');
        if (t.length > LIMITES[c]) throw erro(400, `Campo "${c}" muito longo (máx. ${LIMITES[c]} caracteres).`);
        out[c] = t === '' ? null : t;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'pontoGps') && input.pontoGps !== undefined) {
        if (input.pontoGps === null || input.pontoGps === '') out.pontoGps = null;
        else {
            if (String(input.pontoGps).includes('\u0000')) throw erro(400, 'Campo "pontoGps" contém caractere inválido.');
            const p = pontoValido(input.pontoGps);
            if (!p) throw erro(400, 'Ponto GPS inválido. Use "lat,lng" (latitude -90 a 90, longitude -180 a 180).');
            out.pontoGps = p;
        }
    } else out.pontoGps = undefined;

    if (exigirConteudo) {
        const tem = montarTexto(enderecoDe(out)) || out.pontoGps;
        if (!tem) throw erro(400, 'Informe ao menos o endereço (rua, bairro, cidade ou CEP) ou o ponto GPS.');
    }
    return out;
}

const autorDe = (autor) => ({
    id: (autor && autor.id) || null,
    nome: (autor && autor.nome) || null,
});

// ── Log (SEMPRE fora de transação, nunca derruba a operação) ─────────────────

const snapshotLocal = (l) => (l ? {
    ativo: l.ativo,
    ...Object.fromEntries(CAMPOS_ENDERECO.map((c) => [c, l[c] == null ? null : l[c]])),
    pontoGps: l.pontoGps == null ? null : l.pontoGps,
} : null);

const diffCampos = (antes, depois) => {
    const n = (v) => (v == null ? null : v);
    return ['ativo', ...CAMPOS_ENDERECO, 'pontoGps'].filter((c) => n(antes && antes[c]) !== n(depois && depois[c]));
};

async function gravarLog({ clienteUuid, tipo, origem, antes, depois, camposAlterados, autor, posicaoAutor, motivo }) {
    try {
        const a = autorDe(autor);
        await prisma.clienteLocalEntregaLog.create({
            data: {
                clienteUuid, tipo, origem: origem || null,
                antes: antes || undefined, depois,
                camposAlterados: camposAlterados || [],
                autorId: a.id, autorNome: a.nome,
                posicaoAutor: posicaoAutor || null, motivo: motivo || null,
            },
        });
    } catch (e) {
        console.error('[LocalEntrega] falha ao gravar log (operação já efetivada):', e.message);
    }
}

// ── Local de entrega do CLIENTE ──────────────────────────────────────────────

async function exigirCliente(clienteUuid) {
    const c = await prisma.cliente.findUnique({ where: { UUID: String(clienteUuid || '') }, select: { UUID: true } });
    if (!c) throw erro(404, 'Cliente não encontrado.');
    return c;
}

const obterDoCliente = async (clienteUuid) => prisma.clienteLocalEntrega.findUnique({ where: { clienteUuid } });

// Histórico (mais recente primeiro) — usado pelo card do cadastro
const historicoDoCliente = async (clienteUuid, limite = 50) => prisma.clienteLocalEntregaLog.findMany({
    where: { clienteUuid }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(parseInt(limite) || 50, 1), 200),
});

const violouUnico = (e) => !!(e && e.code === 'P2002');

/**
 * PURA (testável sem banco): dado o local `existente` (ou null) e o endereço já validado (`novo`), decide o que gravar.
 *  - campos AUSENTES no input (undefined) mantêm o que já existia (PUT parcial não apaga);
 *  - texto alterado (rua, número, bairro, cidade, UF, CEP — referência e complemento NÃO movem o ponto) sem ponto novo APAGA o ponto antigo (ele era do texto antigo) → pontoPendente;
 *  - ponto novo zera selo/sugestão (o voto do ponto antigo não vale para o novo);
 *  - o conteúdo é exigido sobre o resultado MESCLADO (PUT só com `referencia` num local existente funciona);
 *  - sempre reativa (ativo=true).
 * → { dados, antes, depois, campos, tipo, pontoPendente } — `campos` vazio e existente = nada a gravar.
 */
function prepararGravacaoCliente(existente, novo) {
    const base = existente || {};
    const merged = {};
    for (const c of CAMPOS_ENDERECO) merged[c] = novo[c] !== undefined ? novo[c] : (base[c] == null ? null : base[c]);
    const textoMudou = CAMPOS_ENDERECO.filter((c) => c !== 'referencia' && c !== 'complemento').some((c) => (base[c] == null ? null : base[c]) !== merged[c]);

    let pontoGps;
    if (novo.pontoGps !== undefined) pontoGps = novo.pontoGps;                  // veio ponto (ou null explícito)
    else if (existente && !textoMudou) pontoGps = existente.pontoGps || null;   // texto igual: mantém o ponto
    else pontoGps = null;                                                       // texto novo sem ponto novo: o antigo era de outro lugar

    if (!(montarTexto(enderecoDe(merged)) || pontoGps)) {
        throw erro(400, 'Informe ao menos o endereço (rua, bairro, cidade ou CEP) ou o ponto GPS.');
    }

    const dados = { ...merged, pontoGps, ativo: true };
    const pontoMudou = (existente ? existente.pontoGps || null : null) !== pontoGps;
    if (existente && pontoMudou) { dados.selo = null; dados.sugestao = null; dados.seloEm = null; }

    const antes = snapshotLocal(existente);
    const depois = snapshotLocal(dados);
    const campos = diffCampos(antes, depois);
    // CRIACAO | ALTERACAO | REATIVACAO (local desativado que volta a valer)
    const tipo = !existente ? 'CRIACAO' : (existente.ativo === false ? 'REATIVACAO' : 'ALTERACAO');
    return { dados, antes, depois, campos, tipo, pontoPendente: !pontoGps };
}

/**
 * Cria/atualiza o local de entrega do cliente (e o reativa). Não toca em `clientes`. Não geocodifica.
 * Atômico o bastante para não duplicar log sob PUTs paralelos, SEM $transaction:
 *   - criar = `create` (PK = cliente); quem perde a corrida (P2002) relê e trata como atualização;
 *   - atualizar = `updateMany` com guarda em `updatedAt` (otimista); quem perde relê e reavalia.
 * Só quem de fato gravou grava o log; quem não mudou nada responde gravado:false.
 * → { gravado, pontoPendente, local }
 */
async function gravarDoCliente({ clienteUuid, endereco, origem, autor, posicaoAutor, motivo }) {
    await exigirCliente(clienteUuid);
    const novo = validarEndereco(endereco);
    const a = autorDe(autor);

    for (let tentativa = 0; tentativa < 5; tentativa++) {
        const existente = await obterDoCliente(clienteUuid);
        const prep = prepararGravacaoCliente(existente, novo);

        if (existente && prep.campos.length === 0) {
            return { gravado: false, pontoPendente: !existente.pontoGps, local: existente };
        }

        let local;
        if (!existente) {
            try {
                local = await prisma.clienteLocalEntrega.create({
                    data: { clienteUuid, ...prep.dados, criadoPorId: a.id, criadoPorNome: a.nome, atualizadoPorNome: a.nome },
                });
            } catch (e) {
                if (violouUnico(e)) continue; // outro PUT criou primeiro: relê e trata como atualização
                throw e;
            }
        } else {
            const r = await prisma.clienteLocalEntrega.updateMany({
                where: { clienteUuid, updatedAt: existente.updatedAt },
                data: { ...prep.dados, atualizadoPorNome: a.nome },
            });
            if (r.count === 0) continue; // alguém mexeu entre a leitura e a gravação: relê
            local = await obterDoCliente(clienteUuid);
        }

        await gravarLog({
            clienteUuid, tipo: prep.tipo, origem,
            antes: prep.antes, depois: prep.depois, camposAlterados: prep.campos, autor: a, posicaoAutor, motivo,
        });
        return { gravado: true, pontoPendente: !local.pontoGps, local };
    }
    throw erro(409, 'O local de entrega foi alterado por outra pessoa ao mesmo tempo. Tente de novo.', 'CONFLITO');
}

/** Desativa o local (a linha fica; os pedidos pendentes voltam ao cadastro). → { desativado, local } */
async function desativar({ clienteUuid, origem, autor, posicaoAutor, motivo }) {
    await exigirCliente(clienteUuid);
    const existente = await obterDoCliente(clienteUuid);
    if (!existente || existente.ativo === false) return { desativado: false, local: existente || null };
    const a = autorDe(autor);
    // guarda `ativo: true` no WHERE: de dois DELETEs paralelos só um desativa (e só ele loga)
    const r = await prisma.clienteLocalEntrega.updateMany({
        where: { clienteUuid, ativo: true }, data: { ativo: false, atualizadoPorNome: a.nome },
    });
    const local = await obterDoCliente(clienteUuid);
    if (r.count === 0) return { desativado: false, local };
    await gravarLog({
        clienteUuid, tipo: 'DESATIVACAO', origem, antes: snapshotLocal(existente), depois: snapshotLocal(local),
        camposAlterados: ['ativo'], autor: a, posicaoAutor, motivo,
    });
    return { desativado: true, local };
}

/**
 * Grava só o ponto GPS do local (o texto precisa existir). Ponto novo zera selo/sugestão (voto recomeça).
 * `pontoGps` null limpa o ponto. → { gravado, local }
 */
async function gravarPontoDoCliente({ clienteUuid, pontoGps, origem, autor, posicaoAutor, motivo }) {
    await exigirCliente(clienteUuid);
    let ponto = null;
    if (pontoGps !== null && pontoGps !== '' && pontoGps !== undefined) {
        if (String(pontoGps).includes('\u0000')) throw erro(400, 'Campo "pontoGps" contém caractere inválido.');
        ponto = pontoValido(pontoGps);
        if (!ponto) throw erro(400, 'Ponto GPS inválido. Use "lat,lng" (latitude -90 a 90, longitude -180 a 180).');
    } else if (pontoGps === undefined) {
        throw erro(400, 'Informe o ponto GPS ("lat,lng") ou null para limpar.');
    }
    const a = autorDe(autor);
    for (let tentativa = 0; tentativa < 5; tentativa++) {
        const existente = await obterDoCliente(clienteUuid);
        if (!existente) throw erro(404, 'Este cliente ainda não tem local de entrega. Cadastre o endereço do local primeiro.', 'SEM_LOCAL');
        if (existente.ativo === false) throw erro(409, 'O local de entrega está desativado. Reative-o antes de mexer no ponto.', 'LOCAL_INATIVO');
        if ((existente.pontoGps || null) === ponto) return { gravado: false, local: existente };

        const r = await prisma.clienteLocalEntrega.updateMany({
            where: { clienteUuid, updatedAt: existente.updatedAt },
            data: { pontoGps: ponto, selo: null, sugestao: null, seloEm: null, atualizadoPorNome: a.nome },
        });
        if (r.count === 0) continue;
        const local = await obterDoCliente(clienteUuid);
        await gravarLog({
            clienteUuid, tipo: 'PONTO', origem, antes: snapshotLocal(existente), depois: snapshotLocal(local),
            camposAlterados: ['pontoGps'], autor: a, posicaoAutor, motivo,
        });
        return { gravado: true, local };
    }
    throw erro(409, 'O local de entrega foi alterado por outra pessoa ao mesmo tempo. Tente de novo.', 'CONFLITO');
}

// ── Local de entrega do PEDIDO ───────────────────────────────────────────────

// Só mexe enquanto o pedido não saiu para entrega, não foi cancelado/excluído nem devolvido por completo
async function exigirPedidoEditavel(pedidoId) {
    const p = await prisma.pedido.findUnique({
        where: { id: String(pedidoId || '') },
        select: { id: true, cancelado: true, statusEntrega: true, statusEnvio: true, devolucaoFinalizada: true },
    });
    if (!p) throw erro(404, 'Pedido não encontrado.');
    if (p.cancelado) throw erro(409, 'Pedido cancelado não pode ter o local de entrega alterado.', 'PEDIDO_CANCELADO');
    if (p.statusEnvio === 'EXCLUIDO') throw erro(409, 'Pedido excluído não pode ter o local de entrega alterado.', 'PEDIDO_EXCLUIDO');
    if (p.devolucaoFinalizada) throw erro(409, 'Pedido com devolução finalizada não pode ter o local de entrega alterado.', 'PEDIDO_DEVOLVIDO');
    if (p.statusEntrega !== 'PENDENTE') {
        throw erro(409, 'O local de entrega só pode ser alterado enquanto a entrega está pendente.', 'ENTREGA_NAO_PENDENTE');
    }
    return p;
}

const obterDoPedido = async (pedidoId) => prisma.pedidoLocalEntrega.findUnique({ where: { pedidoId } });

// PURA: dados a gravar para o modo/endereço do pedido (valida; lança 400)
function prepararGravacaoPedido(modo, endereco) {
    const m = String(modo || '').toUpperCase();
    if (m !== 'AVULSO' && m !== 'CADASTRO') throw erro(400, 'modo deve ser AVULSO ou CADASTRO.');
    const dados = { modo: m };
    if (m === 'AVULSO') {
        const e = validarEndereco(endereco, { exigirConteudo: true });
        for (const c of CAMPOS_ENDERECO) dados[c] = e[c] === undefined ? null : e[c];
        dados.pontoGps = e.pontoGps === undefined ? null : e.pontoGps;
    } else {
        dados.pontoGps = null;
        for (const c of CAMPOS_ENDERECO) dados[c] = null;
    }
    return dados;
}

const iguaisPedido = (linha, dados) => !!linha && ['modo', ...CAMPOS_ENDERECO, 'pontoGps'].every((c) => (linha[c] == null ? null : linha[c]) === (dados[c] == null ? null : dados[c]));

/**
 * Define o local de entrega do pedido.
 *   modo 'AVULSO'   → exige endereço (texto e/ou ponto)
 *   modo 'CADASTRO' → força o cadastro neste pedido (ignora o local do cliente); endereço é ignorado/limpo
 * Reenvio idêntico responde gravado:false (create/updateMany otimista, sem $transaction).
 * → { gravado, local }
 */
async function gravarDoPedido({ pedidoId, modo, endereco, autor }) {
    const dados = prepararGravacaoPedido(modo, endereco);
    await exigirPedidoEditavel(pedidoId);
    const a = autorDe(autor);
    const auditoria = { atualizadoPorId: a.id, atualizadoPorNome: a.nome };

    for (let tentativa = 0; tentativa < 5; tentativa++) {
        const existente = await obterDoPedido(pedidoId);
        if (existente && iguaisPedido(existente, dados)) return { gravado: false, local: existente };
        if (!existente) {
            try {
                const local = await prisma.pedidoLocalEntrega.create({ data: { pedidoId, ...dados, ...auditoria } });
                return { gravado: true, local };
            } catch (e) {
                if (violouUnico(e)) continue;
                throw e;
            }
        }
        const r = await prisma.pedidoLocalEntrega.updateMany({
            where: { pedidoId, updatedAt: existente.updatedAt }, data: { ...dados, ...auditoria },
        });
        if (r.count === 0) continue;
        return { gravado: true, local: await obterDoPedido(pedidoId) };
    }
    throw erro(409, 'O local de entrega do pedido foi alterado ao mesmo tempo. Tente de novo.', 'CONFLITO');
}

/** Volta o pedido ao padrão (local do cliente → cadastro). → { limpo } */
async function limparDoPedido({ pedidoId, autor }) {
    await exigirPedidoEditavel(pedidoId);
    const existente = await obterDoPedido(pedidoId);
    if (!existente) return { limpo: false };
    if (existente.destinoConcluido) {
        // já tem carimbo de entrega: preserva a linha, só zera o "onde entregar"
        const nulos = { modo: null, pontoGps: null };
        for (const c of CAMPOS_ENDERECO) nulos[c] = null;
        const a = autorDe(autor);
        await prisma.pedidoLocalEntrega.update({ where: { pedidoId }, data: { ...nulos, atualizadoPorId: a.id, atualizadoPorNome: a.nome } });
    } else {
        // deleteMany: dois DELETEs paralelos não estouram P2025
        const r = await prisma.pedidoLocalEntrega.deleteMany({ where: { pedidoId } });
        return { limpo: r.count > 0 };
    }
    return { limpo: true };
}

// ── Carregador em lote ───────────────────────────────────────────────────────

/**
 * ⚠️ AVISOS PARA QUEM CONSOME (F2 em diante):
 *  (a) CONSULTE A FLAG ANTES de chamar isto e de usar o campo (`exibir` / `operacao` / `mapa`, conforme o consumidor).
 *      Com a flag desligada a resposta do consumidor tem que ficar BYTE A BYTE igual a hoje — esta função não olha flag.
 *  (b) `resolverLocalEntrega` pode devolver origem LOCAL_CLIENTE com `texto: null` quando o local só tem ponto GPS
 *      (e PEDIDO com `ponto: null`). O consumidor TEM que tratar texto nulo (não imprimir "null", não quebrar o mapa).
 *  (c) F2 (OBRIGATÓRIO, antes de qualquer sinal 'LOCAL' ser gravado): `gpsClientesService.coletarSinais`
 *      (`clienteGpsSinal.findMany`, ~:246) deve filtrar `alvo: 'CADASTRO'` — senão o voto do local entra no ponto do cadastro.
 *
 * Anexa `localEntrega` aos pedidos (MUTA os objetos e devolve o mesmo array) — SÓ quando a origem
 * resolvida é diferente de CADASTRO. Pedido que cai no cadastro sai idêntico a hoje (campo ausente).
 * 1 query em pedidos_local_entrega + 1 em clientes_local_entrega (sem N+1). Extras só se faltar dado:
 *   - cliente sem End_* no objeto → +1 query em clientes
 *   - kitFestaPedido não carregado (undefined) → +1 query em kitfesta_pedidos
 * Quem chama decide pela flag (`exibir`/`operacao`/`mapa`) se usa o resultado.
 */
async function anexarLocalEntrega(pedidos) {
    const lista = (Array.isArray(pedidos) ? pedidos : [pedidos]).filter(Boolean);
    if (!lista.length) return pedidos;

    const ids = [...new Set(lista.map((p) => p.id).filter(Boolean))];
    const clienteIdDe = (p) => p.clienteId || (p.cliente && p.cliente.UUID) || null;
    const clienteIds = [...new Set(lista.map(clienteIdDe).filter(Boolean))];

    const precisaCliente = clienteIds.filter((id) => !lista.some((p) => clienteIdDe(p) === id && p.cliente && p.cliente.End_Logradouro !== undefined));
    const semKit = lista.filter((p) => p.kitFestaPedido === undefined).map((p) => p.id);

    const [pedLocais, cliLocais, clientesExtra, kits] = await Promise.all([
        ids.length ? prisma.pedidoLocalEntrega.findMany({ where: { pedidoId: { in: ids } } }) : [],
        clienteIds.length ? prisma.clienteLocalEntrega.findMany({ where: { clienteUuid: { in: clienteIds }, ativo: true } }) : [],
        precisaCliente.length ? prisma.cliente.findMany({
            where: { UUID: { in: precisaCliente } },
            select: { UUID: true, End_Logradouro: true, End_Numero: true, End_Complemento: true, End_Bairro: true, End_Cidade: true, End_Estado: true, End_CEP: true, Ponto_GPS: true },
        }) : [],
        semKit.length ? prisma.kitFestaPedido.findMany({ where: { pedidoId: { in: semKit } }, select: { pedidoId: true, modo: true, enderecoEntrega: true } }) : [],
    ]);

    const pedLocalPorId = new Map(pedLocais.map((l) => [l.pedidoId, l]));
    const cliLocalPorId = new Map(cliLocais.map((l) => [l.clienteUuid, l]));
    const clientePorId = new Map(clientesExtra.map((c) => [c.UUID, c]));
    const kitPorPedido = new Map(kits.map((k) => [k.pedidoId, k]));

    for (const p of lista) {
        const cid = clienteIdDe(p);
        const cliente = (p.cliente && p.cliente.End_Logradouro !== undefined) ? p.cliente : (clientePorId.get(cid) || p.cliente || null);
        const kitFesta = p.kitFestaPedido !== undefined ? p.kitFestaPedido : (kitPorPedido.get(p.id) || null);
        const r = resolverLocalEntrega({
            cliente,
            clienteLocal: cliLocalPorId.get(cid) || null,
            pedidoLocal: pedLocalPorId.get(p.id) || null,
            kitFesta,
        });
        if (r.origem !== 'CADASTRO') p.localEntrega = r;
    }
    return pedidos;
}

module.exports = {
    // config
    lerConfig, gravarConfig, flagLigada, FLAGS,
    // cliente
    obterDoCliente, historicoDoCliente, gravarDoCliente, desativar, gravarPontoDoCliente,
    // pedido
    obterDoPedido, gravarDoPedido, limparDoPedido,
    // lote
    anexarLocalEntrega,
    // utilitários / funções puras (testadas sem banco)
    validarEndereco, prepararGravacaoCliente, prepararGravacaoPedido,
};
