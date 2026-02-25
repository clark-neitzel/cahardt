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

        // PARAMETROS DE DATA (V2 exige start AND end)
        // CRITICAL FIX: Remover millisegundos e Z para evitar 500 Server Error
        let dateParams = '';

        // FORÇAR SYNC COMPLETO PARA CLIENTES (IGNORAR DATA)
        // O usuário reclamou que nada retornava. Delta Sync estava filtrando tudo.
        if (lastSyncDate && resourceType !== 'CLIENTES') {
            const now = new Date();
            const startStr = lastSyncDate.toISOString().split('.')[0];
            const endStr = now.toISOString().split('.')[0];
            dateParams = `&data_alteracao_de=${startStr}&data_alteracao_ate=${endStr}`;
        }

        while (hasMore && page < 50) {
            try {
                // Endpoint selection
                let url = '';
                if (resourceType === 'PRODUTOS') {
                    // Full Sync: URL Corrigida (api-v2.contaazul.com) perante SKILL
                    url = `https://api-v2.contaazul.com/v1/produtos?pagina=${page + 1}&tamanho_pagina=20${dateParams}`;
                } else {
                    // CLIENTES: v2 usa /v1/pessoas (Padrão API v2)
                    // Filtro tipo_perfil=Cliente (Title Case, conforme erro 400)
                    // URL confirmada via pesquisa: https://api-v2.contaazul.com/v1/pessoas
                    // FIX: Adicionado com_endereco=true para trazer dados de endereço na listagem
                    url = `https://api-v2.contaazul.com/v1/pessoas?pagina=${page + 1}&tamanho_pagina=100&tipo_perfil=Cliente&com_endereco=true${dateParams}`;
                    console.log(`🔎 [DEBUG] Requesting URL: ${url}`);
                }

                const response = await contaAzulService._axiosGet(url, resourceType);

                // PARSING ROBUSTO (API v2)
                // PARSING ROBUSTO (API v2)
                let lista = [];

                if (response.data && Array.isArray(response.data.items)) {
                    // Padrão v2: { items: [...] }
                    lista = response.data.items;
                } else if (Array.isArray(response.data)) {
                    // Padrão v1 antigo ou fallback: [...]
                    lista = response.data;
                } else if (response.data && typeof response.data === 'object') {
                    // Objeto sem items (ex: filtro não encontrou nada e retornou objeto vazio ou meta)
                    // Assumimos vazio se não tiver erro explícito
                    if (!response.data.error) {
                        lista = [];
                    }
                }

                if (!Array.isArray(lista)) {
                    console.error(`⚠️ Formato inesperado na página ${page + 1}.`, JSON.stringify(response.data));

                    // Log detalhadíssimo para o usuário ver o que retornou
                    await contaAzulService._logStep(resourceType, 'ERRO', `Formato inválido: Não é array`, {
                        bodyPreview: JSON.stringify(response.data, null, 2)
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
        const log = await contaAzulService._logStep('PRODUTOS', 'INFO', 'Iniciando sincronização incremental de produtos');

        try {
            const produtosAPI = await contaAzulService.fetchProdutosFromAPI();
            let countUpdated = 0;
            let countSkipped = 0;
            let countNew = 0;

            console.log(`📦 Total de produtos no CA: ${produtosAPI.length}`);

            // Buscar todos os produtos locais com suas datas de atualização
            const produtosLocais = await prisma.produto.findMany({
                select: {
                    contaAzulId: true,
                    contaAzulUpdatedAt: true
                }
            });

            // Criar mapa para lookup rápido
            const produtosLocaisMap = new Map(
                produtosLocais.map(p => [p.contaAzulId, p.contaAzulUpdatedAt])
            );

            console.log(`📊 Produtos locais: ${produtosLocais.length}`);


            for (const itemList of produtosAPI) {
                const ultimaAtualizacaoCA = itemList.ultima_atualizacao ? new Date(itemList.ultima_atualizacao) : null;
                const ultimaAtualizacaoLocal = produtosLocaisMap.get(itemList.id);

                // DEBUG: Log first product comparison
                if (countUpdated === 0 && countSkipped === 0 && countNew === 0) {
                    console.log('🔍 [DEBUG TIMESTAMP COMPARISON]');
                    console.log('   Produto:', itemList.nome);
                    console.log('   CA timestamp:', ultimaAtualizacaoCA);
                    console.log('   Local timestamp:', ultimaAtualizacaoLocal);
                    console.log('   CA getTime():', ultimaAtualizacaoCA?.getTime());
                    console.log('   Local getTime():', ultimaAtualizacaoLocal?.getTime());
                    console.log('   São iguais?:', ultimaAtualizacaoCA?.getTime() === ultimaAtualizacaoLocal?.getTime());
                }

                // Verificar se precisa atualizar
                const isNew = !ultimaAtualizacaoLocal;
                const needsUpdate = isNew || !ultimaAtualizacaoCA ||
                    (ultimaAtualizacaoCA && ultimaAtualizacaoLocal &&
                        ultimaAtualizacaoCA.getTime() !== ultimaAtualizacaoLocal.getTime());

                if (!needsUpdate) {
                    countSkipped++;
                    continue; // Pula este produto - está atualizado
                }

                // Produto novo ou desatualizado - buscar detalhes
                let p = itemList;
                try {
                    if (isNew) {
                        console.log(`   ✨ NOVO: ${itemList.nome}`);
                    } else {
                        console.log(`   🔄 ATUALIZADO: ${itemList.nome}`);
                    }

                    const responseDetalhe = await contaAzulService._axiosGet(`https://api-v2.contaazul.com/v1/produtos/${itemList.id}`, 'PRODUTO_DETALHE');
                    if (responseDetalhe.data) {
                        p = responseDetalhe.data;
                    }
                    // Rate Limit Safety
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (err) {
                    console.error(`Falha ao buscar detalhes do produto ${itemList.id}: ${err.message}`);
                }

                // Mapeamento Avançado (V2/V1 Fallbacks)
                // Baseado no JSON REAL: estoque é objeto, unidade está em fiscal ou raiz, custo está em estoque
                const estoqueObj = p.estoque || {};
                const fiscalObj = p.fiscal || {};
                const unidadeObj = p.unidade_medida || {};
                const unidadeFiscal = fiscalObj.unidade_medida || {};

                // Unidade: Tenta Fiscal > Raiz (Objeto) > Raiz (String) > Fallback
                const unidadeValor = unidadeFiscal.descricao || unidadeFiscal.codigo ||
                    unidadeObj.descricao || unidadeObj.codigo ||
                    (typeof p.unidade_medida === 'string' ? p.unidade_medida : 'UN');

                // DEBUG: Dump first product
                if (countUpdated === 0 && countNew === 0) {
                    console.log('📦 [DEBUG PRODUCT] Body:', JSON.stringify(p, null, 2));
                }

                // Mapeamento Real da API
                const dadosProduto = {
                    contaAzulId: p.id,
                    codigo: p.code || p.codigo_sku || '', // Fallbacks
                    nome: p.name || p.nome,
                    // CORRIGIDO: Valor de venda vem do objeto estoque
                    valorVenda: estoqueObj.valor_venda || p.value || p.valor_venda || p.price || p.sale_price || p.preco || 0,
                    unidade: unidadeValor.substring(0, 10), // Limit length just in case

                    // Estoques
                    estoqueDisponivel: estoqueObj.quantidade_disponivel || p.available_stock || p.saldo || 0,
                    estoqueReservado: estoqueObj.quantidade_reservada || p.reserved_stock || 0,
                    estoqueTotal: estoqueObj.quantidade_total || p.total_stock || p.saldo || 0,
                    // CORRIGIDO: Estoque mínimo vem de minimumStock
                    estoqueMinimo: estoqueObj.minimumStock || estoqueObj.estoque_minimo || p.min_stock || 0,

                    // Detalhes
                    ean: p.ean_code || p.ean || p.codigo_ean || '',
                    // ADICIONADO: NCM do fiscal
                    ncm: p.fiscal?.ncm?.codigo || '',
                    status: p.status,
                    categoria: p.categoria?.descricao || p.category_name || (p.categoria ? p.categoria.descricao : null) || '',
                    descricao: p.description || p.descricao || '',

                    // Custo Médio (Vem dentro do objeto estoque no JSON fornecido)
                    custoMedio: estoqueObj.custo_medio || p.cost || p.custo_medio || 0,

                    pesoLiquido: p.peso_liquido || p.net_weight || (p.pesos_dimensoes?.peso_liquido) || 0,

                    ativo: p.status === 'ACTIVE' || p.status === 'ativo' || p.status === 'ATIVO',

                    // Timestamp de atualização no Conta Azul
                    // IMPORTANTE: Usar o timestamp da LISTA, não dos detalhes, para garantir consistência
                    contaAzulUpdatedAt: itemList.ultima_atualizacao ? new Date(itemList.ultima_atualizacao) : null
                };

                await prisma.produto.upsert({
                    where: { contaAzulId: p.id },
                    update: {
                        nome: dadosProduto.nome,
                        codigo: dadosProduto.codigo,
                        valorVenda: dadosProduto.valorVenda,
                        unidade: dadosProduto.unidade,
                        estoqueDisponivel: dadosProduto.estoqueDisponivel,
                        estoqueReservado: dadosProduto.estoqueReservado,
                        estoqueTotal: dadosProduto.estoqueTotal,
                        estoqueMinimo: dadosProduto.estoqueMinimo,
                        ean: dadosProduto.ean,
                        ncm: dadosProduto.ncm,
                        status: dadosProduto.status,
                        categoria: dadosProduto.categoria,
                        descricao: dadosProduto.descricao,
                        custoMedio: dadosProduto.custoMedio,
                        pesoLiquido: dadosProduto.pesoLiquido,
                        ativo: dadosProduto.ativo,
                        contaAzulUpdatedAt: dadosProduto.contaAzulUpdatedAt,
                        updatedAt: new Date()
                    },
                    create: { ...dadosProduto }
                });

                if (isNew) {
                    countNew++;
                } else {
                    countUpdated++;
                }
            }

            console.log(`\n📊 Resumo da Sincronização:`);
            console.log(`   ✨ Novos: ${countNew}`);
            console.log(`   🔄 Atualizados: ${countUpdated}`);
            console.log(`   ⏭️  Ignorados (sem mudanças): ${countSkipped}`);
            console.log(`   📦 Total processado: ${produtosAPI.length}`);

            if (log && log.id) {
                await prisma.syncLog.update({
                    where: { id: log.id },
                    data: {
                        status: 'SUCESSO',
                        mensagem: `Sync OK - Novos: ${countNew}, Atualizados: ${countUpdated}, Ignorados: ${countSkipped}`,
                        registrosProcessados: countNew + countUpdated,
                        dataHora: new Date()
                    }
                });
            }

            return { success: true, countNew, countUpdated, countSkipped };

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
                const docRaw = c.document || c.documento;
                if (!docRaw) continue; // Ignora se não tem documento

                const dataAltRaw = c.data_alteracao || c.atualizado_em || c.updated_at || c.ultima_atualizacao;
                const ultimaAtualizacaoCA = dataAltRaw ? new Date(dataAltRaw) : null;

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
                // API v2 (Pessoas) retorna 'endereco' (objeto singular) no GET, mas 'enderecos' (array) no POST/Detalhes.
                // Ajuste: Verificar 'endereco' também.
                const enderecoPrincipal = (c.enderecos && c.enderecos.length > 0) ? c.enderecos[0] : (c.endereco || c.address || {});

                if (count === 0) {
                    console.log('🔎 [DEBUG MAPPING] Primeiro Cliente Raw:', JSON.stringify(c, null, 2));
                    console.log('🔎 [DEBUG MAPPING] Endereço Identificado:', JSON.stringify(enderecoPrincipal, null, 2));
                }

                // Mapeamento baseado no JSON real fornecido pelo usuário
                // Mapeamento baseado no JSON real fornecido pela API V2 /v1/pessoas
                // Em V2 Listagem, 'company_name' ou 'nome_empresa' pode não existir ou vir como 'name'.
                const razao = c.company_name || c.nome_empresa || c.razao_social;
                const fantasia = c.fantasy_name || c.nome_fantasia || c.nome || c.apelido;

                const dadosCliente = {
                    Nome: razao || fantasia || 'Desconhecido',
                    NomeFantasia: razao ? fantasia : null,

                    // Normalização: JURIDICA ou FISICA (para o frontend funcionar)
                    Tipo_Pessoa: (c.person_type || c.tipo_pessoa || '').toUpperCase().includes('JUR') ? 'JURIDICA' : 'FISICA',

                    Atrasos_Pagamentos: c.atrasos_pagamentos || 0,
                    Atrasos_Recebimentos: c.atrasos_recebimentos || 0,
                    Pagamentos_Mes_Atual: c.pagamentos_mes_atual || 0,
                    Recebimentos_Mes_Atual: c.recebimentos_mes_atual || 0,

                    Documento: c.document || c.documento,
                    Email: c.email,
                    Telefone: c.telefone_comercial || c.business_phone || c.telefone,
                    Telefone_Celular: c.telefone_celular || c.mobile_phone || c.celular,
                    Ativo: (c.ativo === true), // JSON confirma booleano
                    Data_Criacao: c.criado_em ? new Date(c.criado_em) : (c.created_at ? new Date(c.created_at) : new Date()),
                    Data_Alteracao: ultimaAtualizacaoCA,

                    // FIX: Mapeamento de Perfis (Array de Objetos -> JSON String)
                    Perfis: JSON.stringify(c.perfis || []),

                    Condicao_de_pagamento: condicaoId,

                    // Endereço (JSON confirma campos planos: logradouro, numero, bairro, cidade (string), estado (string))
                    End_Logradouro: enderecoPrincipal.logradouro || enderecoPrincipal.street,
                    End_Numero: enderecoPrincipal.numero || enderecoPrincipal.number,
                    End_Complemento: enderecoPrincipal.complemento || enderecoPrincipal.complement,
                    End_Bairro: enderecoPrincipal.bairro || enderecoPrincipal.neighborhood,
                    End_Cidade: enderecoPrincipal.cidade || enderecoPrincipal.city?.name || enderecoPrincipal.city,
                    End_Estado: enderecoPrincipal.estado || enderecoPrincipal.state?.name || enderecoPrincipal.state,
                    End_CEP: enderecoPrincipal.cep || enderecoPrincipal.zip_code,
                    End_Pais: enderecoPrincipal.pais || 'Brasil',
                    Observacoes_Gerais: c.notes || c.observacoes,

                    Perfil_Filtro: "PADRAO",
                    contaAzulUpdatedAt: ultimaAtualizacaoCA,
                    updated_at: new Date()
                };

                // Upsert por Documento
                if (dadosCliente.Documento) {
                    await prisma.cliente.upsert({
                        where: { Documento: dadosCliente.Documento },
                        update: dadosCliente,
                        create: { ...dadosCliente, UUID: c.id }
                    });
                    count++;
                }
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'SUCESSO', mensagem: `Sync Clientes OK. Atualizados: ${count}.`, registrosProcessados: count, dataHora: new Date() }
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

    // === VENDEDORES ===
    syncVendedores: async () => {
        const log = await prisma.syncLog.create({
            data: { tipo: 'VENDEDORES', status: 'EM_ANDAMENTO', mensagem: 'Iniciando sync de vendedores...' }
        });

        try {
            const config = await prisma.contaAzulConfig.findFirst();
            if (!config || !config.accessToken) {
                throw new Error('Conta Azul não conectada.');
            }

            console.log('📥 Buscando VENDEDORES...');
            const url = 'https://api-v2.contaazul.com/v1/venda/vendedores';

            // Usar _axiosGet se possível para tratar refresh, ou direto se for simples
            // Aqui usando axios direto para simplificar, mas idealmente usaria o helper de retry se existisse publicamente
            // Como _axiosGet é interno (mas acessível se definido no obj), vou usar axios direto seguindo padrão syncClientes
            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${config.accessToken}` }
            });

            const vendedores = response.data || [];
            console.log(`🔎 Encontrados ${vendedores.length} vendedores.`);

            let count = 0;
            for (const v of vendedores) {
                await prisma.vendedor.upsert({
                    where: { id: v.id },
                    update: {
                        nome: v.nome,
                        idLegado: v.id_legado ? String(v.id_legado) : null
                        // Preserva email e flex
                    },
                    create: {
                        id: v.id,
                        nome: v.nome,
                        idLegado: v.id_legado ? String(v.id_legado) : null,
                        email: null,
                        flexMensal: 0,
                        flexDisponivel: 0
                    }
                });
                count++;
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'SUCESSO', mensagem: `Vendedores sincronizados: ${count}`, registrosProcessados: count, dataHora: new Date() }
            });

            return { success: true, count };

        } catch (error) {
            console.error('Erro syncVendedores:', error);
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
    },

    // === PEDIDOS (VENDAS) INTEGRAÇÃO ===
    obterProximoNumeroPedido: async () => {
        try {
            // A API de próximo número freqüentemente retorna texto puro e pode falhar com JSON.parse nativo se não tratado pelo axios
            const url = 'https://api-v2.contaazul.com/v1/venda/proximo-numero';
            const response = await contaAzulService._axiosGet(url, 'PROX_NUMERO');
            // Pode vir como número literal ou objeto dependendo do endpoint. 
            // Historicamente a API v1 retornava texto. A v2 tenta retornar JSON, mas garante fallback:
            if (response.data && typeof response.data === 'object' && response.data.proximo_numero) {
                return Number(response.data.proximo_numero);
            }
            return Number(response.data);
        } catch (error) {
            console.error('Erro ao obter proximo numero:', error.message);
            throw error;
        }
    },

    buscarPedidoPorNumero: async (numero) => {
        try {
            // Busca venda por número pra garantir idempotência
            const url = `https://api-v2.contaazul.com/v1/venda/busca?numeros=${numero}`;
            const response = await contaAzulService._axiosGet(url, 'BUSCA_PEDIDO');
            if (response.data && Array.isArray(response.data) && response.data.length > 0) {
                return response.data[0]; // Retorna a primeira venda encontrada
            }
            return null;
        } catch (error) {
            console.error(`Erro ao buscar pedido ${numero}:`, error.message);
            return null; // Se der erro (ex: 404), assumir que não existe
        }
    },

    enviarPedido: async (payload) => {
        const start = Date.now();
        let token = await contaAzulService.getAccessToken();
        const url = 'https://api-v2.contaazul.com/v1/venda'; // POST to create Sale

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            await contaAzulService._logStep('PEDIDO_ENVIO', 'SUCESSO', `Venda ${payload.numero} enviada`, {
                url, method: 'POST', status: response.status,
                body: { id_venda: response.data?.id }, duration: Date.now() - start
            });

            return response.data; // Retorna os dados da venda criada (ex: { id: "..." })
        } catch (error) {
            let errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;

            await contaAzulService._logStep('PEDIDO_ENVIO', 'ERRO', `Falha ao enviar venda ${payload.numero}`, {
                url, method: 'POST', status: error.response?.status,
                body: error.response?.data || error.message, duration: Date.now() - start
            });

            throw new Error(`Erro na API Conta Azul: ${errorMsg}`);
        }
    },

    // Buscar Vendas Modificadas no Conta Azul (Sync Bidirecional)
    syncPedidosModificados: async () => {
        const log = await prisma.syncLog.create({
            data: { tipo: 'PEDIDOS_MODIFICADOS', status: 'EM_ANDAMENTO', mensagem: 'Iniciando rastreamento de modificações...' }
        });

        try {
            const token = await contaAzulService.getAccessToken();
            // Buscar vendas modificadas nos últimos 2 dias ou na última hora.
            // Para segurança na primeira rodada e evitar payload massivo: últimos 3 dias
            const diasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            // API V1 endpoint para buscar vendas por data de atualização
            const url = `https://api.contaazul.com/v1/vendas?data_atualizacao_inicial=${diasAtras}T00:00:00Z&size=50`;
            console.log(`🔎 Buscando Pedidos na CA: ${url}`);

            const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } });
            const vendasModificadas = response.data || [];
            console.log(`Encontradas ${vendasModificadas.length} vendas recentemente alteradas.`);

            let count = 0;
            for (const venda of vendasModificadas) {
                // Procurar pedido correspondente na base local
                const pedidoLocal = await prisma.pedido.findFirst({
                    where: {
                        OR: [
                            { idVendaContaAzul: venda.id },
                            { numero: venda.numero }
                        ]
                    },
                    include: { itens: true }
                });

                if (pedidoLocal) {
                    const dataAtualizacaoCA = venda.data_atualizacao ? new Date(venda.data_atualizacao) : new Date();
                    const ignorar = pedidoLocal.contaAzulUpdatedAt && pedidoLocal.contaAzulUpdatedAt.getTime() >= dataAtualizacaoCA.getTime();

                    if (!ignorar) {
                        const valorLocal = Number(pedidoLocal.itens.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0)).toFixed(2);
                        const valorCA = Number(venda.total || 0).toFixed(2);
                        const mudouValor = Math.abs(valorCA - valorLocal) > 0.05; // tolerância centavos

                        if (mudouValor || !pedidoLocal.contaAzulUpdatedAt) {
                            await prisma.pedido.update({
                                where: { id: pedidoLocal.id },
                                data: {
                                    revisaoPendente: true,
                                    contaAzulUpdatedAt: dataAtualizacaoCA
                                }
                            });
                            count++;
                        }
                    }
                }
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'SUCESSO', mensagem: `Modificações RASTREADAS. ${count} pedidos acenderam flag alerta.`, registrosProcessados: count, dataHora: new Date() }
            });

            return { success: true, count };
        } catch (error) {
            console.error('Erro syncPedidosModificados:', error);
            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'ERRO', mensagem: error.message, dataHora: new Date() }
            });
            throw error;
        }
    }
};

module.exports = contaAzulService;
