import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { Trash2, Search, Sparkles, MapPin, Package, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../../services/api';
import produtoService from '../../../services/produtoService';
import promocaoService from '../../../services/promocaoService';

const STORAGE_KEY_FATOR = 'meta_fator_crescimento';

const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtDec = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const TABS = [
    { id: 'calendario', label: 'Calendário', icon: null },
    { id: 'produtos', label: 'Produtos', icon: Package },
    { id: 'cidades', label: 'Cidades', icon: MapPin },
    { id: 'promocoes', label: 'Promoções', icon: Tag },
];

const MetaFormModal = ({ isOpen, onClose, metaData, vendedores, mesAtualStr }) => {
    const [formData, setFormData] = useState({
        vendedorId: '',
        mesReferencia: mesAtualStr,
        valorMensal: '',
        flexMensal: '0',
        diasTrabalho: []
    });

    const [metasProdutos, setMetasProdutos] = useState([]);
    const [produtosBusca, setProdutosBusca] = useState('');
    const [produtosResultado, setProdutosResultado] = useState([]);

    const [metasPromocoes, setMetasPromocoes] = useState([]);
    const [promocoesAtivas, setPromocoesAtivas] = useState([]);

    const [metasCidades, setMetasCidades] = useState([]);
    const [novaCidade, setNovaCidade] = useState('');
    const [novaCidadeValor, setNovaCidadeValor] = useState('');

    const [activeTab, setActiveTab] = useState('calendario');
    const [loading, setLoading] = useState(false);

    // Sugestão
    const [fatorCrescimento, setFatorCrescimento] = useState(
        () => localStorage.getItem(STORAGE_KEY_FATOR) || '1.10'
    );
    const [sugestao, setSugestao] = useState(null);
    const [loadingSugestao, setLoadingSugestao] = useState(false);
    const [sugestaoAberta, setSugestaoAberta] = useState(false);

    const startOfMonth = dayjs(mesAtualStr + '-01').startOf('month');
    const endOfMonth = startOfMonth.endOf('month');
    const monthDays = [];
    for (let i = 1; i <= endOfMonth.date(); i++) {
        monthDays.push(startOfMonth.date(i));
    }

    useEffect(() => {
        const fetchPromocoes = async () => {
            try {
                const data = await promocaoService.buscarAtivasLote();
                const arr = Object.values(data).map(p => ({
                    id: p.id,
                    nome: p.nome,
                    produtoNome: p.produto?.nome || p.produtoNome || ''
                }));
                setPromocoesAtivas(arr);
            } catch (e) {
                console.error("Erro ao carregar promoções", e);
            }
        };
        fetchPromocoes();
    }, []);

    useEffect(() => {
        if (metaData) {
            let diasTrabalhoRaw = metaData.diasTrabalho;
            if (typeof diasTrabalhoRaw === 'string') {
                try { diasTrabalhoRaw = JSON.parse(metaData.diasTrabalho); } catch (e) { }
            }

            setFormData({
                vendedorId: metaData.vendedorId || '',
                mesReferencia: metaData.mesReferencia || mesAtualStr,
                valorMensal: Number(metaData.valorMensal || 0).toString(),
                flexMensal: Number(metaData.flexMensal || 0).toString(),
                diasTrabalho: diasTrabalhoRaw || []
            });

            if (metaData.metasProdutos?.length > 0) {
                setMetasProdutos(metaData.metasProdutos.map(mp => ({
                    produtoId: mp.produtoId,
                    quantidade: Number(mp.quantidade).toString(),
                    _nome: mp.produto?.nome || '',
                    _codigo: mp.produto?.codigo || ''
                })));
            }

            if (metaData.metasPromocoes?.length > 0) {
                setMetasPromocoes(metaData.metasPromocoes.map(mp => ({
                    promocaoId: mp.promocaoId,
                    quantidadePedidos: Number(mp.quantidadePedidos).toString(),
                    _nome: mp.promocao?.nome || ''
                })));
            }

            if (metaData.metasCidades?.length > 0) {
                setMetasCidades(metaData.metasCidades.map(mc => ({
                    cidade: mc.cidade,
                    valor: Number(mc.valor).toString()
                })));
            }
        } else {
            setFormData({ vendedorId: '', mesReferencia: mesAtualStr, valorMensal: '', flexMensal: '0', diasTrabalho: [] });
            setMetasProdutos([]);
            setMetasPromocoes([]);
            setMetasCidades([]);
            setSugestao(null);
        }
    }, [metaData, mesAtualStr]);

    const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const toggleDiaTrabalho = (dateStr) => {
        const currentDays = [...formData.diasTrabalho];
        const index = currentDays.indexOf(dateStr);
        if (index === -1) currentDays.push(dateStr);
        else currentDays.splice(index, 1);
        setFormData({ ...formData, diasTrabalho: currentDays });
    };

    const selecionarDiasUteis = () => {
        const diasUteis = monthDays.filter(d => d.day() !== 0 && d.day() !== 6).map(d => d.format('YYYY-MM-DD'));
        setFormData({ ...formData, diasTrabalho: diasUteis });
    };

    // === Produtos ===
    const buscarProdutos = useCallback(async (termo) => {
        setProdutosBusca(termo);
        if (termo.length < 2) { setProdutosResultado([]); return; }
        try {
            const data = await produtoService.listar({ search: termo, ativo: true, limit: 10 });
            const lista = data.produtos || data;
            setProdutosResultado(Array.isArray(lista) ? lista : []);
        } catch (e) {
            console.error("Erro buscar produtos", e);
        }
    }, []);

    const adicionarProduto = (produto) => {
        if (metasProdutos.some(mp => mp.produtoId === produto.id)) { toast.error("Produto já adicionado"); return; }
        setMetasProdutos([...metasProdutos, { produtoId: produto.id, quantidade: '', _nome: produto.nome, _codigo: produto.codigo }]);
        setProdutosBusca('');
        setProdutosResultado([]);
    };

    const atualizarQtdProduto = (index, valor) => {
        const copia = [...metasProdutos];
        copia[index].quantidade = valor;
        setMetasProdutos(copia);
    };

    const removerProduto = (index) => setMetasProdutos(metasProdutos.filter((_, i) => i !== index));

    // === Promoções ===
    const adicionarPromocao = (promoId) => {
        if (!promoId) return;
        if (metasPromocoes.some(mp => mp.promocaoId === promoId)) { toast.error("Promoção já adicionada"); return; }
        const promo = promocoesAtivas.find(p => p.id === promoId);
        setMetasPromocoes([...metasPromocoes, { promocaoId: promoId, quantidadePedidos: '', _nome: promo?.nome || promoId }]);
    };

    const atualizarQtdPromocao = (index, valor) => {
        const copia = [...metasPromocoes];
        copia[index].quantidadePedidos = valor;
        setMetasPromocoes(copia);
    };

    const removerPromocao = (index) => setMetasPromocoes(metasPromocoes.filter((_, i) => i !== index));

    // === Cidades ===
    const adicionarCidade = () => {
        const cidadeNorm = novaCidade.trim();
        if (!cidadeNorm || !novaCidadeValor) return;
        if (metasCidades.some(mc => mc.cidade.toLowerCase() === cidadeNorm.toLowerCase())) {
            toast.error("Cidade já adicionada");
            return;
        }
        setMetasCidades([...metasCidades, { cidade: cidadeNorm, valor: novaCidadeValor }]);
        setNovaCidade('');
        setNovaCidadeValor('');
    };

    const atualizarValorCidade = (index, valor) => {
        const copia = [...metasCidades];
        copia[index].valor = valor;
        setMetasCidades(copia);
    };

    const removerCidade = (index) => setMetasCidades(metasCidades.filter((_, i) => i !== index));

    // === Sugestão ===
    const handleCalcularSugestao = async () => {
        if (!formData.vendedorId) { toast.error("Selecione o vendedor primeiro"); return; }
        const fator = parseFloat(fatorCrescimento);
        if (isNaN(fator) || fator <= 0) { toast.error("Fator de crescimento inválido"); return; }

        localStorage.setItem(STORAGE_KEY_FATOR, fatorCrescimento);
        setLoadingSugestao(true);
        setSugestao(null);
        try {
            const res = await api.get('/metas/sugestao', {
                params: { vendedorId: formData.vendedorId, fatorCrescimento: fator }
            });
            setSugestao(res.data);
            setSugestaoAberta(true);
            // Preenche o valor automaticamente se o campo estiver vazio
            if (!formData.valorMensal || Number(formData.valorMensal) === 0) {
                setFormData(f => ({ ...f, valorMensal: res.data.valorSugerido.toString() }));
            }
        } catch (e) {
            toast.error(e.response?.data?.error || "Erro ao calcular sugestão");
        } finally {
            setLoadingSugestao(false);
        }
    };

    const usarValorSugerido = () => {
        if (!sugestao) return;
        setFormData(f => ({ ...f, valorMensal: sugestao.valorSugerido.toString() }));
        toast.success("Valor sugerido aplicado");
    };

    const preencherCidadesDoSugestao = () => {
        if (!sugestao?.porCidade?.length) return;
        setMetasCidades(sugestao.porCidade.map(c => ({ cidade: c.cidade, valor: c.valor.toString() })));
        setActiveTab('cidades');
        toast.success(`${sugestao.porCidade.length} cidades preenchidas`);
    };

    const preencherProdutosDoSugestao = () => {
        if (!sugestao?.porProduto?.length) return;
        const novos = sugestao.porProduto.map(p => ({
            produtoId: p.produtoId,
            quantidade: Math.ceil(p.qtdEstimada).toString(),
            _nome: p.nome,
            _codigo: p.codigo
        }));
        setMetasProdutos(novos);
        setActiveTab('produtos');
        toast.success(`${novos.length} produtos preenchidos`);
    };

    // === Submit ===
    const handleSubmit = async () => {
        if (!formData.vendedorId || !formData.valorMensal) {
            toast.error("Vendedor e Valor Mensal são obrigatórios");
            return;
        }
        if (formData.diasTrabalho.length === 0) {
            toast.error("Selecione os dias de trabalho no calendário");
            return;
        }
        for (const mp of metasProdutos) {
            if (!mp.quantidade || Number(mp.quantidade) <= 0) {
                toast.error(`Informe a quantidade para "${mp._nome}"`);
                return;
            }
        }
        for (const mp of metasPromocoes) {
            if (!mp.quantidadePedidos || Number(mp.quantidadePedidos) <= 0) {
                toast.error(`Informe a quantidade para a promoção "${mp._nome}"`);
                return;
            }
        }
        for (const mc of metasCidades) {
            if (!mc.valor || Number(mc.valor) <= 0) {
                toast.error(`Informe o valor para a cidade "${mc.cidade}"`);
                return;
            }
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                metasProdutos: metasProdutos.map(mp => ({ produtoId: mp.produtoId, quantidade: Number(mp.quantidade) })),
                metasPromocoes: metasPromocoes.map(mp => ({ promocaoId: mp.promocaoId, quantidadePedidos: Number(mp.quantidadePedidos) })),
                metasCidades: metasCidades.map(mc => ({ cidade: mc.cidade, valor: Number(mc.valor) }))
            };
            await api.post('/metas', payload);
            toast.success("Meta gravada com sucesso!");
            onClose(true);
        } catch (error) {
            console.error("Erro ao salvar meta:", error);
            toast.error(error.response?.data?.error || "Erro ao salvar meta");
        } finally {
            setLoading(false);
        }
    };

    const tabCounts = {
        calendario: formData.diasTrabalho.length,
        produtos: metasProdutos.length,
        cidades: metasCidades.length,
        promocoes: metasPromocoes.length,
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full flex flex-col" style={{ maxWidth: '1100px', height: '88vh' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 rounded-t-xl shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">
                            {metaData ? 'Editar Meta' : 'Nova Meta'} — {dayjs(mesAtualStr + '-01').format('MMMM [de] YYYY')}
                        </h2>
                        {formData.valorMensal && (
                            <p className="text-sm text-blue-600 font-semibold mt-0.5">
                                Meta: {fmtDec(formData.valorMensal)}
                            </p>
                        )}
                    </div>
                    <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">

                    {/* LEFT PANEL */}
                    <div className="w-80 shrink-0 border-r flex flex-col overflow-y-auto bg-gray-50">
                        <div className="p-4 space-y-4">

                            {/* Dados básicos */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vendedor *</label>
                                <select
                                    name="vendedorId"
                                    value={formData.vendedorId}
                                    onChange={(e) => { handleChange(e); setSugestao(null); }}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                                    disabled={!!metaData}
                                >
                                    <option value="">Selecione...</option>
                                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Meta Financeira Total (R$) *</label>
                                <input
                                    type="number"
                                    name="valorMensal"
                                    step="0.01"
                                    value={formData.valorMensal}
                                    onChange={handleChange}
                                    placeholder="0,00"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Limite de Flex no Mês (R$)</label>
                                <input
                                    type="number"
                                    name="flexMensal"
                                    step="0.01"
                                    value={formData.flexMensal}
                                    onChange={handleChange}
                                    placeholder="0,00"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            {/* Painel de Sugestão */}
                            <div className="border border-amber-200 rounded-xl bg-amber-50 overflow-hidden">
                                <div className="px-4 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Sparkles size={16} className="text-amber-500" />
                                        <span className="text-sm font-semibold text-amber-800">Sugestão Automática</span>
                                    </div>
                                    {sugestao && (
                                        <button onClick={() => setSugestaoAberta(v => !v)} className="text-amber-600 hover:text-amber-800">
                                            {sugestaoAberta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </button>
                                    )}
                                </div>

                                <div className="px-4 pb-4 space-y-3">
                                    <div className="flex gap-2 items-center">
                                        <div className="flex-1">
                                            <label className="block text-xs text-amber-700 mb-1">Fator de crescimento</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={fatorCrescimento}
                                                onChange={(e) => setFatorCrescimento(e.target.value)}
                                                className="w-full border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white"
                                                placeholder="1.10"
                                            />
                                        </div>
                                        <div className="pt-5">
                                            <span className="text-xs text-amber-600">
                                                {fatorCrescimento ? `+${Math.round((parseFloat(fatorCrescimento) - 1) * 100)}%` : ''}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleCalcularSugestao}
                                        disabled={!formData.vendedorId || loadingSugestao}
                                        className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-lg transition flex items-center justify-center gap-2"
                                    >
                                        <Sparkles size={14} />
                                        {loadingSugestao ? 'Calculando...' : 'Calcular Sugestão'}
                                    </button>

                                    {sugestao && sugestaoAberta && (
                                        <div className="space-y-3">
                                            <div className="bg-white rounded-lg p-3 border border-amber-200 text-center">
                                                <div className="text-xs text-gray-500 mb-0.5">Valor sugerido</div>
                                                <div className="text-xl font-bold text-amber-700">{fmt(sugestao.valorSugerido)}</div>
                                                <div className="text-xs text-gray-400">{sugestao.totalClientes} clientes analisados</div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={usarValorSugerido}
                                                    className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg font-medium"
                                                >
                                                    Usar valor
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={preencherCidadesDoSugestao}
                                                    className="flex-1 text-xs bg-orange-500 hover:bg-orange-600 text-white py-1.5 rounded-lg font-medium"
                                                >
                                                    Preencher cidades
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={preencherProdutosDoSugestao}
                                                className="w-full text-xs bg-green-600 hover:bg-green-700 text-white py-1.5 rounded-lg font-medium"
                                            >
                                                Preencher produtos
                                            </button>

                                            {/* Top cidades */}
                                            {sugestao.porCidade.length > 0 && (
                                                <div>
                                                    <div className="text-xs font-semibold text-gray-500 mb-1">Por cidade</div>
                                                    <div className="space-y-1 max-h-32 overflow-y-auto">
                                                        {sugestao.porCidade.map(c => (
                                                            <div key={c.cidade} className="flex justify-between text-xs bg-white rounded px-2 py-1 border border-gray-100">
                                                                <span className="text-gray-700 truncate">{c.cidade}</span>
                                                                <span className="font-semibold text-gray-800 ml-2 shrink-0">{fmt(c.valor)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {sugestao && !sugestaoAberta && (
                                        <div className="text-center text-sm text-amber-700 font-semibold">
                                            {fmt(sugestao.valorSugerido)} sugerido
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Tabs */}
                        <div className="flex border-b bg-white shrink-0 px-4">
                            {TABS.map(tab => {
                                const count = tabCounts[tab.id];
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px
                                            ${activeTab === tab.id
                                                ? 'border-blue-600 text-blue-600'
                                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        {tab.icon && <tab.icon size={14} />}
                                        {tab.label}
                                        {count > 0 && (
                                            <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold
                                                ${activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab content */}
                        <div className="flex-1 overflow-y-auto p-5">

                            {/* CALENDÁRIO */}
                            {activeTab === 'calendario' && (
                                <div>
                                    <div className="flex justify-between items-center mb-4">
                                        <div>
                                            <h3 className="font-semibold text-gray-800">Dias de trabalho</h3>
                                            <p className="text-xs text-gray-500">{formData.diasTrabalho.length} dias selecionados</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={selecionarDiasUteis}
                                            className="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium"
                                        >
                                            Selecionar 2ª a 6ª
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-400 mb-2">
                                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                                    </div>
                                    <div className="grid grid-cols-7 gap-1">
                                        {Array.from({ length: startOfMonth.day() }).map((_, i) => (
                                            <div key={`empty-${i}`} />
                                        ))}
                                        {monthDays.map(dayObj => {
                                            const dateStr = dayObj.format('YYYY-MM-DD');
                                            const isSelected = formData.diasTrabalho.includes(dateStr);
                                            const isWeekend = dayObj.day() === 0 || dayObj.day() === 6;
                                            return (
                                                <button
                                                    key={dateStr}
                                                    type="button"
                                                    onClick={() => toggleDiaTrabalho(dateStr)}
                                                    className={`
                                                        aspect-square rounded-lg font-medium text-sm transition-all
                                                        ${isSelected
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : isWeekend
                                                                ? 'bg-red-50 text-red-400 hover:bg-red-100'
                                                                : 'bg-white border text-gray-700 hover:bg-gray-50'
                                                        }
                                                    `}
                                                >
                                                    {dayObj.date()}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* PRODUTOS */}
                            {activeTab === 'produtos' && (
                                <div>
                                    <div className="mb-4">
                                        <h3 className="font-semibold text-gray-800 mb-1">Meta de Produtos</h3>
                                        <p className="text-xs text-gray-500">Quantidade mínima a vender por produto no mês.</p>
                                    </div>

                                    <div className="relative mb-4">
                                        <div className="flex items-center border border-gray-300 rounded-lg bg-white px-3">
                                            <Search className="h-4 w-4 text-gray-400 shrink-0" />
                                            <input
                                                type="text"
                                                value={produtosBusca}
                                                onChange={(e) => buscarProdutos(e.target.value)}
                                                placeholder="Buscar produto por nome ou código..."
                                                className="w-full py-2 pl-2 text-sm outline-none"
                                            />
                                        </div>
                                        {produtosResultado.length > 0 && (
                                            <div className="absolute z-20 bg-white border rounded-lg shadow-lg mt-1 w-full max-h-48 overflow-y-auto">
                                                {produtosResultado.map(p => (
                                                    <button
                                                        key={p.id}
                                                        type="button"
                                                        onClick={() => adicionarProduto(p)}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-green-50 text-sm border-b last:border-b-0"
                                                    >
                                                        <span className="font-medium text-gray-600">{p.codigo}</span>
                                                        <span className="text-gray-800 ml-2">{p.nome}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {metasProdutos.length === 0 ? (
                                        <p className="text-sm text-gray-400 italic text-center py-8">
                                            Nenhum produto adicionado. Use a busca ou clique em "Preencher produtos" na sugestão.
                                        </p>
                                    ) : (
                                        <div className="space-y-2">
                                            {metasProdutos.map((mp, idx) => (
                                                <div key={mp.produtoId} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-xs text-gray-500">{mp._codigo}</span>
                                                        <span className="text-sm font-medium text-gray-800 ml-2 truncate">{mp._nome}</span>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        value={mp.quantidade}
                                                        onChange={(e) => atualizarQtdProduto(idx, e.target.value)}
                                                        placeholder="Qtd"
                                                        className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center"
                                                    />
                                                    <button type="button" onClick={() => removerProduto(idx)} className="text-red-400 hover:text-red-600 p-1 shrink-0">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CIDADES */}
                            {activeTab === 'cidades' && (
                                <div>
                                    <div className="mb-4">
                                        <h3 className="font-semibold text-gray-800 mb-1">Meta por Cidade</h3>
                                        <p className="text-xs text-gray-500">
                                            Opcional. Cidades sem meta aqui ainda compõem o valor total — só não terão rastreamento individual.
                                        </p>
                                    </div>

                                    <div className="flex gap-2 mb-4">
                                        <input
                                            type="text"
                                            value={novaCidade}
                                            onChange={(e) => setNovaCidade(e.target.value)}
                                            placeholder="Nome da cidade"
                                            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                            onKeyDown={(e) => e.key === 'Enter' && adicionarCidade()}
                                        />
                                        <input
                                            type="number"
                                            value={novaCidadeValor}
                                            onChange={(e) => setNovaCidadeValor(e.target.value)}
                                            placeholder="R$ Meta"
                                            className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                            onKeyDown={(e) => e.key === 'Enter' && adicionarCidade()}
                                        />
                                        <button
                                            type="button"
                                            onClick={adicionarCidade}
                                            disabled={!novaCidade.trim() || !novaCidadeValor}
                                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg"
                                        >
                                            + Adicionar
                                        </button>
                                    </div>

                                    {metasCidades.length === 0 ? (
                                        <p className="text-sm text-gray-400 italic text-center py-8">
                                            Nenhuma cidade. Use "Preencher cidades" na sugestão ou adicione manualmente.
                                        </p>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                {metasCidades.map((mc, idx) => (
                                                    <div key={mc.cidade} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                        <MapPin size={14} className="text-orange-400 shrink-0" />
                                                        <span className="flex-1 text-sm font-medium text-gray-800">{mc.cidade}</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={mc.valor}
                                                            onChange={(e) => atualizarValorCidade(idx, e.target.value)}
                                                            placeholder="Valor"
                                                            className="w-36 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right"
                                                        />
                                                        <button type="button" onClick={() => removerCidade(idx)} className="text-red-400 hover:text-red-600 p-1 shrink-0">
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-3 text-right text-sm text-gray-500">
                                                Total cidades: <span className="font-semibold text-gray-800">
                                                    {fmtDec(metasCidades.reduce((s, c) => s + Number(c.valor || 0), 0))}
                                                </span>
                                                {formData.valorMensal && (
                                                    <span className="ml-2 text-xs text-gray-400">
                                                        / meta {fmtDec(formData.valorMensal)}
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* PROMOÇÕES */}
                            {activeTab === 'promocoes' && (
                                <div>
                                    <div className="mb-4">
                                        <h3 className="font-semibold text-gray-800 mb-1">Meta de Promoções</h3>
                                        <p className="text-xs text-gray-500">Número de pedidos com adesão a cada promoção.</p>
                                    </div>

                                    {promocoesAtivas.length > 0 ? (
                                        <div className="mb-4">
                                            <select
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                                                onChange={(e) => { adicionarPromocao(e.target.value); e.target.value = ''; }}
                                                defaultValue=""
                                            >
                                                <option value="">+ Adicionar promoção...</option>
                                                {promocoesAtivas
                                                    .filter(p => !metasPromocoes.some(mp => mp.promocaoId === p.id))
                                                    .map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.nome}{p.produtoNome ? ` (${p.produtoNome})` : ''}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-400 italic mb-4">Nenhuma promoção ativa.</p>
                                    )}

                                    {metasPromocoes.length === 0 ? (
                                        <p className="text-sm text-gray-400 italic text-center py-8">Nenhuma promoção adicionada.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {metasPromocoes.map((mp, idx) => (
                                                <div key={mp.promocaoId} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-sm font-medium text-gray-800 truncate block">{mp._nome}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <input
                                                            type="number"
                                                            value={mp.quantidadePedidos}
                                                            onChange={(e) => atualizarQtdPromocao(idx, e.target.value)}
                                                            placeholder="Qtd"
                                                            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center"
                                                        />
                                                        <span className="text-xs text-gray-400">pedidos</span>
                                                    </div>
                                                    <button type="button" onClick={() => removerPromocao(idx)} className="text-red-400 hover:text-red-600 p-1 shrink-0">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={() => onClose(false)}
                        disabled={loading}
                        className="px-5 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-7 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm shadow-sm disabled:opacity-60 min-w-[130px]"
                    >
                        {loading ? 'Salvando...' : 'Salvar Meta'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MetaFormModal;
