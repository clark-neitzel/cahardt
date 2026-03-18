const prisma = require('../config/database');

const tabelaPrecoController = {
    // Listar todas as condições da tabela de preços
    listar: async (req, res) => {
        try {
            const { ativo } = req.query;
            const where = {};

            if (ativo !== undefined) {
                where.ativo = ativo === 'true';
            }

            const condicoes = await prisma.tabelaPreco.findMany({
                where,
                orderBy: { id: 'asc' } // Ordenar por ID (1000, 1001...)
            });

            res.json(condicoes);
        } catch (error) {
            console.error('Erro ao listar tabela de preços:', error);
            res.status(500).json({ error: 'Erro interno ao buscar tabela de preços' });
        }
    },

    // Criar nova condição de pagamento
    criar: async (req, res) => {
        try {
            const { id, idCondicao, nomeCondicao, tipoPagamento, opcaoCondicao, qtdParcelas, parcelasDias, acrescimoPreco, valorMinimo, exigeBanco, bancoPadrao, debitaCaixa, regrasCategoria } = req.body;

            if (!id || !idCondicao || !nomeCondicao) {
                return res.status(400).json({ error: 'Campos obrigatórios: id, idCondicao, nomeCondicao.' });
            }

            const exists = await prisma.tabelaPreco.findUnique({ where: { id } });
            if (exists) {
                return res.status(400).json({ error: 'Já existe uma condição com este ID.' });
            }

            const nova = await prisma.tabelaPreco.create({
                data: {
                    id,
                    idCondicao,
                    nomeCondicao,
                    tipoPagamento: tipoPagamento || null,
                    opcaoCondicao: opcaoCondicao || null,
                    qtdParcelas: Number(qtdParcelas) || 1,
                    parcelasDias: Number(parcelasDias) || 0,
                    acrescimoPreco: Number(acrescimoPreco) || 0,
                    valorMinimo: Number(valorMinimo) || 0,
                    exigeBanco: exigeBanco || false,
                    bancoPadrao: bancoPadrao || null,
                    debitaCaixa: debitaCaixa || false,
                    ativo: true,
                    regrasCategoria: regrasCategoria || null
                }
            });

            res.status(201).json(nova);
        } catch (error) {
            console.error('Erro ao criar condição:', error);
            res.status(500).json({ error: 'Erro ao criar condição de pagamento.' });
        }
    },

    // Atualizar uma condição de pagamento (Edição inline)
    atualizar: async (req, res) => {
        try {
            const { id } = req.params;
            const {
                ativo, acrescimoPreco, exigeBanco, bancoPadrao, valorMinimo,
                nomeCondicao, tipoPagamento, opcaoCondicao, qtdParcelas, parcelasDias
            } = req.body;

            // Verificar se o registro existe
            const exists = await prisma.tabelaPreco.findUnique({ where: { id } });
            if (!exists) {
                return res.status(404).json({ error: 'Tabela de preço não encontrada.' });
            }

            // Converter e validar valores para manter a integridade do banco (Decimal)
            const updateData = {};

            if (ativo !== undefined) updateData.ativo = ativo;
            if (req.body.debitaCaixa !== undefined) updateData.debitaCaixa = req.body.debitaCaixa;
            if (exigeBanco !== undefined) updateData.exigeBanco = exigeBanco;
            if (bancoPadrao !== undefined) updateData.bancoPadrao = bancoPadrao;
            if (nomeCondicao !== undefined) updateData.nomeCondicao = nomeCondicao;
            if (tipoPagamento !== undefined) updateData.tipoPagamento = tipoPagamento;
            if (opcaoCondicao !== undefined) updateData.opcaoCondicao = opcaoCondicao;

            if (qtdParcelas !== undefined) updateData.qtdParcelas = Number(qtdParcelas) || 1;
            if (parcelasDias !== undefined) updateData.parcelasDias = Number(parcelasDias) || 0;

            if (acrescimoPreco !== undefined) {
                updateData.acrescimoPreco = Number(acrescimoPreco) || 0;
            }
            if (valorMinimo !== undefined) {
                updateData.valorMinimo = Number(valorMinimo) || 0;
            }
            if (req.body.regrasCategoria !== undefined) {
                updateData.regrasCategoria = req.body.regrasCategoria;
            }

            const condicaoAtualizada = await prisma.tabelaPreco.update({
                where: { id },
                data: updateData
            });

            res.json(condicaoAtualizada);
        } catch (error) {
            console.error('Erro ao atualizar tabela de preço:', error);
            res.status(500).json({ error: 'Erro interno ao atualizar tabela de preço' });
        }
    }
};

module.exports = tabelaPrecoController;
