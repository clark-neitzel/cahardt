import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronLeft, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { useNovidades } from '../../hooks/useNovidades';
import { useContagemSolicitacoesAgente } from '../../hooks/useSolicitacoesAgente';
import { useDecisaoSolicitacao } from '../../hooks/useDecisaoSolicitacao';
import chatLukeService from '../../services/chatLukeService';
import LukeMascote, { precarregarLuke } from './LukeMascote';
import AbaAjuda from './AbaAjuda';
import AbaPedir from './AbaPedir';
import AbaAutorizacoes from './AbaAutorizacoes';
import { FaixaNovidade, ListaNovidades, VisorNovidade } from './CardNovidade';
import { limparCacheAnexos } from './AnexosChat';
import { SLUG_OK } from './lukeHooks';
import { ehAdmin, lukeVisivel, podeUsarChat, podeVerAjuda } from './permissoesLuke';
import { useAbaVisivel, useAreaVisivel, useJanela, useMovimentoReduzido } from './lukeHooks';
import './luke.css';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LUKE — o cachorro do canto da tela. SUBSTITUI o Clippy (computador E celular).
//   Novidades (faixa/balão/sino)  → Pode_Ver_Clippy !== false  (chave mantida, rótulo "Assistente Luke")
//   Aba "Tirar dúvida"            → Pode_Ver_Clippy !== false  (cérebro: copilotoService do backend)
//   Aba "Pedir ao Luke"           → Pode_Usar_Chat_Luke === true ou admin (BPO financeiro, chat gravado)
//   Aba "Autorizações"            → só administrador (decidir os pedidos do Luke sem sair do chat)
// Celular (< 768 px): cachorro FIXO no canto (não arrasta: brigaria com a rolagem) e painel em folha cheia.
// Computador/iPad: arrastável como o Clippy era (posição salva em `clippy_pos`, chave mantida).
// ─────────────────────────────────────────────────────────────────────────────────────────────

const CHAVE_POS = 'clippy_pos';
// Padrão do computador: acima das barras fixas de botões (Cadastrar Cliente, Gerar, Salvar produto…), como o Clippy ({20, 92}).
const POS_PADRAO = { right: 20, bottom: 96 };
const BAL_AUT = 'luke_balao_aut';

function lerPos() {
    try {
        const s = JSON.parse(localStorage.getItem(CHAVE_POS));
        if (s && typeof s.right === 'number' && typeof s.bottom === 'number') return s;
    } catch { /* ignora */ }
    return POS_PADRAO;
}
const lerSessao = (k) => { try { return Number(sessionStorage.getItem(k)) || 0; } catch { return 0; } };
const gravarSessao = (k, v) => { try { sessionStorage.setItem(k, String(v)); } catch { /* ignora */ } };

export default function LukeDock() {
    const { user } = useAuth();
    const perms = user?.permissoes;
    if (!lukeVisivel(perms)) return null;
    return <LukeDockInterno perms={perms} />;
}

function LukeDockInterno({ perms }) {
    const navigate = useNavigate();
    const { w, h, compacto } = useJanela();
    const visivel = useAbaVisivel();
    const reduzido = useMovimentoReduzido();

    const admin = ehAdmin(perms);
    const temAjuda = podeVerAjuda(perms);
    const temChat = podeUsarChat(perms);

    // ── abas e novidades ──
    const abas = useMemo(() => [temAjuda && 'duvida', temChat && 'pedir', admin && 'autz'].filter(Boolean), [temAjuda, temChat, admin]);
    const [abaSalva, setAbaSalva] = useFiltroSalvo('luke:aba', '');
    const aba = abas.includes(abaSalva) ? abaSalva : (abas.includes('pedir') ? 'pedir' : abas[0]);
    const { novidades, ultima, qtdNovas, temNovidade, marcarVistas } = useNovidades(temAjuda, admin);

    const [aberto, setAberto] = useState(false);
    const [geracaoAnexos, setGeracaoAnexos] = useState(0);
    const [faixaRecolhida, setFaixaRecolhida] = useState(false); // faixa de novidade some quando a pessoa começa a usar a conversa
    const [chatDesligado, setChatDesligado] = useState(false);   // o servidor respondeu 503 CHAT_DESLIGADO
    const [jaAbriu, setJaAbriu] = useState(false);
    const [vista, setVista] = useState('abas');               // abas | lista | visor
    const [novidadeAberta, setNovidadeAberta] = useState(null);
    const [novasNaLista, setNovasNaLista] = useState(0);
    const [balaoNovFechado, setBalaoNovFechado] = useState(false);
    const [balaoAutFechado, setBalaoAutFechado] = useState(() => lerSessao(BAL_AUT));

    // ── conversa: contadores ──
    const [resumo, setResumo] = useState({ ativo: true, conectado: true, naoLidas: 0 });
    const pendentes = useContagemSolicitacoesAgente(admin).pendentes;
    const parouResumo = useRef(false);
    const buscarResumo = useCallback(async () => {
        if (!temChat || parouResumo.current || document.visibilityState !== 'visible') return;
        try { setResumo(await chatLukeService.resumo()); }
        catch (e) { const st = e?.response?.status; if (st === 403 || st === 404) parouResumo.current = true; }
    }, [temChat]);
    useEffect(() => {
        if (!temChat) return undefined;
        buscarResumo();
        const t = setInterval(buscarResumo, 60000);
        const aoVoltar = () => { if (document.visibilityState === 'visible') buscarResumo(); };
        document.addEventListener('visibilitychange', aoVoltar);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); };
    }, [temChat, buscarResumo]);

    // ── decisão dos pedidos do Luke (um único fluxo para a aba Autorizações e para o cartão da conversa) ──
    const [versaoDecisao, setVersaoDecisao] = useState(0);
    const autzRef = useRef({});
    const registrarAutz = useCallback((fns) => { autzRef.current = fns || {}; }, []);
    const decisao = useDecisaoSolicitacao({
        aoDecidir: (novo) => { autzRef.current.decidido?.(novo); setVersaoDecisao((v) => v + 1); },
        aoFalhar: (item) => { autzRef.current.falhou?.(item); setVersaoDecisao((v) => v + 1); },
        aoRecarregar: () => { autzRef.current.recarregar?.(); setVersaoDecisao((v) => v + 1); },
        aoNavegar: () => setAberto(false),
    });

    // ── humor do cachorro ──
    const [humor, setHumor] = useState('idle');   // pulso curto vindo das abas (feliz) / dúvida pensando
    const [aguardando, setAguardando] = useState(false);
    const [ocioso, setOcioso] = useState('idle');
    const ultimaAcao = useRef(Date.now());
    const ociosoRef = useRef('idle');
    ociosoRef.current = ocioso;
    useEffect(() => { precarregarLuke(); }, []);
    useEffect(() => {
        const acao = () => { ultimaAcao.current = Date.now(); if (ociosoRef.current === 'dormindo') setOcioso('idle'); };
        window.addEventListener('pointerdown', acao, { passive: true });
        window.addEventListener('keydown', acao, { passive: true });
        return () => { window.removeEventListener('pointerdown', acao); window.removeEventListener('keydown', acao); };
    }, []);
    useEffect(() => {
        if (!visivel || reduzido) { setOcioso('idle'); return undefined; }
        const ciclo = [['idle', 4500], ['olhando', 7000], ['idle', 3500], ['preguica', 4000], ['idle', 3000]];
        let i = 0; let t = 0;
        const passo = () => {
            if (Date.now() - ultimaAcao.current > 120000) { setOcioso('dormindo'); t = setTimeout(passo, 5000); return; } // ~2 min sem mexer: dorme
            const [e, ms] = ciclo[i % ciclo.length]; i += 1;
            setOcioso(e); t = setTimeout(passo, ms);
        };
        passo();
        return () => clearTimeout(t);
    }, [visivel, reduzido]);

    const pendAdmin = admin ? pendentes : 0;
    const chamando = !aberto && ((temAjuda && temNovidade) || (temChat && resumo.naoLidas > 0) || pendAdmin > 0);
    const estadoCanto = humor !== 'idle' ? humor : (aguardando ? 'pensando' : (chamando ? 'novidade' : ocioso));
    const estadoCab = humor !== 'idle' ? humor : (aguardando ? 'pensando' : 'idle');
    const total = (temAjuda ? qtdNovas : 0) + (temChat ? resumo.naoLidas : 0) + pendAdmin;

    // ── posição (computador: arrasta; celular: fixo acima das barras de ação) ──
    const [pos, setPos] = useState(lerPos);
    const [arrastando, setArrastando] = useState(false);
    const dragRef = useRef(null);
    const moveuRef = useRef(false);
    const dogW = w >= 1024 ? 118 : (w >= 768 ? 106 : 96);
    const dogH = Math.round(dogW * 217 / 240);
    const limitar = useCallback((p) => ({
        right: Math.min(Math.max(p.right, 8), Math.max(8, w - dogW - 8)),
        bottom: Math.min(Math.max(p.bottom, 8), Math.max(8, h - dogH - 8)),
    }), [w, h, dogW, dogH]);
    const posAtual = compacto ? null : limitar(pos);

    function aoPressionar(e) {
        if (compacto) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        dragRef.current = { x: e.clientX, y: e.clientY, right: posAtual.right, bottom: posAtual.bottom };
        moveuRef.current = false;
    }
    function aoMover(e) {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.x; const dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) { moveuRef.current = true; setArrastando(true); }
        if (moveuRef.current) setPos(limitar({ right: d.right - dx, bottom: d.bottom - dy }));
    }
    function aoSoltar() {
        if (!dragRef.current) return;
        dragRef.current = null;
        setArrastando(false);
        setPos((p) => { try { localStorage.setItem(CHAVE_POS, JSON.stringify(p)); } catch { /* ignora */ } return p; });
    }
    function aoClicarCachorro() {
        if (moveuRef.current) { moveuRef.current = false; return; } // era um arraste, não um clique
        if (aberto) fechar(); else abrir();
    }

    // ── abrir / fechar ──
    function abrir(qual) {
        setAberto(true); setJaAbriu(true); setFaixaRecolhida(false);
        setVista('abas');
        if (qual && abas.includes(qual)) setAbaSalva(qual);
        setHumor('idle');
    }
    function fechar() { setAberto(false); }
    // a faixa de novidade some sozinha uns segundos depois de aberto o painel (sobra altura para as mensagens)
    useEffect(() => {
        if (!aberto) return undefined;
        const t = setTimeout(() => setFaixaRecolhida(true), 8000);
        return () => clearTimeout(t);
    }, [aberto]);
    // painel fechado: libera as fotos baixadas (URLs de blob) — ao reabrir, baixam de novo
    useEffect(() => { if (!aberto && jaAbriu) { limparCacheAnexos(); setGeracaoAnexos((g) => g + 1); } }, [aberto, jaAbriu]);
    function trocarAba(a) { setAbaSalva(a); setVista('abas'); }
    function abrirNovidade(n) {
        if (!n || !SLUG_OK.test(String(n.slug))) return; // slug fora do padrão: não monta URL de página
        marcarVistas();
        setNovidadeAberta(n); setVista('visor');
        if (!aberto) { setAberto(true); setJaAbriu(true); }
    }
    function abrirLista() { setNovasNaLista(qtdNovas); marcarVistas(); setVista('lista'); }
    function irPara(rota) { setAberto(false); navigate(rota); }
    function verHistorico() { setAberto(false); navigate('/admin/agentes/solicitacoes'); }

    // Esc fecha (computador); trava a rolagem do fundo enquanto a folha cheia do celular está aberta
    useEffect(() => {
        if (!aberto) return undefined;
        const f = (e) => { if (e.key === 'Escape') setAberto(false); };
        document.addEventListener('keydown', f);
        return () => document.removeEventListener('keydown', f);
    }, [aberto]);
    useEffect(() => {
        if (!(aberto && compacto)) return undefined;
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = antes; };
    }, [aberto, compacto]);
    const area = useAreaVisivel(aberto && compacto);
    // teclado aberto no celular: some a faixa de novidade e o aviso de cima para sobrar espaço às mensagens
    const tecladoAberto = compacto && !!area && area.altura < h - 120;

    // ── "Tirar dúvida" ⇄ "Pedir ao Luke" ──
    const [rascunho, setRascunho] = useState(null);
    const [perguntaInicial, setPerguntaInicial] = useState(null);
    const seq = useRef(0);
    const mandarParaLuke = useCallback((texto) => { seq.current += 1; setRascunho({ texto, n: seq.current }); setAbaSalva('pedir'); setVista('abas'); }, [setAbaSalva]);
    const tirarDuvida = useCallback((texto) => { seq.current += 1; setPerguntaInicial({ texto, n: seq.current }); setAbaSalva('duvida'); setVista('abas'); }, [setAbaSalva]);

    // ── balões (só com o painel fechado) ──
    const mostraBalaoAut = !aberto && admin && pendAdmin > 0 && pendAdmin > balaoAutFechado;
    const mostraBalaoNov = !aberto && !mostraBalaoAut && temAjuda && temNovidade && !balaoNovFechado && !!ultima;

    // geometria
    const estiloCachorro = compacto
        ? { right: 8, bottom: 'calc(88px + env(safe-area-inset-bottom))' }
        : { right: posAtual.right, bottom: posAtual.bottom };
    const baseBalao = compacto
        ? { right: 12, bottom: `calc(88px + env(safe-area-inset-bottom) + ${dogH + 2}px)` }
        : { right: Math.min(posAtual.right + 8, Math.max(8, w - 272 - 8)), bottom: posAtual.bottom + dogH + 4 };

    let estiloPainel;
    if (compacto) {
        estiloPainel = { top: area ? area.topo : 0, height: area ? area.altura : '100dvh' };
    } else {
        const largura = Math.min(400, w - 16);
        const right = Math.min(Math.max(posAtual.right, 8), Math.max(8, w - largura - 8));
        const cima = h - (posAtual.bottom + dogH + 8) - 12;
        const baixo = posAtual.bottom - 12 - 8;
        const ladoAoLado = cima < 620 && (w - posAtual.right - dogW - 12 - largura >= 8); // tela baixa: o painel ocupa a altura toda, ao lado do cachorro
        if (ladoAoLado) estiloPainel = { right: posAtual.right + dogW + 12, bottom: 12, height: Math.min(700, h - 24) };
        else if (cima >= 420 || cima >= baixo) estiloPainel = { right, bottom: posAtual.bottom + dogH + 8, height: Math.min(700, Math.max(cima, 300)) };
        else estiloPainel = { right, bottom: 12, height: Math.min(700, Math.max(baixo + 8 - 12, 300)) };
    }

    const desligado = resumo.ativo === false || chatDesligado;
    const cabecalhoEstado = aba === 'pedir' && desligado
        ? { t: 'chat desligado', cls: 'off' }
        : aba === 'pedir' && !resumo.conectado
        ? { t: 'ainda não conectado', cls: 'off' }
        : (estadoCab === 'pensando' ? { t: 'pensando…', cls: 'pens' } : { t: 'online', cls: '' });
    const rotulos = { duvida: ['Tirar dúvida', 'Dúvida'], pedir: ['Pedir ao Luke', 'Pedir'], autz: ['Autorizações', 'Autorizar'] };
    const painelNaVista = vista === 'abas';

    return (
        <>
            <div className="lk no-print" data-testid="luke-dock">
                {mostraBalaoAut && (
                    <div className="lk-balao" style={baseBalao} data-testid="luke-balao-autorizacao" role="status">
                        <div className="topo">
                            <span className="lk-selo ambar">Autorização</span>
                            <button type="button" className="x" aria-label="Fechar aviso" onClick={() => { gravarSessao(BAL_AUT, pendAdmin); setBalaoAutFechado(pendAdmin); }}><X size={16} strokeWidth={2.4} /></button>
                        </div>
                        <h3>{pendAdmin === 1 ? 'Você tem 1 pedido esperando autorização' : `Você tem ${pendAdmin} pedidos esperando autorização`}</h3>
                        <p>O Luke já deixou tudo pronto. Falta só o seu sim ou não.</p>
                        <button type="button" className="ver" onClick={() => { gravarSessao(BAL_AUT, pendAdmin); setBalaoAutFechado(pendAdmin); abrir('autz'); }}>Ver agora</button>
                    </div>
                )}
                {mostraBalaoNov && (
                    <div className="lk-balao" style={baseBalao} data-testid="luke-balao-novidade" role="status">
                        <div className="topo">
                            <span className="lk-selo">Novidade</span>{qtdNovas > 1 && <span className="mais">+{qtdNovas - 1} para ver</span>}
                            <button type="button" className="x" aria-label="Fechar aviso" onClick={() => setBalaoNovFechado(true)}><X size={16} strokeWidth={2.4} /></button>
                        </div>
                        <h3>{ultima.titulo}</h3>
                        {ultima.resumo ? <p>{ultima.resumo}</p> : null}
                        <button type="button" className="ver" onClick={() => abrirNovidade(ultima)}>Ver novidade</button>
                    </div>
                )}

                {!(aberto && compacto) && (
                    <button
                        type="button"
                        className={`lk-btn ${arrastando ? 'lk-arrastando' : ''}`}
                        style={estiloCachorro}
                        onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
                        onClick={aoClicarCachorro}
                        aria-label={aberto ? 'Fechar conversa com o Luke' : 'Abrir conversa com o Luke'}
                        aria-expanded={aberto}
                        title={compacto ? 'Luke' : 'Luke — clique para abrir, arraste para mover'}
                        data-testid="luke-cachorro" data-estado={estadoCanto}
                    >
                        <LukeMascote estado={estadoCanto} sombra />
                        <span className="lk-hit" aria-hidden="true" />
                        {total > 0 && <span className="lk-bolinha" data-testid="luke-bolinha">{total > 9 ? '9+' : total}</span>}
                    </button>
                )}

                {jaAbriu && (
                    <div
                        className={`lk-chat ${compacto ? 'lk-cel' : 'lk-pc'} ${abas.length > 2 ? 'lk-tres' : ''} ${tecladoAberto ? 'lk-teclado' : ''}`}
                        style={estiloPainel} hidden={!aberto} role="dialog"
                        onWheelCapture={() => setFaixaRecolhida(true)} onTouchMoveCapture={() => setFaixaRecolhida(true)}
                        onInputCapture={() => setFaixaRecolhida(true)} aria-label="Conversa com o Luke" data-testid="luke-painel"
                    >
                        <div className="lk-cab">
                            {compacto && <button type="button" className="lk-ic" onClick={fechar} aria-label="Voltar"><ChevronLeft /></button>}
                            <span className="lk-avatar"><LukeMascote parado /></span>
                            <div className="quem"><b>Luke</b><span className={cabecalhoEstado.cls}><i />{cabecalhoEstado.t}</span></div>
                            {temAjuda && (
                                <button type="button" className="lk-ic lk-sino" onClick={abrirLista} aria-label="Ver todas as novidades" title="Novidades" data-testid="luke-sino">
                                    <Bell />{qtdNovas > 0 && <i>{qtdNovas > 9 ? '9+' : qtdNovas}</i>}
                                </button>
                            )}
                            {!compacto && <button type="button" className="lk-ic" onClick={fechar} aria-label="Fechar"><X /></button>}
                        </div>

                        {painelNaVista && abas.length > 1 && (
                            <div className="lk-abas" role="tablist">
                                {abas.map((a) => (
                                    <button key={a} type="button" role="tab" aria-selected={aba === a} data-aba={a} onClick={() => trocarAba(a)}>
                                        <span className="rl">{rotulos[a][0]}</span><span className="rc">{rotulos[a][1]}</span>
                                        {a === 'autz' && pendAdmin > 0 && <span className="n">{pendAdmin > 9 ? '9+' : pendAdmin}</span>}
                                    </button>
                                ))}
                            </div>
                        )}

                        {painelNaVista && temAjuda && temNovidade && ultima && aba !== 'autz' && !faixaRecolhida && (
                            <FaixaNovidade novidade={ultima} onAbrir={() => abrirNovidade(ultima)} onDispensar={marcarVistas} />
                        )}

                        {vista === 'lista' && (
                            <ListaNovidades novidades={novidades} ehNova={(slug) => novidades.findIndex((n) => n.slug === slug) < novasNaLista} onAbrir={abrirNovidade} onVoltar={() => setVista('abas')} />
                        )}
                        {vista === 'visor' && novidadeAberta && <VisorNovidade novidade={novidadeAberta} onVoltar={() => setVista('abas')} />}

                        {/* as abas ficam montadas (só escondidas): rascunho, conversa e polling continuam de pé */}
                        <div className="lk-painel" style={{ display: painelNaVista ? undefined : 'none' }}>
                            {temAjuda && (
                                <AbaAjuda
                                    ativa={painelNaVista && aba === 'duvida'} temChat={temChat} compacto={compacto}
                                    perguntaInicial={perguntaInicial} onPedido={mandarParaLuke} onIrPara={irPara} onHumor={setHumor}
                                    onTrocarParaPedido={() => trocarAba('pedir')}
                                />
                            )}
                            {temChat && (
                                <AbaPedir
                                    ativa={painelNaVista && aba === 'pedir'} aberto={aberto} compacto={compacto} admin={admin}
                                    ajudaDisponivel={temAjuda} geracaoAnexos={geracaoAnexos} rascunho={rascunho} decisao={decisao} versaoDecisao={versaoDecisao}
                                    onHumor={setHumor} onAguardando={setAguardando} onLida={buscarResumo} onDesligado={setChatDesligado}
                                    onDuvida={tirarDuvida} onTrocarParaDuvida={() => trocarAba('duvida')}
                                />
                            )}
                            {admin && (
                                <AbaAutorizacoes
                                    ativa={painelNaVista && aba === 'autz'} aberto={aberto} decisao={decisao}
                                    versaoDecisao={versaoDecisao} onVerHistorico={verHistorico} onLista={registrarAutz}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
            {admin && decisao.modais}
        </>
    );
}
