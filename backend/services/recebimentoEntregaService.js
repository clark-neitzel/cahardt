/**
 * Recebimento nascido na ENTREGA (pedido especial) — sempre com ledger.
 *
 * Antes desta correção, três caminhos gravavam a parcela direto (status PAGO,
 * valorPago cheio) sem criar linha em `pagamentos_parcela`:
 *   - Caixa → baixa em lote, ramo dos pedidos ESPECIAIS (routes/caixa.js)
 *   - Entrega finalizada com pagamento em caixa (routes/entregas.js)
 *   - Correção retroativa "pagamento já registrado na entrega" (routes/adminExec.js)
 * Resultado medido em produção: 638 parcelas / R$ 203.718,88 pagas sem histórico,
 * e parcela virando PAGO mesmo recebendo menos do que vale.
 *
 * Regras deste módulo (decisões do dono):
 *  1. Todo recebimento vira UMA linha de ledger por forma/parcela, com valor,
 *     forma, conta financeira, data, quem recebeu e origem.
 *  2. Parcela só vira PAGO quando recebido + desconto cobre o valor (tolerância
 *     de 1 centavo). Recebeu menos → PARCIAL, saldo continua em aberto para cobrança.
 *  3. Idempotência POR FILA, por colunas de verdade — não por marca no texto da
 *     observação: conta a receber do pedido + `origem` + `formaPagamento` +
 *     `contaFinanceiraCaId`. Rodar de novo só registra o que ainda falta daquela fila,
 *     e nada "vaza" de uma conta financeira para outra (ver `totalJaRegistradoPorFila`).
 *  4. Estorno: é o estorno normal do ledger em Financeiro → Contas a Receber
 *     (`DELETE /contas-receber/:parcelaId/baixa`), que já recalcula parcela e conta pelo
 *     ledger que sobrou. Não existe (nem precisa) estorno próprio "da entrega".
 */
const prisma = require('../config/database');
const { garantirContaFinanceira } = require('./contaFinanceiraGuardService');

const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;

const statusParcelaPos = (valor, valorPago, valorDescontoTotal) => {
    const recebidoTotal = Number(valorPago || 0) + Number(valorDescontoTotal || 0);
    if (recebidoTotal <= 0) return 'PENDENTE';
    if (recebidoTotal >= Number(valor) - 0.01) return 'PAGO';
    return 'PARCIAL';
};

/** Status da conta pela lista oficial: ABERTO | PARCIAL | QUITADO | CANCELADO. */
const statusContaPos = (parcelas) => {
    const total = parcelas.length;
    const pagas = parcelas.filter((p) => p.status === 'PAGO').length;
    const parciais = parcelas.filter((p) => p.status === 'PARCIAL').length;
    const canceladas = parcelas.filter((p) => p.status === 'CANCELADO').length;
    if (total === 0) return 'ABERTO';
    if (canceladas >= total) return 'CANCELADO';
    if (pagas + canceladas >= total) return 'QUITADO';
    if (pagas > 0 || parciais > 0) return 'PARCIAL';
    return 'ABERTO';
};

/**
 * Conta financeira do DINHEIRO — a "Caixinha". Pedido especial recebido em espécie
 * é sempre baixado nela (decisão do dono). Fonte única: a conta ativa com
 * tipoUso 'DINHEIRO' (mesmo critério do `contaEspeciePadrao` da tela de Contas a
 * Receber). Null só se não houver conta em espécie cadastrada.
 */
async function contaEspecieId(client = prisma) {
    try {
        const c = await client.contaFinanceira.findFirst({
            where: { tipoUso: 'DINHEIRO', ativo: true },
            select: { id: true },
            orderBy: { nomeBanco: 'asc' }
        });
        return c?.id || null;
    } catch (_) {
        return null;
    }
}

/**
 * Quanto JÁ virou ledger vivo nesta conta, POR FILA (forma + conta financeira + origem).
 *
 * A idempotência é por CHAVE ESTRUTURADA, não por total: deduzir do total faria a 2ª
 * passada descontar de uma fila e sobrar em outra — o valor total ficaria certo e a
 * QUEBRA POR CONTA errada (ex.: R$ 50 do PIX Asaas descontados do dinheiro), o que
 * envenena Saldos por Conta, conciliação e DRE. Cada linha de ledger já carrega a
 * chave em colunas de verdade: `parcela.contaReceberId` (= o pedido, 1:1),
 * `origem`, `formaPagamento` e `contaFinanceiraCaId`.
 */
async function totalJaRegistradoPorFila(tx, { contaReceberId, origem, forma, contaCaId }) {
    const linhas = await tx.pagamentoParcela.findMany({
        where: {
            estornado: false,
            parcela: { contaReceberId },
            origem,
            formaPagamento: forma,
            // contaFinanceiraCaId null é valor legítimo ("não informado") — comparação direta
            contaFinanceiraCaId: contaCaId || null
        },
        select: { valorRecebido: true }
    });
    return round2(linhas.reduce((s, l) => s + Number(l.valorRecebido), 0));
}

async function recalcularStatusConta(tx, contaReceberId) {
    const todas = await tx.parcela.findMany({
        where: { contaReceberId },
        select: { id: true, status: true }
    });
    const novoStatus = statusContaPos(todas);
    await tx.contaReceber.update({ where: { id: contaReceberId }, data: { status: novoStatus } });
    return novoStatus;
}

/**
 * Aplica o dinheiro recebido na entrega nas parcelas abertas da conta.
 *
 * @param tx            client da transação (obrigatório — sempre dentro de $transaction)
 * @param contaReceberId conta a receber do pedido (a idempotência é por ela + fila,
 *                       não por marca no texto — ver `totalJaRegistradoPorFila`)
 * @param filas         [{ nome, valor, contaCaId }] — dinheiro real, por forma
 * @param dataPagamento data do recebimento
 * @param origem        CAIXA_ROTA (nasceu na entrega) | CAIXA_BAIXA_CA (conferência do caixa)
 * @param registradoPorId quem recebeu (entrega: o motorista; caixa: o operador)
 * @param observacao    texto do histórico (a marca é acrescentada aqui)
 */
async function aplicarRecebimentoEntrega(tx, {
    contaReceberId, filas, dataPagamento, origem, registradoPorId, observacao
}) {
    const obs = observacao || null;

    // Idempotência POR FILA (forma + conta + origem): o que já virou ledger daquela
    // forma/conta não é registrado de novo, e o desconto nunca "vaza" de uma conta
    // para outra. `filas` vem do total acumulado dos pagamentos do pedido, então um
    // recebimento NOVO na mesma forma entra como diferença, sem duplicar o anterior.
    let jaRegistrado = 0;
    const pendentes = [];
    for (const f of filas) {
        const registradoFila = await totalJaRegistradoPorFila(tx, {
            contaReceberId, origem, forma: f.nome, contaCaId: f.contaCaId
        });
        jaRegistrado = round2(jaRegistrado + registradoFila);
        const disponivel = round2(Number(f.valor) - registradoFila);
        if (disponivel > 0.001) pendentes.push({ ...f, restante: disponivel });
    }

    const resultado = {
        jaRegistrado,
        registrado: 0,
        // formas que entraram no ledger SEM conta financeira definida (ficam "não informado")
        semConta: [],
        parcelasTocadas: [],
        // dinheiro que sobrou das filas e não coube em parcela nenhuma (cliente pagou mais
        // do que o título) — quem chama TEM que mostrar isto ao operador, nunca engolir
        sobra: 0,
        statusConta: null
    };

    if (pendentes.length === 0) {
        resultado.statusConta = await recalcularStatusConta(tx, contaReceberId);
        return resultado;
    }

    const parcelas = await tx.parcela.findMany({
        where: { contaReceberId, status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] } },
        orderBy: [{ numeroParcela: 'asc' }, { dataVencimento: 'asc' }]
    });

    for (const parcela of parcelas) {
        let saldo = round2(Number(parcela.valor) - Number(parcela.valorPago || 0) - Number(parcela.valorDescontoTotal || 0));
        if (saldo <= 0.001) continue;

        let recebidoParcela = 0;
        let ultimaConta = null;
        const formasParcela = [];

        for (const fila of pendentes) {
            if (saldo <= 0.001) break;
            const usa = round2(Math.min(saldo, fila.restante));
            if (usa <= 0) continue;

            await garantirContaFinanceira(fila.contaCaId, tx); // conta pode não existir no cadastro local (FK)
            await tx.pagamentoParcela.create({
                data: {
                    parcelaId: parcela.id,
                    valorRecebido: usa,
                    valorDesconto: 0,
                    formaPagamento: fila.nome,
                    contaFinanceiraCaId: fila.contaCaId || null,
                    dataPagamento,
                    observacao: obs,
                    origem,
                    // caixaDiarioId fica null de propósito: este dinheiro é prestado pela
                    // conferência da tabela do motorista no Caixa, não pelo "a prestar" de
                    // uma baixa manual (mesmo critério do ramo dos pedidos do CA).
                    registradoPorId
                }
            });
            if (!fila.contaCaId) resultado.semConta.push({ forma: fila.nome, valor: usa });

            saldo = round2(saldo - usa);
            fila.restante = round2(fila.restante - usa);
            recebidoParcela = round2(recebidoParcela + usa);
            ultimaConta = fila.contaCaId || ultimaConta;
            if (!formasParcela.includes(fila.nome)) formasParcela.push(fila.nome);
        }

        if (recebidoParcela <= 0) continue;

        const novoPago = round2(Number(parcela.valorPago || 0) + recebidoParcela);
        const novoStatus = statusParcelaPos(parcela.valor, novoPago, parcela.valorDescontoTotal);
        await tx.parcela.update({
            where: { id: parcela.id },
            data: {
                status: novoStatus,
                valorPago: novoPago,
                formaPagamento: formasParcela.join(', ') || parcela.formaPagamento,
                contaFinanceiraCaId: ultimaConta || parcela.contaFinanceiraCaId,
                dataPagamento: novoStatus === 'PAGO' ? dataPagamento : parcela.dataPagamento,
                baixadoPorId: registradoPorId,
                observacao: obs
            }
        });

        resultado.registrado = round2(resultado.registrado + recebidoParcela);
        resultado.parcelasTocadas.push({ id: parcela.id, numero: parcela.numeroParcela, recebido: recebidoParcela, status: novoStatus });
    }

    resultado.sobra = round2(pendentes.reduce((s, f) => s + f.restante, 0));
    resultado.statusConta = await recalcularStatusConta(tx, contaReceberId);
    return resultado;
}

/**
 * CRITÉRIO ÚNICO de "esta linha de pagamento é de RESPONSÁVEL pela cobrança".
 *
 * Linha marcada como "Escritório responsável" (`escritorioResponsavel`) ou "Vendedor
 * responsável" (`vendedorResponsavelId`) NÃO é recebimento: é o registro de QUEM ficou
 * encarregado de cobrar. Não tem banco — e SEM BANCO NÃO HÁ QUITAÇÃO (regra do dono,
 * 08/2026). Não gera ledger, não muda status de parcela, não entra em total de recebido.
 *
 * ⚠️ PONTO DE EXTENSÃO — papel novo NÃO ganha coluna de pessoa nova. Desde 08/2026 o
 * papel mora em `responsavelPapel` (VENDEDOR | ESCRITORIO | MOTORISTA) e a PESSOA continua
 * em `vendedorResponsavelId`, sempre. (O comentário antigo aqui mandava criar
 * `motoristaResponsavelId` — era o oposto: uma segunda coluna de pessoa obriga todo ponto
 * a virar "um ou outro" e multiplica os lugares onde dá para esquecer o campo.)
 * Para acrescentar um papel: entre em `PAPEIS_RESPONSAVEL` + `ROTULO_RESPONSAVEL` logo
 * abaixo, e mais nada. É de propósito que o teste não esteja espalhado: todo ponto
 * (agrupamento do caixa, "a prestar", totais, validação de baixa, contas a receber) deve
 * chamar `papelResponsavel` / `ehResponsavelPelaCobranca`, NUNCA ler os campos crus.
 *
 * ATENÇÃO — são coisas diferentes, não confundir:
 *   • `condicaoRecebimentoService.formaPermitida` diz se a forma PODE SER USADA naquele
 *     pedido (lista `formasRecebimentoPermitidas` da condição);
 *   • esta função diz se aquele valor QUITA ou não.
 * As duas convivem: "Vendedor responsável" costuma ser uma forma PERMITIDA pela condição
 * e mesmo assim NÃO quita. E cuidado: registrar responsável **não** altera a condição do
 * pedido (ele continua "À vista - Dinheiro", que tem banco) — por isso a trava tem que
 * olhar a LINHA DE PAGAMENTO, nunca o `bancoPadrao` da condição.
 */
const PAPEIS_RESPONSAVEL = ['VENDEDOR', 'ESCRITORIO', 'MOTORISTA'];

const ROTULO_RESPONSAVEL = {
    VENDEDOR: 'Vendedor responsável',
    ESCRITORIO: 'Escritório responsável',
    MOTORISTA: 'Motorista responsável'
};
// Versão curta, usada entre parênteses no texto que sai na observação da baixa.
const ROTULO_CURTO_RESPONSAVEL = {
    VENDEDOR: 'vendedor',
    ESCRITORIO: 'escritório',
    MOTORISTA: 'motorista'
};

/**
 * DERIVAÇÃO DO PAPEL — ponto único. Devolve 'VENDEDOR' | 'ESCRITORIO' | 'MOTORISTA',
 * ou `null` quando a linha não é de responsável (é recebimento de verdade).
 *
 * ⚠️ NUNCA leia `responsavelPapel` cru numa tela/relatório. As 44 marcações gravadas antes
 * de 08/2026 têm o campo VAZIO — quem ler cru simplesmente não as enxerga, e o histórico
 * some da tela sem erro nenhum (a tela só fica "mais limpa", ninguém percebe).
 *
 * Fallback do legado (campo vazio):
 *   pessoa preenchida → VENDEDOR;   senão `escritorioResponsavel` → ESCRITORIO.
 * (É a leitura correta do dado antigo: até 08/2026 só existiam esses dois estados.)
 */
const papelResponsavel = (p) => {
    if (!p) return null;
    const papel = String(p.responsavelPapel || '').trim().toUpperCase();
    if (PAPEIS_RESPONSAVEL.includes(papel)) return papel;
    if (p.vendedorResponsavelId) return 'VENDEDOR';
    if (p.escritorioResponsavel) return 'ESCRITORIO';
    return null;
};

/**
 * RÓTULO PRONTO da linha — 'Vendedor responsável' / 'Escritório responsável' /
 * 'Motorista responsável'. `null` quando não é linha de responsável.
 * Use sempre este, nunca monte o texto na mão com `if`: rótulo errado aqui vira dívida de
 * motorista escrita como "vendedor" na observação da baixa, que sai do app.
 * `curto: true` devolve a forma entre parênteses ('motorista').
 */
const rotuloResponsavel = (p, { curto = false } = {}) => {
    const papel = papelResponsavel(p);
    if (!papel) return null;
    return (curto ? ROTULO_CURTO_RESPONSAVEL : ROTULO_RESPONSAVEL)[papel];
};

const ehResponsavelPelaCobranca = (p) => papelResponsavel(p) !== null;

/** Recebimento de verdade = o que NÃO é responsável pela cobrança. */
const ehRecebimentoProprio = (p) => !ehResponsavelPelaCobranca(p);

/**
 * Este pedido tem BAIXA NASCIDA DA CONFERÊNCIA DO CAIXA ainda viva?
 *
 * Só conta ledger com origem CAIXA_BAIXA_CA — a baixa que veio do dinheiro daquela
 * entrega. Baixa de outra procedência (CONCILIACAO, SYNC_CA, ASAAS, MANUAL,
 * CAIXA_ROTA) NÃO entra: um título do CA quitado pelo extrato não pode impedir o
 * escritório de corrigir a forma de pagamento lançada na entrega, e ninguém deve
 * estornar uma conciliação bancária por causa disso.
 */
async function baixaDeEntregaViva(pedidoId, client = prisma) {
    const conta = await client.contaReceber.findFirst({
        where: { pedidoId },
        select: { id: true, parcelas: { select: { id: true } } }
    });
    if (!conta) return { temBaixa: false };
    const ledgerVivo = await client.pagamentoParcela.count({
        where: {
            parcelaId: { in: conta.parcelas.map(p => p.id) },
            estornado: false,
            origem: 'CAIXA_BAIXA_CA'
        }
    });
    return { temBaixa: ledgerVivo > 0, contaId: conta.id, ledgerVivo };
}

/** Mensagem única para os pontos que recusam mexer numa entrega já baixada. */
const MSG_TITULO_JA_BAIXADO = 'Este pedido já teve o título baixado no Caixa. '
    + 'Desfaça a baixa primeiro em Financeiro → Contas a Receber (estornar a baixa) '
    + 'e só então estorne/edite a entrega.';

/**
 * Contas de pedido ESPECIAL que estão só AGUARDANDO A CONFERÊNCIA DO CAIXA:
 * entrega concluída e o dinheiro real recebido na rua (fora "escritório/vendedor
 * responsável", que não são recebimento) cobre o saldo em aberto do título.
 * Quem está nessa janela NÃO é devedor — não bloqueia venda nem vai para cobrança
 * em rota. Especial fiado de verdade (nada recebido, ou só responsável) continua fora
 * desta lista e segue cobrável normalmente.
 *
 * @param contas lista com { id, parcelas[{valor,valorPago,valorDescontoTotal,status}],
 *                           pedido: { especial, statusEntrega, pagamentosReais[] } }
 * @returns Set com os ids das contas na janela
 */
function contasAguardandoConferencia(contas) {
    const ids = new Set();
    for (const conta of contas || []) {
        const pedido = conta.pedido;
        if (!pedido?.especial) continue;
        if (!['ENTREGUE', 'ENTREGUE_PARCIAL'].includes(pedido.statusEntrega)) continue;

        const recebidoReal = round2((pedido.pagamentosReais || [])
            .filter(p => Number(p.valor) > 0 && ehRecebimentoProprio(p))
            .reduce((s, p) => s + Number(p.valor), 0));
        if (recebidoReal <= 0) continue; // fiado puro: continua cobrável

        const saldoAberto = round2((conta.parcelas || [])
            .filter(p => ['PENDENTE', 'VENCIDO', 'PARCIAL'].includes(p.status))
            .reduce((s, p) => s + Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0), 0));
        if (saldoAberto <= 0.01) continue;

        // Só sai da cobrança quem pagou o saldo INTEIRO. Pagou parte? o resto é dívida real.
        if (recebidoReal >= saldoAberto - 0.01) ids.add(conta.id);
    }
    return ids;
}

/**
 * PONTO ÚNICO de consulta da janela: ids das contas de especial entregue e já pago em
 * dinheiro que só esperam a conferência do Caixa. Quem está aqui NÃO é devedor e não
 * pode aparecer como inadimplente em tela nenhuma (selo do cliente, rota do vendedor,
 * dashboards, aging) nem bloquear venda.
 *
 * Uma consulta só e estreita (especial + entregue + conta aberta), por isso barata; o
 * resultado é um Set pequeno, seguro de usar em `notIn` ou em filtro no JS.
 *
 * @param desdeDias  recorte OPCIONAL pela data de entrega (ex.: 90 = últimos 90 dias).
 *   Use SÓ em painel/dashboard/aging, onde o efeito de perder um caso antigo é um número
 *   um pouco maior na tela. NUNCA use nos pontos que PROTEGEM o cliente — bloqueio de
 *   venda, selo de inadimplente, painel de cobrança e "cobrar agora" — que continuam
 *   varrendo tudo, sem recorte. Pedido sem data de entrega entra sempre (o `gte` do
 *   Prisma exclui linha null; por isso o OR explícito com `{ dataEntrega: null }`).
 */
async function idsContasEmEsperaDeConferencia({ clienteIds = null, desdeDias = null, client = prisma } = {}) {
    const recorteEntrega = desdeDias > 0
        ? { OR: [{ dataEntrega: null }, { dataEntrega: { gte: new Date(Date.now() - desdeDias * 24 * 60 * 60 * 1000) } }] }
        : {};
    const contas = await client.contaReceber.findMany({
        where: {
            status: { in: ['ABERTO', 'PARCIAL'] },
            ...(clienteIds ? { clienteId: { in: clienteIds } } : {}),
            pedido: { especial: true, statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] }, ...recorteEntrega }
        },
        select: {
            id: true,
            parcelas: { select: { valor: true, valorPago: true, valorDescontoTotal: true, status: true } },
            pedido: {
                select: {
                    especial: true, statusEntrega: true,
                    pagamentosReais: { select: { valor: true, responsavelPapel: true, escritorioResponsavel: true, vendedorResponsavelId: true } }
                }
            }
        }
    });
    return contasAguardandoConferencia(contas);
}

module.exports = {
    idsContasEmEsperaDeConferencia,
    PAPEIS_RESPONSAVEL,
    papelResponsavel,
    rotuloResponsavel,
    ehResponsavelPelaCobranca,
    ehRecebimentoProprio,
    baixaDeEntregaViva,
    MSG_TITULO_JA_BAIXADO,
    contasAguardandoConferencia,
    round2,
    statusParcelaPos,
    statusContaPos,
    contaEspecieId,
    totalJaRegistradoPorFila,
    recalcularStatusConta,
    aplicarRecebimentoEntrega
};
