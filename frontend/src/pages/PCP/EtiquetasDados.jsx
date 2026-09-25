import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import etiquetaService from '../../services/etiquetaService';
import SelectBusca from '../../components/SelectBusca';
import { pesoPacoteStr, orientacaoValida, ORIENTACOES } from './etiquetaModelos';
import { BotaoOrientacao } from './OrientacaoEtiqueta';

export default function EtiquetasDados() {
    const navigate = useNavigate();
    const [lista, setLista] = useState([]);
    const [loading, setLoading] = useState(true);
    const [salvandoOrientacao, setSalvandoOrientacao] = useState(null); // id em troca
    const [search, setSearch] = useState(
        () => localStorage.getItem('etiquetas_dados_search') || ''
    );
    const [ativoFiltro, setAtivoFiltro] = useState(
        () => localStorage.getItem('etiquetas_dados_ativo') ?? 'true'
    );

    const setSearchSalvo = (v) => { setSearch(v); localStorage.setItem('etiquetas_dados_search', v); };
    const setAtivoSalvo  = (v) => { setAtivoFiltro(v); localStorage.setItem('etiquetas_dados_ativo', v); };

    const carregar = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (search.trim()) params.search = search.trim();
            if (ativoFiltro !== '') params.ativo = ativoFiltro;
            const data = await etiquetaService.listar(params);
            setLista(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error('Erro ao carregar etiquetas: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [search, ativoFiltro]);

    useEffect(() => { carregar(); }, [carregar]);

    const handleToggle = async (id) => {
        try {
            await etiquetaService.toggle(id);
            toast.success('Status alterado');
            carregar();
        } catch (err) {
            toast.error(err.message);
        }
    };

    // Orientação (em pé ⇄ deitada): salva no clique, sem confirmação — igual ao Ativar/Inativar.
    // Atualiza a linha na hora com o que o servidor devolveu (sem recarregar a lista inteira).
    const handleOrientacao = async (et) => {
        if (salvandoOrientacao) return;
        setSalvandoOrientacao(et.id);
        try {
            const atualizada = await etiquetaService.orientacao(et.id);
            const nova = orientacaoValida(atualizada?.orientacao);
            setLista(l => l.map(x => (x.id === et.id ? { ...x, orientacao: nova } : x)));
            toast.success(`${et.nomeProduto}: etiqueta ${ORIENTACOES[nova].label.toLowerCase()}`);
        } catch (err) {
            toast.error('Não foi possível trocar a orientação: ' + err.message);
        } finally {
            setSalvandoOrientacao(null);
        }
    };

    const handleRemover = async (id, nome) => {
        if (!confirm(`Remover etiqueta "${nome}"?`)) return;
        try {
            await etiquetaService.remover(id);
            toast.success('Etiqueta removida');
            carregar();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const Acoes = ({ et }) => (
        <div className="flex items-center justify-end gap-1">
            <button
                onClick={() => navigate(`/pcp/etiquetas/${et.id}/imprimir`)}
                className="p-2 text-gray-500 hover:text-primary rounded-full hover:bg-gray-100"
                title="Imprimir etiqueta"
                aria-label="Imprimir etiqueta"
            >
                <Printer className="h-4 w-4" />
            </button>
            <button
                onClick={() => navigate(`/pcp/etiquetas/${et.id}/editar`)}
                className="p-2 text-gray-500 hover:text-primary rounded-full hover:bg-gray-100"
                title="Editar"
                aria-label="Editar"
            >
                <Pencil className="h-4 w-4" />
            </button>
            <button
                onClick={() => handleToggle(et.id)}
                className="p-2 text-gray-500 hover:text-yellow-600 rounded-full hover:bg-gray-100"
                title={et.ativo ? 'Inativar' : 'Ativar'}
                aria-label={et.ativo ? 'Inativar' : 'Ativar'}
            >
                {et.ativo
                    ? <ToggleRight className="h-4 w-4 text-green-500" />
                    : <ToggleLeft className="h-4 w-4" />
                }
            </button>
            <button
                onClick={() => handleRemover(et.id, et.nomeProduto)}
                className="p-2 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100"
                title="Remover"
                aria-label="Remover"
            >
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
    );

    const BadgeStatus = ({ ativo }) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
            ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
        }`}>
            {ativo ? 'Ativo' : 'Inativo'}
        </span>
    );

    return (
        <div className="w-full max-w-full overflow-x-hidden px-3 py-4 md:px-4 md:py-6">
            {/* Cabeçalho — no celular o botão vai para a linha de baixo, largura toda */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4 md:mb-6">
                <div>
                    <h1 className="text-lg md:text-2xl font-bold text-gray-800">Dados das Etiquetas</h1>
                    <p className="text-sm text-gray-500 mt-0.5 md:mt-1">Cadastro de informações nutricionais e de rótulo dos produtos</p>
                </div>
                <button
                    onClick={() => navigate('/pcp/etiquetas/nova')}
                    className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full text-sm font-semibold shadow-sm transition-colors w-full md:w-auto"
                >
                    <Plus className="h-4 w-4" />
                    Nova Etiqueta
                </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nome ou código..."
                        value={search}
                        onChange={e => setSearchSalvo(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-base md:text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                </div>
                <SelectBusca
                    value={ativoFiltro}
                    onChange={e => setAtivoSalvo(e.target.value)}
                    className="w-full sm:w-40"
                >
                    <option value="true">Ativos</option>
                    <option value="false">Inativos</option>
                    <option value="">Todos</option>
                </SelectBusca>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Carregando...</div>
            ) : lista.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
                    Nenhuma etiqueta encontrada.{' '}
                    <button onClick={() => navigate('/pcp/etiquetas/nova')} className="text-primary font-semibold hover:underline">
                        Cadastrar primeira
                    </button>
                </div>
            ) : (
                <>
                    {/* Mobile: cards */}
                    <div className="md:hidden space-y-3">
                        {lista.map(et => (
                            <div key={et.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-gray-900 leading-snug">{et.nomeProduto}</div>
                                        <div className="mt-0.5 text-xs font-mono text-primaryDark">
                                            {et.produto?.codigo || et.codigoProduto}
                                            {et.produto?.codigo && et.produto.codigo !== et.codigoProduto && (
                                                <span className="text-gray-500"> · int: {et.codigoProduto}</span>
                                            )}
                                            {et.produto && <span className="ml-2 font-sans text-primaryDark bg-mint px-1.5 py-0.5 rounded">vinculado</span>}
                                        </div>
                                    </div>
                                    <BadgeStatus ativo={et.ativo} />
                                </div>
                                <div className="text-sm text-gray-600">
                                    {et.pesoUnitario}g · {et.quantidadeEmbalagem} un · {et.validadeDias} dias
                                    {pesoPacoteStr(et.pesoPacote) && <> · pacote {pesoPacoteStr(et.pesoPacote)}</>}
                                </div>
                                <div className="mt-3 flex items-center justify-between gap-2">
                                    <BotaoOrientacao
                                        orientacao={et.orientacao}
                                        salvando={salvandoOrientacao === et.id}
                                        onToggle={() => handleOrientacao(et)}
                                    />
                                    <Acoes et={et} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop: tabela */}
                    <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome do Produto</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Peso</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Qtd. Emb.</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Validade</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Orientação</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lista.map(et => (
                                    <tr key={et.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-mono text-xs">
                                            <span className="text-primaryDark font-semibold">
                                                {et.produto?.codigo || et.codigoProduto}
                                            </span>
                                            {et.produto?.codigo && et.produto.codigo !== et.codigoProduto && (
                                                <span className="block text-gray-500 text-[11px]">int: {et.codigoProduto}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-800">
                                            {et.nomeProduto}
                                            {et.produto && (
                                                <span className="ml-2 text-xs text-primaryDark bg-mint px-1.5 py-0.5 rounded">
                                                    vinculado
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {et.pesoUnitario}g
                                            {pesoPacoteStr(et.pesoPacote) && (
                                                <span className="block text-[11px] text-gray-500">pacote {pesoPacoteStr(et.pesoPacote)}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{et.quantidadeEmbalagem} un</td>
                                        <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{et.validadeDias} dias</td>
                                        <td className="px-4 py-3">
                                            <BotaoOrientacao
                                                orientacao={et.orientacao}
                                                salvando={salvandoOrientacao === et.id}
                                                onToggle={() => handleOrientacao(et)}
                                            />
                                        </td>
                                        <td className="px-4 py-3"><BadgeStatus ativo={et.ativo} /></td>
                                        <td className="px-4 py-3"><Acoes et={et} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <p className="text-xs text-gray-500 mt-3">{lista.length} etiqueta(s) encontrada(s)</p>
        </div>
    );
}
