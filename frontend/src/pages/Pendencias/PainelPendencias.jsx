import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertTriangle, RefreshCw, PartyPopper, ArrowRight, AlertCircle } from 'lucide-react';
import pendenciasService from '../../services/pendenciasService';
import PageHeader from '../../components/PageHeader';
import EstadoVazio from '../../components/EstadoVazio';

// CENTRAL DE PENDÊNCIAS — agrega em uma tela só o que hoje só aparece abrindo
// Pedidos, Notas Fiscais, Caixa, Notas Recebidas, PCP e Tarefas separadamente.
// Contrato do endpoint: backend/docs/pendencias-api.md.
// Cor do módulo escolhida ÂMBAR (não vermelho): a tela mistura pendências de
// severidade variada — várias são avisos informativos, não emergência — e o
// vermelho já é a cor de "vencido"/erro dentro dos próprios blocos (regra do
// CLAUDE.md: nunca mudar a cor semântica dos badges). Usar vermelho no ícone do
// cabeçalho faria a tela parecer alarme mesmo com poucas pendências.

const fmtMoeda = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const fmtData = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('pt-BR');
    } catch {
        return '';
    }
};

// Ordem de exibição por severidade: vermelho → âmbar → cinza (regra do pedido).
const ORDEM_SEVERIDADE = { vermelho: 0, ambar: 1, cinza: 2 };

const SEVERIDADE_ESTILO = {
    vermelho: { pill: 'bg-red-100 text-red-700', barra: 'border-l-4 border-l-red-400' },
    ambar: { pill: 'bg-amber-100 text-amber-700', barra: 'border-l-4 border-l-amber-400' },
    cinza: { pill: 'bg-gray-100 text-gray-700', barra: 'border-l-4 border-l-gray-300' },
};

const KpiCard = ({ titulo, valor, cor = 'text-gray-900' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{titulo}</div>
        <div className={`text-lg md:text-2xl font-bold mt-1 ${cor}`}>{valor}</div>
    </div>
);

const SkeletonBloco = () => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse">
        <div className="h-3 w-40 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
            <div className="h-10 bg-gray-100 rounded" />
            <div className="h-10 bg-gray-100 rounded" />
        </div>
    </div>
);

// Uma linha (item) de um bloco: título/subtítulo/valor + botão de ação (1 clique
// quando o item traz `acao`, senão "Abrir" leva para a tela original).
const LinhaPendencia = ({ item, onExecutarAcao, executando, navigate }) => {
    const valor = item.valor != null ? fmtMoeda(item.valor) : null;
    const data = fmtData(item.dataRef);
    return (
        <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{item.titulo}</p>
                <p className="text-xs text-gray-500 truncate">
                    {item.subtitulo}
                    {item.subtitulo && data ? ' · ' : ''}
                    {data}
                </p>
            </div>
            {valor && <span className="text-sm font-semibold text-gray-700 whitespace-nowrap hidden sm:inline">{valor}</span>}
            {item.acao ? (
                <button
                    type="button"
                    disabled={executando}
                    onClick={() => onExecutarAcao(item)}
                    className="px-3 py-2 bg-primary hover:bg-primaryDark text-white rounded-full text-xs font-semibold whitespace-nowrap disabled:opacity-50 min-h-[44px]"
                >
                    {executando ? '...' : item.acao.label}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={() => item.rota && navigate(item.rota)}
                    className="px-3 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full text-xs font-medium whitespace-nowrap min-h-[44px]"
                >
                    Abrir
                </button>
            )}
        </div>
    );
};

const BlocoPendencia = ({ bloco, onExecutarAcao, executandoId, navigate }) => {
    if (bloco.erro) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-2 text-xs text-gray-500">
                <AlertCircle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                Não foi possível carregar "{bloco.titulo}" agora. Os outros blocos continuam normais.
            </div>
        );
    }
    if (!bloco.contador) return null; // bloco vazio some

    const estilo = SEVERIDADE_ESTILO[bloco.severidade] || SEVERIDADE_ESTILO.cinza;

    return (
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${estilo.barra}`}>
            <div className="flex items-center gap-2 px-4 md:px-5 py-3.5 border-b border-gray-100">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600 flex-1 truncate">{bloco.titulo}</span>
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${estilo.pill}`}>{bloco.contador}</span>
            </div>
            <div className="px-4 md:px-5 py-1">
                {(bloco.itens || []).map((item) => (
                    <LinhaPendencia
                        key={item.id}
                        item={item}
                        navigate={navigate}
                        executando={executandoId === item.id}
                        onExecutarAcao={onExecutarAcao}
                    />
                ))}
            </div>
            {bloco.contador > (bloco.itens || []).length && bloco.rotaVerTodos && (
                <button
                    type="button"
                    onClick={() => navigate(bloco.rotaVerTodos)}
                    className="w-full text-left px-4 md:px-5 py-2.5 text-xs font-semibold text-primary hover:text-primaryDark border-t border-gray-100 flex items-center gap-1"
                >
                    ver todos ({bloco.contador}) <ArrowRight className="h-3 w-3" />
                </button>
            )}
        </div>
    );
};

export default function PainelPendencias() {
    const navigate = useNavigate();
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [atualizando, setAtualizando] = useState(false);
    const [executandoId, setExecutandoId] = useState(null);

    const carregar = useCallback(async (silencioso = false) => {
        if (silencioso) setAtualizando(true); else setCarregando(true);
        try {
            const r = await pendenciasService.listar(5);
            setDados(r);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao carregar a Central de Pendências.');
        } finally {
            setCarregando(false);
            setAtualizando(false);
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    const executarAcao = async (item) => {
        setExecutandoId(item.id);
        try {
            await pendenciasService.executarAcao(item.acao);
            toast.success('Feito!');
            await carregar(true);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Não foi possível concluir a ação.');
        } finally {
            setExecutandoId(null);
        }
    };

    const blocosOrdenados = (dados?.blocos || [])
        .slice()
        .sort((a, b) => (ORDEM_SEVERIDADE[a.severidade] ?? 9) - (ORDEM_SEVERIDADE[b.severidade] ?? 9));

    const semNadaPendente = dados && !carregando && (dados.totais?.total || 0) === 0
        && !blocosOrdenados.some(b => b.erro);

    return (
        <div className="max-w-full overflow-x-hidden">
            <PageHeader
                icon={AlertTriangle}
                cor="amber"
                titulo="Central de Pendências"
                subtitulo={dados ? `${dados.totais?.total ?? 0} pendência(s) esperando um clique` : 'O que está esperando o escritório/gerência'}
                acoes={
                    <button
                        type="button"
                        onClick={() => carregar(true)}
                        disabled={atualizando}
                        className="px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm disabled:opacity-50 min-h-[44px] flex items-center gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${atualizando ? 'animate-spin' : ''}`} />
                        Atualizar
                    </button>
                }
            />

            <div className="p-3 md:p-6 pt-0 space-y-4">
                {carregando ? (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-pulse h-16" />
                            ))}
                        </div>
                        <SkeletonBloco />
                        <SkeletonBloco />
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <KpiCard titulo="Total de pendências" valor={dados?.totais?.total ?? 0} />
                            <KpiCard titulo="Dinheiro parado" valor={fmtMoeda(dados?.totais?.dinheiroParado)} cor="text-amber-700" />
                            <KpiCard titulo="Vencidas" valor={dados?.totais?.vencidas ?? 0} cor={Number(dados?.totais?.vencidas) > 0 ? 'text-red-700' : 'text-gray-900'} />
                            <KpiCard titulo="Avisos" valor={dados?.totais?.avisos ?? 0} cor="text-amber-700" />
                        </div>

                        {semNadaPendente ? (
                            <EstadoVazio
                                icon={PartyPopper}
                                titulo="Nada pendente 🎉"
                                descricao="Não há nada esperando um clique agora. Toque em Atualizar para conferir de novo mais tarde."
                            />
                        ) : (
                            <div className="space-y-3">
                                {blocosOrdenados.map(bloco => (
                                    <BlocoPendencia
                                        key={bloco.chave}
                                        bloco={bloco}
                                        navigate={navigate}
                                        executandoId={executandoId}
                                        onExecutarAcao={executarAcao}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
