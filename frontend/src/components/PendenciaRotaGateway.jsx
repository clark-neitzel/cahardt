import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Calendar, MapPin, User, MessageCircle, Phone, ClipboardList, Package, LogOut, CheckCircle, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import atendimentoService from '../services/atendimentoService';
import ModalAtendimento from '../pages/Rota/ModalAtendimento';
import dataLocalHoje from '../utils/dataLocal';
import toast from 'react-hot-toast';

const FORMAS_ICONS = {
    PRESENCIAL: { icon: User, color: 'purple' },
    WHATSAPP: { icon: MessageCircle, color: 'green' },
    TELEFONE: { icon: Phone, color: 'blue' },
};

const TENTATIVAS_BUSCA = 3;
const TTL_REVALIDACAO_MS = 5 * 60 * 1000; // não rebusca em background mais que 1x/5min (banco compartilhado lento no pico); virada de data ignora o TTL

const PendenciaRotaGateway = () => {
    const { user, signed, logout } = useAuth();
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState(false); // esgotou as tentativas — NÃO libera silenciosamente
    const [retryLoading, setRetryLoading] = useState(false);
    const [pendencia, setPendencia] = useState(null); // { pendente, diasPendentes, diaPendente }
    const [modalAtendimento, setModalAtendimento] = useState(null);
    const [clientesResolvidos, setClientesResolvidos] = useState(new Set());

    const isento = !!(user?.permissoes?.admin || user?.permissoes?.Isento_Ponto);

    // Data (YYYY-MM-DD) da última conferência BEM-SUCEDIDA (qualquer resultado —
    // com ou sem pendência). Vendedor em campo tem sinal ruim: decisão do gerente
    // (09/2026) foi não bloquear quem uma rechecagem de fundo já confirmou hoje —
    // só a 1ª conferência do dia (ou a de virada de dia) pode travar por erro de rede.
    const ultimaDataOkRef = useRef(null);

    const carregarPendencias = useCallback(async ({ manual = false } = {}) => {
        if (!signed || !user?.id) {
            setLoading(false);
            return;
        }
        // Admin/Isento_Ponto pulam tudo, antes de qualquer chamada ao backend
        if (user?.permissoes?.admin || user?.permissoes?.Isento_Ponto) {
            setLoading(false);
            return;
        }

        if (manual) setRetryLoading(true);

        for (let tentativa = 1; tentativa <= TENTATIVAS_BUSCA; tentativa++) {
            try {
                const result = await atendimentoService.buscarPendenciasRota();
                setPendencia(result);
                setClientesResolvidos(new Set());
                setErro(false);
                setLoading(false);
                setRetryLoading(false);
                ultimaDataOkRef.current = dataLocalHoje();
                return;
            } catch (error) {
                console.error(`Erro ao buscar pendências de rota (tentativa ${tentativa}/${TENTATIVAS_BUSCA}):`, error);
                if (tentativa < TENTATIVAS_BUSCA) {
                    await new Promise(resolve => setTimeout(resolve, 900 * tentativa));
                }
            }
        }

        // Esgotou as tentativas. Se já existe uma conferência bem-sucedida para HOJE
        // (mesmo que tenha sido feita horas atrás), não bloqueia por uma falha de rede
        // isolada numa rechecagem de fundo — mantém o estado já confirmado (liberado
        // ou com a lista de pendências já mostrada) e tenta de novo na próxima.
        const hoje = dataLocalHoje();
        if (ultimaDataOkRef.current === hoje) {
            console.warn(`Rechecagem de pendências de rota falhou (${TENTATIVAS_BUSCA} tentativas), mas já havia conferência bem-sucedida hoje (${hoje}) — mantendo o estado atual, sem bloquear.`);
            setErro(false);
            setLoading(false);
            setRetryLoading(false);
            return;
        }

        // Ainda NÃO houve nenhuma conferência bem-sucedida hoje (1ª carga ou logo
        // após a virada do dia): por segurança, NÃO libera silenciosamente — mostra
        // tela de erro com "Tentar novamente" (nunca desloga por erro de rede)
        setErro(true);
        setLoading(false);
        setRetryLoading(false);
    }, [signed, user]);

    // Carga inicial
    useEffect(() => {
        carregarPendencias();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signed, user?.id]);

    // Rebusca ao voltar para o app (visibilitychange/focus — PWA fica dias abertos
    // no celular), respeitando o TTL de 5 min (banco compartilhado lento no pico),
    // e SEMPRE que a data local virar — aí ignora o TTL e rebusca na hora (mesmo com
    // o app em primeiro plano o dia inteiro, checando a cada 30s).
    useEffect(() => {
        if (!signed || isento) return;
        let ultimaChamada = 0;
        let ultimaData = dataLocalHoje();
        const revisar = () => {
            if (document.visibilityState !== 'visible') return;
            const hoje = dataLocalHoje();
            const mudouData = hoje !== ultimaData;
            const passouTtl = Date.now() - ultimaChamada >= TTL_REVALIDACAO_MS;
            if (mudouData || passouTtl) {
                ultimaData = hoje;
                ultimaChamada = Date.now();
                carregarPendencias();
            }
        };
        document.addEventListener('visibilitychange', revisar);
        window.addEventListener('focus', revisar);
        const timer = setInterval(revisar, 30 * 1000);
        return () => {
            document.removeEventListener('visibilitychange', revisar);
            window.removeEventListener('focus', revisar);
            clearInterval(timer);
        };
    }, [signed, isento, carregarPendencias]);

    // Rebusca forçada quando o DiarioGateway leva PENDENCIA_ROTA ao tentar iniciar o dia
    useEffect(() => {
        const handler = () => carregarPendencias();
        window.addEventListener('pendencias-rota:recarregar', handler);
        return () => window.removeEventListener('pendencias-rota:recarregar', handler);
    }, [carregarPendencias]);

    // Callback quando atendimento é salvo
    const handleAtendimentoSalvo = useCallback(() => {
        if (!modalAtendimento) return;
        const clienteId = modalAtendimento.item.UUID;
        setClientesResolvidos(prev => {
            const next = new Set(prev);
            next.add(clienteId);
            return next;
        });
        setModalAtendimento(null);
        toast.success('Atendimento registrado!');
    }, [modalAtendimento]);

    // Verifica se todos foram resolvidos
    useEffect(() => {
        if (!pendencia?.pendente || !pendencia?.diaPendente) return;
        const totalPendentes = pendencia.diaPendente.clientes.length;
        if (clientesResolvidos.size >= totalPendentes) {
            // Todos resolvidos! Recarregar para verificar se há mais dias ou liberar
            toast.success('Todos os clientes do dia foram finalizados!');
            setTimeout(() => window.location.reload(), 1200);
        }
    }, [clientesResolvidos, pendencia]);

    // Não bloqueia se: não logado, admin ou isento
    if (!signed) return null;
    if (isento) return null;

    // Não foi possível confirmar (rede caiu, backend fora) mesmo após 3 tentativas —
    // por segurança NÃO libera silenciosamente; pede para tentar de novo.
    if (erro) {
        return (
            <div className="fixed inset-0 bg-secondary z-[200] flex items-center justify-center p-4 md:p-6">
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-8 w-full max-w-sm text-center">
                    <div className="bg-mint p-3 rounded-full inline-flex mb-4">
                        <WifiOff className="h-6 w-6 text-primary" />
                    </div>
                    <h1 className="text-lg font-bold text-gray-900 mb-2">Não foi possível conferir suas pendências de rota</h1>
                    <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                        Não conseguimos confirmar se há atendimentos pendentes da rota. Verifique sua
                        internet e tente novamente — você continua logado.
                    </p>
                    <button
                        onClick={() => carregarPendencias({ manual: true })}
                        disabled={retryLoading}
                        className="w-full min-h-[44px] px-4 py-3 bg-primary hover:bg-primaryDark disabled:opacity-60 text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center justify-center gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${retryLoading ? 'animate-spin' : ''}`} />
                        {retryLoading ? 'Tentando...' : 'Tentar novamente'}
                    </button>
                    <button
                        onClick={logout}
                        className="w-full min-h-[44px] mt-3 px-4 py-3 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full font-medium text-sm"
                    >
                        Sair e entrar com outra conta
                    </button>
                </div>
            </div>
        );
    }

    if (loading) return null; // Enquanto carrega, não mostra nada (DiarioGateway já mostra loading)

    if (!pendencia?.pendente) return null; // Sem pendências, libera

    const dia = pendencia.diaPendente;
    const dataFormatada = new Date(dia.data + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const clientesPendentes = dia.clientes.filter(c => !clientesResolvidos.has(c.UUID));
    const resolvidos = clientesResolvidos.size;

    return (
        <div className="fixed inset-0 bg-gray-100 z-[200] overflow-y-auto w-full h-full flex flex-col">

            {/* Header fixo */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm">
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6 text-red-500" />
                    <span className="font-bold text-gray-900 text-sm md:text-base">Pendências de Rota</span>
                </div>
                <button onClick={logout} className="text-red-500 hover:text-red-700 flex items-center gap-1 text-sm font-semibold bg-red-50 px-3 py-1.5 rounded-lg">
                    <LogOut className="h-4 w-4" /> Sair
                </button>
            </div>

            {/* Aviso principal */}
            <div className="bg-red-50 border-b border-red-200 px-4 py-4 shrink-0">
                <div className="max-w-2xl mx-auto text-center">
                    <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-2" />
                    <h1 className="text-xl md:text-2xl font-bold text-red-700 mb-1">
                        Atendimentos Pendentes!
                    </h1>
                    <p className="text-red-600 text-sm md:text-base">
                        Você não finalizou os atendimentos da rota de <strong>{dataFormatada}</strong>.
                        <br />Finalize todos os clientes abaixo antes de usar o aplicativo.
                    </p>
                    {pendencia.diasPendentes > 1 && (
                        <p className="text-red-500 text-xs mt-2 font-semibold">
                            Atenção: você tem {pendencia.diasPendentes} dias pendentes. Resolva um dia por vez.
                        </p>
                    )}
                </div>
            </div>

            {/* Progresso */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0">
                <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-gray-600 font-medium flex items-center gap-1.5">
                            <Calendar className="h-4 w-4" />
                            {dia.diaSigla} — {dia.totalClientes} clientes na rota
                        </span>
                        <span className="font-bold text-green-700">
                            {resolvidos}/{dia.clientes.length} resolvidos
                        </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                            className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${dia.clientes.length > 0 ? (resolvidos / dia.clientes.length) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Lista de clientes pendentes */}
            <div className="flex-1 overflow-y-auto px-3 md:px-4 py-4">
                <div className="max-w-2xl mx-auto space-y-2">
                    {clientesPendentes.map(cliente => (
                        <div key={cliente.UUID} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-gray-900 truncate">
                                        {cliente.NomeFantasia || cliente.Nome}
                                    </p>
                                    {cliente.End_Cidade && (
                                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <MapPin className="h-3 w-3" />{cliente.End_Cidade}
                                        </p>
                                    )}
                                </div>
                                {cliente.Ponto_GPS && (
                                    <span className="text-green-500 ml-2" title="Com GPS">
                                        <MapPin className="h-4 w-4" />
                                    </span>
                                )}
                            </div>

                            {/* Formas de atendimento */}
                            {cliente.Formas_Atendimento?.length > 0 && (
                                <div className="flex gap-1.5 mb-3">
                                    {cliente.Formas_Atendimento.map(f => {
                                        const cfg = FORMAS_ICONS[f.toUpperCase()];
                                        if (!cfg) return null;
                                        const Icon = cfg.icon;
                                        return (
                                            <span key={f} className={`text-[11px] bg-${cfg.color}-50 text-${cfg.color}-700 px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5`}>
                                                <Icon className="h-3 w-3" />{f}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Info do dia */}
                            <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
                                <Calendar className="h-3 w-3" />
                                <span>{dia.diaSigla}</span>
                                <span className="mx-1">-</span>
                                <span>Dia de venda: {cliente.Dia_de_venda}</span>
                                {cliente.Dia_de_entrega && (
                                    <>
                                        <span className="mx-1">|</span>
                                        <span>Entrega: {cliente.Dia_de_entrega}</span>
                                    </>
                                )}
                            </div>

                            {/* Botões */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setModalAtendimento({ tipo: 'cliente', item: cliente })}
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold py-2.5 min-h-[44px] rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                                >
                                    <ClipboardList className="h-4 w-4" /> Atender
                                </button>
                                <button
                                    onClick={() => {
                                        // Marca como resolvido e abre pedido
                                        setClientesResolvidos(prev => {
                                            const next = new Set(prev);
                                            next.add(cliente.UUID);
                                            return next;
                                        });
                                        window.open(`/pedidos/novo?clienteId=${cliente.UUID}`, '_blank');
                                    }}
                                    className="bg-white hover:bg-gray-50 text-gray-700 text-[13px] font-semibold py-2.5 px-4 min-h-[44px] rounded-lg flex items-center justify-center gap-1.5 border border-gray-300 transition-colors"
                                >
                                    <Package className="h-4 w-4" /> Pedido
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Clientes já resolvidos */}
                    {resolvidos > 0 && (
                        <div className="mt-4 pt-3 border-t border-gray-200">
                            <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5" /> Resolvidos ({resolvidos})
                            </p>
                            {dia.clientes.filter(c => clientesResolvidos.has(c.UUID)).map(cliente => (
                                <div key={cliente.UUID} className="bg-green-50 rounded-lg border border-green-200 p-2.5 mb-1 opacity-70">
                                    <p className="text-sm text-green-800 font-medium truncate">
                                        <CheckCircle className="h-3.5 w-3.5 inline mr-1" />
                                        {cliente.NomeFantasia || cliente.Nome}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Modal de Atendimento */}
            {modalAtendimento && (
                <ModalAtendimento
                    dados={modalAtendimento}
                    onClose={() => setModalAtendimento(null)}
                    onSalvo={handleAtendimentoSalvo}
                    vendedorId={user?.id}
                    onAbrirAmostra={() => {}}
                />
            )}
        </div>
    );
};

export default PendenciaRotaGateway;
