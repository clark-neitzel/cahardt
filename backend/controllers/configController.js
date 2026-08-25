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

    // Categorias disponíveis para o seletor (formulário de produto, filtros, tabela de preços).
    // UNIÃO de duas fontes:
    //   1) as que já estão em uso nos produtos (groupBy)
    //   2) as CADASTRADAS em `categorias_estoque` — inclusive as que ainda não têm
    //      nenhum produto. Sem isso, uma categoria recém-criada (ex.: "Imobilizado")
    //      não apareceria no campo Categoria do produto, e o usuário acabaria
    //      digitando o nome à mão — abrindo a porta para uma categoria "quase igual"
    //      (caixa alta/espaço) que faria a trava do "Vende" parar de pegar.
    // Formato da resposta preservado: array de strings, ordem alfabética.
    getCategorias: async (req, res) => {
        try {
            const [emUso, cadastradas] = await Promise.all([
                prisma.produto.groupBy({
                    by: ['categoria'],
                    where: { categoria: { not: null } },
                    orderBy: { categoria: 'asc' }
                }),
                prisma.categoriaEstoque.findMany({ select: { nome: true } })
            ]);

            const nomes = [
                ...emUso.map(c => c.categoria),
                ...cadastradas.map(c => c.nome)
            ].filter(c => typeof c === 'string' && c.trim().length > 0);

            // Deduplica ignorando caixa/espaços (mantém a 1ª grafia encontrada),
            // para não oferecer "Imobilizado" e "imobilizado" como se fossem duas.
            const vistos = new Map();
            for (const n of nomes) {
                const chave = n.trim().toLowerCase();
                if (!vistos.has(chave)) vistos.set(chave, n);
            }

            const cleanCategorias = [...vistos.values()]
                .sort((a, b) => a.localeCompare(b, 'pt-BR'));

            res.json(cleanCategorias);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Erro ao buscar categorias' });
        }
    }
};

module.exports = configController;
