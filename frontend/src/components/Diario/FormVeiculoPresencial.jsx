import React, { useState, useEffect } from 'react';
import { MapPin, CheckCircle, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import SelectBusca from '../SelectBusca';

const CHECKLIST_ITENS = [
    ['pneusOk', 'Calibragem Pneus OK'],
    ['luzesOk', 'Luzes/Farol OK'],
    ['oleoOk', 'Óleo e Água OK'],
    ['combustivelOk', 'Combustível OK'],
    ['documentoOk', 'Doc. Impresso CNH/CRLV OK'],
    ['limpezaOk', 'Limpo e Organizado OK'],
];

/**
 * Formulário de saída com veículo (placa + KM inicial + checklist de segurança).
 * Usado em dois lugares:
 *  - no Ponto Diário (DiarioGateway), quando o motorista escolhe PRESENCIAL de manhã;
 *  - no botão "Pegar veículo" (DiarioPegarVeiculo), quando ele começou em Home Office
 *    e só assume o carro ao chegar na empresa.
 *
 * `onConfirmar({ veiculoId, kmInicial, checklist, obs })` faz o envio; o componente
 * cuida de carregar placas, veículos já em uso hoje e o último KM do veículo.
 */
const FormVeiculoPresencial = ({ titulo = 'Visitação (Rota)', onConfirmar, onVoltar, labelVoltar = 'Voltar/Mudar' }) => {
    const [veiculos, setVeiculos] = useState([]);
    const [veiculosEmUso, setVeiculosEmUso] = useState({}); // { veiculoId: nomeMotorista }
    const [veiculoId, setVeiculoId] = useState('');
    const [kmInicial, setKmInicial] = useState('');
    const [ultimoKm, setUltimoKm] = useState(null); // { kmFinal, dataReferencia }
    const [obs, setObs] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [checklist, setChecklist] = useState(
        Object.fromEntries(CHECKLIST_ITENS.map(([campo]) => [campo, false]))
    );

    // Carrega a placa dos veículos e quais estão em uso hoje
    useEffect(() => {
        api.get('/veiculos').then(res => setVeiculos(res.data)).catch(console.error);
        api.get('/diarios/veiculos-em-uso-hoje').then(res => {
            const map = {};
            (res.data || []).forEach(d => { map[d.veiculoId] = d.motorista; });
            setVeiculosEmUso(map);
        }).catch(() => {});
    }, []);

    // Ao selecionar veículo, busca o último KM final registrado
    useEffect(() => {
        if (!veiculoId) { setUltimoKm(null); setKmInicial(''); return; }
        api.get(`/veiculos/${veiculoId}/ultimo-km`)
            .then(res => {
                setUltimoKm(res.data);
                if (res.data?.kmFinal) setKmInicial(String(res.data.kmFinal));
            })
            .catch(() => setUltimoKm(null));
    }, [veiculoId]);

    const handleChecklist = (campo) => setChecklist(prev => ({ ...prev, [campo]: !prev[campo] }));
    const checklistCompleto = Object.values(checklist).every(v => v === true);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!checklistCompleto) {
            return toast.error('Sua segurança importa! Marque todo o checklist do veículo antes de sair.');
        }
        try {
            setIsSubmitting(true);
            await onConfirmar({ veiculoId, kmInicial: parseInt(kmInicial), checklist, obs });
        } finally {
            setIsSubmitting(false);
        }
    };

    const veiculoSel = veiculos.find(v => v.id === veiculoId);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between border-b pb-4">
                <h2 className="text-2xl font-bold flex items-center text-green-700">
                    <MapPin className="mr-2" /> {titulo}
                </h2>
                {onVoltar && (
                    <button type="button" onClick={onVoltar} className="text-gray-500 hover:underline text-sm font-medium">{labelVoltar}</button>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label className="block text-sm font-bold text-gray-700 mb-1">Qual veículo vai utilizar? *</label>
                        <div className="flex">
                            <SelectBusca
                                className="w-full"
                                value={veiculoId}
                                onChange={(e) => setVeiculoId(e.target.value)}
                            >
                                <option value="">-- Selecione a Placa --</option>
                                {veiculos.map(v => {
                                    const emUso = veiculosEmUso[v.id];
                                    return (
                                        <option key={v.id} value={v.id} disabled={!!emUso}>
                                            {v.placa} - {v.modelo}{emUso ? ` (em uso: ${emUso})` : ''}
                                        </option>
                                    );
                                })}
                            </SelectBusca>

                            {/* Botão de Documento (se existir URL no veículo) */}
                            {veiculoSel?.documentoUrl ? (
                                <a
                                    href={veiculoSel.documentoUrl}
                                    target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium text-sm transition-colors"
                                    title="Visualizar documento em anexo"
                                >
                                    <FileText className="w-5 h-5" />
                                </a>
                            ) : (
                                <div className="inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-100 text-gray-400 font-medium text-sm" title="Nenhum documento anexado">
                                    <FileText className="w-5 h-5 opacity-50" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Quilometragem Inicial Certa (KM)*</label>
                        {ultimoKm?.kmFinal && (
                            <div className="mb-2 flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5 text-blue-800">
                                <span>📍 Último KM registrado:</span>
                                <span className="font-mono font-bold">{ultimoKm.kmFinal.toLocaleString('pt-BR')} km</span>
                                <span className="text-blue-500">({ultimoKm.dataReferencia}) — não pode ser menor</span>
                            </div>
                        )}
                        <input
                            type="number"
                            required
                            className="mt-1 flex-1 block w-full bg-gray-50 focus:bg-white rounded-md border-gray-300 flex text-center text-3xl font-mono h-14 font-bold focus:border-green-500 focus:ring-green-500"
                            value={kmInicial}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (ultimoKm?.kmFinal && val < ultimoKm.kmFinal) return; // bloqueia valor menor
                                setKmInicial(e.target.value);
                            }}
                            min={ultimoKm?.kmFinal || 0}
                            placeholder="00000"
                        />
                        {ultimoKm?.kmFinal && (
                            <p className="text-xs text-amber-600 mt-1">⚠️ O odômetro não pode retroceder. Mínimo: {ultimoKm.kmFinal.toLocaleString('pt-BR')} km</p>
                        )}
                    </div>
                </div>

                {/* CHECKLIST */}
                <div className="pt-2">
                    <p className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Checklist de Segurança (Obrigatório)</p>
                    <div className="grid grid-cols-2 gap-3">
                        {CHECKLIST_ITENS.map(([campo, rotulo]) => (
                            <label key={campo} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${checklist[campo] ? 'bg-green-50 border-green-500 text-green-900 font-medium' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                                <input type="checkbox" checked={checklist[campo]} onChange={() => handleChecklist(campo)} className="mr-3 h-5 w-5 text-green-600 focus:ring-green-500 rounded border-gray-300" /> {rotulo}
                            </label>
                        ))}
                    </div>
                </div>

                <textarea
                    className="w-full mt-2 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-sm p-3 bg-gray-50"
                    rows="2"
                    placeholder="Alguma observação, avaria percebida ou recado? (Opcional)"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                />

                <button type="submit" disabled={isSubmitting} className="w-full h-14 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl text-lg flex items-center justify-center shadow-lg transition-transform active:scale-95 space-x-2">
                    <CheckCircle className="w-6 h-6" /> <span>{isSubmitting ? 'AGUARDE...' : 'CONFIRMAR INÍCIO (TUDO CHECADO)'}</span>
                </button>
            </form>
        </div>
    );
};

export default FormVeiculoPresencial;
