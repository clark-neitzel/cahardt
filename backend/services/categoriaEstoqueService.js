const prisma = require('../config/database');

// ── Cache curto das flags das categorias ─────────────────────────────────────
// `GET /produtos` é o endpoint mais quente do sistema (~11 telas) e precisa das
// flags ANTES de montar o `where` — sem cache isso seria um round-trip serializado
// em toda requisição, mesmo quando não existe nenhuma categoria "não vende".
// A tabela é minúscula e muda só quando um admin clica num toggle.
// `salvar()` limpa o cache, então o efeito do clique é IMEDIATO no processo que salvou.
const TTL_FLAGS_MS = 30000;
let _flagsCache = null; // { em: number, linhas: [...] }

const invalidarCacheFlags = () => { _flagsCache = null; };

async function flagsCategorias() {
    if (_flagsCache && (Date.now() - _flagsCache.em) < TTL_FLAGS_MS) return _flagsCache.linhas;
    const linhas = await prisma.categoriaEstoque.findMany({
        select: { nome: true, controlaEstoque: true, contabilizaFlex: true, vendavel: true }
    });
    // Congela o array e cada linha: quem chamar não consegue envenenar o cache
    // sem querer (um `.sort()` no chamador estragaria a leitura de todo mundo).
    linhas.forEach(Object.freeze);
    Object.freeze(linhas);
    _flagsCache = { em: Date.now(), linhas };
    return linhas;
}

// Comparação de nome de categoria: sem acidente de caixa alta nem espaço nas pontas.
const chaveNome = (n) => String(n ?? '').trim().toLowerCase();

const categoriaEstoqueService = {

    // Flags de todas as categorias (nome, controlaEstoque, contabilizaFlex, vendavel).
    // Serve o cache — use isto em rota quente em vez de consultar a tabela direto.
    flagsCategorias,
    invalidarCacheFlags,

    // Lista todas as categorias cadastradas, mesclando com valores distintos existentes nos produtos
    listarComProdutos: async () => {
        const [cadastradas, produtosDistintos] = await Promise.all([
            prisma.categoriaEstoque.findMany({ orderBy: { nome: 'asc' } }),
            prisma.produto.findMany({
                where: { categoria: { not: null } },
                select: { categoria: true },
                distinct: ['categoria']
            })
        ]);

        const nomesCadastrados = new Set(cadastradas.map(c => c.nome));

        // Inclui categorias que existem em produtos mas ainda não foram cadastradas
        const extras = produtosDistintos
            .map(p => p.categoria)
            .filter(nome => nome && !nomesCadastrados.has(nome))
            .map(nome => ({ id: null, nome, controlaEstoque: false, contabilizaFlex: true, vendavel: true, createdAt: null, naoSalva: true }));

        return [...cadastradas, ...extras].sort((a, b) => a.nome.localeCompare(b.nome));
    },

    // Salva (upsert) os flags de uma categoria (estoque, flex e/ou "vende")
    salvar: async (nome, controlaEstoque, contabilizaFlex, vendavel) => {
        const updateData = {};
        if (controlaEstoque !== undefined) updateData.controlaEstoque = controlaEstoque;
        if (contabilizaFlex !== undefined) updateData.contabilizaFlex = contabilizaFlex;
        if (vendavel !== undefined) updateData.vendavel = vendavel;

        const salvo = await prisma.categoriaEstoque.upsert({
            where: { nome },
            update: updateData,
            create: {
                id: require('crypto').randomUUID(),
                nome,
                controlaEstoque: controlaEstoque ?? false,
                contabilizaFlex: contabilizaFlex ?? true,
                vendavel: vendavel ?? true
            }
        });
        invalidarCacheFlags(); // o toggle tem que valer na hora para quem salvou
        return salvo;
    },

    // Nomes das categorias CA marcadas como NÃO vendáveis (imobilizado etc.).
    // Devolve [] quando não há nenhuma — o chamador deve, nesse caso, deixar
    // o filtro EXATAMENTE como era antes (zero regressão).
    /**
     * Devolve o nome CANÔNICO da categoria: se o texto informado bate com uma
     * linha de `categorias_estoque` ignorando maiúsculas/minúsculas e espaços
     * nas pontas, devolve a string exata da tabela.
     *
     * Por que isso é vital: o casamento produto↔categoria é por STRING EXATA e o
     * `notIn` do Postgres é case-sensitive. Sem isso, alguém digitando
     * "imobilizado" (ou "Imobilizado " com espaço) no cadastro do produto criaria
     * uma categoria diferente da que tem o "Vende" desligado — e a trava deixaria
     * de pegar EM SILÊNCIO: o bem iria para o catálogo, para o pedido e para o
     * link público do cliente sem nenhum aviso. Um typo derrubaria a função toda.
     *
     * Fica aqui (e não na tela) porque este service é o dono da tabela e já tem
     * as linhas em cache — o custo é zero e TODO caminho de gravação passa a
     * herdar a proteção, inclusive os que vierem depois.
     */
    canonizarNome: async (nome) => {
        const bruto = String(nome ?? '').trim();
        if (!bruto) return bruto;
        const alvo = chaveNome(bruto);
        const linhas = await flagsCategorias();
        const achou = linhas.find(c => chaveNome(c.nome) === alvo);
        return achou ? achou.nome : bruto;
    },

    nomesNaoVendaveis: async () => {
        const rows = await flagsCategorias();
        return rows
            .filter(r => r.vendavel === false)
            .map(r => r.nome)
            .filter(n => typeof n === 'string' && n.length > 0);
    }
};

module.exports = categoriaEstoqueService;
