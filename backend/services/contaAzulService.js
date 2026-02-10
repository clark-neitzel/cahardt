const prisma = require('../config/database');

const contaAzulService = {
    // Simula busca na API do Conta Azul
    fetchProdutosFromAPI: async () => {
        // MOCK: Em produção, isso seria uma chamada axios para https://api.contaazul.com/v1/products
        return [
            {
                id: 'ca_prod_001',
                name: 'Coxinha de Frango',
                value: 5.50,
                code: 'SALG-001',
                available_stock: 150,
                unity_measure: 'UN'
            },
            {
                id: 'ca_prod_002',
                name: 'Risoles de Carne',
                value: 5.50,
                code: 'SALG-002',
                available_stock: 80,
                unity_measure: 'UN'
            },
            {
                id: 'ca_prod_003',
                name: 'Coca-Cola 350ml',
                value: 4.00,
                code: 'BEB-001',
                available_stock: 200,
                unity_measure: 'UN'
            }
        ];
    },

    syncProdutos: async () => {
        const log = await prisma.syncLog.create({
            data: {
                tipo: 'PRODUTOS',
                status: 'PROCESSANDO',
                registrosProcessados: 0
            }
        });

        try {
            const produtosCA = await contaAzulService.fetchProdutosFromAPI();
            let count = 0;

            for (const p of produtosCA) {
                // Upsert: Atualiza se existe, Cria se não existe
                await prisma.produto.upsert({
                    where: { contaAzulId: p.id },
                    update: {
                        nome: p.name,
                        precoVenda: p.value,
                        saldoEstoque: p.available_stock,
                        unidade: p.unity_measure,
                        updatedAt: new Date()
                        // NÃO atualizamos 'ativo' nem 'imagens' aqui para preservar config local
                    },
                    create: {
                        contaAzulId: p.id,
                        codigo: p.code,
                        nome: p.name,
                        precoVenda: p.value,
                        saldoEstoque: p.available_stock,
                        unidade: p.unity_measure,
                        ativo: true
                    }
                });
                count++;
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: {
                    status: 'SUCESSO',
                    mensagem: 'Sincronização concluída com sucesso.',
                    registrosProcessados: count,
                    dataHora: new Date()
                }
            });

            return { success: true, count };

        } catch (error) {
            console.error('Erro no Sync:', error);
            await prisma.syncLog.update({
                where: { id: log.id },
                data: {
                    status: 'ERRO',
                    mensagem: error.message,
                    dataHora: new Date()
                }
            });
            throw error;
        }
    }
};

module.exports = contaAzulService;
