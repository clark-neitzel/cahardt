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
const produtos = (foco, completo) => {
    const lista = PRODUTOS.filter((p) => !(foco === 'producao' && p[2] !== 'FABRICADO'));
    return {
        periodo: PERIODO, foco, resumo: { qtdProdutos: lista.length, semCusto: 0 },
        linhas: lista.map(([produtoId, nome, classe, q, pr, cf, dc, cv, mk, mc, mcp, mct, status, rotulo]) => ({
            produtoId, nome, categoria: null, classe, unidade: 'un', quantidadeVendida: q,
            custoFichaUn: cf, custoFonte: classe === 'FABRICADO' ? 'FICHA' : 'COMPRA',
            variacaoCusto4sPct: dc, temCustoFaltando: false, fichaDesatualizada: produtoId === 'p5',
            ...(completo ? { precoMedio: pr, custoVariavelUn: cv, markup: mk, mcUn: mc, mcPct: mcp, mcTotal: mct * 1000, situacao: { status, rotulo } } : {}),
        })),
    };
};

const sk = (palavra, status) => ({ status, palavra, base: 'media3m' });

export function mockIndicador(rota, params) {
    const foco = params.foco === 'producao' ? 'producao' : 'todos';
    const completo = foco === 'todos';
    switch (rota) {
        case 'resumo':
            return {
                periodo: PERIODO,
                cobertura: { itensTotal: 1840, itensSnapshotReal: 1210, itensSnapshotEstimado: 600, itensSemSnapshot: 30, pctReal: 65.8, avisos: ['34% do custo vem de estimativa (vendas antigas, antes de o sistema gravar o custo no pedido).'] },
                kpis: {
                    receitaLiquida: { valor: 379300, anterior: 362000, variacaoPct: 4.8, semaforo: sk('no alvo', 'ok') },
                    margemContribuicao: { valor: 125100, pct: 33.0, anterior: 125200, pctAnterior: 34.6, deltaPt: -1.6, media3mPct: 34.9, semaforo: sk('atenção', 'atencao') },
                    resultadoOperacional: { valor: 32300, pct: 8.5, anterior: 35100, pctAnterior: 9.7, deltaPt: -1.2, media3mPct: 9.4, semaforo: sk('atenção', 'atencao') },
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
            return { periodo: PERIODO, estoque: { diasEstoqueProdutoAcabado: 11, diasEstoqueInsumos: 9 }, perdas: { disponivel: false, valorMes: null, pctCpv: null, metaPct: null, semanal: [] }, custoRealXPadrao: { disponivel: false, desvioPct: null }, rendimentoLote: { disponivel: false, realPct: null, fichaPct: null } };
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
                periodo: PERIODO, custoEntregaOrigem: 'ESTIMADO',
                linhas: [
                    ['k1', 'Supermercado Central', 41800, 5, 8, 640, 36, 15000], ['k2', 'Padaria Dona Rosa', 22500, 0, 12, 960, 38, 8600], ['k3', 'Mercado Boa Vista', 18200, 12, 13, 1040, 21, 3800],
                    ['k4', 'Buffet Alegria', 16900, 3, 4, 320, 40, 6800], ['k5', 'Conveniência 24h Norte', 12400, 8, 9, 720, 29, 3600], ['k6', 'Lanchonete do Pedro', 9100, 0, 5, 400, 37, 3400],
                ].map(([clienteId, nome, receita, descontoMedioPct, entregas, custoEntrega, mcPct, mcTotal]) => ({ clienteId, nome, receita, descontoMedioPct, entregas, custoEntrega, mcPct, mcTotal })),
            };
        case 'categorias-pendentes':
            return { semNatureza: 7, semMarcaCompraEstoque: 3, categorias: [] };
        case 'config':
            return { aliquotaImpostoVenda: null };
        default:
            return null;
    }
}
