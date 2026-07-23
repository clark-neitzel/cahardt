// =====================================================================
// Importador do CONTAS A RECEBER do Conta Azul → app (23/07/2026).
//
// O CA virou somente leitura e a empresa está saindo dele. Este serviço
// puxa TODAS as parcelas de contas a receber que existem lá e:
//   1) ARQUIVA cada parcela na tabela ca_receber_importado com os JSONs
//      crus completos (item da busca + detalhe com evento/baixas) —
//      nenhuma informação se perde, mesmo que o CA suma.
//   2) Para parcela EM ABERTO cujo evento NÃO corresponde a nenhum pedido
//      do app (venda antiga/avulsa), cria a ContaReceber operacional
//      (origem IMPORTADO_CA, sem pedido) para a cobrança seguir no app.
//      Parcela de pedido que já existe no app só é arquivada (a conta
//      local do pedido já cuida dela).
//
// Idempotente: upsert por idParcelaCA; rodar de novo só atualiza.
// Roda em background (estado em memória consultável via admin-exec).
// =====================================================================
const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const pausa = (ms) => new Promise(r => setTimeout(r, ms));

// Status do CA (status_traduzido) → status local de parcela
const STATUS_ABERTO_CA = ['PENDENTE', 'ATRASADO', 'EM_ABERTO', 'VENCE_HOJE', 'PENDING', 'OVERDUE'];
const STATUS_PAGO_CA = ['RECEBIDO', 'QUITADO', 'ACQUITTED', 'PAID'];

const estado = {
    rodando: false,
    iniciadoEm: null,
    terminadoEm: null,
    fase: null,
    paginas: 0,
    parcelasVistas: 0,
    detalhesBuscados: 0,
    detalhesFalha: 0,
    arquivadas: 0,
    contasOperacionaisCriadas: 0,
    parcelasOperacionaisCriadas: 0,
    jaTinhaPedidoApp: 0,
    clientesNaoEncontrados: [],
    erros: [],
    ultimoErro: null,
};

async function importarTudo(opts = {}) {
    if (estado.rodando) throw new Error('Importação já está rodando.');
    Object.assign(estado, {
        rodando: true, iniciadoEm: new Date(), terminadoEm: null, fase: 'listando',
        paginas: 0, parcelasVistas: 0, detalhesBuscados: 0, detalhesFalha: 0,
        arquivadas: 0, contasOperacionaisCriadas: 0, parcelasOperacionaisCriadas: 0,
        jaTinhaPedidoApp: 0, clientesNaoEncontrados: [], erros: [], ultimoErro: null,
    });

    try {
        const de = opts.de || '2000-01-01';
        const ate = opts.ate || '2035-12-31';
        const tamanhoPagina = 100;
        const comDetalhe = opts.comDetalhe !== false; // padrão: busca o detalhe de cada parcela

        // ── 1) Listar todas as parcelas (paginado) ──
        const itens = [];
        let pagina = 1;
        for (; ;) {
            const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar?pagina=${pagina}&tamanho_pagina=${tamanhoPagina}&data_vencimento_de=${de}&data_vencimento_ate=${ate}`;
            const resp = await contaAzulService._axiosGet(url, 'CA_RECEBER_IMPORT');
            const lote = resp.data?.itens || [];
            itens.push(...lote);
            estado.paginas = pagina;
            estado.parcelasVistas = itens.length;
            if (lote.length < tamanhoPagina) break;
            pagina++;
            await pausa(400); // respeitar ~10 req/s do CA com folga
        }

        // Pré-carregar caches p/ vincular pedido e cliente sem 1 query por parcela
        estado.fase = 'preparando';
        const pedidos = await prisma.pedido.findMany({
            where: { numero: { not: null }, especial: false, bonificacao: false },
            select: { id: true, numero: true }
        });
        const pedidoPorNumero = new Map(pedidos.map(p => [p.numero, p.id]));
        const clientesApp = await prisma.cliente.findMany({ select: { UUID: true } });
        const clienteExiste = new Set(clientesApp.map(c => c.UUID));

        // ── 2) Parcela a parcela: detalhe + arquivo + camada operacional ──
        estado.fase = 'importando';
        // Agrupamento por evento p/ criar UMA ContaReceber com todas as parcelas do evento
        const contasCriadasPorEvento = new Map(); // idEventoCA → contaReceber.id

        for (const item of itens) {
            try {
                let detalhe = null;
                if (comDetalhe) {
                    try {
                        detalhe = await contaAzulService.buscarParcelaDetalhe(item.id);
                        estado.detalhesBuscados++;
                        await pausa(250);
                    } catch (e) {
                        estado.detalhesFalha++;
                        if (e.response?.status === 429) { await pausa(5000); } // spike arrest: respira e segue
                    }
                }

                const evento = detalhe?.evento || null;
                const numeroVenda = evento?.codigo_referencia ? parseInt(evento.codigo_referencia, 10) : null;
                const origemEvento = evento?.referencia?.origem || null;
                const pedidoAppId = (numeroVenda && pedidoPorNumero.get(numeroVenda)) || null;
                const statusCA = item.status_traduzido || item.status || null;

                const base = {
                    idEventoCA: evento?.id || null,
                    clienteCaId: item.cliente?.id || null,
                    clienteNome: item.cliente?.nome || null,
                    descricao: item.descricao || detalhe?.descricao || null,
                    numeroVendaCA: Number.isFinite(numeroVenda) ? numeroVenda : null,
                    origemEventoCA: origemEvento,
                    status: statusCA,
                    dataVencimento: item.data_vencimento ? new Date(item.data_vencimento + 'T12:00:00-03:00') : null,
                    dataCompetencia: item.data_competencia ? new Date(String(item.data_competencia).substring(0, 10) + 'T12:00:00-03:00') : null,
                    valorTotal: item.total != null ? round2(item.total) : null,
                    valorPago: item.pago != null ? round2(item.pago) : null,
                    temPedidoApp: !!pedidoAppId,
                    dadosBusca: item,
                    dadosDetalhe: detalhe || undefined,
                };

                const arquivada = await prisma.caReceberImportado.upsert({
                    where: { idParcelaCA: item.id },
                    create: { idParcelaCA: item.id, ...base },
                    update: base,
                });
                estado.arquivadas++;
                if (pedidoAppId) estado.jaTinhaPedidoApp++;

                // ── Camada operacional: só p/ parcela ABERTA sem pedido no app ──
                const aberta = STATUS_ABERTO_CA.includes(String(statusCA || '').toUpperCase());
                if (!aberta || pedidoAppId || arquivada.parcelaLocalId) continue;

                const clienteCaId = item.cliente?.id;
                if (!clienteCaId || !clienteExiste.has(clienteCaId)) {
                    if (clienteCaId && !estado.clientesNaoEncontrados.some(c => c.id === clienteCaId)) {
                        estado.clientesNaoEncontrados.push({ id: clienteCaId, nome: item.cliente?.nome || '?' });
                    }
                    continue; // sem cliente no app → fica só no arquivo
                }

                const chaveEvento = evento?.id || `sem-evento-${item.id}`;
                let contaId = contasCriadasPorEvento.get(chaveEvento);
                if (!contaId) {
                    const conta = await prisma.contaReceber.create({
                        data: {
                            clienteId: clienteCaId,
                            origem: 'IMPORTADO_CA',
                            valorTotal: round2(item.total || 0),
                            status: 'ABERTO',
                            observacao: `Importada do Conta Azul em ${new Date().toLocaleDateString('pt-BR')}${base.descricao ? ` — ${base.descricao}` : ''}${numeroVenda ? ` (venda CA nº ${numeroVenda}, sem pedido no app)` : ''}`,
                        }
                    });
                    contaId = conta.id;
                    contasCriadasPorEvento.set(chaveEvento, contaId);
                    estado.contasOperacionaisCriadas++;
                } else {
                    // Evento com várias parcelas: soma o valor desta no total da conta
                    await prisma.contaReceber.update({
                        where: { id: contaId },
                        data: { valorTotal: { increment: round2(item.total || 0) } }
                    });
                }

                const pagoParcela = round2(item.pago || 0);
                const parcelaLocal = await prisma.parcela.create({
                    data: {
                        contaReceberId: contaId,
                        numeroParcela: detalhe?.indice || 1,
                        valor: round2(item.total || 0),
                        dataVencimento: base.dataVencimento || new Date(),
                        status: pagoParcela > 0 ? 'PARCIAL' : 'PENDENTE',
                        valorPago: pagoParcela > 0 ? pagoParcela : null,
                        observacao: `Importada do Conta Azul (parcela ${item.id})`,
                    }
                });
                estado.parcelasOperacionaisCriadas++;
                await prisma.caReceberImportado.update({
                    where: { idParcelaCA: item.id },
                    data: { contaReceberId: contaId, parcelaLocalId: parcelaLocal.id }
                });
                if (pagoParcela > 0) {
                    await prisma.contaReceber.update({ where: { id: contaId }, data: { status: 'PARCIAL' } });
                }
            } catch (e) {
                estado.ultimoErro = `${item.id}: ${e.message}`;
                if (estado.erros.length < 30) estado.erros.push(estado.ultimoErro);
            }
        }

        estado.fase = 'concluido';
        return resumo();
    } finally {
        estado.rodando = false;
        estado.terminadoEm = new Date();
    }
}

function resumo() {
    return { ...estado, clientesNaoEncontrados: estado.clientesNaoEncontrados.slice(0, 50) };
}

module.exports = { importarTudo, resumo };
