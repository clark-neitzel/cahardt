// One-shot: pedido #94 foi teste de entrega do primeiro dia, excluído no CA
// mas ficou órfão no app. Marca como EXCLUIDO, estorna estoque e solta do embarque.
const prisma = require('../config/database');
const estoqueService = require('../services/estoqueService');

async function main() {
    const pedido = await prisma.pedido.findFirst({
        where: { numero: 94 },
        select: { id: true, numero: true, statusEnvio: true, situacaoCA: true, embarqueId: true, statusEntrega: true }
    });

    if (!pedido) {
        console.log('Pedido #94 não encontrado — nada a fazer.');
        return;
    }

    console.log('Estado atual:', pedido);

    if (pedido.statusEnvio === 'RECEBIDO') {
        try {
            await estoqueService.cancelarPedido(pedido.id);
            console.log('📦 Estoque estornado.');
        } catch (e) {
            console.error('Falha ao estornar estoque:', e.message);
        }
    }

    await prisma.pedido.update({
        where: { id: pedido.id },
        data: {
            statusEnvio: 'EXCLUIDO',
            situacaoCA: 'EXCLUIDO',
            revisaoPendente: false,
            embarqueId: null,
            statusEntrega: 'PENDENTE',
            dataEntrega: null,
            contaAzulUpdatedAt: new Date()
        }
    });

    console.log('✅ Pedido #94 marcado como EXCLUIDO e removido do embarque.');
}

main()
    .catch(e => { console.error('Erro:', e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
