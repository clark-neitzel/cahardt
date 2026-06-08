import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Send, ArrowRight } from 'lucide-react';
import copilotoService from '../../services/copilotoService';

// ── Mascote: clipe de papel com olhos (Clippy nostálgico) ──
const ClippyMascot = ({ size = 40 }) => (
    <svg width={size} height={size} viewBox="0 0 48 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
            d="M31 22 V42 a9 9 0 0 1 -18 0 V17 a6.5 6.5 0 0 1 13 0 V40 a3.2 3.2 0 0 1 -6.4 0 V24"
            stroke="#9aa3ad" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
        <path d="M12.5 12.5 q4 -4.5 8 -0.5" stroke="#5b6470" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M25 12 q4 -4.5 8 -0.5" stroke="#5b6470" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="17" cy="20" r="5.4" fill="white" stroke="#5b6470" strokeWidth="1.6" />
        <circle cx="29" cy="20" r="5.4" fill="white" stroke="#5b6470" strokeWidth="1.6" />
        <circle cx="18.4" cy="21" r="2.3" fill="#2b2f36" />
        <circle cx="30.4" cy="21" r="2.3" fill="#2b2f36" />
    </svg>
);

const SUGESTOES = [
    'Como lanço um pedido?',
    'Onde vejo o que um cliente me deve?',
    'Como cadastro um produto?',
    'Onde lanço uma despesa?',
];

export default function Clippy() {
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);
    const [dica, setDica] = useState(true);
    const [mensagens, setMensagens] = useState([]); // { role, content, atalhos? }
    const [input, setInput] = useState('');
    const [enviando, setEnviando] = useState(false);
    const chatEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [mensagens, enviando]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    function irPara(rota) {
        navigate(rota);
        setOpen(false);
    }

    async function enviar(texto) {
        const msg = (texto ?? input).trim();
        if (!msg || enviando) return;
        const historico = [...mensagens, { role: 'user', content: msg }];
        setMensagens(historico);
        setInput('');
        setEnviando(true);
        try {
            const data = await copilotoService.perguntar(
                msg,
                historico.slice(-8).map(({ role, content }) => ({ role, content }))
            );
            setMensagens((m) => [...m, { role: 'assistant', content: data.resposta, atalhos: data.atalhos || [] }]);
        } catch {
            setMensagens((m) => [...m, { role: 'assistant', content: 'Ops, não consegui responder agora. Tente de novo em instantes.' }]);
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div className="hidden lg:block fixed bottom-5 right-5 z-50 no-print">
            {/* ── Painel de chat ── */}
            {open && (
                <div
                    className="absolute bottom-full right-0 mb-3 w-[370px] h-[500px] bg-white rounded-2xl border border-gray-200 shadow-2xl flex flex-col overflow-hidden"
                    style={{ animation: 'clippyPop .18s ease-out' }}
                >
                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-primary to-blue-600 text-white shrink-0">
                        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                            <ClippyMascot size={24} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold leading-tight">Clippy</p>
                            <p className="text-[11px] text-white/80 leading-tight">Ajuda do sistema — onde fica cada coisa</p>
                        </div>
                        <button onClick={() => setOpen(false)} title="Fechar" className="p-1.5 rounded-lg hover:bg-white/15 transition-colors">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Mensagens */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                        {mensagens.length === 0 && (
                            <div className="space-y-3">
                                <div className="flex gap-2 items-start">
                                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                        <ClippyMascot size={20} />
                                    </div>
                                    <div className="p-2.5 rounded-2xl rounded-tl-sm bg-gray-100 text-[13px] text-gray-700 leading-snug">
                                        Oi! 👋 Me diga o que você quer fazer e eu te mostro <b>onde</b> fica no sistema.
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {SUGESTOES.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => enviar(s)}
                                            className="px-2.5 py-1.5 text-[12px] rounded-full border border-gray-200 text-gray-600 hover:border-primary hover:text-primary transition-colors"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {mensagens.map((msg, i) => (
                            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex gap-2 items-start'}>
                                {msg.role === 'assistant' && (
                                    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                        <ClippyMascot size={20} />
                                    </div>
                                )}
                                <div className={`max-w-[80%] ${msg.role === 'user' ? '' : 'space-y-1.5'}`}>
                                    <div className={`p-2.5 text-[13px] leading-snug whitespace-pre-wrap ${msg.role === 'user'
                                        ? 'rounded-2xl rounded-tr-sm bg-primary text-white'
                                        : 'rounded-2xl rounded-tl-sm bg-gray-100 text-gray-700'}`}>
                                        {msg.content}
                                    </div>
                                    {/* Atalhos clicáveis */}
                                    {msg.atalhos?.map((a) => (
                                        <button
                                            key={a.rota}
                                            onClick={() => irPara(a.rota)}
                                            className="flex items-center gap-1.5 w-full px-3 py-2 text-[13px] font-semibold text-primary bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                                        >
                                            <ArrowRight className="h-4 w-4 shrink-0" />
                                            Ir para {a.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {enviando && (
                            <div className="flex gap-2 items-start">
                                <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                    <ClippyMascot size={20} />
                                </div>
                                <div className="p-3 rounded-2xl rounded-tl-sm bg-gray-100 flex gap-1">
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" style={{ animation: 'clippyBlink 1s infinite' }} />
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" style={{ animation: 'clippyBlink 1s infinite .15s' }} />
                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" style={{ animation: 'clippyBlink 1s infinite .3s' }} />
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input */}
                    <form
                        onSubmit={(e) => { e.preventDefault(); enviar(); }}
                        className="flex items-center gap-2 p-2.5 border-t border-gray-100 shrink-0"
                    >
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="O que você quer fazer?"
                            className="flex-1 px-3 py-2 text-[13px] rounded-full bg-gray-100 focus:bg-white border border-transparent focus:border-primary outline-none transition-colors"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || enviando}
                            className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center disabled:opacity-40 hover:bg-blue-600 transition-colors shrink-0"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            )}

            {/* ── Mascote (botão) ── */}
            <div className="flex items-end gap-2 justify-end">
                {!open && dica && (
                    <div
                        className="mb-1 max-w-[180px] bg-white rounded-2xl rounded-br-sm border border-gray-200 shadow-lg px-3 py-2 text-[12px] text-gray-600 leading-snug"
                        style={{ animation: 'clippyPop .2s ease-out' }}
                    >
                        Não sabe onde fica algo? Clique em mim! 📎
                    </div>
                )}
                <button
                    onClick={() => { setOpen((o) => !o); setDica(false); }}
                    title="Abrir ajuda"
                    className="w-16 h-16 rounded-full bg-white border border-gray-200 shadow-xl flex items-center justify-center hover:-translate-y-0.5 transition-transform shrink-0"
                    style={!open ? { animation: 'clippyFloat 3.5s ease-in-out infinite' } : undefined}
                >
                    <ClippyMascot size={40} />
                </button>
            </div>

            <style>{`
                @keyframes clippyFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
                @keyframes clippyPop { from{opacity:0;transform:translateY(8px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
                @keyframes clippyBlink { 0%,100%{opacity:.3} 50%{opacity:1} }
            `}</style>
        </div>
    );
}
