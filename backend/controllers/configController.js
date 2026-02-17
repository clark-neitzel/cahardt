const prisma = require('../config/database');

const configController = {
    // Obter todas as configurações ou uma específica
    get: async (req, res) => {
        try {
            const { key } = req.params;
            if (key) {
                const config = await prisma.appConfig.findUnique({ where: { key } });
                return res.json(config ? config.value : null);
            }
            const configs = await prisma.appConfig.findMany();
            // Transform array to object { key: value }
            const configObj = {};
            configs.forEach(c => configObj[c.key] = c.value);
            res.json(configObj);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar configurações' });
        }
    },

    // Salvar configuração (Upsert)
    save: async (req, res) => {
        try {
            const { key } = req.params;
            const value = req.body; // JSON body

            if (!key) return res.status(400).json({ error: 'Chave não informada' });

            const config = await prisma.appConfig.upsert({
                where: { key },
                update: { value },
                create: { key, value }
            });

            res.json(config);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao salvar configuração' });
        }
    },

    // Buscar categorias únicas dos produtos (Helper para o seletor)
    getCategorias: async (req, res) => {
        try {
            const categorias = await prisma.produto.groupBy({
                by: ['categoria'],
                where: {
                    categoria: { not: null }
                },
                orderBy: { categoria: 'asc' }
            });

            const cleanCategorias = categorias
                .map(c => c.categoria)
                .filter(c => c && c.trim().length > 0);

            res.json(cleanCategorias);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar categorias' });
        }
    }
};

module.exports = configController;
