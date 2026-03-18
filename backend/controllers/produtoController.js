const prisma = require('../config/database');
const fs = require('fs');
const path = require('path');

const produtoController = {
    // Listar produtos com paginação e filtros
    listar: async (req, res) => {
        try {
            const { page = 1, limit = 10, search, ativo, categorias } = req.query;
            const skip = (page - 1) * limit;

            const where = {};
            if (search) {
                where.OR = [
                    { nome: { contains: search, mode: 'insensitive' } },
                    { codigo: { contains: search, mode: 'insensitive' } }
                ];
            }
            // Filtro de Ativo/Inativo
            // Se ativo for 'all' ou undefined, traz tudo. Se for 'true' traz ativos, 'false' inativos.
            if (ativo !== undefined && ativo !== 'all') {
                where.ativo = ativo === 'true';
            }

            // Filtro de Categorias (Multi-select)
            if (categorias) {
                const cats = categorias.split(',').map(c => c.trim()).filter(c => c);
                if (cats.length > 0) {
                    where.categoria = { in: cats };
                }
            }

            const [produtos, total] = await Promise.all([
                prisma.produto.findMany({
                    where,
                    skip: Number(skip),
                    take: Number(limit),
                    include: {
                        imagens: {
                            where: { principal: true },
                            take: 1
                        },
                        categoriaProduto: {
                            select: { id: true, nome: true, permiteFracao: true }
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

    // Atualizar produto (Generic)
    atualizar: async (req, res) => {
        try {
            const { id } = req.params;
            const data = req.body;

            // Remove campos que não devem ser atualizados diretamente ou que são de controle
            delete data.id;
            delete data.createdAt;
            delete data.updatedAt;
            delete data.imagens; // Imagens são via upload

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

            const novasImagens = await Promise.all(files.map(async (file, index) => {
                // Caminho relativo para salvar no banco
                const relativePath = `/uploads/produtos/${id}/${file.filename}`;

                // Verifica se já existe imagem principal
                const temPrincipal = await prisma.produtoImagem.findFirst({
                    where: { produtoId: id, principal: true }
                });

                return prisma.produtoImagem.create({
                    data: {
                        produtoId: id,
                        url: relativePath,
                        principal: !temPrincipal && index === 0, // Define como principal se for a primeira e não houver outra
                        ordem: index // Simples ordenação sequencial
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
    }
};

module.exports = produtoController;
