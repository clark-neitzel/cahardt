import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
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
    const [kmMinimo, setKmMinimo] = useState(null);
    const [tipoManutencao, setTipoManutencao] = useState('');
    const [veiculos, setVeiculos] = useState([]);
    const [saving, setSaving] = useState(false);
    const [erroKm, setErroKm] = useState(false);
    const [precoMedioLitro, setPrecoMedioLitro] = useState(null);
    const [alertaPreco, setAlertaPreco] = useState(null); // { pct, precoAtual, media }
    const [confirmandoPreco, setConfirmandoPreco] = useState(false);
    const { user: authUser } = useAuth();
    const isAdmin = !!authUser?.permissoes?.admin;
    const podeEditarVeiculos = isAdmin || !!authUser?.permissoes?.Pode_Editar_Veiculos;

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
            setVeiculoId(veiculoDoDia);
        }
    }, [despesaEditando, veiculoDoDia]);

    // Busca KM mínimo e preço médio/litro ao selecionar veículo em Combustível
    useEffect(() => {
        if (categoria !== 'COMBUSTIVEL' || !veiculoId) {
            setKmMinimo(null);
            setPrecoMedioLitro(null);
            setAlertaPreco(null);
            return;
        }
        Promise.all([
            api.get(`/veiculos/${veiculoId}/ultimo-km`).catch(() => ({ data: null })),
            api.get(`/veiculos/${veiculoId}/ultimo-km-abastecimento`).catch(() => ({ data: null })),
            api.get(`/veiculos/${veiculoId}/preco-medio-litro`).catch(() => ({ data: { precoMedioLitro: null } }))
        ]).then(([diarioRes, abastecRes, precoRes]) => {
            const kmDiario = diarioRes.data?.kmFinal ? Number(diarioRes.data.kmFinal) : 0;
            const kmAbast = abastecRes.data?.kmNoAbastecimento ? Number(abastecRes.data.kmNoAbastecimento) : 0;
            const maiorKm = Math.max(kmDiario, kmAbast);
            setKmMinimo(maiorKm > 0 ? maiorKm : null);
            setPrecoMedioLitro(precoRes.data?.precoMedioLitro ?? null);
        });
    }, [veiculoId, categoria]);

    // Recalcula alerta de preço ao mudar valor ou litros
    useEffect(() => {
        setAlertaPreco(null);
        setConfirmandoPreco(false);
        if (!valor || !litros || !precoMedioLitro) return;
        const l = parseFloat(litros);
        const v = parseFloat(valor);
        if (!l || !v || l <= 0) return;
        const precoAtual = v / l;
        const pct = ((precoAtual - precoMedioLitro) / precoMedioLitro) * 100;
        if (pct > 10) {
            setAlertaPreco({ pct: pct.toFixed(1), precoAtual: precoAtual.toFixed(3), media: precoMedioLitro.toFixed(3) });
        }
    }, [valor, litros, precoMedioLitro]);

    const handleKmChange = (e) => {
        const v = e.target.value;
        setKmNoAbastecimento(v);
        if (isAdmin) {
            setErroKm(false);
        } else {
            setErroKm(kmMinimo !== null && v && parseInt(v) <= kmMinimo);
        }
    };

    const veiculoSelecionado = veiculos.find(v => v.id === veiculoId);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!categoria || !valor) return;

        if (categoria === 'COMBUSTIVEL') {
            if (!veiculoId) {
                alert('Selecione o veículo para registrar combustível.');
                return;
            }
            if (!litros || parseFloat(litros) <= 0) {
                alert('Informe a quantidade de litros abastecidos.');
                return;
            }
            if (!kmNoAbastecimento) {
                alert('Informe o KM do hodômetro.');
                return;
            }
            if (erroKm) {
                alert(`O KM informado (${kmNoAbastecimento}) deve ser maior que o último registro (${kmMinimo?.toLocaleString('pt-BR')} km).`);
                return;
            }
            if (alertaPreco && !confirmandoPreco) {
                setConfirmandoPreco(true);
                return;
            }
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
                dados.veiculoId = veiculoId;
                dados.litros = parseFloat(litros);
                dados.kmNoAbastecimento = parseInt(kmNoAbastecimento);
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

    // Preço por litro calculado em tempo real
    const precoAtualLitro = valor && litros && parseFloat(litros) > 0
        ? (parseFloat(valor) / parseFloat(litros)).toFixed(3)
        : null;

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
                            onChange={(e) => { setCategoria(e.target.value); setAlertaPreco(null); setConfirmandoPreco(false); }}
                            className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border"
                            required
                        >
                            <option value="">Selecione...</option>
                            {CATEGORIAS.map(c => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Aviso: sem placa no dia */}
                    {categoria === 'COMBUSTIVEL' && !veiculoDoDia && !despesaEditando && !podeEditarVeiculos && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
                            Você não possui um veículo registrado para hoje. Inicie o dia com um veículo para lançar combustível.
                        </div>
                    )}

                    {/* Campos de Combustível */}
                    {categoria === 'COMBUSTIVEL' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Veículo *</label>
                                <select
                                    value={veiculoId}
                                    onChange={(e) => setVeiculoId(e.target.value)}
                                    disabled={!podeEditarVeiculos && !!veiculoDoDia && !despesaEditando}
                                    className={`w-full rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border ${!podeEditarVeiculos && veiculoDoDia && !despesaEditando ? 'bg-gray-100 text-gray-600 border-gray-200' : 'border-gray-300'}`}
                                    required
                                >
                                    <option value="">Selecione o veículo...</option>
                                    {veiculos.map(v => (
                                        <option key={v.id} value={v.id}>{v.placa} — {v.modelo}</option>
                                    ))}
                                </select>
                                {!podeEditarVeiculos && veiculoDoDia && !despesaEditando && (
                                    <p className="text-[10px] text-gray-500 mt-1">Veículo do dia selecionado automaticamente</p>
                                )}
                                {/* Tipo de combustível do veículo */}
                                {veiculoSelecionado?.tipoCombustivel && (
                                    <p className="text-xs mt-1 font-medium text-blue-700">
                                        {veiculoSelecionado.tipoCombustivel === 'DIESEL' ? '⛽ Diesel' : '⛽ Gasolina'}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Litros *</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0.1"
                                        required
                                        value={litros}
                                        onChange={(e) => setLitros(e.target.value)}
                                        className="w-full border-gray-300 rounded-md shadow-sm text-sm focus:ring-primary focus:border-primary p-2 border"
                                        placeholder="Ex: 45.500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">KM Hodômetro *</label>
                                    <input
                                        type="number"
                                        required
                                        value={kmNoAbastecimento}
                                        onChange={handleKmChange}
                                        min={!isAdmin && kmMinimo ? kmMinimo + 1 : undefined}
                                        className={`w-full rounded-md shadow-sm text-sm p-2 border focus:ring-primary focus:border-primary ${erroKm ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                        placeholder={kmMinimo ? `> ${kmMinimo.toLocaleString('pt-BR')}` : 'Ex: 125430'}
                                    />
                                    {kmMinimo ? (
                                        <p className={`text-xs mt-1 ${!isAdmin ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                                            Último KM: {kmMinimo.toLocaleString('pt-BR')}
                                            {isAdmin && <span className="text-blue-500 ml-1">(admin)</span>}
                                        </p>
                                    ) : veiculoId ? (
                                        <p className="text-xs text-gray-400 mt-1">Primeiro registro</p>
                                    ) : null}
                                    {erroKm && (
                                        <p className="text-xs text-red-600 mt-1">KM deve ser maior que {kmMinimo?.toLocaleString('pt-BR')}</p>
                                    )}
                                </div>
                            </div>

                            {/* Preço por litro em tempo real */}
                            {precoAtualLitro && (
                                <div className="text-xs text-gray-500">
                                    Preço por litro: <span className="font-semibold text-gray-700">R$ {precoAtualLitro}</span>
                                    {precoMedioLitro && <span className="ml-2 text-gray-400">(média: R$ {precoMedioLitro.toFixed(3)})</span>}
                                </div>
                            )}

                            {/* Alerta de preço acima da média */}
                            {alertaPreco && (
                                <div className="bg-orange-50 border border-orange-300 rounded-md p-3 flex gap-2">
                                    <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                                    <div className="text-sm text-orange-800">
                                        <p className="font-medium">Preço acima da média</p>
                                        <p>R$ {alertaPreco.precoAtual}/L está {alertaPreco.pct}% acima da média (R$ {alertaPreco.media}/L).</p>
                                        {confirmandoPreco
                                            ? <p className="mt-1 font-medium">Clique em Salvar novamente para confirmar.</p>
                                            : <p className="mt-1">Verifique o valor antes de salvar.</p>
                                        }
                                    </div>
                                </div>
                            )}
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
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || erroKm}
                            className={`px-4 py-2 text-sm font-medium text-white rounded-md flex items-center gap-2 ${alertaPreco && !confirmandoPreco ? 'bg-orange-500 hover:bg-orange-600' : 'bg-primary hover:bg-primary-dark'} disabled:opacity-50`}
                        >
                            <Save className="h-4 w-4" />
                            {saving ? 'Salvando...' : alertaPreco && !confirmandoPreco ? 'Confirmar mesmo assim' : 'Salvar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NovaDespesaModal;
