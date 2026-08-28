// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp do cliente — obrigatoriedade, dispensa justificada e relatório
//
// O problema real: vendedor não preenche o telefone do cliente. Quando o
// vendedor falta, o escritório não consegue fazer os pedidos da carteira dele.
// Só que obrigar sem verificar faz o vendedor inventar número — por isso o
// módulo tem três camadas (dispensa aqui, verificação em whatsappVerificacaoService,
// selo por uso real em whatsappSeloService).
//
// "WhatsApp do cliente" = `clientes.Telefone_Celular`. É o ÚNICO campo que o
// sistema usa para mandar WhatsApp (webhookService: formatPhone lê esse campo).
// A tabela `cliente_whatsapps` serve para RECONHECER quem escreve para o bot —
// não é a fonte da verdade aqui.
//
// Toda regra de "esse cliente pode enviar pedido?" mora NESTE arquivo. Nunca
// duplicar a validação no controller.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');
const botWhatsappService = require('./botWhatsappService');

const CONFIG_KEY = 'whatsapp_cliente_config';

// Motivos fechados da dispensa — qualquer outro valor é recusado (400).
const MOTIVOS = ['NAO_TEM_WHATSAPP', 'NAO_QUIS_INFORMAR', 'VOU_PEGAR_DEPOIS'];

const MOTIVO_LABEL = {
    NAO_TEM_WHATSAPP: 'Cliente não tem WhatsApp',
    NAO_QUIS_INFORMAR: 'Cliente não quis informar',
    VOU_PEGAR_DEPOIS: 'Vou pegar o número depois',
};

const DIAS_VALIDADE_PADRAO = 60;

// ── Número válido? ───────────────────────────────────────────────────────────
// Juiz final é o normalizador do bot ("o bot consegue mandar para esse número?"),
// somado à regra de tela: 10 ou 11 dígitos com DDD. Uma função só, usada por
// controller, relatório e trava do pedido.
const numeroValido = (raw) => {
    const d = String(raw ?? '').replace(/\D/g, '');
    if (!d) return false;
    // cadastros antigos importados podem ter vindo com DDI
    const local = (d.length > 11 && d.startsWith('55')) ? d.slice(2) : d;
    if (local.length < 10 || local.length > 11) return false;
    return !!botWhatsappService.normalizarTelefone(local);
};

// ── Configuração (dois interruptores INDEPENDENTES) ──────────────────────────
// Padrão de fábrica DESLIGADO nos dois: o dono liga quando quiser, igual ao
// módulo de GPS.
//
//   `ativo`                 → bloqueia o ENVIAR do pedido e obriga o número no cadastro.
//   `mostrarSeloNasListas`  → só MOSTRA o selo de WhatsApp nas listas de campo
//                             (Rota/Atendimentos/Atendidos/Entregas/Entregues).
//
// São propositalmente independentes: "desligado = nada muda" foi a promessa feita
// ao dono. Amarrar o selo ao `ativo` o obrigaria a ligar o bloqueio do pedido só
// para enxergar quem tem WhatsApp — não é isso que ele pediu.
const getConfig = async () => {
    const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } });
    const v = (cfg && typeof cfg.value === 'object' && cfg.value) || {};
    const dias = Number(v.diasValidadeDispensa);
    return {
        ativo: v.ativo === true,
        diasValidadeDispensa: Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : DIAS_VALIDADE_PADRAO,
        mostrarSeloNasListas: v.mostrarSeloNasListas === true,
    };
};

const setConfig = async (patch) => {
    const atual = await getConfig();
    const value = { ...atual, ...patch };
    await prisma.appConfig.upsert({
        where: { key: CONFIG_KEY },
        update: { value },
        create: { key: CONFIG_KEY, value },
    });
    return getConfig();
};

// ── Dispensa ─────────────────────────────────────────────────────────────────

const dispensaValida = (status, dias) => {
    if (!status?.dispensaEm || !status?.dispensaMotivo) return false;
    const limite = new Date(status.dispensaEm).getTime() + dias * 24 * 60 * 60 * 1000;
    return limite >= Date.now();
};

const validaAte = (dispensaEm, dias) =>
    dispensaEm ? new Date(new Date(dispensaEm).getTime() + dias * 24 * 60 * 60 * 1000) : null;

/**
 * Registra a dispensa justificada de um cliente ANTIGO (cliente novo não tem
 * escape: o cadastro exige o número). Motivo fora da lista → erro 400.
 */
const registrarDispensa = async (clienteUuid, motivo, autor = {}) => {
    if (!MOTIVOS.includes(motivo)) {
        const e = new Error('Motivo inválido. Escolha uma das opções da lista.');
        e.status = 400;
        throw e;
    }
    const cliente = await prisma.cliente.findUnique({ where: { UUID: clienteUuid }, select: { UUID: true } });
    if (!cliente) {
        const e = new Error('Cliente não encontrado.');
        e.status = 404;
        throw e;
    }

    const dispensaEm = new Date();
    const dados = {
        dispensaMotivo: motivo,
        dispensaPorId: autor.id || null,
        dispensaPorNome: autor.nome || null,
        dispensaEm,
    };
    await prisma.clienteWhatsappStatus.upsert({
        where: { clienteUuid },
        update: dados,
        create: { clienteUuid, ...dados },
    });

    const { diasValidadeDispensa } = await getConfig();
    return {
        ok: true,
        dispensaEm: dispensaEm.toISOString(),
        validaAte: validaAte(dispensaEm, diasValidadeDispensa).toISOString(),
    };
};

// ── Verificação (grava o resultado da consulta ao bot) ───────────────────────
// Best-effort: nunca lança para quem chama — o cadastro já é mais importante
// que o carimbo da verificação.
const registrarVerificacao = async (clienteUuid, numero, resultado) => {
    try {
        const verificacaoService = require('./whatsappVerificacaoService');
        const dados = {
            verificacaoStatus: verificacaoService.statusDaVerificacao(resultado),
            verificacaoNumero: String(numero ?? '').replace(/\D/g, '') || null,
            verificacaoEm: new Date(),
        };
        await prisma.clienteWhatsappStatus.upsert({
            where: { clienteUuid },
            update: dados,
            create: { clienteUuid, ...dados },
        });
    } catch (e) {
        console.error('[WhatsappCliente] falha ao gravar verificação (cadastro já salvo):', e.message);
    }
};

// ── Bloqueio de pedido sem WhatsApp (chamado no ENVIAR) ──────────────────────
// Espelho de gpsClientesService.validarPedidoEnviar.
// Retorna null (pode enviar) ou a mensagem de bloqueio, pronta para o usuário.
const validarPedidoEnviar = async (clienteId) => {
    const cfg = await getConfig();
    if (!cfg.ativo) return null;
    if (!clienteId) return null;

    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteId },
        select: {
            Telefone_Celular: true,
            Nome: true,
            NomeFantasia: true,
            whatsappStatus: { select: { dispensaMotivo: true, dispensaEm: true } },
        },
    });
    if (!cliente) return null;
    if (numeroValido(cliente.Telefone_Celular)) return null;
    if (dispensaValida(cliente.whatsappStatus, cfg.diasValidadeDispensa)) return null;

    const nome = cliente.NomeFantasia || cliente.Nome;
    return `O cliente "${nome}" está sem WhatsApp no cadastro. Informe o número do WhatsApp dele para enviar o pedido — é por ele que o cliente recebe a confirmação e o escritório consegue falar com ele quando o vendedor não está.`;
};

// ── Relatório de pendências (tela do escritório) ─────────────────────────────

const pendencias = async () => {
    const cfg = await getConfig();

    // Só clientes ATIVOS: fornecedor importado entra em `clientes` com Ativo:false
    // e apareceria aqui como pendência de um vendedor que nunca o atendeu.
    const clientes = await prisma.cliente.findMany({
        where: { Ativo: true },
        select: {
            UUID: true, Nome: true, NomeFantasia: true, Documento: true,
            End_Cidade: true, Telefone_Celular: true, idVendedor: true,
            vendedor: { select: { id: true, nome: true } },
            whatsappStatus: {
                select: {
                    selo: true, seloEm: true, seloMotivo: true,
                    verificacaoStatus: true, verificacaoEm: true,
                    dispensaMotivo: true, dispensaPorNome: true, dispensaEm: true,
                },
            },
        },
    });

    // `emUso` e `seloUltimaAtualizacao` são o TERMÔMETRO do selo. Sem eles não havia
    // nenhum lugar no app mostrando quantos selos verdes existem: o botão "Recalcular
    // agora" só devolvia `gravados` (= linhas que MUDARAM), então uma varredura que
    // encontrasse tudo já correto reportava zero e parecia que nada funcionou.
    // Contar o resultado, e não a escrita, é o que distingue "não calculou" de
    // "calculou e já estava gravado".
    //
    // `seloUltimaAtualizacao` vem do CARIMBO DA RODADA gravado pela varredura
    // (whatsappSeloService), NÃO de `max(seloEm)` dos clientes: `seloEm` só é escrito
    // quando o selo muda de valor e vira null quando ele se apaga, então derivá-lo daí
    // responderia "quando alguém trocou de selo" e não "quando a conta rodou" — e numa
    // base sem selo nenhum a tela continuaria dizendo "ainda não calculado" mesmo
    // depois de o dono clicar em recalcular. Require preguiçoso de propósito: mantém
    // este módulo livre de ciclo se um dia o serviço do selo precisar de algo daqui.
    const { ultimaRodada } = require('./whatsappSeloService');
    const kpis = {
        totalAtivos: clientes.length, semNumero: 0, dispensados: 0,
        comProblema: 0, verificados: 0, emUso: 0,
        seloUltimaAtualizacao: await ultimaRodada(),
    };
    const porVendedor = new Map();

    // A tela deriva daqui a frase "o selo só existe para quem tem número no campo
    // Celular/WhatsApp — hoje N de M clientes ativos têm": N = totalAtivos menos
    // (semNumero + dispensados), M = totalAtivos. Ou seja, ela depende de `semNumero` e
    // `dispensados` classificarem exatamente "quem NÃO tem número aproveitável" — o que
    // a cadeia if/else abaixo garante. Mudar essa classificação muda a frase da tela.
    for (const c of clientes) {
        const st = c.whatsappStatus || null;
        if (st?.verificacaoStatus === 'EXISTE') kpis.verificados++;
        if (st?.selo === 'EM_USO') kpis.emUso++;

        const temNumero = numeroValido(c.Telefone_Celular);
        const temDispensa = dispensaValida(st, cfg.diasValidadeDispensa);

        // Cada cliente entra em UMA situação só, e o KPI conta exatamente as linhas que
        // a tela mostra com aquele rótulo. "Com problema" é sobre um número QUE EXISTE e
        // foi recusado — cliente sem número aparece como "Sem número" e não pode inflar
        // esse KPI (senão o placar fica maior que a lista vermelha e ninguém fecha a conta).
        let situacao = null;
        if (!temNumero && temDispensa) { situacao = 'DISPENSADO'; kpis.dispensados++; }
        else if (!temNumero) { situacao = 'SEM_NUMERO'; kpis.semNumero++; }
        else if (st?.selo === 'COM_PROBLEMA') { situacao = 'COM_PROBLEMA'; kpis.comProblema++; }

        if (!situacao) continue;

        const vendedorId = c.vendedor?.id || c.idVendedor || null;
        const chave = vendedorId || '__sem_vendedor__';
        if (!porVendedor.has(chave)) {
            porVendedor.set(chave, {
                vendedorId,
                vendedorNome: c.vendedor?.nome || 'Sem vendedor',
                semNumero: 0,
                dispensados: 0,
                clientes: [],
            });
        }
        const grupo = porVendedor.get(chave);
        if (situacao === 'SEM_NUMERO') grupo.semNumero++;
        if (situacao === 'DISPENSADO') grupo.dispensados++;
        grupo.clientes.push({
            uuid: c.UUID,
            nome: c.NomeFantasia || c.Nome,
            documento: c.Documento || null,
            cidade: c.End_Cidade || null,
            situacao,
            dispensaMotivo: st?.dispensaMotivo || null,
            dispensaPorNome: st?.dispensaPorNome || null,
            dispensaEm: st?.dispensaEm || null,
            // CAMPO ADICIONADO (só adição — nada removido/renomeado): a tela promete
            // "Dispensado até DD/MM" e não tinha como calcular sem saber a validade.
            dispensaValidaAte: validaAte(st?.dispensaEm, cfg.diasValidadeDispensa)?.toISOString() || null,
            selo: st?.selo || null,
            verificacaoStatus: st?.verificacaoStatus || null,
        });
    }

    const vendedores = [...porVendedor.values()]
        .map(v => ({
            ...v,
            clientes: v.clientes.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
        }))
        .sort((a, b) =>
            (b.semNumero - a.semNumero) ||
            String(a.vendedorNome).localeCompare(String(b.vendedorNome), 'pt-BR')
        );

    return { ativo: cfg.ativo, kpis, vendedores };
};

module.exports = {
    CONFIG_KEY,
    MOTIVOS,
    MOTIVO_LABEL,
    numeroValido,
    getConfig,
    setConfig,
    dispensaValida,
    registrarDispensa,
    registrarVerificacao,
    validarPedidoEnviar,
    pendencias,
};
