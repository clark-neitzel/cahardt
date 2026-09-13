import React, { useMemo, useState } from 'react';
import { Users, Loader2, ArrowLeftRight } from 'lucide-react';
import EstadoVazio from '../../../components/EstadoVazio';

// Vizinhos atendidos em dias de entrega DIFERENTES (pares a menos de R metros
// sem dia em comum). A lista vem do backend sobre o conjunto visível ao usuário;
// aqui aplicamos os filtros da tela (os DOIS clientes precisam estar no filtro).
// O raio é um ajuste local ("Aplicar" refaz a consulta); "Salvar como padrão"
// grava em app_configs e só aparece para admin || clientes.edit (espelho do PUT).
export default function PainelVizinhos({
    resultado, carregando, erro, uuidsFiltrados, raio, setRaio, onAplicar,
    onSalvarPadrao, podeSalvarPadrao, salvandoPadrao, parSelecionado, onSelecionarPar, onEditarCliente,
}) {
    const [raioInvalido, setRaioInvalido] = useState(false);
    const pares = useMemo(() => (resultado?.pares || []).filter(p => uuidsFiltrados.has(p.a.uuid) && uuidsFiltrados.has(p.b.uuid)), [resultado, uuidsFiltrados]);

    const aplicar = () => {
        const n = parseInt(raio, 10);
        if (!Number.isFinite(n) || n < 100 || n > 20000) { setRaioInvalido(true); return; }
        setRaioInvalido(false);
        onAplicar(n);
    };

    const chaveDoPar = (p) => `${p.a.uuid}|${p.b.uuid}`;

    return (
        <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2">Raio de vizinhança</p>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="number" inputMode="numeric" min={100} max={20000} step={50}
                            value={raio}
                            onChange={e => setRaio(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') aplicar(); }}
                            aria-label="Raio em metros"
                            className={`w-full border rounded px-3 py-2 pr-8 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${raioInvalido ? 'border-red-400' : 'border-gray-300'}`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">m</span>
                    </div>
                    <button type="button" onClick={aplicar} disabled={carregando} className="px-4 py-2 min-h-[40px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white rounded-full shadow-sm font-semibold text-sm shrink-0">
                        Aplicar
                    </button>
                </div>
                {raioInvalido && <p className="text-xs text-red-600 mt-1">Informe um raio entre 100 e 20.000 metros.</p>}
                {podeSalvarPadrao && (
                    <button type="button" onClick={() => onSalvarPadrao(parseInt(raio, 10))} disabled={salvandoPadrao || raioInvalido} className="mt-2 text-xs font-medium text-primary hover:underline disabled:opacity-50 min-h-[32px]">
                        {salvandoPadrao ? 'Salvando…' : 'Salvar como padrão para todos'}
                    </button>
                )}
                {resultado && !carregando && (
                    <p className="text-xs text-gray-500 mt-2">
                        {pares.length} {pares.length === 1 ? 'par' : 'pares'} no filtro
                        {resultado.total != null && resultado.total !== pares.length ? ` · ${resultado.total} no total` : ''}
                        {resultado.universo != null ? ` · ${resultado.universo} clientes com GPS e dia de entrega` : ''}
                    </p>
                )}
                {resultado?.truncado && (
                    <p className="text-xs text-amber-700 mt-1">Mostrando os {resultado.pares?.length || 0} pares mais próximos de {resultado.total}. Reduza o raio ou filtre por cidade.</p>
                )}
            </div>

            {carregando && (
                <div className="flex items-center gap-2 text-sm text-gray-600 px-1"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Procurando vizinhos…</div>
            )}
            {erro && !carregando && <p className="text-sm text-red-600 px-1">{erro}</p>}

            {!carregando && !erro && !pares.length && (
                <EstadoVazio icon={Users} titulo="Nenhum vizinho em dias diferentes" descricao="Dentro deste raio e deste filtro, quem é vizinho já recebe no mesmo dia. Aumente o raio ou amplie o filtro." />
            )}

            {!carregando && pares.length > 0 && (
                <ul className="space-y-1.5">
                    {pares.map(p => {
                        const ativo = parSelecionado === chaveDoPar(p);
                        return (
                            <li key={chaveDoPar(p)}>
                                <button
                                    type="button"
                                    onClick={() => onSelecionarPar(p)}
                                    aria-pressed={ativo}
                                    className={`w-full text-left rounded-xl border p-3 min-h-[44px] ${ativo ? 'border-primary bg-mint/40' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold text-gray-500 tabular-nums">{p.distanciaMetros} m</span>
                                        {p.a.cidade && <span className="text-[11px] text-gray-500 truncate">{p.a.cidade}</span>}
                                    </div>
                                    <div className="mt-1 text-sm text-gray-900 leading-snug">
                                        <span className="font-medium">{p.a.nome}</span> <span className="text-xs text-gray-500">({(p.a.diasEntrega || []).join(', ') || '—'})</span>
                                        <ArrowLeftRight className="inline h-3.5 w-3.5 mx-1 text-gray-400 align-[-2px]" />
                                        <span className="font-medium">{p.b.nome}</span> <span className="text-xs text-gray-500">({(p.b.diasEntrega || []).join(', ') || '—'})</span>
                                    </div>
                                </button>
                                {ativo && (
                                    <div className="flex gap-2 mt-1.5 px-1">
                                        <button type="button" onClick={() => onEditarCliente(p.a.uuid)} className="flex-1 px-3 py-2 min-h-[40px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-medium truncate">Editar {p.a.nome}</button>
                                        <button type="button" onClick={() => onEditarCliente(p.b.uuid)} className="flex-1 px-3 py-2 min-h-[40px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-medium truncate">Editar {p.b.nome}</button>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
