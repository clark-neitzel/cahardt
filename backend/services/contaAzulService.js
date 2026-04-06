const axios = require('axios');
const prisma = require('../config/database');

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID || '6f6gpe5la4bvg6oehqjh2ugp97';
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET || '1fvmga9ikj9dk4mkctoqvm2nfna7ht2t60p2qmg7kq04le0gb1ls';

// Mutex simples para evitar race conditions no refresh
let isRefreshing = false;
let refreshPromise = null;

/**
 * Converte uma string de data do Conta Azul ("YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm:ss")
 * para um Date UTC correto considerando o fuso BRT (America/Sao_Paulo, -03:00).
 * Sem isso, new Date("2026-04-01") vira 31/03 às 21h BRT.
 */
const parseDateCA = (str) => {
    if (!str) return null;
    // Se já tem hora (ISO completo), usa diretamente
    if (str.length > 10) return new Date(str);
    // Apenas "YYYY-MM-DD" — interpreta como meia-noite BRT (offset -03:00)
    return new Date(`${str}T00:00:00-03:00`);
};

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
                    const credentials = Buffer.from(`${process.env.CA_CLIENT_ID || CLIENT_ID}:${process.env.CA_CLIENT_SECRET || CLIENT_SECRET}`).toString('base64');
                    // CONFIGURAÇÃO OBRIGATÓRIA PARA COGNITO: auth.contaazul.com com Basic Auth no Header
                    // A API antiga (api.contaazul.com) retorna invalid_client para novas contas
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
        console.log("📥 Buscando produtos ATIVOS...");
        const ativos = await contaAzulService._fetchGeneric('PRODUTOS', lastSyncDate, 'ATIVO');
        console.log("📥 Buscando produtos INATIVOS...");
        const inativos = await contaAzulService._fetchGeneric('PRODUTOS', lastSyncDate, 'INATIVO');
        return [...ativos, ...inativos];
    },

    fetchClientesFromAPI: async (lastSyncDate = null) => {
        return contaAzulService._fetchGeneric('CLIENTES', lastSyncDate);
    },

    _fetchGeneric: async (resourceType, lastSyncDate = null, status = null) => {
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
                    const statusParam = status ? `&status=${status}` : '';
                    url = `https://api-v2.contaazul.com/v1/produtos?pagina=${page + 1}&tamanho_pagina=20${statusParam}${dateParams}`;
                } else {
                    // CLIENTES: v2 usa /v1/pessoas (Padrão API v2)
                    // Filtro tipo_perfil=Cliente (Title Case, conforme erro 400)
                    // URL confirmada via pesquisa: https://api.contaazul.com/v1/pessoas
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
                // TRATAMENTO DA RAZÃO SOCIAL (API V2 NÃO RETORNA 'nome_empresa' NA LISTA)
                // Vamos buscar o detalhe apenas se o cliente for PJ e (for novo, ou CA atualizou, ou local está sem Razão)
                let detalheC = c;
                const tipoPessoa = (c.person_type || c.tipo_pessoa || '').toUpperCase().includes('JUR') ? 'JURIDICA' : 'FISICA';

                if (docRaw) {
                    const localCLI = await prisma.cliente.findUnique({ where: { Documento: docRaw } });
                    const caDate = ultimaAtualizacaoCA ? ultimaAtualizacaoCA.getTime() : 0;
                    const localDate = localCLI?.contaAzulUpdatedAt ? localCLI.contaAzulUpdatedAt.getTime() : 0;

                    // Busca detalhe se: cliente novo, mudou no CA, ou nunca buscou detalhe antes
                    const nuncaBuscouDetalhe = localCLI && !localCLI.contaAzulUpdatedAt;
                    if (!localCLI || caDate > localDate || nuncaBuscouDetalhe) {
                        try {
                            const urlDet = `https://api-v2.contaazul.com/v1/pessoas/${c.id}`; // V2 is required for Cognito JWT Auth
                            const resDet = await contaAzulService._axiosGet(urlDet, 'CLIENTES_DETALHE');
                            if (resDet && resDet.data) {
                                detalheC = resDet.data;
                            }
                            await new Promise(r => setTimeout(r, 200)); // Rate limit 5req/s
                        } catch (e) {
                            console.error(`⚠️ Erro ao buscar detalhe do Cliente ${c.id}:`, e.message);
                        }
                    } else {
                        // Reutilizar dados locais já validados para economizar requisições
                        detalheC.nome_empresa = localCLI.Nome;
                        detalheC.nome = localCLI.NomeFantasia;
                        // Preservar telefones locais (lista CA não retorna telefone_celular)
                        detalheC.telefone_celular = localCLI.Telefone_Celular || detalheC.telefone_celular;
                        detalheC.telefone_comercial = localCLI.Telefone || detalheC.telefone_comercial;
                    }
                }

                // Mapeamento EXATO conforme regra ditada pelo usuário:
                // nome_empresa = Razão Social (Sempre tem)
                // nome = Fantasia (Pode ter ou não)
                const razao = detalheC.nome_empresa || detalheC.company_name || detalheC.razao_social;
                const fantasia = detalheC.nome || detalheC.fantasy_name || detalheC.nome_fantasia || detalheC.apelido;

                const dadosCliente = {
                    Nome: razao || fantasia || 'Desconhecido',
                    NomeFantasia: (fantasia && fantasia !== razao) ? fantasia : null, // Se for igual à Razão ou ausente, fica null

                    // Normalização: JURIDICA ou FISICA (para o frontend funcionar)
                    Tipo_Pessoa: (c.person_type || c.tipo_pessoa || '').toUpperCase().includes('JUR') ? 'JURIDICA' : 'FISICA',

                    Atrasos_Pagamentos: c.atrasos_pagamentos || 0,
                    Atrasos_Recebimentos: c.atrasos_recebimentos || 0,
                    Pagamentos_Mes_Atual: c.pagamentos_mes_atual || 0,
                    Recebimentos_Mes_Atual: c.recebimentos_mes_atual || 0,

                    Documento: c.document || c.documento,
                    Email: detalheC.email || c.email,
                    Telefone: detalheC.telefone_comercial || detalheC.business_phone || detalheC.telefone || c.telefone_comercial || c.business_phone || c.telefone,
                    Telefone_Celular: detalheC.telefone_celular || detalheC.mobile_phone || detalheC.celular || c.telefone_celular || c.mobile_phone || c.celular,
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
                    contaAzulUpdatedAt: ultimaAtualizacaoCA || new Date(),
                    updated_at: new Date()
                };

                // Upsert por Documento
                // Campos definidos apenas no App (não sobrescrever no update)
                const { Condicao_de_pagamento, ...dadosUpdate } = dadosCliente;
                if (dadosCliente.Documento) {
                    await prisma.cliente.upsert({
                        where: { Documento: dadosCliente.Documento },
                        update: dadosUpdate,
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

    atualizarPedido: async (idVenda, payload) => {
        const start = Date.now();
        const url = `https://api-v2.contaazul.com/v1/venda/${idVenda}`;
        let token = await contaAzulService.getAccessToken();
        let attempts = 0;

        const executeRequest = async (tokenToUse) => {
            return await axios.put(url, payload, {
                headers: {
                    'Authorization': `Bearer ${tokenToUse}`,
                    'Content-Type': 'application/json'
                }
            });
        };

        try {
            const response = await executeRequest(token);
            await contaAzulService._logStep('PEDIDO_UPDATE', 'SUCESSO', `Venda ${idVenda} atualizada`, {
                url,
                method: 'PUT',
                status: response.status,
                body: { id_venda: idVenda },
                duration: Date.now() - start
            });
            return response.data;
        } catch (error) {
            if (error.response?.status === 401 && attempts === 0) {
                attempts++;
                token = await contaAzulService.getAccessToken(true);
                try {
                    const retryResponse = await executeRequest(token);
                    await contaAzulService._logStep('PEDIDO_UPDATE', 'SUCESSO', `Venda ${idVenda} atualizada (retry 401)`, {
                        url,
                        method: 'PUT',
                        status: retryResponse.status,
                        body: { id_venda: idVenda },
                        duration: Date.now() - start
                    });
                    return retryResponse.data;
                } catch (retryError) {
                    await contaAzulService._logStep('PEDIDO_UPDATE', 'ERRO', `Falha ao atualizar venda ${idVenda}`, {
                        url,
                        method: 'PUT',
                        status: retryError.response?.status,
                        body: retryError.response?.data || retryError.message,
                        duration: Date.now() - start
                    });
                    const retryMsg = retryError.response?.data ? JSON.stringify(retryError.response.data) : retryError.message;
                    throw new Error(`Erro na API Conta Azul (PUT venda ${idVenda}): ${retryMsg}`);
                }
            }

            await contaAzulService._logStep('PEDIDO_UPDATE', 'ERRO', `Falha ao atualizar venda ${idVenda}`, {
                url,
                method: 'PUT',
                status: error.response?.status,
                body: error.response?.data || error.message,
                duration: Date.now() - start
            });
            const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            throw new Error(`Erro na API Conta Azul (PUT venda ${idVenda}): ${errorMsg}`);
        }
    },

    atualizarIndicadorIECliente: async (idCliente, payload) => {
        const start = Date.now();
        const url = `https://api-v2.contaazul.com/v1/pessoas/${idCliente}`;
        let token = await contaAzulService.getAccessToken();
        let attempts = 0;

        const executeRequest = async (tokenToUse) => {
            return await axios.patch(url, payload, {
                headers: {
                    'Authorization': `Bearer ${tokenToUse}`,
                    'Content-Type': 'application/json'
                }
            });
        };

        try {
            const response = await executeRequest(token);
            await contaAzulService._logStep('CLIENTE_PATCH', 'SUCESSO', `Cliente ${idCliente} atualizado`, {
                url,
                method: 'PATCH',
                status: response.status,
                body: payload,
                duration: Date.now() - start
            });
            return response.data;
        } catch (error) {
            if (error.response?.status === 401 && attempts === 0) {
                attempts++;
                token = await contaAzulService.getAccessToken(true);
                try {
                    const retryResponse = await executeRequest(token);
                    await contaAzulService._logStep('CLIENTE_PATCH', 'SUCESSO', `Cliente ${idCliente} atualizado (retry 401)`, {
                        url,
                        method: 'PATCH',
                        status: retryResponse.status,
                        body: payload,
                        duration: Date.now() - start
                    });
                    return retryResponse.data;
                } catch (retryError) {
                    await contaAzulService._logStep('CLIENTE_PATCH', 'ERRO', `Falha PATCH cliente ${idCliente}`, {
                        url,
                        method: 'PATCH',
                        status: retryError.response?.status,
                        body: retryError.response?.data || retryError.message,
                        duration: Date.now() - start
                    });
                    const retryMsg = retryError.response?.data ? JSON.stringify(retryError.response.data) : retryError.message;
                    throw new Error(`Erro na API Conta Azul (PATCH cliente ${idCliente}): ${retryMsg}`);
                }
            }

            await contaAzulService._logStep('CLIENTE_PATCH', 'ERRO', `Falha PATCH cliente ${idCliente}`, {
                url,
                method: 'PATCH',
                status: error.response?.status,
                body: error.response?.data || error.message,
                duration: Date.now() - start
            });
            const errorMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
            throw new Error(`Erro na API Conta Azul (PATCH cliente ${idCliente}): ${errorMsg}`);
        }
    },

    // Rotina exclusiva para V2: A V2 simplesmente "esconde" pedidos deletados da busca geral.
    // Precisamos pingar ativamente os pedidos locais "RECEBIDO" para ver se retornam 404 (Excluídos).
    _verificarPedidosExcluidosContAzul: async () => {
        try {
            // Cooldown de 4h para pedidos já confirmados (APROVADO).
            const cooldownLimite = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 horas atrás

            // === PRIORIDADE 1: Pedidos sem retorno do CA ou em rascunho (EM_ABERTO) ===
            // Sem cooldown — ficam sempre na frente da fila até serem APROVADOS ou FATURADOS.
            const pedidosPrioritarios = await prisma.pedido.findMany({
                where: {
                    statusEnvio: 'RECEBIDO',
                    idVendaContaAzul: { not: null },
                    OR: [
                        { situacaoCA: null },
                        { situacaoCA: 'EM_ABERTO' }
                    ]
                },
                orderBy: { createdAt: 'asc' }, // Mais antigos primeiro
                take: 20
            });

            // === PRIORIDADE 2: Pedidos APROVADO fora do cooldown (rotação normal) ===
            const idsPrioritarios = pedidosPrioritarios.map(p => p.id);
            const vagasRestantes = 20 - pedidosPrioritarios.length;

            let pedidosNormais = [];
            if (vagasRestantes > 0) {
                pedidosNormais = await prisma.pedido.findMany({
                    where: {
                        statusEnvio: 'RECEBIDO',
                        idVendaContaAzul: { not: null },
                        // Pula pedidos já em estágio final (não mudam mais) para poupar varredura
                        situacaoCA: { notIn: ['FATURADO', 'EMITIDO', 'CANCELADO'] },
                        ...(idsPrioritarios.length > 0 ? { id: { notIn: idsPrioritarios } } : {}),
                        OR: [
                            { contaAzulUpdatedAt: null },
                            { contaAzulUpdatedAt: { lt: cooldownLimite } }
                        ]
                    },
                    orderBy: { contaAzulUpdatedAt: 'asc' },
                    take: vagasRestantes
                });
            }

            // Merge: prioritários primeiro, depois normais
            const pedidosLocaisAtivos = [...pedidosPrioritarios, ...pedidosNormais];
            if (pedidosPrioritarios.length > 0) {
                console.log(`[GARBAGE COLLECTOR] ⚡ ${pedidosPrioritarios.length} pedido(s) SEM retorno CA na frente da fila.`);
            }

            console.log(`[GARBAGE COLLECTOR] Iniciando varredura em ${pedidosLocaisAtivos.length} pedidos marcados como RECEBIDO.`);
            if (!pedidosLocaisAtivos.length) return 0;

            let deletadosCount = 0;
            let token = await contaAzulService.getAccessToken();

            for (const local of pedidosLocaisAtivos) {
                try {
                    const url = `https://api-v2.contaazul.com/v1/venda/${local.idVendaContaAzul}`;
                    const resCA = await axios.get(url, { headers: { 'Authorization': `Bearer ${token}` } });

                    // 200 OK: pedido existe no CA. Verificar situacao.
                    // IMPORTANTE: GET /venda/{id} retorna estrutura DIFERENTE do endpoint de busca:
                    // Busca  → { situacao: { nome: "APROVADO" } }
                    // GET ID → { venda: { situacao: { nome: "APROVADO" } }, vendedor: {...} }
                    const vendaObj = resCA.data?.venda || resCA.data; // fallback para compatibilidade
                    const situacaoRaw = vendaObj?.situacao;
                    let situacaoNome = (typeof situacaoRaw === 'object' ? situacaoRaw?.nome : situacaoRaw) || vendaObj?.status || null;

                    // Detectar FATURADO: CA retorna "APROVADO" mas se tem parcelas, é faturado
                    if (situacaoNome === 'APROVADO' && vendaObj?.parcelas && vendaObj.parcelas.length > 0) {
                        situacaoNome = 'FATURADO';
                        console.log(`💲 [GARBAGE COLLECTOR] Pedido #${local.numero} diagnosticado como FATURADO (parcelas presentes).`);
                    } else {
                        console.log(`[GARBAGE COLLECTOR] ✅ Venda #${local.numero} (CA ${local.idVendaContaAzul}) → CA situacao: ${situacaoNome || 'n/d'}`);
                    }

                    if (!situacaoNome || situacaoNome === 'CANCELADO') {
                        // sem situacao = pedido excluído do CA via interface (soft-delete: API retorna 200 mas sem status)
                        // CANCELADO = cancelado explicitamente no CA
                        const motivoExclusao = situacaoNome === 'CANCELADO' ? 'CANCELADO no CA' : 'excluído do CA (sem situação)';
                        await prisma.pedido.update({
                            where: { id: local.id },
                            data: {
                                statusEnvio: 'EXCLUIDO',
                                situacaoCA: situacaoNome || 'EXCLUIDO',
                                revisaoPendente: true,
                                contaAzulUpdatedAt: new Date()
                            }
                        });
                        console.log(`🗑️ Pedido #${local.numero} marcado como EXCLUIDO (${motivoExclusao})`);
                        deletadosCount++;
                    } else if (situacaoNome !== local.situacaoCA) {
                        // CA relatou um status diferente do que temos salvo localmente (ex: APROVADO -> FATURADO)
                        // Isso é comum para pedidos antigos que saíram da fila de modificações recentes.
                        await prisma.pedido.update({
                            where: { id: local.id },
                            data: {
                                situacaoCA: situacaoNome,
                                contaAzulUpdatedAt: new Date() // Atualiza → sai da fila de cooldown
                            }
                        });
                        console.log(`🔄 [GARBAGE COLLECTOR] Pedido #${local.numero} corrigido: ${local.situacaoCA} → ${situacaoNome}`);
                        // Se transitou para FATURADO, deduzir estoque
                        if (situacaoNome === 'FATURADO' && local.situacaoCA !== 'FATURADO') {
                            try {
                                const estoqueService = require('./estoqueService');
                                await estoqueService.faturarPedido(local.id);
                                console.log(`📦 [GARBAGE COLLECTOR] Estoque faturado para pedido #${local.numero}`);
                            } catch (eFat) {
                                console.error(`[GARBAGE COLLECTOR] Erro ao faturar estoque pedido #${local.numero}:`, eFat.message);
                            }
                        }
                    } else {
                        // Pedido está OK (situação local = CA). Atualizar timestamp para sair do topo
                        // da fila e permitir que pedidos novos sejam verificados no próximo ciclo.
                        await prisma.pedido.update({
                            where: { id: local.id },
                            data: { contaAzulUpdatedAt: new Date() }
                        });
                    }

                } catch (error) {
                    if (error.response && error.response.status === 401) {
                        // Token expirou: tentar refresh e continuar
                        console.warn('[GARBAGE COLLECTOR] 401 - Token expirado, tentando refresh...');
                        try {
                            token = await contaAzulService.getAccessToken(true);
                        } catch (_) {
                            console.error('[GARBAGE COLLECTOR] Falha no refresh de token. Abortando varredura.');
                            break;
                        }
                        continue; // Vai tentar o próximo pedido com o novo token
                    }

                    const statusCA = error.response ? error.response.status : 'SEM_STATUS';
                    const erroAviso = error.response ? JSON.stringify(error.response.data) : error.message;
                    console.log(`[GARBAGE COLLECTOR] ❌ Venda #${local.numero} (CA: ${local.idVendaContaAzul}) → Status: ${statusCA} | Detalhe: ${erroAviso}`);

                    // 404 = Excluído definitivamente | 400 = ID V1 legado rejeitado (também trata como excluído)
                    if (statusCA === 404 || statusCA === 400) {
                        try {
                            await prisma.pedido.update({
                                where: { id: local.id },
                                data: {
                                    statusEnvio: 'EXCLUIDO',
                                    situacaoCA: 'EXCLUIDO',
                                    revisaoPendente: true, // Alerta visual: "Pedido excluído no CA"
                                    contaAzulUpdatedAt: new Date()
                                }
                            });
                            console.log(`🗑️ Pedido #${local.numero} marcado como EXCLUIDO (${statusCA} no CA)`);
                            deletadosCount++;
                        } catch (updateErr) {
                            console.error(`Falha ao marcar EXCLUIDO no BD: ${updateErr.message}`);
                        }
                    }
                }

                // 200ms de delay para respeitar rate limit da CA
                await new Promise(r => setTimeout(r, 200));
            }

            return deletadosCount;

        } catch (error) {
            console.error('Erro na rotina de verificação de excluídos (V2):', error.message);
            return 0;
        }
    },

    // Buscar Vendas Modificadas no Conta Azul (Sync Bidirecional)
    syncPedidosModificados: async () => {
        const log = await prisma.syncLog.create({
            data: { tipo: 'PEDIDOS_MODIFICADOS', status: 'EM_ANDAMENTO', mensagem: 'Iniciando rastreamento de modificações...' }
        });

        try {
            // Buscar vendas modificadas nos últimos 2 dias ou na última hora.
            // Ampliando para últimos 10 dias para garantir que pegamos o pedido BROTHAUS antigo do screenshot
            const diasAtrasDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const dataAtualDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

            // Formatação Exata (YYYY-MM-DDTHH:mm:ss) exigida pela API V2, mas ignorando horas fracionadas para evitar corte fuso horário
            const diasAtras = `${diasAtrasDate}T00:00:00`;
            const dataAtual = `${dataAtualDate}T23:59:59`;

            // API V2 Endpoint oficial para buscar vendas — paginar até esgotar resultados
            // Busca em duas passadas: sem filtro (ativas/aprovadas) + situacao=CANCELADO
            const buscarPaginas = async (baseUrl) => {
                const resultados = [];
                let pagina = 1;
                let totalPaginas = 1;
                while (pagina <= totalPaginas && pagina <= 20) {
                    const url = `${baseUrl}&pagina=${pagina}`;
                    console.log(`🔎 Buscando Pedidos na CA (pág ${pagina}/${totalPaginas}): ${url}`);
                    const response = await contaAzulService._axiosGet(url, 'PEDIDOS_MODIFICADOS');
                    const itens = response.data?.itens || [];
                    resultados.push(...itens);
                    const totalItens = response.data?.total_itens || response.data?.totalItens || 0;
                    const tamPag = response.data?.tamanho_pagina || 50;
                    totalPaginas = totalItens > 0 ? Math.ceil(totalItens / tamPag) : 1;
                    if (itens.length < tamPag) break;
                    pagina++;
                    await new Promise(r => setTimeout(r, 120));
                }
                return resultados;
            };

            const baseUrl = `https://api-v2.contaazul.com/v1/venda/busca?data_alteracao_de=${diasAtras}&data_alteracao_ate=${dataAtual}&tamanho_pagina=50`;
            const baseUrlCancelados = `${baseUrl}&situacao=CANCELADO`;

            const [vendasAtivas, vendasCanceladas] = await Promise.all([
                buscarPaginas(baseUrl),
                buscarPaginas(baseUrlCancelados)
            ]);

            // Merge sem duplicatas (pelo id da venda CA)
            const mapaVendas = new Map();
            for (const v of vendasAtivas) mapaVendas.set(v.id, v);
            for (const v of vendasCanceladas) mapaVendas.set(v.id, v); // cancelados sobrescrevem se duplicado
            const vendasModificadas = [...mapaVendas.values()];
            console.log(`Encontradas ${vendasModificadas.length} vendas recentemente alteradas (${vendasAtivas.length} ativas + ${vendasCanceladas.length} canceladas).`);

            let count = 0;
            for (const venda of vendasModificadas) {
                // Procurar pedido correspondente na base local
                // PRIORIDADE 1: Match exato pelo CA ID (sem ambiguidade)
                let pedidoLocal = await prisma.pedido.findFirst({
                    where: { idVendaContaAzul: venda.id },
                    include: { itens: true }
                });

                // PRIORIDADE 2: Fallback por numero, MAS somente se o pedido local ainda NÃO tem CA id
                // Isso evita bater num pedido de teste que tem o mesmo numero mas CA id diferente
                if (!pedidoLocal && venda.numero) {
                    pedidoLocal = await prisma.pedido.findFirst({
                        where: {
                            numero: venda.numero,
                            idVendaContaAzul: null // Nunca foi enviado ao CA ainda
                        },
                        include: { itens: true }
                    });
                }
                if (pedidoLocal) {
                    // API V2 usa "data_alteracao", não "data_atualizacao"
                    const dataAtualizacaoCA = venda.data_alteracao ? new Date(venda.data_alteracao) : (venda.data_atualizacao ? new Date(venda.data_atualizacao) : new Date());

                    // Lógica solicitada pelo usuário para Pedidos Excluídos/Cancelados
                    // API V2 envia situacao como um Objeto: { "nome": "CANCELADO", "descricao": "Cancelado" }
                    const isCanceladoV2 = venda.situacao?.nome === 'CANCELADO' || venda.status === 'DELETED';

                    // === RESTAURAÇÃO: pedido marcado EXCLUIDO localmente mas CA diz que está ATIVO ===
                    // Pode ocorrer quando o GC rodou com bug e marcou erroneamente como excluído.
                    if (pedidoLocal.statusEnvio === 'EXCLUIDO' && !isCanceladoV2) {
                        await prisma.pedido.update({
                            where: { id: pedidoLocal.id },
                            data: {
                                statusEnvio: 'RECEBIDO',
                                situacaoCA: venda.situacao?.nome || null,
                                revisaoPendente: true, // Sinaliza ao vendedor que houve movimentação
                                contaAzulUpdatedAt: dataAtualizacaoCA
                            }
                        });
                        console.log(`🔄 [Sync CA] Pedido #${pedidoLocal.numero} RESTAURADO: EXCLUIDO → RECEBIDO (CA: ${venda.situacao?.nome})`);
                        count++;
                        continue;
                    }

                    if (isCanceladoV2) {
                        if (pedidoLocal.statusEnvio !== 'EXCLUIDO') {
                            await prisma.pedido.update({
                                where: { id: pedidoLocal.id },
                                data: {
                                    statusEnvio: 'EXCLUIDO',
                                    situacaoCA: venda.situacao?.nome || 'CANCELADO',
                                    contaAzulUpdatedAt: dataAtualizacaoCA
                                }
                            });
                            console.log(`🗑️ Pedido Local ${pedidoLocal.id} marcado como EXCLUIDO (Refletindo CA)`);
                            count++;
                        }
                        continue;
                    }

                    const ignorar = pedidoLocal.contaAzulUpdatedAt && pedidoLocal.contaAzulUpdatedAt.getTime() >= dataAtualizacaoCA.getTime();

                    // Mesmo se timestamp não mudou, re-checar parcelas para pedidos APROVADO
                    // porque faturamento no CA nem sempre atualiza data_alteracao
                    const forcarCheckFaturamento = ignorar && venda.situacao?.nome === 'APROVADO' && pedidoLocal.situacaoCA === 'APROVADO';

                    // Debug: logar pedidos APROVADO para rastrear faturamento
                    if (venda.situacao?.nome === 'APROVADO' && pedidoLocal.situacaoCA !== 'FATURADO') {
                        console.log(`🔍 [Sync Debug] Pedido #${pedidoLocal.numero}: CA=${venda.situacao?.nome}, Local=${pedidoLocal.situacaoCA}, ignorar=${ignorar}, forcar=${forcarCheckFaturamento}`);
                    }

                    if (!ignorar || forcarCheckFaturamento) {
                        const isAprovado = venda.situacao?.nome === 'APROVADO';
                        let situacaoFinal = venda.situacao?.nome || 'ABERTO';

                        // Descobre se "Aprovado" não é na verdade "Faturado" 
                        // Através de uma requisição detalhada para ver se existem parcelas (financeiro).
                        if (isAprovado) {
                            try {
                                const tokenFetch = await contaAzulService.getAccessToken();
                                const urlDet = `https://api-v2.contaazul.com/v1/venda/${venda.id}`;
                                const resDet = await axios.get(urlDet, { headers: { 'Authorization': `Bearer ${tokenFetch}` } });
                                const vendaDetalhada = resDet.data?.venda || resDet.data;

                                const temParcelas = vendaDetalhada && vendaDetalhada.parcelas && vendaDetalhada.parcelas.length > 0;
                                console.log(`🔍 [Sync Debug] Pedido #${pedidoLocal.numero}: parcelas=${vendaDetalhada?.parcelas?.length || 0}, temParcelas=${temParcelas}`);
                                if (temParcelas) {
                                    situacaoFinal = 'FATURADO';
                                    console.log(`💲 [Sync CA] Pedido #${pedidoLocal.numero} diagnosticado como FATURADO (parcelas presentes).`);
                                }
                            } catch (eDet) {
                                console.error(`⚠️ [Sync CA] Erro ao buscar detalhes da venda #${pedidoLocal.numero} para check de Faturamento:`, eDet.message);
                            }
                        }

                        // Check values divergence
                        const valorLocal = Number(pedidoLocal.itens.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0)).toFixed(2);
                        const valorCA = Number(venda.total || 0).toFixed(2);
                        const mudouValor = Math.abs(valorCA - valorLocal) > 0.05; // tolerância centavos

                            if (isAprovado && !mudouValor) {
                                // Se foi aprovado sem diferença de valor, podemos remover o alerta
                                if (pedidoLocal.revisaoPendente || pedidoLocal.situacaoCA !== situacaoFinal || (venda.data && parseDateCA(venda.data).getTime() !== new Date(pedidoLocal.dataVenda).getTime())) {
                                    await prisma.pedido.update({
                                        where: { id: pedidoLocal.id },
                                        data: {
                                            revisaoPendente: false,
                                            situacaoCA: situacaoFinal,
                                            contaAzulUpdatedAt: dataAtualizacaoCA,
                                            ...(venda.data ? { dataVenda: parseDateCA(venda.data) } : {})
                                        }
                                    });
                                    // Se transitou para FATURADO, deduzir estoque
                                    if (situacaoFinal === 'FATURADO' && pedidoLocal.situacaoCA !== 'FATURADO') {
                                        try {
                                            const estoqueService = require('./estoqueService');
                                            await estoqueService.faturarPedido(pedidoLocal.id);
                                            console.log(`📦 [Sync CA] Estoque faturado para pedido #${pedidoLocal.numero}`);
                                        } catch (eFat) {
                                            console.error(`[Sync CA] Erro ao faturar estoque pedido #${pedidoLocal.numero}:`, eFat.message);
                                        }
                                    }
                                }
                            } else if (mudouValor || !pedidoLocal.contaAzulUpdatedAt || pedidoLocal.situacaoCA !== situacaoFinal || (venda.data && parseDateCA(venda.data).getTime() !== new Date(pedidoLocal.dataVenda).getTime())) {
                            // Houve diferença de valor, mudança de status ou é a primeira sincronização

                            if (mudouValor) {
                                // === ATUALIZAÇÃO COMPLETA: buscar itens reais do CA e substituir localmente ===
                                console.log(`🔄 [Sync CA] Pedido #${pedidoLocal.numero} com valor divergente (local: ${valorLocal}, CA: ${valorCA}). Buscando itens do CA...`);
                                try {
                                    const tokenSync = await contaAzulService.getAccessToken();
                                    const resItens = await axios.get(
                                        `https://api-v2.contaazul.com/v1/venda/${venda.id}/itens?pagina=1&tamanho_pagina=100`,
                                        { headers: { 'Authorization': `Bearer ${tokenSync}` } }
                                    );
                                    const itensCA = resItens.data?.itens || [];

                                    if (itensCA.length > 0) {
                                        // Montar novos itens — cada item do CA tem id_item (CA UUID do produto)
                                        const novosItens = [];
                                        for (const itemCA of itensCA) {
                                            // Tentar encontrar produto local pelo CA UUID
                                            const produtoLocal = await prisma.produto.findFirst({
                                                where: { contaAzulId: itemCA.id_item }
                                            });
                                            const valorBase = produtoLocal ? Number(produtoLocal.valorVenda) : Number(itemCA.valor);
                                            novosItens.push({
                                                produtoId: produtoLocal?.id || null,
                                                descricao: itemCA.nome || itemCA.descricao || 'Produto CA',
                                                quantidade: Number(itemCA.quantidade),
                                                valor: Number(itemCA.valor),
                                                valorBase: valorBase,
                                                flexGerado: (Number(itemCA.valor) - valorBase) * Number(itemCA.quantidade)
                                            });
                                        }

                                        // Substituir itens locais pelos do CA dentro de uma transação
                                        await prisma.$transaction(async (tx) => {
                                            await tx.pedidoItem.deleteMany({ where: { pedidoId: pedidoLocal.id } });
                                            await tx.pedido.update({
                                                where: { id: pedidoLocal.id },
                                                data: {
                                                    numero: venda.numero || pedidoLocal.numero,
                                                    revisaoPendente: true,
                                                    situacaoCA: situacaoFinal,
                                                    contaAzulUpdatedAt: dataAtualizacaoCA,
                                                    ...(venda.data ? { dataVenda: parseDateCA(venda.data) } : {}),
                                                    itens: { create: novosItens }
                                                }
                                            });
                                        });
                                        console.log(`✅ [Sync CA] Pedido #${pedidoLocal.numero} atualizado com ${novosItens.length} itens do CA.`);
                                        count++;
                                    } else {
                                        // Sem itens retornados pelo CA — só atualiza status
                                        await prisma.pedido.update({
                                            where: { id: pedidoLocal.id },
                                            data: {
                                                revisaoPendente: true,
                                                situacaoCA: situacaoFinal,
                                                contaAzulUpdatedAt: dataAtualizacaoCA,
                                                ...(venda.data ? { dataVenda: parseDateCA(venda.data) } : {})
                                            }
                                        });
                                        count++;
                                    }
                                } catch (erroFetchItens) {
                                    console.error(`[Sync CA] Erro ao buscar itens do pedido #${pedidoLocal.numero}: ${erroFetchItens.message}`);
                                    // Fallback: só atualiza status
                                    await prisma.pedido.update({
                                        where: { id: pedidoLocal.id },
                                        data: {
                                            revisaoPendente: true,
                                            situacaoCA: situacaoFinal,
                                            contaAzulUpdatedAt: dataAtualizacaoCA,
                                            ...(venda.data ? { dataVenda: parseDateCA(venda.data) } : {})
                                        }
                                    });
                                    count++;
                                }
                            } else {
                                // Apenas mudança de status, data ou primeira sync — sem divergência de valor
                                await prisma.pedido.update({
                                    where: { id: pedidoLocal.id },
                                    data: {
                                        revisaoPendente: false,
                                        situacaoCA: situacaoFinal,
                                        contaAzulUpdatedAt: dataAtualizacaoCA,
                                        ...(venda.data ? { dataVenda: parseDateCA(venda.data) } : {})
                                    }
                                });
                                count++;
                            }
                        }

                    }
                } else {
                    // === IMPORTAÇÃO DE PEDIDO ÓRFÃO ===
                    // Pedido existe no CA mas não existe localmente (ex: foi apagado do banco local).
                    console.log(`[Sync CA] Pedido #${venda.numero} (CA ID: ${venda.id}) existe no CA mas não localmente. Importando...`);

                    try {
                        // Buscar o cliente local pelo UUID do CA (que é o mesmo UUID local)
                        let clienteLocal = await prisma.cliente.findUnique({
                            where: { UUID: venda.cliente?.id }
                        });

                        // Fallback: cliente sem documento pode ter sido pulado no sync → buscar no CA e criar
                        if (!clienteLocal && venda.cliente?.id) {
                            console.log(`[Sync CA] Cliente ${venda.cliente.nome} não encontrado localmente. Buscando no CA...`);
                            try {
                                const resCliente = await contaAzulService._axiosGet(
                                    `https://api-v2.contaazul.com/v1/pessoas/${venda.cliente.id}`,
                                    'CLIENTE_IMPORT'
                                );
                                const c = resCliente.data;
                                if (c) {
                                    const enderecoC = c.endereco || c.enderecos?.[0] || {};
                                    clienteLocal = await prisma.cliente.upsert({
                                        where: { UUID: c.id },
                                        update: { Nome: c.nome_empresa || c.nome || venda.cliente.nome, contaAzulUpdatedAt: new Date(), updated_at: new Date() },
                                        create: {
                                            UUID: c.id,
                                            Nome: c.nome_empresa || c.nome || venda.cliente.nome,
                                            NomeFantasia: c.nome || null,
                                            Documento: c.documento || null,
                                            Tipo_Pessoa: (c.tipo_pessoa || '').toUpperCase().includes('JUR') ? 'JURIDICA' : 'FISICA',
                                            Ativo: c.ativo !== false,
                                            Perfis: JSON.stringify(c.perfis || ['Cliente']),
                                            Perfil_Filtro: 'PADRAO',
                                            End_Logradouro: enderecoC.logradouro || null,
                                            End_Numero: enderecoC.numero || null,
                                            End_Cidade: enderecoC.cidade || null,
                                            End_Estado: enderecoC.estado || null,
                                            End_CEP: enderecoC.cep || null,
                                            End_Pais: enderecoC.pais || 'Brasil',
                                            contaAzulUpdatedAt: new Date(),
                                            updated_at: new Date()
                                        }
                                    });
                                    console.log(`✅ [Sync CA] Cliente ${clienteLocal.Nome} criado/atualizado localmente.`);
                                }
                            } catch (clienteErr) {
                                console.error(`[Sync CA] Falha ao buscar cliente ${venda.cliente.id} no CA:`, clienteErr.message);
                            }
                        }

                        if (!clienteLocal) {
                            console.warn(`[Sync CA] ⚠️ Pedido #${venda.numero} não importado: cliente não encontrado nem no CA.`);
                            continue;
                        }

                        const dataVendaCA = venda.data ? parseDateCA(venda.data) : new Date();
                        const dataAltCA = venda.data_alteracao ? new Date(venda.data_alteracao) : new Date();

                        // === ENRIQUECIMENTO: Buscar detalhes completos da venda no CA ===
                        let vendedorId = null;
                        let tipoPagamento = null;
                        let opcaoCondicaoPagamento = null;
                        let nomeCondicaoPagamento = null;
                        let itensImportados = [];

                        try {
                            const tokenDet = await contaAzulService.getAccessToken();
                            const resDet = await axios.get(
                                `https://api-v2.contaazul.com/v1/venda/${venda.id}`,
                                { headers: { 'Authorization': `Bearer ${tokenDet}` } }
                            );
                            const vendaDet = resDet.data?.venda || resDet.data || {};

                            // 1. Vendedor
                            const idVendedorCA = vendaDet.id_vendedor || resDet.data?.vendedor?.id || null;
                            if (idVendedorCA) {
                                const vendedorLocal = await prisma.vendedor.findUnique({ where: { id: idVendedorCA } });
                                if (vendedorLocal) {
                                    vendedorId = vendedorLocal.id;
                                    console.log(`[Sync CA] Pedido #${venda.numero}: vendedor → ${vendedorLocal.nome}`);
                                }
                            }

                            // 2. Condição de pagamento — mapeia na TabelaPreco local
                            const condCA = vendaDet.condicao_pagamento || {};
                            const tipoRaw = condCA.tipo_pagamento || null;
                            const opcaoRaw = condCA.opcao_condicao_pagamento || null;
                            tipoPagamento = tipoRaw;
                            opcaoCondicaoPagamento = opcaoRaw;
                            if (tipoRaw || opcaoRaw) {
                                const condicaoLocal = await prisma.tabelaPreco.findFirst({
                                    where: {
                                        ativo: true,
                                        ...(tipoRaw ? { tipoPagamento: tipoRaw } : {}),
                                        ...(opcaoRaw ? { opcaoCondicao: opcaoRaw } : {})
                                    }
                                });
                                nomeCondicaoPagamento = condicaoLocal?.nomeCondicao || null;
                                if (nomeCondicaoPagamento) {
                                    console.log(`[Sync CA] Pedido #${venda.numero}: condição → ${nomeCondicaoPagamento}`);
                                }
                            }

                            // 3. Itens
                            const resItens = await axios.get(
                                `https://api-v2.contaazul.com/v1/venda/${venda.id}/itens?pagina=1&tamanho_pagina=100`,
                                { headers: { 'Authorization': `Bearer ${tokenDet}` } }
                            );
                            const itensCA = resItens.data?.itens || [];
                            for (const itemCA of itensCA) {
                                const produtoLocal = await prisma.produto.findFirst({
                                    where: { contaAzulId: itemCA.id_item }
                                });
                                const valorBase = produtoLocal ? Number(produtoLocal.valorVenda) : Number(itemCA.valor);
                                itensImportados.push({
                                    produtoId: produtoLocal?.id || null,
                                    descricao: itemCA.nome || itemCA.descricao || 'Produto CA',
                                    quantidade: Number(itemCA.quantidade),
                                    valor: Number(itemCA.valor),
                                    valorBase,
                                    flexGerado: (Number(itemCA.valor) - valorBase) * Number(itemCA.quantidade)
                                });
                            }
                            if (itensImportados.length > 0) {
                                console.log(`[Sync CA] Pedido #${venda.numero}: ${itensImportados.length} itens importados.`);
                            }
                        } catch (detErr) {
                            console.error(`[Sync CA] Aviso: não foi possível buscar detalhes completos do pedido #${venda.numero}:`, detErr.message);
                        }

                        await prisma.pedido.create({
                            data: {
                                numero: venda.numero,
                                dataVenda: dataVendaCA,
                                clienteId: clienteLocal.UUID,
                                ...(vendedorId ? { vendedorId } : {}),
                                statusEnvio: 'RECEBIDO',
                                idVendaContaAzul: venda.id,
                                situacaoCA: venda.situacao?.nome || null,
                                contaAzulUpdatedAt: dataAltCA,
                                tipoPagamento,
                                opcaoCondicaoPagamento,
                                nomeCondicaoPagamento,
                                observacoes: `Importado do Conta Azul. Total CA: R$${venda.total}`,
                                updatedAt: new Date(),
                                ...(itensImportados.length > 0 ? { itens: { create: itensImportados } } : {})
                            }
                        });

                        // Disparar atualização do histórico do cliente (como pedido digitado no app)
                        try {
                            const clienteInsightService = require('./clienteInsightService');
                            setImmediate(() => clienteInsightService.recalcularCliente(clienteLocal.UUID).catch(console.error));
                        } catch (_) {
                            // não-crítico
                        }

                        console.log(`✅ [Sync CA] Pedido #${venda.numero} importado (vendedor: ${vendedorId ? 'vinculado' : 'N/D'}, itens: ${itensImportados.length}).`);
                        count++;
                    } catch (importErr) {
                        console.error(`[Sync CA] ❌ Falha ao importar pedido #${venda.numero}:`, importErr.message);
                    }

                }
            }

            // Dispara a rotina pesada de caça aos "Ressuscitados 404" (Pedidos deletados na CA)
            const excluidosSilenciosos = await contaAzulService._verificarPedidosExcluidosContAzul();

            if (excluidosSilenciosos > 0) {
                console.log(`Detectados e excluídos ${excluidosSilenciosos} pedidos silenciosamente apagados na CA.`);
            }

            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'SUCESSO', mensagem: `Modificações RASTREADAS. ${count} pedidos acenderam flag alerta. ${excluidosSilenciosos} detectados como excluídos.`, registrosProcessados: count + excluidosSilenciosos, dataHora: new Date() }
            });

            return { success: true, count, excluidosSilenciosos };
        } catch (error) {
            console.error('Erro syncPedidosModificados:', error);
            await prisma.syncLog.update({
                where: { id: log.id },
                data: { status: 'ERRO', mensagem: error.message, dataHora: new Date() }
            });
            throw error;
        }
    },

    // === SYNC INDIVIDUAL DE PRODUTO ===
    // Busca um produto específico do CA pelo contaAzulId e atualiza o banco local.
    // Usado após movimentações de estoque para manter o saldo local em sincronia com o CA.
    syncProdutoIndividual: async (contaAzulId) => {
        const token = await contaAzulService.getAccessToken();
        const url = `https://api-v2.contaazul.com/v1/produtos/${contaAzulId}`;

        const respGet = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const p = respGet.data;
        if (!p || !p.id) throw new Error('Produto não encontrado no CA');

        const estoqueObj = p.estoque || {};
        const fiscalObj = p.fiscal || {};
        const unidadeObj = p.unidade_medida || {};
        const unidadeFiscal = fiscalObj.unidade_medida || {};
        const unidadeValor = unidadeFiscal.descricao || unidadeFiscal.codigo ||
            unidadeObj.descricao || unidadeObj.codigo ||
            (typeof p.unidade_medida === 'string' ? p.unidade_medida : 'UN');

        const estoqueDisponivel = parseFloat(estoqueObj.quantidade_disponivel ?? estoqueObj.estoque_disponivel ?? 0);

        await prisma.produto.updateMany({
            where: { contaAzulId: p.id },
            data: {
                estoqueDisponivel,
                estoqueReservado: parseFloat(estoqueObj.quantidade_reservada ?? 0),
                estoqueTotal: parseFloat(estoqueObj.quantidade_total ?? estoqueDisponivel),
                valorVenda: parseFloat(estoqueObj.valor_venda ?? p.value ?? p.valor_venda ?? 0) || undefined,
                status: p.status,
                ativo: p.status === 'ACTIVE' || p.status === 'ativo' || p.status === 'ATIVO',
                contaAzulUpdatedAt: new Date(),
                updatedAt: new Date()
            }
        });

        return { estoqueDisponivel, contaAzulId: p.id };
    }
};

module.exports = contaAzulService;
