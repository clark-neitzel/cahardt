/**
 * INADIMPLÊNCIA — FONTE ÚNICA (selo "em atraso" / "a confirmar", bloqueio de venda,
 * painel de cobrança, dashboards, aging, API da IA).
 *
 * POR QUE EXISTE: até 10/2026 cada tela tinha a sua conta e todas escondiam o cliente
 * que "pagou na entrega, esperando o Caixa" (`contasAguardandoConferencia`). Só que
 * boleto apontado na entrega também contava como dinheiro recebido — e o cliente com
 * boleto vencido sumia de TODAS as telas. Agora a classificação é por FORMA de
 * pagamento e por PRAZO (nada fica escondido para sempre):
 *
 *   DEVE         conta cobrável — parcelas vencidas contam como atraso (selo vermelho).
 *   EM_ESPERA    dinheiro / Pix / cartão / Pix Asaas apontado cobrindo o saldo, ainda
 *                dentro do prazo — o Caixa/Conciliação ainda vai confirmar. Não é devedor.
 *   A_CONFIRMAR  o mesmo, mas passou do prazo (`prazoAConfirmarDias`) — selo amarelo:
 *                "apontado e nunca confirmado". Não bloqueia venda, mas aparece.
 *   FORA         compra de funcionário (se `funcionarioFora`), especial ainda não entregue.
 *
 * Boleto, prazo ("7/14 dias"), formas desconhecidas e "responsável" NUNCA escondem a dívida.
 *
 * Regras de código (CLAUDE.md): tudo aqui é LEITURA (sem $transaction); filtros de null
 * sempre com OR explícito (NUNCA `NOT`/`notIn` em campo que pode ser null).
 *
 * Funções:
 *   classificarFormaApontada(nome)        -> 'DINHEIRO'|'PIX'|'CARTAO'|'PIX_ASAAS'|'BOLETO'|'PRAZO'|
 *                                            'FUNCIONARIO'|'RESPONSAVEL'|'BONIFICACAO'|'OUTRA'
 *   classificarConta(conta, cfg, hojeSP)  -> PURA (sem banco)
 *   situacaoPorClientes(ids, opts)        -> Map<clienteId, Situacao>
 *   detalheCliente(id, opts)              -> Situacao + contas[] (ficha do cliente)
 *   idsContasForaDaInadimplencia(opts)    -> Set<contaId> (EM_ESPERA + A_CONFIRMAR + FORA)
 *   clienteIdsEmAtraso({somenteBloqueio}) -> string[]
 *   exigirResponsavel(opts)               -> { bloqueado, ... }
 */
const prisma = require('../config/database');
const cfgInad = require('../config/inadimplenciaConfig');
const { ehRecebimentoProprio } = require('./recebimentoEntregaService');

const TOLERANCIA = 1.0; // R$ — saldo de até 1 real não é dívida ("devendo R$ 0,10")
const DIA_MS = 24 * 60 * 60 * 1000;
const STATUS_ABERTO_PARCELA = ['PENDENTE', 'PARCIAL', 'VENCIDO'];
const ENTREGUE = ['ENTREGUE', 'ENTREGUE_PARCIAL'];
const FORMAS_DA_ESPERA = ['DINHEIRO', 'PIX', 'CARTAO', 'PIX_ASAAS'];

const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const num = (v) => Number(v || 0);

const normalizar = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();

const hojeSPStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dataSP = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : null);
// Data de calendário (yyyy-mm-dd) do vencimento. O banco guarda 12:00Z (ou 15:00Z; legado 00:00Z):
// a parte UTC da data é sempre o dia certo (o fuso SP jogaria o legado 00:00Z para o dia anterior).
const dataVenc = (d) => new Date(d).toISOString().slice(0, 10);
const diasEntreISO = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA_MS);

// ── Classificação da forma apontada (lista fechada por NOME, ponto único) ─────────────
/**
 * Nomes reais em produção (14/10/2026): "À vista - Dinheiro", "7 dias - Boleto", "À vista - Pix",
 * "14 dias - Boleto", "Escritório responsável", "Bonificação", "PIX Asaas", "À vista - Funcionário",
 * "7/14 dias", "28 dias - Boleto", "21 dias - Boleto", "Vendedor responsável",
 * "PIX Asaas (ESTORNADO)", "Cartão - Crédito".
 * Nome desconhecido => 'OUTRA' => NÃO esconde a dívida (falha para o lado seguro).
 */
function classificarFormaApontada(nome) {
    const n = normalizar(nome);
    if (!n) return 'OUTRA';
    // Boleto PRIMEIRO: "Boleto - Pix" (boleto com Pix embutido) é boleto, nunca dinheiro na mão.
    if (n.includes('boleto')) return 'BOLETO';
    if (n.includes('dinheiro') || n.includes('especie')) return 'DINHEIRO';
    if (n.includes('pix asaas')) return n.includes('estornado') ? 'OUTRA' : 'PIX_ASAAS';
    if (n.includes('pix')) return 'PIX';
    if (/cart[aã]o/.test(n)) return 'CARTAO';
    if (n.includes('funcion')) return 'FUNCIONARIO';
    if (n.includes('respons')) return 'RESPONSAVEL';
    if (n.includes('bonifica')) return 'BONIFICACAO';
    if (/\d+\s*dias|\d+\/\d+/.test(n)) return 'PRAZO';
    return 'OUTRA';
}

const ROTULO_FORMA = { DINHEIRO: 'Dinheiro', PIX: 'Pix', PIX_ASAAS: 'Pix', CARTAO: 'Cartão' };

/** Classe efetiva de uma linha de pagamento (considera a cobrança Asaas quando houver). */
function classeDaLinha(pg) {
    // Linha ligada a uma cobrança Asaas: só vale se a cobrança foi RECEBIDA (estornada/
    // cancelada = o dinheiro voltou ao cliente, mesma regra do caixa.js).
    if (pg.cobrancaAsaasId) return pg.asaasRecebido ? 'PIX_ASAAS' : 'OUTRA';
    const c = classificarFormaApontada(pg.formaPagamentoNome);
    // "PIX Asaas" sem vínculo com cobrança não prova nada: trata como Pix comum (a confirmar).
    return c === 'PIX_ASAAS' ? 'PIX' : c;
}

const saldoParcela = (p) => num(p.valor) - num(p.valorPago) - num(p.valorDescontoTotal);

// ── Classificação de UMA conta (PURA — testável sem banco) ──────────────────────────
/**
 * @param conta { id, clienteId?, parcelas:[{id?,numeroParcela?,valor,valorPago,valorDescontoTotal,status,dataVencimento}],
 *                pedido?: { especial, statusEntrega, dataEntrega, nomeCondicaoPagamento,
 *                           pagamentosReais:[{valor,formaPagamentoNome,cobrancaAsaasId,asaasRecebido,createdAt,
 *                                             responsavelPapel,escritorioResponsavel,vendedorResponsavelId}] } }
 * @param cfg   config (inadimplenciaConfig)
 * @param hojeSP 'YYYY-MM-DD' (hoje em São Paulo)
 * @returns { destino, motivo, saldoAberto, vencidas:[{parcelaId,numeroParcela,saldo,diasAtraso,dataVencimento}],
 *            aConfirmar:{valor,dias,forma}|null, forma, elegivel }
 */
function classificarConta(conta, cfg, hojeSP) {
    const abertas = (conta.parcelas || []).filter((p) => STATUS_ABERTO_PARCELA.includes(p.status));
    const saldoAberto = round2(abertas.reduce((s, p) => s + saldoParcela(p), 0));
    // Comparação por DATA DE CALENDÁRIO (não por hora): vencida ontem = 1 dia de atraso.
    let vencidas = abertas
        .filter((p) => dataVenc(p.dataVencimento) < hojeSP && saldoParcela(p) > TOLERANCIA)
        .map((p) => ({
            parcelaId: p.id || null,
            numeroParcela: p.numeroParcela ?? null,
            saldo: round2(saldoParcela(p)),
            diasAtraso: diasEntreISO(hojeSP, dataVenc(p.dataVencimento)),
            dataVencimento: p.dataVencimento,
        }));
    // Tolerância também pela SOMA da conta: 3 parcelas de R$ 0,90 não viram selo.
    if (round2(vencidas.reduce((t, v) => t + v.saldo, 0)) <= TOLERANCIA) vencidas = [];
    const saida = (destino, motivo = null, extra = {}) => ({
        destino, motivo, saldoAberto, vencidas, aConfirmar: null, forma: null, elegivel: 0, ...extra,
    });

    const pedido = conta.pedido;
    // 1. Conta sem pedido (importada/avulsa): segue direto — é dívida.
    if (!pedido) return saida('DEVE');

    const pagamentos = pedido.pagamentosReais || [];

    // 2. Compra de funcionário (nome da condição OU da forma apontada).
    if (cfg.funcionarioFora) {
        const ehFunc = normalizar(pedido.nomeCondicaoPagamento).includes('funcion')
            || pagamentos.some((pg) => normalizar(pg.formaPagamentoNome).includes('funcion'));
        if (ehFunc) return saida('FORA', 'FUNCIONARIO');
    }

    // 3. Especial só vira dívida depois de entregue.
    if (pedido.especial && !ENTREGUE.includes(pedido.statusEntrega)) return saida('FORA', 'ESPECIAL_NAO_ENTREGUE');

    // 4. Espera: dinheiro de verdade apontado na entrega cobrindo o saldo inteiro.
    if (ENTREGUE.includes(pedido.statusEntrega) && saldoAberto > TOLERANCIA) {
        const porClasse = {};
        let elegivel = 0;
        let apontadoEm = null;
        for (const pg of pagamentos) {
            if (!(num(pg.valor) > 0) || !ehRecebimentoProprio(pg)) continue;
            const classe = classeDaLinha(pg);
            if (!FORMAS_DA_ESPERA.includes(classe)) continue; // boleto/prazo/outra/responsável: nunca escondem
            elegivel += num(pg.valor);
            porClasse[classe] = (porClasse[classe] || 0) + num(pg.valor);
            const quando = dataSP(pg.createdAt);
            // o MAIS ANTIGO: uma linha nova lançada hoje não pode zerar o prazo
            if (quando && (!apontadoEm || quando < apontadoEm)) apontadoEm = quando;
        }
        elegivel = round2(elegivel);
        // Só sai da cobrança quem pagou o saldo INTEIRO. Pagou parte? o resto é dívida real.
        if (elegivel > 0 && elegivel >= saldoAberto - TOLERANCIA) {
            // classe predominante por valor (Pix e Pix Asaas contam juntos no rótulo)
            const porRotulo = {};
            for (const [c, v] of Object.entries(porClasse)) porRotulo[ROTULO_FORMA[c]] = (porRotulo[ROTULO_FORMA[c]] || 0) + v;
            const forma = Object.entries(porRotulo).sort((a, b) => b[1] - a[1])[0][0];
            // Idade: a entrega primeiro (o createdAt da linha pode mudar se a entrega for editada).
            const referencia = dataSP(pedido.dataEntrega) || apontadoEm;
            const dias = referencia ? Math.max(0, diasEntreISO(hojeSP, referencia)) : null;
            // Só vira "a confirmar" se de fato há atraso a esconder; sem parcela vencida é só espera.
            if (dias != null && dias > cfg.prazoAConfirmarDias && vencidas.length > 0) {
                return saida('A_CONFIRMAR', null, {
                    forma, elegivel,
                    aConfirmar: { valor: round2(Math.min(saldoAberto, elegivel)), dias, forma },
                });
            }
            return saida('EM_ESPERA', null, { forma, elegivel });
        }
    }

    // 5. Dívida.
    return saida('DEVE');
}

// ── Carga de dados ──────────────────────────────────────────────────────────────────
const SELECT_CONTA = {
    id: true,
    clienteId: true,
    status: true,
    pedidoId: true,
    parcelas: {
        select: {
            id: true, numeroParcela: true, valor: true, valorPago: true, valorDescontoTotal: true,
            status: true, dataVencimento: true,
        },
        orderBy: { numeroParcela: 'asc' },
    },
    pedido: {
        select: {
            numero: true, especial: true, statusEntrega: true, dataEntrega: true, nomeCondicaoPagamento: true,
            pagamentosReais: {
                select: {
                    valor: true, formaPagamentoNome: true, cobrancaAsaasId: true, createdAt: true,
                    responsavelPapel: true, escritorioResponsavel: true, vendedorResponsavelId: true,
                },
            },
        },
    },
};

/**
 * Contas ABERTO/PARCIAL de cobrança válida. Sempre OR explícito para o null de situacaoCA
 * (NUNCA `NOT`: pedido faturado no app nasce com situacaoCA null e some).
 */
async function carregarContas({ clienteIds = null, contaIds = null, ignorarPedidoId = null, soComAtrasoOuEntregue = true } = {}) {
    const hoje = new Date(`${hojeSPStr()}T00:00:00.000Z`);
    const and = [
        {
            OR: [
                { pedidoId: null },
                {
                    pedido: {
                        statusEnvio: { not: 'EXCLUIDO' },
                        OR: [{ situacaoCA: null }, { situacaoCA: { not: 'CANCELADO' } }],
                    },
                },
            ],
        },
    ];
    if (soComAtrasoOuEntregue) {
        // Só contas que podem pesar: com parcela vencida, ou entregues (candidatas à espera).
        and.push({
            OR: [
                { parcelas: { some: { status: { in: STATUS_ABERTO_PARCELA }, dataVencimento: { lt: hoje } } } },
                { pedido: { statusEntrega: { in: ENTREGUE } } },
            ],
        });
    }
    if (ignorarPedidoId) {
        and.push({ OR: [{ pedidoId: null }, { pedidoId: { not: ignorarPedidoId } }] });
    }
    const where = {
        status: { in: ['ABERTO', 'PARCIAL'] },
        ...(clienteIds ? { clienteId: { in: clienteIds } } : {}),
        ...(contaIds ? { id: { in: contaIds } } : {}),
        AND: and,
    };
    const contas = await prisma.contaReceber.findMany({ where, select: SELECT_CONTA });

    // Status da cobrança Asaas (uma consulta só): Pix Asaas estornado não é dinheiro recebido.
    const idsAsaas = new Set();
    for (const c of contas) for (const pg of c.pedido?.pagamentosReais || []) if (pg.cobrancaAsaasId) idsAsaas.add(pg.cobrancaAsaasId);
    const recebidas = new Set();
    if (idsAsaas.size) {
        const cobs = await prisma.cobrancaAsaas.findMany({ where: { id: { in: [...idsAsaas] } }, select: { id: true, status: true } });
        for (const cb of cobs) if (cb.status === 'RECEBIDO') recebidas.add(cb.id);
    }
    for (const c of contas) for (const pg of c.pedido?.pagamentosReais || []) pg.asaasRecebido = recebidas.has(pg.cobrancaAsaasId);
    return contas;
}

// ── Situação por cliente ────────────────────────────────────────────────────────────
function situacaoVazia() {
    return { inadimplente: false, totalVencido: 0, parcelasVencidas: 0, diasMaisAntiga: null, aConfirmar: null, bloqueiaVenda: false };
}

function agregar(classificadas, cfg) {
    const s = situacaoVazia();
    let saldoAposCarencia = 0;
    const aConf = { valor: 0, dias: 0, parcelas: 0, formas: {} };
    for (const { r } of classificadas) {
        if (r.destino === 'DEVE') {
            for (const p of r.vencidas) {
                s.totalVencido += p.saldo;
                s.parcelasVencidas += 1;
                if (s.diasMaisAntiga == null || p.diasAtraso > s.diasMaisAntiga) s.diasMaisAntiga = p.diasAtraso;
                if (p.diasAtraso >= cfg.carenciaDias) saldoAposCarencia += p.saldo;
            }
        } else if (r.destino === 'A_CONFIRMAR' && r.aConfirmar) {
            aConf.valor += r.aConfirmar.valor;
            aConf.dias = Math.max(aConf.dias, r.aConfirmar.dias);
            aConf.parcelas += r.vencidas.length;
            aConf.formas[r.aConfirmar.forma] = (aConf.formas[r.aConfirmar.forma] || 0) + r.aConfirmar.valor;
        }
    }
    s.totalVencido = round2(s.totalVencido);
    s.inadimplente = s.totalVencido > TOLERANCIA;
    s.bloqueiaVenda = s.inadimplente && round2(saldoAposCarencia) >= cfg.valorMinimoBloqueio;
    if (aConf.valor > 0) {
        const forma = Object.entries(aConf.formas).sort((a, b) => b[1] - a[1])[0][0];
        s.aConfirmar = { valor: round2(aConf.valor), dias: aConf.dias, forma, parcelas: aConf.parcelas };
    }
    return s;
}

/**
 * @returns Map<clienteId, Situacao> — todo id pedido aparece no mapa (cliente em dia = situação vazia).
 */
async function situacaoPorClientes(clienteIds, { ignorarPedidoId = null, fresh = false } = {}) {
    const ids = [...new Set((clienteIds || []).filter(Boolean))];
    const mapa = new Map(ids.map((id) => [id, situacaoVazia()]));
    if (!ids.length) return mapa;
    const cfg = await cfgInad.get({ fresh });
    const hojeSP = hojeSPStr();
    const contas = await carregarContas({ clienteIds: ids, ignorarPedidoId });
    const porCliente = new Map();
    for (const c of contas) {
        if (!porCliente.has(c.clienteId)) porCliente.set(c.clienteId, []);
        porCliente.get(c.clienteId).push({ conta: c, r: classificarConta(c, cfg, hojeSP) });
    }
    for (const [cid, lista] of porCliente) mapa.set(cid, agregar(lista, cfg));
    return mapa;
}

const rotuloSituacaoConta = (r) => {
    if (r.destino === 'DEVE') return r.vencidas.length ? 'EM_ATRASO' : 'EM_DIA';
    return r.destino; // A_CONFIRMAR | EM_ESPERA | FORA
};

/** Situação + contas classificadas (ficha / popup / diag). */
async function detalheCliente(clienteId, { ignorarPedidoId = null, fresh = false } = {}) {
    const cfg = await cfgInad.get({ fresh });
    const hojeSP = hojeSPStr();
    // Para a ficha carregamos TODAS as contas abertas (inclusive em dia), não só as que pesam.
    const contas = await carregarContas({ clienteIds: [clienteId], ignorarPedidoId, soComAtrasoOuEntregue: false });
    const classificadas = contas.map((conta) => ({ conta, r: classificarConta(conta, cfg, hojeSP) }));
    return { ...agregar(classificadas, cfg), cfg, classificadas };
}

// ── Set de contas fora da inadimplência (substitui idsContasEmEsperaDeConferencia) ────
const _cacheSet = new Map(); // chave -> { em, set }
const TTL_SET_MS = 60000;

/**
 * Ids das contas que NÃO contam como "em atraso vermelho": EM_ESPERA + A_CONFIRMAR + FORA.
 * Use em `notIn` de agregados (dashboards, aging) e no painel de cobrança.
 *
 * `incluirForaSemAtraso`: para a COBRANÇA (régua e cobrança em rota), onde até o lembrete de parcela
 * a vencer de funcionário/especial não entregue deve ser evitado.
 *
 * Só o caminho GLOBAL (sem clienteIds/contaIds) usa cache de 60 s — hoje a mesma varredura
 * rodava 7 vezes por carregamento de dashboard. Selo e bloqueio nunca passam por aqui com cache.
 */
async function idsContasForaDaInadimplencia({ clienteIds = null, contaIds = null, desdeDias = null, incluirForaSemAtraso = false } = {}) {
    const global = !clienteIds && !contaIds;
    const chave = `d${desdeDias || 0}|${incluirForaSemAtraso ? 1 : 0}`;
    if (global) {
        const hit = _cacheSet.get(chave);
        if (hit && Date.now() - hit.em < TTL_SET_MS) return hit.set;
    }
    const cfg = await cfgInad.get();
    const hojeSP = hojeSPStr();
    const contas = await carregarContas({ clienteIds, contaIds, soComAtrasoOuEntregue: !incluirForaSemAtraso });
    const set = new Set();
    const corte = desdeDias > 0 ? new Date(Date.now() - desdeDias * DIA_MS) : null;
    for (const c of contas) {
        const r = classificarConta(c, cfg, hojeSP);
        if (r.destino === 'DEVE') continue;
        // Recorte `desdeDias` (só leitura/dashboards): vale APENAS para EM_ESPERA, como sempre foi.
        // FORA e A_CONFIRMAR nunca são recortados — senão o dashboard contradiz o selo.
        if (corte && r.destino === 'EM_ESPERA' && c.pedido?.dataEntrega && new Date(c.pedido.dataEntrega) < corte) continue;
        // FORA só importa para quem tem atraso a esconder (mantém "a vencer" de funcionário/especial nos totais)
        if (r.destino === 'FORA' && !r.vencidas.length && !incluirForaSemAtraso) continue;
        set.add(c.id);
    }
    if (global) _cacheSet.set(chave, { em: Date.now(), set });
    return set;
}

/** Clientes com atraso vermelho (filtro "Só clientes em atraso"). Varre tudo; filtro de lista tolera cache. */
async function clienteIdsEmAtraso({ somenteBloqueio = false } = {}) {
    const cfg = await cfgInad.get();
    const hojeSP = hojeSPStr();
    const contas = await carregarContas({});
    const porCliente = new Map();
    for (const c of contas) {
        if (!porCliente.has(c.clienteId)) porCliente.set(c.clienteId, []);
        porCliente.get(c.clienteId).push({ conta: c, r: classificarConta(c, cfg, hojeSP) });
    }
    const ids = [];
    for (const [cid, lista] of porCliente) {
        const s = agregar(lista, cfg);
        if (somenteBloqueio ? s.bloqueiaVenda : s.inadimplente) ids.push(cid);
    }
    return ids;
}

const fmtBRL = (v) => Number(v).toFixed(2).replace('.', ',');

/**
 * Trava de venda/aprovação. SEMPRE lê a config FRESCA (a trava não pode usar cache de 30 s
 * depois de o admin mexer) e NUNCA usa cache de Set.
 *
 * @param permissoes  req.user.permissoes
 * @param ignorarPedidoId  ignora a conta do próprio pedido (aprovar/converter especial: a parcela do
 *                         especial nasce vencida e o pedido se bloquearia sozinho) — usado na Entrega 2
 * @param aVista      true => quem não tem permissão ainda pode lançar à vista, assumindo a responsabilidade
 * @param sincronizar função async opcional chamada se houver atraso, ANTES de decidir (re-lê depois)
 * @returns { bloqueado:false, situacao, obs? } | { bloqueado:true, status:403, codigo, mensagem, totalVencido, diasMaisAntiga, situacao }
 */
async function exigirResponsavel({ clienteId, permissoes = {}, nomeUsuario = 'Vendedor', ignorarPedidoId = null, aVista = false, sincronizar = null, acao = 'venda' }) {
    if (!clienteId) return { bloqueado: false, situacao: situacaoVazia() };
    let sit = (await situacaoPorClientes([clienteId], { ignorarPedidoId, fresh: true })).get(clienteId);
    // Pode ser que o pagamento já esteja no CA mas não baixado aqui: sincroniza antes de bloquear.
    if (sit.inadimplente && typeof sincronizar === 'function') {
        try {
            await sincronizar(clienteId);
            sit = (await situacaoPorClientes([clienteId], { ignorarPedidoId, fresh: true })).get(clienteId);
        } catch (e) {
            console.warn('[Inadimplência] Sincronização falhou, usando dados locais:', e.message);
        }
    }
    if (!sit.bloqueiaVenda) return { bloqueado: false, situacao: sit };

    const valor = fmtBRL(sit.totalVencido);
    if (permissoes.admin || permissoes.Pode_Vender_Inadimplente) {
        const verbo = acao === 'aprovacao' ? 'pela aprovação' : 'pela venda';
        return { bloqueado: false, situacao: sit, obs: `\n[${nomeUsuario} se responsabiliza ${verbo} — cliente com R$ ${valor} em atraso]` };
    }
    if (aVista) {
        return { bloqueado: false, situacao: sit, obs: `\n[${nomeUsuario} responsável — venda à vista para cliente com R$ ${valor} em atraso]` };
    }
    return {
        bloqueado: true,
        status: 403,
        codigo: 'CLIENTE_EM_ATRASO',
        mensagem: 'Este cliente possui contas em aberto. Você não tem permissão para realizar esta venda.',
        totalVencido: sit.totalVencido,
        diasMaisAntiga: sit.diasMaisAntiga,
        situacao: sit,
    };
}

function limparCache() { _cacheSet.clear(); }

module.exports = {
    TOLERANCIA,
    classificarFormaApontada,
    classificarConta,
    situacaoPorClientes,
    detalheCliente,
    idsContasForaDaInadimplencia,
    clienteIdsEmAtraso,
    exigirResponsavel,
    rotuloSituacaoConta,
    limparCache,
    // internos úteis ao diag/testes
    carregarContas,
    agregar,
    situacaoVazia,
    hojeSPStr,
};
