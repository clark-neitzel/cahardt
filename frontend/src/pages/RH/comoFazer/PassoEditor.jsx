import { useState } from 'react';
import { Camera, Video, Trash2, Plus, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import comoFazerService, { mensagemErro, urlMidia } from '../../../services/comoFazerService';
import iaService, { registrarResultado, mensagemDeErroIa } from '../../../services/comoFazerIaService';
import SelectBusca from '../../../components/SelectBusca';
import CampoNumero from '../../../components/CampoNumero';
import PassoCard from '../../../components/ComoFazer/PassoCard';
import { reduzirImagem, duracaoVideo } from '../../../components/ComoFazer/imagem';

const novoId = (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
const CAMPO = 'w-full min-h-[44px] border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';

// Botão de foto (câmera no celular) que sobe a imagem reduzida e devolve o caminho.
function BotaoFoto({ valor, aoMudar, rotulo = 'Foto', contexto = 'conteudo', conteudoId }) {
    const [enviando, setEnviando] = useState(false);
    const enviar = async (arq) => {
        if (!arq) return;
        setEnviando(true);
        try {
            const r = await comoFazerService.upload(await reduzirImagem(arq), contexto, conteudoId);
            aoMudar(r.url);
        } catch (e) { toast.error(mensagemErro(e, 'Não consegui enviar a foto.')); }
        finally { setEnviando(false); }
    };
    return (
        <div className="flex items-center gap-2 flex-wrap">
            {valor && <img src={urlMidia(valor)} alt="" className="h-14 w-14 rounded-lg object-cover border border-gray-200" onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />}
            <label className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary text-sm font-semibold cursor-pointer">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {valor ? `Trocar ${rotulo.toLowerCase()}` : `Tirar / escolher ${rotulo.toLowerCase()}`}
                <input type="file" accept="image/*" className="hidden" disabled={enviando} onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; enviar(a); }} />
            </label>
            {valor && <button type="button" onClick={() => aoMudar(null)} className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>}
        </div>
    );
}

function BotaoVideo({ valor, aoMudar, conteudoId }) {
    const [enviando, setEnviando] = useState(false);
    const enviar = async (arq) => {
        if (!arq) return;
        const dur = await duracaoVideo(arq);
        if (dur != null && dur > 22) { toast.error('O vídeo tem mais de 20 segundos. Escolha um mais curto.'); return; }
        setEnviando(true);
        try {
            const r = await comoFazerService.upload(arq, 'conteudo', conteudoId);
            aoMudar(r.url);
        } catch (e) { toast.error(mensagemErro(e, 'Não consegui enviar o vídeo.')); }
        finally { setEnviando(false); }
    };
    return (
        <div className="flex items-center gap-2 flex-wrap">
            <label className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-gray-300 text-gray-700 text-sm font-semibold cursor-pointer">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />} {valor ? 'Trocar vídeo' : 'Vídeo (até 20 s)'}
                <input type="file" accept="video/*" className="hidden" disabled={enviando} onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; enviar(a); }} />
            </label>
            {valor && <><span className="text-xs text-green-700 font-semibold">✓ vídeo anexado</span><button type="button" onClick={() => aoMudar(null)} className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-red-600" aria-label="Remover vídeo"><Trash2 className="h-4 w-4" /></button></>}
        </div>
    );
}

// Editor de UM passo + a prévia (o mesmo PassoCard que a equipe vê).
function AjudaIaDoPasso({ passo, tipo, ia, onUsar }) {
    const [carregando, setCarregando] = useState('');   // 'melhorar' | 'simplificar' | ''
    const [proposta, setProposta] = useState(null);     // { usoId, texto, detalhe }
    const [erro, setErro] = useState('');
    const pedir = async (acao) => {
        if (carregando) return;
        if (!(passo.texto || '').trim()) { toast.error('Escreva o passo antes de pedir ajuda à IA.'); return; }
        setCarregando(acao); setErro(''); setProposta(null);
        try {
            const r = await iaService.melhorarPasso({ acao, texto: passo.texto, detalhe: passo.detalhe || undefined, tipo, titulo: ia.titulo || '', objetivo: ia.objetivo || undefined });
            setProposta({ usoId: r.usoId, texto: String(r.texto || '').slice(0, 140), detalhe: r.detalhe ? String(r.detalhe).slice(0, 240) : '' });
        } catch (e) { setErro(mensagemDeErroIa(e)); }
        finally { setCarregando(''); }
    };
    const usar = () => { onUsar({ texto: proposta.texto, detalhe: proposta.detalhe || null }); registrarResultado(proposta.usoId, 'USADO'); setProposta(null); };
    const descartar = () => { registrarResultado(proposta.usoId, 'DESCARTADO'); setProposta(null); };
    const bt = 'min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-violet-300 text-violet-800 text-sm font-semibold disabled:opacity-50';
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => pedir('melhorar')} disabled={!!carregando} className={bt}>
                    {carregando === 'melhorar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Melhorar
                </button>
                <button type="button" onClick={() => pedir('simplificar')} disabled={!!carregando} className={bt}>
                    {carregando === 'simplificar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Mais simples
                </button>
            </div>
            {erro && <p className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-semibold p-2 break-words" role="alert">{erro}</p>}
            {proposta && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-800">✨ Sugestão da IA</p>
                    <p className="text-sm font-bold text-gray-900 break-words">{proposta.texto}</p>
                    {proposta.detalhe ? <p className="text-sm text-gray-700 break-words">{proposta.detalhe}</p> : null}
                    <div className="flex gap-2">
                        <button type="button" onClick={descartar} className="flex-1 min-h-[44px] rounded-full bg-white border border-gray-300 text-gray-800 text-sm font-semibold">Descartar</button>
                        <button type="button" onClick={usar} className="flex-1 min-h-[44px] rounded-full bg-primary hover:bg-primaryDark text-white text-sm font-semibold">Usar</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function PassoEditor({ passo, tipo, conteudoId, onChange, ia = null }) {
    const set = (parte) => onChange({ ...passo, ...parte });
    const per = passo.pergunta || null;
    const setPer = (parte) => set({ pergunta: { ...per, ...parte } });
    const itens = Array.isArray(passo.itens) ? passo.itens : [];
    const setItem = (i, parte) => set({ itens: itens.map((x, idx) => (idx === i ? { ...x, ...parte } : x)) });

    return (
        <div className="space-y-3">
            <label className="block">
                <span className="text-sm font-medium text-gray-700">O que fazer (frase curta) <span className="text-gray-500">{(passo.texto || '').length}/140</span></span>
                <textarea value={passo.texto || ''} maxLength={140} rows={2} onChange={(e) => set({ texto: e.target.value })} className={`${CAMPO} mt-1`} />
            </label>
            <label className="block">
                <span className="text-sm font-medium text-gray-700">Detalhe (opcional) <span className="text-gray-500">{(passo.detalhe || '').length}/240</span></span>
                <textarea value={passo.detalhe || ''} maxLength={240} rows={2} onChange={(e) => set({ detalhe: e.target.value })} className={`${CAMPO} mt-1`} />
            </label>
            {ia?.ativa && <AjudaIaDoPasso passo={passo} tipo={tipo} ia={ia} onUsar={(parte) => set(parte)} />}
            <BotaoFoto conteudoId={conteudoId} valor={passo.foto} aoMudar={(u) => set({ foto: u })} />
            {passo.fotoSugerida && !passo.foto && (
                <p className="text-xs font-semibold text-violet-800 bg-violet-50 rounded-lg px-2 py-1.5 break-words">📷 Foto para tirar: {passo.fotoSugerida}</p>
            )}
            <BotaoVideo conteudoId={conteudoId} valor={passo.video} aoMudar={(u) => set({ video: u })} />
            <label className="flex items-center gap-2 min-h-[44px] text-sm text-gray-800">
                <input type="checkbox" checked={passo.perigo === true} onChange={(e) => set({ perigo: e.target.checked })} className="h-5 w-5" />
                ⚠️ Passo com perigo (fica com moldura vermelha)
            </label>

            {tipo === 'DOSAGEM' && (
                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Itens (foto da medida + quantidade)</p>
                    {itens.map((it, i) => (
                        <div key={it.id || i} className="rounded-lg border border-gray-200 p-2 space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input value={it.nome || ''} onChange={(e) => setItem(i, { nome: e.target.value })} placeholder="Nome (ex.: Sanitizante)" className={CAMPO} />
                                <input value={it.quantidade ?? ''} onChange={(e) => setItem(i, { quantidade: e.target.value })} placeholder="Quantidade (ex.: 1, ½)" className={CAMPO} />
                                <input value={it.unidade || ''} onChange={(e) => setItem(i, { unidade: e.target.value })} placeholder="Medida (ex.: tampa cheia)" className={CAMPO} />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <BotaoFoto conteudoId={conteudoId} valor={it.foto} aoMudar={(u) => setItem(i, { foto: u })} rotulo="Foto da medida" />
                                <button type="button" onClick={() => set({ itens: itens.filter((_, idx) => idx !== i) })} className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-red-600" aria-label="Remover item"><Trash2 className="h-4 w-4" /></button>
                            </div>
                        </div>
                    ))}
                    <button type="button" onClick={() => set({ itens: [...itens, { id: novoId('i'), nome: '', quantidade: '', unidade: '', foto: null }] })}
                        className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary text-sm font-semibold"><Plus className="h-4 w-4" /> Adicionar item</button>
                </div>
            )}

            {tipo === 'ROTINA' && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Pergunta do checklist</p>
                    <SelectBusca value={per?.tipo || ''} className="w-full h-11"
                        onChange={(e) => {
                            const t = e.target.value;
                            if (!t) set({ pergunta: null });
                            else if (t === 'NUMERO') set({ pergunta: { tipo: 'NUMERO', rotulo: per?.rotulo || '', obrigatoria: true, min: per?.min ?? null, max: per?.max ?? null, unidade: per?.unidade || '', avisoDesvio: per?.avisoDesvio || '' } });
                            else if (t === 'SIMNAO') set({ pergunta: { tipo: 'SIMNAO', rotulo: per?.rotulo || '', obrigatoria: true, respostaEsperada: 'SIM', avisoDesvio: per?.avisoDesvio || '' } });
                            else set({ pergunta: { tipo: 'FOTO', rotulo: per?.rotulo || '', obrigatoria: true } });
                        }}>
                        <option value="">Sem pergunta (só uma linha de aviso)</option>
                        <option value="NUMERO">Número (ex.: temperatura)</option>
                        <option value="SIMNAO">Sim ou Não</option>
                        <option value="FOTO">Foto</option>
                    </SelectBusca>
                    {per && (
                        <>
                            <input value={per.rotulo || ''} onChange={(e) => setPer({ rotulo: e.target.value })} placeholder="Texto da pergunta (ex.: Freezer 1 — qual a temperatura?)" className={CAMPO} />
                            <label className="flex items-center gap-2 min-h-[44px] text-sm"><input type="checkbox" className="h-5 w-5" checked={per.obrigatoria !== false} onChange={(e) => setPer({ obrigatoria: e.target.checked })} /> Obrigatória</label>
                            {per.tipo === 'NUMERO' && (
                                <div className="grid grid-cols-3 gap-2">
                                    <label className="block text-xs text-gray-600">Mínimo<CampoNumero decimal permiteNegativo value={per.min ?? ''} onChange={(e) => setPer({ min: e.target.value === '' ? null : Number(String(e.target.value).replace(',', '.')) })} className={`${CAMPO} mt-1`} /></label>
                                    <label className="block text-xs text-gray-600">Máximo<CampoNumero decimal permiteNegativo value={per.max ?? ''} onChange={(e) => setPer({ max: e.target.value === '' ? null : Number(String(e.target.value).replace(',', '.')) })} className={`${CAMPO} mt-1`} /></label>
                                    <label className="block text-xs text-gray-600">Unidade<input value={per.unidade || ''} onChange={(e) => setPer({ unidade: e.target.value })} placeholder="°C" className={`${CAMPO} mt-1`} /></label>
                                </div>
                            )}
                            {per.tipo === 'SIMNAO' && (
                                <SelectBusca value={per.respostaEsperada === 'NAO' ? 'NAO' : 'SIM'} onChange={(e) => setPer({ respostaEsperada: e.target.value })} className="w-full h-11">
                                    <option value="SIM">Resposta certa: Sim</option>
                                    <option value="NAO">Resposta certa: Não</option>
                                </SelectBusca>
                            )}
                            {per.tipo !== 'FOTO' && (
                                <input value={per.avisoDesvio || ''} onChange={(e) => setPer({ avisoDesvio: e.target.value })} placeholder="O que fazer se estiver fora do normal" className={CAMPO} />
                            )}
                        </>
                    )}
                </div>
            )}

            <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">Como a equipe vê</p>
                <PassoCard passo={passo} numero={null} semOuvir />
            </div>
        </div>
    );
}
