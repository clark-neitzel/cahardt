const prisma = require('../config/database');
const fs = require('fs');
const path = require('path');
const pcpReceitaService = require('../services/pcpReceitaService');

const produtoController = {
    // Listar produtos com paginação e filtros
    listar: async (req, res) => {
        try {
            const { page = 1, limit = 10, search, ativo, categorias, categoriaProdutoIds } = req.query;
            const skip = (page - 1) * limit;

            const where = {};
            if (search) {
                where.OR = [
                    { nome: { contains: search, mode: 'insensitive' } },
                    { codigo: { contains: search, mode: 'insensitive' } },
                    { ean: { contains: search, mode: 'insensitive' } }
                ];
            }
            if (ativo !== undefined && ativo !== 'all') {
                where.ativo = ativo === 'true';
            }

            // Filtro de Categorias CA (Multi-select por nome)
            if (categorias) {
                const cats = categorias.split(',').map(c => c.trim()).filter(c => c);
                if (cats.length > 0) {
                    where.categoria = { in: cats };
                }
            }

            // Filtro de Categoria Comercial (Multi-select por ID)
            if (categoriaProdutoIds) {
                const ids = categoriaProdutoIds.split(',').map(c => c.trim()).filter(c => c);
                if (ids.length > 0) {
                    where.categoriaProdutoId = { in: ids };
                }
            }

            const [produtos, total, categoriasEstoque] = await Promise.all([
                prisma.produto.findMany({
                    where,
                    skip: Number(skip),
                    take: Number(limit),
                    include: {
                        imagens: {
                            orderBy: [{ principal: 'desc' }, { ordem: 'asc' }],
                            take: 1
                        },
                        categoriaProduto: {
                            select: { id: true, nome: true, corTag: true }
                        }
                    },
                    orderBy: { nome: 'asc' }
                }),
                prisma.produto.count({ where }),
                prisma.categoriaEstoque.findMany({ select: { nome: true, controlaEstoque: true } })
            ]);

            // Controle de estoque EFETIVO: produto.controlaEstoque força; null segue a categoria.
            // O front (tela de pedido) usa isso p/ avisar item sem estoque sem falso positivo.
            const catControla = new Map(categoriasEstoque.map(c => [c.nome, c.controlaEstoque === true]));
            const produtosComFlag = produtos.map(p => ({
                ...p,
                controlaEstoqueEfetivo: p.controlaEstoque === true ? true
                    : p.controlaEstoque === false ? false
                    : (catControla.get(p.categoria) || false)
            }));

            res.json({
                data: produtosComFlag,
                meta: {
                    total,
                    page: Number(page),
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao listar produtos' });
        }
    },

    // Detalhe do produto
    detalhar: async (req, res) => {
        try {
            const { id } = req.params;
            const produto = await prisma.produto.findUnique({
                where: { id },
                include: {
                    imagens: {
                        orderBy: { ordem: 'asc' }
                    },
                    categoriaProduto: {
                        select: { id: true, nome: true, permiteFracao: true }
                    }
                }
            });

            if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

            // Custo pela receita do PCP: se o produto tem receita ativa, ela manda no custo
            // (substitui o custo do CA e o manual na tela). Falha aqui não derruba o detalhe.
            let custoReceita = null;
            try {
                const itemPcp = await prisma.itemPcp.findFirst({
                    where: { produtoId: id },
                    select: { id: true }
                });
                if (itemPcp) {
                    const agora = new Date();
                    const receitaAtiva = await prisma.receita.findFirst({
                        where: {
                            itemPcpId: itemPcp.id,
                            status: 'ativa',
                            dataInicioVigencia: { lte: agora },
                            OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: agora } }]
                        },
                        orderBy: { versao: 'desc' },
                        select: { id: true }
                    });
                    if (receitaAtiva) {
                        const c = await pcpReceitaService.calcularCusto(receitaAtiva.id);
                        if (c && Number(c.custoPorUnidade) > 0) {
                            custoReceita = Math.round(Number(c.custoPorUnidade) * 100) / 100;
                        }
                    }
                }
            } catch (e) {
                console.error('Custo por receita indisponível (segue sem):', e.message);
            }

            res.json({ ...produto, custoReceita });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar produto' });
        }
    },

    // Ficha do produto (popup do catálogo) — dados + tabela nutricional/ingredientes da etiqueta.
    // Mesma lógica do site de congelados (services/congeladosService.fichaPublico): a etiqueta é
    // procurada pelo produtoId e, se não houver vínculo, pelo código do produto. O front calcula
    // 100g/porção/%VD a partir dos valores crus (ex.: "169kcal (12% VD)").
    ficha: async (req, res) => {
        try {
            const { id } = req.params;
            const p = await prisma.produto.findUnique({
                where: { id },
                include: {
                    imagens: { orderBy: [{ principal: 'desc' }, { ordem: 'asc' }] },
                    categoriaProduto: { select: { id: true, nome: true, corTag: true } }
                }
            });
            if (!p) return res.status(404).json({ error: 'Produto não encontrado' });

            let et = await prisma.etiquetaProduto.findFirst({ where: { produtoId: p.id, ativo: true }, orderBy: { updatedAt: 'desc' } });
            if (!et && p.codigo) et = await prisma.etiquetaProduto.findFirst({ where: { codigoProduto: p.codigo, ativo: true }, orderBy: { updatedAt: 'desc' } });

            const imagens = [...p.imagens]
                .sort((a, b) => (b.principal === true ? 1 : 0) - (a.principal === true ? 1 : 0))
                .map(i => i.url)
                .filter(Boolean);

            res.json({
                id: p.id,
                nome: p.nome,
                codigo: p.codigo,
                unidade: p.unidade,
                categoria: p.categoria,
                grupoNome: p.categoriaProduto?.nome || null,
                descricao: p.descricao || '',
                valorVenda: p.valorVenda,
                estoqueDisponivel: p.estoqueDisponivel,
                ativo: p.ativo,
                imagem: imagens[0] || null,
                imagens,
                etiqueta: et ? {
                    pesoUnitario: et.pesoUnitario,
                    pesoPorcao: et.pesoTabelaNutricional,
                    quantidadeEmbalagem: et.quantidadeEmbalagem,
                    quantidadeAproximada: et.quantidadeAproximada,
                    nutricional: {
                        valorEnergetico: et.valorEnergetico,
                        carboidratos: et.carboidratos,
                        acucaresTotais: et.acucaresTotais,
                        acucaresAdicionados: et.acucaresAdicionados,
                        proteinas: et.proteinas,
                        gordurasTotais: et.gordurasTotais,
                        gordurasSaturadas: et.gordurasSaturadas,
                        gordurasTrans: et.gordurasTrans,
                        fibraAlimentar: et.fibraAlimentar,
                        sodio: et.sodio,
                    },
                    composicao: et.composicao,
                    modoPreparo: et.modoPreparo,
                    armazenamento: et.armazenamento,
                    validadeDias: et.validadeDias,
                    contemGluten: et.contemGluten,
                    contemLactose: et.contemLactose,
                    alergenos: Array.isArray(et.alergenos) ? et.alergenos : [],
                    especieCrustaceos: et.especieCrustaceos,
                    especiePeixes: et.especiePeixes,
                    avisosRotulo: et.avisosRotulo,
                } : null,
            });
        } catch (error) {
            console.error('Erro ao buscar ficha do produto:', error);
            res.status(500).json({ error: 'Erro ao buscar ficha do produto' });
        }
    },

    // Fase 6 — criar produto novo: nasce PRIMEIRO no Conta Azul (POST /v1/produtos)
    // e só então é salvo aqui com o contaAzulId retornado (origem APP).
    // Se o CA estiver fora, nada é criado — o usuário tenta de novo.
    criar: async (req, res) => {
        try {
            const { nome, codigo, ean, unidade, categoria, valorVenda, descricao } = req.body || {};
            if (!nome?.trim()) return res.status(400).json({ error: 'Informe o nome do produto.' });
            const unidadeFinal = String(unidade || 'UN').trim().substring(0, 10).toUpperCase() || 'UN';
            const valor = parseFloat(String(valorVenda ?? '0').replace(',', '.'));
            if (!Number.isFinite(valor) || valor < 0) return res.status(400).json({ error: 'Valor de venda inválido.' });

            // Duplicidade local por nome (evita criar 2x no CA sem querer)
            const jaExiste = await prisma.produto.findFirst({
                where: { nome: { equals: nome.trim(), mode: 'insensitive' } },
                select: { id: true, nome: true }
            });
            if (jaExiste) {
                return res.status(400).json({ error: `Já existe um produto chamado "${jaExiste.nome}".` });
            }

            // 1) Cria no Conta Azul (era a fonte do catálogo até 23/07/2026).
            // CA somente leitura: o produto nasce SÓ no app, com um id local no
            // lugar do contaAzulId (coluna obrigatória/única — vínculo legado).
            const { CA_SOMENTE_LEITURA } = require('../config/contaAzulModo');
            const contaAzulService = require('../services/contaAzulService');
            let criadoCA;
            if (CA_SOMENTE_LEITURA) {
                criadoCA = { id: `app-${require('crypto').randomUUID()}` };
            } else {
                try {
                    criadoCA = await contaAzulService.criarProdutoCA({
                        nome,
                        codigoSku: codigo,
                        codigoEan: ean,
                        valorVenda: valor,
                        categoriaNome: categoria,
                        descricao
                    });
                } catch (e) {
                    console.error('[Produtos] Falha ao criar produto no CA:', e.message);
                    return res.status(502).json({ error: `Não consegui criar o produto na Conta Azul: ${e.message}` });
                }
            }

            // 2) Salva local com o vínculo (origem APP)
            const produto = await prisma.produto.create({
                data: {
                    contaAzulId: criadoCA.id,
                    codigo: codigo?.trim() || '',
                    nome: nome.trim(),
                    valorVenda: valor,
                    unidade: unidadeFinal,
                    ean: ean?.trim() || '',
                    categoria: categoria?.trim() || '',
                    descricao: descricao?.trim() || '',
                    status: 'ATIVO',
                    ativo: true,
                    origem: 'APP'
                }
            });

            res.status(201).json({ ...produto, message: CA_SOMENTE_LEITURA ? 'Produto criado no app!' : 'Produto criado no app e na Conta Azul!' });
        } catch (error) {
            console.error('Erro ao criar produto:', error);
            res.status(500).json({ error: 'Erro ao criar o produto.' });
        }
    },

    // Atualizar produto (somente campos locais — dados do CA são imutáveis)
    atualizar: async (req, res) => {
        try {
            const { id } = req.params;
            const body = req.body;

            // Whitelist: apenas campos gerenciados localmente
            // 'unidade' é editável no app e NÃO é mais sobrescrita pelo sync do CA
            const CAMPOS_PERMITIDOS = [
                'ativo', 'descricao', 'estoqueMinimo', 'unidade', 'custoManual',
                'categoriaProdutoId', 'produtoSubstitutoId',
                'permiteRecomendacao', 'prioridadeRecomendacao', 'controlaEstoque',
                'validadeDias'
            ];
            const data = {};
            for (const campo of CAMPOS_PERMITIDOS) {
                if (body[campo] !== undefined) data[campo] = body[campo];
            }
            // Validade em dias: número inteiro >= 1, ou null (vazio = usa a validade da etiqueta)
            if (data.validadeDias !== undefined) {
                const n = parseInt(data.validadeDias);
                data.validadeDias = Number.isFinite(n) && n >= 1 ? n : null;
            }
            // Controle de estoque por produto: true/false força; null volta a seguir a categoria
            if (data.controlaEstoque !== undefined && data.controlaEstoque !== null) {
                data.controlaEstoque = data.controlaEstoque === true || data.controlaEstoque === 'true';
            }
            // Unidade nunca pode ficar vazia (campo obrigatório no schema)
            if (data.unidade !== undefined) {
                data.unidade = String(data.unidade).trim().substring(0, 10);
                if (!data.unidade) delete data.unidade;
            }
            // Custo manual: aceita número ou vazio (null). Usado só quando o CA não tem custo.
            if (data.custoManual !== undefined) {
                const n = parseFloat(data.custoManual);
                data.custoManual = Number.isFinite(n) && n >= 0 ? n : null;
            }

            const produto = await prisma.produto.update({
                where: { id },
                data
            });

            res.json(produto);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao atualizar produto' });
        }
    },

    // Zerar/restaurar o custo do Conta Azul.
    // Zerado: custoMedio some e o app passa a valer o custoManual (que as entradas de
    // compra atualizam por média ponderada); o sync do CA deixa de trazer o custo de volta.
    // Restaurar: religa o sync e força a próxima rodada a rebuscar o produto no CA.
    alterarCustoCa: async (req, res) => {
        try {
            const { id } = req.params;
            const zerar = req.body?.zerar !== false;
            const produto = await prisma.produto.update({
                where: { id },
                data: zerar
                    ? { custoCaZerado: true, custoMedio: null }
                    : { custoCaZerado: false, contaAzulUpdatedAt: null }
            });
            res.json(produto);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao alterar o custo do CA' });
        }
    },

    // Upload de imagens
    uploadImagem: async (req, res) => {
        try {
            const { id } = req.params;
            const files = req.files;

            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'Nenhuma imagem enviada' });
            }

            // Buscar maior ordem existente para continuar a sequência
            const ultimaImagem = await prisma.produtoImagem.findFirst({
                where: { produtoId: id },
                orderBy: { ordem: 'desc' },
                select: { ordem: true }
            });
            const ordemBase = (ultimaImagem?.ordem ?? -1) + 1;

            const temPrincipal = await prisma.produtoImagem.findFirst({
                where: { produtoId: id, principal: true }
            });

            const novasImagens = await Promise.all(files.map(async (file, index) => {
                const relativePath = `/uploads/produtos/${id}/${file.filename}`;

                return prisma.produtoImagem.create({
                    data: {
                        produtoId: id,
                        url: relativePath,
                        principal: !temPrincipal && index === 0,
                        ordem: ordemBase + index
                    }
                });
            }));

            res.json(novasImagens);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao fazer upload' });
        }
    },

    // Remover imagem
    removerImagem: async (req, res) => {
        try {
            const { id } = req.params; // ID da IMAGEM
            const imagem = await prisma.produtoImagem.findUnique({ where: { id } });

            if (!imagem) return res.status(404).json({ error: 'Imagem não encontrada' });

            // Remove arquivo físico
            const filePath = path.join(__dirname, '..', imagem.url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            await prisma.produtoImagem.delete({ where: { id } });

            res.json({ message: 'Imagem removida com sucesso' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao remover imagem' });
        }
    },

    // Definir imagem principal
    definirPrincipal: async (req, res) => {
        try {
            const { id, imagemId } = req.params; // ID do Produto, ID da Imagem

            // Remove principal de todas
            await prisma.produtoImagem.updateMany({
                where: { produtoId: id },
                data: { principal: false }
            });

            // Define nova principal
            await prisma.produtoImagem.update({
                where: { id: imagemId },
                data: { principal: true }
            });

            res.json({ message: 'Imagem principal atualizada' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao definir imagem principal' });
        }
    },

    // Ativar/Inativar produto
    alterarStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { ativo } = req.body;

            const produto = await prisma.produto.update({
                where: { id },
                data: { ativo }
            });

            res.json(produto);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao atualizar status' });
        }
    },

    // Reordenar imagens (recebe array de IDs na ordem desejada)
    reordenarImagens: async (req, res) => {
        try {
            const { id } = req.params;
            const { ordem } = req.body; // Array de IDs na ordem desejada

            if (!Array.isArray(ordem) || ordem.length === 0) {
                return res.status(400).json({ error: 'Array de ordem é obrigatório' });
            }

            await Promise.all(
                ordem.map((imagemId, index) =>
                    prisma.produtoImagem.update({
                        where: { id: imagemId },
                        data: { ordem: index }
                    })
                )
            );

            res.json({ message: 'Ordem atualizada com sucesso' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao reordenar imagens' });
        }
    },

    // Listar categorias CA distintas (campo categoria do Produto)
    categoriasCA: async (req, res) => {
        try {
            const result = await prisma.produto.findMany({
                where: { categoria: { not: null } },
                select: { categoria: true },
                distinct: ['categoria'],
                orderBy: { categoria: 'asc' }
            });
            res.json(result.map(r => r.categoria).filter(Boolean));
        } catch (error) {
            console.error('Erro ao listar categorias CA:', error);
            res.status(500).json({ error: 'Erro ao listar categorias.' });
        }
    }
};

module.exports = produtoController;
