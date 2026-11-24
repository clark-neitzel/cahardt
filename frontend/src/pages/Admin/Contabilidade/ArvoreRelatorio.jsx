// Árvore de relatório genérica (Pagar agora; Receber e Posição em aberto nas próximas etapas).
// Recebe nós JÁ montados — não sabe nada de contas a pagar. Desktop: linhas em grade; celular: cartões empilhados.
//
// nó: { key, estilo: 'grupo'|'cat'|'forn'|'doc'|'folha'|'info', prof (1=categoria…), titulo, badge?: {texto, cls},
//       detalhe?, mobInfo?, cols?: [{ t, cls }], filhos?: nó[] , fora?: bool }
// colunas: [{ rotulo, cls }]  (cabeçalho das colunas numéricas; mesmo nº de itens de `cols`)
import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

const LIMITE_FILHOS = 40; // "Mostrar mais" — evita montar milhares de linhas de uma vez (iPad)

function Nodo({ no, nivel, abertos, alternar, colunas, grade }) {
    const [lim, setLim] = useState(LIMITE_FILHOS);
    const temFilhos = Array.isArray(no.filhos) && no.filhos.length > 0;
    const fixo = no.estilo === 'grupo';
    const aberto = fixo || (abertos[no.key] ?? (no.prof != null && no.prof < nivel));
    const clicavel = temFilhos && !fixo;
    const pad = Math.max(0, (no.prof || 0) - 1);

    const estilosLinha = {
        grupo: `${no.fora ? 'bg-gray-700' : 'bg-house'} text-white`,
        cat: 'bg-mint/30',
        forn: 'bg-white',
        doc: 'bg-white',
        folha: 'bg-gray-50/70',
        info: 'bg-white',
    }[no.estilo] || 'bg-white';
    const corTitulo = no.estilo === 'grupo' ? 'text-white' : no.estilo === 'info' ? 'text-gray-500' : 'text-gray-900';
    const pesoTitulo = no.estilo === 'grupo' || no.estilo === 'cat' ? 'font-bold' : no.estilo === 'forn' ? 'font-semibold' : 'font-medium';
    const tamTitulo = no.estilo === 'folha' || no.estilo === 'info' ? 'text-xs md:text-sm' : 'text-sm';

    const miolo = (
        <>
            {/* Celular: cartão */}
            <div className="lg:hidden flex items-start gap-2 py-2.5 pr-3 min-h-[44px]" style={{ paddingLeft: `${12 + pad * 12}px` }}>
                <ChevronRight className={`h-4 w-4 mt-0.5 flex-shrink-0 transition-transform ${aberto ? 'rotate-90' : ''} ${clicavel ? (fixo ? 'text-white' : 'text-gray-500') : 'opacity-0'}`} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <span className={`${tamTitulo} ${pesoTitulo} ${corTitulo} break-words min-w-0`}>{no.titulo}</span>
                        {no.cols?.[1]?.t && <span className={`text-sm font-bold whitespace-nowrap ${fixo ? 'text-white' : 'text-gray-900'}`}>{no.cols[1].t}</span>}
                    </div>
                    {no.badge && <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-full ${no.badge.cls}`}>{no.badge.texto}</span>}
                    {no.detalhe && <div className={`text-xs mt-0.5 break-words ${fixo ? 'text-white/80' : 'text-gray-500'}`}>{no.detalhe}</div>}
                    {no.mobInfo && <div className={`text-xs mt-0.5 ${fixo ? 'text-white/80' : 'text-gray-600'}`}>{no.mobInfo}</div>}
                </div>
            </div>
            {/* Computador: grade */}
            <div className="hidden lg:grid items-center gap-2 py-2 pr-4" style={{ gridTemplateColumns: grade, paddingLeft: `${16 + pad * 20}px` }}>
                <div className="flex items-start gap-2 min-w-0">
                    <ChevronRight className={`h-4 w-4 mt-0.5 flex-shrink-0 transition-transform ${aberto ? 'rotate-90' : ''} ${clicavel ? (fixo ? 'text-white' : 'text-gray-500') : 'opacity-0'}`} />
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`${tamTitulo} ${pesoTitulo} ${corTitulo} break-words`}>{no.titulo}</span>
                            {no.badge && <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${no.badge.cls}`}>{no.badge.texto}</span>}
                        </div>
                        {no.detalhe && <div className={`text-xs break-words ${fixo ? 'text-white/80' : 'text-gray-500'}`}>{no.detalhe}</div>}
                    </div>
                </div>
                {colunas.map((c, i) => (
                    <div key={i} className={`text-right text-sm whitespace-nowrap ${no.cols?.[i]?.cls || (fixo ? 'text-white' : 'text-gray-700')}`}>{no.cols?.[i]?.t ?? ''}</div>
                ))}
            </div>
        </>
    );

    return (
        <div className={no.estilo === 'cat' ? 'border-t border-gray-200' : ''}>
            {clicavel ? (
                <div role="button" tabIndex={0} aria-expanded={aberto} onClick={() => alternar(no.key, !aberto)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(no.key, !aberto); } }}
                    className={`${estilosLinha} cursor-pointer hover:brightness-95 border-b border-gray-100`}>{miolo}</div>
            ) : (
                <div className={`${estilosLinha} border-b border-gray-100`}>{miolo}</div>
            )}
            {temFilhos && aberto && (
                <div>
                    {no.filhos.slice(0, lim).map((f) => (
                        <Nodo key={f.key} no={f} nivel={nivel} abertos={abertos} alternar={alternar} colunas={colunas} grade={grade} />
                    ))}
                    {no.filhos.length > lim && (
                        <div className="p-2 text-center bg-white border-b border-gray-100">
                            <button onClick={() => setLim((l) => l + LIMITE_FILHOS)}
                                className="px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm">
                                Mostrar mais — {lim} de {no.filhos.length}
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ArvoreRelatorio({ nos, colunas, nivel, rotuloPrimeira = 'Descrição' }) {
    const [abertos, setAbertos] = useState({});
    // trocar o "Abrir até" volta ao padrão do nível (cliques individuais são descartados)
    useEffect(() => { setAbertos({}); }, [nivel]);
    const alternar = (key, v) => setAbertos((a) => ({ ...a, [key]: v }));
    const grade = `minmax(0,1fr) ${colunas.map(() => '7.5rem').join(' ')}`;

    return (
        <div className="max-w-full overflow-hidden">
            <div className="hidden lg:grid gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200" style={{ gridTemplateColumns: grade, paddingLeft: '16px' }}>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pl-6">{rotuloPrimeira}</div>
                {colunas.map((c, i) => (
                    <div key={i} className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">{c.rotulo}</div>
                ))}
            </div>
            {nos.map((n) => (
                <Nodo key={n.key} no={n} nivel={nivel} abertos={abertos} alternar={alternar} colunas={colunas} grade={grade} />
            ))}
        </div>
    );
}
