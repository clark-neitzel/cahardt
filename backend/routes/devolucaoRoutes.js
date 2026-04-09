const express = require('express');
const router = express.Router();
const devolucaoService = require('../services/devolucaoService');
const contaAzulService = require('../services/contaAzulService');
const prisma = require('../config/database');
const uploadDevolucao = require('../middlewares/uploadDevolucaoMiddleware');

// Helper: verificar permissão
const checkPermissao = (permissao) => (req, res, next) => {
    const perms = req.user?.permissoes || {};
    if (perms.admin || perms[permissao]) return next();
    return res.status(403).json({ error: 'Sem permissão para esta ação.' });
};

// ── GET / — Listar devoluções ──
router.get('/', checkPermissao('Pode_Fazer_Devolucao'), async (req, res) => {
    try {
        const { clienteId, pedidoId, tipo, status, dataInicio, dataFim, pagina, tamanhoPagina } = req.query;
        const result = await devolucaoService.listar({
            clienteId, pedidoId, tipo, status, dataInicio, dataFim,
            pagina: pagina ? parseInt(pagina) : 1,
            tamanhoPagina: tamanhoPagina ? parseInt(tamanhoPagina) : 50
        });
        res.json(result);
    } catch (error) {
        console.error('Erro ao listar devoluções:', error);
        res.status(500).json({ error: 'Erro ao listar devoluções.' });
    }
});

// ── GET /:id — Detalhar devolução ──
router.get('/:id', checkPermissao('Pode_Fazer_Devolucao'), async (req, res) => {
    try {
        const devolucao = await devolucaoService.detalhar(req.params.id);
        if (!devolucao) return res.status(404).json({ error: 'Devolução não encontrada.' });
        res.json(devolucao);
    } catch (error) {
        console.error('Erro ao detalhar devolução:', error);
        res.status(500).json({ error: 'Erro ao detalhar devolução.' });
    }
});

// ── POST /especial — Criar devolução de pedido especial ──
router.post('/especial', checkPermissao('Pode_Fazer_Devolucao'), async (req, res) => {
    try {
        const { pedidoId, itens, motivo, observacao } = req.body;
        if (!pedidoId || !itens?.length || !motivo) {
            return res.status(400).json({ error: 'pedidoId, itens e motivo são obrigatórios.' });
        }

        const devolucao = await devolucaoService.criarEspecial({
            pedidoId, itens, motivo, observacao,
            registradoPorId: req.user.id
        });
        res.status(201).json(devolucao);
    } catch (error) {
        console.error('Erro ao criar devolução especial:', error);
        res.status(400).json({ error: error.message });
    }
});

// ── POST /conta-azul — Criar devolução de pedido CA (com upload PDF) ──
router.post('/conta-azul', checkPermissao('Pode_Fazer_Devolucao'), uploadDevolucao.single('pdf'), async (req, res) => {
    try {
        const { pedidoId, motivo, observacao, notaDevolucaoCA } = req.body;
        let itens;
        try {
            itens = typeof req.body.itens === 'string' ? JSON.parse(req.body.itens) : req.body.itens;
        } catch {
            return res.status(400).json({ error: 'Formato inválido para itens.' });
        }

        if (!pedidoId || !itens?.length || !motivo || !notaDevolucaoCA) {
            return res.status(400).json({ error: 'pedidoId, itens, motivo e notaDevolucaoCA são obrigatórios.' });
        }

        const pdfDevolucaoUrl = req.file ? `/uploads/devolucoes/${req.file.filename}` : null;

        const devolucao = await devolucaoService.criarContaAzul({
            pedidoId, itens, motivo, observacao, notaDevolucaoCA, pdfDevolucaoUrl,
            registradoPorId: req.user.id
        });
        res.status(201).json(devolucao);
    } catch (error) {
        console.error('Erro ao criar devolução CA:', error);
        res.status(400).json({ error: error.message });
    }
});

// ── POST /:id/reverter — Reverter devolução ──
router.post('/:id/reverter', checkPermissao('Pode_Reverter_Devolucao'), async (req, res) => {
    try {
        const { motivoReversao } = req.body;
        const result = await devolucaoService.reverter({
            devolucaoId: req.params.id,
            motivoReversao,
            revertidoPorId: req.user.id
        });
        res.json(result);
    } catch (error) {
        console.error('Erro ao reverter devolução:', error);
        res.status(400).json({ error: error.message });
    }
});

// ── POST /:id/processar-ca — Executar etapa do wizard Conta Azul ──
router.post('/:id/processar-ca', checkPermissao('Pode_Fazer_Devolucao'), async (req, res) => {
    try {
        const { etapa } = req.body; // 'buscar-parcela' | 'aplicar-desconto' | 'baixa-caixinha' | 'verificar'
        const devolucao = await prisma.devolucao.findUnique({
            where: { id: req.params.id },
            include: {
                pedidoOriginal: {
                    select: {
                        id: true, numero: true, especial: true,
                        idVendaContaAzul: true, nomeCondicaoPagamento: true,
                        dataVenda: true, clienteId: true,
                        cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } }
                    }
                }
            }
        });

        if (!devolucao) return res.status(404).json({ error: 'Devolução não encontrada.' });
        if (devolucao.tipo !== 'CONTA_AZUL') return res.status(400).json({ error: 'Wizard CA só para devoluções do tipo CONTA_AZUL.' });
        if (devolucao.processadoCA) return res.status(400).json({ error: 'Devolução já foi processada no CA.' });

        const pedido = devolucao.pedidoOriginal;
        if (!pedido.idVendaContaAzul) return res.status(400).json({ error: 'Pedido não possui venda vinculada ao Conta Azul.' });

        // ── Etapa: buscar-parcela ──
        if (etapa === 'buscar-parcela') {
            const clienteCAId = pedido.cliente.UUID;
            const parcela = await contaAzulService.encontrarParcelaDeVenda(
                clienteCAId, pedido.idVendaContaAzul, pedido.dataVenda?.toISOString().split('T')[0]
            );

            if (!parcela) {
                return res.status(404).json({ error: 'Parcela não encontrada no Conta Azul para este pedido.' });
            }

            // Salvar parcelaCAId na devolução
            await prisma.devolucao.update({
                where: { id: devolucao.id },
                data: { parcelaCAId: parcela.id, wizardEtapa: 'parcela-encontrada' }
            });

            return res.json({
                etapa: 'parcela-encontrada',
                parcela: {
                    id: parcela.id,
                    versao: parcela.versao,
                    status: parcela.status,
                    valorBruto: parcela.valor_composicao?.valor_bruto,
                    valorLiquido: parcela.valor_composicao?.valor_liquido,
                    desconto: parcela.valor_composicao?.desconto || 0,
                    metodoPagamento: parcela.metodo_pagamento,
                    vencimento: parcela.data_vencimento,
                    solicitacoesCobrancas: parcela.solicitacoes_cobrancas || []
                }
            });
        }

        // ── Etapa: aplicar-desconto ──
        if (etapa === 'aplicar-desconto') {
            if (!devolucao.parcelaCAId) return res.status(400).json({ error: 'Busque a parcela primeiro.' });

            // Buscar detalhe atualizado da parcela (para versão atual)
            const parcela = await contaAzulService.buscarParcelaDetalhe(devolucao.parcelaCAId);
            if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada no CA.' });

            const valorBruto = parseFloat(parcela.valor_composicao?.valor_bruto || 0);
            const descontoExistente = parseFloat(parcela.valor_composicao?.desconto || 0);
            const valorDevolucao = parseFloat(devolucao.valorTotal);

            let desconto, novoLiquido, metodoPagamento;

            if (devolucao.escopo === 'TOTAL') {
                // Total: desconto = tudo menos 0.01, muda para OUTRO
                desconto = Math.round((valorBruto - 0.01) * 100) / 100;
                novoLiquido = 0.01;
                metodoPagamento = 'OUTRO';
            } else {
                // Parcial: desconto = valor devolvido
                desconto = Math.round((descontoExistente + valorDevolucao) * 100) / 100;
                novoLiquido = Math.round((valorBruto - desconto) * 100) / 100;
                metodoPagamento = undefined; // Manter método atual
            }

            const payload = {
                versao: parcela.versao,
                composicao_valor: {
                    valor_bruto: valorBruto,
                    desconto,
                },
                nota: `Devolução ${devolucao.escopo} #${devolucao.numero} - ${devolucao.motivo?.substring(0, 100)}`
            };
            if (metodoPagamento) payload.metodo_pagamento = metodoPagamento;

            const resultado = await contaAzulService.atualizarParcela(devolucao.parcelaCAId, payload);

            await prisma.devolucao.update({
                where: { id: devolucao.id },
                data: { wizardEtapa: 'desconto-aplicado' }
            });

            return res.json({
                etapa: 'desconto-aplicado',
                resultado: {
                    valorBruto,
                    desconto,
                    novoLiquido,
                    metodoPagamento: metodoPagamento || parcela.metodo_pagamento,
                    versaoAtualizada: resultado.versao
                }
            });
        }

        // ── Etapa: baixa-caixinha (só para TOTAL) ──
        if (etapa === 'baixa-caixinha') {
            if (devolucao.escopo !== 'TOTAL') {
                return res.status(400).json({ error: 'Baixa na caixinha é só para devolução TOTAL.' });
            }
            if (!devolucao.parcelaCAId) return res.status(400).json({ error: 'Busque a parcela primeiro.' });

            const caixinha = await contaAzulService.buscarContaCaixinha();
            const hoje = new Date().toISOString().split('T')[0];

            await contaAzulService.criarBaixa(devolucao.parcelaCAId, {
                data_pagamento: hoje,
                composicao_valor: { valor_bruto: 0.01, multa: 0, juros: 0, desconto: 0, taxa: 0 },
                conta_financeira: caixinha.id,
                metodo_pagamento: 'OUTRO',
                observacao: `Baixa automática - Devolução TOTAL #${devolucao.numero}`
            });

            await prisma.devolucao.update({
                where: { id: devolucao.id },
                data: { wizardEtapa: 'baixa-realizada' }
            });

            return res.json({ etapa: 'baixa-realizada' });
        }

        // ── Etapa: verificar ──
        if (etapa === 'verificar') {
            if (!devolucao.parcelaCAId) return res.status(400).json({ error: 'Parcela não definida.' });

            const parcela = await contaAzulService.buscarParcelaDetalhe(devolucao.parcelaCAId);
            if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada no CA.' });

            return res.json({
                etapa: 'verificacao',
                parcela: {
                    id: parcela.id,
                    status: parcela.status,
                    valorBruto: parcela.valor_composicao?.valor_bruto,
                    valorLiquido: parcela.valor_composicao?.valor_liquido,
                    desconto: parcela.valor_composicao?.desconto || 0,
                    metodoPagamento: parcela.metodo_pagamento,
                    solicitacoesCobrancas: parcela.solicitacoes_cobrancas || []
                }
            });
        }

        // ── Etapa: finalizar ──
        if (etapa === 'finalizar') {
            await prisma.devolucao.update({
                where: { id: devolucao.id },
                data: { processadoCA: true, wizardEtapa: 'concluido' }
            });
            return res.json({ etapa: 'concluido', processadoCA: true });
        }

        return res.status(400).json({ error: `Etapa desconhecida: ${etapa}` });
    } catch (error) {
        console.error('Erro processar-ca:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Erro ao processar no Conta Azul.',
            detalhe: error.response?.data?.message || error.message
        });
    }
});

// ── POST /:id/upload-boleto — Upload do PDF do novo boleto ──
router.post('/:id/upload-boleto', checkPermissao('Pode_Fazer_Devolucao'), uploadDevolucao.single('pdfBoleto'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        const devolucao = await prisma.devolucao.findUnique({ where: { id: req.params.id } });
        if (!devolucao) return res.status(404).json({ error: 'Devolução não encontrada.' });

        const pdfBoletoUrl = `/uploads/devolucoes/${req.file.filename}`;
        await prisma.devolucao.update({
            where: { id: req.params.id },
            data: { pdfBoletoUrl }
        });

        res.json({ pdfBoletoUrl });
    } catch (error) {
        console.error('Erro upload-boleto:', error);
        res.status(500).json({ error: 'Erro ao fazer upload do boleto.' });
    }
});

module.exports = router;
