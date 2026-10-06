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

// Só para o Delivery: cai no telefone fixo quando não há celular cadastrado
// (as demais notificações — pedido/amostra — continuam exigindo celular via formatPhone).
const formatPhoneComFallback = (cliente) => cliente?.Telefone_Celular || cliente?.Telefone || null;

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

// ── Motivos de bloqueio do WhatsApp do cliente no Delivery ──
// Compartilhados entre notificarDelivery e a prévia (GET /api/delivery/pedidos/:id/previa-mensagem)
// para nunca existirem dois textos diferentes dizendo a mesma coisa.
const MOTIVO_DELIVERY_SILENCIADO = 'Card com WhatsApp silenciado';
const MOTIVO_DELIVERY_SEM_TELEFONE = 'Cliente sem WhatsApp cadastrado (nem celular nem telefone)';
const MOTIVO_DELIVERY_SEM_AVISO = 'Cliente optou por não receber avisos';

const ETAPAS_LABEL_DELIVERY = {
    PEDIDO: 'Pedido Criado',
    PRODUCAO: 'Em Produção',
    SAINDO: 'Saindo para Entrega',
    ENTREGUE: 'Entregue'
};

const LINHA_DIVISORIA = '────────────────────';
const ROTULO_OBS = '📝 *Obs:* ';
const DESPEDIDA = '\n\nObrigado pela preferência! 🙏';

const moedaBR = (v) => Number(v || 0).toFixed(2).replace('.', ',');

/** Um bloco por item do pedido (formato idêntico ao de sempre). */
const blocosItens = (pedido) => (pedido.itens || []).map(i => {
    const nomeProd = i.produto?.nome || 'Produto';
    return `\`${nomeProd}\`\n${Number(i.quantidade)} un x R$ ${moedaBR(i.valor)}`;
});

const totalPedido = (pedido) =>
    (pedido.itens || []).reduce((sum, i) => sum + (Number(i.valor || 0) * Number(i.quantidade)), 0) + Number(pedido.valorFrete || 0);

/**
 * Rodapé estruturado: `base` (linha, total, condição) + Obs (opcional) + `fim` (despedida, opcional).
 * `texto` é o rodapé de sempre; `estr` permite ao bot quebrar uma Obs gigante entre partes
 * SEM perder nada (a Obs sai inteira, nunca truncada).
 */
const rodapeEstruturado = (base, obs, fim) => {
    const o = obs ? String(obs) : '';
    return { texto: base + (o ? `\n\n${ROTULO_OBS}${o}` : '') + fim, estr: { base, obs: o, rotuloObs: ROTULO_OBS, fim } };
};

/** Itens + linha da taxa (a taxa é o último "item": separador '\n\n', igual ao texto de sempre). */
const itensComFrete = (pedido, rotuloFrete) => {
    const lista = blocosItens(pedido);
    const frete = Number(pedido.valorFrete || 0);
    if (frete > 0) lista.push(`\`${rotuloFrete}\`\nR$ ${moedaBR(frete)}`);
    return lista;
};

/**
 * Confirmação de pedido ESTRUTURADA (notificarPedido). Função pura.
 * Texto inteiro = cabecalho + '\n' + itens.join('\n\n') + '\n' + rodape.
 * Total = itens + taxa de entrega (valorFrete), igual ao da tela/delivery.
 * pedido: { cliente, itens[{valor,quantidade,produto:{nome}}], valorFrete, createdAt, dataVenda,
 *           nomeCondicaoPagamento, tipoPagamento, opcaoCondicaoPagamento, observacoes }
 */
const montarPartesPedido = (pedido) => {
    const nome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome;
    const condicao = pedido.nomeCondicaoPagamento || `${pedido.tipoPagamento || ''} ${pedido.opcaoCondicaoPagamento || ''}`.trim();
    const numero = pedido.numero || String(pedido.id || '').slice(0, 8);

    const cabecalho = [
        `Ola, *${nome}*! 👋`,
        '',
        `Segue o resumo do seu pedido 📋`,
        '',
        `📅 *Pedido:* ${formatDateMsg(pedido.createdAt)}`,
        `🚚 *Entrega:* ${formatDateMsg(pedido.dataVenda)}`,
        '',
        LINHA_DIVISORIA,
    ].join('\n');

    const rod = rodapeEstruturado([
        LINHA_DIVISORIA,
        '',
        `💰 *Total: R$ ${moedaBR(totalPedido(pedido))}*`,
        `💳 *Condição:* ${condicao}`,
    ].join('\n'), pedido.observacoes, DESPEDIDA);

    return {
        cabecalho,
        itens: itensComFrete(pedido, 'Taxa de entrega'),
        rodape: rod.texto,
        rodapeEstr: rod.estr,
        tituloContinuacao: `Pedido #${numero}`,
    };
};

/** Texto da confirmação de pedido numa mensagem só (igual ao de sempre). */
const montarMensagemPedido = (pedido) => {
    const p = montarPartesPedido(pedido);
    return `${p.cabecalho}\n${p.itens.join('\n\n')}\n${p.rodape}`;
};

/** Lista de textos prontos p/ envio: 1 (pedido pequeno, idêntico ao de sempre) ou N partes numeradas. */
const montarListaPartes = (p) => bot.dividirEmPartes(p);

/**
 * Monta o texto da mensagem de WhatsApp para o CLIENTE no fluxo do Delivery.
 * Função PURA (sem I/O, sem chamada ao bot) — é a ÚNICA fonte deste texto:
 * notificarDelivery e a prévia manual (GET .../previa-mensagem) usam ela.
 * `pedido` já deve vir com `cliente` e `itens.produto` carregados (ex.:
 * prisma.pedido.findUnique({ include: { cliente: true, itens: { include: {
 * produto: { select: { nome: true } } } } } })).
 */
/**
 * Monta o texto da mensagem de WhatsApp para o CLIENTE no fluxo do Delivery.
 * Função PURA — é a ÚNICA fonte deste texto: notificarDelivery e a prévia manual
 * (GET .../previa-mensagem) usam ela. `pedido` já deve vir com `cliente` e `itens.produto`.
 */
const montarMensagemDeliveryCliente = (pedido, etapa) => {
    const { texto, etapaLabel } = montarPartesDeliveryCliente(pedido, etapa);
    return { texto, etapaLabel };
};

/**
 * Versão ESTRUTURADA do texto do Delivery p/ o cliente. PEDIDO/PRODUCAO trazem o resumo
 * (dividível em partes); SAINDO/ENTREGUE são sempre 1 mensagem curta.
 * Retorna { texto, etapaLabel, cabecalho, itens, rodape, rodapeEstr, tituloContinuacao, temResumo }.
 * texto inteiro = cabecalho + '\n' + itens.join('\n\n') + '\n' + rodape (quando temResumo).
 */
const montarPartesDeliveryCliente = (pedido, etapa) => {
    const nome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'Cliente';
    const etapaLabel = ETAPAS_LABEL_DELIVERY[etapa] || etapa;
    const numeroPedido = pedido.numero || String(pedido.id || '').slice(0, 8);

    if (etapa !== 'PEDIDO' && etapa !== 'PRODUCAO') {
        const texto = [
            `Olá, *${nome}*! 👋`,
            '',
            `Seu pedido *#${numeroPedido}* — *${etapaLabel}* ✨`
        ].join('\n');
        return { texto, etapaLabel, cabecalho: texto, itens: [], rodape: '', rodapeEstr: null, tituloContinuacao: `Pedido #${numeroPedido}`, temResumo: false };
    }

    const abertura = etapa === 'PEDIDO'
        ? `Recebemos seu pedido *#${numeroPedido}* ✅`
        : `Seu pedido *#${numeroPedido}* está *${etapaLabel}* ✨`;

    const cabecalho = [
        `Olá, *${nome}*! 👋`,
        '',
        abertura,
        '',
        `📅 *Entrega:* ${formatDateMsg(pedido.dataVenda)}`,
        '',
        LINHA_DIVISORIA,
    ].join('\n');

    const rod = rodapeEstruturado(
        [LINHA_DIVISORIA, '', `💰 *Total: R$ ${moedaBR(totalPedido(pedido))}*`].join('\n'),
        pedido.observacoes, DESPEDIDA);

    const itens = itensComFrete(pedido, 'Taxa de entrega');
    const rodape = rod.texto;
    return {
        texto: `${cabecalho}\n${itens.join('\n\n')}\n${rodape}`,
        etapaLabel, cabecalho, itens, rodape,
        rodapeEstr: rod.estr,
        tituloContinuacao: `Pedido #${numeroPedido}`,
        temResumo: true,
    };
};

/**
 * Resumo INTERNO (equipe) da etapa PRODUCAO — estruturado. Rótulo do frete é "Frete"
 * (diferente do texto do cliente, que diz "Taxa de entrega") — mantido como sempre foi.
 * texto inteiro = cabecalho + '\n' + itens.join('\n\n') + '\n' + rodape.
 */
const montarPartesDeliveryInterno = (pedido, etapaLabel, numeroPedido, nome) => {
    const cabecalho = `🚚 *DELIVERY — ${etapaLabel}*\nPedido #${numeroPedido} — ${nome}\n\n📅 *Entrega:* ${formatDateMsg(pedido.dataVenda)}\n\n${LINHA_DIVISORIA}`;
    const rod = rodapeEstruturado(
        [LINHA_DIVISORIA, '', `💰 *Total: R$ ${moedaBR(totalPedido(pedido))}*`].join('\n'),
        pedido.observacoes, '');
    return {
        cabecalho,
        itens: itensComFrete(pedido, 'Frete'),
        rodape: rod.texto,
        rodapeEstr: rod.estr,
        tituloContinuacao: `Delivery #${numeroPedido}`,
    };
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

            const partes = montarListaPartes(montarPartesPedido(pedido));

            const numero = pedido.numero || pedidoId.slice(0, 8);
            // Reenvio manual precisa de referência NOVA — com a mesma, o bot
            // devolveria `duplicado` e o cliente não receberia nada.
            const referencia = forceManual
                ? bot.referenciaUnica(`pedido-${numero}-reenvio`)
                : `pedido-${numero}-confirmado`;

            // Pedido grande sai em várias partes numeradas (-p1..pN); pequeno = 1 mensagem,
            // com a MESMA referencia de sempre. Reenvio manual: base única UMA vez só.
            const r = await bot.enviarEmPartes({
                telefone: phone,
                partes,
                tipo: 'pedido',
                origem: 'app-vendedor',
                referenciaBase: referencia,
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
        const { skipWhatsapp = false, forceManual = false } = opcoes;
        const ETAPAS_LABEL = ETAPAS_LABEL_DELIVERY;

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

            // ── Número interno da equipe ──
            // Resumo completo em PRODUCAO; só a etapa nas demais.
            const botConfig = await prisma.appConfig.findUnique({ where: { key: 'delivery_bot_phone' } });
            const botPhoneRaw = botConfig?.value;
            const botPhone = typeof botPhoneRaw === 'string' ? botPhoneRaw : null;

            if (bot.normalizarTelefone(botPhone)) {
                // Resumo completo em PRODUCAO (dividido em partes se grande); só a etapa nas demais.
                const partesBot = novaEtapa === 'PRODUCAO'
                    ? montarListaPartes(montarPartesDeliveryInterno(pedido, etapaLabel, numeroPedido, nome))
                    : [`🚚 *DELIVERY — ${etapaLabel}*\nPedido #${numeroPedido} — ${nome}`];
                const r = await bot.enviarEmPartes({
                    telefone: botPhone,
                    partes: partesBot,
                    tipo: 'interno',
                    origem: 'delivery',
                    referenciaBase: `entrega-interno-${numeroPedido}-${novaEtapa}`,
                });
                await registrarLog('BOT', (r.ok || r.reagendado) ? 'OK' : 'ERRO', r.motivo || `Etapa ${novaEtapa}`);
            }

            // ── Cliente ──
            // Automático (forceManual=false) em PEDIDO continua sem mandar nada ao
            // cliente (a confirmação do pedido já saiu na criação). Manual (botão
            // de reenvio) em PEDIDO manda a variante "pedido recebido".
            let resultadoCliente;
            if (skipWhatsapp) {
                resultadoCliente = { ok: true, enviado: false, motivo: MOTIVO_DELIVERY_SILENCIADO };
                await registrarLog('WHATSAPP', 'OK', `Etapa ${novaEtapa} — silenciado por configuração do card`);
            } else if (novaEtapa === 'PEDIDO' && !forceManual) {
                resultadoCliente = { ok: true, enviado: false, motivo: 'Nesta etapa não há mensagem de WhatsApp para o cliente — a confirmação do pedido já foi enviada na criação' };
                await registrarLog('WHATSAPP', 'OK', resultadoCliente.motivo);
            } else {
                const phone = formatPhoneComFallback(pedido.cliente);
                if (!bot.normalizarTelefone(phone)) {
                    resultadoCliente = { ok: true, enviado: false, motivo: MOTIVO_DELIVERY_SEM_TELEFONE };
                    await registrarLog('WHATSAPP', 'OK', resultadoCliente.motivo);
                } else if (pedido.cliente.recebeAvisoPedido === false) {
                    resultadoCliente = { ok: true, enviado: false, motivo: MOTIVO_DELIVERY_SEM_AVISO };
                    await registrarLog('WHATSAPP', 'OK', resultadoCliente.motivo);
                } else {
                    const estruturado = montarPartesDeliveryCliente(pedido, novaEtapa);
                    const partesCliente = estruturado.temResumo ? montarListaPartes(estruturado) : [estruturado.texto];

                    const referencia = forceManual
                        ? bot.referenciaUnica(`entrega-${numeroPedido}-${novaEtapa}-reenvio`)
                        : `entrega-${numeroPedido}-${novaEtapa}`;

                    const r = await bot.enviarEmPartes({
                        telefone: phone,
                        partes: partesCliente,
                        tipo: 'entrega',
                        origem: 'delivery',
                        referenciaBase: referencia,
                    });

                    if (r.ok && r.status === 'duplicado' && forceManual) {
                        // Reenvio manual usa referência nova — se ainda assim veio duplicado,
                        // o bot recusou por outro motivo (ex.: mesma referência calculada de novo
                        // por corrida de cliques); tratar como não-enviado para o usuário saber.
                        resultadoCliente = { ok: true, enviado: false, motivo: 'Bot recusou como duplicada' };
                    } else if (r.ok) {
                        resultadoCliente = { ok: true, enviado: true };
                    } else if (r.reagendado) {
                        resultadoCliente = { ok: true, enviado: false, reagendado: true, motivo: 'Entrou na fila — será enviada em breve' };
                    } else {
                        resultadoCliente = { ok: false, motivo: r.motivo };
                    }

                    await registrarLog('WHATSAPP', (r.ok || r.reagendado) ? 'OK' : 'ERRO', r.motivo || `Etapa ${novaEtapa}`);
                }
            }

            return resultadoCliente;
        } catch (error) {
            console.error('[Delivery-Webhook] Erro:', error.message);
            return { ok: false, motivo: error.message };
        }
    }
};

module.exports = webhookService;
module.exports.montarMensagemDeliveryCliente = montarMensagemDeliveryCliente;
module.exports.montarMensagemPedido = montarMensagemPedido;
module.exports.montarPartesPedido = montarPartesPedido;
module.exports.montarPartesDeliveryCliente = montarPartesDeliveryCliente;
module.exports.montarPartesDeliveryInterno = montarPartesDeliveryInterno;
module.exports.formatPhoneComFallback = formatPhoneComFallback;
module.exports.MOTIVO_DELIVERY_SILENCIADO = MOTIVO_DELIVERY_SILENCIADO;
module.exports.MOTIVO_DELIVERY_SEM_TELEFONE = MOTIVO_DELIVERY_SEM_TELEFONE;
module.exports.MOTIVO_DELIVERY_SEM_AVISO = MOTIVO_DELIVERY_SEM_AVISO;
