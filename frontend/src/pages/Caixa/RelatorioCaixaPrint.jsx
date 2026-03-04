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

const LINHAS_POR_PAGINA = 45;
const LINHAS_BLANK_FORM = 20;

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
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-700 mr-3"></div>
                Preparando relatório...
            </div>
        );
    }

    if (!relatorio) {
        return <div className="text-center p-8 text-gray-500">Dados não encontrados.</div>;
    }

    const dataFormatada = new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
    const entregas = relatorio.entregas || [];
    const despesas = relatorio.despesas || [];
    const temDados = entregas.length > 0 || despesas.length > 0;

    // Agrupar despesas por categoria
    const despesasPorCategoria = {};
    despesas.forEach(d => {
        const cat = d.categoria || 'OUTRO';
        if (!despesasPorCategoria[cat]) despesasPorCategoria[cat] = 0;
        despesasPorCategoria[cat] += Number(d.valor);
    });

    // Dividir entregas em páginas de 45 linhas
    const paginasEntregas = [];
    if (entregas.length > 0) {
        for (let i = 0; i < entregas.length; i += LINHAS_POR_PAGINA) {
            paginasEntregas.push(entregas.slice(i, i + LINHAS_POR_PAGINA));
        }
    }

    // Atendimentos (Página 2)
    const atendimentos = relatorio.atendimentos || [];

    return (
        <div className="print-report">
            <style>{`
                @media print {
                    body { margin: 0; padding: 0; }
                    .no-print { display: none !important; }
                    .print-report { font-size: 10px; }
                    .page-break { page-break-before: always; }
                    @page { margin: 10mm; size: A4; }
                }
                .print-report { font-family: 'Courier New', monospace; max-width: 210mm; margin: 0 auto; }
                .print-report table { border-collapse: collapse; width: 100%; }
                .print-report th, .print-report td { border: 1px solid #999; padding: 2px 4px; text-align: left; }
                .print-report th { background: #e5e5e5; font-weight: bold; }
                .print-report .header-box { border: 2px solid #333; padding: 8px; margin-bottom: 8px; }
                .print-report .total-box { border: 3px solid #000; padding: 10px; text-align: center; font-size: 16px; font-weight: bold; margin: 8px 0; }
                .print-report .dashed-line { border-bottom: 1px dashed #999; height: 20px; }
            `}</style>

            {/* Botão Imprimir (não imprime) */}
            <div className="no-print text-center py-4 bg-gray-100 mb-4 sticky top-0 z-10">
                <button
                    onClick={() => window.print()}
                    className="px-6 py-2 bg-gray-800 text-white rounded font-medium hover:bg-gray-900 mr-3"
                >
                    Imprimir
                </button>
                <button
                    onClick={() => window.history.back()}
                    className="px-6 py-2 bg-gray-300 text-gray-800 rounded font-medium hover:bg-gray-400"
                >
                    Voltar
                </button>
            </div>

            {/* ═════════ PÁGINA 1: CAIXA ═════════ */}
            <div style={{ padding: '5mm' }}>
                {/* Cabeçalho */}
                <div className="header-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong style={{ fontSize: '14px' }}>HARDT — CAIXA DIÁRIO</strong>
                            <br />
                            <span>Data: {dataFormatada}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span>Motorista/Vendedor: <strong>{relatorio.vendedorNome || '_______________'}</strong></span>
                            <br />
                            <span>Status: <strong>{relatorio.caixa?.status || 'ABERTO'}</strong></span>
                        </div>
                    </div>
                </div>

                {/* Grid: Veículo + Adiantamento */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ flex: 1, border: '1px solid #999', padding: '6px' }}>
                        <strong>Veículo:</strong> {relatorio.diario?.placa || '________'} — {relatorio.diario?.modelo || '________'}
                        <br />
                        <strong>KM:</strong> {relatorio.diario?.kmInicial || '______'} → {relatorio.diario?.kmFinal || '______'}
                        {relatorio.diario?.totalKm > 0 && <span> ({relatorio.diario.totalKm} km)</span>}
                    </div>
                    <div style={{ flex: 1, border: '1px solid #999', padding: '6px' }}>
                        <strong>Adiantamento:</strong> R$ {Number(relatorio.caixa?.adiantamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        <br />
                        <strong>Média Combustível:</strong> {(relatorio.mediaCombustivel3Meses || relatorio.mediaCombustivel) ? `${(relatorio.mediaCombustivel3Meses || relatorio.mediaCombustivel).toFixed(2)} km/L` : '—'}
                    </div>
                </div>

                {/* Despesas por Categoria */}
                <div style={{ border: '1px solid #999', padding: '6px', marginBottom: '8px' }}>
                    <strong>DESPESAS DO DIA</strong>
                    <table style={{ marginTop: '4px' }}>
                        <thead>
                            <tr>
                                <th>Categoria</th>
                                <th style={{ textAlign: 'right', width: '100px' }}>Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.keys(CATEGORIA_LABELS).map(cat => {
                                const valor = despesasPorCategoria[cat];
                                if (!valor) return null;
                                return (
                                    <tr key={cat}>
                                        <td>{CATEGORIA_LABELS[cat]}</td>
                                        <td style={{ textAlign: 'right' }}>R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                );
                            })}
                            <tr style={{ fontWeight: 'bold', borderTop: '2px solid #333' }}>
                                <td>TOTAL DESPESAS</td>
                                <td style={{ textAlign: 'right' }}>R$ {Number(relatorio.totalDespesas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Resumo Entregas */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ flex: 1, border: '1px solid #999', padding: '6px', textAlign: 'center' }}>
                        <strong>{relatorio.contagens?.totalEntregas || 0}</strong><br /><span style={{ fontSize: '9px' }}>Total</span>
                    </div>
                    <div style={{ flex: 1, border: '1px solid #999', padding: '6px', textAlign: 'center' }}>
                        <strong>{relatorio.contagens?.entregues || 0}</strong><br /><span style={{ fontSize: '9px' }}>Entregues</span>
                    </div>
                    <div style={{ flex: 1, border: '1px solid #999', padding: '6px', textAlign: 'center' }}>
                        <strong>{relatorio.contagens?.parciais || 0}</strong><br /><span style={{ fontSize: '9px' }}>Parciais</span>
                    </div>
                    <div style={{ flex: 1, border: '1px solid #999', padding: '6px', textAlign: 'center' }}>
                        <strong>{relatorio.contagens?.devolvidos || 0}</strong><br /><span style={{ fontSize: '9px' }}>Devolvidos</span>
                    </div>
                </div>

                {/* VALOR A PRESTAR */}
                <div className="total-box">
                    VALOR A PRESTAR: R$ {Number(relatorio.valorAPrestar || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>

                {/* Tabela de Entregas (ou Formulário em Branco) */}
                {temDados ? (
                    paginasEntregas.map((pagina, pageIdx) => (
                        <div key={pageIdx} className={pageIdx > 0 ? 'page-break' : ''}>
                            {pageIdx > 0 && (
                                <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
                                    HARDT — CAIXA DIÁRIO — {dataFormatada} — Pág. {pageIdx + 1}
                                </div>
                            )}
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '25px' }}>#</th>
                                        <th>Cliente</th>
                                        <th style={{ width: '80px' }}>Cond. Pgto</th>
                                        <th style={{ width: '80px', textAlign: 'right' }}>Valor</th>
                                        <th style={{ width: '55px', textAlign: 'center' }}>Tipo</th>
                                        <th>Pagamentos</th>
                                        <th style={{ width: '25px', textAlign: 'center' }}>☐</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagina.map((e, i) => (
                                        <tr key={e.pedidoId}>
                                            <td>{pageIdx * LINHAS_POR_PAGINA + i + 1}</td>
                                            <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {e.clienteNome}
                                            </td>
                                            <td>{e.condicaoPagamento || e.condicao}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                R$ {Number(e.valorPedido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ textAlign: 'center', fontSize: '9px' }}>{e.statusEntrega || e.status}</td>
                                            <td style={{ fontSize: '9px' }}>
                                                {e.pagamentos?.map(p => `${p.formaNome || p.forma}: R$${Number(p.valor).toFixed(2)}`).join(' | ')}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{e.conferida || e.conferido ? '✓' : '☐'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))
                ) : (
                    /* Formulário em branco */
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: '25px' }}>#</th>
                                <th>Cliente</th>
                                <th style={{ width: '80px' }}>Cond. Pgto</th>
                                <th style={{ width: '80px', textAlign: 'right' }}>Valor</th>
                                <th style={{ width: '55px', textAlign: 'center' }}>Tipo</th>
                                <th>Pagamentos</th>
                                <th style={{ width: '25px', textAlign: 'center' }}>☐</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from({ length: LINHAS_BLANK_FORM }, (_, i) => (
                                <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td className="dashed-line"></td>
                                    <td>☐</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Rodapé Pg 1 */}
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #999', paddingTop: '6px' }}>
                    <div>
                        <strong>Recebido Caixa:</strong> R$ {Number(relatorio.totalRecebidoCaixa || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div>
                        <strong>Recebido Outros:</strong> R$ {Number(relatorio.totalRecebidoOutros || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ borderTop: '1px solid #333', width: '45%', textAlign: 'center', paddingTop: '4px' }}>
                        Assinatura Motorista
                    </div>
                    <div style={{ borderTop: '1px solid #333', width: '45%', textAlign: 'center', paddingTop: '4px' }}>
                        Assinatura Conferente
                    </div>
                </div>
            </div>

            {/* ═════════ PÁGINA 2: ATENDIMENTOS ═════════ */}
            <div className="page-break" style={{ padding: '5mm' }}>
                <div className="header-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                            <strong style={{ fontSize: '14px' }}>HARDT — ATENDIMENTOS DO DIA</strong>
                            <br />
                            <span>Data: {dataFormatada} — {relatorio.vendedorNome || ''}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <span>Total: <strong>{atendimentos.length}</strong> atendimentos</span>
                        </div>
                    </div>
                </div>

                {atendimentos.length > 0 ? (
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: '25px' }}>#</th>
                                <th style={{ width: '60px' }}>Tipo</th>
                                <th>Cliente / Lead</th>
                                <th style={{ width: '80px' }}>Pedido</th>
                                <th style={{ width: '50px' }}>Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {atendimentos.map((a, i) => (
                                <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td>{a.tipo}</td>
                                    <td>{a.nome}</td>
                                    <td>{a.pedido || '—'}</td>
                                    <td>{a.hora || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                        Nenhum atendimento registrado no dia.
                    </div>
                )}
            </div>
        </div>
    );
};

export default RelatorioCaixaPrint;
