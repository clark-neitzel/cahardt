import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Plus, Trash2, MapPin, Package, Edit2, Check, History, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import embarqueService from '../../../services/embarqueService';
import AdicionarPedidosModal from './AdicionarPedidosModal';
import { useAuth } from '../../../contexts/AuthContext';
import SelectBusca from '../../../components/SelectBusca';

// Rótulos das ações do histórico de versões da carga
const ACAO_VERSAO_LABELS = {
    CRIADA: 'Carga criada',
    EDITADA: 'Dados da carga alterados',
    PEDIDOS_ADICIONADOS: 'Pedidos adicionados',
    PEDIDO_REMOVIDO: 'Pedido removido',
    AMOSTRAS_ADICIONADAS: 'Amostras adicionadas',
    AMOSTRA_REMOVIDA: 'Amostra removida',
    IMPRESSA: 'Folha impressa'
};

// Transforma o JSON de alterações de um log em linhas legíveis
const descreverAlteracoes = (log) => {
    const alt = log.alteracoes || {};
    const linhas = [];
    if (alt.dataSaida) linhas.push(`Saída: ${alt.dataSaida.de} → ${alt.dataSaida.para}`);
    if (alt.motorista && alt.motorista.de) linhas.push(`Motorista: ${alt.motorista.de} → ${alt.motorista.para}`);
    const sinal = log.acao === 'PEDIDO_REMOVIDO' || log.acao === 'AMOSTRA_REMOVIDA' ? '−' : '+';
    if (Array.isArray(alt.pedidos)) {
        alt.pedidos.forEach(p => linhas.push(`${sinal} Pedido ${p.numero}${p.cliente ? ` — ${p.cliente}` : ''}`));
    }
    if (Array.isArray(alt.amostras)) {
        alt.amostras.forEach(a => linhas.push(`${sinal} ${a.numero}${a.destinatario ? ` — ${a.destinatario}` : ''}`));
    }
    if (log.acao === 'CRIADA' && typeof alt.pedidos === 'number') {
        linhas.push(`${alt.pedidos} pedido(s) na criação${alt.motorista ? ` · Motorista: ${alt.motorista}` : ''}`);
    }
    return linhas;
};

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
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [historicoAberto, setHistoricoAberto] = useState(false);

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

    // QR da folha: identifica a carga + a versão do momento da impressão.
    // Só o leitor de dentro do app (tela do motorista) interpreta este conteúdo.
    useEffect(() => {
        if (!embarque?.id) return;
        let ativo = true;
        import('qrcode')
            .then(QRCode => QRCode.toDataURL(
                `HARDT-CARGA|${embarque.id}|${embarque.numero}|${embarque.versao || 1}`,
                { margin: 0, width: 160, errorCorrectionLevel: 'M' }
            ))
            .then(url => { if (ativo) setQrDataUrl(url); })
            .catch(() => { /* sem QR a folha continua saindo normalmente */ });
        return () => { ativo = false; };
    }, [embarque?.id, embarque?.versao, embarque?.numero]);

    const handleRemover = async (pedido) => {
        const statusLabels = {
            ENTREGUE: 'Entregue',
            ENTREGUE_PARCIAL: 'Entregue Parcialmente',
            DEVOLVIDO: 'Devolvido',
        };
        if (pedido.statusEntrega && pedido.statusEntrega !== 'PENDENTE') {
            const label = statusLabels[pedido.statusEntrega] || pedido.statusEntrega;
            alert(
                `Este pedido não pode ser removido do embarque.\n\n` +
                `Status atual: "${label}"\n\n` +
                `O motorista já registrou a entrega (ou devolução) deste pedido na rua. ` +
                `Para retirar do romaneio, primeiro desfaça a entrega no sistema.`
            );
            return;
        }

        if (!window.confirm('Tem certeza que deseja retirar essa NF do caminhão?')) return;

        try {
            setRemoverLoader(pedido.id);
            await embarqueService.removerPedido(embarqueId, pedido.id);
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
        // Carimba no servidor qual versão foi impressa (best-effort, não atrasa o print)
        embarqueService.registrarImpressao(embarqueId)
            .then(d => setEmbarque(prev => (prev ? { ...prev, ...d } : prev)))
            .catch(() => { /* registro falhou; impressão segue normal */ });
        window.print();
    };

    // Calculate Consolidado de Produtos (com qtde por pedido p/ Conferência)
    const consolidado = {};
    if (embarque && embarque.pedidos) {
        embarque.pedidos.forEach(p => {
            const prefixoImp = p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '';
            const numPedido = prefixoImp ? `${prefixoImp}${p.numero}` : (p.numero || 'N/A');
            p.itens.forEach(i => {
                const nome = i.produto?.nome || 'Produto Removido';
                if (!consolidado[nome]) consolidado[nome] = { qtde: 0, und: i.produto?.unidade || 'UN', pedidosQtde: {} };
                consolidado[nome].qtde += Number(i.quantidade);
                consolidado[nome].pedidosQtde[numPedido] = (consolidado[nome].pedidosQtde[numPedido] || 0) + Number(i.quantidade);
            });
        });
    }

    if (showPreview) {
        const CHUNK_SIZE = 55;
        const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

        const pedidosPaginados = chunkArray(embarque?.pedidos || [], CHUNK_SIZE);
        if (pedidosPaginados.length === 0) pedidosPaginados.push([]);

        const arrConsolidado = Object.entries(consolidado).sort((a, b) => a[0].localeCompare(b[0]));
        const produtosPaginados = [arrConsolidado.length > 0 ? arrConsolidado : []];
        const rastreabilidadePaginada = [arrConsolidado.length > 0 ? arrConsolidado : []];

        const numProdutos = arrConsolidado.length;

        // Separação: coluna única — adaptive pt
        // Fórmula: numProdutos × (sepQtyFont_px×1.4 + sepPadV×2) × 0.265mm ≤ 230mm
        const { sepQtyFont, sepProdFont, sepPadV } =
            numProdutos <= 28 ? { sepQtyFont: '12pt', sepProdFont: '10pt', sepPadV: 4 } :
            numProdutos <= 40 ? { sepQtyFont: '10pt', sepProdFont:  '9pt', sepPadV: 3 } :
            numProdutos <= 55 ? { sepQtyFont:  '8pt', sepProdFont:  '8pt', sepPadV: 2 } :
                                { sepQtyFont:  '7pt', sepProdFont:  '7pt', sepPadV: 1 };

        // Conferência: coluna única — adaptive px
        const { qtyFont, prodFont, confPadV } =
            numProdutos <= 22 ? { qtyFont: 14, prodFont: 10, confPadV: 4 } :
            numProdutos <= 32 ? { qtyFont: 12, prodFont:  9, confPadV: 3 } :
            numProdutos <= 45 ? { qtyFont: 10, prodFont:  8, confPadV: 2 } :
            numProdutos <= 60 ? { qtyFont:  9, prodFont:  7, confPadV: 2 } :
                                { qtyFont:  8, prodFont:  7, confPadV: 1 };
        const confPedsFont = Math.max(6, prodFont - 1);

        const amostrasEmbarque = embarque?.amostras || [];
        const hasAmostras = amostrasEmbarque.length > 0;
        const totalPages = pedidosPaginados.length + produtosPaginados.length + rastreabilidadePaginada.length + (hasAmostras ? 1 : 0);
        let globalPageCount = 1;

        return createPortal(
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
                        <style>{`
                            @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800;900&display=swap');
                            .print-container, .print-container * { font-family: 'Manrope', -apple-system, sans-serif !important; font-variant-numeric: tabular-nums; }
                            .print-container .ph { background: #1E3932; padding: 7px 12px; display: flex; align-items: center; justify-content: space-between; }
                            .print-container .ph-title { font-size: 11px; font-weight: 800; color: #fff !important; text-transform: uppercase; letter-spacing: .05em; line-height: 1.1; }
                            .print-container .ph-sub { font-size: 7px; color: #d4e9e2 !important; letter-spacing: .07em; text-transform: uppercase; margin-top: 2px; }
                            .print-container .ph-num { font-size: 17px; font-weight: 800; color: #fff !important; text-align: right; line-height: 1; }
                            .print-container .ph-numlbl { font-size: 6.5px; color: #d4e9e2 !important; letter-spacing: .08em; text-transform: uppercase; text-align: right; }
                            .print-container .ph-right { display: flex; align-items: center; gap: 10px; }
                            .print-container .ph-qr { background: #fff; padding: 3px 3px 1px; border-radius: 3px; text-align: center; }
                            .print-container .ph-qr img { width: 46px; height: 46px; display: block; }
                            .print-container .ph-qr-lbl { font-size: 6px; font-weight: 800; color: #1E3932 !important; letter-spacing: .04em; line-height: 1.4; }
                            .print-container .pi { border-bottom: 1.5px solid #1E3932; padding: 4px 0; display: flex; gap: 16px; font-size: 8px; color: #111 !important; }
                            .print-container .pi strong { font-weight: 700; }
                            .print-container table { width: 100%; border-collapse: collapse; margin-top: 5px; }
                            .print-container th { background: #1E3932 !important; color: #fff !important; font-size: 7px !important; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 4px 5px; text-align: left; border: none; }
                            .print-container td { border-bottom: 1px solid #e5e7eb; padding: 3px 5px; font-size: 8px; color: #111827 !important; line-height: 1.3; vertical-align: top; }
                            .print-container tbody tr:nth-child(even) td { background: #f9fafb; }
                            .print-container .nr { font-size: 7.5px; font-weight: 800; color: #1E3932 !important; text-align: center; white-space: nowrap; vertical-align: middle; }
                            .print-container .fn { font-weight: 700; font-size: 8px; line-height: 1.2; }
                            .print-container .rz { font-size: 6.5px; color: #6b7280 !important; line-height: 1.2; }
                            .print-container .obs-cell { font-size: 7px; color: #92400e !important; font-style: italic; line-height: 1.3; }
                            .print-container .pg { font-size: 7px; font-weight: 700; white-space: nowrap; vertical-align: middle; }
                            .print-container .vl { font-size: 8px; font-weight: 800; text-align: right; white-space: nowrap; vertical-align: middle; }
                            .print-container .pf { display: flex; gap: 12px; margin: 6px 0 8px; padding-top: 5px; border-top: 1px solid #d1d5db; }
                            .print-container .pf-f { flex: 1; }
                            .print-container .pf-l { height: 1px; background: #9ca3af; margin-bottom: 2px; }
                            .print-container .pf-lbl { font-size: 6.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #6b7280 !important; }

                            /* ── Separação: coluna única, Arial Black ── */
                            .print-container .page-sep th { font-size: 8pt !important; padding: ${sepPadV}px 6px !important; }
                            .print-container .page-sep td { padding: ${sepPadV}px 6px !important; border-bottom: 1px solid #e5e7eb; vertical-align: middle; line-height: 1; }
                            .print-container .page-sep tbody tr:nth-child(even) td { background: #f0f7f4 !important; }
                            .print-container .sep-qty { font-size: ${sepQtyFont} !important; font-weight: 900 !important; font-family: 'Arial Black', Arial, sans-serif !important; text-align: right !important; white-space: nowrap; line-height: 1 !important; color: #000 !important; }
                            .print-container .sep-prod { font-size: ${sepProdFont} !important; font-family: Arial, 'Helvetica Neue', sans-serif !important; font-weight: 700 !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000 !important; max-width: 0; }

                            /* ── Conferência: coluna única, adaptive px ── */
                            .print-container .page-conf th { font-size: 7.5px !important; padding: ${confPadV}px 6px !important; }
                            .print-container .page-conf td { font-size: ${prodFont}px !important; padding: ${confPadV}px 6px !important; line-height: 1.4; }
                            .print-container .qty-cell { font-size: ${qtyFont}px !important; font-weight: 900 !important; text-align: right !important; padding-right: 8px !important; white-space: nowrap; vertical-align: middle; }
                            .print-container .prod-cell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                            .print-container .peds-cell { font-size: ${confPedsFont}px !important; line-height: 1.7; word-break: break-word; vertical-align: top; }
                            .print-container .pk { display: inline; font-weight: 700; white-space: nowrap; }
                            .print-container .dot { color: #9ca3af !important; margin: 0 2px; }

                            @media print {
                                @page { size: A4 portrait; margin: 8mm 5mm 5mm 5mm; }
                                body > #root { display: none !important; }
                                #print-root-overlay { position: static !important; background: white !important; overflow: visible !important; }
                                .print-scroll-area { padding: 0 !important; margin: 0 !important; display: block !important; }
                                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                                .print-container { transform: scale(1) !important; margin: 0 !important; gap: 0 !important; display: block !important; }
                                /* min-height: 0 é essencial: o minHeight de 297mm (tela) somado à área útil menor
                                   da folha (margens da @page) estoura a página e gera FOLHA EM BRANCO no meio.
                                   A quebra entre folhas já é garantida pelo page-break-after. */
                                .print-page { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; height: auto !important; min-height: 0 !important; padding: 0 10mm !important; page-break-after: always; break-after: always; }
                                .print-page.page-sep, .print-page.page-conf { padding: 6mm 12mm !important; }
                                .print-page:last-child { page-break-after: auto !important; break-after: auto !important; }
                            }
                        `}</style>

                        {/* Roteiro */}
                        {pedidosPaginados.map((chunkPedidos, idx) => {
                            const thisPage = globalPageCount++;
                            return (
                                <React.Fragment key={`roteiro-${idx}`}>
                                    <div className="print-page bg-white shadow-2xl w-full text-black mx-auto relative" style={{ width: '210mm', minHeight: '297mm', padding: '0 10mm' }}>
                                        <div className="print:hidden absolute top-1 right-2 text-[7px] text-gray-400 font-bold">{thisPage}/{totalPages}</div>
                                        <div className="ph">
                                            <div>
                                                <div className="ph-title">Romaneio de Entrega{pedidosPaginados.length > 1 ? ` — Pt. ${idx + 1}` : ''}</div>
                                                <div className="ph-sub">Hardt Salgados &amp; Congelados</div>
                                            </div>
                                            <div className="ph-right">
                                                <div>
                                                    <div className="ph-num">#{embarque?.numero || '000'}</div>
                                                    <div className="ph-numlbl">Carga</div>
                                                </div>
                                                {qrDataUrl && (
                                                    <div className="ph-qr">
                                                        <img src={qrDataUrl} alt="QR da carga" />
                                                        <div className="ph-qr-lbl">v{embarque?.versao || 1}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="pi">
                                            <span><strong>Motorista:</strong> {embarque?.responsavel?.nome}</span>
                                            <span><strong>Saída:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString('pt-BR') : '—'}</span>
                                            <span><strong>NFs:</strong> {embarque?.pedidos?.length || 0}</span>
                                            <span><strong>Versão:</strong> v{embarque?.versao || 1} · confira o QR pelo app antes de sair</span>
                                        </div>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '6%', textAlign: 'center' }}>Nº</th>
                                                    <th style={{ width: '32%' }}>Cliente</th>
                                                    <th style={{ width: '26%' }}>Observação</th>
                                                    <th style={{ width: '19%' }}>Cond. Pgto</th>
                                                    <th style={{ width: '17%', textAlign: 'right' }}>Valor</th>
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
                                                            <td className="nr">{numImp}</td>
                                                            <td>
                                                                <div className="fn">{p.cliente?.NomeFantasia || p.cliente?.Nome || '—'}</div>
                                                                {p.cliente?.NomeFantasia && p.cliente?.Nome && p.cliente.NomeFantasia !== p.cliente.Nome && (
                                                                    <div className="rz">{p.cliente.Nome}</div>
                                                                )}
                                                            </td>
                                                            <td><span className="obs-cell">{p.observacoes || ''}</span></td>
                                                            <td className="pg">{pgto}</td>
                                                            <td className="vl">R$ {totalPedido.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                })}
                                                {chunkPedidos.length === 0 && (
                                                    <tr><td colSpan="5" style={{ textAlign: 'center' }}>Vazio.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                        <div className="pf">
                                            <div className="pf-f"><div className="pf-l"></div><div className="pf-lbl">Motorista / Conferência Saída</div></div>
                                            <div className="pf-f"><div className="pf-l"></div><div className="pf-lbl">Expedição / Separação</div></div>
                                            <div className="pf-f"><div className="pf-l"></div><div className="pf-lbl">Administrativo</div></div>
                                        </div>
                                    </div>
                                    <div className="w-full border-b-2 border-dashed border-gray-600 print:hidden h-4"></div>
                                </React.Fragment>
                            );
                        })}

                        {/* Amostras */}
                        {hasAmostras && (() => {
                            const thisPage = globalPageCount++;
                            return (
                                <React.Fragment key="amostras">
                                    <div className="print-page bg-white shadow-2xl w-full text-black mx-auto relative" style={{ width: '210mm', minHeight: '297mm', padding: '0 10mm' }}>
                                        <div className="print:hidden absolute top-1 right-2 text-[7px] text-gray-400 font-bold">{thisPage}/{totalPages}</div>
                                        <div className="ph">
                                            <div>
                                                <div className="ph-title">Amostras</div>
                                                <div className="ph-sub">Hardt Salgados &amp; Congelados</div>
                                            </div>
                                            <div>
                                                <div className="ph-num">#{embarque?.numero || '000'}</div>
                                                <div className="ph-numlbl">Carga</div>
                                            </div>
                                        </div>
                                        <div className="pi">
                                            <span><strong>Motorista:</strong> {embarque?.responsavel?.nome}</span>
                                            <span><strong>Saída:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString('pt-BR') : '—'}</span>
                                            <span><strong>Amostras:</strong> {amostrasEmbarque.length}</span>
                                            <span><strong>Versão:</strong> v{embarque?.versao || 1}</span>
                                        </div>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '8%' }}>Nº</th>
                                                    <th style={{ width: '30%' }}>Destinatário</th>
                                                    <th style={{ width: '37%' }}>Itens</th>
                                                    <th style={{ width: '15%' }}>Vendedor</th>
                                                    <th style={{ width: '10%', textAlign: 'center' }}>OK</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {amostrasEmbarque.map(a => (
                                                    <tr key={a.id}>
                                                        <td className="fn">AM#{a.numero}</td>
                                                        <td><div className="fn">{a.cliente?.NomeFantasia || a.cliente?.Nome || a.lead?.nomeEstabelecimento || '-'}</div></td>
                                                        <td style={{ fontSize: '7px' }}>{a.itens?.map(i => `${i.nomeProduto} (${Number(i.quantidade)}x)`).join(', ') || '-'}</td>
                                                        <td style={{ fontSize: '7px' }}>{a.solicitadoPor?.nome || '-'}</td>
                                                        <td style={{ textAlign: 'center' }}>[   ]</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="w-full border-b-2 border-dashed border-gray-600 print:hidden h-4"></div>
                                </React.Fragment>
                            );
                        })()}

                        {/* Separação — coluna única, Arial Black */}
                        {produtosPaginados.map((chunkProdutos, idx) => {
                            const thisPage = globalPageCount++;
                            return (
                                <React.Fragment key={`separacao-${idx}`}>
                                    <div className="print-page page-sep bg-white shadow-2xl w-full text-black mx-auto relative" style={{ width: '210mm', padding: '8mm 12mm' }}>
                                        <div className="print:hidden absolute top-1 right-2 text-[7px] text-gray-400 font-bold">{thisPage}/{totalPages}</div>
                                        <div className="ph">
                                            <div>
                                                <div className="ph-title">Separação de Produtos</div>
                                                <div className="ph-sub">Hardt Salgados &amp; Congelados</div>
                                            </div>
                                            <div>
                                                <div className="ph-num">#{embarque?.numero || '000'}</div>
                                                <div className="ph-numlbl">Carga</div>
                                            </div>
                                        </div>
                                        <div className="pi">
                                            <span><strong>Motorista:</strong> {embarque?.responsavel?.nome}</span>
                                            <span><strong>Saída:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString('pt-BR') : '—'}</span>
                                            <span><strong>Versão:</strong> v{embarque?.versao || 1}</span>
                                        </div>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '14%', textAlign: 'right', paddingRight: '10px' }}>Qtde</th>
                                                    <th style={{ width: '74%' }}>Produto</th>
                                                    <th style={{ width: '12%', textAlign: 'center' }}>Conf.</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {chunkProdutos.map(([nome, info]) => (
                                                    <tr key={nome}>
                                                        <td className="sep-qty">{Number(info.qtde).toFixed(info.qtde % 1 === 0 ? 0 : 2)}</td>
                                                        <td className="sep-prod" style={{ maxWidth: 0 }}>{nome}</td>
                                                        <td></td>
                                                    </tr>
                                                ))}
                                                {chunkProdutos.length === 0 && (
                                                    <tr><td colSpan="3" style={{ textAlign: 'center' }}>Nenhum produto.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                        <div className="pf">
                                            <div className="pf-f"><div className="pf-l"></div><div className="pf-lbl">Separado por</div></div>
                                            <div className="pf-f"><div className="pf-l"></div><div className="pf-lbl">Conferido por</div></div>
                                        </div>
                                    </div>
                                    <div className="w-full border-b-2 border-dashed border-gray-600 print:hidden h-4"></div>
                                </React.Fragment>
                            );
                        })}

                        {/* Conferência — qtde ANTES + pedido×qtde */}
                        {rastreabilidadePaginada.map((chunkRastreio, idx) => {
                            const thisPage = globalPageCount++;
                            const isLastPage = idx === rastreabilidadePaginada.length - 1;
                            return (
                                <React.Fragment key={`rastreio-${idx}`}>
                                    <div className="print-page page-conf bg-white shadow-2xl w-full text-black mx-auto relative" style={{ width: '210mm', padding: '8mm 12mm', ...(isLastPage ? { pageBreakAfter: 'auto', breakAfter: 'auto' } : {}) }}>
                                        <div className="print:hidden absolute top-1 right-2 text-[7px] text-gray-400 font-bold">{thisPage}/{totalPages}</div>
                                        <div className="ph">
                                            <div>
                                                <div className="ph-title">Conferência por Produto</div>
                                                <div className="ph-sub">Hardt Salgados &amp; Congelados</div>
                                            </div>
                                            <div>
                                                <div className="ph-num">#{embarque?.numero || '000'}</div>
                                                <div className="ph-numlbl">Carga</div>
                                            </div>
                                        </div>
                                        <div className="pi">
                                            <span><strong>Motorista:</strong> {embarque?.responsavel?.nome}</span>
                                            <span><strong>Saída:</strong> {embarque?.dataSaida ? new Date(embarque.dataSaida).toLocaleDateString('pt-BR') : '—'}</span>
                                            <span><strong>Versão:</strong> v{embarque?.versao || 1}</span>
                                        </div>
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '10%', textAlign: 'right', paddingRight: '8px' }}>Total</th>
                                                    <th style={{ width: '40%' }}>Produto</th>
                                                    <th style={{ width: '50%' }}>Pedidos (nº × qtde)</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {chunkRastreio.map(([nome, info]) => (
                                                    <tr key={nome}>
                                                        <td className="qty-cell">{Number(info.qtde).toFixed(0)}</td>
                                                        <td className="prod-cell" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{nome}</td>
                                                        <td className="peds-cell">
                                                            {Object.entries(info.pedidosQtde).map(([num, qtde], i, arr) => (
                                                                <React.Fragment key={num}>
                                                                    <span className="pk">{num}×{qtde}</span>
                                                                    {i < arr.length - 1 && <span className="dot"> · </span>}
                                                                </React.Fragment>
                                                            ))}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {chunkRastreio.length === 0 && (
                                                    <tr><td colSpan="3" style={{ textAlign: 'center' }}>Nenhum produto.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                        <div className="pf">
                                            <div className="pf-f"><div className="pf-l"></div><div className="pf-lbl">Conferido por</div></div>
                                            <div className="pf-f"><div className="pf-l"></div><div className="pf-lbl">Carregado por</div></div>
                                        </div>
                                    </div>
                                    {idx < rastreabilidadePaginada.length - 1 && (
                                        <div className="w-full border-b-2 border-dashed border-gray-600 print:hidden h-4"></div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-8">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="bg-sky-100 p-1.5 rounded-lg">
                            <Package className="h-4 w-4 text-sky-600" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900">
                            Gerenciamento da Carga #{embarque?.numero || '…'}
                        </h3>
                        {embarque?.versao && (
                            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-mint text-primaryDark" title="Versão atual da carga">
                                v{embarque.versao}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowPreview(true)} disabled={!embarque} className="flex items-center gap-2 px-3 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors font-semibold text-xs shadow-sm disabled:opacity-50">
                            <Printer className="h-3.5 w-3.5" /> Relatório / Imprimir
                        </button>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-white">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
                            <span className="text-sm">Lendo escopo do caminhão…</span>
                        </div>
                    ) : !embarque ? (
                        <div className="flex flex-col items-center gap-2 py-20 text-red-500">
                            <span className="text-sm font-medium">Falha ao localizar os dados.</span>
                        </div>
                    ) : (
                        <div>
                            {embarque.ultimaImpressaoVersao != null && embarque.versao > embarque.ultimaImpressaoVersao && (
                                <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <span className="font-bold">A folha impressa ficou para trás.</span>{' '}
                                        Última impressão foi da <span className="font-bold">v{embarque.ultimaImpressaoVersao}</span>
                                        {embarque.ultimaImpressaoEm ? ` (${new Date(embarque.ultimaImpressaoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ''} e a carga já está na{' '}
                                        <span className="font-bold">v{embarque.versao}</span> — reimprima o romaneio antes de o motorista sair.
                                    </div>
                                </div>
                            )}
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
                                                <SelectBusca
                                                    value={editData.responsavelId}
                                                    onChange={e => setEditData(d => ({ ...d, responsavelId: e.target.value }))}
                                                    className="mt-1 block w-full"
                                                >
                                                    <option value="">Selecione...</option>
                                                    {motoristas.map(m => (
                                                        <option key={m.id} value={m.id}>{m.nome}</option>
                                                    ))}
                                                </SelectBusca>
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

                            <div className="border border-gray-200 rounded-xl overflow-hidden">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo / Nº</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente / Obs</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cidade</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Endereço</th>
                                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Volumes</th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Retirar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {embarque.pedidos.length === 0 ? (
                                            <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">Caminhão Vazio.</td></tr>
                                        ) : embarque.pedidos.map(p => {
                                            const nomeCliente = p.cliente?.NomeFantasia || p.cliente?.Nome || '—';
                                            const prefixo = p.bonificacao ? 'BN#' : p.especial ? 'ZZ#' : '';
                                            const numExibido = prefixo ? `${prefixo}${p.numero}` : (p.numero || 'S/N');
                                            const tipoCor = p.bonificacao ? 'text-green-700 bg-green-50' : p.especial ? 'text-purple-700 bg-purple-50' : 'text-gray-700';
                                            const enderecoCompleto = [
                                                p.cliente?.End_Logradouro,
                                                p.cliente?.End_Numero || 'SN',
                                                p.cliente?.End_Bairro,
                                            ].filter(Boolean).join(', ');
                                            return (
                                            <tr key={p.id}>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`text-sm font-mono font-bold px-1.5 py-0.5 rounded ${tipoCor}`}>{numExibido}</span>
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    <div className="font-bold text-gray-900">{nomeCliente}</div>
                                                    {p.observacoes && (
                                                        <div className="text-xs text-amber-700 italic mt-0.5 leading-snug">{p.observacoes}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-semibold text-gray-800 whitespace-nowrap">
                                                    {p.cliente?.End_Cidade || '—'}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px]">
                                                    <div className="flex items-start gap-1">
                                                        <MapPin className="h-3 w-3 mt-0.5 text-gray-400 flex-shrink-0" />
                                                        <span>{enderecoCompleto || 'N/A'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-center text-sm font-bold text-gray-700 bg-gray-50">
                                                    {p.itens.reduce((acc, i) => acc + Number(i.quantidade), 0)} itens
                                                </td>
                                                <td className="px-4 py-4 whitespace-nowrap text-right text-sm">
                                                    <button
                                                        onClick={() => handleRemover(p)}
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
                                    <div className="border border-orange-200 rounded-xl overflow-hidden">
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

                            {/* Histórico de versões da carga */}
                            {embarque.versoes && embarque.versoes.length > 0 && (
                                <div className="mt-6">
                                    <button
                                        onClick={() => setHistoricoAberto(v => !v)}
                                        className="w-full flex items-center gap-2 text-left text-sm font-bold text-gray-600 uppercase tracking-wide hover:text-gray-800"
                                    >
                                        <History className="h-4 w-4" />
                                        Histórico da carga ({embarque.versoes.length})
                                        <span className="ml-auto text-xs font-medium normal-case text-gray-400">
                                            {historicoAberto ? 'ocultar' : 'ver tudo'}
                                        </span>
                                    </button>
                                    {historicoAberto && (
                                        <div className="mt-3 border border-gray-200 rounded-xl divide-y divide-gray-100">
                                            {embarque.versoes.map(log => {
                                                const linhas = descreverAlteracoes(log);
                                                const ehImpressao = log.acao === 'IMPRESSA';
                                                return (
                                                    <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                                                        <span className={`flex-shrink-0 mt-0.5 inline-flex items-center justify-center h-7 w-9 rounded-full text-[11px] font-bold ${ehImpressao ? 'bg-gray-100 text-gray-500' : 'bg-mint text-primaryDark'}`}>
                                                            v{log.versao}
                                                        </span>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                                                {ehImpressao && <Printer className="h-3.5 w-3.5 text-gray-400" />}
                                                                {ACAO_VERSAO_LABELS[log.acao] || log.acao}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {new Date(log.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                {log.alteradoPorNome ? ` · por ${log.alteradoPorNome}` : ''}
                                                            </div>
                                                            {linhas.length > 0 && (
                                                                <div className="mt-1.5 flex flex-col gap-1">
                                                                    {linhas.map((l, i) => (
                                                                        <div key={i} className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">{l}</div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
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
