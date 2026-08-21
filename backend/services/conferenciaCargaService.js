/**
 * CONFERÊNCIA DE CARGA POR BIPAGEM (doca, 08/2026).
 *
 * A pessoa abre a carga no tablet/computador da doca e bipa cada volume ao colocar no
 * caminhão. O campo aceita:
 *   - a CHAVE da NF-e (44 dígitos, código de barras da DANFE);
 *   - o CÓDIGO DO RECIBO `ZZ<n>` / `BN<n>` / `AM<n>` (Code128-B do recibo de conferência);
 *   - um número digitado na mão (só é resolvido DENTRO da carga — ver `utils/codigoCarga.js`).
 *
 * A conferência é PERSISTIDA (decisão do dono): duas pessoas podem estar bipando a mesma
 * carga em aparelhos diferentes, e o contador só é honesto se for recontado no servidor a
 * cada bipe. Por isso TODA resposta traz `conferidas / total / faltam` recontados do banco.
 *
 * NUNCA lança no caminho normal — sempre devolve um objeto com `resultado`. Quem chama
 * responde HTTP 200 mesmo nas recusas: 4xx cai no interceptor genérico do axios e a doca
 * perde a mensagem precisa (mesmo motivo de `canhotoService.bipar`).
 */

const prisma = require('../config/database');
const { interpretarCodigoCarga } = require('../utils/codigoCarga');

// ── Formatação ───────────────────────────────────────────────────────────────

/** Etiqueta humana do item — a MESMA do resto do módulo de embarque. */
function etiquetaPedido(p) {
    return `${p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '#'}${p.numero ?? p.id.slice(0, 8)}`;
}
function etiquetaAmostra(a) {
    return `AM#${a.numero ?? a.id.slice(0, 8)}`;
}

const SELECT_PEDIDO = {
    id: true, numero: true, especial: true, bonificacao: true, embarqueId: true,
    nfeChave: true, nfeNumero: true, statusEntrega: true,
    cargaConferidaEm: true, cargaConferidaPorId: true, cargaConferidaPorNome: true, cargaConferidaOrigem: true,
    cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Cidade: true } },
};

const SELECT_AMOSTRA = {
    id: true, numero: true, embarqueId: true, status: true,
    cargaConferidaEm: true, cargaConferidaPorId: true, cargaConferidaPorNome: true, cargaConferidaOrigem: true,
    cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Cidade: true } },
    lead: { select: { id: true, nomeEstabelecimento: true, cidade: true } },
};

/** Formato de item devolvido ao frontend (mesmo shape para pedido e amostra). */
function itemPedido(p) {
    return {
        tipo: 'pedido',
        id: p.id,
        numero: p.numero ?? null,
        etiqueta: etiquetaPedido(p),
        cliente: p.cliente?.NomeFantasia || p.cliente?.Nome || null,
        cidade: p.cliente?.End_Cidade || null,
        especial: !!p.especial,
        bonificacao: !!p.bonificacao,
        embarqueId: p.embarqueId || null,
        conferidaEm: p.cargaConferidaEm || null,
        conferidaPorNome: p.cargaConferidaPorNome || null,
        conferidaOrigem: p.cargaConferidaOrigem || null,
    };
}
function itemAmostra(a) {
    return {
        tipo: 'amostra',
        id: a.id,
        numero: a.numero ?? null,
        etiqueta: etiquetaAmostra(a),
        cliente: a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || null,
        cidade: a.cliente?.End_Cidade || a.lead?.cidade || null,
        status: a.status,
        embarqueId: a.embarqueId || null,
        conferidaEm: a.cargaConferidaEm || null,
        conferidaPorNome: a.cargaConferidaPorNome || null,
        conferidaOrigem: a.cargaConferidaOrigem || null,
    };
}

// ── Contagem / listagem da carga ─────────────────────────────────────────────

/** Todos os itens FÍSICOS da carga. Cobrança em rota NÃO entra: não é mercadoria. */
async function itensDaCarga(embarqueId) {
    const [pedidos, amostras] = await Promise.all([
        prisma.pedido.findMany({ where: { embarqueId }, select: SELECT_PEDIDO, orderBy: { numero: 'asc' } }),
        prisma.amostra.findMany({ where: { embarqueId }, select: SELECT_AMOSTRA, orderBy: { numero: 'asc' } }),
    ]);
    return [...pedidos.map(itemPedido), ...amostras.map(itemAmostra)];
}

/** Recontagem no servidor — é o que mantém o contador honesto com duas pessoas bipando. */
async function contarCarga(embarqueId) {
    const [total, conferidasPedidos, totalAmostras, conferidasAmostras] = await Promise.all([
        prisma.pedido.count({ where: { embarqueId } }),
        prisma.pedido.count({ where: { embarqueId, cargaConferidaEm: { not: null } } }),
        prisma.amostra.count({ where: { embarqueId } }),
        prisma.amostra.count({ where: { embarqueId, cargaConferidaEm: { not: null } } }),
    ]);
    const t = total + totalAmostras;
    const c = conferidasPedidos + conferidasAmostras;
    return { conferidas: c, total: t, faltam: Math.max(0, t - c) };
}

/** Itens da carga que ainda não foram bipados. */
async function faltantesDaCarga(embarqueId) {
    const itens = await itensDaCarga(embarqueId);
    return itens.filter(i => !i.conferidaEm);
}

// ── Resolução do código ──────────────────────────────────────────────────────

/**
 * Acha a NOTA pela chave e devolve o pedido dono dela.
 *
 * A ordem e o filtro `ambiente: 'producao'` são copiados de `canhotoService.curarPorChave`
 * DE PROPÓSITO: sem esse filtro, uma nota de HOMOLOGAÇÃO com a mesma chave conferiria o
 * pedido errado. Não "simplificar".
 */
async function pedidoPorChave(chave) {
    const nota = await prisma.notaFiscalApp.findFirst({
        where: { chave, status: 'AUTORIZADO', ambiente: 'producao' },
        select: { pedidoId: true },
    });
    if (nota?.pedidoId) {
        const p = await prisma.pedido.findUnique({ where: { id: nota.pedidoId }, select: SELECT_PEDIDO });
        if (p) return p;
    }
    // orderBy: `findFirst` sem ordem é não-determinístico se um dia houver dois — o mais
    // antigo é sempre o pedido de verdade (o outro seria duplicata/reemissão).
    return prisma.pedido.findFirst({ where: { nfeChave: chave }, select: SELECT_PEDIDO, orderBy: { createdAt: 'asc' } });
}

/**
 * Resolve o código lido para UM item (pedido ou amostra).
 * @returns {{ item?, registro?, tipo?, ambiguo?: boolean, opcoes?: [] }}
 */
async function resolverItem(lido, embarqueId) {
    if (lido.tipo === 'CHAVE') {
        const p = await pedidoPorChave(lido.chave);
        return p ? { tipo: 'pedido', registro: p, item: itemPedido(p) } : {};
    }

    if (lido.tipo === 'RECIBO') {
        if (lido.prefixo === 'AM') {
            const a = await prisma.amostra.findFirst({ where: { numero: lido.numero }, select: SELECT_AMOSTRA, orderBy: { createdAt: 'asc' } });
            return a ? { tipo: 'amostra', registro: a, item: itemAmostra(a) } : {};
        }
        const where = lido.prefixo === 'BN'
            ? { numero: lido.numero, bonificacao: true }
            : { numero: lido.numero, especial: true };
        const p = await prisma.pedido.findFirst({ where, select: SELECT_PEDIDO, orderBy: { createdAt: 'asc' } });
        return p ? { tipo: 'pedido', registro: p, item: itemPedido(p) } : {};
    }

    if (lido.tipo === 'NUMERO') {
        // ⚠️ NUNCA buscar número solto no sistema inteiro: ZZ#100, BN#100, AM#100 e o
        // pedido comum #100 coexistem, e adicionar o item errado ao caminhão é o pior
        // erro possível aqui. Só resolvemos dentro da carga aberta.
        const [pedidos, amostras] = await Promise.all([
            prisma.pedido.findMany({ where: { embarqueId, numero: lido.numero }, select: SELECT_PEDIDO }),
            prisma.amostra.findMany({ where: { embarqueId, numero: lido.numero }, select: SELECT_AMOSTRA }),
        ]);
        const candidatos = [
            ...pedidos.map(p => ({ tipo: 'pedido', registro: p, item: itemPedido(p) })),
            ...amostras.map(a => ({ tipo: 'amostra', registro: a, item: itemAmostra(a) })),
        ];
        if (candidatos.length === 1) return candidatos[0];
        return { ambiguo: true, opcoes: candidatos.map(c => c.item) };
    }

    return {};
}

// ── Bipe ─────────────────────────────────────────────────────────────────────

/**
 * Bipa um código na carga.
 *
 * @param {object} p
 * @param {string} p.embarqueId  carga aberta na tela
 * @param {string} p.texto       o que caiu no campo (leitor ou digitado)
 * @param {object} p.usuario     `{ id, nome }` de quem está bipando
 * @param {'LEITOR'|'DIGITADO'} [p.origem='LEITOR']
 *
 * @returns {object} sempre `{ ok, resultado, mensagem, conferidas, total, faltam, ... }`
 *   resultado ∈ CONFERIDA | JA_CONFERIDA | FORA_DA_CARGA | EM_OUTRA_CARGA | DESCONHECIDO | INVALIDO | PEDE_PREFIXO
 */
async function biparNaCarga({ embarqueId, texto, usuario, origem } = {}) {
    const origemFinal = origem === 'DIGITADO' ? 'DIGITADO' : 'LEITOR';
    const lido = interpretarCodigoCarga(texto);

    // 1) Código que nem chega a ser código.
    if (lido.tipo === 'INVALIDO') {
        const contagem = await contarCarga(embarqueId);
        return {
            ok: false,
            resultado: 'INVALIDO',
            motivo: lido.motivo,
            mensagem: lido.motivo === 'DV'
                ? 'Código inválido (dígito verificador não confere) — passe o leitor de novo.'
                : lido.motivo === 'VAZIO'
                    ? 'Nada foi lido. Bipe o código de barras ou digite o número.'
                    : 'Não reconheci esse código. Bipe a DANFE, o recibo (ZZ/BN/AM) ou digite o número.',
            item: null,
            ...contagem,
        };
    }

    // 2) Quem é esse item?
    // A contagem é feita UMA vez, já sabendo o desfecho: o ramo que grava reconta
    // depois da escrita, os demais contam aqui. (Contar antes e depois dobrava os
    // `count` de cada bipe à toa.)
    const achado = await resolverItem(lido, embarqueId);

    if (achado.ambiguo) {
        const contagem = await contarCarga(embarqueId);
        return {
            ok: false,
            resultado: 'PEDE_PREFIXO',
            mensagem: achado.opcoes.length > 1
                ? `Número ${lido.numero} está em mais de um item desta carga (${achado.opcoes.map(o => o.etiqueta).join(', ')}). Digite com o prefixo — ex.: ZZ${lido.numero} ou AM${lido.numero}.`
                : `Número ${lido.numero} não bate com nenhum item desta carga. Digite com o prefixo — ex.: ZZ${lido.numero}, BN${lido.numero} ou AM${lido.numero}.`,
            item: null,
            opcoes: achado.opcoes,
            ...contagem,
        };
    }

    if (!achado.item) {
        const contagem = await contarCarga(embarqueId);
        return {
            ok: false,
            resultado: 'DESCONHECIDO',
            mensagem: lido.tipo === 'CHAVE'
                ? 'Essa nota não foi encontrada no sistema. Confira se a DANFE é de um pedido deste sistema.'
                : `Não encontrei ${lido.prefixo || ''}${lido.numero} no sistema.`,
            item: null,
            ...contagem,
        };
    }

    const { tipo, registro, item } = achado;

    // 3) O item está em OUTRA carga? Não mexemos nele — quem move é a tela de cargas/mapa.
    if (registro.embarqueId && registro.embarqueId !== embarqueId) {
        const contagem = await contarCarga(embarqueId);
        const outra = await prisma.embarque.findUnique({
            where: { id: registro.embarqueId },
            select: { id: true, numero: true, dataSaida: true, responsavel: { select: { nome: true } } },
        });
        return {
            ok: false,
            resultado: 'EM_OUTRA_CARGA',
            mensagem: `${item.etiqueta} já está na carga #${outra?.numero ?? '?'}${outra?.responsavel?.nome ? ` (${outra.responsavel.nome})` : ''}. Não pode ir em duas cargas.`,
            item,
            outraCarga: outra ? {
                id: outra.id,
                numero: outra.numero,
                dataSaida: outra.dataSaida,
                motorista: outra.responsavel?.nome || null,
            } : null,
            ...contagem,
        };
    }

    // 4) O item está SOLTO (sem carga): a doca pode querer adicionar.
    if (!registro.embarqueId) {
        const contagem = await contarCarga(embarqueId);
        let podeAdicionar = false;
        let motivoBloqueio = null;
        if (tipo === 'pedido') {
            // Mesma trava do "adicionar pedidos" — importado tarde de propósito:
            // routes/embarques.js requer ESTE service, então um require no topo faria ciclo.
            const { bloqueadosParaEmbarque } = require('../routes/embarques');
            const bloqueados = await bloqueadosParaEmbarque([registro.id]);
            podeAdicionar = bloqueados.length === 0;
            motivoBloqueio = bloqueados[0]?.motivo || null;
        } else {
            // Mesma régua do POST /:id/amostras: só amostra LIBERADO entra em carga.
            podeAdicionar = registro.status === 'LIBERADO';
            motivoBloqueio = podeAdicionar ? null : `amostra está ${registro.status}, não LIBERADO`;
        }
        return {
            ok: false,
            resultado: 'FORA_DA_CARGA',
            mensagem: podeAdicionar
                ? `${item.etiqueta} não está nesta carga. Quer adicionar?`
                : `${item.etiqueta} não está nesta carga e não pode ser adicionado: ${motivoBloqueio}.`,
            item,
            podeAdicionar,
            motivoBloqueio,
            ...contagem,
        };
    }

    // 5) O item É desta carga → marcar conferido.
    // IDEMPOTÊNCIA SEM TRANSAÇÃO: a trava é o próprio WHERE. Se `cargaConferidaEm` já
    // está preenchido (ou o item saiu da carga entre a leitura e a escrita), `count` vem
    // 0 e ninguém sobrescreve quem conferiu primeiro.
    const dados = {
        cargaConferidaEm: new Date(),
        cargaConferidaPorId: usuario?.id || null,
        cargaConferidaPorNome: usuario?.nome || null,
        cargaConferidaOrigem: origemFinal,
    };
    const where = { id: registro.id, embarqueId, cargaConferidaEm: null };
    const r = tipo === 'pedido'
        ? await prisma.pedido.updateMany({ where, data: dados })
        : await prisma.amostra.updateMany({ where, data: dados });

    const atual = tipo === 'pedido'
        ? itemPedido(await prisma.pedido.findUnique({ where: { id: registro.id }, select: SELECT_PEDIDO }))
        : itemAmostra(await prisma.amostra.findUnique({ where: { id: registro.id }, select: SELECT_AMOSTRA }));
    const contagemFinal = await contarCarga(embarqueId);

    if (r.count === 0) {
        return {
            ok: false,
            resultado: 'JA_CONFERIDA',
            mensagem: `${atual.etiqueta} já tinha sido conferido${atual.conferidaPorNome ? ` por ${atual.conferidaPorNome}` : ''}.`,
            item: atual,
            ...contagemFinal,
        };
    }

    return {
        ok: true,
        resultado: 'CONFERIDA',
        mensagem: `${atual.etiqueta} conferido${atual.cliente ? ` — ${atual.cliente}` : ''}.`,
        item: atual,
        ...contagemFinal,
    };
}

/** Desmarca a conferência de um item (a pessoa bipou errado / tirou o volume do caminhão). */
async function desmarcar({ embarqueId, tipo, itemId }) {
    const dados = {
        cargaConferidaEm: null,
        cargaConferidaPorId: null,
        cargaConferidaPorNome: null,
        cargaConferidaOrigem: null,
    };
    const where = { id: itemId, embarqueId };
    const r = tipo === 'amostra'
        ? await prisma.amostra.updateMany({ where, data: dados })
        : await prisma.pedido.updateMany({ where, data: dados });
    const contagem = await contarCarga(embarqueId);
    if (r.count === 0) {
        return { ok: false, resultado: 'NAO_ENCONTRADO', mensagem: 'Item não faz parte desta carga.', ...contagem };
    }
    return { ok: true, resultado: 'DESMARCADA', mensagem: 'Conferência desfeita.', ...contagem };
}

/** Campos zerados quando um item ENTRA ou SAI de carga (senão chega verde na carga nova). */
const RESET_CONFERENCIA = {
    cargaConferidaEm: null,
    cargaConferidaPorId: null,
    cargaConferidaPorNome: null,
    cargaConferidaOrigem: null,
};

module.exports = {
    biparNaCarga,
    desmarcar,
    contarCarga,
    itensDaCarga,
    faltantesDaCarga,
    RESET_CONFERENCIA,
};
