const axios = require('axios');
const prisma = require('../config/database');

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID || '6f6gpe5la4bvg6oehqjh2ugp97';
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET || '1fvmga9ikj9dk4mkctoqvm2nfna7ht2t60p2qmg7kq04le0gb1ls';

const contaAzulService = {
    // === AUTH HELPER ===
    getAccessToken: async (forceRefresh = false) => {
        // Enforce Single Tenant: Get the first config
        const config = await prisma.contaAzulConfig.findFirst();

        if (!config) {
            throw new Error('Conta Azul não conectada. Faça a autenticação no Painel.');
        }

        // Check expiration
        const now = new Date();
        const diffSeconds = (now - new Date(config.updatedAt)) / 1000;
        const TIME_TO_REFRESH = 3000; // 50 minutos de idade do token

        if (forceRefresh || diffSeconds > TIME_TO_REFRESH) {
            console.log(`🔄 Token ${forceRefresh ? 'INVÁLIDO' : 'EXPIRANDO'} (Idade: ${Math.floor(diffSeconds)}s). Renovando...`);
            try {
                const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
                // AJUSTE: Usando auth.contaazul.com (Legacy/Cognito)
                const response = await axios.post('https://auth.contaazul.com/oauth2/token',
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

                // CRITICAL: Salvar o NOVO refresh_token, pois o antigo é invalidado (Refresh Token Rotation)
                await prisma.contaAzulConfig.update({
                    where: { id: config.id },
                    data: {
                        accessToken: access_token,
                        refreshToken: refresh_token, // Rotation support
                        expiresIn: expires_in,
                        updatedAt: new Date() // Reset timer
                    }
                });

                console.log('✅ Token renovado com sucesso!');
                return access_token;

            } catch (error) {
                console.error('❌ FALHA CRÍTICA AO RENOVAR TOKEN:');
                console.error('Status:', error.response?.status);
                console.error('Data:', JSON.stringify(error.response?.data, null, 2));
                console.error('Message:', error.message);

                // Se falhar o refresh (ex: revogado), infelizmente o usuário precisa logar de novo.
                throw new Error('Sua sessão com a Conta Azul expirou e não pôde ser renovada. Por favor, conecte novamente no painel.');
            }
        }

        return config.accessToken;
    },

    // === OBS: Helper interno para API calls com Retry ===
    _axiosGet: async (url) => {
        let token = await contaAzulService.getAccessToken();
        try {
            return await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } });
        } catch (error) {
            if (error.response?.status === 401) {
                console.warn('⚠️ Token recusado (401). Tentando renovar e refazer request...');
                try {
                    token = await contaAzulService.getAccessToken(true); // Force Refresh
                    console.log('🔄 Token forçado com sucesso. Retentando request...');
                    return await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } });
                } catch (retryError) {
                    console.error('❌ Falha também na retentativa após refresh:', retryError.message);
                    throw retryError;
                }
            }
            throw error;
        }
    },

    // === API CALLS ===
    fetchProdutosFromAPI: async (lastSyncDate = null) => {
        console.log(`📥 Buscando produtos do Conta Azul... (Delta: ${lastSyncDate ? lastSyncDate.toISOString() : 'FULL'})`);
        let produtos = [];
        let page = 0;
        let hasMore = true;

        // Formatar data para ISO 8601 (São Paulo/GMT-3) se necessário, mas a API aceita ISO UTC
        const dataAlteracaoDe = lastSyncDate ? `&data_alteracao_de=${lastSyncDate.toISOString()}` : '';

        // Loop de paginação
        while (hasMore && page < 50) { // Aumentei limite safety
            try {
                // Endpoint real: GET /v1/products
                const url = `https://api.contaazul.com/v1/products?size=100&page=${page}${dataAlteracaoDe}`;
                // Usando helper com auto-retry
                const response = await contaAzulService._axiosGet(url);

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

    fetchClientesFromAPI: async (lastSyncDate = null) => {
        console.log(`📥 Buscando clientes do Conta Azul... (Delta: ${lastSyncDate ? lastSyncDate.toISOString() : 'FULL'})`);
        let clientes = [];
        let page = 0;
        let hasMore = true;

        const dataAlteracaoDe = lastSyncDate ? `&data_alteracao_de=${lastSyncDate.toISOString()}` : '';

        while (hasMore && page < 50) {
            try {
                // Endpoint real: GET /v1/customers
                const url = `https://api.contaazul.com/v1/customers?size=100&page=${page}${dataAlteracaoDe}`;
                // Usando helper com auto-retry
                const response = await contaAzulService._axiosGet(url);

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
            // Delta Sync Strategy
            const lastSuccessLog = await prisma.syncLog.findFirst({
                where: { tipo: 'PRODUTOS', status: 'SUCESSO' },
                orderBy: { dataHora: 'desc' }
            });

            // Se tiver sucesso anterior, usa a data dele menos um buffer de segurança (ex: 5 min)
            let lastDate = null;
            if (lastSuccessLog) {
                lastDate = new Date(lastSuccessLog.dataHora);
                lastDate.setMinutes(lastDate.getMinutes() - 10); // Buffer de 10 min
            }

            const produtosCA = await contaAzulService.fetchProdutosFromAPI(lastDate);
            let count = 0;

            for (const p of produtosCA) {
                // Mapeamento Real da API
                const dadosProduto = {
                    contaAzulId: p.id,
                    codigo: p.code || p.codigo_sku || '', // Fallbacks
                    nome: p.name || p.nome,
                    valorVenda: p.value || p.valor_venda || 0,
                    unidade: p.unity_measure || p.unidade_medida || 'UN',

                    // Estoques (API v1 pode vir campos diferentes ou objeto estoque)
                    estoqueDisponivel: p.available_stock || (p.estoque?.estoque_disponivel) || 0,
                    estoqueReservado: p.reserved_stock || (p.estoque?.quantidade_reservada) || 0,
                    estoqueTotal: p.total_stock || (p.estoque?.quantidade_total) || 0,
                    estoqueMinimo: p.min_stock || (p.estoque?.estoque_minimo) || 0,

                    // Detalhes
                    ean: p.ean_code || p.ean || p.codigo_ean,
                    status: p.status, // 'ACTIVE' or 'INACTIVE'
                    categoria: p.category_name || (p.categoria ? p.categoria.descricao : null),
                    descricao: p.description || p.descricao,
                    custoMedio: p.cost || p.custo_medio || 0,
                    pesoLiquido: p.net_weight || (p.pesos_dimensoes?.peso_liquido) || 0,

                    ativo: p.status === 'ACTIVE' || p.status === 'ativo' || p.status === 'ATIVO'
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
                data: { status: 'SUCESSO', mensagem: `Sync Produtos OK (Delta: ${!!lastDate})`, registrosProcessados: count, dataHora: new Date() }
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
            // Delta Sync Strategy
            const lastSuccessLog = await prisma.syncLog.findFirst({
                where: { tipo: 'CLIENTES', status: 'SUCESSO' },
                orderBy: { dataHora: 'desc' }
            });

            let lastDate = null;
            if (lastSuccessLog) {
                lastDate = new Date(lastSuccessLog.dataHora);
                lastDate.setMinutes(lastDate.getMinutes() - 10);
            }

            const clientesCA = await contaAzulService.fetchClientesFromAPI(lastDate);
            let count = 0;

            for (const c of clientesCA) {
                // Tratamento da Condição de Pagamento
                let condicaoId = null;
                const termName = c.payment_term || (c.condicao_pagamento ? c.condicao_pagamento : null); // Adaptação v1/v2

                if (termName) {
                    const condicao = await prisma.condicaoPagamento.upsert({
                        where: { nome: termName },
                        create: { nome: termName },
                        update: {}
                    }).catch(err => {
                        return prisma.condicaoPagamento.findUnique({ where: { nome: termName } });
                    });
                    condicaoId = condicao?.id;
                }

                // Mapeamento
                const dadosCliente = {
                    Nome: c.name || c.nome,
                    NomeFantasia: c.fantasy_name || c.nome_fantasia,
                    Tipo_Pessoa: c.person_type || c.tipo_pessoa,
                    Documento: c.document || c.documento,
                    Email: c.email,
                    Telefone: c.business_phone || c.telefone,
                    Telefone_Celular: c.mobile_phone || c.celular,
                    Ativo: c.status === 'ACTIVE' || c.status === 'ativo' || c.status === 'ATIVO',
                    Data_Criacao: c.created_at ? new Date(c.created_at) : new Date(),

                    Condicao_de_pagamento: condicaoId,

                    End_Logradouro: c.address?.street || c.endereco?.logradouro,
                    End_Numero: c.address?.number || c.endereco?.numero,
                    End_Complemento: c.address?.complement || c.endereco?.complemento,
                    End_Bairro: c.address?.neighborhood || c.endereco?.bairro,
                    // Cidade/Estado podem vir como objetos ou strings
                    End_Cidade: (c.address?.city?.name) || (c.address?.city) || (c.endereco?.cidade?.nome) || (c.endereco?.cidade),
                    End_Estado: (c.address?.state?.name) || (c.address?.state) || (c.endereco?.estado?.nome) || (c.endereco?.estado),
                    End_CEP: c.address?.zip_code || c.endereco?.cep,
                    End_Pais: 'Brasil',

                    Observacoes_Gerais: c.notes || c.observacoes,

                    Perfil_Filtro: "PADRAO",
                    updated_at: new Date()
                };

                // Upsert por Documento
                if (dadosCliente.Documento) {
                    await prisma.cliente.upsert({
                        where: { Documento: dadosCliente.Documento },
                        update: dadosCliente,
                        create: { ...dadosCliente }
                    });
                    count++;
                }
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'SUCESSO', mensagem: `Sync Clientes OK (Delta: ${!!lastDate})`, registrosProcessados: count, dataHora: new Date() }
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

    // === DIAGNOSTIC TOOL ===
    verifySyncProdutos: async () => {
        // Usando helper com auto-retry
        const url = 'https://api.contaazul.com/v1/products?size=5&sort=name';
        const response = await contaAzulService._axiosGet(url);

        const caProducts = response.data.products || response.data || [];
        const comparison = [];

        for (const caProd of caProducts) {
            const localProd = await prisma.produto.findUnique({
                where: { contaAzulId: caProd.id }
            });

            const caPrice = Number(caProd.value || caProd.valor_venda || 0).toFixed(2);
            const dbPrice = localProd ? Number(localProd.valorVenda).toFixed(2) : 'N/A';
            const dbStock = localProd ? Number(localProd.estoqueDisponivel).toFixed(3) : 'N/A';
            const status = localProd ? (caPrice === dbPrice ? 'OK' : 'DIFF') : 'MISSING';

            comparison.push({
                name: caProd.name || caProd.nome,
                ca_id: caProd.id,
                ca_price: caPrice,
                db_price: dbPrice,
                db_stock: dbStock,
                status: status
            });
        }
        return comparison;
    }
};

module.exports = contaAzulService;
