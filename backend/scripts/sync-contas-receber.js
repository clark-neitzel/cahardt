const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function sincronizarContasReceber() {
    try {
        console.log('🔄 Iniciando sincronização de Contas a Receber...');

        // Buscar todos os pedidos enviados que NÃO têm conta a receber
        const pedidosSemConta = await prisma.pedido.findMany({
            where: {
                statusEnvio: 'ENVIAR',
                contaReceber: null
            },
            include: {
                itens: true,
                cliente: { select: { Nome: true, NomeFantasia: true } }
            }
        });

        console.log(`📊 Encontrados ${pedidosSemConta.length} pedidos sem contas a receber`);

        let criadas = 0;
        for (const pedido of pedidosSemConta) {
            try {
                // Calcular valor total do pedido
                const valorTotal = pedido.itens.reduce((sum, item) => {
                    return sum + (Number(item.valor) * Number(item.quantidade));
                }, 0);

                // Calcular parcelas
                const numParcelas = pedido.qtdParcelas || 1;
                const intervalo = pedido.intervaloDias || 0;
                const baseDate = pedido.primeiroVencimento || pedido.dataVenda;
                const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;

                const parcelasData = [];
                for (let i = 0; i < numParcelas; i++) {
                    const vencimento = new Date(baseDate);
                    vencimento.setDate(vencimento.getDate() + (i * intervalo));
                    const val = i === numParcelas - 1
                        ? Math.round((valorTotal - valorParcela * (numParcelas - 1)) * 100) / 100
                        : valorParcela;
                    parcelasData.push({
                        numeroParcela: i + 1,
                        valor: val,
                        dataVencimento: vencimento
                    });
                }

                // Criar conta a receber
                await prisma.contaReceber.create({
                    data: {
                        pedidoId: pedido.id,
                        clienteId: pedido.clienteId,
                        origem: pedido.especial ? 'ESPECIAL' : 'FATURADO_CA',
                        valorTotal: Math.round(valorTotal * 100) / 100,
                        status: 'ABERTO',
                        parcelas: { create: parcelasData }
                    }
                });

                criadas++;
                console.log(`✅ Pedido ${pedido.numero} (${pedido.cliente?.NomeFantasia || pedido.cliente?.Nome}) - R$ ${(valorTotal).toFixed(2)} - ${numParcelas} parcela(s)`);
            } catch (err) {
                console.error(`❌ Erro ao processar pedido ${pedido.numero}:`, err.message);
            }
        }

        console.log(`\n✨ Sincronização concluída: ${criadas}/${pedidosSemConta.length} contas criadas`);
        process.exit(0);
    } catch (error) {
        console.error('Erro crítico ao sincronizar:', error);
        process.exit(1);
    }
}

sincronizarContasReceber();
