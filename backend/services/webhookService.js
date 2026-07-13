/**
 * Monta e dispara as mensagens de WhatsApp do sistema.
 *
 * O TRANSPORTE é o bot da Ana (botWhatsappService) — o BotConversa foi desligado
 * em 07/2026. Aqui só se monta o texto; quem entrega (e faz fila/retry) é o
 * botWhatsappService.
 *
 * Todo envio declara `tipo` (verificacao | pedido | entrega | cobranca | interno)
 * e `referencia` única — é o que o bot audita e o que garante a idempotência.
 * Ver backend/services/botWhatsappService.js e INTEGRACAO-ENVIO-BOT-WHATSAPP.md.
 */
const prisma = require('../config/database');
const bot = require('./botWhatsappService');

const formatPhone = (cliente) => cliente?.Telefone_Celular || null;

const formatDateMsg = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
};

// Data PURA (campo @db.Date, sem hora) — formata pela parte UTC para não voltar 1 dia.
// (ex.: Kit Festa: cliente escolhe 01/07, guardado como 2026-07-01T00:00Z; no fuso -3
//  o toLocaleDateString mostraria 30/06. Aqui pega direto a parte da data em UTC.)
const formatDateOnly = (d) => {
    if (!d) return '-';
    const s = new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD
    const [y, m, day] = s.split('-');
    return `${day}/${m}/${y}`;
};

/** O toggle "Notificação WhatsApp" da tela de Configurações (pausa geral). */
const whatsappPausado = async () => {
    const cfg = await prisma.appConfig.findUnique({ where: { key: 'whatsapp_ativo' } });
    const v = cfg?.value;
    const desativado = v === false || (typeof v === 'object' && v?.value === false);
    return !!cfg && desativado;
};

const webhookService = {
    /**
     * Confirmação do pedido (normal/especial) para o cliente.
     * Retorna { ok: true } ou { ok: false, motivo: '...' }
     */
    notificarPedido: async (pedidoId, { forceManual = false } = {}) => {
        const salvarStatus = async (ok, motivo) => {
            try {
                await prisma.pedido.update({
                    where: { id: pedidoId },
                    data: { whatsappEnviado: ok, whatsappErro: ok ? null : (motivo || null) }
                });
            } catch (e) { console.error('[Webhook] Erro ao salvar status:', e.message); }
        };

        try {
            // Envio manual pelo botão pula a pausa geral (é o usuário pedindo na hora).
            if (!forceManual && await whatsappPausado()) {
                return { ok: false, motivo: 'WhatsApp pausado pelo administrador' };
            }

            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                include: {
                    cliente: true,
                    itens: { include: { produto: { select: { nome: true } } } }
                }
            });

            if (!pedido || !pedido.cliente) { await salvarStatus(false, 'Pedido/cliente não encontrado'); return { ok: false, motivo: 'Pedido ou cliente não encontrado' }; }
            if (pedido.cliente.recebeAvisoPedido === false) { await salvarStatus(false, 'Cliente não recebe avisos'); return { ok: false, motivo: 'Cliente optou por não receber avisos' }; }

            const phone = formatPhone(pedido.cliente);
            if (!bot.normalizarTelefone(phone)) { await salvarStatus(false, 'Sem celular cadastrado'); return { ok: false, motivo: 'Cliente sem telefone celular válido' }; }

            const nome = pedido.cliente.NomeFantasia || pedido.cliente.Nome;

            const linhasItens = pedido.itens.map(i => {
                const nomeProd = i.produto?.nome || 'Produto';
                const qtd = Number(i.quantidade);
                const valorUn = Number(i.valor || 0).toFixed(2).replace('.', ',');
                return `\`${nomeProd}\`\n${qtd} un x R$ ${valorUn}`;
            }).join('\n\n');

            const total = pedido.itens.reduce((sum, i) => sum + (Number(i.valor || 0) * Number(i.quantidade)), 0);
            const totalStr = total.toFixed(2);
            const condicao = pedido.nomeCondicaoPagamento || `${pedido.tipoPagamento || ''} ${pedido.opcaoCondicaoPagamento || ''}`.trim();

            const partes = [
                `Ola, *${nome}*! 👋`,
                '',
                `Segue o resumo do seu pedido 📋`,
                '',
                `📅 *Pedido:* ${formatDateMsg(pedido.createdAt)}`,
                `🚚 *Entrega:* ${formatDateMsg(pedido.dataVenda)}`,
                '',
                '────────────────────',
                linhasItens,
                '────────────────────',
                '',
                `💰 *Total: R$ ${totalStr.replace('.', ',')}*`,
                `💳 *Condição:* ${condicao}`,
            ];
            if (pedido.observacoes) {
                partes.push('', `📝 *Obs:* ${pedido.observacoes}`);
            }
            partes.push('', 'Obrigado pela preferência! 🙏');

            const numero = pedido.numero || pedidoId.slice(0, 8);
            // Reenvio manual precisa de referência NOVA — com a mesma, o bot
            // devolveria `duplicado` e o cliente não receberia nada.
            const referencia = forceManual
                ? bot.referenciaUnica(`pedido-${numero}-reenvio`)
                : `pedido-${numero}-confirmado`;

            const r = await bot.enviar({
                telefone: phone,
                texto: partes.join('\n'),
                tipo: 'pedido',
                origem: 'app-vendedor',
                referencia,
            });

            // Reagendado = vai sair pelo worker; conta como sucesso pro usuário
            // (senão o vendedor vê "falhou" numa mensagem que ainda vai sair).
            if (r.ok || r.reagendado) {
                await salvarStatus(true, null);
                return { ok: true, reagendado: !!r.reagendado };
            }
            await salvarStatus(false, r.motivo);
            return { ok: false, motivo: r.motivo };
        } catch (error) {
            console.error('[Webhook] Erro pedido:', error.message);
            await salvarStatus(false, `Erro no envio: ${error.message}`);
            return { ok: false, motivo: error.message };
        }
    },

    /**
     * Amostra enviada ao cliente/lead.
     * Retorna { ok: true } ou { ok: false, motivo: '...' }
     */
    notificarAmostra: async (amostraId, { forceManual = false } = {}) => {
        try {
            if (!forceManual && await whatsappPausado()) {
                return { ok: false, motivo: 'WhatsApp pausado pelo administrador' };
            }

            const amostra = await prisma.amostra.findUnique({
                where: { id: amostraId },
                include: { cliente: true, lead: true, itens: true }
            });

            if (!amostra) return { ok: false, motivo: 'Amostra não encontrada' };

            const cliente = amostra.cliente;
            if (!cliente) return { ok: false, motivo: 'Amostra sem cliente vinculado' };
            if (cliente.recebeAvisoPedido === false) return { ok: false, motivo: 'Cliente optou por não receber avisos' };

            const phone = formatPhone(cliente);
            if (!bot.normalizarTelefone(phone)) return { ok: false, motivo: 'Cliente sem telefone celular válido' };

            const nome = cliente.NomeFantasia || cliente.Nome;

            const linhasItens = amostra.itens.map(i => {
                const qtd = Number(i.quantidade);
                return `\`${i.nomeProduto}\`\n${qtd} un`;
            }).join('\n\n');

            const partes = [
                `Ola, *${nome}*! 👋`,
                '',
                `Segue sua *amostra* da Hardt Salgados 🎁`,
                '',
            ];
            if (amostra.dataEntrega) {
                partes.push(`🚚 *Entrega:* ${formatDateMsg(amostra.dataEntrega)}`, '');
            }
            partes.push(
                '────────────────────',
                linhasItens,
                '────────────────────',
            );
            if (amostra.observacao) {
                partes.push('', `📝 *Obs:* ${amostra.observacao}`);
            }
            partes.push('', 'Obrigado pela preferência! 🙏');

            const referencia = forceManual
                ? bot.referenciaUnica(`amostra-${amostra.numero}-reenvio`)
                : `amostra-${amostra.numero}`;

            const r = await bot.enviar({
                telefone: phone,
                texto: partes.join('\n'),
                tipo: 'pedido', // amostra é pedido do cliente (ele pediu a amostra)
                origem: 'app-vendedor',
                referencia,
            });

            if (r.ok || r.reagendado) return { ok: true, reagendado: !!r.reagendado };
            return { ok: false, motivo: r.motivo };
        } catch (error) {
            console.error('[Webhook] Erro amostra:', error.message);
            return { ok: false, motivo: error.message };
        }
    },

    /**
     * Confirmação do pedido que o cliente acabou de fazer no site do Kit Festa.
     * Não depende do toggle whatsapp_ativo (é transacional: ele acabou de comprar).
     */
    notificarPedidoKitFesta: async (pedidoId) => {
        const salvarStatus = async (ok) => {
            try {
                await prisma.kitFestaPedido.update({
                    where: { id: pedidoId },
                    data: { whatsappEnviado: ok }
                });
            } catch (e) { console.error('[Webhook-KitFesta] Erro ao salvar status:', e.message); }
        };

        try {
            const pedido = await prisma.kitFestaPedido.findUnique({
                where: { id: pedidoId },
                include: { itens: true, bairro: true }
            });
            if (!pedido) return { ok: false, motivo: 'Pedido não encontrado' };

            const phone = pedido.telefoneCliente;
            if (!bot.normalizarTelefone(phone)) { await salvarStatus(false); return { ok: false, motivo: 'Cliente sem telefone celular válido' }; }

            const nome = (pedido.nomeCliente || '').split(' ')[0] || pedido.nomeCliente || 'Cliente';

            const linhasItens = pedido.itens.map(i => {
                const nomeProd = i.opcao ? `${i.nomeProduto} (${i.opcao})` : i.nomeProduto;
                const qtd = Number(i.quantidade);
                const valorUn = Number(i.precoUnitario || 0).toFixed(2).replace('.', ',');
                return `\`${nomeProd}\`\n${qtd} cx x R$ ${valorUn}`;
            }).join('\n\n');

            const entregaLinha = pedido.modo === 'retirada'
                ? '🏬 *Retirada na loja*'
                : '🚚 *Entrega* (taxa a combinar)';

            const totalStr = Number(pedido.total || 0).toFixed(2).replace('.', ',');

            const partes = [
                `Olá, *${nome}*! 👋`,
                '',
                `Recebemos seu pedido *Kit Festa* #${pedido.numero} ✅`,
                '',
                entregaLinha,
                `📅 *${formatDateOnly(pedido.data)}* às *${pedido.horario}*`,
            ];
            if (pedido.modo === 'entrega' && pedido.enderecoEntrega) {
                partes.push(`📍 ${pedido.enderecoEntrega}`);
            }
            partes.push(
                '',
                '────────────────────',
                linhasItens,
                '────────────────────',
                ''
            );
            if (pedido.modo === 'entrega') {
                partes.push('🛵 *Taxa de entrega:* a combinar pelo WhatsApp conforme seu endereço.');
            }
            partes.push(`💰 *Total: R$ ${totalStr}*${pedido.modo === 'entrega' ? ' _(sem a taxa de entrega)_' : ''}`);
            if (pedido.observacoes) {
                partes.push('', `📝 *Obs:* ${pedido.observacoes}`);
            }
            partes.push('', 'Em breve confirmaremos seu pedido. Obrigado pela preferência! 🙏');

            const r = await bot.enviar({
                telefone: phone,
                texto: partes.join('\n'),
                tipo: 'pedido',
                origem: 'kit-festa',
                referencia: `kitfesta-${pedido.numero}-confirmado`,
            });

            if (r.ok || r.reagendado) {
                await salvarStatus(true);
                return { ok: true, reagendado: !!r.reagendado };
            }
            await salvarStatus(false);
            return { ok: false, motivo: r.motivo };
        } catch (error) {
            console.error('[Webhook-KitFesta] Erro:', error.message);
            await salvarStatus(false);
            return { ok: false, motivo: error.message };
        }
    },

    /**
     * Mensagem avulsa (não é pedido). O chamador DEVE informar `tipo` e
     * `referencia` — é o que o bot audita e o que evita duplicata.
     *
     * Usada por: código de verificação do site (tipo 'verificacao'), relatório
     * de meta do vendedor / retorno de currículo / aviso de certificado
     * (tipo 'interno').
     */
    enviarMensagemCustom: async (phoneRaw, nome, mensagem, { tipo = 'outro', origem = 'app', referencia = null } = {}) => {
        try {
            const r = await bot.enviar({ telefone: phoneRaw, texto: mensagem, tipo, origem, referencia });
            if (r.ok || r.reagendado) return { ok: true, reagendado: !!r.reagendado };
            return { ok: false, motivo: r.motivo };
        } catch (error) {
            console.error('[Webhook] Erro mensagem custom:', error.message);
            return { ok: false, motivo: error.message };
        }
    },

    /**
     * Cobrança (régua + boleto/PIX do Asaas).
     * Não depende do toggle whatsapp_ativo: a régua tem o próprio liga/desliga
     * em cobranca_config.
     *
     * `referencia` é OBRIGATÓRIA na prática — é ela que impede a régua de
     * cobrar o mesmo cliente duas vezes se o job rodar de novo.
     */
    enviarCobranca: async ({ telefone, nome, mensagem, referencia }) => {
        try {
            const r = await bot.enviar({
                telefone,
                texto: mensagem,
                tipo: 'cobranca',
                origem: 'regua-cobranca',
                referencia: referencia || bot.referenciaUnica('cobranca-avulsa'),
            });
            if (r.ok || r.reagendado) return { ok: true, reagendado: !!r.reagendado };
            return { ok: false, motivo: r.motivo };
        } catch (error) {
            console.error('[Webhook-Cobranca] Erro:', error.message);
            return { ok: false, motivo: error.message };
        }
    },

    /**
     * Movimentação de etapa no Delivery: avisa o número interno da equipe
     * (tipo 'interno') e o cliente (tipo 'entrega'). Log em delivery_webhook_logs.
     */
    notificarDelivery: async (pedidoId, novaEtapa, opcoes = {}) => {
        const { skipWhatsapp = false } = opcoes;
        const ETAPAS_LABEL = {
            PEDIDO: 'Pedido Criado',
            PRODUCAO: 'Em Produção',
            SAINDO: 'Saindo para Entrega',
            ENTREGUE: 'Entregue'
        };

        const registrarLog = async (destino, status, mensagem) => {
            try {
                await prisma.deliveryWebhookLog.create({
                    data: { pedidoId, etapa: novaEtapa, destino, status, mensagem: (mensagem || '').slice(0, 500) }
                });
            } catch (e) { console.error('[Delivery-Webhook] log fail:', e.message); }
        };

        try {
            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                include: {
                    cliente: true,
                    itens: { include: { produto: { select: { nome: true } } } }
                }
            });
            if (!pedido || !pedido.cliente) return { ok: false, motivo: 'Pedido/cliente não encontrado' };

            const nome = pedido.cliente.NomeFantasia || pedido.cliente.Nome;
            const etapaLabel = ETAPAS_LABEL[novaEtapa] || novaEtapa;
            const numeroPedido = pedido.numero || pedidoId.slice(0, 8);

            const linhasItens = pedido.itens.map(i => {
                const nomeProd = i.produto?.nome || 'Produto';
                const qtd = Number(i.quantidade);
                const valorUn = Number(i.valor || 0).toFixed(2).replace('.', ',');
                return `\`${nomeProd}\`\n${qtd} un x R$ ${valorUn}`;
            }).join('\n\n');
            const total = pedido.itens.reduce((s, i) => s + Number(i.valor || 0) * Number(i.quantidade), 0) + Number(pedido.valorFrete || 0);
            const totalStr = total.toFixed(2).replace('.', ',');

            const resumoPartes = [
                `📅 *Entrega:* ${formatDateMsg(pedido.dataVenda)}`,
                '',
                '────────────────────',
                linhasItens,
            ];
            if (Number(pedido.valorFrete || 0) > 0) {
                resumoPartes.push(`\n\`Frete\`\nR$ ${Number(pedido.valorFrete).toFixed(2).replace('.', ',')}`);
            }
            resumoPartes.push('────────────────────');
            resumoPartes.push('', `💰 *Total: R$ ${totalStr}*`);
            const resumo = resumoPartes.join('\n');

            // ── Número interno da equipe ──
            // Resumo completo em PRODUCAO; só a etapa nas demais.
            const botConfig = await prisma.appConfig.findUnique({ where: { key: 'delivery_bot_phone' } });
            const botPhoneRaw = botConfig?.value;
            const botPhone = typeof botPhoneRaw === 'string' ? botPhoneRaw : null;

            if (bot.normalizarTelefone(botPhone)) {
                const cabecalhoBot = `🚚 *DELIVERY — ${etapaLabel}*\nPedido #${numeroPedido} — ${nome}`;
                const mensagemBot = novaEtapa === 'PRODUCAO'
                    ? `${cabecalhoBot}\n\n${resumo}`
                    : cabecalhoBot;
                const r = await bot.enviar({
                    telefone: botPhone,
                    texto: mensagemBot,
                    tipo: 'interno',
                    origem: 'delivery',
                    referencia: `entrega-interno-${numeroPedido}-${novaEtapa}`,
                });
                await registrarLog('BOT', (r.ok || r.reagendado) ? 'OK' : 'ERRO', r.motivo || `Etapa ${novaEtapa}`);
            }

            // ── Cliente ──
            // PRODUCAO: resumo + data de entrega. SAINDO/ENTREGUE: só número + etapa.
            if (skipWhatsapp) {
                await registrarLog('WHATSAPP', 'OK', `Etapa ${novaEtapa} — silenciado por configuração do card`);
            } else if (novaEtapa !== 'PEDIDO') {
                const phone = formatPhone(pedido.cliente);
                if (bot.normalizarTelefone(phone) && pedido.cliente.recebeAvisoPedido !== false) {
                    const mensagemCliente = novaEtapa === 'PRODUCAO'
                        ? [
                            `Olá, *${nome}*! 👋`,
                            '',
                            `Seu pedido *#${numeroPedido}* está *${etapaLabel}* ✨`,
                            '',
                            resumo,
                            '',
                            'Obrigado pela preferência! 🙏'
                        ].join('\n')
                        : [
                            `Olá, *${nome}*! 👋`,
                            '',
                            `Seu pedido *#${numeroPedido}* — *${etapaLabel}* ✨`
                        ].join('\n');

                    const r = await bot.enviar({
                        telefone: phone,
                        texto: mensagemCliente,
                        tipo: 'entrega',
                        origem: 'delivery',
                        referencia: `entrega-${numeroPedido}-${novaEtapa}`,
                    });
                    await registrarLog('WHATSAPP', (r.ok || r.reagendado) ? 'OK' : 'ERRO', r.motivo || `Etapa ${novaEtapa}`);
                }
            }

            return { ok: true };
        } catch (error) {
            console.error('[Delivery-Webhook] Erro:', error.message);
            return { ok: false, motivo: error.message };
        }
    }
};

module.exports = webhookService;
