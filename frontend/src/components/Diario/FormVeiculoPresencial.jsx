import React, { useState, useEffect, useRef } from 'react';
import { MapPin, CheckCircle, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import SelectBusca from '../SelectBusca';
import CampoNumero from '../CampoNumero';
import checklistVeiculoService from '../../services/checklistVeiculoService';
import ChecklistFotos from './ChecklistFotos';
import ChecklistProblemaTela from './ChecklistProblemaTela';

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
 * `onConfirmar({ veiculoId, kmInicial, checklistId, obs })` (modo foto) ou
 * `onConfirmar({ veiculoId, kmInicial, checklist, obs })` (caixinhas de fallback) faz o envio; o componente
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
    // Checklist por foto: config do veículo escolhido ('carregando' | 'erro' | objeto)
    const [config, setConfig] = useState(null);
    const [rascunhoFalhou, setRascunhoFalhou] = useState(false);
    const [estadoFotos, setEstadoFotos] = useState({ checklistId: null, faltam: 0 });
    const [resultado, setResultado] = useState(null); // resposta do /avaliar quando há problema
    const [seguindo, setSeguindo] = useState(false);

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

    // Ao escolher o veículo, busca a configuração do checklist por foto
    useEffect(() => {
        setResultado(null);
        setRascunhoFalhou(false);
        setEstadoFotos({ checklistId: null, faltam: 0 });
        if (!veiculoId) { setConfig(null); return undefined; }
        let cancelado = false;
        setConfig('carregando');
        checklistVeiculoService.config(veiculoId)
            .then(c => { if (!cancelado) setConfig(c); })
            .catch(err => {
                console.error('Checklist: falha ao ler a configuração, usando as caixinhas', err);
                if (!cancelado) setConfig('erro');
            });
        return () => { cancelado = true; };
    }, [veiculoId]);

    // Modo foto = config válida, com slots e não desligada, e rascunho criado com sucesso.
    // Qualquer falha (rede, 500, DESLIGADO) cai nas 6 caixinhas antigas.
    const configOk = config && typeof config === 'object';
    const modoFoto = !!(configOk && config.modo !== 'DESLIGADO' && (config.slots || []).length > 0 && !rascunhoFalhou);
    const carregandoConfig = !!veiculoId && config === 'carregando';
    const rotulos = Object.fromEntries((configOk ? config.slots || [] : []).map(s => [s.angulo, s.rotulo]));

    // Trava síncrona contra duplo toque (state só atualiza no próximo render)
    const travaRef = useRef(false);

    const handleChecklist = (campo) => setChecklist(prev => ({ ...prev, [campo]: !prev[campo] }));
    const checklistCompleto = Object.values(checklist).every(v => v === true);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (travaRef.current) return;
        if (!veiculoId) return toast.error('Escolha o veículo.');
        const km = parseInt(kmInicial);
        if (!Number.isFinite(km) || km < 0) return toast.error('Informe o KM inicial.');
        if (carregandoConfig) return toast('Aguarde, preparando o checklist...');

        if (!modoFoto) {
            // Fallback: caixinhas de antes
            if (!checklistCompleto) {
                return toast.error('Sua segurança importa! Marque todo o checklist do veículo antes de sair.');
            }
            try {
                travaRef.current = true;
                setIsSubmitting(true);
                await onConfirmar({ veiculoId, kmInicial: km, checklist, obs });
            } finally {
                travaRef.current = false;
                setIsSubmitting(false);
            }
            return;
        }

        if (!estadoFotos.checklistId) return toast('Aguarde, preparando o checklist...');
        try {
            travaRef.current = true;
            setIsSubmitting(true);
            let r = null;
            try {
                r = await checklistVeiculoService.avaliar(estadoFotos.checklistId, km);
            } catch (err) {
                // A conferência nunca pode impedir o início do dia (modo teste): segue sem veredito.
                console.error('Checklist: falha ao avaliar, seguindo sem veredito', err);
            }
            const temPergunta = Array.isArray(r?.problemas) && r.problemas.some(p => p.gravidade === 'PERGUNTA' && !p.resposta);
            if (r && (r.veredito === 'ATENCAO' || r.veredito === 'REPROVADO' || temPergunta)) {
                setResultado(r);
                return;
            }
            await onConfirmar({ veiculoId, kmInicial: km, checklistId: estadoFotos.checklistId, obs });
        } finally {
            travaRef.current = false;
            setIsSubmitting(false);
        }
    };

    const corrigirAgora = () => {
        if (travaRef.current) return;
        const id = estadoFotos.checklistId;
        setResultado(null);
        if (id) checklistVeiculoService.decidir(id, 'CORRIGIU').catch(() => {}); // só registro
    };

    const seguirMesmoAssim = async (opts) => {
        const semDecisao = opts?.semDecisao === true; // 'Tudo certo': não grava SEGUIU_TESTE
        if (travaRef.current) return;
        travaRef.current = true;
        const id = estadoFotos.checklistId;
        try {
            setSeguindo(true);
            try {
                if (!semDecisao) await checklistVeiculoService.decidir(id, 'SEGUIU_TESTE');
            } catch (err) {
                if (err?.response?.data?.codigo === 'TRAVA_ATIVA') {
                    toast.error(err.response.data.error || 'Não é possível seguir com este veículo sem liberação.');
                    return;
                }
                console.error('Checklist: falha ao gravar a decisão, seguindo', err);
            }
            await onConfirmar({ veiculoId, kmInicial: parseInt(kmInicial), checklistId: id, obs });
        } finally {
            travaRef.current = false;
            setSeguindo(false);
        }
    };

    const veiculoSel = veiculos.find(v => v.id === veiculoId);

    if (resultado) {
        return (
            <div className="space-y-4 animate-fade-in">
                <h2 className="text-xl font-bold text-gray-900 border-b pb-3">Conferência do veículo</h2>
                <ChecklistProblemaTela
                    resultado={resultado}
                    rotulos={rotulos}
                    seguindo={seguindo}
                    checklistId={estadoFotos.checklistId}
                    onAtualizar={setResultado}
                    onCorrigir={corrigirAgora}
                    onSeguir={(o) => seguirMesmoAssim(o)}
                />
            </div>
        );
    }

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
                        <CampoNumero
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
                {carregandoConfig && (
                    <p className="pt-2 text-sm text-gray-500">Preparando o checklist do veículo...</p>
                )}
                {modoFoto && (
                    <div className="pt-2">
                        <ChecklistFotos
                            key={veiculoId}
                            veiculoId={veiculoId}
                            config={config}
                            onEstado={setEstadoFotos}
                            onFalha={() => setRascunhoFalhou(true)}
                        />
                    </div>
                )}
                {!!veiculoId && !carregandoConfig && !modoFoto && (
                    <div className="pt-2">
                        <p className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">Checklist de Segurança (Obrigatório)</p>
                        <div className="grid grid-cols-2 gap-3">
                            {CHECKLIST_ITENS.map(([campo, rotulo]) => (
                                <label key={campo} className={`flex items-center p-3 min-h-[44px] border rounded-lg cursor-pointer transition-colors ${checklist[campo] ? 'bg-green-50 border-green-500 text-green-900 font-medium' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                                    <input type="checkbox" checked={checklist[campo]} onChange={() => handleChecklist(campo)} className="mr-3 h-5 w-5 text-green-600 focus:ring-green-500 rounded border-gray-300" /> {rotulo}
                                </label>
                            ))}
                        </div>
                    </div>
                )}
                {!veiculoId && (
                    <p className="pt-2 text-sm text-gray-500">Escolha o veículo para ver o checklist.</p>
                )}

                <textarea
                    className="w-full mt-2 rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500 text-sm p-3 bg-gray-50"
                    rows="2"
                    placeholder="Alguma observação, avaria percebida ou recado? (Opcional)"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                />

                <button type="submit" disabled={isSubmitting} className="w-full h-14 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold rounded-xl text-lg flex items-center justify-center shadow-lg transition-transform active:scale-95 space-x-2">
                    <CheckCircle className="w-6 h-6" /> <span>{isSubmitting ? 'Abrindo o dia…' : (modoFoto ? 'CONFERIR E INICIAR' : 'CONFIRMAR INÍCIO (TUDO CHECADO)')}</span>
                </button>
            </form>
        </div>
    );
};

export default FormVeiculoPresencial;
