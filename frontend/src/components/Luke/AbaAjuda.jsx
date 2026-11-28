import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUp } from 'lucide-react';
import copilotoService from '../../services/copilotoService';
import LukeMascote from './LukeMascote';
import { formatarResposta } from './lukeHooks';

// Aba "Tirar dúvida": resposta NA HORA sobre como/onde fazer cada coisa no sistema (cérebro = copilotoService do backend,
// que só conhece as telas que a pessoa pode acessar). Sem câmera, sem clipe e sem histórico no servidor.
// A resposta é TEXTO PURO — nunca dangerouslySetInnerHTML.
const SUGESTOES = [
    'Como lanço um pedido?',
    'Onde vejo o que um cliente me deve?',
    'Como cadastro um produto?',
    'Onde lanço uma despesa?',
];
const MSG_LIMITE = 'Você usou as dúvidas de hoje. Volta amanhã ou fale com o administrador.'; // reserva; o servidor manda o texto com o número certo

const rotaInterna = (r) => typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') && !r.includes('\\');

// Traduz o erro da ajuda numa frase para a pessoa (nunca o genérico quando o servidor explicou)
function erroDaAjuda(e) {
    const st = e?.response?.status;
    const dados = e?.response?.data;
    if (st === 429 && dados?.codigo === 'AJUDA_LIMITE_DIA') return { texto: dados?.error || MSG_LIMITE, limite: true };
    if (st === 429) return { texto: dados?.error || 'Muitas perguntas em pouco tempo. Aguarde um instante.', limite: false };
    if (st === 403) return { texto: 'Assistente desativado para este usuário.', limite: false };
    if (st === 503) return { texto: 'O assistente de ajuda não está disponível agora. Tente mais tarde.', limite: false };
    if (!e?.response) return { texto: 'Sem conexão com o servidor. Verifique a internet e tente de novo.', limite: false };
    return { texto: 'Ops, não consegui responder agora. Tente de novo em instantes.', limite: false };
}

export default function AbaAjuda({ ativa, temChat, compacto, perguntaInicial, onPedido, onIrPara, onHumor, onTrocarParaPedido }) {
    const [mensagens, setMensagens] = useState([]); // { role, content, atalhos?, erro?, pergunta? }
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [limite, setLimite] = useState(false);
    const fimRef = useRef(null);
    const inputRef = useRef(null);
    const mensagensRef = useRef([]);
    mensagensRef.current = mensagens;
    const emVooRef = useRef(false);
    const timerFeliz = useRef(0);

    useEffect(() => () => clearTimeout(timerFeliz.current), []);
    useEffect(() => { fimRef.current?.scrollIntoView?.({ block: 'end' }); }, [mensagens, enviando, ativa]);
    useEffect(() => { if (ativa && !compacto) inputRef.current?.focus(); }, [ativa, compacto]);

    const enviar = useCallback(async (bruto) => {
        const msg = String(bruto ?? '').trim();
        if (!msg || emVooRef.current || limite) return;
        emVooRef.current = true;
        const historico = [...mensagensRef.current, { role: 'user', content: msg }];
        setMensagens(historico);
        setTexto('');
        setEnviando(true);
        onHumor?.('pensando');
        try {
            const data = await copilotoService.perguntar(
                msg.slice(0, 800),
                historico.filter((m) => !m.erro).slice(-8).map(({ role, content }) => ({ role, content })),
            );
            const resposta = typeof data?.resposta === 'string' && data.resposta.trim() ? data.resposta : 'Não encontrei uma resposta para isso. Tente explicar de outro jeito.';
            setMensagens((m) => [...m, { role: 'assistant', content: resposta, atalhos: Array.isArray(data?.atalhos) ? data.atalhos : [], pergunta: msg }]);
            onHumor?.('feliz');
            clearTimeout(timerFeliz.current);
            timerFeliz.current = setTimeout(() => onHumor?.('idle'), 2200);
        } catch (e) {
            const er = erroDaAjuda(e);
            if (er.limite) setLimite(true);
            setMensagens((m) => [...m, { role: 'assistant', content: er.texto, erro: true, pergunta: msg }]);
            onHumor?.('idle');
        } finally {
            emVooRef.current = false;
            setEnviando(false);
        }
    }, [limite, onHumor]);

    // vindo de "Pedir ao Luke" ("Parece uma dúvida de uso → Tirar dúvida agora"): já faz a pergunta
    const ultimoN = useRef(0);
    useEffect(() => {
        if (perguntaInicial && perguntaInicial.n !== ultimoN.current) {
            ultimoN.current = perguntaInicial.n;
            enviar(perguntaInicial.texto);
        }
    }, [perguntaInicial, enviar]);

    return (
        <div className="lk-painel" data-painel="duvida" hidden={!ativa}>
            <div className="lk-sub"><b>Resposta na hora.</b> Como faz, o que faz, onde fica.</div>
            <div className="lk-msgs" data-testid="luke-msgs-duvida">
                {mensagens.length === 0 && (
                    <div className="lk-m">
                        <span className="lk-avatar p"><LukeMascote parado /></span>
                        <div className="col"><div className="lk-bolha">Oi! Me diga o que você quer fazer e eu te mostro <b>onde</b> fica no sistema.</div></div>
                    </div>
                )}
                {mensagens.map((m, i) => (m.role === 'user' ? (
                    <div key={i} className="lk-m eu"><div className="col"><div className="lk-bolha">{m.content}</div></div></div>
                ) : (
                    <div key={i} className="lk-m">
                        <span className="lk-avatar p"><LukeMascote parado /></span>
                        <div className="col">
                            <div className={`lk-bolha ${m.erro ? 'aviso' : ''}`}>{formatarResposta(m.content)}</div>
                            {!m.erro && (m.atalhos || []).filter((a) => a && rotaInterna(a.rota)).map((a) => (
                                <button key={a.rota} type="button" className="lk-acao" onClick={() => onIrPara?.(a.rota)}>
                                    <span>Ir para {a.label || 'a tela'}</span><ArrowRight />
                                </button>
                            ))}
                            {temChat && (
                                <button type="button" className="lk-link-pedido" onClick={() => onPedido?.(m.pergunta || '')}>
                                    Isto é um pedido? <b>Mandar para o Luke</b>
                                </button>
                            )}
                        </div>
                    </div>
                )))}
                {enviando && (
                    <div className="lk-m"><span className="lk-avatar p"><LukeMascote parado /></span><div className="col"><div className="lk-bolha lk-digit" aria-label="Luke está escrevendo"><i /><i /><i /></div></div></div>
                )}
                <div ref={fimRef} />
            </div>
            {limite ? (
                <div className="lk-cheio">
                    <b>Você usou as dúvidas de hoje.</b>
                    <span>Volta amanhã ou fale com o administrador.{temChat ? ' Os pedidos ao Luke continuam liberados.' : ''}</span>
                    {temChat && <button type="button" className="lk-b-out" onClick={onTrocarParaPedido}>Pedir ao Luke</button>}
                </div>
            ) : (
                <div className="lk-compor">
                    <div className="lk-chips">
                        {SUGESTOES.map((s) => <button key={s} type="button" disabled={enviando} onClick={() => enviar(s)}>{s}</button>)}
                    </div>
                    <form className="lk-linha-txt" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
                        <textarea
                            ref={inputRef} rows={1} value={texto} maxLength={800}
                            onChange={(e) => setTexto(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); } }}
                            placeholder="Qual é a sua dúvida?" aria-label="Dúvida"
                        />
                        <button type="submit" className="lk-enviar" aria-label="Enviar dúvida" disabled={!texto.trim() || enviando}><ArrowUp /></button>
                    </form>
                </div>
            )}
        </div>
    );
}
