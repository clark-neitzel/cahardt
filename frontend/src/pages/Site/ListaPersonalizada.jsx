import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../services/api';
import './lista.css';

// Axios dedicado — sem o interceptor global (não redireciona para /login em 401).
const pub = axios.create({ baseURL: `${API_URL}/api/catalogo-personalizado-publico` });

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const imgUrl = (u) => !u ? null : (String(u).startsWith('http') ? u : `${API_URL}${u}`);

// Fundo quente determinístico para itens sem foto (mesma ideia do catálogo/congelados)
const tileGradient = (seed) => {
    let h = 0; const s = String(seed || 'x');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const hue = 20 + (h % 40);
    return `linear-gradient(150deg, hsl(${hue} 46% 58%), hsl(${hue} 50% 46%))`;
};

const fmtData = (d) => {
    if (!d) return '';
    try {
        return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return ''; }
};

export default function ListaPersonalizada() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState(false);
    const [dados, setDados] = useState(null);

    useEffect(() => {
        let vivo = true;
        document.title = 'Lista de preços · Hardt Salgados';
        pub.get(`/${token}`)
            .then(r => { if (vivo) setDados(r.data); })
            .catch(() => { if (vivo) setErro(true); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [token]);

    if (loading) {
        return (
            <div className="lpx">
                <div className="lpx-center">
                    <div className="lpx-spin" />
                    <p>Carregando sua lista de preços…</p>
                </div>
            </div>
        );
    }

    if (erro || !dados) {
        return (
            <div className="lpx">
                <div className="lpx-center">
                    <div className="big">Lista não encontrada</div>
                    <p>Este link pode ter expirado ou sido removido. Fale com seu vendedor Hardt para receber uma lista atualizada.</p>
                </div>
            </div>
        );
    }

    const { clienteNome, clienteCidade, condicaoNome, medianteAprovacao, validadeEm, expirado, observacoes, itens, whatsapp, vendedorNome } = dados;

    // WhatsApp já vem resolvido do backend (vendedor p/ cliente cadastrado, loja p/ não-cliente)
    const msg = encodeURIComponent(`Olá! Recebi a lista de preços da Hardt${clienteNome ? ` (${clienteNome})` : ''} e gostaria de fazer um pedido.`);
    const waHref = `https://wa.me/${String(whatsapp || '').replace(/\D/g, '')}?text=${msg}`;

    return (
        <div className="lpx">
            <div className="lpx-wrap">
                {/* header */}
                <header className="lpx-nav">
                    <div className="lpx-nav-in">
                        <div className="lpx-nav-logo">
                            <img src="/cong/logo.png" alt="Hardt Salgados"
                                onError={(e) => { e.currentTarget.outerHTML = '<div class="lpx-logo"><span class="l1">HARDT</span><span class="l2">SALGADOS</span></div>'; }} />
                            <span className="since">desde 2007</span>
                        </div>
                        <div className="lpx-nav-tag">Lista de<br />preços</div>
                    </div>
                </header>

                {/* hero */}
                <div className="lpx-hero">
                    <div className="kicker">Lista de preços exclusiva</div>
                    <h1>{clienteNome}</h1>
                    {clienteCidade && <div className="cidade">{clienteCidade}</div>}
                    <div className="lpx-chips">
                        <span className="lpx-chip">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                            {condicaoNome}
                        </span>
                        {medianteAprovacao && (
                            <span className="lpx-chip apr">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z" /><path d="M12 8v4M12 16h.01" /></svg>
                                Mediante aprovação de crédito
                            </span>
                        )}
                        {validadeEm && (
                            <span className={'lpx-chip' + (expirado ? ' exp' : '')}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                                {expirado ? 'Expirou em ' : 'Válida até '}{fmtData(validadeEm)}
                            </span>
                        )}
                    </div>
                </div>

                {expirado && (
                    <div className="lpx-banner">Esta lista expirou — os preços podem ter mudado. Peça uma lista atualizada ao seu vendedor.</div>
                )}

                {/* itens */}
                <div className="lpx-body">
                    {itens.map((it, i) => {
                        const img = imgUrl(it.imagemUrl);
                        return (
                            <div className="lpx-item" key={i}>
                                <div className="img" style={!img ? { background: tileGradient(it.codigo || it.nome) } : undefined}>
                                    {img ? <img src={img} alt={it.nome} loading="lazy" /> : <span>{(it.nome || '').split(' ')[0]}</span>}
                                </div>
                                <div className="main">
                                    <div className="nome">{it.nome}</div>
                                    <div className="det">{it.codigo ? `Cód. ${it.codigo}` : ''}{it.categoriaNome ? `${it.codigo ? ' · ' : ''}${it.categoriaNome}` : ''}</div>
                                </div>
                                <div className="preco">
                                    <div className="v">{money(it.precoFinal)}</div>
                                    <div className="u">por {(it.unidade || 'un').toLowerCase()}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {observacoes && (
                    <div className="lpx-obs"><b>Observação</b>{observacoes}</div>
                )}

                {/* cta */}
                <div className="lpx-cta">
                    <a className="lpx-wa" href={waHref} target="_blank" rel="noopener noreferrer">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.06L2 22l5.06-1.33A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3 .79.8-2.93-.2-.31A8.2 8.2 0 1 1 12 20.2z" /></svg>
                        Fazer meu pedido no WhatsApp
                    </a>
                </div>

                {/* rodapé */}
                <div className="lpx-foot">
                    <b>Hardt Salgados</b> · Desde 2007<br />
                    {validadeEm ? <>Preços válidos até {fmtData(validadeEm)} · </> : null}
                    Pedidos pelo WhatsApp
                    <div className="rd">
                        {vendedorNome ? `Lista preparada por ${vendedorNome}` : 'Lista preparada pelo seu vendedor Hardt'} · hardtsalgados.com.br
                    </div>
                </div>
            </div>
        </div>
    );
}
