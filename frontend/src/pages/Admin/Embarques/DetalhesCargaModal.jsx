import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Plus, Trash2, MapPin, Package, Edit2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';
import AdicionarPedidosModal from './AdicionarPedidosModal';
import { useAuth } from '../../../contexts/AuthContext';

const DetalhesCargaModal = ({ embarqueId, onClose, onUpdated, motoristas = [] }) => {
    const { user } = useAuth();
    const [embarque, setEmbarque] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [removerLoader, setRemoverLoader] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [editando, setEditando] = useState(false);
    const [editData, setEditData] = useState({ dataSaida: '', responsavelId: '' });
    const [salvando, setSalvando] = useState(false);

    const podeEditarEmbarque = !!(user?.permissoes?.admin || user?.permissoes?.Pode_Editar_Embarque);

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

    const handleRemoverAmostra = async (amostraId) => {
        if (!window.confirm('Tem certeza que deseja retirar essa amostra do caminhão?')) return;

        try {
            setRemoverLoader(amostraId);
            await embarqueService.removerAmostra(embarqueId, amostraId);
            toast.success('Amostra removida da carga.');
            fetchDetalhes();
            if (onUpdated) onUpdated();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao remover amostra.');
        } finally {
            setRemoverLoader(null);
        }
    };

    const abrirEdicao = () => {
        setEditData({
            dataSaida: embarque.dataSaida ? new Date(embarque.dataSaida).toISOString().slice(0, 10) : '',
            responsavelId: embarque.responsavel?.id || ''
        });
        setEditando(true);
    };

    const salvarEdicao = async () => {
        try {
            setSalvando(true);
            await embarqueService.editar(embarqueId, {
                dataSaida: editData.dataSaida,
                responsavelId: editData.responsavelId
            });
            toast.success('Carga atualizada.');
            setEditando(false);
            fetchDetalhes();
            if (onUpdated) onUpdated();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao salvar.');
        } finally {
            setSalvando(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // Calculate Consolidado de Produtos (com rastreio de pedidos)
    const consolidado = {};
    if (embarque && embarque.pedidos) {
        embarque.pedidos.forEach(p => {
            const prefixoImp = p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '';
            const numPedido = prefixoImp ? `${prefixoImp}${p.numero}` : (p.numero || 'N/A');
            p.itens.forEach(i => {
                const nome = i.produto?.nome || 'Produto Removido';
                if (!consolidado[nome]) consolidado[nome] = { qtde: 0, und: i.produto?.unidade || 'UN', pedidos: [] };
                consolidado[nome].qtde += Number(i.quantidade);
                if (!consolidado[nome].pedidos.includes(numPedido)) {
                    consolidado[nome].pedidos.push(numPedido);
                }
            });
        });
    }

    if (showPreview) {
        // Lógica de Paginação Artificial (40 por página)
        const CHUNK_SIZE = 40;
        const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

        const pedidosPaginados = chunkArray(embarque?.pedidos || [], CHUNK_SIZE);
        if (pedidosPaginados.length === 0) pedidosPaginados.push([]); // Garante Pelo menos 1 página vazia

        const arrConsolidado = Object.entries(consolidado).sort((a, b) => a[0].localeCompare(b[0]));
        const produtosPaginados = chunkArray(arrConsolidado, CHUNK_SIZE);
        if (produtosPaginados.length === 0) produtosPaginados.push([]);

        // Rastreabilidade: produto -> qtde -> pedidos vinculados
        const rastreabilidadePaginada = chunkArray(arrConsolidado, 35);
        if (rastreabilidadePaginada.length === 0) rastreabilidadePaginada.push([]);

        const amostrasEmbarque = embarque?.amostras || [];
        const hasAmostras = amostrasEmbarque.length > 0;
        const totalPages = pedidosPaginados.length + produtosPaginados.length + rastreabilidadePaginada.length + (hasAmostras ? 1 : 0);
        let globalPageCount = 1;

        return (
            <div id="print-root-overlay" className="fixed inset-0 z-[9999] bg-gray-800 overflow-y-auto flex flex-col print:bg-white print:overflow-visible text-gray-900 font-sans">
                {/* ActionBar Fixa */}
                <div className="sticky top-0 z-10 w-full bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between shadow-2xl print:hidden flex-shrink-0">
                    <h3 className="text-white font-bold flex items-center">
                        <Printer className="w-5 h-5 mr-3 text-sky-400" />
                        Pré-visualização do Relatório (A4)
                    </h3>
                    <div className="flex gap-3">
                        <button onClick={() => setShowPreview(false)} className="px-5 py-2 border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white rounded-md text-sm font-medium transition-colors cursor-pointer">Voltar para Edição</button>
                        <button onClick={handlePrint} className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-md flex items-center shadow-lg text-sm font-bold transition-all cursor-pointer">
                            <Printer className="w-4 h-4 mr-2" /> Imprimir / PDF
                        </button>
                    </div>
                </div>

                {/* Área Scrollável (Fundo Escuro) */}
                <div className="print-scroll-area flex-1 w-full flex flex-col items-center py-8 print:py-0 print:block">
                    {/* Container de Impressão com Zoom out no Mobile p/ caber na tela */}
                    <div ref={printRef} className="print-container flex flex-col gap-10 print:gap-0 print:block transform scale-[0.45] sm:scale-75 md:scale-100 origin-top transition-transform">
                        <style>
                            {`
                            .print-container table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                            .print-container th, .print-container td { border: 1px solid #000; padding: 2px 4px; text-align: left; font-size: 8px; line-height: 1.1; color: #000; }
                            .print-container .page-produtos th, .print-container .page-produtos td { font-size: 10px; line-height: 1.2; padding: 3px 5px; }
                            .print-container th { background-color: #f3f4f6; color: #000; font-weight: bold; }
                            .print-container h1 { font-size: 14px; font-weight: bold; margin-bottom: 2px; color: #000; text-transform: uppercase; }
                            .print-container h2 { font-size: 11px; font-weight: bold; margin-top: 10px; margin-bottom: 5px; border-bottom: 1px solid #000; padding-bottom: 2px; color: #000; }
                            @media print {
                                @page { size: A4 portrait; margin: 8mm 5mm 5mm 5mm; }
                                /* Esconde TUDO da página exceto o conteúdo de impressão */
                                body * { visibility: hidden; }
                                #print-root-overlay, #print-root-overlay .print-scroll-area, #print-root-overlay .print-scroll-area * { visibility: visible; }
                                #print-root-overlay { position: absolute !important; top: 0; left: 0; width: 100% !important; background: white !important; overflow: visible !important; }
                                .print-scroll-area { padding: 0 !important; margin: 0 !important; display: block !important; }
                                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: #000 !important; }
                                .print-container { transform: scale(1) !important; margin: 0 !important; gap: 0 !important; display: block !important; }
                                .print-container th, .print-container td { font-size: 8px !important; padding: 2px 3px !important; line-height: 1.1 !important; color: #000 !important; border: 1px solid #000 !important; }
                                .print-container .page-produtos th, .print-container .page-produtos td { font-size: 10px !important; padding: 3px 5px !important; line-height: 1.2 !important; }
                                .print-container td.wrap-text { white-space: normal !important; word-wrap: break-word !important; }
                                .print-page { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; min-height: auto !important; padding: 0 5mm !important; page-break-after: always; }
                                .print-page:last-child { page-break-after: auto; }
                            }
                            `}
                        </style>

                        {/* Paginação do Roteiro */}
                        {pedidosPaginados.map((chunkPedidos, idx) => {
                            const thisPage = globalPageCount++;
                            return (
                                <React.Fragment key={`roteiro-${idx}`}>
                                    <div className="print-page bg-white shadow-2xl w-full text-black mx-auto relative group" style={{ minHeight: '297mm', width: '210mm', padding: '0mm 6mm' }}>
                                        <div className="absolute top-0 right-2 text-[8px] font-bold uppercase tracking-wider print:hidden text-black">
                                            Página {thisPage} de {totalPages}
                                        </div>

                                        <h1 className="pt-4">Roteiro de Entrega - Carga #{embarque?.numero || '000'} {pedidosPaginados.length > 1 ? `(Pt. ${idx + 1})` : ''}</h1>
                                        <div className="text-[9px] flex justify-between border-b border-black pb-2 mb-2 text-black font-semibold">
                                            <div><strong>Motorista:</strong> {embarque?.responsavel?.nome}</div>
                                            <div><strong>Data Base:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString() : ''}</div>
                                            <div><strong>Qtd NFs (Total):</strong> {embarque?.pedidos?.length || 0}</div>
                                        </div>

                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '4%' }}>Nº</th>
                                                    <th style={{ width: '25%' }}>Cliente (Razão / Fantasia)</th>
                                                    <th style={{ width: '22%' }}>Observação</th>
                                                    <th style={{ width: '13%' }}>Pgto</th>
                                                    <th style={{ width: '11%' }}>Valor</th>
                                                    <th style={{ width: '25%' }}>Entrega (Check)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {chunkPedidos.map(p => {
                                                    const totalPedido = p.itens?.reduce((acc, i) => acc + (Number(i.valor || 0) * Number(i.quantidade || 0)), 0) || 0;
                                                    const pgto = p.nomeCondicaoPagamento || p.opcaoCondicaoPagamento || p.tipoPagamento || '-';
                                                    const prefixoImp = p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '';
                                                    const numImp = prefixoImp ? `${prefixoImp}${p.numero}` : (p.numero || 'N/A');

                                                    return (
                                                        <tr key={p.id}>
                                                            <td className="font-bold text-center">{numImp}</td>
                                                            <td className="wrap-text leading-tight">
                                                                <div className="font-bold text-black">{p.cliente?.NomeFantasia || p.cliente?.Nome || '—'}</div>
                                                                {p.cliente?.NomeFantasia && p.cliente?.Nome && p.cliente.NomeFantasia !== p.cliente.Nome && (
                                                                    <div className="text-[7px] text-black font-semibold">{p.cliente.Nome}</div>
                                                                )}
                                                            </td>
                                                            <td className="text-[7px] italic wrap-text">{p.observacoes || ''}</td>
                                                            <td className="text-[7px] wrap-text font-bold leading-tight">{pgto}</td>
                                                            <td className="font-mono text-right font-bold whitespace-nowrap">R$ {totalPedido.toFixed(2)}</td>
                                                            <td className="text-[8px] whitespace-nowrap font-bold">
                                                                [  ] Total &nbsp; [  ] Parcial &nbsp; [  ] Devolução
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                                {chunkPedidos.length === 0 && (
                                                    <tr><td colSpan="6" style={{ textAlign: 'center' }}>Vazio.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="w-full border-b-2 border-dashed border-gray-600 print:hidden relative h-4"></div>
                                </React.Fragment>
                            );
                        })}

                        {/* Página de Amostras (se houver) */}
                        {hasAmostras && (() => {
                            const thisPage = globalPageCount++;
                            return (
                                <React.Fragment key="amostras">
                                    <div className="print-page bg-white shadow-2xl w-full text-black mx-auto relative group" style={{ minHeight: '297mm', width: '210mm', padding: '0mm 6mm' }}>
                                        <div className="absolute top-0 right-2 text-[8px] font-bold uppercase tracking-wider print:hidden text-black">
                                            Página {thisPage} de {totalPages}
                                        </div>

                                        <h1 className="pt-4">Amostras - Carga #{embarque?.numero || '000'}</h1>
                                        <div className="text-[9px] flex justify-between border-b border-black pb-2 mb-2 text-black font-semibold">
                                            <div><strong>Motorista:</strong> {embarque?.responsavel?.nome}</div>
                                            <div><strong>Data Base:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString() : ''}</div>
                                            <div><strong>Qtd Amostras:</strong> {amostrasEmbarque.length}</div>
                                        </div>

                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '8%' }}>Nº</th>
                                                    <th style={{ width: '30%' }}>Destinatário</th>
                                                    <th style={{ width: '37%' }}>Itens</th>
                                                    <th style={{ width: '15%' }}>Vendedor</th>
                                                    <th style={{ width: '10%' }}>Entrega</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {amostrasEmbarque.map(a => (
                                                    <tr key={a.id}>
                                                        <td className="font-bold text-center">AM#{a.numero}</td>
                                                        <td className="wrap-text leading-tight font-bold">
                                                            {a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '-'}
                                                        </td>
                                                        <td className="text-[7px] wrap-text">
                                                            {a.itens?.map(i => `${i.nomeProduto} (${Number(i.quantidade)}x)`).join(', ') || '-'}
                                                        </td>
                                                        <td className="text-[7px]">{a.solicitadoPor?.nome || '-'}</td>
                                                        <td className="text-[8px] whitespace-nowrap font-bold">
                                                            [  ] OK
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="w-full border-b-2 border-dashed border-gray-600 print:hidden relative h-4"></div>
                                </React.Fragment>
                            );
                        })()}

                        {/* Paginação da Separação */}
                        {produtosPaginados.map((chunkProdutos, idx) => {
                            const thisPage = globalPageCount++;
                            return (
                                <React.Fragment key={`separacao-${idx}`}>
                                    <div className="print-page page-produtos bg-white shadow-2xl w-full text-black mx-auto relative group" style={{ minHeight: '297mm', width: '210mm', padding: '0mm 6mm' }}>
                                        <div className="absolute top-2 right-2 text-[8px] text-gray-300 font-bold uppercase tracking-wider print:hidden group-hover:text-gray-400">
                                            Página {thisPage} de {totalPages}
                                        </div>

                                        <h1 className="pt-4">Separação Produtos - Carga #{embarque?.numero || '000'} {produtosPaginados.length > 1 ? `(Pt. ${idx + 1})` : ''}</h1>
                                        <div className="text-[9px] flex justify-between border-b border-black pb-2 mb-2 text-black font-semibold">
                                            <div><strong>Motorista:</strong> {embarque?.responsavel?.nome}</div>
                                            <div><strong>Data Base:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString() : ''}</div>
                                        </div>

                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '55%' }}>Produto</th>
                                                    <th style={{ width: '10%' }}>Unidade</th>
                                                    <th style={{ width: '20%', textAlign: 'center' }}>Quantidade</th>
                                                    <th style={{ width: '15%', textAlign: 'center' }}>Conferido</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {chunkProdutos.map(([nome, info]) => (
                                                    <tr key={nome}>
                                                        <td className="font-bold">{nome}</td>
                                                        <td className="text-center">{info.und}</td>
                                                        <td className="text-center font-bold">{Number(info.qtde).toFixed(2)}</td>
                                                        <td></td>
                                                    </tr>
                                                ))}
                                                {chunkProdutos.length === 0 && (
                                                    <tr><td colSpan="4" style={{ textAlign: 'center' }}>Nenhum produto atrelado.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="w-full border-b-2 border-dashed border-gray-600 print:hidden relative h-4"></div>
                                </React.Fragment>
                            );
                        })}

                        {/* Paginação da Rastreabilidade (Produto x Pedidos) */}
                        {rastreabilidadePaginada.map((chunkRastreio, idx) => {
                            const thisPage = globalPageCount++;
                            return (
                                <React.Fragment key={`rastreio-${idx}`}>
                                    <div className="print-page page-produtos bg-white shadow-2xl w-full text-black mx-auto relative group" style={{ minHeight: '297mm', width: '210mm', padding: '0mm 6mm' }}>
                                        <div className="absolute top-2 right-2 text-[8px] text-gray-300 font-bold uppercase tracking-wider print:hidden group-hover:text-gray-400">
                                            Página {thisPage} de {totalPages}
                                        </div>

                                        <h1 className="pt-4">Conferência por Produto - Carga #{embarque?.numero || '000'} {rastreabilidadePaginada.length > 1 ? `(Pt. ${idx + 1})` : ''}</h1>
                                        <div className="text-[9px] flex justify-between border-b border-black pb-2 mb-2 text-black font-semibold">
                                            <div><strong>Motorista:</strong> {embarque?.responsavel?.nome}</div>
                                            <div><strong>Data Base:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString() : ''}</div>
                                        </div>

                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '40%' }}>Produto</th>
                                                    <th style={{ width: '8%', textAlign: 'center' }}>Qtde</th>
                                                    <th style={{ width: '52%' }}>Pedidos Vinculados</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {chunkRastreio.map(([nome, info]) => (
                                                    <tr key={nome}>
                                                        <td className="font-bold">{nome}</td>
                                                        <td className="text-center font-bold">{Number(info.qtde).toFixed(0)}</td>
                                                        <td className="wrap-text text-[7px]">{info.pedidos.join(', ')}</td>
                                                    </tr>
                                                ))}
                                                {chunkRastreio.length === 0 && (
                                                    <tr><td colSpan="3" style={{ textAlign: 'center' }}>Nenhum produto atrelado.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {idx < rastreabilidadePaginada.length - 1 && (
                                        <div className="w-full border-b-2 border-dashed border-gray-600 print:hidden relative h-4"></div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 px-4 py-8">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-lg shadow-sm z-10 flex-shrink-0">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center">
                        <Package className="h-5 w-5 mr-2 text-sky-600" />
                        Gerenciamento da Carga #{embarque?.numero || '...'}
                    </h3>
                    <div className="flex space-x-2">
                        <button onClick={() => setShowPreview(true)} disabled={!embarque} className="px-4 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded-md transition-colors flex items-center font-bold text-sm shadow-sm" title="Visualizar Relatório e Imprimir">
                            <Printer className="h-4 w-4 mr-2" /> Relatório Múltiplo / Imprimir
                        </button>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-white">
                    {loading ? (
                        <div className="text-center py-20 text-gray-500">Lendo escopo do caminhão...</div>
                    ) : !embarque ? (
                        <div className="text-center py-20 text-red-500">Falha ao localizar os dados.</div>
                    ) : (
                        <div>
                            <div className="flex justify-between items-start mb-6 gap-4">
                                <div className="flex-1">
                                    {editando ? (
                                        <div className="flex flex-col gap-3">
                                            <div>
                                                <label className="text-xs text-gray-500 font-medium">Data de Saída</label>
                                                <input
                                                    type="date"
                                                    value={editData.dataSaida}
                                                    onChange={e => setEditData(d => ({ ...d, dataSaida: e.target.value }))}
                                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-sky-500 focus:border-sky-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 font-medium">Motorista Responsável</label>
                                                <select
                                                    value={editData.responsavelId}
                                                    onChange={e => setEditData(d => ({ ...d, responsavelId: e.target.value }))}
                                                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-sky-500 focus:border-sky-500"
                                                >
                                                    <option value="">Selecione...</option>
                                                    {motoristas.map(m => (
                                                        <option key={m.id} value={m.id}>{m.nome}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={salvarEdicao}
                                                    disabled={salvando}
                                                    className="inline-flex items-center px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-md disabled:opacity-50"
                                                >
                                                    <Check className="h-4 w-4 mr-1" />
                                                    {salvando ? 'Salvando...' : 'Salvar'}
                                                </button>
                                                <button
                                                    onClick={() => setEditando(false)}
                                                    className="px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-md hover:bg-gray-50"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-3">
                                            <div>
                                                <p className="text-sm text-gray-500">Motorista Responsável</p>
                                                <p className="text-lg font-bold text-gray-900">{embarque.responsavel?.nome}</p>
                                                <p className="text-sm text-gray-500 mt-1">Data de Saída: {new Date(embarque.dataSaida).toLocaleDateString('pt-BR')}</p>
                                            </div>
                                            {podeEditarEmbarque && (
                                                <button
                                                    onClick={abrirEdicao}
                                                    className="mt-1 p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded-md"
                                                    title="Editar carga"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-shrink-0">
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
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo / Nº</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endereço Geográfico</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Volumes</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Retirar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {embarque.pedidos.length === 0 ? (
                                            <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">Caminhão Vazio.</td></tr>
                                        ) : embarque.pedidos.map(p => {
                                            const nomeCliente = p.cliente?.NomeFantasia || p.cliente?.Nome || '—';
                                            const prefixo = p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '';
                                            const numExibido = prefixo ? `${prefixo}${p.numero}` : (p.numero || 'S/N');
                                            const tipoCor = p.bonificacao ? 'text-green-700 bg-green-50' : p.especial ? 'text-purple-700 bg-purple-50' : 'text-gray-700';
                                            return (
                                            <tr key={p.id}>
                                                <td className="px-4 py-4 whitespace-nowrap">
                                                    <span className={`text-sm font-mono font-bold px-1.5 py-0.5 rounded ${tipoCor}`}>{numExibido}</span>
                                                </td>
                                                <td className="px-4 py-4 text-sm font-bold text-gray-900">{nomeCliente}</td>
                                                <td className="px-4 py-4 text-sm text-gray-500 max-w-xs truncate">
                                                    <MapPin className="inline h-3 w-3 mr-1 text-gray-400" />
                                                    {p.cliente?.End_Logradouro || 'N/A'}, {p.cliente?.End_Numero || 'SN'} - {p.cliente?.End_Bairro || 'N/A'} ({p.cliente?.End_Cidade || '—'})
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700 bg-gray-50">
                                                    {p.itens.reduce((acc, i) => acc + Number(i.quantidade), 0)} itens
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
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
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Amostras na Carga */}
                            {embarque.amostras && embarque.amostras.length > 0 && (
                                <div className="mt-6">
                                    <h4 className="text-sm font-bold text-orange-700 uppercase mb-2 flex items-center gap-2">
                                        <Package className="h-4 w-4" />
                                        Amostras na Carga ({embarque.amostras.length})
                                    </h4>
                                    <div className="border border-orange-200 rounded-md overflow-hidden">
                                        <table className="min-w-full divide-y divide-orange-100">
                                            <thead className="bg-orange-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Nº</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Destinatário</th>
                                                    <th className="px-6 py-3 text-center text-xs font-medium text-orange-700 uppercase tracking-wider">Itens</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-orange-700 uppercase tracking-wider">Vendedor</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-orange-700 uppercase tracking-wider">Retirar</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-orange-100">
                                                {embarque.amostras.map(a => (
                                                    <tr key={a.id}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-orange-700 font-bold">AM#{a.numero}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                            {a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '-'}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-bold text-gray-700 bg-orange-50">
                                                            {a.itens?.length || 0} {(a.itens?.length || 0) === 1 ? 'item' : 'itens'}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{a.solicitadoPor?.nome || '-'}</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                            <button
                                                                onClick={() => handleRemoverAmostra(a.id)}
                                                                disabled={removerLoader === a.id}
                                                                className="text-red-500 hover:text-red-700 disabled:opacity-50"
                                                                title="Remover amostra do embarque"
                                                            >
                                                                {removerLoader === a.id ? '...' : <Trash2 className="h-5 w-5" />}
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
        </div>
    );

};

export default DetalhesCargaModal;
