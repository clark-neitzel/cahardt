const prisma = require('../config/database');
const categoriaEstoqueService = require('./categoriaEstoqueService');

/**
 * Próximo código numérico sequencial do catálogo (max + 1 entre códigos de 4 a 6 dígitos,
 * para ignorar EANs gravados como código). Mínimo 4 dígitos, com zero à esquerda.
 * `db` pode ser a transação (tx).
 */
async function proximoCodigo(db = prisma) {
    // Dentro de transação: lock de aviso serializa quem gera código (liberado no commit/rollback).
    if (db !== prisma) await db.$executeRaw`SELECT pg_advisory_xact_lock(7770001)`;
    const rows = await db.$queryRaw`SELECT MAX(codigo::bigint)::text AS maximo FROM produtos WHERE codigo ~ '^[0-9]{4,6}$'`;
    const maximo = rows?.[0]?.maximo ? parseInt(rows[0].maximo, 10) : 0;
    return String(maximo + 1).padStart(4, '0');
}

/**
 * Criação de Produto — extraído de `produtoController.criar` em 09/2026 para ser
 * reutilizável pela conferência de nota (Entrada de Notas, "Criar produto novo") e
 * pela promoção de item PCP órfão a Produto, além da tela de Produtos.
 *
 * Nasce PRIMEIRO no Conta Azul (POST /v1/produtos) e só então é salvo aqui com o
 * contaAzulId retornado (origem APP) — igual ao fluxo antigo. Com o CA em modo
 * somente leitura (config/contaAzulModo.js, hoje sempre `true`), o produto nasce só
 * no app (id local no lugar do contaAzulId) e NÃO há chamada de rede nenhuma.
 *
 * `db` — regra do projeto (CLAUDE.md): nunca chamada de rede dentro de `$transaction`.
 * A conferência de nota (routes/notasEntrada.js) chama este service DENTRO da mesma
 * transação da entrada de estoque (é o que garante "produto + insumo espelho + estoque
 * tudo ou nada"). Isso só é seguro porque CA_SOMENTE_LEITURA está sempre `true` hoje —
 * o bloco de rede vira código morto. Se um dia isso for desligado, a chamada dentro de
 * uma transação (`db` diferente do prisma padrão) é RECUSADA abaixo em vez de arriscar
 * travar o banco compartilhado numa chamada HTTP.
 *
 * @param {object} dados  { nome, codigo?, ean?, ncm?, unidade, categoria (nome da
 *                          CategoriaEstoque, OBRIGATÓRIO), categoriaProdutoId?,
 *                          controlaEstoque? (null|true|false), valorVenda?, descricao?,
 *                          nomeOrigemNota?, notaOrigemId? }
 * @param {object} usuario  req.user (não usado hoje — parâmetro reservado para
 *                          auditoria futura, igual ao padrão de outros services)
 * @param {object} db  cliente Prisma ou transação (tx). Default: prisma global.
 */
async function criar(dados, usuario, db = prisma) {
    const { nome, codigo, ean, ncm, unidade, categoria, categoriaProdutoId,
            controlaEstoque, valorVenda, descricao, nomeOrigemNota, notaOrigemId,
            estoqueInicial, estoqueMinimo, estoqueMaximo } = dados || {};

    if (!nome?.trim()) {
        const erro = new Error('Informe o nome do produto.');
        erro.status = 400;
        throw erro;
    }
    const unidadeFinal = String(unidade || 'UN').trim().substring(0, 10).toUpperCase() || 'UN';

    const valor = valorVenda != null
        ? parseFloat(String(valorVenda).replace(',', '.'))
        : 0;
    if (!Number.isFinite(valor) || valor < 0) {
        const erro = new Error('Valor de venda inválido.');
        erro.status = 400;
        throw erro;
    }

    // Categoria de estoque (CategoriaEstoque) é OBRIGATÓRIA a partir daqui — é ela que
    // decide se o produto controla estoque (D1) e se vira MP/EMB no PCP (conferência).
    // Canoniza para a grafia exata da tabela (mesma trava usada no PUT de produto) e
    // recusa nome que não existe em categorias_estoque — nunca cria uma categoria nova
    // "no ar" a partir de um typo da tela.
    if (!categoria?.trim()) {
        const erro = new Error('Escolha a categoria de estoque do produto.');
        erro.status = 400;
        throw erro;
    }
    const categoriaCanonica = await categoriaEstoqueService.canonizarNome(categoria);
    const categoriaExiste = await db.categoriaEstoque.findUnique({
        where: { nome: categoriaCanonica },
        select: { nome: true }
    });
    if (!categoriaExiste) {
        const erro = new Error(`Categoria de estoque "${categoria}" não encontrada. Cadastre-a em Configurações → Categorias de Estoque antes de usá-la.`);
        erro.status = 400;
        throw erro;
    }

    // Duplicidade local por nome (evita criar 2x no CA sem querer)
    const jaExiste = await db.produto.findFirst({
        where: { nome: { equals: nome.trim(), mode: 'insensitive' } },
        select: { id: true, nome: true }
    });
    if (jaExiste) {
        const erro = new Error(`Já existe um produto chamado "${jaExiste.nome}".`);
        erro.status = 400;
        throw erro;
    }

    let controlaEstoqueFinal = null;
    if (controlaEstoque === true || controlaEstoque === 'true') controlaEstoqueFinal = true;
    else if (controlaEstoque === false || controlaEstoque === 'false') controlaEstoqueFinal = false;
    // qualquer outro valor (undefined/null) = segue a categoria

    // Estoque inicial / mínimo / máximo (opcionais). Produto que NÃO controla estoque ignora os
    // três e grava 0. Quem controla: valida antes de criar (nada é gravado se estiver inválido).
    const estoqueService = require('./estoqueService');
    const { produtoControlaEstoque } = estoqueService;
    const controla = await produtoControlaEstoque({ controlaEstoque: controlaEstoqueFinal, categoria: categoriaCanonica }, db);
    let minFinal = 0, maxFinal = 0, inicialFinal = 0;
    if (controla) {
        const lim = estoqueService.validarLimites({ min: estoqueMinimo, max: estoqueMaximo });
        minFinal = lim.min ?? 0;
        maxFinal = lim.max ?? 0;
        estoqueService.validarParMinMax(minFinal, maxFinal);
        const ini = estoqueService.numeroDecimal(estoqueInicial);
        if (ini !== null) {
            if (!Number.isFinite(ini) || ini < 0 || ini > 999999999.999 || Math.round(ini * 1000) / 1000 !== ini) {
                const erro = new Error('Estoque inicial inválido: informe um número maior ou igual a zero (até 3 casas decimais).');
                erro.status = 400;
                throw erro;
            }
            inicialFinal = ini;
        }
    }

    // Código (SKU): informado => não pode repetir; vazio => gera o próximo sequencial.
    const resolverCodigo = async (cli) => {
        const informado = codigo != null ? String(codigo).trim() : '';
        if (informado) {
            const dup = await cli.produto.findFirst({ where: { codigo: informado }, select: { id: true } });
            if (dup) {
                const erro = new Error(`Já existe produto com o código ${informado}`);
                erro.status = 400;
                throw erro;
            }
            return informado;
        }
        return proximoCodigo(cli);
    };
    let codigoFinal = null; // só preenchido antes do create no caminho com rede (CA ligado)

    // 1) Cria no Conta Azul (era a fonte do catálogo até 23/07/2026).
    // CA somente leitura: o produto nasce SÓ no app, com um id local no lugar do
    // contaAzulId (coluna obrigatória/única — vínculo legado).
    const { CA_SOMENTE_LEITURA } = require('../config/contaAzulModo');
    let criadoCA;
    if (CA_SOMENTE_LEITURA) {
        criadoCA = { id: `app-${require('crypto').randomUUID()}` };
    } else {
        if (db !== prisma) {
            // Ver comentário do topo do arquivo: nunca rede dentro de transação.
            const erro = new Error('Criação de produto com sincronização externa não pode rodar dentro de uma transação.');
            erro.status = 500;
            throw erro;
        }
        codigoFinal = await resolverCodigo(db);
        const contaAzulService = require('./contaAzulService');
        try {
            criadoCA = await contaAzulService.criarProdutoCA({
                nome,
                codigoSku: codigoFinal,
                codigoEan: ean,
                valorVenda: valor,
                categoriaNome: categoriaCanonica,
                descricao
            });
        } catch (e) {
            console.error('[ProdutoService] Falha ao criar produto no CA:', e.message);
            const erro = new Error(`Não consegui criar o produto: ${e.message}`);
            erro.status = 502;
            throw erro;
        }
    }

    // 2) Salva local com o vínculo (origem APP)
    const criarProduto = (cli, cod) => cli.produto.create({
        data: {
            contaAzulId: criadoCA.id,
            codigo: cod,
            nome: nome.trim(),
            valorVenda: valor,
            unidade: unidadeFinal,
            ean: ean?.trim() || '',
            ncm: ncm?.trim() || null,
            categoria: categoriaCanonica,
            categoriaProdutoId: categoriaProdutoId || null,
            controlaEstoque: controlaEstoqueFinal,
            estoqueMinimo: minFinal,
            estoqueMaximo: maxFinal,
            descricao: descricao?.trim() || '',
            status: 'ATIVO',
            ativo: true,
            origem: 'APP',
            // O preço foi definido aqui, no app — o CA nunca deve sobrescrevê-lo.
            precoLocal: true,
            nomeOrigemNota: nomeOrigemNota?.trim() || null,
            notaOrigemId: notaOrigemId || null
        }
    });
    let produto;
    if (CA_SOMENTE_LEITURA && db === prisma) {
        // Transação curta (só banco, sem rede): lock + MAX + create => sem código repetido em cadastros simultâneos.
        produto = await prisma.$transaction(async (tx) => criarProduto(tx, await resolverCodigo(tx)), { timeout: 20000, maxWait: 10000 });
    } else {
        produto = await criarProduto(db, codigoFinal || await resolverCodigo(db));
    }

    // Estoque inicial vira uma ENTRADA rastreável (movimentação ESTOQUE_INICIAL), DEPOIS e fora
    // de transação (ajustar abre a sua). Se falhar, o produto fica criado e o erro é devolvido.
    // Só roda com o prisma padrão: chamadas dentro de transação (conferência de nota) não usam isto.
    let estoqueInicialErro;
    if (inicialFinal > 0 && db === prisma) {
        try {
            await estoqueService.ajustar({
                produtoId: produto.id,
                vendedorId: usuario?.id || null,
                tipo: 'ENTRADA',
                quantidade: inicialFinal,
                motivo: 'ESTOQUE_INICIAL',
                observacao: 'Estoque inicial no cadastro'
            });
        } catch (e) {
            console.error('[ProdutoService] Falha ao lançar estoque inicial (produto já criado):', e.message);
            estoqueInicialErro = 'O produto foi criado, mas não consegui lançar o estoque inicial. Use "Ajustar estoque" para lançar.';
        }
    }

    let produtoFinal = produto;
    if (inicialFinal > 0 && db === prisma && !estoqueInicialErro) {
        try { produtoFinal = await prisma.produto.findUnique({ where: { id: produto.id } }) || produto; }
        catch (e) { /* devolve o objeto original; a tela recarrega */ }
    }
    const retorno = { produto: produtoFinal, criadoNoCA: !CA_SOMENTE_LEITURA };
    if (estoqueInicialErro) retorno.estoqueInicialErro = estoqueInicialErro;
    return retorno;
}

module.exports = { criar, proximoCodigo };
