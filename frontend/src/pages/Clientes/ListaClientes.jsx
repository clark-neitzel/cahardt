
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clienteService from '../../services/clienteService';
import vendedorService from '../../services/vendedorService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import fornecedorService from '../../services/fornecedorService';
import { Search, MapPin, Phone, User, Filter, Settings, X, Save, AlertTriangle, MessageCircle, AlertCircle, UserPlus, Building2, ArrowRight } from 'lucide-react';
import SelectBusca from '../../components/SelectBusca';
import { opcoesVendedorFiltro, somenteAtivos } from '../../utils/vendedoresFiltro';
import { useAuth } from '../../contexts/AuthContext';

const DIAS_SEMANA = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM', 'N/D'];

const ListaClientes = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const permsUser = user?.permissoes || {};
    const podeCadastrar = permsUser.admin || permsUser.clientes?.edit;
    const podeVerFornecedores = permsUser.admin || permsUser.Pode_Acessar_Fornecedores;

    const getSaved = (key, defaultVal) => {
        const saved = localStorage.getItem(`clientesFiltro_${key}`);
        return saved !== null ? saved : defaultVal;
    };
    const saveToLocal = (key, val) => {
        if (val) localStorage.setItem(`clientesFiltro_${key}`, val);
        else localStorage.removeItem(`clientesFiltro_${key}`);
    };

    const initialSearch = searchParams.get('search') !== null ? searchParams.get('search') : getSaved('search', '');
    const initialPage = parseInt(searchParams.get('page')) || 1;
    const initialLimit = parseInt(searchParams.get('limit')) || parseInt(getSaved('limit', '25'));
    const initialVendedor = searchParams.get('idVendedor') !== null ? searchParams.get('idVendedor') : getSaved('idVendedor', '');
    const initialDiaEntrega = searchParams.get('diaEntrega') !== null ? searchParams.get('diaEntrega') : getSaved('diaEntrega', '');
    const initialDiaVenda = searchParams.get('diaVenda') !== null ? searchParams.get('diaVenda') : getSaved('diaVenda', '');
    const initialCondPadrão = searchParams.get('condicaoPagamento') !== null ? searchParams.get('condicaoPagamento') : getSaved('condicaoPagamento', '');
    const initialCondPermitida = searchParams.get('condicaoPermitida') !== null ? searchParams.get('condicaoPermitida') : getSaved('condicaoPermitida', '');
    const rawSemVenda = searchParams.get('semVenda') !== null ? searchParams.get('semVenda') : getSaved('semVenda', '');
    // Formato antigo do filtro ('30', '90'...) vira faixa com só o "De" preenchido
    const initialSemVenda = /^\d+$/.test(rawSemVenda) ? 'faixa' : rawSemVenda;
    const initialSemVendaDe = searchParams.get('semVendaDe') !== null ? searchParams.get('semVendaDe') : getSaved('semVendaDe', /^\d+$/.test(rawSemVenda) ? rawSemVenda : '');
    const initialSemVendaAte = searchParams.get('semVendaAte') !== null ? searchParams.get('semVendaAte') : getSaved('semVendaAte', '');
    const initialPerfil = searchParams.get('perfil') !== null ? searchParams.get('perfil') : getSaved('perfil', '');

    // Estados de Dados
    const [clientes, setClientes] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [condicoesPagamento, setCondicoesPagamento] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRegistros, setTotalRegistros] = useState(0);

    // Filtros
    const [search, setSearch] = useState(initialSearch);
    const [page, setPage] = useState(initialPage);
    const [limit, setLimit] = useState(initialLimit);
    const [activeTab, setActiveTab] = useState(getSaved('activeTab', 'ativos'));
    const [idVendedor, setIdVendedor] = useState(initialVendedor);
    const [diaEntrega, setDiaEntrega] = useState(initialDiaEntrega);
    const [diaVenda, setDiaVenda] = useState(initialDiaVenda);
    const [condicaoPagamento, setCondicaoPagamento] = useState(initialCondPadrão);
    const [condicaoPermitida, setCondicaoPermitida] = useState(initialCondPermitida);
    const [semVenda, setSemVenda] = useState(initialSemVenda);
    const [semVendaDe, setSemVendaDe] = useState(initialSemVendaDe);
    const [semVendaAte, setSemVendaAte] = useState(initialSemVendaAte);
    const [perfil, setPerfil] = useState(initialPerfil);
    const [showFilters, setShowFilters] = useState(false);

    // Seleção em Lote
    const [selectedIds, setSelectedIds] = useState([]);
    const [selecaoMobile, setSelecaoMobile] = useState(false); // modo seleção no celular (mostra os checkboxes)
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchData, setBatchData] = useState({ idVendedor: '', Dia_de_entrega: '', Dia_de_venda: '', ehCliente: '', tambemFornecedor: '' });

    // Modal de Inadimplência
    const [clienteInadimplente, setClienteInadimplente] = useState(null); // { nome, uuid }
    const [inadimplenciaDetalhe, setInadimplenciaDetalhe] = useState(null);
    const [loadingInadimplencia, setLoadingInadimplencia] = useState(false);

    // Carregar dados de apoio
    useEffect(() => {
        const load = async () => {
            try {
                const [vends, conds] = await Promise.all([
                    // Filtro: inclui inativos (cliente antigo pode estar no nome deles).
                    vendedorService.listarParaFiltro(),
                    tabelaPrecoService.listar(true)
                ]);
                setVendedores(vends);
                setCondicoesPagamento(conds);
            } catch (e) {
                console.error('Erro ao carregar filtros', e);
            }
        };
        load();
    }, []);

    // Sync State -> URL e LocalStorage
    useEffect(() => {
        const params = {};
        if (search) params.search = search;
        if (page > 1) params.page = page;
        if (limit !== 25) params.limit = limit;
        if (idVendedor) params.idVendedor = idVendedor;
        if (diaEntrega) params.diaEntrega = diaEntrega;
        if (diaVenda) params.diaVenda = diaVenda;
        if (condicaoPagamento) params.condicaoPagamento = condicaoPagamento;
        if (condicaoPermitida) params.condicaoPermitida = condicaoPermitida;
        if (semVenda) params.semVenda = semVenda;
        if (semVenda === 'faixa' && semVendaDe) params.semVendaDe = semVendaDe;
        if (semVenda === 'faixa' && semVendaAte) params.semVendaAte = semVendaAte;
        if (perfil) params.perfil = perfil;
        setSearchParams(params, { replace: true });

        saveToLocal('search', search);
        saveToLocal('limit', limit !== 25 ? limit.toString() : '');
        saveToLocal('idVendedor', idVendedor);
        saveToLocal('diaEntrega', diaEntrega);
        saveToLocal('diaVenda', diaVenda);
        saveToLocal('condicaoPagamento', condicaoPagamento);
        saveToLocal('condicaoPermitida', condicaoPermitida);
        saveToLocal('semVenda', semVenda);
        saveToLocal('semVendaDe', semVendaDe);
        saveToLocal('semVendaAte', semVendaAte);
        saveToLocal('perfil', perfil);
        saveToLocal('activeTab', activeTab);
    }, [search, page, limit, idVendedor, diaEntrega, diaVenda, condicaoPagamento, condicaoPermitida, semVenda, semVendaDe, semVendaAte, perfil, activeTab, setSearchParams]);

    const fetchClientes = async () => {
        setLoading(true);
        try {
            const ativo = activeTab === 'ativos';
            const data = await clienteService.listar({
                page, limit, search, ativo, idVendedor, diaEntrega, diaVenda,
                condicaoPagamento, condicaoPermitida, perfil,
                semVenda: semVenda === 'nunca' ? 'nunca' : undefined,
                semVendaDe: semVenda === 'faixa' ? semVendaDe : undefined,
                semVendaAte: semVenda === 'faixa' ? semVendaAte : undefined
            });
            setClientes(data.data);
            setTotalPages(data.meta.totalPages);
            setTotalRegistros(data.meta.total);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(fetchClientes, 300);
        return () => clearTimeout(t);
    }, [page, limit, search, activeTab, idVendedor, diaEntrega, diaVenda, condicaoPagamento, condicaoPermitida, semVenda, semVendaDe, semVendaAte, perfil]);

    // Busca também na tabela de fornecedores (cadastros que só existem como fornecedor —
    // ex.: importados do Conta Azul — não aparecem na lista de clientes; sem isso o usuário
    // procura, não acha, tenta cadastrar de novo e é barrado pela duplicidade).
    const [fornecedoresExtras, setFornecedoresExtras] = useState([]);
    useEffect(() => {
        if (!podeVerFornecedores || search.trim().length < 2) { setFornecedoresExtras([]); return; }
        let cancelado = false;
        const t = setTimeout(async () => {
            try {
                const lista = await fornecedorService.listar(search.trim());
                if (!cancelado) setFornecedoresExtras(Array.isArray(lista) ? lista : []);
            } catch { if (!cancelado) setFornecedoresExtras([]); }
        }, 400);
        return () => { cancelado = true; clearTimeout(t); };
    }, [search, podeVerFornecedores]);
    // Se o mesmo documento já aparece como cliente na página, não repete no bloco de fornecedores
    const docsClientes = new Set(clientes.map(c => c.Documento).filter(Boolean));
    const fornecedoresParaMostrar = fornecedoresExtras.filter(f => !f.cnpjCpf || !docsClientes.has(f.cnpjCpf));

    const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };

    const handleClearFilters = () => {
        setSearch('');
        setIdVendedor('');
        setDiaEntrega('');
        setDiaVenda('');
        setCondicaoPagamento('');
        setCondicaoPermitida('');
        setSemVenda('');
        setSemVendaDe('');
        setSemVendaAte('');
        setPerfil('');
        setPage(1);
    };

    const activeFiltersCount = [idVendedor, diaEntrega, diaVenda, condicaoPagamento, condicaoPermitida, semVenda, perfil].filter(Boolean).length;

    const handleSelectAll = (e) => {
        setSelectedIds(e.target.checked ? clientes.map(c => c.UUID) : []);
    };
    const handleSelectOne = (uuid) => {
        setSelectedIds(prev => prev.includes(uuid) ? prev.filter(id => id !== uuid) : [...prev, uuid]);
    };

    const handleBatchSubmit = async () => {
        if (selectedIds.length === 0) return;
        const dadosParaEnviar = {};
        if (batchData.idVendedor) dadosParaEnviar.idVendedor = batchData.idVendedor;
        if (batchData.Dia_de_entrega) dadosParaEnviar.Dia_de_entrega = batchData.Dia_de_entrega;
        if (batchData.Dia_de_venda) dadosParaEnviar.Dia_de_venda = batchData.Dia_de_venda;
        if (batchData.Formas_Atendimento && batchData.Formas_Atendimento.length > 0) {
            dadosParaEnviar.Formas_Atendimento = batchData.Formas_Atendimento;
        }
        if (batchData.ehCliente) dadosParaEnviar.Ativo = batchData.ehCliente === 'sim';
        if (batchData.tambemFornecedor) dadosParaEnviar.tambemFornecedor = batchData.tambemFornecedor === 'sim';
        if (Object.keys(dadosParaEnviar).length === 0) { alert("Selecione pelo menos um campo para alterar."); return; }
        let msg = `Tem certeza que deseja alterar ${selectedIds.length} clientes?`;
        if (dadosParaEnviar.Ativo === false) {
            msg += '\n\n⚠️ "É cliente = Não": eles somem das listas de venda, rota e dashboards. O cadastro, o histórico e as cobranças em aberto são preservados.';
        }
        if (!window.confirm(msg)) return;
        try {
            const resp = await clienteService.atualizarLote({ ids: selectedIds, dados: dadosParaEnviar });
            alert(resp?.message || "Atualização em lote realizada com sucesso!");
            setIsBatchModalOpen(false);
            setSelectedIds([]);
            setBatchData({ idVendedor: '', Dia_de_entrega: '', Dia_de_venda: '', ehCliente: '', tambemFornecedor: '' });
            fetchClientes();
        } catch (error) {
            console.error("Erro na atualização em lote", error);
            alert("Erro ao atualizar clientes.");
        }
    };

    // Desativa (ou reativa, na aba Inativos) o LADO CLIENTE dos selecionados.
    // O cadastro continua no sistema (e como fornecedor, se for) — só some das telas de venda.
    const handleBatchAtivo = async (novoAtivo) => {
        if (selectedIds.length === 0) return;
        const msg = novoAtivo
            ? `Reativar ${selectedIds.length} cliente(s)? Eles voltam a aparecer nas listas, rota e dashboards.`
            : `Desativar ${selectedIds.length} cliente(s) como CLIENTE?\n\nEles somem das listas de venda, rota e dashboards, mas o cadastro continua no sistema (e como fornecedor, quando for o caso). O histórico e as cobranças em aberto são preservados. Dá para reativar depois na aba "Apenas Inativos".`;
        if (!window.confirm(msg)) return;
        try {
            await clienteService.atualizarLote({ ids: selectedIds, dados: { Ativo: novoAtivo } });
            alert(novoAtivo ? 'Clientes reativados!' : 'Clientes desativados! Veja-os na aba "Apenas Inativos".');
            setSelectedIds([]);
            fetchClientes();
        } catch (error) {
            console.error('Erro ao ativar/desativar em lote', error);
            alert('Erro: ' + (error.response?.data?.error || 'não foi possível concluir a operação.'));
        }
    };

    const nomeCondicao = (id) => {
        const c = condicoesPagamento.find(c => c.idCondicao === id);
        return c ? c.nomeCondicao : id;
    };

    const formatarMoeda = (valor) =>
        Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const abrirModalInadimplencia = async (e, cliente) => {
        e.stopPropagation();
        setClienteInadimplente({ nome: cliente.NomeFantasia || cliente.Nome, uuid: cliente.UUID });
        setInadimplenciaDetalhe(null);
        setLoadingInadimplencia(true);
        try {
            const data = await clienteService.obterInadimplencia(cliente.UUID);
            setInadimplenciaDetalhe(data);
        } catch {
            setInadimplenciaDetalhe({ erro: true });
        } finally {
            setLoadingInadimplencia(false);
        }
    };

    return (
        <div className="max-w-screen-2xl mx-auto px-3 py-3 md:px-5 md:py-4 relative">
            {/* Ações em Lote */}
            {selectedIds.length > 0 && (
                <div className="flex justify-end items-center mb-3">
                    <div className="flex items-center gap-3 bg-blue-50 px-4 py-2 rounded-lg border border-blue-200 shadow-sm">
                        <span className="text-sm font-medium text-blue-700">{selectedIds.length} selecionados</span>
                        <button
                            onClick={() => setIsBatchModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Settings className="h-4 w-4" />
                            Alterar em Lote
                        </button>
                        {activeTab === 'inativos' ? (
                            <button
                                onClick={() => handleBatchAtivo(true)}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                            >
                                Reativar
                            </button>
                        ) : (
                            <button
                                onClick={() => handleBatchAtivo(false)}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                            >
                                Desativar
                            </button>
                        )}
                        <button onClick={() => setSelectedIds([])} className="text-blue-500 hover:text-blue-700">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Filtros */}
            <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 mb-3 space-y-3">
                {/* Busca + Toggle Mobile */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                            placeholder="Buscar por nome, documento, código, cidade, bairro, telefone..."
                            value={search}
                            onChange={handleSearch}
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="md:hidden relative p-2 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"
                    >
                        <Filter className="h-4 w-4" />
                        {activeFiltersCount > 0 && (
                            <span className="absolute -top-1 -right-1 bg-primary text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold">
                                {activeFiltersCount}
                            </span>
                        )}
                    </button>
                    {podeCadastrar && (
                        <button
                            onClick={() => navigate('/clientes/saude-gps')}
                            title="Saúde dos Pontos GPS"
                            className="shrink-0 px-3 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm flex items-center gap-1.5 min-h-[38px]"
                        >
                            📍<span className="hidden lg:inline">Saúde GPS</span>
                        </button>
                    )}
                    {podeCadastrar && (
                        <button
                            onClick={() => navigate('/clientes/novo')}
                            className="shrink-0 px-3 py-2 md:px-4 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm flex items-center gap-1.5 min-h-[38px]"
                        >
                            <UserPlus className="h-4 w-4" />
                            <span className="hidden sm:inline">Novo Cliente</span>
                            <span className="sm:hidden">Novo</span>
                        </button>
                    )}
                </div>

                {/* Grid de Filtros */}
                <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-2 ${showFilters ? 'grid' : 'hidden md:grid'}`}>
                    <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Status</label>
                        <SelectBusca
                            className="w-full"
                            value={activeTab}
                            onChange={(e) => { setActiveTab(e.target.value); setPage(1); }}
                        >
                            <option value="ativos">Apenas Ativos</option>
                            <option value="inativos">Apenas Inativos</option>
                        </SelectBusca>
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Vendedor</label>
                        <SelectBusca
                            className="w-full"
                            value={idVendedor}
                            onChange={(e) => { setIdVendedor(e.target.value); setPage(1); }}
                        >
                            <option value="">Todos os Vendedores</option>
                            {opcoesVendedorFiltro(vendedores)}
                        </SelectBusca>
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Dia de Entrega</label>
                        <SelectBusca
                            className="w-full"
                            value={diaEntrega}
                            onChange={(e) => { setDiaEntrega(e.target.value); setPage(1); }}
                        >
                            <option value="">Qualquer Dia</option>
                            {DIAS_SEMANA.map(dia => <option key={dia} value={dia}>{dia}</option>)}
                        </SelectBusca>
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Dia de Venda</label>
                        <SelectBusca
                            className="w-full"
                            value={diaVenda}
                            onChange={(e) => { setDiaVenda(e.target.value); setPage(1); }}
                        >
                            <option value="">Qualquer Dia</option>
                            {DIAS_SEMANA.map(dia => <option key={dia} value={dia}>{dia}</option>)}
                        </SelectBusca>
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Condição Padrão</label>
                        <SelectBusca
                            className="w-full"
                            value={condicaoPagamento}
                            onChange={(e) => { setCondicaoPagamento(e.target.value); setPage(1); }}
                        >
                            <option value="">Qualquer Condição</option>
                            {condicoesPagamento.map(c => (
                                <option key={c.idCondicao} value={c.idCondicao}>{c.nomeCondicao}</option>
                            ))}
                        </SelectBusca>
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Condição Permitida</label>
                        <SelectBusca
                            className="w-full"
                            value={condicaoPermitida}
                            onChange={(e) => { setCondicaoPermitida(e.target.value); setPage(1); }}
                        >
                            <option value="">Qualquer Condição</option>
                            {condicoesPagamento.map(c => (
                                <option key={c.idCondicao} value={c.idCondicao}>{c.nomeCondicao}</option>
                            ))}
                        </SelectBusca>
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Tempo sem Vendas</label>
                        <SelectBusca
                            className="w-full"
                            value={semVenda}
                            onChange={(e) => { setSemVenda(e.target.value); setPage(1); }}
                        >
                            <option value="">Qualquer período</option>
                            <option value="faixa">Sem comprar de… até… (dias)</option>
                            <option value="nunca">Nunca comprou</option>
                        </SelectBusca>
                        {semVenda === 'faixa' && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <input
                                    type="number" min="1" inputMode="numeric" placeholder="De (dias)"
                                    className="w-full min-w-0 border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    value={semVendaDe}
                                    onChange={(e) => { setSemVendaDe(e.target.value); setPage(1); }}
                                />
                                <span className="text-xs text-gray-400 shrink-0">até</span>
                                <input
                                    type="number" min="1" inputMode="numeric" placeholder="Até (dias)"
                                    className="w-full min-w-0 border border-gray-300 rounded px-2 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    value={semVendaAte}
                                    onChange={(e) => { setSemVendaAte(e.target.value); setPage(1); }}
                                />
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-[11px] font-medium text-gray-500 mb-1">Perfil</label>
                        <SelectBusca
                            className="w-full"
                            value={perfil}
                            onChange={(e) => { setPerfil(e.target.value); setPage(1); }}
                        >
                            <option value="">Todos os cadastros</option>
                            <option value="cliente">Só cliente (não é fornecedor)</option>
                            <option value="fornecedor">Também é fornecedor</option>
                        </SelectBusca>
                    </div>

                    <div className="flex items-end col-span-2 sm:col-span-1">
                        <button
                            onClick={handleClearFilters}
                            className="w-full text-sm py-1.5 text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors flex items-center justify-center gap-1.5"
                        >
                            <X className="h-3.5 w-3.5" />
                            Limpar Filtros
                            {activeFiltersCount > 0 && (
                                <span className="bg-gray-300 text-gray-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeFiltersCount}</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Total */}
                <div className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                    {loading ? 'Carregando...' : `${totalRegistros} cliente${totalRegistros !== 1 ? 's' : ''} encontrado${totalRegistros !== 1 ? 's' : ''}`}
                </div>
            </div>

            {/* Tabela Desktop */}
            <div className="hidden md:block bg-white shadow-sm overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-2.5 w-8">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                                    checked={clientes.length > 0 && selectedIds.length === clientes.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Cliente</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Vendedor</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Entrega</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Venda</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Condição Padrão</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">CNPJ/CPF</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="8" className="text-center py-8 text-gray-400 text-sm">Carregando...</td></tr>
                        ) : clientes.length === 0 ? (
                            <tr><td colSpan="8" className="text-center py-8 text-gray-400 text-sm">Nenhum cliente encontrado.</td></tr>
                        ) : (
                            clientes.map((cliente) => (
                                <tr
                                    key={cliente.UUID}
                                    onClick={(e) => { if (e.target.type !== 'checkbox') navigate(`/clientes/${cliente.UUID}`); }}
                                    className={`cursor-pointer transition-colors text-sm ${selectedIds.includes(cliente.UUID) ? 'bg-blue-50 hover:bg-blue-100' : cliente.inadimplente ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}
                                >
                                    <td className="px-3 py-2">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                                            checked={selectedIds.includes(cliente.UUID)}
                                            onChange={() => handleSelectOne(cliente.UUID)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="font-semibold text-gray-900 text-sm leading-tight">{cliente.Nome}</div>
                                        {cliente.NomeFantasia && cliente.NomeFantasia !== cliente.Nome && (
                                            <div className="text-xs text-gray-500 leading-tight mt-0.5 truncate max-w-xs">{cliente.NomeFantasia}</div>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            {cliente.End_Cidade && (
                                                <span className="text-[11px] text-gray-400 flex items-center gap-0.5">
                                                    <MapPin className="h-3 w-3" />{cliente.End_Cidade}/{cliente.End_Estado}
                                                </span>
                                            )}
                                            {(cliente.Formas_Atendimento || []).map(forma => {
                                                let colors = "text-gray-500";
                                                if (forma === 'Presencial') colors = "text-blue-500";
                                                else if (forma === 'Whatsapp') colors = "text-green-500";
                                                else if (forma === 'Telefone') colors = "text-purple-500";
                                                return (
                                                    <span key={forma} title={forma} className={`${colors}`}>
                                                        {forma === 'Presencial' && <User className="h-3 w-3" />}
                                                        {forma === 'Whatsapp' && <MessageCircle className="h-3 w-3" />}
                                                        {forma === 'Telefone' && <Phone className="h-3 w-3" />}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                        {cliente.vendedor?.nome || <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                        {cliente.Dia_de_entrega || <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                                        {cliente.Dia_de_venda || <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-600 max-w-[160px]">
                                        {cliente.Condicao_de_pagamento
                                            ? <span className="truncate block" title={nomeCondicao(cliente.Condicao_de_pagamento)}>{nomeCondicao(cliente.Condicao_de_pagamento)}</span>
                                            : <span className="text-gray-300">—</span>
                                        }
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-500 font-mono whitespace-nowrap">
                                        {cliente.Documento}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`px-1.5 py-0.5 inline-flex text-[11px] leading-4 font-semibold rounded-full ${cliente.Ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {cliente.Ativo ? 'Ativo' : 'Inativo'}
                                            </span>
                                            {semVenda && cliente.clienteInsights?.[0]?.diasSemComprar != null && (
                                                <span className="px-1.5 py-0.5 inline-flex text-[11px] leading-4 font-semibold rounded-full bg-amber-100 text-amber-700">
                                                    {cliente.clienteInsights[0].diasSemComprar}d sem comprar
                                                </span>
                                            )}
                                            {cliente.inadimplente && (
                                                <button
                                                    onClick={(e) => abrirModalInadimplencia(e, cliente)}
                                                    className="px-1.5 py-0.5 inline-flex items-center gap-0.5 text-[11px] leading-4 font-semibold rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                                                    title={`Inadimplente — ${formatarMoeda(cliente.totalVencido)} em atraso`}
                                                >
                                                    <AlertCircle className="h-2.5 w-2.5" />
                                                    Inad. {formatarMoeda(cliente.totalVencido)}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Lista Mobile */}
            <div className="md:hidden flex items-center justify-between gap-2 mb-2">
                <button
                    onClick={() => { setSelecaoMobile(!selecaoMobile); if (selecaoMobile) setSelectedIds([]); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border min-h-[36px] ${selecaoMobile ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary'}`}
                >
                    {selecaoMobile ? 'Cancelar seleção' : 'Selecionar vários'}
                </button>
                {selecaoMobile && (
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 min-h-[36px] px-2">
                        <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                            checked={clientes.length > 0 && selectedIds.length === clientes.length}
                            onChange={handleSelectAll}
                        />
                        Marcar todos ({clientes.length})
                    </label>
                )}
            </div>
            <div className="md:hidden space-y-2">
                {loading ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>
                ) : clientes.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">Nenhum cliente encontrado.</div>
                ) : clientes.map((cliente) => (
                    <div
                        key={cliente.UUID}
                        className={`rounded-lg shadow-sm border relative ${selectedIds.includes(cliente.UUID) ? 'border-primary bg-blue-50/40' : cliente.inadimplente ? 'border-red-300 bg-red-50/40' : 'bg-white border-gray-100'}`}
                    >
                        {(selecaoMobile || selectedIds.length > 0) && (
                            <div className="absolute top-2 right-2 z-10 p-2" onClick={e => { e.stopPropagation(); handleSelectOne(cliente.UUID); }}>
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary focus:ring-primary h-5 w-5 bg-white shadow-sm"
                                    checked={selectedIds.includes(cliente.UUID)}
                                    onChange={() => {}}
                                />
                            </div>
                        )}
                        <div className="p-3 flex flex-col gap-1.5" onClick={() => (selecaoMobile ? handleSelectOne(cliente.UUID) : navigate(`/clientes/${cliente.UUID}`))}>
                            <div className="pr-8">
                                <h3 className="font-bold text-gray-900 text-sm leading-tight">
                                    {cliente.NomeFantasia || cliente.Nome}
                                </h3>
                                {cliente.NomeFantasia && cliente.NomeFantasia !== cliente.Nome && (
                                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{cliente.Nome}</p>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1">
                                <span className="text-[10px] font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                    {cliente.Documento || 'Sem Documento'}
                                </span>
                                {cliente.End_Cidade && (
                                    <span className="text-[10px] text-gray-500 flex items-center gap-0.5 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                        <MapPin className="h-2.5 w-2.5 text-gray-400" />{cliente.End_Cidade}
                                    </span>
                                )}
                                {cliente.Formas_Atendimento && cliente.Formas_Atendimento.length > 0 && (
                                    <div className="flex gap-0.5 ml-auto">
                                        {cliente.Formas_Atendimento.map(forma => {
                                            let colors = "bg-gray-50 text-gray-400 border-gray-100";
                                            if (forma === 'Presencial') colors = "bg-blue-50 text-blue-600 border-blue-100";
                                            else if (forma === 'Whatsapp') colors = "bg-green-50 text-green-600 border-green-100";
                                            else if (forma === 'Telefone') colors = "bg-purple-50 text-purple-600 border-purple-100";
                                            return (
                                                <span key={forma} title={forma} className={`p-1 rounded border flex items-center ${colors}`}>
                                                    {forma === 'Presencial' && <User className="h-3 w-3" />}
                                                    {forma === 'Whatsapp' && <MessageCircle className="h-3 w-3" />}
                                                    {forma === 'Telefone' && <Phone className="h-3 w-3" />}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-1.5 items-center flex-wrap pt-1.5 border-t border-gray-100">
                                {cliente.vendedor?.nome && (
                                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                        {cliente.vendedor.nome.split(' ')[0]}
                                    </span>
                                )}
                                {cliente.Dia_de_entrega && (
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                        Ent: {cliente.Dia_de_entrega}
                                    </span>
                                )}
                                {cliente.Dia_de_venda && (
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                        Venda: {cliente.Dia_de_venda}
                                    </span>
                                )}
                                {cliente.Condicao_de_pagamento && (
                                    <span className="text-[10px] font-medium text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200 truncate max-w-[140px]" title={nomeCondicao(cliente.Condicao_de_pagamento)}>
                                        {nomeCondicao(cliente.Condicao_de_pagamento)}
                                    </span>
                                )}
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cliente.Ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {cliente.Ativo ? 'Ativo' : 'Inativo'}
                                </span>
                                {semVenda && cliente.clienteInsights?.[0]?.diasSemComprar != null && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                        {cliente.clienteInsights[0].diasSemComprar}d sem comprar
                                    </span>
                                )}
                                {cliente.inadimplente && (
                                    <button
                                        onClick={(e) => abrirModalInadimplencia(e, cliente)}
                                        className="ml-auto px-1.5 py-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                                    >
                                        <AlertCircle className="h-2.5 w-2.5" />
                                        Inadimplente {formatarMoeda(cliente.totalVencido)}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Fornecedores que batem com a busca (cadastro só de fornecedor não entra na lista acima) */}
            {search.trim().length >= 2 && fornecedoresParaMostrar.length > 0 && (
                <div className="mt-3 bg-white rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
                        <Building2 className="h-4 w-4 text-gray-500" />
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Encontrado nos Fornecedores</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                        {fornecedoresParaMostrar.slice(0, 5).map(f => (
                            <button
                                key={f.id}
                                onClick={() => navigate(`/fornecedores?busca=${encodeURIComponent(search.trim())}`)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 min-h-[44px]"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 truncate">{f.nomeFantasia || f.razaoSocial}</div>
                                    <div className="text-xs text-gray-500 truncate">
                                        {f.nomeFantasia && f.nomeFantasia !== f.razaoSocial ? `${f.razaoSocial} · ` : ''}
                                        {f.cnpjCpf || 'Sem documento'}{f.cidade ? ` · ${f.cidade}` : ''}
                                    </div>
                                </div>
                                <span className={`shrink-0 px-2 py-1 text-xs font-semibold rounded-full ${f.ativo ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700'}`}>
                                    {f.ativo ? 'Fornecedor' : 'Fornecedor inativo'}
                                </span>
                                <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                            </button>
                        ))}
                    </div>
                    <div className="px-4 py-2 border-t border-gray-100 text-[11px] text-gray-500">
                        Este cadastro é de fornecedor — toque para abrir na aba Fornecedores.
                        {fornecedoresParaMostrar.length > 5 ? ` (+${fornecedoresParaMostrar.length - 5} outros)` : ''}
                    </div>
                </div>
            )}

            {/* Paginação */}
            <div className="flex justify-between items-center mt-3 gap-3 px-1">
                <div className="hidden md:flex items-center gap-2">
                    <span className="text-xs text-gray-500">Exibir</span>
                    <SelectBusca
                        value={limit}
                        onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                    >
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="200">200</option>
                    </SelectBusca>
                    <span className="text-xs text-gray-500">por página</span>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
                    <button
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40"
                    >
                        Anterior
                    </button>
                    <span className="px-3 py-1.5 text-xs text-gray-600 font-medium bg-white border border-gray-200 rounded-md">
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages}
                        className="px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40"
                    >
                        Próximo
                    </button>
                </div>
            </div>

            {/* Modal Edição em Lote */}
            {isBatchModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
                        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                <Settings className="h-4 w-4 text-primary" />
                                Edição em Lote
                            </h3>
                            <button onClick={() => setIsBatchModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 flex gap-3">
                                <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-yellow-700">
                                    Você está alterando <strong>{selectedIds.length}</strong> clientes.
                                    Campos vazios não serão alterados.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">É cliente</label>
                                    <SelectBusca
                                        className="w-full"
                                        value={batchData.ehCliente}
                                        onChange={(e) => setBatchData({ ...batchData, ehCliente: e.target.value })}
                                    >
                                        <option value="">Não alterar</option>
                                        <option value="sim">Sim (ativo)</option>
                                        <option value="nao">Não (desativar)</option>
                                    </SelectBusca>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">É fornecedor</label>
                                    <SelectBusca
                                        className="w-full"
                                        value={batchData.tambemFornecedor}
                                        onChange={(e) => setBatchData({ ...batchData, tambemFornecedor: e.target.value })}
                                    >
                                        <option value="">Não alterar</option>
                                        <option value="sim">Sim</option>
                                        <option value="nao">Não</option>
                                    </SelectBusca>
                                </div>
                                {batchData.ehCliente === 'nao' && (
                                    <p className="col-span-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mt-1">
                                        Os selecionados somem das listas de venda, rota e dashboards. Cadastro, histórico e cobranças em aberto ficam preservados{batchData.tambemFornecedor === 'sim' ? ' — e continuam como fornecedor' : ''}.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Novo Vendedor</label>
                                <SelectBusca
                                    className="w-full"
                                    value={batchData.idVendedor}
                                    onChange={(e) => setBatchData({ ...batchData, idVendedor: e.target.value })}
                                >
                                    <option value="">Não alterar</option>
                                    {/* Atribuição: só vendedor na ativa */}
                                    {somenteAtivos(vendedores).map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                </SelectBusca>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Novo Dia de Entrega</label>
                                <SelectBusca
                                    className="w-full"
                                    value={batchData.Dia_de_entrega}
                                    onChange={(e) => setBatchData({ ...batchData, Dia_de_entrega: e.target.value })}
                                >
                                    <option value="">Não alterar</option>
                                    {DIAS_SEMANA.map(dia => <option key={dia} value={dia}>{dia}</option>)}
                                </SelectBusca>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Novo Dia de Venda</label>
                                <SelectBusca
                                    className="w-full"
                                    value={batchData.Dia_de_venda}
                                    onChange={(e) => setBatchData({ ...batchData, Dia_de_venda: e.target.value })}
                                >
                                    <option value="">Não alterar</option>
                                    {DIAS_SEMANA.map(dia => <option key={dia} value={dia}>{dia}</option>)}
                                </SelectBusca>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Canais de Atendimento</label>
                                <p className="text-xs text-gray-500 mb-2">Selecione para <strong>sobrescrever</strong> a lista atual.</p>
                                <div className="flex gap-2">
                                    {['Presencial', 'Whatsapp', 'Telefone'].map(canal => (
                                        <button
                                            key={canal}
                                            type="button"
                                            onClick={() => {
                                                const atuais = batchData.Formas_Atendimento || [];
                                                const novo = atuais.includes(canal) ? atuais.filter(c => c !== canal) : [...atuais, canal];
                                                setBatchData({ ...batchData, Formas_Atendimento: novo });
                                            }}
                                            className={`px-3 py-1.5 rounded text-sm border flex items-center gap-1.5 transition-colors ${(batchData.Formas_Atendimento || []).includes(canal)
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                                }`}
                                        >
                                            {canal === 'Presencial' && <User className="h-3.5 w-3.5" />}
                                            {canal === 'Whatsapp' && <MessageCircle className="h-3.5 w-3.5" />}
                                            {canal === 'Telefone' && <Phone className="h-3.5 w-3.5" />}
                                            {canal}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => setIsBatchModalOpen(false)}
                                className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleBatchSubmit}
                                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                            >
                                <Save className="h-4 w-4" />
                                Aplicar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Inadimplência */}
            {clienteInadimplente && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="bg-red-600 px-5 py-4 flex justify-between items-center">
                            <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                <AlertCircle className="h-5 w-5" />
                                Contas em Aberto — {clienteInadimplente.nome}
                            </h3>
                            <button onClick={() => setClienteInadimplente(null)} className="text-red-100 hover:text-white">
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="flex flex-col max-h-[75vh] overflow-hidden">
                            {loadingInadimplencia ? (
                                <p className="text-sm text-gray-500 text-center py-8">Carregando...</p>
                            ) : inadimplenciaDetalhe?.erro ? (
                                <p className="text-sm text-red-600 text-center py-8">Erro ao carregar dados.</p>
                            ) : inadimplenciaDetalhe ? (
                                <>
                                    <div className="flex gap-6 px-5 py-3 bg-red-50 border-b border-red-100 shrink-0">
                                        <div>
                                            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Total vencido</p>
                                            <p className="text-lg font-bold text-red-700">{formatarMoeda(inadimplenciaDetalhe.totalVencido)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Parcelas vencidas</p>
                                            <p className="text-lg font-bold text-red-700">{inadimplenciaDetalhe.parcelasVencidas}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Notas em aberto</p>
                                            <p className="text-lg font-bold text-red-700">{inadimplenciaDetalhe.contas?.length || 0}</p>
                                        </div>
                                    </div>
                                    <div className="overflow-y-auto flex-1 p-4 space-y-3">
                                        {(inadimplenciaDetalhe.contas || []).map(conta => (
                                            <div key={conta.id} className="border border-gray-200 rounded-xl overflow-hidden">
                                                <div className="bg-gray-50 px-3 py-2.5 flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {conta.pedidoNumero && (
                                                                <span className="text-xs font-bold text-gray-800">{conta.pedidoEspecial ? 'ZZ' : ''}#{conta.pedidoNumero}</span>
                                                            )}
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${conta.status === 'PARCIAL' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                                                {conta.status === 'PARCIAL' ? 'Parcial' : 'Em aberto'}
                                                            </span>
                                                            {conta.condicaoPagamento && (
                                                                <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{conta.condicaoPagamento}</span>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-3 mt-0.5 text-[10px] text-gray-500">
                                                            {conta.dataVenda && <span>Venda: {new Date(conta.dataVenda).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>}
                                                            <span>{conta.parcelasPagas}/{conta.parcelasTotal} pagas</span>
                                                            {conta.valorDevolvido > 0 && <span className="text-red-600 font-medium">Dev: {formatarMoeda(conta.valorDevolvido)}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-xs font-bold text-gray-800">{formatarMoeda(conta.valorTotal)}</p>
                                                        {conta.proximoVencimento && <p className="text-[10px] text-gray-400">Próx: {new Date(conta.proximoVencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>}
                                                    </div>
                                                </div>
                                                <div className="divide-y divide-gray-100">
                                                    {conta.parcelas.map(p => {
                                                        const vencida = p.status === 'PENDENTE' && p.diasAtraso > 0;
                                                        const pago = p.status === 'PAGO';
                                                        return (
                                                            <div key={p.id} className={`px-3 py-2 flex items-center justify-between gap-2 ${vencida ? 'bg-red-50/60' : pago ? 'bg-green-50/40' : ''}`}>
                                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                    <span className="text-[11px] font-bold text-gray-400 shrink-0 w-4 text-center">{p.numeroParcela}</span>
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="text-xs font-semibold text-gray-800">{formatarMoeda(p.valor)}</span>
                                                                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${pago ? 'bg-green-100 text-green-700' : vencida ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                                {pago ? 'Pago' : vencida ? 'Vencido' : 'Pendente'}
                                                                            </span>
                                                                            {vencida && <span className="text-[10px] font-bold text-red-600">{p.diasAtraso}d</span>}
                                                                        </div>
                                                                        <div className="text-[10px] text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                                                                            <span>Venc: {new Date(p.dataVencimento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                                                                            {p.dataPagamento && <span className="text-green-600">Pago: {new Date(p.dataPagamento).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>}
                                                                            {p.valorPago && p.valorPago !== p.valor && <span className="text-green-600">({formatarMoeda(p.valorPago)} recebido)</span>}
                                                                            {p.formaPagamento && <span>{p.formaPagamento}</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : null}
                        </div>

                        <div className="bg-gray-50 px-5 py-3 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={() => setClienteInadimplente(null)}
                                className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ListaClientes;
