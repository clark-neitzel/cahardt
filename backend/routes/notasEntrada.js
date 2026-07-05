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

        const [notas, novas, aguardandoXml, captura] = await Promise.all([
            prisma.notaEntrada.findMany({
                where,
                orderBy: [{ emissao: { sort: 'desc', nulls: 'last' } }, { criadoEm: 'desc' }],
                take: 500
            }),
            prisma.notaEntrada.count({ where: { status: 'NOVA' } }),
            prisma.notaEntrada.count({ where: { status: 'AGUARDANDO_XML' } }),
            sefazDfeService.statusCaptura()
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
            notas: notas.map(formatarNotaLista)
        });
    } catch (error) {
        console.error('Erro ao listar notas recebidas:', error);
        res.status(500).json({ error: 'Erro ao listar notas recebidas.' });
    }
});

// ── GET /itens-pcp — busca de itens PCP ativos (para o de-para) ──
router.get('/itens-pcp', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { busca } = req.query;
        const where = { ativo: true };
        if (busca?.trim()) {
            where.OR = [
                { nome: { contains: busca.trim(), mode: 'insensitive' } },
                { codigo: { contains: busca.trim(), mode: 'insensitive' } }
            ];
        }
        const itens = await prisma.itemPcp.findMany({
            where,
            select: { id: true, codigo: true, nome: true, tipo: true, unidade: true },
            orderBy: { nome: 'asc' },
            take: 100
        });
        res.json(itens);
    } catch (error) {
        console.error('Erro ao buscar itens PCP:', error);
        res.status(500).json({ error: 'Erro ao buscar itens PCP.' });
    }
});

// ── POST /consultar-agora — dispara um ciclo de captura em background ──
// (antes de /:id para a rota não ser engolida pelo parâmetro)
router.post('/consultar-agora', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const pre = await sefazDfeService.podeConsultar();
        if (!pre.ok) return res.json({ ok: false, iniciado: false, motivo: pre.motivo });

        sefazDfeService.executarCiclo()
            .catch((e) => console.error('[NotasEntrada] Erro no ciclo manual:', e.message));

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
                include: { itemPcp: { select: { id: true, nome: true, unidade: true } } }
            })
            : [];
        const porCodigo = new Map(vinculos.map((v) => [v.codigoFornecedor, v]));
        const porEan = new Map(vinculos.filter((v) => v.ean).map((v) => [v.ean, v]));

        const itens = nota.itens.map((item) => {
            const v = porCodigo.get(item.codigoFornecedor) || (item.ean ? porEan.get(item.ean) : null) || null;
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
                vinculo: v
                    ? {
                        itemPcpId: v.itemPcpId,
                        itemPcpNome: v.itemPcp?.nome || null,
                        itemPcpUnidade: v.itemPcp?.unidade || null,
                        fatorConversao: num(v.fatorConversao),
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

// ── POST /:id/gerar-conta — cria a Conta a Pagar a partir da nota ──
router.post('/:id/gerar-conta', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const { categoria, categoriaCaId, enviarCA, observacoes, parcelas, itens } = req.body;

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
                        origem: 'NFE',
                        statusEnvioCA: 'NAO_ENVIAR'
                    }
                });
            }
        }
        if (enviarCA && !fornecedor) {
            return res.status(400).json({ error: 'Para enviar ao Conta Azul é obrigatório a nota ter fornecedor identificado.' });
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

        let contaCriada;
        await prisma.$transaction(async (tx) => {
            // 1) Cria itens PCP pedidos e resolve o de-para
            for (const it of itensBody) {
                let itemPcpId = it.itemPcpId || null;
                if (!itemPcpId && it.criarItemPcp) {
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
                if (!itemPcpId || !nota.fornecedorCnpj) continue;

                const itemNota = itensNota.get(it.itemId);
                const fator = Number(it.fatorConversao) > 0 ? round4(it.fatorConversao) : 1;
                await tx.fornecedorProdutoVinculo.upsert({
                    where: {
                        fornecedorCnpj_codigoFornecedor: {
                            fornecedorCnpj: nota.fornecedorCnpj,
                            codigoFornecedor: itemNota.codigoFornecedor
                        }
                    },
                    update: {
                        itemPcpId,
                        fatorConversao: fator,
                        ean: itemNota.ean,
                        descricaoFornecedor: itemNota.descricao,
                        unidadeFornecedor: itemNota.unidade
                    },
                    create: {
                        fornecedorCnpj: nota.fornecedorCnpj,
                        codigoFornecedor: itemNota.codigoFornecedor,
                        ean: itemNota.ean,
                        descricaoFornecedor: itemNota.descricao,
                        unidadeFornecedor: itemNota.unidade,
                        itemPcpId,
                        fatorConversao: fator
                    }
                });
            }

            // 2) Cria a conta a pagar + parcelas
            contaCriada = await tx.contaPagar.create({
                data: {
                    fornecedorId: fornecedor?.id || null,
                    descricao: `NF-e ${nota.numero || 's/nº'} — ${fornecedor?.razaoSocial || nota.fornecedorNome}`,
                    categoria: categoria?.trim() || null,
                    categoriaCaId: categoriaCaId || null,
                    numeroNota: nota.numero,
                    chaveNfe: nota.chave,
                    origem: 'NFE',
                    competencia: nota.emissao,
                    observacoes: observacoes?.trim() || null,
                    valorTotal: somaParcelas,
                    status: 'ABERTO',
                    statusEnvioCA: enviarCA ? 'ENVIAR' : 'NAO_ENVIAR',
                    criadoPorId: req.user.id,
                    parcelas: {
                        create: parcelas.map((p, i) => ({
                            numeroParcela: i + 1,
                            valor: round2(p.valor),
                            dataVencimento: parseVencimento(p.dataVencimento)
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

            // 4) Nota conferida e vinculada à conta
            await tx.notaEntrada.update({
                where: { id: nota.id },
                data: { status: 'CONFERIDA', contaPagarId: contaCriada.id, fornecedorId: fornecedor?.id || nota.fornecedorId }
            });
        });

        res.status(201).json({
            message: enviarCA
                ? 'Conta a pagar criada e colocada na fila de envio ao Conta Azul!'
                : 'Conta a pagar criada!',
            contaPagarId: contaCriada.id,
            notaStatus: 'CONFERIDA'
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

module.exports = router;
