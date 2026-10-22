import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, FileText, Loader2, X } from 'lucide-react';
import comoFazerService, { mensagemErroPdf } from '../../services/comoFazerService';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { lazyComRetry } from '../../utils/lazyComRetry';
import MontarPaginas, { AtalhosPaginas, novoUid, BTN_CHIP } from './MontarPaginas';

// O visualizador (pdfjs) pesa: só carrega quando a pessoa pede o PDF.
const VisualizadorPdf = lazyComRetry(() => import('../../components/VisualizadorPdf'));

// ─────────────────────────────────────────────────────────────────────────────
// Ponto de entrada ÚNICO do PDF do Como Fazer (Biblioteca, lista de Conteúdos e editor).
//   <ModalPdf conteudoId titulo aoFechar avisoRascunho />
// A PRÉVIA do servidor é a única fonte de verdade da validação ("cabe / não cabe"); aqui só se desenha.
// O arranjo (quais passos em cada página) vive no servidor (/pdf/arranjo), nunca no localStorage.
// ─────────────────────────────────────────────────────────────────────────────

const FORMATOS = [
    { id: 'CARTAZ', emoji: '🧱', rotulo: 'Cartaz de parede', desc: 'Passos grandes com foto, para colar na parede.', sufixo: 'cartaz' },
    { id: 'FICHARIO', emoji: '📒', rotulo: 'Folha de fichário', desc: 'Procedimento completo, com revisões e treinamento.', sufixo: 'fichario' },
];

const comUid = (paginas) => (Array.isArray(paginas) ? paginas : []).map((p) => ({ uid: p.uid || novoUid(), titulo: p.titulo || '', passoIds: Array.isArray(p.passoIds) ? [...p.passoIds] : [] }));
const fmtDia = (iso) => { try { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR'); } catch { return ''; } };
const fmtQuando = (iso) => { try { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch { return ''; } };

/** Lista os passos do manual na ordem do papel, com a numeração contínua (1..T). */
function listarPassos(conteudo) {
    const secoes = Array.isArray(conteudo?.versao?.doc?.secoes) ? conteudo.versao.doc.secoes : [];
    const lista = [];
    secoes.forEach((s) => (Array.isArray(s?.passos) ? s.passos : []).forEach((p) => {
        if (p && p.id) lista.push({ id: p.id, numero: lista.length + 1, texto: p.texto || "" });
    }));
    return lista;
}
const secoesComPassos = (conteudo) => (Array.isArray(conteudo?.versao?.doc?.secoes) ? conteudo.versao.doc.secoes : []).filter((s) => Array.isArray(s?.passos) && s.passos.length > 0).length;

const nomeSeguro = (s) => String(s || 'conteudo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'conteudo';

export default function ModalPdf({ conteudoId, titulo, aoFechar, avisoRascunho = false }) {
    const [formato, setFormato] = useFiltroSalvo('como-fazer-pdf:formato', 'CARTAZ');
    const [compacto, setCompacto] = useFiltroSalvo('como-fazer-pdf:compacto', false);
    const [tela, setTela] = useState('opcoes'); // 'opcoes' | 'montar'
    const [conteudo, setConteudo] = useState(null);
    const [arranjo, setArranjo] = useState(null);       // { paginas:[{uid,titulo,passoIds}] }
    const [previa, setPrevia] = useState(null);
    const [calculando, setCalculando] = useState(true);
    const [erro, setErro] = useState('');               // erro que impede tudo (sem versão publicada etc.)
    const [erroAtalho, setErroAtalho] = useState('');
    const [erroGerar, setErroGerar] = useState('');
    const [gerando, setGerando] = useState(false);
    const [confirmarOmitidos, setConfirmarOmitidos] = useState(false);
    const [guardar, setGuardar] = useState(true);
    const [sujo, setSujo] = useState(false);            // o dono mexeu e ainda não guardou
    const [guardado, setGuardado] = useState(null);     // { atualizadoEm, atualizadoPor }
    const [atalho, setAtalho] = useState('');
    const [pendenteAtalho, setPendenteAtalho] = useState(null);
    const [umProcessoMotivo, setUmProcessoMotivo] = useState('');
    const [reconc, setReconc] = useState(null);         // { novos, removidos }
    const [verPdf, setVerPdf] = useState(null);         // { blob, nome }
    const [bump, setBump] = useState(0);                // +1 a cada mudança MANUAL do arranjo → pede nova prévia
    const [carregou, setCarregou] = useState(false);
    const [passouMontar, setPassouMontar] = useState(false);
    const editadoMao = useRef(false);                   // mexeu à mão desde o último atalho
    const abortRef = useRef(null);

    const passos = useMemo(() => (Array.isArray(previa?.passos) && previa.passos.length
        ? previa.passos.map((p, i) => ({ id: p.id, numero: p.n ?? p.numero ?? i + 1, texto: p.texto || '', peso: p.peso }))
        : listarPassos(conteudo)), [conteudo, previa]);
    const secoes = secoesComPassos(conteudo);
    const umProcessoIndisponivel = umProcessoMotivo || (conteudo && secoes <= 1
        ? 'Este manual tem uma seção só: use "Passos por página" e dê um nome a cada página.' : '');

    // ── chamada da prévia (cancela a anterior) ──
    const pedirPrevia = useCallback(async (corpo) => {
        abortRef.current?.abort();
        const ctl = new AbortController();
        abortRef.current = ctl;
        setCalculando(true);
        try {
            const r = await comoFazerService.pdfPrevia(conteudoId, corpo, { signal: ctl.signal });
            if (ctl.signal.aborted) return null;
            setPrevia(r);
            setCalculando(false);
            return r;
        } catch (e) {
            if (e?.code === 'ERR_CANCELED' || ctl.signal.aborted) return null;
            setCalculando(false);
            throw e;
        }
    }, [conteudoId]);

    // ── carga inicial / troca de formato: arranjo guardado, senão sugestão automática ──
    useEffect(() => {
        let vivo = true;
        // cancela qualquer prévia manual pendente (o debounce do bump) do formato anterior
        setBump(0); setCarregou(false); setErro(''); setErroGerar(''); setErroAtalho(''); setCalculando(true);
        (async () => {
            try {
                const c = conteudo || await comoFazerService.conteudo(conteudoId);
                if (!vivo) return;
                setConteudo(c);
                let guardadoSrv = null;
                try { guardadoSrv = await comoFazerService.pdfArranjoObter(conteudoId, formato); } catch (e) { if (e?.response?.status === 403) throw e; guardadoSrv = null; }
                if (!vivo) return;
                const temGuardado = guardadoSrv?.existe && guardadoSrv.arranjo?.paginas;
                // com arranjo guardado o servidor já o devolve reconciliado com a versão em vigor; sem ele, sugere o automático
                const corpo = temGuardado ? { formato } : { formato, modo: 'automatico', compacto };
                // r nulo = a chamada foi só abortada por outra prévia (não é erro): reprocessa
                let r = null;
                for (let i = 0; i < 4 && vivo && !r; i++) r = await pedirPrevia(corpo);
                if (!vivo || !r) return;
                setArranjo({ paginas: comUid(r.arranjo?.paginas) });
                if (temGuardado && formato === 'CARTAZ') setCompacto(!!r.arranjo?.compacto);
                setGuardado(temGuardado ? { atualizadoEm: guardadoSrv.atualizadoEm, atualizadoPor: guardadoSrv.atualizadoPor || r.layoutGuardado?.atualizadoPor } : null);
                const lg = r.layoutGuardado || {};
                const novos = (lg.passosNovos?.length ? lg.passosNovos : guardadoSrv?.passosNovos) || [];
                const removidos = (lg.passosRemovidos?.length ? lg.passosRemovidos : guardadoSrv?.passosRemovidos) || [];
                setReconc(temGuardado && (novos.length || removidos.length) ? { novos, removidos } : null);
                setConfirmarOmitidos(false); setSujo(false); setAtalho(temGuardado ? '' : 'automatico'); editadoMao.current = false;
                setCarregou(true);
            } catch (e) {
                if (!vivo) return;
                setErro(mensagemErroPdf(e)); setCalculando(false);
            }
        })();
        return () => { vivo = false; abortRef.current?.abort(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conteudoId, formato]);

    // ── mudança MANUAL do arranjo → prévia nova (debounce 400 ms) ──
    useEffect(() => {
        if (!bump || !arranjo) return undefined;
        const t = setTimeout(() => {
            pedirPrevia({
                formato, confirmarOmitidos,
                arranjo: { paginas: arranjo.paginas.map((p) => ({ titulo: p.titulo, passoIds: p.passoIds })), compacto },
            }).catch((e) => { setCalculando(false); setErroGerar((atual) => atual || mensagemErroPdf(e)); });
        }, 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bump]);

    const mudouArranjo = (novo) => {
        setArranjo({ paginas: novo.paginas });
        setSujo(true); setAtalho(''); editadoMao.current = true; setErroGerar('');
        // a confirmação só deixa de valer se mudou QUAIS passos estão fora (renomear não conta)
        const foraDe = (a) => { const usados = new Set(a.paginas.flatMap((p) => p.passoIds)); return passos.filter((p) => !usados.has(p.id)).map((p) => p.id).sort().join(','); };
        if (arranjo && foraDe(arranjo) !== foraDe(novo)) setConfirmarOmitidos(false);
        setCalculando(true);
        setBump((n) => n + 1);
    };
    const mudouCompacto = (v) => {
        setCompacto(v); setSujo(true); setCalculando(true); setConfirmarOmitidos(false);
        // o bump dispara com o valor novo na próxima renderização
        setTimeout(() => setBump((n) => n + 1), 0);
    };
    const mudouConfirmar = (v) => {
        setConfirmarOmitidos(v); setCalculando(true);
        setTimeout(() => setBump((n) => n + 1), 0);
    };

    // ── atalhos (o servidor devolve o arranjo sugerido) ──
    const aplicarAtalho = async (def) => {
        setErroAtalho(''); setPendenteAtalho(null); setCalculando(true);
        try {
            const r = await pedirPrevia({ formato, modo: def.modo, passosPorPagina: def.passosPorPagina, compacto });
            if (!r) return;
            if (r.modoIndisponivel) {
                // o servidor não aplicou o atalho: mantém o arranjo da tela e refaz a prévia para ele
                const motivo = r.modoIndisponivel.motivo || 'Não dá para usar este atalho neste manual.';
                setUmProcessoMotivo(motivo); setErroAtalho(motivo); setBump((n) => n + 1);
                return;
            }
            setArranjo({ paginas: comUid(r.arranjo?.paginas) });
            setAtalho(def.id); setSujo(true); editadoMao.current = false; setConfirmarOmitidos(false); setErroGerar('');
        } catch (e) {
            setErroAtalho(mensagemErroPdf(e));
            setCalculando(false);
        }
    };
    const pedirAtalho = (def) => {
        if (!def) return;
        if (editadoMao.current) setPendenteAtalho(def); else aplicarAtalho(def);
    };

    const voltarAutomatico = async () => {
        try { await comoFazerService.pdfArranjoApagar(conteudoId, formato); } catch { /* sem arranjo guardado: segue */ }
        setGuardado(null); setReconc(null);
        await aplicarAtalho({ id: 'automatico', modo: 'automatico' });
        setSujo(false);
    };

    // ── guardar o arranjo ──
    const guardarAgora = useCallback(async (aoGerar = false) => {
        // fechar/cancelar só grava se a pessoa passou pela tela Montar; gerar o PDF grava sempre que marcado
        if (!guardar || !sujo || !arranjo || (!aoGerar && !passouMontar)) return;
        try {
            const r = await comoFazerService.pdfArranjoSalvar(conteudoId, formato, { paginas: arranjo.paginas.map((p) => ({ titulo: p.titulo, passoIds: p.passoIds })), compacto });
            setSujo(false);
            setGuardado({ atualizadoEm: r?.atualizadoEm || new Date().toISOString(), atualizadoPor: r?.atualizadoPor });
        } catch { /* guardar é conveniência: não impede o PDF */ }
    }, [guardar, sujo, arranjo, conteudoId, formato, compacto, passouMontar]);

    const fechar = () => { guardarAgora(); aoFechar?.(); };

    // ── gerar ──
    const avisos = Array.isArray(previa?.avisos) ? previa.avisos : [];
    const passosFora = avisos.find((a) => a.tipo === 'PASSOS_FORA');
    const podeGerar = !!previa?.podeGerar && !calculando && !gerando;
    const nomeArquivo = useMemo(() => {
        const sufixo = FORMATOS.find((f) => f.id === formato)?.sufixo || 'pdf';
        if (previa?.versao != null) return `${nomeSeguro(previa.codigo || titulo)}-v${previa.versao}-${sufixo}.pdf`;
        return previa?.nomeArquivo || `${nomeSeguro(titulo)}-${sufixo}.pdf`;
    }, [previa, formato, titulo]);

    const ver = async () => {
        if (!arranjo || !podeGerar) return;
        setErroGerar(''); setGerando(true);
        try {
            await guardarAgora(true);
            const blob = await comoFazerService.pdfGerar(conteudoId, {
                formato, confirmarOmitidos,
                arranjo: { paginas: arranjo.paginas.map((p) => ({ titulo: p.titulo, passoIds: p.passoIds })), compacto },
            });
            setVerPdf({ blob, nome: nomeArquivo });
        } catch (e) {
            setErroGerar(mensagemErroPdf(e));
            // o servidor discordou: refaz a prévia para a tela mostrar o motivo no cartão certo
            setBump((n) => n + 1);
        } finally { setGerando(false); }
    };

    const limite = previa?.limite?.porPagina;
    const nPaginas = arranjo?.paginas.length || 0;
    const bloqueio = Array.isArray(previa?.bloqueios) && previa.bloqueios[0]?.mensagem;
    const resumo = !previa ? '' : (previa.podeGerar
        ? `${nPaginas} ${nPaginas === 1 ? 'página' : 'páginas'} · ${previa.totalPassos ?? passos.length} passos · tudo cabe`
        : (bloqueio || (passosFora ? passosFora.mensagem : 'Confira as páginas.')));

    const inicio = (
        <div className="space-y-5">
            {/* topo: o que será impresso */}
            <div className="rounded-xl bg-mint/60 border border-mint p-3 text-sm text-gray-900">
                {previa?.versao != null
                    ? <>Imprime a <b>versão {previa.versao}</b>{(previa?.publicadaEm || conteudo?.versao?.publicadaEm) ? <>, publicada em {fmtDia(previa?.publicadaEm || conteudo.versao.publicadaEm)}</> : null}.</>
                    : 'Imprime a versão publicada.'}
                {avisoRascunho && <p className="mt-1 font-semibold text-amber-800">O PDF usa a versão publicada{previa?.versao != null ? ` (v${previa.versao})` : ''}, não o rascunho.</p>}
            </div>

            <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600">1 · Formato</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {FORMATOS.map((f) => (
                        <button key={f.id} type="button" onClick={() => setFormato(f.id)} aria-pressed={formato === f.id}
                            className={`text-left min-h-[64px] rounded-xl border-2 p-3 ${formato === f.id ? 'border-primary bg-mint/40' : 'border-gray-200 bg-white hover:border-primary'}`}>
                            <span className="block font-bold text-gray-900">{f.emoji} {f.rotulo}</span>
                            <span className="block text-xs text-gray-600 mt-0.5">{f.desc}</span>
                        </button>
                    ))}
                    <div aria-disabled="true" className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-3 opacity-70 md:col-span-2">
                        <span className="block font-bold text-gray-700">📋 Folha de registro</span>
                        <span className="block text-xs text-gray-600 mt-0.5">Em breve.</span>
                    </div>
                </div>
            </section>

            <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-600">2 · Páginas</h3>
                {!carregou && !erro ? (
                    <p className="text-sm text-gray-700 inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Calculando as páginas…</p>
                ) : arranjo && (
                    <>
                        <AtalhosPaginas ativo={atalho} onEscolher={pedirAtalho} umProcessoIndisponivel={umProcessoIndisponivel} ocupado={calculando && !carregou} />
                        {pendenteAtalho && (
                            <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 space-y-2">
                                <p className="text-sm font-semibold text-amber-900">Isso refaz as páginas que você montou. Continuar?</p>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => aplicarAtalho(pendenteAtalho)} className="flex-1 min-h-[44px] rounded-full bg-primary text-white text-sm font-semibold">Continuar</button>
                                    <button type="button" onClick={() => setPendenteAtalho(null)} className="flex-1 min-h-[44px] rounded-full bg-white border border-gray-300 text-gray-800 text-sm font-semibold">Cancelar</button>
                                </div>
                            </div>
                        )}
                        {erroAtalho && <p className="rounded-xl bg-red-50 text-red-700 text-sm font-semibold p-3">{erroAtalho}</p>}
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => { setPassouMontar(true); setTela('montar'); }} className={`${BTN_CHIP} bg-white border-primary text-primary`}>Montar as páginas</button>
                            {guardado && <button type="button" onClick={voltarAutomatico} className={`${BTN_CHIP} bg-white border-gray-300 text-gray-700`}>Voltar ao automático</button>}
                        </div>
                        <p className={`text-sm font-semibold ${previa?.podeGerar ? 'text-green-800' : 'text-red-700'}`} aria-live="polite">
                            {calculando ? 'Conferindo…' : resumo}
                        </p>
                        {formato === 'CARTAZ' && (
                            <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
                                <input type="checkbox" checked={!!compacto} onChange={(e) => mudouCompacto(e.target.checked)} className="mt-1 h-5 w-5 accent-primary" />
                                <span className="text-sm text-gray-800">Letra e foto menores (até {previa?.limite?.compactoAte || 8} por página)</span>
                            </label>
                        )}
                    </>
                )}
            </section>

            {reconc && (
                <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900">
                    {reconc.novos.length > 0 && <p>A versão {previa?.versao ?? ''} trouxe {reconc.novos.length} {reconc.novos.length === 1 ? 'passo novo' : 'passos novos'}. {reconc.novos.length === 1 ? 'Ele está' : 'Eles estão'} em <b>Fora das páginas</b>: coloque em uma página.</p>}
                    {reconc.removidos.length > 0 && <p>{reconc.removidos.length === 1 ? '1 passo foi removido do manual e saiu' : `${reconc.removidos.length} passos foram removidos do manual e saíram`} das páginas.</p>}
                </div>
            )}

            {(avisos.length > 0 || passosFora) && (
                <section className="space-y-2">
                    {avisos.map((a, i) => (
                        <p key={i} className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 flex items-start gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{a.mensagem}</span></p>
                    ))}
                    {passosFora && (
                        <label className="flex items-start gap-3 min-h-[44px] rounded-xl border-2 border-amber-400 bg-white p-3 cursor-pointer">
                            <input type="checkbox" checked={confirmarOmitidos} onChange={(e) => mudouConfirmar(e.target.checked)} className="mt-1 h-5 w-5 accent-primary" />
                            <span className="text-sm font-semibold text-gray-900">Sim, imprimir sem {Array.isArray(passosFora.passoIds) && passosFora.passoIds.length === 1 ? 'esse passo' : 'esses passos'}</span>
                        </label>
                    )}
                </section>
            )}

            {erroGerar && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold p-3">{erroGerar}</p>}
        </div>
    );

    const montar = arranjo && (
        <div className="space-y-4">
            <AtalhosPaginas ativo={atalho} onEscolher={pedirAtalho} umProcessoIndisponivel={umProcessoIndisponivel} ocupado={calculando && !carregou} />
            {pendenteAtalho && (
                <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 space-y-2">
                    <p className="text-sm font-semibold text-amber-900">Isso refaz as páginas que você montou. Continuar?</p>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => aplicarAtalho(pendenteAtalho)} className="flex-1 min-h-[44px] rounded-full bg-primary text-white text-sm font-semibold">Continuar</button>
                        <button type="button" onClick={() => setPendenteAtalho(null)} className="flex-1 min-h-[44px] rounded-full bg-white border border-gray-300 text-gray-800 text-sm font-semibold">Cancelar</button>
                    </div>
                </div>
            )}
            {erroAtalho && <p className="rounded-xl bg-red-50 text-red-700 text-sm font-semibold p-3">{erroAtalho}</p>}
            {reconc && (
                <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-sm text-amber-900">
                    {reconc.novos.length > 0 && <p>Passos novos desta versão: {reconc.novos.length}. Estão em <b>Fora das páginas</b>.</p>}
                    {reconc.removidos.length > 0 && <p>{reconc.removidos.length} passo(s) removido(s) do manual saíram das páginas.</p>}
                </div>
            )}
            <MontarPaginas passos={passos} arranjo={arranjo} resumo={previa?.paginasResumo} limite={limite} formato={formato} aoMudar={mudouArranjo} ocupado={false} />
            <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
                <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} className="mt-1 h-5 w-5 accent-primary" />
                <span className="text-sm text-gray-800"><b>Guardar este arranjo</b> para a próxima vez
                    {guardado?.atualizadoEm ? <span className="block text-xs text-gray-600">Arranjo guardado{guardado.atualizadoPor?.nome || typeof guardado.atualizadoPor === 'string' ? ` por ${guardado.atualizadoPor?.nome || guardado.atualizadoPor}` : ''} em {fmtQuando(guardado.atualizadoEm)}</span> : null}
                </span>
            </label>
            <p className={`text-sm font-semibold ${previa?.podeGerar ? 'text-green-800' : 'text-red-700'}`} aria-live="polite">{calculando ? 'Conferindo…' : resumo}</p>
        </div>
    );

    return createPortal(
        <>
            <div className="fixed inset-0 z-[9000] bg-black/60 flex items-end md:items-center justify-center" onClick={fechar}>
                <div role="dialog" aria-modal="true" aria-label="PDF do conteúdo" onClick={(e) => e.stopPropagation()}
                    className={`bg-white w-full ${tela === 'montar' ? 'md:max-w-6xl' : 'md:max-w-xl'} max-h-[94vh] md:max-h-[90vh] rounded-t-2xl md:rounded-2xl flex flex-col overflow-hidden`}>
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
                        {tela === 'montar' && (
                            <button type="button" onClick={() => setTela('opcoes')} aria-label="Voltar" className="min-h-[44px] min-w-[44px] rounded-full bg-gray-100 text-gray-800 flex items-center justify-center"><ArrowLeft className="h-5 w-5" /></button>
                        )}
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                            <h2 className="font-bold text-gray-900 truncate">{tela === 'montar' ? 'Montar cada página' : 'PDF para imprimir'}</h2>
                            <p className="text-xs text-gray-600 truncate">{titulo}</p>
                        </div>
                        <button type="button" onClick={fechar} aria-label="Fechar" className="min-h-[44px] min-w-[44px] rounded-full bg-white border border-gray-300 text-gray-800 flex items-center justify-center"><X className="h-5 w-5" /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain p-4">
                        {erro ? <p role="alert" className="rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold p-4">{erro}</p>
                            : (tela === 'montar' ? montar : inicio)}
                    </div>

                    <div className="border-t border-gray-200 bg-white p-3 flex gap-2">
                        {tela === 'montar'
                            ? <button type="button" onClick={() => setTela('opcoes')} className="flex-1 min-h-[48px] rounded-full bg-white border border-primary text-primary font-bold">Pronto, voltar</button>
                            : <button type="button" onClick={fechar} className="min-h-[48px] px-5 rounded-full bg-white border border-gray-300 text-gray-800 font-semibold">Cancelar</button>}
                        <button type="button" onClick={ver} disabled={!podeGerar || !!erro}
                            className="flex-1 min-h-[48px] rounded-full bg-primary hover:bg-primaryDark text-white font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50">
                            {gerando ? <><Loader2 className="h-4 w-4 animate-spin" /> Montando o PDF…</> : 'Ver o PDF'}
                        </button>
                    </div>
                </div>
            </div>
            {verPdf && (
                <Suspense fallback={<div className="fixed inset-0 z-[9500] bg-black/60 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>}>
                    <VisualizadorPdf blob={verPdf.blob} nomeArquivo={verPdf.nome} titulo={titulo} onFechar={() => setVerPdf(null)} />
                </Suspense>
            )}
        </>,
        document.body,
    );
}
