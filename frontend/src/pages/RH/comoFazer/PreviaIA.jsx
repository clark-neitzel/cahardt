import { AlertTriangle } from 'lucide-react';
import PassoCard from '../../../components/ComoFazer/PassoCard';

export const BLOCO_ROTULO = { PRINCIPAL: 'Passo a passo', MONTAR: '🔧 Montar', USAR: '▶️ Usar', LIMPAR: '🧼 Limpar', PROBLEMA: '🚨 Deu problema' };
const lower1 = (t) => { const x = String(t || ''); return x ? x.charAt(0).toLowerCase() + x.slice(1) : x; };
const titulo = 'text-xs font-bold uppercase tracking-widest text-gray-600';
const txt = (a) => (typeof a === 'string' ? a : (a?.mensagem || ''));

/** Texto curto de uma pergunta de checklist (para mostrar na prévia e nas sugestões). */
export function resumoPergunta(p) {
    if (!p) return '';
    const t = { NUMERO: 'Número', SIMNAO: 'Sim ou Não', FOTO: 'Foto' }[p.tipo] || p.tipo || '';
    let faixa = '';
    if (p.tipo === 'NUMERO' && (p.min != null || p.max != null)) faixa = ` (${p.min ?? '…'} a ${p.max ?? '…'}${p.unidade ? ` ${p.unidade}` : ''})`;
    return `${t}: ${p.rotulo || ''}${faixa}`;
}

/** Prévia do rascunho: o mesmo PassoCard que a equipe vê + a dica "Foto para tirar". Nada foi salvo ainda. */
export default function PreviaIA({ doc, avisos = [], erros = [] }) {
    const secoes = Array.isArray(doc?.secoes) ? doc.secoes : [];
    const naoFazer = String(doc?.naoFazer || '').split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);
    const seDer = Array.isArray(doc?.seDerErrado) ? doc.seDerErrado.filter((r) => r && (r.se || r.entao)) : [];
    let n = 0;
    // "Sem foto" não é pendência aqui: cada passo já mostra a dica "Foto para tirar" (as fotos são tiradas no editor)
    const semAvisoFoto = (a) => !/^sem foto/i.test(a);
    const lAv = avisos.map(txt).filter(Boolean).filter(semAvisoFoto);
    const lEr = erros.map(txt).filter(Boolean).filter(semAvisoFoto);

    return (
        <div className="space-y-3">
            <p className="rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold p-3">
                ✨ Rascunho feito com ajuda da IA — confira cada passo antes de publicar. Ela não substitui quem conhece a máquina.
            </p>
            {(lEr.length > 0 || lAv.length > 0) && (
                <div className="rounded-xl bg-gray-50 border border-gray-200 text-gray-800 text-sm p-3">
                    <b>Para você ajustar no editor:</b>
                    <ul className="list-disc pl-5">{[...lEr, ...lAv].slice(0, 8).map((a, i) => <li key={i}>{a}</li>)}</ul>
                </div>
            )}
            {doc?.objetivo ? <div><p className={titulo}>Para que serve</p><p className="text-sm text-gray-800 mt-1 break-words">{doc.objetivo}</p></div> : null}
            {doc?.materiais ? <div><p className={titulo}>O que precisa</p><p className="text-sm text-gray-800 mt-1 break-words">{doc.materiais}</p></div> : null}
            {doc?.avisoPerigo ? (
                <p className="rounded-xl bg-red-50 border border-red-300 text-red-800 text-sm font-semibold p-3 flex gap-2 break-words"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>Perigo: {doc.avisoPerigo}</span></p>
            ) : null}
            {secoes.map((s, si) => (
                <div key={s.id || si} className="space-y-2">
                    <p className={titulo}>{s.bloco === 'PROBLEMA' && s.titulo ? `🚨 ${s.titulo}` : (BLOCO_ROTULO[s.bloco] || s.titulo || 'Passos')}</p>
                    {(s.passos || []).map((p, pi) => {
                        n += 1;
                        return (
                            <div key={p.id || pi}>
                                <PassoCard passo={p} numero={n} compacto semOuvir dicaFoto={p.fotoSugerida || ''} />
                                {p.pergunta ? <p className="mt-1 text-xs font-semibold text-green-800 bg-green-50 rounded-lg px-2 py-1 break-words">❓ Pergunta do checklist — {resumoPergunta(p.pergunta)}</p> : null}
                            </div>
                        );
                    })}
                </div>
            ))}
            {naoFazer.length > 0 && (
                <div><p className={titulo}>O que NÃO fazer</p>
                    <ul className="list-disc pl-5 mt-1 text-sm text-gray-800">{naoFazer.map((x, i) => <li key={i} className="break-words">{x}</li>)}</ul></div>
            )}
            {seDer.length > 0 && (
                <div><p className={titulo}>Se der errado</p>
                    <div className="mt-1 space-y-1.5">{seDer.map((r, i) => (
                        <div key={i} className="rounded-lg border border-gray-200 p-2 text-sm break-words"><b>Se</b> {lower1(r.se)} <b>→ então</b> {lower1(r.entao)}</div>
                    ))}</div></div>
            )}
        </div>
    );
}
