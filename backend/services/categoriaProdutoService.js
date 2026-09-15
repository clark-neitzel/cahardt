const prisma = require('../config/database');

const categoriaProdutoService = {
    listar: async () => {
        return await prisma.categoriaProduto.findMany({
            orderBy: { ordemExibicao: 'asc' }
        });
    },

    detalhar: async (id) => {
        return await prisma.categoriaProduto.findUnique({
            where: { id }
        });
    },

    // Quantos produtos perderiam a classificação comercial se esta categoria
    // fosse apagada. A FK é ON DELETE SET NULL: o banco NÃO impede o delete,
    // ele zera `categoria_produto_id` desses produtos em silêncio.
    contarProdutos: async (id) => {
        return await prisma.produto.count({ where: { categoriaProdutoId: id } });
    },

    criar: async (dados) => {
        return await prisma.categoriaProduto.create({
            data: dados
        });
    },

    // D4 (plano Etapa 1 Entrada de Notas, 09/2026): `controlaEstoque` saiu da tela de
    // Categorias comerciais — o PUT passa a IGNORAR o campo (nunca mais grava), mesmo que
    // o corpo venha com ele (cliente antigo em cache, chamada manual etc.). O campo
    // continua no schema — só não é mais editável por aqui.
    atualizar: async (id, dados) => {
        const { controlaEstoque, ...dadosPermitidos } = dados || {};
        return await prisma.categoriaProduto.update({
            where: { id },
            data: dadosPermitidos
        });
    },

    // `confirmar: true` é a confirmação explícita de quem está apagando uma
    // categoria que ainda tem produtos — sem ela, recusa e devolve a contagem
    // para o chamador avisar o usuário do que ele está prestes a perder.
    deletar: async (id, { confirmar = false } = {}) => {
        const vinculados = await categoriaProdutoService.contarProdutos(id);
        if (vinculados > 0 && !confirmar) {
            const erro = new Error(
                `Esta categoria está em ${vinculados} produto${vinculados === 1 ? '' : 's'}. ` +
                `Apagar a categoria deixa ${vinculados === 1 ? 'esse produto' : 'esses produtos'} SEM classificação comercial ` +
                `(some dos filtros e das restrições de categoria por vendedor) e não dá para desfazer. ` +
                `Troque a categoria ${vinculados === 1 ? 'do produto' : 'dos produtos'} antes, ou confirme a exclusão mesmo assim.`
            );
            erro.codigo = 'CATEGORIA_EM_USO';
            erro.status = 409;
            erro.produtosVinculados = vinculados;
            throw erro;
        }
        await prisma.categoriaProduto.delete({ where: { id } });
        return { produtosDesclassificados: vinculados };
    }
};

module.exports = categoriaProdutoService;
