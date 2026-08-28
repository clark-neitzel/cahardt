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
    const cliente = await prisma.cliente.findUnique({
        where: { UUID: clienteUuid },
        select: { UUID: true, Telefone_Celular: true },
    });
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
        // Esta upsert pode ser a PRIMEIRA linha do cliente na tabela. Sem carimbar o
        // espelho aqui, ela nasceria com o `temNumero` do @default (false) e o filtro
        // da lista chamaria de "dispensado" um cliente que tem número no cadastro.
        temNumero: numeroValido(cliente.Telefone_Celular),
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
            // Mesma razão da dispensa: esta upsert pode CRIAR a linha, e o @default do
            // espelho é false. O número que acabou de ser conferido é o que está sendo
            // gravado no cadastro — é ele que manda aqui.
            temNumero: numeroValido(numero),
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

// ─────────────────────────────────────────────────────────────────────────────
// SITUAÇÃO DO WHATSAPP como FILTRO da lista de clientes
//
// A tela de Clientes é paginada NO SERVIDOR (`skip`/`take` + `count({ where })`).
// Filtrar em memória filtraria só a página aberta: o contador mentiria e, como
// "em uso" ainda é minoria, a página 1 viria quase sempre vazia — fazendo quem
// olha concluir "ninguém tem WhatsApp". Por isso a situação precisa virar `where`
// de verdade, entrando na MESMA condição que alimenta o `count`.
//
// A cascata abaixo é o ESPELHO EXATO da de `pendencias()` (mesma ordem, mesmas
// perguntas). Se as duas divergirem, a tela de Pendências e o filtro de Clientes
// passam a dar números diferentes para o mesmo cliente — e aí ninguém confia em
// nenhuma das duas. Mexeu numa, mexa na outra.
//
//   SEM_NUMERO    sem número aproveitável e sem dispensa vigente
//   DISPENSADO    sem número aproveitável, mas com dispensa dentro da validade
//   COM_PROBLEMA  tem número e o bot recusou o envio por causa DELE
//   EM_USO        tem número e já saiu mensagem para ele
//   SEM_HISTORICO tem número e ainda não houve sinal nenhum
//
// Duas armadilhas do Prisma que ficam de pé aqui:
//  1. quem NUNCA teve sinal não tem LINHA em `cliente_whatsapp_status` — toda
//     situação de "sem número" precisa de `OR` cobrindo `whatsappStatus: is null`;
//  2. `not`/`notIn` EXCLUEM linhas null (regra do projeto). Por isso a validade da
//     dispensa é negada com `OR` explícito listando os nulos, nunca com um `not`.
// ─────────────────────────────────────────────────────────────────────────────

const SITUACOES = ['EM_USO', 'SEM_HISTORICO', 'COM_PROBLEMA', 'SEM_NUMERO', 'DISPENSADO'];

/**
 * Devolve o pedaço de `where` (sobre `Cliente`) da situação pedida, ou `null`
 * quando o valor é ausente/desconhecido — nesse caso quem chama NÃO filtra nada.
 *
 * As cinco situações PARTICIONAM a base: todo cliente cai em exatamente uma.
 * É essa propriedade que faz a soma das cinco contagens bater com o total, e é
 * ela que denuncia classificação sobreposta ou faltando.
 */
const whereSituacao = async (situacao) => {
    if (!situacao || !SITUACOES.includes(situacao)) return null;
    const { diasValidadeDispensa } = await getConfig();
    // Mesmo corte de `dispensaValida`, só que como comparação de data — assim a
    // dispensa vence sozinha com o tempo e o filtro acompanha, sem recalcular em JS.
    const corte = new Date(Date.now() - diasValidadeDispensa * 24 * 60 * 60 * 1000);

    // Dispensa VIGENTE: precisa de motivo E de data dentro da validade (é o que
    // `dispensaValida` exige). `{ not: null }` aqui é proposital — queremos mesmo
    // deixar os nulos de fora.
    const dispensaVigente = { dispensaMotivo: { not: null }, dispensaEm: { gte: corte } };
    // A NEGAÇÃO dela, escrita com OR explícito (De Morgan) para não perder os nulos.
    const dispensaVencidaOuAusente = {
        OR: [{ dispensaMotivo: null }, { dispensaEm: null }, { dispensaEm: { lt: corte } }],
    };

    switch (situacao) {
        case 'EM_USO':
            return { whatsappStatus: { is: { temNumero: true, selo: 'EM_USO' } } };
        case 'COM_PROBLEMA':
            return { whatsappStatus: { is: { temNumero: true, selo: 'COM_PROBLEMA' } } };
        case 'SEM_HISTORICO':
            // "selo nulo" escrito como "nulo OU fora dos dois selos conhecidos": hoje
            // `whatsappSeloService` é o único que grava `selo` e só produz EM_USO,
            // COM_PROBLEMA ou null, mas assim um selo novo no futuro não some da conta
            // e quebra em silêncio a soma das cinco situações.
            return {
                whatsappStatus: {
                    is: {
                        temNumero: true,
                        OR: [{ selo: null }, { selo: { notIn: ['EM_USO', 'COM_PROBLEMA'] } }],
                    },
                },
            };
        case 'DISPENSADO':
            return { whatsappStatus: { is: { temNumero: false, ...dispensaVigente } } };
        case 'SEM_NUMERO':
            // Quem nunca teve sinal NÃO TEM LINHA: sem este primeiro ramo o filtro
            // devolveria só quem já passou por dispensa/verificação — a maior parte
            // dos "sem número" ficaria invisível.
            return {
                OR: [
                    { whatsappStatus: { is: null } },
                    { whatsappStatus: { is: { temNumero: false, ...dispensaVencidaOuAusente } } },
                ],
            };
        default:
            return null;
    }
};

// ── Manutenção do espelho `temNumero` ────────────────────────────────────────

/**
 * Grava `temNumero` de UM cliente a partir do telefone recém-salvo.
 * Best-effort: o cadastro é mais importante que o espelho (a varredura da
 * madrugada conserta). Nunca lança para quem chama.
 *
 * Não cria linha quando o número não presta: linha com tudo nulo/false não
 * carrega informação nenhuma — "sem linha" já significa exatamente isso, e é
 * assim que o filtro de SEM_NUMERO lê.
 */
const sincronizarTemNumero = async (clienteUuid, telefoneCelular) => {
    try {
        const tem = numeroValido(telefoneCelular);
        if (tem) {
            await prisma.clienteWhatsappStatus.upsert({
                where: { clienteUuid },
                update: { temNumero: true },
                create: { clienteUuid, temNumero: true },
            });
        } else {
            // updateMany não estoura quando a linha não existe (e não cria nenhuma).
            await prisma.clienteWhatsappStatus.updateMany({
                where: { clienteUuid },
                data: { temNumero: false },
            });
        }
    } catch (e) {
        console.error('[WhatsappCliente] falha ao espelhar temNumero (cadastro já salvo):', e.message);
    }
};

// Tamanho do bloco de escrita do backfill. 1000 mantém a lista de UUIDs do
// `IN (...)` num tamanho que o Postgres planeja bem e evita um pacote gigante.
const LOTE_TEM_NUMERO = 1000;

const emBlocos = (lista, tamanho) => {
    const blocos = [];
    for (let i = 0; i < lista.length; i += tamanho) blocos.push(lista.slice(i, i + tamanho));
    return blocos;
};

/**
 * Varre a base inteira (ativos E inativos) e põe `temNumero` em dia.
 * É o backfill e a rede de segurança do espelho — roda junto do selo, às 04:20.
 * Escreve só quem mudou.
 *
 * Inclui INATIVO de propósito: a tela de Clientes tem a aba "Inativos" e o filtro
 * é o mesmo lá; deixar o inativo de fora faria a aba mostrar situação velha.
 *
 * ── POR QUE EM BLOCOS, e não uma escrita por cliente ─────────────────────────
 * Quem DECIDE continua sendo o JS (`numeroValido` tira o DDI, exige 10-11 dígitos
 * e passa pelo normalizador do bot — não dá para escrever isso em SQL). O que foi
 * para o banco em bloco são só as ESCRITAS.
 *
 * A primeira execução é o caso que manda: a coluna nasce `false` para a base
 * inteira no `prisma db push`, então o backfill precisa criar/corrigir uma linha
 * para CADA cliente com número. Uma escrita por cliente são milhares de idas e
 * vindas em série no banco compartilhado — e é justamente o botão "Recalcular
 * agora" que espera essa resposta. Estourando o tempo do proxy, quem clicou lê
 * "quebrou", enquanto o filtro ainda mostra "WhatsApp em uso = 0" e a base
 * inteira em "Sem número": exatamente a leitura falsa que este trabalho existe
 * para evitar. Em regime (nada mudou) o custo é zero nas duas formas — o ganho
 * é todo na primeira vez, que é quando ele é indispensável.
 *
 * `skipDuplicates` no `createMany`: entre o `findMany` e a escrita, um cadastro
 * salvo na tela pode ter criado a linha (`sincronizarTemNumero`). Sem ele, a
 * corrida derrubaria o bloco inteiro por chave duplicada.
 */
const sincronizarTemNumeroTodos = async () => {
    const clientes = await prisma.cliente.findMany({
        select: {
            UUID: true,
            Telefone_Celular: true,
            whatsappStatus: { select: { temNumero: true } },
        },
    });

    // 1) Decide tudo em memória — a regra continua sendo a MESMA `numeroValido`.
    const paraCriar = [];   // sem linha e com número → linha nova
    const paraTrue = [];    // tem linha, marca errada → true
    const paraFalse = [];   // tem linha, marca errada → false
    let comNumero = 0, semLinha = 0;

    for (const c of clientes) {
        const tem = numeroValido(c.Telefone_Celular);
        if (tem) comNumero++;
        const linha = c.whatsappStatus;
        if (!linha) {
            if (tem) paraCriar.push({ clienteUuid: c.UUID, temNumero: true });
            else semLinha++;              // nada a registrar: linha vazia não informa nada
            continue;
        }
        if (linha.temNumero === tem) continue;   // já está certo — não escreve à toa
        (tem ? paraTrue : paraFalse).push(c.UUID);
    }

    // 2) Escreve em blocos. Cada bloco em try/catch próprio: um bloco que falha
    //    não pode levar junto os que já entraram nem os seguintes — a varredura
    //    é idempotente e a rodada seguinte conserta o que ficou para trás.
    let criados = 0, atualizados = 0, falhas = 0;

    for (const bloco of emBlocos(paraCriar, LOTE_TEM_NUMERO)) {
        try {
            const r = await prisma.clienteWhatsappStatus.createMany({ data: bloco, skipDuplicates: true });
            criados += r.count;
        } catch (e) {
            falhas += bloco.length;
            console.error(`[WhatsappCliente] falha ao criar bloco de ${bloco.length} temNumero:`, e.message);
        }
    }

    for (const [valor, uuids] of [[true, paraTrue], [false, paraFalse]]) {
        for (const bloco of emBlocos(uuids, LOTE_TEM_NUMERO)) {
            try {
                const r = await prisma.clienteWhatsappStatus.updateMany({
                    where: { clienteUuid: { in: bloco } },
                    data: { temNumero: valor },
                });
                atualizados += r.count;
            } catch (e) {
                falhas += bloco.length;
                console.error(`[WhatsappCliente] falha ao atualizar bloco de ${bloco.length} temNumero para ${valor}:`, e.message);
            }
        }
    }

    console.log(`[WhatsappCliente] temNumero: ${clientes.length} cadastros · ${comNumero} com número · ${criados} linha(s) criada(s) · ${atualizados} atualizada(s) · ${semLinha} sem linha (sem número)${falhas ? ` · ${falhas} não gravado(s)` : ''}`);
    return { avaliados: clientes.length, comNumero, criados, atualizados, semLinha, falhas };
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
    SITUACOES,
    numeroValido,
    getConfig,
    setConfig,
    dispensaValida,
    registrarDispensa,
    registrarVerificacao,
    validarPedidoEnviar,
    whereSituacao,
    sincronizarTemNumero,
    sincronizarTemNumeroTodos,
    pendencias,
};
