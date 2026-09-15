const prisma = require('../config/database');
const categoriaEstoqueService = require('./categoriaEstoqueService');

const erroComStatus = (status, mensagem) => {
    const e = new Error(mensagem);
    e.status = status;
    return e;
};

const pcpItemService = {

    listar: async ({ tipo, search, ativo }) => {
        const where = {};
        if (tipo) where.tipo = tipo;
        if (ativo !== undefined) where.ativo = ativo === 'true' || ativo === true;
        if (search?.trim()) {
            where.OR = [
                { nome: { contains: search.trim(), mode: 'insensitive' } },
                { codigo: { contains: search.trim(), mode: 'insensitive' } }
            ];
        }
        const itens = await prisma.itemPcp.findMany({
            where,
            include: { produto: { select: { id: true, nome: true, codigo: true } } },
            orderBy: [{ tipo: 'asc' }, { nome: 'asc' }]
        });

        // D3 (plano Etapa 1, 09/2026): a tela de Itens/Subprodutos precisa saber, para os
        // órfãos (produtoId nulo), se dá pra excluir — sem abrir uma requisição por linha.
        // Só calcula o "uso" para quem é órfão (item vinculado a produto nunca aparece com
        // o botão excluir na tela, então o custo extra aqui não vale a pena para eles).
        const orfaos = itens.filter((i) => !i.produtoId);
        if (orfaos.length === 0) return itens.map((i) => ({ ...i, podeExcluir: false }));

        const orfaoIds = orfaos.map((i) => i.id);
        const [receitasResultado, receitaItens, ordens, movimentacoesPcp, ledgerNotas, vinculosFornecedor, comprasItens] = await Promise.all([
            prisma.receita.groupBy({ by: ['itemPcpId'], where: { itemPcpId: { in: orfaoIds } }, _count: { id: true } }),
            prisma.receitaItem.groupBy({ by: ['itemPcpId'], where: { itemPcpId: { in: orfaoIds } }, _count: { id: true } }),
            prisma.ordemConsumo.groupBy({ by: ['itemPcpId'], where: { itemPcpId: { in: orfaoIds } }, _count: { id: true } }),
            prisma.movimentacaoPcp.groupBy({ by: ['itemPcpId'], where: { itemPcpId: { in: orfaoIds } }, _count: { id: true } }),
            prisma.notaEntradaEstoqueMov.groupBy({ by: ['itemPcpId'], where: { itemPcpId: { in: orfaoIds } }, _count: { id: true } }),
            prisma.fornecedorProdutoVinculo.groupBy({ by: ['itemPcpId'], where: { itemPcpId: { in: orfaoIds } }, _count: { id: true } }),
            prisma.compraItem.groupBy({ by: ['itemPcpId'], where: { itemPcpId: { in: orfaoIds } }, _count: { id: true } })
        ]);
        const usaMap = new Set();
        for (const g of [...receitasResultado, ...receitaItens, ...ordens, ...movimentacoesPcp, ...ledgerNotas, ...vinculosFornecedor, ...comprasItens]) {
            if (g.itemPcpId) usaMap.add(g.itemPcpId);
        }

        return itens.map((i) => ({
            ...i,
            podeExcluir: !i.produtoId && !usaMap.has(i.id)
        }));
    },

    buscarPorId: async (id) => {
        return prisma.itemPcp.findUnique({
            where: { id },
            include: {
                produto: { select: { id: true, nome: true, codigo: true } },
                receitasComoResultado: {
                    where: { status: 'ativa' },
                    select: { id: true, versao: true, nome: true, rendimentoBase: true, status: true }
                }
            }
        });
    },

    proximoCodigoSub: async () => {
        const ultimos = await prisma.itemPcp.findMany({
            where: { tipo: 'SUB', codigo: { startsWith: 'SUB-' } },
            select: { codigo: true }
        });
        let maior = 0;
        for (const it of ultimos) {
            const m = /^SUB-(\d+)$/.exec(it.codigo);
            if (m) {
                const n = parseInt(m[1], 10);
                if (n > maior) maior = n;
            }
        }
        return `SUB-${String(maior + 1).padStart(4, '0')}`;
    },

    // Criar apenas SUB (subproduto) — MP, PA e EMB vem do cadastro de Produtos via importar
    criar: async (data) => {
        if (data.tipo !== 'SUB') {
            throw new Error('Apenas subprodutos (SUB) podem ser criados manualmente. MP, PA e EMB devem ser importados do cadastro de Produtos.');
        }
        let codigo = data.codigo?.trim();
        if (!codigo) {
            codigo = await pcpItemService.proximoCodigoSub();
        }
        return prisma.itemPcp.create({
            data: {
                codigo,
                nome: data.nome,
                tipo: 'SUB',
                unidade: data.unidade,
                descricao: data.descricao || null,
                produtoId: null,
                custoUnitario: data.custoUnitario ? parseFloat(data.custoUnitario) : null,
                estoqueMinimo: data.estoqueMinimo ? parseFloat(data.estoqueMinimo) : 0
            }
        });
    },

    // Garantir que existe ItemPcp para um Produto do cadastro (find or create).
    // `db` opcional (tx) — a conferência de nota chama isto DENTRO da mesma transação
    // que cria o Produto e aplica o estoque (produto + espelho PCP + estoque, tudo ou nada).
    importar: async ({ produtoId, tipo }, db = prisma) => {
        if (!['MP', 'PA', 'EMB'].includes(tipo)) {
            throw new Error('Tipo para importação deve ser MP, PA ou EMB.');
        }

        const produto = await db.produto.findUnique({ where: { id: produtoId } });
        if (!produto) throw new Error('Produto não encontrado no cadastro.');

        // Se já existe, retorna o existente (sem erro)
        const existente = await db.itemPcp.findFirst({
            where: { produtoId },
            include: { produto: { select: { id: true, nome: true, codigo: true } } }
        });
        if (existente) return existente;

        // Verificar se codigo ja existe (pode ter outro item com mesmo codigo)
        const codigoExiste = await db.itemPcp.findUnique({ where: { codigo: produto.codigo } });
        const codigo = codigoExiste ? `${produto.codigo}-${tipo}` : produto.codigo;

        return db.itemPcp.create({
            data: {
                codigo,
                nome: produto.nome,
                tipo,
                unidade: produto.unidade || 'UN',
                descricao: produto.descricao || null,
                produtoId: produto.id,
                custoUnitario: produto.custoManual ? parseFloat(produto.custoManual) : null,
                estoqueMinimo: 0
            },
            include: { produto: { select: { id: true, nome: true, codigo: true } } }
        });
    },

    // Importar múltiplos produtos de uma vez
    importarLote: async (itens) => {
        const resultados = [];
        for (const { produtoId, tipo } of itens) {
            try {
                const item = await pcpItemService.importar({ produtoId, tipo });
                resultados.push({ sucesso: true, item });
            } catch (err) {
                resultados.push({ sucesso: false, produtoId, tipo, erro: err.message });
            }
        }
        return resultados;
    },

    atualizar: async (id, data) => {
        const item = await prisma.itemPcp.findUnique({ where: { id }, select: { tipo: true, produtoId: true } });
        if (!item) throw new Error('Item não encontrado');

        const updateData = {};
        // Itens importados (MP/PA/EMB com produtoId): só permite editar campos PCP
        if (item.produtoId) {
            if (data.estoqueMinimo !== undefined) updateData.estoqueMinimo = parseFloat(data.estoqueMinimo);
            if (data.custoUnitario !== undefined) updateData.custoUnitario = data.custoUnitario ? parseFloat(data.custoUnitario) : null;
            if (data.descricao !== undefined) updateData.descricao = data.descricao;
        } else {
            // Órfão (produtoId nulo): pode editar tudo, INCLUSIVE o tipo (D3, plano Etapa 1
            // 09/2026 — "mudar a categoria/tipo" sem precisar promover a produto) — exceto
            // se for SUB resultado de uma receita ativa (aí é subproduto de verdade, só SUB).
            if (data.codigo !== undefined) updateData.codigo = data.codigo;
            if (data.nome !== undefined) updateData.nome = data.nome;
            if (data.unidade !== undefined) updateData.unidade = data.unidade;
            if (data.descricao !== undefined) updateData.descricao = data.descricao;
            if (data.custoUnitario !== undefined) updateData.custoUnitario = data.custoUnitario ? parseFloat(data.custoUnitario) : null;
            if (data.estoqueMinimo !== undefined) updateData.estoqueMinimo = parseFloat(data.estoqueMinimo);
            if (data.tipo !== undefined && data.tipo !== item.tipo) {
                if (item.tipo === 'SUB') {
                    const receitaAtiva = await prisma.receita.findFirst({ where: { itemPcpId: id, status: 'ativa' }, select: { id: true } });
                    if (receitaAtiva) throw erroComStatus(400, 'Este subproduto é resultado de uma receita ativa — não dá para mudar o tipo dele.');
                }
                updateData.tipo = data.tipo;
            }
        }

        return prisma.itemPcp.update({ where: { id }, data: updateData });
    },

    toggleAtivo: async (id) => {
        const item = await prisma.itemPcp.findUnique({ where: { id }, select: { ativo: true } });
        if (!item) throw new Error('Item não encontrado');
        return prisma.itemPcp.update({ where: { id }, data: { ativo: !item.ativo } });
    },

    // D3 (plano Etapa 1, 09/2026) — "Enviar para Produtos": promove um item PCP órfão
    // (produtoId nulo, criado pelo antigo botão quebrado "+ Criar item PCP") a Produto de
    // verdade. Cria o Produto via produtoService.criar, vincula o item (produtoId) e migra
    // a memória do de-para (FornecedorProdutoVinculo). Categoria Matéria-Prima/Embalagem:
    // o item CONTINUA ativo e vira o espelho PCP (tipo ajustado, código mantido). Qualquer
    // outra categoria: o item é INATIVADO — não é mais um insumo de produção válido — e o
    // `estoqueAtual` dele NÃO é somado ao produto (categorias sem produção não têm esse
    // conceito de estoque de insumo; fica registrado no retorno para o admin decidir).
    //
    // `dados` = { nome?, categoria, categoriaProdutoId?, controlaEstoque? } — mesmo formato
    // de produtoService.criar (nome default = nome atual do item).
    promoverProduto: async (id, dados, usuarioId, db = prisma) => {
        const item = await db.itemPcp.findUnique({ where: { id } });
        if (!item) throw erroComStatus(404, 'Item não encontrado.');
        if (item.produtoId) throw erroComStatus(400, 'Este item já está vinculado a um produto.');

        if (item.tipo === 'SUB') {
            const receitaAtiva = await db.receita.findFirst({ where: { itemPcpId: id, status: 'ativa' }, select: { id: true } });
            if (receitaAtiva) throw erroComStatus(400, 'Este subproduto é resultado de uma receita ativa — é um subproduto de verdade, não dá para promover a produto.');
        }

        // ean/ncm do último item de NOTA ligado a este insumo (ledger de estoque é o único
        // lugar que guarda essa referência — NotaEntradaItem não tem itemPcpId direto).
        let ean = null;
        let ncm = null;
        const ultimoMov = await db.notaEntradaEstoqueMov.findFirst({
            where: { itemPcpId: id, notaEntradaItemId: { not: null } },
            orderBy: { criadoEm: 'desc' },
            select: { notaEntradaItemId: true }
        });
        if (ultimoMov?.notaEntradaItemId) {
            const notaItem = await db.notaEntradaItem.findUnique({
                where: { id: ultimoMov.notaEntradaItemId },
                select: { ean: true, ncm: true }
            });
            ean = notaItem?.ean || null;
            ncm = notaItem?.ncm || null;
        }

        const produtoService = require('./produtoService');
        const { produto } = await produtoService.criar({
            nome: dados?.nome?.trim() || item.nome,
            categoria: dados?.categoria,
            categoriaProdutoId: dados?.categoriaProdutoId || null,
            controlaEstoque: dados?.controlaEstoque,
            unidade: item.unidade,
            ean,
            ncm,
            nomeOrigemNota: item.nome,
            notaOrigemId: null
        }, { id: usuarioId }, db);

        const tipoPcpDestino = categoriaEstoqueService.tipoPcpDaCategoria(produto.categoria);
        const ehDeProducao = !!tipoPcpDestino;
        const estoqueAtual = Number(item.estoqueAtual || 0);

        const itemAtualizado = await db.itemPcp.update({
            where: { id: item.id },
            data: ehDeProducao
                ? { produtoId: produto.id, tipo: tipoPcpDestino }
                : { produtoId: produto.id, ativo: false }
        });

        // Migra a memória do de-para do fornecedor (itemPcpId → produtoId) — nunca deixa
        // os dois setados (mesmo invariante de processarItensConferencia em notasEntrada.js).
        await db.fornecedorProdutoVinculo.updateMany({
            where: { itemPcpId: id },
            data: { itemPcpId: null, produtoId: produto.id }
        });
        // Enriquece o histórico (ledger + compras) com o produtoId, SEM apagar o itemPcpId —
        // é o que permite a ficha do produto novo mostrar as compras que já existiam do
        // insumo antigo (plano: "mantendo itemPcpId para o ledger").
        await db.notaEntradaEstoqueMov.updateMany({
            where: { itemPcpId: id, produtoId: null },
            data: { produtoId: produto.id }
        });
        await db.compraItem.updateMany({
            where: { itemPcpId: id, produtoId: null },
            data: { produtoId: produto.id }
        });

        return {
            produto,
            item: itemAtualizado,
            tornouEspelhoPcp: ehDeProducao,
            estoqueNaoTransferido: !ehDeProducao && estoqueAtual > 0 ? estoqueAtual : 0
        };
    },

    // D3: exclusão de verdade só para órfão (produtoId nulo) sem NENHUM uso — receita
    // (como resultado ou ingrediente), ordem de produção, movimentação PCP, ledger de nota
    // ou histórico de compras apontando para ele. Fora isso o caminho é inativar
    // (toggleAtivo) — excluir apagaria rastro contábil/produtivo de verdade.
    excluir: async (id) => {
        const item = await prisma.itemPcp.findUnique({ where: { id } });
        if (!item) throw erroComStatus(404, 'Item não encontrado.');
        if (item.produtoId) throw erroComStatus(409, 'Este item está vinculado a um produto — não é órfão, não pode ser excluído por aqui.');

        const [receitaResultado, receitaIngrediente, ordem, movPcp, ledgerNota, vinculo, compra] = await Promise.all([
            prisma.receita.findFirst({ where: { itemPcpId: id }, select: { id: true } }),
            prisma.receitaItem.findFirst({ where: { itemPcpId: id }, select: { id: true } }),
            prisma.ordemConsumo.findFirst({ where: { itemPcpId: id }, select: { id: true } }),
            prisma.movimentacaoPcp.findFirst({ where: { itemPcpId: id }, select: { id: true } }),
            prisma.notaEntradaEstoqueMov.findFirst({ where: { itemPcpId: id }, select: { id: true } }),
            prisma.fornecedorProdutoVinculo.findFirst({ where: { itemPcpId: id }, select: { id: true } }),
            prisma.compraItem.findFirst({ where: { itemPcpId: id }, select: { id: true } })
        ]);
        const motivos = [];
        if (receitaResultado) motivos.push('é resultado de uma receita');
        if (receitaIngrediente) motivos.push('é ingrediente de uma receita');
        if (ordem) motivos.push('tem ordem de produção/consumo');
        if (movPcp) motivos.push('tem movimentação de estoque no PCP');
        if (ledgerNota || compra) motivos.push('tem entrada de nota fiscal lançada');
        if (vinculo) motivos.push('tem de-para de fornecedor memorizado');
        if (motivos.length > 0) {
            throw erroComStatus(409, `Não dá para excluir: este item ${motivos.join(', ')}. Use "Inativar" em vez de excluir.`);
        }

        await prisma.itemPcp.delete({ where: { id } });
        return { excluido: true };
    }
};

module.exports = pcpItemService;
