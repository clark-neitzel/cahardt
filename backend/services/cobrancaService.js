const prisma = require('../config/database');
const webhookService = require('./webhookService');
const emailService = require('./emailService');
const smsService = require('./smsService');

/**
 * Régua de Cobrança de inadimplentes.
 *
 * - Configuração por forma de recebimento (nome da condição de pagamento do
 *   pedido) na tabela cobranca_configs; a linha 'PADRAO' cobre o resto.
 * - O worker diário (scheduler) chama executarRegua() no horário configurado
 *   em app_configs 'cobranca_config' = { ativo, horaEnvio }.
 * - Envio por WhatsApp (bot da Ana), e-mail (SMTP) e SMS.
 * - Falha no WhatsApp (sem celular / bot recusou) gera TAREFA para o
 *   responsável definido na configuração da forma — enquanto o envio não
 *   funcionar e a tarefa anterior estiver concluída, gera de novo.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
// Fila de envio: intervalo entre uma mensagem e outra (protege o número de
// WhatsApp de bloqueio por rajada de envios)
const INTERVALO_ENTRE_ENVIOS_MS = 60 * 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TEMPLATE_PADRAO_1 = `Olá, *{nome}*! 😊
Passando para avisar que consta em aberto conosco o valor de *R$ {valor_total}*:

{parcelas}

Se o pagamento já foi realizado, por favor desconsidere esta mensagem. Qualquer dúvida, estamos à disposição! 🙏
_Hardt Salgados_`;

const TEMPLATE_PADRAO_2 = `Olá, *{nome}*!
Ainda consta em aberto conosco o valor de *R$ {valor_total}* ({qtd_parcelas} parcela(s), a mais antiga com {dias_atraso} dias de atraso):

{parcelas}

Pedimos a gentileza de regularizar o pagamento ou entrar em contato para combinarmos. 🙏
_Hardt Salgados_`;

const TEMPLATE_LEMBRETE_PADRAO = `Olá, *{nome}*! 😊
Lembrete amigo: você tem pagamento(s) chegando no vencimento:

{parcelas}

Total: *R$ {valor_total}*. Qualquer dúvida, estamos à disposição!
_Hardt Salgados_`;

// Modelos prontos oferecidos na tela ao adicionar uma mensagem (o usuário
// escolhe um e ajusta o texto como quiser)
const MODELOS_PRONTOS = [
    {
        nome: 'Aviso 1 — tom leve',
        texto: `Olá, *{nome}*! 😊
Tudo bem? Passando para avisar que consta em aberto conosco o valor de *R$ {valor_total}*:

{parcelas}

Se o pagamento já foi feito, por favor desconsidere esta mensagem. 🙏
Qualquer dúvida ou para combinar o pagamento, é só responder por aqui!
_Hardt Salgados_`
    },
    {
        nome: 'Aviso 2 — cobrança educada',
        texto: `Olá, *{nome}*!
Ainda consta em aberto conosco o valor de *R$ {valor_total}* ({qtd_parcelas} parcela(s), a mais antiga com *{dias_atraso} dias* de atraso):

{parcelas}

Pedimos a gentileza de regularizar o pagamento ou entrar em contato para combinarmos a melhor forma. Contamos com você! 🙏
_Hardt Salgados_`
    },
    {
        nome: 'Aviso 3 — tom firme',
        texto: `*{nome}*, precisamos da sua atenção. ⚠️
Seu débito com a Hardt Salgados segue em aberto há *{dias_atraso} dias*:

{parcelas}

Total: *R$ {valor_total}*

Pedimos a regularização para mantermos o atendimento normal dos seus pedidos. Se preferir, respondemos por aqui para combinar parcelamento. 📞
_Hardt Salgados — Financeiro_`
    },
    {
        nome: 'Aviso final — último automático',
        texto: `*{nome}*, este é nosso último aviso automático. 🔴
Débito em aberto há *{dias_atraso} dias* com a Hardt Salgados:

{parcelas}

Total: *R$ {valor_total}*

Sem retorno, os próximos pedidos ficarão condicionados à quitação e o caso seguirá para tratativa direta com nosso financeiro. Vamos resolver? Responda esta mensagem *hoje* que encontramos juntos a melhor saída. 🤝
_Hardt Salgados — Financeiro_`
    },
    {
        nome: 'Lembrete — antes de vencer',
        lembrete: true,
        texto: `Olá, *{nome}*! 😊
Lembrete amigo da Hardt Salgados: você tem pagamento chegando no vencimento:

{parcelas}

Total: *R$ {valor_total}*. Assim evitamos qualquer transtorno. Qualquer dúvida, é só chamar por aqui! 🙏`
    }
];

// ── Helpers ──────────────────────────────────────────────────────────

const hojeLocal = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const dataLocalStr = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const horaLocalStr = (d = new Date()) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtData = (d) => {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

const diasAtrasoDe = (vencimento) => {
    const v = new Date(vencimento);
    const vDia = new Date(v.getFullYear(), v.getMonth(), v.getDate());
    return Math.floor((hojeLocal() - vDia) / DIA_MS);
};

const normalizarForma = (s) => (s || '').trim().toUpperCase();

const valorDevido = (parcela) =>
    Math.max(0, Number(parcela.valor) - Number(parcela.valorPago || 0) - Number(parcela.valorDescontoTotal || 0));

const formaDoGrupo = (contaReceber) => {
    const pedido = contaReceber.pedido;
    if (pedido?.nomeCondicaoPagamento) return pedido.nomeCondicaoPagamento;
    const combinado = `${pedido?.tipoPagamento || ''} ${pedido?.opcaoCondicaoPagamento || ''}`.trim();
    return combinado || 'PADRAO';
};

const DIAS_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

async function getCobrancaConfigGlobal() {
    const row = await prisma.appConfig.findUnique({ where: { key: 'cobranca_config' } });
    const v = row?.value || {};
    return {
        ativo: v.ativo === true,
        horaEnvio: v.horaEnvio || '08:30', // horário de São Paulo (TZ do servidor)
        // Dias da semana em que a régua PODE enviar (padrão: dias úteis)
        diasSemana: Array.isArray(v.diasSemana) && v.diasSemana.length ? v.diasSemana : ['SEG', 'TER', 'QUA', 'QUI', 'SEX'],
        // Vencimento que cai em sáb/dom conta como vencido só na segunda
        prorrogarFimDeSemana: v.prorrogarFimDeSemana !== false
    };
}

// Vencimento efetivo: caindo em sábado/domingo, empurra para a segunda-feira.
// Ex.: venceu sábado → só é "vencido" a partir de segunda → com 1 dia de
// carência, o 1º aviso sai na terça.
function vencimentoEfetivo(vencimento, prorrogar) {
    const v = new Date(vencimento);
    const dia = new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (!prorrogar) return dia;
    if (dia.getDay() === 6) return new Date(dia.getTime() + 2 * DIA_MS); // sábado → segunda
    if (dia.getDay() === 0) return new Date(dia.getTime() + 1 * DIA_MS); // domingo → segunda
    return dia;
}

// ── Montagem dos grupos (cliente + forma de recebimento) ─────────────

/**
 * Busca todas as parcelas em aberto vencidas (e as que vencem em breve, para
 * lembrete) e agrupa por cliente + configuração de forma de recebimento.
 */
async function montarGrupos() {
    const global = await getCobrancaConfigGlobal();
    const configs = await prisma.cobrancaConfig.findMany({
        include: { responsavelTarefa: { select: { id: true, nome: true } } }
    });
    const configPorForma = new Map(configs.map(c => [normalizarForma(c.formaRecebimento), c]));
    const configPadrao = configPorForma.get('PADRAO') || null;

    const maxDiasLembrete = Math.max(0, ...configs.filter(c => c.ativo && c.lembreteAntes).map(c => c.diasLembrete || 0));
    const limiteFuturo = new Date(hojeLocal().getTime() + (maxDiasLembrete + 1) * DIA_MS);

    const parcelas = await prisma.parcela.findMany({
        where: {
            status: { in: ['PENDENTE', 'PARCIAL', 'VENCIDO'] },
            dataVencimento: { lt: limiteFuturo },
            contaReceber: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                // Mesma regra da tela Contas a Receber: esconde contas cujo pedido
                // foi excluído/cancelado no CA ou é bonificação (nunca cobrar essas)
                OR: [
                    { pedidoId: null },
                    {
                        pedido: {
                            statusEnvio: { notIn: ['EXCLUIDO'] },
                            situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] },
                            bonificacao: false
                        }
                    }
                ]
            }
        },
        include: {
            contaReceber: {
                include: {
                    cliente: {
                        select: {
                            UUID: true, Nome: true, NomeFantasia: true, Email: true,
                            Telefone_Celular: true, Telefone: true, idVendedor: true,
                            vendedor: { select: { nome: true } }
                        }
                    },
                    pedido: { select: { numero: true, nomeCondicaoPagamento: true, tipoPagamento: true, opcaoCondicaoPagamento: true } }
                }
            }
        },
        orderBy: { dataVencimento: 'asc' }
    });

    const grupos = new Map(); // chave: clienteId|configKey
    for (const p of parcelas) {
        const devido = valorDevido(p);
        if (devido < 0.01) continue;

        const cliente = p.contaReceber.cliente;
        const forma = formaDoGrupo(p.contaReceber);
        const config = configPorForma.get(normalizarForma(forma)) || configPadrao;
        const configKey = config ? config.id : 'SEM_CONFIG';
        const chave = `${cliente.UUID}|${configKey}`;

        if (!grupos.has(chave)) {
            grupos.set(chave, { cliente, forma, config, parcelasVencidas: [], parcelasAVencer: [] });
        }
        const g = grupos.get(chave);
        // Dias de atraso contados a partir do vencimento EFETIVO (fim de semana → segunda)
        const efetivo = vencimentoEfetivo(p.dataVencimento, global.prorrogarFimDeSemana);
        const dias = diasAtrasoDe(efetivo);
        const item = {
            parcelaId: p.id,
            contaReceberId: p.contaReceberId,
            numero: p.numeroParcela,
            valor: devido,
            vencimento: p.dataVencimento,
            vencimentoEfetivo: efetivo,
            diasAtraso: dias,
            pedidoNumero: p.contaReceber.pedido?.numero || null
        };
        if (dias > 0) g.parcelasVencidas.push(item);
        else g.parcelasAVencer.push(item);
    }

    return { grupos: [...grupos.values()], configs };
}

// ── Mensagens ────────────────────────────────────────────────────────

function linhasParcelas(parcelas) {
    return parcelas.map(p => {
        const atraso = p.diasAtraso > 0 ? ` — ${p.diasAtraso} dia(s) em atraso` : '';
        return `• R$ ${fmtMoeda(p.valor)} — vencimento ${fmtData(p.vencimento)}${atraso}`;
    }).join('\n');
}

function aplicarTemplate(texto, grupo, parcelas) {
    const nome = grupo.cliente.NomeFantasia || grupo.cliente.Nome;
    const total = parcelas.reduce((s, p) => s + p.valor, 0);
    const diasMax = Math.max(0, ...parcelas.map(p => p.diasAtraso));
    const vencMaisAntigo = parcelas.length ? parcelas[0].vencimento : new Date();
    return (texto || '')
        .replaceAll('{nome}', nome)
        .replaceAll('{valor_total}', fmtMoeda(total))
        .replaceAll('{parcelas}', linhasParcelas(parcelas))
        .replaceAll('{qtd_parcelas}', String(parcelas.length))
        .replaceAll('{dias_atraso}', String(diasMax))
        .replaceAll('{vencimento}', fmtData(vencMaisAntigo));
}

function montarMensagemCobranca(config, grupo, numeroAviso) {
    const templates = Array.isArray(config?.templates) ? config.templates.filter(t => t && t.texto) : [];
    let texto;
    if (templates.length > 0) {
        const dias = Math.max(0, ...grupo.parcelasVencidas.map(p => p.diasAtraso));
        const comFaixa = templates.filter(t => t.deDias != null);
        if (comFaixa.length > 0) {
            // Mensagem escolhida pela FAIXA de dias de atraso (de X a Y dias).
            // ateDias vazio = "em diante". Sem faixa exata, usa a de maior
            // "de" que já foi atingido; senão, a primeira.
            const escolhido =
                comFaixa.find(t => dias >= t.deDias && (t.ateDias == null || dias <= t.ateDias)) ||
                [...comFaixa].sort((a, b) => b.deDias - a.deDias).find(t => dias >= t.deDias) ||
                comFaixa[0];
            texto = escolhido.texto;
        } else {
            // Compatibilidade: sem faixas, aviso nº N usa o template N (último repete)
            const idx = Math.min(numeroAviso - 1, templates.length - 1);
            texto = templates[idx].texto;
        }
    } else {
        texto = numeroAviso <= 1 ? TEMPLATE_PADRAO_1 : TEMPLATE_PADRAO_2;
    }
    return aplicarTemplate(texto, grupo, grupo.parcelasVencidas);
}

function montarMensagemLembrete(config, grupo) {
    const texto = config?.templateLembrete || TEMPLATE_LEMBRETE_PADRAO;
    return aplicarTemplate(texto, grupo, grupo.parcelasAVencer);
}

function mensagemParaHtml(mensagem, grupo, parcelas) {
    const linhas = parcelas.map(p =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">R$ ${fmtMoeda(p.valor)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #eee;">${fmtData(p.vencimento)}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #eee;">${p.diasAtraso > 0 ? p.diasAtraso + ' dia(s) em atraso' : 'a vencer'}</td></tr>`
    ).join('');
    const total = parcelas.reduce((s, p) => s + p.valor, 0);
    const corpo = mensagem.replace(/\*/g, '').replace(/_/g, '').replace(/\n/g, '<br>');
    return `<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:560px;margin:0 auto;">
        <div style="background:#1E3932;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;font-size:18px;font-weight:bold;">Hardt Salgados</div>
        <div style="border:1px solid #e5e5e5;border-top:0;padding:20px;border-radius:0 0 8px 8px;">
            <p style="white-space:normal;line-height:1.5;">${corpo}</p>
            <table style="border-collapse:collapse;width:100%;margin-top:12px;font-size:14px;">
                <thead><tr style="background:#f2f0eb;"><th style="padding:6px 12px;text-align:left;">Valor</th><th style="padding:6px 12px;text-align:left;">Vencimento</th><th style="padding:6px 12px;text-align:left;">Situação</th></tr></thead>
                <tbody>${linhas}</tbody>
            </table>
            <p style="font-size:16px;margin-top:12px;"><b>Total: R$ ${fmtMoeda(total)}</b></p>
            <p style="color:#777;font-size:12px;margin-top:16px;">Se o pagamento já foi realizado, por favor desconsidere este e-mail.</p>
        </div>
    </div>`;
}

// ── Tarefa por falha de envio ────────────────────────────────────────

const marcadorTarefa = (clienteId) => `#cobranca:${clienteId}`;

/** Existe tarefa de cobrança ainda não concluída para este cliente? */
async function tarefaAbertaDoCliente(clienteId) {
    const tarefas = await prisma.tarefa.findMany({
        where: { ativo: true, descricao: { contains: marcadorTarefa(clienteId) } },
        include: { ocorrencias: { select: { status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5
    });
    return tarefas.find(t => !t.ocorrencias.some(o => o.status === 'CONCLUIDA')) || null;
}

/**
 * Cria a tarefa para o responsável da forma: cadastrar o celular do cliente,
 * iniciar a conversa no bot e mandar a cobrança manualmente.
 */
async function criarTarefaFalha(config, grupo, motivo, mensagem) {
    if (!config?.responsavelTarefaId) return null;
    const cliente = grupo.cliente;

    const existente = await tarefaAbertaDoCliente(cliente.UUID);
    if (existente) return existente.id;

    const nome = cliente.NomeFantasia || cliente.Nome;
    const total = grupo.parcelasVencidas.reduce((s, p) => s + p.valor, 0);
    const agora = new Date();

    const tarefa = await prisma.tarefa.create({
        data: {
            titulo: `Cobrança manual: ${nome}`,
            descricao:
                `A cobrança automática por WhatsApp FALHOU para este cliente.\n` +
                `Motivo: ${motivo}\n\n` +
                `O que fazer:\n` +
                `1. Confira/cadastre o celular do cliente no cadastro.\n` +
                `2. Cobre o cliente por outro meio (ligação ou WhatsApp pelo celular da equipe),\n` +
                `   usando a mensagem abaixo.\n\n` +
                `Valor em aberto: R$ ${fmtMoeda(total)} (${grupo.parcelasVencidas.length} parcela(s))\n\n` +
                `Mensagem de cobrança:\n${mensagem}\n\n` +
                `${marcadorTarefa(cliente.UUID)}`,
            dataInicio: dataLocalStr(agora),
            hora: horaLocalStr(agora),
            recorrencia: 'NUNCA',
            insistir: true,
            criadoPorId: config.responsavelTarefaId,
            responsavelId: config.responsavelTarefaId,
            anexos: {
                create: [
                    { tipo: 'LINK', nome: `Cadastro do cliente ${nome}`, url: `/clientes/${cliente.UUID}` },
                    { tipo: 'LINK', nome: 'Painel da Régua de Cobrança', url: '/financeiro/cobranca' }
                ]
            }
        }
    });
    console.log(`[Cobranca] Tarefa criada para ${config.responsavelTarefa?.nome || config.responsavelTarefaId}: cliente ${nome} (${motivo})`);
    return tarefa.id;
}

// ── Envio para um grupo ──────────────────────────────────────────────

async function registrarEnvio(dados) {
    try {
        return await prisma.cobrancaEnvio.create({ data: dados });
    } catch (e) {
        console.error('[Cobranca] Falha ao gravar log de envio:', e.message);
        return null;
    }
}

/**
 * Envia a cobrança de um grupo (cliente+forma) pelos canais ativos da config.
 * Retorna resumo { whatsapp, email, sms } com ok/motivo de cada canal usado.
 */
async function enviarCobrancaGrupo(grupo, { tipo = 'COBRANCA', numeroAviso = 1, config = null } = {}) {
    const cfg = config || grupo.config;
    const cliente = grupo.cliente;
    const ehLembrete = tipo === 'LEMBRETE';
    const parcelas = ehLembrete ? grupo.parcelasAVencer : grupo.parcelasVencidas;
    if (!parcelas.length) return { motivo: 'Nada a cobrar' };

    const mensagem = ehLembrete ? montarMensagemLembrete(cfg, grupo) : montarMensagemCobranca(cfg, grupo, numeroAviso);
    const total = parcelas.reduce((s, p) => s + p.valor, 0);
    const vencMaisAntigo = parcelas[0].vencimento;
    const snapshot = parcelas.map(p => ({ parcelaId: p.parcelaId, numero: p.numero, valor: p.valor, vencimento: p.vencimento }));
    const nome = cliente.NomeFantasia || cliente.Nome;

    const base = {
        clienteId: cliente.UUID,
        configId: cfg?.id || null,
        tipo,
        numeroAviso,
        parcelas: snapshot,
        valorTotal: total,
        mensagem
    };
    const resultado = {};

    // WhatsApp
    if (!cfg || cfg.canalWhatsapp) {
        const telefone = cliente.Telefone_Celular || '';
        const r = telefone
            ? await webhookService.enviarCobranca({
                telefone,
                nome,
                mensagem,
                // Idempotência: se o job da régua rodar duas vezes, o bot recusa o
                // 2º envio deste mesmo aviso (`duplicado`) — o cliente não é cobrado em dobro.
                referencia: `cobranca-${cliente.UUID}-${tipo}-${numeroAviso}`,
            })
            : { ok: false, motivo: 'Cliente sem celular cadastrado' };

        let tarefaId = null;
        if (!r.ok && !ehLembrete) {
            try {
                tarefaId = await criarTarefaFalha(cfg, grupo, r.motivo, mensagem);
            } catch (e) {
                console.error('[Cobranca] Erro ao criar tarefa de falha:', e.message);
            }
        }
        await registrarEnvio({
            ...base,
            canal: 'WHATSAPP',
            destino: telefone || null,
            status: r.ok ? 'ENVIADO' : 'ERRO',
            erro: r.ok ? null : r.motivo,
            tarefaId
        });
        resultado.whatsapp = r;
    }

    // E-mail
    if (cfg?.canalEmail) {
        const email = (cliente.Email || '').trim();
        const assunto = ehLembrete
            ? `Lembrete de vencimento — Hardt Salgados`
            : `Aviso de pagamento em aberto — Hardt Salgados`;
        const r = email
            ? await emailService.enviar(email, assunto, mensagemParaHtml(mensagem, grupo, parcelas))
            : { ok: false, motivo: 'Cliente sem e-mail cadastrado' };
        await registrarEnvio({
            ...base,
            canal: 'EMAIL',
            destino: email || null,
            status: r.ok ? 'ENVIADO' : 'ERRO',
            erro: r.ok ? null : r.motivo
        });
        resultado.email = r;
    }

    // SMS
    if (cfg?.canalSms) {
        const telefone = cliente.Telefone_Celular || cliente.Telefone || '';
        const textoSms = mensagem.replace(/[*_]/g, '');
        const r = telefone
            ? await smsService.enviar(telefone, textoSms)
            : { ok: false, motivo: 'Cliente sem telefone cadastrado' };
        await registrarEnvio({
            ...base,
            canal: 'SMS',
            destino: telefone || null,
            status: r.ok ? 'ENVIADO' : 'ERRO',
            erro: r.ok ? null : r.motivo
        });
        resultado.sms = r;
    }

    return resultado;
}

// ── Regras da régua (quando enviar) ──────────────────────────────────

/**
 * Decide a situação do grupo na régua automática.
 * Retorna { deveEnviar, numeroAviso, situacao, proximoEnvio }.
 * situacao: SEM_CONFIG | DESATIVADA | NAO_COBRA_VENCIDA | AGUARDANDO_PRIMEIRO |
 *           AGUARDANDO_FREQUENCIA | LIMITE_ATINGIDO | ENVIAR
 */
async function avaliarGrupo(grupo) {
    const cfg = grupo.config;
    if (!cfg) return { deveEnviar: false, situacao: 'SEM_CONFIG', proximoEnvio: null, numeroAviso: 0 };
    if (!cfg.ativo) return { deveEnviar: false, situacao: 'DESATIVADA', proximoEnvio: null, numeroAviso: 0 };
    if (!grupo.parcelasVencidas.length) return { deveEnviar: false, situacao: 'SEM_VENCIDAS', proximoEnvio: null, numeroAviso: 0 };
    if (!cfg.enviarVencida) return { deveEnviar: false, situacao: 'NAO_COBRA_VENCIDA', proximoEnvio: null, numeroAviso: 0 };

    const diasMax = Math.max(...grupo.parcelasVencidas.map(p => p.diasAtraso));
    const vencMaisAntigo = new Date(grupo.parcelasVencidas[0].vencimento);

    // Avisos já feitos DESTA dívida (desde que a parcela mais antiga venceu)
    const enviosAnteriores = await prisma.cobrancaEnvio.findMany({
        where: {
            clienteId: grupo.cliente.UUID,
            configId: cfg.id,
            tipo: { in: ['COBRANCA', 'MANUAL'] },
            status: 'ENVIADO',
            createdAt: { gte: vencMaisAntigo }
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
    });
    const numeroAviso = enviosAnteriores.length + 1;

    if (enviosAnteriores.length >= cfg.maxAvisos) {
        return { deveEnviar: false, situacao: 'LIMITE_ATINGIDO', proximoEnvio: null, numeroAviso };
    }

    if (enviosAnteriores.length === 0) {
        // 1º aviso: X dias após o vencimento (efetivo — fim de semana conta como segunda)
        if (diasMax >= cfg.diasPrimeiroAviso) {
            return { deveEnviar: true, situacao: 'ENVIAR', proximoEnvio: null, numeroAviso: 1 };
        }
        const baseEfetiva = grupo.parcelasVencidas[0].vencimentoEfetivo || vencMaisAntigo;
        const proximo = new Date(new Date(baseEfetiva).getTime() + cfg.diasPrimeiroAviso * DIA_MS);
        return { deveEnviar: false, situacao: 'AGUARDANDO_PRIMEIRO', proximoEnvio: proximo, numeroAviso: 1 };
    }

    // Avisos seguintes: respeitar a frequência
    const ultimo = new Date(enviosAnteriores[0].createdAt);
    const ultimoDia = new Date(ultimo.getFullYear(), ultimo.getMonth(), ultimo.getDate());
    const diasDesdeUltimo = Math.floor((hojeLocal() - ultimoDia) / DIA_MS);
    if (diasDesdeUltimo >= cfg.repetirCadaDias) {
        return { deveEnviar: true, situacao: 'ENVIAR', proximoEnvio: null, numeroAviso };
    }
    const proximo = new Date(ultimoDia.getTime() + cfg.repetirCadaDias * DIA_MS);
    return { deveEnviar: false, situacao: 'AGUARDANDO_FREQUENCIA', proximoEnvio: proximo, numeroAviso };
}

/** O lembrete pré-vencimento deve sair hoje? (1 por janela de lembrete) */
async function deveEnviarLembrete(grupo) {
    const cfg = grupo.config;
    if (!cfg || !cfg.ativo || !cfg.lembreteAntes || !grupo.parcelasAVencer.length) return false;
    const dias = cfg.diasLembrete || 3;
    // Só quando alguma parcela está exatamente dentro da janela
    const dentroJanela = grupo.parcelasAVencer.some(p => {
        const diasParaVencer = -p.diasAtraso; // diasAtraso negativo = dias até vencer
        return diasParaVencer >= 0 && diasParaVencer <= dias;
    });
    if (!dentroJanela) return false;

    const desde = new Date(hojeLocal().getTime() - (dias + 1) * DIA_MS);
    const jaEnviado = await prisma.cobrancaEnvio.findFirst({
        where: {
            clienteId: grupo.cliente.UUID,
            configId: cfg.id,
            tipo: 'LEMBRETE',
            status: 'ENVIADO',
            createdAt: { gte: desde }
        }
    });
    return !jaEnviado;
}

// ── Conferência no Conta Azul antes de enviar ────────────────────────

/**
 * Antes de cobrar, sincroniza as contas do grupo com o Conta Azul (aplica
 * baixas feitas lá que ainda não chegaram aqui) e refiltra as parcelas.
 * Retorna true se ainda sobrou algo em aberto para cobrar.
 */
async function conferirNoCA(grupo) {
    const contasReceberSyncService = require('./contasReceberSyncService');
    const contas = [...new Set(grupo.parcelasVencidas.map(p => p.contaReceberId))];
    for (const contaId of contas) {
        try { await contasReceberSyncService.sincronizarConta(contaId); }
        catch (e) { /* sem vínculo com o CA ou CA fora do ar — segue com o dado local */ }
    }

    const ids = grupo.parcelasVencidas.map(p => p.parcelaId);
    const atuais = await prisma.parcela.findMany({ where: { id: { in: ids } } });
    const abertas = new Map(
        atuais.filter(p => ['PENDENTE', 'PARCIAL', 'VENCIDO'].includes(p.status)).map(p => [p.id, p])
    );
    grupo.parcelasVencidas = grupo.parcelasVencidas.filter(item => {
        const p = abertas.get(item.parcelaId);
        if (!p) return false;
        const devido = valorDevido(p);
        if (devido < 0.01) return false;
        item.valor = devido; // baixa parcial no CA reduz o valor cobrado
        return true;
    });
    return grupo.parcelasVencidas.length > 0;
}

// ── Execução da régua (worker + botão "Executar agora") ─────────────

let _executando = false;
const _status = { executando: false, total: 0, processados: 0, iniciadoEm: null };

const getStatusExecucao = () => ({ ..._status });

/**
 * Roda a régua como FILA: avalia todo mundo, e envia um cliente por vez com
 * intervalo de 1 minuto entre mensagens (proteção do WhatsApp). Antes de cada
 * envio confere no Conta Azul se a dívida ainda está em aberto.
 * opts.configId: processa só os grupos daquela forma de recebimento (disparo
 * por horário próprio da forma).
 */
async function executarRegua({ forcarManual = false, configId = null } = {}) {
    if (_executando) return { ok: false, motivo: 'Régua já em execução' };
    _executando = true;
    Object.assign(_status, { executando: true, total: 0, processados: 0, iniciadoEm: new Date() });
    try {
        const global = await getCobrancaConfigGlobal();
        if (!global.ativo && !forcarManual) {
            return { ok: false, motivo: 'Régua de cobrança desativada nas configurações' };
        }

        let { grupos } = await montarGrupos();
        if (configId) grupos = grupos.filter(g => g.config?.id === configId);
        const resumo = { clientesAvaliados: grupos.length, cobrancasEnviadas: 0, lembretesEnviados: 0, puladosPagosCA: 0, falhas: 0, tarefasCriadas: 0 };

        // 1) Avalia tudo primeiro e monta a fila
        const fila = [];
        for (const grupo of grupos) {
            try {
                const avaliacao = await avaliarGrupo(grupo);
                if (avaliacao.deveEnviar) fila.push({ grupo, tipo: 'COBRANCA', numeroAviso: avaliacao.numeroAviso });
                else if (await deveEnviarLembrete(grupo)) fila.push({ grupo, tipo: 'LEMBRETE', numeroAviso: 0 });
            } catch (e) {
                console.error(`[Cobranca] Erro ao avaliar ${grupo.cliente.Nome}:`, e.message);
            }
        }
        _status.total = fila.length;
        console.log(`[Cobranca] Fila montada: ${fila.length} envio(s)${configId ? ` (forma ${configId})` : ''}`);

        // 2) Processa a fila: 1 cliente por vez, 1 minuto entre envios
        let enviados = 0;
        for (const { grupo, tipo, numeroAviso } of fila) {
            try {
                // Confere no CA se ainda está em aberto (só para cobrança de vencidas)
                if (tipo !== 'LEMBRETE' && !(await conferirNoCA(grupo))) {
                    resumo.puladosPagosCA++;
                    _status.processados++;
                    console.log(`[Cobranca] Pulado (pago no CA): ${grupo.cliente.Nome}`);
                    continue;
                }

                if (enviados > 0) await sleep(INTERVALO_ENTRE_ENVIOS_MS);
                const r = await enviarCobrancaGrupo(grupo, { tipo, numeroAviso });
                enviados++;
                const algumOk = ['whatsapp', 'email', 'sms'].some(c => r[c]?.ok);
                if (tipo === 'LEMBRETE') { if (algumOk) resumo.lembretesEnviados++; }
                else if (algumOk) resumo.cobrancasEnviadas++;
                else resumo.falhas++;
                if (tipo !== 'LEMBRETE' && r.whatsapp && !r.whatsapp.ok) resumo.tarefasCriadas++;
            } catch (e) {
                console.error(`[Cobranca] Erro no envio para ${grupo.cliente.Nome}:`, e.message);
                resumo.falhas++;
            }
            _status.processados++;
        }

        console.log(`[Cobranca] Régua executada: ${JSON.stringify(resumo)}`);
        return { ok: true, ...resumo };
    } finally {
        _executando = false;
        Object.assign(_status, { executando: false });
    }
}

/** Envio manual imediato para um cliente (botão "Cobrar agora" do painel). */
async function cobrarClienteAgora(clienteId) {
    const { grupos } = await montarGrupos();
    const candidatos = grupos.filter(g => g.cliente.UUID === clienteId && g.parcelasVencidas.length > 0);
    if (!candidatos.length) return { ok: false, motivo: 'Cliente sem parcelas vencidas em aberto' };

    // Confere no CA antes de cobrar (se pagou lá, não incomoda o cliente)
    const doCliente = [];
    for (const grupo of candidatos) {
        if (await conferirNoCA(grupo)) doCliente.push(grupo);
    }
    if (!doCliente.length) return { ok: false, motivo: 'Parcelas já baixadas no Conta Azul — nada a cobrar (painel será atualizado)' };

    const resultados = [];
    for (const grupo of doCliente) {
        const enviosAnteriores = grupo.config ? await prisma.cobrancaEnvio.count({
            where: {
                clienteId, configId: grupo.config.id, tipo: { in: ['COBRANCA', 'MANUAL'] },
                status: 'ENVIADO', createdAt: { gte: new Date(grupo.parcelasVencidas[0].vencimento) }
            }
        }) : 0;
        const r = await enviarCobrancaGrupo(grupo, { tipo: 'MANUAL', numeroAviso: enviosAnteriores + 1 });
        resultados.push({ forma: grupo.forma, ...r });
    }
    const algumOk = resultados.some(r => ['whatsapp', 'email', 'sms'].some(c => r[c]?.ok));
    return { ok: algumOk, resultados };
}

// ── Painel de inadimplentes ──────────────────────────────────────────

async function painelInadimplentes() {
    const { grupos } = await montarGrupos();
    const comVencidas = grupos.filter(g => g.parcelasVencidas.length > 0);

    const itens = [];
    for (const g of comVencidas) {
        const avaliacao = await avaliarGrupo(g);
        const ultimoEnvio = await prisma.cobrancaEnvio.findFirst({
            where: { clienteId: g.cliente.UUID, ...(g.config ? { configId: g.config.id } : {}) },
            orderBy: { createdAt: 'desc' },
            select: { canal: true, status: true, erro: true, tipo: true, numeroAviso: true, createdAt: true, tarefaId: true }
        });
        const tarefaAberta = await tarefaAbertaDoCliente(g.cliente.UUID);

        itens.push({
            cliente: {
                id: g.cliente.UUID,
                nome: g.cliente.NomeFantasia || g.cliente.Nome,
                celular: g.cliente.Telefone_Celular || null,
                email: g.cliente.Email || null,
                vendedor: g.cliente.vendedor?.nome || null
            },
            forma: g.forma,
            temConfig: !!g.config,
            configAtiva: !!g.config?.ativo,
            parcelas: g.parcelasVencidas,
            valorTotal: g.parcelasVencidas.reduce((s, p) => s + p.valor, 0),
            diasAtrasoMax: Math.max(...g.parcelasVencidas.map(p => p.diasAtraso)),
            situacao: avaliacao.situacao,
            numeroAviso: avaliacao.numeroAviso,
            proximoEnvio: avaliacao.proximoEnvio,
            ultimoEnvio,
            tarefaAberta: tarefaAberta ? {
                id: tarefaAberta.id,
                titulo: tarefaAberta.titulo,
                dataInicio: tarefaAberta.dataInicio,
                responsavelId: tarefaAberta.responsavelId
            } : null
        });
    }

    itens.sort((a, b) => b.valorTotal - a.valorTotal);
    const totais = {
        clientes: new Set(itens.map(i => i.cliente.id)).size,
        valorVencido: itens.reduce((s, i) => s + i.valorTotal, 0),
        parcelas: itens.reduce((s, i) => s + i.parcelas.length, 0),
        comErro: itens.filter(i => i.ultimoEnvio?.status === 'ERRO').length,
        semCelular: itens.filter(i => !i.cliente.celular).length
    };
    return { totais, itens };
}

/** Pré-visualização da mensagem com dados de exemplo (editor de templates). */
function previewMensagem(texto) {
    const grupoExemplo = {
        cliente: { Nome: 'Padaria Exemplo LTDA', NomeFantasia: 'Padaria Exemplo' },
        parcelasVencidas: [
            { parcelaId: 'x', numero: 1, valor: 350.0, vencimento: new Date(hojeLocal().getTime() - 8 * DIA_MS), diasAtraso: 8 },
            { parcelaId: 'y', numero: 2, valor: 180.5, vencimento: new Date(hojeLocal().getTime() - 1 * DIA_MS), diasAtraso: 1 }
        ]
    };
    return aplicarTemplate(texto || TEMPLATE_PADRAO_1, grupoExemplo, grupoExemplo.parcelasVencidas);
}

module.exports = {
    executarRegua,
    cobrarClienteAgora,
    painelInadimplentes,
    previewMensagem,
    getCobrancaConfigGlobal,
    getStatusExecucao,
    TEMPLATES_PADRAO: { aviso1: TEMPLATE_PADRAO_1, aviso2: TEMPLATE_PADRAO_2, lembrete: TEMPLATE_LEMBRETE_PADRAO },
    MODELOS_PRONTOS
};
