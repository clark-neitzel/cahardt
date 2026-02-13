const axios = require('axios');
const prisma = require('../config/database');

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID || '6f6gpe5la4bvg6oehqjh2ugp97';
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET || '1fvmga9ikj9dk4mkctoqvm2nfna7ht2t60p2qmg7kq04le0gb1ls';

// Mutex simples para evitar race conditions no refresh
let isRefreshing = false;
let refreshPromise = null;

const contaAzulService = {
    // === LOGGING HELPER ===
    _logStep: async (tipo, status, msg, details = {}) => {
        try {
            const log = await prisma.syncLog.create({
                data: {
                    tipo,
                    status,
                    mensagem: msg,
                    registrosProcessados: details.count || 0,
                    requestUrl: details.url,
                    requestMethod: details.method,
                    responseStatus: details.status,
                    responseBody: details.body ? JSON.stringify(details.body).substring(0, 5000) : null, // Truncate safety
                    duration: details.duration
                }
            });
            return { id: log.id }; // Retorna ID para updates futuros
        } catch (error) {
            console.error('Falha ao salvar log:', error.message);
            return { id: null }; // Retorna null seguro
        }
    },

    // === AUTH HELPER (COM MUTEX & ROTATION SAFE) ===
    getAccessToken: async (forceRefresh = false) => {
        // Enforce Single Tenant
        const config = await prisma.contaAzulConfig.findFirst();

        if (!config) {
            throw new Error('Conta Azul não conectada. Faça a autenticação no Painel.');
        }

        const now = new Date();
        const diffSeconds = (now - new Date(config.updatedAt)) / 1000;
        const TIME_TO_REFRESH = 3000; // 50 minutos

        if (forceRefresh || diffSeconds > TIME_TO_REFRESH) {
            if (isRefreshing) {
                console.log('🔒 Refresh já em andamento, aguardando...');
                return await refreshPromise;
            }

            isRefreshing = true;
            console.log(`🔄 Token ${forceRefresh ? 'INVÁLIDO' : 'EXPIRANDO'}. Iniciando refresh seguro...`);

            refreshPromise = (async () => {
                try {
                    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
                    // VOLTA PARA AUTH MODERNO: auth.contaazul.com
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

                    // SAFE ROTATION: Só atualiza se vier um novo refresh_token
                    const newRefreshToken = refresh_token || config.refreshToken;

                    await prisma.contaAzulConfig.update({
                        where: { id: config.id },
                        data: {
                            accessToken: access_token,
                            refreshToken: newRefreshToken,
                            expiresIn: expires_in,
                            updatedAt: new Date()
                        }
                    });

                    await contaAzulService._logStep('AUTH', 'SUCESSO', 'Token renovado com sucesso', {
                        status: 200,
                        body: { expires_in, has_new_refresh: !!refresh_token }
                    });

                    console.log('✅ Token renovado com sucesso!');
                    return access_token;

                } catch (error) {
                    const status = error.response?.status;
                    const data = error.response?.data;

                    await contaAzulService._logStep('AUTH', 'ERRO', 'Falha na renovação do token', {
                        status,
                        body: data,
                        url: 'https://auth.contaazul.com/oauth2/token'
                    });

                    console.error('❌ FALHA CRÍTICA AO RENOVAR TOKEN:', data);
                    throw new Error('Sua sessão com a Conta Azul expirou. Reconecte no painel.');
                } finally {
                    isRefreshing = false;
                    refreshPromise = null;
                }
            })();

            return await refreshPromise;
        }

        return config.accessToken;
    },

    // === API CALL WRAPPER (LOGGING & RETRY) ===
    _axiosGet: async (url, resourceType = 'API') => {
        const start = Date.now();
        let token = await contaAzulService.getAccessToken();
        let attempts = 0;

        const executeRequest = async (tokenToUse) => {
            try {
                const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${tokenToUse}` } });

                // Log Sucesso (Apenas debug level ou sucesso crítico)
                // Não logar tudo para não spammar, apenas se necessário ou erro
                return response;
            } catch (error) {
                return Promise.reject(error);
            }
        };

        try {
            return await executeRequest(token);
        } catch (error) {
            if (error.response?.status === 401 && attempts === 0) {
                console.warn('⚠️ Token 401. Tentando refresh forçado...');
                attempts++;
                try {
                    token = await contaAzulService.getAccessToken(true);
                    return await executeRequest(token);
                } catch (retryError) {
                    // Log Final Failure
                    await contaAzulService._logStep(resourceType, 'ERRO', `Falha 401 persistente: ${url}`, {
                        url,
                        method: 'GET',
                        status: retryError.response?.status,
                        body: retryError.response?.data,
                        duration: Date.now() - start
                    });
                    throw retryError;
                }
            }

            // Log Other Failures
            await contaAzulService._logStep(resourceType, 'ERRO', `Falha requisição: ${url}`, {
                url,
                method: 'GET',
                status: error.response?.status,
                body: error.response?.data || error.message,
                duration: Date.now() - start
            });
            throw error;
        }
    },


    fetchProdutosFromAPI: async (lastSyncDate = null) => {
        return contaAzulService._fetchGeneric('PRODUTOS', lastSyncDate);
    },

    fetchClientesFromAPI: async (lastSyncDate = null) => {
        return contaAzulService._fetchGeneric('CLIENTES', lastSyncDate);
    },

    _fetchGeneric: async (resourceType, lastSyncDate = null) => {
        console.log(`📥 Buscando ${resourceType}...`);
        let items = [];
        let page = 0;
        let hasMore = true;
        const dataAlteracaoDe = lastSyncDate ? `&data_alteracao_de=${lastSyncDate.toISOString()}` : '';

        while (hasMore && page < 50) {
            try {
                // Endpoint selection
                let url = '';
                if (resourceType === 'PRODUTOS') {
                    // Full Sync: URL Corrigida (api-v2.contaazul.com) perante SKILL
                    url = `https://api-v2.contaazul.com/v1/produtos?pagina=${page + 1}&tamanho_pagina=20${dataAlteracaoDe}`;
                } else {
                    // CLIENTES: v2 usa /v1/pessoas (Padrão API v2)
                    // URL confirmada via pesquisa: https://api-v2.contaazul.com/v1/pessoas
                    url = `https://api-v2.contaazul.com/v1/pessoas?pagina=${page + 1}&tamanho_pagina=100${dataAlteracaoDe}`;
                    console.log(`🔎 [DEBUG] Requesting URL: ${url}`);
                }

                const response = await contaAzulService._axiosGet(url, resourceType);

                // PARSING ROBUSTO (API v2)
                let lista = response.data?.items || response.data || []; // Pode vir wrapped em items ou direto

                if (!Array.isArray(lista)) {
                    console.error(`⚠️ Formato inesperado na página ${page + 1}.`, lista);
                    // Se veio objeto mas sem items, pode ser 404 disfarçado ou erro
                    await contaAzulService._logStep(resourceType, 'ERRO', `Formato inválido: Não é array`, {
                        bodyPreview: JSON.stringify(response.data).substring(0, 500)
                    });
                    hasMore = false;
                    break;
                }

                if (lista.length === 0) {
                    hasMore = false;
                } else {
                    items = items.concat(lista);
                    console.log(`   - Página ${page + 1}: ${lista.length} itens.`);
                    page++;

                    // RATE LIMIT PROTECTION: Conta Azul 10 req/s
                    // Pausa de 1s para garantir segurança (Spike Arrest)
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Erro pág ${page + 1}:`, error.message);
                // 429 = Rate Limit (Too Many Requests) -> Esperar e Retentar? 
                // Por segurança no loop, abortamos.
                hasMore = false;
            }
        }
        return items;
    },

    syncProdutos: async () => {
        const log = await contaAzulService._logStep('PRODUTOS', 'INFO', 'Iniciando sincronização de produtos');

        try {
            const produtosAPI = await contaAzulService.fetchProdutosFromAPI();
            let count = 0;

            for (const p of produtosAPI) {
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

            if (log && log.id) {
                await prisma.syncLog.update({
                    where: { id: log.id },
                    data: { status: 'SUCESSO', mensagem: `Sync Produtos OK`, registrosProcessados: count, dataHora: new Date() }
                });
            }

            return { success: true, count };

        } catch (error) {
            console.error('Erro no Sync Produtos:', error);
            if (log && log.id) {
                await prisma.syncLog.update({
                    where: { id: log.id },
                    data: { status: 'ERRO', mensagem: error.message, dataHora: new Date() }
                });
            }
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
        // Usando helper com auto-retry e endpoint CORRETO
        const url = 'https://api-v2.contaazul.com/v1/produtos?tamanho_pagina=5';
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
