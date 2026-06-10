const bcrypt = require('bcryptjs');
const prisma = require('../config/database');
const { calcularFlexBulk } = require('../services/flexService');

const vendedorController = {
    // Listar todos os vendedores (inclui flex dinâmico computado dos últimos 30 dias)
    listar: async (req, res) => {
        try {
            const where = {};
            if (req.query.ativo === 'true') where.ativo = true;
            if (req.query.ativo === 'false') where.ativo = false;

            const vendedores = await prisma.vendedor.findMany({
                where,
                orderBy: { nome: 'asc' }
            });

            const ids = vendedores.map(v => v.id);
            const flexMap = await calcularFlexBulk(ids);

            const resultado = vendedores.map(v => {
                const flex = flexMap.get(v.id) || { percentualFlex: Number(v.percentualFlex || 0), vendasLiquidas: 0, orcamento: 0, flexUsado: 0, disponivel: 0 };
                return {
                    ...v,
                    percentualFlex: Number(v.percentualFlex || 0),
                    flexDinamico: {
                        vendasLiquidas: flex.vendasLiquidas,
                        orcamento: flex.orcamento,
                        flexUsado: flex.flexUsado,
                        disponivel: flex.disponivel
                    }
                };
            });

            res.json(resultado);
        } catch (error) {
            console.error('Erro ao listar vendedores:', error);
            res.status(500).json({ error: 'Erro ao listar vendedores' });
        }
    },

    // Buscar vendedor por ID
    obter: async (req, res) => {
        try {
            const { id } = req.params;
            const vendedor = await prisma.vendedor.findUnique({ where: { id } });
            if (!vendedor) return res.status(404).json({ error: 'Vendedor não encontrado' });
            res.json(vendedor);
        } catch (error) {
            console.error('Erro ao obter vendedor:', error);
            res.status(500).json({ error: 'Erro ao obter vendedor' });
        }
    },

    // Atualizar dados locais (Email, Flex, Permissoes, Auth)
    atualizar: async (req, res) => {
        try {
            const { id } = req.params;
            const { email, telefone, flexMensal, flexDisponivel, login, senha, permissoes, maxDescontoFlex, percentualFlex, ativo, formasAtendimentoVisiveis, alertaFaturamento } = req.body;

            const dataToUpdate = {};
            if (email !== undefined) dataToUpdate.email = email;
            if (telefone !== undefined) dataToUpdate.telefone = telefone;
            if (flexMensal !== undefined) dataToUpdate.flexMensal = flexMensal;
            if (flexDisponivel !== undefined) dataToUpdate.flexDisponivel = flexDisponivel;
            if (maxDescontoFlex !== undefined) dataToUpdate.maxDescontoFlex = maxDescontoFlex;
            if (percentualFlex !== undefined) dataToUpdate.percentualFlex = percentualFlex;
            if (ativo !== undefined) dataToUpdate.ativo = ativo;
            if (login !== undefined) dataToUpdate.login = login || null;
            if (permissoes !== undefined) dataToUpdate.permissoes = permissoes;
            if (formasAtendimentoVisiveis !== undefined) dataToUpdate.formasAtendimentoVisiveis = formasAtendimentoVisiveis;
            if (alertaFaturamento !== undefined) dataToUpdate.alertaFaturamento = alertaFaturamento;

            if (senha && senha.trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                dataToUpdate.senha = await bcrypt.hash(senha, salt);
            }

            const vendedor = await prisma.vendedor.update({
                where: { id },
                data: dataToUpdate
            });

            vendedor.senha = undefined;

            res.json(vendedor);
        } catch (error) {
            console.error('Erro ao atualizar vendedor:', error);
            res.status(500).json({ error: 'Erro ao atualizar vendedor' });
        }
    }
};

module.exports = vendedorController;
