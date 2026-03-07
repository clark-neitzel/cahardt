import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Plus, Trash2, MapPin, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';
import AdicionarPedidosModal from './AdicionarPedidosModal';

const DetalhesCargaModal = ({ embarqueId, onClose, onUpdated }) => {
    const [embarque, setEmbarque] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [removerLoader, setRemoverLoader] = useState(null);
    const [showPreview, setShowPreview] = useState(false);

    // Referencia para o Print
    const printRef = useRef();

    const fetchDetalhes = async () => {
        try {
            setLoading(true);
            const data = await embarqueService.detalhar(embarqueId);
            setEmbarque(data);
        } catch (error) {
            toast.error('Erro ao ler a carga. Ela pode ter sido deletada.');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDetalhes();
    }, [embarqueId]);

    const handleRemover = async (pedidoId) => {
        if (!window.confirm('Tem certeza que deseja retirar essa NF do caminhão?')) return;

        try {
            setRemoverLoader(pedidoId);
            await embarqueService.removerPedido(embarqueId, pedidoId);
            toast.success('Nota Fiscal removida da doca.');
            fetchDetalhes();
            if (onUpdated) onUpdated();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao remover. Pode estar bloqueado.');
        } finally {
            setRemoverLoader(null);
        }
    };

    const handlePrint = () => {
        const content = printRef.current;
        const printWindow = window.open('', '', 'height=800,width=800');

        // Tailwind forms a basic CSS string for print
        const tailwindCSS = Array.from(document.styleSheets)
            .flatMap(sheet => {
                try {
                    return Array.from(sheet.cssRules).map(rule => rule.cssText);
                } catch (e) { return []; }
            })
            .join('\n');

        printWindow.document.write(`
            <html>
                <head>
                    <title>Romaneio de Carga #${embarque?.numero}</title>
                    <style>
                        ${tailwindCSS}
                        @media print {
                            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 20mm; font-family: sans-serif; }
                            .page-break { page-break-before: always; }
                            /* Hide unecessary stuff if any leaked */
                        }
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                        th { background-color: #f3f4f6; }
                        h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
                        h2 { font-size: 16px; font-weight: bold; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
                        .text-sm { font-size: 12px; }
                        .text-xs { font-size: 10px; color: #666; }
                    </style>
                </head>
                <body>
                    ${content.innerHTML}
                </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500); // Wait for styles to inject
    };

    // Calculate Consolidado de Produtos
    const consolidado = {};
    if (embarque && embarque.pedidos) {
        embarque.pedidos.forEach(p => {
            p.itens.forEach(i => {
                const nome = i.produto?.nome || 'Produto Removido';
                if (!consolidado[nome]) consolidado[nome] = { qtde: 0, und: i.produto?.unidade || 'UN' };
                consolidado[nome].qtde += Number(i.quantidade);
            });
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 px-4 py-8">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-lg shadow-sm z-10">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center">
                        {showPreview ? <Printer className="h-5 w-5 mr-2 text-sky-600" /> : <Package className="h-5 w-5 mr-2 text-sky-600" />}
                        {showPreview ? `Pré-visualização (Romaneio Carga #${embarque?.numero || '...'})` : `Gerenciamento da Carga #${embarque?.numero || '...'}`}
                    </h3>
                    <div className="flex space-x-2">
                        {showPreview ? (
                            <>
                                <button onClick={() => setShowPreview(false)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 rounded-md transition-colors shadow-sm">Voltar</button>
                                <button onClick={handlePrint} className="px-4 py-2 text-sm font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-md flex items-center shadow-md">
                                    <Printer className="h-4 w-4 mr-2" /> Imprimir Agora
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setShowPreview(true)} disabled={!embarque} className="p-2 text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 rounded-md transition-colors" title="Visualizar e Imprimir (PDF)">
                                    <Printer className="h-5 w-5" />
                                </button>
                                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-500 rounded-md">
                                    <X className="h-5 w-5" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className={`flex-1 overflow-y-auto p-4 md:p-6 bg-white ${showPreview ? 'hidden' : 'block'}`}>
                    {loading ? (
                        <div className="text-center py-20 text-gray-500">Lendo escopo do caminhão...</div>
                    ) : !embarque ? (
                        <div className="text-center py-20 text-red-500">Falha ao localizar os dados.</div>
                    ) : (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <p className="text-sm text-gray-500">Motorista Responsável</p>
                                    <p className="text-lg font-bold text-gray-900">{embarque.responsavel?.nome}</p>
                                    <p className="text-sm text-gray-500 mt-1">Data de Saída: {new Date(embarque.dataSaida).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div>
                                    <button
                                        onClick={() => setIsAddOpen(true)}
                                        className="inline-flex items-center px-4 py-2 border border-sky-600 shadow-sm text-sm font-medium rounded-md text-sky-600 bg-white hover:bg-sky-50 focus:outline-none"
                                    >
                                        <Plus className="-ml-1 mr-2 h-4 w-4" />
                                        Atrelar Notas "FATURADAS"
                                    </button>
                                </div>
                            </div>

                            <div className="border border-gray-200 rounded-md overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NF CA</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endereço Geográfico</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Volumes</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Retirar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {embarque.pedidos.length === 0 ? (
                                            <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">Caminhão Vazio.</td></tr>
                                        ) : embarque.pedidos.map(p => (
                                            <tr key={p.id}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">{p.numero || 'Sem Nº'}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{p.cliente?.NomeFantasia}</td>
                                                <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                                                    <MapPin className="inline h-3 w-3 mr-1 text-gray-400" />
                                                    {p.cliente?.End_Logradouro || 'N/A'}, {p.cliente?.End_Numero || 'SN'} - {p.cliente?.End_Bairro || 'N/A'} ({p.cliente?.End_Cidade})
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700 bg-gray-50">
                                                    {p.itens.reduce((acc, i) => acc + Number(i.quantidade), 0)} itens
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                    <button
                                                        onClick={() => handleRemover(p.id)}
                                                        disabled={removerLoader === p.id}
                                                        className="text-red-500 hover:text-red-700 disabled:opacity-50"
                                                        title="Remover do Embarque (Volta pra doca)"
                                                    >
                                                        {removerLoader === p.id ? '...' : <Trash2 className="h-5 w-5" />}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sub Modal para add pedidos */}
            {isAddOpen && (
                <AdicionarPedidosModal
                    embarqueId={embarqueId}
                    onClose={() => setIsAddOpen(false)}
                    onSuccess={() => {
                        setIsAddOpen(false);
                        fetchDetalhes();
                        if (onUpdated) onUpdated();
                    }}
                />
            )}

            {/* DOM PARA PREVIEW E IMPRESSAO EM A4 */}
            <div className={showPreview ? "flex-1 overflow-y-auto bg-gray-200 p-4 print:-m-4 print:p-0" : "hidden"}>
                <div ref={printRef} className="print-container print-preview bg-white mx-auto shadow-md border border-gray-300 relative text-gray-900" style={{ minHeight: '297mm', maxWidth: '210mm', padding: '15mm' }}>
                    <style>
                        {`
                          .print-preview table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                          .print-preview th, .print-preview td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
                          .print-preview th { background-color: #f3f4f6; color: #333; }
                          .print-preview h1 { font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #111; }
                          .print-preview h2 { font-size: 14px; font-weight: bold; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px; color: #333; }
                          @media print {
                              .print-preview { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; }
                              .page-break { page-break-before: always; }
                          }
                        `}
                    </style>
                    {/* Página 1: Roteiro Motorista */}
                    <h1>Roteiro de Entrega Oficial - Carga #${embarque?.numero || '000'}</h1>
                    <div className="text-sm" style={{ marginBottom: '20px' }}>
                        <div><strong>Motorista:</strong> {embarque?.responsavel?.nome}</div>
                        <div><strong>Data Base:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString() : ''}</div>
                        <div><strong>Qtd NFs:</strong> {embarque?.pedidos?.length || 0}</div>
                    </div>

                    <h2>Rota / Lista de Clientes</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Nº Pedido</th>
                                <th>Cliente</th>
                                <th>Endereço Completo</th>
                                <th>Status Físico</th>
                            </tr>
                        </thead>
                        <tbody>
                            {embarque?.pedidos?.map(p => (
                                <tr key={p.id}>
                                    <td><strong>{p.numero || 'N/A'}</strong></td>
                                    <td><strong>{p.cliente?.NomeFantasia}</strong></td>
                                    <td className="text-xs">{p.cliente?.End_Logradouro}, {p.cliente?.End_Numero} - {p.cliente?.End_Bairro} ({p.cliente?.End_Cidade})</td>
                                    <td>[  ] Entregue <br />[  ] Devolvido</td>
                                </tr>
                            ))}
                            {embarque?.pedidos?.length === 0 && (
                                <tr><td colSpan="4" style={{ textAlign: 'center' }}>Vazio.</td></tr>
                            )}
                        </tbody>
                    </table>

                    {/* Quebra de página estrita */}
                    <div className="page-break"></div>

                    {/* Página 2: Almoxarifado / Separação */}
                    <h1>Retirada de Saldo (Câmara Fria) - Carga #${embarque?.numero || '000'}</h1>
                    <div className="text-sm" style={{ marginBottom: '20px' }}>
                        <div><strong>Motorista:</strong> {embarque?.responsavel?.nome}</div>
                        <div><strong>Objetivo:</strong> Resumo consolidado para separação otimizada no estoque antes do carregamento do veículo.</div>
                    </div>

                    <h2>Totalização por SKU (Agrupado)</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Produto</th>
                                <th>Unidade</th>
                                <th>Quantidade Total a Separar</th>
                                <th>Visto Inspetor (Check)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(consolidado).sort((a, b) => a[0].localeCompare(b[0])).map(([nome, info]) => (
                                <tr key={nome}>
                                    <td><strong>{nome}</strong></td>
                                    <td>{info.und}</td>
                                    <td><strong>{Number(info.qtde).toFixed(2)}</strong></td>
                                    <td></td>
                                </tr>
                            ))}
                            {Object.keys(consolidado).length === 0 && (
                                <tr><td colSpan="4" style={{ textAlign: 'center' }}>Nenhum produto atrelado.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DetalhesCargaModal;
