import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Loader2, CheckCircle, ArrowLeft, X, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import checklistEscritorioService from '../../services/checklistEscritorioService';
import { urlImagem } from '../../services/checklistVeiculoService';
import ImgComFalha from '../../components/Diario/ImgComFalha';
import VisualizadorFotos from '../../components/ChecklistVeiculo/VisualizadorFotos';
import { montarSlides } from '../../utils/checklistFotos';

const fmtData = (d) => {
    if (!d) return '';
    const p = String(d).split('T')[0].split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(d);
};
const fmtDataHora = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const nomeDe = (m) => (m && typeof m === 'object' ? m.nome : m) || null;
const TIPO = { VOLTA: 'Volta sem foto', LIBERACAO: 'Liberação sem resposta', DESPESA: 'Despesa divergente' };

/**
 * Pendências de checklist de veículo (3A): volta sem foto. A lista é CALCULADA pelo servidor;
 * quem tem permissão dá o OK com motivo. `podeDarOk` vem do servidor (nunca recalculado aqui).
 */
const ChecklistPendencias = () => {
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState(null); // null | 'geral' | 'sem_acesso'
    const [okItem, setOkItem] = useState(null);
    const [motivo, setMotivo] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [ver, setVer] = useState(null);
    const travaRef = useRef(false);

    const carregar = useCallback(async () => {
        try {
            setErro(null);
            setDados(await checklistEscritorioService.pendencias());
        } catch (e) {
            setErro(e?.response?.status === 403 ? 'sem_acesso' : 'geral');
        }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const confirmarOk = async () => {
        if (travaRef.current) return;
        const texto = motivo.trim();
        if (texto.length < 5) return toast.error('Escreva o motivo do OK (pelo menos 5 letras).');
        travaRef.current = true;
        setSalvando(true);
        try {
            const r = await checklistEscritorioService.darOk({ tipo: okItem.tipo, refId: okItem.refId, motivo: texto });
            toast.success(r?.jaTinha ? 'Esse item já tinha OK.' : 'OK registrado.');
            setOkItem(null);
            setMotivo('');
            await carregar();
        } catch (e) {
            const d = e?.response?.data;
            toast.error(d?.error || (d?.codigo === 'SEM_PERMISSAO' ? 'Você não pode dar OK.' : 'Não foi possível registrar o OK.'));
        } finally {
            travaRef.current = false;
            setSalvando(false);
        }
    };

    const abrirFotos = (item) => {
        const fotos = Array.isArray(item.fotos) ? item.fotos : [];
        const slots = fotos.filter(f => !f.complemento).map((f, i) => ({ angulo: f.angulo, rotulo: f.rotulo || f.angulo, ordem: i }));
        const slides = montarSlides(fotos, slots, { editavel: false, modo: 'escritorio' });
        if (slides.length) setVer({ slides, contexto: { motorista: nomeDe(item.motorista), data: fmtData(item.dataReferencia), veiculo: item.placa || null } });
    };

    const itens = dados?.itens || [];
    const historico = dados?.historico || [];

    return (
        <div className="p-3 md:p-6 max-w-3xl mx-auto max-w-full overflow-x-hidden">
            <div className="flex items-center gap-2 mb-4">
                <Link to="/pendencias" aria-label="Voltar para a Central de Pendências"
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100">
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="bg-mint p-1.5 md:p-2 rounded-lg"><ClipboardCheck className="h-4 w-4 md:h-5 md:w-5 text-primary" /></div>
                <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Pendências de checklist</h1>
            </div>

            {erro === 'sem_acesso' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-700">
                    Você não tem acesso a esta lista.
                </div>
            )}
            {erro === 'geral' && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center text-sm text-gray-600">
                    Não consegui carregar as pendências agora.
                    <button type="button" onClick={carregar} className="block mx-auto mt-3 min-h-[44px] px-4 border border-primary text-primary rounded-full font-medium">Tentar de novo</button>
                </div>
            )}
            {!erro && !dados && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}

            {!erro && dados && (
                <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-100">
                            <Camera className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-1">Volta sem foto</span>
                            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-700">{itens.length}</span>
                        </div>
                        {itens.length === 0 ? (
                            <div className="p-6 text-center text-sm text-gray-600">
                                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
                                Nenhuma pendência. Todo mundo que saiu entregou o carro com foto.
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {itens.map(item => {
                                    const fotos = Array.isArray(item.fotos) ? item.fotos.filter(f => !f.complemento) : [];
                                    return (
                                        <li key={`${item.tipo}-${item.refId}`} className="p-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-gray-900">{item.placa || 'Veículo'} · {fmtData(item.dataReferencia)}</p>
                                                    <p className="text-xs text-gray-600 truncate">{nomeDe(item.motorista) || '—'}</p>
                                                </div>
                                                <span className="shrink-0 px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">{TIPO[item.tipo] || 'Pendência'}</span>
                                            </div>
                                            {item.resumo && <p className="text-sm text-gray-700 mt-2">{item.resumo}</p>}
                                            {fotos.length > 0 && (
                                                <div className="grid grid-cols-4 gap-2 mt-3">
                                                    {fotos.map(f => (
                                                        <button key={f.id || f.angulo} type="button" onClick={() => abrirFotos(item)} className="min-w-0" title={f.rotulo || f.angulo}>
                                                            <ImgComFalha compacto src={urlImagem(f.url)} alt={f.rotulo || f.angulo} loading="lazy"
                                                                className="aspect-square w-full object-cover rounded-lg border border-gray-200" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {item.podeDarOk === true && (
                                                <button type="button" onClick={() => { setOkItem(item); setMotivo(''); }}
                                                    className="mt-3 w-full sm:w-auto min-h-[44px] px-5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm">
                                                    Dar OK
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>

                    {itens.length > 0 && dados.podeDarOk !== true && !itens.some(i => i.podeDarOk === true) && (
                        <p className="text-xs text-gray-600 px-1">Só quem está na lista de "quem libera e dá OK" (Configurações) pode dar o OK.</p>
                    )}

                    {historico.length > 0 && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="px-4 py-3.5 border-b border-gray-100">
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">OKs dos últimos 30 dias</span>
                            </div>
                            <ul className="divide-y divide-gray-100">
                                {historico.map((h, i) => (
                                    <li key={`${h.tipo}-${h.refId}-${i}`} className="p-4 text-sm">
                                        <p className="font-semibold text-gray-900">{h.placa ? `${h.placa} · ` : ''}{fmtData(h.dataReferencia)} · {nomeDe(h.motorista) || '—'}</p>
                                        <p className="text-gray-700 mt-0.5">"{h.motivo}"</p>
                                        <p className="text-xs text-gray-600 mt-0.5">OK de {h.por?.nome || h.porNome || '—'}{(h.criadoEm || h.em) ? ` em ${fmtDataHora(h.criadoEm || h.em)}` : ''}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {okItem && (
                <div className="fixed inset-0 bg-black/60 z-[120] flex items-end sm:items-center justify-center" onClick={() => !salvando && setOkItem(null)}>
                    <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-base font-bold text-gray-900">Dar OK: {okItem.placa || 'veículo'} · {fmtData(okItem.dataReferencia)}</p>
                            <button type="button" onClick={() => setOkItem(null)} aria-label="Fechar"
                                className="min-h-[44px] min-w-[44px] -mt-2 -mr-2 inline-flex items-center justify-center text-gray-500 rounded-full hover:bg-gray-100">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <p className="text-sm text-gray-600">Isso tira a pendência da lista. Conte por que está tudo certo (fica registrado com o seu nome).</p>
                        <label className="block text-sm font-medium text-gray-700" htmlFor="motivo-ok">Motivo *</label>
                        <textarea id="motivo-ok" rows="3" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                            placeholder="Ex.: falei com o motorista, o carro está guardado na empresa."
                            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" disabled={salvando} onClick={() => setOkItem(null)}
                                className="min-h-[48px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">Cancelar</button>
                            <button type="button" disabled={salvando} onClick={confirmarOk}
                                className="min-h-[48px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full font-semibold text-sm">
                                {salvando ? 'Salvando…' : 'Confirmar OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {ver && <VisualizadorFotos slides={ver.slides} indiceInicial={0} modo="escritorio" contexto={ver.contexto} onClose={() => setVer(null)} />}
        </div>
    );
};

export default ChecklistPendencias;
