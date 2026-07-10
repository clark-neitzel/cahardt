/**
 * Contas a Pagar / Fornecedores ↔ Conta Azul (API v2)
 *
 * Workers 100% isolados (nunca derrubam o servidor):
 *   1. processarFilaFornecedores (60s)  — Fornecedor ENVIAR → POST /v1/pessoas (perfil Fornecedor)
 *   2. processarFilaDespesas     (60s)  — ContaPagar ENVIAR → POST contas-a-pagar (HTTP 202 + protocolo)
 *                                         + AGUARDANDO_PROTOCOLO → GET /v1/protocolo/{id} → parcelas CA
 *   3. conferirBaixasCA          (30min)— parcelas com idParcelaCA → GET baixas → ledger origem CA
 *
 * Referência da API: backend/docs/ca-api-v2-referencia.md
 * Reutiliza o mecanismo de token/refresh (mutex) e wrappers do contaAzulService.
 * Se o CA não estiver conectado (sem token), os workers pulam silenciosamente.
 */

const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');

const BASE = 'https://api-v2.contaazul.com';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round2 = (v) => Math.round(Number(v) * 100) / 100;

/** Corpo completo do erro da CA (⚠️ erros das APIs de Financeiro/Baixas podem vir sem corpo). */
const erroCAtexto = (error) => {
    const status = error?.response?.status;
    let body = '';
    try {
        body = error?.response?.data ? JSON.stringify(error.response.data) : '(sem corpo)';
    } catch (_) {
        body = String(error?.response?.data || '(sem corpo)');
    }
    return `HTTP ${status || '?'} — ${body || '(sem corpo)'} — ${error?.message || ''}`.substring(0, 4000);
};

/** CA conectado? (sem token → workers pulam silenciosamente) */
const temTokenCA = async () => {
    try {
        const config = await prisma.contaAzulConfig.findFirst();
        return !!config;
    } catch (_) {
        return false;
    }
};

/** "YYYY-MM-DD" no fuso de SP a partir de um Date */
const fmtDataCA = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Converte "YYYY-MM-DD" do CA para Date no fuso BRT */
const parseDataCA = (str) => {
    if (!str) return null;
    if (String(str).length > 10) return new Date(str);
    return new Date(`${str}T12:00:00-03:00`);
};

// A conta financeira na baixa do CA vem como UUID (listagem de baixas) OU como objeto
// { id, banco, nome, ... } (detalhe da parcela). Normaliza para o UUID.
const extrairContaFinanceiraId = (cf) => {
    if (!cf) return null;
    if (typeof cf === 'string') return cf || null;
    return cf.id || null;
};

const mapMetodoCA = (metodo) => {
    if (!metodo) return null;
    const map = {
        DINHEIRO: 'Dinheiro', BOLETO_BANCARIO: 'Boleto', PIX_PAGAMENTO_INSTANTANEO: 'Pix',
        CARTAO_CREDITO: 'Cartão Crédito', CARTAO_DEBITO: 'Cartão Débito',
        TRANSFERENCIA_BANCARIA: 'Transferência', DEPOSITO_BANCARIO: 'Depósito',
        CHEQUE: 'Cheque', DEBITO_AUTOMATICO: 'Débito Automático', OUTRO: 'Outro'
    };
    return map[String(metodo).toUpperCase()] || metodo;
};

// Recalcula status da parcela a partir do ledger (não estornado)
const calcularStatusParcelaPagar = (valor, totalPago, totalDesconto) => {
    const quitado = Number(totalPago || 0) + Number(totalDesconto || 0);
    if (quitado <= 0) return 'PENDENTE';
    if (quitado >= Number(valor) - 0.01) return 'PAGO';
    return 'PARCIAL';
};

const calcularStatusContaPagar = (todasParcelas) => {
    const total = todasParcelas.length;
    const pagas = todasParcelas.filter((p) => p.status === 'PAGO').length;
    const parciais = todasParcelas.filter((p) => p.status === 'PARCIAL').length;
    const canceladas = todasParcelas.filter((p) => p.status === 'CANCELADO').length;
    if (total > 0 && pagas + canceladas >= total) return 'QUITADO';
    if (pagas > 0 || parciais > 0) return 'PARCIAL';
    return 'ABERTO';
};

/**
 * Recalcula e persiste o status de uma parcela a pagar + da conta, a partir do ledger.
 * Usado pela rota de baixa/estorno e pelo worker de conferência de baixas.
 * Deve rodar dentro de uma transação (tx) ou com o prisma direto.
 */
async function recalcularParcelaEConta(db, parcelaPagarId) {
    const parcela = await db.parcelaPagar.findUnique({
        where: { id: parcelaPagarId },
        include: { pagamentos: { where: { estornado: false } } }
    });
    if (!parcela) return null;

    const totalPago = parcela.pagamentos.reduce((s, p) => s + Number(p.valorPago), 0);
    const totalDesconto = parcela.pagamentos.reduce((s, p) => s + Number(p.desconto), 0);
    const novoStatus = parcela.status === 'CANCELADO'
        ? 'CANCELADO'
        : calcularStatusParcelaPagar(parcela.valor, totalPago, totalDesconto);

    const ultimoPgto = parcela.pagamentos
        .slice()
        .sort((a, b) => new Date(a.dataPagamento) - new Date(b.dataPagamento))
        .pop();

    await db.parcelaPagar.update({
        where: { id: parcelaPagarId },
        data: {
            status: novoStatus,
            valorPago: parcela.pagamentos.length > 0 ? Math.round(totalPago * 100) / 100 : null,
            dataPagamento: novoStatus === 'PAGO' ? (ultimoPgto ? ultimoPgto.dataPagamento : new Date()) : (novoStatus === 'PARCIAL' ? (ultimoPgto?.dataPagamento || null) : null),
            formaPagamento: ultimoPgto?.formaPagamento || null
        }
    });

    const todas = await db.parcelaPagar.findMany({ where: { contaPagarId: parcela.contaPagarId } });
    const atualizadas = todas.map((p) => (p.id === parcelaPagarId ? { ...p, status: novoStatus } : p));
    const statusConta = calcularStatusContaPagar(atualizadas);
    const conta = await db.contaPagar.findUnique({ where: { id: parcela.contaPagarId }, select: { status: true } });
    if (conta && conta.status !== 'CANCELADO' && conta.status !== statusConta) {
        await db.contaPagar.update({ where: { id: parcela.contaPagarId }, data: { status: statusConta } });
    }
    return { statusParcela: novoStatus, statusConta };
}

// ─────────────────────────────────────────────────────────────
// Categorias de despesa (cache 1h)
// ─────────────────────────────────────────────────────────────

let _categoriasCache = { itens: null, em: 0 };
const CACHE_CATEGORIAS_MS = 60 * 60 * 1000;

async function listarCategoriasDespesa() {
    if (_categoriasCache.itens && Date.now() - _categoriasCache.em < CACHE_CATEGORIAS_MS) {
        return _categoriasCache.itens;
    }
    const itens = [];
    let pagina = 1;
    // permite_apenas_filhos é obrigatório na spec (enviar sempre)
    while (pagina <= 20) {
        const url = `${BASE}/v1/categorias?pagina=${pagina}&tamanho_pagina=200&permite_apenas_filhos=false&tipo=DESPESA`;
        const response = await contaAzulService._axiosGet(url, 'CATEGORIAS_DESPESA');
        const lista = response.data?.itens || response.data?.items || [];
        for (const c of lista) {
            if (c?.id && c?.nome) itens.push({ id: c.id, nome: c.nome });
        }
        if (lista.length < 200) break;
        pagina++;
        await sleep(200);
    }
    _categoriasCache = { itens, em: Date.now() };
    return itens;
}

/** Versão "segura" para a rota: nunca lança; CA indisponível → []. */
async function listarCategoriasDespesaSeguro() {
    try {
        if (!(await temTokenCA())) return [];
        return await listarCategoriasDespesa();
    } catch (error) {
        console.warn('[ContasPagar CA] Falha ao listar categorias de despesa:', erroCAtexto(error));
        return _categoriasCache.itens || [];
    }
}

// ─────────────────────────────────────────────────────────────
// Formas de pagamento aceitas pela API de BAIXAS do CA (enum de 14 valores —
// menor que o das parcelas). É o que podemos mandar ao quitar uma despesa.
// ─────────────────────────────────────────────────────────────
const METODOS_PAGAMENTO_BAIXA = [
    { value: 'PIX_PAGAMENTO_INSTANTANEO', label: 'Pix' },
    { value: 'DINHEIRO', label: 'Dinheiro' },
    { value: 'TRANSFERENCIA_BANCARIA', label: 'Transferência bancária' },
    { value: 'BOLETO_BANCARIO', label: 'Boleto bancário' },
    { value: 'CARTAO_CREDITO', label: 'Cartão de crédito' },
    { value: 'CARTAO_DEBITO', label: 'Cartão de débito' },
    { value: 'CARTAO_CREDITO_VIA_LINK', label: 'Cartão de crédito via link' },
    { value: 'DEPOSITO_BANCARIO', label: 'Depósito bancário' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'CARTEIRA_DIGITAL', label: 'Carteira digital' },
    { value: 'CASHBACK', label: 'Cashback' },
    { value: 'CREDITO_LOJA', label: 'Crédito loja' },
    { value: 'CREDITO_VIRTUAL', label: 'Crédito virtual' },
    { value: 'OUTRO', label: 'Outro' },
];
const METODOS_BAIXA_VALIDOS = new Set(METODOS_PAGAMENTO_BAIXA.map((m) => m.value));

/** Lista de bancos/caixas do CA para a tela (nunca lança; CA fora → []). */
async function listarContasFinanceirasSeguro() {
    try {
        if (!(await temTokenCA())) return [];
        return await contaAzulService.listarContasFinanceiras();
    } catch (error) {
        console.warn('[ContasPagar CA] Falha ao listar contas financeiras:', erroCAtexto(error));
        return [];
    }
}

// ─────────────────────────────────────────────────────────────
// Conta financeira padrão das despesas
// Mesma tabela local usada pelos pedidos (contas_financeiras = UUIDs do CA).
// Ordem: AppConfig 'contas_pagar_conta_financeira_id' → conta_padrao=true no CA
//        → primeira conta financeira local ativa.
// ─────────────────────────────────────────────────────────────

let _contaPadraoCache = { id: null, em: 0 };
const CACHE_CONTA_MS = 60 * 60 * 1000;

async function resolverContaFinanceiraPadrao() {
    if (_contaPadraoCache.id && Date.now() - _contaPadraoCache.em < CACHE_CONTA_MS) {
        return _contaPadraoCache.id;
    }

    // 1) Override explícito por configuração
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'contas_pagar_conta_financeira_id' } });
        const val = typeof cfg?.value === 'string' ? cfg.value : cfg?.value?.id;
        if (val) {
            _contaPadraoCache = { id: val, em: Date.now() };
            return val;
        }
    } catch (_) { /* segue */ }

    // 2) Conta padrão do CA
    try {
        const url = `${BASE}/v1/conta-financeira?pagina=1&tamanho_pagina=100&apenas_ativo=true`;
        const response = await contaAzulService._axiosGet(url, 'CONTA_FINANCEIRA');
        const contas = response.data?.itens || [];
        const padrao = contas.find((c) => c.conta_padrao === true) || contas[0];
        if (padrao?.id) {
            _contaPadraoCache = { id: padrao.id, em: Date.now() };
            return padrao.id;
        }
    } catch (error) {
        console.warn('[ContasPagar CA] Falha ao buscar conta financeira padrão no CA:', erroCAtexto(error));
    }

    // 3) Fallback: mesma tabela local usada pelos pedidos
    const local = await prisma.contaFinanceira.findFirst({ where: { ativo: true }, orderBy: { createdAt: 'asc' } });
    if (local?.id) {
        _contaPadraoCache = { id: local.id, em: Date.now() };
        return local.id;
    }

    throw new Error('Nenhuma conta financeira disponível (CA e tabela local vazios).');
}

// ─────────────────────────────────────────────────────────────
// Importação de fornecedores do CA (rota POST /api/fornecedores/importar-ca)
// ─────────────────────────────────────────────────────────────

async function importarFornecedoresCA() {
    let importados = 0;
    let atualizados = 0;
    let pagina = 1;

    while (pagina <= 100) {
        // tipo_perfil=Fornecedor (com acento/maiúscula, exatamente assim — spec oficial)
        const url = `${BASE}/v1/pessoas?pagina=${pagina}&tamanho_pagina=100&tipo_perfil=Fornecedor&com_endereco=true`;
        const response = await contaAzulService._axiosGet(url, 'FORNECEDORES_IMPORT');
        // Response de pessoas usa items/totalItems (camelCase — diferente do resto da API)
        const lista = response.data?.items || response.data?.itens || [];
        if (lista.length === 0) break;

        for (const p of lista) {
            if (!p?.id) continue;
            const cnpjCpf = String(p.documento || '').replace(/\D/g, '') || null;
            const dados = {
                cnpjCpf,
                razaoSocial: p.nome || cnpjCpf || 'Fornecedor sem nome',
                nomeFantasia: p.nome_fantasia || null,
                email: p.email || null,
                telefone: p.telefone || null,
                cidade: p.endereco?.cidade || null,
                uf: p.endereco?.estado || null,
                observacoes: p.observacoes_gerais || null,
                ativo: p.ativo !== false,
                statusEnvioCA: 'SINCRONIZADO',
                erroEnvioCA: null
            };

            // Match primário por contaAzulId; secundário por cnpjCpf
            let existente = await prisma.fornecedor.findUnique({ where: { contaAzulId: p.id } });
            if (!existente && cnpjCpf) {
                existente = await prisma.fornecedor.findFirst({ where: { cnpjCpf, contaAzulId: null } });
            }

            if (existente) {
                await prisma.fornecedor.update({
                    where: { id: existente.id },
                    data: { ...dados, contaAzulId: p.id }
                });
                atualizados++;
            } else {
                await prisma.fornecedor.create({
                    data: { ...dados, contaAzulId: p.id, origem: 'CA' }
                });
                importados++;
            }
        }

        const totalItems = Number(response.data?.totalItems || 0);
        if (totalItems && pagina * 100 >= totalItems) break;
        if (lista.length < 100) break;
        pagina++;
        await sleep(300);
    }

    return { importados, atualizados };
}

// ─────────────────────────────────────────────────────────────
// WORKER 1 — Envio de fornecedores (60s)
// ─────────────────────────────────────────────────────────────

let _fornecedoresRodando = false;

async function processarFilaFornecedores() {
    if (_fornecedoresRodando) return;
    _fornecedoresRodando = true;
    try {
        if (!(await temTokenCA())) return; // CA não conectado → pula silenciosamente

        const pendentes = await prisma.fornecedor.findMany({
            where: { statusEnvioCA: 'ENVIAR' },
            take: 5,
            orderBy: { criadoEm: 'asc' }
        });
        if (pendentes.length === 0) return;

        console.log(`[ContasPagar CA] Enviando ${pendentes.length} fornecedor(es) ao CA...`);

        for (const f of pendentes) {
            try {
                await prisma.fornecedor.update({ where: { id: f.id }, data: { statusEnvioCA: 'ENVIANDO' } });

                const soDigitos = String(f.cnpjCpf || '').replace(/\D/g, '');

                // ── Antes de criar, procura no CA pelo CNPJ/CPF (evita cadastro DUPLICADO de fornecedor).
                // Se já existir lá, adota o cadastro existente. Se a busca falhar, NÃO cria às cegas.
                if (soDigitos) {
                    let existenteCaId = null;
                    try {
                        existenteCaId = await contaAzulService.buscarFornecedorPorDocumento(soDigitos);
                    } catch (buscaErr) {
                        console.warn(`[ContasPagar CA] ⚠️ Busca de fornecedor por documento falhou ("${f.razaoSocial}") — não cria neste ciclo (evita duplicar):`, erroCAtexto(buscaErr));
                        await prisma.fornecedor.update({ where: { id: f.id }, data: { statusEnvioCA: 'ENVIAR' } });
                        await sleep(1200);
                        continue;
                    }
                    if (existenteCaId) {
                        await prisma.fornecedor.update({
                            where: { id: f.id },
                            data: { contaAzulId: existenteCaId, statusEnvioCA: 'SINCRONIZADO', erroEnvioCA: null }
                        });
                        console.log(`[ContasPagar CA] 🔗 Fornecedor "${f.razaoSocial}" já existia no CA (${existenteCaId}) — adotado, sem duplicar.`);
                        await sleep(1200);
                        continue;
                    }
                }

                const ehPF = soDigitos.length === 11;
                const payload = {
                    nome: f.razaoSocial,
                    tipo_pessoa: ehPF ? 'Física' : 'Jurídica', // com acento, exatamente assim (spec)
                    perfis: [{ tipo_perfil: 'Fornecedor' }]
                };
                if (soDigitos.length === 14) payload.cnpj = soDigitos;
                if (soDigitos.length === 11) payload.cpf = soDigitos;
                if (!ehPF && f.nomeFantasia) payload.nome_fantasia = f.nomeFantasia;
                if (f.email) payload.email = f.email;
                if (f.telefone) payload.telefone_comercial = String(f.telefone).replace(/\D/g, '');
                if (f.observacoes) payload.observacao = String(f.observacoes).substring(0, 2000);
                if (f.inscricaoEstadual) {
                    payload.inscricoes = [{
                        indicador_inscricao_estadual: 'CONTRIBUINTE',
                        inscricao_estadual: String(f.inscricaoEstadual).substring(0, 20)
                    }];
                }
                if (f.cidade || f.uf) {
                    payload.enderecos = [{ cidade: f.cidade || undefined, estado: f.uf || undefined, pais: 'Brasil' }];
                }

                const response = await contaAzulService._axiosRequest('post', `${BASE}/v1/pessoas`, payload, 'FORNECEDOR_ENVIO');
                const pessoaId = response.data?.id;
                if (!pessoaId) throw new Error(`CA respondeu sem id de pessoa: ${JSON.stringify(response.data).substring(0, 500)}`);

                await prisma.fornecedor.update({
                    where: { id: f.id },
                    data: { contaAzulId: pessoaId, statusEnvioCA: 'SINCRONIZADO', erroEnvioCA: null }
                });
                console.log(`[ContasPagar CA] ✅ Fornecedor "${f.razaoSocial}" criado no CA (${pessoaId}).`);
            } catch (error) {
                const msg = erroCAtexto(error);
                console.error(`[ContasPagar CA] ❌ Erro ao enviar fornecedor "${f.razaoSocial}":`, msg);
                try {
                    await prisma.fornecedor.update({
                        where: { id: f.id },
                        data: { statusEnvioCA: 'ERRO', erroEnvioCA: msg }
                    });
                } catch (_) { /* nunca derrubar o worker */ }
            }
            await sleep(1200); // respeita 10 req/s do CA
        }
    } catch (error) {
        console.error('[ContasPagar CA] Erro no worker de fornecedores (isolado):', error.message);
    } finally {
        _fornecedoresRodando = false;
    }
}

// ─────────────────────────────────────────────────────────────
// WORKER 2 — Envio de despesas (60s)
// ─────────────────────────────────────────────────────────────

let _despesasRodando = false;

async function processarFilaDespesas() {
    if (_despesasRodando) return;
    _despesasRodando = true;
    try {
        if (!(await temTokenCA())) return;

        await _enviarDespesasPendentes();
        await _consultarProtocolosPendentes();
        await _empurrarBaixasPendentes(); // baixas "já paguei" → CA (depois que a parcela mapeou)
    } catch (error) {
        console.error('[ContasPagar CA] Erro no worker de despesas (isolado):', error.message);
    } finally {
        _despesasRodando = false;
    }
}

/**
 * IDEMPOTÊNCIA — localizar no CA um evento de despesa já criado com um dado `codigo_referencia`
 * (que gravamos como o id da nossa ContaPagar). Usado ANTES de POSTar para não duplicar no reenvio.
 *
 * ⚠️ Confirmado na spec (backend/docs/ca-api-v2-referencia.md):
 *   - O endpoint de BUSCA (.../contas-a-pagar/buscar) NÃO aceita filtro por `codigo_referencia`
 *     e NÃO retorna esse campo nos itens (só id da PARCELA, descrição, vencimento, total,
 *     nao_pago, pago, fornecedor{id,nome}, categorias, competência).
 *   - Quem expõe o `codigo_referencia` é o DETALHE da parcela
 *     (GET /v1/financeiro/eventos-financeiros/parcelas/{id}) dentro de `evento.codigo_referencia`,
 *     que também traz `evento.id` (o evento_financeiro_id que precisamos adotar).
 *
 * Estratégia (conservadora — só adota com ALTA confiança):
 *   1. Buscar parcelas por janela de vencimento (obrigatória na busca) em torno dos vencimentos
 *      da nossa conta, restringindo pelo fornecedor (contato) via `fornecedor.id`.
 *   2. Para cada parcela candidata, ler o detalhe e comparar `evento.codigo_referencia` === codigoReferencia.
 *      Match EXATO por codigo_referencia → retorna `evento.id`.
 *   3. Se em NENHUMA candidata o codigo_referencia bater, retorna null (melhor não adotar do que
 *      adotar o evento errado — não usamos heurística de valor/descrição como "match", só como
 *      pré-filtro de candidatos).
 *
 * Retorna o evento_financeiro_id (uuid) quando acha; senão null.
 * Lança em falha de rede/parse — o chamador decide (aqui: pular a conta neste ciclo, não duplicar).
 */
async function _encontrarEventoPorReferencia(codigoReferencia, conta) {
    if (!codigoReferencia) return null;
    const fornecedorCaId = conta?.fornecedor?.contaAzulId || null;

    // Janela de vencimento cobrindo todas as parcelas (+/- 3 dias de folga), com teto de 1 ano.
    const parcelas = (conta?.parcelas || []).filter((p) => p.status !== 'CANCELADO');
    const vencs = parcelas.map((p) => new Date(p.dataVencimento).getTime()).filter((t) => !isNaN(t));
    let minV, maxV;
    if (vencs.length > 0) {
        minV = new Date(Math.min(...vencs));
        maxV = new Date(Math.max(...vencs));
    } else {
        const base = new Date(conta?.competencia || Date.now());
        minV = base; maxV = base;
    }
    const FOLGA = 3 * 24 * 60 * 60 * 1000;
    const de = fmtDataCA(new Date(minV.getTime() - FOLGA));
    const ate = fmtDataCA(new Date(maxV.getTime() + FOLGA));

    // 1) Buscar candidatos (parcelas) na janela + fornecedor
    const candidatosIds = new Set();
    let pagina = 1;
    while (pagina <= 10) { // teto de páginas
        const url = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar`
            + `?pagina=${pagina}&tamanho_pagina=100`
            + `&data_vencimento_de=${de}&data_vencimento_ate=${ate}`;
        const resp = await contaAzulService._axiosGet(url, 'CONTA_PAGAR_BUSCA_REF');
        const itens = resp.data?.itens || resp.data?.items || [];
        for (const it of itens) {
            if (!it?.id) continue;
            // Se a busca trouxe fornecedor, filtra por ele quando conhecemos o UUID do fornecedor
            if (fornecedorCaId && it.fornecedor?.id && it.fornecedor.id !== fornecedorCaId) continue;
            candidatosIds.add(it.id);
        }
        const totais = Number(resp.data?.itens_totais || 0);
        if (itens.length < 100) break;
        if (totais && pagina * 100 >= totais) break;
        pagina++;
        await sleep(300);
    }
    if (candidatosIds.size === 0) return null;

    // 2) Para cada parcela candidata, ler o detalhe e casar por codigo_referencia EXATO
    const alvo = String(codigoReferencia);
    for (const parcelaId of candidatosIds) {
        try {
            const det = await contaAzulService._axiosGet(
                `${BASE}/v1/financeiro/eventos-financeiros/parcelas/${parcelaId}`, 'CONTA_PAGAR_PARCELA_DET'
            );
            const evento = det.data?.evento || {};
            const refCA = evento.codigo_referencia != null ? String(evento.codigo_referencia) : null;
            if (refCA && refCA === alvo && evento.id) {
                return String(evento.id); // match de alta confiança — mesmo codigo_referencia
            }
        } catch (error) {
            // Um detalhe que falha não deve derrubar a busca: registra e segue para o próximo candidato.
            console.warn(`[ContasPagar CA] Falha ao ler detalhe da parcela candidata ${parcelaId}:`, erroCAtexto(error));
        }
        await sleep(250);
    }

    // Nenhum candidato bateu o codigo_referencia → não adotamos às cegas.
    return null;
}

/**
 * CONCILIAÇÃO — localizar no CA uma despesa que o USUÁRIO já lançou MANUALMENTE,
 * casando pelo NÚMERO DA NOTA. A busca do CA não filtra por número da nota, então
 * procuramos o número dentro da descrição da despesa.
 * NÃO filtramos por fornecedor: o mesmo fornecedor pode ter cadastros diferentes no CA
 * (ex.: "Produpan ... Ltda EPP" vs "Produpan - ... Ltda") e isso descartaria a manual.
 * Só adota um evento que NÃO seja o nosso (codigo_referencia != id da nossa conta),
 * cujo número da nota apareça no texto E cujo VALOR bata com a conta (total ou uma
 * parcela). Retorna evento_financeiro_id (uuid) ou null.
 *
 * ⚠️ Incidente 07/2026: despesa manual com "nota" de texto livre ("JULHO 2026") casou
 * com "DIARIA ALIMENTACAO REF JULHO 2026" de OUTRO fornecedor e OUTRO valor — e a baixa
 * do título errado foi importada. Por isso: (a) só conciliamos quando a nota parece um
 * número de documento de verdade; (b) o valor passou de "reforço" a requisito.
 */
const REGEX_NOTA_DOCUMENTO = /^\d{3,}([-/.]\d{1,4})?$/; // "858860", "858860-1"; recusa texto livre

async function _encontrarEventoPorNumeroNota(conta) {
    const numero = String(conta?.numeroNota || '').trim();
    if (!numero) return null;
    if (!REGEX_NOTA_DOCUMENTO.test(numero)) return null; // "nota" texto livre → não conciliar
    const valorConta = round2(Number(conta?.valorTotal || 0));
    // Valores aceitáveis para o candidato (parcela na busca do CA): total da conta ou o
    // valor de qualquer parcela nossa (nota parcelada lançada na mão no CA).
    const valoresApp = new Set([valorConta]);
    for (const p of (conta?.parcelas || [])) {
        if (p.status !== 'CANCELADO') valoresApp.add(round2(Number(p.valor)));
    }

    // Janela de vencimento ampla (a busca exige o filtro), em torno das datas conhecidas.
    const datas = (conta?.parcelas || [])
        .filter((p) => p.status !== 'CANCELADO')
        .map((p) => new Date(p.dataVencimento).getTime())
        .filter((t) => !isNaN(t));
    const baseComp = new Date(conta?.competencia || Date.now()).getTime();
    if (!isNaN(baseComp)) datas.push(baseComp);
    if (datas.length === 0) return null;
    const JANELA = 45 * 24 * 60 * 60 * 1000;
    const de = fmtDataCA(new Date(Math.min(...datas) - JANELA));
    const ate = fmtDataCA(new Date(Math.max(...datas) + JANELA));

    // Número da nota com "fronteira" (não casa 44 dentro de 4400)
    const numEsc = numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexNum = new RegExp(`(^|\\D)${numEsc}(\\D|$)`);

    // IMPORTANTE: incluir status PAGOS na busca — a nota lançada manualmente pode já
    // estar quitada no CA (sem isso, a busca poderia não retorná-la e duplicaríamos).
    const statusQS = ['RECEBIDO', 'EM_ABERTO', 'ATRASADO', 'RECEBIDO_PARCIAL', 'RENEGOCIADO', 'PERDIDO']
        .map((s) => `&status=${s}`).join('');

    // Candidatos FORTES = número da nota já aparece na descrição da lista (ex.: a nota de
    // compra manual "Compra de produto 813 (NFe 858860-1)"). FRACOS = só o valor bate
    // (confirma o número no detalhe). Testamos os fortes primeiro — assim a manual tem
    // preferência sobre sobras genéricas ("Parcela (1/1)") de tentativas anteriores.
    // Em TODOS os casos o valor precisa bater (total da conta ou uma parcela nossa) —
    // número sozinho já adotou despesa errada (ver incidente no docblock).
    const fortes = [];
    const fracos = [];
    const vistos = new Set();
    let pagina = 1;
    while (pagina <= 10) {
        const url = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar`
            + `?pagina=${pagina}&tamanho_pagina=100`
            + `&data_vencimento_de=${de}&data_vencimento_ate=${ate}${statusQS}`;
        const resp = await contaAzulService._axiosGet(url, 'CONTA_PAGAR_CONCILIA');
        const itens = resp.data?.itens || resp.data?.items || [];
        for (const it of itens) {
            if (!it?.id || vistos.has(it.id)) continue;
            vistos.add(it.id);
            // SEM filtro de fornecedor (cadastros duplicados no CA descartariam a manual).
            const totalIt = round2(Number(it.total ?? it.nao_pago ?? 0));
            const descBateNum = regexNum.test(String(it.descricao || ''));
            const valorBate = valoresApp.has(totalIt);
            if (!valorBate) continue; // valor é requisito — nunca adotar só pelo texto
            if (descBateNum) fortes.push(it.id);
            else fracos.push(it.id);
        }
        const totais = Number(resp.data?.itens_totais || 0);
        if (itens.length < 100) break;
        if (totais && pagina * 100 >= totais) break;
        pagina++;
        await sleep(300);
    }
    const candidatos = [...fortes, ...fracos];
    if (candidatos.length === 0) return null;

    for (const parcelaId of candidatos) {
        try {
            const det = await contaAzulService.buscarParcelaDetalhe(parcelaId);
            const evento = det?.evento || {};
            // Só ignora se for a NOSSA própria despesa (codigo_referencia === id da nossa conta).
            // Uma nota de compra lançada na mão pode ter outro codigo_referencia — essa a gente adota.
            if (evento.codigo_referencia && String(evento.codigo_referencia) === String(conta?.id)) continue;
            const textos = [det?.descricao, det?.nota, evento?.descricao]
                .map((s) => String(s || '')).join(' | ');
            if (regexNum.test(textos) && evento.id) {
                return String(evento.id); // nº da nota bateu num lançamento manual
            }
        } catch (error) {
            console.warn(`[ContasPagar CA] Falha ao ler detalhe (conciliação) da parcela ${parcelaId}:`, erroCAtexto(error));
        }
        await sleep(250);
    }
    return null;
}

async function _enviarDespesasPendentes() {
    const pendentes = await prisma.contaPagar.findMany({
        where: { statusEnvioCA: 'ENVIAR', status: { not: 'CANCELADO' } },
        include: { fornecedor: true, parcelas: { orderBy: { numeroParcela: 'asc' } }, rateios: true },
        take: 5,
        orderBy: { criadoEm: 'asc' }
    });
    if (pendentes.length === 0) return;

    console.log(`[ContasPagar CA] Enviando ${pendentes.length} despesa(s) ao CA...`);

    for (const conta of pendentes) {
        try {
            // Fornecedor precisa estar SINCRONIZADO com contaAzulId (CA exige `contato`)
            if (!conta.fornecedor) {
                await prisma.contaPagar.update({
                    where: { id: conta.id },
                    data: { statusEnvioCA: 'ERRO', erroEnvioCA: 'Conta sem fornecedor vinculado — o CA exige o fornecedor (contato).' }
                });
                continue;
            }
            if (conta.fornecedor.statusEnvioCA === 'ERRO') {
                await prisma.contaPagar.update({
                    where: { id: conta.id },
                    data: { statusEnvioCA: 'ERRO', erroEnvioCA: `Fornecedor "${conta.fornecedor.razaoSocial}" com erro de envio ao CA. Corrija o fornecedor e reenvie.` }
                });
                continue;
            }
            if (conta.fornecedor.statusEnvioCA !== 'SINCRONIZADO' || !conta.fornecedor.contaAzulId) {
                // Fornecedor ainda na fila — espera o próximo ciclo (mantém ENVIAR)
                continue;
            }

            const parcelasAbertas = conta.parcelas.filter((p) => p.status !== 'CANCELADO');
            if (parcelasAbertas.length === 0) {
                await prisma.contaPagar.update({
                    where: { id: conta.id },
                    data: { statusEnvioCA: 'ERRO', erroEnvioCA: 'Conta sem parcelas válidas para enviar.' }
                });
                continue;
            }

            await prisma.contaPagar.update({ where: { id: conta.id }, data: { statusEnvioCA: 'ENVIANDO' } });

            // ── IDEMPOTÊNCIA: antes de POSTar, verifica se já existe no CA um evento com este
            // codigo_referencia (id da nossa conta). Se existir → ADOTA sem criar outro (evita duplicar).
            try {
                const eventoExistente = await _encontrarEventoPorReferencia(conta.id, conta);
                if (eventoExistente) {
                    await prisma.contaPagar.update({
                        where: { id: conta.id },
                        data: { idEventoCA: eventoExistente, statusEnvioCA: 'AGUARDANDO_PROTOCOLO', erroEnvioCA: null }
                    });
                    // Mapeia as parcelas do evento já existente (fecha em ENVIADO se casar tudo).
                    await _mapearParcelasCA(conta.id, eventoExistente);
                    console.log('[ContasPagar CA] ♻️ Evento já existia no CA (codigo_referencia) — adotado, sem duplicar.');
                    await sleep(1200);
                    continue; // próxima conta — NÃO faz o POST
                }
            } catch (buscaErr) {
                // A busca de idempotência FALHOU (rede/parse). Não sabemos se o evento existe:
                // por segurança NÃO duplicamos às cegas. Reverte para ENVIAR e tenta de novo no
                // próximo ciclo. Preferimos "tentar depois" a "criar despesa duplicada".
                console.warn(`[ContasPagar CA] ⚠️ Busca de idempotência falhou para "${conta.descricao}" — pulando neste ciclo (mantém ENVIAR, sem POST para não duplicar):`, erroCAtexto(buscaErr));
                try {
                    await prisma.contaPagar.update({ where: { id: conta.id }, data: { statusEnvioCA: 'ENVIAR' } });
                } catch (_) { /* isolado */ }
                await sleep(1200);
                continue;
            }

            // ── CONCILIAÇÃO: a nota pode já ter sido lançada MANUALMENTE no CA.
            // Casa pelo número da nota (+ fornecedor/valor) e ADOTA em vez de duplicar.
            // Falha aqui NUNCA bloqueia — cai no POST normal. (Só p/ contas de NF-e.)
            if (conta.numeroNota) {
                try {
                    const eventoManual = await _encontrarEventoPorNumeroNota(conta);
                    if (eventoManual) {
                        await prisma.contaPagar.update({
                            where: { id: conta.id },
                            data: { idEventoCA: eventoManual, statusEnvioCA: 'AGUARDANDO_PROTOCOLO', erroEnvioCA: null }
                        });
                        await _mapearParcelasCA(conta.id, eventoManual);
                        console.log(`[ContasPagar CA] 🔗 Nota ${conta.numeroNota} já lançada no CA — despesa conciliada (sem duplicar).`);
                        await sleep(1200);
                        continue;
                    }
                } catch (conciliaErr) {
                    console.warn(`[ContasPagar CA] Conciliação por nº da nota falhou p/ "${conta.descricao}" — segue criando normal:`, erroCAtexto(conciliaErr));
                }
            }

            // Banco e forma escolhidos na entrada da nota (condição de pagamento) → payload da despesa.
            const contaFinanceiraId = conta.contaFinanceiraCaId || await resolverContaFinanceiraPadrao();
            const metodoPagamentoCA = conta.metodoPagamentoCA || null;
            const valorTotal = Math.round(parcelasAbertas.reduce((s, p) => s + Number(p.valor), 0) * 100) / 100;
            const dataCompetencia = fmtDataCA(conta.competencia || parcelasAbertas[0].dataVencimento || new Date());
            const notaParcela = conta.numeroNota ? `NF ${conta.numeroNota}` : conta.descricao;

            // Descrição no CA = descrição automática (nº da nota + fornecedor, usada na conciliação)
            // + as observações digitadas na conferência. Cap de 255 p/ não estourar o campo do CA
            // (o texto completo continua no campo observação).
            const obsTxt = String(conta.observacoes || '').trim();
            const descricaoCA = (obsTxt ? `${conta.descricao} — ${obsTxt}` : conta.descricao).substring(0, 255);

            const payload = {
                descricao: descricaoCA,
                // Referência única (id da nossa conta) — rastreio e base para evitar duplicidade no reenvio
                codigo_referencia: conta.id,
                // observacao é OBRIGATÓRIA na spec — nunca mandar vazia
                observacao: conta.observacoes || `Lançado pelo app Hardt — ${conta.descricao}`,
                data_competencia: dataCompetencia,
                valor: valorTotal,
                contato: conta.fornecedor.contaAzulId,
                conta_financeira: contaFinanceiraId,
                condicao_pagamento: {
                    parcelas: parcelasAbertas.map((p, i) => ({
                        descricao: `Parcela (${i + 1}/${parcelasAbertas.length})`,
                        data_vencimento: fmtDataCA(p.dataVencimento),
                        nota: notaParcela, // obrigatória na spec
                        conta_financeira: contaFinanceiraId,
                        ...(metodoPagamentoCA ? { metodo_pagamento: metodoPagamentoCA } : {}),
                        // CA exige valor_liquido além do valor_bruto (HTTP 400 "O valor líquido deve ser informado").
                        // Na criação não há juros/multa/desconto → líquido = bruto.
                        detalhe_valor: { valor_bruto: Number(p.valor), valor_liquido: Number(p.valor) }
                    }))
                }
            };

            // Categoria (rateio) — spec não marca como obrigatório, mas sem ele fica sem categoria.
            // Nota gerada da conferência já grava as linhas de rateio (uma ou várias categorias).
            let categoriaCaId = conta.categoriaCaId;
            const rateiosComCa = (conta.rateios || []).filter((r) => r.categoriaCaId);

            if (rateiosComCa.length > 0) {
                let itensRateio = rateiosComCa.map((r) => ({ id_categoria: r.categoriaCaId, valor: round2(Number(r.valor)) }));
                // A soma do rateio deve bater com o valor do evento — ajusta o último por arredondamento
                const somaRateio = round2(itensRateio.reduce((s, r) => s + r.valor, 0));
                const diff = round2(valorTotal - somaRateio);
                if (diff !== 0 && itensRateio.length > 0) {
                    itensRateio[itensRateio.length - 1].valor = round2(itensRateio[itensRateio.length - 1].valor + diff);
                }
                payload.rateio = itensRateio;
            } else {
                if (!categoriaCaId && conta.categoria) {
                    try {
                        const cats = await listarCategoriasDespesa();
                        const alvo = String(conta.categoria).trim().toLowerCase();
                        categoriaCaId = cats.find((c) => c.nome.trim().toLowerCase() === alvo)?.id || null;
                    } catch (_) { /* envia sem rateio */ }
                }
                if (categoriaCaId) {
                    payload.rateio = [{ id_categoria: categoriaCaId, valor: valorTotal }];
                } else {
                    console.warn(`[ContasPagar CA] ⚠️ Conta "${conta.descricao}" sem categoria CA — enviando SEM rateio (comportamento não confirmado na spec).`);
                }
            }

            const response = await contaAzulService._axiosRequest(
                'post', `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar`, payload, 'CONTA_PAGAR_ENVIO'
            );

            // Criação é ASSÍNCRONA: CA responde 200/202 com { protocolo, status:PENDING }.
            // (O campo real é `protocolo` — não `protocolId`.) Defensivo caso venha evento direto.
            const protocolId = response.data?.protocolo || response.data?.protocolId || response.data?.protocol_id || null;
            const eventoDireto = !protocolId && response.data?.evento_financeiro_id ? response.data.evento_financeiro_id : null;

            if (protocolId) {
                await prisma.contaPagar.update({
                    where: { id: conta.id },
                    data: {
                        protocoloCA: protocolId,
                        categoriaCaId: categoriaCaId || conta.categoriaCaId,
                        statusEnvioCA: 'AGUARDANDO_PROTOCOLO',
                        erroEnvioCA: null
                    }
                });
                console.log(`[ContasPagar CA] 📨 Despesa "${conta.descricao}" aceita (HTTP ${response.status}), protocolo ${protocolId}.`);
            } else if (eventoDireto) {
                await prisma.contaPagar.update({
                    where: { id: conta.id },
                    data: { idEventoCA: eventoDireto, categoriaCaId: categoriaCaId || conta.categoriaCaId, statusEnvioCA: 'AGUARDANDO_PROTOCOLO', erroEnvioCA: null }
                });
                await _mapearParcelasCA(conta.id, eventoDireto);
            } else {
                throw new Error(`CA respondeu ${response.status} sem protocolId: ${JSON.stringify(response.data).substring(0, 800)}`);
            }
        } catch (error) {
            const msg = erroCAtexto(error);
            console.error(`[ContasPagar CA] ❌ Erro ao enviar despesa "${conta.descricao}":`, msg);
            try {
                await prisma.contaPagar.update({
                    where: { id: conta.id },
                    data: { statusEnvioCA: 'ERRO', erroEnvioCA: msg }
                });
            } catch (_) { /* isolado */ }
        }
        await sleep(1200);
    }
}

async function _consultarProtocolosPendentes() {
    const aguardando = await prisma.contaPagar.findMany({
        where: { statusEnvioCA: 'AGUARDANDO_PROTOCOLO' },
        take: 10,
        orderBy: { atualizadoEm: 'asc' }
    });
    if (aguardando.length === 0) return;

    for (const conta of aguardando) {
        try {
            let eventoId = conta.idEventoCA;

            if (!eventoId) {
                if (!conta.protocoloCA) {
                    await prisma.contaPagar.update({
                        where: { id: conta.id },
                        data: { statusEnvioCA: 'ERRO', erroEnvioCA: 'Sem protocolo e sem evento CA — reenvie.' }
                    });
                    continue;
                }
                const resp = await contaAzulService._axiosGet(`${BASE}/v1/protocolo/${conta.protocoloCA}`, 'CONTA_PAGAR_PROTOCOLO');
                const status = String(resp.data?.status || '').toUpperCase();

                if (status === 'ERROR') {
                    // Se o erro indicar que o evento já existe/duplicado (o CA pode ter criado o
                    // evento e ainda assim devolver erro), NÃO reenviamos: tentamos adotar o evento
                    // já existente pelo codigo_referencia antes de marcar ERRO.
                    const respTxt = JSON.stringify(resp.data || {}).toLowerCase();
                    if (/duplicad|já existe|ja existe|already exist|codigo_referencia|código de referência/.test(respTxt)) {
                        try {
                            const contaCompleta = await prisma.contaPagar.findUnique({
                                where: { id: conta.id },
                                include: { fornecedor: true, parcelas: true }
                            });
                            const adotado = await _encontrarEventoPorReferencia(conta.id, contaCompleta || conta);
                            if (adotado) {
                                await prisma.contaPagar.update({ where: { id: conta.id }, data: { idEventoCA: adotado, erroEnvioCA: null } });
                                await _mapearParcelasCA(conta.id, adotado);
                                console.log('[ContasPagar CA] ♻️ Protocolo com erro de duplicidade — evento existente adotado pelo codigo_referencia, sem reenviar.');
                                continue;
                            }
                        } catch (adotaErr) {
                            console.warn(`[ContasPagar CA] Erro de duplicidade no protocolo mas falha ao adotar evento existente (${conta.id}):`, erroCAtexto(adotaErr));
                        }
                    }
                    await prisma.contaPagar.update({
                        where: { id: conta.id },
                        data: { statusEnvioCA: 'ERRO', erroEnvioCA: `Protocolo com erro no CA: ${JSON.stringify(resp.data).substring(0, 2000)}` }
                    });
                    continue;
                }
                if (status !== 'SUCCESS') continue; // PENDING → tenta no próximo ciclo

                eventoId = resp.data?.evento_financeiro_id || resp.data?.eventoFinanceiroId || null;
                if (!eventoId) {
                    console.warn(`[ContasPagar CA] ⚠️ Protocolo ${conta.protocoloCA} SUCCESS mas sem evento_financeiro_id: ${JSON.stringify(resp.data).substring(0, 500)}`);
                    continue;
                }
                await prisma.contaPagar.update({ where: { id: conta.id }, data: { idEventoCA: eventoId } });
            }

            await _mapearParcelasCA(conta.id, eventoId);
        } catch (error) {
            // Falha de rede/429 no protocolo: NÃO marca erro — tenta no próximo ciclo
            console.warn(`[ContasPagar CA] Falha ao consultar protocolo da conta ${conta.id}:`, erroCAtexto(error));
        }
        await sleep(800);
    }
}

/** Busca as parcelas do evento no CA e mapeia idParcelaCA por (vencimento, valor). */
async function _mapearParcelasCA(contaPagarId, eventoId) {
    const resp = await contaAzulService._axiosGet(
        `${BASE}/v1/financeiro/eventos-financeiros/${eventoId}/parcelas`, 'CONTA_PAGAR_PARCELAS'
    );
    const parcelasCA = Array.isArray(resp.data) ? resp.data : (resp.data?.itens || []);

    const locais = await prisma.parcelaPagar.findMany({
        where: { contaPagarId, status: { not: 'CANCELADO' } },
        orderBy: { numeroParcela: 'asc' }
    });

    const usadas = new Set();
    let mapeadas = 0;
    for (const local of locais) {
        if (local.idParcelaCA) { mapeadas++; continue; }
        const vencLocal = fmtDataCA(local.dataVencimento);
        const valorLocal = Number(local.valor);

        // Match por (vencimento, valor); fallback por índice (indice na spec) — mas o
        // VALOR sempre precisa bater: já mapeamos parcela de R$47,55 numa de R$575 só
        // pelo índice (evento errado adotado) e a baixa do outro título veio para cá.
        const valorCABate = (p) =>
            Math.abs(Number(p.valor_composicao?.valor_bruto ?? p.nao_pago ?? 0) - valorLocal) < 0.01;
        let caPar = parcelasCA.find((p) =>
            !usadas.has(p.id) &&
            String(p.data_vencimento || '').substring(0, 10) === vencLocal &&
            valorCABate(p)
        );
        if (!caPar) caPar = parcelasCA.find((p) =>
            !usadas.has(p.id) && Number(p.indice) === Number(local.numeroParcela) && valorCABate(p)
        );
        if (!caPar) continue;

        usadas.add(caPar.id);
        await prisma.parcelaPagar.update({ where: { id: local.id }, data: { idParcelaCA: caPar.id } });
        mapeadas++;
    }

    await prisma.contaPagar.update({
        where: { id: contaPagarId },
        data: { statusEnvioCA: 'ENVIADO', erroEnvioCA: null }
    });
    console.log(`[ContasPagar CA] ✅ Conta ${contaPagarId} ENVIADA (evento ${eventoId}), ${mapeadas}/${locais.length} parcela(s) mapeada(s).`);

    if (mapeadas < locais.length) {
        console.warn(`[ContasPagar CA] ⚠️ ${locais.length - mapeadas} parcela(s) local(is) sem match no CA (evento ${eventoId}) — baixa automática não vai cobri-las.`);
    }
}

// ─────────────────────────────────────────────────────────────
// Empurrar baixas "já paguei" (nascidas na conferência da nota) para o CA.
// Só processa pagamentos com statusEnvioCA='ENVIAR' cuja parcela já tem idParcelaCA
// (a despesa já foi criada/mapeada no CA). Guarda idBaixaCA para o worker 3 (conferência)
// não recriar a baixa localmente depois (dedup por idBaixaCA).
// ─────────────────────────────────────────────────────────────
async function _empurrarBaixasPendentes() {
    const pagamentos = await prisma.pagamentoParcelaPagar.findMany({
        where: {
            statusEnvioCA: 'ENVIAR',
            estornado: false,
            idBaixaCA: null,
            parcelaPagar: { idParcelaCA: { not: null } }
        },
        include: { parcelaPagar: true },
        take: 20,
        orderBy: { criadoEm: 'asc' }
    });
    if (pagamentos.length === 0) return;

    for (const pg of pagamentos) {
        const parcelaCA = pg.parcelaPagar.idParcelaCA;
        try {
            // Já quitada no CA (despesa adotada de lançamento manual já pago, ou baixa via DDA)?
            // Então NÃO empurra outra baixa — só marca ENVIADO para não duplicar pagamento.
            let naoPago = NaN;
            try {
                const det = await contaAzulService.buscarParcelaDetalhe(parcelaCA);
                const status = String(det?.status || '').toUpperCase();
                naoPago = Number(det?.nao_pago ?? NaN);
                if (status === 'QUITADO' || status === 'RECEBIDO' || (Number.isFinite(naoPago) && naoPago <= 0.01)) {
                    await prisma.pagamentoParcelaPagar.update({
                        where: { id: pg.id },
                        data: { statusEnvioCA: 'ENVIADO', erroEnvioCA: null }
                    });
                    console.log(`[ContasPagar CA] ↷ Parcela ${parcelaCA} já quitada no CA — baixa "já paguei" não reenviada.`);
                    continue;
                }
            } catch (_) { /* sem detalhe → tenta baixar assim mesmo */ }

            const contaFinanceira = pg.contaFinanceiraCaId || await resolverContaFinanceiraPadrao();
            const valorBaixa = (Number.isFinite(naoPago) && naoPago > 0)
                ? Math.min(Number(pg.valorPago), round2(naoPago))
                : Number(pg.valorPago);
            const metodo = METODOS_BAIXA_VALIDOS.has(pg.formaPagamento) ? pg.formaPagamento : undefined;

            const baixa = await contaAzulService.criarBaixa(parcelaCA, {
                data_pagamento: fmtDataCA(pg.dataPagamento),
                composicao_valor: { valor_bruto: round2(valorBaixa) },
                conta_financeira: contaFinanceira,
                ...(metodo ? { metodo_pagamento: metodo } : {}),
                observacao: pg.observacao || 'Baixa registrada no app Hardt (já paguei).'
            });

            await prisma.pagamentoParcelaPagar.update({
                where: { id: pg.id },
                data: { statusEnvioCA: 'ENVIADO', idBaixaCA: baixa?.id || null, erroEnvioCA: null }
            });
            await prisma.parcelaPagar.update({ where: { id: pg.parcelaPagarId }, data: { baixadoViaCA: true } }).catch(() => {});
            console.log(`[ContasPagar CA] 💸 Baixa "já paguei" empurrada ao CA (parcela ${parcelaCA}, R$ ${round2(valorBaixa)}).`);
        } catch (error) {
            const msg = erroCAtexto(error);
            console.error(`[ContasPagar CA] ❌ Falha ao empurrar baixa da parcela ${parcelaCA}:`, msg);
            // Mantém ENVIAR (tenta no próximo ciclo); grava o último erro para diagnóstico.
            await prisma.pagamentoParcelaPagar.update({ where: { id: pg.id }, data: { erroEnvioCA: msg } }).catch(() => {});
        }
        await sleep(600);
    }
}

// ─────────────────────────────────────────────────────────────
// WORKER 3 — Conferência de baixas no CA (30min)
// ─────────────────────────────────────────────────────────────

let _baixasRodando = false;

async function conferirBaixasCA() {
    if (_baixasRodando) return;
    _baixasRodando = true;
    const inicio = Date.now();
    try {
        if (!(await temTokenCA())) return;

        const parcelas = await prisma.parcelaPagar.findMany({
            where: {
                idParcelaCA: { not: null },
                status: { in: ['PENDENTE', 'PARCIAL'] },
                contaPagar: { status: { notIn: ['CANCELADO'] } }
            },
            select: { id: true, idParcelaCA: true, contaPagarId: true },
            take: 300 // teto de segurança por ciclo
        });
        if (parcelas.length === 0) return;

        console.log(`[ContasPagar CA] Conferindo baixas de ${parcelas.length} parcela(s) no CA...`);
        let novas = 0;

        // Lotes de 10 com pausa — bem abaixo do rate limit (600/min, 10/s)
        for (let i = 0; i < parcelas.length; i += 10) {
            const lote = parcelas.slice(i, i + 10);
            for (const parcela of lote) {
                try {
                    const resp = await contaAzulService._axiosGet(
                        `${BASE}/v1/financeiro/eventos-financeiros/parcelas/${parcela.idParcelaCA}/baixa`, 'CONTA_PAGAR_BAIXAS'
                    );
                    const baixas = Array.isArray(resp.data) ? resp.data : (resp.data?.itens || []);
                    if (baixas.length === 0) continue;

                    let alterou = false;
                    for (const baixa of baixas) {
                        if (!baixa?.id) continue;
                        const jaExiste = await prisma.pagamentoParcelaPagar.findUnique({ where: { idBaixaCA: baixa.id } });
                        if (jaExiste) continue;

                        // Na RESPOSTA o campo chama valor_composicao (no request é composicao_valor — literal na spec)
                        const comp = baixa.valor_composicao || baixa.composicao_valor || {};
                        await prisma.pagamentoParcelaPagar.create({
                            data: {
                                parcelaPagarId: parcela.id,
                                valorPago: Number(comp.valor_bruto || 0),
                                juros: Number(comp.juros || 0),
                                multa: Number(comp.multa || 0),
                                desconto: Number(comp.desconto || 0),
                                formaPagamento: mapMetodoCA(baixa.metodo_pagamento),
                                dataPagamento: parseDataCA(baixa.data_pagamento) || new Date(),
                                // De qual banco/caixa saiu o pagamento (na baixa do CA é UUID; às vezes objeto)
                                contaFinanceiraCaId: extrairContaFinanceiraId(baixa.conta_financeira),
                                observacao: baixa.observacao || 'Baixa sincronizada do Conta Azul',
                                origem: 'CA',
                                idBaixaCA: baixa.id
                            }
                        });
                        novas++;
                        alterou = true;
                    }

                    if (alterou) {
                        await prisma.parcelaPagar.update({ where: { id: parcela.id }, data: { baixadoViaCA: true } });
                        await recalcularParcelaEConta(prisma, parcela.id);
                    }
                } catch (error) {
                    if (error?.response?.status !== 404) {
                        console.warn(`[ContasPagar CA] Falha ao conferir baixas da parcela ${parcela.id}:`, erroCAtexto(error));
                    }
                }
                await sleep(300);
            }
            await sleep(1500); // pausa entre lotes
        }

        const dur = ((Date.now() - inicio) / 1000).toFixed(1);
        console.log(`[ContasPagar CA] Conferência de baixas concluída: ${novas} baixa(s) nova(s) em ${dur}s.`);
    } catch (error) {
        console.error('[ContasPagar CA] Erro no worker de baixas (isolado):', error.message);
    } finally {
        _baixasRodando = false;
    }
}

// ─────────────────────────────────────────────────────────────
// Sincronização da lista de contas financeiras (bancos/caixas) do CA
// Popula a tabela local contas_financeiras (nome do banco) para exibir
// "por qual conta" nos relatórios sem precisar chamar o CA a cada tela.
// ─────────────────────────────────────────────────────────────
async function sincronizarContasFinanceiras() {
    if (!(await temTokenCA())) return { ok: false, motivo: 'sem token CA' };
    let contas;
    try {
        contas = await contaAzulService.listarContasFinanceiras();
    } catch (error) {
        console.warn('[ContasPagar CA] Falha ao sincronizar contas financeiras:', erroCAtexto(error));
        return { ok: false, motivo: erroCAtexto(error) };
    }
    let upserts = 0;
    for (const c of contas) {
        if (!c?.id) continue;
        try {
            await prisma.contaFinanceira.upsert({
                where: { id: c.id },
                update: { nomeBanco: c.nome || 'Conta', tipoUso: c.tipo || 'OUTROS', ativo: true, obs: c.banco || null },
                create: { id: c.id, nomeBanco: c.nome || 'Conta', tipoUso: c.tipo || 'OUTROS', ativo: true, obs: c.banco || null }
            });
            upserts++;
        } catch (e) {
            console.warn(`[ContasPagar CA] Falha ao upsert conta financeira ${c.id}:`, e.message);
        }
    }
    console.log(`[ContasPagar CA] Contas financeiras sincronizadas: ${upserts}.`);
    return { ok: true, total: contas.length, upserts };
}

// ─────────────────────────────────────────────────────────────
// Backfill: preenche contaFinanceiraCaId nas baixas de CONTAS A PAGAR já
// registradas que não têm o banco (baixas antigas, feitas antes desta feature,
// ou puxadas do DDA quando o campo era ignorado). Relê as baixas no CA e casa
// pelo idBaixaCA. Idempotente e limitado por ciclo (rate limit do CA).
// ─────────────────────────────────────────────────────────────
async function backfillContasFinanceirasPagar(limiteParcelas = 300) {
    if (!(await temTokenCA())) return { ok: false, motivo: 'sem token CA' };

    // Parcelas cujo ledger tem ao menos um pagamento sem conta e que estão mapeadas no CA
    const parcelas = await prisma.parcelaPagar.findMany({
        where: {
            idParcelaCA: { not: null },
            pagamentos: { some: { contaFinanceiraCaId: null, estornado: false } }
        },
        select: { id: true, idParcelaCA: true },
        take: limiteParcelas
    });
    if (parcelas.length === 0) return { ok: true, parcelas: 0, atualizadas: 0 };

    let atualizadas = 0;
    for (let i = 0; i < parcelas.length; i += 10) {
        const lote = parcelas.slice(i, i + 10);
        for (const parcela of lote) {
            try {
                const resp = await contaAzulService._axiosGet(
                    `${BASE}/v1/financeiro/eventos-financeiros/parcelas/${parcela.idParcelaCA}/baixa`, 'CONTA_PAGAR_BAIXAS'
                );
                const baixas = Array.isArray(resp.data) ? resp.data : (resp.data?.itens || []);
                for (const baixa of baixas) {
                    const contaFin = extrairContaFinanceiraId(baixa.conta_financeira);
                    if (!baixa?.id || !contaFin) continue;
                    const r = await prisma.pagamentoParcelaPagar.updateMany({
                        where: { idBaixaCA: baixa.id, contaFinanceiraCaId: null },
                        data: { contaFinanceiraCaId: contaFin }
                    });
                    atualizadas += r.count;
                }
            } catch (error) {
                if (error?.response?.status !== 404) {
                    console.warn(`[ContasPagar CA] Backfill: falha na parcela ${parcela.id}:`, erroCAtexto(error));
                }
            }
            await sleep(300);
        }
        await sleep(1500);
    }
    console.log(`[ContasPagar CA] Backfill conta financeira (pagar): ${atualizadas} baixa(s) atualizada(s) de ${parcelas.length} parcela(s).`);
    return { ok: true, parcelas: parcelas.length, atualizadas };
}

module.exports = {
    processarFilaFornecedores,
    processarFilaDespesas,
    conferirBaixasCA,
    sincronizarContasFinanceiras,
    backfillContasFinanceirasPagar,
    extrairContaFinanceiraId,
    importarFornecedoresCA,
    listarCategoriasDespesaSeguro,
    listarContasFinanceirasSeguro,
    METODOS_PAGAMENTO_BAIXA,
    METODOS_BAIXA_VALIDOS,
    resolverContaFinanceiraPadrao,
    recalcularParcelaEConta,
    calcularStatusParcelaPagar,
    calcularStatusContaPagar,
    // Idempotência / reconciliação (usados pela rota admin-exec)
    _encontrarEventoPorReferencia,
    _encontrarEventoPorNumeroNota,
    _mapearParcelasCA
};
