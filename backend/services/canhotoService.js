/**
 * CANHOTO DA NOTA FISCAL — o cérebro do módulo.
 *
 * O canhoto assinado é a prova de entrega: sem ele não há protesto nem defesa numa
 * discussão com o cliente. Toda NF-e de venda autorizada nasce aqui esperando o papel
 * voltar; o escritório bipa o código de barras da DANFE e a nota anda:
 *
 *   AGUARDANDO (na rua)  →  RECEBIDO (bipado no caixa)  →  ARQUIVADO (na pasta do mês)
 *   DESCONHECIDO (mutirão: já foi emitida antes de o módulo existir)
 *   SEM_ASSINATURA (o papel voltou em branco — está no arquivo, mas não serve de prova)
 *   SEM_CANHOTO (liberado com motivo fechado + senha — Pedaço 2)
 *
 * REGRAS QUE NÃO PODEM SER QUEBRADAS
 * 1. A identidade é a `chave` de 44 dígitos, `@unique` no banco. O bipe repetido é
 *    idempotente por construção do banco, não por `if` no código.
 * 2. Nada aqui pode derrubar a emissão de NF-e: o gancho em `focusNfeEmissaoService`
 *    é best-effort, fora de qualquer transação, e todo erro é engolido com log.
 * 3. Escopo: pedido `especial`, `bonificacao`, `cancelado`, `statusEnvio: 'EXCLUIDO'`
 *    (ou situação CANCELADO/EXCLUIDO da era Conta Azul) e nota de HOMOLOGAÇÃO
 *    NUNCA geram canhoto.
 * 4. Bipe que não acha nada devolve `{ ok:false, motivo }` — nunca exceção, nunca 500.
 *    O mutirão é feito por gente com um maço de papel na mão; erro vermelho a cada
 *    folha desconhecida faria a equipe desistir.
 */

const prisma = require('../config/database');
const { limpar, dvValido, numeroDaChave, serieDaChave, competenciaDaChave, interpretarBipe } = require('../utils/chaveNfe');
const canhotoConfig = require('../config/canhotoConfig');

// ── Constantes de domínio ────────────────────────────────────────────────────
const STATUS = {
    AGUARDANDO: 'AGUARDANDO',       // ⏳ na rua com o motorista
    DESCONHECIDO: 'DESCONHECIDO',   // ? nota anterior ao módulo (entra pelo mutirão/backfill)
    RECEBIDO: 'RECEBIDO',           // ✓ bipado no escritório
    ARQUIVADO: 'ARQUIVADO',         // 🗄 guardado na pasta do mês (estado final)
    SEM_ASSINATURA: 'SEM_ASSINATURA', // ✎ papel no arquivo, canhoto em branco
    SEM_CANHOTO: 'SEM_CANHOTO',     // ✕ liberado com justificativa + senha (Pedaço 2)
};

/** Estados em que o papel já está no escritório (não pendem mais no caixa). */
const RESOLVIDOS = [STATUS.RECEBIDO, STATUS.ARQUIVADO, STATUS.SEM_ASSINATURA, STATUS.SEM_CANHOTO];

/** Motivos FECHADOS da liberação sem canhoto (espelhados no front — Pedaço 2). */
const MOTIVOS_LIBERACAO = ['CLIENTE_FICOU_COM_VIA', 'SEM_QUEM_ASSINASSE', 'EXTRAVIADO_DANIFICADO', 'VOLTA_AMANHA'];

const ORIGENS_BIPE = ['LEITOR', 'CAMERA', 'NUMERO', 'MUTIRAO'];

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// ── Helpers de data / pasta ──────────────────────────────────────────────────
// A competência (e portanto a pasta física) é sempre calculada no fuso de Brasília:
// nota emitida às 21h de 31/07 não pode cair na pasta de agosto por causa do UTC.
const isoBrasilia = (data) => new Date(data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const competenciaDe = (data) => isoBrasilia(data).slice(0, 7);
const pastaDe = (competencia) => {
    const [ano, mes] = String(competencia).split('-');
    const nome = MESES[Number(mes) - 1];
    return nome ? `Notas Emitidas ${nome} ${ano}` : `Notas Emitidas ${competencia}`;
};
/** '2026-08' → 'agosto/2026' (para caber no meio de uma frase). */
const mesPorExtenso = (competencia) => {
    const [ano, mes] = String(competencia || '').split('-');
    const nome = MESES[Number(mes) - 1];
    return nome ? `${nome.toLowerCase()}/${ano}` : String(competencia || '');
};
const inicioDoDia = (d) => new Date(`${d}T00:00:00-03:00`);
const fimDoDia = (d) => new Date(`${d}T23:59:59.999-03:00`);
const diasDesde = (data) => (data ? Math.floor((Date.now() - new Date(data).getTime()) / 86400000) : null);

/** Pedido que pode ter canhoto? (escopo do módulo — ver regra 3 do cabeçalho) */
function pedidoElegivel(p) {
    if (!p) return false;
    if (p.especial || p.bonificacao || p.cancelado) return false;
    if (p.statusEnvio === 'EXCLUIDO') return false;
    if (p.situacaoCA && ['CANCELADO', 'EXCLUIDO'].includes(p.situacaoCA)) return false;
    return true;
}

/** Total do pedido a partir dos itens (Pedido não guarda valor total). */
function totalDoPedido(pedido) {
    if (!Array.isArray(pedido?.itens)) return null;
    const t = pedido.itens.reduce((s, i) => s + Math.round(Number(i.quantidade) * Number(i.valor) * 100) / 100, 0);
    return Math.round(t * 100) / 100;
}

const INCLUDE_PEDIDO = {
    cliente: { select: { Nome: true } },
    itens: { select: { quantidade: true, valor: true } },
    embarque: { select: { id: true, dataSaida: true, responsavelId: true, responsavel: { select: { nome: true } } } },
};

/**
 * Monta a linha do canhoto a partir do pedido + dados da nota. Não toca no banco.
 *
 * A COMPETÊNCIA (e portanto a PASTA FÍSICA) sai do AAMM da PRÓPRIA CHAVE, não da data
 * que temos em mãos. É de graça (a chave já está aqui) e é a única fonte certa:
 *   - `Pedido.dataVenda` é a data de ENTREGA — nota emitida em 31/07 para entregar
 *     01/08 iria para a pasta de Agosto, mas o papel está na pasta de Julho;
 *   - `NotaFiscalApp.criadoEm` é o da 1ª tentativa — nota rejeitada em 31/07 e
 *     reemitida em 01/08 reaproveita a mesma linha e iria para Julho.
 * `emitidaEm` continua sendo a data usada nos filtros de período; só a pasta muda de fonte.
 */
function montarDados({ chave, numero, serie, origem, tipo, pedido, notaAppId, emitidaEm }) {
    const competencia = competenciaDaChave(chave) || competenciaDe(emitidaEm);
    const ehDevolucao = (tipo || 'VENDA') === 'DEVOLUCAO';
    return {
        chave,
        numero: numero ?? numeroDaChave(chave),
        serie: serie ?? serieDaChave(chave),
        origem,
        tipo: tipo || 'VENDA',
        pedidoId: pedido.id,
        notaAppId: notaAppId || null,
        clienteNome: pedido.cliente?.Nome || null,
        // Devolução: o total do PEDIDO não é o valor da nota de devolução — mostrar
        // aquele número na lista enganaria quem confere. Melhor não mostrar valor.
        valorTotal: ehDevolucao ? null : totalDoPedido(pedido),
        emitidaEm: new Date(emitidaEm),
        competencia,
        pastaFisica: pastaDe(competencia),
        embarqueId: pedido.embarque?.id || null,
        motoristaId: pedido.embarque?.responsavelId || null,
        motoristaNome: pedido.embarque?.responsavel?.nome || null,
        saiuEm: pedido.embarque?.dataSaida || null,
    };
}

/**
 * Grava (ou completa) a linha do canhoto.
 * O `update` NUNCA mexe no `status` — quem manda no status é o bipe/liberação.
 * Ele só preenche o que pode ter chegado depois (número, embarque, vínculo com a nota).
 */
async function gravar(dados, statusInicial) {
    const { chave, ...resto } = dados;
    const update = {
        numero: resto.numero,
        serie: resto.serie,
        // só preenche o vínculo — nunca apaga um já existente
        ...(resto.notaAppId ? { notaAppId: resto.notaAppId } : {}),
        clienteNome: resto.clienteNome,
        valorTotal: resto.valorTotal,
        competencia: resto.competencia,
        pastaFisica: resto.pastaFisica,
        embarqueId: resto.embarqueId,
        motoristaId: resto.motoristaId,
        motoristaNome: resto.motoristaNome,
        saiuEm: resto.saiuEm,
    };
    try {
        return await prisma.canhotoNota.upsert({
            where: { chave },
            create: { chave, ...resto, status: statusInicial },
            update,
        });
    } catch (e) {
        // P2002 = duas pessoas bipando a MESMA chave nova no mesmo instante (mutirão a
        // quatro mãos). O `upsert` do Prisma não é atômico: os dois veem "não existe" e
        // os dois tentam criar. Quem perde a corrida relê e segue — jamais erro vermelho
        // na tela de quem está com o maço de papel na mão.
        if (e?.code === 'P2002') {
            const existente = await prisma.canhotoNota.findUnique({ where: { chave } });
            if (existente) return prisma.canhotoNota.update({ where: { chave }, data: update });
        }
        throw e;
    }
}

// ── Registro ─────────────────────────────────────────────────────────────────

/**
 * "Na rua" (AGUARDANDO) só existe para nota de VENDA.
 *
 * A DANFE da nota de DEVOLUÇÃO é impressa no escritório, no momento em que a devolução
 * é registrada — ela nunca sai com motorista para alguém assinar (é nota de ENTRADA, e
 * o próprio schema diz: "devolução só arquiva, nunca pede assinatura"). Nascendo
 * AGUARDANDO ela entrava na tarja vermelha de "não volta há 3 dias" e no chip vermelho
 * de dias da lista — poluindo justamente o alerta que precisa ser levado a sério.
 *
 * Vira DESCONHECIDO, que é a verdade: ninguém sabe se aquele papel foi para a pasta.
 * Ela continua contando em `devolucaoAReimprimir` (que inclui DESCONHECIDO), continua
 * aparecendo na lista com o botão "Reimprimir DANFE", e some do alerta de "na rua".
 */
const semNaRua = (tipo, status) => (
    tipo === 'DEVOLUCAO' && status === STATUS.AGUARDANDO ? STATUS.DESCONHECIDO : status
);

/**
 * Registra o canhoto de uma NF-e emitida pelo APP (Focus).
 * Chamado pelo gancho best-effort de `focusNfeEmissaoService` e pelo backfill.
 * Devolve `null` (sem lançar) quando a nota está fora do escopo.
 */
async function registrarDeNotaApp(nota, { statusInicial = STATUS.AGUARDANDO } = {}) {
    if (!nota || nota.status !== 'AUTORIZADO') return null;
    if (nota.ambiente !== 'producao') return null; // homologação nunca gera canhoto
    const chave = limpar(nota.chave);
    if (chave.length !== 44) return null;

    const pedido = await prisma.pedido.findUnique({ where: { id: nota.pedidoId }, include: INCLUDE_PEDIDO });
    if (!pedidoElegivel(pedido)) return null;

    const dados = montarDados({
        chave,
        numero: nota.numero ?? undefined,
        serie: nota.serie ?? undefined,
        origem: 'APP',
        tipo: nota.tipo || 'VENDA',
        pedido,
        notaAppId: nota.id,
        emitidaEm: nota.criadoEm || new Date(),
    });
    return gravar(dados, semNaRua(dados.tipo, statusInicial));
}

/**
 * Registra o canhoto de uma nota ANTIGA do Conta Azul (mora em `Pedido.nfeChave`,
 * não existe em `NotaFiscalApp`). Metade do arquivo do mês é desta origem.
 * `emitidaEm` = `pedido.dataVenda` — é a melhor data que temos (o CA não guardou a
 * hora da emissão aqui) e é o que define a pasta física do mês.
 */
async function registrarDeNotaCA(pedido, { statusInicial = STATUS.DESCONHECIDO } = {}) {
    if (!pedidoElegivel(pedido)) return null;
    const chave = limpar(pedido.nfeChave);
    if (chave.length !== 44) return null;

    // Se veio sem os relacionamentos (chamada solta), recarrega com o que a linha precisa.
    const completo = Array.isArray(pedido.itens) && 'cliente' in pedido
        ? pedido
        : await prisma.pedido.findUnique({ where: { id: pedido.id }, include: INCLUDE_PEDIDO });
    if (!pedidoElegivel(completo)) return null;

    const dados = montarDados({
        chave,
        numero: pedido.nfeNumero ?? undefined,
        origem: 'CA',
        tipo: 'VENDA',
        pedido: completo,
        emitidaEm: completo.dataVenda,
    });
    return gravar(dados, statusInicial);
}

// ── Bipe ─────────────────────────────────────────────────────────────────────

/** Auto-cura: a chave existe no sistema mas ainda não virou canhoto? Cria e devolve. */
async function curarPorChave(chave, statusInicial) {
    const nota = await prisma.notaFiscalApp.findFirst({ where: { chave, status: 'AUTORIZADO', ambiente: 'producao' } });
    if (nota) return registrarDeNotaApp(nota, { statusInicial });
    const pedido = await prisma.pedido.findFirst({ where: { nfeChave: chave }, include: INCLUDE_PEDIDO });
    if (pedido) return registrarDeNotaCA(pedido, { statusInicial });
    return null;
}

/** Auto-cura pelo número da nota (código de barras rasgado, digitado na mão). */
async function curarPorNumero(numero, statusInicial) {
    const criados = [];
    const notas = await prisma.notaFiscalApp.findMany({
        where: { numero, status: 'AUTORIZADO', ambiente: 'producao', chave: { not: null } },
        take: 20,
    });
    for (const n of notas) {
        const c = await registrarDeNotaApp(n, { statusInicial });
        if (c) criados.push(c);
    }
    const pedidos = await prisma.pedido.findMany({
        where: { nfeNumero: numero, nfeChave: { not: null } },
        include: INCLUDE_PEDIDO,
        take: 20,
    });
    for (const p of pedidos) {
        const c = await registrarDeNotaCA(p, { statusInicial });
        if (c) criados.push(c);
    }
    return criados;
}

/**
 * O BIPE. Idempotente por construção: repetir a mesma leitura devolve
 * `{ ok:true, jaEstava:true }` — nunca erro, nunca linha duplicada.
 *
 * `contexto`:
 *   'MUTIRAO' — bipando a pasta física do mês → o papel está guardado → ARQUIVADO.
 *   'CAIXA'   — bipando o maço que o motorista trouxe → RECEBIDO (arquiva depois).
 *
 * Nunca lança no caminho normal: devolve `{ ok:false, motivo }`.
 */
async function bipar({ texto, usuario, contexto = 'MUTIRAO', origem, de, ate, caixaDiarioId } = {}) {
    const lido = interpretarBipe(texto);
    if (lido.tipo === 'invalido') {
        return {
            ok: false,
            motivo: lido.motivo === 'DV' ? 'DV_INVALIDO' : 'INVALIDO',
            mensagem: lido.motivo === 'DV'
                ? 'Código inválido (dígito verificador não confere) — passe o leitor de novo.'
                : 'Não reconheci esse código. Bipe o código de barras ou digite o número da nota.',
        };
    }

    // `diasAlerta` da config (não o default do `publico`), senão o campo `atrasado` da
    // resposta do bipe contradiz o da lista quando o dono muda a configuração.
    const { diasAlerta } = await canhotoConfig.get();
    const mutirao = String(contexto).toUpperCase() === 'MUTIRAO';
    const alvo = mutirao ? STATUS.ARQUIVADO : STATUS.RECEBIDO;
    const statusInicial = mutirao ? STATUS.DESCONHECIDO : STATUS.AGUARDANDO;
    let origemBipe = String(origem || '').toUpperCase();
    if (!ORIGENS_BIPE.includes(origemBipe)) origemBipe = mutirao ? 'MUTIRAO' : 'LEITOR';

    // 1) Localizar o canhoto (com auto-cura de nota que existe mas não foi registrada)
    let canhoto = null;
    if (lido.tipo === 'chave') {
        canhoto = await prisma.canhotoNota.findUnique({ where: { chave: lido.chave } });
        if (!canhoto) canhoto = await curarPorChave(lido.chave, statusInicial);
        if (!canhoto) {
            return { ok: false, motivo: 'NAO_ENCONTRADA', chave: lido.chave, numero: lido.numero, mensagem: `Nota ${lido.numero || ''} não encontrada no sistema.`.replace('  ', ' ') };
        }
    } else {
        const janela = de && ate ? { emitidaEm: { gte: inicioDoDia(de), lte: fimDoDia(ate) } } : {};
        let achados = await prisma.canhotoNota.findMany({ where: { numero: lido.numero, ...janela }, take: 20 });
        if (!achados.length) {
            await curarPorNumero(lido.numero, statusInicial);
            achados = await prisma.canhotoNota.findMany({ where: { numero: lido.numero, ...janela }, take: 20 });
        }
        if (!achados.length) {
            // A nota pode existir, só que em OUTRO mês. Dizer "não encontrada no
            // sistema" ali seria mentira: quem está com a folha na mão concluiria que o
            // sistema perdeu a nota. Pior ainda porque a MESMA folha bipada pela chave
            // funciona (a chave ignora a janela) — o mesmo papel se comportaria de dois
            // jeitos. Então: se a busca com janela falhou, reconsulta SEM janela.
            //
            // Custo: só roda quando a primeira falhou (caso raro) e é lookup pelo índice
            // `canhotos_nota(numero)` — nunca varredura.
            const foraDaJanela = Object.keys(janela).length
                ? await prisma.canhotoNota.findMany({
                    where: { numero: lido.numero },
                    select: { chave: true, numero: true, serie: true, clienteNome: true, emitidaEm: true, status: true, competencia: true, pastaFisica: true },
                    orderBy: { emitidaEm: 'desc' },
                    take: 20,
                })
                : [];
            if (foraDaJanela.length) {
                const meses = [...new Set(foraDaJanela.map(c => c.competencia).filter(Boolean))];
                const onde = meses.length === 1
                    ? `é de ${mesPorExtenso(meses[0])}`
                    : `é de outro período (${meses.map(mesPorExtenso).join(', ')})`;
                return {
                    ok: false,
                    motivo: 'FORA_DO_PERIODO',
                    numero: lido.numero,
                    competencias: meses,
                    mensagem: `A nota ${lido.numero} ${onde}. Troque o período para bipá-la.`,
                    opcoes: foraDaJanela.map(c => ({
                        chave: c.chave, numero: c.numero, serie: c.serie, clienteNome: c.clienteNome,
                        emitidaEm: c.emitidaEm, status: c.status, competencia: c.competencia, pastaFisica: c.pastaFisica,
                    })),
                };
            }
            // Aqui a mensagem é verdadeira: a nota não existe mesmo.
            return { ok: false, motivo: 'NAO_ENCONTRADA', numero: lido.numero, mensagem: `Nota ${lido.numero} não encontrada no sistema.` };
        }
        if (achados.length > 1) {
            // Desempate: quem ainda está pendente é o que a pessoa tem na mão.
            const pendentes = achados.filter(c => !RESOLVIDOS.includes(c.status));
            if (pendentes.length === 1) achados = pendentes;
        }
        if (achados.length > 1) {
            return {
                ok: false,
                motivo: 'AMBIGUO',
                numero: lido.numero,
                mensagem: `Há ${achados.length} notas com o número ${lido.numero}. Bipe o código de barras para não errar.`,
                opcoes: achados.map(c => ({ chave: c.chave, numero: c.numero, serie: c.serie, clienteNome: c.clienteNome, emitidaEm: c.emitidaEm, status: c.status })),
            };
        }
        canhoto = achados[0];
    }

    // 2) Já resolvido? Devolve sucesso "já estava" — comportamento NORMAL do mutirão.
    const jaNoAlvo = canhoto.status === alvo
        || (mutirao && [STATUS.ARQUIVADO, STATUS.SEM_ASSINATURA].includes(canhoto.status))
        || (!mutirao && RESOLVIDOS.includes(canhoto.status) && canhoto.status !== STATUS.SEM_CANHOTO);
    if (jaNoAlvo) {
        return { ok: true, jaEstava: true, statusAnterior: canhoto.status, canhoto: publico(canhoto, diasAlerta) };
    }

    // 3) Aplicar. Uma nota liberada "sem canhoto" cujo papel apareceu volta para a fila do bem.
    const reapareceu = canhoto.status === STATUS.SEM_CANHOTO;
    const agora = new Date();
    const data = { status: alvo };
    if (!canhoto.recebidoEm) {
        data.recebidoEm = agora;
        data.recebidoPorId = usuario?.id || null;
        data.recebidoPorNome = usuario?.nome || null;
        data.recebidoOrigem = origemBipe;
        if (caixaDiarioId) data.caixaDiarioId = caixaDiarioId;
    }
    if (alvo === STATUS.ARQUIVADO && !canhoto.arquivadoEm) {
        data.arquivadoEm = agora;
        data.arquivadoPorId = usuario?.id || null;
        data.arquivadoPorNome = usuario?.nome || null;
    }

    const atualizado = await prisma.canhotoNota.update({ where: { id: canhoto.id }, data });
    return {
        ok: true,
        jaEstava: false,
        statusAnterior: canhoto.status,
        canhoto: publico(atualizado, diasAlerta),
        ...(reapareceu ? { aviso: 'Esta nota estava liberada SEM canhoto — o papel apareceu e ela voltou a contar como recebida.' } : {}),
    };
}

// ── Arquivar / sem assinatura ────────────────────────────────────────────────

/**
 * Passa para ARQUIVADO tudo que já foi RECEBIDO (o maço foi para a pasta do mês).
 * Só arquiva o que está RECEBIDO — nunca inventa canhoto que não voltou.
 */
async function arquivar({ chaves, usuario } = {}) {
    const lista = (Array.isArray(chaves) ? chaves : [chaves]).map(limpar).filter(c => c.length === 44);
    if (!lista.length) return { arquivadas: 0, ignoradas: 0, naoEncontradas: 0 };

    const achados = await prisma.canhotoNota.findMany({ where: { chave: { in: lista } }, select: { id: true, chave: true, status: true } });
    const alvos = achados.filter(c => c.status === STATUS.RECEBIDO).map(c => c.id);
    let arquivadas = 0;
    if (alvos.length) {
        const r = await prisma.canhotoNota.updateMany({
            where: { id: { in: alvos } },
            data: {
                status: STATUS.ARQUIVADO,
                arquivadoEm: new Date(),
                arquivadoPorId: usuario?.id || null,
                arquivadoPorNome: usuario?.nome || null,
            },
        });
        arquivadas = r.count;
    }
    return {
        arquivadas,
        ignoradas: achados.length - alvos.length,
        naoEncontradas: lista.length - achados.length,
    };
}

/**
 * "Veio sem assinatura": o papel está no arquivo, mas o canhoto está em branco.
 * Conta como arquivada (o documento está aqui) e NÃO serve de prova de entrega.
 *
 * ⚠️ O QUE ISSO FAZ, EXATAMENTE: grava o status `SEM_ASSINATURA`. Só isso.
 * A nota passa a mostrar o selo "Sem assinatura" e entra no contador/chip de mesmo
 * nome, que filtra a lista da aba. **Não existe** relatório, fila ou "lista de recolher
 * assinatura na próxima visita" — a redação antiga deste comentário prometia isso e a
 * promessa vazou para o aviso da tela, mandando a equipe procurar algo inexistente.
 * Se um dia essa lista for criada, ela é trabalho novo; até lá, não prometa aqui.
 */
async function marcarSemAssinatura({ chave, usuario, observacao } = {}) {
    const c = limpar(chave);
    if (c.length !== 44) return { ok: false, motivo: 'INVALIDO', mensagem: 'Chave inválida.' };
    const atual = await prisma.canhotoNota.findUnique({ where: { chave: c } });
    if (!atual) return { ok: false, motivo: 'NAO_ENCONTRADA', mensagem: 'Nota não encontrada no controle de canhotos.' };
    if (atual.status === STATUS.SEM_ASSINATURA) return { ok: true, jaEstava: true, canhoto: publico(atual) };

    const agora = new Date();
    const data = { status: STATUS.SEM_ASSINATURA, observacao: observacao || atual.observacao || null };
    if (!atual.recebidoEm) {
        data.recebidoEm = agora;
        data.recebidoPorId = usuario?.id || null;
        data.recebidoPorNome = usuario?.nome || null;
        data.recebidoOrigem = 'LEITOR';
    }
    if (!atual.arquivadoEm) {
        data.arquivadoEm = agora;
        data.arquivadoPorId = usuario?.id || null;
        data.arquivadoPorNome = usuario?.nome || null;
    }
    const atualizado = await prisma.canhotoNota.update({ where: { id: atual.id }, data });
    return { ok: true, jaEstava: false, statusAnterior: atual.status, canhoto: publico(atualizado) };
}

// ── Backfill / auto-cura ─────────────────────────────────────────────────────

/**
 * Traz para o controle todas as NF-e do período que ainda não têm canhoto.
 *
 * É o "Colocar o mês em dia" da aba Canhotos (e a auto-cura silenciosa quando a
 * aba carrega um período curto). IDEMPOTENTE: rodar de novo devolve `criados: 0`.
 *
 * Barato de propósito: duas consultas leves para levantar as chaves candidatas,
 * uma consulta para saber quais já existem, e só então busca os pedidos das que
 * faltam. Com o mês já em dia, nenhum pedido é carregado.
 *
 * ⚠️ Mesmo com `pedidos.data_venda` e `pedidos.nfe_chave` indexados (declarados no
 * `schema.prisma` — sem isso o `db push` do deploy derruba o índice e volta o seq scan),
 * isto NÃO é de graça: são consultas de faixa sobre a maior tabela do sistema, num banco
 * compartilhado. Por isso a auto-cura da aba é memoizada (ver `autocuraRecente`): não
 * pelo custo de UMA passada, e sim para não repetir a mesma varredura a cada filtro,
 * cada tecla da busca e cada volta à tela.
 *
 * `inferirNaRua`: quando a nota é do mês corrente e o pedido tem embarque com data de
 * saída, ela nasce AGUARDANDO ("na rua") em vez de DESCONHECIDO — senão uma nota cujo
 * gancho falhou no meio de um deploy ficaria invisível para o alerta de 3 dias,
 * justamente a nota que mais precisa ser cobrada.
 */
async function backfill({ de, ate, statusInicial = STATUS.DESCONHECIDO, inferirNaRua = false, limite = 5000 } = {}) {
    if (!de || !ate) throw new Error('Informe o período (de/ate).');
    const ini = inicioDoDia(de);
    const fim = fimDoDia(ate);

    // 1) Candidatas — notas do app (Focus) e notas antigas do Conta Azul
    const notasApp = await prisma.notaFiscalApp.findMany({
        where: { status: 'AUTORIZADO', ambiente: 'producao', chave: { not: null }, criadoEm: { gte: ini, lte: fim } },
        select: { id: true, chave: true, numero: true, serie: true, tipo: true, pedidoId: true, criadoEm: true },
        take: limite,
    });
    const pedidosCA = await prisma.pedido.findMany({
        where: {
            nfeChave: { not: null },
            dataVenda: { gte: ini, lte: fim },
            especial: false,
            bonificacao: false,
            cancelado: false,
            statusEnvio: { not: 'EXCLUIDO' },
            // situacaoCA é nullable e `notIn` do Prisma EXCLUI linhas null — OR explícito.
            OR: [{ situacaoCA: null }, { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }],
        },
        select: { id: true, nfeChave: true, nfeNumero: true, dataVenda: true },
        take: limite,
    });

    // Bateu no teto? O período tem mais notas do que cabe numa passada — quem chamou
    // PRECISA saber, senão o mês fica pela metade em silêncio (e "criados: 0" na 2ª
    // rodada pareceria "está tudo em dia").
    const truncado = notasApp.length === limite || pedidosCA.length === limite;

    const candidatos = [];
    for (const n of notasApp) {
        const chave = limpar(n.chave);
        if (chave.length === 44) candidatos.push({ chave, origem: 'APP', nota: n, pedidoId: n.pedidoId });
    }
    for (const p of pedidosCA) {
        const chave = limpar(p.nfeChave);
        if (chave.length === 44) candidatos.push({ chave, origem: 'CA', pedido: p, pedidoId: p.id });
    }
    if (!candidatos.length) return { criados: 0, jaExistiam: 0, ignorados: 0, candidatos: 0, truncado };

    // 2) Quais chaves já estão controladas (consulta por chave — sem depender de data)
    const jaTem = new Set();
    const chaves = [...new Set(candidatos.map(c => c.chave))];
    for (let i = 0; i < chaves.length; i += 500) {
        const bloco = await prisma.canhotoNota.findMany({
            where: { chave: { in: chaves.slice(i, i + 500) } },
            select: { chave: true },
        });
        bloco.forEach(c => jaTem.add(c.chave));
    }
    const faltando = candidatos.filter(c => !jaTem.has(c.chave));
    const jaExistiam = candidatos.length - faltando.length;
    if (!faltando.length) return { criados: 0, jaExistiam, ignorados: 0, candidatos: candidatos.length, truncado };

    // 3) Só agora os pedidos das que faltam (com o mês em dia, isto nem roda)
    const pedidos = new Map();
    const ids = [...new Set(faltando.map(c => c.pedidoId))];
    for (let i = 0; i < ids.length; i += 200) {
        const bloco = await prisma.pedido.findMany({ where: { id: { in: ids.slice(i, i + 200) } }, include: INCLUDE_PEDIDO });
        bloco.forEach(p => pedidos.set(p.id, p));
    }

    const linhas = [];
    let ignorados = 0;
    const vistos = new Set();
    for (const c of faltando) {
        const pedido = pedidos.get(c.pedidoId);
        if (!pedidoElegivel(pedido) || vistos.has(c.chave)) { ignorados++; continue; }
        vistos.add(c.chave);
        if (c.origem === 'APP') {
            linhas.push(montarDados({
                chave: c.chave,
                numero: c.nota.numero ?? undefined,
                serie: c.nota.serie ?? undefined,
                origem: 'APP',
                tipo: c.nota.tipo || 'VENDA',
                pedido,
                notaAppId: c.nota.id,
                emitidaEm: c.nota.criadoEm,
            }));
        } else {
            linhas.push(montarDados({
                chave: c.chave,
                numero: c.pedido.nfeNumero ?? undefined,
                origem: 'CA',
                tipo: 'VENDA',
                pedido,
                emitidaEm: c.pedido.dataVenda,
            }));
        }
    }
    if (!linhas.length) return { criados: 0, jaExistiam, ignorados, candidatos: candidatos.length, truncado };

    // Nota do MÊS CORRENTE que já saiu num embarque está de verdade na rua: nasce
    // AGUARDANDO para entrar no alerta de 3 dias. DESCONHECIDO é só para o passado,
    // onde ninguém sabe onde o papel está.
    //
    // O `semNaRua` no fim NÃO é redundante: a linha da nota de DEVOLUÇÃO herda o
    // `saiuEm` do embarque do pedido ORIGINAL (a entrega da venda, não da devolução),
    // então sem ele toda devolução do mês corrente cairia em AGUARDANDO por aqui.
    const mesCorrente = competenciaDe(new Date());
    const statusDaLinha = (l) => semNaRua(
        l.tipo,
        inferirNaRua && l.competencia === mesCorrente && l.saiuEm ? STATUS.AGUARDANDO : statusInicial,
    );

    // `skipDuplicates` fecha a corrida com o gancho da emissão: se a nota virou canhoto
    // entre a consulta e a gravação, a linha é simplesmente pulada (sem erro).
    const r = await prisma.canhotoNota.createMany({
        data: linhas.map(l => ({ ...l, status: statusDaLinha(l) })),
        skipDuplicates: true,
    });
    return { criados: r.count, jaExistiam: jaExistiam + (linhas.length - r.count), ignorados, candidatos: candidatos.length, truncado };
}

// ── Listagem do período (a aba Canhotos) ─────────────────────────────────────

/** Linha enxuta devolvida à tela (snapshots — zero join no caminho quente). */
function publico(c, diasAlerta = 3) {
    const base = c.saiuEm || c.emitidaEm;
    const dias = [STATUS.AGUARDANDO, STATUS.DESCONHECIDO].includes(c.status) ? diasDesde(base) : null;
    return {
        id: c.id,
        chave: c.chave,
        numero: c.numero,
        serie: c.serie,
        origem: c.origem,
        tipo: c.tipo,
        status: c.status,
        pedidoId: c.pedidoId,
        // id da NotaFiscalApp — é o que `GET /api/notas-fiscais/:id/danfe` espera (a rota
        // não aceita pedidoId). É por ele que a aba reimprime a DANFE da nota de devolução
        // cujo papel não está no arquivo. Vem `null` nas notas antigas do Conta Azul
        // (origem 'CA'), que não têm linha em NotaFiscalApp — ali o botão não se aplica.
        notaAppId: c.notaAppId,
        clienteNome: c.clienteNome,
        valorTotal: c.valorTotal == null ? null : Number(c.valorTotal),
        emitidaEm: c.emitidaEm,
        competencia: c.competencia,
        pastaFisica: c.pastaFisica,
        motoristaNome: c.motoristaNome,
        saiuEm: c.saiuEm,
        diasNaRua: dias,
        atrasado: dias != null && dias >= diasAlerta,
        recebidoPorNome: c.recebidoPorNome,
        recebidoEm: c.recebidoEm,
        recebidoOrigem: c.recebidoOrigem,
        arquivadoEm: c.arquivadoEm,
        motivoLiberacao: c.motivoLiberacao,
        liberadoPorNome: c.liberadoPorNome,
        voltaAmanha: c.voltaAmanha,
        observacao: c.observacao,
    };
}

const LIMITE_LISTA = 2000; // um mês real tem ~600 notas — o backstop existe só para não estourar memória
const DIAS_AUTOCURA = 62;  // auto-cura silenciosa só em período curto (2 meses)

/**
 * Memória de curto prazo da auto-cura, por período.
 *
 * ⚠️ POR QUE ISSO EXISTE: a auto-cura chama `backfill`, que consulta `pedidos` — a maior
 * tabela do sistema, num banco compartilhado. Sem esta trava ela rodava a CADA carga da
 * aba: trocar de filtro, digitar na busca, voltar para a tela... cada um desses repetia
 * a mesma varredura, para achar exatamente o mesmo nada.
 *
 * O índice em `pedidos.data_venda` (declarado no `schema.prisma`) tornou cada passada
 * muito mais barata, mas NÃO tornou esta memória dispensável: o que ela evita é o
 * trabalho REPETIDO — e é ele que aparece no horário de pico, quando a mesma pessoa fica
 * filtrando a tela durante o mutirão. Um período é varrido uma vez a cada TTL_AUTOCURA,
 * não importa quantas vezes a tela recarregar. Mesmo padrão de cache do `canhotoConfig.js`.
 */
const TTL_AUTOCURA = 5 * 60 * 1000; // 5 min
const _autocuraEm = new Map(); // 'de..ate' → timestamp da última varredura

function autocuraRecente(chaveJanela) {
    const ultimo = _autocuraEm.get(chaveJanela);
    return !!ultimo && Date.now() - ultimo < TTL_AUTOCURA;
}

function marcarAutocura(chaveJanela) {
    // Poda simples: a tabela nunca passa de algumas dezenas de janelas por processo.
    if (_autocuraEm.size > 200) _autocuraEm.clear();
    _autocuraEm.set(chaveJanela, Date.now());
}

/** Esquece a memória (usado depois do backfill manual e nos testes). */
function limparMemoriaAutocura() { _autocuraEm.clear(); }

/**
 * Lista o período com contadores, alerta de notas na rua há muitos dias e a pasta
 * física do mês. Não usa a fila de NF-e (que sincroniza eventos e traz 2000 pedidos):
 * lê só `canhotos_nota`, que já carrega cliente/valor/número em snapshot.
 */
async function listarPeriodo({ de, ate, status, busca, autocura = true } = {}) {
    if (!de || !ate) throw new Error('Informe o período (de/ate).');
    const cfg = await canhotoConfig.get();
    const ini = inicioDoDia(de);
    const fim = fimDoDia(ate);

    // Auto-cura: nota emitida com o gancho falhando (deploy, banco lento) entra aqui.
    // Só em período curto, no máximo 1x por TTL, e sempre best-effort — a tela nunca
    // quebra nem fica lenta por causa disso.
    let curados = 0;
    const janela = `${de}..${ate}`;
    const curou = autocura && (fim - ini) / 86400000 <= DIAS_AUTOCURA && !autocuraRecente(janela);
    if (curou) {
        marcarAutocura(janela); // marca ANTES: falhou, não insiste a cada tecla da busca
        try {
            const r = await backfill({ de, ate, statusInicial: STATUS.DESCONHECIDO, inferirNaRua: true });
            curados = r.criados;
        } catch (e) {
            console.error('[Canhoto] auto-cura do período falhou (seguindo sem ela):', e.message);
        }
    }

    const whereBase = { emitidaEm: { gte: ini, lte: fim } };

    const grupos = await prisma.canhotoNota.groupBy({ by: ['status'], where: whereBase, _count: { _all: true } });
    const conta = (s) => grupos.find(g => g.status === s)?._count?._all || 0;
    const contadores = {
        total: grupos.reduce((s, g) => s + g._count._all, 0),
        aguardando: conta(STATUS.AGUARDANDO),
        desconhecido: conta(STATUS.DESCONHECIDO),
        recebido: conta(STATUS.RECEBIDO),
        arquivado: conta(STATUS.ARQUIVADO),
        semAssinatura: conta(STATUS.SEM_ASSINATURA),
        semCanhoto: conta(STATUS.SEM_CANHOTO),
    };
    contadores.pendentes = contadores.aguardando + contadores.desconhecido;
    contadores.noArquivo = contadores.arquivado + contadores.semAssinatura;

    // Devolução cujo papel ainda não está no arquivo → "reimprimir a DANFE e guardar junto"
    contadores.devolucaoAReimprimir = await prisma.canhotoNota.count({
        where: { ...whereBase, tipo: 'DEVOLUCAO', status: { in: [STATUS.AGUARDANDO, STATUS.DESCONHECIDO, STATUS.RECEBIDO] } },
    });

    // Alerta: na rua há >= diasAlerta dias. Só AGUARDANDO — DESCONHECIDO é o passado
    // do mutirão e inundaria a lista no primeiro dia.
    //
    // `tipo: 'VENDA'` é cinto e suspensório: o `semNaRua` já impede que devolução nasça
    // AGUARDANDO, mas linha antiga gravada antes desta correção (ou vinda de um caminho
    // futuro) não pode voltar a poluir a tarja vermelha. O alerta é sobre canhoto
    // ASSINADO que não voltou — devolução não pede assinatura de ninguém.
    const corte = new Date(Date.now() - cfg.diasAlerta * 86400000);
    const atrasadas = await prisma.canhotoNota.findMany({
        where: {
            ...whereBase,
            tipo: 'VENDA',
            status: STATUS.AGUARDANDO,
            OR: [{ saiuEm: { lte: corte } }, { saiuEm: null, emitidaEm: { lte: corte } }],
        },
        orderBy: { emitidaEm: 'asc' },
        take: 100,
    });

    const filtros = { ...whereBase };
    if (status && status !== 'todos') {
        if (status === 'pendentes') filtros.status = { in: [STATUS.AGUARDANDO, STATUS.DESCONHECIDO] };
        else if (status === 'arquivo') filtros.status = { in: [STATUS.ARQUIVADO, STATUS.SEM_ASSINATURA] };
        else filtros.status = String(status).toUpperCase();
    }
    const termo = String(busca || '').trim();
    if (termo) {
        const soDigitos = termo.replace(/\D/g, '');
        filtros.AND = [{
            OR: [
                { clienteNome: { contains: termo, mode: 'insensitive' } },
                ...(soDigitos && soDigitos.length <= 9 ? [{ numero: Number(soDigitos) }] : []),
                ...(soDigitos.length === 44 ? [{ chave: soDigitos }] : []),
            ],
        }];
    }

    const itens = await prisma.canhotoNota.findMany({ where: filtros, orderBy: [{ emitidaEm: 'desc' }, { numero: 'desc' }], take: LIMITE_LISTA });

    // A pasta física do CABEÇALHO só existe quando o período inteiro cai num mês só.
    // "Últimos 30 dias" em 14/08 começa em 15/07: anunciar "Notas Emitidas Julho 2026"
    // mandaria guardar nota de agosto na pasta errada. Cruzou mês → `null`, e o front
    // some com o rótulo (cada linha continua trazendo a SUA pasta, sempre correta).
    const competenciaIni = competenciaDe(ini);
    const competenciaFim = competenciaDe(fim);
    const mesUnico = competenciaIni === competenciaFim;
    return {
        de,
        ate,
        modo: cfg.modo,
        diasAlerta: cfg.diasAlerta,
        competencia: mesUnico ? competenciaIni : null,
        pastaFisica: mesUnico ? pastaDe(competenciaIni) : null,
        periodoCruzaMeses: !mesUnico,
        curados,
        contadores,
        alerta: atrasadas.map(c => publico(c, cfg.diasAlerta)),
        itens: itens.map(c => publico(c, cfg.diasAlerta)),
        truncado: itens.length === LIMITE_LISTA,
    };
}

// ── Pedaço 2 (esqueleto — ainda NÃO implementado de propósito) ───────────────
// `resumoDoCaixa(vendedorId, data)` e `liberarSemCanhoto({...})` entram junto com
// o card do Caixa, a permissão `Pode_Liberar_Nota_Sem_Canhoto` e a trava do
// fechamento. Ver `docs/plano-canhoto-nf.md`, Pedaço 2.

/** Quem pode liberar uma nota sem canhoto (espelhado no front — Pedaço 2). */
function podeLiberarSemCanhoto(perms = {}) {
    return !!(perms.admin
        || perms.Pode_Liberar_Nota_Sem_Canhoto
        || perms.Pode_Conferir_Dinheiro_Caixa
        || perms.Pode_Conferir_Devolucao_Caixa);
}

module.exports = {
    STATUS,
    RESOLVIDOS,
    MOTIVOS_LIBERACAO,
    ORIGENS_BIPE,
    competenciaDe,
    pastaDe,
    pedidoElegivel,
    registrarDeNotaApp,
    registrarDeNotaCA,
    bipar,
    arquivar,
    marcarSemAssinatura,
    listarPeriodo,
    backfill,
    limparMemoriaAutocura,
    podeLiberarSemCanhoto,
    publico,
};
