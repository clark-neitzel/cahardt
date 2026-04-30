import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer, Scissors, Download, ExternalLink, X } from 'lucide-react';
import pedidoService from '../../services/pedidoService';
import amostraService from '../../services/amostraService';
import toast from 'react-hot-toast';
import qz from 'qz-tray';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
const fmtEndereco = (c) => {
    if (!c) return null;
    const parts = [c.End_Logradouro, c.End_Numero, c.End_Bairro].filter(Boolean).join(', ');
    return parts ? `${parts}${c.End_Cidade ? ` - ${c.End_Cidade}` : ''}` : null;
};

const DIGITAL_FONT = "'Share Tech Mono', 'Courier New', Courier, monospace";

// ═══════════════════════════════════════════════════════════
//  Componente de Impressão A4 (meia folha, fonte digital)
// ═══════════════════════════════════════════════════════════
const PedidoA4 = ({ pedido }) => {
    const total = pedido.itens?.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0) || 0;
    const numStr = pedido.bonificacao ? `BN#${pedido.numero}` : pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`;
    const f = (v) => ({ fontFamily: DIGITAL_FONT, ...v });

    return (
        <div className="print-page bg-white text-black" style={{ width: '210mm', padding: '5mm 10mm', fontFamily: DIGITAL_FONT }}>
            {/* Cabeçalho */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2.5px solid #000', paddingBottom: '2.5mm', marginBottom: '2.5mm' }}>
                <div>
                    <div style={{ fontSize: '17px', fontWeight: 'bold', letterSpacing: '1px' }}>HARDT SALGADOS</div>
                    <div style={{ fontSize: '13px', marginTop: '1px' }}>
                        Pedido {numStr}{pedido.especial ? '  [ESPECIAL]' : pedido.bonificacao ? '  [BONIF.]' : ''}
                    </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '11px', lineHeight: '1.5' }}>
                    <div>Emissao: {fmtData(pedido.createdAt)}</div>
                    <div>Entrega: {fmtData(pedido.dataVenda)}</div>
                    <div>Vendedor: {pedido.vendedor?.nome || pedido.usuarioLancamento?.nome || '-'}</div>
                </div>
            </div>

            {/* Dados do cliente — 1 linha compacta */}
            <div style={{ fontSize: '11px', lineHeight: '1.5', marginBottom: '2mm', borderBottom: '1px solid #aaa', paddingBottom: '2mm' }}>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <span><strong>Cliente:</strong> {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || '-'}</span>
                    {pedido.cliente?.NomeFantasia && pedido.cliente?.Nome && pedido.cliente.NomeFantasia !== pedido.cliente.Nome && (
                        <span style={{ fontSize: '10px', color: '#444' }}>({pedido.cliente.Nome})</span>
                    )}
                    {(pedido.cliente?.Celular || pedido.cliente?.Telefone) && (
                        <span>Fone: {pedido.cliente?.Celular || pedido.cliente?.Telefone}</span>
                    )}
                </div>
                {fmtEndereco(pedido.cliente) && (
                    <div style={{ fontSize: '10px', color: '#333' }}>End.: {fmtEndereco(pedido.cliente)}</div>
                )}
            </div>

            {/* Tabela de itens */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', fontFamily: DIGITAL_FONT }}>
                <thead>
                    <tr style={{ backgroundColor: '#e5e7eb' }}>
                        <th style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'left', width: '55%', fontFamily: DIGITAL_FONT }}>Produto</th>
                        <th style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', width: '10%', fontFamily: DIGITAL_FONT }}>Qtd</th>
                        <th style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', width: '17%', fontFamily: DIGITAL_FONT }}>Vl. Unit.</th>
                        <th style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right', width: '18%', fontFamily: DIGITAL_FONT }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {pedido.itens?.map((item, idx) => {
                        const subtotal = Number(item.valor) * Number(item.quantidade);
                        return (
                            <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                <td style={{ border: '1px solid #ccc', padding: '3px 5px', fontWeight: 'bold', fontFamily: DIGITAL_FONT }}>{item.produto?.nome || item.nomeProduto || '-'}</td>
                                <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'center', fontFamily: DIGITAL_FONT }}>{Number(item.quantidade)}</td>
                                <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'right', fontFamily: DIGITAL_FONT }}>R$ {fmt(item.valor)}</td>
                                <td style={{ border: '1px solid #ccc', padding: '3px 5px', textAlign: 'right', fontWeight: 'bold', fontFamily: DIGITAL_FONT }}>R$ {fmt(subtotal)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Rodapé */}
            <div style={{ marginTop: '2.5mm', borderTop: '2.5px solid #000', paddingTop: '2.5mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '11px', fontFamily: DIGITAL_FONT }}>
                <div style={{ lineHeight: '1.6' }}>
                    <div><strong>Cond.:</strong> {pedido.nomeCondicaoPagamento || '-'}{pedido.qtdParcelas > 1 ? `  ${pedido.qtdParcelas}x` : ''}{pedido.primeiroVencimento ? `  | 1o Venc.: ${fmtData(pedido.primeiroVencimento)}` : ''}</div>
                    {pedido.observacoes && <div style={{ fontStyle: 'italic' }}>Obs: {pedido.observacoes}</div>}
                    <div style={{ fontSize: '10px', color: '#555' }}>Itens: {pedido.itens?.length || 0}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px', fontFamily: DIGITAL_FONT }}>TOTAL: R$ {fmt(total)}</div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
//  Componente de Impressão Cupom Térmico (80mm)
// ═══════════════════════════════════════════════════════════
const PedidoCupom = ({ pedido, isLast }) => {
    const total = pedido.itens?.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0) || 0;
    const numStr = pedido.bonificacao ? `BN#${pedido.numero}` : pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`;
    const sep = '━'.repeat(26);

    return (
        <div className="print-page bg-white text-black" style={{ width: '80mm', padding: '4mm 5mm', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '15px', lineHeight: '1.5' }}>
            <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
                <p style={{ fontSize: '18px', fontWeight: '900', margin: 0 }}>Pedido {numStr}</p>
                {pedido.especial && <p style={{ fontSize: '13px', fontWeight: 'bold', margin: '2px 0' }}>PEDIDO ESPECIAL</p>}
            </div>

            <p style={{ margin: '1mm 0', textAlign: 'center', fontSize: '11px' }}>{sep}</p>

            <div style={{ fontSize: '14px', marginBottom: '3mm' }}>
                <p style={{ margin: '3px 0' }}><strong>Cliente:</strong> {pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || '-'}</p>
                {fmtEndereco(pedido.cliente) && (
                    <p style={{ margin: '3px 0', fontSize: '12px' }}><strong>End.:</strong> {fmtEndereco(pedido.cliente)}</p>
                )}
                <p style={{ margin: '3px 0' }}><strong>Emissao:</strong> {fmtData(pedido.createdAt)}</p>
                <p style={{ margin: '3px 0' }}><strong>Entrega:</strong> {fmtData(pedido.dataVenda)}</p>
                <p style={{ margin: '3px 0' }}><strong>Vendedor:</strong> {pedido.vendedor?.nome || '-'}</p>
            </div>

            <p style={{ margin: '1mm 0', textAlign: 'center', fontSize: '11px' }}>{sep}</p>

            {/* Itens */}
            <div style={{ fontSize: '14px' }}>
                {pedido.itens?.map((item, idx) => {
                    const subtotal = Number(item.valor) * Number(item.quantidade);
                    return (
                        <div key={idx} style={{ marginBottom: '3mm' }}>
                            <p style={{ margin: 0, fontWeight: '900', fontSize: '15px' }}>{item.produto?.nome || item.nomeProduto || '-'}</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                                <span>{Number(item.quantidade)} x R$ {fmt(item.valor)}</span>
                                <span style={{ fontWeight: '900' }}>R$ {fmt(subtotal)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <p style={{ margin: '1mm 0', textAlign: 'center', fontSize: '11px' }}>{sep}</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '20px', margin: '2mm 0' }}>
                <span>TOTAL</span>
                <span>R$ {fmt(total)}</span>
            </div>

            <p style={{ margin: '1mm 0', textAlign: 'center', fontSize: '11px' }}>{sep}</p>

            <div style={{ fontSize: '13px' }}>
                <p style={{ margin: '3px 0' }}><strong>Cond.:</strong> {pedido.nomeCondicaoPagamento || '-'}</p>
                <p style={{ margin: '3px 0' }}><strong>Parcelas:</strong> {pedido.qtdParcelas || 1}x</p>
                {pedido.observacoes && <p style={{ margin: '4px 0', fontStyle: 'italic' }}>Obs: {pedido.observacoes}</p>}
            </div>

            <p style={{ margin: '3mm 0 0 0', textAlign: 'center', fontSize: '10px', color: '#888' }}>
                {pedido.itens?.length} ite{pedido.itens?.length === 1 ? 'm' : 'ns'} | {new Date().toLocaleString('pt-BR')}
            </p>

            {/* Separador de corte entre pedidos no lote */}
            {!isLast && (
                <div data-corte style={{ margin: '5mm 0 3mm 0', textAlign: 'center', borderTop: '2px dashed #000', paddingTop: '2mm' }}>
                    <span style={{ fontSize: '11px', letterSpacing: '2px' }}>- - - CORTE AQUI - - -</span>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
//  Componente de Impressão Amostra A4
// ═══════════════════════════════════════════════════════════
const AmostraA4 = ({ amostra }) => {
    return (
        <div className="print-page bg-white text-black" style={{ width: '210mm', minHeight: '148mm', padding: '8mm 12mm' }}>
            <div style={{ borderBottom: '2px solid #000', paddingBottom: '4mm', marginBottom: '4mm' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>HARDT SALGADOS</h1>
                        <p style={{ fontSize: '11px', margin: '2px 0 0 0' }}>Amostra AM#{amostra.numero}</p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '9px' }}>
                        <p style={{ margin: 0 }}><strong>Data:</strong> {fmtData(amostra.createdAt)}</p>
                        <p style={{ margin: 0 }}><strong>Entrega:</strong> {fmtData(amostra.dataEntrega)}</p>
                        <p style={{ margin: 0 }}><strong>Solicitado por:</strong> {amostra.solicitadoPor?.nome || '-'}</p>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: '4mm', fontSize: '10px' }}>
                <p style={{ margin: '1px 0' }}><strong>Destinatário:</strong> {amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || '-'}</p>
                {fmtEndereco(amostra.cliente) && (
                    <p style={{ margin: '1px 0', fontSize: '9px', color: '#555' }}>
                        <strong>Endereço:</strong> {fmtEndereco(amostra.cliente)}
                    </p>
                )}
                {(amostra.cliente?.Celular || amostra.cliente?.Telefone) && (
                    <p style={{ margin: '1px 0', fontSize: '9px', color: '#555' }}>
                        <strong>Telefone:</strong> {amostra.cliente?.Celular || amostra.cliente?.Telefone}
                    </p>
                )}
                {amostra.observacao && <p style={{ margin: '3px 0', fontStyle: 'italic' }}><strong>Obs:</strong> {amostra.observacao}</p>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                        <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'left', width: '60%' }}>Produto</th>
                        <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', width: '20%' }}>Qtd</th>
                        <th style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', width: '20%' }}>Conferido</th>
                    </tr>
                </thead>
                <tbody>
                    {amostra.itens?.map((item, idx) => (
                        <tr key={idx}>
                            <td style={{ border: '1px solid #ccc', padding: '3px 6px', fontWeight: 'bold' }}>{item.nomeProduto || item.produto?.nome || '-'}</td>
                            <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'center' }}>{Number(item.quantidade)}</td>
                            <td style={{ border: '1px solid #ccc', padding: '3px 6px', textAlign: 'center' }}>[ ]</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ marginTop: '4mm', fontSize: '9px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{amostra.itens?.length} ite{amostra.itens?.length === 1 ? 'm' : 'ns'}</span>
                <span>Status: {amostra.status}</span>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
//  Componente de Impressão Amostra Cupom (80mm)
// ═══════════════════════════════════════════════════════════
const AmostraCupom = ({ amostra }) => {
    const sep = '─'.repeat(32);

    return (
        <div className="print-page bg-white text-black" style={{ width: '80mm', padding: '3mm 4mm', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', lineHeight: '1.4' }}>
            <div style={{ textAlign: 'center', marginBottom: '2mm' }}>
                <p style={{ fontSize: '15px', fontWeight: 'bold', margin: 0 }}>Amostra AM#{amostra.numero}</p>
            </div>

            <p style={{ margin: '1mm 0', textAlign: 'center', fontSize: '10px', color: '#666' }}>{sep}</p>

            <div style={{ fontSize: '12px', marginBottom: '2mm' }}>
                <p style={{ margin: '2px 0' }}><strong>Dest.:</strong> {amostra.cliente?.NomeFantasia || amostra.cliente?.Nome || amostra.lead?.nomeEstabelecimento || '-'}</p>
                {fmtEndereco(amostra.cliente) && (
                    <p style={{ margin: '2px 0', fontSize: '11px' }}><strong>End.:</strong> {fmtEndereco(amostra.cliente)}</p>
                )}
                <p style={{ margin: '2px 0' }}><strong>Data:</strong> {fmtData(amostra.createdAt)}</p>
                <p style={{ margin: '2px 0' }}><strong>Vendedor:</strong> {amostra.solicitadoPor?.nome || '-'}</p>
                {amostra.observacao && <p style={{ margin: '2px 0', fontStyle: 'italic' }}>Obs: {amostra.observacao}</p>}
            </div>

            <p style={{ margin: '1mm 0', textAlign: 'center', fontSize: '10px', color: '#666' }}>{sep}</p>

            <div style={{ fontSize: '13px' }}>
                {amostra.itens?.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span>{item.nomeProduto || '-'}</span>
                        <span style={{ fontWeight: 'bold' }}>{Number(item.quantidade)}x</span>
                    </div>
                ))}
            </div>

            <p style={{ margin: '1mm 0', textAlign: 'center', fontSize: '10px', color: '#666' }}>{sep}</p>
            <p style={{ margin: 0, textAlign: 'center', fontSize: '9px', color: '#888' }}>
                {amostra.itens?.length} ite{amostra.itens?.length === 1 ? 'm' : 'ns'} | {new Date().toLocaleString('pt-BR')}
            </p>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════
//  Página Principal de Impressão
// ═══════════════════════════════════════════════════════════
const ImpressaoPedido = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const printRef = useRef();

    const tipo = searchParams.get('tipo') || 'pedido'; // 'pedido' | 'amostra'
    const batchIds = searchParams.get('ids'); // Para impressão em lote: ids=id1,id2,id3
    const [formato, setFormato] = useState(batchIds ? 'cupom' : 'a4'); // lote default cupom
    const [data, setData] = useState(null);
    const [batchData, setBatchData] = useState([]);
    const [loading, setLoading] = useState(true);

    const isBatch = !!batchIds;

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                if (isBatch) {
                    const ids = batchIds.split(',').filter(Boolean);
                    const results = await Promise.all(ids.map(pid => pedidoService.detalhar(pid)));
                    setBatchData(results.filter(Boolean));
                } else if (tipo === 'amostra') {
                    const res = await amostraService.buscarPorId(id);
                    setData(res);
                } else {
                    const res = await pedidoService.detalhar(id);
                    setData(res);
                }
            } catch (err) {
                toast.error('Erro ao carregar dados para impressão.');
                navigate(-1);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id, tipo, batchIds]);

    // Medir altura em mm de um elemento para cupom
    const measureHeightMm = (el) => {
        const clone = el.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.width = '80mm';
        document.body.appendChild(clone);
        const h = clone.scrollHeight;
        document.body.removeChild(clone);
        return Math.ceil(h / 3.7795) + 15;
    };

    // Gerar HTML completo para impressão
    const buildHtml = (bodyHtml, isCupom, heightMm, extraCss = '') => `<html>
        <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet">
        <style>
            @media print {
                @page { ${isCupom ? `size: 80mm ${heightMm}mm;` : 'size: A4 portrait;'} ${isCupom ? 'margin: 0;' : 'margin: 6mm 8mm;'} }
                body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; ${isCupom ? 'width: 80mm; max-width: 80mm; overflow: hidden;' : ''} }
                * { color: #000 !important; }
                ${extraCss}
            }
            body { margin: 0; padding: 0; font-family: 'Share Tech Mono', 'Courier New', monospace; color: #000; ${isCupom ? 'width: 80mm;' : ''} }
            ${extraCss}
            table { width: 100%; border-collapse: collapse; font-family: 'Share Tech Mono', 'Courier New', monospace; }
            th, td { color: #000; font-family: 'Share Tech Mono', 'Courier New', monospace; }
        </style></head>
        <body>${bodyHtml}</body></html>`;

    const [qzDisponivel, setQzDisponivel] = useState(false);
    const [qzImpressora, setQzImpressora] = useState(null);
    const [imprimindo, setImprimindo] = useState(false);
    const [mostrarAjudaQz, setMostrarAjudaQz] = useState(false);

    // Tentar conectar ao QZ Tray na montagem
    useEffect(() => {
        const conectarQz = async () => {
            try {
                if (!qz.websocket.isActive()) {
                    // Desabilitar verificação de certificado para uso local
                    qz.security.setCertificatePromise(() => Promise.resolve(''));
                    qz.security.setSignaturePromise(() => () => Promise.resolve(''));
                    await qz.websocket.connect();
                }
                // Buscar impressora padrão
                const impressora = await qz.printers.getDefault();
                setQzImpressora(impressora);
                setQzDisponivel(true);
            } catch {
                setQzDisponivel(false);
            }
        };
        conectarQz();
        return () => {
            // Não desconectar — reutilizar conexão entre navegações
        };
    }, []);

    // Gerar dados ESC/POS para um pedido
    const gerarEscPos = (pedido) => {
        const total = pedido.itens?.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0) || 0;
        const numStr = pedido.bonificacao ? `BN#${pedido.numero}` : pedido.especial ? `ZZ#${pedido.numero}` : `#${pedido.numero}`;
        const sep = ''.padStart(42, '-');
        const ESC = '\x1B';
        const GS = '\x1D';

        let dados = [];

        // Inicializar impressora
        dados.push(ESC + '@');
        // Centralizar
        dados.push(ESC + 'a' + '\x01');
        // Negrito + tamanho duplo
        dados.push(ESC + 'E' + '\x01');
        dados.push(GS + '!' + '\x11'); // Largura e altura dupla
        dados.push(`Pedido ${numStr}\n`);
        // Voltar ao normal
        dados.push(GS + '!' + '\x00');

        if (pedido.especial) {
            dados.push(ESC + 'E' + '\x01');
            dados.push('PEDIDO ESPECIAL\n');
            dados.push(ESC + 'E' + '\x00');
        }

        // Alinhar à esquerda
        dados.push(ESC + 'a' + '\x00');
        dados.push(sep + '\n');

        // Dados do cliente
        dados.push(`Cliente: ${pedido.cliente?.NomeFantasia || pedido.cliente?.Nome || '-'}\n`);
        dados.push(`Emissao: ${fmtData(pedido.createdAt)}\n`);
        dados.push(`Entrega: ${fmtData(pedido.dataVenda)}\n`);
        dados.push(`Vendedor: ${pedido.vendedor?.nome || '-'}\n`);
        dados.push(sep + '\n');

        // Itens
        pedido.itens?.forEach(item => {
            const subtotal = Number(item.valor) * Number(item.quantidade);
            const nome = (item.produto?.nome || item.nomeProduto || '-').substring(0, 30);
            dados.push(ESC + 'E' + '\x01');
            dados.push(`${nome}\n`);
            dados.push(ESC + 'E' + '\x00');
            const qtdPreco = `${Number(item.quantidade)} x R$ ${fmt(item.valor)}`;
            const subStr = `R$ ${fmt(subtotal)}`;
            const pad = Math.max(0, 42 - qtdPreco.length - subStr.length);
            dados.push(qtdPreco + ' '.repeat(pad) + subStr + '\n');
        });

        dados.push(sep + '\n');

        // Total — tamanho duplo centralizado
        dados.push(ESC + 'a' + '\x01');
        dados.push(ESC + 'E' + '\x01');
        dados.push(GS + '!' + '\x11');
        dados.push(`TOTAL R$ ${fmt(total)}\n`);
        dados.push(GS + '!' + '\x00');
        dados.push(ESC + 'E' + '\x00');

        // Voltar esquerda
        dados.push(ESC + 'a' + '\x00');
        dados.push(sep + '\n');

        // Condição de pagamento
        dados.push(`Cond.: ${pedido.nomeCondicaoPagamento || '-'}\n`);
        dados.push(`Parcelas: ${pedido.qtdParcelas || 1}x\n`);
        if (pedido.observacoes) {
            dados.push(`Obs: ${pedido.observacoes}\n`);
        }

        // Rodapé
        dados.push(ESC + 'a' + '\x01');
        const qtdItens = pedido.itens?.length || 0;
        dados.push(`${qtdItens} ite${qtdItens === 1 ? 'm' : 'ns'} | ${new Date().toLocaleString('pt-BR')}\n`);
        dados.push(ESC + 'a' + '\x00');

        // Avançar papel e CORTAR
        dados.push('\n\n\n');
        dados.push(GS + 'V' + '\x00'); // Corte total

        return dados;
    };

    // Impressão via QZ Tray (ESC/POS com corte)
    const handlePrintQz = async () => {
        setImprimindo(true);
        try {
            const pedidos = isBatch ? batchData : [data];
            const config = qz.configs.create(qzImpressora, { encoding: 'Cp860' });

            for (let i = 0; i < pedidos.length; i++) {
                const dados = gerarEscPos(pedidos[i]);
                await qz.print(config, dados);
            }

            toast.success(`${pedidos.length} cupom${pedidos.length > 1 ? 'ns' : ''} impresso${pedidos.length > 1 ? 's' : ''} com corte!`);
        } catch (err) {
            console.error('Erro QZ Tray:', err);
            toast.error('Erro ao imprimir via QZ Tray. Tente o modo normal.');
        } finally {
            setImprimindo(false);
        }
    };

    // Impressão via browser (fallback sem corte)
    const handlePrintBrowser = () => {
        const content = printRef.current;
        const isCupom = formato === 'cupom';

        if (isCupom) {
            const pages = content.querySelectorAll('.print-page');
            let allHtml = '';
            let totalHeight = 0;
            pages.forEach(page => {
                const pageClone = page.cloneNode(true);
                const corteDiv = pageClone.querySelector('[data-corte]');
                if (corteDiv) corteDiv.remove();
                allHtml += pageClone.outerHTML;
                totalHeight += measureHeightMm(page);
            });

            const html = buildHtml(allHtml, true, totalHeight);
            const w = window.open('', '', 'height=800,width=800');
            w.document.write(html);
            w.document.close();
            w.focus();
            setTimeout(() => { w.print(); w.close(); }, 400);
        } else {
            const pageBreak = isBatch
                ? '.print-page { page-break-after: always; } .print-page:last-child { page-break-after: auto; }'
                : '';
            const html = buildHtml(content.innerHTML, false, 'auto', pageBreak);

            const w = window.open('', '', 'height=800,width=800');
            w.document.write(html);
            w.document.close();
            w.focus();
            setTimeout(() => { w.print(); w.close(); }, 400);
        }
    };

    const handlePrint = () => {
        // Cupom com QZ Tray disponível → impressão direta com corte
        if (formato === 'cupom' && qzDisponivel && qzImpressora) {
            handlePrintQz();
        } else {
            handlePrintBrowser();
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen bg-gray-800">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
            </div>
        );
    }

    if (!isBatch && !data) return null;
    if (isBatch && batchData.length === 0) return null;

    const renderContent = () => {
        if (isBatch) {
            return batchData.map((pedido, idx) => (
                <React.Fragment key={pedido.id}>
                    {formato === 'cupom'
                        ? <PedidoCupom pedido={pedido} isLast={idx === batchData.length - 1} />
                        : <PedidoA4 pedido={pedido} />
                    }
                </React.Fragment>
            ));
        }
        if (tipo === 'amostra') {
            return formato === 'cupom' ? <AmostraCupom amostra={data} /> : <AmostraA4 amostra={data} />;
        }
        return formato === 'cupom' ? <PedidoCupom pedido={data} isLast={true} /> : <PedidoA4 pedido={data} />;
    };

    const titulo = isBatch
        ? `Lote: ${batchData.length} pedidos`
        : tipo === 'amostra'
            ? `Amostra AM#${data.numero}`
            : `Pedido ${data.especial ? 'ZZ' : ''}#${data.numero}`;

    return (
        <div className="fixed inset-0 z-[9999] bg-gray-800 overflow-y-auto flex flex-col">
            {/* Barra de ações */}
            <div className="sticky top-0 z-10 w-full bg-gray-900 border-b border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-between shadow-2xl flex-shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white p-1">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <h3 className="text-white font-bold text-sm sm:text-base truncate">
                        {titulo}
                    </h3>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Toggle formato */}
                    <div className="flex bg-gray-700 rounded-md overflow-hidden text-xs font-medium">
                        <button
                            onClick={() => setFormato('a4')}
                            className={`px-3 py-1.5 transition-colors ${formato === 'a4' ? 'bg-sky-600 text-white' : 'text-gray-300 hover:text-white'}`}
                        >
                            A4
                        </button>
                        <button
                            onClick={() => setFormato('cupom')}
                            className={`px-3 py-1.5 transition-colors ${formato === 'cupom' ? 'bg-sky-600 text-white' : 'text-gray-300 hover:text-white'}`}
                        >
                            Cupom
                        </button>
                    </div>
                    {/* Indicador QZ Tray */}
                    {formato === 'cupom' && (
                        <button
                            onClick={() => !qzDisponivel && setMostrarAjudaQz(true)}
                            className={`hidden sm:flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors ${qzDisponivel ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300 hover:bg-yellow-800/60 cursor-pointer'}`}
                        >
                            <Scissors className="w-3 h-3" />
                            <span>{qzDisponivel ? 'Auto-corte ativo' : 'Ativar corte'}</span>
                        </button>
                    )}
                    <button
                        onClick={handlePrint}
                        disabled={imprimindo}
                        className={`px-3 sm:px-5 py-2 rounded-md flex items-center shadow-lg text-xs sm:text-sm font-bold transition-all ${imprimindo ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500 text-white'}`}
                    >
                        <Printer className="w-4 h-4 mr-1 sm:mr-2" />
                        {imprimindo ? 'Imprimindo...' : (
                            <>
                                <span className="hidden sm:inline">Imprimir{formato === 'cupom' && qzDisponivel ? ' c/ corte' : ''}</span>
                                <span className="sm:hidden">Imprimir</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Banner quando cupom em lote sem QZ Tray */}
            {formato === 'cupom' && isBatch && !qzDisponivel && (
                <div className="w-full bg-yellow-900/60 border-b border-yellow-700/50 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-yellow-200 text-xs">
                        <Scissors className="w-4 h-4 flex-shrink-0" />
                        <span>Para corte automatico entre pedidos, instale o <strong>QZ Tray</strong> neste computador.</span>
                    </div>
                    <button
                        onClick={() => setMostrarAjudaQz(true)}
                        className="text-yellow-300 hover:text-yellow-100 text-xs font-bold underline whitespace-nowrap ml-2"
                    >
                        Como instalar
                    </button>
                </div>
            )}

            {/* Modal de instruções QZ Tray */}
            {mostrarAjudaQz && (
                <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4" onClick={() => setMostrarAjudaQz(false)}>
                    <div className="bg-gray-800 rounded-xl border border-gray-600 max-w-md w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                <Scissors className="w-5 h-5 text-green-400" />
                                Ativar Corte Automatico
                            </h3>
                            <button onClick={() => setMostrarAjudaQz(false)} className="text-gray-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4 text-sm text-gray-300">
                            <p>O <strong className="text-white">QZ Tray</strong> e um programa gratuito que permite o sistema enviar comandos direto para a impressora termica, incluindo o comando de corte entre cada pedido.</p>

                            <div className="bg-gray-900 rounded-lg p-4 space-y-3">
                                <div className="flex items-start gap-3">
                                    <span className="bg-sky-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                                    <div>
                                        <p className="font-medium text-white">Baixe o QZ Tray</p>
                                        <p className="text-xs text-gray-400 mt-1">Acesse <strong>qz.io/download</strong> e baixe o instalador para Windows</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="bg-sky-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                                    <div>
                                        <p className="font-medium text-white">Instale e execute</p>
                                        <p className="text-xs text-gray-400 mt-1">Execute o instalador. O QZ Tray vai aparecer na bandeja do sistema (perto do relogio)</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="bg-sky-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                                    <div>
                                        <p className="font-medium text-white">Recarregue esta pagina</p>
                                        <p className="text-xs text-gray-400 mt-1">Atualize a pagina (F5) e o indicador vai mudar para <span className="text-green-400 font-medium">Auto-corte ativo</span></p>
                                    </div>
                                </div>
                            </div>

                            <p className="text-xs text-gray-500">O QZ Tray e open source e gratuito. Precisa do Java instalado. Funciona com Epson, Bematech, Elgin e outras impressoras termicas.</p>
                        </div>

                        <div className="mt-5 flex gap-2">
                            <button
                                onClick={() => setMostrarAjudaQz(false)}
                                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview area */}
            <div className="flex-1 w-full flex flex-col items-center py-6 sm:py-8 gap-6">
                <div
                    ref={printRef}
                    className={`transform origin-top transition-transform ${
                        formato === 'cupom'
                            ? 'scale-[0.85] sm:scale-100'
                            : 'scale-[0.45] sm:scale-75 md:scale-100'
                    } ${isBatch ? 'flex flex-col gap-6' : ''}`}
                >
                    <style>{`
                        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
                        .print-page table { width: 100%; border-collapse: collapse; }
                        .print-page { box-shadow: 0 4px 30px rgba(0,0,0,0.4); }
                        @media print {
                            .print-page { box-shadow: none !important; }
                        }
                    `}</style>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default ImpressaoPedido;
