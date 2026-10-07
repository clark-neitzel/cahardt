/**
 * Indicadores de Gestao — ajustes de DADOS apontados na analise de setembro/2026 (rota admin, NAO e tela).
 * Cada passo e idempotente, tem dry-run (padrao) e devolve antes/depois.
 *  - compra-estoque     : marca compraDeEstoque nas categorias de compra de mercadoria
 *  - agua               : compra de agua mineral ligada ao insumo "Agua" (torneira) -> produto "Agua Mineral s/gas"
 *  - milheiro           : itens de PCP cujo custo/estoque ficou em milheiro
 *  - referencias        : custo de referencia (produto sem ficha usa a ficha de outro x fator)
 *  - reestimar-snapshots: regrava o custo congelado dos itens ESTIMADOS (nunca os reais)
 */
const prisma = require('../config/database');
const custo = require('./indicadoresCustoService');
const snap = require('./custoSnapshotService');

const PASSOS = ['compra-estoque', 'agua', 'milheiro', 'referencias', 'reestimar-snapshots'];
const sa = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = (v) => (v == null ? null : Number(v));
const r4 = (v) => Math.round(v * 10000) / 10000;

// ───────────── a) compra de estoque ─────────────
async function compraEstoque({ dry }) {
    const ALVO = new Set(['materia prima', 'embalagens', 'materiais para revenda']);
    const cats = await prisma.categoriaDespesa.findMany({ select: { id: true, nome: true, compraDeEstoque: true } });
    const achadas = cats.filter((c) => ALVO.has(sa(c.nome)));
    const antes = achadas.map((c) => ({ id: c.id, nome: c.nome, compraDeEstoque: c.compraDeEstoque === true }));
    const aMarcar = achadas.filter((c) => c.compraDeEstoque !== true);
    if (!dry && aMarcar.length) {
        await prisma.categoriaDespesa.updateMany({ where: { id: { in: aMarcar.map((c) => c.id) } }, data: { compraDeEstoque: true } });
    }
    const naoEncontradas = [...ALVO].filter((n) => !achadas.some((c) => sa(c.nome) === n));
    return { antes, depois: dry ? antes.map((a) => ({ ...a, compraDeEstoque: true })) : antes.map((a) => ({ ...a, compraDeEstoque: true })), aplicaria: aMarcar.length, naoEncontradas };
}

// ───────────── b) agua ─────────────
async function agua({ dry }) {
    const cc = require('./custoCompraCalculo');
    const compras = await prisma.compraItem.findMany({
        where: {
            estornado: false, dataCompra: { gte: new Date('2026-08-26T00:00:00Z'), lt: new Date('2026-08-27T23:59:59Z') },
            valorTotal: 14.94
        },
        select: {
            id: true, produtoId: true, itemPcpId: true, quantidade: true, unidade: true, unidadeFornecedor: true, custoUnitario: true,
            valorTotal: true, descricaoFornecedor: true, fornecedorCnpj: true, notaEntradaId: true,
            produto: { select: { nome: true, custoManual: true } }, itemPcp: { select: { id: true, nome: true, custoUnitario: true, produtoId: true } }
        }
    });
    const erradas = compras.filter((c) => sa(c.produto?.nome) === 'agua' || sa(c.itemPcp?.nome) === 'agua');
    const out = { encontradas: erradas.length, compras: [], destino: null, vinculos: [], custos: {} };
    const destinoP = (await prisma.produto.findMany({ where: { nome: { contains: 'gua Mineral s/g', mode: 'insensitive' } }, select: { id: true, nome: true, unidade: true, custoManual: true } }))
        .find((p) => sa(p.nome) === 'agua mineral s/gas');
    out.destino = destinoP ? { id: destinoP.id, nome: destinoP.nome, unidade: destinoP.unidade } : null;
    if (!erradas.length) { out.observacao = 'Nenhuma compra de R$ 14,94 em 26/08 ligada a "Agua" (já corrigida ou não existe).'; return out; }

    // alvos antigos ("Agua" produto + insumo PCP) e custos de antes
    const prodIds = [...new Set(erradas.map((c) => c.produtoId).filter(Boolean))];
    const itemIds = new Set(erradas.map((c) => c.itemPcpId).filter(Boolean));
    const itensDoProd = prodIds.length ? await prisma.itemPcp.findMany({ where: { produtoId: { in: prodIds } }, select: { id: true, nome: true, custoUnitario: true } }) : [];
    for (const i of itensDoProd) itemIds.add(i.id);
    const itensAgua = itemIds.size ? await prisma.itemPcp.findMany({ where: { id: { in: [...itemIds] } }, select: { id: true, nome: true, custoUnitario: true } }) : [];
    const produtosAgua = prodIds.length ? await prisma.produto.findMany({ where: { id: { in: prodIds } }, select: { id: true, nome: true, custoManual: true } }) : [];
    out.custos.antes = {
        produtosAgua: produtosAgua.map((p) => ({ nome: p.nome, custo: num(p.custoManual) })),
        itensPcpAgua: itensAgua.map((i) => ({ nome: i.nome, custo: num(i.custoUnitario) })),
        destinoMineral: num(destinoP?.custoManual)
    };
    out.compras = erradas.map((c) => ({ id: c.id, de: c.produto?.nome || c.itemPcp?.nome, quantidade: num(c.quantidade), unidade: c.unidade, custoUnitario: num(c.custoUnitario), valorTotal: num(c.valorTotal), origem: c.notaEntradaId ? 'NF' : 'despesa manual' }));

    const or = [...prodIds.map((id) => ({ produtoId: id })), ...[...itemIds].map((id) => ({ itemPcpId: id }))];
    const vins = or.length ? await prisma.fornecedorProdutoVinculo.findMany({ where: { OR: or }, select: { id: true, fornecedorCnpj: true, codigoFornecedor: true, descricaoFornecedor: true } }) : [];
    out.vinculos = vins;
    if (!destinoP) { out.observacao = 'Produto "Agua Mineral s/gás" não existe: nada movido (só relato).'; return out; }

    // Conversão: se a unidade do destino difere, a quantidade da compra (6 garrafas de 1,5 L) e o custo por garrafa
    // (14,94 ÷ 6 = 2,49) valem como estão — só o rótulo da unidade muda. Registrado no retorno.
    const unidadeNova = destinoP.unidade || null;
    out.conversao = erradas.some((c) => unidadeNova && c.unidade !== unidadeNova)
        ? `unidade ${erradas[0].unidade} → ${unidadeNova}; quantidade e custo por unidade mantidos (compra de garrafas: valorTotal ÷ quantidade = custo por garrafa)`
        : 'sem conversão';

    const sobra = async (where) => prisma.compraItem.count({ where: { ...where, estornado: false, id: { notIn: erradas.map((c) => c.id) }, quantidade: { gt: 0 } } });
    if (dry) {
        out.aplicaria = { compras: `mover ${erradas.length} para ${destinoP.nome} (unidade ${destinoP.unidade})`, vinculos: vins.length ? `mover ${vins.length}` : 'nenhum vínculo a mover' };
        const prev = {};
        for (const pid of prodIds) prev[`produto:${pid}`] = (await sobra({ produtoId: pid })) === 0 ? 'sem outras compras: grava 0,02/L explicitamente' : 'ainda há compras: será recalculado';
        for (const iid of itemIds) prev[`itemPcp:${iid}`] = (await sobra({ itemPcpId: iid })) === 0 ? 'sem outras compras: grava 0,02/L explicitamente' : 'ainda há compras: será recalculado';
        prev.destinoMineral = 'será recalculado pelas compras (inclui as movidas)';
        out.custos.previsto = prev;
        return out;
    }
    await prisma.$transaction(async (tx) => {
        for (const c of erradas) {
            await tx.compraItem.update({ where: { id: c.id }, data: { produtoId: destinoP.id, itemPcpId: null, unidade: unidadeNova || c.unidade, unidadeFornecedor: unidadeNova || c.unidadeFornecedor } });
        }
        if (vins.length) await tx.fornecedorProdutoVinculo.updateMany({ where: { id: { in: vins.map((v) => v.id) } }, data: { produtoId: destinoP.id, itemPcpId: null } });
    }, { timeout: 20000, maxWait: 10000 });

    // Recalcula o destino e os alvos antigos. Alvo antigo sem compra = custo de torneira 0,02/L gravado explicitamente
    // (não há registro anterior em NotaEntradaEstoqueMov nem custo no histórico antes de ago/26 — SEM_CUSTO).
    const rec = { destinoMineral: await cc.recalcularCustoAlvo({ produtoId: destinoP.id }) };
    const CUSTO_TORNEIRA = 0.02;
    for (const pid of prodIds) {
        const r = await cc.recalcularCustoAlvo({ produtoId: pid });
        rec[`produto:${pid}`] = { motivo: r.motivo, custo: r.custo };
        if (r.motivo === 'sem-compras') await prisma.produto.update({ where: { id: pid }, data: { custoManual: CUSTO_TORNEIRA } });
    }
    for (const iid of itemIds) {
        const r = await cc.recalcularCustoAlvo({ itemPcpId: iid });
        rec[`itemPcp:${iid}`] = { motivo: r.motivo, custo: r.custo };
        if (r.motivo === 'sem-compras') await prisma.itemPcp.update({ where: { id: iid }, data: { custoUnitario: CUSTO_TORNEIRA } });
    }
    out.custos.recalculo = rec;
    const [ps, is, dm] = await Promise.all([
        prodIds.length ? prisma.produto.findMany({ where: { id: { in: prodIds } }, select: { nome: true, custoManual: true } }) : [],
        itemIds.size ? prisma.itemPcp.findMany({ where: { id: { in: [...itemIds] } }, select: { nome: true, custoUnitario: true } }) : [],
        prisma.produto.findUnique({ where: { id: destinoP.id }, select: { custoManual: true } })
    ]);
    out.custos.depois = { produtosAgua: ps.map((p) => ({ nome: p.nome, custo: num(p.custoManual) })), itensPcpAgua: is.map((i) => ({ nome: i.nome, custo: num(i.custoUnitario) })), destinoMineral: num(dm?.custoManual) };
    out.observacao = 'Estoque não foi mexido (a compra manual nunca somou estoque em "Agua"). Sem registro de custo anterior do alvo antigo: gravado 0,02/L (custo de torneira).';
    return out;
}

// ───────────── c) milheiro ─────────────
async function milheiro({ dry }) {
    const pcpEstoque = require('./pcpEstoqueService');
    const itens = await prisma.itemPcp.findMany({ select: { id: true, codigo: true, nome: true, unidade: true, custoUnitario: true, estoqueAtual: true, produtoId: true } });
    const por = (cod) => itens.find((i) => String(i.codigo || '').replace(/\s+/g, '').toUpperCase() === cod);
    const retrato = (i) => (i ? { codigo: i.codigo, unidade: i.unidade, custo: num(i.custoUnitario), estoque: num(i.estoqueAtual) } : null);
    const out = {};

    // EMB-003: estoque x1000 (lido DENTRO da transação), custo ÷1000, unidade UN; só compras em MI/milh viram x1000
    const e3 = por('EMB-003');
    if (!e3) out['EMB-003'] = { observacao: 'item não encontrado' };
    else {
        const feito = String(e3.unidade).toUpperCase() === 'UN';
        const ehMil = (u) => ['MI', 'MIL', 'MILH', 'MILHEIRO', 'ML'].includes(String(u || '').toUpperCase());
        const todas = await prisma.compraItem.findMany({ where: { itemPcpId: e3.id, estornado: false }, select: { id: true, quantidade: true, unidade: true, fatorConversao: true, custoUnitario: true, valorTotal: true } });
        const compras = todas.filter((c) => ehMil(c.unidade));
        const vins = await prisma.fornecedorProdutoVinculo.findMany({ where: { itemPcpId: e3.id }, select: { id: true, codigoFornecedor: true, unidadeFornecedor: true, fatorConversao: true } });
        out['EMB-003'] = {
            antes: retrato(e3), jaCorrigido: feito,
            comprasAfetadas: compras.map((c) => ({ id: c.id, qtd: num(c.quantidade), un: c.unidade, custo: num(c.custoUnitario), fator: num(c.fatorConversao) })),
            vinculosFornecedor: vins.map((v) => ({ id: v.id, codigo: v.codigoFornecedor, un: v.unidadeFornecedor, fator: num(v.fatorConversao) })),
            notaEntradaItem: 'não guarda fator de conversão (NotaEntradaItem só tem uCom/qCom); o fator vive no vínculo do fornecedor, corrigido abaixo'
        };
        if (!feito && !dry) {
            await prisma.$transaction(async (tx) => {
                const atual = await tx.itemPcp.findUnique({ where: { id: e3.id }, select: { estoqueAtual: true, custoUnitario: true } });
                const alvo = Math.round(Number(atual.estoqueAtual) * 1000 * 1000) / 1000;
                const delta = Math.round((alvo - Number(atual.estoqueAtual)) * 1000) / 1000;
                if (delta > 0) await pcpEstoque.ajustar({ itemPcpId: e3.id, tipo: 'ENTRADA', quantidade: delta, motivo: 'AJUSTE_MANUAL', observacao: 'correção unidade milheiro→un' }, tx);
                await tx.itemPcp.update({ where: { id: e3.id }, data: { custoUnitario: r4(Number(atual.custoUnitario) / 1000), unidade: 'UN' } });
                for (const c of compras) {
                    await tx.compraItem.update({ where: { id: c.id }, data: { quantidade: Math.round(Number(c.quantidade) * 1000 * 1000) / 1000, unidade: 'UN', fatorConversao: Number(c.fatorConversao) * 1000, custoUnitario: r4(Number(c.custoUnitario) / 1000) } });
                }
                // reconferência da nota usaria o fator do vínculo: x1000 também (só onde ainda é 1)
                for (const v of vins) if (Number(v.fatorConversao) === 1) await tx.fornecedorProdutoVinculo.update({ where: { id: v.id }, data: { fatorConversao: 1000 } });
            }, { timeout: 20000, maxWait: 10000 });
            out['EMB-003'].depois = retrato(await prisma.itemPcp.findUnique({ where: { id: e3.id }, select: { id: true, codigo: true, nome: true, unidade: true, custoUnitario: true, estoqueAtual: true } }));
        } else out['EMB-003'].aplicaria = feito ? 'nada (já está em UN)' : 'estoque ×1000, custo ÷1000, unidade UN; compras em MI ×1000; vínculos com fator 1 → 1000';
    }

    // 000083: custo 100,16 -> 0,1002; UN
    const b = por('000083');
    if (!b) out['000083'] = { observacao: 'item não encontrado' };
    else {
        const feito = String(b.unidade).toUpperCase() === 'UN';
        out['000083'] = { antes: retrato(b), jaCorrigido: feito };
        if (!feito && !dry) {
            await prisma.itemPcp.update({ where: { id: b.id }, data: { custoUnitario: r4(Number(b.custoUnitario) / 1000), unidade: 'UN' } });
            out['000083'].depois = { unidade: 'UN', custo: r4(Number(b.custoUnitario) / 1000) };
        } else if (!feito) out['000083'].aplicaria = `custo ${num(b.custoUnitario)} → ${r4(Number(b.custoUnitario) / 1000)}, unidade UN`;
    }

    // 118-001: unidade UN; custo 0,34 -> 0,3069 só se a última compra confirmar
    const s = por('118-001');
    if (!s) out['118-001'] = { observacao: 'item não encontrado' };
    else {
        const ult = await prisma.compraItem.findFirst({
            where: { estornado: false, OR: [{ itemPcpId: s.id }, ...(s.produtoId ? [{ produtoId: s.produtoId }] : [])] },
            orderBy: { dataCompra: 'desc' }, select: { custoUnitario: true, dataCompra: true }
        });
        const ultCusto = ult ? r4(Number(ult.custoUnitario)) : null;
        const confirma = ultCusto === 0.3069;
        const feito = String(s.unidade).toUpperCase() === 'UN' && (!confirma || Number(s.custoUnitario) === 0.3069);
        out['118-001'] = { antes: retrato(s), ultimaCompra: ult ? { data: ult.dataCompra, custo: ultCusto } : null, custoConfirmado: confirma, jaCorrigido: feito };
        if (!feito && !dry) {
            await prisma.itemPcp.update({ where: { id: s.id }, data: { unidade: 'UN', ...(confirma ? { custoUnitario: 0.3069 } : {}) } });
            out['118-001'].depois = { unidade: 'UN', custo: confirma ? 0.3069 : num(s.custoUnitario) };
        } else if (!feito) out['118-001'].aplicaria = `unidade UN${confirma ? ', custo → 0,3069' : ' (custo mantido: última compra não confirma)'}`;
    }

    // EMB-002: só unidade
    const e2 = por('EMB-002');
    if (!e2) out['EMB-002'] = { observacao: 'item não encontrado' };
    else {
        const feito = String(e2.unidade).toUpperCase() === 'UN';
        out['EMB-002'] = { antes: retrato(e2), jaCorrigido: feito };
        if (!feito && !dry) { await prisma.itemPcp.update({ where: { id: e2.id }, data: { unidade: 'UN' } }); out['EMB-002'].depois = { unidade: 'UN' }; }
        else if (!feito) out['EMB-002'].aplicaria = 'unidade UN';
    }
    out.observacao = 'Nenhuma quantidade de ficha foi alterada.';
    return out;
}

// ───────────── referências de custo ─────────────
const norm = (s) => sa(s).toUpperCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const semStop = (s) => s.split(' ').filter((t) => !['DE', 'DA', 'DO'].includes(t)).join(' ');
const tirarPeso = (s) => s.replace(/\s+\d+GR$/, '').trim();

/** Casa o nome do produto sem ficha com candidatos de ficha. @returns {{tipo,ref,fator,base}|{duvida}|null} */
function casar(nome, refs) {
    const n = norm(nome);
    const lista = (fn) => refs.filter((r) => fn(r.n, r));
    const parseRef = (r) => { const m = r.n.match(/^(?:\d+ )?(.*?) C\/(\d+) (\d+)GR$/); return m ? { base: m[1].replace(/^(1 G|1 GG|7 M|4) /, ''), cnt: +m[2], gr: +m[3] } : null; };

    // A) 2-FR
    if (n.startsWith('2 FR ')) {
        const X = n.slice(5);
        const restos = [X]; const m = X.match(/^(GG|G|M) (.*)$/); if (m) restos.push(m[2]);
        const exatos = lista((rn) => ['1 G ', '1 GG ', '7 M '].some((p) => restos.some((x) => rn === p + x)));
        if (exatos.length === 1) return { tipo: 'exato', ref: exatos[0], fator: 1, base: 'mesmo nome (2-FR → ficha do pacote da linha congelados)' };
        if (exatos.length > 1) return { duvida: 'mais de uma ficha com o mesmo nome', candidatos: exatos.map((r) => r.nome) };
        const prov = lista((rn) => ['1 G ', '1 GG ', '7 M '].some((p) => restos.some((x) => semStop(tirarPeso(rn)) === semStop(tirarPeso(p + x)))));
        if (prov.length === 1) return { tipo: 'provavel', ref: prov[0], fator: 1, base: 'nome parecido (diferença só em DE/DA/DO ou gramatura)' };
        return null;
    }
    // B) H22 <X> 2KG  -> 4-MINI <X> (fator = kg*1000 / (cnt*gr))
    if (n.startsWith('H22 ')) {
        const m = n.slice(4).match(/^(.*?) (\d+(?:\.\d+)?)KG$/);
        if (!m) return null;
        const X = m[1], gramas = parseFloat(m[2]) * 1000;
        const cand = refs.filter((r) => r.n.startsWith('4 MINI ')).map((r) => ({ r, p: parseRef(r) })).filter((x) => x.p);
        const exatos = cand.filter((x) => x.p.base === X);
        const mk = (x, tipo, base) => ({ tipo, ref: x.r, fator: r4(gramas / (x.p.cnt * x.p.gr)), base });
        if (exatos.length === 1) return mk(exatos[0], 'exato', `${gramas}g ÷ (${exatos[0].p.cnt}×${exatos[0].p.gr}g)`);
        const prov = cand.filter((x) => semStop(x.p.base) === semStop(X));
        if (prov.length === 1) return mk(prov[0], 'provavel', `nome parecido; ${gramas}g ÷ (${prov[0].p.cnt}×${prov[0].p.gr}g)`);
        return null;
    }
    // C1) <X> C/NN-HF  -> 4-MINI <X> (fator = NN / cnt da referência; mesma unidade-mini)
    const hf = n.match(/^(.*?) C\/(\d+) HF$/);
    if (hf) {
        const X = hf[1].startsWith('MINI ') ? hf[1] : `MINI ${hf[1]}`, cnt = +hf[2];
        const cand = refs.filter((r) => r.n.startsWith('4 MINI ')).map((r) => ({ r, p: parseRef(r) })).filter((x) => x.p);
        const exatos = cand.filter((x) => x.p.base === X);
        if (exatos.length === 1) return { tipo: 'exato', ref: exatos[0].r, fator: r4(cnt / exatos[0].p.cnt), base: `${cnt} un ÷ ${exatos[0].p.cnt} un do pacote da referência (supõe mini do mesmo tamanho)` };
        const prov = cand.filter((x) => semStop(x.p.base) === semStop(X));
        if (prov.length === 1) return { tipo: 'provavel', ref: prov[0].r, fator: r4(cnt / prov[0].p.cnt), base: 'nome parecido; contagem de unidades' };
        return null;
    }
    // C2) G-MINI <X> 500GR -> 4-MINI <X> (fator = gramas / (cnt*gr))
    const gm = n.match(/^G MINI (.*?) (\d+)GR$/);
    if (gm) {
        const X = `MINI ${gm[1]}`, gramas = +gm[2];
        const cand = refs.filter((r) => r.n.startsWith('4 MINI ')).map((r) => ({ r, p: parseRef(r) })).filter((x) => x.p);
        const exatos = cand.filter((x) => x.p.base === X);
        if (exatos.length === 1) return { tipo: 'exato', ref: exatos[0].r, fator: r4(gramas / (exatos[0].p.cnt * exatos[0].p.gr)), base: `${gramas}g ÷ (${exatos[0].p.cnt}×${exatos[0].p.gr}g)` };
        const prov = cand.filter((x) => semStop(x.p.base) === semStop(X));
        if (prov.length === 1) return { tipo: 'provavel', ref: prov[0].r, fator: r4(gramas / (prov[0].p.cnt * prov[0].p.gr)), base: 'nome parecido' };
        return null;
    }
    return null;
}

async function referencias({ dry }) {
    const ctx = await custo.carregarFichasVigentes();
    const fabricadosIds = [...ctx.itemPcpPorProduto.keys()];
    const refsDb = await prisma.produto.findMany({ where: { id: { in: fabricadosIds } }, select: { id: true, nome: true } });
    const refs = refsDb.map((p) => ({ id: p.id, nome: p.nome, n: norm(p.nome) }));
    // produtos sem ficha própria e sem referência
    const candidatos = await prisma.produto.findMany({
        where: { ativo: true, id: { notIn: fabricadosIds }, produtoCustoReferenciaId: null, nfeRevenda: false },
        select: { id: true, nome: true, nfeRevenda: true }
    });
    // receita de setembro/2026 por produto (mesma regra da DRE)
    const rec = await prisma.$queryRaw`
        SELECT i.produto_id AS id, COALESCE(SUM(i.valor * i.quantidade), 0)::float AS receita
        FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
        WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
          AND p.data_venda >= ${new Date('2026-09-01T00:00:00-03:00')} AND p.data_venda <= ${new Date('2026-09-30T23:59:59.999-03:00')}
        GROUP BY 1`;
    const recDe = new Map(rec.map((r) => [r.id, r.receita]));
    const exatos = [], provaveis = [], semPar = [];
    for (const p of candidatos) {
        const m = casar(p.nome, refs);
        if (!m) { if (p.nfeRevenda === true) continue; if (/^(2-FR|H22|G-MINI)|HF$/i.test(p.nome.trim()) || /-HF$/i.test(p.nome.trim())) semPar.push({ produto: p.nome, receitaSetembro: Math.round(recDe.get(p.id) || 0), motivo: 'sem ficha equivalente com nome casando' }); continue; }
        if (m.duvida) { semPar.push({ produto: p.nome, receitaSetembro: Math.round(recDe.get(p.id) || 0), motivo: m.duvida, candidatos: m.candidatos }); continue; }
        // Só aplica automaticamente quando o tamanho está explícito no nome (2-FR; H22 "2KG"; G-MINI "500GR").
        // "-HF" supõe mini do mesmo tamanho (C/25 vs C/50): vai para o dono.
        if (m.tipo === 'exato' && m.base.includes('supõe mini do mesmo tamanho')) m.tipo = 'provavel';
        const linha = { produtoId: p.id, produto: p.nome, referencia: m.ref.nome, referenciaId: m.ref.id, fator: m.fator, base: m.base, receitaSetembro: Math.round(recDe.get(p.id) || 0) };
        (m.tipo === 'exato' ? exatos : provaveis).push(linha);
    }
    let aplicados = 0;
    if (!dry) {
        for (const l of exatos) {
            await prisma.produto.update({ where: { id: l.produtoId }, data: { produtoCustoReferenciaId: l.referenciaId, fatorCustoReferencia: l.fator } });
            aplicados++;
        }
        if (aplicados) custo.limparCache();
    }
    const soma = (a) => a.reduce((s, x) => s + x.receitaSetembro, 0);
    return {
        exatosAplicaveis: exatos.length, aplicados, receitaSetembroExatos: soma(exatos), exatos,
        paraODono: { provaveis, provaveisReceitaSetembro: soma(provaveis), semParOuAmbiguos: semPar }
    };
}

// ───────────── reestimar snapshots ─────────────
async function reestimar({ dry, de, ate, limite }) {
    const diagAntes = await snap.diagCobertura();
    const corte = new Date().toISOString();
    let acumulado = { itensAnalisados: 0, gravados: 0, mantidosSemNovoCusto: 0, custoAntes: 0, custoDepois: 0 };
    let porFonte = {}; let restantes = null; let semCusto = [];
    const lote = Math.min(Math.max(parseInt(limite, 10) || 500, 1), 20000);
    const maxVoltas = dry ? 1 : 40;
    for (let i = 0; i < maxVoltas; i++) {
        const r = await snap.backfillRetroativo({ de, ate, dry, limite: dry ? Math.max(lote, 5000) : 500, reestimar: true, corte });
        acumulado.itensAnalisados += r.itensAnalisados; acumulado.gravados += r.gravados;
        acumulado.mantidosSemNovoCusto += r.mantidosSemNovoCusto; acumulado.custoAntes += r.custoAntes; acumulado.custoDepois += r.custoDepois;
        for (const [k, v] of Object.entries(r.porFonte)) porFonte[k] = (porFonte[k] || 0) + v;
        restantes = r.restantes; semCusto = r.semCusto;
        if (dry || r.restantes === 0 || r.itensAnalisados === 0) break;
    }
    const diagDepois = dry ? null : await snap.diagCobertura();
    return {
        corte, ...acumulado, custoAntes: Math.round(acumulado.custoAntes * 100) / 100, custoDepois: Math.round(acumulado.custoDepois * 100) / 100,
        porFonte, restantes: dry ? 'n/a (dry-run)' : restantes, semCustoTop: semCusto.slice(0, 10),
        diagAntes: diagAntes.slice(0, 3), diagDepois: diagDepois ? diagDepois.slice(0, 3) : null
    };
}

async function executar({ passos = PASSOS, dry = true, de = null, ate = null, limite = 500 } = {}) {
    const ordem = PASSOS.filter((p) => passos.includes(p));
    const out = { dry: !!dry, passos: {} };
    for (const p of ordem) {
        try {
            if (p === 'compra-estoque') out.passos[p] = await compraEstoque({ dry });
            else if (p === 'agua') out.passos[p] = await agua({ dry });
            else if (p === 'milheiro') out.passos[p] = await milheiro({ dry });
            else if (p === 'referencias') out.passos[p] = await referencias({ dry });
            else if (p === 'reestimar-snapshots') out.passos[p] = await reestimar({ dry, de, ate, limite });
        } catch (e) {
            console.error(`[IndicadoresAjustes] passo ${p} falhou:`, e);
            out.passos[p] = { erro: e.message };
        }
    }
    if (!dry) { try { custo.limparCache(); } catch (_) { /* cache em memoria */ } }
    return out;
}

module.exports = { executar, PASSOS, casar, norm };
