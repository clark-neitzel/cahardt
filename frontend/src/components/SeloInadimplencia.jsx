import { AlertCircle, Clock } from 'lucide-react';

const moeda0 = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const moeda2 = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// O servidor manda a forma como rótulo ("Dinheiro", "Pix", "Cartão"…) — aceita também o código (PIX_ASAAS…).
export function rotuloFormaAConfirmar(forma) {
    const f = String(forma || '').trim();
    if (!f) return '';
    const n = f.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (n.includes('pix')) return 'Pix';
    if (n.includes('cart')) return 'Cartão';
    if (n.includes('dinheiro') || n.includes('especie')) return 'Dinheiro';
    return f;
}

/**
 * Decide o que mostrar a partir da situação que o BACK mandou (nunca recalcula).
 * Vermelho (em atraso) tem prioridade; amarelo é "a confirmar" (pendência do escritório).
 */
export function tipoSelo(situacao) {
    if (!situacao) return null;
    if (situacao.inadimplente) return 'vermelho';
    if (situacao.aConfirmar) return 'amarelo';
    return null;
}

/**
 * Selo de cliente em atraso / a confirmar — igual em todas as telas.
 *  situacao : { inadimplente, totalVencido, diasMaisAntiga, aConfirmar:{valor,dias,forma} }
 *  compacto : "R$ 1.247 · 57d"
 *  formato  : 'selo' (padrão) | 'lista' ("Inad. R$ 1.247,08") | 'listaMobile' ("Inadimplente R$ 1.247,08")
 *  deve     : texto "deve +R$ X" (Caixa); descontar = valor deste pedido a tirar do total (o que deve ALÉM dele)
 *  onClick  : se passado, vira botão (abre o popup "Contas em aberto")
 */
export default function SeloInadimplencia({ situacao, compacto = false, formato = 'selo', deve = false, descontar = 0, onClick, className = '' }) {
    const tipo = tipoSelo(situacao);
    if (!tipo) return null;

    let texto;
    let titulo;
    if (tipo === 'vermelho') {
        const total = Math.max(0, Number(situacao.totalVencido || 0) - Number(descontar || 0));
        // Caixa: se não sobra nada além deste pedido, nada a avisar
        if (deve && total < 1) return null;
        const dias = situacao.diasMaisAntiga != null ? ` · ${situacao.diasMaisAntiga}d` : '';
        if (formato === 'lista') texto = `Inad. ${moeda2(total)}`;
        else if (formato === 'listaMobile') texto = `Inadimplente ${moeda2(total)}`;
        else if (deve) texto = `deve +${moeda0(total)}${dias}`;
        else texto = compacto ? `${moeda0(total)}${dias}` : `Em atraso ${moeda0(total)}${dias}`;
        titulo = `Em atraso: ${moeda2(situacao.totalVencido)}${situacao.diasMaisAntiga != null ? ` — parcela mais antiga há ${situacao.diasMaisAntiga} dias` : ''}`;
    } else {
        const ac = situacao.aConfirmar;
        const forma = rotuloFormaAConfirmar(ac.forma);
        const dias = ac.dias != null ? `${forma ? `${forma} ` : ''}${ac.dias}d` : forma;
        const sufixo = dias ? ` · ${dias}` : '';
        if (formato === 'lista' || formato === 'listaMobile') texto = `A confirmar ${moeda2(ac.valor)}${sufixo}`;
        else texto = compacto ? `${moeda0(ac.valor)}${sufixo}` : `A confirmar ${moeda0(ac.valor)}${sufixo}`;
        titulo = `A confirmar: ${moeda2(ac.valor)} apontado na entrega, aguardando conciliação do escritório`;
    }

    const cor = tipo === 'vermelho'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'bg-amber-100 text-amber-800 hover:bg-amber-200';
    const Icone = tipo === 'vermelho' ? AlertCircle : Clock;
    const base = `inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap align-middle max-w-full ${compacto ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'} ${cor} ${className}`;
    const conteudo = (
        <>
            <Icone className="h-3 w-3 shrink-0" />
            <span className="truncate">{texto}</span>
        </>
    );

    if (onClick) {
        // <span role="button">: pode ficar dentro de <button> de linha/cartão clicável sem aninhar botão em botão.
        // Área de toque ≥44px via pseudo-elemento, sem inflar a linha da lista.
        const acionar = (e) => { e.stopPropagation(); e.preventDefault(); onClick(e); };
        return (
            <span
                role="button"
                tabIndex={0}
                data-selo-inad={tipo}
                title={titulo}
                aria-label={titulo}
                onClick={acionar}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') acionar(e); }}
                className={`relative cursor-pointer select-none transition-colors before:content-[''] before:absolute before:-inset-x-1 before:-inset-y-3 ${base}`}
            >
                {conteudo}
            </span>
        );
    }
    return <span data-selo-inad={tipo} title={titulo} className={base}>{conteudo}</span>;
}
