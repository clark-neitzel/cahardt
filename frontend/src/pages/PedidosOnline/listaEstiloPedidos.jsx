import React from 'react';
import { Search, X, RefreshCw, Bell } from 'lucide-react';

// Peças visuais da lista de Pedidos Online no MESMO desenho da aba de Pedidos
// (ListaPedidos.jsx): barra de busca em card branco, chips de status com
// contagem, linha "Pendentes:" e a linha de pedido em 3 linhas (nº + cliente +
// valor / infos / selos + botão Detalhes). Pedido do dono em 14/09/2026.
// Só apresentação — cada canal (Site/Kit Festa) continua com seus dados e regras.

export function BarraBuscaPedidos({ valor, onChange, placeholder, onAtualizar, autoFocus = false }) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sm:p-4 mb-4">
            <div className="flex gap-2 w-full">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        autoFocus={autoFocus}
                        type="text"
                        placeholder={placeholder}
                        value={valor}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full pl-9 pr-8 py-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-primary focus:border-primary text-sm shadow-sm"
                    />
                    {valor && (
                        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="Limpar busca">
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {onAtualizar && (
                    <button onClick={onAtualizar} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 border border-gray-300 shrink-0" title="Atualizar">
                        <RefreshCw className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * chips: [{ key, label, icon, active }] — `active` = classes quando selecionado
 * (ex.: 'bg-green-100 text-green-800 border-green-300'); contagens: { [key]: n }
 */
export function ChipsStatusPedidos({ chips, valor, onChange, contagens }) {
    return (
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
            {chips.map(({ key, label, icon: Icon, active }) => {
                const ativo = valor === key;
                const count = contagens?.[key] ?? 0;
                return (
                    <button
                        key={key || 'todos'}
                        onClick={() => onChange(ativo && key !== '' ? '' : key)}
                        title={label}
                        className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-full border transition-colors shrink-0 ${ativo ? active : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                    >
                        {Icon && <Icon className="h-3.5 w-3.5" />}
                        <span className={ativo ? 'inline' : 'hidden sm:inline'}>{label}</span>
                        {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
                    </button>
                );
            })}
        </div>
    );
}

// Linha "PENDENTES: [• N Aguardando] [• N Sem cadastro]" — igual à da aba de Pedidos
export function PendentesPedidos({ itens, onClick }) {
    const comValor = (itens || []).filter((i) => i.total > 0);
    if (!comValor.length) return null;
    const cores = {
        amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
        red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' },
    };
    return (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                <Bell className="h-3 w-3 text-amber-600" /> Pendentes:
            </div>
            {comValor.map((st) => {
                const c = cores[st.color] || cores.amber;
                const Icon = st.icon;
                return (
                    <button
                        key={st.key}
                        onClick={() => onClick?.(st.key)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${c.bg} ${c.border} ${c.text}`}
                        title={st.label}
                    >
                        <span className={`h-1.5 w-1.5 rounded-full ${c.dot} animate-pulse`} style={{ willChange: 'opacity' }} />
                        {Icon && <Icon className="h-3 w-3" />}
                        {st.total} {st.label}
                    </button>
                );
            })}
        </div>
    );
}

export function ListaLinhasPedidos({ loading, vazio, children }) {
    return (
        <div className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            <div className="divide-y divide-gray-200">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 p-10">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                        <span className="text-sm text-gray-500">Carregando pedidos…</span>
                    </div>
                ) : vazio ? (
                    <div className="p-10 text-center text-sm text-gray-500">{vazio}</div>
                ) : children}
            </div>
        </div>
    );
}

/**
 * Uma linha de pedido, no desenho da aba de Pedidos.
 * - numero: texto do selo (ex.: '#31')
 * - novo: true → selo dourado NOVO (pedido que ainda precisa de ação)
 * - inativo: true → linha esmaecida (recusado/cancelado)
 * - nome, valor (string já formatada)
 * - linha2: array de trechos da 1ª linha de infos (separados por |)
 * - linha3: texto em caixa alta (cidade/bairro) — opcional
 * - extras: array de linhas pequenas (Vendedor:, Doc:, etc.) — opcional
 * - selos: array de { texto, cls, icon?, title? }
 * - acoes: nós React à direita (botões); Detalhes é adicionado sempre
 */
export function LinhaPedidoOnline({ numero, novo, inativo, nome, valor, linha2 = [], linha3, extras = [], selos = [], acoes, onAbrir, textoBotao = 'Detalhes' }) {
    return (
        <div
            onClick={onAbrir}
            className={`px-3 pt-3 pb-2 hover:bg-gray-50 transition-colors overflow-hidden cursor-pointer ${inativo ? 'opacity-60' : ''}`}
        >
            {/* Linha 1: número + cliente + valor */}
            <div className="flex items-start gap-2 mb-1">
                {novo && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#cba258] text-white shrink-0 mt-0.5 shadow-sm tracking-wide" title="Pedido ainda precisa de ação">
                        NOVO
                    </span>
                )}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 shadow-sm mt-0.5 text-blue-700 bg-blue-50 border-blue-100">
                    {numero}
                </span>
                <h3 className="text-[13px] font-bold text-gray-900 truncate flex-1 min-w-0">{nome}</h3>
                <span className="text-[13px] font-black text-gray-900 whitespace-nowrap shrink-0 ml-1">{valor}</span>
            </div>

            {/* Linha 2: infos */}
            <div className="flex flex-col gap-0.5 text-[11px] text-gray-500 mb-2">
                {linha2.length > 0 && (
                    <div className="flex items-center gap-1 font-medium flex-wrap">
                        {linha2.filter(Boolean).map((t, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && <span className="text-gray-300">|</span>}
                                <span className={i === 0 ? 'text-gray-800' : ''}>{t}</span>
                            </React.Fragment>
                        ))}
                    </div>
                )}
                {linha3 && <div className="uppercase text-gray-500">{linha3}</div>}
                {extras.filter(Boolean).map((t, i) => <div key={i} className="text-[10px] text-gray-500">{t}</div>)}
            </div>

            {/* Linha 3: selos + botões */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1 min-w-0">
                    {selos.filter(Boolean).map((s, i) => {
                        const Icon = s.icon;
                        return (
                            <span key={i} title={s.title} className={`px-2 py-1 flex-shrink-0 inline-flex items-center gap-1 text-[10px] leading-tight font-semibold rounded-full ${s.cls}`}>
                                {Icon && <Icon className="h-2.5 w-2.5" />}{s.texto}
                            </span>
                        );
                    })}
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                    {acoes}
                    <button
                        onClick={onAbrir}
                        className="px-2.5 py-1.5 text-[11px] font-bold bg-white border border-gray-300 rounded-lg raio-proprio text-gray-700 hover:bg-gray-50 shadow-sm whitespace-nowrap"
                    >
                        {textoBotao}
                    </button>
                </div>
            </div>
        </div>
    );
}
