import React from 'react';
import { ArrowRight, ChevronLeft, X } from 'lucide-react';
import { dataCurta, SLUG_OK } from './lukeHooks';

// Peças das NOVIDADES do sistema (frontend/public/novidades.json) dentro do Luke.
// Todo texto vem do manifesto e é mostrado como TEXTO (nunca HTML).

/** Faixa mint no topo do painel: a novidade mais recente ainda não vista. */
export function FaixaNovidade({ novidade, onAbrir, onDispensar }) {
    if (!novidade) return null;
    return (
        <div className="lk-nov-topo" data-testid="luke-faixa-novidade">
            <div className="tx"><span className="lk-selo">Novidade</span><b title={novidade.resumo || undefined}>{novidade.titulo}</b></div>
            <button type="button" className="lk-acao" onClick={onAbrir}>Abrir</button>
            <button type="button" className="lk-ic" onClick={onDispensar} aria-label="Dispensar novidade"><X /></button>
        </div>
    );
}

/** Cartão de uma novidade na lista do sininho. */
export function CardNovidade({ novidade, nova, onAbrir }) {
    return (
        <div className={`lk-card lk-nov ${nova ? 'nova' : ''}`}>
            <div className="l"><h3>{novidade.titulo}</h3>{novidade.data ? <time>{dataCurta(`${novidade.data}T12:00:00`)}</time> : null}</div>
            {novidade.resumo ? <p>{novidade.resumo}</p> : null}
            <button type="button" className="lk-acao" onClick={() => onAbrir(novidade)}>Abrir <ArrowRight /></button>
        </div>
    );
}

/** Lista completa (sininho do cabeçalho). */
export function ListaNovidades({ novidades, ehNova, onAbrir, onVoltar }) {
    return (
        <div className="lk-painel">
            <div className="lk-sub voltar"><button type="button" onClick={onVoltar}><ChevronLeft size={16} />Voltar para a conversa</button></div>
            <div className="lk-rolagem" data-testid="luke-lista-novidades">
                {novidades.length === 0 && <div className="lk-vazio"><b>Sem novidades por enquanto</b>Quando sair algo novo no sistema, aparece aqui.</div>}
                {novidades.slice(0, 40).map((n) => <CardNovidade key={n.slug} novidade={n} nova={ehNova(n.slug)} onAbrir={onAbrir} />)}
            </div>
        </div>
    );
}

/** A própria página de anúncio (a mesma do grupo do WhatsApp), dentro do painel. */
export function VisorNovidade({ novidade, onVoltar }) {
    if (!novidade || !SLUG_OK.test(String(novidade.slug))) return null;
    return (
        <div className="lk-painel">
            <div className="lk-sub voltar"><button type="button" onClick={onVoltar}><ChevronLeft size={16} />Voltar</button></div>
            <iframe
                src={`/novidade-${encodeURIComponent(novidade.slug)}.html`}
                title={novidade.titulo}
                className="lk-frame"
            />
        </div>
    );
}
