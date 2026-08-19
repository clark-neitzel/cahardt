const express = require('express');
const router = express.Router();
const prisma = require('../config/database'); // singleton compartilhado (pool único)
const verificarAuth = require('../middlewares/authMiddleware');
const contasReceberSyncService = require('../services/contasReceberSyncService');

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
    if (!perms.admin && !perms.Pode_Acessar_Contas_Receber) {
        return res.status(403).json({ error: 'Sem permissão para acessar contas a receber.' });
    }
    next();
};

const checkBaixa = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Baixar_Contas_Receber) {
        return res.status(403).json({ error: 'Sem permissão para dar baixa em parcelas.' });
    }
    next();
};

// ── Baixa MANUAL (digitada aqui na tela) — permissão própria ──
// Regra do dono (08/2026): título vira PAGO por um destes caminhos, nesta ordem de
// preferência: (1) conciliação bancária — o dinheiro apareceu no extrato/Asaas;
// (2) caixa — quem recebeu põe no caixa dela e presta contas; (3) esta tela, que é a
// exceção. Por isso ela exige permissão separada, só aceita espécie e joga o valor no
// caixa do dia de quem baixou. Antes disso, bastava marcar "recebi" e a conta quitava
// sem ninguém ficar responsável pelo dinheiro.
const checkBaixaManual = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Baixar_Contas_Receber_Manual) {
        return res.status(403).json({
            error: 'Baixa manual não liberada para você. Recebimento em boleto/Pix entra pela Conciliação Bancária; dinheiro recebido na rua entra pelo Caixa.'
        });
    }
    next();
};

// Formas aceitas na baixa manual: só o que fica FISICAMENTE com alguém (e por isso pode
// ser cobrado no caixa). Boleto/Pix/cartão/transferência caem no extrato — têm que entrar
// pela conciliação, senão o dinheiro nunca é confrontado com o banco.
const FORMAS_ESPECIE = ['Dinheiro', 'Cheque'];
const ehEspecie = (f) => FORMAS_ESPECIE.some(x => x.toLowerCase() === String(f || '').trim().toLowerCase());

// "Escritório responsável" / "Vendedor responsável" NÃO são recebimento: são o registro
// de quem ficou encarregado de cobrar. Não têm banco — e SEM BANCO NÃO HÁ QUITAÇÃO
// (regra do dono, 08/2026). O título continua em aberto até o dinheiro entrar de verdade.
const ehResponsavel = (f) => /respons[áa]vel/i.test(String(f || ''));

const validarFormaManual = (formaPagamento) => {
    const f = String(formaPagamento || '').trim();
    if (!f) return 'Escolha a forma de pagamento.';
    if (ehResponsavel(f)) {
        return `"${f}" não quita título: não é recebimento, é o registro de quem ficou responsável pela cobrança (por isso não tem banco). O valor continua em aberto e a cobrança é do responsável.`;
    }
    if (ehEspecie(f)) return null;
    return `Baixa manual aceita apenas ${FORMAS_ESPECIE.join(' ou ')}. Recebimento em ${f} entra pela Conciliação Bancária (quando cair no extrato) ou pelo Caixa.`;
};

// ─────────────────────────────────────────────────────────────────────────────
// RESPONSÁVEL PELA COBRANÇA (quem ficou de cobrar o título)
// ─────────────────────────────────────────────────────────────────────────────
// A marcação mora na LINHA DE PAGAMENTO da entrega (`pedido_pagamentos_reais`):
//   • `vendedorResponsavelId` → um vendedor ficou responsável por aquele valor;
//   • `escritorioResponsavel` → o escritório assumiu a cobrança.
// Até 08/2026 o dado era gravado e nunca lido: o nome nunca era resolvido, não dava para
// filtrar por pessoa nem fechar por responsável — o dono fazia o fechamento do dia 01 na mão.
//
// ⚠️ A marcação é o ÚNICO critério válido. NÃO usar o nome da forma de pagamento
// ("Vendedor Responsável", "Escritório Responsável"): quem registrar como "Dinheiro" com a
// caixinha marcada escapa de qualquer busca feita pelo nome — foi exatamente o defeito.
const TIPOS_RESPONSAVEL = ['VENDEDOR', 'ESCRITORIO'];

// `select` mínimo para montar os responsáveis sem N+1: o nome do vendedor vem por join na
// relação `PagamentosFiados` (que existia no schema e nunca era usada em nenhum include).
const SELECT_PAGAMENTOS_RESPONSAVEL = {
    where: { valor: { gt: 0 } },
    select: {
        formaPagamentoNome: true,
        valor: true,
        escritorioResponsavel: true,
        vendedorResponsavelId: true,
        vendedorResponsavel: { select: { id: true, nome: true } }
    }
};

// Rótulo do escritório: o escritório não é uma pessoa, então mostramos QUEM LANÇOU o pedido
// como pista de a quem perguntar. NÃO é afirmação de que essa pessoa é a responsável.
const rotuloEscritorio = (pedido) => {
    const quem = pedido?.usuarioLancamento?.nome || pedido?.vendedor?.nome || null;
    return quem ? `Escritório — lançado por ${quem}` : 'Escritório';
};

// Monta o array `responsaveis` de um pedido, agrupando por (tipo, pessoa) e somando o valor.
// Sem marcação → array VAZIO (nunca null). Linha com vendedor marcado vence o escritório.
const montarResponsaveis = (pedido) => {
    const mapa = new Map();
    for (const p of (pedido?.pagamentosReais || [])) {
        const valor = Number(p.valor || 0);
        if (valor <= 0) continue;
        let chave, item;
        if (p.vendedorResponsavelId) {
            chave = `VENDEDOR:${p.vendedorResponsavelId}`;
            item = {
                tipo: 'VENDEDOR',
                pessoaId: p.vendedorResponsavelId,
                pessoaNome: p.vendedorResponsavel?.nome || 'Vendedor não identificado',
                valor: 0
            };
        } else if (p.escritorioResponsavel) {
            chave = 'ESCRITORIO';
            item = { tipo: 'ESCRITORIO', pessoaId: null, pessoaNome: rotuloEscritorio(pedido), valor: 0 };
        } else {
            continue;
        }
        if (!mapa.has(chave)) mapa.set(chave, item);
        mapa.get(chave).valor += valor;
    }
    return [...mapa.values()].map(r => ({ ...r, valor: Math.round(r.valor * 100) / 100 }));
};

// Cláusula `some` sobre as linhas de pagamento para filtrar por responsável.
// Devolve null quando não há filtro pedido.
const someResponsavel = (responsavelTipo, responsavelId) => {
    const tipo = String(responsavelTipo || '').trim().toUpperCase();
    if (tipo && !TIPOS_RESPONSAVEL.includes(tipo)) return null;
    const id = String(responsavelId || '').trim();
    if (!tipo && !id) return null;

    if (tipo === 'ESCRITORIO') {
        // Escritório não tem pessoaId — um responsavelId junto é ignorado de propósito.
        // ⚠️ `vendedorResponsavelId: null` é OBRIGATÓRIO aqui: `montarResponsaveis` classifica
        // linha com os DOIS marcados como VENDEDOR. Sem isso o servidor devolvia a conta no
        // filtro "Escritório" e a tela a escondia (lista com buraco). Uma regra só.
        return { valor: { gt: 0 }, escritorioResponsavel: true, vendedorResponsavelId: null };
    }
    if (id) return { valor: { gt: 0 }, vendedorResponsavelId: id };
    // tipo VENDEDOR sem pessoa: qualquer vendedor marcado.
    // `not: null` aqui é o que queremos mesmo (só linhas COM vendedor).
    return { valor: { gt: 0 }, vendedorResponsavelId: { not: null } };
};

// Filtro por LISTA de responsáveis: `responsaveis=id1,id2,ESCRITORIO`.
// Vira um único `some` com `OR` dentro — assim o recorte é feito no BANCO, e não no
// navegador (com o recorte no cliente os indicadores da tela vinham do universo inteiro).
// Devolve `null` quando não há nada válido pedido.
const someResponsaveis = (lista) => {
    const itens = (Array.isArray(lista) ? lista : String(lista || '').split(','))
        .map(v => String(v || '').trim())
        .filter(Boolean);
    const ors = [];
    for (const item of itens) {
        const clausula = item.toUpperCase() === 'ESCRITORIO'
            ? someResponsavel('ESCRITORIO', null)
            : someResponsavel('VENDEDOR', item);
        if (clausula) ors.push(clausula);
    }
    if (ors.length === 0) return null;
    if (ors.length === 1) return ors[0];
    return { OR: ors };
};

// Conta financeira em espécie (a "Caixinha") — usada quando a baixa manual em dinheiro
// não vem com conta escolhida, para nunca sobrar baixa sem dizer onde o dinheiro entrou.
const contaEspeciePadrao = async () => {
    try {
        const c = await prisma.contaFinanceira.findFirst({
            where: { tipoUso: 'DINHEIRO', ativo: true },
            select: { id: true },
            orderBy: { nomeBanco: 'asc' }
        });
        return c?.id || null;
    } catch (_) {
        return null;
    }
};

// Caixa do dia de quem está baixando — é para lá que vai o dinheiro em espécie recebido
// aqui, virando "valor a prestar" dela. Abre o caixa do dia se ainda não existir.
// Caixa já fechado/conferido não recebe lançamento novo (senão muda um dia já prestado).
const caixaDeHojeParaBaixa = async (usuarioId) => {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const existente = await prisma.caixaDiario.findUnique({
        where: { vendedorId_dataReferencia: { vendedorId: usuarioId, dataReferencia: hoje } },
        select: { id: true, status: true }
    });
    if (existente && existente.status !== 'ABERTO') {
        const e = new Error(`Seu caixa de hoje já está ${existente.status === 'CONFERIDO' ? 'conferido' : 'fechado'} — reabra o caixa para lançar este recebimento (ou registre a baixa amanhã).`);
        e.status = 400;
        throw e;
    }
    if (existente) return existente.id;
    const novo = await prisma.caixaDiario.create({
        data: { vendedorId: usuarioId, dataReferencia: hoje, status: 'ABERTO' },
        select: { id: true }
    });
    return novo.id;
};

// ── Cobrança (como o título é cobrado: Boleto, Pix, Dinheiro, Cartão) ──
// Vem da CONDIÇÃO do pedido (tabela_precos.tipo_pagamento), não da baixa. É o único jeito de
// filtrar boleto/pix numa conta AINDA EM ABERTO — parcela.formaPagamento só é preenchido na baixa.
const LABEL_TIPO_COBRANCA = {
    BOLETO_BANCARIO: 'Boleto',
    PIX: 'Pix',
    DINHEIRO: 'Dinheiro',
    CARTAO: 'Cartão'
};

// Cláusula Prisma para filtrar contas por tipo de cobrança.
// O pedido guarda o tipo em `tipoPagamento`, mas pedidos antigos podem ter só o nome da condição
// (`nomeCondicaoPagamento`) — daí o OR com os nomes das condições daquele tipo.
const filtroTipoCobranca = async (tipos) => {
    const condicoes = await prisma.tabelaPreco.findMany({
        where: { tipoPagamento: { in: tipos } },
        select: { nomeCondicao: true }
    });
    const nomes = [...new Set(condicoes.map(c => c.nomeCondicao).filter(Boolean))];
    return {
        pedido: {
            OR: [
                { tipoPagamento: { in: tipos } },
                { nomeCondicaoPagamento: { in: nomes } }
            ]
        }
    };
};

// ── GET /tipos-cobranca — opções do filtro de cobrança (derivadas das condições cadastradas) ──
router.get('/tipos-cobranca', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const rows = await prisma.tabelaPreco.findMany({
            select: { tipoPagamento: true },
            distinct: ['tipoPagamento']
        });
        const tipos = rows
            .map(r => r.tipoPagamento)
            .filter(Boolean)
            .map(t => ({ valor: t, label: LABEL_TIPO_COBRANCA[t] || t }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        res.json({ tipos });
    } catch (e) {
        res.json({ tipos: [] });
    }
});

// ── GET /baixado-por — quem já deu baixa em alguma parcela (opções do filtro "Baixado por") ──
router.get('/baixado-por', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const rows = await prisma.parcela.findMany({
            where: { baixadoPorId: { not: null } },
            distinct: ['baixadoPorId'],
            select: { baixadoPorId: true, baixadoPor: { select: { id: true, nome: true } } }
        });
        const usuarios = rows
            .map(r => r.baixadoPor)
            .filter(Boolean)
            .map(u => ({ valor: u.id, label: u.nome }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        res.json({ usuarios });
    } catch (e) {
        res.json({ usuarios: [] });
    }
});

// ── GET /responsaveis — opções do filtro "Responsável pela cobrança" ──
// Igual a /baixado-por: as opções vêm do banco INTEIRO, não das linhas já filtradas na tela
// (senão ao escolher uma pessoa as outras somem do menu e o filtro fica impossível de limpar).
// `valor` é o que a tela devolve ao servidor: id do vendedor, ou a palavra ESCRITORIO.
router.get('/responsaveis', verificarAuth, checkAcesso, async (req, res) => {
    try {
        // `groupBy` vira GROUP BY no banco (o `distinct` do Prisma é filtrado em memória
        // DEPOIS de trazer a tabela inteira — com 40 mil linhas de pagamento isso é uma
        // varredura completa a cada abertura da tela).
        const [gruposVendedor, temEscritorio] = await Promise.all([
            prisma.pedidoPagamentoReal.groupBy({
                by: ['vendedorResponsavelId'],
                where: { valor: { gt: 0 }, vendedorResponsavelId: { not: null } }
            }),
            prisma.pedidoPagamentoReal.findFirst({
                where: { valor: { gt: 0 }, escritorioResponsavel: true, vendedorResponsavelId: null },
                select: { id: true }
            })
        ]);
        const idsVendedor = gruposVendedor.map(g => g.vendedorResponsavelId).filter(Boolean);
        const vendedores = idsVendedor.length
            ? await prisma.vendedor.findMany({
                where: { id: { in: idsVendedor } },
                select: { id: true, nome: true }
            })
            : [];
        const responsaveis = vendedores
            .map(v => ({ tipo: 'VENDEDOR', pessoaId: v.id, valor: v.id, label: v.nome }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        if (temEscritorio) {
            responsaveis.push({ tipo: 'ESCRITORIO', pessoaId: null, valor: 'ESCRITORIO', label: 'Escritório' });
        }
        res.json({ responsaveis });
    } catch (e) {
        console.error('Erro em /contas-receber/responsaveis:', e);
        res.json({ responsaveis: [] });
    }
});

// ── GET /por-responsavel — fechamento do dia 01, agrupado por quem ficou de cobrar ──
// Só título EM ABERTO: o que já foi baixado não é mais cobrança de ninguém.
// `de`/`ate` (YYYY-MM-DD, opcionais) filtram pelo VENCIMENTO da parcela.
// Um título é uma PARCELA em aberto (é o que tem vencimento e vira vale).
router.get('/por-responsavel', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

        const filtroParcela = { status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] } };
        if (de || ate) {
            filtroParcela.dataVencimento = {};
            if (de) filtroParcela.dataVencimento.gte = new Date(de + 'T00:00:00.000Z');
            if (ate) filtroParcela.dataVencimento.lte = new Date(ate + 'T23:59:59.999Z');
        }

        const contas = await prisma.contaReceber.findMany({
            where: {
                parcelas: { some: filtroParcela },
                // Mesmas exclusões da listagem: pedido excluído/cancelado no CA e bonificação
                // não são cobrança de ninguém. `notIn` do Prisma EXCLUI null — daí o OR explícito.
                pedido: {
                    statusEnvio: { notIn: ['EXCLUIDO'] },
                    bonificacao: false,
                    OR: [
                        { situacaoCA: null },
                        { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }
                    ],
                    pagamentosReais: {
                        some: {
                            valor: { gt: 0 },
                            OR: [
                                { vendedorResponsavelId: { not: null } },
                                { escritorioResponsavel: true }
                            ]
                        }
                    }
                }
            },
            select: {
                id: true,
                clienteId: true,
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                pedido: {
                    select: {
                        id: true, numero: true, dataVenda: true, especial: true,
                        vendedor: { select: { id: true, nome: true } },
                        usuarioLancamento: { select: { id: true, nome: true } },
                        pagamentosReais: SELECT_PAGAMENTOS_RESPONSAVEL
                    }
                },
                parcelas: {
                    where: filtroParcela,
                    orderBy: { numeroParcela: 'asc' },
                    select: {
                        id: true, numeroParcela: true, valor: true, valorPago: true,
                        valorDescontoTotal: true, dataVencimento: true, status: true
                    }
                }
            }
        });

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const grupos = new Map();
        // Uma parcela dividida entre duas pessoas é UM título só (duas fatias). Contar por
        // fatia dobrava o número impresso na folha do vale.
        const parcelasNoRelatorio = new Set();

        for (const c of contas) {
            const responsaveis = montarResponsaveis(c.pedido);
            if (responsaveis.length === 0) continue;

            const marcadoTotal = r2(responsaveis.reduce((s, r) => s + r.valor, 0));
            const compartilhado = responsaveis.length > 1;
            const clienteNome = c.cliente?.NomeFantasia || c.cliente?.Nome || '-';

            // Saldo em aberto de cada parcela do título (PARCIAL desconta o já pago/descontado)
            const parcelasAbertas = c.parcelas
                .map(p => {
                    const saldo = r2(p.status === 'PARCIAL'
                        ? Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0)
                        : Number(p.valor));
                    const venc = new Date(p.dataVencimento);
                    venc.setHours(0, 0, 0, 0);
                    return { p, saldo, diasAtraso: Math.max(0, Math.round((hoje - venc) / 86400000)) };
                })
                .filter(x => x.saldo > 0);
            const saldoTotal = r2(parcelasAbertas.reduce((s, x) => s + x.saldo, 0));
            if (saldoTotal <= 0) continue;

            // ── Quanto CADA responsável deve NESTE título ──────────────────────────────
            // Regra: NINGUÉM é cobrado por mais do que assumiu.
            //  • Saldo em aberto >= total assumido → cada um responde exatamente pela fatia
            //    que marcou. O que sobra do saldo é dinheiro que ninguém assumiu (ex.: espécie
            //    recebida na entrega, ainda esperando a conferência do Caixa) e não vira vale.
            //    Era aqui o defeito: com UM responsável o peso era 1 e ele levava o saldo
            //    INTEIRO do título — pedido de R$ 1.000 com "Dinheiro 600" + "Vendedor 400"
            //    saía como R$ 1.000 no nome do vendedor.
            //  • Saldo em aberto < total assumido (houve baixa parcial) → rateia o saldo
            //    proporcionalmente ao que cada um assumiu; o último leva a sobra do centavo.
            //    (Ratear SEMPRE sobre o total de todas as linhas seria pior: depois que os
            //    R$ 600 em espécie são conferidos, o saldo cai para R$ 400 e o vendedor
            //    apareceria devendo R$ 160 — menos do que assumiu.)
            const devidos = [];
            if (marcadoTotal > 0 && saldoTotal < marcadoTotal) {
                let acumTitulo = 0;
                responsaveis.forEach((r, i) => {
                    const ultimo = i === responsaveis.length - 1;
                    const v = ultimo ? r2(saldoTotal - acumTitulo) : r2(saldoTotal * (r.valor / marcadoTotal));
                    acumTitulo = r2(acumTitulo + v);
                    devidos.push(v);
                });
            } else {
                responsaveis.forEach(r => devidos.push(r2(r.valor)));
            }

            // Espalha o devido de cada responsável pelas parcelas em aberto, na proporção do
            // saldo de cada uma; a ÚLTIMA parcela leva a sobra do arredondamento, então a soma
            // das fatias fecha centavo a centavo com o devido do título.
            // O MESMO rateio é aplicado ao que a pessoa ASSUMIU (`valorMarcado`): o marcado é
            // do PEDIDO INTEIRO, e a linha do relatório é UMA PARCELA — mandar o marcado cheio
            // em cada parcela fazia a tela comparar laranja com maçã e imprimir "anotado na
            // entrega" em TODO pedido parcelado (alarme falso). Com a fatia, os dois números
            // só divergem quando divergiram de verdade (baixa parcial no meio).
            responsaveis.forEach((resp, i) => {
                const devido = devidos[i];
                if (devido <= 0) return;
                const chave = resp.tipo === 'VENDEDOR' ? `VENDEDOR:${resp.pessoaId}` : 'ESCRITORIO';
                if (!grupos.has(chave)) {
                    grupos.set(chave, {
                        tipo: resp.tipo,
                        pessoaId: resp.pessoaId,
                        // No relatório o escritório é UM balde só: os pedidos dele foram
                        // lançados por gente diferente, então "lançado por Fulano" fica em
                        // cada título (campo `lancadoPor`), não no nome do grupo.
                        pessoaNome: resp.tipo === 'ESCRITORIO' ? 'Escritório' : resp.pessoaNome,
                        quantidadeTitulos: 0,
                        valorTotal: 0,
                        valorMarcado: 0,
                        titulos: []
                    });
                }
                const g = grupos.get(chave);
                let alocado = 0;
                let marcadoAlocado = 0;
                parcelasAbertas.forEach(({ p, saldo, diasAtraso }, j) => {
                    const ultima = j === parcelasAbertas.length - 1;
                    const valor = ultima ? r2(devido - alocado) : r2(devido * (saldo / saldoTotal));
                    const marcadoFatia = ultima
                        ? r2(r2(resp.valor) - marcadoAlocado)
                        : r2(resp.valor * (saldo / saldoTotal));
                    alocado = r2(alocado + valor);
                    marcadoAlocado = r2(marcadoAlocado + marcadoFatia);
                    if (valor <= 0) return;
                    parcelasNoRelatorio.add(p.id);
                    g.titulos.push({
                        contaId: c.id,
                        parcelaId: p.id,
                        numeroParcela: p.numeroParcela,
                        statusParcela: p.status,
                        clienteId: c.clienteId,
                        clienteNome,
                        pedidoId: c.pedido?.id || null,
                        pedidoNumero: c.pedido?.numero || null,
                        pedidoEspecial: c.pedido?.especial || false,
                        dataVenda: c.pedido?.dataVenda || null,
                        // Pista de a quem perguntar quando o responsável é o escritório.
                        // NÃO é afirmação de que essa pessoa é a responsável pela cobrança.
                        lancadoPor: c.pedido?.usuarioLancamento?.nome || c.pedido?.vendedor?.nome || null,
                        valor,
                        // Saldo total da parcela (o título todo), para conferência na tela:
                        // pode ser MAIOR que `valor` quando parte do pedido não tem responsável.
                        saldoParcela: saldo,
                        // Fatia do que a pessoa assumiu que cabe NESTA parcela (não o marcado
                        // do pedido inteiro) — é contra este número que a tela compara `valor`.
                        valorMarcado: marcadoFatia,
                        compartilhado,
                        dataVencimento: p.dataVencimento,
                        diasAtraso
                    });
                    g.valorTotal = r2(g.valorTotal + valor);
                    // Cabeçalho da pessoa = SOMA DAS LINHAS mostradas. Somar `resp.valor` por
                    // conta (como antes) inflava o cabeçalho quando aquela conta não gerava
                    // título nenhum ou gerava menos do que o marcado.
                    g.valorMarcado = r2(g.valorMarcado + marcadoFatia);
                    g.quantidadeTitulos += 1;
                });
            });
        }

        const lista = [...grupos.values()]
            .filter(g => g.quantidadeTitulos > 0)
            .map(g => {
                g.titulos.sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento));
                // A chave de agrupamento é `tipo` + `pessoaId` (o escritório é um balde só,
                // sem pessoaId) — quem consome monta a chave a partir desses dois campos.
                return {
                    ...g,
                    valorTotal: r2(g.valorTotal),
                    // Mesmo número de `valorTotal`, com o nome que diz o que ele é: a SOMA DO
                    // SALDO EM ABERTO HOJE (parcela PARCIAL entra pelo que falta, não pelo
                    // valor cheio). NÃO é comparável ao `totalEmAberto` da listagem, que soma
                    // o valor NOMINAL de PENDENTE/VENCIDO.
                    saldoEmAberto: r2(g.valorTotal),
                    valorMarcado: r2(g.valorMarcado),
                    maisAntigo: g.titulos[0]
                        ? {
                            dataVencimento: g.titulos[0].dataVencimento,
                            diasAtraso: g.titulos[0].diasAtraso,
                            clienteNome: g.titulos[0].clienteNome,
                            pedidoNumero: g.titulos[0].pedidoNumero,
                            valor: g.titulos[0].valor
                        }
                        : null
                };
            })
            .sort((a, b) => b.valorTotal - a.valorTotal);

        // Título mais antigo do relatório inteiro (o que está apodrecendo há mais tempo)
        const maisAntigoGeral = lista
            .map(g => g.maisAntigo)
            .filter(Boolean)
            .sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento))[0] || null;

        const valorGeral = r2(lista.reduce((s, g) => s + g.valorTotal, 0));
        res.json({
            periodo: { de: de || null, ate: ate || null },
            responsaveis: lista,
            rotulos: {
                // Rótulo que o relatório deve imprimir em cima do total, para o dono não
                // comparar com o "Total em aberto" da listagem (bases diferentes).
                total: 'Saldo em aberto hoje'
            },
            totais: {
                pessoas: lista.length,
                // Títulos DISTINTOS: parcela dividida entre duas pessoas é um título só.
                titulos: parcelasNoRelatorio.size,
                // Mantido para quem já lê este campo; some as fatias, então em título
                // compartilhado é maior que `titulos`.
                fatias: lista.reduce((s, g) => s + g.quantidadeTitulos, 0),
                valorTotal: valorGeral,
                saldoEmAbertoHoje: valorGeral,
                maisAntigo: maisAntigoGeral
            }
        });
    } catch (e) {
        console.error('Erro em /contas-receber/por-responsavel:', e);
        res.status(500).json({ error: 'Erro ao montar o relatório por responsável.' });
    }
});

// ── GET /opcoes-filtros — opções FIXAS dos filtros (condição, entrega, forma da baixa) ──
// Precisam vir do banco INTEIRO, não das linhas já filtradas na tela: antes a tela montava
// essas listas a partir do resultado atual, então ao escolher uma opção as outras sumiam do
// menu — e a opção escolhida também, deixando o filtro impossível de desmarcar (a lista só
// voltava limpando tudo).
router.get('/opcoes-filtros', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nomes = (rows) => [...new Set(rows.map(r => (r.nome || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const [condicoes, entrega, baixa] = await Promise.all([
            prisma.$queryRaw`SELECT DISTINCT nome_condicao_pagamento AS nome FROM pedidos WHERE nome_condicao_pagamento IS NOT NULL`,
            prisma.$queryRaw`SELECT DISTINCT forma_pagamento_nome AS nome FROM pedido_pagamentos_reais WHERE forma_pagamento_nome IS NOT NULL`,
            prisma.$queryRaw`SELECT DISTINCT forma_pagamento AS nome FROM parcelas WHERE forma_pagamento IS NOT NULL`
        ]);
        // Baixas antigas (vindas do CA) gravaram a forma com o valor colado —
        // "À vista - Dinheiro: R$ 250,36". Cada uma dessas casa com UMA parcela só:
        // como opção de filtro não serve para nada e ainda enterraria as formas de
        // verdade numa lista de centenas de itens.
        res.json({
            condicoes: nomes(condicoes),
            formasEntrega: nomes(entrega),
            formasBaixa: nomes(baixa).filter(f => !/R\$/i.test(f))
        });
    } catch (e) {
        console.error('Erro em /contas-receber/opcoes-filtros:', e);
        res.json({ condicoes: [], formasEntrega: [], formasBaixa: [] });
    }
});

// ── GET /contas-financeiras — bancos/caixas do CA para o seletor da baixa ──
router.get('/contas-financeiras', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const contasFinanceiras = await caSync.listarContasFinanceirasSeguro();
        res.json({ contasFinanceiras });
    } catch (e) {
        res.json({ contasFinanceiras: [] });
    }
});

// Recalcula o status de uma Parcela a partir do total já recebido/descontado (não estornado)
const calcularStatusParcela = (valor, valorPago, valorDescontoTotal) => {
    const recebidoTotal = Number(valorPago || 0) + Number(valorDescontoTotal || 0);
    if (recebidoTotal <= 0) return 'PENDENTE';
    if (recebidoTotal >= Number(valor) - 0.01) return 'PAGO';
    return 'PARCIAL';
};

// Recalcula o status de uma ContaReceber a partir do status de todas as suas parcelas
const calcularStatusConta = (todasParcelas) => {
    const total = todasParcelas.length;
    const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
    const parciais = todasParcelas.filter(p => p.status === 'PARCIAL').length;
    const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;
    if (pagas + canceladas >= total) return 'QUITADO';
    if (pagas > 0 || parciais > 0) return 'PARCIAL';
    return 'ABERTO';
};

// ── GET / — Listar contas a receber com filtros ──
router.get('/', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const {
            status, clienteId, vencimentoDe, vencimentoAte, origem, busca, ordenarPor,
            vendedorId, condicaoPagamento, formaPagamento, statusParcela,
            pagamentoDe, pagamentoAte, categoriaClienteId, formaPagamentoEntrega, tipoCobranca,
            baixadoPorId, responsavelId, responsavelTipo, responsaveis
        } = req.query;

        const toList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => s.trim()).filter(Boolean);
        // Todo filtro de lista aceita valor único OU vários separados por vírgula
        const igual = (v) => { const arr = toList(v); return arr.length > 1 ? { in: arr } : arr[0]; };

        const where = {};
        if (status) where.status = igual(status);
        if (origem) where.origem = igual(origem);
        if (clienteId) where.clienteId = clienteId;

        // Filtro por busca no nome do cliente
        if (busca) {
            where.cliente = {
                OR: [
                    { NomeFantasia: { contains: busca, mode: 'insensitive' } },
                    { Nome: { contains: busca, mode: 'insensitive' } }
                ]
            };
        }

        // Filtro por categoria de cliente
        if (categoriaClienteId) {
            where.cliente = { ...(where.cliente || {}), categoriaClienteId: igual(categoriaClienteId) };
        }

        // Sempre esconde contas cujo pedido foi excluído/cancelado no CA.
        // pedidoId é nullable (contas ESPECIAL sem pedido vinculado) — aquelas passam livres.
        // ⚠️ `notIn` do Prisma EXCLUI null: situacaoCA vazia (pedido nunca sincronizado /
        // faturado local) precisa do OR explícito, senão o pedido some da lista.
        where.OR = [
            { pedidoId: null },
            {
                pedido: {
                    statusEnvio: { notIn: ['EXCLUIDO'] },
                    bonificacao: false,
                    OR: [
                        { situacaoCA: null },
                        { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }
                    ]
                }
            }
        ];

        // Filtros via pedido (vendedor, condição de pagamento, condição na entrega e responsável)
        // Tipo inválido é ERRO, não filtro ignorado: numa tela financeira, devolver a lista
        // inteira achando que está filtrada por uma pessoa é pior do que não responder.
        const tipoResp = String(responsavelTipo || '').trim().toUpperCase();
        if (tipoResp && !TIPOS_RESPONSAVEL.includes(tipoResp)) {
            return res.status(400).json({ error: 'responsavelTipo deve ser VENDEDOR ou ESCRITORIO.' });
        }
        // `responsaveis` (lista) tem precedência; `responsavelId`/`responsavelTipo` continuam
        // funcionando para não quebrar quem já está com o bundle antigo no PWA.
        const someResp = someResponsaveis(responsaveis) || someResponsavel(responsavelTipo, responsavelId);
        if (vendedorId || condicaoPagamento || formaPagamentoEntrega || someResp) {
            where.pedido = {};
            if (vendedorId) where.pedido.vendedorId = igual(vendedorId);
            if (condicaoPagamento) where.pedido.nomeCondicaoPagamento = igual(condicaoPagamento);
            if (formaPagamentoEntrega) {
                where.pedido.pagamentosReais = { some: { formaPagamentoNome: igual(formaPagamentoEntrega), valor: { gt: 0 } } };
            }
            // Responsável pela cobrança: filtra pela MARCAÇÃO gravada na linha de pagamento,
            // nunca pelo nome da forma ("Dinheiro" com a caixinha marcada tem que aparecer).
            // Vai num AND próprio para não colidir com o `pagamentosReais.some` da condição
            // na entrega — são linhas diferentes do mesmo pedido.
            if (someResp) {
                where.pedido.AND = [...(where.pedido.AND || []), { pagamentosReais: { some: someResp } }];
            }
        }

        // Cobrança (Boleto/Pix/...) — vale para parcela em aberto, pois olha a condição do pedido
        if (tipoCobranca) {
            where.AND = [...(where.AND || []), await filtroTipoCobranca(toList(tipoCobranca))];
        }

        // Filtros que atuam no nível de parcela (precisam de "some")
        const parcelaSome = {};
        if (vencimentoDe || vencimentoAte) {
            parcelaSome.dataVencimento = {};
            if (vencimentoDe) parcelaSome.dataVencimento.gte = new Date(vencimentoDe + 'T00:00:00.000Z');
            if (vencimentoAte) parcelaSome.dataVencimento.lte = new Date(vencimentoAte + 'T23:59:59.999Z');
        }
        if (pagamentoDe || pagamentoAte) {
            parcelaSome.dataPagamento = {};
            if (pagamentoDe) parcelaSome.dataPagamento.gte = new Date(pagamentoDe + 'T00:00:00.000Z');
            if (pagamentoAte) parcelaSome.dataPagamento.lte = new Date(pagamentoAte + 'T23:59:59.999Z');
        }
        if (statusParcela) parcelaSome.status = igual(statusParcela);
        if (formaPagamento) parcelaSome.formaPagamento = igual(formaPagamento);
        // Quem deu a baixa (só faz sentido em parcela já baixada)
        if (baixadoPorId) parcelaSome.baixadoPorId = igual(baixadoPorId);
        if (Object.keys(parcelaSome).length > 0) {
            where.parcelas = { some: parcelaSome };
        }

        // Otimização (peso): na VISÃO PADRÃO — sem filtro de situação (status), sem filtro de
        // status de parcela e sem filtrar por pagamento (data/forma) — a tela só exibe parcelas
        // que ainda faltam receber. Então o servidor só busca contas que TÊM pelo menos uma
        // parcela a receber, em vez de trazer o monte de contas já QUITADAS/CANCELADAS só para o
        // cliente escondê-las. Provado equivalente ao comportamento antigo (mesmas parcelas
        // visíveis) e ~80% menos contas carregadas. Com qualquer filtro explícito acima, não
        // entra (aí o cliente pode querer ver parcelas pagas/canceladas).
        const filtrandoPagas = !!pagamentoDe || !!pagamentoAte || !!formaPagamento || !!baixadoPorId;
        if (!status && !statusParcela && !filtrandoPagas) {
            where.AND = [
                ...(where.AND || []),
                { parcelas: { some: { status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] } } } }
            ];
        }

        const contas = await prisma.contaReceber.findMany({
            where,
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                pedido: {
                    select: {
                        id: true, numero: true, especial: true, nomeCondicaoPagamento: true,
                        statusEntrega: true, devolucaoFinalizada: true, dataVenda: true,
                        idVendaContaAzul: true,
                        vendedor: { select: { id: true, nome: true } },
                        usuarioLancamento: { select: { id: true, nome: true } },
                        itensDevolvidos: { select: { valorBaseItem: true, quantidade: true } },
                        devolucoes: {
                            where: { status: 'ATIVA' },
                            select: { valorTotal: true, escopo: true, dataDevolucao: true, pdfBoletoUrl: true }
                        },
                        pagamentosReais: SELECT_PAGAMENTOS_RESPONSAVEL
                    }
                },
                parcelas: {
                    orderBy: { numeroParcela: 'asc' },
                    include: { baixadoPor: { select: { id: true, nome: true } } }
                }
            },
            orderBy: ordenarPor === 'vencimento' ? { createdAt: 'asc' } : { createdAt: 'desc' }
        });

        // Calcular indicadores
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const em7dias = new Date(hoje);
        em7dias.setDate(em7dias.getDate() + 7);

        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);

        let totalEmAberto = 0;
        let totalVencidas = 0;
        let totalAVencer7d = 0;
        let totalQuitadasMes = 0;

        contas.forEach(conta => {
            conta.parcelas.forEach(p => {
                const venc = new Date(p.dataVencimento);
                venc.setHours(0, 0, 0, 0);

                if (p.status === 'PENDENTE' || p.status === 'VENCIDO') {
                    totalEmAberto += Number(p.valor);
                    if (venc < hoje) totalVencidas += Number(p.valor);
                    else if (venc <= em7dias) totalAVencer7d += Number(p.valor);
                } else if (p.status === 'PARCIAL') {
                    const saldo = Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0);
                    totalEmAberto += saldo;
                    if (venc < hoje) totalVencidas += saldo;
                    else if (venc <= em7dias) totalAVencer7d += saldo;
                }
            });
        });

        // Quitadas no mês: soma dos pagamentos/descontos (do ledger) lançados no mês corrente,
        // independente do status atual da parcela (cobre baixas parciais e totais).
        const pagamentosDoMes = await prisma.pagamentoParcela.findMany({
            where: { estornado: false, dataPagamento: { gte: inicioMes, lte: fimMes } },
            select: { valorRecebido: true, valorDesconto: true }
        });
        totalQuitadasMes = pagamentosDoMes.reduce((s, p) => s + Number(p.valorRecebido) + Number(p.valorDesconto), 0);

        // Formatar resposta
        const contasFormatadas = contas.map(c => {
            const parcelasPagas = c.parcelas.filter(p => p.status === 'PAGO').length;
            const proximaVencimento = c.parcelas
                .filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO')
                .sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento))[0];

            // Calcular valor devolvido
            const valorDevolvido = (c.pedido?.itensDevolvidos || []).reduce(
                (s, i) => s + Number(i.valorBaseItem) * Number(i.quantidade), 0
            );
            const devolucaoAtiva = c.pedido?.devolucoes?.[0] || null;

            return {
                id: c.id,
                clienteNome: c.cliente?.NomeFantasia || c.cliente?.Nome || '-',
                clienteId: c.clienteId,
                pedidoNumero: c.pedido?.numero || null,
                pedidoId: c.pedido?.id || null,
                pedidoEspecial: c.pedido?.especial || false,
                idVendaContaAzul: c.pedido?.idVendaContaAzul || null,
                dataVenda: c.pedido?.dataVenda || null,
                vendedorId: c.pedido?.vendedor?.id || null,
                vendedorNome: c.pedido?.vendedor?.nome || null,
                condicaoPagamento: c.pedido?.nomeCondicaoPagamento || null,
                statusEntrega: c.pedido?.statusEntrega || null,
                pagamentosEntrega: (c.pedido?.pagamentosReais || []).map(p => ({
                    formaPagamentoNome: p.formaPagamentoNome,
                    valor: Number(p.valor),
                    escritorioResponsavel: p.escritorioResponsavel,
                    vendedorResponsavelId: p.vendedorResponsavelId || null
                })),
                // Quem ficou de cobrar este título (vazio quando ninguém foi marcado).
                responsaveis: montarResponsaveis(c.pedido),
                devolucaoFinalizada: c.pedido?.devolucaoFinalizada || false,
                valorDevolvido: valorDevolvido > 0 ? Math.round(valorDevolvido * 100) / 100 : null,
                devolucaoEscopo: devolucaoAtiva?.escopo || null,
                pdfBoletoUrl: devolucaoAtiva?.pdfBoletoUrl || null,
                origem: c.origem,
                valorTotal: Number(c.valorTotal),
                status: c.status,
                observacao: c.observacao,
                parcelasTotal: c.parcelas.length,
                parcelasPagas,
                proximoVencimento: proximaVencimento?.dataVencimento || null,
                parcelas: c.parcelas.map(p => ({
                    id: p.id,
                    numeroParcela: p.numeroParcela,
                    valor: Number(p.valor),
                    dataVencimento: p.dataVencimento,
                    dataPagamento: p.dataPagamento,
                    valorPago: p.valorPago ? Number(p.valorPago) : null,
                    valorDescontoTotal: Number(p.valorDescontoTotal || 0),
                    formaPagamento: p.formaPagamento,
                    status: p.status,
                    observacao: p.observacao,
                    baixadoPorId: p.baixadoPor?.id || null,
                    baixadoPorNome: p.baixadoPor?.nome || null
                })),
                createdAt: c.createdAt
            };
        });

        res.json({
            contas: contasFormatadas,
            indicadores: {
                totalEmAberto: Math.round(totalEmAberto * 100) / 100,
                totalVencidas: Math.round(totalVencidas * 100) / 100,
                totalAVencer7d: Math.round(totalAVencer7d * 100) / 100,
                totalQuitadasMes: Math.round(totalQuitadasMes * 100) / 100
            }
        });
    } catch (error) {
        console.error('Erro ao listar contas a receber:', error);
        res.status(500).json({ error: 'Erro ao listar contas a receber.' });
    }
});

// ── GET /relatorio-itens — Relatório de itens por pedido ──
router.get('/relatorio-itens', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const {
            status, clienteId, vencimentoDe, vencimentoAte, origem, busca,
            vendedorId, condicaoPagamento, formaPagamento, statusParcela,
            pagamentoDe, pagamentoAte, categoriaClienteId, tipoCobranca, baixadoPorId
        } = req.query;

        const toList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => s.trim()).filter(Boolean);
        const igual = (v) => { const arr = toList(v); return arr.length > 1 ? { in: arr } : arr[0]; };

        const where = {};
        if (status) where.status = igual(status);
        if (origem) where.origem = igual(origem);
        if (clienteId) where.clienteId = clienteId;
        if (busca) {
            where.cliente = { OR: [
                { NomeFantasia: { contains: busca, mode: 'insensitive' } },
                { Nome: { contains: busca, mode: 'insensitive' } }
            ]};
        }
        if (categoriaClienteId) {
            where.cliente = { ...(where.cliente || {}), categoriaClienteId: igual(categoriaClienteId) };
        }
        // Mesmo critério da listagem principal: `notIn` do Prisma EXCLUI null, então
        // situacaoCA vazia (pedido faturado no app / nunca sincronizado, incluindo os
        // especiais) precisa do OR explícito, senão o pedido some do relatório.
        where.OR = [
            { pedidoId: null },
            {
                pedido: {
                    statusEnvio: { notIn: ['EXCLUIDO'] },
                    bonificacao: false,
                    OR: [
                        { situacaoCA: null },
                        { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }
                    ]
                }
            }
        ];
        if (vendedorId || condicaoPagamento) {
            where.pedido = {};
            if (vendedorId) where.pedido.vendedorId = igual(vendedorId);
            if (condicaoPagamento) where.pedido.nomeCondicaoPagamento = igual(condicaoPagamento);
        }
        if (tipoCobranca) {
            where.AND = [...(where.AND || []), await filtroTipoCobranca(toList(tipoCobranca))];
        }
        const parcelaSome = {};
        if (vencimentoDe || vencimentoAte) {
            parcelaSome.dataVencimento = {};
            if (vencimentoDe) parcelaSome.dataVencimento.gte = new Date(vencimentoDe + 'T00:00:00.000Z');
            if (vencimentoAte) parcelaSome.dataVencimento.lte = new Date(vencimentoAte + 'T23:59:59.999Z');
        }
        if (pagamentoDe || pagamentoAte) {
            parcelaSome.dataPagamento = {};
            if (pagamentoDe) parcelaSome.dataPagamento.gte = new Date(pagamentoDe + 'T00:00:00.000Z');
            if (pagamentoAte) parcelaSome.dataPagamento.lte = new Date(pagamentoAte + 'T23:59:59.999Z');
        }
        if (statusParcela) parcelaSome.status = igual(statusParcela);
        if (formaPagamento) parcelaSome.formaPagamento = igual(formaPagamento);
        if (baixadoPorId) parcelaSome.baixadoPorId = igual(baixadoPorId);
        if (Object.keys(parcelaSome).length > 0) where.parcelas = { some: parcelaSome };

        const contas = await prisma.contaReceber.findMany({
            where,
            select: {
                id: true, pedidoId: true,
                pedido: {
                    select: {
                        id: true, numero: true, especial: true, dataVenda: true,
                        cliente: { select: { NomeFantasia: true, Nome: true } },
                        vendedor: { select: { nome: true } },
                        itens: {
                            select: {
                                id: true, descricao: true, quantidade: true, valor: true,
                                produto: { select: { nome: true } }
                            }
                        }
                    }
                }
            }
        });

        const pedidosMap = new Map();
        for (const conta of contas) {
            if (!conta.pedidoId || !conta.pedido) continue;
            if (pedidosMap.has(conta.pedidoId)) continue;
            const p = conta.pedido;
            const clienteNome = p.cliente?.NomeFantasia || p.cliente?.Nome || '-';
            const itens = (p.itens || []).map(it => {
                const quantidade = Number(it.quantidade);
                const valorUnitario = Number(it.valor);
                return {
                    produtoNome: it.produto?.nome || it.descricao || '-',
                    descricao: it.descricao || null,
                    quantidade, valorUnitario,
                    total: Math.round(quantidade * valorUnitario * 100) / 100
                };
            });
            pedidosMap.set(conta.pedidoId, {
                pedidoId: p.id, contaId: conta.id,
                pedidoNumero: p.numero || null, pedidoEspecial: p.especial || false,
                clienteNome, vendedorNome: p.vendedor?.nome || '-',
                dataVenda: p.dataVenda, itens,
                subtotal: itens.reduce((s, i) => s + i.total, 0)
            });
        }

        const resultado = [...pedidosMap.values()];
        res.json({ pedidos: resultado, total: resultado.length });
    } catch (error) {
        console.error('Erro ao gerar relatório de itens:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório de itens.' });
    }
});

// ── GET /:id — Detalhe de uma conta ──
router.get('/:id', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id },
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                pedido: { select: { id: true, numero: true, especial: true, nomeCondicaoPagamento: true, itens: true } },
                parcelas: {
                    orderBy: { numeroParcela: 'asc' },
                    include: { baixadoPor: { select: { nome: true } } }
                }
            }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        res.json(conta);
    } catch (error) {
        console.error('Erro ao buscar conta:', error);
        res.status(500).json({ error: 'Erro ao buscar conta.' });
    }
});

// ── POST /baixa-lote — Dar baixa em várias parcelas de uma vez ──
router.post('/baixa-lote', verificarAuth, checkBaixa, checkBaixaManual, async (req, res) => {
    try {
        const { parcelaIds, formaPagamento, dataPagamento, observacao, contaFinanceiraCaId } = req.body;

        if (!Array.isArray(parcelaIds) || parcelaIds.length === 0) {
            return res.status(400).json({ error: 'Informe ao menos uma parcela.' });
        }

        if (parcelaIds.length > 200) {
            return res.status(400).json({ error: 'Máximo de 200 parcelas por vez.' });
        }

        // Mesma regra da baixa individual: só espécie, e o total vai para o caixa de hoje
        // de quem baixou (aqui é sempre pelo valor cheio, não existe desconto no lote).
        const erroForma = validarFormaManual(formaPagamento);
        if (erroForma) return res.status(400).json({ error: erroForma });

        const parcelas = await prisma.parcela.findMany({
            where: { id: { in: parcelaIds } },
            include: { contaReceber: true }
        });

        const elegiveis = parcelas.filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO');
        if (elegiveis.length === 0) {
            return res.status(400).json({ error: 'Nenhuma parcela elegível para baixa.' });
        }

        let caixaDiarioId;
        try {
            caixaDiarioId = await caixaDeHojeParaBaixa(req.user.id);
        } catch (e) {
            return res.status(e.status || 500).json({ error: e.message });
        }
        const contaFinanceiraFinal = contaFinanceiraCaId || await contaEspeciePadrao();

        const dataPgto = dataPagamento ? new Date(dataPagamento) : new Date();

        // Executar tudo em transação
        await prisma.$transaction(async (tx) => {
            // 1. Atualizar todas as parcelas (sempre pelo valor cheio — baixa em lote não aceita parcial/desconto)
            for (const parcela of elegiveis) {
                await tx.parcela.update({
                    where: { id: parcela.id },
                    data: {
                        status: 'PAGO',
                        valorPago: parcela.valor,
                        formaPagamento: formaPagamento || null,
                        contaFinanceiraCaId: contaFinanceiraFinal || parcela.contaFinanceiraCaId,
                        dataPagamento: dataPgto,
                        baixadoPorId: req.user.id,
                        observacao: observacao || null
                    }
                });
                await tx.pagamentoParcela.create({
                    data: {
                        parcelaId: parcela.id,
                        valorRecebido: parcela.valor,
                        formaPagamento: formaPagamento || null,
                        contaFinanceiraCaId: contaFinanceiraFinal,
                        dataPagamento: dataPgto,
                        observacao: observacao || null,
                        origem: 'MANUAL',
                        caixaDiarioId,
                        registradoPorId: req.user.id
                    }
                });
            }

            // 2. Recalcular status de cada conta afetada
            const contaIds = [...new Set(elegiveis.map(p => p.contaReceberId))];
            for (const contaId of contaIds) {
                const todasParcelas = await tx.parcela.findMany({
                    where: { contaReceberId: contaId }
                });
                await tx.contaReceber.update({
                    where: { id: contaId },
                    data: { status: calcularStatusConta(todasParcelas) }
                });
            }
        }, { timeout: 20000, maxWait: 10000 });

        // Registrar no histórico — fora da transação para não derrubar a baixa
        // se o banco estiver lento (a baixa em si já foi efetivada).
        try {
            for (const parcela of elegiveis) {
                const conta = parcela.contaReceber;
                const formaPg = formaPagamento || 'N/I';
                await prisma.atendimento.create({
                    data: {
                        tipo: 'FINANCEIRO',
                        observacao: `Baixa em lote - parcela ${parcela.numeroParcela} - R$ ${Number(parcela.valor).toFixed(2)} (${formaPg})${observacao ? ` | ${observacao}` : ''}`,
                        clienteId: conta.clienteId,
                        idVendedor: req.user.id,
                        pedidoId: conta.pedidoId || null
                    }
                });
            }
        } catch (logErr) {
            console.error('Falha ao registrar histórico da baixa em lote (baixa já efetivada):', logErr);
        }

        // Parcela quitada na mão → cancela boleto/PIX Asaas pendente dela, igual à baixa
        // individual. Sem isto o boleto continuava vivo no Asaas depois do lote e o cliente
        // ainda podia pagá-lo = recebimento em dobro. Melhor esforço, fora da resposta.
        {
            const asaasService = require('../services/asaasService');
            for (const parcela of elegiveis) {
                asaasService.cancelarCobrancasDaParcela(parcela.id, 'baixa em lote no app')
                    .catch(e => console.error('[Baixa lote] Falha ao cancelar cobrança Asaas (baixa já efetivada):', e.message));
            }
        }

        res.json({
            message: `Baixa realizada em ${elegiveis.length} parcela(s)!`,
            totalBaixadas: elegiveis.length,
            totalIgnoradas: parcelas.length - elegiveis.length
        });
    } catch (error) {
        console.error('Erro ao dar baixa em lote:', error);
        res.status(500).json({ error: 'Erro ao dar baixa em lote.' });
    }
});

// ── GET /:parcelaId/pagamentos — Histórico de pagamentos (ledger) de uma parcela ──
router.get('/:parcelaId/pagamentos', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { parcelaId } = req.params;
        const pagamentos = await prisma.pagamentoParcela.findMany({
            where: { parcelaId },
            include: {
                registradoPor: { select: { id: true, nome: true } },
                estornadoPor: { select: { id: true, nome: true } }
            },
            orderBy: { dataPagamento: 'asc' }
        });
        res.json(pagamentos);
    } catch (error) {
        console.error('Erro ao buscar histórico de pagamentos:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico de pagamentos.' });
    }
});

// ── POST /:parcelaId/baixa — Dar baixa em parcela (total, parcial, com ou sem desconto) ──
router.post('/:parcelaId/baixa', verificarAuth, checkBaixa, checkBaixaManual, async (req, res) => {
    try {
        const { parcelaId } = req.params;
        const {
            valorRecebido, valorPago, // `valorPago`: nome LEGADO (ver aviso abaixo)
            valorDesconto, motivoDesconto, formaPagamento, dataPagamento, observacao, contaFinanceiraCaId
        } = req.body;
        const perms = req._perms;

        // Compatibilidade: a tela antiga (Financeiro → Contas a Receber, botão "Dar Baixa")
        // mandava `valorPago` e a rota só lia `valorRecebido` — resultado: 400 "Informe um
        // valor recebido ou um desconto" em TODA tentativa (bug em produção, 08/2026).
        // Aceitamos os dois nomes para não quebrar chamador antigo; `valorRecebido` é o
        // oficial (é o nome da coluna do ledger). Remover `valorPago` só depois de
        // confirmar que nenhuma versão antiga do app em campo ainda o envia.
        const valorRecebidoFinal = valorRecebido !== undefined ? valorRecebido : valorPago;
        if (valorRecebido === undefined && valorPago !== undefined) {
            console.warn('[ContasReceber] baixa recebida com o campo LEGADO `valorPago` — o nome oficial é `valorRecebido`. Atualize o chamador.');
        }

        const parcela = await prisma.parcela.findUnique({
            where: { id: parcelaId },
            include: { contaReceber: true }
        });

        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });
        if (parcela.status === 'PAGO') return res.status(400).json({ error: 'Parcela já está paga. Estorne antes de lançar um novo pagamento.' });
        if (parcela.status === 'CANCELADO') return res.status(400).json({ error: 'Parcela cancelada.' });

        const recebido = Math.max(0, Number(valorRecebidoFinal) || 0);
        const desconto = Math.max(0, Number(valorDesconto) || 0);

        if (recebido <= 0 && desconto <= 0) {
            return res.status(400).json({ error: 'Informe um valor recebido ou um desconto.' });
        }
        if (desconto > 0 && !perms.admin && !perms.Pode_Dar_Desconto_Baixa) {
            return res.status(403).json({ error: 'Sem permissão para dar desconto na baixa.' });
        }
        if (desconto > 0 && !motivoDesconto?.trim()) {
            return res.status(400).json({ error: 'Informe o motivo do desconto.' });
        }

        const saldoRestante = Number(parcela.valor) - Number(parcela.valorPago || 0) - Number(parcela.valorDescontoTotal || 0);
        if (recebido + desconto > saldoRestante + 0.01) {
            return res.status(400).json({ error: `Valor informado (R$ ${(recebido + desconto).toFixed(2)}) é maior que o saldo restante (R$ ${saldoRestante.toFixed(2)}).` });
        }

        // Dinheiro entrando aqui: só espécie, e vai para o caixa de HOJE de quem baixou —
        // é o que obriga a pessoa a entregar o valor no fechamento. Desconto puro
        // (sem dinheiro) não passa por caixa: não há o que prestar.
        let caixaDiarioId = null;
        let contaFinanceiraFinal = contaFinanceiraCaId || null;
        if (recebido > 0) {
            const erroForma = validarFormaManual(formaPagamento);
            if (erroForma) return res.status(400).json({ error: erroForma });
            try {
                caixaDiarioId = await caixaDeHojeParaBaixa(req.user.id);
            } catch (e) {
                return res.status(e.status || 500).json({ error: e.message });
            }
            if (!contaFinanceiraFinal) contaFinanceiraFinal = await contaEspeciePadrao();
        }

        const dataPgto = dataPagamento ? new Date(dataPagamento) : new Date();
        const novoValorPago = Number(parcela.valorPago || 0) + recebido;
        const novoValorDescontoTotal = Number(parcela.valorDescontoTotal || 0) + desconto;
        const novoStatusParcela = calcularStatusParcela(parcela.valor, novoValorPago, novoValorDescontoTotal);

        let novoStatusConta;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcela.create({
                data: {
                    parcelaId,
                    valorRecebido: recebido,
                    valorDesconto: desconto,
                    motivoDesconto: desconto > 0 ? motivoDesconto.trim() : null,
                    formaPagamento: formaPagamento || null,
                    contaFinanceiraCaId: contaFinanceiraFinal,
                    dataPagamento: dataPgto,
                    observacao: observacao || null,
                    origem: 'MANUAL',
                    caixaDiarioId,
                    registradoPorId: req.user.id
                }
            });

            await tx.parcela.update({
                where: { id: parcelaId },
                data: {
                    status: novoStatusParcela,
                    valorPago: novoValorPago,
                    valorDescontoTotal: novoValorDescontoTotal,
                    formaPagamento: formaPagamento || parcela.formaPagamento,
                    contaFinanceiraCaId: contaFinanceiraFinal || parcela.contaFinanceiraCaId,
                    dataPagamento: novoStatusParcela === 'PAGO' ? dataPgto : parcela.dataPagamento,
                    baixadoPorId: req.user.id,
                    observacao: observacao || parcela.observacao
                }
            });

            const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
            const parcelasAtualizadas = todasParcelas.map(p => p.id === parcelaId ? { ...p, status: novoStatusParcela } : p);
            novoStatusConta = calcularStatusConta(parcelasAtualizadas);

            await tx.contaReceber.update({
                where: { id: parcela.contaReceberId },
                data: { status: novoStatusConta }
            });
        }, { timeout: 20000, maxWait: 10000 });

        // Log de auditoria no histórico do cliente — fora da transação para não
        // derrubar a baixa se estiver lento (a baixa em si já foi efetivada).
        try {
            const conta = parcela.contaReceber;
            const partes = [];
            if (recebido > 0) partes.push(`recebido R$ ${recebido.toFixed(2)}${formaPagamento ? ` (${formaPagamento})` : ''}`);
            if (desconto > 0) partes.push(`desconto R$ ${desconto.toFixed(2)} (${motivoDesconto.trim()})`);
            await prisma.atendimento.create({
                data: {
                    tipo: 'FINANCEIRO',
                    observacao: `Baixa parcela ${parcela.numeroParcela} - ${partes.join(' + ')} - status: ${novoStatusParcela}${observacao ? ` | ${observacao}` : ''}`,
                    clienteId: conta.clienteId,
                    idVendedor: req.user.id,
                    pedidoId: conta.pedidoId || null
                }
            });
        } catch (logErr) {
            console.error('Falha ao registrar histórico da baixa (baixa já efetivada):', logErr);
        }

        // Parcela quitada na mão → cancela boleto/PIX Asaas pendente dela (senão o
        // cliente ainda pode pagar o boleto antigo = pagamento em dobro). Melhor
        // esforço, fora da resposta: falha aqui nunca desfaz a baixa.
        if (novoStatusParcela === 'PAGO') {
            const asaasService = require('../services/asaasService');
            asaasService.cancelarCobrancasDaParcela(parcelaId, 'baixa manual no app')
                .catch(e => console.error('[Baixa] Falha ao cancelar cobrança Asaas (baixa já efetivada):', e.message));
        }

        res.json({
            message: novoStatusParcela === 'PAGO' ? 'Parcela quitada com sucesso!' : 'Baixa parcial registrada com sucesso!',
            novoStatusParcela,
            novoStatusConta,
            saldoRestante: Math.max(0, Number(parcela.valor) - novoValorPago - novoValorDescontoTotal),
            // Avisa a tela de que o valor caiu no caixa de quem baixou (vira "a prestar")
            lancadoNoCaixa: caixaDiarioId ? { valor: recebido, forma: formaPagamento } : null
        });
    } catch (error) {
        console.error('Erro ao dar baixa:', error);
        res.status(500).json({ error: 'Erro ao dar baixa na parcela.' });
    }
});

// ── DELETE /:parcelaId/pagamentos/:pagamentoId — Estornar um pagamento específico do histórico ──
router.delete('/:parcelaId/pagamentos/:pagamentoId', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaId, pagamentoId } = req.params;

        const pagamento = await prisma.pagamentoParcela.findUnique({ where: { id: pagamentoId } });
        if (!pagamento || pagamento.parcelaId !== parcelaId) return res.status(404).json({ error: 'Pagamento não encontrado.' });
        if (pagamento.estornado) return res.status(400).json({ error: 'Este pagamento já foi estornado.' });

        const parcela = await prisma.parcela.findUnique({ where: { id: parcelaId }, include: { contaReceber: true } });
        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });

        let novoStatusConta;
        let novoValorPago, novoValorDescontoTotal, novoStatusParcela;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcela.update({
                where: { id: pagamentoId },
                data: { estornado: true, estornadoEm: new Date(), estornadoPorId: req.user.id }
            });

            const restantes = await tx.pagamentoParcela.findMany({ where: { parcelaId, estornado: false } });
            novoValorPago = restantes.reduce((s, p) => s + Number(p.valorRecebido), 0);
            novoValorDescontoTotal = restantes.reduce((s, p) => s + Number(p.valorDesconto), 0);
            novoStatusParcela = calcularStatusParcela(parcela.valor, novoValorPago, novoValorDescontoTotal);

            await tx.parcela.update({
                where: { id: parcelaId },
                data: {
                    status: novoStatusParcela,
                    valorPago: novoValorPago,
                    valorDescontoTotal: novoValorDescontoTotal,
                    dataPagamento: novoStatusParcela === 'PAGO' ? parcela.dataPagamento : null
                }
            });

            const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
            const parcelasAtualizadas = todasParcelas.map(p => p.id === parcelaId ? { ...p, status: novoStatusParcela } : p);
            novoStatusConta = calcularStatusConta(parcelasAtualizadas);

            await tx.contaReceber.update({ where: { id: parcela.contaReceberId }, data: { status: novoStatusConta } });
        }, { timeout: 20000, maxWait: 10000 });

        // Conciliação bancária presa nesta baixa volta para pendente (estorno já efetivado).
        try {
            await require('../services/conciliacaoBancariaService').desconciliarPorBaixa({ pagamentoParcelaId: pagamentoId });
        } catch (e) {
            console.error('Falha ao desconciliar extrato após estorno (estorno já efetivado):', e);
        }

        res.json({ message: 'Pagamento estornado com sucesso!', novoStatusParcela, novoStatusConta });
    } catch (error) {
        console.error('Erro ao estornar pagamento:', error);
        res.status(500).json({ error: 'Erro ao estornar pagamento.' });
    }
});

// ── DELETE /:parcelaId/baixa — Estornar TODOS os pagamentos da parcela (desfaz baixa total ou parcial) ──
router.delete('/:parcelaId/baixa', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaId } = req.params;

        const parcela = await prisma.parcela.findUnique({
            where: { id: parcelaId },
            include: { contaReceber: true }
        });

        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });
        if (parcela.status !== 'PAGO' && parcela.status !== 'PARCIAL') {
            return res.status(400).json({ error: 'Parcela não tem baixa para estornar.' });
        }

        // Ids ANTES do estorno em lote — para soltar a conciliação bancária depois
        const idsEstornar = (await prisma.pagamentoParcela.findMany({
            where: { parcelaId, estornado: false }, select: { id: true }
        })).map(p => p.id);

        let novoStatusConta;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcela.updateMany({
                where: { parcelaId, estornado: false },
                data: { estornado: true, estornadoEm: new Date(), estornadoPorId: req.user.id }
            });

            await tx.parcela.update({
                where: { id: parcelaId },
                data: {
                    status: 'PENDENTE',
                    valorPago: null,
                    valorDescontoTotal: 0,
                    formaPagamento: null,
                    dataPagamento: null,
                    baixadoPorId: null,
                    observacao: null
                }
            });

            const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
            const parcelasAtualizadas = todasParcelas.map(p => p.id === parcelaId ? { ...p, status: 'PENDENTE' } : p);
            novoStatusConta = calcularStatusConta(parcelasAtualizadas);

            await tx.contaReceber.update({ where: { id: parcela.contaReceberId }, data: { status: novoStatusConta } });
        }, { timeout: 20000, maxWait: 10000 });

        // Conciliação bancária presa nestas baixas volta para pendente (estorno já efetivado).
        for (const pid of idsEstornar) {
            try {
                await require('../services/conciliacaoBancariaService').desconciliarPorBaixa({ pagamentoParcelaId: pid });
            } catch (e) {
                console.error('Falha ao desconciliar extrato após estorno (estorno já efetivado):', e);
            }
        }

        res.json({ message: 'Baixa estornada com sucesso!', novoStatus: novoStatusConta });
    } catch (error) {
        console.error('Erro ao estornar baixa:', error);
        res.status(500).json({ error: 'Erro ao estornar baixa.' });
    }
});

// ── PATCH /:id/cancelar — Cancelar conta ──
router.patch('/:id/cancelar', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id },
            include: { pedido: { select: { embarqueId: true, statusEntrega: true } } }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status === 'QUITADO') return res.status(400).json({ error: 'Conta já quitada, não pode cancelar.' });

        // Trava: não pode cancelar se o pedido está em uma carga (embarque)
        if (conta.pedido?.embarqueId) {
            return res.status(400).json({
                error: 'Este pedido está em uma carga. Remova da carga primeiro ou aguarde a quitação/devolução pela carga.'
            });
        }

        await prisma.$transaction([
            prisma.parcela.updateMany({
                where: { contaReceberId: conta.id, status: { not: 'PAGO' } },
                data: { status: 'CANCELADO' }
            }),
            prisma.contaReceber.update({
                where: { id: conta.id },
                data: { status: 'CANCELADO' }
            })
        ]);

        res.json({ message: 'Conta cancelada com sucesso!' });
    } catch (error) {
        console.error('Erro ao cancelar conta:', error);
        res.status(500).json({ error: 'Erro ao cancelar conta.' });
    }
});

// ── PATCH /:id/reverter-cancelamento — Reverter cancelamento de conta ──
router.patch('/:id/reverter-cancelamento', verificarAuth, async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        req._perms = perms;
        if (!perms.admin && !perms.Pode_Reverter_Cancelamento_CR) {
            return res.status(403).json({ error: 'Sem permissão para reverter cancelamento.' });
        }

        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id },
            include: { parcelas: true }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status !== 'CANCELADO') return res.status(400).json({ error: 'Conta não está cancelada.' });

        // Reverter parcelas canceladas para PENDENTE
        const parcelasCanceladas = conta.parcelas.filter(p => p.status === 'CANCELADO');
        const parcelasPagas = conta.parcelas.filter(p => p.status === 'PAGO');

        await prisma.$transaction([
            prisma.parcela.updateMany({
                where: { contaReceberId: conta.id, status: 'CANCELADO' },
                data: { status: 'PENDENTE' }
            }),
            prisma.contaReceber.update({
                where: { id: conta.id },
                data: { status: parcelasPagas.length > 0 ? 'PARCIAL' : 'ABERTO' }
            }),
            prisma.auditLog.create({
                data: {
                    acao: 'REVERTER_CANCELAMENTO',
                    entidade: 'ContaReceber',
                    entidadeId: conta.id,
                    detalhes: `Cancelamento revertido por ${req.user.nome || req.user.login}. ${parcelasCanceladas.length} parcela(s) voltaram para PENDENTE.`,
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || req.user.login || '-'
                }
            })
        ]);

        res.json({ message: 'Cancelamento revertido! Parcelas voltaram para PENDENTE.' });
    } catch (error) {
        console.error('Erro ao reverter cancelamento:', error);
        res.status(500).json({ error: 'Erro ao reverter cancelamento.' });
    }
});

// ── PUT /:id/reverter-quitacao — Estornar todas as parcelas pagas (reverter quitação) ──
router.put('/:id/reverter-quitacao', verificarAuth, async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        req._perms = perms;
        if (!perms.admin && !perms.Pode_Reverter_Especial) {
            return res.status(403).json({ error: 'Sem permissão para estornar quitação.' });
        }

        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id },
            include: { parcelas: true }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status !== 'QUITADO' && conta.status !== 'PARCIAL') {
            return res.status(400).json({ error: 'Conta não está quitada nem parcialmente paga.' });
        }

        // Estorno em CASCATA: reabrir a parcela sem estornar o ledger deixaria linha de
        // pagamento viva num título aberto (dinheiro contado duas vezes no realizado e na
        // conciliação). Desde que a baixa do especial passou a gerar ledger, este caminho
        // precisa desfazer as duas pontas — parcela E pagamentos_parcela.
        const idsEstornar = (await prisma.pagamentoParcela.findMany({
            where: { parcela: { contaReceberId: conta.id }, estornado: false },
            select: { id: true }
        })).map(p => p.id);

        await prisma.$transaction(async (tx) => {
            if (idsEstornar.length > 0) {
                await tx.pagamentoParcela.updateMany({
                    where: { id: { in: idsEstornar } },
                    data: { estornado: true, estornadoEm: new Date(), estornadoPorId: req.user.id }
                });
            }
            // PARCIAL também volta (senão sobra parcela paga pela metade sem lastro)
            await tx.parcela.updateMany({
                where: { contaReceberId: conta.id, status: { in: ['PAGO', 'PARCIAL'] } },
                data: {
                    status: 'PENDENTE',
                    valorPago: null,
                    valorDescontoTotal: 0,
                    formaPagamento: null,
                    dataPagamento: null,
                    baixadoPorId: null,
                    observacao: null
                }
            });
            await tx.contaReceber.update({ where: { id: conta.id }, data: { status: 'ABERTO' } });
        }, { timeout: 20000, maxWait: 10000 });

        // Conciliação bancária presa nestas baixas volta para pendente (estorno já efetivado)
        for (const pid of idsEstornar) {
            try {
                await require('../services/conciliacaoBancariaService').desconciliarPorBaixa({ pagamentoParcelaId: pid });
            } catch (e) {
                console.error('Falha ao desconciliar extrato após reverter quitação (estorno já efetivado):', e.message);
            }
        }

        // Auditoria
        await prisma.auditLog.create({
            data: {
                acao: 'REVERTER_QUITACAO',
                entidade: 'ContaReceber',
                entidadeId: conta.id,
                detalhes: `Quitação revertida por ${req.user.nome || req.user.login}. ${conta.parcelas.filter(p => p.status === 'PAGO').length} parcela(s) estornada(s).`,
                usuarioId: req.user.id,
                usuarioNome: req.user.nome || req.user.login || '-'
            }
        });

        res.json({ message: 'Quitação revertida com sucesso! Todas as parcelas voltaram para PENDENTE.' });
    } catch (error) {
        console.error('Erro ao reverter quitação:', error);
        res.status(500).json({ error: 'Erro ao reverter quitação.' });
    }
});

// ── ADMIN: Sincronizar contas a receber com pedidos (criar contas faltantes) ──
router.post('/admin/sincronizar', verificarAuth, async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin) {
            return res.status(403).json({ error: 'Apenas admin pode sincronizar contas.' });
        }

        // Buscar todos os pedidos enviados que NÃO têm conta a receber
        const pedidosSemConta = await prisma.pedido.findMany({
            where: {
                statusEnvio: 'ENVIAR',
                contaReceber: null
            },
            include: {
                itens: true
            }
        });

        let criadas = 0;
        for (const pedido of pedidosSemConta) {
            // Calcular valor total do pedido
            const valorTotal = pedido.itens.reduce((sum, item) => {
                return sum + (Number(item.valor) * Number(item.quantidade));
            }, 0);

            // Calcular parcelas
            const numParcelas = pedido.qtdParcelas || 1;
            const intervalo = pedido.intervaloDias || 0;
            const baseDate = pedido.primeiroVencimento || pedido.dataVenda;
            const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;

            const parcelasData = [];
            for (let i = 0; i < numParcelas; i++) {
                const vencimento = new Date(baseDate);
                vencimento.setDate(vencimento.getDate() + (i * intervalo));
                const val = i === numParcelas - 1
                    ? Math.round((valorTotal - valorParcela * (numParcelas - 1)) * 100) / 100
                    : valorParcela;
                parcelasData.push({
                    numeroParcela: i + 1,
                    valor: val,
                    dataVencimento: vencimento
                });
            }

            // Criar conta a receber
            await prisma.contaReceber.create({
                data: {
                    pedidoId: pedido.id,
                    clienteId: pedido.clienteId,
                    origem: pedido.especial ? 'ESPECIAL' : 'FATURADO_CA',
                    valorTotal: Math.round(valorTotal * 100) / 100,
                    status: 'ABERTO',
                    parcelas: { create: parcelasData }
                }
            });
            criadas++;
        }

        res.json({
            message: `${criadas} contas a receber criadas com sucesso!`,
            criadasCount: criadas,
            totalPedidos: pedidosSemConta.length
        });
    } catch (error) {
        console.error('Erro ao sincronizar contas a receber:', error);
        res.status(500).json({ error: 'Erro ao sincronizar contas a receber.' });
    }
});

// ── POST /:id/sync-ca — Sincroniza baixas do Conta Azul para uma conta local ──
router.post('/:id/sync-ca', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const r = await contasReceberSyncService.sincronizarConta(req.params.id, {
            baixadoPorId: req.user.id,
            origem: 'MANUAL'
        });
        const partes = [];
        if (r.aplicadas > 0) partes.push(`${r.aplicadas} parcela(s) baixada(s)`);
        if (r.vencimentosAtualizados > 0) partes.push(`${r.vencimentosAtualizados} vencimento(s) atualizado(s)`);
        res.json({
            message: partes.length > 0 ? partes.join(' + ') + '.' : (r.mensagem || 'Nenhuma alteração necessária.'),
            ...r
        });
    } catch (error) {
        console.error('Erro ao sincronizar com CA:', error?.response?.data || error);
        res.status(400).json({ error: error.message || 'Erro ao sincronizar com Conta Azul.', detalhe: error?.response?.data });
    }
});

// ── POST /sync-ca/todas — Sincroniza todas as contas abertas (admin) ──
router.post('/sync-ca/todas', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const r = await contasReceberSyncService.sincronizarTodasAbertas();
        res.json({ message: `Sync concluído: ${r.totalParcelasBaixadas} parcela(s) baixadas em ${r.totalContasAtualizadas} conta(s).`, ...r });
    } catch (error) {
        console.error('Erro ao sincronizar todas com CA:', error);
        res.status(500).json({ error: 'Erro ao sincronizar com Conta Azul.' });
    }
});

module.exports = router;
