import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ArrowUp, ArrowDown, Trash2, Plus, Loader2, Rocket, Archive, RefreshCw, Save, Sparkles, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSetores, opcoesSetores } from '../../../hooks/useSetores';
import comoFazerService, { mensagemErro, codigoErro, TIPOS } from '../../../services/comoFazerService';
import tarefaService from '../../../services/tarefaService';
import SelectBusca from '../../../components/SelectBusca';
import MultiSelect from '../../../components/MultiSelect';
import PassoEditor from './PassoEditor';
import ModalComecarComIA from './ModalComecarComIA';
import { resumoPergunta } from './PreviaIA';
import { useIaStatus } from '../../../components/ComoFazer/useIaStatus';
import iaService, { registrarResultado, mensagemDeErroIa } from '../../../services/comoFazerIaService';
import { BADGE_CONTEUDO, CLS_BADGE } from '../../../components/ComoFazer/visual';
import { useComoFazerMe } from '../../ComoFazer/hooks/useComoFazerMe';
import ModalPdfLazy from '../../ComoFazer/ModalPdfLazy';

const CAMPO = 'w-full min-h-[44px] border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none';
const novoId = (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
const RECORRENCIAS = [
    ['NUNCA', 'Não se repete (por evento / uma vez)'], ['DIARIA', 'Todo dia'], ['DIAS_UTEIS', 'Segunda a sexta'],
    ['SEMANAL', 'Toda semana'], ['MENSAL', 'Todo mês'], ['DIAS_SEMANA', 'Dias da semana escolhidos'],
];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const BLOCO_ROTULO = { PRINCIPAL: 'Passo a passo', MONTAR: '🔧 Montar', USAR: '▶️ Usar', LIMPAR: '🧼 Limpar', PROBLEMA: '🚨 Deu problema' };

function Caixa({ titulo, children }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 text-xs font-bold uppercase tracking-widest text-gray-600">{titulo}</div>
            <div className="p-4 space-y-3">{children}</div>
        </div>
    );
}

const SUGESTOES = [
    ['naoFazer', 'O que NÃO fazer'],
    ['seDerErrado', 'Se der errado'],
    ['perguntas', 'Perguntas do checklist'],
    ['maisPassos', 'Mais passos'],
];

// Chips ✨ Sugerir: a IA propõe, cada item tem "Usar". Nada entra sozinho.
function SugestoesIa({ doc, meta, conteudoId, alterar, onPassoNovo }) {
    const [carregando, setCarregando] = useState('');
    const [sug, setSug] = useState(null);   // { tipo, usoId, itens, usou }
    const [erro, setErro] = useState('');
    const secoes = Array.isArray(doc.secoes) ? doc.secoes : [];
    const planos = secoes.flatMap((s) => (s.passos || []).map((p) => ({ secao: s.bloco, texto: p.texto || '' })));
    const ehRotina = meta.tipo === 'ROTINA';

    const pedir = async (tipo) => {
        if (carregando) return;
        setCarregando(tipo); setErro(''); setSug(null); usouRef.current = false;
        try {
            const naoFazerAtual = String(doc.naoFazer || '').trim();
            const r = await iaService.sugerir({
                tipo,
                contexto: {
                    tipoConteudo: meta.tipo, titulo: meta.titulo, setor: meta.setores[0] || '', objetivo: doc.objetivo || '',
                    passos: planos.slice(0, 60),
                    ...(naoFazerAtual ? { naoFazer: naoFazerAtual } : {}),
                    ...(Array.isArray(doc.seDerErrado) && doc.seDerErrado.length ? { seDerErrado: doc.seDerErrado.filter((x) => x?.se || x?.entao) } : {}),
                },
            });
            const itens = Array.isArray(r?.itens) ? r.itens : [];
            if (itens.length === 0) { setErro('A IA não teve sugestão desta vez.'); registrarResultado(r?.usoId, 'DESCARTADO', conteudoId); }
            else setSug({ tipo, usoId: r.usoId, itens, usou: false });
        } catch (e) { setErro(mensagemDeErroIa(e)); }
        finally { setCarregando(''); }
    };

    const usouRef = useRef(false);
    const marcarUsou = () => {
        if (!usouRef.current && sug) { usouRef.current = true; registrarResultado(sug.usoId, 'USADO', conteudoId); }   // fora do updater (StrictMode)
        setSug((a) => (a ? { ...a, usou: true } : a));
    };
    const tirar = (i) => setSug((a) => (a ? { ...a, itens: a.itens.filter((_, j) => j !== i) } : a));
    const fechar = () => { if (sug && !usouRef.current) registrarResultado(sug.usoId, 'DESCARTADO', conteudoId); setSug(null); };

    const usar = (item, i) => {
        if (sug.tipo === 'naoFazer') {
            const txt = String(item || '').trim();
            if (!txt) return;
            alterar((d) => ({ ...d, naoFazer: [String(d.naoFazer || '').trim(), txt].filter(Boolean).join(' · ') }));
        } else if (sug.tipo === 'seDerErrado') {
            alterar((d) => ({ ...d, seDerErrado: [...(Array.isArray(d.seDerErrado) ? d.seDerErrado : []), { se: String(item?.se || ''), entao: String(item?.entao || '') }] }));
        } else if (sug.tipo === 'perguntas') {
            const alvo = Number(item?.passoIndice);
            alterar((d) => {
                let k = -1;
                return { ...d, secoes: d.secoes.map((s) => ({ ...s, passos: s.passos.map((p) => { k += 1; return k === alvo && !p.pergunta && item.pergunta ? { ...p, pergunta: item.pergunta } : p; }) })) };
            });
        } else if (sug.tipo === 'maisPassos') {
            const novo = {
                id: novoId('p'), texto: String(item?.texto || '').slice(0, 140), detalhe: item?.detalhe ? String(item.detalhe).slice(0, 240) : null,
                foto: null, video: null, perigo: item?.perigo === true, itens: null, pergunta: null,
                ...(item?.fotoSugerida ? { fotoSugerida: String(item.fotoSugerida).slice(0, 140) } : {}),
            };
            alterar((d) => {
                const alvoGlobal = Number(item?.depoisDoIndice);
                let k = -1; let si = d.secoes.findIndex((s) => s.bloco === item?.secaoBloco);
                if (si < 0) si = d.secoes.length - 1;
                let pos = alvoGlobal === -1 ? 0 : d.secoes[si].passos.length;   // -1 = começo da seção; senão no fim, salvo se o passo-âncora estiver nela
                d.secoes.forEach((s, idx) => s.passos.forEach((_, pi) => { k += 1; if (idx === si && k === alvoGlobal) pos = pi + 1; }));
                return { ...d, secoes: d.secoes.map((s, idx) => (idx === si ? { ...s, passos: [...s.passos.slice(0, pos), novo, ...s.passos.slice(pos)] } : s)) };
            });
            onPassoNovo?.();
        }
        marcarUsou(); tirar(i);
    };

    const rotuloItem = (item) => {
        if (sug.tipo === 'naoFazer') return String(item || '');
        if (sug.tipo === 'seDerErrado') return `Se ${item?.se || ''} → então ${item?.entao || ''}`;
        if (sug.tipo === 'perguntas') return `Passo ${Number(item?.passoIndice) + 1}: ${resumoPergunta(item?.pergunta)}`;
        return `${item?.texto || ''}${item?.fotoSugerida ? ` (📷 ${item.fotoSugerida})` : ''}`;
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {SUGESTOES.filter(([t]) => t !== 'perguntas' || ehRotina).map(([t, r]) => (
                    <button key={t} type="button" onClick={() => pedir(t)} disabled={!!carregando}
                        className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-violet-300 text-violet-800 text-sm font-semibold disabled:opacity-50">
                        {carregando === t ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Sugerir: {r}
                    </button>
                ))}
            </div>
            {erro && <p className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-semibold p-2 break-words" role="alert">{erro}</p>}
            {sug && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-violet-800">✨ Sugestões da IA — nada entra sozinho</p>
                    {sug.itens.length === 0 && <p className="text-sm text-gray-700">Você já usou todas.</p>}
                    {sug.itens.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-lg bg-white border border-violet-100 p-2">
                            <span className="flex-1 min-w-0 text-sm text-gray-900 break-words">{rotuloItem(item)}</span>
                            <button type="button" onClick={() => usar(item, i)} className="min-h-[44px] px-4 rounded-full bg-primary hover:bg-primaryDark text-white text-sm font-semibold shrink-0">Usar</button>
                        </div>
                    ))}
                    <button type="button" onClick={fechar} className="min-h-[44px] px-4 rounded-full bg-white border border-gray-300 text-gray-800 text-sm font-semibold">{sug.usou ? 'Fechar' : 'Descartar'}</button>
                </div>
            )}
        </div>
    );
}

export default function EditorConteudo({ id, onVoltar }) {
    const { setores: listaSetores, carregando: carregandoSetores, erro: erroSetores, aviso: avisoSetores } = useSetores();
    const { ativa: iaAtiva } = useIaStatus();
    const [modalIa, setModalIa] = useState(false);
    const [modalPdf, setModalPdf] = useState(false);
    const { pode } = useComoFazerMe();
    const [carregado, setCarregado] = useState(false);
    const [erro, setErro] = useState('');
    const [meta, setMeta] = useState(null);
    const [doc, setDoc] = useState(null);
    const [avisos, setAvisos] = useState([]);
    const [errosDoc, setErrosDoc] = useState([]); // o que ainda impede de publicar
    const [equipe, setEquipe] = useState([]);
    const [salvo, setSalvo] = useState('salvo'); // salvo | salvando | pendente | erro
    const [sel, setSel] = useState(null);       // { s: índice da seção, p: índice do passo }
    const [salvandoMeta, setSalvandoMeta] = useState(false);
    const [publicando, setPublicando] = useState(false);
    const [modalPublicar, setModalPublicar] = useState(false);
    const [soTexto, setSoTexto] = useState(false);
    const [resultado, setResultado] = useState(null);

    const docRef = useRef(null);
    const edicao = useRef(0);       // contador: cada alteração local sobe
    const timer = useRef(null);
    const emVoo = useRef(null);
    const sujo = useRef(false);   // há alteração ainda não confirmada pelo servidor

    useEffect(() => {
        let vivo = true;
        comoFazerService.detalharAdmin(id)
            .then((d) => {
                if (!vivo) return;
                setMeta({
                    tipo: d.tipo, status: d.status, codigo: d.codigo || '', titulo: d.titulo || '', icone: d.icone || '',
                    setores: d.setores || [], cargos: (d.cargos || []).join(', '), horarios: d.horarios || [],
                    recorrencia: d.recorrencia || 'NUNCA', diasSemana: d.diasSemana || [], responsaveisIds: d.responsaveisIds || [],
                    versaoAtual: d.versaoAtual || null,
                    // PDF: usa SEMPRE a versão publicada; estes dois dados dizem se existe rascunho por cima
                    temRascunho: Array.isArray(d.versoes) && d.versoes.some((v) => v.status === 'RASCUNHO'),
                    versaoPublicada: (Array.isArray(d.versoes) ? d.versoes.find((v) => v.status === 'PUBLICADA')?.numero : null) ?? null,
                });
                setDoc(d.doc); docRef.current = d.doc;
                setAvisos(Array.isArray(d.avisos) ? d.avisos : []);
                setErrosDoc(Array.isArray(d.erros) ? d.erros : []);
                setCarregado(true);
            })
            .catch((e) => { if (vivo) setErro(mensagemErro(e)); });
        tarefaService.equipe().then((l) => { if (vivo) setEquipe(Array.isArray(l) ? l : []); }).catch(() => {});
        return () => { vivo = false; };
    }, [id]);

    // ── autosave do rascunho (usa o doc DEVOLVIDO pelo servidor, que normaliza e gera ids) ──
    // Os PUTs são SERIALIZADOS: um só em voo; o seguinte espera e manda o doc mais recente.
    const salvarAgora = useCallback(async () => {
        clearTimeout(timer.current);
        const anterior = emVoo.current;
        const minha = (async () => {
            if (anterior) { try { await anterior; } catch { /* o erro já foi mostrado por quem enviou */ } }
            const enviado = edicao.current;
            setSalvo('salvando');
            try {
                const r = await comoFazerService.salvarRascunho(id, docRef.current);
                if (edicao.current === enviado) {
                    // nada mudou enquanto salvava: adota o doc normalizado (mantém linhas "Se der errado" ainda vazias)
                    setDoc((local) => {
                        const novo = { ...r.doc, ...(local?.seDerErrado ? { seDerErrado: local.seDerErrado } : {}) };
                        docRef.current = novo;
                        return novo;
                    });
                    sujo.current = false;
                    setMeta((m) => (m && !m.temRascunho ? { ...m, temRascunho: true } : m));
                    setSalvo('salvo');
                } else setSalvo('pendente');
                setAvisos(Array.isArray(r.avisos) ? r.avisos : []);
                setErrosDoc(Array.isArray(r.erros) ? r.erros : []);
                return true;
            } catch (e) {
                setSalvo('erro');
                toast.error(mensagemErro(e, 'Não consegui salvar o rascunho.'));
                return false;
            }
        })();
        emVoo.current = minha;
        const ok = await minha;
        if (emVoo.current === minha) emVoo.current = null;
        return ok;
    }, [id]);

    const alterar = useCallback((fn) => {
        setDoc((atual) => {
            const novo = fn(atual);
            docRef.current = novo;
            return novo;
        });
        edicao.current += 1;
        sujo.current = true;
        setSalvo('pendente');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { salvarAgora(); }, 1200);
    }, [salvarAgora]);

    // ao sair da tela com alteração pendente, manda o PUT na hora (não perde o que foi digitado)
    // (entra na MESMA fila: espera o save em voo terminar e manda o doc mais recente)
    useEffect(() => () => {
        clearTimeout(timer.current);
        if (!sujo.current || !docRef.current) return;
        const anterior = emVoo.current;
        (anterior ? anterior.catch(() => {}) : Promise.resolve())
            .then(() => comoFazerService.salvarRascunho(id, docRef.current))
            .catch(() => {});
    }, [id]);

    const sair = async () => {
        if (salvo === 'pendente' || salvo === 'erro') await salvarAgora();
        onVoltar();
    };

    // ── estrutura ──
    const setSecao = (si, fn) => alterar((d) => ({ ...d, secoes: d.secoes.map((s, i) => (i === si ? fn(s) : s)) }));
    const setPasso = (si, pi, passo) => setSecao(si, (s) => ({ ...s, passos: s.passos.map((p, i) => (i === pi ? passo : p)) }));
    const addPasso = (si) => {
        setSecao(si, (s) => ({ ...s, passos: [...s.passos, { id: novoId('p'), texto: '', detalhe: null, foto: null, video: null, perigo: false, itens: null, pergunta: null }] }));
        setSel({ s: si, p: doc.secoes[si].passos.length });
    };
    const mover = (si, pi, dir) => {
        const j = pi + dir;
        if (j < 0 || j >= secoes[si].passos.length) return;
        setSecao(si, (s) => {
            const lista = [...s.passos]; [lista[pi], lista[j]] = [lista[j], lista[pi]];
            return { ...s, passos: lista };
        });
        // a seleção acompanha o passo que foi movido (ou o que estava selecionado e foi empurrado)
        setSel((atual) => {
            if (!atual || atual.s !== si) return atual;
            if (atual.p === pi) return { s: si, p: j };
            if (atual.p === j) return { s: si, p: pi };
            return atual;
        });
    };
    const remover = (si, pi) => {
        if (!window.confirm('Remover este passo?')) return;
        setSecao(si, (s) => ({ ...s, passos: s.passos.filter((_, i) => i !== pi) }));
        setSel(null);
    };
    const addProblema = () => alterar((d) => ({ ...d, secoes: [...d.secoes, { id: novoId('s'), bloco: 'PROBLEMA', titulo: 'Nova situação', icone: '🚨', passos: [] }] }));
    const removerSecao = (si) => {
        if (!window.confirm('Remover esta situação e todos os passos dela?')) return;
        alterar((d) => ({ ...d, secoes: d.secoes.filter((_, i) => i !== si) })); setSel(null);
    };
    const setCampoDoc = (campo, valor) => alterar((d) => { const n = { ...d }; if (valor) n[campo] = valor; else delete n[campo]; return n; });
    const seDer = Array.isArray(doc?.seDerErrado) ? doc.seDerErrado : [];
    const setSeDer = (lista) => alterar((d) => ({ ...d, seDerErrado: lista }));

    // ── dados do conteúdo ──
    const salvarMeta = async () => {
        setSalvandoMeta(true);
        try {
            const r = await comoFazerService.atualizar(id, {
                titulo: meta.titulo, icone: meta.icone, codigo: meta.codigo || null, setores: meta.setores,
                cargos: meta.cargos.split(',').map((x) => x.trim()).filter(Boolean),
                horarios: meta.horarios.filter(Boolean), recorrencia: meta.recorrencia, diasSemana: meta.diasSemana, responsaveisIds: meta.responsaveisIds,
            });
            toast.success('Dados salvos!');
            if (r?.agenda && r.agenda.ok === false && r.agenda.erro) toast.error(r.agenda.erro, { duration: 8000 });
        } catch (e) { toast.error(mensagemErro(e)); }
        finally { setSalvandoMeta(false); }
    };

    const publicar = async () => {
        setPublicando(true);
        try {
            if (salvo !== 'salvo') { const ok = await salvarAgora(); if (!ok) { setPublicando(false); return; } }
            const r = await comoFazerService.publicar(id, !soTexto);
            setResultado(r);
            setMeta((m) => ({ ...m, status: 'PUBLICADO', temRascunho: false, versaoPublicada: r?.versao?.numero ?? m.versaoPublicada }));
            // o servidor já tirou o selo da IA ao publicar: tira daqui também, sem disparar autosave
            setDoc((d) => { if (!d?.ia) return d; const { ia, ...resto } = d; docRef.current = resto; return resto; }); // eslint-disable-line no-unused-vars
            toast.success(`Versão ${r?.versao?.numero ?? ''} publicada!`);
            setModalPublicar(false);
        } catch (e) {
            const lista = e.response?.data?.erros;
            toast.error(codigoErro(e) === 'VALIDACAO_FALHOU' && Array.isArray(lista) ? `Não dá para publicar:\n• ${lista.join('\n• ')}` : mensagemErro(e), { duration: 9000 });
            setModalPublicar(false);
        } finally { setPublicando(false); }
    };

    const arquivar = async () => {
        if (!window.confirm('Arquivar tira este conteúdo dos tablets e desliga as tarefas da rotina. Continuar?')) return;
        try { await comoFazerService.arquivar(id); setMeta((m) => ({ ...m, status: 'ARQUIVADO' })); toast.success('Arquivado.'); }
        catch (e) { toast.error(mensagemErro(e)); }
    };
    const refazerAgenda = async () => {
        try { const r = await comoFazerService.sincronizarAgenda(id); toast.success(`Agenda refeita (${r.criadas ?? 0} criadas, ${r.desativadas ?? 0} desligadas).`); }
        catch (e) { toast.error(mensagemErro(e)); }
    };

    if (erro) return <p className="rounded-xl bg-red-50 text-red-700 font-semibold p-4">{erro}</p>;
    if (!carregado || !meta || !doc) return <Loader2 className="h-8 w-8 animate-spin mx-auto my-10 text-primary" />;

    const tipo = meta.tipo;
    const ehRotina = tipo === 'ROTINA';
    const secoes = Array.isArray(doc.secoes) ? doc.secoes : [];
    const totalPassos = secoes.reduce((n, x) => n + (x.passos?.length || 0), 0);
    const selecionado = sel && secoes[sel.s]?.passos[sel.p] ? secoes[sel.s].passos[sel.p] : null;
    const textoSalvo = { salvo: '✓ Rascunho salvo', salvando: 'Salvando…', pendente: 'Alterações a salvar…', erro: 'Não salvou — toque em Salvar' }[salvo];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={sair} className="min-h-[44px] px-3 inline-flex items-center gap-1 rounded-full bg-white border border-gray-300 text-gray-700 text-sm font-semibold"><ChevronLeft className="h-4 w-4" /> Voltar</button>
                <h2 className="text-base md:text-xl font-bold text-gray-900 break-words flex-1 min-w-0">{meta.icone || TIPOS[tipo]?.icone} {meta.titulo || 'Sem título'}</h2>
                <span className={`${CLS_BADGE} ${(BADGE_CONTEUDO[meta.status] || BADGE_CONTEUDO.RASCUNHO).cls}`}>{(BADGE_CONTEUDO[meta.status] || BADGE_CONTEUDO.RASCUNHO).rotulo}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-semibold ${salvo === 'erro' ? 'text-red-700' : 'text-gray-600'}`}>{textoSalvo}</span>
                <button type="button" onClick={salvarAgora} disabled={salvo === 'salvando'} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary text-sm font-semibold"><Save className="h-4 w-4" /> Salvar rascunho</button>
                <button type="button" onClick={() => setModalPublicar(true)} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-primary hover:bg-primaryDark text-white text-sm font-semibold"><Rocket className="h-4 w-4" /> Publicar</button>
                {(pode.editar || pode.painel) && (() => {
                    const ligado = meta.status === 'PUBLICADO';
                    const aviso = ligado && (meta.temRascunho || salvo !== 'salvo')
                        ? `O PDF usa a versão publicada${meta.versaoPublicada != null ? ` (v${meta.versaoPublicada})` : ''}, não o rascunho.` : '';
                    const motivo = meta.status === 'ARQUIVADO' ? 'Arquivado: publique de novo para gerar o PDF' : 'Publique primeiro para gerar o PDF';
                    return (
                        <span className="inline-flex flex-col items-start">
                            <button type="button" onClick={() => setModalPdf(true)} disabled={!ligado} aria-disabled={!ligado} title={ligado ? 'Gerar PDF para imprimir' : motivo}
                                className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"><FileText className="h-4 w-4" /> PDF</button>
                            {!ligado && <span className="text-xs text-gray-600 mt-1">{motivo}</span>}
                            {aviso && <span className="text-xs text-amber-800 mt-1">{aviso}</span>}
                        </span>
                    );
                })()}
                {ehRotina && <button type="button" onClick={refazerAgenda} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-gray-300 text-gray-700 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Refazer agenda</button>}
                <button type="button" onClick={arquivar} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-red-300 text-red-700 text-sm font-semibold"><Archive className="h-4 w-4" /> Arquivar</button>
            </div>

            {doc.ia && (
                <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold p-3">
                    ✨ Rascunho feito com ajuda da IA — confira cada passo antes de publicar. O selo some quando você publicar.
                </p>
            )}
            {iaAtiva && totalPassos === 0 && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-2">
                    <p className="text-sm font-bold text-violet-900">✨ Quer que a IA monte o começo?</p>
                    <p className="text-xs text-violet-900">Conte o que você quer ensinar e a IA escreve um rascunho completo, com os passos e qual foto tirar. Você revisa antes de usar.</p>
                    <button type="button" onClick={() => setModalIa(true)} className="w-full md:w-auto min-h-[48px] px-6 rounded-full bg-violet-700 hover:bg-violet-800 text-white font-semibold text-sm inline-flex items-center justify-center gap-2">
                        <Sparkles className="h-4 w-4" /> Começar com a IA
                    </button>
                </div>
            )}
            {resultado?.agenda?.erro && <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold p-3">{resultado.agenda.erro}</p>}
            {errosDoc.length > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm p-3">
                    <b>Falta isto para poder publicar:</b>
                    <ul className="list-disc pl-5">{errosDoc.slice(0, 8).map((a, i) => <li key={i}>{typeof a === 'string' ? a : (a?.mensagem || '')}</li>)}</ul>
                </div>
            )}
            {avisos.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3">
                    <b>Avisos (dá para publicar assim):</b>
                    <ul className="list-disc pl-5">{avisos.slice(0, 6).map((a, i) => <li key={i}>{typeof a === 'string' ? a : (a?.mensagem || '')}</li>)}</ul>
                </div>
            )}

            <Caixa titulo="Dados">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <label className="block md:col-span-2"><span className="text-sm font-medium text-gray-700">Título</span><input value={meta.titulo} onChange={(e) => setMeta({ ...meta, titulo: e.target.value })} className={`${CAMPO} mt-1`} /></label>
                    <label className="block"><span className="text-sm font-medium text-gray-700">Ícone (emoji)</span><input value={meta.icone} maxLength={4} onChange={(e) => setMeta({ ...meta, icone: e.target.value })} className={`${CAMPO} mt-1`} /></label>
                    <label className="block"><span className="text-sm font-medium text-gray-700">Código (só no painel)</span><input value={meta.codigo} onChange={(e) => setMeta({ ...meta, codigo: e.target.value })} placeholder="HIG-001" className={`${CAMPO} mt-1`} /></label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><span className="text-sm font-medium text-gray-700">Setores</span>
                        <div className="mt-1"><MultiSelect options={opcoesSetores(listaSetores, meta.setores, true, !carregandoSetores && !erroSetores)} valueKey="codigo" labelKey="nome" selected={meta.setores} onChange={(v) => setMeta({ ...meta, setores: v })} placeholder="Escolha os setores" />
                            {avisoSetores && <p className="text-xs text-amber-700 font-semibold mt-1">Não consegui carregar os setores. Tente atualizar a página.</p>}</div>
                    </div>
                    <label className="block"><span className="text-sm font-medium text-gray-700">Cargos que treinam (vazio = todos)</span><input value={meta.cargos} onChange={(e) => setMeta({ ...meta, cargos: e.target.value })} placeholder="Auxiliar de cozinha, Cozinheiro" className={`${CAMPO} mt-1`} /></label>
                </div>
                {ehRotina && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div><span className="text-sm font-medium text-gray-700">Horários</span>
                            <div className="mt-1 space-y-2">
                                {meta.horarios.map((h, i) => (
                                    <div key={i} className="flex gap-2">
                                        <input type="time" value={h} onChange={(e) => setMeta({ ...meta, horarios: meta.horarios.map((x, j) => (j === i ? e.target.value : x)) })} className={CAMPO} />
                                        <button type="button" onClick={() => setMeta({ ...meta, horarios: meta.horarios.filter((_, j) => j !== i) })} className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-red-600" aria-label="Remover horário"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                ))}
                                <button type="button" onClick={() => setMeta({ ...meta, horarios: [...meta.horarios, '08:00'] })} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary text-sm font-semibold"><Plus className="h-4 w-4" /> Horário</button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="block"><span className="text-sm font-medium text-gray-700">Repetição</span>
                                <SelectBusca value={meta.recorrencia} onChange={(e) => setMeta({ ...meta, recorrencia: e.target.value })} className="mt-1 w-full h-11">
                                    {RECORRENCIAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                                </SelectBusca>
                            </label>
                            {meta.recorrencia === 'DIAS_SEMANA' && (
                                <div className="flex flex-wrap gap-1">
                                    {DIAS.map((d, i) => (
                                        <button key={d} type="button" onClick={() => setMeta({ ...meta, diasSemana: meta.diasSemana.includes(i) ? meta.diasSemana.filter((x) => x !== i) : [...meta.diasSemana, i] })}
                                            className={`min-h-[44px] min-w-[44px] rounded-full border text-sm font-bold ${meta.diasSemana.includes(i) ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-700'}`}>{d}</button>
                                    ))}
                                </div>
                            )}
                            <div><span className="text-sm font-medium text-gray-700">Encarregado(s) — recebem o alarme e o desvio</span>
                                <div className="mt-1"><MultiSelect options={equipe} valueKey="id" labelKey="nome" selected={meta.responsaveisIds} onChange={(v) => setMeta({ ...meta, responsaveisIds: v })} placeholder="Escolha quem é o encarregado" searchable /></div>
                            </div>
                        </div>
                    </div>
                )}
                <button type="button" onClick={salvarMeta} disabled={salvandoMeta} className="min-h-[44px] px-5 rounded-full bg-primary hover:bg-primaryDark text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60">
                    {salvandoMeta && <Loader2 className="h-4 w-4 animate-spin" />} Salvar dados
                </button>
                {meta.status === 'PUBLICADO' && ehRotina && <p className="text-xs text-gray-600">Mudar horário, repetição ou encarregado refaz a agenda automaticamente.</p>}
            </Caixa>

            <Caixa titulo="Texto do documento">
                <label className="block"><span className="text-sm font-medium text-gray-700">⚠️ Aviso de perigo (faixa vermelha no topo)</span><textarea rows={2} value={doc.avisoPerigo || ''} onChange={(e) => setCampoDoc('avisoPerigo', e.target.value)} className={`${CAMPO} mt-1`} /></label>
                <label className="block"><span className="text-sm font-medium text-gray-700">Para que serve</span><textarea rows={2} value={doc.objetivo || ''} onChange={(e) => setCampoDoc('objetivo', e.target.value)} className={`${CAMPO} mt-1`} /></label>
                <label className="block"><span className="text-sm font-medium text-gray-700">O que precisa</span><textarea rows={2} value={doc.materiais || ''} onChange={(e) => setCampoDoc('materiais', e.target.value)} className={`${CAMPO} mt-1`} /></label>
                <label className="block"><span className="text-sm font-medium text-gray-700">O que NÃO fazer</span><textarea rows={2} value={doc.naoFazer || ''} onChange={(e) => setCampoDoc('naoFazer', e.target.value)} className={`${CAMPO} mt-1`} /></label>
                <div>
                    <span className="text-sm font-medium text-gray-700">Se der errado</span>
                    <div className="mt-1 space-y-2">
                        {seDer.map((r, i) => (
                            <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                                <input value={r.se || ''} onChange={(e) => setSeDer(seDer.map((x, j) => (j === i ? { ...x, se: e.target.value } : x)))} placeholder="Se… (ex.: Sujou o avental)" className={CAMPO} />
                                <input value={r.entao || ''} onChange={(e) => setSeDer(seDer.map((x, j) => (j === i ? { ...x, entao: e.target.value } : x)))} placeholder="Então… (ex.: Troque na hora)" className={CAMPO} />
                                <button type="button" onClick={() => setSeDer(seDer.filter((_, j) => j !== i))} className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-red-600" aria-label="Remover linha"><Trash2 className="h-4 w-4" /></button>
                            </div>
                        ))}
                        <button type="button" onClick={() => setSeDer([...seDer, { se: '', entao: '' }])} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary text-sm font-semibold"><Plus className="h-4 w-4" /> Linha</button>
                    </div>
                </div>
            </Caixa>

            {iaAtiva && totalPassos > 0 && (
                <Caixa titulo="Ajuda da IA no documento">
                    <SugestoesIa doc={doc} meta={meta} conteudoId={id} alterar={alterar} />
                </Caixa>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="space-y-4">
                    {secoes.map((s, si) => (
                        <Caixa key={s.id || si} titulo={s.bloco === 'PROBLEMA' ? 'Situação de problema' : (BLOCO_ROTULO[s.bloco] || 'Passos')}>
                            {s.bloco === 'PROBLEMA' && (
                                <div className="flex gap-2">
                                    <input value={s.titulo || ''} onChange={(e) => setSecao(si, (x) => ({ ...x, titulo: e.target.value }))} placeholder="Nome da situação (ex.: Não esquenta)" className={CAMPO} />
                                    <button type="button" onClick={() => removerSecao(si)} className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-red-600" aria-label="Remover situação"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            )}
                            {s.passos.length === 0 && <p className="text-sm text-gray-600">Nenhum passo ainda.</p>}
                            {s.passos.map((p, pi) => {
                                const ativo = sel && sel.s === si && sel.p === pi;
                                return (
                                    <div key={p.id || pi} className={`flex items-center gap-2 rounded-xl border p-2 ${ativo ? 'border-primary bg-mint/40' : 'border-gray-200'}`}>
                                        <button type="button" onClick={() => setSel({ s: si, p: pi })} className="flex-1 min-w-0 text-left min-h-[44px] flex items-center gap-2">
                                            <span className="h-7 w-7 shrink-0 rounded-full bg-house text-white text-sm font-bold flex items-center justify-center">{pi + 1}</span>
                                            <span className="text-sm text-gray-900 break-words">{p.texto || <i className="text-gray-500">(sem texto)</i>}{p.pergunta ? ' ❓' : ''}{p.perigo ? ' ⚠️' : ''}{p.foto ? ' 📷' : ''}</span>
                                        </button>
                                        <button type="button" onClick={() => mover(si, pi, -1)} className="p-2 min-h-[44px] min-w-[44px] text-gray-600" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                                        <button type="button" onClick={() => mover(si, pi, 1)} className="p-2 min-h-[44px] min-w-[44px] text-gray-600" aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                                        <button type="button" onClick={() => remover(si, pi)} className="p-2 min-h-[44px] min-w-[44px] text-gray-500 hover:text-red-600" aria-label="Remover passo"><Trash2 className="h-4 w-4" /></button>
                                    </div>
                                );
                            })}
                            <button type="button" onClick={() => addPasso(si)} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-primary text-primary text-sm font-semibold"><Plus className="h-4 w-4" /> Passo</button>
                        </Caixa>
                    ))}
                    {tipo === 'MAQUINA' && (
                        <button type="button" onClick={addProblema} className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-full bg-white border border-red-300 text-red-700 text-sm font-semibold"><Plus className="h-4 w-4" /> Situação de problema</button>
                    )}
                </div>

                <div className="lg:sticky lg:top-3">
                    {selecionado ? (
                        <Caixa titulo={`Passo ${sel.p + 1}`}>
                            <PassoEditor key={selecionado.id} passo={selecionado} tipo={tipo} conteudoId={id} onChange={(p) => setPasso(sel.s, sel.p, p)} ia={{ ativa: iaAtiva, titulo: meta.titulo, objetivo: doc.objetivo || '' }} />
                        </Caixa>
                    ) : <p className="rounded-xl bg-white border border-gray-200 p-6 text-center text-sm text-gray-600">Toque num passo para editar. Aqui aparece como a equipe vai ver.</p>}
                </div>
            </div>

            {modalPdf && <ModalPdfLazy conteudoId={id} titulo={meta.titulo || 'Conteúdo'} avisoRascunho={meta.temRascunho || salvo !== 'salvo'} aoFechar={() => setModalPdf(false)} />}
            {modalIa && (
                <ModalComecarComIA modo="vazio" conteudoId={id}
                    contexto={{ tipo: meta.tipo, titulo: meta.titulo, setor: meta.setores[0] || '', setorNome: listaSetores.find((x) => x.codigo === meta.setores[0])?.nome || meta.setores[0] || '' }}
                    onAplicar={(docIA) => {
                        // nunca apaga o que a pessoa já escreveu: texto já preenchido fica; a IA só completa o que está vazio
                        const mantidos = [];
                        alterar((d) => {
                            const novo = { ...docIA };
                            [['objetivo', 'Para que serve'], ['materiais', 'O que precisa'], ['avisoPerigo', 'Aviso de perigo'], ['naoFazer', 'O que NÃO fazer']].forEach(([c, r]) => {
                                if (String(d?.[c] || '').trim()) { if (String(docIA[c] || '').trim() && docIA[c] !== d[c]) mantidos.push(r); novo[c] = d[c]; }
                            });
                            const meus = Array.isArray(d?.seDerErrado) ? d.seDerErrado.filter((x) => x?.se || x?.entao) : [];
                            if (meus.length) { if (Array.isArray(docIA.seDerErrado) && docIA.seDerErrado.length) mantidos.push('Se der errado'); novo.seDerErrado = d.seDerErrado; }
                            return novo;
                        });
                        if (mantidos.length) toast(`Mantive o que você já tinha escrito em: ${mantidos.join(', ')}.`, { duration: 7000 });
                        setSel(null);
                    }} onFechar={() => setModalIa(false)} />
            )}

            {modalPublicar && (
                <div className="fixed inset-0 z-[9000] bg-black/60 flex items-center justify-center p-3">
                    <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
                        <h3 className="text-lg font-bold text-gray-900">Publicar esta versão?</h3>
                        <p className="text-sm text-gray-700">A equipe passa a ver o texto novo. Por padrão, todo mundo precisa treinar de novo.</p>
                        <label className="flex items-start gap-2 text-sm text-gray-800 min-h-[44px]">
                            <input type="checkbox" checked={soTexto} onChange={(e) => setSoTexto(e.target.checked)} className="h-5 w-5 mt-0.5" />
                            Foi só uma correção de texto (ninguém precisa treinar de novo)
                        </label>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setModalPublicar(false)} className="flex-1 min-h-[48px] rounded-full bg-white border border-gray-300 text-gray-800 font-semibold">Cancelar</button>
                            <button type="button" onClick={publicar} disabled={publicando} className="flex-1 min-h-[48px] rounded-full bg-primary hover:bg-primaryDark text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
                                {publicando && <Loader2 className="h-4 w-4 animate-spin" />} Publicar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
