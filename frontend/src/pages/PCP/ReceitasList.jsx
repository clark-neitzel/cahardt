import { useState, useEffect, useCallback } from 'react';
import { Search, Plus, BookOpen, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import pcpReceitaService from '../../services/pcpReceitaService';
import SelectBusca from '../../components/SelectBusca';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { useAtualizaAoVoltar } from '../../hooks/useAtualizaAoVoltar';

const STATUS_CORES = {
    ativa: 'bg-green-100 text-green-800',
    inativa: 'bg-gray-100 text-gray-600',
    rascunho: 'bg-yellow-100 text-yellow-800',
};

// Tipo do item produzido pela receita (mesmas siglas do cadastro de Itens PCP)
const TIPOS_ITEM = [
    { valor: 'SUB', rotulo: 'Subproduto' },
    { valor: 'PA', rotulo: 'Produto acabado (montado)' },
    { valor: 'MP', rotulo: 'Matéria-prima' },
    { valor: 'EMB', rotulo: 'Embalagem' },
];
const TIPO_ROTULO = Object.fromEntries(TIPOS_ITEM.map(t => [t.valor, t.rotulo]));
const TIPO_CORES = {
    SUB: 'bg-amber-100 text-amber-700',
    PA: 'bg-green-100 text-green-800',
    MP: 'bg-gray-100 text-gray-700',
    EMB: 'bg-purple-100 text-purple-700',
};

export default function ReceitasList() {
    const navigate = useNavigate();
    const [receitas, setReceitas] = useState([]);
    const [loading, setLoading] = useState(true);
    // Busca também é lembrada por usuário (pedido do dono 15/09/2026): ao abrir uma
    // receita e voltar, a lista reabre filtrada do mesmo jeito.
    const [search, setSearch] = useFiltroSalvo('receitas-list:search', '');
    const [statusFiltro, setStatusFiltro] = useFiltroSalvo('receitas-list:statusFiltro', '');
    // Tipo do item que a receita PRODUZ (SUB = subproduto, PA = produto acabado/montado).
    // '' = todos juntos. Também lembrado por usuário.
    const [tipoFiltro, setTipoFiltro] = useFiltroSalvo('receitas-list:tipoFiltro', '');

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (statusFiltro) params.status = statusFiltro;
            const data = await pcpReceitaService.listar(params);
            setReceitas(data);
        } catch (err) {
            toast.error('Erro ao carregar receitas');
        } finally {
            setLoading(false);
        }
    }, [statusFiltro]);

    useEffect(() => { carregar(); }, [carregar]);
    useAtualizaAoVoltar(carregar); // rebusca ao voltar ao app / a cada 5 min

    const porTipo = tipoFiltro ? receitas.filter(r => r.itemPcp?.tipo === tipoFiltro) : receitas;
    const filtradas = search.trim()
        ? porTipo.filter(r =>
            r.nome.toLowerCase().includes(search.toLowerCase()) ||
            r.itemPcp?.nome?.toLowerCase().includes(search.toLowerCase())
        )
        : porTipo;
    // Contagem por tipo sobre a lista COMPLETA carregada (não a filtrada), para a opção
    // marcada nunca sumir do menu.
    const contagemTipo = receitas.reduce((acc, r) => {
        const t = r.itemPcp?.tipo || 'OUTRO';
        acc[t] = (acc[t] || 0) + 1;
        return acc;
    }, {});

    return (
        <div className="w-full px-4 py-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Receitas</h1>
                    <p className="text-sm text-gray-500 mt-1">Receitas de producao com versoes e composicao</p>
                </div>
                <button
                    onClick={() => navigate('/pcp/receitas/nova')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Nova Receita
                </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar receita ou item..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <SelectBusca
                    value={tipoFiltro}
                    onChange={e => setTipoFiltro(e.target.value)}
                    className="w-full md:w-56"
                >
                    <option value="">Todos os tipos ({receitas.length})</option>
                    {TIPOS_ITEM.map(t => (
                        <option key={t.valor} value={t.valor}>{t.rotulo} ({contagemTipo[t.valor] || 0})</option>
                    ))}
                </SelectBusca>
                <SelectBusca
                    value={statusFiltro}
                    onChange={e => setStatusFiltro(e.target.value)}
                >
                    <option value="">Todos os status</option>
                    <option value="ativa">Ativa</option>
                    <option value="inativa">Inativa</option>
                    <option value="rascunho">Rascunho</option>
                </SelectBusca>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : filtradas.length === 0 ? (
                <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500">Nenhuma receita encontrada</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {filtradas.map(receita => (
                        <div
                            key={receita.id}
                            onClick={() => navigate(`/pcp/receitas/${receita.id}`)}
                            className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all"
                        >
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div>
                                        <h3 className="font-medium text-gray-800">{receita.nome}</h3>
                                        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TIPO_CORES[receita.itemPcp?.tipo] || 'bg-gray-100 text-gray-700'}`}>
                                                {TIPO_ROTULO[receita.itemPcp?.tipo] || receita.itemPcp?.tipo || 'Sem item'}
                                            </span>
                                            <span>Produz: {receita.itemPcp?.nome}</span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">v{receita.versao}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CORES[receita.status]}`}>
                                        {receita.status}
                                    </span>
                                    <span className="text-sm text-gray-600">
                                        Rend: {parseFloat(receita.rendimentoBase).toFixed(3)} {receita.itemPcp?.unidade}
                                    </span>
                                    <span className="text-xs text-gray-400">{receita._count?.itens || 0} itens</span>
                                    <Eye className="h-4 w-4 text-gray-400" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
