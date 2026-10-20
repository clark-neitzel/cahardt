import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Camera, Check, Loader2, ThumbsUp, ThumbsDown, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import comoFazerService, { mensagemErro, codigoErro, semResposta, novoUuid, urlMidia, lerSessaoTablet } from '../../services/comoFazerService';
import { useAuth } from '../../contexts/AuthContext';
import tarefaService from '../../services/tarefaService';
import TelaEquipe from './TelaEquipe';
import { useBaseComoFazer } from './BaseComoFazer';
import PassoCard from './PassoCard';
import TecladoNumerico from './TecladoNumerico';
import { reduzirImagem } from './imagem';

const num = (txt) => {
    if (txt === '' || txt == null || txt === '-') return null;
    const n = Number(String(txt).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};
const fmtNum = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','));

// Mesma regra do servidor, SÓ para dar feedback na hora. Quem decide é o servidor.
function desvioLocal(pergunta, valor) {
    if (!pergunta) return false;
    if (pergunta.tipo === 'NUMERO') {
        const n = typeof valor === 'number' ? valor : num(valor);
        if (n == null) return false;
        if (pergunta.min != null && n < pergunta.min) return true;
        if (pergunta.max != null && n > pergunta.max) return true;
        return false;
    }
    if (pergunta.tipo === 'SIMNAO') {
        if (!valor) return false;
        return valor !== (pergunta.respostaEsperada === 'NAO' ? 'NAO' : 'SIM');
    }
    return false;
}

export default function Checklist() {
    const { id } = useParams();
    const [busca] = useSearchParams();
    const navigate = useNavigate();
    const { base, tablet } = useBaseComoFazer();
    const { user } = useAuth();
    const tarefaId = busca.get('tarefa') || '';
    const dataQuery = busca.get('data') || '';
    const horaAlvo = busca.get('hora') || '';
    // quem está preenchendo (o rascunho é só dele): funcionário do tablet ou usuário do app — NÃO depende do /me
    const quem = tablet ? (lerSessaoTablet()?.funcionario?.id || 'tablet') : (user?.id || 'app');

    const [tentativa, setTentativa] = useState(0);
    const [dataServidor, setDataServidor] = useState('');
    const dataRef = dataQuery || dataServidor; // a data SEMPRE vem do servidor (fuso de São Paulo)
    const [conteudo, setConteudo] = useState(null);
    const [erroData, setErroData] = useState('');
    const [erroConteudo, setErroConteudo] = useState('');
    const erroCarga = erroConteudo || erroData;
    const [respostas, setRespostas] = useState({}); // passoId -> { valor, foto, enviando }
    const [chave, setChave] = useState('');
    const [teclado, setTeclado] = useState(null);   // { passoId, texto }
    const [enviando, setEnviando] = useState(false);
    const [falhaEnvio, setFalhaEnvio] = useState('');
    const [feito, setFeito] = useState(null);       // resposta do servidor
    const chaveCarregada = useRef('');

    useEffect(() => {
        if (dataQuery) return;
        comoFazerService.execucoesHoje(id)
            .then((r) => { if (r?.dataRef) { setDataServidor(r.dataRef); setErroData(''); } else setErroData('Não consegui saber a data de hoje.'); })
            .catch((e) => setErroData(mensagemErro(e)));
    }, [id, dataQuery, tentativa]);

    useEffect(() => {
        comoFazerService.conteudo(id).then((c) => { setConteudo(c); setErroConteudo(''); }).catch((e) => setErroConteudo(mensagemErro(e)));
    }, [id, tentativa]);

    // Chave do rascunho = conteúdo + quem + DATA do servidor + horário. Rascunho de outro dia nunca volta.
    const chaveRascunho = dataRef ? `cf_rascunho_${id}_${quem}_${dataRef}_${horaAlvo}` : '';

    useEffect(() => {
        if (!chaveRascunho || chaveCarregada.current === chaveRascunho) return;
        chaveCarregada.current = chaveRascunho;
        try {
            // descarta rascunhos antigos (outra data/horário) deste mesmo conteúdo e pessoa
            const prefixo = `cf_rascunho_${id}_${quem}_`;
            Object.keys(sessionStorage).filter((k) => k.startsWith(prefixo) && k !== chaveRascunho).forEach((k) => sessionStorage.removeItem(k));
            const raw = sessionStorage.getItem(chaveRascunho);
            const r = raw ? JSON.parse(raw) : null;
            if (r?.chave) { setChave(r.chave); setRespostas(r.respostas || {}); return; }
        } catch { /* rascunho ilegível: começa limpo */ }
        setChave(novoUuid());
        setRespostas({});
    }, [chaveRascunho, id, quem]);

    useEffect(() => {
        if (!chaveRascunho || !chave || feito) return;
        try {
            const limpo = Object.fromEntries(Object.entries(respostas).map(([k, v]) => [k, { valor: v.valor ?? null, foto: v.foto ?? null }]));
            sessionStorage.setItem(chaveRascunho, JSON.stringify({ chave, respostas: limpo }));
        } catch { /* storage cheio/bloqueado */ }
    }, [respostas, chave, chaveRascunho, feito]);

    const passos = useMemo(() => {
        const secoes = Array.isArray(conteudo?.versao?.doc?.secoes) ? conteudo.versao.doc.secoes : [];
        return secoes.flatMap((s) => (Array.isArray(s?.passos) ? s.passos : []));
    }, [conteudo]);

    const definir = useCallback((passoId, parte) => {
        setRespostas((r) => ({ ...r, [passoId]: { ...(r[passoId] || {}), ...parte } }));
    }, []);

    const obrigatoriasOk = passos.every((p) => {
        if (!p.pergunta || p.pergunta.obrigatoria === false) return true;
        const r = respostas[p.id] || {};
        if (p.pergunta.tipo === 'FOTO') return !!r.foto;
        return r.valor !== undefined && r.valor !== null && r.valor !== '';
    });
    const subindo = Object.values(respostas).some((r) => r.enviando);
    const podeEnviar = !!conteudo && !!dataRef && passos.some((p) => p.pergunta) && obrigatoriasOk && !subindo && !enviando && !!chave;

    const tirarFoto = async (passoId, arquivo) => {
        if (!arquivo) return;
        definir(passoId, { enviando: true });
        try {
            const reduzida = await reduzirImagem(arquivo);
            const r = await comoFazerService.upload(reduzida, 'execucao');
            definir(passoId, { foto: r.url, enviando: false });
        } catch (e) {
            definir(passoId, { enviando: false });
            toast.error(mensagemErro(e, 'Não consegui enviar a foto. Tente de novo.'));
        }
    };

    const pronto = async () => {
        setEnviando(true); setFalhaEnvio('');
        try {
            const lista = passos.filter((p) => p.pergunta).map((p) => {
                const r = respostas[p.id] || {};
                const valor = p.pergunta.tipo === 'NUMERO' ? num(r.valor) : (r.valor ?? null);
                return { passoId: p.id, valor, foto: r.foto || null };
            });
            const corpo = { chave, respostas: lista };
            corpo.dataRef = dataRef;
            if (horaAlvo) corpo.horaAlvo = horaAlvo;
            if (tarefaId) corpo.tarefaId = tarefaId;
            const r = await comoFazerService.executar(id, corpo);
            try { sessionStorage.removeItem(chaveRascunho); } catch { /* ignora */ }
            setFeito(r);
        } catch (e) {
            if (semResposta(e)) setFalhaEnvio('Não consegui enviar. Toque para tentar de novo.');
            else if (codigoErro(e) === 'FALTAM_OBRIGATORIAS') setFalhaEnvio('Falta responder alguma pergunta.');
            else setFalhaEnvio(mensagemErro(e));
        } finally { setEnviando(false); }
    };

    const depois = async () => {
        if (tarefaId && !tablet) { try { await tarefaService.adiar(tarefaId, dataRef); } catch { /* adiar é secundário */ } }
        navigate(base);
    };

    if (erroCarga && (!conteudo || !dataRef)) {
        return (
            <TelaEquipe titulo="Checklist">
                <div className="rounded-xl bg-red-50 text-red-700 font-semibold p-4 space-y-3">
                    <p>{erroCarga}</p>
                    <button type="button" onClick={() => { setErroData(''); setErroConteudo(''); setTentativa((n) => n + 1); }} className="w-full min-h-[56px] rounded-full bg-primary hover:bg-primaryDark text-white font-bold">Tentar de novo</button>
                </div>
            </TelaEquipe>
        );
    }
    if (!conteudo || (!dataRef && !erroCarga)) return <TelaEquipe titulo="Checklist"><Loader2 className="h-8 w-8 animate-spin mx-auto my-10 text-primary" /></TelaEquipe>;

    if (feito) {
        const desvios = Array.isArray(feito.execucao?.desvios) ? feito.execucao.desvios : [];
        return (
            <TelaEquipe titulo="Registrado" mostrarVoltar={false}>
                <div className="rounded-2xl bg-white border border-gray-200 p-6 text-center space-y-3">
                    <div className="mx-auto h-20 w-20 rounded-full bg-primary text-white flex items-center justify-center"><Check className="h-12 w-12" /></div>
                    <h2 className="text-xl font-bold text-gray-900">{conteudo.titulo}: registrado ✓</h2>
                    {desvios.length > 0 && (
                        <div className="text-left space-y-2">
                            {desvios.map((d, i) => (
                                <div key={d.passoId || i} className="rounded-xl border-l-4 border-red-600 bg-red-50 p-3 text-sm">
                                    <b className="text-red-700">{d.rotulo || 'Fora do normal'}</b>
                                    {d.mensagem ? <div className="text-gray-900">{d.mensagem}</div> : null}
                                </div>
                            ))}
                            <p className="font-bold text-red-700 text-center">{feito.tarefaDesvio?.criada ? 'O encarregado foi avisado.' : 'Avise o encarregado.'}</p>
                        </div>
                    )}
                    <button type="button" onClick={() => navigate(base)} className="w-full min-h-[56px] rounded-full bg-primary hover:bg-primaryDark text-white font-bold text-lg">Voltar</button>
                </div>
            </TelaEquipe>
        );
    }

    return (
        <TelaEquipe titulo={conteudo.titulo} emoji={conteudo.icone || '📋'} subtitulo={horaAlvo ? `Rotina das ${horaAlvo}` : 'Checklist'} voltarPara={base}>
            {passos.length === 0 ? (
                <p className="rounded-xl bg-white border border-gray-200 p-4 text-gray-700">Este checklist ainda não tem passos.</p>
            ) : (
                <div className="space-y-3">
                    {passos.map((p) => {
                        const r = respostas[p.id] || {};
                        const per = p.pergunta;
                        const desvio = per ? desvioLocal(per, r.valor) : false;
                        return (
                            <div key={p.id} className={`rounded-2xl p-2 ${desvio ? 'bg-red-50 border-2 border-red-500' : ''}`}>
                                <PassoCard passo={p} compacto semOuvir={false} />
                                {per && (
                                    <div className="px-2 pt-2 pb-1 space-y-2">
                                        <div className="font-bold text-gray-900">{per.rotulo || ''}{per.obrigatoria === false ? <span className="text-gray-600 font-normal"> (se precisar)</span> : null}</div>
                                        {per.tipo === 'NUMERO' && (
                                            <button type="button" onClick={() => setTeclado({ passoId: p.id, texto: r.valor != null ? fmtNum(r.valor) : '' })}
                                                className={`w-full min-h-[64px] rounded-xl border-2 text-2xl font-extrabold ${desvio ? 'border-red-600 bg-white text-red-700' : r.valor != null && r.valor !== '' ? 'border-primary bg-mint text-primaryDark' : 'border-dashed border-gray-400 bg-white text-gray-600 text-base'}`}>
                                                {r.valor != null && r.valor !== '' ? `${fmtNum(r.valor)} ${per.unidade || ''}` : 'Toque para digitar'}
                                            </button>
                                        )}
                                        {per.tipo === 'SIMNAO' && (
                                            <div className="grid grid-cols-2 gap-2">
                                                {[['SIM', 'Sim', ThumbsUp], ['NAO', 'Não', ThumbsDown]].map(([v, rot, Ic]) => {
                                                    const marcado = r.valor === v;
                                                    const ruim = marcado && desvioLocal(per, v);
                                                    return (
                                                        <button key={v} type="button" onClick={() => definir(p.id, { valor: v })}
                                                            className={`min-h-[64px] rounded-xl border-2 text-lg font-extrabold inline-flex items-center justify-center gap-2 ${ruim ? 'border-red-600 bg-red-50 text-red-700' : marcado ? 'border-primary bg-mint text-primaryDark' : 'border-gray-300 bg-white text-gray-800'}`}>
                                                            <Ic className="h-6 w-6" /> {rot}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {per.tipo === 'FOTO' && (
                                            <div className="flex items-center gap-3">
                                                {r.foto && <img src={urlMidia(r.foto)} alt="Foto tirada" className="h-16 w-16 rounded-lg object-cover border border-gray-300" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                                                <label className={`flex-1 min-h-[56px] rounded-xl border-2 border-dashed border-primary text-primary font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer ${r.enviando ? 'opacity-60' : ''}`}>
                                                    {r.enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                                                    {r.enviando ? 'Enviando…' : r.foto ? 'Tirar outra' : 'Tirar foto'}
                                                    <input type="file" accept="image/*" capture="environment" className="hidden" disabled={r.enviando}
                                                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; tirarFoto(p.id, f); }} />
                                                </label>
                                            </div>
                                        )}
                                        {desvio && per.avisoDesvio ? (
                                            <div className="rounded-lg border-l-4 border-red-600 bg-red-100 p-2 text-sm font-semibold text-red-800">{per.avisoDesvio}</div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-40">
                <div className="max-w-4xl mx-auto space-y-2">
                    {falhaEnvio && (
                        <button type="button" onClick={pronto} className="w-full rounded-xl bg-red-50 border border-red-300 text-red-700 font-bold p-3 inline-flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4" /> {falhaEnvio}
                        </button>
                    )}
                    <div className="flex gap-2">
                        <button type="button" onClick={depois} className="min-h-[56px] px-6 rounded-full bg-white border border-gray-300 text-gray-800 font-bold">Depois</button>
                        <button type="button" disabled={!podeEnviar} onClick={pronto}
                            className="flex-1 min-h-[56px] rounded-full bg-primary hover:bg-primaryDark disabled:bg-gray-300 disabled:text-gray-500 text-white font-extrabold text-lg inline-flex items-center justify-center gap-2">
                            {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Pronto
                        </button>
                    </div>
                </div>
            </div>

            {teclado && (
                <div className="fixed inset-0 z-[9000] bg-black/60 flex items-end md:items-center justify-center">
                    <div className="bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-3xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <b className="text-gray-900">{passos.find((x) => x.id === teclado.passoId)?.pergunta?.rotulo || 'Número'}</b>
                            <button type="button" onClick={() => setTeclado(null)} aria-label="Fechar" className="min-h-[56px] min-w-[56px] flex items-center justify-center rounded-full bg-gray-100"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="text-center text-4xl font-extrabold text-primaryDark min-h-[56px] mb-3">{teclado.texto || '—'}</div>
                        <TecladoNumerico valor={teclado.texto} onChange={(t) => setTeclado((x) => ({ ...x, texto: t }))} negativo virgula maxLen={7} />
                        <button type="button" disabled={num(teclado.texto) == null}
                            onClick={() => { definir(teclado.passoId, { valor: num(teclado.texto) }); setTeclado(null); }}
                            className="mt-3 w-full min-h-[56px] rounded-full bg-primary hover:bg-primaryDark disabled:bg-gray-300 text-white font-extrabold text-lg">OK</button>
                    </div>
                </div>
            )}
        </TelaEquipe>
    );
}
