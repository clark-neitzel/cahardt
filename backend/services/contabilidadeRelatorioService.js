/**
 * CONTABILIDADE — relatório de Contas a Pagar "Por categoria (DRE)" detalhado
 * (categoria → fornecedor → documento → produto). Somente LEITURA.
 *
 * Plano: docs/contabilidade/PLANO-relatorio-contador.md (seções 2, 3 e 13).
 *
 * Regra de ouro: a base de verdade do valor é SEMPRE o rateio gravado
 * (ContaPagarRateio.valor; conta sem rateio = valorTotal na categoria única da conta).
 * Os produtos só DETALHAM esse valor; a diferença (frete, desconto, IPI/ST, arredondamento)
 * vira uma linha de AJUSTE. Assim Σ linhas = rateio, centavo a centavo, por construção.
 * Pago/desconto/juros-multa são RATEADOS com `ratear` (soma exata, sem perder centavo).
 */

const TZ = 'America/Sao_Paulo';
const LIMITE_LINHAS_DETALHE = 20000;
const BLOCO_IDS = 1000;

const toC = (v) => Math.round(Number(v || 0) * 100); // reais → centavos (inteiro)
const toR = (c) => Math.round(c) / 100; // centavos → reais (2 casas)

/**
 * Rateia `totalC` (centavos, inteiro) entre linhas proporcionalmente a `pesosC` (centavos).
 * Todas as linhas = round(total·peso/Σpesos), EXCETO a de maior peso (empate: a primeira),
 * que recebe `total − Σ(outras)`. A soma é SEMPRE exatamente `totalC`.
 * Σpesos = 0 → tudo na 1ª linha. Usa BigInt (sem erro de ponto flutuante).
 */
function ratear(totalC, pesosC) {
    const n = pesosC.length;
    if (n === 0) return [];
    const total = BigInt(Math.round(totalC));
    const pesos = pesosC.map((p) => BigInt(Math.round(p)));
    const soma = pesos.reduce((s, p) => s + p, 0n);
    const res = new Array(n).fill(0n);
    if (soma === 0n) {
        res[0] = total;
        return res.map(Number);
    }
    let iMax = 0;
    for (let i = 1; i < n; i++) if (pesos[i] > pesos[iMax]) iMax = i;
    // arredondamento "metade para longe do zero", em inteiros
    const dividir = (num, den) => {
        const neg = (num < 0n) !== (den < 0n);
        const a = num < 0n ? -num : num;
        const b = den < 0n ? -den : den;
        const q = (2n * a + b) / (2n * b);
        return neg ? -q : q;
    };
    let acumulado = 0n;
    for (let i = 0; i < n; i++) {
        if (i === iMax) continue;
        res[i] = dividir(total * pesos[i], soma);
        acumulado += res[i];
    }
    res[iMax] = total - acumulado;
    return res.map(Number);
}

const fmtDataBr = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ }) : '');
const ymdSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });

/** Valores distintos, ordenados, unidos por "; " (ignora vazios). */
function juntarUnicos(valores, comparar) {
    const set = [...new Set((valores || []).filter((v) => v !== null && v !== undefined && String(v).trim() !== ''))];
    set.sort(comparar || ((a, b) => String(a).localeCompare(String(b), 'pt-BR')));
    return set.join('; ');
}

/** Rótulo do tipo de documento. NFC-e = chave de 44 dígitos com modelo 65 (posições 20–21). */
function rotuloDocumento(doc) {
    if (!doc) return 'Sem documento';
    if (doc.tipo === 'NFSE') return 'NFS-e';
    if (doc.tipo === 'IMPORTADO_CA') return 'Importada (antiga)';
    if (doc.tipo === 'NFE') {
        const chave = String(doc.chave || '').replace(/\D/g, '');
        return chave.length === 44 && chave.substr(20, 2) === '65' ? 'NFC-e' : 'NF-e';
    }
    return 'Sem documento';
}

async function emBlocos(ids, fn) {
    const out = [];
    for (let i = 0; i < ids.length; i += BLOCO_IDS) {
        out.push(...(await fn(ids.slice(i, i + BLOCO_IDS))));
    }
    return out;
}

const compararTexto = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR');

/**
 * @param {object} p
 * @param {object} p.whereConta       filtro Prisma sobre ContaPagar (emissão/fornecedor/categoria)
 * @param {boolean} p.detalhe         true → devolve também `contas` e `itens`
 * @param {number} p.limiteContas     teto de contas quando !detalhe (compat. com o comportamento antigo)
 * @param {object} p.selectConta      SELECT_CONTA_PAGAR da rota (reaproveitado, não alterado)
 * @param {Map}    p.nomeBanco        id da conta financeira → nome
 * @param {object} p.helpers          { resolverDocPagar, idsConciliadosPagar, idsContasComAnexo }
 * @param {object} prisma
 */
async function montarPagarDetalhado(p, prisma, opcoes = {}) {
    const { whereConta, detalhe, selectConta, nomeBanco, helpers } = p;
    const limiteDetalhe = opcoes.limiteLinhas || LIMITE_LINHAS_DETALHE; // opcoes: uso interno/teste, fora da query string
    const limiteContas = detalhe ? limiteDetalhe : (p.limiteContas || 8000);
    const hoje = ymdSP(new Date());

    const contasBrutas = await prisma.contaPagar.findMany({
        where: whereConta,
        take: limiteContas + 1,
        orderBy: [{ dataEmissao: 'asc' }, { id: 'asc' }],
        select: {
            ...selectConta,
            notaEntrada: { select: { id: true, tipo: true } },
            parcelas: {
                where: { status: { not: 'CANCELADO' } },
                orderBy: { numeroParcela: 'asc' },
                select: {
                    id: true, valor: true, dataVencimento: true, status: true,
                    pagamentos: {
                        where: { estornado: false },
                        select: {
                            id: true, valorPago: true, juros: true, multa: true, desconto: true,
                            dataPagamento: true, formaPagamento: true, contaFinanceiraCaId: true,
                            registradoPor: { select: { nome: true } }
                        }
                    }
                }
            }
        }
    });
    let truncado = contasBrutas.length > limiteContas;
    const contas = contasBrutas.slice(0, limiteContas);

    const catsInfo = new Map(
        (await prisma.categoriaDespesa.findMany({
            select: { nome: true, classificacao: true, natureza: true, grupoDre: { select: { nome: true, ordem: true } } }
        })).map((c) => [c.nome, c])
    );

    // ── Itens (só com detalhe): 2 consultas em blocos, nunca por conta ──
    const itensNotaPorNota = new Map();
    const compraPorConta = new Map();
    if (detalhe) {
        const idsNota = contas.map((c) => c.notaEntrada?.id).filter(Boolean);
        const idsConta = contas.map((c) => c.id);
        const [itensNota, itensCompra] = await Promise.all([
            emBlocos(idsNota, (ids) => prisma.notaEntradaItem.findMany({
                where: { notaEntradaId: { in: ids } },
                orderBy: { numeroItem: 'asc' },
                select: {
                    notaEntradaId: true, numeroItem: true, codigoFornecedor: true, descricao: true, ncm: true,
                    unidade: true, quantidade: true, valorUnitario: true, valorTotal: true, cfop: true,
                    categoria: true, semEstoqueMotivo: true,
                    categoriaDespesa: { select: { nome: true } }
                }
            })),
            emBlocos(idsConta, (ids) => prisma.compraItem.findMany({
                where: { contaPagarId: { in: ids }, estornado: false, notaEntradaId: null },
                orderBy: { criadoEm: 'asc' },
                select: {
                    contaPagarId: true, descricaoFornecedor: true, quantidadeFornecedor: true,
                    unidadeFornecedor: true, valorTotal: true
                }
            }))
        ]);
        for (const it of itensNota) {
            if (!itensNotaPorNota.has(it.notaEntradaId)) itensNotaPorNota.set(it.notaEntradaId, []);
            itensNotaPorNota.get(it.notaEntradaId).push(it);
        }
        for (const it of itensCompra) {
            if (!compraPorConta.has(it.contaPagarId)) compraPorConta.set(it.contaPagarId, []);
            compraPorConta.get(it.contaPagarId).push(it);
        }
    }

    // ── Conciliação e anexos (só detalhe) ──
    let conciliados = new Set();
    let comAnexo = new Set();
    if (detalhe) {
        const idsPg = contas.flatMap((c) => c.parcelas.flatMap((pa) => pa.pagamentos.map((x) => x.id)));
        [conciliados, comAnexo] = await Promise.all([
            helpers.idsConciliadosPagar(idsPg),
            helpers.idsContasComAnexo(contas.map((c) => c.id))
        ]);
    }

    // ── Processamento por conta ──
    const acumCat = new Map(); // nome → {categoria, contas, valorC, pagoC, descontoC, jurosC}
    const contasOut = [];
    const linhasItens = [];
    const avisosRes = {
        itensSemCategoriaCorrespondente: 0, contasComNotaVinculadaSemProdutos: detalhe ? 0 : null,
        contasValorDivergenteDasParcelas: 0, pagoAcimaDoValor: 0
    };
    const semDoc = { contas: 0, valorC: 0 };
    const contasSemProdutos = []; // {contaId, parcelaIds} — para contar nota vinculada
    let totalLinhas = 0;

    for (const c of contas) {
        // 1) Rateios por categoria (nome → centavos), preservando a contagem antiga (1 por rateio)
        const rateiosBrutos = c.rateios.length > 0
            ? c.rateios.map((r) => ({ nome: r.categoria || 'Sem categoria', valorC: toC(r.valor) }))
            : [{ nome: c.categoriaDespesa?.nome || c.categoria || 'Sem categoria', valorC: toC(c.valorTotal) }];
        const cats = []; // únicas, na ordem de aparição
        for (const r of rateiosBrutos) {
            const ex = cats.find((x) => x.nome === r.nome);
            if (ex) ex.valorC += r.valorC; else cats.push({ nome: r.nome, valorC: r.valorC });
        }
        const valorBaseC = cats.reduce((s, x) => s + x.valorC, 0);

        // 2) Ledger (parcelas não canceladas, baixas não estornadas)
        const pagamentos = c.parcelas.flatMap((pa) => pa.pagamentos);
        const pagoC = pagamentos.reduce((s, x) => s + toC(x.valorPago), 0);
        const descC = pagamentos.reduce((s, x) => s + toC(x.desconto), 0);
        const jurosC = pagamentos.reduce((s, x) => s + toC(x.juros) + toC(x.multa), 0);
        const abertoC = valorBaseC - pagoC - descC;
        const somaParcelasC = c.parcelas.reduce((s, x) => s + toC(x.valor), 0);

        const avisos = [];
        if (c.parcelas.length > 0 && Math.abs(somaParcelasC - valorBaseC) > 1) {
            avisos.push('VALOR_DIVERGE_PARCELAS');
            avisosRes.contasValorDivergenteDasParcelas += 1;
        }
        if (abertoC < 0) {
            avisos.push('PAGO_ACIMA');
            avisosRes.pagoAcimaDoValor += 1;
        }

        // 3) Pago/desconto/juros por categoria (nível conta → categorias)
        const pesosCat = cats.map((x) => x.valorC);
        const pagoCat = ratear(pagoC, pesosCat);
        const descCat = ratear(descC, pesosCat);
        const jurosCat = ratear(jurosC, pesosCat);
        cats.forEach((x, i) => { x.pagoC = pagoCat[i]; x.descC = descCat[i]; x.jurosC = jurosCat[i]; });

        // Resumo por categoria (compat.: `contas` = nº de rateios) — acumulado só quando a conta é aceita
        const acumularConta = () => {
            for (const r of rateiosBrutos) {
                const a = acumCat.get(r.nome) || { categoria: r.nome, contas: 0, valorC: 0, pagoC: 0, descontoC: 0, jurosC: 0 };
                a.contas += 1;
                acumCat.set(r.nome, a);
            }
            for (const x of cats) {
                const a = acumCat.get(x.nome);
                a.valorC += x.valorC; a.pagoC += x.pagoC; a.descontoC += x.descC; a.jurosC += x.jurosC;
            }
            if (doc.tipo === 'SEM_DOC') { semDoc.contas += 1; semDoc.valorC += valorBaseC; }
        };
        const doc = helpers.resolverDocPagar(c);

        if (!detalhe) { acumularConta(); continue; }

        // 4) Itens: fonte única por conta (nota com itens → NotaEntradaItem; senão CompraItem manual)
        const itensNota = (c.notaEntrada && itensNotaPorNota.get(c.notaEntrada.id)) || [];
        const itensCompra = compraPorConta.get(c.id) || [];
        let fonte = 'NENHUMA';
        let itens = [];
        if (itensNota.length > 0) {
            fonte = 'NOTA';
            itens = itensNota.map((it, idx) => ({
                catNome: it.categoriaDespesa?.nome || it.categoria || null, seq: it.numeroItem ?? idx,
                produto: it.descricao, codigoFornecedor: it.codigoFornecedor || '', ncm: it.ncm || '', cfop: it.cfop || '',
                quantidade: Number(it.quantidade), unidade: it.unidade || '', valorUnitario: Number(it.valorUnitario),
                valorC: toC(it.valorTotal), semEstoqueMotivo: it.semEstoqueMotivo || null
            }));
        } else if (itensCompra.length > 0) {
            fonte = 'COMPRA';
            itens = itensCompra.map((it, idx) => {
                const q = Number(it.quantidadeFornecedor);
                const vt = Number(it.valorTotal);
                return {
                    catNome: null, seq: idx, produto: it.descricaoFornecedor, codigoFornecedor: '', ncm: '', cfop: '',
                    quantidade: q, unidade: it.unidadeFornecedor || '',
                    valorUnitario: q ? Math.round((vt / q) * 1e6) / 1e6 : null,
                    valorC: toC(it.valorTotal), semEstoqueMotivo: null
                };
            });
        }
        if (itens.length > 0 && itens.every((it) => it.valorC === 0)) { fonte = 'NENHUMA'; itens = []; } // itens zerados = sem itens

        // 5) Casa item ↔ categoria do rateio (por nome). Sem correspondência: 1 rateio → nele;
        //    vários → no de MAIOR valor, divergente:true.
        const porCat = new Map(cats.map((x) => [x.nome, []]));
        let iMaior = 0;
        cats.forEach((x, i) => { if (x.valorC > cats[iMaior].valorC) iMaior = i; });
        for (const it of itens) {
            let destino = it.catNome && porCat.has(it.catNome) ? it.catNome : null;
            let divergente = false;
            if (!destino) {
                destino = cats[iMaior].nome;
                if (cats.length > 1) {
                    divergente = true;
                    avisosRes.itensSemCategoriaCorrespondente += 1;
                    if (!avisos.includes('ITEM_SEM_CATEGORIA')) avisos.push('ITEM_SEM_CATEGORIA');
                }
            }
            porCat.get(destino).push({ ...it, divergente });
        }

        // 6) Linhas por categoria: produtos + ajuste (ou SEM_ITENS). Rateio do pago em 2º nível.
        let temProdutos = false;
        const linhasConta = [];
        for (const x of cats) {
            const dos = porCat.get(x.nome);
            const linhas = [];
            if (dos.length === 0) {
                linhas.push({ tipoLinha: 'SEM_ITENS', produto: '', codigoFornecedor: '', ncm: '', cfop: '', quantidade: null, unidade: '', valorUnitario: null, valorC: x.valorC, divergente: false, semEstoqueMotivo: null, seq: 0 });
            } else {
                temProdutos = true;
                for (const it of dos) linhas.push({ tipoLinha: 'PRODUTO', ...it });
                const somaItensC = dos.reduce((s, it) => s + it.valorC, 0);
                const ajusteC = x.valorC - somaItensC;
                if (ajusteC !== 0) {
                    linhas.push({
                        tipoLinha: 'AJUSTE',
                        produto: fonte === 'NOTA' ? 'Frete e outros valores da nota' : 'Outros valores / diferença da despesa',
                        codigoFornecedor: '', ncm: '', cfop: '', quantidade: null, unidade: '', valorUnitario: null,
                        valorC: ajusteC, divergente: false, semEstoqueMotivo: null, seq: 1e9
                    });
                }
            }
            const pesos = linhas.map((l) => l.valorC);
            const pg = ratear(x.pagoC, pesos);
            const ds = ratear(x.descC, pesos);
            const jm = ratear(x.jurosC, pesos);
            linhas.forEach((l, i) => {
                linhasConta.push({
                    contaId: c.id, categoria: x.nome, tipoLinha: l.tipoLinha, produto: l.produto,
                    codigoFornecedor: l.codigoFornecedor, ncm: l.ncm, cfop: l.cfop,
                    quantidade: l.quantidade, unidade: l.unidade, valorUnitario: l.valorUnitario,
                    valor: toR(l.valorC), pago: toR(pg[i]), aberto: toR(l.valorC - pg[i] - ds[i]),
                    desconto: toR(ds[i]), jurosMulta: toR(jm[i]),
                    divergente: l.divergente, semEstoqueMotivo: l.semEstoqueMotivo,
                    _seq: l.seq, _valorC: l.valorC
                });
            });
        }
        totalLinhas += linhasConta.length;
        if (totalLinhas > limiteDetalhe) { truncado = true; break; }
        acumularConta();
        if (!temProdutos) contasSemProdutos.push({ contaId: c.id, parcelaIds: c.parcelas.map((pa) => pa.id), ref: avisos });

        // 7) Dados da conta (uma entrada por conta)
        const pagas = c.parcelas.filter((pa) => pa.status === 'PAGO').length;
        let situacao = 'Aberto';
        if (c.status === 'QUITADO') situacao = 'Pago';
        else if (c.status === 'PARCIAL') situacao = 'Parcial';
        else if (c.parcelas.some((pa) => pa.status !== 'PAGO' && ymdSP(pa.dataVencimento) < hoje)) situacao = 'Vencido';
        let conc = '';
        if (pagamentos.length > 0) {
            const n = pagamentos.filter((x) => conciliados.has(x.id)).length;
            conc = n === 0 ? 'Não' : (n === pagamentos.length ? 'Sim' : 'Parcial');
        }
        const porData = (a, b) => new Date(a.iso) - new Date(b.iso);
        const datasPg = [...new Map(pagamentos.map((x) => [fmtDataBr(x.dataPagamento), { iso: x.dataPagamento, br: fmtDataBr(x.dataPagamento) }])).values()].sort(porData);
        contasOut.push({
            id: c.id,
            fornecedor: c.fornecedor?.razaoSocial || c.fornecedor?.nomeFantasia || '—',
            fornecedorDoc: c.fornecedor?.cnpjCpf || null,
            descricao: c.descricao,
            origem: c.origem,
            documento: { tipo: doc.tipo, rotulo: rotuloDocumento(doc), numero: doc.numero || null, chave: doc.chave || null },
            emissao: c.dataEmissao,
            referenteA: c.competencia
                ? new Date(c.competencia).toLocaleDateString('pt-BR', { timeZone: TZ, month: '2-digit', year: 'numeric' })
                : '',
            parcelas: `${pagas}/${c.parcelas.length}`,
            vencimentos: c.parcelas.map((pa) => fmtDataBr(pa.dataVencimento)).join('; '),
            situacao,
            datasPagamento: datasPg.map((d) => d.br).join('; '),
            formas: juntarUnicos(pagamentos.map((x) => x.formaPagamento)),
            bancos: juntarUnicos(pagamentos.filter((x) => x.contaFinanceiraCaId).map((x) => nomeBanco.get(x.contaFinanceiraCaId) || 'Conta desconhecida')),
            baixadoPor: juntarUnicos(pagamentos.map((x) => x.registradoPor?.nome)),
            conciliado: conc,
            temAnexo: !!c.pdfPath || comAnexo.has(c.id),
            valorNota: toR(toC(c.valorTotal)),
            pagoConta: toR(pagoC), descontoConta: toR(descC), jurosMultaConta: toR(jurosC), abertoConta: toR(abertoC),
            avisos,
            _emissaoMs: c.dataEmissao ? new Date(c.dataEmissao).getTime() : 0,
            _numeroNota: c.numeroNota || ''
        });
        linhasItens.push(...linhasConta);
    }

    // ── Nota vinculada depois a parcela já lançada (limitação v1: sem produtos) ──
    if (detalhe && contasSemProdutos.length > 0) {
        const parcelaParaConta = new Map();
        contasSemProdutos.forEach((x) => x.parcelaIds.forEach((id) => parcelaParaConta.set(id, x)));
        const vinc = await emBlocos([...parcelaParaConta.keys()], (ids) => prisma.notaEntradaParcela.findMany({
            where: { parcelaPagarId: { in: ids } }, select: { parcelaPagarId: true }
        }));
        const contasVinc = new Set(vinc.map((v) => parcelaParaConta.get(v.parcelaPagarId)?.contaId).filter(Boolean));
        avisosRes.contasComNotaVinculadaSemProdutos = contasVinc.size;
        for (const co of contasOut) if (contasVinc.has(co.id)) co.avisos.push('NOTA_VINCULADA_SEM_PRODUTOS');
    }

    // ── Resumo por categoria (linhas[]) ──
    const totalGeralC = [...acumCat.values()].reduce((s, a) => s + a.valorC, 0);
    const linhas = [...acumCat.values()]
        .sort((x, y) => y.valorC - x.valorC)
        .map((a) => {
            const info = catsInfo.get(a.categoria);
            return {
                id: a.categoria,
                categoria: a.categoria,
                classificacao: info?.classificacao || null,
                natureza: info?.natureza || null,
                grupoDre: info?.grupoDre?.nome || null,
                contas: a.contas,
                valor: toR(a.valorC),
                percentual: totalGeralC > 0 ? Math.round((a.valorC / totalGeralC) * 10000) / 100 : 0,
                valorPago: toR(a.pagoC),
                valorAberto: toR(a.valorC - a.pagoC - a.descontoC),
                desconto: toR(a.descontoC),
                grupoDreOrdem: info?.grupoDre?.ordem ?? null,
                foraDre: info?.classificacao === 'FORA_DRE',
                _jurosC: a.jurosC
            };
        });

    const soma = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
    const bloco = (arr) => ({
        categorias: arr.length,
        valor: toR(soma(arr, (x) => toC(x.valor))),
        pago: toR(soma(arr, (x) => toC(x.valorPago))),
        aberto: toR(soma(arr, (x) => toC(x.valorAberto)))
    });
    const resumoExtra = {
        abertoTotal: toR(soma(linhas, (x) => toC(x.valorAberto))),
        descontoTotal: toR(soma(linhas, (x) => toC(x.desconto))),
        jurosMultaTotal: toR(soma(linhas, (x) => x._jurosC)),
        dre: bloco(linhas.filter((x) => !x.foraDre)),
        foraDre: bloco(linhas.filter((x) => x.foraDre)),
        semDocumento: { contas: semDoc.contas, valor: toR(semDoc.valorC) },
        contas: contas.length,
        avisos: avisosRes
    };
    linhas.forEach((x) => { delete x._jurosC; });

    const out = { linhas, resumoExtra, truncado };
    if (!detalhe) return out;

    // ── Ordenação final dos itens ──
    const infoCat = new Map(linhas.map((l) => [l.categoria, l]));
    const contaPorId = new Map(contasOut.map((c) => [c.id, c]));
    const somaCat = new Map();
    const somaForn = new Map();
    for (const l of linhasItens) {
        const co = contaPorId.get(l.contaId);
        somaCat.set(l.categoria, (somaCat.get(l.categoria) || 0) + l._valorC);
        const kf = `${l.categoria}\u0000${co.fornecedor}`;
        somaForn.set(kf, (somaForn.get(kf) || 0) + l._valorC);
    }
    const nomeGrupo = (cat) => infoCat.get(cat)?.grupoDre || '';
    const rankGrupo = (cat) => {
        const i = infoCat.get(cat);
        if (i?.foraDre) return [2, 0];
        if (i?.grupoDreOrdem !== null && i?.grupoDreOrdem !== undefined) return [0, i.grupoDreOrdem];
        return [1, 0];
    };
    linhasItens.sort((a, b) => {
        const ca = contaPorId.get(a.contaId);
        const cb = contaPorId.get(b.contaId);
        const [ga, oa] = rankGrupo(a.categoria);
        const [gb, ob] = rankGrupo(b.categoria);
        return (ga - gb) || (oa - ob)
            || compararTexto(nomeGrupo(a.categoria), nomeGrupo(b.categoria))
            || ((somaCat.get(b.categoria) || 0) - (somaCat.get(a.categoria) || 0))
            || compararTexto(a.categoria, b.categoria)
            || ((somaForn.get(`${b.categoria}\u0000${cb.fornecedor}`) || 0) - (somaForn.get(`${a.categoria}\u0000${ca.fornecedor}`) || 0))
            || compararTexto(ca.fornecedor, cb.fornecedor)
            || (ca._emissaoMs - cb._emissaoMs)
            || compararTexto(ca._numeroNota, cb._numeroNota)
            || compararTexto(a.contaId, b.contaId)
            || (a._seq - b._seq);
    });
    linhasItens.forEach((l) => { delete l._seq; delete l._valorC; });
    contasOut.forEach((c) => { delete c._emissaoMs; delete c._numeroNota; });

    out.contas = contasOut;
    out.itens = linhasItens;
    return out;
}

module.exports = {
    ratear, juntarUnicos, rotuloDocumento, montarPagarDetalhado, LIMITE_LINHAS_DETALHE
};
