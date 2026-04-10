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

/**
 * Processa automaticamente uma devolução CA não-boleto (à vista, PIX, dinheiro, OUTRO etc).
 *   - TOTAL : muda método para OUTRO + cria baixa caixinha (desconto = valor - 0,01)
 *   - PARCIAL: reduz valor_bruto da parcela em valorTotal da devolução
 *
 * Retorna SEMPRE um objeto { ok, status, mensagem, sugestao? } para o caller decidir o
 * que mostrar ao usuário. Possíveis status:
 *   - 'PROCESSADO'   → executou com sucesso, marcou processadoCA = true
 *   - 'PARCELA_PAGA' → parcela já estava paga no CA; NÃO mexe automaticamente
 *   - 'PARCELA_NAO_ENCONTRADA' → não achou parcela vinculada à venda no CA
 *   - 'ERRO'         → erro inesperado durante o processamento
 */
const processarDevolucaoCAAutomatico = async (devolucaoId) => {
    try {
        const devolucao = await prisma.devolucao.findUnique({
            where: { id: devolucaoId },
            include: {
                pedidoOriginal: {
                    select: {
                        id: true, numero: true, idVendaContaAzul: true,
                        dataVenda: true, nomeCondicaoPagamento: true,
                        cliente: { select: { UUID: true } }
                    }
                }
            }
        });

        if (!devolucao || devolucao.tipo !== 'CONTA_AZUL') {
            return { ok: false, status: 'ERRO', mensagem: 'Devolução inválida ou não é do tipo CONTA_AZUL.' };
        }
        if (devolucao.processadoCA) {
            return { ok: true, status: 'PROCESSADO', mensagem: 'Devolução já estava processada no CA.' };
        }
        const pedido = devolucao.pedidoOriginal;
        if (!pedido?.idVendaContaAzul) {
            console.warn(`[Auto-CA] Devolução ${devolucao.numero} sem idVendaContaAzul, pulando.`);
            return { ok: false, status: 'ERRO', mensagem: 'Pedido não possui venda vinculada ao Conta Azul.' };
        }

        console.log(`[Auto-CA] Iniciando processamento automático da devolução #${devolucao.numero} (${devolucao.escopo})`);

        // 1. Buscar parcela CA
        const dataVendaStr = pedido.dataVenda?.toISOString().split('T')[0];
        const parcela = await contaAzulService.encontrarParcelaDeVenda(
            pedido.cliente.UUID, pedido.idVendaContaAzul, dataVendaStr
        );

        if (!parcela) {
            console.warn(`[Auto-CA] Parcela não encontrada no CA para devolução #${devolucao.numero}.`);
            return {
                ok: false,
                status: 'PARCELA_NAO_ENCONTRADA',
                mensagem: 'Parcela do pedido não foi encontrada no Conta Azul.',
                sugestao: 'Verifique manualmente no CA se o pedido foi realmente faturado e se a parcela existe.'
            };
        }

        await prisma.devolucao.update({
            where: { id: devolucao.id },
            data: { parcelaCAId: parcela.id, wizardEtapa: 'parcela-encontrada' }
        });

        // ⚠️ Se a parcela já está paga no CA (Baixa CA prévia), NÃO mexer automaticamente.
        // Estornar baixa + recriar é uma operação delicada que pode bagunçar o caixa
        // do dia anterior. Avisar o usuário com a melhor ação manual.
        const statusParcela = parcela.status;
        const ehPaga = statusParcela === 'RECEBIDO' || statusParcela === 'RECEBIDO_PARCIAL';
        if (ehPaga) {
            const baixasResumo = (parcela.baixas || []).map(b =>
                `${b.metodo_pagamento || 'OUTRO'} R$ ${Number(b.valor_composicao?.valor_bruto || 0).toFixed(2)} (${b.data_pagamento})`
            ).join(' + ') || 'sem baixas listadas';

            const sugestao = devolucao.escopo === 'TOTAL'
                ? `Recomendado: no Conta Azul, abra a parcela do pedido #${pedido.numero}, EXCLUA a baixa atual (${baixasResumo}), depois aplique nova baixa com desconto de R$ ${(parseFloat(parcela.valor_composicao?.valor_bruto || 0) - 0.01).toFixed(2)} e R$ 0,01 na conta CAIXINHA.`
                : `Recomendado: no Conta Azul, abra a parcela do pedido #${pedido.numero}, EXCLUA a baixa atual (${baixasResumo}), reduza o valor bruto em R$ ${parseFloat(devolucao.valorTotal).toFixed(2)} e refaça a baixa com o novo valor mantendo o mesmo método/conta.`;

            console.warn(`[Auto-CA] ⚠️ Devolução #${devolucao.numero}: parcela já paga no CA (${statusParcela}). NÃO foi processada automaticamente.`);
            return {
                ok: false,
                status: 'PARCELA_PAGA',
                mensagem: `A parcela do pedido #${pedido.numero} já está paga no Conta Azul (${statusParcela}). A devolução foi registrada localmente, mas o ajuste no CA precisa ser feito manualmente.`,
                sugestao,
                detalhes: { statusParcela, baixas: parcela.baixas }
            };
        }

        const valorBruto = parseFloat(parcela.valor_composicao?.valor_bruto || 0);
        const descontoExistente = parseFloat(parcela.valor_composicao?.desconto || 0);
        const valorDevolucao = parseFloat(devolucao.valorTotal);

        if (devolucao.escopo === 'TOTAL') {
            // TOTAL: muda método para OUTRO + cria baixa caixinha (desconto = valor - 0,01)
            const desconto = Math.round((valorBruto - 0.01) * 100) / 100;

            const [, caixinha] = await Promise.all([
                contaAzulService.atualizarParcela(parcela.id, {
                    versao: parcela.versao,
                    metodo_pagamento: 'OUTRO',
                    nota: `Devolução TOTAL #${devolucao.numero} - ${devolucao.motivo?.substring(0, 100)}`
                }),
                contaAzulService.buscarContaCaixinha()
            ]);

            await new Promise(r => setTimeout(r, 1500));

            const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
            await contaAzulService.criarBaixa(parcela.id, {
                data_pagamento: hoje,
                composicao_valor: {
                    valor_bruto: valorBruto,
                    desconto: desconto,
                    multa: 0, juros: 0, taxa: 0
                },
                conta_financeira: caixinha.id,
                metodo_pagamento: 'OUTRO',
                observacao: `Devolução TOTAL #${devolucao.numero} - Desconto R$ ${desconto.toFixed(2)} + Baixa R$ 0,01 caixinha`
            });

            console.log(`[Auto-CA] ✅ Devolução TOTAL #${devolucao.numero} processada (desc R$ ${desconto.toFixed(2)} + baixa R$ 0,01).`);
        } else {
            // PARCIAL: reduzir valor_bruto da parcela via PATCH
            const novoValorBruto = Math.round((valorBruto - valorDevolucao) * 100) / 100;

            await contaAzulService.atualizarParcela(parcela.id, {
                versao: parcela.versao,
                composicao_valor: {
                    valor_bruto: novoValorBruto,
                    desconto: descontoExistente,
                },
                nota: `Devolução PARCIAL #${devolucao.numero} - valor reduzido de R$ ${valorBruto.toFixed(2)} para R$ ${novoValorBruto.toFixed(2)}`
            });

            console.log(`[Auto-CA] ✅ Devolução PARCIAL #${devolucao.numero} processada (parcela reduzida p/ R$ ${novoValorBruto.toFixed(2)}).`);
        }

        await prisma.devolucao.update({
            where: { id: devolucao.id },
            data: { processadoCA: true, wizardEtapa: 'concluido' }
        });

        return {
            ok: true,
            status: 'PROCESSADO',
            mensagem: `Devolução ${devolucao.escopo} processada com sucesso no Conta Azul.`
        };
    } catch (error) {
        const caData = error.response?.data;
        const caStatus = error.response?.status;
        console.error(`[Auto-CA] ❌ Erro processando devolução ${devolucaoId}:`, {
            status: caStatus, data: caData, message: error.message
        });
        let detalhe = error.message;
        if (caData) {
            if (typeof caData === 'string') detalhe = caData;
            else if (caData.message) detalhe = caData.message;
            else if (caData.error) detalhe = caData.error;
            else if (caData.errors) detalhe = JSON.stringify(caData.errors);
        }
        return {
            ok: false,
            status: 'ERRO',
            mensagem: `Erro ao processar devolução no CA: ${detalhe}`,
            sugestao: 'Verifique a parcela manualmente no Conta Azul e refaça os ajustes se necessário.'
        };
    }
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

        // Auto-processar no CA se NÃO for boleto (boleto exige wizard manual com cancel + upload).
        // Verificamos a condição via pedido original em mãos (já foi buscado em _criar mas não retornado).
        let processadoAuto = false;
        let avisoCA = null;
        try {
            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                select: { nomeCondicaoPagamento: true, idVendaContaAzul: true }
            });
            const condNorm = (pedido?.nomeCondicaoPagamento || '').toLowerCase();
            const ehBoleto = condNorm.includes('boleto');
            if (pedido?.idVendaContaAzul && !ehBoleto) {
                const resultadoAuto = await processarDevolucaoCAAutomatico(devolucao.id);
                processadoAuto = !!resultadoAuto?.ok;
                if (!resultadoAuto?.ok) {
                    avisoCA = {
                        status: resultadoAuto?.status || 'ERRO',
                        mensagem: resultadoAuto?.mensagem || 'Falha desconhecida no auto-processamento.',
                        sugestao: resultadoAuto?.sugestao || null
                    };
                }
            }
        } catch (autoErr) {
            console.error(`[Devolução CA] Erro no auto-processamento (não fatal):`, autoErr.message);
            avisoCA = {
                status: 'ERRO',
                mensagem: `Erro inesperado no auto-processamento: ${autoErr.message}`,
                sugestao: null
            };
        }

        res.status(201).json({ ...devolucao, processadoCA: processadoAuto, avisoCA });
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

            const parcela = await contaAzulService.buscarParcelaDetalhe(devolucao.parcelaCAId);
            if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada no CA.' });

            const valorBruto = parseFloat(parcela.valor_composicao?.valor_bruto || 0);
            const descontoExistente = parseFloat(parcela.valor_composicao?.desconto || 0);
            const valorDevolucao = parseFloat(devolucao.valorTotal);

            // Guarda: se a parcela já estiver paga no CA, NÃO mexer automaticamente.
            // Avisar o usuário com instrução manual (estornar baixa + reaplicar) para
            // não bagunçar o caixa do dia anterior.
            const statusParcelaWizard = parcela.status;
            if (statusParcelaWizard === 'RECEBIDO' || statusParcelaWizard === 'RECEBIDO_PARCIAL') {
                const baixasResumo = (parcela.baixas || []).map(b =>
                    `${b.metodo_pagamento || 'OUTRO'} R$ ${Number(b.valor_composicao?.valor_bruto || 0).toFixed(2)} (${b.data_pagamento})`
                ).join(' + ') || 'sem baixas listadas';
                const sugestao = devolucao.escopo === 'TOTAL'
                    ? `Recomendado: no Conta Azul, abra a parcela do pedido, EXCLUA a baixa atual (${baixasResumo}) e refaça com desconto de R$ ${(valorBruto - 0.01).toFixed(2)} + R$ 0,01 na conta CAIXINHA.`
                    : `Recomendado: no Conta Azul, EXCLUA a baixa atual (${baixasResumo}), reduza o valor bruto em R$ ${valorDevolucao.toFixed(2)} e refaça a baixa com o novo valor mantendo o mesmo método/conta.`;
                return res.status(409).json({
                    error: `A parcela já está paga no Conta Azul (${statusParcelaWizard}). Ajuste manual necessário.`,
                    parcelaPaga: true,
                    statusParcela: statusParcelaWizard,
                    sugestao
                });
            }

            if (devolucao.escopo === 'TOTAL') {
                // TOTAL: mudar método para OUTRO + criar baixa com desconto embutido
                const desconto = Math.round((valorBruto - 0.01) * 100) / 100;

                // 1. Mudar método de pagamento para OUTRO e buscar caixinha em paralelo
                const [, caixinha] = await Promise.all([
                    contaAzulService.atualizarParcela(devolucao.parcelaCAId, {
                        versao: parcela.versao,
                        metodo_pagamento: 'OUTRO',
                        nota: `Devolução TOTAL #${devolucao.numero} - ${devolucao.motivo?.substring(0, 100)}`
                    }),
                    contaAzulService.buscarContaCaixinha()
                ]);

                // 2. Pequena pausa para o CA processar a alteração
                await new Promise(r => setTimeout(r, 1500));

                // 3. Criar baixa com o valor total e desconto = tudo menos 0,01
                const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
                console.log('[Wizard CA] Criando baixa:', {
                    parcelaId: devolucao.parcelaCAId,
                    valorBruto, desconto, caixinhaId: caixinha.id
                });

                await contaAzulService.criarBaixa(devolucao.parcelaCAId, {
                    data_pagamento: hoje,
                    composicao_valor: {
                        valor_bruto: valorBruto,
                        desconto: desconto,
                        multa: 0, juros: 0, taxa: 0
                    },
                    conta_financeira: caixinha.id,
                    metodo_pagamento: 'OUTRO',
                    observacao: `Devolução TOTAL #${devolucao.numero} - Desconto R$ ${desconto.toFixed(2)} + Baixa R$ 0,01 caixinha`
                });

                await prisma.devolucao.update({
                    where: { id: devolucao.id },
                    data: { wizardEtapa: 'desconto-aplicado' }
                });

                return res.json({
                    etapa: 'desconto-aplicado',
                    resultado: {
                        valorBruto,
                        desconto,
                        novoLiquido: 0.01,
                        metodoPagamento: 'OUTRO',
                        baixaRealizada: true
                    }
                });
            } else {
                // PARCIAL: aplicar desconto na parcela via PATCH composicao_valor
                // O desconto no PATCH não reduz valor, então usamos valor_bruto reduzido
                const novoValorBruto = Math.round((valorBruto - valorDevolucao) * 100) / 100;

                await contaAzulService.atualizarParcela(devolucao.parcelaCAId, {
                    versao: parcela.versao,
                    composicao_valor: {
                        valor_bruto: novoValorBruto,
                        desconto: descontoExistente,
                    },
                    nota: `Devolução PARCIAL #${devolucao.numero} - valor reduzido de R$ ${valorBruto.toFixed(2)} para R$ ${novoValorBruto.toFixed(2)}`
                });

                await prisma.devolucao.update({
                    where: { id: devolucao.id },
                    data: { wizardEtapa: 'desconto-aplicado' }
                });

                return res.json({
                    etapa: 'desconto-aplicado',
                    resultado: {
                        valorBruto: novoValorBruto,
                        desconto: valorDevolucao,
                        novoLiquido: novoValorBruto,
                        metodoPagamento: parcela.metodo_pagamento,
                        baixaRealizada: false
                    }
                });
            }
        }

        // ── Etapa: baixa-caixinha (legado, mantido por compatibilidade) ──
        if (etapa === 'baixa-caixinha') {
            // Para TOTAL, a baixa já é feita na etapa aplicar-desconto
            // Este endpoint só existe caso precise ser chamado separadamente
            if (!devolucao.parcelaCAId) return res.status(400).json({ error: 'Busque a parcela primeiro.' });

            const parcela = await contaAzulService.buscarParcelaDetalhe(devolucao.parcelaCAId);
            const valorBruto = parseFloat(parcela?.valor_composicao?.valor_bruto || 0);
            const caixinha = await contaAzulService.buscarContaCaixinha();
            const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

            await contaAzulService.criarBaixa(devolucao.parcelaCAId, {
                data_pagamento: hoje,
                composicao_valor: {
                    valor_bruto: valorBruto,
                    desconto: Math.round((valorBruto - 0.01) * 100) / 100,
                    multa: 0, juros: 0, taxa: 0
                },
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
        const caData = error.response?.data;
        const caStatus = error.response?.status;
        console.error('Erro processar-ca:', { status: caStatus, data: caData, message: error.message });
        // Extrair mensagem útil do CA (pode vir como string, .message, .error, ou .errors[])
        let detalhe = error.message;
        if (caData) {
            if (typeof caData === 'string') detalhe = caData;
            else if (caData.message) detalhe = caData.message;
            else if (caData.error) detalhe = caData.error;
            else if (caData.errors) detalhe = JSON.stringify(caData.errors);
            else detalhe = JSON.stringify(caData);
        }
        res.status(500).json({
            error: `Erro CA (${caStatus || 'sem status'}): ${detalhe}`
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
