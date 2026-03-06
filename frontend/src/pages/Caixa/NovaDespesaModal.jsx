import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import api from '../../services/api';

const CATEGORIAS = [
    { value: 'MERCADORIA_EMPRESA', label: 'Mercadoria da Empresa' },
    { value: 'COMBUSTIVEL', label: 'Combustível' },
    { value: 'PEDAGIO_BALSA', label: 'Pedágio / Balsa' },
    { value: 'HOTEL_HOSPEDAGEM', label: 'Hotel / Hospedagem' },
    { value: 'MANUTENCAO_VEICULO', label: 'Manutenção de Veículo' },
    { value: 'OUTRO', label: 'Outro' }
];

const TIPOS_MANUTENCAO = [
    { value: 'LAMPADA', label: 'Lâmpada' },
    { value: 'PNEU', label: 'Pneu' },
    { value: 'OLEO', label: 'Óleo' },
    { value: 'FILTRO', label: 'Filtro' },
    { value: 'OUTRO', label: 'Outro' }
];

const NovaDespesaModal = ({ onClose, onSaved, vendedorId, dataReferencia, despesaEditando }) => {
    const [categoria, setCategoria] = useState('');
    const [descricao, setDescricao] = useState('');
    const [valor, setValor] = useState('');
    const [veiculoId, setVeiculoId] = useState('');
    const [litros, setLitros] = useState('');
    const [kmNoAbastecimento, setKmNoAbastecimento] = useState('');
    const [kmMinimo, setKmMinimo] = useState(null); // último km registrado
    const [tipoManutencao, setTipoManutencao] = useState('');
    const [veiculos, setVeiculos] = useState([]);
    const [saving, setSaving] = useState(false);
    const [erroKm, setErroKm] = useState(false);

    useEffect(() => {
        api.get('/veiculos').then(res => setVeiculos(res.data || [])).catch(() => { });
    }, []);

    useEffect(() => {
        if (despesaEditando) {
            setCategoria(despesaEditando.categoria || '');
            setDescricao(despesaEditando.descricao || '');
            setValor(String(despesaEditando.valor || ''));
            setVeiculoId(despesaEditando.veiculoId || '');
            setLitros(String(despesaEditando.litros || ''));
            setKmNoAbastecimento(String(despesaEditando.kmNoAbastecimento || ''));
            setTipoManutencao(despesaEditando.tipoManutencao || '');
        }
    }, [despesaEditando]);

    // Quando selecionar veículo em Combustível, busca último km para validação
    useEffect(() => {
        if (categoria !== 'COMBUSTIVEL' || !veiculoId) {
            setKmMinimo(null);
            return;
        }
        api.get(`/veiculos/${veiculoId}/ultimo-km-abastecimento`)
            .then(res => {
                if (res.data?.kmNoAbastecimento) {
                    setKmMinimo(res.data.kmNoAbastecimento);
                } else {
                    setKmMinimo(null);
                }
            })
            .catch(() => setKmMinimo(null));
    }, [veiculoId, categoria]);

    const handleKmChange = (e) => {
        const v = e.target.value;
        setKmNoAbastecimento(v);
        setErroKm(kmMinimo !== null && parseInt(v) < kmMinimo);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!categoria || !valor) return;
        if (erroKm) {
            alert(`O KM informado (${kmNoAbastecimento}) é menor que o último abastecimento (${kmMinimo} km). Corrija antes de salvar.`);
            return;
        }

        try {
            setSaving(true);
            const dados = {
                vendedorId,
                dataReferencia,
                categoria,
                descricao: descricao || null,
                valor: parseFloat(valor)
            };

            if (categoria === 'COMBUSTIVEL') {
                dados.veiculoId = veiculoId || null;
                dados.litros = litros ? parseFloat(litros) : null;
                dados.kmNoAbastecimento = kmNoAbastecimento ? parseInt(kmNoAbastecimento) : null;
            }

            if (categoria === 'MANUTENCAO_VEICULO') {
                dados.tipoManutencao = tipoManutencao || null;
            }

            if (despesaEditando) {
                await api.put(`/despesas/${despesaEditando.id}`, dados);
            } else {
                await api.post('/despesas', dados);
            }

            onSaved();
        } catch (error) {
            console.error('Erro ao salvar despesa:', error);
            alert(error.response?.data?.error || 'Erro ao salvar despesa.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">
                        {despesaEditando ? 'Editar Despesa' : 'Nova Despesa'}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Categoria */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
                        <select
                            value={categoria}
                            onChange={(e) => setCategoria(e.target.value)}
                            className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border"
                            required
                        >
                            <option value="">Selecione...</option>
                            {CATEGORIAS.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Campos de Combustível */}
                    {categoria === 'COMBUSTIVEL' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Veículo</label>
                                <select
                                    value={veiculoId}
                                    onChange={(e) => setVeiculoId(e.target.value)}
                                    className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border"
                                >
                                    <option value="">Selecione o veículo...</option>
                                    {veiculos.map(v => (
                                        <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Litros</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={litros}
                                        onChange={(e) => setLitros(e.target.value)}
                                        className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border"
                                        placeholder="Ex: 45.5"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        KM Hodômetro
                                        {kmMinimo && <span className="ml-1 text-xs text-gray-400">(mín: {kmMinimo.toLocaleString('pt-BR')})</span>}
                                    </label>
                                    <input
                                        type="number"
                                        value={kmNoAbastecimento}
                                        onChange={handleKmChange}
                                        className={`w-full rounded-md shadow-sm text-sm p-2 border focus:ring-primary focus:border-primary ${erroKm ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                            }`}
                                        placeholder={kmMinimo ? `≥ ${kmMinimo.toLocaleString('pt-BR')}` : 'Ex: 125430'}
                                    />
                                    {erroKm && (
                                        <p className="text-xs text-red-600 mt-1">
                                            ⚠️ KM não pode ser menor que o último abastecimento ({kmMinimo?.toLocaleString('pt-BR')})
                                        </p>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Campo de Manutenção */}
                    {categoria === 'MANUTENCAO_VEICULO' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Manutenção</label>
                            <select
                                value={tipoManutencao}
                                onChange={(e) => setTipoManutencao(e.target.value)}
                                className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border"
                            >
                                <option value="">Selecione...</option>
                                {TIPOS_MANUTENCAO.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Valor */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={valor}
                            onChange={(e) => setValor(e.target.value)}
                            className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border"
                            placeholder="0,00"
                            required
                        />
                    </div>

                    {/* Descrição */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                        <textarea
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            rows={2}
                            className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border"
                            placeholder="Observação opcional..."
                        />
                    </div>

                    {/* Botões */}
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-blue-700 disabled:opacity-50"
                        >
                            <Save className="h-4 w-4 mr-2" />
                            {saving ? 'Salvando...' : (despesaEditando ? 'Atualizar' : 'Salvar')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NovaDespesaModal;
