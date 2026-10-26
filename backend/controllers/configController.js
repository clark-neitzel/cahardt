const prisma = require('../config/database');

// Ação padrão que TODA lista de ações de atendimento precisa ter, mesmo a customizada pelo dono
// (senão o botão "Pausar visitas" nunca apareceria em produção). Entra só se ausente; se o dono
// a desativar (ativo:false) ou editar, a versão dele prevalece.
const ACOES_OBRIGATORIAS = {
    acoes_atendimento: [{ value: 'PAUSAR_VISITAS', label: 'Pausar visitas até...', pausaVisitas: true }],
};
function mesclarAcoes(key, value) {
    const extras = ACOES_OBRIGATORIAS[key];
    if (!extras || !Array.isArray(value)) return value;
    const faltam = extras.filter(e => !value.some(a => a && a.value === e.value));
    return faltam.length ? [...value, ...faltam] : value;
}

const configController = {
    // Obter todas as configurações ou uma específica
    get: async (req, res) => {
        try {
            const { key } = req.params;
            if (key) {
                const config = await prisma.appConfig.findUnique({ where: { key } });
                return res.json(config ? mesclarAcoes(key, config.value) : null);
            }
            const configs = await prisma.appConfig.findMany();
            // Transform array to object { key: value }
            const configObj = {};
            const p = req.user?.permissoes || {};
            const c0 = p.configuracoes;
            const veConfig = p.admin === true || c0 === true || (c0 && typeof c0 === 'object' && (c0.view === true || c0.edit === true));
            configs.forEach(c => { if (!c.key.startsWith('ia_') || veConfig) configObj[c.key] = mesclarAcoes(c.key, c.value); }); // ia_* só para quem vê Configurações
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
