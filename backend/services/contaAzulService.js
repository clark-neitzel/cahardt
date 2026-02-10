const prisma = require('../config/database');

const contaAzulService = {
    // Simula busca na API do Conta Azul
    fetchProdutosFromAPI: async () => {
        // MOCK: Em produção, isso seria uma chamada axios para https://api.contaazul.com/v1/products
        // DADOS REAIS FORNECIDOS PELO USUÁRIO
        return [
            { id: "a7396475-2759-4386-b26f-5322815b6a7e", name: "1-G-COXINHA AIPIM FRANGO C/20 130GR", code: "1", value: 53.30, available_stock: 112, unity_measure: "UN" },
            { id: "030bfa5e-e7b4-434d-aaab-bd1833056c74", name: "1-G-COXINHA TRADICIONAL FRANGO C/20 130GR", code: "3059", value: 54.50, available_stock: 120, unity_measure: "UN" },
            { id: "b4d36edf-88b1-4b97-953a-a2464785428e", name: "1-G-EMPANADO SALSICHA C/10 140GR", code: "3078", value: 39.18, available_stock: 145, unity_measure: "UN" },
            { id: "163a28e9-7233-4085-9016-804c2790d73a", name: "1-GG-COXINHA FRANGO C/10 170GR", code: "5151", value: 40.29, available_stock: 165, unity_measure: "UN" },
            { id: "65158d61-d0fe-48ab-b39e-4236ad8d3d7f", name: "1-G-[O]-EMPANADO SALSICHA C/10 140GR", code: "5544", value: 35.28, available_stock: 24, unity_measure: "UN" },
            { id: "fdebd8b9-b5b5-4974-acd7-a72e2d8b7b7d", name: "1-G-RISOLES CARNE C/10 140GR", code: "3063", value: 28.46, available_stock: 82, unity_measure: "UN" },
            { id: "34571b82-2738-4d2d-8200-17a16a6611f0", name: "1-G-RISOLES PIZZA C/10 140GR", code: "3062", value: 28.46, available_stock: 72, unity_measure: "UN" },
            { id: "68d1c232-a246-41c9-8680-515902324f7a", name: "2-FR-BOLINHO DE CARNE C/10", code: "3065", value: 71.50, available_stock: 59, unity_measure: "UN" },
            { id: "6c91e31b-dfc1-435a-a2a0-d569a584e35d", name: "2-FR-EMPANADO SALSICHA C/10 140GR", code: "3079", value: 46.68, available_stock: 12, unity_measure: "UN" },
            { id: "1b02de61-5507-4149-9338-81fafa1473df", name: "2-FR-ESPETINHO FRANGO C/BAC. C/10", code: "3333", value: 71.50, available_stock: 56, unity_measure: "UN" },
            { id: "7ff8bae1-57b7-4bad-bb8b-07840c339029", name: "2-FR-G-COXINHA-AIPIM-FRANGO C/20 130GR", code: "3051", value: 59.35, available_stock: 55, unity_measure: "UN" },
            { id: "4fabcc3f-6af0-4021-8087-a91b2b48c402", name: "2-FR-GG-COXINHA FRANGO C/10 170GR", code: "5182", value: 45.58, available_stock: 100, unity_measure: "UN" },
            { id: "c161cfd2-8b3b-4416-8e22-8b4cb4117976", name: "2-FR-M-COXINHA FRANGO C/AIPIM C/30 60GR", code: "5023", value: 50.10, available_stock: 66, unity_measure: "UN" },
            { id: "ccacc0e0-9127-44de-9790-16ce8801ea56", name: "2-FR-M-COXINHA KIBE C/20 75GR", code: "5592", value: 56.91, available_stock: 5, unity_measure: "UN" },
            { id: "b109b753-b260-4e71-8336-05d17f18fd5c", name: "2-FR-M-COXINHA LING.BLUMEN.C/30 65GR", code: "5298", value: 57.61, available_stock: 16, unity_measure: "UN" },
            { id: "7bc47f82-1c49-4d5a-a92b-853b3f9a3ac2", name: "2-FR-RISOLES DE CARNE C/10", code: "3069", value: 40.29, available_stock: 17, unity_measure: "UN" },
            { id: "580a6d50-ca00-480d-ad00-9fa1086fdf9e", name: "2-FR-RISOLES DE PIZZA C/10", code: "3070", value: 40.29, available_stock: 5, unity_measure: "UN" },
            { id: "ceee06ba-71ed-46a8-bdd3-669b006b22ce", name: "3-DOGUINHO 2.SALSICHAS C/08 220GR", code: "3086", value: 52.83, available_stock: 138, unity_measure: "UN" },
            { id: "ce8f0c71-80ac-46ad-a734-bf923739abd9", name: "3-ENROLADINHO CALABRESA C/08 140GR", code: "5200", value: 45.32, available_stock: 132, unity_measure: "UN" },
            { id: "996950ce-92dd-41b1-8d68-6eefbf00dd32", name: "3-ENROLADINHO FRANGO C/08 140GR", code: "3088", value: 37.69, available_stock: 85, unity_measure: "UN" },
            { id: "86d31905-2439-4bd8-a698-6d625a532feb", name: "3-ENROLADINHO PIZZA C/08 140GR", code: "3272", value: 37.69, available_stock: 48, unity_measure: "UN" },
            { id: "8c3bfd1e-0c9c-4ae4-bb91-3e8375deb3ef", name: "3-HAMBURGAO CHEEDAR/CEBOLA C/05 280GR", code: "3087", value: 43.28, available_stock: 92, unity_measure: "UN" },
            { id: "094ef19e-b26c-4cd7-84d5-afa0f8bfb620", name: "4-MINI BOCADINHO DE PALMITO C/50 30GR", code: "3084", value: 34.08, available_stock: 227, unity_measure: "UN" },
            { id: "a75d7667-60f6-4917-944a-37d7e52a11cc", name: "4-MINI BOLINHA DE QUEIJO C/50 30GR", code: "3082", value: 34.08, available_stock: 94, unity_measure: "UN" },
            { id: "64b36251-b076-43ab-9693-9966ef2c0ce7", name: "4-MINI CHURROS DOCE LEITE C/50 30GR", code: "4091", value: 34.08, available_stock: 128, unity_measure: "UN" },
            { id: "7faa9f2d-4b9d-452e-bfae-ac824502ec34", name: "4-MINI COXINHA FRANGO C/50 30GR", code: "3081", value: 34.08, available_stock: 265, unity_measure: "UN" }
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
