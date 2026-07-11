import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, X, Loader2, PackageX } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import caixaService from '../services/caixaService';

const POLL_MS = 10_000; // checa a cada 10s se há pedido aguardando este usuário
const DELAY_INICIAL_MS = 6000;

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtQtd = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

// Som curto ao chegar um novo pedido (mesma pegada do alerta de tarefas)
function bip() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const toque = (freq, t0) => {
            const o = ctx.createOscillator(); const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination); o.type = 'sine'; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
            o.start(t0); o.stop(t0 + 0.3);
        };
        toque(720, ctx.currentTime);
        toque(960, ctx.currentTime + 0.18);
    } catch { /* áudio bloqueado antes de interação — ignora */ }
}

// Pop-up global: quando alguém pede a ESTE usuário para autorizar uma devolução,
// aparece aqui em qualquer tela. Ele autoriza com a própria senha ou rejeita.
const AlertaAutorizacaoDevolucao = () => {
    const { user } = useAuth();
    const [pendentes, setPendentes] = useState([]);
    const [senha, setSenha] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [rejeitando, setRejeitando] = useState(false);
    const [motivoRejeicao, setMotivoRejeicao] = useState('');
    const conhecidosRef = useRef(new Set());

    const perms = user?.permissoes || {};
    const podeAutorizar = !!(perms.admin || perms.Pode_Autorizar_Desconsiderar_Devolucao);

    const verificar = useCallback(async () => {
        try {
            const lista = await caixaService.getAutorizacoesDevolucaoPendentes();
            setPendentes(lista || []);
            // toca o bip só quando surge um pedido novo
            const idsNovos = (lista || []).map(p => p.id).filter(id => !conhecidosRef.current.has(id));
            if (idsNovos.length > 0) bip();
            conhecidosRef.current = new Set((lista || []).map(p => p.id));
        } catch (error) {
            // silencioso — poller de fundo
        }
    }, []);

    useEffect(() => {
        if (!user || !podeAutorizar) return;
        const timer = setTimeout(() => verificar(), DELAY_INICIAL_MS);
        const interval = setInterval(() => verificar(), POLL_MS);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [user, podeAutorizar, verificar]);

    // Sempre trata o pedido mais antigo primeiro
    const atual = pendentes[0] || null;

    // Limpa os campos ao trocar de pedido
    useEffect(() => { setSenha(''); setMotivoRejeicao(''); }, [atual?.id]);

    if (!atual) return null;

    const removerAtual = () => setPendentes(prev => prev.filter(p => p.id !== atual.id));

    const handleAutorizar = async () => {
        if (!senha) return;
        try {
            setEnviando(true);
            await caixaService.responderAutorizacaoDevolucao(atual.id, { aprovar: true, senha });
            removerAtual();
            // revalida em seguida (pode haver mais na fila)
            setTimeout(() => verificar(), 300);
        } catch (error) {
            alert(error.response?.data?.error || 'Erro ao autorizar.');
        } finally {
            setEnviando(false);
        }
    };

    const handleRejeitar = async () => {
        try {
            setEnviando(true);
            await caixaService.responderAutorizacaoDevolucao(atual.id, { aprovar: false, motivoRejeicao });
            setRejeitando(false);
            removerAtual();
            setTimeout(() => verificar(), 300);
        } catch (error) {
            alert(error.response?.data?.error || 'Erro ao rejeitar.');
        } finally {
            setEnviando(false);
        }
    };

    const dataFmt = (() => {
        try { return new Date(atual.dataReferencia + 'T12:00:00').toLocaleDateString('pt-BR'); }
        catch { return atual.dataReferencia; }
    })();

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-br from-primary to-primaryDark px-5 py-5 text-center text-white">
                    <div className="mx-auto w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2">
                        <Lock className="h-6 w-6" />
                    </div>
                    <h2 className="font-bold text-lg">Pedido de autorização</h2>
                    <p className="text-white/80 text-sm">Desconsiderar falta de devolução</p>
                    {pendentes.length > 1 && (
                        <p className="text-white/70 text-xs mt-1">{pendentes.length} pedidos na fila — respondendo 1 de cada vez</p>
                    )}
                </div>

                {/* Body */}
                <div className="px-5 py-4">
                    <div className="text-sm divide-y divide-gray-100">
                        <div className="flex justify-between py-1.5"><span className="text-gray-500">Quem pediu</span><span className="font-medium text-gray-900 text-right">{atual.solicitanteNome} <span className="text-gray-400">(caixa de {atual.vendedorNome})</span></span></div>
                        <div className="flex justify-between py-1.5"><span className="text-gray-500">Produto</span><span className="font-medium text-gray-900 text-right">{atual.produtoNome}</span></div>
                        <div className="flex justify-between py-1.5"><span className="text-gray-500">Quantidade</span><span className="font-medium text-gray-900 text-right">{fmtQtd(atual.quantidade)}{atual.valorTotal != null ? ` · R$ ${fmt(atual.valorTotal)}` : ''}</span></div>
                        <div className="flex justify-between py-1.5"><span className="text-gray-500">Motivo</span><span className="font-medium text-gray-900 text-right">{atual.motivo || '—'}</span></div>
                        <div className="flex justify-between py-1.5"><span className="text-gray-500">Dia</span><span className="font-medium text-gray-900 text-right">{dataFmt}</span></div>
                    </div>

                    {!rejeitando ? (
                        <>
                            <label className="text-sm font-medium text-gray-700 block mt-4 mb-1">Sua senha para autorizar</label>
                            <input
                                type="password" value={senha} autoComplete="off"
                                onChange={(e) => setSenha(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && senha && !enviando) handleAutorizar(); }}
                                className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                autoFocus
                            />
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => setRejeitando(true)}
                                    disabled={enviando}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-red-300 text-red-600 hover:bg-red-50 rounded-full font-semibold text-sm disabled:opacity-50 min-h-[44px]"
                                >
                                    <PackageX className="h-4 w-4" /> Rejeitar
                                </button>
                                <button
                                    onClick={handleAutorizar}
                                    disabled={enviando || !senha}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 min-h-[44px]"
                                >
                                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Autorizar
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <label className="text-sm font-medium text-gray-700 block mt-4 mb-1">Motivo da rejeição (opcional)</label>
                            <input
                                type="text" value={motivoRejeicao}
                                onChange={(e) => setMotivoRejeicao(e.target.value)}
                                placeholder="Ex.: Tinha sim para carregar"
                                className="w-full border border-gray-300 rounded px-3 py-2.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                autoFocus
                            />
                            <div className="flex gap-2 mt-4">
                                <button
                                    onClick={() => setRejeitando(false)}
                                    disabled={enviando}
                                    className="flex-1 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm disabled:opacity-50 min-h-[44px]"
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={handleRejeitar}
                                    disabled={enviando}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-sm disabled:opacity-50 min-h-[44px]"
                                >
                                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageX className="h-4 w-4" />} Confirmar rejeição
                                </button>
                            </div>
                        </>
                    )}
                    <p className="text-xs text-gray-400 mt-3 text-center">Fica registrado quem autorizou, quando e o motivo.</p>
                </div>
            </div>
        </div>
    );
};

export default AlertaAutorizacaoDevolucao;
