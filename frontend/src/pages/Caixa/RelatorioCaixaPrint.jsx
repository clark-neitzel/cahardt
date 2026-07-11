import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import caixaService from '../../services/caixaService';

const CATEGORIA_LABELS = {
    MERCADORIA_EMPRESA: 'Mercadoria',
    COMBUSTIVEL: 'Combustível',
    PEDAGIO_BALSA: 'Pedágio/Balsa',
    HOTEL_HOSPEDAGEM: 'Hotel/Hospedagem',
    MANUTENCAO_VEICULO: 'Manutenção',
    OUTRO: 'Outro'
};

const STATUS_LABELS = { ENTREGUE: 'ENTREGUE', ENTREGUE_PARCIAL: 'PARCIAL', DEVOLVIDO: 'DEVOLVIDO' };

// Folha 1 comporta ~55 linhas densas; 52 deixa margem p/ subtotal + assinaturas
const ENTREGAS_FOLHA_1 = 52;
const ENTREGAS_FOLHA_EXTRA = 62;
const LINHAS_BLANK_FORM = 20;

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

const RelatorioCaixaPrint = () => {
    const [searchParams] = useSearchParams();
    const data = searchParams.get('data');
    const vendedorId = searchParams.get('vendedorId');

    const [relatorio, setRelatorio] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (data && vendedorId) {
            caixaService.getRelatorio(data, vendedorId)
                .then(res => setRelatorio(res))
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        }
    }, [data, vendedorId]);

    useEffect(() => {
        if (relatorio && !loading) {
            setTimeout(() => window.print(), 500);
        }
    }, [relatorio, loading]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Arial, sans-serif', fontSize: '16px' }}>
                Preparando relatório...
            </div>
        );
    }

    if (!relatorio) {
        return <div style={{ textAlign: 'center', padding: '40px', fontFamily: 'Arial, sans-serif', color: '#666' }}>Dados não encontrados.</div>;
    }

    const dataObj = new Date(data + 'T12:00:00');
    const dataFormatada = dataObj.toLocaleDateString('pt-BR');
    const diaSemana = dataObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const entregas = relatorio.entregas || [];
    const despesas = relatorio.despesas || [];
    const atendimentos = relatorio.atendimentos || [];
    const pedidosVendedor = relatorio.pedidosVendedor || [];
    const amostras = relatorio.amostras || [];
    const temDados = entregas.length > 0;

    // ── Totais e valor por entrega ──
    // Dinheiro da entrega = soma dos pagamentos que debitam o caixa (DEVOLVIDO não conta)
    let totalCaixa = 0;
    let totalOutros = 0;
    const formasResumo = {}; // { forma: { total, count, debitaCaixa } }
    const entregasCalc = entregas.map(e => {
        const st = e.status || e.statusEntrega;
        const isDevolvido = st === 'DEVOLVIDO';
        let dinheiro = 0;
        (e.pagamentos || []).forEach(p => {
            if (isDevolvido) return;
            const val = Number(p.valor);
            if (p.debitaCaixa) { totalCaixa += val; dinheiro += val; }
            else totalOutros += val;
            const forma = p.formaNome || p.forma || 'Outros';
            if (!formasResumo[forma]) formasResumo[forma] = { total: 0, count: 0, debitaCaixa: !!p.debitaCaixa };
            formasResumo[forma].total += val;
            formasResumo[forma].count += 1;
        });
        return { ...e, _st: st, _dinheiro: dinheiro };
    });

    const recCaixa = relatorio.totalRecebidoCaixa ?? totalCaixa;
    const recOutros = relatorio.totalRecebidoOutros ?? totalOutros;
    const adiantamento = Number(relatorio.caixa?.adiantamento || 0);
    const totalDesp = Number(relatorio.totalDespesas || 0);
    const faltasDevolucao = Number(relatorio.faltasDevolucao || 0);
    const valorAPrestar = relatorio.valorAPrestar ?? (adiantamento + recCaixa + faltasDevolucao - totalDesp);
    // Enquanto o dia não está pronto (conferência de devoluções pendente, KM/entregas em aberto),
    // a impressão NÃO revela o valor a prestar — evita imprimir sem conferir.
    const valorLiberado = relatorio.valorLiberado !== false;
    const confDev = relatorio.conferenciaDevolucao;
    const confDevItens = confDev?.itens || [];
    const autorizacoesDev = confDevItens.filter(i => Number(i.qtdDesconsiderada) > 0);

    const entregasDinheiroCount = entregasCalc.filter(e => e._dinheiro > 0).length;
    const contagens = {
        total: entregas.length,
        entregues: entregasCalc.filter(e => e._st === 'ENTREGUE').length,
        parciais: entregasCalc.filter(e => e._st === 'ENTREGUE_PARCIAL').length,
        devolvidos: entregasCalc.filter(e => e._st === 'DEVOLVIDO').length
    };
    const formasNaoCaixa = Object.entries(formasResumo).filter(([, f]) => !f.debitaCaixa);
    const formasCaixaDetalhe = Object.entries(formasResumo).filter(([, f]) => f.debitaCaixa);

    // ── Paginação: 52 na folha 1, 62 nas extras (raro passar de 1) ──
    const paginasEntregas = [];
    if (entregasCalc.length > 0) {
        paginasEntregas.push(entregasCalc.slice(0, ENTREGAS_FOLHA_1));
        for (let i = ENTREGAS_FOLHA_1; i < entregasCalc.length; i += ENTREGAS_FOLHA_EXTRA) {
            paginasEntregas.push(entregasCalc.slice(i, i + ENTREGAS_FOLHA_EXTRA));
        }
    }

    // ── Atendimentos: só o resumo sai na folha (detalhe fica na tela do caixa) ──
    const TIPO_LABELS = { WHATSAPP: 'WhatsApp', VISITA: 'Visita', LIGACAO: 'Ligação', LEAD_NOVO: 'Lead novo', PEDIDO: 'Pedido' };
    const atendPorTipo = {};
    atendimentos.forEach(a => {
        const t = TIPO_LABELS[a.tipo] || a.tipo || 'Outro';
        atendPorTipo[t] = (atendPorTipo[t] || 0) + 1;
    });
    const leadsNovosCount = atendimentos.filter(a => a.tipo === 'LEAD_NOVO').length;
    const pedidosLabel = pedidosVendedor.map(p => {
        const num = p.bonificacao ? `BN#${p.numero || '—'}` : p.especial ? `ZZ#${p.numero || '—'}` : `#${p.numero || '—'}`;
        return `${num} (${p.clienteNome})`;
    });

    const cabecalhoEntregas = (
        <tr>
            <th style={{ width: '19px' }} className="c">#</th>
            <th>Cliente</th>
            <th style={{ width: '86px' }}>Condição</th>
            <th style={{ width: '58px' }} className="r">Valor</th>
            <th style={{ width: '54px' }} className="c">Status</th>
            <th style={{ width: '110px' }}>Pagamento</th>
            <th style={{ width: '64px' }} className="r">Dinheiro</th>
            <th style={{ width: '18px' }} className="c">✓</th>
        </tr>
    );

    const linhaEntrega = (e, idx) => (
        <tr key={idx}>
            <td className="c" style={{ fontWeight: 700 }}>{idx + 1}</td>
            <td style={{ fontWeight: 700, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.especial && <span className="tag-esp">ESP</span>}
                {e.clienteNome}
            </td>
            <td>{e.condicaoPagamento || e.condicao}</td>
            <td className="r">{fmt(e.valorPedido)}</td>
            <td className="c" style={{ fontWeight: 700, fontSize: '8px' }}>{STATUS_LABELS[e._st] || e._st}</td>
            <td>{(e.pagamentos || []).map(p => `${p.formaNome || p.forma}: ${fmt(p.valor)}`).join(' | ')}</td>
            <td className="r dinheiro-col" style={{ fontWeight: e._dinheiro > 0 ? 800 : 400 }}>
                {e._dinheiro > 0 ? fmt(e._dinheiro) : '—'}
            </td>
            <td className="c">{e.conferida || e.conferido ? '✓' : '☐'}</td>
        </tr>
    );

    return (
        <>
            <style>{`
                @page { margin: 8mm 10mm; size: A4; }
                /* A folha (.rpt) é renderizada FORA do #root, direto no body (portal).
                   Na impressão escondemos o #root inteiro — assim NENHUM elemento do
                   app (barra "Site agora", sidebar, Clippy, etc.) pode vazar na folha. */
                .rpt-print { min-height: 100vh; background: #e9e9e9; padding: 20px 0; }
                @media print {
                    html, body { background: #fff !important; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    #root { display: none !important; }
                    .rpt-print { min-height: 0; background: #fff; padding: 0; }
                    .no-print { display: none !important; }
                    .page-break { page-break-before: always; }
                }
                .rpt { font-family: Arial, Helvetica, sans-serif; max-width: 190mm; margin: 0 auto; color: #111; background: #fff; padding: 10mm; box-shadow: 0 2px 14px rgba(0,0,0,.18); }
                @media print { .rpt { padding: 0; box-shadow: none; max-width: none; } }
                .rpt table { border-collapse: collapse; width: 100%; }
                .rpt th { background: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: .5px; color: #666; font-weight: 800; padding: 2.5px 5px; border-bottom: 1.5px solid #bbb; text-align: left; }
                .rpt td { font-size: 9px; padding: 1.6px 5px; border-bottom: 1px solid #e5e5e5; }
                .rpt .r { text-align: right; }
                .rpt .c { text-align: center; }
                .rpt .dinheiro-col { background: #f3faf7; }
                .rpt tr.subtotal td { border-top: 2px solid #1E3932; font-weight: 900; font-size: 10px; background: #f3faf7; padding: 3px 5px; }
                .rpt .tag-esp { font-size: 7px; font-weight: 900; color: #6d28d9; background: #ede9fe; padding: 0 3px; border-radius: 3px; margin-right: 3px; }

                .rpt .hdr { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1E3932; padding-bottom: 4px; margin-bottom: 5px; }
                .rpt .brand { font-size: 15px; font-weight: 900; letter-spacing: .8px; color: #1E3932; }
                .rpt .brand small { font-size: 9.5px; font-weight: 800; letter-spacing: 1.8px; color: #00754A; text-transform: uppercase; margin-left: 8px; }
                .rpt .hdr-right { text-align: right; font-size: 11px; font-weight: 700; color: #333; }
                .rpt .hdr-right b { font-size: 12px; color: #111; }
                .rpt .badge { display: inline-block; font-size: 8.5px; font-weight: 800; padding: 1px 7px; border: 1px solid #999; border-radius: 99px; color: #555; margin-left: 5px; vertical-align: 1px; }

                .rpt .band { display: flex; align-items: stretch; gap: 8px; margin-bottom: 5px; }
                .rpt .prestar { display: flex; align-items: center; gap: 10px; border: 2px solid #00754A; border-radius: 6px; background: #f3faf7; padding: 4px 12px; }
                .rpt .prestar .plabel { font-size: 8.5px; font-weight: 900; letter-spacing: 1.2px; color: #00754A; text-transform: uppercase; line-height: 1.15; }
                .rpt .prestar .pval { font-size: 19px; font-weight: 900; color: #1E3932; white-space: nowrap; }
                .rpt .confer { flex: 1; border: 1.5px dashed #999; border-radius: 6px; padding: 3px 10px; display: flex; align-items: center; gap: 14px; font-size: 10px; font-weight: 700; }
                .rpt .confer .linha { display: flex; align-items: baseline; gap: 5px; flex: 1; }
                .rpt .confer .traco { flex: 1; border-bottom: 1px solid #555; height: 11px; min-width: 40px; }

                .rpt .assin { display: flex; gap: 14mm; margin-top: 4.5mm; }
                .rpt .assin > div { flex: 1; border-top: 1.1px solid #111; text-align: center; font-size: 9px; font-weight: 800; padding-top: 3px; text-transform: uppercase; letter-spacing: 1px; color: #333; }

                .rpt .sec-title { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #00754A; border-bottom: 1px solid #d4e9e2; padding-bottom: 3px; margin: 11px 0 6px; }
                .rpt .conta td { font-size: 11px; padding: 3px 6px; }
                .rpt .conta .tot td { border-top: 2px solid #1E3932; border-bottom: none; font-weight: 900; font-size: 12px; }
                .rpt .sinal { width: 16px; font-weight: 900; color: #00754A; }
                .rpt .sinal.neg { color: #b91c1c; }
                .rpt .inforow { display: flex; border: 1px solid #ccc; border-radius: 4px; overflow: hidden; margin-bottom: 9px; }
                .rpt .inforow > div { flex: 1; padding: 5px 9px; border-right: 1px solid #ddd; }
                .rpt .inforow > div:last-child { border-right: none; }
                .rpt .inforow .lbl { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .8px; color: #777; }
                .rpt .inforow .val { font-size: 11px; font-weight: 700; margin-top: 1px; }
                .rpt .chips { display: flex; gap: 6px; }
                .rpt .chip { flex: 1; text-align: center; border: 1px solid #ddd; border-radius: 5px; padding: 4px 2px; }
                .rpt .chip .n { font-size: 15px; font-weight: 900; }
                .rpt .chip .l { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: #777; }
                .rpt .duascol { display: flex; gap: 12px; }
                .rpt .duascol > div { flex: 1; }
                .rpt .f10 td { font-size: 10px; padding: 2.5px 6px; }
                .rpt .obs-lines .ln { border-bottom: 1px dashed #bbb; height: 18px; }
                .rpt .naocaixa { margin-top: 6px; font-size: 10px; color: #555; }
                .rpt .vazio { font-size: 10.5px; color: #555; }
                .rpt .dashed-line { border-bottom: 1px dashed #aaa; height: 18px; }
            `}</style>

            {createPortal(
            <div className="rpt-print">
            {/* Botões (não imprime) */}
            <div className="no-print" style={{ textAlign: 'center', padding: '12px', marginBottom: '12px' }}>
                <button onClick={() => window.print()} style={{ padding: '8px 24px', background: '#00754A', color: '#fff', border: 'none', borderRadius: '99px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginRight: '10px' }}>
                    Imprimir
                </button>
                <button onClick={() => window.history.back()} style={{ padding: '8px 24px', background: '#d1d5db', color: '#374151', border: 'none', borderRadius: '99px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                    Voltar
                </button>
            </div>

            <div className="rpt">

                {/* ═══════════ FOLHA 1: fechamento + entregas + assinaturas ═══════════ */}
                <div className="hdr">
                    <div className="brand">HARDT<small>Caixa Diário · Prestação de Contas</small></div>
                    <div className="hdr-right">
                        <b>{dataFormatada}</b> · {diaSemana} — {relatorio.vendedorNome || '____________'}
                        <span className="badge">{relatorio.caixa?.status || 'ABERTO'}</span>
                    </div>
                </div>

                <div className="band">
                    <div className="prestar">
                        <span className="plabel">Valor a<br />Prestar</span>
                        <span className="pval">{valorLiberado ? `R$ ${fmt(valorAPrestar)}` : 'CONFERIR'}</span>
                    </div>
                    <div className="confer">
                        <div className="linha">Contado: R$ <span className="traco"></span></div>
                        <div className="linha">Diferença: R$ <span className="traco"></span></div>
                        <div className="linha">Conferido por: <span className="traco"></span></div>
                    </div>
                </div>

                {temDados ? (
                    paginasEntregas.map((pagina, pageIdx) => {
                        const offset = pageIdx === 0 ? 0 : ENTREGAS_FOLHA_1 + (pageIdx - 1) * ENTREGAS_FOLHA_EXTRA;
                        const isUltima = pageIdx === paginasEntregas.length - 1;
                        return (
                            <div key={pageIdx} className={pageIdx > 0 ? 'page-break' : ''}>
                                {pageIdx > 0 && (
                                    <div style={{ marginBottom: '6px', fontSize: '11px', fontWeight: 900, color: '#1E3932' }}>
                                        HARDT — CAIXA DIÁRIO — {dataFormatada} — {relatorio.vendedorNome} — continuação das entregas
                                    </div>
                                )}
                                <table>
                                    <thead>{cabecalhoEntregas}</thead>
                                    <tbody>
                                        {pagina.map((e, i) => linhaEntrega(e, offset + i))}
                                        {isUltima && (
                                            <tr className="subtotal">
                                                <td colSpan={6}>TOTAL EM DINHEIRO (entra no caixa) — {entregasDinheiroCount} entrega(s)</td>
                                                <td className="r">R$ {fmt(recCaixa)}</td>
                                                <td></td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })
                ) : (
                    <table>
                        <thead>{cabecalhoEntregas}</thead>
                        <tbody>
                            {Array.from({ length: LINHAS_BLANK_FORM }, (_, i) => (
                                <tr key={i}>
                                    <td className="c">{i + 1}</td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td className="c">☐</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div className="assin">
                    <div>Assinatura Motorista</div>
                    <div>Assinatura Conferente</div>
                </div>

                {/* ═══════════ FOLHA 2: apoio ═══════════ */}
                <div className="page-break">
                    <div className="hdr">
                        <div className="brand">HARDT<small>Caixa Diário · {dataFormatada} · {relatorio.vendedorNome || ''}</small></div>
                        <div className="hdr-right">Folha de apoio</div>
                    </div>

                    <div className="sec-title" style={{ marginTop: 0 }}>Diário do dia</div>
                    <div className="inforow">
                        <div>
                            <div className="lbl">Veículo</div>
                            <div className="val">{relatorio.diario?.placa || '________'} — {relatorio.diario?.modelo || '________'}</div>
                        </div>
                        <div>
                            <div className="lbl">KM inicial → final</div>
                            <div className="val">
                                {relatorio.diario?.kmInicial || '______'} → {relatorio.diario?.kmFinal || '______'}
                                {relatorio.diario?.totalKm > 0 && <span style={{ color: '#00754A' }}> ({relatorio.diario.totalKm} km)</span>}
                            </div>
                        </div>
                        <div>
                            <div className="lbl">Média combustível</div>
                            <div className="val">{(relatorio.mediaCombustivel3Meses || relatorio.mediaCombustivel) ? `${(relatorio.mediaCombustivel3Meses || relatorio.mediaCombustivel).toFixed(2)} km/L` : '—'}</div>
                        </div>
                        <div>
                            <div className="lbl">Adiantamento</div>
                            <div className="val">R$ {fmt(adiantamento)}</div>
                        </div>
                    </div>

                    <div className="duascol">
                        <div>
                            <div className="sec-title">Composição do valor a prestar</div>
                            <table className="conta">
                                <tbody>
                                    <tr><td className="sinal">+</td><td>Adiantamento</td><td className="r">R$ {fmt(adiantamento)}</td></tr>
                                    {formasCaixaDetalhe.length > 0 ? formasCaixaDetalhe.map(([forma, f], i) => (
                                        <tr key={i}><td className="sinal">+</td><td>{forma} ({f.count})</td><td className="r"><b>R$ {fmt(f.total)}</b></td></tr>
                                    )) : (
                                        <tr><td className="sinal">+</td><td>Recebido em dinheiro</td><td className="r"><b>R$ {fmt(recCaixa)}</b></td></tr>
                                    )}
                                    {faltasDevolucao > 0 && (
                                        <tr><td className="sinal">+</td><td>Faltas de devolução (cobradas)</td><td className="r">R$ {fmt(faltasDevolucao)}</td></tr>
                                    )}
                                    <tr><td className="sinal neg">−</td><td>Despesas do dia</td><td className="r">R$ {fmt(totalDesp)}</td></tr>
                                    <tr className="tot"><td></td><td>VALOR A PRESTAR</td><td className="r">{valorLiberado ? `R$ ${fmt(valorAPrestar)}` : 'Conferir devoluções'}</td></tr>
                                </tbody>
                            </table>
                            {formasNaoCaixa.length > 0 && (
                                <div className="naocaixa">
                                    <b>Não entram no caixa:</b><br />
                                    {formasNaoCaixa.map(([forma, f]) => `${forma} R$ ${fmt(f.total)} (${f.count})`).join(' · ')}<br />
                                    Total outros: R$ {fmt(recOutros)}
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="sec-title">Despesas do dia</div>
                            {despesas.length > 0 ? (
                                <table className="f10">
                                    <thead>
                                        <tr><th>Categoria</th><th>Descrição</th><th className="r">Valor</th></tr>
                                    </thead>
                                    <tbody>
                                        {despesas.map((d, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 700 }}>{CATEGORIA_LABELS[d.categoria] || d.categoria || 'Outro'}</td>
                                                <td>{d.descricao || '—'}{d.litros != null ? ` · ${d.litros} L` : ''}</td>
                                                <td className="r" style={{ fontWeight: 700 }}>R$ {fmt(d.valor)}</td>
                                            </tr>
                                        ))}
                                        <tr className="subtotal"><td colSpan={2}>TOTAL DESPESAS</td><td className="r">R$ {fmt(totalDesp)}</td></tr>
                                    </tbody>
                                </table>
                            ) : (
                                <div className="vazio">Sem despesas no dia.</div>
                            )}
                            <div className="sec-title">Resumo das entregas</div>
                            <div className="chips">
                                <div className="chip"><div className="n">{contagens.total}</div><div className="l">Total</div></div>
                                <div className="chip"><div className="n" style={{ color: '#00754A' }}>{contagens.entregues}</div><div className="l">Entregues</div></div>
                                <div className="chip"><div className="n" style={{ color: '#b45309' }}>{contagens.parciais}</div><div className="l">Parciais</div></div>
                                <div className="chip"><div className="n" style={{ color: '#b91c1c' }}>{contagens.devolvidos}</div><div className="l">Devolvidos</div></div>
                            </div>
                        </div>
                    </div>

                    <div className="sec-title">
                        Conferência de devoluções
                        {confDev && confDevItens.length > 0 && (
                            confDev.status === 'CONFERIDA'
                                ? ` — conferida por ${confDev.conferidoPorNome || '—'}${confDev.conferidoEm ? ` às ${new Date(confDev.conferidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                                : ' — PENDENTE'
                        )}
                    </div>
                    {confDev && confDevItens.length > 0 ? (
                        <>
                            <table className="f10">
                                <thead>
                                    <tr>
                                        <th>Produto</th>
                                        <th>Pedido / Cliente</th>
                                        <th style={{ width: '46px' }} className="c">Dev.</th>
                                        <th style={{ width: '50px' }} className="c">Voltou</th>
                                        <th style={{ width: '60px' }} className="c">Descons.</th>
                                        <th style={{ width: '72px' }} className="r">Cobrado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {confDevItens.map((i, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: 600 }}>{i.produtoNome}{i.sobra ? ' (sobra avulsa)' : ''}</td>
                                            <td style={{ fontSize: '9px' }}>
                                                {(i.pedidosOrigem || []).map(po => `${po.numero || '?'} ${po.cliente || ''}`).join(' / ') || '—'}
                                            </td>
                                            <td className="c">{Number(i.qtdEsperada)}</td>
                                            <td className="c">{Number(i.qtdRecebida)}</td>
                                            <td className="c">{Number(i.qtdDesconsiderada) > 0 ? `${Number(i.qtdDesconsiderada)}*` : '—'}</td>
                                            <td className="r" style={{ fontWeight: 700 }}>{Number(i.valorCobrado) > 0 ? `R$ ${fmt(i.valorCobrado)}` : '—'}</td>
                                        </tr>
                                    ))}
                                    <tr className="subtotal">
                                        <td colSpan={5}>FALTAS COBRADAS DO MOTORISTA{confDev.tabelaCobrancaNome ? ` (tabela ${confDev.tabelaCobrancaNome})` : ''}</td>
                                        <td className="r">R$ {fmt(confDev.totalCobrado)}</td>
                                    </tr>
                                </tbody>
                            </table>
                            {autorizacoesDev.length > 0 && (
                                <div style={{ fontSize: '9px', color: '#333', marginTop: '4px' }}>
                                    {autorizacoesDev.map((i, idx) => (
                                        <div key={idx}>
                                            * {i.produtoNome}: {Number(i.qtdDesconsiderada)} desconsiderada(s) — autorizado por {i.autorizadoPorNome || '—'}{i.motivoDesconsiderar ? ` (motivo: ${i.motivoDesconsiderar})` : ''}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="vazio">Sem devoluções no dia — nada a conferir.</div>
                    )}

                    <div className="sec-title">Amostras entregues {amostras.length > 0 ? `(${amostras.length}) — sem valor financeiro` : ''}</div>
                    {amostras.length > 0 ? (
                        <table className="f10">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }} className="c">AM#</th>
                                    <th>Destinatário</th>
                                    <th>Solicitado por</th>
                                    <th>Itens</th>
                                </tr>
                            </thead>
                            <tbody>
                                {amostras.map((am, i) => (
                                    <tr key={i}>
                                        <td className="c" style={{ fontWeight: 700 }}>{am.numero}</td>
                                        <td style={{ fontWeight: 600 }}>{am.destinatario}</td>
                                        <td>{am.solicitadoPor}</td>
                                        <td>{am.itens?.map(it => `${it.nome} ×${it.quantidade}`).join(', ')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="vazio">Nenhuma amostra entregue no dia.</div>
                    )}

                    <div className="sec-title">Atendimentos e pedidos do dia — resumo</div>
                    {(atendimentos.length > 0 || pedidosVendedor.length > 0) ? (
                        <>
                            <div className="chips" style={{ marginBottom: '6px' }}>
                                <div className="chip"><div className="n">{atendimentos.length}</div><div className="l">Atendimentos</div></div>
                                <div className="chip"><div className="n" style={{ color: '#00754A' }}>{pedidosVendedor.length}</div><div className="l">Pedidos novos</div></div>
                                <div className="chip"><div className="n" style={{ color: '#b45309' }}>{leadsNovosCount}</div><div className="l">Leads novos</div></div>
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#333', lineHeight: 1.7 }}>
                                {Object.keys(atendPorTipo).length > 0 && (
                                    <><b>Por tipo:</b> {Object.entries(atendPorTipo).map(([t, n]) => `${t} ${n}`).join(' · ')}<br /></>
                                )}
                                {pedidosLabel.length > 0 && (
                                    <><b>Pedidos feitos no dia:</b> {pedidosLabel.join(' · ')}</>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="vazio">Nenhum atendimento registrado no dia.</div>
                    )}

                    <div className="sec-title">Observações do conferente</div>
                    <div className="obs-lines">
                        <div className="ln"></div>
                        <div className="ln"></div>
                        <div className="ln"></div>
                    </div>
                </div>
            </div>
            </div>,
            document.body
            )}
        </>
    );
};

export default RelatorioCaixaPrint;
