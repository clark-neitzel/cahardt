/**
 * Fixtures do QA para o relatório "Contas a Pagar → Por categoria (DRE)" detalhado
 * (Contabilidade, 11/2026). Monta no banco LOCAL os 12 cenários da P9 do plano
 * (docs/contabilidade/PLANO-relatorio-contador.md) e some com eles depois.
 *
 * ⛔ SÓ RODA NO BANCO LOCAL — trava dura em `exigir-banco-local.js`. Cria USUÁRIOS ATIVOS
 * com senha conhecida (qa123456).
 *
 * Rodar:   node backend/scripts/seed-cenarios-relatorio-contador.js
 * Limpar:  node backend/scripts/seed-cenarios-relatorio-contador.js --limpar
 *
 * Tudo emitido em 08/2026 (QA: período 2026-08-01 a 2026-08-31). Carimbo QA-REL-CONTADOR na
 * descrição das contas e no nome dos fornecedores ("QA-REL-CONTADOR Fornecedor NN").
 * Usa categorias que já existem no banco local (Matéria Prima, Embalagens, Despesa com Vendas,
 * Fretes pagos, Materiais de Limpeza e de Higiene, Energia Elétrica, Antecipação de Lucros
 * [FORA_DRE], Materiais para Revenda). Não cria nem altera categoria.
 *
 * ── VALORES ESPERADOS (valor | pago | desconto | juros+multa | aberto) ────────────────
 *  C01 NF-e 3 categorias (itens 333,33 ×3 + frete 0,02 → vNF 1.000,01; rateio 333,34/333,34/333,33)
 *      Matéria Prima 333,34 = produto 333,33 + ajuste 0,01 | Embalagens 333,34 = 333,33 + 0,01
 *      Despesa com Vendas 333,33 = produto 333,33 (sem ajuste). Total 1.000,01; 3 produtos + 2 ajustes.
 *  C02 NF-e 2 categorias com frete (vNF 8.060,00; 2 parcelas 4.030 em 03/09 e 03/10, ambas abertas)
 *      Matéria Prima 7.758,60 = produto 7.720,00 + ajuste +38,60
 *      Embalagens 301,40 = produto 300,00 (categoria só no TEXTO do item) + ajuste +1,40
 *  C03 NF-e 1 categoria com DESCONTO (itens 500+500, frete 20, desconto 70 → 950,00), paga PIX Sicoob 20/08
 *      Matéria Prima 950,00 = 500,00 + 500,00 + ajuste −50,00 | pago por linha 500,00/500,00/−50,00 | aberto 0
 *  C04 Conta manual 1.000,00 em 2 parcelas de 500 (Fretes pagos, SEM itens): 1ª paga 498,00 + desconto 2,00
 *      + juros 1,50 + multa 0,50 (PIX, Sicoob, 06/08, CONCILIADA no extrato); 2ª aberta, vence 25/08 (vencida)
 *      valor 1.000,00 | pago 498,00 | desconto 2,00 | juros+multa 2,00 | aberto 500,00 | Parcial | "1/2"
 *      vencimentos "05/08/2026; 25/08/2026" | conciliado "Sim"
 *  C05 Conta manual 900,00 em 3 parcelas (Embalagens): 1ª paga 300 (dinheiro, Caixinha, 10/08); 2ª tem baixa
 *      ESTORNADA de 300 (NÃO conta); 3ª aberta. valor 900,00 | pago 300,00 | aberto 600,00 | "1/3"
 *  C06 Despesa manual 240,00 (Materiais de Limpeza e de Higiene) com 2 CompraItem: Detergente 100,00 e
 *      Esponja 120,00 + ajuste "Outros valores / diferença da despesa" +20,00. Aberta.
 *  C07 Energia Elétrica 612,34, sem itens, paga (boleto, Sicoob, 14/08). valor 612,34 | pago 612,34 | aberto 0
 *  C08 Antecipação de Lucros (FORA_DRE) 5.000,00, paga PIX Acredicoop 12/08. Cai em "Fora do resultado".
 *  C09 Conta SEM categoria e sem rateio 150,00 → categoria "Sem categoria". Aberta.
 *  C10 Despesa manual sem documento (Despesa com Vendas) 80,00. Aberta.
 *  C11 NF-e legada 1.000,00: itens SEM categoria (600,00 + 350,00), 2 rateios Matéria Prima 700,00 e
 *      Embalagens 300,00. Itens vão para o MAIOR rateio (Matéria Prima) com divergente:true; ajuste
 *      Matéria Prima = 700 − 950 = −250,00; Embalagens vira SEM_ITENS 300,00. avisos: ITEM_SEM_CATEGORIA (2 itens).
 *  C12 NFC-e (chave modelo 65) 100,00, 1 item (Café 4 × 25,00), Materiais para Revenda. Rótulo "NFC-e".
 *
 *  TOTAL DO SEED = 1.000,01 + 8.060,00 + 950,00 + 1.000,00 + 900,00 + 240,00 + 612,34 + 5.000,00
 *                  + 150,00 + 80,00 + 1.000,00 + 100,00 = 19.092,35
 *  Pago do seed  = 950 + 498 + 300 + 612,34 + 5.000 = 7.360,34 | desconto 2,00 | juros+multa 2,00
 *  Contas SEM_DOC do seed (C04..C10) = 7 contas / R$ 7.982,34  (C04 1.000 + C05 900 + C06 240 + C07 612,34
 *                  + C08 5.000 + C09 150 + C10 80)
 */
require('dotenv').config();
require('./exigir-banco-local')('seed-cenarios-relatorio-contador.js'); // ANTES de tocar no banco
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');

const CARIMBO = 'QA-REL-CONTADOR';
const SENHA = 'qa123456';
const USUARIOS = [
    { id: `${CARIMBO}-U1`, login: 'qa.contador', nome: 'QA contador', permissoes: { Pode_Acessar_Contabilidade: true } },
    { id: `${CARIMBO}-U2`, login: 'qa.semcontabilidade', nome: 'QA sem contabilidade', permissoes: { Pode_Acessar_Contas_Pagar: true } },
    // Usuário externo (docs/contabilidade/PLANO-usuario-externo-contador.md §8)
    { id: `${CARIMBO}-U3`, login: 'qa.externo', nome: 'QA externo', permissoes: { Pode_Acessar_Contabilidade: true, Usuario_Externo: true } },
    { id: `${CARIMBO}-U4`, login: 'qa.externo.semtela', nome: 'QA externo sem tela', permissoes: { Usuario_Externo: true } },
    { id: `${CARIMBO}-U5`, login: 'qa.vendedor', nome: 'QA vendedor', permissoes: { catalogo: { view: true }, pedidos: { view: true, edit: true }, clientes: { view: true }, rota: { view: true } } },
    { id: `${CARIMBO}-U6`, login: 'qa.motorista', nome: 'QA motorista', permissoes: { Pode_Executar_Entregas: true, Pode_Acessar_Caixa: true, Pode_Fazer_Devolucao: true } }
];
const D = (ymd) => new Date(`${ymd}T12:00:00-03:00`);

async function limpar() {
    const contas = await prisma.contaPagar.findMany({ where: { descricao: { contains: CARIMBO } }, select: { id: true } });
    const ids = contas.map((c) => c.id);
    const notas = await prisma.notaEntrada.findMany({ where: { fornecedorNome: { contains: CARIMBO } }, select: { id: true } });
    const notaIds = notas.map((n) => n.id);
    const parcelas = await prisma.parcelaPagar.findMany({ where: { contaPagarId: { in: ids } }, select: { id: true } });
    const pagtos = await prisma.pagamentoParcelaPagar.findMany({ where: { parcelaPagarId: { in: parcelas.map((p) => p.id) } }, select: { id: true } });

    const imps = await prisma.extratoImportacao.findMany({ where: { nomeArquivo: { contains: CARIMBO } }, select: { id: true } });
    await prisma.extratoLancamento.deleteMany({ where: { OR: [{ importacaoId: { in: imps.map((i) => i.id) } }, { pagamentoParcelaPagarId: { in: pagtos.map((x) => x.id) } }] } });
    await prisma.extratoImportacao.deleteMany({ where: { id: { in: imps.map((i) => i.id) } } });
    await prisma.compraItem.deleteMany({ where: { OR: [{ contaPagarId: { in: ids } }, { notaEntradaId: { in: notaIds } }] } });
    await prisma.notaEntradaItem.deleteMany({ where: { notaEntradaId: { in: notaIds } } });
    await prisma.notaEntrada.updateMany({ where: { id: { in: notaIds } }, data: { contaPagarId: null } });
    await prisma.pagamentoParcelaPagar.deleteMany({ where: { parcelaPagarId: { in: parcelas.map((p) => p.id) } } });
    await prisma.parcelaPagar.deleteMany({ where: { contaPagarId: { in: ids } } });
    await prisma.contaPagarRateio.deleteMany({ where: { contaPagarId: { in: ids } } });
    await prisma.contaPagar.deleteMany({ where: { id: { in: ids } } });
    await prisma.notaEntrada.deleteMany({ where: { id: { in: notaIds } } });
    const forn = await prisma.fornecedor.deleteMany({ where: { razaoSocial: { contains: CARIMBO } } });
    // restos de login dos usuários de QA (cortina do diário etc.) travam o delete por FK
    await prisma.diarioVendedor.deleteMany({ where: { vendedorId: { in: USUARIOS.map((u) => u.id) } } });
    const usuarios = await prisma.vendedor.deleteMany({ where: { id: { in: USUARIOS.map((u) => u.id) } } });
    console.log(`🧹 Limpo: ${ids.length} conta(s), ${notaIds.length} nota(s), ${forn.count} fornecedor(es), ${usuarios.count} usuário(s).`);
}

async function principal() {
    if (process.argv.includes('--limpar')) return limpar();
    await limpar(); // recomeça do zero a cada execução

    const senhaHash = await bcrypt.hash(SENHA, 10);
    for (const u of USUARIOS) {
        await prisma.vendedor.create({ data: { id: u.id, nome: `${u.nome} (${CARIMBO})`, login: u.login, senha: senhaHash, permissoes: u.permissoes, ativo: true } });
    }
    const autor = USUARIOS[0].id;

    const banco = {};
    for (const n of ['Sicoob', 'Caixinha', 'Acredicoop']) {
        banco[n] = (await prisma.contaFinanceira.findFirst({ where: { nomeBanco: { contains: n, mode: 'insensitive' } } }))?.id;
        if (!banco[n]) throw new Error(`Conta financeira "${n}" não existe no banco local.`);
    }
    const cats = {};
    for (const n of ['Matéria Prima', 'Embalagens', 'Despesa com Vendas', 'Fretes pagos', 'Materiais de Limpeza e de Higiene', 'Energia Elétrica', 'Antecipação de Lucros', 'Materiais para Revenda']) {
        cats[n] = await prisma.categoriaDespesa.findUnique({ where: { nome: n } });
        if (!cats[n]) throw new Error(`Categoria "${n}" não existe no banco local.`);
    }

    const forn = async (n) => prisma.fornecedor.create({
        data: { razaoSocial: `${CARIMBO} Fornecedor ${String(n).padStart(2, '0')}`, cnpjCpf: `99000000000${100 + n}`, origem: 'APP', statusEnvioCA: 'NAO_ENVIAR' }
    });
    const chave = (n, modelo = '55') => `412608${`99000000000${100 + n}`}${modelo}001${String(n).padStart(9, '0')}1${'0'.repeat(9)}`;

    // Cria conta + parcelas (+ rateios) e devolve { conta, parcelas }
    async function conta({ n, desc, cat, valor, status = 'ABERTO', parcelas, rateios, nota = false, modelo = '55', emissao = '2026-08-05', semDoc = false }) {
        const f = await forn(n);
        const c = await prisma.contaPagar.create({
            data: {
                descricao: `${desc} — ${CARIMBO}`,
                fornecedorId: f.id,
                origem: nota ? 'NFE' : 'MANUAL',
                numeroNota: nota ? `9100${String(n).padStart(2, '0')}` : null,
                chaveNfe: nota ? chave(n, modelo) : null,
                categoria: cat || null,
                categoriaDespesaId: cat ? cats[cat].id : null,
                valorTotal: valor,
                status,
                dataEmissao: D(emissao),
                competencia: D('2026-08-01'),
                criadoPorId: autor,
                parcelas: { create: parcelas.map((p, i) => ({ numeroParcela: i + 1, valor: p.valor, dataVencimento: D(p.venc), status: p.status || 'PENDENTE' })) },
                rateios: rateios ? { create: rateios.map((r) => ({ categoria: r.cat, categoriaDespesaId: cats[r.cat].id, valor: r.valor })) } : undefined
            },
            include: { parcelas: { orderBy: { numeroParcela: 'asc' } } }
        });
        return { c, f };
    }
    async function notaDaConta(n, c, f, itens, vNF, modelo = '55') {
        return prisma.notaEntrada.create({
            data: {
                tipo: 'NFE', chave: chave(n, modelo), numero: `9100${String(n).padStart(2, '0')}`, serie: '1',
                fornecedorCnpj: f.cnpjCpf, fornecedorNome: f.razaoSocial, fornecedorId: f.id,
                emissao: D('2026-08-05'), valorTotal: vNF, status: 'ENTRADA_REGISTRADA', contaPagarId: c.id,
                itens: {
                    create: itens.map((it, i) => ({
                        numeroItem: i + 1, codigoFornecedor: it.cod, descricao: it.desc, ncm: it.ncm || null, cfop: it.cfop || '5102',
                        unidade: it.un, quantidade: it.qtd, valorUnitario: it.unit, valorTotal: it.total,
                        categoria: it.cat || null, categoriaDespesaId: it.cat && it.comId !== false ? cats[it.cat].id : null
                    }))
                }
            }
        });
    }
    const pagar = (parcelaId, o) => prisma.pagamentoParcelaPagar.create({
        data: { parcelaPagarId: parcelaId, valorPago: o.valor, juros: o.juros || 0, multa: o.multa || 0, desconto: o.desc || 0, formaPagamento: o.forma, dataPagamento: D(o.data), contaFinanceiraCaId: banco[o.banco], registradoPorId: autor, origem: 'MANUAL', estornado: !!o.estornado, estornadoEm: o.estornado ? D(o.data) : null }
    });
    const quitar = (parcelaId, valor, data) => prisma.parcelaPagar.update({ where: { id: parcelaId }, data: { status: 'PAGO', valorPago: valor, dataPagamento: D(data) } });

    // ── C01 ──
    { const { c, f } = await conta({ n: 1, desc: 'NF-e 910001 três categorias', valor: 1000.01, nota: true, parcelas: [{ valor: 1000.01, venc: '2026-09-10' }],
            rateios: [{ cat: 'Matéria Prima', valor: 333.34 }, { cat: 'Embalagens', valor: 333.34 }, { cat: 'Despesa com Vendas', valor: 333.33 }] });
      await notaDaConta(1, c, f, [
          { cod: 'FAR-25', desc: 'Farinha de trigo tipo 1 — saco 25 kg', ncm: '11010010', un: 'SC', qtd: 1, unit: 333.33, total: 333.33, cat: 'Matéria Prima' },
          { cod: 'CX-PAP', desc: 'Caixa de papelão 40x30', ncm: '48191000', un: 'UN', qtd: 1, unit: 333.33, total: 333.33, cat: 'Embalagens' },
          { cod: 'BRD-01', desc: 'Brinde promocional', ncm: '39269090', un: 'UN', qtd: 1, unit: 333.33, total: 333.33, cat: 'Despesa com Vendas' }], 1000.01); }
    // ── C02 ──
    { const { c, f } = await conta({ n: 2, desc: 'NF-e 910002 farinha + sacos com frete', valor: 8060, nota: true,
            parcelas: [{ valor: 4030, venc: '2026-09-03' }, { valor: 4030, venc: '2026-10-03' }],
            rateios: [{ cat: 'Matéria Prima', valor: 7758.6 }, { cat: 'Embalagens', valor: 301.4 }] });
      await notaDaConta(2, c, f, [
          { cod: 'FAR-25', desc: 'Farinha de trigo tipo 1 — saco 25 kg', ncm: '11010010', un: 'SC', qtd: 80, unit: 96.5, total: 7720, cat: 'Matéria Prima' },
          { cod: 'SAC-PL', desc: 'Saco plástico 30x40 (só categoria em texto)', ncm: '39232990', un: 'UN', qtd: 1000, unit: 0.3, total: 300, cat: 'Embalagens', comId: false }], 8060); }
    // ── C03 ──
    { const { c, f } = await conta({ n: 3, desc: 'NF-e 910003 desconto maior que o frete', valor: 950, nota: true, status: 'QUITADO',
            parcelas: [{ valor: 950, venc: '2026-08-20', status: 'PAGO' }], rateios: [{ cat: 'Matéria Prima', valor: 950 }] });
      await notaDaConta(3, c, f, [
          { cod: 'ACU-50', desc: 'Açúcar cristal 50 kg', ncm: '17011400', un: 'SC', qtd: 10, unit: 50, total: 500, cat: 'Matéria Prima' },
          { cod: 'SAL-25', desc: 'Sal refinado 25 kg', ncm: '25010020', un: 'SC', qtd: 20, unit: 25, total: 500, cat: 'Matéria Prima' }], 950);
      await pagar(c.parcelas[0].id, { valor: 950, forma: 'PIX', banco: 'Sicoob', data: '2026-08-20' });
      await quitar(c.parcelas[0].id, 950, '2026-08-20'); }
    // ── C04 ──
    { const { c } = await conta({ n: 4, desc: 'Frete autônomo (2 parcelas)', cat: 'Fretes pagos', valor: 1000, status: 'PARCIAL',
            parcelas: [{ valor: 500, venc: '2026-08-05', status: 'PAGO' }, { valor: 500, venc: '2026-08-25' }] });
      const pg = await pagar(c.parcelas[0].id, { valor: 498, desc: 2, juros: 1.5, multa: 0.5, forma: 'PIX', banco: 'Sicoob', data: '2026-08-06' });
      await quitar(c.parcelas[0].id, 498, '2026-08-06');
      const imp = await prisma.extratoImportacao.create({ data: { contaFinanceiraCaId: banco.Sicoob, nomeArquivo: `extrato-${CARIMBO}.ofx`, totalArquivo: 1, novos: 1 } });
      await prisma.extratoLancamento.create({ data: { importacaoId: imp.id, contaFinanceiraCaId: banco.Sicoob, fitId: `${CARIMBO}-FIT-1`, data: D('2026-08-06'), valor: 500, tipo: 'DEBITO', descricao: `PIX frete ${CARIMBO}`, status: 'CONCILIADO', pagamentoParcelaPagarId: pg.id, conciliadoEm: D('2026-08-07') } }); }
    // ── C05 ──
    { const { c } = await conta({ n: 5, desc: 'Embalagens (3 parcelas, 1 baixa estornada)', cat: 'Embalagens', valor: 900, status: 'PARCIAL',
            parcelas: [{ valor: 300, venc: '2026-08-10', status: 'PAGO' }, { valor: 300, venc: '2026-09-10' }, { valor: 300, venc: '2026-10-10' }] });
      await pagar(c.parcelas[0].id, { valor: 300, forma: 'DINHEIRO', banco: 'Caixinha', data: '2026-08-10' });
      await quitar(c.parcelas[0].id, 300, '2026-08-10');
      await pagar(c.parcelas[1].id, { valor: 300, forma: 'PIX', banco: 'Sicoob', data: '2026-09-10', estornado: true }); }
    // ── C06 (CompraItem de despesa manual) ──
    { const { c, f } = await conta({ n: 6, desc: 'Material de limpeza com 2 produtos', cat: 'Materiais de Limpeza e de Higiene', valor: 240, parcelas: [{ valor: 240, venc: '2026-09-05' }] });
      // registrarComprasManuais só grava linha quando há produto/insumo vinculado; aqui o item fica
      // sem alvo (como despesa manual sem vínculo) — então grava o CompraItem direto, mesmos campos.
      for (const it of [{ d: 'Detergente neutro 5L', q: 10, v: 100 }, { d: 'Esponja dupla face', q: 20, v: 120 }]) {
          await prisma.compraItem.create({ data: {
              notaEntradaId: null, contaPagarId: c.id, fornecedorId: f.id, fornecedorNome: f.razaoSocial, fornecedorCnpj: f.cnpjCpf,
              dataCompra: D('2026-08-05'), descricaoFornecedor: it.d, quantidadeFornecedor: it.q, unidadeFornecedor: 'UN',
              quantidade: it.q, unidade: 'UN', valorTotal: it.v, custoUnitario: it.v / it.q, semEstoque: true } });
      } }
    // ── C07 ──
    { const { c } = await conta({ n: 7, desc: 'Energia elétrica agosto', cat: 'Energia Elétrica', valor: 612.34, status: 'QUITADO', parcelas: [{ valor: 612.34, venc: '2026-08-15', status: 'PAGO' }] });
      await pagar(c.parcelas[0].id, { valor: 612.34, forma: 'BOLETO', banco: 'Sicoob', data: '2026-08-14' });
      await quitar(c.parcelas[0].id, 612.34, '2026-08-14'); }
    // ── C08 ──
    { const { c } = await conta({ n: 8, desc: 'Antecipação de lucros', cat: 'Antecipação de Lucros', valor: 5000, status: 'QUITADO', parcelas: [{ valor: 5000, venc: '2026-08-12', status: 'PAGO' }] });
      await pagar(c.parcelas[0].id, { valor: 5000, forma: 'PIX', banco: 'Acredicoop', data: '2026-08-12' });
      await quitar(c.parcelas[0].id, 5000, '2026-08-12'); }
    // ── C09 ──
    await conta({ n: 9, desc: 'Despesa sem categoria', valor: 150, parcelas: [{ valor: 150, venc: '2026-09-20' }] });
    // ── C10 ──
    await conta({ n: 10, desc: 'Despesa de vendas sem documento', cat: 'Despesa com Vendas', valor: 80, parcelas: [{ valor: 80, venc: '2026-09-12' }] });
    // ── C11 ──
    { const { c, f } = await conta({ n: 11, desc: 'NF-e 910011 legada sem categoria nos itens', valor: 1000, nota: true,
            parcelas: [{ valor: 1000, venc: '2026-09-15' }], rateios: [{ cat: 'Matéria Prima', valor: 700 }, { cat: 'Embalagens', valor: 300 }] });
      await notaDaConta(11, c, f, [
          { cod: 'LEG-A', desc: 'Produto legado A', un: 'UN', qtd: 6, unit: 100, total: 600 },
          { cod: 'LEG-B', desc: 'Produto legado B', un: 'UN', qtd: 7, unit: 50, total: 350 }], 1000); }
    // ── C12 ──
    { const { c, f } = await conta({ n: 12, desc: 'NFC-e 910012 café', cat: 'Materiais para Revenda', valor: 100, nota: true, modelo: '65', parcelas: [{ valor: 100, venc: '2026-09-02' }] });
      await notaDaConta(12, c, f, [{ cod: 'CAF-500', desc: 'Café torrado 500 g', ncm: '09012100', cfop: '5102', un: 'UN', qtd: 4, unit: 25, total: 100, cat: 'Materiais para Revenda' }], 100, '65'); }

    console.log(`\n✅ 12 cenários criados (carimbo "${CARIMBO}", emissão 08/2026). Apague com --limpar.`);
    console.log('Usuários (senha qa123456): qa.contador → só Pode_Acessar_Contabilidade | qa.semcontabilidade → sem a permissão (403)');
}

principal()
    .catch((e) => { console.error('❌ ERRO:', e.message, '\n', e.stack); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
