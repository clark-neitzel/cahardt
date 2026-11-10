// Dados de EXEMPLO (mesmos números do mock aprovado pelo dono). Só são usados quando a
// API real ainda não existe no servidor (404). Nunca é o caminho principal.
// Respeita a visão: foco=producao devolve só fabricados e nada financeiro.

const PERIODO = { de: '2026-09-01', ate: '2026-09-30', dias: 30, anterior: { de: '2026-08-01', ate: '2026-08-31' } };
const SEMANAS = ['10/08', '17/08', '24/08', '31/08', '07/09', '14/09', '21/09', '28/09'];
const idx = (v) => v.map((x) => (x / v[0]) * 100);
const INS = [
    { itemPcpId: 'i1', nome: 'Peito de frango', unidade: 'kg', tipo: 'MP', pesoCpvPct: 31, v: [9.8, 9.8, 10.2, 10.2, 10.6, 10.9, 11.2, 11.2], altasSeguidas: 3, custoMedioAtual: 10.85 },
    { itemPcpId: 'i2', nome: 'Óleo de soja', unidade: 'lt', tipo: 'MP', pesoCpvPct: 9, v: [7.4, 7.4, 7.4, 7.6, 7.6, 7.9, 8.4, 8.4], altasSeguidas: 2, custoMedioAtual: 8.1 },
    { itemPcpId: 'i3', nome: 'Farinha de trigo', unidade: 'kg', tipo: 'MP', pesoCpvPct: 14, v: [3.1, 3.1, 3.05, 3.05, 3.0, 3.0, 3.0, 2.95], altasSeguidas: 0, custoMedioAtual: 3.0 },
    { itemPcpId: 'i4', nome: 'Queijo mussarela', unidade: 'kg', tipo: 'MP', pesoCpvPct: 12, v: [33.5, 33.5, 34.0, 34.0, 34.8, 34.8, 34.8, 34.8], altasSeguidas: 0, custoMedioAtual: 34.4 },
];
const insumos = (completo) => ({
    kpi: { variacaoPct: 6.4, semanas: 8, semaforo: { status: 'agir', palavra: 'subindo', base: 'faixa' }, destaques: [{ itemPcpId: 'i1', nome: 'Peito de frango', variacaoPct: 14.3 }, { itemPcpId: 'i2', nome: 'Óleo de soja', variacaoPct: 13.5 }] },
    semanas: SEMANAS.map((rotulo, i) => ({ inicio: `2026-${i < 3 ? '08' : '09'}-${String(10 + i * 3).padStart(2, '0')}`, rotulo })),
    insumos: INS.map(({ v, pesoCpvPct, ...r }) => ({
        ...r,
        ...(completo ? { pesoCpvPct } : {}),
        valores: v, estimados: v.map(() => false), indice: idx(v),
        variacaoPct: Number((((v[7] / v[0]) - 1) * 100).toFixed(1)),
    })),
});

const PRODUTOS = [
    ['p1', 'Coxinha de frango 500 g', 'FABRICADO', 4120, 13.9, 6.28, 9.2, 0.91, 2.21, 6.71, 48.3, 27.6, 'agir', 'custo subiu, preço parado'],
    ['p2', 'Kibe 500 g', 'FABRICADO', 2860, 12.5, 5.12, 4.1, 0.82, 2.44, 6.56, 52.5, 18.8, 'ok', 'no alvo'],
    ['p3', 'Bolinha de queijo 500 g', 'FABRICADO', 2310, 14.2, 6.74, 2.6, 0.93, 2.11, 6.53, 46.0, 15.1, 'atencao', 'markup abaixo de 2,2'],
    ['p4', 'Risole de carne 500 g', 'FABRICADO', 1940, 13.4, 5.81, 1.9, 0.88, 2.31, 6.71, 50.1, 13.0, 'ok', 'no alvo'],
    ['p5', 'Pão de queijo 1 kg', 'FABRICADO', 1520, 18.9, 9.4, 0.8, 1.24, 2.01, 8.26, 43.7, 12.6, 'atencao', 'markup abaixo de 2,2'],
    ['p6', 'Pastel pronto 400 g', 'REVENDA', 1180, 9.8, 6.1, 0.0, 0.64, 1.61, 3.06, 31.2, 3.6, 'atencao', 'revenda · margem fina'],
    ['p7', 'Mini churros 300 g', 'SEM_CLASSE', 640, 7.4, 4.8, 3.2, 0.48, 1.54, 2.12, 28.6, 1.4, 'agir', 'sem ficha e sem marca de revenda'],
];
const detalheMock = (status, nome, q, pr, cv, mcp) => {
    const v = status === 'agir' ? 7.8 : status === 'atencao' ? 3.4 : -0.6;
    const mcAnt = Number((mcp / (1 - v / 100)).toFixed(1));
    const cvAnt = Number((cv / (status === 'ok' ? 1 : 1.07)).toFixed(2));
    const motivos = status === 'ok'
        ? [{ tipo: 'estavel', texto: 'Preço e custo estáveis em relação ao período anterior.' }]
        : [{ tipo: 'custo', texto: `O custo variável subiu de R$ ${String(cvAnt).replace('.', ',')} para R$ ${String(cv).replace('.', ',')} por unidade.` },
           { tipo: 'preco', texto: 'O preço médio ficou parado, então o aumento do custo comeu a margem.' }];
    return {
        base: 'periodo_anterior', regra: { atencaoPct: 2, agirPct: 5 }, variacaoRelativaPct: v,
        atual: { de: '2026-09-01', ate: '2026-09-30', quantidadeVendida: q, receita: q * pr, precoMedio: pr, custoVariavelUn: cv, mcPct: mcp },
        anterior: { de: '2026-08-01', ate: '2026-08-31', quantidadeVendida: Math.round(q * 0.93), receita: q * pr * 0.93, precoMedio: pr, custoVariavelUn: cvAnt, mcPct: mcAnt },
        motivos,
    };
};
const produtos = (foco, completo) => {
    const lista = PRODUTOS.filter((p) => !(foco === 'producao' && p[2] !== 'FABRICADO'));
    return {
        periodo: PERIODO, foco, resumo: { qtdProdutos: lista.length, semCusto: 0 },
        linhas: lista.map(([produtoId, nome, classe, q, pr, cf, dc, cv, mk, mc, mcp, mct, status, rotulo]) => ({
            produtoId, nome, categoria: null, classe, unidade: 'un', quantidadeVendida: q,
            custoFichaUn: cf, custoFonte: classe === 'FABRICADO' ? 'FICHA' : 'COMPRA',
            variacaoCusto4sPct: dc, temCustoFaltando: false, fichaDesatualizada: produtoId === 'p5',
            ...(completo ? { precoMedio: pr, custoVariavelUn: cv, markup: mk, mcUn: mc, mcPct: mcp, mcTotal: mct * 1000, situacao: { status, rotulo, detalhe: detalheMock(status, nome, q, pr, cv, mcp) } } : {}),
        })),
    };
};

const sk = (palavra, status) => ({ status, palavra, base: 'media3m' });


// ---- nível 2 do "Por quê?" (causas) — números da proposta; listas longas p/ exercitar "Mostrar todos" ----
const NOMES_CLI = ['Mercado São José', 'Lanchonete Ponto Certo', 'Bar do Zé', 'Padaria Central', 'Supermercado Horizonte', 'Mercado Bela Vista', 'Conveniência Rota 101', 'Restaurante Sabor', 'Lanchonete Esquina', 'Empório Vila Nova', 'Mini Mercado Sol', 'Bar e Petiscos Lara', 'Cantina do Chico', 'Mercearia Dois Irmãos'];
const dtMock = (d) => `2026-11-${String(d).padStart(2, '0')}`;
function causasMock(params) {
    const cli = (i) => ({ clienteId: `c${i}`, cliente: NOMES_CLI[i % NOMES_CLI.length] + (i >= NOMES_CLI.length ? ` ${i}` : ''), vendedorId: `v${i % 2}`, vendedor: i % 2 ? 'Josi' : 'Carlos' });
    const comoLista = ['flex', 'desconto_manual', 'abaixo_custo'];
    const precoItens = Array.from({ length: 13 }, (_, i) => {
        const abaixo = i < 11, como = abaixo ? comoLista[i % 3] : 'tabela';
        const pr = abaixo ? 29.9 - i * 0.4 : 32.16, qtd = 12 - (i % 5);
        const perdido = abaixo ? Number(((32.16 - pr) * qtd).toFixed(2)) : 0;
        return {
            ...cli(i), qtd, qtdAbaixo: abaixo ? qtd : 0, precoTabela: 32.16, precoPraticado: Number(pr.toFixed(2)),
            diferencaPct: abaixo ? Number((((pr - 32.16) / 32.16) * 100).toFixed(1)) : 0, perdidoRS: perdido, como,
            flexRS: como === 'flex' ? perdido : 0, manualRS: como === 'flex' ? 0 : perdido, abaixoCustoQtd: como === 'abaixo_custo' ? qtd : 0,
            pedidos: [{ id: `p${i}a`, numero: 2041 + i, rotulo: `#${2041 + i}` }, ...(i % 3 === 0 ? [{ id: `p${i}b`, numero: 2077 + i, rotulo: `#${2077 + i}` }] : [])],
        };
    });
    const retornos = ['sem_retorno', 'comprou', 'dentro_prazo'];
    const bonif = Array.from({ length: 12 }, (_, i) => {
        const retorno = retornos[i % 3];
        return { pedidoId: `b${i}`, numero: 118 + i, rotulo: `BN#${118 + i}`, data: dtMock(3 + i), ...cli(i), qtd: 2 + (i % 4), custoRS: Number(((2 + (i % 4)) * 5.91).toFixed(2)), semCusto: false,
            comprouDepoisRS: retorno === 'comprou' ? 643.2 : 0, comprouDepoisQtd: retorno === 'comprou' ? 20 : 0, prazoAte: dtMock(28), dentroPrazo: retorno === 'dentro_prazo', retorno };
    });
    const sit = ['reduziu', 'parou', 'reduziu', 'cresceu'];
    const vol = Array.from({ length: 12 }, (_, i) => {
        const situacao = i < 8 ? sit[i % 3 === 1 ? 1 : (i % 2 ? 0 : 0)] : 'cresceu';
        const ant = 40 - i * 2, atu = situacao === 'parou' ? 0 : (situacao === 'cresceu' ? ant + 6 : Math.round(ant * 0.3));
        return { ...cli(i), qtdAnterior: ant, qtdAtual: atu, diferenca: atu - ant, variacaoPct: Number((((atu - ant) / ant) * 100).toFixed(1)),
            ultimoPedido: { id: `u${i}`, numero: 2058 + i, rotulo: `#${2058 + i}`, data: dtMock(6 + i) }, diasSemComprar: situacao === 'parou' ? 17 : null, situacao };
    });
    const base = {
        produtoId: 'mock', nome: 'Produto de exemplo', classe: 'FABRICADO', unidade: 'un',
        periodo: { de: params.de, ate: params.ate }, anterior: { de: '2026-10-01', ate: '2026-10-31' },
        decomposicao: {
            comparavel: true, motivoSemComparacao: null, mcPctAntes: 84.0, mcPctAgora: 81.3, variacaoMcPp: -2.7, interacaoPp: -0.1,
            mcTotalAntes: 3167.0, mcTotalAgora: 1141.0, variacaoMcTotal: -2026.0,
            custo: { antes: 5.15, agora: 5.91, variacaoPct: 14.8, ppMargem: -2.3, impactoMcTotal: -33.44 },
            preco: { antes: 32.16, agora: 31.59, variacaoPct: -1.8, ppMargem: -0.4, impactoMcTotal: -25.08 },
            volume: { antes: 119, agora: 44, variacaoPct: -63.0, ppMargem: 0, impactoMcTotal: -1900 },
            maiorCausa: 'custo',
        },
        insumos: [
            { itemPcpId: 'i1', nome: 'SALSICHA HOT DOG KG', unidade: 'kg', qtdPorUn: 0.45, custoAntes: 14.9, custoAgora: 18.4, antesEstimado: false, variacaoPct: 23.5, impactoUn: 1.575, semCompra: false,
                mudouEm: { numeroNota: '48213', fornecedor: 'Frigorífico Sul', data: '2026-11-12', compraAnterior: { fornecedor: 'Aurora', custo: 14.9, numeroNota: '47100', data: '2026-10-08' } } },
            { itemPcpId: 'i2', nome: 'FARINHA DE ROSCA KG', unidade: 'kg', qtdPorUn: 0.12, custoAntes: 7.1, custoAgora: 7.6, antesEstimado: false, variacaoPct: 7.0, impactoUn: 0.06, semCompra: false,
                mudouEm: { numeroNota: '48090', fornecedor: 'Atacadão', data: '2026-11-05', compraAnterior: null } },
            { itemPcpId: 'i3', nome: 'OVO DÚZIA', unidade: 'dz', qtdPorUn: 0.3, custoAntes: 11, custoAgora: 11, antesEstimado: false, variacaoPct: 0, impactoUn: 0, mudouEm: null, semCompra: false },
            { itemPcpId: 'i4', nome: 'ÓLEO DE SOJA L', unidade: 'L', qtdPorUn: 0.05, custoAntes: 7.4, custoAgora: 6.9, antesEstimado: false, variacaoPct: -6.8, impactoUn: -0.025, semCompra: false,
                mudouEm: { numeroNota: '47980', fornecedor: 'Atacadão', data: '2026-11-02', compraAnterior: null } },
            { itemPcpId: 'i5', nome: 'EMBALAGEM C/10', unidade: 'un', qtdPorUn: 1, custoAntes: 0.62, custoAgora: 0.62, antesEstimado: false, variacaoPct: 0, impactoUn: 0, mudouEm: null, semCompra: true },
        ],
        custoFichaAtual: 5.91, custoFichaAnterior: 5.15, custoMedioGravado: 5.15, fichaDeReferencia: false,
        precoClientes: { itens: precoItens, resumo: { qtdAbaixo: 24, qtdTotal: 44, perdidoRS: 95.4, flexRS: 27.12, manualRS: 68.28, abaixoCustoQtd: 4 } },
        bonificacoes: { itens: bonif, resumo: { pedidos: 12, qtd: 36, custoRS: 212.76, custoSemRetornoRS: 71 } },
        volumeClientes: { itens: vol, resumo: { qtdAnterior: 119, qtdAtual: 44, unidadesAMenos: 75, clientesQueda: 8, unidadesQueda: 82.5, clientesAlta: 4, unidadesAlta: 7.5 } },
        links: { fichaTecnica: '/pcp/receitas/mock', pedidos: null },
    };
    // ?semcomparacao=1 não existe na API real; no mock, produto p3 simula comparavel=false
    return base;
}

export function mockIndicador(rota, params) {
    const mc = /^produtos\/([^/]+)\/causas$/.exec(rota);
    if (mc) {
        const m = causasMock(params);
        if (mc[1] === 'p3') {
            m.decomposicao = { ...m.decomposicao, comparavel: false, motivoSemComparacao: 'Não houve venda deste produto no período anterior; não dá para comparar.', mcPctAntes: null, variacaoMcPp: null, interacaoPp: null, mcTotalAntes: null, variacaoMcTotal: null, maiorCausa: null,
                custo: { antes: null, agora: 5.91, variacaoPct: null, ppMargem: null, impactoMcTotal: null }, preco: { antes: null, agora: 31.59, variacaoPct: null, ppMargem: null, impactoMcTotal: null }, volume: { antes: 0, agora: 44, variacaoPct: null, ppMargem: null, impactoMcTotal: null } };
        }
        return m;
    }

    const foco = params.foco === 'producao' ? 'producao' : 'todos';
    const completo = foco === 'todos';
    switch (rota) {
        case 'resumo':
            return {
                periodo: PERIODO,
                cobertura: { itensTotal: 1840, itensSnapshotReal: 1210, itensSnapshotEstimado: 600, itensSemSnapshot: 30, pctReal: 65.8, avisos: ['34% do custo vem de estimativa (vendas antigas, antes de o sistema gravar o custo no pedido).'] },
                kpis: {
                    receitaLiquida: { valor: 379300, anterior: 362000, variacaoPct: 4.8, semaforo: sk('no alvo', 'ok') },
                    margemContribuicao: { valor: 125100, pct: 33.0, anterior: 125200, pctAnterior: 34.6, deltaPt: -1.6, media3mPct: 34.9, deltaMedia3mPt: -1.9, meta: { alvo: 35, sentido: 'MAIOR_MELHOR', unidade: 'pct' }, semaforo: { status: 'atencao', palavra: 'atenção', base: 'meta', meta: { alvo: 35, sentido: 'MAIOR_MELHOR', unidade: 'pct' }, delta: -2 } },
                    resultadoOperacional: { valor: 32300, pct: 8.5, anterior: 35100, pctAnterior: 9.7, deltaPt: -1.2, media3mPct: 9.4, deltaMedia3mPt: -0.9, meta: null, semaforo: sk('atenção', 'atencao') },
                    custoInsumos: { variacaoPct: 6.4, semanas: 8, destaques: [{ itemPcpId: 'i1', nome: 'frango', variacaoPct: 14 }, { itemPcpId: 'i2', nome: 'óleo', variacaoPct: 13 }], semaforo: sk('subindo', 'agir') },
                },
                sparks: { receitaLiquida: [352, 340, 358, 362, 371, 379], mcPct: [35.2, 35.0, 34.8, 34.9, 34.6, 33.0], resultadoPct: [9.1, 8.8, 9.4, 9.9, 9.7, 8.5], custoInsumosIdx: [100, 100, 101.5, 102, 103.4, 104.6, 106.2, 106.4] },
            };
        case 'cascata':
            return {
                periodo: PERIODO, impostoOrigem: 'PAGO', despesasProporcionais: false,
                linhas: [
                    ['receitaBruta', 'Receita bruta', 418500, 'total'], ['devolucoes', 'Devoluções', -6200, 'deducao'], ['impostos', 'Impostos sobre venda', -33000, 'deducao'],
                    ['receitaLiquida', 'Receita líquida', 379300, 'total'], ['cpv', 'CPV (fabricados)', -198400, 'deducao'], ['cmv', 'CMV (revenda)', -21700, 'deducao'],
                    ['lucroBruto', 'Lucro bruto', 159200, 'total'], ['despesasVariaveis', 'Despesas variáveis', -34100, 'deducao'], ['margemContribuicao', 'Margem de contribuição', 125100, 'total'],
                    ['despesasFixas', 'Despesas fixas', -92800, 'deducao'], ['resultado', 'Resultado operacional', 32300, 'resultado'],
                ].map(([chave, rotulo, valor, tipo]) => ({ chave, rotulo, valor, tipo, pctReceitaLiquida: Number(((Math.abs(valor) / 379300) * 100).toFixed(1)) })),
                alertas: { semNatureza: { qtd: 7, valor: 8200 }, cmvSemClasse: 4100 },
            };
        case 'equilibrio':
            return { mes: '2026-10', fixos: 92800, mcPct: 33.0, pontoEquilibrio: 281200, margemSegurancaPct: 25.9, acumulado: 71400, diasUteisDecorridos: 4, diasUteisTotais: 22, projecaoFechamento: 372000, projecaoMetodo: 'ritmo_linear', mesFechado: false, mesReferenciaEquilibrio: 'set/26' };
        case 'insumos-semanal':
            return insumos(completo);
        case 'entradas-semana':
            return {
                semana: { de: '2026-09-28', ate: '2026-10-04' }, notas: 3,
                entradas: [
                    ['c1', 'Peito de frango', 'Frigorífico Aurora', '2026-10-02', 480, 'kg', 11.2, 10.9, 2.8],
                    ['c2', 'Óleo de soja', 'Atacadão', '2026-10-01', 20, 'lt', 8.4, 7.9, 6.3],
                    ['c3', 'Farinha de trigo', 'Moinho Sul', '2026-09-30', 1000, 'kg', 2.95, 3.0, -1.7],
                    ['c4', 'Queijo mussarela', 'Laticínios Vale', '2026-09-30', 120, 'kg', 34.8, 34.8, 0],
                    ['c5', 'Embalagem 500 g', 'Plastpack', '2026-09-29', 5000, 'un', 0.42, 0.42, 0],
                ].map(([compraItemId, nome, fornecedor, dataCompra, quantidade, unidade, custoPago, custoAnterior, variacaoPct]) => ({ compraItemId, itemPcpId: compraItemId, produtoId: null, nome, fornecedor, dataCompra, quantidade, unidade, custoPago, custoAnterior, variacaoPct })),
                efeitoFichas: [{ produtoId: 'p1', nome: 'coxinha', deltaCustoUn: 0.31 }, { produtoId: 'p2', nome: 'kibe', deltaCustoUn: 0.19 }, { produtoId: 'p4', nome: 'risole', deltaCustoUn: 0.08 }],
            };
        case 'produtos':
            return produtos(foco, completo);
        case 'producao':
            return {
                periodo: PERIODO, ordensPendentesApuracao: 1,
                estoque: { diasEstoqueProdutoAcabado: 11, diasEstoqueInsumos: 9, semaforo: { status: 'ok', palavra: 'no alvo', base: 'meta', meta: { alvo: 15, sentido: 'MENOR_MELHOR', unidade: 'dias' }, delta: -4 } },
                perdas: {
                    disponivel: true, valorMes: 1840, pctCpv: completo ? 0.9 : null, pctProduzido: 2.3, perdaTotalValor: 6120, metaPct: 1.5,
                    semaforo: { status: 'atencao', palavra: 'atenção', base: 'meta', meta: { alvo: 1.5, sentido: 'MENOR_MELHOR', unidade: 'pct' }, delta: 0.8 },
                    ordens: 14, ordensSemPreco: 1, ordensEstimadas: 3,
                    semanal: [['2026-08-10', 1.1, 380, 3], ['2026-08-17', 1.9, 520, 2], ['2026-08-24', 0.8, 210, 3], ['2026-08-31', 2.6, 700, 4], ['2026-09-07', 1.4, 360, 2], ['2026-09-14', 3.1, 910, 3], ['2026-09-21', 2.2, 640, 4], ['2026-09-28', 2.3, 410, 2]].map(([inicio, pct, valor, ordens]) => ({ inicio, pct, valor, ordens })),
                },
                custoRealXPadrao: { disponivel: true, desvioPct: 1.8, valorDesvio: 960, ordens: 14, semaforo: { status: 'ok', palavra: 'no alvo', base: 'media3m' } },
                rendimentoLote: { disponivel: true, realPct: 94.6, fichaPct: 96, ordens: 14, semaforo: { status: 'atencao', palavra: 'atenção', base: 'meta', meta: { alvo: 97, sentido: 'MAIOR_MELHOR', unidade: 'pct' }, delta: -2.4 } },
            };
        case 'alertas': {
            const itens = [
                { id: 'a1', nivel: 'urgente', escopo: 'dono', titulo: 'Coxinha de frango: custo subiu 9,2% em 3 semanas, preço não mudou', texto: 'Markup caiu de 2,41× para 2,21×. MC/un de R$ 7,24 para R$ 6,71.', acao: { rotulo: 'Revisar preço', rota: '/financeiro/margem-produtos' } },
                { id: 'a2', nivel: 'urgente', escopo: 'producao', titulo: 'Frango: 3 altas seguidas (+14% em 8 semanas)', texto: 'É o insumo de maior peso nas fichas. Cotar com 2º fornecedor.', acao: null },
                { id: 'a3', nivel: 'atencao', escopo: 'producao', titulo: 'Pão de queijo 1 kg: ficha desatualizada', texto: 'O custo de um insumo da ficha não é atualizado há mais de 60 dias.', acao: { rotulo: 'Abrir receitas', rota: '/pcp/receitas' } },
                { id: 'a4', nivel: 'atencao', escopo: 'dono', titulo: 'Margem de contribuição abaixo da média dos últimos 3 meses', texto: '33,0% contra 34,9%. Causa: custo de insumos, não desconto.', acao: null },
                { id: 'a5', nivel: 'info', escopo: 'dono', titulo: '7 categorias de despesa sem natureza (fixa / variável)', texto: 'Enquanto isso a MC e o ponto de equilíbrio ficam incompletos.', acao: { rotulo: 'Classificar', rota: '/financeiro/categorias-despesa' } },
            ];
            return { itens: foco === 'producao' ? itens.filter((i) => i.escopo === 'producao') : itens };
        }
        case 'clientes':
            return {
                periodo: PERIODO, custoEntregaOrigem: 'ESTIMADO', custoEntregaMetodo: 'POR_PARADA', custoPorParada: 80,
                linhas: [
                    ['k1', 'Supermercado Central', 41800, 5, 8, 640, 36, 15000], ['k2', 'Padaria Dona Rosa', 22500, 0, 12, 960, 38, 8600], ['k3', 'Mercado Boa Vista', 18200, 12, 13, 1040, 21, 3800],
                    ['k4', 'Buffet Alegria', 16900, 3, 4, 320, 40, 6800], ['k5', 'Conveniência 24h Norte', 12400, 8, 9, 720, 29, 3600], ['k6', 'Lanchonete do Pedro', 9100, 0, 5, 400, 37, 3400],
                ].map(([clienteId, nome, receita, descontoMedioPct, entregas, custoEntrega, mcPct, mcTotal]) => ({ clienteId, nome, receita, descontoMedioPct, entregas, paradas: custoEntrega / 80, custoEntrega, mcPct, mcTotal })),
            };
        case 'categorias-pendentes':
            return { semNatureza: 7, semMarcaCompraEstoque: 3, categorias: [] };
        case 'metas': {
            const cat = [
                ['MC_PCT', 'Margem de contribuição', 'pct', 'completo', 'MAIOR_MELHOR', 35, 0, 5], ['RESULTADO_PCT', 'Resultado operacional', 'pct', 'completo', 'MAIOR_MELHOR', null, 0, 5],
                ['CUSTO_INSUMOS_VAR_PCT', 'Variação do custo dos insumos (8 sem.)', 'pct', 'producao', 'MENOR_MELHOR', null, 0, 3], ['PERDA_PCT', 'Perda além da ficha (% do consumo)', 'pct', 'producao', 'MENOR_MELHOR', 1.5, 0, 1.5],
                ['RENDIMENTO_PCT', 'Rendimento do lote', 'pct', 'producao', 'MAIOR_MELHOR', 97, 0, 3], ['DESVIO_CUSTO_PCT', 'Custo real acima do padrão', 'pct', 'producao', 'MENOR_MELHOR', null, 0, 3],
                ['DIAS_ESTOQUE_PA', 'Dias de estoque (produto acabado)', 'dias', 'producao', 'MENOR_MELHOR', 15, 0, 5],
            ];
            return { podeEditar: true, metas: cat.filter((c) => completo || c[3] === 'producao').map(([indicador, rotulo, unidade, escopo, sentido, alvo, ta, tg]) => ({ indicador, rotulo, unidade, escopo, sentido, alvo, toleranciaAtencao: ta, toleranciaAgir: tg, padroes: { sentido, toleranciaAtencao: ta, toleranciaAgir: tg }, vigenciaInicio: alvo != null ? '2026-10-01' : null, atualizadoPorNome: alvo != null ? 'Administrador' : null })) };
        }
        case 'metas/sugestao':
            return { baseMeses: ['2026-07', '2026-08', '2026-09'], sugestoes: [
                { indicador: 'MC_PCT', alvoSugerido: 34.9, base: 'media3m', observacao: 'média dos 3 meses fechados' }, { indicador: 'RESULTADO_PCT', alvoSugerido: 9.4, base: 'media3m', observacao: 'média dos 3 meses fechados' },
                { indicador: 'CUSTO_INSUMOS_VAR_PCT', alvoSugerido: null, base: 'sem_base', observacao: 'preencha manualmente' }, { indicador: 'PERDA_PCT', alvoSugerido: 1.9, base: 'media3m', observacao: '14 ordens' },
                { indicador: 'RENDIMENTO_PCT', alvoSugerido: 95.1, base: 'media3m', observacao: '14 ordens' }, { indicador: 'DESVIO_CUSTO_PCT', alvoSugerido: null, base: 'sem_base', observacao: 'menos de 3 ordens apuradas' },
                { indicador: 'DIAS_ESTOQUE_PA', alvoSugerido: null, base: 'sem_base', observacao: 'preencha manualmente' },
            ] };
        case 'config':
            return { aliquotaImpostoVenda: null };
        default:
            return null;
    }
}
