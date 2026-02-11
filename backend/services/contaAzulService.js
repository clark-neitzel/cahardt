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
    },
    // --- CLIENTES ---

    fetchClientesFromAPI: async () => {
        console.log("fetching clientes MOCK...");
        // Dados mockados baseados no padrão Conta Azul
        return [
            {
                id: "cli_001",
                name: "Padaria Doce Sabor Ltda",
                person_type: "JURIDICA",
                document: "12345678000199",
                email: "contato@docesabor.com",
                business_phone: "4733334444",
                mobile_phone: "47999998888",
                status: "ATIVO",
                created_at: "2023-01-15T10:00:00Z",
                address: {
                    street: "Rua das Flores",
                    number: "123",
                    complement: "Sala 01",
                    neighborhood: "Centro",
                    city: "Joinville",
                    state: "SC",
                    zip_code: "89200000"
                },
                notes: "Cliente preferencial, entrega pela manhã."
            },
            {
                id: "cli_002",
                name: "Mercado Silva",
                person_type: "JURIDICA",
                document: "98765432000155",
                email: "compras@mercadosilva.com.br",
                business_phone: "4733445566",
                status: "ATIVO",
                created_at: "2023-02-20T14:30:00Z",
                address: {
                    street: "Av. Getúlio Vargas",
                    number: "4500",
                    neighborhood: "Anita Garibaldi",
                    city: "Joinville",
                    state: "SC",
                    zip_code: "89202000"
                }
            },
            {
                id: "cli_003",
                name: "Café Colonial Fritz",
                person_type: "JURIDICA",
                document: "11222333000199",
                email: "fritz@cafe.com",
                status: "INATIVO",
                created_at: "2023-03-10T09:15:00Z",
                address: {
                    street: "Rua xv de Novembro",
                    number: "100",
                    city: "Blumenau",
                    state: "SC",
                    zip_code: "89010000"
                }
            },
            {
                id: "cli_004",
                name: "Lanchonete da Rodoviária",
                person_type: "JURIDICA",
                document: "55444333000111",
                email: null,
                status: "ATIVO",
                created_at: "2023-05-05T16:00:00Z",
                address: {
                    street: "Rua Paraíba",
                    number: "50",
                    neighborhood: "Victor Konder",
                    city: "Blumenau",
                    state: "SC",
                    zip_code: "89012000"
                }
            }
        ];
    },

    syncClientes: async () => {
        const log = await prisma.syncLog.create({
            data: {
                tipo: 'CLIENTES',
                status: 'PROCESSANDO',
                registrosProcessados: 0
            }
        });

        try {
            const clientesCA = await contaAzulService.fetchClientesFromAPI();
            let count = 0;

            for (const c of clientesCA) {
                // Mapeamento para o Schema Prisma (Campos Estritos)
                const dadosCliente = {
                    Nome: c.name,
                    Tipo_Pessoa: c.person_type,
                    Documento: c.document,
                    Email: c.email,
                    Telefone: c.business_phone,
                    Telefone_Celular: c.mobile_phone,
                    Ativo: c.status === 'ATIVO',
                    Data_Criacao: c.created_at ? new Date(c.created_at) : new Date(),

                    // Endereço
                    End_Logradouro: c.address?.street,
                    End_Numero: c.address?.number,
                    End_Complemento: c.address?.complement,
                    End_Bairro: c.address?.neighborhood,
                    End_Cidade: c.address?.city,
                    End_Estado: c.address?.state,
                    End_CEP: c.address?.zip_code,
                    End_Pais: 'Brasil',

                    Observacoes_Gerais: c.notes,

                    // Campos fixos ou calculados para o mock
                    Perfil_Filtro: "PADRAO",
                    updated_at: new Date()
                };

                // Upsert usando Documento (se existir) ou UUID gerado
                // Como UUID é PK e gerado pelo app, mas o sync vem de fora com ID do CA...
                // O schema diz UUID @id @default(uuid()). O ideal seria ter conta_azul_id, 
                // mas vamos usar o Documento como chave única de negócio para sincronizar se possível,
                // ou teríamos que adicionar conta_azul_id no schema de clientes.
                // Vendo o schema: Documento @unique. Vamos usar isso.

                if (c.document) {
                    await prisma.cliente.upsert({
                        where: { Documento: c.document },
                        update: dadosCliente, // Campos internos (GPS, Dias) não são alterados aqui
                        create: {
                            ...dadosCliente,
                            // UUID é gerado automaticamente pelo @default(uuid())
                        }
                    });
                    count++;
                } else {
                    console.warn(`Cliente ${c.name} sem documento, pulando sync.`);
                }
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: {
                    status: 'SUCESSO',
                    mensagem: 'Sincronização de Clientes concluída.',
                    registrosProcessados: count,
                    dataHora: new Date()
                }
            });

            return { success: true, count };

        } catch (error) {
            console.error('Erro no Sync Clientes:', error);
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
