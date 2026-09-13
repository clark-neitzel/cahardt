import React, { useMemo, useState } from 'react';
import { SlidersHorizontal, X, Maximize } from 'lucide-react';
import MultiSelect from '../../../components/MultiSelect';
import SelectBusca from '../../../components/SelectBusca';
import { DIAS_SEMANA } from '../../../components/DayPicker';
import { OPCOES_COLORIR, SEM_VALOR } from './coresMapa';
import { FILTROS_PADRAO } from './useDadosMapa';

// Barra de filtros do Mapa de Clientes.
// Linha de cima (rolável no celular): botão "Filtros (N)", pílulas "Colorir por",
// Enquadrar. A folha de filtros abre embaixo (grid 1 col no celular, 3/5 no desktop).
// `opcoes` vem do backend (montadas do conjunto inteiro — opção nunca some do menu
// por causa do resultado); `vendedores` = { valor, label } com "(inativo)";
// `categorias` = união do cadastro com as que aparecem nos clientes.
export default function FiltrosMapa({ filtros, setFiltros, opcoes, vendedores, categorias, onEnquadrar }) {
    const [aberto, setAberto] = useState(false);

    const set = (campo, valor) => setFiltros(prev => ({ ...prev, [campo]: valor }));

    const opCidades = useMemo(() => (opcoes?.cidades || []).map(c => ({ valor: c.valor, label: `${c.valor} (${c.qtd})` })), [opcoes]);
    // Bairros dependem da cidade marcada (quando há cidade, só os dela)
    const opBairros = useMemo(() => {
        const cid = new Set(filtros.cidades || []);
        return (opcoes?.bairros || [])
            .filter(b => !cid.size || cid.has(b.cidade))
            .map(b => ({ valor: `${b.cidade || ''}|${b.valor}`, label: cid.size === 1 ? `${b.valor} (${b.qtd})` : `${b.valor} · ${b.cidade || 'sem cidade'} (${b.qtd})` }));
    }, [opcoes, filtros.cidades]);
    const opCategorias = useMemo(() => [
        ...(categorias || []).map(c => ({ valor: c.id, label: c.nome })),
        { valor: SEM_VALOR, label: 'Sem categoria' },
    ], [categorias]);
    const opVendedores = useMemo(() => [...(vendedores || []), { valor: SEM_VALOR, label: 'Sem vendedor' }], [vendedores]);
    const opDias = useMemo(() => DIAS_SEMANA.map(d => ({ valor: d, label: d })), []);

    const ativos = useMemo(() => {
        let n = 0;
        ['cidades', 'bairros', 'categorias', 'vendedores', 'diasEntrega', 'diasVenda'].forEach(k => { if ((filtros[k] || []).length) n++; });
        ['whatsapp', 'gps', 'ativo'].forEach(k => { if (filtros[k] !== FILTROS_PADRAO[k]) n++; });
        return n;
    }, [filtros]);

    const limpar = () => setFiltros(prev => ({ ...FILTROS_PADRAO, colorirPor: prev.colorirPor }));

    return (
        <div className="bg-white border-x border-t border-gray-200 rounded-t-xl">
            <div className="flex items-center gap-2 p-2 md:p-3 overflow-x-auto hide-scrollbar">
                <button
                    type="button"
                    onClick={() => setAberto(v => !v)}
                    aria-expanded={aberto}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-full border text-sm font-medium ${ativos ? 'bg-mint border-primary text-primaryDark' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filtros{ativos ? ` · ${ativos}` : ''}
                </button>
                {ativos > 0 && (
                    <button type="button" onClick={limpar} className="shrink-0 inline-flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-full text-sm text-gray-600 hover:bg-gray-100">
                        <X className="h-4 w-4" /> Limpar
                    </button>
                )}
                <span className="shrink-0 h-6 w-px bg-gray-200 mx-1" aria-hidden="true" />
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-gray-600">Colorir por</span>
                {OPCOES_COLORIR.map(o => (
                    <button
                        key={o.valor}
                        type="button"
                        aria-pressed={filtros.colorirPor === o.valor}
                        onClick={() => set('colorirPor', o.valor)}
                        className={`shrink-0 px-3 py-2 min-h-[40px] rounded-full text-xs font-semibold border transition-colors ${filtros.colorirPor === o.valor ? 'bg-primary border-primary text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                        {o.label}
                    </button>
                ))}
                <span className="shrink-0 h-6 w-px bg-gray-200 mx-1" aria-hidden="true" />
                <button type="button" onClick={onEnquadrar} title="Enquadrar todos os pinos" className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-full border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                    <Maximize className="h-4 w-4" /> Enquadrar
                </button>
            </div>

            {aberto && (
                <div className="border-t border-gray-100 p-3 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2">
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Cidade</label>
                        <MultiSelect options={opCidades} selected={filtros.cidades} onChange={v => setFiltros(p => ({ ...p, cidades: v, bairros: [] }))} valueKey="valor" labelKey="label" placeholder="Todas" summary searchable summaryNoun="cidade" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Bairro</label>
                        <MultiSelect options={opBairros} selected={filtros.bairros} onChange={v => set('bairros', v)} valueKey="valor" labelKey="label" placeholder="Todos" summary searchable summaryNoun="bairro" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Categoria</label>
                        <MultiSelect options={opCategorias} selected={filtros.categorias} onChange={v => set('categorias', v)} valueKey="valor" labelKey="label" placeholder="Todas" summary searchable summaryNoun="categoria" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Vendedor</label>
                        <MultiSelect options={opVendedores} selected={filtros.vendedores} onChange={v => set('vendedores', v)} valueKey="valor" labelKey="label" placeholder="Todos" summary searchable summaryNoun="vendedor" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Dia de entrega</label>
                        <MultiSelect options={opDias} selected={filtros.diasEntrega} onChange={v => set('diasEntrega', v)} valueKey="valor" labelKey="label" placeholder="Todos" summaryNoun="dia" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Dia de venda</label>
                        <MultiSelect options={opDias} selected={filtros.diasVenda} onChange={v => set('diasVenda', v)} valueKey="valor" labelKey="label" placeholder="Todos" summaryNoun="dia" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">WhatsApp</label>
                        <SelectBusca value={filtros.whatsapp} onChange={e => set('whatsapp', e.target.value)} className="w-full">
                            <option value="todos">Todos</option>
                            <option value="com">Tem WhatsApp</option>
                            <option value="sem">Sem WhatsApp</option>
                        </SelectBusca>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Ponto GPS</label>
                        <SelectBusca value={filtros.gps} onChange={e => set('gps', e.target.value)} className="w-full">
                            <option value="todos">Todos</option>
                            <option value="com">Com GPS</option>
                            <option value="sem">Sem GPS</option>
                        </SelectBusca>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Situação</label>
                        <SelectBusca value={filtros.ativo} onChange={e => set('ativo', e.target.value)} className="w-full">
                            <option value="ativos">Só ativos</option>
                            <option value="inativos">Só inativos</option>
                            <option value="todos">Ativos e inativos</option>
                        </SelectBusca>
                    </div>
                </div>
            )}
        </div>
    );
}
