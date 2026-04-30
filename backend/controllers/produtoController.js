const prisma = require('../config/database');
const fs = require('fs');
const path = require('path');

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

            const [produtos, total] = await Promise.all([
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
                prisma.produto.count({ where })
            ]);

            res.json({
                data: produtos,
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

            res.json(produto);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar produto' });
        }
    },

    // Atualizar produto (somente campos locais — dados do CA são imutáveis)
    atualizar: async (req, res) => {
        try {
            const { id } = req.params;
            const body = req.body;

            // Whitelist: apenas campos gerenciados localmente
            const CAMPOS_PERMITIDOS = [
                'ativo', 'descricao', 'estoqueMinimo',
                'categoriaProdutoId', 'produtoSubstitutoId',
                'permiteRecomendacao', 'prioridadeRecomendacao'
            ];
            const data = {};
            for (const campo of CAMPOS_PERMITIDOS) {
                if (body[campo] !== undefined) data[campo] = body[campo];
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
