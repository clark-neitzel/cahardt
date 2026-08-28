// ─────────────────────────────────────────────────────────────────────────────
// Selo do WhatsApp do cliente pelo USO REAL
//
// Não adianta o vendedor jurar que o número está certo: o que prova é a fila de
// envios do bot (`bot_whatsapp_envios`). Se já saiu mensagem para aquele número,
// ele está EM USO. Se o bot recusou POR CAUSA DO NÚMERO, está COM PROBLEMA.
//
// ── DUAS ARMADILHAS que este arquivo existe para não cair ────────────────────
//
// 1) `bot_whatsapp_envios.telefone` é gravado COM DDI 55 (botWhatsappService
//    normaliza antes de mandar); o cadastro guarda 10-11 dígitos SEM o 55.
//    Um `WHERE telefone = Telefone_Celular` NUNCA casa — e o pior: não dá erro
//    nenhum, o selo simplesmente nunca acende. Por isso o casamento é feito por
//    uma CHAVE TOLERANTE (tira o 55 e tira o 9º dígito), a mesma de
//    iaClienteService.chaveTelefone.
//
// 2) `ENVIADO` significa "o BOT aceitou a mensagem", NÃO "o cliente recebeu" —
//    o bot responde 2xx no POST e não existe callback de entrega. Por isso o
//    rótulo honesto é EM_USO ("mensagem já saiu para esse número"). NUNCA
//    escrever "entregue" em lugar nenhum desta funcionalidade.
//
// Roda 1x por dia no scheduler. NÃO calcular por cliente na listagem — a tela
// de clientes carrega ~2000 registros de uma vez.
// ─────────────────────────────────────────────────────────────────────────────
const prisma = require('../config/database');

const DIAS_JANELA = 180;

// ── Como um erro vira "problema do número" ───────────────────────────────────
//
// O que CHEGA ao banco em `codigoErro` é o que `botWhatsappService.postEnviar`
// devolve: `corpo?.codigo` do bot, ou `http_<status>` quando o bot não mandou
// código. Atenção: `telefone_invalido` NÃO chega aqui — ele é gerado localmente
// num `return` ANTES do `registrar()`, então nunca vira linha em
// `bot_whatsapp_envios`. Ele fica na lista abaixo só por segurança, para o dia em
// que o bot passar a devolver esse código; sozinho, ele deixaria o selo
// permanentemente em zero (foi o que o revisor pegou).
//
// A regra que realmente acende o selo é a de faixa: um **4xx que não é
// reagendável** é o bot dizendo "esse destinatário não serve" — 401/403/429 e
// afins já estão em CODIGOS_REAGENDAR (falha nossa/passageira) e ficam de fora.
// 5xx nunca conta: é problema do lado de lá.
//
// Enquanto não descobrimos os códigos REAIS que o bot manda, a rota de
// diagnóstico `GET /api/whatsapp-clientes/diag-codigos-erro` lista os
// `codigoErro` distintos com contagem — é por ela que a lista abaixo será
// ajustada com dado de verdade, em vez de palpite.
const { CODIGOS_REAGENDAR } = require('./botWhatsappService');

const CODIGOS_DO_NUMERO = [
    'telefone_invalido',
    'numero_invalido',
    'numero_sem_whatsapp',
    'telefone_sem_whatsapp',
    'destinatario_invalido',
];

/** O código de erro registrado acusa o NÚMERO do cliente (e não uma falha nossa)? */
const ehProblemaDoNumero = (codigo) => {
    if (!codigo) return false;
    if (Array.isArray(CODIGOS_REAGENDAR) && CODIGOS_REAGENDAR.includes(codigo)) return false; // falha passageira/nossa
    if (codigo === 'rede' || codigo === 'timeout') return false;
    if (codigo === 'texto_longo' || codigo === 'texto_vazio') return false;                   // erro da mensagem, não do número
    if (CODIGOS_DO_NUMERO.includes(codigo)) return true;
    const m = /^http_(\d{3})$/.exec(codigo);
    if (m) {
        const s = Number(m[1]);
        // 4xx sem código do bot: o destinatário foi recusado. Exceto os status que são
        // notoriamente NOSSOS ou passageiros:
        //   400 payload malformado (campo errado que NÓS mandamos)
        //   401 chave errada · 403 modo de emergência/janela · 408 tempo esgotado
        //   404 rota do bot mudou de lugar (o /enviar deixou de existir onde procuramos)
        //   409 conflito · 413 payload grande · 429 teto de envios
        // 400 e 404 são os mais perigosos: numa troca de rota ou num campo errado, TODO
        // cliente com envio falho na janela viraria "Número com problema" de uma vez —
        // culpando o cliente por defeito nosso e mandando o escritório ligar para gente
        // cujo número está certo. 5xx é sempre problema do lado de lá e nunca conta.
        const NOSSOS = [400, 401, 403, 404, 408, 409, 413, 429];
        return s >= 400 && s < 500 && !NOSSOS.includes(s);
    }
    return false;
};

const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');

/** Chave tolerante: sem DDI 55 e sem o 9º dígito (cópia de iaClienteService). */
function chaveTelefone(raw) {
    let d = soDigitos(raw);
    if (!d) return '';
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
    return d;
}

// ── Carimbo da RODADA (não da mudança) ───────────────────────────────────────
//
// A tela mostra "Selo atualizado em ⟨quando⟩". A primeira versão derivava isso de
// `max(seloEm)` dos clientes — e `seloEm` só é escrito quando o selo MUDA de valor
// (o `continue` logo antes do upsert pula quem já estava certo) e volta a `null`
// quando o selo se apaga. Ou seja, aquilo respondia "quando alguém trocou de selo",
// nunca "quando a conta rodou". Com a base de hoje (ninguém com selo) a tela diria
// "ainda não calculado", o dono clicaria em recalcular, voltaria e leria a MESMA
// frase — reproduzindo, na linha feita para ser o termômetro, exatamente o relatório
// enganoso que originou esta correção. E, com selos parados, envelheceria para sempre
// numa data antiga mesmo com o job rodando toda madrugada.
//
// Por isso o carimbo é gravado pela PRÓPRIA varredura, uma linha em `app_configs`,
// FORA de transação e em try/catch próprio: falhar em anotar a hora nunca pode
// derrubar (nem desfazer) o recálculo que já aconteceu.
const CHAVE_RODADA = 'whatsapp_selo_ultima_rodada';

const registrarRodada = async (dados) => {
    try {
        const value = {
            em: dados.em.toISOString(),
            avaliados: dados.avaliados,
            emUso: dados.emUso,
            comProblema: dados.comProblema,
            gravados: dados.gravados,
            enviosNaJanela: dados.enviosNaJanela,
            janelaDias: DIAS_JANELA,
        };
        await prisma.appConfig.upsert({
            where: { key: CHAVE_RODADA },
            update: { value },
            create: { key: CHAVE_RODADA, value },
        });
    } catch (e) {
        // A varredura JÁ terminou e os selos já estão gravados — só o carimbo se perdeu.
        console.error('[WhatsappSelo] falha ao anotar a hora da rodada (selos já gravados):', e.message);
    }
};

/** Quando a varredura rodou pela última vez (Date) ou null se nunca rodou. */
const ultimaRodada = async () => {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: CHAVE_RODADA } });
        const v = (cfg && typeof cfg.value === 'object' && cfg.value) || null;
        if (!v?.em) return null;
        const d = new Date(v.em);
        return Number.isNaN(d.getTime()) ? null : d;
    } catch (e) {
        console.error('[WhatsappSelo] falha ao ler a hora da última rodada:', e.message);
        return null;
    }
};

/**
 * Recalcula o selo de todos os clientes ativos.
 * Retorna { avaliados, emUso, comProblema, limpos, gravados, rodadaEm, resumo, ... }.
 */
const recalcular = async () => {
    const desde = new Date(Date.now() - DIAS_JANELA * 24 * 60 * 60 * 1000);

    // Espelho `temNumero` em dia ANTES do selo. Ele é o que torna o filtro de
    // situação do WhatsApp da lista de clientes expressável num `where` do Prisma
    // (a regra `numeroValido` não é). Varre ativos e inativos, escreve só quem
    // mudou, e roda em try/catch próprio: falhar aqui não pode impedir o selo.
    // Require preguiçoso — mesmo motivo do `ultimaRodada` lá em whatsappClienteService.
    let espelhoNumero = null;
    try {
        espelhoNumero = await require('./whatsappClienteService').sincronizarTemNumeroTodos();
    } catch (e) {
        console.error('[WhatsappSelo] falha ao sincronizar temNumero (o selo segue):', e.message);
    }

    const clientes = await prisma.cliente.findMany({
        where: { Ativo: true },
        select: {
            UUID: true,
            Telefone_Celular: true,
            recebeAvisoPedido: true,
            whatsappStatus: { select: { selo: true } },
        },
    });

    const envios = await prisma.botWhatsappEnvio.findMany({
        where: { createdAt: { gte: desde } },
        select: { telefone: true, status: true, codigoErro: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    });

    // chave tolerante → { ok: bool, erroNumero: {codigo, em} | null }
    const porChave = new Map();
    // `envios` é a tabela de TENTATIVAS: PENDENTE (na fila de reenvio) conta como linha
    // igual a ENVIADO. Para leigo, "228 envios" sugere "228 saíram" — e com o bot em modo
    // de emergência (403) ou a Z-API fora, as 228 podem estar TODAS na fila, sem nenhuma
    // ter saído. Contar aqui quantas realmente saíram custa nada (já estamos percorrendo)
    // e deixa o resumo dizer a diferença em vez de o leitor supor.
    let enviosQueSairam = 0;
    for (const e of envios) {
        if (e.status === 'ENVIADO' || e.status === 'DUPLICADO') enviosQueSairam++;
        const k = chaveTelefone(e.telefone);
        if (!k) continue;
        if (!porChave.has(k)) porChave.set(k, { ok: false, erroNumero: null });
        const reg = porChave.get(k);
        if (e.status === 'ENVIADO' || e.status === 'DUPLICADO') {
            reg.ok = true;
        } else if (e.status === 'ERRO' && ehProblemaDoNumero(e.codigoErro)) {
            reg.erroNumero = { codigo: e.codigoErro, em: e.createdAt };
        }
    }

    let emUso = 0, comProblema = 0, limpos = 0, gravados = 0;

    for (const c of clientes) {
        const k = chaveTelefone(c.Telefone_Celular);
        const reg = k ? porChave.get(k) : null;

        let selo = null;
        let motivo = null;
        if (reg?.ok) {
            selo = 'EM_USO';
            motivo = `Mensagem já saiu para esse número nos últimos ${DIAS_JANELA} dias`;
        } else if (reg?.erroNumero && c.recebeAvisoPedido !== false) {
            // Cliente que optou por não receber aviso não gera envio de pedido —
            // não dá para acusar o número dele com base na ausência/erro de envio.
            selo = 'COM_PROBLEMA';
            motivo = `O bot recusou o envio por causa do número (${reg.erroNumero.codigo})`;
        }

        if (selo === 'EM_USO') emUso++;
        else if (selo === 'COM_PROBLEMA') comProblema++;
        else limpos++;

        const seloAtual = c.whatsappStatus?.selo ?? null;
        if (seloAtual === selo) continue;           // nada mudou — não escreve à toa
        if (selo === null && !c.whatsappStatus) continue; // nunca teve registro: não criar linha vazia

        const dados = { selo, seloMotivo: motivo, seloEm: selo ? new Date() : null };
        try {
            await prisma.clienteWhatsappStatus.upsert({
                where: { clienteUuid: c.UUID },
                update: dados,
                create: { clienteUuid: c.UUID, ...dados },
            });
            gravados++;
        } catch (e) {
            console.error(`[WhatsappSelo] falha ao gravar selo de ${c.UUID}:`, e.message);
        }
    }

    // `gravados` conta ESCRITAS (linhas que mudaram), não selos. Numa 2ª rodada — ou
    // depois do job das 04:20 — ele é 0 mesmo com centenas de clientes EM_USO, e quem
    // lê só esse número conclui que a função não funciona. Por isso o retorno traz
    // também o RESULTADO (`emUso`) e o tamanho da base de prova.
    //
    // O `resumo` diz APENAS o que esta função mediu. Ele NÃO pode apontar causa: a
    // varredura sabe que ninguém terminou EM_USO, mas não calcula interseção nenhuma
    // entre a fila e o cadastro. Uma versão anterior concluía "e nenhum deles bate com
    // o celular de um cliente ativo" — palpite vestido de fato: com o bot em modo de
    // emergência (403) ou a Z-API fora, as mensagens ficam PENDENTE, `reg.ok` nunca
    // liga, `emUso` dá 0 — e a frase mandaria o dono mexer no cadastro quando o
    // problema é a fila travada. Quem mede causa é `diagnosticoSelo`
    // (`casamento.chavesDaFilaQueBatemComCliente`); o resumo aponta para lá.
    const resumo = emUso === 0 && comProblema === 0
        ? `Nenhum cliente ativo ficou com selo. Base considerada: ${envios.length} tentativa(s) de envio na janela de ${DIAS_JANELA} dias, das quais ${enviosQueSairam} saíram; ${porChave.size} número(s) distinto(s); ${clientes.length} cliente(s) ativo(s). Para saber o motivo, rode o diagnóstico do selo.`
        : `${emUso} cliente(s) com WhatsApp em uso e ${comProblema} com problema (${gravados} mudaram nesta rodada).`;

    console.log(`[WhatsappSelo] ${clientes.length} clientes · ${envios.length} envios na janela · ${porChave.size} números distintos · em uso ${emUso} · com problema ${comProblema} · ${gravados} mudaram`);

    // Carimbo DEPOIS da varredura e fora de qualquer transação: a rodada aconteceu,
    // mudando alguém ou não, e é isso que a tela precisa mostrar.
    const rodadaEm = new Date();
    await registrarRodada({
        em: rodadaEm, avaliados: clientes.length, emUso, comProblema,
        gravados, enviosNaJanela: envios.length,
    });

    return {
        avaliados: clientes.length,
        emUso, comProblema, limpos, gravados,
        // SÓ ADIÇÃO: o que a sincronização do espelho `temNumero` fez nesta rodada
        // (null = ela falhou; o selo abaixo continua válido). Quem já lia este
        // retorno ignora o campo novo.
        espelhoNumero,
        enviosNaJanela: envios.length,
        enviosQueSairam,
        telefonesDistintosNaFila: porChave.size,
        janelaDias: DIAS_JANELA,
        rodadaEm,
        resumo,
    };
};

/**
 * Diagnóstico: quais `codigoErro` o bot REALMENTE grava, com contagem.
 * Existe porque a lista de códigos "do número" foi escrita sem dado real — é por
 * aqui que ela vai ser ajustada com o que aparece em produção. Somente leitura.
 */
const diagnosticoCodigos = async ({ dias = DIAS_JANELA } = {}) => {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const linhas = await prisma.botWhatsappEnvio.groupBy({
        by: ['codigoErro', 'status'],
        where: { createdAt: { gte: desde } },
        _count: { _all: true },
    });
    const codigos = linhas
        .map(l => ({
            codigoErro: l.codigoErro,
            status: l.status,
            quantidade: l._count._all,
            contaComoProblemaDoNumero: l.status === 'ERRO' && ehProblemaDoNumero(l.codigoErro),
        }))
        .sort((a, b) => b.quantidade - a.quantidade);
    return {
        janelaDias: dias,
        total: codigos.reduce((s, c) => s + c.quantidade, 0),
        codigos,
        listaFixaDoNumero: CODIGOS_DO_NUMERO,
        observacao: 'contaComoProblemaDoNumero=true é o que acende o selo "Com problema". Se a coluna vier toda false com erros reais na lista, a regra precisa dos códigos que aparecem aqui.',
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO DO SELO — somente leitura, para rodar CONTRA PRODUÇÃO
//
// Existe porque o selo saiu "0 atualizados" em produção com 228 envios ENVIADO na
// fila, e nenhuma das hipóteses (casamento de telefone, campo de data, filtro de
// status, recebeAvisoPedido, Ativo) dá para separar de fora: todas falham em
// SILÊNCIO e produzem exatamente o mesmo zero. Esta função responde as cinco de
// uma vez, sem escrever nada e sem expor telefone legível.
//
// Privacidade: telefone nunca sai inteiro. Sai (a) o FORMATO do valor bruto, com
// cada dígito virando '#' (revela '+', espaço, sufixo '@c.us' sem revelar o
// número) e (b) a chave mascarada (DDD + 2 dígitos ... 2 últimos).
// ─────────────────────────────────────────────────────────────────────────────

/** '(47) 99999-8888' → '(##) #####-####'. Mostra o formato, esconde o número. */
const formatoBruto = (raw) => String(raw ?? '').replace(/\d/g, '#');

/** '4799998888' → '4799****88'. Mantém DDD (útil no diagnóstico), esconde o resto. */
const mascararDigitos = (raw) => {
    const s = String(raw ?? '');
    if (!s) return '';
    if (s.length <= 6) return s.slice(0, 1) + '*'.repeat(Math.max(0, s.length - 1));
    return s.slice(0, 4) + '*'.repeat(s.length - 6) + s.slice(-2);
};

const diagnosticoSelo = async ({ dias = DIAS_JANELA, amostra = 10 } = {}) => {
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const nAmostra = Math.min(Math.max(Number(amostra) || 10, 1), 50);

    // ── 1. A fila de envios: quantos, com que status, em que janela ──────────
    const [porStatusTotal, porStatusJanela, porOrigemTipo, extremos, totalEnvios] = await Promise.all([
        prisma.botWhatsappEnvio.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.botWhatsappEnvio.groupBy({ by: ['status'], where: { createdAt: { gte: desde } }, _count: { _all: true } }),
        prisma.botWhatsappEnvio.groupBy({ by: ['origem', 'tipo', 'status'], _count: { _all: true } }),
        prisma.botWhatsappEnvio.aggregate({
            _min: { createdAt: true, enviadoEm: true },
            _max: { createdAt: true, enviadoEm: true },
        }),
        prisma.botWhatsappEnvio.count(),
    ]);
    const mapaStatus = (linhas) => Object.fromEntries(linhas.map(l => [l.status, l._count._all]));

    // Todas as linhas da janela — é exatamente o que `recalcular` lê.
    const envios = await prisma.botWhatsappEnvio.findMany({
        where: { createdAt: { gte: desde } },
        select: { telefone: true, status: true, codigoErro: true, createdAt: true, enviadoEm: true, tipo: true, origem: true },
        orderBy: { createdAt: 'desc' },
    });

    // ── 2. Os clientes, exatamente como `recalcular` os lê ───────────────────
    // `Telefone` entra AQUI SÓ PARA MEDIR, nunca para casar: o selo fala do número
    // que o sistema realmente usa para mandar WhatsApp, que é o Telefone_Celular
    // (webhookService.formatPhone). Casar pelo telefone antigo pintaria de verde um
    // número para o qual nunca saiu mensagem nenhuma. O que interessa medir é o
    // TAMANHO DA BASE DE PROVA: se quase nenhum cliente ativo tem celular, o selo
    // não tem como acender, e a resposta não é mexer na regra — é preencher o campo.
    const clientes = await prisma.cliente.findMany({
        where: { Ativo: true },
        select: {
            UUID: true,
            Telefone_Celular: true,
            Telefone: true,
            recebeAvisoPedido: true,
            whatsappStatus: { select: { selo: true } },
        },
    });
    const [totalClientes, clientesInativos, recusamAviso] = await Promise.all([
        prisma.cliente.count(),
        prisma.cliente.count({ where: { Ativo: false } }),
        prisma.cliente.count({ where: { Ativo: true, recebeAvisoPedido: false } }),
    ]);

    // ── 3. As chaves dos dois lados ──────────────────────────────────────────
    const chavesEnvio = new Map();  // chave → { ok, erroNumero, exemplos }
    let enviosSemChave = 0;
    for (const e of envios) {
        const k = chaveTelefone(e.telefone);
        if (!k) { enviosSemChave++; continue; }
        if (!chavesEnvio.has(k)) chavesEnvio.set(k, { ok: false, erroNumero: null });
        const reg = chavesEnvio.get(k);
        if (e.status === 'ENVIADO' || e.status === 'DUPLICADO') reg.ok = true;
        else if (e.status === 'ERRO' && ehProblemaDoNumero(e.codigoErro)) reg.erroNumero = e.codigoErro;
    }

    const chavesCliente = new Map();       // chave → qtde de clientes ativos com ela
    const chavesSoNoTelefoneAntigo = new Set();
    let clientesSemCelular = 0;
    let semCelularMasComTelefoneAntigo = 0;
    for (const c of clientes) {
        const k = chaveTelefone(c.Telefone_Celular);
        const kAntigo = chaveTelefone(c.Telefone);
        if (!k) {
            clientesSemCelular++;
            if (kAntigo) { semCelularMasComTelefoneAntigo++; chavesSoNoTelefoneAntigo.add(kAntigo); }
            continue;
        }
        chavesCliente.set(k, (chavesCliente.get(k) || 0) + 1);
    }
    for (const k of chavesCliente.keys()) chavesSoNoTelefoneAntigo.delete(k);

    let intersecao = 0;
    const chavesEnvioSemCliente = [];
    for (const k of chavesEnvio.keys()) {
        if (chavesCliente.has(k)) intersecao++;
        else if (chavesEnvioSemCliente.length < nAmostra) chavesEnvioSemCliente.push(k);
    }

    // ── 4. Simulação do recálculo (NÃO grava) ────────────────────────────────
    let emUso = 0, comProblema = 0, limpos = 0, mudariam = 0;
    for (const c of clientes) {
        const k = chaveTelefone(c.Telefone_Celular);
        const reg = k ? chavesEnvio.get(k) : null;
        let selo = null;
        if (reg?.ok) selo = 'EM_USO';
        else if (reg?.erroNumero && c.recebeAvisoPedido !== false) selo = 'COM_PROBLEMA';
        if (selo === 'EM_USO') emUso++; else if (selo === 'COM_PROBLEMA') comProblema++; else limpos++;
        const atual = c.whatsappStatus?.selo ?? null;
        if (atual !== selo && !(selo === null && !c.whatsappStatus)) mudariam++;
    }

    // ── 5. O que já está GRAVADO hoje (separa "não calculou" de "não mostra") ─
    const seloGravado = await prisma.clienteWhatsappStatus.groupBy({ by: ['selo'], _count: { _all: true } });

    return {
        geradoEm: new Date().toISOString(),
        janelaDias: dias,
        janelaDesde: desde.toISOString(),

        envios: {
            totalNaTabela: totalEnvios,
            porStatusTotal: mapaStatus(porStatusTotal),
            porStatusNaJanela: mapaStatus(porStatusJanela),
            createdAtMaisAntigo: extremos._min.createdAt,
            createdAtMaisNovo: extremos._max.createdAt,
            enviadoEmMaisAntigo: extremos._min.enviadoEm,
            enviadoEmMaisNovo: extremos._max.enviadoEm,
            foraDaJanela: totalEnvios - envios.length,
            semChaveCalculavel: enviosSemChave,
            porOrigemTipo: porOrigemTipo
                .map(l => ({ origem: l.origem, tipo: l.tipo, status: l.status, quantidade: l._count._all }))
                .sort((a, b) => b.quantidade - a.quantidade),
            amostra: envios.slice(0, nAmostra).map(e => ({
                telefoneFormato: formatoBruto(e.telefone),
                telefoneDigitos: soDigitos(e.telefone).length,
                chave: mascararDigitos(chaveTelefone(e.telefone)),
                chaveDigitos: chaveTelefone(e.telefone).length,
                status: e.status,
                tipo: e.tipo,
                origem: e.origem,
                createdAt: e.createdAt,
                enviadoEm: e.enviadoEm,
                codigoErro: e.codigoErro,
            })),
        },

        clientes: {
            total: totalClientes,
            ativos: clientes.length,
            inativos: clientesInativos,
            ativosSemCelular: clientesSemCelular,
            // O TETO do selo: nenhum cliente fora deste grupo pode ficar verde, porque
            // o sistema nunca mandou (nem manda) mensagem para ele.
            ativosComCelular: clientes.length - clientesSemCelular,
            // O tamanho do buraco: cliente que TEM telefone, mas no campo antigo
            // (`Telefone`), que o WhatsApp do sistema não usa. É trabalho de cadastro,
            // não defeito do selo — e é o que a tela de Pendências existe para resolver.
            ativosSemCelularMasComTelefoneAntigo: semCelularMasComTelefoneAntigo,
            ativosQueRecusamAviso: recusamAviso,
            amostra: clientes.slice(0, nAmostra).map(c => ({
                telefoneFormato: formatoBruto(c.Telefone_Celular),
                telefoneDigitos: soDigitos(c.Telefone_Celular).length,
                chave: mascararDigitos(chaveTelefone(c.Telefone_Celular)),
                chaveDigitos: chaveTelefone(c.Telefone_Celular).length,
                recebeAvisoPedido: c.recebeAvisoPedido,
                seloGravado: c.whatsappStatus?.selo ?? null,
                temLinhaDeStatus: !!c.whatsappStatus,
            })),
        },

        // O NÚMERO QUE RESPONDE TUDO: quantas chaves da fila existem no cadastro.
        casamento: {
            chavesDistintasNaFila: chavesEnvio.size,
            chavesDistintasDeClientes: chavesCliente.size,
            chavesQueSoExistemNoTelefoneAntigo: chavesSoNoTelefoneAntigo.size,
            chavesDaFilaQueBatemComCliente: intersecao,
            chavesDaFilaSemClienteAmostra: chavesEnvioSemCliente.map(k => ({
                chave: mascararDigitos(k), digitos: k.length,
            })),
        },

        simulacaoRecalculo: { avaliados: clientes.length, emUso, comProblema, limpos, gravariam: mudariam },

        seloJaGravado: Object.fromEntries(
            seloGravado.map(l => [String(l.selo), l._count._all])
        ),

        comoLer: [
            'clientes.ativosComCelular é o TETO do selo — nenhum cliente fora dele pode ficar verde. Se for baixo, o selo não tem base de prova e a resposta é preencher o celular no cadastro, não mexer na regra.',
            'clientes.ativosSemCelularMasComTelefoneAntigo alto → a base tem o número no campo `Telefone`, que o WhatsApp do sistema não usa.',
            'chavesDaFilaQueBatemComCliente = 0 → o casamento de telefone é a causa (ver amostras de formato).',
            'foraDaJanela alto e porStatusNaJanela vazio → a janela de dias / campo de data é a causa.',
            'simulacaoRecalculo.emUso > 0 e gravariam = 0 → o cálculo funciona e os selos JÁ estão gravados: o problema é a tela não mostrar (ver seloJaGravado).',
            'seloJaGravado vazio e emUso > 0 → a gravação está falhando (olhar o log [WhatsappSelo]).',
        ],
    };
};

// Trava simples de concorrência: a varredura roda em série sobre todos os clientes
// ativos. Dois cliques no botão da tela (ou botão + job da madrugada) rodando junto
// só duplicariam escrita no banco compartilhado sem mudar o resultado.
let _rodando = null;
const recalcularComTrava = async () => {
    if (_rodando) return _rodando;
    _rodando = (async () => {
        try { return await recalcular(); }
        finally { _rodando = null; }
    })();
    return _rodando;
};
const estaRodando = () => !!_rodando;

module.exports = {
    recalcular,
    recalcularComTrava,
    estaRodando,
    diagnosticoCodigos,
    diagnosticoSelo,
    ultimaRodada,
    ehProblemaDoNumero,
    chaveTelefone,
    DIAS_JANELA,
    CODIGOS_DO_NUMERO,
};
