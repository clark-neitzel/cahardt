const axios = require('axios');
const prisma = require('../config/database');

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID || '6f6gpe5la4bvg6oehqjh2ugp97';
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET || '1fvmga9ikj9dk4mkctoqvm2nfna7ht2t60p2qmg7kq04le0gb1ls';

const contaAzulService = {
    // === AUTH HELPER ===
    getAccessToken: async () => {
        // Enforce Single Tenant: Get the first config
        const config = await prisma.contaAzulConfig.findFirst();

        if (!config) {
            throw new Error('Conta Azul não conectada. Faça a autenticação no Painel.');
        }

        // Check expiration (Simples: se passou de 55 minutos da criação/update, atualiza)
        // O ideal é salvar expires_at, mas o expiresIn vem em segundos (geralmente 3600)
        const now = new Date();
        const diffSeconds = (now - new config.updatedAt) / 1000;

        // Se o token tem mais de 50 minutos (3000s), renova pra garantir
        if (diffSeconds > 3000) {
            console.log('🔄 Renovando Access Token Conta Azul...');
            try {
                const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
                const response = await axios.post('https://api.contaazul.com/oauth2/token',
                    new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: config.refreshToken
                    }).toString(),
                    {
                        headers: {
                            'Authorization': `Basic ${credentials}`,
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    }
                );

                const { access_token, refresh_token, expires_in } = response.data;

                // Atualiza no banco
                await prisma.contaAzulConfig.update({
                    where: { id: config.id },
                    data: {
                        accessToken: access_token,
                        refreshToken: refresh_token, // O refresh token também gira as vezes
                        expiresIn: expires_in
                    }
                });

                return access_token;
            } catch (error) {
                console.error('❌ Erro ao renovar token:', error.response?.data || error.message);
                throw new Error('Falha ao renovar token. Reconecte o Conta Azul.');
            }
        }

        return config.accessToken;
    },

    // === API CALLS ===
    fetchProdutosFromAPI: async () => {
        console.log("📥 Buscando produtos do Conta Azul...");
        const token = await contaAzulService.getAccessToken();
        let produtos = [];
        let page = 0;
        let hasMore = true;

        // Loop de paginação (Safety limit 20 pages)
        while (hasMore && page < 20) {
            try {
                // Endpoint real: GET /v1/products
                const response = await axios.get(`https://api.contaazul.com/v1/products?size=100&page=${page}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = response.data; // Pode ser array direto ou objeto com lista
                const lista = Array.isArray(data) ? data : (data.products || []);

                if (lista.length === 0) {
                    hasMore = false;
                } else {
                    produtos = produtos.concat(lista);
                    console.log(`   - Página ${page}: ${lista.length} produtos.`);
                    page++;
                }
            } catch (error) {
                console.error(`Erro ao buscar página ${page} de produtos:`, error.response?.data || error.message);
                hasMore = false;
            }
        }

        return produtos;
    },

    fetchClientesFromAPI: async () => {
        console.log("📥 Buscando clientes do Conta Azul...");
        const token = await contaAzulService.getAccessToken();
        let clientes = [];
        let page = 0;
        let hasMore = true;

        while (hasMore && page < 20) {
            try {
                // Endpoint real: GET /v1/customers
                const response = await axios.get(`https://api.contaazul.com/v1/customers?size=100&page=${page}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = response.data;
                const lista = Array.isArray(data) ? data : (data.customers || []);

                if (lista.length === 0) {
                    hasMore = false;
                } else {
                    clientes = clientes.concat(lista);
                    console.log(`   - Página ${page}: ${lista.length} clientes.`);
                    page++;
                }
            } catch (error) {
                console.error(`Erro ao buscar página ${page} de clientes:`, error.response?.data || error.message);
                hasMore = false;
            }
        }

        return clientes;
    },

    // === SYNC LOGIC (Mantida igual, só chamando os fetches acima) ===
    syncProdutos: async () => {
        const log = await prisma.syncLog.create({
            data: { tipo: 'PRODUTOS', status: 'PROCESSANDO', registrosProcessados: 0 }
        });

        try {
            const produtosCA = await contaAzulService.fetchProdutosFromAPI();
            let count = 0;

            for (const p of produtosCA) {
                // Mapeamento Real da API
                const dadosProduto = {
                    contaAzulId: p.id,
                    codigo: p.code,
                    nome: p.name,
                    valorVenda: p.value || 0,
                    unidade: p.unity_measure || 'UN',

                    // Estoques
                    estoqueDisponivel: p.available_stock || 0,
                    estoqueReservado: 0, // A API simples não retorna detalhado as vezes
                    estoqueTotal: p.available_stock || 0,
                    estoqueMinimo: 0,

                    // Detalhes
                    ean: p.ean_code || p.ean, // verificar nome exato na doc
                    status: p.status, // 'ACTIVE' or 'INACTIVE'
                    categoria: p.category_name || (p.category ? p.category.name : null),
                    descricao: p.description,
                    custoMedio: p.cost || 0,
                    pesoLiquido: p.net_weight || 0,

                    ativo: p.status === 'ACTIVE' || p.status === 'ativo'
                };

                await prisma.produto.upsert({
                    where: { contaAzulId: p.id },
                    update: {
                        nome: dadosProduto.nome,
                        valorVenda: dadosProduto.valorVenda,
                        unidade: dadosProduto.unidade,
                        estoqueDisponivel: dadosProduto.estoqueDisponivel,
                        estoqueTotal: dadosProduto.estoqueTotal,
                        status: dadosProduto.status,
                        categoria: dadosProduto.categoria,
                        descricao: dadosProduto.descricao,
                        ativo: dadosProduto.ativo,
                        updatedAt: new Date()
                    },
                    create: { ...dadosProduto }
                });
                count++;
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'SUCESSO', mensagem: 'Sync Produtos OK', registrosProcessados: count, dataHora: new Date() }
            });

            return { success: true, count };
        } catch (error) {
            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'ERRO', mensagem: error.message, dataHora: new Date() }
            });
            throw error;
        }
    },

    syncClientes: async () => {
        const log = await prisma.syncLog.create({
            data: { tipo: 'CLIENTES', status: 'PROCESSANDO', registrosProcessados: 0 }
        });

        try {
            const clientesCA = await contaAzulService.fetchClientesFromAPI();
            let count = 0;

            for (const c of clientesCA) {
                // Tratamento da Condição de Pagamento
                let condicaoId = null;
                // A API real retorna payment_term como objeto ou string dependendo da versão
                // Assumindo string ou objeto.name
                const termName = c.payment_term ? (typeof c.payment_term === 'string' ? c.payment_term : c.payment_term.name) : null;

                if (termName) {
                    const condicao = await prisma.condicaoPagamento.upsert({
                        where: { nome: termName }, // Onde o nome é unico
                        create: { nome: termName },
                        update: {}
                    }).catch(err => {
                        // Race condition ignore
                        return prisma.condicaoPagamento.findUnique({ where: { nome: termName } });
                    });
                    condicaoId = condicao?.id;
                }

                // Mapeamento
                const dadosCliente = {
                    Nome: c.name,
                    NomeFantasia: c.fantasy_name,
                    Tipo_Pessoa: c.person_type, // 'LEGAL' / 'NATURAL'
                    Documento: c.document,
                    Email: c.email,
                    Telefone: c.business_phone,
                    Telefone_Celular: c.mobile_phone,
                    Ativo: c.status === 'ACTIVE' || c.status === 'ativo',
                    Data_Criacao: c.created_at ? new Date(c.created_at) : new Date(),

                    Condicao_de_pagamento: condicaoId,

                    End_Logradouro: c.address?.street,
                    End_Numero: c.address?.number,
                    End_Complemento: c.address?.complement,
                    End_Bairro: c.address?.neighborhood,
                    End_Cidade: c.address?.city ? c.address.city.name : null, // A API retorna cidade como objeto as vezes
                    End_Estado: c.address?.state ? c.address.state.name : null,
                    End_CEP: c.address?.zip_code,
                    End_Pais: 'Brasil',

                    Observacoes_Gerais: c.notes,

                    Perfil_Filtro: "PADRAO",
                    updated_at: new Date()
                };

                // Correção Cidades/Estados se vier string direta
                if (!dadosCliente.End_Cidade && c.address?.city && typeof c.address.city === 'string') dadosCliente.End_Cidade = c.address.city;
                if (!dadosCliente.End_Estado && c.address?.state && typeof c.address.state === 'string') dadosCliente.End_Estado = c.address.state;


                // Upsert por Documento
                if (c.document) {
                    await prisma.cliente.upsert({
                        where: { Documento: c.document },
                        update: dadosCliente,
                        create: { ...dadosCliente }
                    });
                    count++;
                }
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'SUCESSO', mensagem: 'Sync Clientes OK', registrosProcessados: count, dataHora: new Date() }
            });

            return { success: true, count };

        } catch (error) {
            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'ERRO', mensagem: error.message, dataHora: new Date() }
            });
            throw error;
        }
    }
};

module.exports = contaAzulService;
