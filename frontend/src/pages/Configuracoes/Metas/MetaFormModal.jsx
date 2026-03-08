import React, { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { Trash2, Search } from 'lucide-react';
import produtoService from '../../../services/produtoService';
import promocaoService from '../../../services/promocaoService';

const API_URL = import.meta.env.VITE_API_URL;

const MetaFormModal = ({ isOpen, onClose, metaData, vendedores, mesAtualStr }) => {
    const [formData, setFormData] = useState({
        vendedorId: '',
        mesReferencia: mesAtualStr,
        valorMensal: '',
        flexMensal: '0',
        diasTrabalho: []
    });

    // Metas de Produtos
    const [metasProdutos, setMetasProdutos] = useState([]); // [{ produtoId, quantidade, _nome, _codigo }]
    const [produtosBusca, setProdutosBusca] = useState('');
    const [produtosResultado, setProdutosResultado] = useState([]);

    // Metas de Promoções
    const [metasPromocoes, setMetasPromocoes] = useState([]); // [{ promocaoId, quantidadePedidos, _nome }]
    const [promocoesAtivas, setPromocoesAtivas] = useState([]);

    const [loading, setLoading] = useState(false);

    // Calcular grid do mês para o picker
    const startOfMonth = dayjs(mesAtualStr + '-01').startOf('month');
    const endOfMonth = startOfMonth.endOf('month');
    const daysInMonth = endOfMonth.date();

    const monthDays = [];
    for (let i = 1; i <= daysInMonth; i++) {
        monthDays.push(startOfMonth.date(i));
    }

    // Carregar promoções ativas
    useEffect(() => {
        const fetchPromocoes = async () => {
            try {
                const data = await promocaoService.buscarAtivasLote();
                // data é { produtoId: promo } - transformar em array
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

            // Carregar metas de produtos existentes
            if (metaData.metasProdutos?.length > 0) {
                setMetasProdutos(metaData.metasProdutos.map(mp => ({
                    produtoId: mp.produtoId,
                    quantidade: Number(mp.quantidade).toString(),
                    _nome: mp.produto?.nome || '',
                    _codigo: mp.produto?.codigo || ''
                })));
            }

            // Carregar metas de promoções existentes
            if (metaData.metasPromocoes?.length > 0) {
                setMetasPromocoes(metaData.metasPromocoes.map(mp => ({
                    promocaoId: mp.promocaoId,
                    quantidadePedidos: Number(mp.quantidadePedidos).toString(),
                    _nome: mp.promocao?.nome || ''
                })));
            }
        }
    }, [metaData, mesAtualStr]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const toggleDiaTrabalho = (dateStr) => {
        const currentDays = [...formData.diasTrabalho];
        const index = currentDays.indexOf(dateStr);
        if (index === -1) {
            currentDays.push(dateStr);
        } else {
            currentDays.splice(index, 1);
        }
        setFormData({ ...formData, diasTrabalho: currentDays });
    };

    const selecionarDiasUteis = () => {
        const diasUteis = monthDays
            .filter(d => d.day() !== 0 && d.day() !== 6)
            .map(d => d.format('YYYY-MM-DD'));
        setFormData({ ...formData, diasTrabalho: diasUteis });
    };

    // === Produtos ===
    const buscarProdutos = async (termo) => {
        setProdutosBusca(termo);
        if (termo.length < 2) { setProdutosResultado([]); return; }
        try {
            const data = await produtoService.listar({ search: termo, ativo: true, limit: 10 });
            const lista = data.produtos || data;
            setProdutosResultado(Array.isArray(lista) ? lista : []);
        } catch (e) {
            console.error("Erro buscar produtos", e);
        }
    };

    const adicionarProduto = (produto) => {
        if (metasProdutos.some(mp => mp.produtoId === produto.id)) {
            toast.error("Produto já adicionado");
            return;
        }
        setMetasProdutos([...metasProdutos, {
            produtoId: produto.id,
            quantidade: '',
            _nome: produto.nome,
            _codigo: produto.codigo
        }]);
        setProdutosBusca('');
        setProdutosResultado([]);
    };

    const atualizarQtdProduto = (index, valor) => {
        const copia = [...metasProdutos];
        copia[index].quantidade = valor;
        setMetasProdutos(copia);
    };

    const removerProduto = (index) => {
        setMetasProdutos(metasProdutos.filter((_, i) => i !== index));
    };

    // === Promoções ===
    const adicionarPromocao = (promoId) => {
        if (!promoId) return;
        if (metasPromocoes.some(mp => mp.promocaoId === promoId)) {
            toast.error("Promoção já adicionada");
            return;
        }
        const promo = promocoesAtivas.find(p => p.id === promoId);
        setMetasPromocoes([...metasPromocoes, {
            promocaoId: promoId,
            quantidadePedidos: '',
            _nome: promo?.nome || promoId
        }]);
    };

    const atualizarQtdPromocao = (index, valor) => {
        const copia = [...metasPromocoes];
        copia[index].quantidadePedidos = valor;
        setMetasPromocoes(copia);
    };

    const removerPromocao = (index) => {
        setMetasPromocoes(metasPromocoes.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e?.preventDefault();

        if (!formData.vendedorId || !formData.valorMensal) {
            toast.error("Vendedor e Valor Mensal são obrigatórios");
            return;
        }

        if (formData.diasTrabalho.length === 0) {
            toast.error("Selecione os dias de trabalho deste mês no calendário");
            return;
        }

        // Validar quantidades de produtos
        for (const mp of metasProdutos) {
            if (!mp.quantidade || Number(mp.quantidade) <= 0) {
                toast.error(`Informe a quantidade para o produto "${mp._nome}"`);
                return;
            }
        }

        // Validar quantidades de promoções
        for (const mp of metasPromocoes) {
            if (!mp.quantidadePedidos || Number(mp.quantidadePedidos) <= 0) {
                toast.error(`Informe a quantidade de pedidos para a promoção "${mp._nome}"`);
                return;
            }
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                metasProdutos: metasProdutos.map(mp => ({
                    produtoId: mp.produtoId,
                    quantidade: Number(mp.quantidade)
                })),
                metasPromocoes: metasPromocoes.map(mp => ({
                    promocaoId: mp.promocaoId,
                    quantidadePedidos: Number(mp.quantidadePedidos)
                }))
            };

            await axios.post(`${API_URL}/metas`, payload, {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
            });
            toast.success("Meta gravada com sucesso!");
            onClose(true);
        } catch (error) {
            console.error("Erro ao salvar meta:", error);
            toast.error(error.response?.data?.error || "Erro ao salvar meta");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-gray-800">
                        {metaData ? "Editar Meta" : "Nova Meta Mensal"} - {dayjs(mesAtualStr).format('MM/YYYY')}
                    </h2>
                    <button onClick={() => onClose(false)} className="text-gray-500 hover:text-gray-700 font-bold text-xl">
                        &times;
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-6">

                    {/* Dados Básicos */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor / Usuário *</label>
                            <select
                                name="vendedorId"
                                value={formData.vendedorId}
                                onChange={handleChange}
                                className="w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
                                disabled={!!metaData}
                                required
                            >
                                <option value="">Selecione...</option>
                                {vendedores.map(v => (
                                    <option key={v.id} value={v.id}>{v.nome}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mês de Referência</label>
                            <input
                                type="text"
                                value={dayjs(formData.mesReferencia).format('MM/YYYY')}
                                className="w-full border p-2 rounded bg-gray-100 text-gray-500 cursor-not-allowed"
                                disabled
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Meta Financeira Total (R$) *</label>
                            <input
                                type="number"
                                name="valorMensal"
                                step="0.01"
                                value={formData.valorMensal}
                                onChange={handleChange}
                                placeholder="Ex: 100000.00"
                                className="w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Limite de Flex no Mês (R$)</label>
                            <input
                                type="number"
                                name="flexMensal"
                                step="0.01"
                                value={formData.flexMensal}
                                onChange={handleChange}
                                placeholder="0.00"
                                className="w-full border p-2 rounded focus:ring-blue-500 focus:border-blue-500"
                            />
                            <p className="text-xs text-gray-400 mt-1">Quanto de flex/desconto o vendedor pode aplicar no mês</p>
                        </div>
                    </div>

                    {/* Calendário */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-gray-800">Calendário de Atuação ({formData.diasTrabalho.length} dias selecionados)</h3>
                                <p className="text-xs text-gray-500">Marque os dias exatos que o vendedor trabalhará neste mês.</p>
                            </div>
                            <button type="button" onClick={selecionarDiasUteis} className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200 transition">
                                Selecionar 2ª a 6ª
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-gray-500 mb-2">
                            <div>D</div><div>S</div><div>T</div><div>Q</div><div>Q</div><div>S</div><div>S</div>
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: startOfMonth.day() }).map((_, i) => (
                                <div key={`empty-${i}`} className="p-2"></div>
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
                                            p-2 rounded-md font-medium text-sm transition-all duration-200
                                            ${isSelected ? 'bg-green-500 text-white shadow-sm scale-105' : 'bg-white border text-gray-700 hover:bg-gray-100'}
                                            ${!isSelected && isWeekend ? 'text-red-400 bg-red-50' : ''}
                                        `}
                                    >
                                        {dayObj.date()}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Meta de Produtos */}
                    <div className="border rounded-lg p-4 bg-green-50">
                        <h3 className="font-bold text-gray-800 mb-1">Meta de Produtos (Quantidade Vendida)</h3>
                        <p className="text-xs text-gray-500 mb-3">Defina a quantidade mínima que o vendedor deve vender de cada produto no mês.</p>

                        {/* Busca de produto */}
                        <div className="relative mb-3">
                            <div className="flex items-center border rounded bg-white">
                                <Search className="h-4 w-4 text-gray-400 ml-2" />
                                <input
                                    type="text"
                                    value={produtosBusca}
                                    onChange={(e) => buscarProdutos(e.target.value)}
                                    placeholder="Buscar produto por nome ou código..."
                                    className="w-full p-2 rounded text-sm outline-none"
                                />
                            </div>
                            {produtosResultado.length > 0 && (
                                <div className="absolute z-10 bg-white border rounded shadow-lg mt-1 w-full max-h-40 overflow-y-auto">
                                    {produtosResultado.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => adicionarProduto(p)}
                                            className="w-full text-left px-3 py-2 hover:bg-green-50 text-sm border-b last:border-b-0"
                                        >
                                            <span className="font-medium">{p.codigo}</span> - {p.nome}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Lista de produtos adicionados */}
                        {metasProdutos.length > 0 && (
                            <div className="space-y-2">
                                {metasProdutos.map((mp, idx) => (
                                    <div key={mp.produtoId} className="flex items-center gap-2 bg-white border rounded p-2">
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium truncate block">{mp._codigo} - {mp._nome}</span>
                                        </div>
                                        <input
                                            type="number"
                                            step="0.001"
                                            value={mp.quantidade}
                                            onChange={(e) => atualizarQtdProduto(idx, e.target.value)}
                                            placeholder="Qtd"
                                            className="w-24 border p-1.5 rounded text-sm text-center"
                                        />
                                        <button type="button" onClick={() => removerProduto(idx)} className="text-red-500 hover:text-red-700 p-1">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {metasProdutos.length === 0 && (
                            <p className="text-xs text-gray-400 italic">Nenhum produto adicionado. Busque acima para adicionar.</p>
                        )}
                    </div>

                    {/* Meta de Promoções */}
                    <div className="border rounded-lg p-4 bg-purple-50">
                        <h3 className="font-bold text-gray-800 mb-1">Meta de Promoções (Pedidos com Adesão)</h3>
                        <p className="text-xs text-gray-500 mb-3">Defina quantos pedidos com cada promoção o vendedor deve realizar no mês.</p>

                        {promocoesAtivas.length > 0 ? (
                            <div className="flex items-center gap-2 mb-3">
                                <select
                                    className="flex-1 border p-2 rounded text-sm bg-white"
                                    onChange={(e) => { adicionarPromocao(e.target.value); e.target.value = ''; }}
                                    defaultValue=""
                                >
                                    <option value="">+ Adicionar promoção...</option>
                                    {promocoesAtivas
                                        .filter(p => !metasPromocoes.some(mp => mp.promocaoId === p.id))
                                        .map(p => (
                                            <option key={p.id} value={p.id}>{p.nome}{p.produtoNome ? ` (${p.produtoNome})` : ''}</option>
                                        ))
                                    }
                                </select>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 italic mb-3">Nenhuma promoção ativa no momento.</p>
                        )}

                        {metasPromocoes.length > 0 && (
                            <div className="space-y-2">
                                {metasPromocoes.map((mp, idx) => (
                                    <div key={mp.promocaoId} className="flex items-center gap-2 bg-white border rounded p-2">
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium truncate block">{mp._nome}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={mp.quantidadePedidos}
                                                onChange={(e) => atualizarQtdPromocao(idx, e.target.value)}
                                                placeholder="Qtd"
                                                className="w-20 border p-1.5 rounded text-sm text-center"
                                            />
                                            <span className="text-xs text-gray-500">pedidos</span>
                                        </div>
                                        <button type="button" onClick={() => removerPromocao(idx)} className="text-red-500 hover:text-red-700 p-1">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button
                        type="button"
                        onClick={() => onClose(false)}
                        className="px-4 py-2 text-gray-600 bg-white border rounded hover:bg-gray-100"
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="px-6 py-2 bg-blue-600 font-bold text-white rounded shadow hover:bg-blue-700 flex items-center justify-center min-w-[120px]"
                        disabled={loading}
                    >
                        {loading ? 'Salvando...' : 'Salvar Meta'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MetaFormModal;
