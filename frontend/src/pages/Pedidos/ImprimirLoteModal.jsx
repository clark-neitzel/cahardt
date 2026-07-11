import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, Loader2, AlertTriangle, FileText, Check, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import pedidoService from '../../services/pedidoService';
import asaasService from '../../services/asaasService';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';

// Impressão em lote (aprovada 07/2026): DANFE em 2 vias + boletos (Conta Azul e Asaas)
// na sequência; especiais saem no recibo de conferência.
// A checagem consulta o CA de UM PEDIDO POR VEZ, mostrando o progresso ao vivo
// (pedido do dono: não mandar várias consultas de uma vez ao Conta Azul).
const ImprimirLoteModal = ({ pedidoIds, onClose }) => {
    const [itens, setItens] = useState([]);           // já checados
    const [checandoIdx, setChecandoIdx] = useState(0); // quantos já foram
    const [checando, setChecando] = useState(true);
    const [duasVias, setDuasVias] = useFiltroSalvo('pedidos:loteDuasVias', true);
    const [incluirBoletos, setIncluirBoletos] = useFiltroSalvo('pedidos:loteBoletos', true);
    const [gerando, setGerando] = useState(false);
    const [gerandoBoletos, setGerandoBoletos] = useState(false);
    const cancelado = useRef(false);

    // Checa um por vez, em sequência
    const checarTodos = async (ids) => {
        setItens([]);
        setChecandoIdx(0);
        setChecando(true);
        cancelado.current = false;
        const novos = [];
        for (let i = 0; i < ids.length; i++) {
            if (cancelado.current) return;
            try {
                const item = await pedidoService.imprimirLoteChecarPedido(ids[i]);
                novos.push(item);
            } catch (e) {
                novos.push({ id: ids[i], numero: '?', cliente: '—', boleto: 'DESCONHECIDO', caErro: e.response?.data?.error || 'falha na consulta' });
            }
            if (cancelado.current) return;
            setItens([...novos]);
            setChecandoIdx(i + 1);
        }
        setChecando(false);
    };

    useEffect(() => {
        checarTodos(pedidoIds);
        return () => { cancelado.current = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const validos = itens.filter(i => !i.bonificacao);
    const especiais = validos.filter(i => i.especial);
    const normais = validos.filter(i => !i.especial);
    const semNF = normais.filter(i => !i.temNF);
    const semBoleto = validos.filter(i => i.boleto === 'SEM_BOLETO');       // conferido: não tem em lugar nenhum
    const boletoPago = validos.filter(i => i.boleto === 'PAGO');            // existe, mas quitado → não imprime
    const caIndisponivel = validos.filter(i => i.caErro);                   // não deu p/ consultar o CA
    const aVista = normais.filter(i => !i.aPrazo);
    const totalBoletos = validos.reduce((s, i) => s + (i.boletosCA || 0) + (i.boletosAsaas || 0), 0);

    const handleGerarBoletos = async () => {
        setGerandoBoletos(true);
        try {
            const r = await asaasService.emitirBoletos({ pedidoIds: semBoleto.map(i => i.id) });
            toast.success(r.message || 'Boletos emitidos!');
            (r.resultados || []).filter(x => !x.ok).forEach(x => toast.error(x.erro, { duration: 6000 }));
            await checarTodos(pedidoIds); // re-checa (agora vai achar no Asaas)
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao emitir boletos.');
        } finally {
            setGerandoBoletos(false);
        }
    };

    const handleImprimir = async () => {
        setGerando(true);
        try {
            const resp = await pedidoService.imprimirLote({
                pedidoIds: validos.map(i => i.id),
                duasVias,
                incluirBoletos
            });
            try {
                const erros = JSON.parse(decodeURIComponent(resp.headers['x-lote-erros'] || '%5B%5D'));
                erros.forEach(e => toast.error(`${e.numero}: ${e.erro}`, { duration: 8000 }));
            } catch (_) { /* sem erros */ }
            const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
            window.open(url, '_blank'); // visualização do documento p/ imprimir
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            onClose();
        } catch (e) {
            let msg = 'Erro ao gerar o PDF.';
            try { msg = JSON.parse(await e.response.data.text()).error || msg; } catch (_) { /* genérica */ }
            toast.error(msg, { duration: 8000 });
        } finally {
            setGerando(false);
        }
    };

    const folhasEstimadas = validos.length * (duasVias ? 2 : 1) + (incluirBoletos ? totalBoletos : 0);

    // Indicador "tem boleto?" por sistema
    const Sinal = ({ estado, rotulo }) => {
        // estado: 'sim' | 'nao' | 'pago' | 'erro'
        const cor = estado === 'sim' ? 'bg-green-100 text-green-700'
            : estado === 'pago' ? 'bg-gray-100 text-gray-500'
                : estado === 'erro' ? 'bg-red-100 text-red-700'
                    : 'bg-gray-50 text-gray-400';
        const icone = estado === 'sim' ? <Check className="h-3 w-3" />
            : estado === 'pago' ? <Check className="h-3 w-3" />
                : estado === 'erro' ? <AlertTriangle className="h-3 w-3" />
                    : <Minus className="h-3 w-3" />;
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cor}`}>
                {icone} {rotulo}{estado === 'pago' ? ' (pago)' : ''}
            </span>
        );
    };

    const sinalCA = (i) => {
        if (i.caErro) return 'erro';
        if (i.boletosCA > 0) return 'sim';
        if (i.caPago) return 'pago';
        return 'nao';
    };
    const sinalAsaas = (i) => {
        if (i.boletosAsaas > 0) return 'sim';
        if (i.asaasPago) return 'pago';
        return 'nao';
    };

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end md:items-center justify-center" role="dialog">
            <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                        <div className="bg-mint p-2 rounded-lg"><Printer className="h-5 w-5 text-primary" /></div>
                        <div>
                            <h3 className="font-bold text-gray-900 leading-tight">Imprimir em lote</h3>
                            <p className="text-xs text-gray-500">{pedidoIds.length} pedido{pedidoIds.length !== 1 ? 's' : ''} selecionado{pedidoIds.length !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 flex-1 space-y-4">
                    {/* Conferência ao vivo: um pedido por vez */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-600">
                                Conferindo boletos (CA e Asaas)
                            </p>
                            <span className="text-[11px] font-bold text-gray-500">
                                {checandoIdx}/{pedidoIds.length}
                            </span>
                        </div>
                        <div className="space-y-1.5 max-h-56 overflow-y-auto">
                            {itens.map(i => (
                                <div key={i.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                                    <span className="text-xs font-bold text-gray-700 shrink-0">
                                        {i.especial ? 'ZZ#' : '#'}{i.numero}
                                    </span>
                                    <span className="text-[11px] text-gray-500 truncate flex-1">{i.cliente}</span>
                                    {i.especial || i.bonificacao || !i.aPrazo ? (
                                        <span className="text-[10px] text-gray-400 font-semibold shrink-0">sem boleto</span>
                                    ) : (
                                        <span className="flex gap-1 shrink-0">
                                            <Sinal estado={sinalCA(i)} rotulo="CA" />
                                            <Sinal estado={sinalAsaas(i)} rotulo="Asaas" />
                                        </span>
                                    )}
                                </div>
                            ))}
                            {checando && (
                                <div className="flex items-center gap-2 text-xs text-gray-500 px-2.5 py-1.5">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Consultando o Conta Azul do pedido {checandoIdx + 1}...
                                </div>
                            )}
                        </div>
                    </div>

                    {!checando && (
                        <>
                            {/* Opções */}
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input type="checkbox" checked={duasVias} onChange={e => setDuasVias(e.target.checked)}
                                    className="mt-0.5 h-5 w-5 text-primary rounded border-gray-300 focus:ring-primary" />
                                <span>
                                    <span className="text-sm font-bold text-gray-900">2 vias de cada documento</span>
                                    <p className="text-xs text-gray-500 mt-0.5">Uma via colhe assinatura, a outra fica com o cliente.</p>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input type="checkbox" checked={incluirBoletos} onChange={e => setIncluirBoletos(e.target.checked)}
                                    className="mt-0.5 h-5 w-5 text-primary rounded border-gray-300 focus:ring-primary" />
                                <span>
                                    <span className="text-sm font-bold text-gray-900">Boleto logo após as vias</span>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Sai na sequência (Conta Azul e Asaas) — quem fatura só junta e grampeia.
                                        {totalBoletos > 0 && <b> {totalBoletos} boleto(s) neste lote.</b>}
                                    </p>
                                </span>
                            </label>

                            {/* Avisos */}
                            {semNF.length > 0 && (
                                <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                                    <p className="flex items-center gap-2 text-sm font-bold text-red-800">
                                        <AlertTriangle className="h-4 w-4 shrink-0" /> {semNF.length} pedido(s) sem NF-e emitida — vão ser pulados
                                    </p>
                                    <p className="text-xs text-red-700 mt-1">{semNF.map(i => `#${i.numero}`).join(', ')} — emita a nota no Conta Azul primeiro.</p>
                                </div>
                            )}
                            {incluirBoletos && caIndisponivel.length > 0 && (
                                <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3">
                                    <p className="flex items-center gap-2 text-sm font-bold text-red-800">
                                        <AlertTriangle className="h-4 w-4 shrink-0" /> Não consegui consultar o Conta Azul em {caIndisponivel.length} pedido(s)
                                    </p>
                                    <p className="text-xs text-red-700 mt-1">
                                        {caIndisponivel.map(i => `#${i.numero}`).join(', ')} — se houver boleto do CA neles, <b>não sairá</b> nesta impressão. Feche e tente de novo, ou imprima esses pelo Conta Azul.
                                    </p>
                                </div>
                            )}
                            {incluirBoletos && boletoPago.length > 0 && (
                                <p className="text-xs text-gray-500">
                                    ℹ️ {boletoPago.length} boleto(s) já quitado(s) não serão impressos. Se precisar de um pago, imprima pelo Contas a Receber.
                                </p>
                            )}
                            {incluirBoletos && semBoleto.length > 0 && (
                                <div className="bg-amber-50 border border-amber-400 rounded-xl px-4 py-3">
                                    <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                                        <AlertTriangle className="h-4 w-4 shrink-0" /> {semBoleto.length} pedido(s) a prazo sem boleto (nem no CA, nem no Asaas)
                                    </p>
                                    <ul className="text-xs text-amber-800 mt-1 pl-5 list-disc">
                                        {semBoleto.slice(0, 6).map(i => (
                                            <li key={i.id}>#{i.numero} — {i.cliente} (R$ {Number(i.valorTotal).toFixed(2)})</li>
                                        ))}
                                        {semBoleto.length > 6 && <li>+ {semBoleto.length - 6} outro(s)</li>}
                                    </ul>
                                    <div className="flex items-center gap-3 mt-2">
                                        <button onClick={handleGerarBoletos} disabled={gerandoBoletos}
                                            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-full text-xs font-bold disabled:opacity-60 flex items-center gap-1.5">
                                            {gerandoBoletos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                                            Gerar boletos agora (Asaas)
                                        </button>
                                        <span className="text-xs font-semibold text-amber-800">ou continuar sem eles</span>
                                    </div>
                                </div>
                            )}
                            {(aVista.length > 0 || especiais.length > 0) && (
                                <p className="text-xs text-gray-500">
                                    ℹ️ {aVista.length > 0 ? `${aVista.length} pedido(s) à vista saem sem boleto. ` : ''}
                                    {especiais.length > 0 ? `${especiais.length} especial(is) saem no recibo de conferência.` : ''}
                                </p>
                            )}
                        </>
                    )}
                </div>

                <div className="p-5 pt-0">
                    <button onClick={handleImprimir} disabled={checando || gerando || validos.length === 0}
                        className="w-full py-4 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-50">
                        {gerando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
                        {checando ? 'Conferindo boletos...'
                            : gerando ? 'Gerando PDF...'
                                : `Gerar PDF para impressão (~${folhasEstimadas} folha${folhasEstimadas !== 1 ? 's' : ''})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImprimirLoteModal;
