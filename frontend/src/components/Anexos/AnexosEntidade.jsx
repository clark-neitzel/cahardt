import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, FileCode, ImageOff, Loader2, Paperclip, Trash2, X, Download, AlertTriangle, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import SelectBusca from '../SelectBusca';
import VisualizadorFotos from '../ChecklistVeiculo/VisualizadorFotos';
import { anexosService } from '../../services/contasPagarService';
import comprimirFoto from '../../utils/comprimirFoto';

/**
 * Anexos múltiplos de uma entidade (hoje: CONTA_PAGAR).
 * Props: entidadeTipo, entidadeId, podeEscrever (anexar/remover/mudar tipo), onMudou?(lista)
 * Arquivos sempre buscados como blob pela instância autenticada (nada de URL pública).
 */

const TIPOS = [
    { v: 'COMPROVANTE', t: 'Comprovante' },
    { v: 'NF', t: 'Nota fiscal' },
    { v: 'BOLETO', t: 'Boleto' },
    { v: 'CONTRATO', t: 'Contrato' },
    { v: 'OUTRO', t: 'Outro' },
];
const rotuloTipo = (v) => TIPOS.find((x) => x.v === v)?.t || 'Outro';
const MSG_PERDIDO = 'Arquivo não encontrado no servidor. Anexe novamente.';
const MAX_BYTES = 30 * 1024 * 1024;
const ACCEPT = '.pdf,.xml,.jpg,.jpeg,.png,.webp,application/pdf,text/xml,application/xml,image/jpeg,image/png,image/webp';

const ehImagem = (a) => (a.mime || '').startsWith('image/');
const ehPdf = (a) => a.mime === 'application/pdf' || /\.pdf$/i.test(a.nomeOriginal || '');
const fmtTam = (n) => {
    if (n == null || !Number.isFinite(Number(n))) return '';
    const v = Number(n);
    return v >= 1048576 ? `${(v / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(v / 1024))} KB`;
};
const fmtQuando = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Visualizador interno de PDF/XML (blob em iframe / texto) — sem abrir janela externa.
export const VisualizadorDocumento = ({ anexo, onClose }) => {
    const [url, setUrl] = useState(null);
    const [texto, setTexto] = useState(null);
    const [erro, setErro] = useState(false);
    const urlRef = useRef(null);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const blob = await anexosService.arquivo(anexo.id);
                if (!vivo) return;
                if (ehPdf(anexo)) {
                    const u = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                    urlRef.current = u; setUrl(u);
                } else {
                    setTexto(await blob.text());
                    const u = URL.createObjectURL(blob);
                    urlRef.current = u; setUrl(u);
                }
            } catch { if (vivo) setErro(true); }
        })();
        return () => { vivo = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
    }, [anexo]);

    useEffect(() => {
        const tecla = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', tecla);
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = antes; };
    }, [onClose]);

    const baixar = () => {
        if (!url) return;
        const a = document.createElement('a');
        a.href = url; a.download = anexo.nomeOriginal || 'arquivo';
        document.body.appendChild(a); a.click(); a.remove();
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-stretch md:items-center justify-center md:p-6" role="dialog" aria-modal="true">
            <div className="bg-white w-full md:max-w-4xl md:rounded-2xl flex flex-col h-full md:h-[88vh] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
                    <span className="flex-1 min-w-0 truncate text-sm font-semibold text-gray-900">{anexo.nomeOriginal}</span>
                    <button type="button" onClick={baixar} disabled={!url} aria-label="Baixar" title="Baixar"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-40">
                        <Download className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={onClose} aria-label="Fechar"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex-1 min-h-0 bg-gray-100 overflow-auto">
                    {erro ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-sm text-gray-600 p-6">
                            <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />{MSG_PERDIDO}
                        </div>
                    ) : !url ? (
                        <div className="h-full flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
                    ) : texto != null ? (
                        <pre className="text-xs text-gray-800 p-3 whitespace-pre-wrap break-all">{texto}</pre>
                    ) : (
                        <iframe title={anexo.nomeOriginal} src={url} className="w-full h-full border-0 bg-white" />
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

const AnexosEntidade = ({ entidadeTipo, entidadeId, podeEscrever = false, onMudou, abrirPrimeiro = false }) => {
    const [lista, setLista] = useState(null);       // null = carregando
    const [erroLista, setErroLista] = useState(false);
    const [thumbs, setThumbs] = useState({});       // { id: blobUrl | 'ERRO' }
    const [tipoNovo, setTipoNovo] = useState('COMPROVANTE');
    const [enviando, setEnviando] = useState(false);
    const [confirmando, setConfirmando] = useState(null);
    const [avisos, setAvisos] = useState([]);
    const [permServidor, setPermServidor] = useState(null); // o servidor tem a palavra final
    const [verFoto, setVerFoto] = useState(null);   // índice nos slides
    const [verDoc, setVerDoc] = useState(null);
    const travaRef = useRef(false);
    const thumbsRef = useRef({});
    const inputRef = useRef(null);
    const onMudouRef = useRef(onMudou);
    onMudouRef.current = onMudou;

    const carregar = useCallback(async () => {
        setErroLista(false);
        try {
            const r = await anexosService.listar(entidadeTipo, entidadeId);
            if (typeof r.podeEscrever === 'boolean') setPermServidor(r.podeEscrever);
            setLista(r.anexos);
            onMudouRef.current?.(r.anexos);
        } catch { setErroLista(true); setLista((x) => x ?? []); }
    }, [entidadeTipo, entidadeId]);

    useEffect(() => { setLista(null); carregar(); }, [carregar]);

    // Miniaturas (blob) das imagens ainda não carregadas. O resultado SEMPRE vai pro state
    // (mesmo se a lista mudou no meio); só revoga o blob se o componente já desmontou.
    const montadoRef = useRef(true);
    useEffect(() => { montadoRef.current = true; return () => { montadoRef.current = false; }; }, []);
    useEffect(() => {
        if (!lista) return;
        lista.filter((a) => ehImagem(a) && a.arquivoDisponivel !== false).forEach(async (a) => {
            const atual = thumbsRef.current[a.id];
            if (atual === 'CARREGANDO' || (atual && atual !== 'ERRO')) return;
            thumbsRef.current[a.id] = 'CARREGANDO';
            try {
                const blob = await anexosService.arquivo(a.id);
                const u = URL.createObjectURL(blob);
                if (!montadoRef.current) { URL.revokeObjectURL(u); return; }
                thumbsRef.current[a.id] = u;
                setThumbs((t) => ({ ...t, [a.id]: u }));
            } catch {
                thumbsRef.current[a.id] = 'ERRO';
                if (montadoRef.current) setThumbs((t) => ({ ...t, [a.id]: 'ERRO' }));
            }
        });
    }, [lista]);

    useEffect(() => () => {
        Object.values(thumbsRef.current).forEach((u) => { if (typeof u === 'string' && u.startsWith('blob:')) URL.revokeObjectURL(u); });
    }, []);

    // abrirPrimeiro: lista com 1 só imagem abre direto no visualizador (usado no "Ver documento" da baixa)
    const jaAbriuRef = useRef(false);
    useEffect(() => {
        if (!abrirPrimeiro || jaAbriuRef.current || !lista || lista.length !== 1) return;
        const a = lista[0];
        if (ehImagem(a) && thumbs[a.id]?.startsWith?.('blob:')) { jaAbriuRef.current = true; setVerFoto(0); }
    }, [abrirPrimeiro, lista, thumbs]);

    const escolher = async (e) => {
        const arquivos = Array.from(e.target.files || []);
        e.target.value = '';
        if (!arquivos.length || travaRef.current) return;
        if (arquivos.length > 10) { toast.error('Envie no máximo 10 arquivos por vez.'); return; }
        const grande = arquivos.find((a) => a.size > MAX_BYTES);
        if (grande) { toast.error(`"${grande.name}" passa de 30 MB.`); return; }
        travaRef.current = true;
        setEnviando(true);
        try {
            const prontos = await Promise.all(arquivos.map((a) => (a.type?.startsWith('image/') ? comprimirFoto(a) : a)));
            const r = await anexosService.enviar(entidadeTipo, entidadeId, prontos, tipoNovo);
            const n = r?.anexos?.length ?? arquivos.length;
            toast.success(n > 1 ? `${n} arquivos anexados.` : 'Arquivo anexado.');
            setAvisos((r?.avisos || []).map((x) => `${x.arquivo ? `${x.arquivo}: ` : ''}${x.mensagem || 'arquivo igual a outro já anexado.'}`));
            (r?.recusados || []).forEach((x) => toast.error(`${x.arquivo}: ${x.erro}`));
            await carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Não foi possível anexar. Tente de novo.');
        } finally {
            travaRef.current = false;
            setEnviando(false);
        }
    };

    const remover = async (a) => {
        if (travaRef.current) return;
        travaRef.current = true;
        try {
            await anexosService.remover(a.id);
            setConfirmando(null); setAvisos([]);
            toast.success('Anexo removido.');
            await carregar();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Não foi possível remover.');
        } finally { travaRef.current = false; }
    };

    const mudarTipo = async (a, tipo) => {
        if (tipo === a.tipo) return;
        setLista((l) => l.map((x) => (x.id === a.id ? { ...x, tipo } : x)));
        try { await anexosService.mudarTipo(a.id, tipo); }
        catch (err) { toast.error(err.response?.data?.error || 'Não foi possível mudar o tipo.'); carregar(); }
    };

    const escreve = podeEscrever && permServidor !== false;
    const imagens = (lista || []).filter(ehImagem);
    const slides = imagens.map((a) => ({
        chave: a.id, rotulo: `${a.nomeOriginal} · ${rotuloTipo(a.tipo)}`, url: thumbs[a.id]?.startsWith?.('blob:') ? thumbs[a.id] : '',
        parecer: null, perguntas: [], complemento: null, editavel: false, statusIa: 'NAO_ANALISADA',
    })).filter((s) => s.url);

    const abrir = (a) => {
        if (ehImagem(a) && thumbsRef.current[a.id] === 'ERRO') { delete thumbsRef.current[a.id]; setLista((l) => [...l]); return; }
        if (ehImagem(a)) {
            const i = slides.findIndex((s) => s.chave === a.id);
            if (i >= 0) setVerFoto(i); else toast.error(MSG_PERDIDO);
        } else setVerDoc(a);
    };

    return (
        <div className="space-y-3">
            {verFoto != null && slides.length > 0 && (
                <VisualizadorFotos slides={slides} indiceInicial={verFoto} modo="escritorio" semParecer titulo="Anexo" onClose={() => setVerFoto(null)} />
            )}
            {verDoc && <VisualizadorDocumento anexo={verDoc} onClose={() => setVerDoc(null)} />}

            {escreve && (
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                    <div className="sm:w-48">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Tipo do que vai anexar</label>
                        <SelectBusca value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value)} className="w-full">
                            {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
                        </SelectBusca>
                    </div>
                    <button type="button" disabled={enviando} onClick={() => inputRef.current?.click()}
                        className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold shadow-sm disabled:opacity-60">
                        {enviando ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</> : <><Plus className="h-4 w-4" />Adicionar arquivos</>}
                    </button>
                    <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={escolher} />
                </div>
            )}
            {escreve && <p className="text-xs text-gray-500">PDF, foto (JPG/PNG/WebP) ou XML. Até 10 por vez, 30 MB cada.</p>}

            {avisos.length > 0 && (
                <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="min-w-0 break-words">{avisos.map((m, i) => <div key={i}>{m}</div>)}</div>
                </div>
            )}

            {lista === null ? (
                <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : erroLista ? (
                <div className="text-sm text-gray-600 text-center py-4">
                    Não consegui carregar os anexos.
                    <button type="button" onClick={carregar} className="block mx-auto mt-2 min-h-[44px] px-4 border border-primary text-primary rounded-full font-medium">Tentar de novo</button>
                </div>
            ) : lista.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-3"><Paperclip className="h-4 w-4" />Nenhum anexo ainda.</div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {lista.map((a) => {
                        const img = ehImagem(a);
                        const perdido = a.arquivoDisponivel === false;
                        const t = thumbs[a.id];
                        return (
                            <div key={a.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-w-0">
                                <button type="button" onClick={() => abrir(a)} aria-label={`Abrir ${a.nomeOriginal}`}
                                    className="relative w-full aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden min-h-[44px]">
                                    {perdido ? (
                                        <span className="flex flex-col items-center text-gray-500 text-center px-2">
                                            <ImageOff className="h-6 w-6 text-gray-400 mb-1" /><span className="text-[11px]">{MSG_PERDIDO}</span>
                                        </span>
                                    ) : img ? (
                                        t === 'ERRO' ? (
                                            <span className="flex flex-col items-center text-gray-500 text-center px-2">
                                                <ImageOff className="h-6 w-6 text-gray-400 mb-1" /><span className="text-[11px]">{MSG_PERDIDO}</span>
                                            </span>
                                        ) : t && t !== 'CARREGANDO' ? (
                                            <img src={t} alt={a.nomeOriginal} className="w-full h-full object-cover" draggable={false} />
                                        ) : <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                                    ) : ehPdf(a) ? (
                                        <span className="flex flex-col items-center text-red-600"><FileText className="h-9 w-9" /><span className="text-[11px] font-bold mt-1">PDF</span></span>
                                    ) : (
                                        <span className="flex flex-col items-center text-primaryDark"><FileCode className="h-9 w-9" /><span className="text-[11px] font-bold mt-1">XML</span></span>
                                    )}
                                </button>
                                <div className="p-2 space-y-1.5 min-w-0">
                                    <div className="text-xs font-semibold text-gray-900 truncate" title={a.nomeOriginal}>{a.nomeOriginal}</div>
                                    {escreve ? (
                                        <SelectBusca value={a.tipo || 'OUTRO'} onChange={(e) => mudarTipo(a, e.target.value)} className="w-full">
                                            {TIPOS.map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
                                        </SelectBusca>
                                    ) : (
                                        <span className="inline-block px-2 py-0.5 text-[11px] font-semibold rounded-full bg-gray-100 text-gray-700">{rotuloTipo(a.tipo)}</span>
                                    )}
                                    <div className="text-[11px] text-gray-500 leading-snug">
                                        {a.criadoPorNome ? `${a.criadoPorNome}` : 'Enviado'}
                                        {a.criadoEm ? ` · ${fmtQuando(a.criadoEm)}` : ''}
                                        {fmtTam(a.tamanho) ? ` · ${fmtTam(a.tamanho)}` : ''}
                                    </div>
                                    {a.avisoDuplicado && (
                                        <div className="flex items-start gap-1 text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-1">
                                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                            <span>Igual a outro arquivo já anexado.</span>
                                        </div>
                                    )}
                                    {escreve && a.podeRemover !== false && (confirmando === a.id ? (
                                        <div className="flex gap-1.5">
                                            <button type="button" onClick={() => remover(a)} className="flex-1 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded-full text-xs font-semibold">Remover</button>
                                            <button type="button" onClick={() => setConfirmando(null)} className="flex-1 min-h-[44px] border border-gray-300 text-gray-700 rounded-full text-xs font-medium">Não</button>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={() => setConfirmando(a.id)}
                                            className="w-full min-h-[44px] inline-flex items-center justify-center gap-1 border border-red-200 text-red-600 hover:bg-red-50 rounded-full text-xs font-medium">
                                            <Trash2 className="h-3.5 w-3.5" />Remover
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

/**
 * "Ver documento" (ex.: na baixa): 1 anexo abre direto; vários mostram a lista (somente leitura).
 */
export const AbrirAnexos = ({ entidadeTipo, entidadeId, onClose }) => {
    const [lista, setLista] = useState(null);
    useEffect(() => {
        let vivo = true;
        anexosService.listar(entidadeTipo, entidadeId)
            .then((r) => {
                if (!vivo) return;
                if (!r.anexos.length) { toast.error('Esta despesa não tem anexos.'); onClose(); return; }
                setLista(r.anexos);
            })
            .catch(() => { if (vivo) { toast.error('Não foi possível carregar os anexos.'); onClose(); } });
        return () => { vivo = false; };
    }, [entidadeTipo, entidadeId, onClose]);
    if (!lista) return null;
    if (lista.length === 1 && !ehImagem(lista[0])) return <VisualizadorDocumento anexo={lista[0]} onClose={onClose} />;
    return createPortal(
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Anexos</span>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full"><X className="h-5 w-5" /></button>
                </div>
                <AnexosEntidade entidadeTipo={entidadeTipo} entidadeId={entidadeId} podeEscrever={false} abrirPrimeiro />
            </div>
        </div>,
        document.body
    );
};

export default AnexosEntidade;
