const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../config/database'); // singleton compartilhado (pool único)
const verificarAuth = require('../middlewares/authMiddleware');
const { CA_SOMENTE_LEITURA } = require('../config/contaAzulModo');
// Conferência do dinheiro (passo antes de fechar). A trava só vale com a chave
// ligada em Configurações → Caixa; ver backend/config/caixaConferenciaConfig.js.
const confService = require('../services/caixaConferenciaService');
const cfgConferencia = require('../config/caixaConferenciaConfig');
// Caixa só de segunda a sexta: o movimento de sáb/dom é prestado na segunda.
const { intervaloDoCaixa, ehFimDeSemana, dataCaixaDe } = require('../utils/diasUteisCaixa');

// ── Helpers ──
const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkAcessoCaixa = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Acessar_Caixa || perms.Pode_Editar_Caixa) {
            req._perms = perms;
            return next();
        }
        return res.status(403).json({ error: 'Sem permissão para acessar o Caixa Diário.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

const checkEditor = async (req, res, next) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Editar_Caixa) {
            req._perms = perms;
            return next();
        }
        return res.status(403).json({ error: 'Permissão de Auditor do Caixa necessária.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

router.use(verificarAuth);

// ─────────────────────────────────────────────────────────────────────────
// Rotas do RESPONSÁVEL que autoriza devoluções à distância.
// Registradas ANTES do checkAcessoCaixa de propósito: quem só autoriza pode
// não ter acesso ao Caixa Diário. A permissão é checada dentro de cada rota.
// (Os helpers/constantes usados aqui são definidos mais abaixo no arquivo, o
// que é seguro: só são lidos quando a requisição chega, com o módulo já carregado.)
// ─────────────────────────────────────────────────────────────────────────

// ── GET /autorizacoes-devolucao/pendentes — Pedidos aguardando ESTE usuário ──
router.get('/autorizacoes-devolucao/pendentes', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!perms.admin && !perms[PERM_AUTORIZAR_DEV]) {
            return res.json([]); // sem permissão de autorizar → nada a mostrar (poller do pop-up)
        }
        const pendentes = await prisma.autorizacaoDevolucao.findMany({
            where: { autorizadorId: req.user.id, status: 'PENDENTE' },
            orderBy: { createdAt: 'asc' }
        });
        if (pendentes.length === 0) return res.json([]);

        // Nome do dono do caixa (motorista)
        const vendedorIds = [...new Set(pendentes.map(p => p.vendedorId))];
        const vendedores = await prisma.vendedor.findMany({
            where: { id: { in: vendedorIds } },
            select: { id: true, nome: true }
        });
        const nomePorId = Object.fromEntries(vendedores.map(v => [v.id, v.nome]));

        res.json(pendentes.map(p => ({
            id: p.id,
            vendedorId: p.vendedorId,
            vendedorNome: nomePorId[p.vendedorId] || 'Motorista',
            dataReferencia: p.dataReferencia,
            produtoNome: p.produtoNome,
            quantidade: Number(p.quantidade),
            motivo: p.motivo,
            valorUnit: p.valorUnit != null ? Number(p.valorUnit) : null,
            valorTotal: p.valorUnit != null ? Math.round(Number(p.valorUnit) * Number(p.quantidade) * 100) / 100 : null,
            solicitanteNome: p.solicitanteNome,
            criadoEm: p.createdAt
        })));
    } catch (error) {
        console.error('Erro ao listar autorizações pendentes:', error);
        res.status(500).json({ error: 'Erro ao listar autorizações pendentes.' });
    }
});

// ── POST /autorizacoes-devolucao/:id/responder — Autoriza (com senha) ou rejeita ──
router.post('/autorizacoes-devolucao/:id/responder', async (req, res) => {
    try {
        const { id } = req.params;
        const { aprovar, senha, motivoRejeicao } = req.body;

        const solic = await prisma.autorizacaoDevolucao.findUnique({ where: { id } });
        if (!solic) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (solic.status !== 'PENDENTE') return res.status(400).json({ error: 'Este pedido já foi respondido.' });
        if (solic.autorizadorId !== req.user.id) {
            return res.status(403).json({ error: 'Este pedido não é para você autorizar.' });
        }

        // Valida o próprio usuário: ativo + permissão de autorizar
        const usuario = await prisma.vendedor.findUnique({ where: { id: req.user.id } });
        if (!usuario || !usuario.ativo) return res.status(403).json({ error: 'Usuário inválido ou inativo.' });
        const permsU = typeof usuario.permissoes === 'string' ? JSON.parse(usuario.permissoes) : (usuario.permissoes || {});
        if (!permsU.admin && !permsU[PERM_AUTORIZAR_DEV]) {
            return res.status(403).json({ error: 'Você não tem permissão para autorizar devoluções.' });
        }

        if (aprovar) {
            // Autorizar exige a senha do próprio responsável
            if (!senha) return res.status(400).json({ error: 'Digite sua senha para autorizar.' });
            if (!usuario.senha) return res.status(403).json({ error: 'Sem senha configurada no app.' });
            const senhaValida = await bcrypt.compare(senha, usuario.senha);
            if (!senhaValida) return res.status(401).json({ error: 'Senha incorreta.' });

            try {
                await aplicarDesconsideracao({
                    targetVendedor: solic.vendedorId,
                    data: solic.dataReferencia,
                    produtoId: solic.produtoId,
                    quantidade: Number(solic.quantidade),
                    motivo: solic.motivo,
                    autorizador: { id: usuario.id, nome: usuario.nome },
                    digitadoPor: solic.solicitanteId
                });
            } catch (e) {
                if (e.status) return res.status(e.status).json({ error: e.message });
                throw e;
            }

            await prisma.autorizacaoDevolucao.update({
                where: { id: solic.id },
                data: { status: 'AUTORIZADA', respondidoEm: new Date() }
            });
            return res.json({ ok: true, aprovado: true });
        }

        // Rejeitar (não precisa de senha)
        await prisma.autorizacaoDevolucao.update({
            where: { id: solic.id },
            data: { status: 'REJEITADA', motivoRejeicao: (motivoRejeicao || '').trim() || null, respondidoEm: new Date() }
        });
        res.json({ ok: true, aprovado: false });
    } catch (error) {
        console.error('Erro ao responder autorização:', error);
        res.status(500).json({ error: 'Erro ao responder autorização.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA DO DINHEIRO — filas da agenda e configuração.
// Registradas ANTES do checkAcessoCaixa de propósito: quem confere ou fecha
// pode não ter o menu do Caixa Diário liberado, mas precisa ver a fila na
// própria agenda. A permissão é checada dentro de cada rota.
// ─────────────────────────────────────────────────────────────────────────

// ── GET /conferencia-dinheiro/a-conferir — caixas esperando contagem ──
// O aviso só nasce no dia seguinte ao do caixa (?hoje=1 traz também os de hoje,
// usado pela própria tela do Caixa).
router.get('/conferencia-dinheiro/a-conferir', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        const fila = await confService.listarAConferir({
            usuario: req.user, perms, incluirHoje: req.query.hoje === '1',
        });
        res.json(fila);
    } catch (e) {
        console.error('Erro na fila de conferência:', e);
        res.json([]); // fila nunca derruba a agenda
    }
});

// ── GET /conferencia-dinheiro/a-fechar — conferidos, esperando fechamento ──
router.get('/conferencia-dinheiro/a-fechar', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        res.json(await confService.listarAFechar({ usuario: req.user, perms }));
    } catch (e) {
        console.error('Erro na fila de fechamento:', e);
        res.json([]);
    }
});

// ── GET /conferencia-dinheiro/minhas — "o que eu conferi" ──
router.get('/conferencia-dinheiro/minhas', async (req, res) => {
    try {
        res.json(await confService.minhasConferencias({
            usuario: req.user, de: req.query.de || null, ate: req.query.ate || null,
        }));
    } catch (e) {
        console.error('Erro no histórico de conferências:', e);
        res.json([]);
    }
});

// ── GET /conferencia-dinheiro/autorizadores — quem pode liberar diferença ──
router.get('/conferencia-dinheiro/autorizadores', async (req, res) => {
    try {
        const vendedores = await prisma.vendedor.findMany({
            where: { ativo: true },
            select: { id: true, nome: true, permissoes: true },
            orderBy: { nome: 'asc' },
        });
        res.json(vendedores
            .filter(v => v.id !== req.user.id && confService.podeAutorizarDiferenca(confService.permsDe(v)))
            .map(v => ({ id: v.id, nome: v.nome })));
    } catch (e) {
        console.error('Erro ao listar autorizadores:', e);
        res.json([]);
    }
});

// ── GET /conferencia-dinheiro/config — estado da regra (qualquer logado) ──
router.get('/conferencia-dinheiro/config', async (req, res) => {
    try {
        res.json(await cfgConferencia.get());
    } catch (e) {
        res.json(cfgConferencia.PADRAO);
    }
});

// ── PUT /conferencia-dinheiro/config — liga/desliga a regra (só admin) ──
router.put('/conferencia-dinheiro/config', async (req, res) => {
    try {
        const perms = await getPerms(req.user.id);
        if (!perms.admin) return res.status(403).json({ error: 'Só o administrador muda a regra do caixa.' });
        const { ativo, soDiasUteis, whatsappAtrasoDias, tarefaDiferenca, desde } = req.body || {};
        const parcial = {};
        if (ativo !== undefined) parcial.ativo = !!ativo;
        if (soDiasUteis !== undefined) parcial.soDiasUteis = !!soDiasUteis;
        if (tarefaDiferenca !== undefined) parcial.tarefaDiferenca = !!tarefaDiferenca;
        if (whatsappAtrasoDias !== undefined) parcial.whatsappAtrasoDias = Math.max(0, Number(whatsappAtrasoDias) || 0);
        if (desde !== undefined) parcial.desde = desde || null;
        res.json(await cfgConferencia.salvar(parcial));
    } catch (e) {
        console.error('Erro ao salvar config da conferência:', e);
        res.status(500).json({ error: 'Erro ao salvar a configuração.' });
    }
});

router.use(checkAcessoCaixa);

// ── Cálculo de Média de Combustível (últimos 3 meses) ──
const calcularMediaCombustivel = async (veiculoId) => {
    if (!veiculoId) return null;

    const tresMesesAtras = new Date();
    tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);
    const dataRef = tresMesesAtras.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const despesas = await prisma.despesa.findMany({
        where: {
            veiculoId,
            categoria: 'COMBUSTIVEL',
            dataReferencia: { gte: dataRef },
            kmNoAbastecimento: { not: null },
            litros: { not: null }
        },
        orderBy: { kmNoAbastecimento: 'asc' }
    });

    if (despesas.length < 2) return null;

    let totalKm = 0;
    let totalLitros = 0;

    for (let i = 1; i < despesas.length; i++) {
        const kmDiff = despesas[i].kmNoAbastecimento - despesas[i - 1].kmNoAbastecimento;
        if (kmDiff > 0) {
            totalKm += kmDiff;
            totalLitros += Number(despesas[i].litros);
        }
    }

    if (totalLitros <= 0) return null;
    return Math.round((totalKm / totalLitros) * 100) / 100;
};

// ── GET /resumo — Resumo completo do caixa diário ──
router.get('/resumo', async (req, res) => {
    try {
        const { data, vendedorId } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;

        // Quem confere o dinheiro ou fecha o caixa precisa abrir o caixa da outra
        // pessoa (é o que o botão "Conferir"/"Fechar" da agenda faz).
        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa
            && !confService.podeConferir(req._perms) && !confService.podeFechar(req._perms)) {
            return res.status(403).json({ error: 'Sem permissão para ver caixa de outro usuário.' });
        }

        // Sábado e domingo não têm caixa: a tela avisa e leva para a segunda,
        // senão o movimento do fim de semana apareceria em dois caixas.
        const cfgDias = await cfgConferencia.get();
        if (cfgDias.soDiasUteis && ehFimDeSemana(data)) {
            return res.json({
                diaSemCaixa: true,
                dataSugerida: dataCaixaDe(data),
                mensagem: 'Sábado e domingo não abrem caixa — o movimento do fim de semana entra no caixa da segunda-feira.'
            });
        }
        // Dias que compõem este caixa (segunda = sáb + dom + seg, com a regra ligada)
        const { dias: diasDoCaixaAtual, inicio: inicioDia, fim: fimDia } = intervaloDoCaixa(data, cfgDias.soDiasUteis);

        // 1. Buscar ou criar CaixaDiario
        let caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { entregasConferidas: true, conferenciaDevolucao: true }
        });

        if (!caixa) {
            caixa = await prisma.caixaDiario.create({
                data: { vendedorId: targetVendedor, dataReferencia: data },
                include: { entregasConferidas: true, conferenciaDevolucao: true }
            });
        }

        // 2. Buscar DiarioVendedor (info do veículo e km)
        const diario = await prisma.diarioVendedor.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { veiculo: { select: { id: true, placa: true, modelo: true } } }
        });

        const diarioInfo = diario ? {
            id: diario.id,
            veiculoId: diario.veiculoId,
            placa: diario.veiculo?.placa,
            modelo: diario.veiculo?.modelo,
            kmInicial: diario.kmInicial,
            kmFinal: diario.kmFinal,
            totalKm: diario.kmFinal && diario.kmInicial ? diario.kmFinal - diario.kmInicial : null,
            modo: diario.modo
        } : null;

        // 3. Calcular média combustível
        const mediaCombustivel3Meses = diario?.veiculoId ? await calcularMediaCombustivel(diario.veiculoId) : null;

        // 4. Buscar despesas do dia
        const despesas = await prisma.despesa.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: { in: diasDoCaixaAtual } },
            include: { veiculo: { select: { placa: true, modelo: true } } },
            orderBy: { createdAt: 'asc' }
        });

        const totalDespesas = despesas.reduce((sum, d) => sum + Number(d.valor), 0);

        // 5. Buscar entregas do dia (via dataEntrega + embarque.responsavelId).
        //    inicioDia/fimDia vêm do intervalo do caixa (fim de semana entra na segunda).

        const entregas = await prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: inicioDia, lte: fimDia },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                embarque: { responsavelId: targetVendedor }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true, Ponto_GPS: true, gps: { select: { balcao: true } } } },
                vendedor: { select: { nome: true } },
                embarque: { select: { numero: true } },
                itens: { include: { produto: { select: { nome: true, unidade: true } } } },
                // Ignora pagamentos com valor 0 (gerados por cliques duplicados de motorista)
                pagamentosReais: { where: { valor: { gt: 0 } } },
                itensDevolvidos: { include: { produto: { select: { nome: true } } } },
                contaReceber: { select: { status: true } }
            },
            orderBy: { dataEntrega: 'asc' }
        });

        // 6. Buscar TODAS as condições da TabelaPreco (sem distinct, cada nomeCondicao pode ter debitaCaixa diferente)
        const todasCondicoes = await prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { opcaoCondicao: true, tipoPagamento: true, nomeCondicao: true, debitaCaixa: true }
        });
        // Mapa por nomeCondicao (para classificar pagamento real pelo nome usado no checkout)
        const mapaCondicoesPorNome = Object.fromEntries(
            todasCondicoes.map(t => [t.nomeCondicao, t.debitaCaixa])
        );
        // Mapa por chave composta tipoPagamento|opcaoCondicao → evita colisão quando duas condições têm a mesma opcaoCondicao
        // Fallback: mapa simples por opcaoCondicao (caso tipoPagamento não esteja salvo no pedido)
        const mapaCondicoes = {};
        const mapaCondicoesPorOpcao = {};
        for (const t of todasCondicoes) {
            const chave = `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}`;
            if (!mapaCondicoes[chave]) {
                mapaCondicoes[chave] = { nome: t.nomeCondicao, debitaCaixa: t.debitaCaixa };
            }
            if (!mapaCondicoesPorOpcao[t.opcaoCondicao]) {
                mapaCondicoesPorOpcao[t.opcaoCondicao] = { nome: t.nomeCondicao, debitaCaixa: t.debitaCaixa };
            }
        }

        // 7. Classificar pagamentos e calcular totais
        // DEVOLVIDO não conta nos totais (mercadoria volta, motorista não recebeu dinheiro)
        // IMPORTANTE: classifica pelo nome do PAGAMENTO REAL (como motorista pagou), não pela condição original do pedido
        let totalRecebidoCaixa = 0;
        let totalRecebidoOutros = 0;
        let entreguesCount = 0, parciaisCount = 0, devolvidosCount = 0;
        const recebidoPorCondicao = {}; // { "À Vista - Dinheiro": 500, "7 dias - Boleto": 200, ... }

        const entregasFormatadas = entregas.map(e => {
            if (e.statusEntrega === 'ENTREGUE') entreguesCount++;
            else if (e.statusEntrega === 'ENTREGUE_PARCIAL') parciaisCount++;
            else if (e.statusEntrega === 'DEVOLVIDO') devolvidosCount++;

            const valorPedido = e.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0);
            const valorDevolvido = e.itensDevolvidos.reduce((s, i) => s + Number(i.valorBaseItem) * Number(i.quantidade), 0);

            // Condição original do pedido (para exibição) — usa nome salvo direto, com fallback para lookup por chave composta
            const chaveCondicao = `${e.tipoPagamento || ''}|${e.opcaoCondicaoPagamento || ''}`;
            const condicaoInfo = mapaCondicoes[chaveCondicao] || mapaCondicoesPorOpcao[e.opcaoCondicaoPagamento];
            const nomeCondicao = e.nomeCondicaoPagamento || condicaoInfo?.nome || e.opcaoCondicaoPagamento || 'Outros';

            // Devolvido: não conta nos totais de pagamento
            const isDevolvido = e.statusEntrega === 'DEVOLVIDO';

            const pagamentos = e.pagamentosReais.map(p => {
                // Classificar debitaCaixa pelo PAGAMENTO REAL (formaPagamentoNome)
                // 0. PIX Asaas confirmado pelo banco: dinheiro caiu direto na conta Asaas,
                //    nunca passou pela mão do motorista → NÃO debita (vai para "Outros")
                // 1. Escritório responsável: NÃO debita
                // 2. Vendedor responsável: DEBITA
                // 3. Condição da TabelaPreco: buscar pelo nome do pagamento real
                // 4. Fallback: condição original do pedido
                let debitaCaixa;
                let labelCondicao = p.formaPagamentoNome || nomeCondicao;
                if (p.formaPagamentoNome === 'PIX Asaas' && p.cobrancaAsaasId) {
                    debitaCaixa = false;
                } else if (p.escritorioResponsavel) {
                    debitaCaixa = false;
                } else if (p.vendedorResponsavelId) {
                    debitaCaixa = true;
                } else if (mapaCondicoesPorNome[p.formaPagamentoNome] !== undefined) {
                    // Buscar pela condição que o motorista REALMENTE selecionou no checkout
                    debitaCaixa = mapaCondicoesPorNome[p.formaPagamentoNome];
                } else {
                    // Fallback: condição original do pedido
                    debitaCaixa = condicaoInfo?.debitaCaixa || false;
                }
                const val = Number(p.valor);

                if (!isDevolvido) {
                    if (debitaCaixa) totalRecebidoCaixa += val;
                    else totalRecebidoOutros += val;

                    // Agrupar por condição/forma de pagamento
                    if (!recebidoPorCondicao[labelCondicao]) {
                        recebidoPorCondicao[labelCondicao] = { total: 0, debitaCaixa };
                    }
                    recebidoPorCondicao[labelCondicao].total += val;
                }

                return {
                    id: p.id,
                    formaNome: p.formaPagamentoNome,
                    valor: val,
                    debitaCaixa,
                    vendedorResponsavelId: p.vendedorResponsavelId,
                    escritorioResponsavel: p.escritorioResponsavel
                };
            });

            // Buscar conferência
            const conferencia = caixa.entregasConferidas.find(c => c.pedidoId === e.id);

            // Selo GPS: onde a entrega foi concluída em relação ao ponto do cliente
            // (📍✅ no ponto · 📍❗ fora · 📍➖ sem GPS; balcão não mostra selo)
            const gpsClientesService = require('../services/gpsClientesService');
            const seloGps = e.cliente?.gps?.balcao ? null : gpsClientesService.seloEntrega(e.gpsEntrega, e.cliente?.Ponto_GPS);

            return {
                pedidoId: e.id,
                numero: e.numero,
                especial: e.especial || false,
                seloGps,
                clienteNome: e.cliente?.NomeFantasia || e.cliente?.Nome || 'N/A',
                vendedorNome: e.vendedor?.nome,
                embarqueNumero: e.embarque?.numero,
                condicaoPagamento: nomeCondicao,
                valorPedido: Math.round(valorPedido * 100) / 100,
                statusEntrega: e.statusEntrega,
                dataEntrega: e.dataEntrega,
                divergenciaPagamento: e.divergenciaPagamento,
                pagamentos,
                valorDevolvido: Math.round(valorDevolvido * 100) / 100,
                itensDevolvidos: e.itensDevolvidos.map(i => ({
                    produto: i.produto?.nome,
                    quantidade: Number(i.quantidade)
                })),
                conferido: conferencia?.conferido || false,
                conferenciaId: conferencia?.id || null,
                quitado: (() => {
                    // Especial: usa status da ContaReceber local
                    if (e.contaReceber?.status === 'QUITADO' || e.contaReceber?.status === 'PARCIAL') return e.contaReceber.status;
                    // Normal (CA): verifica baixaCaRealizada
                    if (!e.baixaCaRealizada) return null;
                    // Baixa REAL no CA: dinheiro (caixinha) ou PIX Asaas (conta Asaas —
                    // dinheiro confirmado pelo banco; a Baixa CA do caixa baixa os dois).
                    // PIX comum/cartão só ALTERA a condição no CA (não há baixa).
                    const ehProprio = (p) => !p.vendedorResponsavelId && !p.escritorioResponsavel;
                    const temBaixaReal = pagamentos.some(p => ehProprio(p) && (
                        p.formaNome?.toLowerCase().includes('dinheiro') || p.formaNome?.toLowerCase() === 'pix asaas'
                    ));
                    if (temBaixaReal) return 'QUITADO';
                    return 'ALTERADO'; // só pix comum/cartão: condição alterada
                })(),
                devolucaoFinalizada: e.devolucaoFinalizada || false,
                idVendaContaAzul: e.idVendaContaAzul || null
            };
        });

        totalRecebidoCaixa = Math.round(totalRecebidoCaixa * 100) / 100;
        totalRecebidoOutros = Math.round(totalRecebidoOutros * 100) / 100;

        // 8. Amostras entregues no dia (informativo, sem valor financeiro)
        const amostrasEntregues = await prisma.amostra.findMany({
            where: {
                status: 'ENTREGUE',
                embarqueId: { not: null },
                embarque: { responsavelId: targetVendedor },
                updatedAt: { gte: inicioDia, lte: fimDia }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                lead: { select: { nomeEstabelecimento: true } },
                solicitadoPor: { select: { nome: true } },
                embarque: { select: { numero: true } },
                itens: { select: { nomeProduto: true, quantidade: true } }
            },
            orderBy: { updatedAt: 'asc' }
        });

        const amostrasFormatadas = amostrasEntregues.map(a => ({
            id: a.id,
            numero: a.numero,
            destinatario: a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '-',
            vendedorNome: a.solicitadoPor?.nome,
            embarqueNumero: a.embarque?.numero,
            itensCount: a.itens?.length || 0,
            itens: a.itens?.map(i => ({ nome: i.nomeProduto, quantidade: Number(i.quantidade) })) || []
        }));

        // Breakdown por condição (arredondar valores)
        const detalhamentoCaixa = Object.entries(recebidoPorCondicao).map(([nome, info]) => ({
            condicao: nome,
            valor: Math.round(info.total * 100) / 100,
            debitaCaixa: info.debitaCaixa
        }));

        // Faltas de devolução cobradas do motorista (conferência confirmada) somam ao valor a prestar
        const confDev = caixa.conferenciaDevolucao;
        const faltasDevolucao = confDev?.status === 'CONFERIDA' ? Math.round(Number(confDev.totalCobrado) * 100) / 100 : 0;
        // Parcial com itens devolvidos OU pedido devolvido inteiro (sem itens gravados no checkout)
        const temDevolucoesDia = entregas.some(e => (e.itensDevolvidos?.length || 0) > 0 || e.statusEntrega === 'DEVOLVIDO');

        // Cobranças em Rota do dia (títulos que este usuário cobrou na rua).
        // Dinheiro cobrado soma ao valor a prestar; a baixa da parcela sai pelo box
        // (POST /cobrancas-rota/baixar). NAO_COBRADA é só registro (não soma nada).
        const cobrancasRotaDia = await prisma.cobrancaRota.findMany({
            where: { cobradoPorId: targetVendedor, dataReferencia: { in: diasDoCaixaAtual } },
            include: {
                parcela: {
                    include: {
                        contaReceber: {
                            include: {
                                cliente: { select: { NomeFantasia: true, Nome: true } },
                                pedido: { select: { numero: true } }
                            }
                        }
                    }
                },
                embarque: { select: { numero: true } },
                cobradoPor: { select: { nome: true } }
            },
            orderBy: { cobradoEm: 'asc' }
        });
        const respVendIds = [...new Set(cobrancasRotaDia.map(c => c.responsavelVendedorId).filter(Boolean))];
        const respVendNomes = respVendIds.length > 0
            ? Object.fromEntries((await prisma.vendedor.findMany({ where: { id: { in: respVendIds } }, select: { id: true, nome: true } })).map(v => [v.id, v.nome]))
            : {};
        let cobrancasRotaDinheiro = 0;
        let cobrancasRotaOutros = 0;
        const cobrancasRotaFormatadas = cobrancasRotaDia.map(c => {
            const val = c.valorCobrado != null ? Number(c.valorCobrado) : 0;
            const ehDinheiro = (c.formaPagamentoNome || '').toLowerCase().includes('dinheiro');
            if (['COBRADA', 'BAIXADA'].includes(c.status)) {
                if (ehDinheiro) cobrancasRotaDinheiro += val;
                else cobrancasRotaOutros += val;
            }
            return {
                id: c.id,
                status: c.status,
                clienteNome: c.parcela?.contaReceber?.cliente?.NomeFantasia || c.parcela?.contaReceber?.cliente?.Nome || 'Cliente',
                pedidoNumero: c.parcela?.contaReceber?.pedido?.numero || null,
                numeroParcela: c.parcela?.numeroParcela,
                valorParcela: c.parcela ? Number(c.parcela.valor) : null,
                valorCobrado: c.valorCobrado != null ? Number(c.valorCobrado) : null,
                parcial: c.valorCobrado != null && c.parcela != null && Number(c.valorCobrado) < Number(c.parcela.valor) - 0.01,
                formaPagamentoNome: c.formaPagamentoNome,
                debitaCaixa: ehDinheiro,
                embarqueNumero: c.embarque?.numero || null,
                responsavelTipo: c.responsavelTipo,
                responsavelVendedorNome: c.responsavelVendedorId ? (respVendNomes[c.responsavelVendedorId] || null) : null,
                observacao: c.observacao || null,
                cobradoEm: c.cobradoEm,
                baixadoEm: c.baixadoEm
            };
        });
        cobrancasRotaDinheiro = Math.round(cobrancasRotaDinheiro * 100) / 100;
        cobrancasRotaOutros = Math.round(cobrancasRotaOutros * 100) / 100;
        const cobrancasRotaSemBaixa = cobrancasRotaDia.filter(c => c.status === 'COBRADA').length;

        // Recebimentos de títulos lançados NESTE caixa: baixa manual em espécie feita na
        // tela de Contas a Receber por este usuário. O dinheiro ficou com ele, então soma
        // ao valor a prestar igual à cobrança de rota (é o que impede baixar sem repassar).
        const recebimentosTitulosDia = await prisma.pagamentoParcela.findMany({
            where: { caixaDiarioId: caixa.id, estornado: false },
            select: {
                id: true, valorRecebido: true, formaPagamento: true, dataPagamento: true, createdAt: true,
                parcela: {
                    select: {
                        numeroParcela: true,
                        contaReceber: {
                            select: {
                                cliente: { select: { NomeFantasia: true, Nome: true } },
                                pedido: { select: { numero: true } }
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });
        const recebimentosTitulosFormatados = recebimentosTitulosDia.map(r => ({
            id: r.id,
            clienteNome: r.parcela?.contaReceber?.cliente?.NomeFantasia || r.parcela?.contaReceber?.cliente?.Nome || 'Cliente',
            pedidoNumero: r.parcela?.contaReceber?.pedido?.numero || null,
            numeroParcela: r.parcela?.numeroParcela || null,
            valor: Number(r.valorRecebido),
            formaPagamento: r.formaPagamento || null,
            lancadoEm: r.createdAt
        }));
        const recebimentosTitulosTotal = Math.round(
            recebimentosTitulosFormatados.reduce((s, r) => s + r.valor, 0) * 100
        ) / 100;

        const valorAPrestar = Math.round((Number(caixa.adiantamento) + totalRecebidoCaixa + faltasDevolucao + cobrancasRotaDinheiro + recebimentosTitulosTotal - totalDespesas) * 100) / 100;

        // Atendimentos do dia: registrados pelo vendedor OU em clientes que foram entregues na rota
        const clienteIdsEntreguesRes = [...new Set(entregas.filter(e => e.clienteId).map(e => e.clienteId))];
        const atendimentosDia = await prisma.atendimento.findMany({
            where: {
                criadoEm: { gte: inicioDia, lte: fimDia },
                tipo: { not: 'FINANCEIRO' },
                OR: [
                    { idVendedor: targetVendedor },
                    ...(clienteIdsEntreguesRes.length > 0 ? [{ clienteId: { in: clienteIdsEntreguesRes } }] : [])
                ]
            },
            include: {
                lead: { select: { nomeEstabelecimento: true, origemLead: true } },
                vendedor: { select: { nome: true } },
                usuarioRegistro: { select: { id: true, nome: true } }
            },
            orderBy: { criadoEm: 'asc' }
        });
        const clienteIdsAtend = atendimentosDia.filter(a => a.clienteId).map(a => a.clienteId);
        let mapaClientesAtend = {};
        if (clienteIdsAtend.length > 0) {
            const cs = await prisma.cliente.findMany({
                where: { UUID: { in: clienteIdsAtend } },
                select: { UUID: true, NomeFantasia: true, Nome: true }
            });
            mapaClientesAtend = Object.fromEntries(cs.map(c => [c.UUID, c.NomeFantasia || c.Nome]));
        }
        // Pedidos criados pelo vendedor no dia (createdAt no dia)
        const pedidosDoVendedorDia = await prisma.pedido.findMany({
            where: { vendedorId: targetVendedor, createdAt: { gte: inicioDia, lte: fimDia } },
            include: { cliente: { select: { NomeFantasia: true, Nome: true } } },
            orderBy: { createdAt: 'asc' }
        });

        // Clientes do dia da rota do vendedor que NÃO foram atendidos/pedidos/entregues
        const DIAS_SIGLA_BE = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const siglaDoDia = DIAS_SIGLA_BE[new Date(data + 'T12:00:00').getDay()];
        const clientesDoDia = await prisma.cliente.findMany({
            where: {
                idVendedor: targetVendedor,
                Ativo: true,
                Dia_de_venda: { contains: siglaDoDia, mode: 'insensitive' }
            },
            select: { UUID: true, NomeFantasia: true, Nome: true, Dia_de_venda: true, Ativo: true }
        });
        const atendidosIds = new Set([
            ...atendimentosDia.filter(a => a.clienteId).map(a => a.clienteId),
            ...pedidosDoVendedorDia.map(p => p.clienteId),
            ...entregas.filter(e => e.clienteId).map(e => e.clienteId)
        ]);
        const clientesNaoAtendidos = clientesDoDia
            .filter(c => c.Ativo !== false)
            .filter(c => !atendidosIds.has(c.UUID))
            // Dia_de_venda é "SEG,QUA" — validar match exato para evitar falso-positivo (ex: "DOMINGO")
            .filter(c => (c.Dia_de_venda || '').toUpperCase().split(',').map(s => s.trim()).includes(siglaDoDia))
            .map(c => ({
                clienteId: c.UUID,
                clienteNome: c.NomeFantasia || c.Nome,
                diaVenda: c.Dia_de_venda
            }));

        // Pendências para "deixar o dia certo" (escondem o VALOR A PRESTAR até serem resolvidas)
        // Só o que faz o dia estar incompleto operacionalmente — NÃO inclui financeiro (baixas/devoluções).
        const entregasPendentesDia = await prisma.pedido.count({
            where: {
                statusEntrega: 'PENDENTE',
                embarque: { responsavelId: targetVendedor, dataSaida: { gte: inicioDia, lte: fimDia } }
            }
        });
        const usouVeiculo = !!(diarioInfo && diarioInfo.modo === 'PRESENCIAL' && diarioInfo.veiculoId);
        const kmFinalFaltando = usouVeiculo && !diarioInfo.kmFinal;
        const atendimentosPendentesDia = clientesNaoAtendidos.length;
        const finalizacaoDia = {
            kmFinalFaltando,
            entregasPendentes: entregasPendentesDia,
            atendimentosPendentes: atendimentosPendentesDia,
            precisaFinalizar: kmFinalFaltando || entregasPendentesDia > 0 || atendimentosPendentesDia > 0
        };

        // Pendências para fechar caixa
        const devolucoesNaoFeitas = entregasFormatadas.filter(e =>
            ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada
        ).length;
        const quitacoesNaoFeitas = entregasFormatadas.filter(e => {
            if (e.statusEntrega === 'DEVOLVIDO') return false;
            if (e.quitado === 'QUITADO') return false;
            return e.pagamentos?.some(p =>
                p.debitaCaixa &&
                !p.vendedorResponsavelId &&
                !p.escritorioResponsavel &&
                p.formaNome?.toLowerCase().includes('dinheiro')
            );
        }).length;
        const conferenciaDevolucaoPendente = temDevolucoesDia && confDev?.status !== 'CONFERIDA';

        // ── Conferência do dinheiro (passo antes de fechar) ──
        const cfgConf = await cfgConferencia.get();
        const exigeConf = await cfgConferencia.exigeConferencia(data);
        const confDesatualizada = confService.conferenciaDesatualizada(caixa, valorAPrestar);
        const dinheiroConferidoValido = !!caixa.dinheiroConferido && !confDesatualizada;
        const souDono = targetVendedor === req.user.id;
        const conferenciaDinheiro = {
            exigida: exigeConf,
            ativa: !!cfgConf.ativo,
            estado: confService.estadoDoCaixa(caixa, valorAPrestar),
            enviadoEm: caixa.enviadoConferenciaEm,
            enviadoPorNome: caixa.enviadoConferenciaPorNome,
            enviadoOrigem: caixa.enviadoConferenciaOrigem,
            conferido: dinheiroConferidoValido,
            conferidoPorId: dinheiroConferidoValido ? caixa.dinheiroConferidoPorId : null,
            conferidoPorNome: dinheiroConferidoValido ? caixa.dinheiroConferidoPorNome : null,
            conferidoEm: dinheiroConferidoValido ? caixa.dinheiroConferidoEm : null,
            valorContado: dinheiroConferidoValido && caixa.valorContado != null ? Number(caixa.valorContado) : null,
            contagem: dinheiroConferidoValido ? caixa.contagemDinheiro : null,
            diferenca: dinheiroConferidoValido && caixa.diferencaConferencia != null ? Number(caixa.diferencaConferencia) : null,
            motivoDiferenca: dinheiroConferidoValido ? caixa.motivoDiferenca : null,
            autorizadoPorNome: dinheiroConferidoValido ? caixa.autorizadorDiferencaNome : null,
            observacao: dinheiroConferidoValido ? caixa.obsConferenciaDinheiro : null,
            // Conferência caiu porque o valor mudou depois de assinada
            desatualizada: confDesatualizada,
            valorNaConferencia: confDesatualizada && caixa.valorEsperadoConferencia != null ? Number(caixa.valorEsperadoConferencia) : null,
            // O que ESTE usuário pode fazer aqui
            podeConferir: confService.podeConferir(req._perms) && (!souDono || !!req._perms.admin),
            bloqueadoPorSerDono: souDono && confService.podeConferir(req._perms) && !req._perms.admin,
            minhaQuebra: Number((await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { quebraCaixa: true } }))?.quebraCaixa || 0),
            // Quem conferiu não fecha o mesmo caixa
            souQuemConferiu: exigeConf && dinheiroConferidoValido && caixa.dinheiroConferidoPorId === req.user.id && !req._perms.admin
        };
        const conferenciaDinheiroPendente = exigeConf && !dinheiroConferidoValido;

        res.json({
            caixa: {
                id: caixa.id,
                status: caixa.status,
                adiantamento: Number(caixa.adiantamento),
                adiantamentoPorId: caixa.adiantamentoPorId,
                adiantamentoPorNome: caixa.adiantamentoPorNome,
                adiantamentoEm: caixa.adiantamentoEm,
                dataReferencia: caixa.dataReferencia,
                conferidoPor: caixa.conferidoPor,
                conferidoEm: caixa.conferidoEm,
                obsAdmin: caixa.obsAdmin,
                fechadoPorNome: caixa.fechadoPorNome,
                fechadoEm: caixa.fechadoEm
            },
            conferenciaDinheiro,
            diario: diarioInfo,
            mediaCombustivel3Meses: mediaCombustivel3Meses,
            despesas,
            totalDespesas: Math.round(totalDespesas * 100) / 100,
            entregas: entregasFormatadas,
            contagens: {
                totalEntregas: entregas.length,
                entregues: entreguesCount,
                parciais: parciaisCount,
                devolvidos: devolvidosCount
            },
            totalRecebidoCaixa,
            totalRecebidoOutros,
            totalRecebido: Math.round((totalRecebidoCaixa + totalRecebidoOutros) * 100) / 100,
            detalhamentoCaixa,
            valorAPrestar,
            amostras: amostrasFormatadas,
            amostrasCount: amostrasFormatadas.length,
            atendimentos: atendimentosDia.map(a => ({
                tipo: a.tipo,
                clienteNome: a.clienteId ? (mapaClientesAtend[a.clienteId] || 'Cliente') : (a.lead?.nomeEstabelecimento || 'Lead'),
                leadNome: a.lead?.nomeEstabelecimento || null,
                canal: a.lead?.origemLead || null,
                pedidoId: a.pedidoId,
                observacao: a.observacao || null,
                vendedorNome: a.usuarioRegistro?.nome || a.vendedor?.nome || null,
                registradoPeloCaixaOwner: a.usuarioRegistro ? a.usuarioRegistro.id === targetVendedor : (a.idVendedor === targetVendedor),
                hora: a.criadoEm
            })),
            clientesNaoAtendidos,
            pedidosVendedor: pedidosDoVendedorDia.map(p => ({
                numero: p.numero,
                especial: p.especial || false,
                bonificacao: p.bonificacao || false,
                cancelado: p.statusEnvio === 'EXCLUIDO',
                clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || 'N/A',
                createdAt: p.createdAt,
                observacao: p.observacoes || null
            })),
            conferenciaDevolucao: {
                temDevolucoes: temDevolucoesDia || (faltasDevolucao > 0),
                status: confDev?.status || 'PENDENTE',
                totalCobrado: faltasDevolucao,
                conferidoPorNome: confDev?.conferidoPorNome || null,
                conferidoEm: confDev?.conferidoEm || null
            },
            faltasDevolucao,
            cobrancasRota: {
                itens: cobrancasRotaFormatadas,
                totalDinheiro: cobrancasRotaDinheiro,
                totalOutros: cobrancasRotaOutros,
                semBaixa: cobrancasRotaSemBaixa
            },
            recebimentosTitulos: {
                itens: recebimentosTitulosFormatados,
                total: recebimentosTitulosTotal
            },
            pendencias: {
                devolucoesNaoFeitas,
                quitacoesNaoFeitas,
                conferenciaDevolucaoPendente,
                cobrancasRotaSemBaixa,
                conferenciaDinheiroPendente,
                podeFechar: devolucoesNaoFeitas === 0 && quitacoesNaoFeitas === 0 && !conferenciaDevolucaoPendente
                    && cobrancasRotaSemBaixa === 0 && !conferenciaDinheiroPendente
            },
            finalizacaoDia
        });
    } catch (error) {
        console.error('Erro ao buscar resumo do caixa:', error);
        res.status(500).json({ error: 'Erro ao buscar resumo do caixa.' });
    }
});

// ── GET /pendente — Retorna caixa ABERTO de dia anterior (se existir) ──
router.get('/pendente', async (req, res) => {
    try {
        const targetVendedor = req.query.vendedorId || req.user.id;
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        const caixaPendente = await prisma.caixaDiario.findFirst({
            where: {
                vendedorId: targetVendedor,
                status: 'ABERTO',
                dataReferencia: { lt: hoje }
            },
            orderBy: { dataReferencia: 'desc' }
        });

        res.json(caixaPendente ? { pendente: true, dataReferencia: caixaPendente.dataReferencia } : { pendente: false });
    } catch (error) {
        console.error('Erro ao buscar caixa pendente:', error);
        res.status(500).json({ error: 'Erro ao buscar caixa pendente.' });
    }
});

// ── PATCH /adiantamento — Definir adiantamento ──
router.patch('/adiantamento', async (req, res) => {
    try {
        const { vendedorId, data, valor } = req.body;
        if (!data || valor === undefined) return res.status(400).json({ error: 'Campos obrigatórios: data, valor.' });

        // Espelha a permissão que o frontend usa para mostrar o campo (antes o backend não checava nada)
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Editar_Caixa && !perms.Pode_Definir_Adiantamento) {
            return res.status(403).json({ error: 'Sem permissão para definir adiantamento.' });
        }

        const targetVendedor = vendedorId || req.user.id;
        const novoValor = Math.round((Number(valor) || 0) * 100) / 100;

        const atual = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } }
        });
        const valorAtual = Math.round(Number(atual?.adiantamento || 0) * 100) / 100;

        // Nada mudou — não regrava nem loga
        if (atual && novoValor === valorAtual) return res.json(atual);

        // Caixa fechado/conferido não aceita mudança (espelha o campo desabilitado na tela)
        if (atual && atual.status !== 'ABERTO') {
            return res.status(400).json({ error: 'Caixa fechado — reabra o caixa para mudar o adiantamento.' });
        }

        // Alterar/zerar um adiantamento JÁ LANÇADO: só o autor, admin, ou quem tem a permissão própria.
        // (Caso do dia 16/07: alguém zerou R$ 200 sem rastro — agora tem dono, trava e log.)
        if (valorAtual > 0) {
            const podeAlterar = perms.admin
                || perms.Pode_Alterar_Adiantamento_Alheio
                || !atual.adiantamentoPorId // legado, sem autor registrado
                || atual.adiantamentoPorId === req.user.id;
            if (!podeAlterar) {
                return res.status(403).json({
                    error: `Este adiantamento de R$ ${valorAtual.toFixed(2)} foi lançado por ${atual.adiantamentoPorNome || 'outra pessoa'}. Só quem lançou (ou quem tem a permissão "Alterar Adiantamento de Outros") pode mudar.`
                });
            }
        }

        const usuario = await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } });
        const dadosAutor = {
            adiantamento: novoValor,
            adiantamentoPorId: req.user.id,
            adiantamentoPorNome: usuario?.nome || null,
            adiantamentoEm: new Date()
        };
        const caixa = await prisma.caixaDiario.upsert({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            update: dadosAutor,
            create: { vendedorId: targetVendedor, dataReferencia: data, ...dadosAutor }
        });

        // Log FORA da operação principal — falha no log não desfaz a mudança
        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'ALTERAR_ADIANTAMENTO',
                    entidade: 'CaixaDiario',
                    entidadeId: caixa.id,
                    detalhes: JSON.stringify({ vendedorId: targetVendedor, data, de: valorAtual, para: novoValor }),
                    usuarioId: req.user.id,
                    usuarioNome: usuario?.nome || 'Usuário'
                }
            });
        } catch (logErr) {
            console.error('[adiantamento] falha no audit log (mudança já gravada):', logErr.message);
        }

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao definir adiantamento:', error);
        res.status(500).json({ error: 'Erro ao definir adiantamento.' });
    }
});

// ── POST /fechar — Fechar caixa do dia (snapshot) ──
// ─────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA DO DINHEIRO — ações (dentro do acesso ao Caixa)
// ─────────────────────────────────────────────────────────────────────────

// ── POST /conferencia-dinheiro/enviar — manda o caixa para a fila ──
// Chamado pela impressão da folha (a folha é a prestação de contas) e pelo
// botão manual. Idempotente: reimprimir não reenvia nem muda nada.
router.post('/conferencia-dinheiro/enviar', async (req, res) => {
    try {
        const { vendedorId, data, origem } = req.body;
        if (!data) return res.status(400).json({ error: 'Campo "data" obrigatório.' });
        const targetVendedor = vendedorId || req.user.id;
        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa
            && !confService.podeConferir(req._perms) && !confService.podeFechar(req._perms)) {
            return res.status(403).json({ error: 'Sem permissão para enviar o caixa de outro usuário.' });
        }
        const r = await confService.enviarParaConferencia({
            vendedorId: targetVendedor, data,
            usuario: { id: req.user.id, nome: req.user.nome },
            origem: origem || 'MANUAL',
        });
        res.json(r);
    } catch (e) {
        console.error('Erro ao enviar caixa para conferência:', e);
        res.status(e.status || 500).json({ error: e.message || 'Erro ao enviar para conferência.' });
    }
});

// ── POST /conferencia-dinheiro/conferir — quem recebe o dinheiro assina ──
router.post('/conferencia-dinheiro/conferir', async (req, res) => {
    try {
        const { vendedorId, data, contagem, valorContado, observacao,
            motivoDiferenca, autorizadorId, autorizadorSenha } = req.body;
        if (!vendedorId || !data) return res.status(400).json({ error: 'Informe o caixa (vendedor e data).' });

        const r = await confService.conferirDinheiro({
            vendedorId, data,
            usuario: { id: req.user.id, nome: req.user.nome },
            perms: req._perms || await getPerms(req.user.id),
            contagem: contagem || null,
            valorContadoManual: valorContado,
            observacao, motivoDiferenca, autorizadorId, autorizadorSenha,
        });

        // Diferença vira aviso na agenda — o VALE em si é lançado à mão no
        // Contas a Pagar (decisão do dono). Nunca derruba a conferência.
        let tarefa = null;
        if (Math.abs(r.diferenca) > 0.009) {
            try {
                tarefa = await confService.sugerirTarefaDiferenca({
                    caixa: r.caixa, diferenca: r.diferenca, criadoPor: req.user,
                });
            } catch (tErr) {
                console.error('Falha ao criar tarefa da diferença (conferência já registrada):', tErr.message);
            }
        }
        res.json({ ...r, tarefa });
    } catch (e) {
        if (!e.status) console.error('Erro ao conferir o dinheiro:', e);
        res.status(e.status || 500).json({ error: e.message || 'Erro ao conferir o dinheiro.' });
    }
});

// ── POST /conferencia-dinheiro/desfazer — só quem conferiu (ou admin) ──
router.post('/conferencia-dinheiro/desfazer', async (req, res) => {
    try {
        const { vendedorId, data } = req.body;
        if (!vendedorId || !data) return res.status(400).json({ error: 'Informe o caixa (vendedor e data).' });
        const caixa = await confService.desfazerConferencia({
            vendedorId, data,
            usuario: { id: req.user.id, nome: req.user.nome },
            perms: req._perms || await getPerms(req.user.id),
        });
        res.json(caixa);
    } catch (e) {
        if (!e.status) console.error('Erro ao desfazer conferência:', e);
        res.status(e.status || 500).json({ error: e.message || 'Erro ao desfazer a conferência.' });
    }
});

router.post('/fechar', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Editar_Caixa && !perms.Pode_Fechar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para fechar o caixa.' });
        }

        const { vendedorId, data } = req.body;
        if (!data) return res.status(400).json({ error: 'Campo "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;

        // Sábado e domingo não têm caixa (com a regra ligada): o movimento é
        // prestado no caixa da segunda, então não há o que fechar aqui.
        const cfgDiasFechar = await cfgConferencia.get();
        if (cfgDiasFechar.soDiasUteis && ehFimDeSemana(data)) {
            return res.status(400).json({
                error: 'Sábado e domingo não têm caixa — o movimento do fim de semana é prestado no caixa da segunda-feira.'
            });
        }
        const { dias: diasFechar, inicio: inicioDia, fim: fimDia } = intervaloDoCaixa(data, cfgDiasFechar.soDiasUteis);

        // Buscar resumo para snapshot
        // Reutilizar lógica do resumo internamente
        const despesas = await prisma.despesa.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: { in: diasFechar } }
        });
        const totalDespesas = despesas.reduce((s, d) => s + Number(d.valor), 0);

        const entregas = await prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: inicioDia, lte: fimDia },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                embarque: { responsavelId: targetVendedor }
            },
            include: {
                pagamentosReais: { where: { valor: { gt: 0 } } },
                contaReceber: { select: { status: true } },
                cliente: { select: { NomeFantasia: true, Nome: true } },
                itensDevolvidos: { select: { id: true } }
            }
        });

        // ── Validações pré-fechamento ──
        const pendencias = [];

        // 1. Devoluções pendentes: entregas parciais/devolvidas sem devolução formalizada
        const devPendentes = entregas.filter(e =>
            ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada
        );
        if (devPendentes.length > 0) {
            const nomes = devPendentes.map(e => `#${e.numero || '?'} ${e.cliente?.NomeFantasia || e.cliente?.Nome || ''}`).join(', ');
            pendencias.push(`${devPendentes.length} devolução(ões) pendente(s): ${nomes}`);
        }

        // 2. Quitações pendentes: entregas com pagamento real em dinheiro/pix/cartão não quitadas
        const quitPendentes = entregas.filter(e => {
            if (e.statusEntrega === 'DEVOLVIDO') return false;
            // Especial: já quitado via ContaReceber local
            if (e.contaReceber?.status === 'QUITADO' || e.contaReceber?.status === 'PARCIAL') return false;
            // Normal (CA): já processado via quitar-ca (baixa ou alteração de condição)
            if (e.baixaCaRealizada) return false;
            const n = (p) => (p.formaPagamentoNome || '').toLowerCase();
            return e.pagamentosReais.some(p =>
                !p.vendedorResponsavelId &&
                !p.escritorioResponsavel &&
                (n(p).includes('dinheiro') || n(p).includes('pix') || n(p).includes('cartão') || n(p).includes('cartao'))
            );
        });
        if (quitPendentes.length > 0) {
            const nomes = quitPendentes.map(e => `#${e.numero || '?'} ${e.cliente?.NomeFantasia || e.cliente?.Nome || ''}`).join(', ');
            pendencias.push(`${quitPendentes.length} baixa(s) de dinheiro pendente(s): ${nomes}`);
        }

        // 3. Conferência de devoluções: se o dia teve devolução, precisa estar confirmada
        const caixaExistente = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { conferenciaDevolucao: true }
        });
        const temDevolucoesFechar = entregas.some(e => (e.itensDevolvidos?.length || 0) > 0 || e.statusEntrega === 'DEVOLVIDO');
        const confDevFechar = caixaExistente?.conferenciaDevolucao;
        if (temDevolucoesFechar && confDevFechar?.status !== 'CONFERIDA') {
            pendencias.push('Conferência de devoluções pendente: confira a mercadoria que voltou antes de fechar o caixa.');
        }

        // 4. Cobranças em Rota do dia sem baixa: precisam ser baixadas pelo box antes de fechar
        const cobrancasRotaFecharDia = await prisma.cobrancaRota.findMany({
            where: { cobradoPorId: targetVendedor, dataReferencia: { in: diasFechar } },
            select: { status: true, valorCobrado: true, formaPagamentoNome: true }
        });
        const cobrancasSemBaixaFechar = cobrancasRotaFecharDia.filter(c => c.status === 'COBRADA').length;
        if (cobrancasSemBaixaFechar > 0) {
            pendencias.push(`${cobrancasSemBaixaFechar} cobrança(s) de rota sem baixa: baixe os títulos cobrados na rua antes de fechar o caixa.`);
        }

        // 5. Conferência do DINHEIRO: alguém tem que ter contado e assinado.
        //    Vale inclusive para caixa de R$ 0,00. Só é exigido com a chave ligada
        //    (Configurações → Caixa) — sem isso o fechamento segue como sempre foi.
        const exigeConfDinheiro = await cfgConferencia.exigeConferencia(data);
        if (exigeConfDinheiro) {
            const calcConf = await confService.calcularValorAPrestar(targetVendedor, data);
            const confValida = caixaExistente?.dinheiroConferido
                && !confService.conferenciaDesatualizada(caixaExistente, calcConf.valorAPrestar);

            if (!caixaExistente?.dinheiroConferido) {
                pendencias.push('Dinheiro ainda não conferido: alguém precisa contar e confirmar o valor antes de fechar o caixa.');
            } else if (!confValida) {
                pendencias.push(
                    `O valor mudou depois da conferência (era R$ ${Number(caixaExistente.valorEsperadoConferencia).toFixed(2)}, ` +
                    `agora é R$ ${calcConf.valorAPrestar.toFixed(2)}): o dinheiro precisa ser conferido de novo.`
                );
            } else if (caixaExistente.dinheiroConferidoPorId === req.user.id && !perms.admin) {
                // Dois pares de olhos: quem contou o dinheiro não é quem fecha.
                return res.status(403).json({
                    error: 'Você conferiu o dinheiro deste caixa — o fechamento é de outra pessoa.',
                    pendencias: [],
                });
            }
        }

        if (pendencias.length > 0) {
            return res.status(400).json({
                error: `Não é possível fechar o caixa. Pendências:\n${pendencias.join('\n')}`,
                pendencias,
                devolucoesIds: devPendentes.map(e => e.id),
                quitacoesIds: quitPendentes.map(e => e.id)
            });
        }

        // Buscar TODAS as condições da TabelaPreco (sem distinct)
        const todasCondicoesFechar = await prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { opcaoCondicao: true, nomeCondicao: true, debitaCaixa: true }
        });
        const mapaDebitaPorNome = Object.fromEntries(todasCondicoesFechar.map(t => [t.nomeCondicao, t.debitaCaixa]));
        const mapaDebitaPorOpcao = {};
        for (const t of todasCondicoesFechar) {
            if (!mapaDebitaPorOpcao[t.opcaoCondicao]) mapaDebitaPorOpcao[t.opcaoCondicao] = t.debitaCaixa;
        }

        let totalRecebidoCaixa = 0;
        let totalRecebidoOutros = 0;

        entregas.forEach(e => {
            // Devolvido não conta (mercadoria volta, motorista não recebeu)
            if (e.statusEntrega === 'DEVOLVIDO') return;

            e.pagamentosReais.forEach(p => {
                const val = Number(p.valor);
                let debita;
                // PIX Asaas confirmado pelo banco não passa pela mão do motorista
                if (p.formaPagamentoNome === 'PIX Asaas' && p.cobrancaAsaasId) debita = false;
                else if (p.escritorioResponsavel) debita = false;
                else if (p.vendedorResponsavelId) debita = true;
                else if (mapaDebitaPorNome[p.formaPagamentoNome] !== undefined) debita = mapaDebitaPorNome[p.formaPagamentoNome];
                else debita = mapaDebitaPorOpcao[e.opcaoCondicaoPagamento] || false;

                if (debita) totalRecebidoCaixa += val;
                else totalRecebidoOutros += val;
            });
        });

        // Snapshot do valor a prestar — mesma fórmula do /resumo:
        // adiantamento + recebido em caixa + faltas de devolução + cobranças de rota em dinheiro
        // + recebimentos de títulos lançados neste caixa − despesas
        const adiantamentoFechar = Number(caixaExistente?.adiantamento || 0);
        const faltasDevolucaoFechar = confDevFechar?.status === 'CONFERIDA' ? Number(confDevFechar.totalCobrado) : 0;
        const cobrancasDinheiroFechar = cobrancasRotaFecharDia
            .filter(c => ['COBRADA', 'BAIXADA'].includes(c.status) && (c.formaPagamentoNome || '').toLowerCase().includes('dinheiro'))
            .reduce((s, c) => s + Number(c.valorCobrado || 0), 0);
        const recebimentosTitulosFechar = caixaExistente
            ? (await prisma.pagamentoParcela.aggregate({
                where: { caixaDiarioId: caixaExistente.id, estornado: false },
                _sum: { valorRecebido: true }
            }))._sum.valorRecebido || 0
            : 0;
        const valorAPrestarFechar = Math.round((adiantamentoFechar + totalRecebidoCaixa + faltasDevolucaoFechar + cobrancasDinheiroFechar + Number(recebimentosTitulosFechar) - totalDespesas) * 100) / 100;

        const caixa = await prisma.caixaDiario.upsert({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            update: {
                status: 'FECHADO',
                fechadoPorId: req.user.id,
                fechadoPorNome: req.user.nome || null,
                fechadoEm: new Date(),
                totalDespesas: Math.round(totalDespesas * 100) / 100,
                totalRecebidoCaixa: Math.round(totalRecebidoCaixa * 100) / 100,
                totalRecebidoOutros: Math.round(totalRecebidoOutros * 100) / 100,
                valorAPrestar: valorAPrestarFechar
            },
            create: {
                vendedorId: targetVendedor,
                dataReferencia: data,
                status: 'FECHADO',
                fechadoPorId: req.user.id,
                fechadoPorNome: req.user.nome || null,
                fechadoEm: new Date(),
                totalDespesas: Math.round(totalDespesas * 100) / 100,
                totalRecebidoCaixa: Math.round(totalRecebidoCaixa * 100) / 100,
                totalRecebidoOutros: Math.round(totalRecebidoOutros * 100) / 100,
                valorAPrestar: valorAPrestarFechar
            }
        });

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao fechar caixa:', error);
        res.status(500).json({ error: 'Erro ao fechar caixa.' });
    }
});

// ── POST /conferir — Admin confere o caixa ──
router.post('/conferir', checkEditor, async (req, res) => {
    try {
        const { id, obsAdmin } = req.body;
        if (!id) return res.status(400).json({ error: 'ID do caixa obrigatório.' });

        const caixa = await prisma.caixaDiario.update({
            where: { id },
            data: {
                status: 'CONFERIDO',
                conferidoPor: req.user.id,
                conferidoEm: new Date(),
                obsAdmin: obsAdmin || null
            }
        });

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao conferir caixa:', error);
        res.status(500).json({ error: 'Erro ao conferir caixa.' });
    }
});

// ── POST /reverter-conferencia — Reverte CONFERIDO → FECHADO ──
router.post('/reverter-conferencia', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Reverter_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para reverter caixa.' });
        }

        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID do caixa obrigatório.' });

        const caixaAtual = await prisma.caixaDiario.findUnique({
            where: { id },
            include: { vendedor: { select: { nome: true } } }
        });
        if (!caixaAtual) return res.status(404).json({ error: 'Caixa não encontrado.' });
        if (caixaAtual.status !== 'CONFERIDO') {
            return res.status(400).json({ error: 'Caixa não está conferido.' });
        }

        const [caixa] = await prisma.$transaction([
            prisma.caixaDiario.update({
                where: { id },
                data: {
                    status: 'FECHADO',
                    conferidoPor: null,
                    conferidoEm: null,
                    obsAdmin: null
                }
            }),
            prisma.auditLog.create({
                data: {
                    acao: 'REVERTER_CONFERENCIA',
                    entidade: 'CaixaDiario',
                    entidadeId: id,
                    detalhes: JSON.stringify({
                        vendedor: caixaAtual.vendedor?.nome,
                        vendedorId: caixaAtual.vendedorId,
                        data: caixaAtual.dataReferencia,
                        statusAnterior: 'CONFERIDO',
                        statusNovo: 'FECHADO'
                    }),
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || 'Admin'
                }
            })
        ]);

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao reverter conferência:', error);
        res.status(500).json({ error: 'Erro ao reverter conferência.' });
    }
});

// ── POST /reabrir — Reverte FECHADO → ABERTO ──
router.post('/reabrir', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Reverter_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para reabrir caixa.' });
        }

        const { id, motivo } = req.body;
        if (!id) return res.status(400).json({ error: 'ID do caixa obrigatório.' });

        const caixaAtual = await prisma.caixaDiario.findUnique({
            where: { id },
            include: { vendedor: { select: { nome: true } } }
        });
        if (!caixaAtual) return res.status(404).json({ error: 'Caixa não encontrado.' });
        if (caixaAtual.status !== 'FECHADO') {
            return res.status(400).json({ error: 'Caixa não está fechado.' });
        }

        // Caixa fechado não se altera: para mexer, reabre — e aí o dinheiro tem
        // que ser conferido de novo antes de fechar (a conferência cai aqui).
        const exigeConfReabrir = await cfgConferencia.exigeConferencia(caixaAtual.dataReferencia);
        if (exigeConfReabrir && !String(motivo || '').trim()) {
            return res.status(400).json({ error: 'Explique o motivo da reabertura (fica registrado e volta para quem conferiu).' });
        }

        const [caixa] = await prisma.$transaction([
            prisma.caixaDiario.update({
                where: { id },
                data: {
                    status: 'ABERTO',
                    totalDespesas: null,
                    totalRecebidoCaixa: null,
                    totalRecebidoOutros: null,
                    valorAPrestar: null,
                    reabertoMotivo: String(motivo || '').trim() || null,
                    fechadoPorId: null,
                    fechadoPorNome: null,
                    fechadoEm: null,
                    // Devolve para a fila de quem confere (conferência anterior perde a validade)
                    ...(exigeConfReabrir ? {
                        dinheiroConferido: false,
                        dinheiroConferidoPorId: null,
                        dinheiroConferidoPorNome: null,
                        dinheiroConferidoEm: null,
                        valorEsperadoConferencia: null,
                        valorContado: null,
                        contagemDinheiro: null,
                        diferencaConferencia: null,
                        autorizadorDiferencaId: null,
                        autorizadorDiferencaNome: null,
                    } : {})
                }
            }),
            prisma.auditLog.create({
                data: {
                    acao: 'REABRIR_CAIXA',
                    entidade: 'CaixaDiario',
                    entidadeId: id,
                    detalhes: JSON.stringify({
                        vendedor: caixaAtual.vendedor?.nome,
                        vendedorId: caixaAtual.vendedorId,
                        data: caixaAtual.dataReferencia,
                        statusAnterior: 'FECHADO',
                        statusNovo: 'ABERTO',
                        motivo: String(motivo || '').trim() || null,
                        conferenciaCancelada: exigeConfReabrir && caixaAtual.dinheiroConferido
                            ? caixaAtual.dinheiroConferidoPorNome : null
                    }),
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || 'Admin'
                }
            })
        ]);

        res.json(caixa);
    } catch (error) {
        console.error('Erro ao reabrir caixa:', error);
        res.status(500).json({ error: 'Erro ao reabrir caixa.' });
    }
});

// ── POST /reabrir-pendentes — Reabre caixas FECHADOS que têm pendências ──
router.post('/reabrir-pendentes', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin) return res.status(403).json({ error: 'Apenas admin.' });

        // Buscar caixas FECHADOS (não CONFERIDO, pois esse já foi validado)
        const caixasFechados = await prisma.caixaDiario.findMany({
            where: { status: 'FECHADO' },
            include: { vendedor: { select: { id: true, nome: true } } }
        });

        const reabertos = [];

        for (const cx of caixasFechados) {
            const inicioDia = new Date(cx.dataReferencia + 'T00:00:00.000Z');
            const fimDia = new Date(cx.dataReferencia + 'T23:59:59.999Z');

            const entregas = await prisma.pedido.findMany({
                where: {
                    dataEntrega: { gte: inicioDia, lte: fimDia },
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                    embarque: { responsavelId: cx.vendedorId }
                },
                include: {
                    pagamentosReais: { where: { valor: { gt: 0 } } },
                    contaReceber: { select: { status: true } }
                }
            });

            const devPendentes = entregas.filter(e =>
                ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada
            );
            const quitPendentes = entregas.filter(e => {
                if (e.statusEntrega === 'DEVOLVIDO') return false;
                if (e.contaReceber?.status === 'QUITADO' || e.contaReceber?.status === 'PARCIAL') return false;
                if (e.baixaCaRealizada) return false;
                const n = (p) => (p.formaPagamentoNome || '').toLowerCase();
                return e.pagamentosReais.some(p =>
                    !p.vendedorResponsavelId &&
                    !p.escritorioResponsavel &&
                    (n(p).includes('dinheiro') || n(p).includes('pix') || n(p).includes('cartão') || n(p).includes('cartao'))
                );
            });

            if (devPendentes.length > 0 || quitPendentes.length > 0) {
                await prisma.caixaDiario.update({
                    where: { id: cx.id },
                    data: { status: 'ABERTO' }
                });
                reabertos.push({
                    data: cx.dataReferencia,
                    vendedor: cx.vendedor?.nome,
                    devolucoesP: devPendentes.length,
                    quitacoesP: quitPendentes.length
                });
            }
        }

        res.json({ reabertos: reabertos.length, detalhes: reabertos });
    } catch (error) {
        console.error('Erro ao reabrir caixas pendentes:', error);
        res.status(500).json({ error: 'Erro ao verificar caixas.' });
    }
});

// ── PATCH /entrega-conferir — Marcar entrega como conferida ──
router.patch('/entrega-conferir', checkEditor, async (req, res) => {
    try {
        const { caixaId, pedidoId, conferido } = req.body;
        if (!caixaId || !pedidoId) return res.status(400).json({ error: 'caixaId e pedidoId obrigatórios.' });

        const record = await prisma.caixaEntregaConferida.upsert({
            where: { caixaDiarioId_pedidoId: { caixaDiarioId: caixaId, pedidoId } },
            update: {
                conferido: conferido !== undefined ? conferido : true,
                conferidoPor: req.user.id,
                conferidoEm: new Date()
            },
            create: {
                caixaDiarioId: caixaId,
                pedidoId,
                conferido: conferido !== undefined ? conferido : true,
                conferidoPor: req.user.id,
                conferidoEm: new Date()
            }
        });

        res.json(record);
    } catch (error) {
        console.error('Erro ao conferir entrega:', error);
        res.status(500).json({ error: 'Erro ao conferir entrega.' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// CONFERÊNCIA DE DEVOLUÇÕES
// O que o motorista marcou como devolvido nas entregas tem que voltar
// fisicamente. Quem tem Pode_Conferir_Devolucao_Caixa conta a mercadoria;
// falta sem autorização vira cobrança pela tabela do motorista (soma ao
// valor a prestar). Desconsiderar falta exige senha de quem tem
// Pode_Autorizar_Desconsiderar_Devolucao.
// ═══════════════════════════════════════════════════════════════════════════

const PERM_CONFERIR_DEV = 'Pode_Conferir_Devolucao_Caixa';
const PERM_AUTORIZAR_DEV = 'Pode_Autorizar_Desconsiderar_Devolucao';

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const round3 = (n) => Math.round(Number(n) * 1000) / 1000;

// Devoluções esperadas nas entregas do dia do vendedor, agrupadas por produto.
// Duas fontes:
// - ENTREGUE_PARCIAL → itens que o motorista marcou como devolvidos (EntregaItemDevolvido)
// - DEVOLVIDO (pedido inteiro) → o checkout NÃO grava itens; a devolução total
//   significa que TODOS os itens do pedido têm que voltar no caminhão
const buscarDevolucoesEsperadas = async (vendedorId, data) => {
    const inicioDia = new Date(data + 'T00:00:00.000Z');
    const fimDia = new Date(data + 'T23:59:59.999Z');
    const pedidos = await prisma.pedido.findMany({
        where: {
            dataEntrega: { gte: inicioDia, lte: fimDia },
            embarque: { responsavelId: vendedorId },
            OR: [
                { statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] }, itensDevolvidos: { some: {} } },
                { statusEntrega: 'DEVOLVIDO' }
            ]
        },
        select: {
            id: true,
            numero: true,
            statusEntrega: true,
            cliente: { select: { NomeFantasia: true, Nome: true } },
            itensDevolvidos: {
                include: { produto: { select: { id: true, nome: true, unidade: true, valorVenda: true } } }
            },
            itens: {
                include: { produto: { select: { id: true, nome: true, unidade: true, valorVenda: true } } }
            }
        }
    });

    const porProduto = new Map();
    const acumular = (pedido, clienteNome, produtoId, produto, quantidade) => {
        if (!porProduto.has(produtoId)) {
            porProduto.set(produtoId, {
                produtoId,
                produtoNome: produto?.nome || 'Produto',
                unidade: produto?.unidade || null,
                valorVendaBase: Number(produto?.valorVenda || 0),
                qtdEsperada: 0,
                pedidosOrigem: []
            });
        }
        const g = porProduto.get(produtoId);
        g.qtdEsperada = round3(g.qtdEsperada + Number(quantidade));
        g.pedidosOrigem.push({
            pedidoId: pedido.id,
            numero: pedido.numero,
            cliente: clienteNome,
            quantidade: Number(quantidade)
        });
    };

    for (const p of pedidos) {
        const clienteNome = p.cliente?.NomeFantasia || p.cliente?.Nome || 'N/A';
        if (p.itensDevolvidos.length > 0) {
            for (const item of p.itensDevolvidos) {
                acumular(p, clienteNome, item.produtoId, item.produto, item.quantidade);
            }
        } else if (p.statusEntrega === 'DEVOLVIDO') {
            // Devolução total sem itens gravados: tudo do pedido deveria voltar
            for (const item of (p.itens || [])) {
                acumular(p, clienteNome, item.produtoId, item.produto, item.quantidade);
            }
        }
    }
    return [...porProduto.values()];
};

// Tabela de preço usada para cobrar faltas do motorista (config no cadastro do vendedor;
// padrão: tabela "funcionário" ativa; último recurso: preço base do produto)
const buscarTabelaCobranca = async (vendedorId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: vendedorId },
        select: { tabelaCobrancaFaltaId: true }
    });
    let tabela = null;
    if (vendedor?.tabelaCobrancaFaltaId) {
        tabela = await prisma.tabelaPreco.findFirst({
            where: { OR: [{ id: vendedor.tabelaCobrancaFaltaId }, { idCondicao: vendedor.tabelaCobrancaFaltaId }] }
        });
    }
    if (!tabela) {
        tabela = await prisma.tabelaPreco.findFirst({
            where: { ativo: true, nomeCondicao: { contains: 'funcion', mode: 'insensitive' } }
        });
    }
    return tabela;
};

const precoNaTabela = (valorVenda, tabela) =>
    round2(Number(valorVenda || 0) * (1 + Number(tabela?.acrescimoPreco || 0) / 100));

const getCaixaDoDia = (vendedorId, data) => prisma.caixaDiario.upsert({
    where: { vendedorId_dataReferencia: { vendedorId, dataReferencia: data } },
    update: {},
    create: { vendedorId, dataReferencia: data }
});

// Grava a desconsideração de uma falta no item da conferência.
// Usado tanto pela autorização inline ("autorizar eu mesmo") quanto pela
// autorização à distância aprovada no pop-up do responsável.
// `autorizador` = { id, nome } de quem de fato liberou (o dono da senha).
const aplicarDesconsideracao = async ({ targetVendedor, data, produtoId, quantidade, motivo, autorizador, digitadoPor }) => {
    const esperadas = await buscarDevolucoesEsperadas(targetVendedor, data);
    const esperado = esperadas.find(e => e.produtoId === produtoId);
    if (!esperado) { const e = new Error('Produto sem devolução registrada neste dia.'); e.status = 400; throw e; }

    const qtdFinal = Math.min(round3(Number(quantidade)), esperado.qtdEsperada);

    const caixa = await getCaixaDoDia(targetVendedor, data);
    let conf = await prisma.caixaConferenciaDevolucao.findUnique({ where: { caixaDiarioId: caixa.id } });
    if (conf?.status === 'CONFERIDA') { const e = new Error('Conferência já confirmada. Reabra a conferência para alterar.'); e.status = 400; throw e; }
    if (!conf) conf = await prisma.caixaConferenciaDevolucao.create({ data: { caixaDiarioId: caixa.id } });

    const dados = {
        qtdEsperada: esperado.qtdEsperada,
        qtdDesconsiderada: qtdFinal,
        motivoDesconsiderar: (motivo || '').trim() || null,
        autorizadoPorId: autorizador.id,
        autorizadoPorNome: autorizador.nome,
        autorizadoEm: new Date(),
        pedidosOrigem: esperado.pedidosOrigem
    };
    await prisma.caixaConferenciaDevolucaoItem.upsert({
        where: { conferenciaId_produtoId: { conferenciaId: conf.id, produtoId } },
        update: dados,
        create: { conferenciaId: conf.id, produtoId, produtoNome: esperado.produtoNome, ...dados }
    });

    // Log de auditoria FORA da operação principal — falha no log não desfaz a autorização
    try {
        await prisma.auditLog.create({
            data: {
                acao: 'AUTORIZAR_DESCONSIDERAR_DEVOLUCAO',
                entidade: 'CaixaConferenciaDevolucao',
                entidadeId: conf.id,
                detalhes: JSON.stringify({
                    vendedorId: targetVendedor, data, produto: esperado.produtoNome,
                    quantidade: qtdFinal, motivo: dados.motivoDesconsiderar, digitadoPor: digitadoPor || autorizador.id
                }),
                usuarioId: autorizador.id, usuarioNome: autorizador.nome
            }
        });
    } catch (logErr) {
        console.error('[conferencia-devolucao] falha no audit log (autorização já gravada):', logErr.message);
    }
    return { qtdFinal, produtoNome: esperado.produtoNome };
};

// ── GET /conferencia-devolucao — Estado da conferência do dia ──
router.get('/conferencia-devolucao', async (req, res) => {
    try {
        const { data, vendedorId } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;
        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa && !req._perms[PERM_CONFERIR_DEV]) {
            return res.status(403).json({ error: 'Sem permissão para ver caixa de outro usuário.' });
        }

        const esperadas = await buscarDevolucoesEsperadas(targetVendedor, data);
        const caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { conferenciaDevolucao: { include: { itens: true } } }
        });
        const conf = caixa?.conferenciaDevolucao || null;
        const tabela = await buscarTabelaCobranca(targetVendedor);

        // Estado dos pedidos de autorização à distância (pendente/rejeitado) por produto
        const solicitacoes = await prisma.autorizacaoDevolucao.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: data, status: { in: ['PENDENTE', 'REJEITADA'] } },
            orderBy: { createdAt: 'desc' }
        });
        const solicPorProduto = new Map(); // produto → mais recente (PENDENTE tem prioridade)
        for (const s of solicitacoes) {
            const atual = solicPorProduto.get(s.produtoId);
            if (!atual || (atual.status !== 'PENDENTE' && s.status === 'PENDENTE')) {
                solicPorProduto.set(s.produtoId, s);
            }
        }
        const solicInfo = (produtoId) => {
            const s = solicPorProduto.get(produtoId);
            if (!s) return null;
            return {
                id: s.id,
                status: s.status,
                autorizadorNome: s.autorizadorNome,
                quantidade: Number(s.quantidade),
                motivo: s.motivo,
                motivoRejeicao: s.motivoRejeicao
            };
        };

        const itensSalvos = new Map((conf?.itens || []).map(i => [i.produtoId, i]));
        const itens = esperadas.map(e => {
            const s = itensSalvos.get(e.produtoId);
            return {
                produtoId: e.produtoId,
                produtoNome: e.produtoNome,
                unidade: e.unidade,
                qtdEsperada: e.qtdEsperada,
                pedidosOrigem: e.pedidosOrigem,
                valorUnitCobranca: s?.valorUnitCobranca != null ? Number(s.valorUnitCobranca) : precoNaTabela(e.valorVendaBase, tabela),
                qtdRecebida: s ? Number(s.qtdRecebida) : null,
                qtdDesconsiderada: s ? Number(s.qtdDesconsiderada) : 0,
                qtdCobrada: s ? Number(s.qtdCobrada) : 0,
                valorCobrado: s ? Number(s.valorCobrado) : 0,
                motivoDesconsiderar: s?.motivoDesconsiderar || null,
                autorizadoPorNome: s?.autorizadoPorNome || null,
                autorizadoEm: s?.autorizadoEm || null,
                solicitacao: solicInfo(e.produtoId),
                sobra: false
            };
        });

        // Sobras registradas (voltou sem devolução registrada)
        const idsEsperados = new Set(esperadas.map(e => e.produtoId));
        for (const s of (conf?.itens || [])) {
            if (idsEsperados.has(s.produtoId)) continue;
            itens.push({
                produtoId: s.produtoId,
                produtoNome: s.produtoNome,
                unidade: null,
                qtdEsperada: 0,
                pedidosOrigem: Array.isArray(s.pedidosOrigem) ? s.pedidosOrigem : [],
                valorUnitCobranca: s.valorUnitCobranca != null ? Number(s.valorUnitCobranca) : null,
                qtdRecebida: Number(s.qtdRecebida),
                qtdDesconsiderada: 0,
                qtdCobrada: 0,
                valorCobrado: 0,
                motivoDesconsiderar: null,
                autorizadoPorNome: null,
                autorizadoEm: null,
                sobra: true
            });
        }

        // Quem pode autorizar desconsiderar (lista do modal de autorização)
        const vendedoresAtivos = await prisma.vendedor.findMany({
            where: { ativo: true },
            select: { id: true, nome: true, permissoes: true },
            orderBy: { nome: 'asc' }
        });
        const autorizadores = vendedoresAtivos
            .filter(v => {
                const p = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {});
                return p.admin || p[PERM_AUTORIZAR_DEV];
            })
            .map(v => ({ id: v.id, nome: v.nome }));

        res.json({
            temDevolucoes: esperadas.length > 0 || (conf?.itens?.length || 0) > 0,
            status: conf?.status || 'PENDENTE',
            conferidoPorNome: conf?.conferidoPorNome || null,
            conferidoEm: conf?.conferidoEm || null,
            totalCobrado: Number(conf?.totalCobrado || 0),
            tabelaCobranca: tabela ? { id: tabela.id, nome: tabela.nomeCondicao } : null,
            itens,
            autorizadores,
            temSolicitacaoPendente: [...solicPorProduto.values()].some(s => s.status === 'PENDENTE'),
            podeConferir: !!(req._perms.admin || req._perms[PERM_CONFERIR_DEV]),
            podeAutorizarEuMesmo: !!(req._perms.admin || req._perms[PERM_AUTORIZAR_DEV])
        });
    } catch (error) {
        console.error('Erro ao buscar conferência de devoluções:', error);
        res.status(500).json({ error: 'Erro ao buscar conferência de devoluções.' });
    }
});

// ── POST /conferencia-devolucao/autorizar — "Autorizar eu mesmo" ──
// Só o PRÓPRIO usuário logado (que tem a permissão de autorizar) libera aqui,
// digitando a própria senha. Para autorizar OUTRA pessoa, use o pedido de
// autorização (/solicitar-autorizacao → pop-up no app do responsável).
router.post('/conferencia-devolucao/autorizar', async (req, res) => {
    try {
        if (!req._perms.admin && !req._perms[PERM_CONFERIR_DEV] && !req._perms[PERM_AUTORIZAR_DEV]) {
            return res.status(403).json({ error: 'Sem permissão para autorizar devoluções.' });
        }

        const { vendedorId, data, produtoId, quantidade, motivo, autorizadorId, senha } = req.body;
        if (!data || !produtoId || !senha) {
            return res.status(400).json({ error: 'Campos obrigatórios: data, produtoId, senha.' });
        }
        // Autorização inline vale só para si mesmo
        if (autorizadorId && autorizadorId !== req.user.id) {
            return res.status(403).json({ error: 'Para autorizar outra pessoa, envie um pedido de autorização.' });
        }
        const qtd = Number(quantidade);
        if (!(qtd > 0)) return res.status(400).json({ error: 'Quantidade a desconsiderar deve ser maior que zero.' });

        const targetVendedor = vendedorId || req.user.id;

        // Valida o próprio usuário: ativo + permissão de autorizar + senha do próprio login
        const autorizador = await prisma.vendedor.findUnique({ where: { id: req.user.id } });
        if (!autorizador || !autorizador.ativo) {
            return res.status(403).json({ error: 'Usuário inválido ou inativo.' });
        }
        const permsAut = typeof autorizador.permissoes === 'string'
            ? JSON.parse(autorizador.permissoes)
            : (autorizador.permissoes || {});
        if (!permsAut.admin && !permsAut[PERM_AUTORIZAR_DEV]) {
            return res.status(403).json({ error: 'Você não tem permissão para autorizar desconsiderar devolução.' });
        }
        if (!autorizador.senha) {
            return res.status(403).json({ error: 'Sem senha configurada no app.' });
        }
        const senhaValida = await bcrypt.compare(senha, autorizador.senha);
        if (!senhaValida) return res.status(401).json({ error: 'Senha incorreta.' });

        const { qtdFinal } = await aplicarDesconsideracao({
            targetVendedor, data, produtoId, quantidade: qtd, motivo,
            autorizador: { id: autorizador.id, nome: autorizador.nome }, digitadoPor: req.user.id
        });

        res.json({ ok: true, produtoId, qtdDesconsiderada: qtdFinal, autorizadoPorNome: autorizador.nome });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        console.error('Erro ao autorizar desconsiderar devolução:', error);
        res.status(500).json({ error: 'Erro ao autorizar desconsiderar devolução.' });
    }
});

// ── POST /conferencia-devolucao/solicitar-autorizacao — Pedir autorização à distância ──
router.post('/conferencia-devolucao/solicitar-autorizacao', async (req, res) => {
    try {
        if (!req._perms.admin && !req._perms[PERM_CONFERIR_DEV]) {
            return res.status(403).json({ error: 'Sem permissão para conferir devoluções.' });
        }

        const { vendedorId, data, produtoId, quantidade, motivo, autorizadorId } = req.body;
        if (!data || !produtoId || !autorizadorId) {
            return res.status(400).json({ error: 'Campos obrigatórios: data, produtoId, autorizadorId.' });
        }
        const qtd = Number(quantidade);
        if (!(qtd > 0)) return res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });

        const targetVendedor = vendedorId || req.user.id;

        // Conferência já confirmada não aceita novo pedido
        const caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { conferenciaDevolucao: true }
        });
        if (caixa?.conferenciaDevolucao?.status === 'CONFERIDA') {
            return res.status(400).json({ error: 'Conferência já confirmada. Reabra a conferência para alterar.' });
        }

        // Produto precisa ter devolução registrada no dia
        const esperadas = await buscarDevolucoesEsperadas(targetVendedor, data);
        const esperado = esperadas.find(e => e.produtoId === produtoId);
        if (!esperado) return res.status(400).json({ error: 'Produto sem devolução registrada neste dia.' });
        const qtdFinal = Math.min(round3(qtd), esperado.qtdEsperada);

        // Autorizador: ativo + permissão de autorizar
        const autorizador = await prisma.vendedor.findUnique({ where: { id: autorizadorId } });
        if (!autorizador || !autorizador.ativo) {
            return res.status(400).json({ error: 'Responsável inválido ou inativo.' });
        }
        const permsAut = typeof autorizador.permissoes === 'string'
            ? JSON.parse(autorizador.permissoes)
            : (autorizador.permissoes || {});
        if (!permsAut.admin && !permsAut[PERM_AUTORIZAR_DEV]) {
            return res.status(400).json({ error: `${autorizador.nome} não pode autorizar devoluções.` });
        }

        // Um pedido pendente por (vendedor, dia, produto)
        const jaPendente = await prisma.autorizacaoDevolucao.findFirst({
            where: { vendedorId: targetVendedor, dataReferencia: data, produtoId, status: 'PENDENTE' }
        });
        if (jaPendente) {
            return res.status(400).json({ error: 'Já há um pedido de autorização pendente para este produto.' });
        }

        const tabela = await buscarTabelaCobranca(targetVendedor);
        const solicitante = await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } });

        const solicitacao = await prisma.autorizacaoDevolucao.create({
            data: {
                vendedorId: targetVendedor,
                dataReferencia: data,
                produtoId,
                produtoNome: esperado.produtoNome,
                quantidade: qtdFinal,
                motivo: (motivo || '').trim() || null,
                valorUnit: precoNaTabela(esperado.valorVendaBase, tabela),
                solicitanteId: req.user.id,
                solicitanteNome: solicitante?.nome || 'Usuário',
                autorizadorId: autorizador.id,
                autorizadorNome: autorizador.nome,
                status: 'PENDENTE'
            }
        });

        res.json({ ok: true, id: solicitacao.id, autorizadorNome: autorizador.nome });
    } catch (error) {
        console.error('Erro ao solicitar autorização de devolução:', error);
        res.status(500).json({ error: 'Erro ao solicitar autorização.' });
    }
});

// ── POST /conferencia-devolucao/cancelar-solicitacao — Cancela pedido pendente ──
router.post('/conferencia-devolucao/cancelar-solicitacao', async (req, res) => {
    try {
        if (!req._perms.admin && !req._perms[PERM_CONFERIR_DEV]) {
            return res.status(403).json({ error: 'Sem permissão para conferir devoluções.' });
        }
        const { id, vendedorId, data, produtoId } = req.body;

        const where = id
            ? { id }
            : { vendedorId: vendedorId || req.user.id, dataReferencia: data, produtoId, status: 'PENDENTE' };
        const solic = await prisma.autorizacaoDevolucao.findFirst({ where });
        if (!solic) return res.status(404).json({ error: 'Pedido não encontrado.' });
        if (solic.status !== 'PENDENTE') return res.status(400).json({ error: 'Pedido já respondido.' });

        await prisma.autorizacaoDevolucao.update({
            where: { id: solic.id },
            data: { status: 'CANCELADA', respondidoEm: new Date() }
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao cancelar solicitação:', error);
        res.status(500).json({ error: 'Erro ao cancelar solicitação.' });
    }
});

// ── POST /conferencia-devolucao/confirmar — Grava contagem e calcula cobrança ──
router.post('/conferencia-devolucao/confirmar', async (req, res) => {
    try {
        if (!req._perms.admin && !req._perms[PERM_CONFERIR_DEV]) {
            return res.status(403).json({ error: 'Sem permissão para conferir devoluções.' });
        }

        const { vendedorId, data, itens, sobras } = req.body;
        if (!data) return res.status(400).json({ error: 'Campo "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;

        // Não confirma no meio de um pedido de autorização em aberto
        const pedidoPendente = await prisma.autorizacaoDevolucao.findFirst({
            where: { vendedorId: targetVendedor, dataReferencia: data, status: 'PENDENTE' }
        });
        if (pedidoPendente) {
            return res.status(400).json({ error: `Há um pedido de autorização aguardando ${pedidoPendente.autorizadorNome}. Espere a resposta ou cancele antes de confirmar.` });
        }

        const esperadas = await buscarDevolucoesEsperadas(targetVendedor, data);
        const sobrasInformadas = (sobras || []).filter(s => Number(s.quantidade) > 0 && !esperadas.some(e => e.produtoId === s.produtoId));
        if (esperadas.length === 0 && sobrasInformadas.length === 0) {
            return res.status(400).json({ error: 'Não há devoluções para conferir neste dia.' });
        }

        const caixa = await getCaixaDoDia(targetVendedor, data);
        const confExistente = await prisma.caixaConferenciaDevolucao.findUnique({
            where: { caixaDiarioId: caixa.id },
            include: { itens: true }
        });
        // Idempotência: clique duplo não recalcula nem duplica
        if (confExistente?.status === 'CONFERIDA') {
            return res.status(400).json({ error: 'Conferência já confirmada. Reabra a conferência para alterar.' });
        }

        const tabela = await buscarTabelaCobranca(targetVendedor);
        const recebidasMap = new Map((itens || []).map(i => [i.produtoId, Number(i.qtdRecebida) || 0]));
        const salvosMap = new Map((confExistente?.itens || []).map(i => [i.produtoId, i]));

        const linhas = esperadas.map(e => {
            const salvo = salvosMap.get(e.produtoId);
            const qtdRecebida = round3(Math.max(0, recebidasMap.get(e.produtoId) ?? 0));
            const faltaAposContagem = Math.max(0, round3(e.qtdEsperada - qtdRecebida));
            const qtdDesconsiderada = Math.min(round3(Number(salvo?.qtdDesconsiderada || 0)), faltaAposContagem);
            const qtdCobrada = round3(Math.max(0, e.qtdEsperada - qtdRecebida - qtdDesconsiderada));
            const valorUnit = precoNaTabela(e.valorVendaBase, tabela);
            return {
                produtoId: e.produtoId,
                produtoNome: e.produtoNome,
                qtdEsperada: e.qtdEsperada,
                qtdRecebida,
                qtdDesconsiderada,
                qtdCobrada,
                sobra: false,
                valorUnitCobranca: valorUnit,
                valorCobrado: round2(qtdCobrada * valorUnit),
                motivoDesconsiderar: qtdDesconsiderada > 0 ? (salvo?.motivoDesconsiderar || null) : null,
                autorizadoPorId: qtdDesconsiderada > 0 ? (salvo?.autorizadoPorId || null) : null,
                autorizadoPorNome: qtdDesconsiderada > 0 ? (salvo?.autorizadoPorNome || null) : null,
                autorizadoEm: qtdDesconsiderada > 0 ? (salvo?.autorizadoEm || null) : null,
                pedidosOrigem: e.pedidosOrigem
            };
        });

        // Sobras avulsas (produto que voltou sem devolução registrada)
        if (sobrasInformadas.length > 0) {
            const prods = await prisma.produto.findMany({
                where: { id: { in: sobrasInformadas.map(s => s.produtoId) } },
                select: { id: true, nome: true }
            });
            const nomePorId = new Map(prods.map(p => [p.id, p.nome]));
            for (const s of sobrasInformadas) {
                if (!nomePorId.has(s.produtoId)) continue;
                linhas.push({
                    produtoId: s.produtoId,
                    produtoNome: nomePorId.get(s.produtoId),
                    qtdEsperada: 0,
                    qtdRecebida: round3(Number(s.quantidade)),
                    qtdDesconsiderada: 0,
                    qtdCobrada: 0,
                    sobra: true,
                    valorUnitCobranca: null,
                    valorCobrado: 0,
                    motivoDesconsiderar: null,
                    autorizadoPorId: null,
                    autorizadoPorNome: null,
                    autorizadoEm: null,
                    pedidosOrigem: []
                });
            }
        }

        const totalCobrado = round2(linhas.reduce((s, l) => s + l.valorCobrado, 0));

        const conferente = await prisma.vendedor.findUnique({
            where: { id: req.user.id },
            select: { nome: true }
        });

        const dadosConf = {
            status: 'CONFERIDA',
            conferidoPorId: req.user.id,
            conferidoPorNome: conferente?.nome || null,
            conferidoEm: new Date(),
            totalCobrado,
            tabelaCobrancaId: tabela?.id || null,
            tabelaCobrancaNome: tabela?.nomeCondicao || null
        };

        await prisma.$transaction(async (tx) => {
            const c = await tx.caixaConferenciaDevolucao.upsert({
                where: { caixaDiarioId: caixa.id },
                update: dadosConf,
                create: { caixaDiarioId: caixa.id, ...dadosConf }
            });
            await tx.caixaConferenciaDevolucaoItem.deleteMany({ where: { conferenciaId: c.id } });
            await tx.caixaConferenciaDevolucaoItem.createMany({
                data: linhas.map(l => ({ ...l, conferenciaId: c.id }))
            });
        }, { timeout: 20000, maxWait: 10000 });

        // Log FORA da transação — falha no log nunca desfaz a conferência
        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'CONFIRMAR_CONFERENCIA_DEVOLUCAO',
                    entidade: 'CaixaDiario',
                    entidadeId: caixa.id,
                    detalhes: JSON.stringify({
                        vendedorId: targetVendedor,
                        data,
                        totalCobrado,
                        tabela: tabela?.nomeCondicao || null,
                        itens: linhas.map(l => ({
                            produto: l.produtoNome,
                            esperada: l.qtdEsperada,
                            recebida: l.qtdRecebida,
                            desconsiderada: l.qtdDesconsiderada,
                            cobrada: l.qtdCobrada,
                            valor: l.valorCobrado
                        }))
                    }),
                    usuarioId: req.user.id,
                    usuarioNome: conferente?.nome || 'Usuário'
                }
            });
        } catch (logErr) {
            console.error('[conferencia-devolucao] falha no audit log (conferência já gravada):', logErr.message);
        }

        res.json({ ok: true, totalCobrado, itens: linhas.length });
    } catch (error) {
        console.error('Erro ao confirmar conferência de devoluções:', error);
        res.status(500).json({ error: 'Erro ao confirmar conferência de devoluções.' });
    }
});

// ── POST /conferencia-devolucao/reabrir — Volta CONFERIDA → PENDENTE ──
router.post('/conferencia-devolucao/reabrir', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Reverter_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para reabrir conferência.' });
        }

        const { vendedorId, data } = req.body;
        if (!data) return res.status(400).json({ error: 'Campo "data" obrigatório.' });
        const targetVendedor = vendedorId || req.user.id;

        const caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { conferenciaDevolucao: true }
        });
        if (!caixa?.conferenciaDevolucao) return res.status(404).json({ error: 'Conferência não encontrada.' });
        if (caixa.status !== 'ABERTO') {
            return res.status(400).json({ error: 'Reabra o caixa antes de reabrir a conferência de devoluções.' });
        }

        const conf = await prisma.caixaConferenciaDevolucao.update({
            where: { id: caixa.conferenciaDevolucao.id },
            data: { status: 'PENDENTE', conferidoPorId: null, conferidoPorNome: null, conferidoEm: null, totalCobrado: 0 }
        });

        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'REABRIR_CONFERENCIA_DEVOLUCAO',
                    entidade: 'CaixaConferenciaDevolucao',
                    entidadeId: conf.id,
                    detalhes: JSON.stringify({ vendedorId: targetVendedor, data }),
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || 'Admin'
                }
            });
        } catch (logErr) {
            console.error('[conferencia-devolucao] falha no audit log (reabertura já gravada):', logErr.message);
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao reabrir conferência de devoluções:', error);
        res.status(500).json({ error: 'Erro ao reabrir conferência de devoluções.' });
    }
});

// ── GET /vendedores-do-dia — Vendedores do seletor do caixa ──
// Só ativos; inativo aparece apenas se tiver movimento no dia (caixa fechado/adiantamento,
// despesa, diário de veículo ou embarque como responsável).
router.get('/vendedores-do-dia', async (req, res) => {
    try {
        const { data } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório.' });

        const inicioDia = new Date(data + 'T00:00:00.000Z');
        const fimDia = new Date(data + 'T23:59:59.999Z');

        const [ativos, caixas, despesas, diarios, embarques] = await Promise.all([
            prisma.vendedor.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
            prisma.caixaDiario.findMany({
                where: { dataReferencia: data, OR: [{ status: { not: 'ABERTO' } }, { adiantamento: { gt: 0 } }] },
                select: { vendedorId: true }
            }),
            prisma.despesa.findMany({ where: { dataReferencia: data }, select: { vendedorId: true }, distinct: ['vendedorId'] }),
            prisma.diarioVendedor.findMany({ where: { dataReferencia: data }, select: { vendedorId: true } }),
            prisma.embarque.findMany({
                where: { dataSaida: { gte: inicioDia, lte: fimDia } },
                select: { responsavelId: true },
                distinct: ['responsavelId']
            })
        ]);

        const comMovimento = new Set([
            ...caixas.map(c => c.vendedorId),
            ...despesas.map(d => d.vendedorId),
            ...diarios.map(d => d.vendedorId),
            ...embarques.map(e => e.responsavelId).filter(Boolean)
        ]);

        const idsAtivos = new Set(ativos.map(v => v.id));
        const idsInativosComMov = [...comMovimento].filter(id => !idsAtivos.has(id));
        const inativos = idsInativosComMov.length
            ? await prisma.vendedor.findMany({
                where: { id: { in: idsInativosComMov } },
                select: { id: true, nome: true },
                orderBy: { nome: 'asc' }
            })
            : [];

        res.json([
            ...ativos.map(v => ({ id: v.id, nome: v.nome, ativo: true })),
            ...inativos.map(v => ({ id: v.id, nome: v.nome, ativo: false, teveCaixa: true }))
        ].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
    } catch (error) {
        console.error('Erro ao listar vendedores do dia:', error);
        res.status(500).json({ error: 'Erro ao listar vendedores.' });
    }
});

// ── GET /relatorio — Dados formatados para impressão A4 ──
router.get('/relatorio', async (req, res) => {
    try {
        const { data, vendedorId } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório.' });

        const targetVendedor = vendedorId || req.user.id;

        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão.' });
        }

        // Buscar vendedor
        const vendedor = await prisma.vendedor.findUnique({
            where: { id: targetVendedor },
            select: { nome: true }
        });

        // Buscar caixa
        const caixa = await prisma.caixaDiario.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { entregasConferidas: true, conferenciaDevolucao: { include: { itens: true } } }
        });

        // Buscar diário
        const diario = await prisma.diarioVendedor.findUnique({
            where: { vendedorId_dataReferencia: { vendedorId: targetVendedor, dataReferencia: data } },
            include: { veiculo: { select: { placa: true, modelo: true } } }
        });

        // Buscar despesas
        const despesas = await prisma.despesa.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: data },
            include: { veiculo: { select: { placa: true } } },
            orderBy: { createdAt: 'asc' }
        });

        // Buscar entregas
        const inicioDia = new Date(data + 'T00:00:00.000Z');
        const fimDia = new Date(data + 'T23:59:59.999Z');

        const entregas = await prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: inicioDia, lte: fimDia },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                embarque: { responsavelId: targetVendedor }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                itens: true,
                pagamentosReais: { where: { valor: { gt: 0 } } },
                itensDevolvidos: true
            },
            orderBy: { dataEntrega: 'asc' }
        });

        // Buscar TODAS as condições da TabelaPreco (sem distinct)
        const todasCondicoesRel = await prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { opcaoCondicao: true, tipoPagamento: true, nomeCondicao: true, debitaCaixa: true }
        });
        const mapaDebitaPorNomeRel = Object.fromEntries(
            todasCondicoesRel.map(t => [t.nomeCondicao, t.debitaCaixa])
        );
        const mapaCondicoes = {};
        const mapaCondicoesPorOpcaoRel = {};
        for (const t of todasCondicoesRel) {
            const chave = `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}`;
            if (!mapaCondicoes[chave]) {
                mapaCondicoes[chave] = { nome: t.nomeCondicao, debitaCaixa: t.debitaCaixa };
            }
            if (!mapaCondicoesPorOpcaoRel[t.opcaoCondicao]) {
                mapaCondicoesPorOpcaoRel[t.opcaoCondicao] = { nome: t.nomeCondicao, debitaCaixa: t.debitaCaixa };
            }
        }

        // Componentes do "valor a prestar" que a folha impressa não enxergava (ela só somava
        // entregas + adiantamento − despesas, ficando menor que a tela do caixa).
        const cobrancasRotaRel = await prisma.cobrancaRota.findMany({
            where: { cobradoPorId: targetVendedor, dataReferencia: data },
            select: { status: true, valorCobrado: true, formaPagamentoNome: true }
        });
        const cobrancasRotaDinheiroRel = Math.round(cobrancasRotaRel
            .filter(c => ['COBRADA', 'BAIXADA'].includes(c.status) && (c.formaPagamentoNome || '').toLowerCase().includes('dinheiro'))
            .reduce((sum, c) => sum + Number(c.valorCobrado || 0), 0) * 100) / 100;
        const recebimentosTitulosRel = caixa
            ? Math.round(Number((await prisma.pagamentoParcela.aggregate({
                where: { caixaDiarioId: caixa.id, estornado: false },
                _sum: { valorRecebido: true }
            }))._sum.valorRecebido || 0) * 100) / 100
            : 0;

        // Média combustível
        const mediaCombustivel = diario?.veiculoId ? await calcularMediaCombustivel(diario.veiculoId) : null;

        // Buscar atendimentos do dia
        // OR: atendimentos do responsável do caixa (ex: motorista) OU dos clientes entregues na rota
        // Necessário pois quem registra os atendimentos é o vendedor (ex: Clarkson),
        // mas o caixa pertence à motorista (ex: Leticia).
        const clienteIdsEntregues = [...new Set(
            entregas.filter(e => e.clienteId).map(e => e.clienteId)
        )];

        const atendimentos = await prisma.atendimento.findMany({
            where: {
                criadoEm: { gte: inicioDia, lte: fimDia },
                OR: [
                    { idVendedor: targetVendedor },
                    ...(clienteIdsEntregues.length > 0 ? [{ clienteId: { in: clienteIdsEntregues } }] : [])
                ]
            },
            include: {
                lead: { select: { nomeEstabelecimento: true } }
            },
            orderBy: { criadoEm: 'asc' }
        });


        // Buscar pedidos do dia feitos pelo vendedor (em nome dele)
        // ATENÇÃO: usar createdAt (data de criação), não dataVenda (data de entrega futura)
        const pedidosDoVendedor = await prisma.pedido.findMany({
            where: {
                vendedorId: targetVendedor,
                createdAt: { gte: inicioDia, lte: fimDia }
            },
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } }
            },
            orderBy: { createdAt: 'asc' }
        });



        // Buscar amostras entregues no dia
        const amostrasEntreguesRel = await prisma.amostra.findMany({
            where: {
                status: 'ENTREGUE',
                embarqueId: { not: null },
                embarque: { responsavelId: targetVendedor },
                updatedAt: { gte: inicioDia, lte: fimDia }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                lead: { select: { nomeEstabelecimento: true } },
                solicitadoPor: { select: { nome: true } },
                itens: { select: { nomeProduto: true, quantidade: true } }
            },
            orderBy: { updatedAt: 'asc' }
        });

        // Buscar nomes de clientes atendidos (pelo clienteId)
        const clienteIds = atendimentos.filter(a => a.clienteId).map(a => a.clienteId);
        let mapaClientes = {};
        if (clienteIds.length > 0) {
            const clientes = await prisma.cliente.findMany({
                where: { UUID: { in: clienteIds } },
                select: { UUID: true, NomeFantasia: true, Nome: true }
            });
            mapaClientes = Object.fromEntries(clientes.map(c => [c.UUID, c.NomeFantasia || c.Nome]));
        }

        // Assinatura da conferência do dinheiro (sai na folha, junto do "a prestar")
        const conferenciaDinheiroImpressao = caixa?.dinheiroConferido ? {
            conferidoPorNome: caixa.dinheiroConferidoPorNome,
            conferidoEm: caixa.dinheiroConferidoEm,
            valorContado: caixa.valorContado != null ? Number(caixa.valorContado) : null,
            diferenca: caixa.diferencaConferencia != null ? Number(caixa.diferencaConferencia) : 0,
            motivoDiferenca: caixa.motivoDiferenca,
            autorizadoPorNome: caixa.autorizadorDiferencaNome,
            contagem: caixa.contagemDinheiro,
        } : null;

        res.json({
            vendedorNome: vendedor?.nome || 'Usuário',
            data,
            caixa: caixa || { adiantamento: 0, status: 'ABERTO' },
            conferenciaDinheiro: conferenciaDinheiroImpressao,
            diario: diario ? {
                placa: diario.veiculo?.placa,
                modelo: diario.veiculo?.modelo,
                kmInicial: diario.kmInicial,
                kmFinal: diario.kmFinal,
                totalKm: diario.kmFinal && diario.kmInicial ? diario.kmFinal - diario.kmInicial : null,
                modo: diario.modo
            } : null,
            mediaCombustivel,
            despesas: despesas.map(d => ({
                categoria: d.categoria,
                descricao: d.descricao,
                valor: Number(d.valor),
                veiculoPlaca: d.veiculo?.placa,
                litros: d.litros ? Number(d.litros) : null
            })),
            totalDespesas: despesas.reduce((s, d) => s + Number(d.valor), 0),
            entregas: entregas.map(e => {
                const valorPedido = e.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0);
                const conferencia = caixa?.entregasConferidas?.find(c => c.pedidoId === e.id);
                const chaveCondicaoRel = `${e.tipoPagamento || ''}|${e.opcaoCondicaoPagamento || ''}`;
                const condicaoInfo = mapaCondicoes[chaveCondicaoRel] || mapaCondicoesPorOpcaoRel[e.opcaoCondicaoPagamento];
                const condicaoDebitaCaixa = condicaoInfo?.debitaCaixa || false;

                return {
                    numero: e.numero,
                    especial: e.especial || false,
                    clienteNome: e.cliente?.NomeFantasia || e.cliente?.Nome || 'N/A',
                    condicao: e.nomeCondicaoPagamento || condicaoInfo?.nome || e.opcaoCondicaoPagamento || '-',
                    valorPedido: Math.round(valorPedido * 100) / 100,
                    status: e.statusEntrega,
                    pagamentos: e.pagamentosReais.map(p => {
                        let debita;
                        // PIX Asaas confirmado pelo banco não passa pela mão do motorista
                        if (p.formaPagamentoNome === 'PIX Asaas' && p.cobrancaAsaasId) debita = false;
                        else if (p.escritorioResponsavel) debita = false;
                        else if (p.vendedorResponsavelId) debita = true;
                        else if (mapaDebitaPorNomeRel[p.formaPagamentoNome] !== undefined) debita = mapaDebitaPorNomeRel[p.formaPagamentoNome];
                        else debita = condicaoDebitaCaixa;
                        return { forma: p.formaPagamentoNome, valor: Number(p.valor), debitaCaixa: debita };
                    }),
                    conferido: conferencia?.conferido || false
                };
            }),
            atendimentos: atendimentos.map(a => ({
                tipo: a.tipo,
                clienteNome: a.clienteId ? mapaClientes[a.clienteId] || 'Cliente' : a.lead?.nomeEstabelecimento || 'Lead',
                leadNome: a.lead?.nomeEstabelecimento || null,
                canal: a.lead?.canalOrigem || null,
                pedidoId: a.pedidoId,
                observacao: a.observacao || null,
                hora: a.criadoEm
            })),
            pedidosVendedor: pedidosDoVendedor.map(p => ({
                numero: p.numero,
                especial: p.especial || false,
                clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || 'N/A',
                createdAt: p.createdAt,
                observacao: p.observacoes || null
            })),
            amostras: amostrasEntreguesRel.map(a => ({
                id: a.id,
                numero: a.numero,
                destinatario: a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '-',
                solicitadoPor: a.solicitadoPor?.nome,
                itens: a.itens?.map(i => ({ nome: i.nomeProduto, quantidade: Number(i.quantidade) })) || []
            })),
            amostrasCount: amostrasEntreguesRel.length,
            conferenciaDevolucao: caixa?.conferenciaDevolucao ? {
                status: caixa.conferenciaDevolucao.status,
                conferidoPorNome: caixa.conferenciaDevolucao.conferidoPorNome,
                conferidoEm: caixa.conferenciaDevolucao.conferidoEm,
                totalCobrado: Number(caixa.conferenciaDevolucao.totalCobrado || 0),
                tabelaCobrancaNome: caixa.conferenciaDevolucao.tabelaCobrancaNome,
                itens: caixa.conferenciaDevolucao.itens.map(i => ({
                    produtoNome: i.produtoNome,
                    qtdEsperada: Number(i.qtdEsperada),
                    qtdRecebida: Number(i.qtdRecebida),
                    qtdDesconsiderada: Number(i.qtdDesconsiderada),
                    qtdCobrada: Number(i.qtdCobrada),
                    valorCobrado: Number(i.valorCobrado),
                    sobra: i.sobra,
                    motivoDesconsiderar: i.motivoDesconsiderar,
                    autorizadoPorNome: i.autorizadoPorNome,
                    pedidosOrigem: Array.isArray(i.pedidosOrigem) ? i.pedidosOrigem : []
                }))
            } : null,
            faltasDevolucao: caixa?.conferenciaDevolucao?.status === 'CONFERIDA'
                ? Number(caixa.conferenciaDevolucao.totalCobrado || 0)
                : 0,
            // Mesmos componentes do /resumo — sem isto a folha impressa recalculava por
            // conta própria e saía menor que a tela (faltavam cobranças de rota e títulos).
            cobrancasRotaDinheiro: cobrancasRotaDinheiroRel,
            recebimentosTitulos: recebimentosTitulosRel,
            // Impressão só mostra o VALOR A PRESTAR quando o dia está pronto:
            // conferência de devoluções feita + KM final + sem entregas pendentes.
            valorLiberado: await (async () => {
                const temDevRel = entregas.some(e => (e.itensDevolvidos?.length || 0) > 0 || e.statusEntrega === 'DEVOLVIDO');
                if (temDevRel && caixa?.conferenciaDevolucao?.status !== 'CONFERIDA') return false;
                const usouVeiculoRel = !!(diario && diario.modo === 'PRESENCIAL' && diario.veiculoId);
                if (usouVeiculoRel && !diario.kmFinal) return false;
                const entregasPendentesRel = await prisma.pedido.count({
                    where: { statusEntrega: 'PENDENTE', embarque: { responsavelId: targetVendedor, dataSaida: { gte: inicioDia, lte: fimDia } } }
                });
                if (entregasPendentesRel > 0) return false;
                return true;
            })()
        });
    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório.' });
    }
});

// ── GET /audit-logs — Log de auditoria de ações no caixa ──
router.get('/audit-logs', async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin && !perms.Pode_Editar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão.' });
        }

        const logs = await prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json(logs.map(l => ({
            ...l,
            detalhes: l.detalhes ? JSON.parse(l.detalhes) : null
        })));
    } catch (error) {
        console.error('Erro ao buscar audit logs:', error);
        res.status(500).json({ error: 'Erro ao buscar logs.' });
    }
});

// ── POST /cobrancas-rota/baixar — Baixa oficial dos títulos cobrados na rua ──
// O box do caixa: para cada cobrança COBRADA, cria o PagamentoParcela (ledger),
// atualiza a parcela/conta e marca a cobrança como BAIXADA. Idempotente: cobrança
// já BAIXADA devolve JA_BAIXADO sem repetir a baixa (clique duplo não duplica).
router.post('/cobrancas-rota/baixar', async (req, res) => {
    const perms = req._perms || await getPerms(req.user.id);
    if (!perms.admin && !perms.Pode_Editar_Caixa && !perms.Pode_Baixar_Caixa) {
        return res.status(403).json({ error: 'Sem permissão para dar baixa no caixa.' });
    }
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Selecione ao menos uma cobrança.' });
        }

        const statusParcelaPos = (valor, valorPago, valorDescontoTotal) => {
            const recebidoTotal = Number(valorPago || 0) + Number(valorDescontoTotal || 0);
            if (recebidoTotal <= 0) return 'PENDENTE';
            if (recebidoTotal >= Number(valor) - 0.01) return 'PAGO';
            return 'PARCIAL';
        };
        const statusContaPos = (todasParcelas) => {
            const total = todasParcelas.length;
            const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
            const parciais = todasParcelas.filter(p => p.status === 'PARCIAL').length;
            const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;
            if (pagas + canceladas >= total) return 'QUITADO';
            if (pagas > 0 || parciais > 0) return 'PARCIAL';
            return 'ABERTO';
        };

        const resultados = [];
        for (const id of ids) {
            const cobranca = await prisma.cobrancaRota.findUnique({
                where: { id },
                include: {
                    parcela: { include: { contaReceber: { include: { cliente: { select: { NomeFantasia: true, Nome: true } } } } } },
                    cobradoPor: { select: { nome: true } }
                }
            });
            const clienteNome = cobranca?.parcela?.contaReceber?.cliente?.NomeFantasia
                || cobranca?.parcela?.contaReceber?.cliente?.Nome || 'Cliente';

            if (!cobranca) { resultados.push({ id, status: 'ERRO', motivo: 'Cobrança não encontrada.' }); continue; }
            if (cobranca.status === 'BAIXADA') { resultados.push({ id, cliente: clienteNome, status: 'JA_BAIXADO' }); continue; }
            if (cobranca.status !== 'COBRADA') { resultados.push({ id, cliente: clienteNome, status: 'ERRO', motivo: 'Cobrança ainda não registrada na rua.' }); continue; }

            const parcela = cobranca.parcela;
            const saldo = Math.round((Number(parcela.valor) - Number(parcela.valorPago || 0) - Number(parcela.valorDescontoTotal || 0)) * 100) / 100;
            const recebido = Math.round(Number(cobranca.valorCobrado) * 100) / 100;
            if (recebido > saldo + 0.01) {
                resultados.push({ id, cliente: clienteNome, status: 'ERRO', motivo: `Valor cobrado (R$ ${recebido.toFixed(2)}) maior que o saldo atual do título (R$ ${saldo.toFixed(2)}) — a parcela pode ter sido baixada no financeiro. Confira no Contas a Receber.` });
                continue;
            }

            try {
                const novoValorPago = Number(parcela.valorPago || 0) + recebido;
                const novoStatusParcela = statusParcelaPos(parcela.valor, novoValorPago, parcela.valorDescontoTotal);
                const dataPgto = cobranca.cobradoEm || new Date();
                const obsBaixa = `Cobrança em rota — cobrada por ${cobranca.cobradoPor?.nome || 'motorista'} em ${cobranca.dataReferencia || ''}`.trim();

                await prisma.$transaction(async (tx) => {
                    const pagamento = await tx.pagamentoParcela.create({
                        data: {
                            parcelaId: parcela.id,
                            valorRecebido: recebido,
                            formaPagamento: cobranca.formaPagamentoNome || null,
                            dataPagamento: dataPgto,
                            observacao: obsBaixa,
                            origem: 'CAIXA_ROTA',
                            registradoPorId: req.user.id
                        }
                    });
                    await tx.parcela.update({
                        where: { id: parcela.id },
                        data: {
                            status: novoStatusParcela,
                            valorPago: novoValorPago,
                            formaPagamento: cobranca.formaPagamentoNome || parcela.formaPagamento,
                            dataPagamento: novoStatusParcela === 'PAGO' ? dataPgto : parcela.dataPagamento,
                            baixadoPorId: req.user.id
                        }
                    });
                    const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
                    const parcelasAtualizadas = todasParcelas.map(p => p.id === parcela.id ? { ...p, status: novoStatusParcela } : p);
                    await tx.contaReceber.update({
                        where: { id: parcela.contaReceberId },
                        data: { status: statusContaPos(parcelasAtualizadas) }
                    });
                    await tx.cobrancaRota.update({
                        where: { id: cobranca.id },
                        data: { status: 'BAIXADA', baixadoPorId: req.user.id, baixadoEm: new Date(), pagamentoParcelaId: pagamento.id }
                    });
                }, { timeout: 20000, maxWait: 10000 });

                // Histórico no cliente (best-effort, baixa já efetivada)
                try {
                    await prisma.atendimento.create({
                        data: {
                            tipo: 'FINANCEIRO',
                            observacao: `Baixa de cobrança em rota — parcela ${parcela.numeroParcela}: R$ ${recebido.toFixed(2)} (${cobranca.formaPagamentoNome || 'N/I'}) | ${obsBaixa}`,
                            clienteId: parcela.contaReceber.clienteId,
                            idVendedor: req.user.id,
                            pedidoId: parcela.contaReceber.pedidoId || null
                        }
                    });
                } catch (logErr) {
                    console.error('[CobrancaRota] Falha no histórico da baixa (baixa já efetivada):', logErr.message);
                }

                // Cobrada em dinheiro na rua → o boleto/PIX Asaas daquela parcela precisa morrer,
                // senão fica vivo e o cliente ainda pode pagá-lo (recebimento em dobro).
                if (novoStatusParcela === 'PAGO') {
                    const asaasService = require('../services/asaasService');
                    asaasService.cancelarCobrancasDaParcela(parcela.id, 'cobrada na rota e baixada no caixa')
                        .catch(e => console.error('[CobrancaRota] Falha ao cancelar cobrança Asaas (baixa já efetivada):', e.message));
                }

                resultados.push({ id, cliente: clienteNome, status: 'OK', novoStatusParcela });
            } catch (e) {
                console.error(`[CobrancaRota] Erro ao baixar cobrança ${id}:`, e);
                resultados.push({ id, cliente: clienteNome, status: 'ERRO', motivo: 'Erro ao efetivar a baixa. Tente novamente.' });
            }
        }

        res.json({ resultados });
    } catch (error) {
        console.error('[CobrancaRota] Erro na baixa de cobranças de rota:', error);
        res.status(500).json({ error: 'Erro ao baixar as cobranças de rota.' });
    }
});

// ── POST /quitar-ca — Dar baixa de entregas à vista (dinheiro) ──
// ESPECIAL → baixa LOCAL (ContaReceber/Parcela no app)
// Normal  → baixa no CONTA AZUL via API (conta caixinha)
router.post('/quitar-ca', async (req, res) => {
    const perms = req._perms || await getPerms(req.user.id);
    if (!perms.admin && !perms.Pode_Editar_Caixa && !perms.Pode_Baixar_Caixa) {
        return res.status(403).json({ error: 'Sem permissão para dar baixa no caixa.' });
    }
    const contaAzulService = require('../services/contaAzulService');

    try {
        const { pedidoIds, dataPagamento } = req.body;

        if (!Array.isArray(pedidoIds) || pedidoIds.length === 0) {
            return res.status(400).json({ error: 'Selecione ao menos uma entrega.' });
        }

        // Buscar pedidos com dados necessários
        const pedidos = await prisma.pedido.findMany({
            where: { id: { in: pedidoIds } },
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                embarque: { include: { responsavel: { select: { nome: true } } } },
                itens: true,
                pagamentosReais: { where: { valor: { gt: 0 } } }
            }
        });

        if (pedidos.length === 0) {
            return res.status(400).json({ error: 'Nenhum pedido encontrado.' });
        }

        // PIX registrado como "Pix" comum mas pago pelo QR do Asaas: se o pedido tem
        // cobrança Asaas RECEBIDA sem parcela (PIX de entrega/avulso) ainda não vinculada
        // a nenhum pagamento, e existe um pagamento Pix comum de MESMO valor, grava o
        // vínculo antes de agrupar. Sem isso o caixa trata como Pix comum e só troca a
        // forma no CA (sem criar baixa) — a parcela fica aberta com o dinheiro parado na
        // conta Asaas (caso real: pedido #2041).
        try {
            const cobrancasLivres = await prisma.cobrancaAsaas.findMany({
                where: { pedidoId: { in: pedidos.map(p => p.id) }, status: 'RECEBIDO', parcelaId: null },
                select: { id: true, pedidoId: true, valor: true, valorRecebido: true }
            });
            if (cobrancasLivres.length > 0) {
                const vinculadas = new Set(pedidos.flatMap(p => (p.pagamentosReais || []).map(pg => pg.cobrancaAsaasId).filter(Boolean)));
                for (const pedido of pedidos) {
                    for (const cob of cobrancasLivres.filter(c => c.pedidoId === pedido.id && !vinculadas.has(c.id))) {
                        const valorCob = Number(cob.valorRecebido ?? cob.valor);
                        const pg = (pedido.pagamentosReais || []).find(p =>
                            !p.cobrancaAsaasId &&
                            !p.escritorioResponsavel && !p.vendedorResponsavelId &&
                            (p.formaPagamentoNome || '').toLowerCase().includes('pix') &&
                            Math.abs(Number(p.valor) - valorCob) <= 0.01
                        );
                        if (!pg) continue;
                        await prisma.pedidoPagamentoReal.update({ where: { id: pg.id }, data: { cobrancaAsaasId: cob.id } });
                        pg.cobrancaAsaasId = cob.id; // o agrupamento abaixo passa a tratar como PIX Asaas
                        vinculadas.add(cob.id);
                        console.log(`[Caixa] Pedido #${pedido.numero}: Pix de R$ ${valorCob.toFixed(2)} identificado como PIX Asaas — baixa irá para a conta Asaas.`);
                    }
                }
            }
        } catch (e) {
            console.error('[Caixa] Falha ao identificar PIX Asaas não vinculado (segue com o registro original):', e.message);
        }

        // Buscar nome do usuário solicitante
        const solicitante = await prisma.vendedor.findUnique({
            where: { id: req.user.id },
            select: { nome: true }
        });

        const dataPgto = dataPagamento || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const resultados = [];

        // Mapear nome do pagamento real para enum do CA
        const mapMetodoPagamentoCA = (formaNome) => {
            const nome = (formaNome || '').toLowerCase();
            if (nome.includes('dinheiro')) return 'DINHEIRO';
            if (nome.includes('pix')) return 'PIX_PAGAMENTO_INSTANTANEO';
            if (nome.includes('cartão') || nome.includes('cartao')) {
                if (nome.includes('débito') || nome.includes('debito')) return 'CARTAO_DEBITO';
                return 'CARTAO_CREDITO';
            }
            if (nome.includes('boleto')) return 'BOLETO_BANCARIO';
            if (nome.includes('transferência') || nome.includes('transferencia')) return 'TRANSFERENCIA_BANCARIA';
            return 'OUTRO';
        };

        // Formas que são elegíveis para processamento no caixa
        const isFormaElegivel = (formaNome) => {
            const nome = (formaNome || '').toLowerCase();
            return nome.includes('dinheiro') || nome.includes('pix') || nome.includes('cartão') || nome.includes('cartao');
        };

        // PIX Asaas devolvido/estornado NÃO conta como recebido (o dinheiro voltou ao cliente)
        const idsCobrancas = pedidos.flatMap(p => (p.pagamentosReais || []).map(pg => pg.cobrancaAsaasId).filter(Boolean));
        const cobrancasInvalidas = new Set();
        if (idsCobrancas.length > 0) {
            const cobs = await prisma.cobrancaAsaas.findMany({
                where: { id: { in: idsCobrancas } },
                select: { id: true, status: true }
            });
            cobs.filter(c => c.status !== 'RECEBIDO').forEach(c => cobrancasInvalidas.add(c.id));
        }

        // Agrupa pagamentos elegíveis por tipo. Para pedidos CA (não-especiais),
        // Vendedor/Escritório responsável vão como grupo OUTRO (apenas alteram a
        // forma no CA, sem criar baixa). Pedidos especiais ignoram esses pagamentos.
        const agruparPagamentos = (pedido) => {
            const grupos = {};
            for (const p of pedido.pagamentosReais) {
                if (Number(p.valor) <= 0) continue;
                if (p.cobrancaAsaasId && cobrancasInvalidas.has(p.cobrancaAsaasId)) continue; // estornado no Asaas
                if (p.escritorioResponsavel || p.vendedorResponsavelId) {
                    if (pedido.especial) continue; // especial: fiado local, sem ação no CA
                    const rotulo = p.vendedorResponsavelId
                        ? 'Vendedor responsável'
                        : 'Escritório responsável';
                    if (!grupos['OUTRO']) grupos['OUTRO'] = { valor: 0, formaNome: rotulo };
                    grupos['OUTRO'].valor += Number(p.valor);
                    continue;
                }
                if (p.cobrancaAsaasId) {
                    // PIX Asaas: o dinheiro já caiu na conta Asaas (não passa pela caixinha)
                    if (!grupos['PIX_ASAAS']) grupos['PIX_ASAAS'] = { valor: 0, formaNome: 'PIX Asaas' };
                    grupos['PIX_ASAAS'].valor += Number(p.valor);
                    continue;
                }
                if (!isFormaElegivel(p.formaPagamentoNome)) continue;
                const metodo = mapMetodoPagamentoCA(p.formaPagamentoNome);
                if (!grupos[metodo]) grupos[metodo] = { valor: 0, formaNome: p.formaPagamentoNome };
                grupos[metodo].valor += Number(p.valor);
            }
            return grupos;
        };

        // Valor total elegível (dinheiro + pix + cartão)
        const calcValorElegivel = (pedido) => {
            const grupos = agruparPagamentos(pedido);
            return Object.values(grupos).reduce((s, g) => s + g.valor, 0);
        };

        // Validar elegibilidade: aceita pedidos com pagamento real em dinheiro, pix ou cartão
        const pedidosElegiveis = [];
        for (const pedido of pedidos) {
            const clienteNome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A';
            const valorElegivel = calcValorElegivel(pedido);
            if (valorElegivel <= 0) {
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    cliente: clienteNome,
                    tipo: pedido.especial ? 'ESPECIAL' : 'CA',
                    status: 'ERRO',
                    erro: 'Nenhum pagamento em dinheiro/pix encontrado neste pedido'
                });
                continue;
            }
            // Impedir baixa duplicada no CA
            if (!pedido.especial && pedido.baixaCaRealizada) {
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    cliente: clienteNome,
                    tipo: 'CA',
                    status: 'JA_QUITADO',
                    erro: `Baixa já realizada no CA em ${pedido.baixaCaEm ? new Date(pedido.baixaCaEm).toLocaleDateString('pt-BR') : '?'} — R$ ${Number(pedido.baixaCaValor || 0).toFixed(2)}`
                });
                continue;
            }
            pedido._valorElegivel = Math.round(valorElegivel * 100) / 100;
            pedido._gruposPagamento = agruparPagamentos(pedido);
            pedidosElegiveis.push(pedido);
        }

        // Separar especiais (baixa local) de normais (baixa CA)
        const especiais = pedidosElegiveis.filter(p => p.especial);
        const normais = pedidosElegiveis.filter(p => !p.especial);

        // ═══ ESPECIAIS → Baixa local no app ═══
        for (const pedido of especiais) {
            const clienteNome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A';
            const motorista = pedido.embarque?.responsavel?.nome || 'N/I';

            try {
                // Buscar ContaReceber + Parcelas locais
                let contaReceber = await prisma.contaReceber.findUnique({
                    where: { pedidoId: pedido.id },
                    include: { parcelas: true }
                });

                if (!contaReceber) {
                    // Auto-criar ContaReceber quando ausente (pedido especial sem conta local)
                    const valorTotal = pedido.itens?.reduce((s, i) => s + (i.valor * i.quantidade), 0) || pedido._valorElegivel;
                    const now = new Date();
                    contaReceber = await prisma.contaReceber.create({
                        data: {
                            pedidoId: pedido.id,
                            clienteId: pedido.clienteId,
                            origem: 'ESPECIAL',
                            valorTotal: Math.round(valorTotal * 100) / 100,
                            status: 'ABERTO',
                            parcelas: {
                                create: [{
                                    numeroParcela: 1,
                                    valor: Math.round(valorTotal * 100) / 100,
                                    dataVencimento: pedido.primeiroVencimento || now,
                                    status: 'PENDENTE',
                                }]
                            }
                        },
                        include: { parcelas: true }
                    });
                    console.log(`[Caixa] Auto-criada ContaReceber para pedido especial #${pedido.numero}`);
                }

                const parcelasElegiveis = contaReceber.parcelas.filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO');

                if (parcelasElegiveis.length === 0) {
                    resultados.push({
                        pedidoId: pedido.id,
                        numero: pedido.numero,
                        cliente: clienteNome,
                        tipo: 'ESPECIAL',
                        status: 'JA_QUITADO',
                        erro: 'Todas as parcelas já estão pagas'
                    });
                    continue;
                }

                // Detalhar pagamentos por tipo
                const totalParcelas = parcelasElegiveis.reduce((s, p) => s + Number(p.valor), 0);
                const detalhePgtos = Object.entries(pedido._gruposPagamento)
                    .map(([metodo, g]) => `${g.formaNome}: R$ ${g.valor.toFixed(2)}`)
                    .join(', ');
                const isParcial = pedido._valorElegivel < totalParcelas;

                let obsComplemento = ` | Pgto: ${detalhePgtos}`;
                if (isParcial) {
                    const outrasFormas = pedido.pagamentosReais
                        .filter(p => {
                            if (p.escritorioResponsavel || p.vendedorResponsavelId) return true;
                            const n = (p.formaPagamentoNome || '').toLowerCase();
                            return !n.includes('dinheiro') && !n.includes('pix');
                        })
                        .map(p => `${p.formaPagamentoNome}: R$ ${Number(p.valor).toFixed(2)}${p.vendedorResponsavelId ? ' (vendedor)' : ''}${p.escritorioResponsavel ? ' (escritório)' : ''}`)
                        .join(', ');
                    obsComplemento += ` | Baixa parcial (R$ ${pedido._valorElegivel.toFixed(2)} de R$ ${totalParcelas.toFixed(2)})`;
                    if (outrasFormas) obsComplemento += ` | Restante: ${outrasFormas}`;
                }

                const obs = `Motorista: ${motorista} | Caixa: ${dataPgto} | Solicitante: ${solicitante?.nome || req.user.id}${obsComplemento}`;

                // Dar baixa nas parcelas pelo valor total elegível (dinheiro + pix)
                await prisma.$transaction(async (tx) => {
                    let restante = pedido._valorElegivel;
                    for (const parcela of parcelasElegiveis) {
                        const valParcela = Number(parcela.valor);
                        if (restante <= 0) break;

                        const valorPagar = Math.min(restante, valParcela);
                        await tx.parcela.update({
                            where: { id: parcela.id },
                            data: {
                                status: 'PAGO',
                                valorPago: Math.round(valorPagar * 100) / 100,
                                formaPagamento: detalhePgtos,
                                dataPagamento: new Date(dataPgto + 'T12:00:00-03:00'),
                                baixadoPorId: req.user.id,
                                observacao: obs
                            }
                        });
                        restante -= valorPagar;
                    }

                    // Recalcular status da conta
                    const todasParcelas = await tx.parcela.findMany({
                        where: { contaReceberId: contaReceber.id }
                    });
                    const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
                    const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;
                    const total = todasParcelas.length;

                    let novoStatus;
                    if (pagas + canceladas >= total) novoStatus = 'QUITADO';
                    else if (pagas > 0) novoStatus = 'PARCIAL';
                    else novoStatus = 'ABERTO';

                    await tx.contaReceber.update({
                        where: { id: contaReceber.id },
                        data: { status: novoStatus }
                    });

                }, { timeout: 20000, maxWait: 10000 });

                // Log de histórico FORA da transação — um log lento/falho nunca pode
                // derrubar (rollback) uma baixa já efetivada.
                try {
                    await prisma.atendimento.create({
                        data: {
                            tipo: 'FINANCEIRO',
                            observacao: `Baixa caixa (especial) - R$ ${pedido._valorElegivel.toFixed(2)} (${detalhePgtos})${isParcial ? ' — PARCIAL' : ''} | ${obs}`,
                            clienteId: pedido.cliente.UUID,
                            idVendedor: req.user.id,
                            pedidoId: pedido.id
                        }
                    });
                } catch (logErr) {
                    console.error('[caixa baixa-lote] falha no log (baixa já efetivada):', logErr.message);
                }

                const valorTotal = parcelasElegiveis.reduce((s, p) => s + Number(p.valor), 0);
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    cliente: clienteNome,
                    tipo: 'ESPECIAL',
                    status: 'OK',
                    valor: Math.round(valorTotal * 100) / 100,
                    parcelas: parcelasElegiveis.length
                });

            } catch (err) {
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    cliente: clienteNome,
                    tipo: 'ESPECIAL',
                    status: 'ERRO',
                    erro: err.message
                });
            }
        }

        // ═══ NORMAIS → Baixa no Conta Azul via API ═══
        // Conta financeira do Asaas no CA (config opcional) — onde entram os PIX Asaas
        let contaAsaasCaId = null;
        try {
            const cfgAsaas = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } });
            contaAsaasCaId = cfgAsaas?.value || null;
        } catch (_) { /* sem config → cai na caixinha com observação */ }

        let contaCaixinha = null;
        if (normais.length > 0 && !CA_SOMENTE_LEITURA) {
            try {
                contaCaixinha = await contaAzulService.buscarContaCaixinha();
            } catch (err) {
                // Marcar todos os normais como erro
                for (const pedido of normais) {
                    resultados.push({
                        pedidoId: pedido.id,
                        numero: pedido.numero,
                        cliente: pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A',
                        tipo: 'CA',
                        status: 'ERRO',
                        erro: `Erro ao buscar conta Caixinha no CA: ${err.message}`
                    });
                }
            }
        }

        // ═══ NORMAIS com CA somente leitura → Baixa LOCAL (o app é o financeiro oficial) ═══
        if (CA_SOMENTE_LEITURA && normais.length > 0) {
            const round2 = (v) => Math.round(Number(v) * 100) / 100;
            // Conta financeira p/ a tela Saldos por Conta: dinheiro → caixinha; PIX Asaas → conta Asaas
            let caixinhaLocalId = null;
            try {
                const cx = await prisma.contaFinanceira.findFirst({
                    where: { nomeBanco: { contains: 'caixinha', mode: 'insensitive' }, ativo: true }
                });
                caixinhaLocalId = cx?.id || null;
            } catch (_) { /* sem caixinha local → fica "Não informado" */ }

            for (const pedido of normais) {
                const clienteNome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A';
                const motorista = pedido.embarque?.responsavel?.nome || 'N/I';

                try {
                    const grupos = pedido._gruposPagamento;
                    const detalhePgtos = Object.entries(grupos)
                        .map(([, g]) => `${g.formaNome}: R$ ${g.valor.toFixed(2)}`)
                        .join(', ');
                    const obsBase = `Motorista: ${motorista} | Caixa: ${dataPgto} | Solicitante: ${solicitante?.nome || req.user.id} | Pgto: ${detalhePgtos}`;

                    let contaReceber = await prisma.contaReceber.findUnique({
                        where: { pedidoId: pedido.id },
                        include: { parcelas: { orderBy: { numeroParcela: 'asc' } } }
                    });
                    if (!contaReceber) {
                        const valorTotal = pedido.itens?.reduce((s, i) => s + (Number(i.valor) * Number(i.quantidade)), 0) || pedido._valorElegivel;
                        contaReceber = await prisma.contaReceber.create({
                            data: {
                                pedidoId: pedido.id,
                                clienteId: pedido.clienteId,
                                origem: 'FATURADO_CA',
                                valorTotal: round2(valorTotal),
                                status: 'ABERTO',
                                parcelas: {
                                    create: [{
                                        numeroParcela: 1,
                                        valor: round2(valorTotal),
                                        dataVencimento: pedido.primeiroVencimento || new Date(),
                                        status: 'PENDENTE',
                                    }]
                                }
                            },
                            include: { parcelas: { orderBy: { numeroParcela: 'asc' } } }
                        });
                    }

                    const parcelasAbertas = contaReceber.parcelas.filter(p => ['PENDENTE', 'VENCIDO', 'PARCIAL'].includes(p.status));
                    if (parcelasAbertas.length === 0) {
                        resultados.push({
                            pedidoId: pedido.id, numero: pedido.numero, cliente: clienteNome,
                            tipo: 'CA', status: 'JA_QUITADO', erro: 'Parcelas já quitadas no app'
                        });
                        continue;
                    }

                    const totalAberto = round2(parcelasAbertas.reduce(
                        (s, p) => s + Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0), 0));

                    // "Filas" de dinheiro recebido por forma (OUTRO = vendedor/escritório
                    // responsável não é recebimento — a parte dele fica em aberto p/ cobrança)
                    const filas = Object.entries(grupos)
                        .filter(([m, g]) => m !== 'OUTRO' && g.valor > 0)
                        .map(([m, g]) => ({
                            nome: g.formaNome,
                            restante: round2(g.valor),
                            contaCaId: m === 'DINHEIRO' ? caixinhaLocalId : (m === 'PIX_ASAAS' ? contaAsaasCaId : null)
                        }));
                    const valorRecebido = round2(filas.reduce((s, f) => s + f.restante, 0));

                    // Devolução de mercadoria = o que estava em aberto menos TUDO que foi
                    // acertado na entrega (inclui a parte "responsável"). Fecha como desconto.
                    const valorDevolvido = Math.max(0, round2(totalAberto - pedido._valorElegivel));

                    const dataPagamento = new Date(dataPgto + 'T12:00:00-03:00');
                    const acoes = [];

                    await prisma.$transaction(async (tx) => {
                        let descontoRestante = valorDevolvido;
                        for (const parcela of parcelasAbertas) {
                            let saldo = round2(Number(parcela.valor) - Number(parcela.valorPago || 0) - Number(parcela.valorDescontoTotal || 0));
                            if (saldo <= 0) continue;
                            let recebidoParcela = 0;
                            let descontoParcela = 0;
                            let ultimaConta = null;
                            let formasParcela = [];

                            for (const fila of filas) {
                                if (saldo <= 0.001) break;
                                const usa = round2(Math.min(saldo, fila.restante));
                                if (usa <= 0) continue;
                                await tx.pagamentoParcela.create({
                                    data: {
                                        parcelaId: parcela.id,
                                        valorRecebido: usa,
                                        valorDesconto: 0,
                                        formaPagamento: fila.nome,
                                        contaFinanceiraCaId: fila.contaCaId,
                                        dataPagamento,
                                        observacao: obsBase,
                                        origem: 'CAIXA_BAIXA_CA',
                                        registradoPorId: req.user.id
                                    }
                                });
                                saldo = round2(saldo - usa);
                                fila.restante = round2(fila.restante - usa);
                                recebidoParcela = round2(recebidoParcela + usa);
                                ultimaConta = fila.contaCaId || ultimaConta;
                                formasParcela.push(fila.nome);
                            }

                            // Devolução entra como desconto na parcela que ainda tem saldo
                            if (saldo > 0.001 && descontoRestante > 0.001) {
                                descontoParcela = round2(Math.min(saldo, descontoRestante));
                                await tx.pagamentoParcela.create({
                                    data: {
                                        parcelaId: parcela.id,
                                        valorRecebido: 0,
                                        valorDesconto: descontoParcela,
                                        motivoDesconto: 'Devolução de mercadoria (conferência do caixa)',
                                        formaPagamento: formasParcela.join(', ') || null,
                                        dataPagamento,
                                        observacao: obsBase,
                                        origem: 'DEVOLUCAO',
                                        registradoPorId: req.user.id
                                    }
                                });
                                saldo = round2(saldo - descontoParcela);
                                descontoRestante = round2(descontoRestante - descontoParcela);
                            }

                            if (recebidoParcela <= 0 && descontoParcela <= 0) continue;

                            const novoPago = round2(Number(parcela.valorPago || 0) + recebidoParcela);
                            const novoDesc = round2(Number(parcela.valorDescontoTotal || 0) + descontoParcela);
                            const quitada = (novoPago + novoDesc) >= Number(parcela.valor) - 0.01;
                            await tx.parcela.update({
                                where: { id: parcela.id },
                                data: {
                                    status: quitada ? 'PAGO' : 'PARCIAL',
                                    valorPago: novoPago > 0 ? novoPago : null,
                                    valorDescontoTotal: novoDesc,
                                    formaPagamento: formasParcela.join(', ') || parcela.formaPagamento,
                                    contaFinanceiraCaId: ultimaConta || parcela.contaFinanceiraCaId,
                                    dataPagamento: quitada ? dataPagamento : parcela.dataPagamento,
                                    baixadoPorId: req.user.id,
                                    observacao: obsBase
                                }
                            });
                        }

                        const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: contaReceber.id } });
                        const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
                        const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;
                        const parciais = todasParcelas.filter(p => p.status === 'PARCIAL').length;
                        const novoStatus = (pagas + canceladas >= todasParcelas.length) ? 'QUITADO'
                            : (pagas > 0 || parciais > 0) ? 'PARCIAL' : 'ABERTO';
                        await tx.contaReceber.update({ where: { id: contaReceber.id }, data: { status: novoStatus } });

                        await tx.pedido.update({
                            where: { id: pedido.id },
                            data: {
                                baixaCaRealizada: true,
                                baixaCaValor: round2(pedido._valorElegivel),
                                baixaCaEm: new Date()
                            }
                        });
                    }, { timeout: 20000, maxWait: 10000 });

                    acoes.push(`Baixa local: R$ ${valorRecebido.toFixed(2)} (${detalhePgtos})`);
                    if (valorDevolvido > 0.01) acoes.push(`Devolução (desconto): R$ ${valorDevolvido.toFixed(2)}`);
                    if (grupos['OUTRO']) acoes.push(`${grupos['OUTRO'].formaNome}: R$ ${grupos['OUTRO'].valor.toFixed(2)} fica em aberto p/ cobrança`);

                    // Log de histórico fora da transação
                    try {
                        await prisma.atendimento.create({
                            data: {
                                tipo: 'FINANCEIRO',
                                observacao: `Baixa caixa - R$ ${valorRecebido.toFixed(2)} (${detalhePgtos})${valorDevolvido > 0.01 ? ` | Devolução: R$ ${valorDevolvido.toFixed(2)}` : ''} | ${obsBase}`,
                                clienteId: pedido.cliente.UUID,
                                idVendedor: req.user.id,
                                pedidoId: pedido.id
                            }
                        });
                    } catch (logErr) {
                        console.error('[caixa baixa-lote] falha no log (baixa já efetivada):', logErr.message);
                    }

                    resultados.push({
                        pedidoId: pedido.id, numero: pedido.numero, cliente: clienteNome,
                        tipo: 'CA', status: 'OK', valor: pedido._valorElegivel, detalhe: acoes.join(' | ')
                    });
                } catch (err) {
                    resultados.push({
                        pedidoId: pedido.id, numero: pedido.numero, cliente: clienteNome,
                        tipo: 'CA', status: 'ERRO', erro: err.message
                    });
                }
            }
        }

        if (contaCaixinha && normais.length > 0) {
            for (const pedido of normais) {
                const clienteNome = pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || 'N/A';
                const motorista = pedido.embarque?.responsavel?.nome || 'N/I';

                try {
                    if (!pedido.idVendaContaAzul) {
                        resultados.push({
                            pedidoId: pedido.id,
                            numero: pedido.numero,
                            cliente: clienteNome,
                            tipo: 'CA',
                            status: 'ERRO',
                            erro: 'Pedido sem venda no Conta Azul (idVendaContaAzul ausente)'
                        });
                        continue;
                    }

                    const dataVendaStr = pedido.dataVenda
                        ? new Date(pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
                        : dataPgto;

                    const parcela = await contaAzulService.encontrarParcelaDeVenda(
                        pedido.cliente.UUID,
                        pedido.idVendaContaAzul,
                        dataVendaStr
                    );

                    if (!parcela) {
                        resultados.push({
                            pedidoId: pedido.id,
                            numero: pedido.numero,
                            cliente: clienteNome,
                            tipo: 'CA',
                            status: 'ERRO',
                            erro: `Parcela não encontrada no CA para venda ${pedido.idVendaContaAzul}`
                        });
                        continue;
                    }

                    if (parcela.status === 'QUITADO' || parcela.status === 'RECEBIDO') {
                        resultados.push({
                            pedidoId: pedido.id,
                            numero: pedido.numero,
                            cliente: clienteNome,
                            tipo: 'CA',
                            status: 'JA_QUITADO',
                            erro: 'Parcela já quitada no CA'
                        });
                        continue;
                    }

                    // Separar: DINHEIRO → baixa (caixinha), PIX/Cartão → alterar condição ou baixa com desconto
                    const grupos = pedido._gruposPagamento;
                    const detalhePgtos = Object.entries(grupos)
                        .map(([metodo, g]) => `${g.formaNome}: R$ ${g.valor.toFixed(2)}`)
                        .join(', ');
                    const obsBase = `Motorista: ${motorista} | Caixa: ${dataPgto} | Solicitante: ${solicitante?.nome || req.user.id} | Pgto: ${detalhePgtos}`;

                    // Calcular devolução antes de qualquer baixa: diferença entre parcela CA e valor recebido
                    const parcelaPreBaixa = await contaAzulService.buscarParcelaDetalhe(parcela.id);
                    const valorParcelaTotal = Math.round((parcelaPreBaixa.composicao_valor?.valor_bruto || 0) * 100) / 100;
                    const valorDevolvido = Math.max(0, Math.round((valorParcelaTotal - pedido._valorElegivel) * 100) / 100);

                    const acoes = [];
                    let valorBaixado = 0;

                    // PIX Asaas tem baixa própria (o dinheiro está na conta Asaas, não na caixinha).
                    // A devolução (desconto) entra UMA única vez: nas formas não-dinheiro comuns,
                    // senão no PIX Asaas, senão no dinheiro — sempre na última baixa que fecha a parcela.
                    const grupoAsaas = grupos['PIX_ASAAS'] || null;
                    const formasCondicao = Object.entries(grupos).filter(([m]) => m !== 'DINHEIRO' && m !== 'PIX_ASAAS');
                    const descontoNoAsaas = formasCondicao.length === 0 && grupoAsaas ? valorDevolvido : 0;
                    const descontoNoDinheiro = formasCondicao.length === 0 && !grupoAsaas ? valorDevolvido : 0;

                    // 1. DINHEIRO → criar baixa no CA (caixinha)
                    if (grupos['DINHEIRO']) {
                        const valorDinheiro = Math.round(grupos['DINHEIRO'].valor * 100) / 100;
                        const baixaPayload = {
                            data_pagamento: dataPgto,
                            composicao_valor: {
                                valor_bruto: valorDinheiro,
                                multa: 0, juros: 0, desconto: descontoNoDinheiro, taxa: 0
                            },
                            conta_financeira: contaCaixinha.id,
                            metodo_pagamento: 'DINHEIRO',
                            observacao: obsBase
                        };
                        await contaAzulService.criarBaixa(parcela.id, baixaPayload);
                        acoes.push(`Baixa dinheiro: R$ ${valorDinheiro.toFixed(2)}${descontoNoDinheiro > 0 ? ` + Dev: R$ ${descontoNoDinheiro.toFixed(2)}` : ''}`);
                        valorBaixado += valorDinheiro;
                    }

                    // 1b. PIX ASAAS → criar baixa no CA na conta financeira do Asaas
                    if (grupoAsaas) {
                        const valorAsaas = Math.round(grupoAsaas.valor * 100) / 100;
                        await contaAzulService.criarBaixa(parcela.id, {
                            data_pagamento: dataPgto,
                            composicao_valor: {
                                valor_bruto: valorAsaas,
                                multa: 0, juros: 0, desconto: descontoNoAsaas, taxa: 0
                            },
                            conta_financeira: contaAsaasCaId || contaCaixinha.id,
                            metodo_pagamento: 'PIX_PAGAMENTO_INSTANTANEO',
                            observacao: `PIX Asaas (recebido na conta Asaas)${contaAsaasCaId ? '' : ' — conta Asaas não configurada no app, lançado na Caixinha'} | ${obsBase}`
                        });
                        acoes.push(`Baixa PIX Asaas: R$ ${valorAsaas.toFixed(2)}${descontoNoAsaas > 0 ? ` + Dev: R$ ${descontoNoAsaas.toFixed(2)}` : ''}`);
                        valorBaixado += valorAsaas;
                    }

                    // 2. Formas não-dinheiro comuns (PIX, Cartão)
                    // Com devolução → criar baixa com desconto para fechar a parcela residual
                    // Sem devolução → apenas alterar metodo_pagamento na parcela (sem baixar)
                    if (formasCondicao.length > 0) {
                        const [metodoMaior, grupoMaior] = formasCondicao.reduce((a, b) => b[1].valor > a[1].valor ? b : a);
                        const valorNaoDinheiro = Math.round(formasCondicao.reduce((s, [, g]) => s + g.valor, 0) * 100) / 100;
                        const detalheFormas = formasCondicao.map(([m, g]) => `${g.formaNome}: R$ ${g.valor.toFixed(2)}`).join(', ');

                        if (valorDevolvido > 0.01) {
                            // Devolução pendente: criar baixa com desconto que fecha o restante da parcela CA
                            await contaAzulService.criarBaixa(parcela.id, {
                                data_pagamento: dataPgto,
                                composicao_valor: {
                                    valor_bruto: valorNaoDinheiro,
                                    multa: 0, juros: 0, desconto: valorDevolvido, taxa: 0
                                },
                                conta_financeira: contaCaixinha.id,
                                metodo_pagamento: metodoMaior,
                                observacao: `${detalheFormas} | Dev: R$ ${valorDevolvido.toFixed(2)} | ${obsBase}`
                            });
                            acoes.push(`Baixa ${grupoMaior.formaNome} R$ ${valorNaoDinheiro.toFixed(2)} + Dev R$ ${valorDevolvido.toFixed(2)}`);
                        } else {
                            // Sem devolução: apenas alterar método na parcela
                            const parcelaAtual = await contaAzulService.buscarParcelaDetalhe(parcela.id);
                            await contaAzulService.atualizarParcela(parcela.id, {
                                versao: parcelaAtual.versao,
                                metodo_pagamento: metodoMaior,
                                nota: `${detalheFormas} | ${obsBase}`
                            });
                            acoes.push(`Condição alterada para ${grupoMaior.formaNome}: ${detalheFormas}`);
                        }
                    }

                    // Marcar localmente que a baixa foi realizada
                    await prisma.pedido.update({
                        where: { id: pedido.id },
                        data: {
                            baixaCaRealizada: true,
                            baixaCaValor: Math.round(pedido._valorElegivel * 100) / 100,
                            baixaCaEm: new Date()
                        }
                    });

                    resultados.push({
                        pedidoId: pedido.id,
                        numero: pedido.numero,
                        cliente: clienteNome,
                        tipo: 'CA',
                        status: 'OK',
                        valor: pedido._valorElegivel,
                        detalhe: acoes.join(' | ')
                    });

                } catch (err) {
                    const errMsg = err.response?.data?.message || err.response?.data
                        ? JSON.stringify(err.response?.data)
                        : err.message;
                    resultados.push({
                        pedidoId: pedido.id,
                        numero: pedido.numero,
                        cliente: clienteNome,
                        tipo: 'CA',
                        status: 'ERRO',
                        erro: errMsg
                    });
                }
            }
        }

        const ok = resultados.filter(r => r.status === 'OK').length;
        const erros = resultados.filter(r => r.status === 'ERRO').length;
        const jaQuitados = resultados.filter(r => r.status === 'JA_QUITADO').length;

        res.json({
            message: `Baixa: ${ok} OK, ${erros} erro(s), ${jaQuitados} já quitado(s)`,
            resultados,
            contaCaixinha: contaCaixinha ? { id: contaCaixinha.id, nome: contaCaixinha.nome } : null
        });

    } catch (error) {
        console.error('Erro ao quitar:', error);
        res.status(500).json({ error: 'Erro ao processar quitação.' });
    }
});

module.exports = router;
