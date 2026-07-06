/**
 * Notas Recebidas (NF-e capturadas na SEFAZ) — Fase 2 do módulo financeiro.
 *
 * Caixa de entrada das notas emitidas contra o nosso CNPJ:
 *   listar/detalhar, baixar XML, ignorar/reativar e GERAR CONTA A PAGAR a partir
 *   da nota (com de-para produto do fornecedor → item PCP, lembrado por CNPJ).
 *
 * Permissões (padrão do contasPagar.js):
 *   ver   → admin ou Pode_Acessar_Notas_Recebidas
 *   ações → admin ou Pode_Baixar_Contas_Pagar
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const sefazDfeService = require('../services/sefazDfeService');
const nfseAdnService = require('../services/nfseAdnService');
const { montarDanfeHtml } = require('../services/danfeHtmlService');
const contasPagarCaSyncService = require('../services/contasPagarCaSyncService');
const googleDriveService = require('../services/googleDriveService');

// Caminho absoluto do XML salvo da nota (uploads/notas-xml/{chave}.xml).
const xmlAbsPath = (nota) => {
    if (nota.xmlPath) {
        return path.isAbsolute(nota.xmlPath) ? nota.xmlPath : path.join(__dirname, '..', nota.xmlPath);
    }
    return path.join(__dirname, '..', 'uploads', 'notas-xml', `${nota.chave}.xml`);
};

// Parse ao vivo do XML salvo (para notas já capturadas antes dos novos campos). null se não houver arquivo.
// Só para NF-e — a NFS-e já nasce com tudo preenchido na captura.
const parseXmlSalvo = (nota) => {
    try {
        if (nota.tipo !== 'NFE') return null;
        const abs = xmlAbsPath(nota);
        if (!fs.existsSync(abs)) return null;
        return sefazDfeService.parseProcNFe(fs.readFileSync(abs, 'utf8'));
    } catch (e) {
        console.warn('[NotasEntrada] Falha ao parsear XML salvo:', e.message);
        return null;
    }
};

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkAcesso = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Acessar_Notas_Recebidas) {
        return res.status(403).json({ error: 'Sem permissão para acessar as notas recebidas.' });
    }
    next();
};

const checkEscrita = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Baixar_Contas_Pagar) {
        return res.status(403).json({ error: 'Sem permissão para executar ações nas notas recebidas.' });
    }
    next();
};

const num = (v) => (v == null ? null : Number(v));
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const round4 = (v) => Math.round(Number(v) * 10000) / 10000;

/**
 * Rateio proporcional ao valor da nota (vNF), agrupando itens por categoria efetiva.
 * PURA e testável. Chave do grupo = categoriaCaId || nome da categoria.
 * O ÚLTIMO grupo absorve a diferença de arredondamento para a soma bater EXATO com vNF.
 * Sem itens (soma vProd == 0) → rateio único com a categoria padrão e valor = vNF.
 *
 * @param {number} vNF                valor total da nota
 * @param {Array}  itens              [{ vProd, categoria, categoriaCaId }]
 * @param {object} padrao            { categoria, categoriaCaId } fallback
 * @returns {Array} [{ categoria, categoriaCaId, valor }]
 */
const calcularRateio = (vNF, itens, padrao = {}) => {
    const total = round2(vNF);
    const somaVProd = round2((itens || []).reduce((s, i) => s + (Number(i.vProd) || 0), 0));

    if (!itens || itens.length === 0 || somaVProd <= 0) {
        return [{ categoria: padrao.categoria || null, categoriaCaId: padrao.categoriaCaId || null, valor: total }];
    }

    // Agrupa preservando a ordem de 1ª aparição
    const grupos = [];
    const idx = new Map();
    for (const it of itens) {
        const categoria = it.categoria || padrao.categoria || null;
        const categoriaCaId = it.categoriaCaId || padrao.categoriaCaId || null;
        const chave = categoriaCaId || categoria || '__sem__';
        if (!idx.has(chave)) {
            idx.set(chave, grupos.length);
            grupos.push({ categoria, categoriaCaId, somaVProd: 0 });
        }
        grupos[idx.get(chave)].somaVProd += (Number(it.vProd) || 0);
    }

    let acumulado = 0;
    return grupos.map((g, i) => {
        let valor;
        if (i === grupos.length - 1) {
            valor = round2(total - acumulado); // último absorve a diferença
        } else {
            valor = round2(total * (g.somaVProd / somaVProd));
            acumulado = round2(acumulado + valor);
        }
        return { categoria: g.categoria, categoriaCaId: g.categoriaCaId, valor };
    });
};

const parseVencimento = (v) => {
    const s = String(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00-03:00`) : new Date(s);
};

const formatarNotaLista = (n) => ({
    id: n.id,
    tipo: n.tipo,
    chave: n.chave,
    numero: n.numero,
    fornecedorNome: n.fornecedorNome,
    fornecedorCnpj: n.fornecedorCnpj,
    emissao: n.emissao,
    valorTotal: num(n.valorTotal),
    status: n.status,
    contaPagarId: n.contaPagarId
});

// ── GET / — caixa de entrada + status da captura ──
router.get('/', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { status, busca } = req.query;

        const where = {};
        if (status) where.status = status;
        if (busca?.trim()) {
            const b = busca.trim();
            where.OR = [
                { chave: { contains: b.replace(/\D/g, '') || b } },
                { numero: { contains: b, mode: 'insensitive' } },
                { fornecedorNome: { contains: b, mode: 'insensitive' } },
                { fornecedorCnpj: { contains: b.replace(/\D/g, '') || b } }
            ];
        }

        const [notas, novas, aguardandoXml, captura, capturaNfse] = await Promise.all([
            prisma.notaEntrada.findMany({
                where,
                orderBy: [{ emissao: { sort: 'desc', nulls: 'last' } }, { criadoEm: 'desc' }],
                take: 500
            }),
            prisma.notaEntrada.count({ where: { status: 'NOVA' } }),
            prisma.notaEntrada.count({ where: { status: 'AGUARDANDO_XML' } }),
            sefazDfeService.statusCaptura(),
            nfseAdnService.statusCaptura()
        ]);

        res.json({
            statusCaptura: {
                ativa: captura.ativa,
                ultimaConsulta: captura.ultimaConsulta,
                ultimoResultado: captura.ultimoResultado,
                bloqueadoAte: captura.bloqueadoAte,
                novas,
                aguardandoXml
            },
            statusCapturaNfse: {
                ativa: capturaNfse.ativa,
                ultimaConsulta: capturaNfse.ultimaConsulta,
                ultimoResultado: capturaNfse.ultimoResultado,
                bloqueadoAte: capturaNfse.bloqueadoAte
            },
            notas: notas.map(formatarNotaLista)
        });
    } catch (error) {
        console.error('Erro ao listar notas recebidas:', error);
        res.status(500).json({ error: 'Erro ao listar notas recebidas.' });
    }
});

// ── GET /itens-pcp — busca no catálogo de Produtos para o de-para ──
// Retorna { tipo:'PRODUTO', id, value:'PROD:<id>', nome, unidade, sub }.
// Só o catálogo de produtos (tabela `produto`) — insumos PCP NÃO entram aqui.
// Sem limite: a tela carrega tudo e filtra a busca no cliente. `?busca=` filtra também no banco.
router.get('/itens-pcp', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const busca = req.query.busca?.trim();
        const b = busca || '';

        const whereProd = { ativo: true };
        if (busca) {
            whereProd.OR = [
                { nome: { contains: b, mode: 'insensitive' } },
                { codigo: { contains: b, mode: 'insensitive' } },
                { ean: { contains: b, mode: 'insensitive' } }
            ];
        }

        const produtos = await prisma.produto.findMany({
            where: whereProd,
            select: { id: true, codigo: true, nome: true, unidade: true, categoria: true },
            orderBy: { nome: 'asc' }
        });

        const opcoes = produtos.map((p) => ({
            tipo: 'PRODUTO',
            id: p.id,
            value: `PROD:${p.id}`,
            nome: p.nome,
            unidade: p.unidade,
            sub: `Produto${p.codigo ? ` · ${p.codigo}` : ''}${p.categoria ? ` · ${p.categoria}` : ''}`
        }));

        res.json(opcoes);
    } catch (error) {
        console.error('Erro ao buscar produtos:', error);
        res.status(500).json({ error: 'Erro ao buscar produtos.' });
    }
});

// ── POST /consultar-agora — dispara os ciclos de captura (NF-e e NFS-e) em background ──
// (antes de /:id para a rota não ser engolida pelo parâmetro)
router.post('/consultar-agora', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const [preNfe, preNfse] = await Promise.all([
            sefazDfeService.podeConsultar(),
            nfseAdnService.podeConsultar()
        ]);
        if (!preNfe.ok && !preNfse.ok) {
            return res.json({ ok: false, iniciado: false, motivo: preNfe.motivo || preNfse.motivo });
        }

        if (preNfe.ok) {
            sefazDfeService.executarCiclo()
                .catch((e) => console.error('[NotasEntrada] Erro no ciclo manual NF-e:', e.message));
        }
        if (preNfse.ok) {
            nfseAdnService.executarCiclo()
                .catch((e) => console.error('[NotasEntrada] Erro no ciclo manual NFS-e:', e.message));
        }

        res.json({ ok: true, iniciado: true });
    } catch (error) {
        console.error('Erro ao iniciar consulta à SEFAZ:', error);
        res.status(500).json({ error: 'Erro ao iniciar consulta à SEFAZ.' });
    }
});

// ── GET /:id — detalhe da nota com itens (+ de-para lembrado) e duplicatas ──
router.get('/:id', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({
            where: { id: req.params.id },
            include: {
                fornecedor: { select: { id: true, razaoSocial: true, nomeFantasia: true, contaAzulId: true } },
                itens: { orderBy: { numeroItem: 'asc' } },
                duplicatas: { orderBy: { vencimento: 'asc' } }
            }
        });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

        // De-para lembrado: match por (fornecedorCnpj + codigoFornecedor), fallback EAN
        const vinculos = nota.fornecedorCnpj
            ? await prisma.fornecedorProdutoVinculo.findMany({
                where: { fornecedorCnpj: nota.fornecedorCnpj },
                include: {
                    itemPcp: { select: { id: true, nome: true, unidade: true } },
                    produto: { select: { id: true, nome: true, unidade: true } }
                }
            })
            : [];
        const porCodigo = new Map(vinculos.map((v) => [v.codigoFornecedor, v]));
        const porEan = new Map(vinculos.filter((v) => v.ean).map((v) => [v.ean, v]));

        // Parse ao vivo do XML salvo — só quando faltar algum dado no banco (notas antigas).
        const precisaXml = nota.infComplementar == null || nota.itens.some((i) => i.infAdProd == null);
        const parsed = precisaXml ? parseXmlSalvo(nota) : null;
        const parsedItens = new Map((parsed?.itens || []).map((i) => [String(i.codigoFornecedor), i]));

        const itens = nota.itens.map((item) => {
            const v = porCodigo.get(item.codigoFornecedor) || (item.ean ? porEan.get(item.ean) : null) || null;
            // Memória existe se houver vínculo de produto (Produto ou ItemPcp) OU categoria memorizada
            const temMemoria = v && (v.produtoId != null || v.itemPcpId != null || v.categoria != null || v.categoriaCaId != null);
            const px = parsedItens.get(String(item.codigoFornecedor));

            // Resolve o alvo do vínculo (Produto tem prioridade se ambos setados, mas gravamos só um)
            const alvo = v && v.produtoId
                ? { value: `PROD:${v.produtoId}`, nome: v.produto?.nome || null, unidade: v.produto?.unidade || null }
                : (v && v.itemPcpId
                    ? { value: `PCP:${v.itemPcpId}`, nome: v.itemPcp?.nome || null, unidade: v.itemPcp?.unidade || null }
                    : { value: null, nome: null, unidade: null });
            return {
                id: item.id,
                numeroItem: item.numeroItem,
                codigoFornecedor: item.codigoFornecedor,
                ean: item.ean,
                descricao: item.descricao,
                ncm: item.ncm,
                unidade: item.unidade,
                quantidade: num(item.quantidade),
                valorUnitario: num(item.valorUnitario),
                valorTotal: num(item.valorTotal),
                categoria: item.categoria || null,
                categoriaCaId: item.categoriaCaId || null,
                infAdProd: item.infAdProd || px?.infAdProd || null,
                vinculo: temMemoria
                    ? {
                        value: alvo.value,          // "PROD:<id>" | "PCP:<id>" | null
                        nome: alvo.nome,            // nome do produto/insumo vinculado
                        unidade: alvo.unidade,      // unidade "nossa" (para conversão/custo)
                        // legado — mantido para telas antigas de detalhe:
                        itemPcpId: v.itemPcpId || null,
                        itemPcpNome: alvo.nome,
                        itemPcpUnidade: alvo.unidade,
                        fatorConversao: num(v.fatorConversao),
                        categoria: v.categoria || null,
                        categoriaCaId: v.categoriaCaId || null,
                        lembrado: true
                    }
                    : null
            };
        });

        res.json({
            id: nota.id,
            tipo: nota.tipo,
            chave: nota.chave,
            nsu: nota.nsu,
            numero: nota.numero,
            serie: nota.serie,
            fornecedorCnpj: nota.fornecedorCnpj,
            fornecedorNome: nota.fornecedorNome,
            fornecedor: nota.fornecedor
                ? { id: nota.fornecedor.id, razaoSocial: nota.fornecedor.razaoSocial, nomeFantasia: nota.fornecedor.nomeFantasia, sincronizadoCA: !!nota.fornecedor.contaAzulId }
                : null,
            emissao: nota.emissao,
            valorTotal: num(nota.valorTotal),
            status: nota.status,
            manifestada: nota.manifestada,
            observacoes: nota.infComplementar || parsed?.infComplementar || null,
            temXml: !!nota.xmlPath,
            contaPagarId: nota.contaPagarId,
            criadoEm: nota.criadoEm,
            itens,
            duplicatas: nota.duplicatas.map((d) => ({
                numero: d.numero,
                vencimento: d.vencimento,
                valor: num(d.valor)
            }))
        });
    } catch (error) {
        console.error('Erro ao detalhar nota recebida:', error);
        res.status(500).json({ error: 'Erro ao detalhar nota recebida.' });
    }
});

// ── GET /:id/xml — download do XML completo ──
router.get('/:id/xml', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (!nota.xmlPath) return res.status(404).json({ error: 'O XML completo desta nota ainda não foi baixado da SEFAZ.' });

        const abs = path.isAbsolute(nota.xmlPath)
            ? nota.xmlPath
            : path.join(__dirname, '..', nota.xmlPath);
        if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Arquivo XML não encontrado no servidor.' });

        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${nota.chave}.xml"`);
        fs.createReadStream(abs).pipe(res);
    } catch (error) {
        console.error('Erro ao baixar XML da nota:', error);
        res.status(500).json({ error: 'Erro ao baixar o XML da nota.' });
    }
});

// ── GET /:id/danfe — DANFE (NF-e) ou espelho da NFS-e em HTML, do XML salvo ──
router.get('/:id/danfe', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

        const abs = xmlAbsPath(nota);
        if (!fs.existsSync(abs)) {
            return res.status(404).json({ error: 'O XML completo desta nota ainda não foi baixado — não é possível gerar a impressão.' });
        }

        let html;
        try {
            const xmlString = fs.readFileSync(abs, 'utf8');
            html = nota.tipo === 'NFSE'
                ? nfseAdnService.montarEspelhoNfseHtml(xmlString)
                : montarDanfeHtml(xmlString); // recebe a STRING crua do XML e parseia tudo internamente
        } catch (e) {
            return res.status(422).json({ error: `Não foi possível ler o XML da nota: ${e.message}` });
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (error) {
        console.error('Erro ao gerar DANFE da nota:', error);
        res.status(500).json({ error: 'Erro ao gerar a DANFE da nota.' });
    }
});

// ── Gera o próximo código sequencial de item PCP por tipo (ex.: MP-001) ──
const proximoCodigoItemPcp = async (tx, tipo) => {
    const prefixo = `${tipo}-`;
    const existentes = await tx.itemPcp.findMany({
        where: { codigo: { startsWith: prefixo } },
        select: { codigo: true }
    });
    let maior = 0;
    const re = new RegExp(`^${tipo}-(\\d+)$`);
    for (const it of existentes) {
        const m = re.exec(it.codigo);
        if (m) maior = Math.max(maior, parseInt(m[1], 10));
    }
    return `${prefixo}${String(maior + 1).padStart(3, '0')}`;
};

// Decodifica o vínculo unificado "PROD:<id>" / "PCP:<id>" → { produtoId, itemPcpId } (o não usado = null)
const decodeVinculo = (value) => {
    const s = String(value || '');
    if (s.startsWith('PROD:')) return { produtoId: s.slice(5) || null, itemPcpId: null };
    if (s.startsWith('PCP:')) return { produtoId: null, itemPcpId: s.slice(4) || null };
    return { produtoId: null, itemPcpId: null };
};

// ── POST /:id/gerar-conta — cria a Conta a Pagar a partir da nota ──
router.post('/:id/gerar-conta', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const { categoriaPadrao, categoriaPadraoCaId, enviarCA, observacoes, parcelas, itens,
                metodoPagamento, contaFinanceiraCaId, pago, dataPagamento } = req.body;

        const nota = await prisma.notaEntrada.findUnique({
            where: { id: req.params.id },
            include: { itens: true, fornecedor: true }
        });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (nota.contaPagarId) return res.status(400).json({ error: 'Esta nota já tem uma conta a pagar gerada.' });
        if (nota.status !== 'NOVA') {
            return res.status(400).json({ error: `Só é possível gerar conta de nota com status NOVA (status atual: ${nota.status}).` });
        }

        // ── Parcelas ──
        if (!Array.isArray(parcelas) || parcelas.length === 0) {
            return res.status(400).json({ error: 'Informe ao menos uma parcela.' });
        }
        for (const p of parcelas) {
            const valor = Number(p?.valor);
            if (!Number.isFinite(valor) || valor <= 0) return res.status(400).json({ error: 'Toda parcela precisa de um valor maior que zero.' });
            if (!p?.dataVencimento || isNaN(new Date(p.dataVencimento).getTime())) return res.status(400).json({ error: 'Toda parcela precisa de uma data de vencimento válida.' });
        }
        const somaParcelas = round2(parcelas.reduce((s, p) => s + Number(p.valor), 0));
        if (nota.valorTotal != null && Math.abs(somaParcelas - Number(nota.valorTotal)) > 0.01) {
            return res.status(400).json({
                error: `A soma das parcelas (R$ ${somaParcelas.toFixed(2)}) precisa ser igual ao total da nota (R$ ${Number(nota.valorTotal).toFixed(2)}).`
            });
        }

        // ── Fornecedor (garantia extra — normalmente já veio da captura) ──
        let fornecedor = nota.fornecedor;
        if (!fornecedor && nota.fornecedorCnpj) {
            fornecedor = await prisma.fornecedor.findFirst({ where: { cnpjCpf: nota.fornecedorCnpj } });
            if (!fornecedor) {
                fornecedor = await prisma.fornecedor.create({
                    data: {
                        cnpjCpf: nota.fornecedorCnpj,
                        razaoSocial: nota.fornecedorNome || `Fornecedor ${nota.fornecedorCnpj}`,
                        origem: nota.tipo === 'NFSE' ? 'NFSE' : 'NFE',
                        statusEnvioCA: 'NAO_ENVIAR'
                    }
                });
            }
        }
        if (enviarCA && !fornecedor) {
            return res.status(400).json({ error: 'Para enviar ao Conta Azul é obrigatório a nota ter fornecedor identificado.' });
        }

        // ── Condição de pagamento (forma + banco) — OBRIGATÓRIA ao enviar ao Conta Azul.
        // Vai no payload da despesa (metodo_pagamento + conta_financeira de cada parcela).
        // Se "pago" = true ("já paguei"), também registra a baixa e marca para quitar no CA.
        let condicaoCA = null; // { metodoPagamento, contaFinanceiraCaId }
        let pagto = null;      // preenchido só quando "já paguei"
        if (enviarCA) {
            const metodo = String(metodoPagamento || '').toUpperCase();
            if (!contasPagarCaSyncService.METODOS_BAIXA_VALIDOS.has(metodo)) {
                return res.status(400).json({ error: 'Escolha a forma de pagamento.' });
            }
            if (!contaFinanceiraCaId) {
                return res.status(400).json({ error: 'Escolha o banco/caixa da despesa.' });
            }
            condicaoCA = { metodoPagamento: metodo, contaFinanceiraCaId: String(contaFinanceiraCaId) };
            if (pago) {
                if (!dataPagamento || isNaN(new Date(dataPagamento).getTime())) {
                    return res.status(400).json({ error: 'Informe uma data de pagamento válida.' });
                }
                pagto = { ...condicaoCA, dataPagamento: parseVencimento(dataPagamento) };
            }
        }

        // ── Validação dos itens do de-para ──
        const itensBody = Array.isArray(itens) ? itens : [];
        const itensNota = new Map(nota.itens.map((i) => [i.id, i]));
        for (const it of itensBody) {
            if (!it?.itemId || !itensNota.has(it.itemId)) {
                return res.status(400).json({ error: 'Item informado não pertence a esta nota.' });
            }
            if (it.criarItemPcp) {
                const { nome, tipo, unidade } = it.criarItemPcp;
                if (!nome?.trim()) return res.status(400).json({ error: 'Informe o nome do novo item PCP.' });
                if (!['MP', 'SUB', 'PA', 'EMB'].includes(tipo)) return res.status(400).json({ error: 'Tipo do novo item PCP inválido (use MP, SUB, PA ou EMB).' });
                if (!unidade?.trim()) return res.status(400).json({ error: 'Informe a unidade do novo item PCP.' });
            }
        }

        const catPadrao = categoriaPadrao?.trim() || null;
        const catPadraoCaId = categoriaPadraoCaId || null;
        const porItemId = new Map(itensBody.map((it) => [it.itemId, it]));

        // ── Categoria efetiva de cada item (própria ou padrão) para o rateio ──
        const itensParaRateio = nota.itens.map((itemNota) => {
            const body = porItemId.get(itemNota.id);
            return {
                categoria: body?.categoria?.trim() || catPadrao,
                categoriaCaId: body?.categoriaCaId || catPadraoCaId,
                vProd: Number(itemNota.valorTotal) || 0
            };
        });

        // vNF = total da nota (fallback para soma das parcelas quando a nota não tem valor)
        const vNF = nota.valorTotal != null ? Number(nota.valorTotal) : somaParcelas;
        const rateio = calcularRateio(vNF, itensParaRateio, { categoria: catPadrao, categoriaCaId: catPadraoCaId });

        // ── Ao enviar ao CA, todo grupo precisa de categoriaCaId ──
        if (enviarCA) {
            const gruposSemCa = rateio.filter((g) => !g.categoriaCaId);
            if (gruposSemCa.length > 0) {
                const nomes = gruposSemCa.map((g) => g.categoria || '(sem categoria)').join(', ');
                return res.status(400).json({
                    error: `Para enviar à Conta Azul, defina a categoria (da lista da Conta Azul) dos itens: ${nomes}`
                });
            }
        }

        // ── Categoria/ID resultantes da conta (único grupo → aquele; senão "Vários") ──
        const categoriaConta = rateio.length === 1 ? (rateio[0].categoria || null) : 'Vários';
        const categoriaContaCaId = rateio.length === 1 ? (rateio[0].categoriaCaId || null) : null;

        let contaCriada;
        const entradasEstoque = []; // Fase 6: itens vinculados → entrada de estoque/custo após a transação
        await prisma.$transaction(async (tx) => {
            // 1) Cria itens PCP pedidos, resolve o de-para e memoriza produto+categoria
            for (const it of itensBody) {
                const itemNota = itensNota.get(it.itemId);

                // Decodifica o vínculo unificado (PROD:/PCP:) ou cria um ItemPcp novo.
                let { produtoId, itemPcpId } = decodeVinculo(it.vinculo);
                if (!produtoId && !itemPcpId && it.criarItemPcp) {
                    const codigo = await proximoCodigoItemPcp(tx, it.criarItemPcp.tipo);
                    const novo = await tx.itemPcp.create({
                        data: {
                            codigo,
                            nome: it.criarItemPcp.nome.trim(),
                            tipo: it.criarItemPcp.tipo,
                            unidade: it.criarItemPcp.unidade.trim().toUpperCase(),
                            ativo: true
                        }
                    });
                    itemPcpId = novo.id;
                }
                const temProduto = !!(produtoId || itemPcpId);
                if (temProduto && nota.tipo !== 'NFSE') {
                    entradasEstoque.push({
                        itemNota,
                        produtoId: produtoId || null,
                        itemPcpId: itemPcpId || null,
                        fator: Number(it.fatorConversao) > 0 ? round4(it.fatorConversao) : 1
                    });
                }

                const catItem = it.categoria?.trim() || catPadrao;
                const catItemCaId = it.categoriaCaId || catPadraoCaId;

                // Persiste categoria efetiva no item da nota
                await tx.notaEntradaItem.update({
                    where: { id: itemNota.id },
                    data: { categoria: catItem, categoriaCaId: catItemCaId }
                });

                // Memória por fornecedor+cProd: grava se houver produto OU categoria
                const temCategoria = !!(catItem || catItemCaId);
                if (!nota.fornecedorCnpj || (!temProduto && !temCategoria)) continue;

                const fator = Number(it.fatorConversao) > 0 ? round4(it.fatorConversao) : 1;
                // update parcial: preserva campos existentes (não apaga memória de produto ao salvar só categoria)
                const updateData = {
                    ean: itemNota.ean,
                    descricaoFornecedor: itemNota.descricao,
                    unidadeFornecedor: itemNota.unidade
                };
                // Ao (re)vincular, define explicitamente o campo não usado como null — nunca deixa os dois setados.
                if (temProduto) {
                    updateData.produtoId = produtoId || null;
                    updateData.itemPcpId = itemPcpId || null;
                    updateData.fatorConversao = fator;
                }
                if (temCategoria) { updateData.categoria = catItem; updateData.categoriaCaId = catItemCaId; }

                await tx.fornecedorProdutoVinculo.upsert({
                    where: {
                        fornecedorCnpj_codigoFornecedor: {
                            fornecedorCnpj: nota.fornecedorCnpj,
                            codigoFornecedor: itemNota.codigoFornecedor
                        }
                    },
                    update: updateData,
                    create: {
                        fornecedorCnpj: nota.fornecedorCnpj,
                        codigoFornecedor: itemNota.codigoFornecedor,
                        ean: itemNota.ean,
                        descricaoFornecedor: itemNota.descricao,
                        unidadeFornecedor: itemNota.unidade,
                        produtoId: produtoId || null,
                        itemPcpId: itemPcpId || null,
                        fatorConversao: temProduto ? fator : 1,
                        categoria: temCategoria ? catItem : null,
                        categoriaCaId: temCategoria ? catItemCaId : null
                    }
                });
            }

            // 2) Cria a conta a pagar + parcelas + rateio
            contaCriada = await tx.contaPagar.create({
                data: {
                    fornecedorId: fornecedor?.id || null,
                    descricao: `${nota.tipo === 'NFSE' ? 'NFS-e' : 'NF-e'} ${nota.numero || 's/nº'} — ${fornecedor?.razaoSocial || nota.fornecedorNome}`,
                    categoria: categoriaConta,
                    categoriaCaId: categoriaContaCaId,
                    numeroNota: nota.numero,
                    chaveNfe: nota.chave,
                    origem: nota.tipo === 'NFSE' ? 'NFSE' : 'NFE',
                    competencia: nota.emissao,
                    observacoes: observacoes?.trim() || null,
                    valorTotal: somaParcelas,
                    status: 'ABERTO',
                    statusEnvioCA: enviarCA ? 'ENVIAR' : 'NAO_ENVIAR',
                    metodoPagamentoCA: condicaoCA?.metodoPagamento || null,
                    contaFinanceiraCaId: condicaoCA?.contaFinanceiraCaId || null,
                    criadoPorId: req.user.id,
                    parcelas: {
                        create: parcelas.map((p, i) => ({
                            numeroParcela: i + 1,
                            valor: round2(p.valor),
                            dataVencimento: parseVencimento(p.dataVencimento)
                        }))
                    },
                    rateios: {
                        create: rateio.map((g) => ({
                            categoria: g.categoria || null,
                            categoriaCaId: g.categoriaCaId || null,
                            valor: round2(g.valor)
                        }))
                    }
                }
            });

            // 3) Fornecedor sem vínculo no CA entra na fila de envio (o worker cria lá primeiro)
            if (enviarCA && fornecedor && !fornecedor.contaAzulId && ['NAO_ENVIAR', 'ERRO'].includes(fornecedor.statusEnvioCA)) {
                await tx.fornecedor.update({
                    where: { id: fornecedor.id },
                    data: { statusEnvioCA: 'ENVIAR', erroEnvioCA: null }
                });
            }

            // 3.5) "Já paguei": registra o pagamento (baixa) local em cada parcela e marca para
            // empurrar a baixa ao CA (o worker faz isso depois de mapear a parcela no CA).
            if (pagto) {
                const parcelasCriadas = await tx.parcelaPagar.findMany({
                    where: { contaPagarId: contaCriada.id },
                    orderBy: { numeroParcela: 'asc' }
                });
                const labelMetodo = contasPagarCaSyncService.METODOS_PAGAMENTO_BAIXA
                    .find((m) => m.value === pagto.metodoPagamento)?.label || pagto.metodoPagamento;
                for (const p of parcelasCriadas) {
                    await tx.pagamentoParcelaPagar.create({
                        data: {
                            parcelaPagarId: p.id,
                            valorPago: round2(p.valor),
                            dataPagamento: pagto.dataPagamento,
                            formaPagamento: pagto.metodoPagamento,       // enum do CA (empurrado como metodo_pagamento)
                            contaFinanceiraCaId: pagto.contaFinanceiraCaId,
                            statusEnvioCA: 'ENVIAR',                      // worker empurra a baixa ao CA
                            origem: 'MANUAL',
                            observacao: `Pago na entrada da nota (${labelMetodo}).`,
                            registradoPorId: req.user.id
                        }
                    });
                    await contasPagarCaSyncService.recalcularParcelaEConta(tx, p.id);
                }
            }

            // 4) Nota conferida e vinculada à conta
            await tx.notaEntrada.update({
                where: { id: nota.id },
                data: { status: 'CONFERIDA', contaPagarId: contaCriada.id, fornecedorId: fornecedor?.id || nota.fornecedorId }
            });
        }, { timeout: 20000, maxWait: 10000 });

        // 5) Salva o XML na pasta do mês na Contabilidade (Drive) — best-effort, não bloqueia a entrada.
        googleDriveService.salvarXmlNota(nota, xmlAbsPath(nota))
            .catch((err) => console.error('[NotasEntrada] Drive (gerar-conta):', err?.message || err));

        // 6) Fase 6 — itens vinculados dão ENTRADA no estoque, atualizam o custo e
        // alimentam o histórico de compras. Best-effort: falha aqui NÃO desfaz a conta.
        let estoque = { registradas: 0, avisos: [] };
        if (entradasEstoque.length > 0) {
            try {
                const compraEstoqueService = require('../services/compraEstoqueService');
                estoque = await compraEstoqueService.registrarEntradasCompra(
                    nota, contaCriada.id, entradasEstoque, req.user.id
                );
            } catch (e) {
                console.error('[NotasEntrada] Falha geral na entrada de estoque:', e.message);
                estoque.avisos.push('Falha na entrada de estoque — ajuste manualmente se necessário.');
            }
        }

        res.status(201).json({
            message: pagto
                ? 'Conta a pagar criada como PAGA — será marcada como quitada no Conta Azul!'
                : (enviarCA
                    ? 'Conta a pagar criada e colocada na fila de envio ao Conta Azul!'
                    : 'Conta a pagar criada!'),
            contaPagarId: contaCriada.id,
            notaStatus: 'CONFERIDA',
            estoque: { entradas: estoque.registradas, avisos: estoque.avisos }
        });
    } catch (error) {
        console.error('Erro ao gerar conta a pagar da nota:', error);
        res.status(500).json({ error: 'Erro ao gerar a conta a pagar da nota.' });
    }
});

// ── POST /:id/ignorar ──
router.post('/:id/ignorar', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (!['NOVA', 'AGUARDANDO_XML'].includes(nota.status)) {
            return res.status(400).json({ error: `Nota com status ${nota.status} não pode ser ignorada.` });
        }
        await prisma.notaEntrada.update({ where: { id: nota.id }, data: { status: 'IGNORADA' } });
        // XML da ignorada vai para a subpasta "Ignoradas" do mês (Drive) — best-effort.
        if (nota.xmlPath) {
            googleDriveService.salvarXmlNota(nota, xmlAbsPath(nota), { ignorada: true })
                .catch((err) => console.error('[NotasEntrada] Drive (ignorar):', err?.message || err));
        }
        res.json({ message: 'Nota ignorada.', status: 'IGNORADA' });
    } catch (error) {
        console.error('Erro ao ignorar nota:', error);
        res.status(500).json({ error: 'Erro ao ignorar a nota.' });
    }
});

// ── POST /:id/reativar ──
router.post('/:id/reativar', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id } });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (nota.status !== 'IGNORADA') {
            return res.status(400).json({ error: 'Só notas ignoradas podem ser reativadas.' });
        }
        const novoStatus = nota.xmlPath ? 'NOVA' : 'AGUARDANDO_XML';
        await prisma.notaEntrada.update({ where: { id: nota.id }, data: { status: novoStatus } });
        res.json({ message: 'Nota reativada.', status: novoStatus });
    } catch (error) {
        console.error('Erro ao reativar nota:', error);
        res.status(500).json({ error: 'Erro ao reativar a nota.' });
    }
});

// ── POST /:id/cancelar-conferencia — desfaz a entrada gerada e reabre a nota ──
// Usado quando a conferência saiu errada (produto/categoria/parcela errados).
// Cancela a Conta a Pagar gerada e devolve a nota para NOVA (dá para conferir de novo).
router.post('/:id/cancelar-conferencia', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({
            where: { id: req.params.id },
            include: {
                contaPagar: {
                    include: { parcelas: { include: { pagamentos: { where: { estornado: false } } } } }
                }
            }
        });
        if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });
        if (nota.status !== 'CONFERIDA' || !nota.contaPagarId) {
            return res.status(400).json({ error: 'Só uma entrada já gerada pode ser cancelada.' });
        }
        const conta = nota.contaPagar;
        const temPagamento = (conta?.parcelas || []).some((p) => (p.pagamentos || []).length > 0);
        if (temPagamento) {
            return res.status(400).json({ error: 'A conta a pagar já tem baixa/pagamento registrado. Estorne a baixa em Contas a Pagar antes de cancelar a entrada.' });
        }
        // A despesa pode já ter chegado na Conta Azul. Inclui ERRO: o CA pode ter criado
        // o evento (HTTP 200 + protocolo) mesmo quando o app registrou erro no envio.
        const chegouCA = !!conta?.idEventoCA
            || ['AGUARDANDO_PROTOCOLO', 'ENVIANDO', 'ENVIADO', 'ERRO'].includes(conta?.statusEnvioCA);

        await prisma.$transaction(async (tx) => {
            if (conta) {
                await tx.parcelaPagar.updateMany({ where: { contaPagarId: conta.id }, data: { status: 'CANCELADO' } });
                await tx.contaPagar.update({
                    where: { id: conta.id },
                    data: { status: 'CANCELADO', statusEnvioCA: 'NAO_ENVIAR' }
                });
            }
            await tx.notaEntrada.update({
                where: { id: nota.id },
                data: { status: nota.xmlPath ? 'NOVA' : 'AGUARDANDO_XML', contaPagarId: null }
            });
        }, { timeout: 20000, maxWait: 10000 });

        // Fase 6 — estorna as entradas de estoque desta nota (saída na mesma quantidade;
        // o histórico fica marcado como estornado). Best-effort: falha não trava o cancelamento.
        let estorno = { estornadas: 0, avisos: [] };
        try {
            const compraEstoqueService = require('../services/compraEstoqueService');
            estorno = await compraEstoqueService.estornarEntradasNota(nota.id, req.user.id);
        } catch (e) {
            console.error('[NotasEntrada] Falha ao estornar entradas de estoque:', e.message);
            estorno.avisos.push('Falha ao estornar o estoque — confira e ajuste manualmente.');
        }

        res.json({
            ok: true,
            message: 'Entrada cancelada. A nota voltou para conferência.',
            avisoCA: chegouCA,
            estoque: { estornadas: estorno.estornadas, avisos: estorno.avisos }
        });
    } catch (error) {
        console.error('Erro ao cancelar conferência da nota:', error);
        res.status(500).json({ error: 'Erro ao cancelar a entrada.' });
    }
});

// Exposto para testes offline (função pura, sem efeitos)
router._calcularRateio = calcularRateio;

module.exports = router;
