const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');

// Buscar histórico/último preço
router.get('/ultimo-preco', pedidoController.obterUltimoPreco);

// Buscar histórico de compras por cliente (para novo pedido mobile)
router.get('/historico-cliente', pedidoController.historicoComprasCliente);

// Resumo de pendências (contagens por tipo e status)
router.get('/resumo-pendencias', pedidoController.resumoPendencias);

// Relatório de Pedidos (com filtros avançados)
router.get('/relatorio', pedidoController.relatorio);

// Listagem de Pedidos
router.get('/', pedidoController.listar);

// Diagnóstico: pedido + contaReceber + parcelas (TEMPORÁRIO)
router.get('/diag/:numero', async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const numero = parseInt(req.params.numero);
        const pedido = await prisma.pedido.findFirst({
            where: { numero },
            include: {
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                itens: true,
                contaReceber: { include: { parcelas: true } },
            }
        });
        if (!pedido) return res.status(404).json({ error: `Pedido #${numero} não encontrado` });
        res.json({
            id: pedido.id,
            numero: pedido.numero,
            especial: pedido.especial,
            bonificacao: pedido.bonificacao,
            statusEnvio: pedido.statusEnvio,
            situacaoCA: pedido.situacaoCA,
            baixaCaRealizada: pedido.baixaCaRealizada,
            baixaCaValor: pedido.baixaCaValor,
            baixaCaEm: pedido.baixaCaEm,
            cliente: pedido.cliente,
            valorTotal: pedido.itens?.reduce((s, i) => s + (i.valor * i.quantidade), 0),
            contaReceber: pedido.contaReceber || null,
            _diagnostico: !pedido.contaReceber
                ? 'CONTA_RECEBER_AUSENTE — precisa ser criada para baixa especial funcionar'
                : pedido.contaReceber.parcelas?.length === 0
                    ? 'CONTA_SEM_PARCELAS — conta existe mas sem parcelas'
                    : 'OK'
        });
        await prisma.$disconnect();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Detalhes de um pedido
router.get('/:id', pedidoController.detalhar);

// Criar Novo Pedido
router.post('/', pedidoController.criar);

// Editar Pedido (Apenas ABERTO)
router.put('/:id', pedidoController.atualizar);

// Marcar Pedido como Revisado
router.put('/:id/revisado', pedidoController.marcarRevisado);

// Aprovar Pedido Especial (sem nota)
router.put('/:id/aprovar-especial', pedidoController.aprovarEspecial);

// Reverter Pedido Especial (desfazer aprovação → volta para ABERTO)
router.put('/:id/reverter-especial', pedidoController.reverterEspecial);

// Aprovar Pedido Bonificação
router.put('/:id/aprovar-bonificacao', pedidoController.aprovarBonificacao);

// Reverter Pedido Bonificação (desfazer aprovação → volta para ABERTO)
router.put('/:id/reverter-bonificacao', pedidoController.reverterBonificacao);

// Excluir Pedido Existente (Apenas Rascunho/ABERTO/ERRO)
router.delete('/:id', pedidoController.excluir);

// Enviar pedido via WhatsApp (BotConversa)
router.post('/:id/enviar-whatsapp', pedidoController.enviarWhatsapp);

// Reatribuir vendedor de um pedido (ajuste somente no app, não envia ao CA)
router.put('/:id/reatribuir-vendedor', pedidoController.reatribuirVendedor);

// Registrar Impressão de Pedido ou Especial
router.put('/:id/impresso', pedidoController.registrarImpressao);

// Consultar situação atual no Conta Azul (GET /v1/venda/{id}) e atualizar local
router.post('/:id/consultar-ca', pedidoController.consultarCA);

module.exports = router;
