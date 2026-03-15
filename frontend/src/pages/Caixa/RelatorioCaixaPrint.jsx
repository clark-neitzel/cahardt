import React, { useEffect, useState } from 'react';
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

const ENTREGAS_POR_PAGINA = 45;
const ATENDIMENTOS_POR_PAGINA = 30;
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

    const dataFormatada = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
    const entregas = relatorio.entregas || [];
    const despesas = relatorio.despesas || [];
    const atendimentos = relatorio.atendimentos || [];
    const pedidosVendedor = relatorio.pedidosVendedor || [];
    const amostras = relatorio.amostras || [];
    const temDados = entregas.length > 0 || despesas.length > 0;

    // Montar lista unificada para impressão:
    // - Atendimentos do vendedor (tipo: VISITA, WHATSAPP, LIGACAO, etc.)
    // - Pedidos feitos pelo vendedor no dia (tipo: PEDIDO)
    const linhasAtendimento = [
        ...atendimentos.map(a => ({
            ...a,
            _origem: 'atendimento'
        })),
        ...pedidosVendedor.map(p => ({
            tipo: 'PEDIDO',
            clienteNome: p.clienteNome,
            observacao: p.observacao,
            pedidoId: p.especial ? `ZZ#${p.numero || '—'}` : `#${p.numero || '—'}`,
            canal: null,
            leadNome: null,
            hora: p.createdAt,
            _origem: 'pedido'
        }))
    ].sort((a, b) => new Date(a.hora) - new Date(b.hora));

    // Agrupar despesas por categoria
    const despesasPorCategoria = {};
    despesas.forEach(d => {
        const cat = d.categoria || 'OUTRO';
        if (!despesasPorCategoria[cat]) despesasPorCategoria[cat] = 0;
        despesasPorCategoria[cat] += Number(d.valor);
    });

    // Paginar entregas (45 por página)
    const paginasEntregas = [];
    if (entregas.length > 0) {
        for (let i = 0; i < entregas.length; i += ENTREGAS_POR_PAGINA) {
            paginasEntregas.push(entregas.slice(i, i + ENTREGAS_POR_PAGINA));
        }
    }

    // Paginar atendimentos (30 por página)
    const paginasAtendimentos = [];
    if (linhasAtendimento.length > 0) {
        for (let i = 0; i < linhasAtendimento.length; i += ATENDIMENTOS_POR_PAGINA) {
            paginasAtendimentos.push(linhasAtendimento.slice(i, i + ATENDIMENTOS_POR_PAGINA));
        }
    }

    // Calcular totais recebidos do relatório (se não vier calculado)
    let totalCaixa = 0;
    let totalOutros = 0;
    entregas.forEach(e => {
        if ((e.status || e.statusEntrega) === 'DEVOLVIDO') return;
        (e.pagamentos || []).forEach(p => {
            if (p.debitaCaixa) totalCaixa += Number(p.valor);
            else totalOutros += Number(p.valor);
        });
    });
    const recCaixa = relatorio.totalRecebidoCaixa ?? totalCaixa;
    const recOutros = relatorio.totalRecebidoOutros ?? totalOutros;
    const adiantamento = Number(relatorio.caixa?.adiantamento || 0);
    const totalDesp = Number(relatorio.totalDespesas || 0);
    const valorAPrestar = relatorio.valorAPrestar ?? (adiantamento + recCaixa - totalDesp);

    return (
        <>
            <style>{`
                @media print {
                    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    .no-print, nav, header { display: none !important; }
                    .page-break { page-break-before: always; }
                    @page { margin: 8mm 10mm; size: A4; }
                }
                .rpt {
                    font-family: Arial, Helvetica, sans-serif;
                    max-width: 190mm;
                    margin: 0 auto;
                    color: #000;
                }
                .rpt table { border-collapse: collapse; width: 100%; }
                .rpt th, .rpt td { border: 1px solid #555; padding: 3px 5px; }
                .rpt th { background: #ddd; font-weight: 700; font-size: 11px; }
                .rpt td { font-size: 11px; }
                .rpt .hdr { border: 2px solid #000; padding: 8px 12px; margin-bottom: 10px; background: #f5f5f5; }
                .rpt .hdr-title { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; }
                .rpt .hdr-sub { font-size: 12px; font-weight: 700; margin-top: 2px; }
                .rpt .box { border: 1px solid #666; padding: 6px 10px; }
                .rpt .box-title { font-size: 12px; font-weight: 900; margin-bottom: 4px; text-transform: uppercase; }
                .rpt .total-box {
                    border: 3px solid #000; padding: 10px 16px; text-align: center;
                    font-size: 20px; font-weight: 900; margin: 10px 0; background: #f0f0f0;
                }
                .rpt .stat-box { border: 1px solid #666; padding: 6px; text-align: center; flex: 1; }
                .rpt .stat-num { font-size: 18px; font-weight: 900; }
                .rpt .stat-label { font-size: 10px; font-weight: 700; text-transform: uppercase; }
                .rpt .sign-line { border-top: 1px solid #000; width: 45%; text-align: center; padding-top: 4px; font-size: 11px; font-weight: 700; }
                .rpt .dashed-line { border-bottom: 1px dashed #aaa; height: 18px; }
            `}</style>

            {/* Botões (não imprime) */}
            <div className="no-print" style={{ textAlign: 'center', padding: '12px', background: '#f3f4f6', position: 'sticky', top: 0, zIndex: 10 }}>
                <button onClick={() => window.print()} style={{ padding: '8px 24px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', marginRight: '10px' }}>
                    Imprimir
                </button>
                <button onClick={() => window.history.back()} style={{ padding: '8px 24px', background: '#d1d5db', color: '#374151', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                    Voltar
                </button>
            </div>

            <div className="rpt">

                {/* ═══════════════════ PÁGINA 1: CAIXA DIÁRIO ═══════════════════ */}
                <div style={{ padding: '2mm 0' }}>

                    {/* Cabeçalho */}
                    <div className="hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div className="hdr-title">HARDT — CAIXA DIÁRIO</div>
                            <div className="hdr-sub">Data: {dataFormatada}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700 }}>Motorista: {relatorio.vendedorNome || '_______________'}</div>
                            <div style={{ fontSize: '12px', fontWeight: 700 }}>Status: {relatorio.caixa?.status || 'ABERTO'}</div>
                        </div>
                    </div>

                    {/* Veículo + Adiantamento */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <div className="box" style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px' }}>
                                <strong>Veículo:</strong> {relatorio.diario?.placa || '____________'} — {relatorio.diario?.modelo || '____________'}
                            </div>
                            <div style={{ fontSize: '12px', marginTop: '3px' }}>
                                <strong>KM:</strong> {relatorio.diario?.kmInicial || '________'} → {relatorio.diario?.kmFinal || '________'}
                                {relatorio.diario?.totalKm > 0 && <span> ({relatorio.diario.totalKm} km rodados)</span>}
                            </div>
                        </div>
                        <div className="box" style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px' }}>
                                <strong>Adiantamento:</strong> R$ {fmt(adiantamento)}
                            </div>
                            <div style={{ fontSize: '12px', marginTop: '3px' }}>
                                <strong>Média Combustível:</strong> {(relatorio.mediaCombustivel3Meses || relatorio.mediaCombustivel) ? `${(relatorio.mediaCombustivel3Meses || relatorio.mediaCombustivel).toFixed(2)} km/L` : '—'}
                            </div>
                        </div>
                    </div>

                    {/* Despesas */}
                    <div className="box" style={{ marginBottom: '10px' }}>
                        <div className="box-title">Despesas do Dia</div>
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Categoria</th>
                                    <th style={{ textAlign: 'right', width: '120px' }}>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.keys(CATEGORIA_LABELS).map(cat => {
                                    const valor = despesasPorCategoria[cat];
                                    if (!valor) return null;
                                    return (
                                        <tr key={cat}>
                                            <td style={{ fontWeight: 600 }}>{CATEGORIA_LABELS[cat]}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>R$ {fmt(valor)}</td>
                                        </tr>
                                    );
                                })}
                                {Object.keys(despesasPorCategoria).length === 0 && (
                                    <tr><td colSpan={2} style={{ textAlign: 'center', color: '#999', fontStyle: 'italic' }}>Sem despesas</td></tr>
                                )}
                                <tr style={{ fontWeight: 900, borderTop: '2px solid #000', fontSize: '12px' }}>
                                    <td>TOTAL DESPESAS</td>
                                    <td style={{ textAlign: 'right' }}>R$ {fmt(totalDesp)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Contadores de Entregas */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        {[
                            { label: 'Total', val: entregas.length },
                            { label: 'Entregues', val: entregas.filter(e => (e.status || e.statusEntrega) === 'ENTREGUE').length },
                            { label: 'Parciais', val: entregas.filter(e => (e.status || e.statusEntrega) === 'ENTREGUE_PARCIAL').length },
                            { label: 'Devolvidos', val: entregas.filter(e => (e.status || e.statusEntrega) === 'DEVOLVIDO').length }
                        ].map(s => (
                            <div key={s.label} className="stat-box">
                                <div className="stat-num">{s.val}</div>
                                <div className="stat-label">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* VALOR A PRESTAR */}
                    <div className="total-box">
                        VALOR A PRESTAR: R$ {fmt(valorAPrestar)}
                    </div>

                    {/* Tabela de Entregas */}
                    {temDados ? (
                        paginasEntregas.map((pagina, pageIdx) => (
                            <div key={pageIdx} className={pageIdx > 0 ? 'page-break' : ''}>
                                {pageIdx > 0 && (
                                    <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 900 }}>
                                        HARDT — CAIXA DIÁRIO — {dataFormatada} — {relatorio.vendedorNome} — Pág. {pageIdx + 1}
                                    </div>
                                )}
                                <table>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '22px', textAlign: 'center' }}>#</th>
                                            <th style={{ textAlign: 'left' }}>Cliente</th>
                                            <th style={{ width: '90px', textAlign: 'left' }}>Cond. Pgto</th>
                                            <th style={{ width: '75px', textAlign: 'right' }}>Valor</th>
                                            <th style={{ width: '60px', textAlign: 'center' }}>Tipo</th>
                                            <th style={{ textAlign: 'left' }}>Pagamentos</th>
                                            <th style={{ width: '22px', textAlign: 'center' }}>✓</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagina.map((e, i) => {
                                            const st = e.statusEntrega || e.status;
                                            return (
                                                <tr key={i}>
                                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{pageIdx * ENTREGAS_POR_PAGINA + i + 1}</td>
                                                    <td style={{ fontWeight: 700, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {e.especial && <span style={{ fontSize: '8px', fontWeight: 900, color: '#6d28d9', background: '#ede9fe', padding: '1px 4px', borderRadius: '3px', marginRight: '4px' }}>ESP</span>}
                                                        {e.clienteNome}
                                                    </td>
                                                    <td style={{ fontSize: '10px', fontWeight: 600 }}>{e.condicaoPagamento || e.condicao}</td>
                                                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                        {fmt(e.valorPedido)}
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontSize: '9px', fontWeight: 700 }}>{STATUS_LABELS[st] || st}</td>
                                                    <td style={{ fontSize: '10px', fontWeight: 600 }}>
                                                        {e.pagamentos?.map(p => `${p.formaNome || p.forma}: ${fmt(p.valor)}`).join(' | ')}
                                                    </td>
                                                    <td style={{ textAlign: 'center', fontSize: '13px', fontWeight: 900 }}>{e.conferida || e.conferido ? '✓' : '☐'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '22px', textAlign: 'center' }}>#</th>
                                    <th>Cliente</th>
                                    <th style={{ width: '90px' }}>Cond. Pgto</th>
                                    <th style={{ width: '75px', textAlign: 'right' }}>Valor</th>
                                    <th style={{ width: '60px', textAlign: 'center' }}>Tipo</th>
                                    <th>Pagamentos</th>
                                    <th style={{ width: '22px', textAlign: 'center' }}>✓</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: LINHAS_BLANK_FORM }, (_, i) => (
                                    <tr key={i}>
                                        <td style={{ textAlign: 'center' }}>{i + 1}</td>
                                        <td className="dashed-line"></td>
                                        <td className="dashed-line"></td>
                                        <td className="dashed-line"></td>
                                        <td className="dashed-line"></td>
                                        <td className="dashed-line"></td>
                                        <td style={{ textAlign: 'center' }}>☐</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Amostras entregues */}
                    {amostras.length > 0 && (
                        <div className="box" style={{ marginTop: '10px' }}>
                            <div className="box-title">Amostras Entregues ({amostras.length}) — sem valor financeiro</div>
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px', textAlign: 'center' }}>AM#</th>
                                        <th style={{ textAlign: 'left' }}>Destinatário</th>
                                        <th style={{ textAlign: 'left' }}>Solicitado por</th>
                                        <th style={{ textAlign: 'left' }}>Itens</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {amostras.map((am, i) => (
                                        <tr key={i}>
                                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{am.numero}</td>
                                            <td style={{ fontWeight: 600 }}>{am.destinatario}</td>
                                            <td style={{ fontSize: '10px' }}>{am.solicitadoPor}</td>
                                            <td style={{ fontSize: '10px' }}>
                                                {am.itens?.map(it => `${it.nome} ×${it.quantidade}`).join(', ')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Rodapé - Recebidos + Assinaturas */}
                    <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #000', paddingTop: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 900 }}>
                            Recebido Caixa: R$ {fmt(recCaixa)}
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 900 }}>
                            Recebido Outros: R$ {fmt(recOutros)}
                        </div>
                    </div>

                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between' }}>
                        <div className="sign-line">Assinatura Motorista</div>
                        <div className="sign-line">Assinatura Conferente</div>
                    </div>
                </div>

                {/* ═══════════════════ PÁGINA 2+: ATENDIMENTOS ═══════════════════ */}
                {paginasAtendimentos.map((pagina, pageIdx) => (
                    <div key={pageIdx} className="page-break" style={{ padding: '2mm 0' }}>
                        <div className="hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div className="hdr-title">HARDT — ATENDIMENTOS DO DIA</div>
                                <div className="hdr-sub">Data: {dataFormatada} — {relatorio.vendedorNome || ''}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>Total: {linhasAtendimento.length} registro(s)</div>
                                {paginasAtendimentos.length > 1 && (
                                    <div style={{ fontSize: '11px', fontWeight: 600 }}>Pág. {pageIdx + 1} de {paginasAtendimentos.length}</div>
                                )}
                            </div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '25px', textAlign: 'center' }}>#</th>
                                    <th style={{ width: '75px', textAlign: 'center' }}>Tipo</th>
                                    <th style={{ textAlign: 'left' }}>Cliente / Lead</th>
                                    <th style={{ width: '120px', textAlign: 'left' }}>Detalhe</th>
                                    <th style={{ textAlign: 'left' }}>Obs</th>
                                    <th style={{ width: '55px', textAlign: 'center' }}>Hora</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagina.map((a, i) => {
                                    // Detalhe dinâmico por tipo
                                    let detalhe = '—';
                                    if (a._origem === 'pedido') {
                                        detalhe = a.pedidoId || '—'; // ex: "#27"
                                    } else if (a.tipo === 'LEAD_NOVO' || a.leadNome) {
                                        detalhe = a.canal ? `Canal: ${a.canal}` : 'Lead Novo';
                                    } else if (a.pedidoId) {
                                        detalhe = `Ped: ${a.pedidoId}`;
                                    }

                                    const bgAtendimento = a._origem === 'pedido'
                                        ? '#f0f8ff'
                                        : (a.tipo === 'LEAD_NOVO' || a.leadNome)
                                            ? '#fffde7'
                                            : '#ffffff';

                                    return (
                                        <tr key={i} style={{ background: bgAtendimento }}>
                                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{pageIdx * ATENDIMENTOS_POR_PAGINA + i + 1}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '10px' }}>{a.tipo}</td>
                                            <td style={{ fontWeight: 600 }}>{a.clienteNome || a.leadNome || '—'}</td>
                                            <td style={{ fontSize: '10px', fontWeight: 600 }}>{detalhe}</td>
                                            <td style={{ fontSize: '10px', color: '#444' }}>{a.observacao || '—'}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                                {a.hora ? new Date(a.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ))}

                {/* Se não tem atendimentos, mostra página vazia */}
                {linhasAtendimento.length === 0 && (
                    <div className="page-break" style={{ padding: '2mm 0' }}>
                        <div className="hdr">
                            <div className="hdr-title">HARDT — ATENDIMENTOS DO DIA</div>
                            <div className="hdr-sub">Data: {dataFormatada} — {relatorio.vendedorNome || ''}</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: '14px', color: '#999', fontWeight: 600 }}>
                            Nenhum atendimento registrado no dia.
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default RelatorioCaixaPrint;

