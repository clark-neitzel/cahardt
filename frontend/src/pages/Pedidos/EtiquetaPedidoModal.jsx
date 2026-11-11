import { useEffect, useMemo, useRef, useState } from 'react';
import { X, AlertTriangle, Minus, Plus, Loader2 } from 'lucide-react';
import ImprimirDireto from '../PCP/ImprimirDireto';
import { useEscalaPreview } from '../PCP/OrientacaoEtiqueta';
import { imprimirNaPagina } from '../../utils/imprimirNaPagina';
import CampoNumero from '../../components/CampoNumero';
import amostraService from '../../services/amostraService';
import pedidoService from '../../services/pedidoService';
import { carregarFontesFuncionario } from '../RH/etiquetasFuncionario';
import { deAmostra, dePedido, montarEtiquetaPedido, prepararEtiquetaPedido } from './etiquetaPedido';

// Etiqueta 100 × 120 do PEDIDO (normal, especial, bonificação) ou da AMOSTRA (rolo grande da Zebra).
// Props: `pedido` OU `amostra` = registro do card (resumido). O modal busca o completo ao abrir
// (endereço, telefone, observação, unidades) e, enquanto carrega, monta a prévia com o que já tem.
// Pedido grande sai em várias etiquetas (1/2, 2/2…) — nunca esconde item. Cópias vão embutidas na
// `sequencia` (1,2,1,2…), nunca em `copias` (o servidor recusa as duas juntas).
const BTN_MAIS_MENOS = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-50';

export default function EtiquetaPedidoModal({ pedido, amostra, onClose, onStatus }) {
    const ehAmostra = !!amostra;
    const registro = amostra || pedido;
    const [completa, setCompleta] = useState(null);
    const [erro, setErro] = useState('');
    const [copias, setCopias] = useState(1);
    const [fontesOk, setFontesOk] = useState(false);
    const statusAvisado = useRef(false); // avança o status de amostra uma só vez por abertura
    const completaRef = useRef(null);
    completaRef.current = completa;

    useEffect(() => { let vivo = true; carregarFontesFuncionario().then(() => vivo && setFontesOk(true)); return () => { vivo = false; }; }, []);
    useEffect(() => {
        let vivo = true;
        setCompleta(null); setErro('');
        if (!registro?.id) return undefined;
        const busca = ehAmostra ? amostraService.buscarPorId(registro.id) : pedidoService.detalhar(registro.id);
        busca
            .then((r) => { if (vivo) setCompleta(r); })
            .catch(() => { if (vivo) setErro('Não deu para carregar o endereço e a observação. A etiqueta sai só com o que está na lista.'); });
        return () => { vivo = false; };
    }, [registro?.id, ehAmostra]);

    const fonte = completa || registro;
    const dados = useMemo(() => (ehAmostra ? deAmostra(fonte) : dePedido(fonte)), [fonte, ehAmostra]);
    const qtd = Math.max(1, Math.min(99, parseInt(copias, 10) || 1));
    const montada = useMemo(() => montarEtiquetaPedido(dados), [dados, fontesOk]); // eslint-disable-line react-hooks/exhaustive-deps
    const paginas = montada.paginas;
    const total = paginas * qtd;
    const [refPrev, escala] = useEscalaPreview(100, 1.25);

    // preview: o CSS da etiqueta é escopado no id do preview (nunca vaza para o app)
    const clsPrev = 'prev-etq-pedido';
    const cssPrev = useMemo(() => montada.estilos
        .replace(/@page\s*{[^}]*}/g, '')
        .replace(/html\.modo-impressao[^{]*{[^}]*}/g, '')
        .replaceAll('#area-impressao', `.${clsPrev}`), [montada]);

    const numero = dados.numeroTxt;
    const nome = dados.nome;
    const rotulo = `${ehAmostra ? 'Amostra' : 'Pedido'} ${numero} — ${nome}`;

    // Só amostra SOLICITADA avança para PREPARACAO. Falha aqui NUNCA atrapalha a impressão.
    const aoImprimir = () => {
        if (!ehAmostra || statusAvisado.current || !amostra?.id) return;
        const statusAtual = (completaRef.current || amostra).status;
        if (statusAtual !== 'SOLICITADA') return;
        statusAvisado.current = true;
        amostraService.marcarEtiquetaImpressa(amostra.id)
            .then((r) => { if (r?.status && onStatus) onStatus(r.status); })
            .catch(() => { /* o status pode ser avançado depois pelo botão da lista */ });
    };

    const imprimirNavegador = () => {
        // a Zebra grande é configurada em paisagem: página 120×100 e a etiqueta (100×120) girada 90°
        const estilos = `
            @page { size: 120mm 100mm; margin: 0; }
            html.modo-impressao #area-impressao { width: 120mm !important; max-width: none !important; margin: 0 !important; }
            ${montada.estilos}
            #area-impressao .pg { width: 119.7mm; height: 99.7mm; display: flex; align-items: center; justify-content: center; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
            #area-impressao .pg + .pg { break-before: page; page-break-before: always; }
            #area-impressao .pg > .etq { transform: rotate(90deg); flex: 0 0 auto; }
        `;
        // ordem 1,2,1,2… (cada cópia completa o conjunto)
        const folhas = [];
        for (let c = 0; c < qtd; c++) montada.etiquetas.forEach((h) => folhas.push(`<div class="pg">${h}</div>`));
        imprimirNaPagina(estilos, folhas.join(''));
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
            <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Etiqueta {ehAmostra ? 'da amostra' : 'do pedido'} · 100 × 120 mm</p>
                        <p className="text-sm text-gray-600 truncate">{numero} — {nome}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                <div className="p-4 space-y-4">
                    {!completa && !erro && (
                        <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando endereço e observação…</div>
                    )}
                    {erro && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>{erro}</span>
                        </div>
                    )}
                    {paginas > 1 && (
                        <div data-aviso-paginas className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            <span>Esta impressão sai em <b>{paginas} etiquetas</b> (são {dados.itens.length} itens). Cole todas na mesma caixa.</span>
                        </div>
                    )}
                    {montada.itensFora > 0 && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>Pedido grande demais: {montada.itensFora} itens não cabem nas etiquetas. Confira pelo pedido impresso.</span>
                        </div>
                    )}
                    {montada.cortouNome && (
                        <div data-aviso-nome-cortado className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>Algum nome é muito longo e sai abreviado ("…") na etiqueta. Confira na prévia.</span>
                        </div>
                    )}
                    {montada.cortouObs && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>A observação é longa e pode sair cortada na etiqueta.</span>
                        </div>
                    )}

                    <div ref={refPrev} className="bg-gray-100 rounded-xl p-2 md:p-4 flex flex-col items-center gap-3 overflow-hidden">
                        <style>{cssPrev}</style>
                        {montada.etiquetas.map((html, i) => (
                            <div key={i} style={{ width: `${100 * (96 / 25.4) * escala}px`, height: `${120 * (96 / 25.4) * escala}px` }}>
                                <div style={{ transform: `scale(${escala})`, transformOrigin: 'top left', width: '100mm' }}>
                                    <div className={`bg-white shadow-sm ${clsPrev}`} dangerouslySetInnerHTML={{ __html: html }} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 text-center -mt-2">Prévia do tamanho da etiqueta (100 × 120 mm). Só preto no branco.</p>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Cópias</span>
                        <button type="button" aria-label="Menos" onClick={() => setCopias((c) => Math.max(1, (parseInt(c, 10) || 1) - 1))} className={BTN_MAIS_MENOS}><Minus className="h-4 w-4" /></button>
                        <CampoNumero min="1" max="99" value={copias}
                            onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 1) setCopias(Math.min(99, v)); else if (e.target.value === '') setCopias(''); }}
                            onBlur={(e) => { if (!e.target.value || parseInt(e.target.value, 10) < 1) setCopias(1); }}
                            className="w-16 min-h-[44px] text-center font-semibold text-gray-800 border border-gray-300 rounded-lg" />
                        <button type="button" aria-label="Mais" onClick={() => setCopias((c) => Math.min(99, (parseInt(c, 10) || 1) + 1))} className={BTN_MAIS_MENOS}><Plus className="h-4 w-4" /></button>
                        {paginas > 1 && <span data-total-etiquetas className="text-xs text-gray-600">{paginas} etiquetas × {qtd} {qtd === 1 ? 'cópia' : 'cópias'} = {total}</span>}
                    </div>

                    <ImprimirDireto
                        origem="PEDIDO"
                        nome={rotulo}
                        total={total}
                        referencia={{ tipo: 'PEDIDO', id: String(registro?.id ?? ''), rotulo }}
                        onNavegador={imprimirNavegador}
                        onImpresso={aoImprimir}
                        preparar={() => prepararEtiquetaPedido(dados, qtd)}
                    />
                    <p className="text-xs text-gray-500">Pelo navegador: papel 120 × 100 mm (paisagem), margem 0, escala 100%.</p>
                </div>
            </div>
        </div>
    );
}
