import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

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

const NovaDespesaModal = ({ onClose, onSaved, vendedorId, dataReferencia, despesaEditando, veiculoDoDia }) => {
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
    const { user: authUser } = useAuth();
    const isAdmin = !!authUser?.permissoes?.admin;

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
        } else if (veiculoDoDia) {
            // Pré-seleciona o veículo do dia ao abrir
            setVeiculoId(veiculoDoDia);
        }
    }, [despesaEditando, veiculoDoDia]);

    // Quando selecionar veículo em Combustível, busca último km para referência (NÃO pré-preenche)
    useEffect(() => {
        if (categoria !== 'COMBUSTIVEL' || !veiculoId) {
            setKmMinimo(null);
            return;
        }
        Promise.all([
            api.get(`/veiculos/${veiculoId}/ultimo-km`).catch(() => ({ data: null })),
            api.get(`/veiculos/${veiculoId}/ultimo-km-abastecimento`).catch(() => ({ data: null }))
        ]).then(([diarioRes, abastecRes]) => {
            const kmDiario = diarioRes.data?.kmFinal ? Number(diarioRes.data.kmFinal) : 0;
            const kmAbast = abastecRes.data?.kmNoAbastecimento ? Number(abastecRes.data.kmNoAbastecimento) : 0;
            const maiorKm = Math.max(kmDiario, kmAbast);
            setKmMinimo(maiorKm > 0 ? maiorKm : null);
        });
    }, [veiculoId, categoria]);

    const handleKmChange = (e) => {
        const v = e.target.value;
        setKmNoAbastecimento(v);
        // Admin pode lançar qualquer valor
        if (isAdmin) {
            setErroKm(false);
        } else {
            setErroKm(kmMinimo !== null && v && parseInt(v) <= kmMinimo);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!categoria || !valor) return;
        // Combustível: KM obrigatório
        if (categoria === 'COMBUSTIVEL' && veiculoId && !kmNoAbastecimento) {
            alert('Informe o KM do hodômetro.');
            return;
        }
        if (erroKm) {
            alert(`O KM informado (${kmNoAbastecimento}) deve ser maior que o último registro (${kmMinimo?.toLocaleString('pt-BR')} km).`);
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
                                    disabled={!isAdmin && !!veiculoDoDia && !despesaEditando}
                                    className={`w-full rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border ${!isAdmin && veiculoDoDia && !despesaEditando ? 'bg-gray-100 text-gray-600 border-gray-200' : 'border-gray-300'}`}
                                >
                                    <option value="">Selecione o veículo...</option>
                                    {veiculos.map(v => (
                                        <option key={v.id} value={v.id}>{v.placa} - {v.modelo}</option>
                                    ))}
                                </select>
                                {!isAdmin && veiculoDoDia && !despesaEditando && (
                                    <p className="text-[10px] text-gray-500 mt-1">Veículo do dia selecionado automaticamente</p>
                                )}
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
                                        KM Hodômetro *
                                    </label>
                                    <input
                                        type="number"
                                        required={!!veiculoId}
                                        value={kmNoAbastecimento}
                                        onChange={handleKmChange}
                                        min={!isAdmin && kmMinimo ? kmMinimo + 1 : undefined}
                                        className={`w-full rounded-md shadow-sm text-sm p-2 border focus:ring-primary focus:border-primary ${erroKm ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                        placeholder={kmMinimo ? `Maior que ${kmMinimo.toLocaleString('pt-BR')}` : 'Ex: 125430'}
                                    />
                                    {kmMinimo ? (
                                        <p className={`text-xs mt-1 ${!isAdmin ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                                            Último KM: {kmMinimo.toLocaleString('pt-BR')}
                                            {isAdmin && <span className="text-blue-500 ml-1">(admin: sem restrição)</span>}
                                        </p>
                                    ) : veiculoId ? (
                                        <p className="text-xs text-gray-400 mt-1">Primeiro registro deste veículo</p>
                                    ) : null}
                                    {erroKm && (
                                        <p className="text-xs text-red-600 mt-1">
                                            KM deve ser maior que {kmMinimo?.toLocaleString('pt-BR')}
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
