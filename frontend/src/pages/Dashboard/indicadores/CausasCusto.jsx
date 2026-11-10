import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { Chip } from './Bloco';
import { BlocoCusto } from './CausasNivel2';
import { useAuth } from '../../../contexts/AuthContext';
import { useIndicador } from './useIndicador';
import { fmtRS, fmtPctSinal, temValor } from './formatos';

// Painel de CUSTO para a visão Produção: qual insumo subiu. Sem preço, cliente, margem ou volume.
export default function CausasCusto({ linha, periodo, onFechar }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const podeFicha = !!user?.permissoes?.admin || !!user?.permissoes?.pcp?.receitas; // espelha App.jsx canPcp('receitas')
    const fecharRef = useRef(onFechar);
    fecharRef.current = onFechar;
    const de = periodo?.de, ate = periodo?.ate;
    const causas = useIndicador(`produtos/${linha.produtoId}/causas`, { de, ate }, !!(linha.produtoId && de && ate));

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') fecharRef.current(); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, []);

    const d = causas.dados;
    const cu = d?.decomposicao?.custo;
    const comparavel = d?.decomposicao?.comparavel;
    const fa = temValor(d?.custoFichaAnterior) ? Number(d.custoFichaAnterior) : null;
    const fn = temValor(d?.custoFichaAtual) ? Number(d.custoFichaAtual) : null;
    const varFicha = fa !== null && fn !== null && fa !== 0 ? ((fn - fa) / Math.abs(fa)) * 100 : null;
    const sobe = varFicha !== null && varFicha > 0.05;
    const cai = varFicha !== null && varFicha < -0.05;
    const abrirFicha = () => { onFechar(); navigate(d.links.fichaTecnica); };
    const caixa = 'rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700';

    let corpo;
    if (!(linha.produtoId && de && ate)) {
        corpo = <div className={caixa} role="alert">Escolha um período para ver o custo.</div>;
    } else if (causas.proibido) {
        corpo = <div className={caixa} role="alert">Você não tem acesso a esta informação.</div>;
    } else if (causas.carregando && !d) {
        corpo = <div className={`${caixa} flex items-center gap-2`} role="status"><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> Buscando os insumos…</div>;
    } else if (causas.erro || !d) {
        corpo = (
            <div className={`${caixa} flex items-center justify-between gap-3 flex-wrap`} role="alert">
                <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />{causas.erro || 'Não foi possível carregar; tente de novo.'}</span>
                <button type="button" onClick={causas.recarregar} className="px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">Tentar de novo</button>
            </div>
        );
    } else {
        corpo = (
            <>
                {causas.exemplo && <p className="text-xs font-semibold text-amber-700">Dados de exemplo (rota ainda não disponível no servidor).</p>}
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <div className="text-xs font-bold uppercase tracking-widest text-gray-600">Custo da ficha por unidade</div>
                    <div className={`text-2xl font-extrabold mt-1 ${sobe ? 'text-red-700' : cai ? 'text-green-700' : 'text-gray-700'}`}>{varFicha !== null ? fmtPctSinal(varFicha) : '—'}</div>
                    <div className="text-xs text-gray-600 mt-1">{fa !== null && fn !== null ? `${fmtRS(fa, 4)} → ${fmtRS(fn, 4)}` : '—'}</div>
                    {comparavel === false ? (
                        <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-100">{d.decomposicao.motivoSemComparacao || 'Não dá para comparar este período com o anterior.'}</div>
                    ) : cu && (
                        <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-gray-100">
                            Custo gravado nas vendas do período: {fmtRS(cu.antes)} → {fmtRS(cu.agora)}{temValor(cu.variacaoPct) ? ` (${fmtPctSinal(cu.variacaoPct)})` : ''}
                        </div>
                    )}
                </div>
                <BlocoCusto dados={d} podeFicha={podeFicha} onFicha={abrirFicha} />
            </>
        );
    }

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label="O que mudou no custo?">
            <div className="absolute inset-0 bg-black/40" onClick={onFechar} />
            <div className="relative bg-white w-full md:max-w-3xl rounded-t-2xl md:rounded-2xl shadow-xl border border-gray-200 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-gray-100 sticky top-0 bg-white z-10">
                    <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-widest text-gray-600">O que mudou no custo?</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="font-bold text-gray-900 text-sm">{linha.nome}</span>
                            <Chip cls={linha.classe === 'REVENDA' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}>{linha.classe === 'REVENDA' ? 'revenda' : 'fabricado'}</Chip>
                            {linha.fichaDesatualizada && <Chip cls="bg-amber-100 text-amber-700">ficha desatualizada</Chip>}
                            {linha.temCustoFaltando && <Chip cls="bg-red-100 text-red-700">custo faltando</Chip>}
                        </div>
                    </div>
                    <button type="button" onClick={onFechar} aria-label="Fechar" className="p-2.5 -m-1 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-full">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="p-4 space-y-4">{corpo}</div>
            </div>
        </div>,
        document.body
    );
}
