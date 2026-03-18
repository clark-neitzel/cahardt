const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPedidos() {
    try {
        console.log('🔍 Verificando pedidos...\n');

        // Count by status
        const statusEnvioGroups = await prisma.$queryRaw`
            SELECT "status_envio", COUNT(*) as count
            FROM "pedidos"
            GROUP BY "status_envio"
        `;
        console.log('📊 Pedidos por status_envio:');
        if (statusEnvioGroups && statusEnvioGroups.length > 0) {
            statusEnvioGroups.forEach(g => {
                console.log(`  ${g.status_envio}: ${g.count}`);
            });
        }

        // Find pedidos that match our criteria
        const candidatos = await prisma.pedido.findMany({
            where: {
                statusEnvio: 'ENVIAR'
            },
            select: {
                id: true,
                numero: true,
                statusEnvio: true,
                especial: true,
                clienteId: true
            },
            take: 10
        });

        console.log(`\n🎯 Candidatos para sincronização (statusEnvio='ENVIAR' + sem conta): ${candidatos.length}`);
        if (candidatos.length > 0) {
            candidatos.forEach(p => {
                console.log(`  Pedido ${p.numero} (${p.especial ? 'ESPECIAL' : 'NORMAL'}) - ID: ${p.id}`);
            });
        } else {
            console.log('  Nenhum candidato encontrado.');
            
            // Show a sample of all pedidos
            console.log('\n📋 Amostra de todos os pedidos na base (primeiros 10):');
            const sample = await prisma.pedido.findMany({
                select: {
                    numero: true,
                    statusEnvio: true,
                    especial: true,
                    dataVenda: true
                },
                take: 10,
                orderBy: { dataVenda: 'desc' }
            });
            sample.forEach(p => {
                console.log(`  Pedido #${p.numero}: statusEnvio=${p.statusEnvio}, especial=${p.especial}`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

checkPedidos();
