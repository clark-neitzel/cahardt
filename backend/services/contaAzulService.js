const prisma = require('../config/database');

const contaAzulService = {
    // Simula busca na API do Conta Azul
    fetchProdutosFromAPI: async () => {
        // MOCK: Em produção, isso seria uma chamada axios para https://api.contaazul.com/v1/products
        console.log("fetching produtos MOCK...");
        return [
            {
                id: "a7396475-2759-4386-b26f-5322815b6a7e",
                name: "1-G-COXINHA AIPIM FRANGO C/20 130GR",
                code: "1",
                ean: "789123456001",
                value: 53.30,
                available_stock: 112, // Estoque disponível
                reserved_stock: 10,  // Reservado
                total_stock: 122,    // Total
                min_stock: 20,
                unity_measure: "UN",
                status: "ativo",
                category: "Salgados Congelados",
                average_cost: 35.50,
                net_weight: 2.6,
                description: "Coxinha de aipim com recheio de frango, congelada, pacote com 20 unidades de 130g."
            },
            {
                id: "030bfa5e-e7b4-434d-aaab-bd1833056c74",
                name: "1-G-COXINHA TRADICIONAL FRANGO C/20 130GR",
                code: "3059",
                value: 54.50,
                available_stock: 120,
                reserved_stock: 0,
                total_stock: 120,
                min_stock: 30,
                unity_measure: "UN",
                status: "ativo",
                category: "Salgados Congelados",
                average_cost: 36.00,
                net_weight: 2.6,
                description: "Coxinha tradicional de frango, massa de trigo, congelada."
            },
            // ... (outros produtos apenas com campos essenciais para brevidade do mock, mas o código aguenta undefined) ...
            { id: "b4d36edf-88b1-4b97-953a-a2464785428e", name: "1-G-EMPANADO SALSICHA C/10 140GR", code: "3078", value: 39.18, available_stock: 145, unity_measure: "UN", status: "ativo" },
            { id: "163a28e9-7233-4085-9016-804c2790d73a", name: "1-GG-COXINHA FRANGO C/10 170GR", code: "5151", value: 40.29, available_stock: 165, unity_measure: "UN", status: "ativo" },
            { id: "65158d61-d0fe-48ab-b39e-4236ad8d3d7f", name: "1-G-[O]-EMPANADO SALSICHA C/10 140GR", code: "5544", value: 35.28, available_stock: 24, unity_measure: "UN", status: "inativo" }
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
                const dadosProduto = {
                    contaAzulId: p.id,
                    codigo: p.code,
                    nome: p.name,
                    valorVenda: p.value || 0,
                    unidade: p.unity_measure,

                    // Estoques
                    estoqueDisponivel: p.available_stock || 0,
                    estoqueReservado: p.reserved_stock || 0,
                    estoqueTotal: p.total_stock || (p.available_stock || 0), // Fallback se não vier total
                    estoqueMinimo: p.min_stock || 0,

                    // Detalhes
                    ean: p.ean,
                    status: p.status,
                    categoria: p.category,
                    descricao: p.description,
                    custoMedio: p.average_cost,
                    pesoLiquido: p.net_weight,

                    // Calculado
                    ativo: p.status === 'ativo'
                };

                // Upsert: Atualiza se existe, Cria se não existe
                await prisma.produto.upsert({
                    where: { contaAzulId: p.id },
                    update: {
                        nome: dadosProduto.nome,
                        valorVenda: dadosProduto.valorVenda,
                        unidade: dadosProduto.unidade,

                        estoqueDisponivel: dadosProduto.estoqueDisponivel,
                        estoqueReservado: dadosProduto.estoqueReservado,
                        estoqueTotal: dadosProduto.estoqueTotal,
                        estoqueMinimo: dadosProduto.estoqueMinimo,

                        ean: dadosProduto.ean,
                        status: dadosProduto.status,
                        categoria: dadosProduto.categoria,
                        descricao: dadosProduto.descricao,
                        custoMedio: dadosProduto.custoMedio,
                        pesoLiquido: dadosProduto.pesoLiquido,
                        ativo: dadosProduto.ativo, // User pediu para atualizar status/ativo

                        updatedAt: new Date()
                        // NÃO atualizamos 'imagens' para preservar config local
                    },
                    create: {
                        ...dadosProduto
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
