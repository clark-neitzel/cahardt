import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, Lock, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import caixaService from '../../services/caixaService';

/**
 * Blocos de caixa no topo da agenda:
 *  1. Caixas a conferir — quem tem a permissão de contar o dinheiro. O aviso só
 *     nasce no DIA SEGUINTE ao do caixa (pedido do dono): conferiu no mesmo dia,
 *     nunca virou cobrança.
 *  2. Caixas a fechar — quem tem a permissão de fechar, assim que o dinheiro é
 *     conferido (aqui o dinheiro já está resolvido, é só encerrar).
 *  3. Conferi hoje — o histórico de quem contou ("o que eu conferi de caixa").
 *
 * Nenhum dos três derruba a agenda: erro na busca simplesmente não mostra o bloco.
 */

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (s) => (s ? String(s).split('-').reverse().join('/') : '');
const hora = (d) => (d ? new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const hojeStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const Linha = ({ children }) => (
    <div className="flex items-center gap-3 py-3 px-1 border-b border-gray-100 last:border-0 flex-wrap md:flex-nowrap">{children}</div>
);

const CaixasPendentesAgenda = () => {
    const navigate = useNavigate();
    const [aConferir, setAConferir] = useState([]);
    const [aFechar, setAFechar] = useState([]);
    const [conferi, setConferi] = useState([]);
    const [verHistorico, setVerHistorico] = useState(false);

    const carregar = useCallback(async () => {
        const hoje = hojeStr();
        const [c, f, m] = await Promise.all([
            caixaService.getCaixasAConferir().catch(() => []),
            caixaService.getCaixasAFechar().catch(() => []),
            caixaService.getMinhasConferencias(hoje, hoje).catch(() => []),
        ]);
        setAConferir(Array.isArray(c) ? c : []);
        setAFechar(Array.isArray(f) ? f : []);
        setConferi(Array.isArray(m) ? m : []);
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const abrirCaixa = (item) => navigate(`/caixa?data=${item.data}&vendedorId=${item.vendedorId}`);

    if (!aConferir.length && !aFechar.length && !conferi.length) return null;

    return (
        <div className="px-3 md:px-6 pt-3 space-y-3">
            {/* ── Caixas a conferir ── */}
            {aConferir.length > 0 && (
                <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 md:px-5 py-3 border-b border-amber-100 bg-amber-50/70">
                        <Banknote className="h-4 w-4 text-amber-700" />
                        <span className="text-xs font-bold uppercase tracking-widest text-amber-700">Caixas a conferir</span>
                        <span className="ml-auto px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                            {aConferir.length}
                        </span>
                    </div>
                    <div className="px-4 md:px-5 py-1">
                        {aConferir.map(item => (
                            <Linha key={item.caixaId}>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-gray-900 text-sm flex items-center gap-2 flex-wrap">
                                        {item.vendedorNome}
                                        {item.diasParado >= 2 && (
                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">
                                                {item.diasParado} dias parado
                                            </span>
                                        )}
                                        {item.reconferir && (
                                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">
                                                valor mudou — conferir de novo
                                            </span>
                                        )}
                                    </div>
                                    <div className={`text-xs ${item.diasParado >= 2 ? 'text-red-600' : 'text-gray-500'}`}>
                                        Caixa de {dataBR(item.data)}
                                        {item.entregas > 0 ? ` · ${item.entregas} entrega(s)` : ' · dia sem movimento'}
                                        {item.origem === 'IMPRESSAO' ? ' · folha impressa' : item.origem === 'VIRADA_DIA' ? ' · virada do dia' : ''}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-gray-900 text-sm tabular-nums">{brl(item.valorAPrestar)}</div>
                                    <div className="text-[10px] text-gray-400">a prestar</div>
                                </div>
                                <button onClick={() => abrirCaixa(item)}
                                    className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-xs md:text-sm min-h-[44px] md:min-h-0 md:py-2 w-full md:w-auto">
                                    Conferir
                                </button>
                            </Linha>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Caixas a fechar ── */}
            {aFechar.length > 0 && (
                <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 md:px-5 py-3 border-b border-green-100 bg-green-50/70">
                        <Lock className="h-4 w-4 text-primaryDark" />
                        <span className="text-xs font-bold uppercase tracking-widest text-primaryDark">Caixas a fechar</span>
                        <span className="ml-auto px-2 py-1 text-xs font-semibold rounded-full bg-mint text-primaryDark">
                            {aFechar.length}
                        </span>
                    </div>
                    <div className="px-4 md:px-5 py-1">
                        {aFechar.map(item => (
                            <Linha key={item.caixaId}>
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-gray-900 text-sm">{item.vendedorNome} · {dataBR(item.data)}</div>
                                    <div className={`text-xs ${Math.abs(item.diferenca) > 0.009 ? 'text-red-600' : 'text-primaryDark'}`}>
                                        ✓ conferido por {item.conferidoPor} às {hora(item.conferidoEm)}
                                        {Math.abs(item.diferenca) > 0.009
                                            ? ` · ${item.diferenca < 0 ? 'faltou' : 'sobrou'} ${brl(Math.abs(item.diferenca))}${item.autorizadoPor ? ` (autorizado por ${item.autorizadoPor})` : ''}`
                                            : ' · sem diferença'}
                                    </div>
                                </div>
                                <div className="font-bold text-gray-900 text-sm tabular-nums">{brl(item.valorAPrestar)}</div>
                                <button onClick={() => abrirCaixa(item)}
                                    className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-xs md:text-sm min-h-[44px] md:min-h-0 md:py-2 w-full md:w-auto">
                                    Fechar
                                </button>
                            </Linha>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Conferi hoje ── */}
            {conferi.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <button onClick={() => setVerHistorico(v => !v)}
                        className="w-full flex items-center gap-2 px-4 md:px-5 py-3 border-b border-gray-100 text-left">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Conferi hoje</span>
                        <span className="ml-auto px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">{conferi.length}</span>
                        {verHistorico ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </button>
                    {verHistorico && (
                        <div className="px-4 md:px-5 py-1">
                            {conferi.map(item => (
                                <Linha key={item.caixaId}>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 text-sm">{item.vendedorNome} · {dataBR(item.data)}</div>
                                        <div className="text-xs text-gray-500">
                                            às {hora(item.conferidoEm)}
                                            {Math.abs(item.diferenca) > 0.009
                                                ? <span className="text-red-600"> · {item.diferenca < 0 ? 'faltou' : 'sobrou'} {brl(Math.abs(item.diferenca))}</span>
                                                : ' · sem diferença'}
                                            {item.statusCaixa !== 'ABERTO'
                                                ? <span className="text-primaryDark"> · fechado{item.fechadoPor ? ` por ${item.fechadoPor}` : ''}</span>
                                                : ' · aguardando fechamento'}
                                        </div>
                                    </div>
                                    <div className="font-bold text-gray-900 text-sm tabular-nums">{brl(item.valorContado)}</div>
                                </Linha>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {aConferir.some(i => i.diasParado >= 2) && (
                <p className="text-xs text-red-600 flex items-center gap-1.5 px-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Caixa parado há 2 dias ou mais: o WhatsApp de cobrança já está saindo todo dia de manhã.
                </p>
            )}
        </div>
    );
};

export default CaixasPendentesAgenda;
