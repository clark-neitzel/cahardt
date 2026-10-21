import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CheckCircle, Camera, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import CampoNumero from '../CampoNumero';
import checklistVeiculoService from '../../services/checklistVeiculoService';
import ChecklistFotos from './ChecklistFotos';
import ChecklistProblemaTela from './ChecklistProblemaTela';

const TOLERANCIA_KM = 30; // mesma do servidor (REGRAS.kmOk)
const LATERAIS = ['lateral_direita', 'lateral_esquerda'];
// Só entram se o servidor não mandar as laterais na lista da volta
const LATERAIS_FALLBACK = [
    { angulo: 'lateral_direita', rotulo: 'Lateral direita', ordem: 5, grupo: 'FORA', obrigatorio: true },
    { angulo: 'lateral_esquerda', rotulo: 'Lateral esquerda', ordem: 6, grupo: 'FORA', obrigatorio: true },
];

/**
 * Fechamento do dia com fotos de volta (substitui o KM final digitado).
 * Usado no "Finalizar" do dia (DiarioCheckout) e na cortina "pendência de ontem" (DiarioGateway).
 *   diario    = { id, veiculoId, kmInicial, dataReferencia, veiculo: { placa, kmMedioSugerido } }
 *   atrasada  = true quando é o dia anterior (cortina)
 *   onEncerrado = () => void  (depois do POST /diarios/encerrar ok)
 * Se a câmera/rede/IA falhar, o botão "Não consegui tirar as fotos" encerra só com o KM digitado
 * (vira pendência para o escritório). Nada aqui trava o motorista.
 */
const FormVoltaPresencial = ({ diario, atrasada = false, onEncerrado }) => {
    const veiculoId = diario?.veiculoId || diario?.veiculo?.id || null;
    const kmInicial = Number(diario?.kmInicial) || 0;
    const mediaKmDia = diario?.veiculo?.kmMedioSugerido || null;

    const [config, setConfig] = useState(veiculoId ? 'carregando' : 'erro');
    const [rascunhoFalhou, setRascunhoFalhou] = useState(false);
    const [semFotos, setSemFotos] = useState(false);     // escolheu digitar o KM
    const [bateu, setBateu] = useState(null);            // null | true | false
    const [estadoFotos, setEstadoFotos] = useState({ checklistId: null, faltam: 0 });
    const [kmModo, setKmModo] = useState(null);          // null | 'confirmado' | 'corrigir'
    const [kmDigitado, setKmDigitado] = useState('');
    const [obs, setObs] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);    // /avaliar com pergunta aberta
    const [confirmaExcesso, setConfirmaExcesso] = useState(null); // { km, rodado }
    const [confirmaDivergencia, setConfirmaDivergencia] = useState(null); // { km, lido }
    const travaRef = useRef(false);

    useEffect(() => {
        if (!veiculoId) return undefined;
        let cancelado = false;
        setConfig('carregando');
        checklistVeiculoService.config(veiculoId, 'VOLTA')
            .then(c => { if (!cancelado) setConfig(c); })
            .catch(err => {
                console.error('Checklist da volta: falha ao ler a configuração, KM digitado', err);
                if (!cancelado) setConfig('erro');
            });
        return () => { cancelado = true; };
    }, [veiculoId]);

    const configOk = config && typeof config === 'object';
    const slotsBase = configOk ? (config.slots || []) : [];
    const modoFoto = !!(configOk && config.modo !== 'DESLIGADO' && slotsBase.length > 0 && !rascunhoFalhou && !semFotos);
    const carregando = config === 'carregando';

    // Laterais só entram se a pessoa disse que bateu/raspou
    const configVolta = useMemo(() => {
        if (!configOk) return config;
        const semLaterais = slotsBase.filter(s => !LATERAIS.includes(s.angulo));
        if (bateu !== true) return { ...config, slots: semLaterais };
        const doServidor = slotsBase.filter(s => LATERAIS.includes(s.angulo)).map(s => ({ ...s, obrigatorio: true }));
        const extras = doServidor.length ? doServidor : LATERAIS_FALLBACK;
        return { ...config, slots: [...semLaterais, ...extras] };
    }, [config, configOk, slotsBase, bateu]);

    const rotulos = Object.fromEntries((configVolta?.slots || []).map(s => [s.angulo, s.rotulo]));

    const kmLido = modoFoto && Number.isFinite(estadoFotos.kmLido) ? estadoFotos.kmLido : null;
    const kmLidoOk = kmLido != null && kmLido >= kmInicial;
    const kmLidoMenor = kmLido != null && kmLido < kmInicial;
    const mostraCartaoKm = modoFoto && kmLidoOk && kmModo !== 'corrigir';
    // rascunho criado depois da resposta: grava o que já foi respondido
    useEffect(() => {
        if (estadoFotos.checklistId && bateu !== null) {
            checklistVeiculoService.atualizar(estadoFotos.checklistId, { bateuOuRaspou: bateu }).catch(() => {});
        }
    }, [estadoFotos.checklistId]); // eslint-disable-line react-hooks/exhaustive-deps
    // foto do painel refeita: a confirmação anterior não vale mais
    useEffect(() => { setKmModo(null); }, [estadoFotos.kmLidoRev]);

    const kmFinalEscolhido = () => (mostraCartaoKm && kmModo === 'confirmado' ? kmLido : parseInt(kmDigitado, 10));

    const encerrar = async (km, checklistId) => {
        const prefixo = !checklistId && bateu === true ? '[Bateu ou raspou em algo hoje: sim] ' : '';
        const obsFinal = `${prefixo}${obs}`.trim();
        try {
            await api.post('/diarios/encerrar', {
                diarioId: diario.id,
                kmFinal: km,
                obsFinal,
                ...(checklistId ? { checklistId } : {}),
            });
            toast.success(atrasada ? 'Dia anterior encerrado. Obrigado!' : 'Dia encerrado. Bom descanso!');
            await onEncerrado?.();
            return true;
        } catch (error) {
            const dados = error.response?.data;
            if (dados?.codigo === 'KM_DIVERGE_DO_PAINEL') {
                toast.error(dados.error || 'O KM não bate com o painel da foto. Confira o número.');
                setKmModo('corrigir');
            } else {
                toast.error(dados?.error || 'Erro ao finalizar o dia');
            }
            return false;
        }
    };

    // Confirmações de uma tentativa de encerrar (cada uma aparece uma vez só)
    const feitoRef = useRef({ div: false, exc: false });
    const excessoServidorRef = useRef(false);

    const seguirDepoisDasPerguntas = async () => {
        if (travaRef.current) return;
        setResultado(null); // volta ao formulário, onde aparecem os avisos de KM
        await prosseguir(kmFinalEscolhido());
    };

    // Confere divergência com o painel e excesso de KM; depois encerra
    const prosseguir = async (km) => {
        const rodado = km - kmInicial;
        const excesso = excessoServidorRef.current === true || !!(mediaKmDia && rodado > mediaKmDia * 1.5);
        if (excesso && !feitoRef.current.exc) { setConfirmaExcesso({ km, rodado }); return; }
        if (travaRef.current) return;
        travaRef.current = true;
        setEnviando(true);
        try {
            const ok = await encerrar(km, modoFoto ? estadoFotos.checklistId : null);
            if (!ok) setResultado(null);
        } finally {
            travaRef.current = false;
            setEnviando(false);
        }
    };

    const confirmarExcessoENviar = async () => {
        const km = confirmaExcesso?.km;
        feitoRef.current.exc = true;
        setConfirmaExcesso(null);
        await prosseguir(km);
    };

    const entregarAssim = async () => {
        if (travaRef.current) return;
        const km = confirmaDivergencia?.km;
        feitoRef.current.div = true;
        setConfirmaDivergencia(null);
        await executar(km);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (travaRef.current || enviando) return;
        feitoRef.current = { div: false, exc: false };
        excessoServidorRef.current = false;
        const km = semFotos || !modoFoto ? parseInt(kmDigitado, 10) : kmFinalEscolhido();

        if (modoFoto) {
            if (bateu === null) return toast.error('Responda: bateu ou raspou em algo hoje?');
            if (estadoFotos.faltam > 0) return toast.error(`Faltam ${estadoFotos.faltam} ${estadoFotos.faltam === 1 ? 'foto' : 'fotos'}. Tire as fotos ou toque em "Não consegui tirar as fotos".`);
            if (mostraCartaoKm && kmModo !== 'confirmado') return toast.error('Confirme o KM do painel ou toque em Corrigir.');
        }
        if (!Number.isFinite(km) || km < 0) return toast.error('Informe o KM final.');
        if (km < kmInicial) return toast.error(`O KM final não pode ser menor que o da saída (${kmInicial.toLocaleString('pt-BR')}).`);

        const lido = modoFoto && kmLido != null ? kmLido : null;
        if (lido != null && Math.abs(km - lido) > TOLERANCIA_KM) { setConfirmaDivergencia({ km, lido }); return; }
        await executar(km);
    };

    // Grava origem do KM, confere com a IA e encerra
    const executar = async (km) => {
        if (travaRef.current) return;
        if (modoFoto && estadoFotos.checklistId) {
            travaRef.current = true;
            setEnviando(true);
            let r = null;
            try {
                try {
                    await checklistVeiculoService.atualizar(estadoFotos.checklistId, {
                        kmDigitado: km, kmOrigem: mostraCartaoKm && kmModo === 'confirmado' ? 'PAINEL_CONFIRMADO' : 'DIGITADO',
                        ...(bateu !== null ? { bateuOuRaspou: bateu } : {}),
                    });
                } catch (err) { console.error('Volta: não gravou a origem do KM, seguindo', err); }
                try {
                    r = await checklistVeiculoService.avaliar(estadoFotos.checklistId, km);
                } catch (err) { console.error('Volta: falha ao avaliar, seguindo sem veredito', err); }
            } finally {
                travaRef.current = false;
                setEnviando(false);
            }
            excessoServidorRef.current = r?.kmExcessivo === true;
            const temPergunta = Array.isArray(r?.problemas) && r.problemas.some(p => p.gravidade === 'PERGUNTA' && !p.resposta);
            if (temPergunta) { setResultado(r); return; }
            await prosseguir(km);
            return;
        }
        await prosseguir(km);
    };

    const responderBateu = (valor) => {
        setBateu(valor);
        if (estadoFotos.checklistId) {
            checklistVeiculoService.atualizar(estadoFotos.checklistId, { bateuOuRaspou: valor }).catch(() => {});
        }
    };

    const escolherSemFotos = () => {
        if (!window.confirm('Encerrar só com o KM digitado? O escritório vai ver que ficou sem as fotos.')) return;
        setSemFotos(true);
        setResultado(null);
        setKmModo(null);
    };

    if (resultado) {
        return (
            <div className="space-y-4">
                <ChecklistProblemaTela
                    volta
                    resultado={resultado}
                    rotulos={rotulos}
                    seguindo={enviando}
                    checklistId={estadoFotos.checklistId}
                    onAtualizar={setResultado}
                    onCorrigir={() => setResultado(null)}
                    onSeguir={seguirDepoisDasPerguntas}
                />
            </div>
        );
    }

    const kmRodados = (() => {
        const km = semFotos || !modoFoto ? parseInt(kmDigitado, 10) : kmFinalEscolhido();
        return Number.isFinite(km) && kmInicial ? km - kmInicial : 0;
    })();
    const faltaFoto = modoFoto && estadoFotos.faltam > 0;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-mint/60 p-3 rounded-xl flex items-center justify-between text-primaryDark border border-primary/20">
                <span className="text-sm font-medium">Você saiu com{diario?.veiculo?.placa ? ` (${diario.veiculo.placa})` : ''}:</span>
                <span className="font-mono text-lg font-bold">{kmInicial.toLocaleString('pt-BR')} <span className="text-xs">KM</span></span>
            </div>

            {carregando && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin" /> Preparando as fotos de volta...
                </div>
            )}

            {!carregando && !modoFoto && (
                <p className="flex items-start gap-1.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>{semFotos ? 'Sem fotos hoje: digite o KM do painel. O escritório vai ficar sabendo.' : 'As fotos de volta não estão disponíveis agora. Digite o KM do painel para encerrar.'}</span>
                </p>
            )}

            {modoFoto && (
                <>
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                        <p className="text-base font-bold text-gray-900">Bateu ou raspou em algo hoje?</p>
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <button type="button" aria-pressed={bateu === false} onClick={() => responderBateu(false)}
                                className={`min-h-[44px] rounded-full font-semibold text-sm border ${bateu === false ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary hover:bg-mint/40'}`}>
                                Não
                            </button>
                            <button type="button" aria-pressed={bateu === true} onClick={() => responderBateu(true)}
                                className={`min-h-[44px] rounded-full font-semibold text-sm border ${bateu === true ? 'bg-primary text-white border-primary' : 'bg-white text-primary border-primary hover:bg-mint/40'}`}>
                                Sim
                            </button>
                        </div>
                        {bateu === true && (
                            <p className="text-xs text-gray-600 mt-2">Então tire também as fotos das laterais e conte o que houve nas ocorrências.</p>
                        )}
                    </div>

                    <ChecklistFotos
                        key={veiculoId}
                        veiculoId={veiculoId}
                        config={configVolta}
                        momento="VOLTA"
                        diarioId={diario.id}
                        atrasada={atrasada}
                        onEstado={setEstadoFotos}
                        onFalha={() => setRascunhoFalhou(true)}
                    />
                </>
            )}

            {/* KM final */}
            {!carregando && (
                <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-gray-600 mb-1">KM final do painel *</label>
                    {mostraCartaoKm ? (
                        <div className={`rounded-xl border p-3 ${kmModo === 'confirmado' ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'}`}>
                            {kmModo === 'confirmado' ? (
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-bold text-green-900 flex items-center gap-1.5">
                                        <CheckCircle className="h-5 w-5" /> KM confirmado: {kmLido.toLocaleString('pt-BR')} km
                                    </p>
                                    <button type="button" onClick={() => setKmModo('corrigir')}
                                        className="min-h-[44px] px-3 text-xs font-medium text-primary underline">Corrigir</button>
                                </div>
                            ) : (
                                <>
                                    <p className="text-base font-bold text-gray-900">Painel marca {kmLido.toLocaleString('pt-BR')} km. Confirma?</p>
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <button type="button" onClick={() => {
                                            setKmModo('confirmado');
                                            setKmDigitado(String(kmLido));
                                            if (estadoFotos.checklistId) checklistVeiculoService.atualizar(estadoFotos.checklistId, { kmDigitado: kmLido, kmOrigem: 'PAINEL_CONFIRMADO' }).catch(() => {});
                                        }}
                                            className="min-h-[44px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm">Confirma</button>
                                        <button type="button" onClick={() => setKmModo('corrigir')}
                                            className="min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-sm">Corrigir</button>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <>
                            {kmLidoMenor && (
                                <p className="mb-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-3 py-2">
                                    Painel marca {kmLido.toLocaleString('pt-BR')} km, menos que a saída ({kmInicial.toLocaleString('pt-BR')}). Digite o KM certo.
                                </p>
                            )}
                            {modoFoto && !kmLidoMenor && kmLido == null && (
                                <p className="mb-2 text-xs text-gray-600">Tire a foto do painel. O KM aparece aqui para você confirmar.</p>
                            )}
                            <CampoNumero
                                className="block w-full rounded-md border border-gray-300 bg-gray-50 focus:bg-white text-center text-3xl font-mono h-14 font-bold focus:border-primary focus:ring-1 focus:ring-primary"
                                value={kmDigitado}
                                onChange={(e) => setKmDigitado(e.target.value)}
                                placeholder="00000"
                                min={kmInicial}
                            />
                            <div className="flex justify-between mt-1">
                                <p className="text-xs text-gray-600">Igual ou maior que a saída.</p>
                                {kmRodados > 0 && (
                                    <p className="text-xs font-bold text-gray-600">+{kmRodados.toLocaleString('pt-BR')} km rodados</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {!carregando && (
                <div>
                    <label className="block text-sm font-medium text-gray-700">Ocorrências do dia (opcional)</label>
                    <textarea
                        className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm focus:border-primary focus:ring-1 focus:ring-primary text-sm bg-gray-50 p-3"
                        rows="2"
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                        placeholder="Teve algum problema com o carro, trânsito ou multas?"
                    />
                </div>
            )}

            {!carregando && (
                <div className="space-y-2 pt-1">
                    <button type="submit" disabled={enviando}
                        className="w-full min-h-[52px] bg-primary hover:bg-primaryDark disabled:opacity-50 text-white font-bold rounded-full text-base flex items-center justify-center gap-2 shadow-sm">
                        {enviando ? 'Encerrando…' : (modoFoto ? 'CONFERIR E ENTREGAR O VEÍCULO' : 'ENTREGAR O VEÍCULO')}
                    </button>
                    {faltaFoto && (
                        <p className="text-xs text-center text-amber-800">Faltam {estadoFotos.faltam} {estadoFotos.faltam === 1 ? 'foto' : 'fotos'} para encerrar com as fotos.</p>
                    )}
                    {modoFoto && (
                        <button type="button" onClick={escolherSemFotos}
                            className="w-full min-h-[48px] bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full text-sm font-medium inline-flex items-center justify-center gap-2">
                            <Camera className="h-4 w-4" /> Não consegui tirar as fotos, digitar o KM
                        </button>
                    )}
                </div>
            )}

            {confirmaDivergencia && (
                <div className="fixed inset-0 bg-gray-900/80 z-[130] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
                        <div className="flex flex-col items-center text-amber-600">
                            <AlertTriangle className="w-12 h-12 mb-2" />
                            <h3 className="text-lg font-bold text-gray-900 text-center">O KM não bate com o painel</h3>
                        </div>
                        <p className="text-sm text-center text-gray-700">
                            O painel marca <strong>{confirmaDivergencia.lido.toLocaleString('pt-BR')}</strong> e você digitou <strong>{confirmaDivergencia.km.toLocaleString('pt-BR')}</strong>. Tem certeza?
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => { setConfirmaDivergencia(null); setKmModo('corrigir'); }}
                                className="min-h-[48px] border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-sm">Voltar e corrigir</button>
                            <button type="button" onClick={entregarAssim} disabled={enviando}
                                className="min-h-[48px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm disabled:opacity-50">Entregar assim</button>
                        </div>
                    </div>
                </div>
            )}

            {confirmaExcesso && (
                <div className="fixed inset-0 bg-gray-900/80 z-[130] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
                        <div className="flex flex-col items-center text-amber-600">
                            <AlertTriangle className="w-12 h-12 mb-2" />
                            <h3 className="text-lg font-bold text-gray-900 text-center">KM acima da média</h3>
                        </div>
                        <p className="text-gray-600 text-sm text-center">
                            Foram <strong className="text-gray-900">{confirmaExcesso.rodado.toLocaleString('pt-BR')} km</strong> hoje.
                            A média deste veículo é de <strong>{mediaKmDia} km/dia</strong>.
                        </p>
                        <p className="text-sm text-center text-gray-700 font-medium">
                            Confirma que o odômetro <strong>{confirmaExcesso.km.toLocaleString('pt-BR')} km</strong> está certo?
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => { setConfirmaExcesso(null); setKmModo('corrigir'); }}
                                className="min-h-[48px] border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-sm">Corrigir KM</button>
                            <button type="button" onClick={confirmarExcessoENviar} disabled={enviando}
                                className="min-h-[48px] bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm disabled:opacity-50">Sim, confirmo</button>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
};

export default FormVoltaPresencial;
