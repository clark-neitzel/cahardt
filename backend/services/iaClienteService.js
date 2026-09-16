// Funções de cliente GERAIS (não específicas de Kit Festa/Congelados) para a API de consulta da
// IA de WhatsApp. Existem porque o bot precisava reconhecer cliente e criar lead para QUALQUER
// conversa, não só pedido de congelados — e por não existir endpoint pra isso, o bot anterior
// rodava SQL direto no banco de produção (ver backend/docs/ia-consulta-api.md, seção de segurança).
const prisma = require('../config/database');
const leadService = require('./leadService');
const { normalizarDoc } = require('../utils/documento');
const { normalizarCidade } = require('../utils/cidade'); // grafia oficial da cidade (Fase 1)
// v1.6.0: objeto único de pedido/produto, fila no histórico, hora de corte.
const iaPedidoService = require('./iaPedidoService');
const iaProduto = require('./iaProdutoSerializer');
const iaConsultaConfig = require('../config/iaConsultaConfig');

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const dec = (v) => (v == null ? 0 : Number(v));
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Listas de contato achatadas — vão na busca/ficha do painel do bot para conferência de vínculo
const listaTelefones = (c) => [c.Telefone, c.Telefone_Celular, c.Telefone_Comercial].map(soDigitos).filter(Boolean);
const listaWhatsapps = (c) => c.whatsapp?.numeros || [];

// Mesma normalização usada em congeladosService.js — mantida como cópia pequena e independente
// aqui de propósito (é só ~5 linhas; acoplar os dois serviços por isso não compensa o risco).
function chaveTelefone(raw) {
    let d = soDigitos(raw);
    if (!d) return '';
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
    return d;
}

const DIA_LABEL = { DOM: 'Domingo', SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta', QUI: 'Quinta', SEX: 'Sexta', SAB: 'Sábado' };
const DIA_NUM = { DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6 };
function diasLabels(str) {
    if (!str) return [];
    return String(str).split(/[,;/ ]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
        .map(t => DIA_LABEL[t] || DIA_LABEL[t.slice(0, 3)] || t);
}
function diasNums(str) {
    if (!str) return [];
    return String(str).split(/[,;/ ]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
        .map(t => (DIA_NUM[t] != null ? DIA_NUM[t] : DIA_NUM[t.slice(0, 3)]))
        .filter(n => n != null);
}

// Condição de pagamento no formato do reconhecimento: { nome, valorMinimo } (existente) +
// id/prazoDias/parcelas/tipoPagamento/permiteEspecial (v1.6.0, aditivo).
function condicaoParaIA(t) {
    if (!t) return null;
    return {
        nome: t.nomeCondicao,
        valorMinimo: dec(t.valorMinimo),
        id: t.id,
        prazoDias: t.parcelasDias ?? null,
        parcelas: t.qtdParcelas ?? null,
        tipoPagamento: t.tipoPagamento || null,
        permiteEspecial: !!t.permiteEspecial,
    };
}
function enderecoParaIA(c) {
    return {
        logradouro: c.End_Logradouro || null,
        numero: c.End_Numero || null,
        complemento: c.End_Complemento || null,
        bairro: c.End_Bairro || null,
        cidade: c.End_Cidade || null,
        uf: c.End_Estado || null,
        cep: c.End_CEP || null,
    };
}

// Acha o Cliente cadastrado cujo telefone bate com o informado — base de todo reconhecimento
// aqui. O telefone de quem manda mensagem no WhatsApp já vem autenticado pela própria plataforma;
// nunca trocar isso por "aceitar CPF/CNPJ digitado sozinho" (CPF/CNPJ não é segredo).
async function _clientePorTelefone(telefoneRaw) {
    const chaveAlvo = chaveTelefone(telefoneRaw);
    if (!chaveAlvo) return null;
    const candidatos = await prisma.cliente.findMany({
        where: {
            Ativo: true,
            OR: [
                { Telefone: { not: null } }, { Telefone_Celular: { not: null } },
                { Telefone_Comercial: { not: null } }, { whatsapp: { isNot: null } },
            ],
        },
        include: { vendedor: { select: { nome: true, ativo: true, nomeVendedorBotHardt: true } }, whatsapp: { select: { numeros: true } } },
    });
    return candidatos.find(c =>
        chaveTelefone(c.Telefone) === chaveAlvo ||
        chaveTelefone(c.Telefone_Celular) === chaveAlvo ||
        chaveTelefone(c.Telefone_Comercial) === chaveAlvo ||
        listaWhatsapps(c).some(n => chaveTelefone(n) === chaveAlvo)
    ) || null;
}

// v1.6.2 — Acha o Fornecedor cujo documento bate (normalizado, ignorando pontuação). Usado em
// buscar()/ficha() quando o painel do bot procura por uma empresa que é fornecedor, não cliente
// (ex.: "Karville") — antes essas buscas só olhavam a tabela de clientes.
async function _fornecedorPorDocumento(docAlvo) {
    if (!docAlvo) return null;
    let f = await prisma.fornecedor.findFirst({ where: { cnpjCpf: docAlvo } });
    if (!f) {
        const todos = await prisma.fornecedor.findMany({ where: { cnpjCpf: { not: null } } });
        f = todos.find(x => normalizarDoc(x.cnpjCpf) === docAlvo) || null;
    }
    return f;
}

const iaClienteService = {
    // Reconhecimento geral do cliente pelo telefone — nome, cidade, vendedor, dias de
    // entrega/venda e condição de pagamento (nome + pedido mínimo). Não devolve catálogo de
    // preços (isso é específico de cada linha — ver congeladosService.catalogoPorTelefone).
    // v1.6.0 (aditivo): + ultimoPedidoDetalhe, pedidosEmAberto, proximasEntregas, horaCorte,
    // ultimaCompraEm/diasSemComprar, vendedorInfo, endereco; condicaoPagamento ganha
    // id/prazoDias/parcelas/tipoPagamento/permiteEspecial.
    async reconhecerPorTelefone(telefoneRaw) {
        const cliente = await _clientePorTelefone(telefoneRaw);
        if (!cliente) return { reconhecido: false };

        const [condicao, regUltimoPedido, regsAberto, horaCorte] = await Promise.all([
            cliente.Condicao_de_pagamento
                ? prisma.tabelaPreco.findUnique({ where: { id: cliente.Condicao_de_pagamento } })
                : Promise.resolve(null),
            iaPedidoService.buscarUltimoPedidoRegistro(cliente),
            iaPedidoService.buscarPedidosEmAbertoRegistros(cliente),
            iaConsultaConfig.horaCorte(),
        ]);
        // v1.6.0 (revisor 09/2026): etiquetas/promoções/preparo por categoria/acréscimo carregados
        // UMA vez para os dois pedidos do reconhecimento (antes cada um recarregava tudo sozinho —
        // ~3x mais consultas por mensagem no caminho quente do bot).
        const entradasPedidos = [
            ...(regUltimoPedido ? [{ fonte: 'PEDIDO', reg: regUltimoPedido }] : []),
            ...regsAberto.fila.map(reg => ({ fonte: 'FILA', reg })),
            ...regsAberto.pedidos.map(reg => ({ fonte: 'PEDIDO', reg })),
        ];
        const [extras, preparos, acrescimoPct] = await Promise.all([
            iaProduto.carregarExtrasProdutos(iaPedidoService.produtosDeEntradas(entradasPedidos)),
            iaPedidoService.preparoPorCategoria(),
            iaPedidoService.acrescimoDoCliente(cliente),
        ]);
        const ctxPedido = { acrescimoPct, extras, preparos, regUltimoPedido, regsAberto };
        const [ultimoPedidoDetalhe, pedidosEmAberto] = await Promise.all([
            iaPedidoService.ultimoPedidoDetalhe(cliente, ctxPedido),
            iaPedidoService.pedidosEmAberto(cliente, ctxPedido),
        ]);
        const ultimaCompraEm = ultimoPedidoDetalhe?.data ? iaProduto.dataSP(ultimoPedidoDetalhe.data) : null;
        const diasSemComprar = ultimaCompraEm
            ? Math.max(0, Math.round((Date.parse(iaPedidoService.hojeSP()) - Date.parse(ultimaCompraEm)) / 86400000))
            : null;

        return {
            reconhecido: true,
            cliente: {
                nome: cliente.NomeFantasia || cliente.Nome,
                documento: cliente.Documento,
                cidade: cliente.End_Cidade,
                vendedor: cliente.vendedor?.nome || null,
            },
            diasEntrega: diasLabels(cliente.Dia_de_entrega),
            diasVenda: diasLabels(cliente.Dia_de_venda),
            condicaoPagamento: condicaoParaIA(condicao),
            // v1.6.0
            ultimoPedidoDetalhe,
            pedidosEmAberto,
            proximasEntregas: iaPedidoService.proximasEntregas(diasNums(cliente.Dia_de_entrega), 2),
            horaCorte,
            ultimaCompraEm,
            diasSemComprar,
            vendedorInfo: cliente.vendedor && cliente.vendedor.ativo !== false
                ? { nome: cliente.vendedor.nome, nomeBot: cliente.vendedor.nomeVendedorBotHardt || null, ativo: true }
                : null,
            endereco: enderecoParaIA(cliente),
        };
    },

    // Últimos pedidos do cliente — exige o MESMO reconhecimento por telefone (não aceita CPF
    // sozinho): histórico de compra é dado sensível, igual preço negociado.
    // Com `comItens: true`, cada pedido também traz `itens: [{ produtoId, nome, quantidade, unidade,
    // precoUnit }]` (destrava "o de sempre"/repetição). Sem o flag, a resposta traz os mesmos
    // campos de antes (sem `itens`) — mudança aditiva.
    // v1.6.0: delega a iaPedidoService.listarPedidosDoCliente — objeto único de pedido (campos
    // antigos intactos + fonte/numeroFila/dataPrevista/entregueEm/entregador/status/emAberto/
    // origem/…); pedidos ainda na FILA de aprovação entram no topo, fora do `limite`
    // (`fonte: "FILA"`) — registrado em meta.avisos.
    async historicoPedidos(telefoneRaw, limite = 10, comItens = false) {
        const cliente = await _clientePorTelefone(telefoneRaw);
        if (!cliente) return { reconhecido: false };
        const pedidos = await iaPedidoService.listarPedidosDoCliente({ cliente, limite, comItens: comItens === true });
        return {
            reconhecido: true,
            cliente: { nome: cliente.NomeFantasia || cliente.Nome },
            pedidos,
        };
    },

    // v1.6.0 — produtos que o cliente já comprou (agregado), janela padrão 12 meses (máx 24).
    // Só pedidos REAIS (não bonificação, não cancelado, não excluído). Devoluções NÃO são
    // descontadas: é agregado de tendência ("o que ele costuma pedir"), não de faturamento.
    async produtosComprados(telefoneRaw, { meses = 12 } = {}) {
        const cliente = await _clientePorTelefone(telefoneRaw);
        if (!cliente) return { reconhecido: false };
        const janelaMeses = Math.min(Math.max(parseInt(meses) || 12, 1), 24);
        const desde = new Date(iaPedidoService.hojeSP() + 'T00:00:00.000Z');
        desde.setUTCMonth(desde.getUTCMonth() - janelaMeses);

        const pedidos = await prisma.pedido.findMany({
            where: { clienteId: cliente.UUID, bonificacao: false, cancelado: false, statusEnvio: { not: 'EXCLUIDO' }, dataVenda: { gte: desde } },
            orderBy: { dataVenda: 'desc' },
            select: { id: true, dataVenda: true, itens: { select: { produtoId: true, quantidade: true, valor: true } } },
        });

        // Agrega por produto (pedidos vêm do mais recente para o mais antigo).
        const agg = new Map(); // produtoId → { vezes, qtdTotal, ultimaCompra, primeiraCompra, ultimoPreco, pedidosVistos:Set }
        for (const p of pedidos) {
            const dia = iaProduto.dataSP(p.dataVenda);
            for (const i of p.itens) {
                if (!i.produtoId) continue;
                let a = agg.get(i.produtoId);
                if (!a) { a = { vezes: 0, qtdTotal: 0, ultimaCompra: dia, primeiraCompra: dia, ultimoPreco: dec(i.valor), pedidos: new Set() }; agg.set(i.produtoId, a); }
                if (!a.pedidos.has(p.id)) { a.pedidos.add(p.id); a.vezes += 1; }
                a.qtdTotal += dec(i.quantidade);
                if (dia < a.primeiraCompra) a.primeiraCompra = dia;
                if (dia > a.ultimaCompra) { a.ultimaCompra = dia; a.ultimoPreco = dec(i.valor); }
            }
        }

        const ids = [...agg.keys()];
        const [produtos, cfgRow, acrescimoPct] = await Promise.all([
            ids.length ? prisma.produto.findMany({ where: { id: { in: ids } }, include: iaProduto.PRODUTO_INCLUDE_IA }) : Promise.resolve([]),
            prisma.congeladosConfig.findUnique({ where: { chave: 'categoriasNomes' } }).catch(() => null),
            iaPedidoService.acrescimoDoCliente(cliente),
        ]);
        const extras = await iaProduto.carregarExtrasProdutos(produtos); // etiquetas + promoções em lote
        const overrides = (cfgRow && cfgRow.valor) || {};
        const porId = new Map(produtos.map(p => [p.id, p]));
        const hoje = Date.parse(iaPedidoService.hojeSP());

        const lista = ids.map(pid => {
            const a = agg.get(pid);
            const prod = porId.get(pid) || null;
            const ov = prod?.categoriaProduto?.id ? overrides[prod.categoriaProduto.id] : null;
            return {
                produtoId: pid,
                id: prod?.congeladosProduto?.id || null,
                nome: prod?.congeladosProduto?.nomeSite || prod?.nome || null,
                unidade: prod?.unidade || null,
                ultimaCompra: a.ultimaCompra,
                primeiraCompra: a.primeiraCompra,
                vezes: a.vezes,
                qtdMedia: Math.round((a.qtdTotal / a.vezes) * 10) / 10,
                qtdTotal: Math.round(a.qtdTotal * 1000) / 1000,
                ultimoPreco: a.ultimoPreco,
                semanasDesdeUltima: Math.max(0, Math.floor((hoje - Date.parse(a.ultimaCompra)) / (7 * 86400000))),
                noSite: !!prod?.congeladosProduto && prod.congeladosProduto.ativo !== false,
                produto: prod ? iaProduto.produtoParaIA({
                    produto: prod,
                    cp: prod.congeladosProduto || null,
                    etiqueta: extras.etiquetas.get(pid) || null,
                    promo: extras.promos.get(pid) || null,
                    preparoLabel: (ov && typeof ov === 'object' && ov.preparo) ? String(ov.preparo).trim() : '',
                    acrescimoPct,
                    precoCliente: null,
                    nomePorProdutoId: extras.nomes,
                }) : null,
            };
        }).sort((a, b) => (a.ultimaCompra < b.ultimaCompra ? 1 : a.ultimaCompra > b.ultimaCompra ? -1 : 0));

        // Resumo: cadência real do cliente (intervalo médio entre pedidos, em dias).
        const datas = [...new Set(pedidos.map(p => iaProduto.dataSP(p.dataVenda)))].sort();
        let intervaloMedioDias = null;
        if (datas.length >= 2) {
            const total = (Date.parse(datas[datas.length - 1]) - Date.parse(datas[0])) / 86400000;
            intervaloMedioDias = Math.round(total / (datas.length - 1));
        }
        return {
            reconhecido: true,
            cliente: { nome: cliente.NomeFantasia || cliente.Nome },
            janelaMeses,
            resumo: {
                totalPedidos: pedidos.length,
                primeiroPedido: datas[0] || null,
                ultimoPedido: datas[datas.length - 1] || null,
                intervaloMedioDias,
            },
            produtos: lista,
        };
    },

    // v1.6.0 — situação financeira. 🔒 SÓ PAINEL da equipe do bot (mesma regra de
    // /cliente/buscar): a Ana NÃO fala de cobrança. Mesma conta do selo "inadimplente" do
    // cadastro de cliente (clienteController): contas ABERTO/PARCIAL com parcela PENDENTE/
    // PARCIAL/VENCIDO vencida antes de hoje (meia-noite em São Paulo), excluindo pedido
    // EXCLUIDO / CA CANCELADO por OR explícito (NUNCA `NOT` — situacaoCA null sumiria) e
    // descartando as contas de especial já pago em dinheiro esperando a conferência do Caixa.
    async situacaoFinanceira(telefoneRaw) {
        const cliente = await _clientePorTelefone(telefoneRaw);
        if (!cliente) return { reconhecido: false };

        const hojeStr = iaPedidoService.hojeSP();
        const hoje = new Date(hojeStr + 'T00:00:00.000Z');
        const { idsContasEmEsperaDeConferencia } = require('./recebimentoEntregaService');
        const emEspera = await idsContasEmEsperaDeConferencia({ clienteIds: [cliente.UUID] });
        const contas = await prisma.contaReceber.findMany({
            where: {
                clienteId: cliente.UUID,
                status: { in: ['ABERTO', 'PARCIAL'] },
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
            select: {
                id: true,
                parcelas: {
                    where: { status: { in: ['PENDENTE', 'PARCIAL', 'VENCIDO'] } },
                    select: { valor: true, valorPago: true, valorDescontoTotal: true, dataVencimento: true },
                },
            },
        });

        let titulosVencidos = 0, valorVencido = 0, titulosAbertos = 0, valorAberto = 0;
        let vencidoDesde = null;
        for (const cr of contas) {
            if (emEspera.has(cr.id)) continue;
            for (const p of cr.parcelas) {
                const saldo = dec(p.valor) - dec(p.valorPago) - dec(p.valorDescontoTotal);
                if (saldo <= 0.01) continue;
                if (p.dataVencimento < hoje) {
                    titulosVencidos += 1;
                    valorVencido += saldo;
                    const d = iaProduto.dataSP(p.dataVencimento);
                    if (!vencidoDesde || d < vencidoDesde) vencidoDesde = d;
                } else {
                    titulosAbertos += 1;
                    valorAberto += saldo;
                }
            }
        }
        const diasAtraso = vencidoDesde
            ? Math.max(0, Math.round((Date.parse(hojeStr) - Date.parse(vencidoDesde)) / 86400000))
            : 0;
        return {
            reconhecido: true,
            cliente: { nome: cliente.NomeFantasia || cliente.Nome },
            inadimplente: valorVencido > 0.01,
            titulosVencidos,
            valorVencido: Math.round(valorVencido * 100) / 100,
            vencidoDesde,
            diasAtraso,
            titulosAbertos,
            valorAberto: Math.round(valorAberto * 100) / 100,
        };
    },

    // v1.6.0 — "meu pedido chegou?": pedido por número, SÓ do cliente do telefone.
    async pedidoPorNumero(telefoneRaw, numero, fonte) {
        const cliente = await _clientePorTelefone(telefoneRaw);
        if (!cliente) return { reconhecido: false };
        const r = await iaPedidoService.pedidoPorNumero({ cliente, numero, fonte });
        return { reconhecido: true, cliente: { nome: cliente.NomeFantasia || cliente.Nome }, ...r };
    },

    // ── Busca/ficha para o PAINEL da equipe do bot (v1.5.0) ─────────────────────────────────
    // Estes dois endpoints NÃO são expostos à IA nem a cliente final: quem chama é o backend do
    // bot, a partir da tela logada da equipe de atendimento, para vincular manualmente uma
    // conversa ao cadastro. Por isso podem buscar por nome/documento (a regra "só telefone
    // autenticado" continua valendo para a IA — ver reconhecerPorTelefone acima). Não devolvem
    // preço/condição negociada na busca — só identificação de cadastro.

    // Busca parcial por Razão Social, Nome Fantasia ou CPF/CNPJ (11+ caracteres úteis = documento).
    // Sem diferenciar maiúsculas/acentos; documento casa por dígitos/letras ignorando pontuação.
    async buscarClientes(buscaRaw, limiteRaw) {
        const busca = String(buscaRaw || '').trim();
        if (busca.length < 3) throw new Error('Informe pelo menos 3 caracteres para buscar.');
        const limite = Math.min(Math.max(parseInt(limiteRaw) || 10, 1), 20);

        // Só cadastros com documento — é a chave que o painel usa depois no /cliente/ficha
        const clientes = await prisma.cliente.findMany({
            where: { Documento: { not: null } },
            include: { vendedor: { select: { nome: true } }, whatsapp: { select: { numeros: true } } },
        });
        // v1.6.2: fornecedores entram na mesma busca — o painel não achava empresas que só existem
        // como fornecedor (ex.: "Karville"), porque a busca só olhava a tabela de clientes.
        const fornecedores = await prisma.fornecedor.findMany({
            where: { cnpjCpf: { not: null } },
        });

        let achadosClientes, achadosFornecedores;
        if (soDigitos(busca).length >= 11) {
            const docAlvo = normalizarDoc(busca);
            achadosClientes = clientes.filter(c => normalizarDoc(c.Documento).includes(docAlvo));
            achadosFornecedores = fornecedores.filter(f => normalizarDoc(f.cnpjCpf).includes(docAlvo));
        } else {
            const alvo = semAcento(busca);
            achadosClientes = clientes.filter(c =>
                semAcento(c.Nome).includes(alvo) || semAcento(c.NomeFantasia).includes(alvo));
            achadosFornecedores = fornecedores.filter(f =>
                semAcento(f.razaoSocial).includes(alvo) || semAcento(f.nomeFantasia).includes(alvo));
        }
        achadosClientes.sort((a, b) => (b.Ativo - a.Ativo) || String(a.Nome).localeCompare(b.Nome, 'pt-BR'));
        achadosFornecedores.sort((a, b) => (b.ativo - a.ativo) || String(a.razaoSocial).localeCompare(b.razaoSocial, 'pt-BR'));

        // Ordem: clientes primeiro, fornecedores depois; `limite` vale para o total combinado.
        // Documento existindo nos dois cadastros: aparecem os dois itens (tipos diferentes).
        const listaClientes = achadosClientes.map(c => ({
            tipo: 'CLIENTE',
            documento: c.Documento,
            nome: c.Nome,
            nomeFantasia: c.NomeFantasia,
            cidade: c.End_Cidade,
            vendedor: c.vendedor?.nome || null,
            ativo: c.Ativo,
            telefones: listaTelefones(c),
            whatsapps: listaWhatsapps(c),
        }));
        const listaFornecedores = achadosFornecedores.map(f => ({
            tipo: 'FORNECEDOR',
            documento: f.cnpjCpf,
            nome: f.razaoSocial,
            nomeFantasia: f.nomeFantasia,
            cidade: f.cidade,
            vendedor: null,
            ativo: f.ativo,
            telefones: [f.telefone].map(soDigitos).filter(Boolean),
            whatsapps: [],
        }));

        return { clientes: [...listaClientes, ...listaFornecedores].slice(0, limite) };
    },

    // Ficha completa de UM cliente pela chave documento (vinda da busca acima). Mesmo shape do
    // reconhecerPorTelefone + nomeFantasia/ativo/telefones/whatsapps, com `encontrado` no lugar
    // de `reconhecido` (aqui não há reconhecimento — a equipe já escolheu o cliente).
    async fichaPorDocumento(documentoRaw) {
        const docAlvo = normalizarDoc(documentoRaw);
        if (!docAlvo || docAlvo.length < 11) throw new Error('Informe o CPF/CNPJ completo do cliente.');

        // Documento é gravado normalizado, mas cadastros antigos podem ter pontuação — tenta
        // direto e, não achando, compara todo mundo já normalizado.
        let cliente = await prisma.cliente.findUnique({
            where: { Documento: docAlvo },
            include: { vendedor: { select: { nome: true } }, whatsapp: { select: { numeros: true } } },
        });
        if (!cliente) {
            const todos = await prisma.cliente.findMany({
                where: { Documento: { not: null } },
                include: { vendedor: { select: { nome: true } }, whatsapp: { select: { numeros: true } } },
            });
            cliente = todos.find(c => normalizarDoc(c.Documento) === docAlvo) || null;
        }
        if (cliente) {
            const condicao = cliente.Condicao_de_pagamento
                ? await prisma.tabelaPreco.findUnique({ where: { id: cliente.Condicao_de_pagamento } })
                : null;
            // v1.6.2: mesmo documento também cadastrado como fornecedor? cliente tem prioridade,
            // mas avisa o painel — senão a equipe acha que é só cliente.
            const tambemFornecedor = !!(await _fornecedorPorDocumento(docAlvo));

            return {
                encontrado: true,
                tipo: 'CLIENTE',
                ...(tambemFornecedor ? { tambemFornecedor: true } : {}),
                cliente: {
                    nome: cliente.Nome,
                    nomeFantasia: cliente.NomeFantasia,
                    documento: cliente.Documento,
                    cidade: cliente.End_Cidade,
                    vendedor: cliente.vendedor?.nome || null,
                    ativo: cliente.Ativo,
                },
                diasEntrega: diasLabels(cliente.Dia_de_entrega),
                diasVenda: diasLabels(cliente.Dia_de_venda),
                condicaoPagamento: condicaoParaIA(condicao),
                whatsapps: listaWhatsapps(cliente),
                telefones: listaTelefones(cliente),
                horaCorte: await iaConsultaConfig.horaCorte(), // v1.6.0 — mesma informação do reconhecimento
            };
        }

        // v1.6.2: não é cliente — procura em Fornecedor antes de devolver "não encontrado"
        // (painel não achava empresas que só existem como fornecedor, ex.: "Karville").
        const fornecedor = await _fornecedorPorDocumento(docAlvo);
        if (!fornecedor) return { encontrado: false };

        return {
            encontrado: true,
            tipo: 'FORNECEDOR',
            cliente: {
                nome: fornecedor.razaoSocial,
                nomeFantasia: fornecedor.nomeFantasia,
                documento: fornecedor.cnpjCpf,
                cidade: fornecedor.cidade,
                vendedor: null,
                ativo: fornecedor.ativo,
            },
            diasEntrega: [],
            diasVenda: [],
            condicaoPagamento: null,
            whatsapps: [],
            telefones: [fornecedor.telefone].map(soDigitos).filter(Boolean),
            horaCorte: null, // fornecedor não tem hora de corte — campo mantido p/ o shape ficar igual ao do cliente
            fornecedor: {
                ...(fornecedor.email ? { email: fornecedor.email } : {}),
                ...(fornecedor.telefone ? { telefone: fornecedor.telefone } : {}),
                ...(fornecedor.inscricaoEstadual ? { inscricaoEstadual: fornecedor.inscricaoEstadual } : {}),
                ...(fornecedor.uf ? { uf: fornecedor.uf } : {}),
            },
        };
    },

    // Cria um Lead (prospect) reaproveitando o mesmo serviço do CRM interno — aparece igual pros
    // vendedores no app, com origemLead marcando que veio do WhatsApp/IA.
    async criarLead({ nomeEstabelecimento, whatsapp, contato, cidade, observacoes }) {
        if (!nomeEstabelecimento || !String(nomeEstabelecimento).trim()) throw new Error('Informe o nome do estabelecimento/contato.');
        if (!whatsapp || soDigitos(whatsapp).length < 10) throw new Error('Informe um WhatsApp válido.');
        const lead = await leadService.criar({
            nomeEstabelecimento: String(nomeEstabelecimento).trim(),
            whatsapp: soDigitos(whatsapp),
            contato: contato || null,
            // A cidade aqui é TEXTO CRU de LLM (o cliente escreveu no WhatsApp e a IA repassou):
            // chega "joinvile", "JOINVILLE", "Joinville ". `leadService.criar` resolve pelo cadastro
            // oficial de cidades em modo TOLERANTE (abaixo): cidade conhecida vira o nome oficial;
            // desconhecida é gravada normalizada e vira pendência para o escritório — NUNCA erro.
            // Contrato v1 intacto: a resposta continua { id, numero, etapa }.
            cidade: cidade == null ? null : String(cidade),   // cru de propósito: a pendência guarda "como veio"
            observacoes: observacoes || null,
            origemLead: 'WHATSAPP_IA',
        }, { modo: 'tolerante', origem: 'IA_LEAD' });
        return { id: lead.id, numero: lead.numero, etapa: lead.etapa };
    },
};

module.exports = iaClienteService;
