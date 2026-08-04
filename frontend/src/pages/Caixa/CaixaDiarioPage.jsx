import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import caixaService from '../../services/caixaService';
import { Link, useNavigate } from 'react-router-dom';
import {
    Wallet, Truck, Fuel, Package, CheckCircle, AlertTriangle,
    Lock, Printer, ClipboardCheck, ChevronDown, ChevronUp, ReceiptText, Plus, Undo2, FlaskConical, Edit3, RotateCcw, Home, MapPin, DollarSign, Loader2, RefreshCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import NovaDespesaModal from './NovaDespesaModal';
import VeiculoFicha from '../Veiculos/VeiculoFicha';
import ModalDevolucao from '../Pedidos/ModalDevolucao';
import SelectBusca from '../../components/SelectBusca';
import ConferenciaDevolucaoCard from './ConferenciaDevolucaoCard';
import ConferenciaDinheiroCard from './ConferenciaDinheiroCard';
import CobrancasRotaCard from './CobrancasRotaCard';

const SESSION_KEY = '@CAHardt:CaixaFiltros';

// Selo de GPS da entrega: só um emoji ao lado do cliente (📍✅ concluída no ponto ·
// 📍❗ concluída longe do ponto cadastrado · 📍➖ sem GPS na hora · 📍❓ cliente sem
// ponto). Tocar mostra o detalhe com a distância.
const fmtDistancia = (m) => m == null ? '' : (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
const SeloGps = ({ selo }) => {
    if (!selo?.status) return null;
    const mapa = {
        NO_PONTO: { emoji: '📍✅', texto: `Entrega concluída no ponto do cliente${selo.distanciaM != null ? ` (a ${fmtDistancia(selo.distanciaM)} do cadastro)` : ''}.` },
        FORA: { emoji: '📍❗', texto: `Atenção: entrega concluída a ${fmtDistancia(selo.distanciaM)} do ponto cadastrado do cliente.` },
        SEM_GPS: { emoji: '📍➖', texto: 'O aparelho do motorista não informou GPS ao concluir esta entrega.' },
        SEM_PONTO: { emoji: '📍❓', texto: 'Este cliente ainda não tem ponto GPS cadastrado.' },
    };
    const info = mapa[selo.status];
    if (!info) return null;
    return (
        <button
            type="button"
            onClick={() => toast(info.texto, { duration: 5000, icon: info.emoji.slice(0, 2) })}
            title={info.texto}
            className="text-[13px] leading-none shrink-0"
        >
            {info.emoji}
        </button>
    );
};

const STATUS_BADGES = {
    ABERTO: { label: 'Aberto', class: 'bg-green-100 text-green-800' },
    FECHADO: { label: 'Fechado', class: 'bg-yellow-100 text-yellow-800' },
    CONFERIDO: { label: 'Conferido', class: 'bg-blue-100 text-blue-800' },
    // Passos da conferência do dinheiro (só aparecem com a regra ligada)
    A_CONFERIR: { label: 'A conferir', class: 'bg-amber-100 text-amber-700' },
    A_FECHAR: { label: 'A fechar', class: 'bg-mint text-primaryDark' }
};

const CaixaDiarioPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.permissoes?.admin || user?.permissoes?.Pode_Editar_Caixa;
    // Permissão específica para definir adiantamento (admin ou quem tiver a flag)
    const podeDefinirAdiantamento = user?.permissoes?.admin
        || user?.permissoes?.Pode_Editar_Caixa
        || user?.permissoes?.Pode_Definir_Adiantamento;
    // Permissão para ver caixas de outros dias (sem essa flag, o usuário vê APENAS hoje)
    const podeVerHistorico = user?.permissoes?.admin
        || user?.permissoes?.Pode_Editar_Caixa
        || user?.permissoes?.Pode_Ver_Historico_Caixa;
    const podeReverter = user?.permissoes?.admin || user?.permissoes?.Pode_Reverter_Caixa;

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    // Restaurar filtros da sessão se existirem
    const restoreSession = () => {
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (saved) return JSON.parse(saved);
        } catch { }
        return null;
    };

    const session = restoreSession();
    // Vindo da agenda ("Conferir"/"Fechar" de um caixa): a URL manda o dia e a pessoa.
    const urlParams = new URLSearchParams(window.location.search);
    const dataUrl = urlParams.get('data');
    const vendedorUrl = urlParams.get('vendedorId');
    // Se pode ver histórico, restaura data salva; caso contrário, sempre hoje
    const [data, setData] = useState(
        podeVerHistorico ? (dataUrl || session?.data || today) : today
    );
    const [vendedorId, setVendedorId] = useState(
        // Não-admin: SEMPRE o próprio user.id — nunca restaura da sessão
        // Admin (ou quem veio da agenda conferir/fechar): usa o da URL/sessão
        isAdmin ? (vendedorUrl || session?.vendedorId || '')
            : (vendedorUrl && podeVerHistorico ? vendedorUrl : (user?.id || ''))
    );
    const [vendedores, setVendedores] = useState([]);
    const [resumo, setResumo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [adiantamento, setAdiantamento] = useState('');
    const [savingAdiantamento, setSavingAdiantamento] = useState(false);
    const [expandedEntregas, setExpandedEntregas] = useState(false);
    const [expandedAmostras, setExpandedAmostras] = useState(false);
    const [expandedAtendimentos, setExpandedAtendimentos] = useState(false);
    const [obsAdmin, setObsAdmin] = useState('');
    const [showDespesaModal, setShowDespesaModal] = useState(false);
    const [veiculoFichaId, setVeiculoFichaId] = useState(null);
    const [editandoKm, setEditandoKm] = useState(false);
    const [kmInicialEdit, setKmInicialEdit] = useState('');
    // Baixa CA
    const podeBaixarCaixa = user?.permissoes?.admin || user?.permissoes?.Pode_Editar_Caixa || user?.permissoes?.Pode_Baixar_Caixa;
    const [selectedBaixa, setSelectedBaixa] = useState(new Set());
    const [quitandoCA, setQuitandoCA] = useState(false);
    // Fechar Caixa
    const podeFecharCaixa = user?.permissoes?.admin || user?.permissoes?.Pode_Editar_Caixa || user?.permissoes?.Pode_Fechar_Caixa;
    // Devolução
    const podeFazerDevolucao = user?.permissoes?.admin || user?.permissoes?.Pode_Fazer_Devolucao;
    const [modalDevolucao, setModalDevolucao] = useState(null); // { pedidoId, ... }

    // Persistir filtros na sessão sempre que mudarem
    useEffect(() => {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ data, vendedorId }));
    }, [data, vendedorId]);

    // Seletor de vendedor: só ativos; inativo aparece apenas se teve movimento no dia escolhido
    useEffect(() => {
        if (isAdmin && data) {
            caixaService.getVendedoresDoDia(data).then(res => setVendedores(res || [])).catch(() => { });
        }
    }, [isAdmin, data]);

    useEffect(() => {
        if (vendedorId && data) fetchResumo();
    }, [vendedorId, data]);

    const fetchResumo = async () => {
        try {
            setLoading(true);
            const res = await caixaService.getResumo(data, vendedorId);
            // Sábado/domingo não têm caixa: o dia cai no caixa da segunda seguinte.
            if (res?.diaSemCaixa && res.dataSugerida) {
                toast(res.mensagem || 'Sábado e domingo não têm caixa.', { icon: '📅', duration: 6000 });
                setData(res.dataSugerida);
                return;
            }
            setResumo(res);
            setAdiantamento(String(res.caixa?.adiantamento || '0'));
        } catch (error) {
            console.error('Erro ao buscar resumo:', error);
            toast.error('Erro ao carregar caixa.');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAdiantamento = async () => {
        const novoValor = parseFloat(adiantamento) || 0;
        const valorAtual = Number(resumo?.caixa?.adiantamento || 0);

        // Diminuir/zerar um adiantamento já lançado exige confirmação explícita
        // (caso real: R$ 200 zerados sem querer no fechamento do dia 16/07)
        if (valorAtual > 0 && novoValor < valorAtual) {
            const quem = resumo?.caixa?.adiantamentoPorNome ? ` (lançado por ${resumo.caixa.adiantamentoPorNome})` : '';
            const msg = novoValor === 0
                ? `EXCLUIR o adiantamento de R$ ${valorAtual.toFixed(2)}${quem}?\n\nO motorista deixará de dever esse valor no caixa.`
                : `O adiantamento atual é R$ ${valorAtual.toFixed(2)}${quem}.\n\nTem certeza que deseja DIMINUIR para R$ ${novoValor.toFixed(2)}?`;
            if (!confirm(msg)) {
                setAdiantamento(String(valorAtual));
                return;
            }
        }

        try {
            setSavingAdiantamento(true);
            await caixaService.setAdiantamento({ vendedorId, data, valor: novoValor });
            toast.success('Adiantamento atualizado!');
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao salvar adiantamento.', { duration: 7000 });
        } finally {
            setSavingAdiantamento(false);
        }
    };

    const handleFechar = async () => {
        // Verificar entregas pendentes de baixa/alteração no CA
        const pendentes = resumo?.entregas?.filter(isElegivelBaixa) || [];
        if (pendentes.length > 0) {
            const lista = pendentes.map(e => `#${e.numero} ${e.clienteNome}`).join(', ');
            toast.error(`${pendentes.length} baixa(s) de dinheiro pendente(s):\n${lista}`, { duration: 8000 });
            return;
        }

        // Alerta (não bloqueante) sobre assinaturas não conferidas
        const naoConferidas = resumo?.entregas?.filter(e => !e.conferido) || [];
        if (naoConferidas.length > 0) {
            const msg = `${naoConferidas.length} entrega(s) sem conferência de assinatura. Deseja fechar mesmo assim?`;
            if (!confirm(msg)) return;
        } else {
            if (!confirm('Fechar o caixa do dia? Isso salvará os totais atuais.')) return;
        }

        try {
            await caixaService.fecharCaixa({ vendedorId, data });
            toast.success('Caixa fechado!');
            fetchResumo();
        } catch (error) {
            const resp = error.response?.data;
            if (resp?.pendencias?.length > 0) {
                toast.error(resp.pendencias.join('\n'), { duration: 8000 });
            } else {
                toast.error(resp?.error || 'Erro ao fechar caixa.');
            }
        }
    };

    const handleConferir = async () => {
        if (!confirm('Confirmar conferência deste caixa?')) return;
        try {
            await caixaService.conferirCaixa({ id: resumo.caixa.id, obsAdmin });
            toast.success('Caixa conferido!');
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao conferir.');
        }
    };

    const handleToggleEntregaConferida = async (pedidoId, conferido) => {
        try {
            await caixaService.conferirEntrega({ caixaId: resumo.caixa.id, pedidoId, conferido });
            fetchResumo();
        } catch (error) {
            toast.error('Erro ao marcar entrega.');
        }
    };

    const handleReverterConferencia = async () => {
        if (!confirm('Reverter a conferência deste caixa? O status voltará para FECHADO.')) return;
        try {
            await caixaService.reverterConferencia(resumo.caixa.id);
            toast.success('Conferência revertida!');
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reverter conferência.');
        }
    };

    const handleReabrirCaixa = async () => {
        // Caixa fechado não se altera: reabrir exige motivo e devolve o caixa
        // para quem confere o dinheiro (a conferência anterior perde a validade).
        const exigeConf = !!resumo?.conferenciaDinheiro?.exigida;
        let motivo = null;
        if (exigeConf) {
            motivo = window.prompt(
                'Reabrir o caixa cancela a conferência do dinheiro — ele volta para quem confere.\n\nMotivo da reabertura:'
            );
            if (motivo === null) return;
            if (!motivo.trim()) { toast.error('Informe o motivo da reabertura.'); return; }
        } else if (!confirm('Reabrir este caixa? O status voltará para ABERTO e os totais serão recalculados ao fechar novamente.')) {
            return;
        }
        try {
            await caixaService.reabrirCaixa(resumo.caixa.id, motivo);
            toast.success(exigeConf ? 'Caixa reaberto — voltou para conferência do dinheiro.' : 'Caixa reaberto!');
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reabrir caixa.');
        }
    };

    // Imprimir a folha = prestação de contas: manda o caixa para a fila de
    // conferência do dinheiro. 2ª via não reenvia (idempotente no backend).
    const handleImprimir = async () => {
        const conf = resumo?.conferenciaDinheiro;
        const irParaImpressao = () => navigate(`/caixa/impressao?data=${data}&vendedorId=${vendedorId}`);

        if (!conf || conf.conferido || conf.enviadoEm) { irParaImpressao(); return; }

        const enviar = window.confirm(
            'Ao imprimir, este caixa vai para a conferência do dinheiro.\n\n' +
            'OK = imprimir e enviar para conferência\n' +
            'Cancelar = só imprimir (2ª via, não envia)'
        );
        if (enviar) {
            try {
                await caixaService.enviarParaConferencia({ vendedorId: vendedorId || user?.id, data, origem: 'IMPRESSAO' });
                toast.success('Caixa enviado para conferência do dinheiro.');
            } catch (e) {
                // Impressão nunca pode ser bloqueada por isso
                console.error('Falha ao enviar para conferência:', e);
            }
        }
        irParaImpressao();
    };

    // Abre a lista de entregas e rola até ela (usado pelos avisos de pendência,
    // para o usuário achar o botão "Devolução" sem procurar)
    const irParaEntregas = () => {
        setExpandedEntregas(true);
        setTimeout(() => {
            document.getElementById('card-entregas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    };

    // Verifica se uma entrega é elegível para baixa/condição no CA:
    // - dinheiro/pix/cartão → cria baixa ou altera condição
    // - vendedor/escritório responsável (só para pedidos CA) → altera forma para OUTRO
    // Pedidos especiais com Vend/Escr Resp não aparecem (não estão no CA, é fiado local)
    const isElegivelBaixa = (entrega) => {
        if (entrega.statusEntrega === 'DEVOLVIDO') return false;
        if (entrega.quitado === 'QUITADO' || entrega.quitado === 'ALTERADO') return false;
        const n = (p) => (p.formaNome || '').toLowerCase();
        return entrega.pagamentos?.some(p => {
            if (p.vendedorResponsavelId || p.escritorioResponsavel) {
                return !entrega.especial; // só CA precisa de alteração
            }
            return n(p).includes('dinheiro') || n(p).includes('pix') || n(p).includes('cartão') || n(p).includes('cartao');
        });
    };

    const handleToggleBaixa = (pedidoId) => {
        setSelectedBaixa(prev => {
            const next = new Set(prev);
            if (next.has(pedidoId)) next.delete(pedidoId);
            else next.add(pedidoId);
            return next;
        });
    };

    const handleSelectAllDinheiro = () => {
        if (!resumo?.entregas) return;
        const dinheiroIds = resumo.entregas.filter(isElegivelBaixa).map(e => e.pedidoId);
        setSelectedBaixa(prev => {
            const allSelected = dinheiroIds.length > 0 && dinheiroIds.every(id => prev.has(id));
            if (allSelected) return new Set();
            return new Set(dinheiroIds);
        });
    };

    const handleQuitarCA = async () => {
        if (selectedBaixa.size === 0) {
            toast.error('Selecione ao menos uma entrega para quitar.');
            return;
        }
        const ids = Array.from(selectedBaixa);
        const nomes = resumo.entregas?.filter(e => ids.includes(e.pedidoId)).map(e => e.clienteNome).join(', ');
        if (!confirm(`Quitar ${ids.length} entrega(s) no Conta Azul (caixinha)?\n\n${nomes}`)) return;

        try {
            setQuitandoCA(true);
            const result = await caixaService.quitarCA(ids, data);
            const ok = result.resultados?.filter(r => r.status === 'OK') || [];
            const erros = result.resultados?.filter(r => r.status === 'ERRO') || [];
            const jaQuitados = result.resultados?.filter(r => r.status === 'JA_QUITADO') || [];

            if (ok.length > 0) toast.success(`${ok.length} baixa(s) criada(s) no CA!`);
            if (jaQuitados.length > 0) toast.success(`${jaQuitados.length} já quitada(s).`);
            if (erros.length > 0) {
                erros.forEach(e => toast.error(`${e.cliente}: ${e.erro}`, { duration: 6000 }));
            }

            setSelectedBaixa(new Set());
            fetchResumo();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao quitar no CA.');
        } finally {
            setQuitandoCA(false);
        }
    };

    if (!vendedorId && !isAdmin) {
        return (
            <div className="w-full px-4 py-6 text-center text-gray-500">
                Nenhum vendedor vinculado a este usuário.
            </div>
        );
    }

    const caixa = resumo?.caixa;
    // Com a conferência do dinheiro ligada, o selo mostra o passo real do dia
    // (A CONFERIR / A FECHAR) em vez de só "Aberto".
    const estadoConf = resumo?.conferenciaDinheiro?.estado;
    const statusBadge = caixa
        ? (resumo?.conferenciaDinheiro?.ativa && STATUS_BADGES[estadoConf])
            || STATUS_BADGES[caixa.status] || STATUS_BADGES.ABERTO
        : null;
    const isAberto = caixa?.status === 'ABERTO';
    // Dia "pronto" = KM/entregas/atendimentos OK + conferência de devoluções feita.
    // Só então mostramos o VALOR A PRESTAR e liberamos a impressão (senão o pessoal
    // pulava a conferência e imprimia com o valor). A nota de devolução do faturamento
    // (devolucoesNaoFeitas) segue travando apenas o Fechar Caixa, como sempre foi.
    const diaPronto = resumo
        && !resumo.finalizacaoDia?.precisaFinalizar
        && !resumo.pendencias?.conferenciaDevolucaoPendente;

    return (
        <div className="w-full px-4 py-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div className="flex items-center space-x-3">
                    <Wallet className="h-7 w-7 text-amber-600" />
                    <h1 className="text-2xl font-bold text-gray-800">Caixa Diário</h1>
                    {statusBadge && (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusBadge.class}`}>
                            {statusBadge.label}
                        </span>
                    )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <input
                        type="date"
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        disabled={!podeVerHistorico}
                        max={!podeVerHistorico ? today : undefined}
                        className={`border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm bg-white text-gray-900 ${!podeVerHistorico ? 'opacity-60 cursor-not-allowed' : ''
                            }`}
                        title={!podeVerHistorico ? 'Você só pode visualizar o caixa do dia atual.' : ''}
                    />
                    {isAdmin && (
                        <SelectBusca
                            value={vendedorId}
                            onChange={(e) => setVendedorId(e.target.value)}
                        >
                            <option value="">Selecione vendedor...</option>
                            {vendedores.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.ativo === false ? `${v.nome} (inativo · teve caixa)` : v.nome}
                                </option>
                            ))}
                        </SelectBusca>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
                    Carregando caixa...
                </div>
            ) : !resumo ? (
                <div className="text-center text-gray-400 py-20">Selecione vendedor e data para abrir o caixa.</div>
            ) : (
                <div className="space-y-6">
                    {/* Card Header: Veículo + Adiantamento + Média */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Veículo / Diário */}
                        <div
                            className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${resumo.diario?.veiculoId ? 'cursor-pointer hover:border-sky-300 hover:bg-sky-50/40' : ''}`}
                            onClick={() => resumo.diario?.veiculoId && setVeiculoFichaId(resumo.diario.veiculoId)}
                            title={resumo.diario?.veiculoId ? 'Abrir resumo do veículo' : ''}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                    <Truck className="h-5 w-5 text-sky-600" />
                                    <h3 className="text-sm font-semibold text-gray-700">Diário do Dia</h3>
                                </div>
                                {resumo.diario?.modo && (
                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                        resumo.diario.modo === 'PRESENCIAL'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {resumo.diario.modo === 'PRESENCIAL'
                                            ? <><MapPin className="h-3 w-3" /> Presencial</>
                                            : <><Home className="h-3 w-3" /> Home Office</>
                                        }
                                    </span>
                                )}
                            </div>
                            {resumo.diario ? (
                                <div className="text-sm text-gray-600">
                                    {resumo.diario.placa ? (
                                        <p className="font-medium text-gray-900">{resumo.diario.placa} — {resumo.diario.modelo}</p>
                                    ) : (
                                        <p className="text-gray-400 italic text-xs">Sem veículo (Home Office)</p>
                                    )}
                                    {resumo.diario.modo === 'PRESENCIAL' && (
                                        <>
                                            {editandoKm ? (
                                                <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                                                    <input type="number" className="w-24 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                                                        value={kmInicialEdit} onChange={e => setKmInicialEdit(e.target.value)} autoFocus />
                                                    <button className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700"
                                                        onClick={async () => {
                                                            try {
                                                                await api.put(`/diarios/${resumo.diario.id}/km`, { kmInicial: parseInt(kmInicialEdit) });
                                                                toast.success('KM inicial atualizado!');
                                                                setEditandoKm(false);
                                                                fetchResumo();
                                                            } catch (e) { toast.error(e.response?.data?.error || 'Erro ao salvar KM.'); }
                                                        }}>OK</button>
                                                    <button className="text-xs text-gray-500 hover:text-gray-700" onClick={() => setEditandoKm(false)}>✕</button>
                                                </div>
                                            ) : (
                                                <p className="text-xs mt-1">
                                                    KM: {resumo.diario.kmInicial || '—'} → {resumo.diario.kmFinal || '—'}
                                                    {resumo.diario.totalKm > 0 && <span className="ml-1 font-medium">({resumo.diario.totalKm} km)</span>}
                                                    {isAdmin && resumo.diario.id && (
                                                        <button className="ml-2 text-indigo-500 hover:text-indigo-700" title="Editar KM inicial"
                                                            onClick={(e) => { e.stopPropagation(); setKmInicialEdit(String(resumo.diario.kmInicial || '')); setEditandoKm(true); }}>
                                                            <Edit3 className="h-3 w-3 inline" />
                                                        </button>
                                                    )}
                                                </p>
                                            )}
                                        </>
                                    )}
                                    {resumo.diario.veiculoId && (
                                        <p className="text-[11px] text-sky-700 mt-2">Clique para ver Resumo, Documentos e Manutenção</p>
                                    )}
                                    {isAdmin && resumo.diario.id && (
                                        <button
                                            className="mt-2 inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                                            title="Apagar diário para que o vendedor possa iniciar novamente"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!confirm('Reiniciar o diário deste vendedor? Ele precisará escolher o modo novamente (Home Office / Presencial).')) return;
                                                try {
                                                    await api.delete(`/diarios/${resumo.diario.id}`);
                                                    toast.success('Diário reiniciado! O vendedor poderá escolher o modo novamente.');
                                                    fetchResumo();
                                                } catch (err) {
                                                    toast.error(err.response?.data?.error || 'Erro ao reiniciar diário.');
                                                }
                                            }}
                                        >
                                            <RotateCcw className="h-3 w-3" /> Reiniciar Diário
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400">Sem diário iniciado no dia</p>
                            )}
                        </div>

                        {/* Adiantamento */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-2">Adiantamento (R$)</h3>
                            {podeDefinirAdiantamento ? (
                                <>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={adiantamento}
                                        onChange={(e) => setAdiantamento(e.target.value)}
                                        disabled={!isAberto}
                                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm disabled:bg-gray-100 bg-white text-gray-900"
                                    />
                                    {isAberto && (
                                        <button
                                            onClick={handleSaveAdiantamento}
                                            disabled={savingAdiantamento}
                                            className="px-3 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                                        >
                                            {savingAdiantamento ? '...' : 'Salvar'}
                                        </button>
                                    )}
                                </div>
                                {Number(resumo.caixa?.adiantamento || 0) > 0 && resumo.caixa?.adiantamentoPorNome && (
                                    <p className="text-xs text-gray-500 mt-1.5">
                                        Lançado por {resumo.caixa.adiantamentoPorNome}
                                        {resumo.caixa.adiantamentoEm ? ` · ${new Date(resumo.caixa.adiantamentoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${new Date(resumo.caixa.adiantamentoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                    </p>
                                )}
                                </>
                            ) : (
                                // Sem permissão: apenas exibe o valor, sem editar
                                <div className="flex items-center space-x-2">
                                    <p className="text-2xl font-bold text-gray-900">
                                        R$ {Number(resumo.caixa?.adiantamento || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">somente leitura</span>
                                </div>
                            )}
                        </div>

                        {/* Média Combustível */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <div className="flex items-center space-x-2 mb-2">
                                <Fuel className="h-5 w-5 text-orange-500" />
                                <h3 className="text-sm font-semibold text-gray-700">Média Combustível (3 meses)</h3>
                            </div>
                            <p className="text-2xl font-bold text-gray-900">
                                {resumo.mediaCombustivel3Meses ? `${resumo.mediaCombustivel3Meses.toFixed(2)} km/L` : '—'}
                            </p>
                        </div>
                    </div>

                    {/* Card Despesas */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                                <ReceiptText className="h-5 w-5 text-red-500" />
                                <h3 className="text-sm font-semibold text-gray-700">Despesas do Dia</h3>
                            </div>
                            <div className="flex items-center space-x-3">
                                <button
                                    onClick={() => setShowDespesaModal(true)}
                                    className="inline-flex items-center text-xs px-2 py-1 bg-primary text-white rounded font-medium hover:bg-blue-700"
                                >
                                    <Plus className="h-3 w-3 mr-1" /> Nova Despesa
                                </button>
                                <Link
                                    to={`/despesas?data=${data}&vendedorId=${vendedorId}&from=caixa`}
                                    className="text-xs text-primary hover:underline"
                                >
                                    Ver todas →
                                </Link>
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-red-600">
                            R$ {Number(resumo.totalDespesas || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{resumo.despesas?.length || 0} lançamentos</p>
                    </div>

                    {/* Card Entregas */}
                    <div id="card-entregas" className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                                <Package className="h-5 w-5 text-green-600" />
                                <h3 className="text-sm font-semibold text-gray-700">Entregas do Dia</h3>
                            </div>
                            <button
                                onClick={() => setExpandedEntregas(!expandedEntregas)}
                                className="text-xs text-gray-500 flex items-center hover:text-gray-700"
                            >
                                {expandedEntregas ? 'Recolher' : 'Expandir'}
                                {expandedEntregas ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                            </button>
                        </div>

                        {/* Contagens */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            <div className="text-center p-2 bg-gray-50 rounded">
                                <p className="text-lg font-bold text-gray-900">{resumo.contagens?.totalEntregas || 0}</p>
                                <p className="text-xs text-gray-500">Total</p>
                            </div>
                            <div className="text-center p-2 bg-green-50 rounded">
                                <p className="text-lg font-bold text-green-700">{resumo.contagens?.entregues || 0}</p>
                                <p className="text-xs text-green-600">Entregues</p>
                            </div>
                            <div className="text-center p-2 bg-yellow-50 rounded">
                                <p className="text-lg font-bold text-yellow-700">{resumo.contagens?.parciais || 0}</p>
                                <p className="text-xs text-yellow-600">Parciais</p>
                            </div>
                            <div className="text-center p-2 bg-red-50 rounded">
                                <p className="text-lg font-bold text-red-700">{resumo.contagens?.devolvidos || 0}</p>
                                <p className="text-xs text-red-600">Devolvidos</p>
                            </div>
                        </div>

                        {/* Totais Recebidos */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                <p className="text-xs text-green-600 font-medium">Recebido (Caixa)</p>
                                <p className="text-lg font-bold text-green-800">
                                    R$ {Number(resumo.totalRecebidoCaixa || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-xs text-blue-600 font-medium">Recebido (Outros)</p>
                                <p className="text-lg font-bold text-blue-800">
                                    R$ {Number(resumo.totalRecebidoOutros || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        {/* Lista de Entregas Expandida */}
                        {expandedEntregas && resumo.entregas && (
                            <div className="border-t border-gray-200 pt-4">
                                {/* Barra de seleção para baixa CA */}
                                {podeBaixarCaixa && (
                                    <div className="flex flex-wrap items-center gap-2 mb-3 p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                                        <DollarSign className="h-4 w-4 text-indigo-600" />
                                        <span className="text-xs font-medium text-indigo-700">Baixa CA:</span>
                                        <button
                                            onClick={handleSelectAllDinheiro}
                                            className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 font-medium"
                                        >
                                            {selectedBaixa.size > 0 ? 'Limpar Seleção' : 'Selecionar À Vista'}
                                        </button>
                                        {selectedBaixa.size > 0 && (
                                            <button
                                                onClick={handleQuitarCA}
                                                disabled={quitandoCA}
                                                className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-medium disabled:opacity-50 flex items-center gap-1"
                                            >
                                                {quitandoCA ? <Loader2 className="h-3 w-3 animate-spin" /> : <DollarSign className="h-3 w-3" />}
                                                Processar {selectedBaixa.size} selecionada(s)
                                            </button>
                                        )}
                                        {selectedBaixa.size > 0 && (
                                            <span className="text-xs text-indigo-500">{selectedBaixa.size} selecionada(s)</span>
                                        )}
                                    </div>
                                )}

                                {/* Desktop (>= md) */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50/50">
                                                {isAdmin && <th className="py-2 px-2 text-center w-10">✓</th>}
                                                {podeBaixarCaixa && <th className="py-2 px-2 text-center w-10" title="Selecionar para baixa CA">CA</th>}
                                                <th className="py-2 px-2 text-left w-14">Nº</th>
                                                <th className="py-2 px-2 text-left">Cliente</th>
                                                <th className="py-2 px-2 text-left hidden lg:table-cell whitespace-nowrap">Cond. Pgto</th>
                                                <th className="py-2 px-2 text-right whitespace-nowrap">Valor</th>
                                                <th className="py-2 px-2 text-center w-28 whitespace-nowrap">Status</th>
                                                <th className="py-2 px-2 text-left">Pagamentos</th>
                                                <th className="py-2 px-2 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {resumo.entregas.map((e) => {
                                                const elegivel = isElegivelBaixa(e);
                                                const podeDev = podeFazerDevolucao && ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada;
                                                return (
                                                <tr key={e.pedidoId} className={`hover:bg-gray-50 align-top ${selectedBaixa.has(e.pedidoId) ? 'bg-indigo-50' : ''}`}>
                                                    {isAdmin && (
                                                        <td className="py-2 px-2 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={!!e.conferida}
                                                                onChange={(ev) => handleToggleEntregaConferida(e.pedidoId, ev.target.checked)}
                                                                className="h-4 w-4 text-green-600 rounded"
                                                            />
                                                        </td>
                                                    )}
                                                    {podeBaixarCaixa && (
                                                        <td className="py-2 px-2 text-center">
                                                            {elegivel && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedBaixa.has(e.pedidoId)}
                                                                    onChange={() => handleToggleBaixa(e.pedidoId)}
                                                                    className="h-4 w-4 rounded text-indigo-600"
                                                                    title="Selecionar para baixa (dinheiro)"
                                                                />
                                                            )}
                                                        </td>
                                                    )}
                                                    <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{e.numero}</td>
                                                    <td className="py-2 px-2 font-medium text-gray-900 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <SeloGps selo={e.seloGps} />
                                                            <span className="truncate max-w-[180px] lg:max-w-[280px]" title={e.clienteNome}>{e.clienteNome}</span>
                                                            {e.especial && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">ESP.</span>}
                                                            {e.quitado === 'QUITADO' && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">QUIT.</span>}
                                                            {e.quitado === 'PARCIAL' && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">PARC.</span>}
                                                            {e.quitado === 'ALTERADO' && <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">ALT.</span>}
                                                            {e.devolucaoFinalizada && <span className="text-[10px] font-bold text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">DEV.</span>}
                                                        </div>
                                                        <div className="lg:hidden text-xs text-gray-400 mt-0.5 truncate" title={e.condicaoPagamento}>{e.condicaoPagamento}</div>
                                                    </td>
                                                    <td className="py-2 px-2 text-gray-500 hidden lg:table-cell whitespace-nowrap">{e.condicaoPagamento}</td>
                                                    <td className="py-2 px-2 text-right font-medium tabular-nums whitespace-nowrap">
                                                        R$ {Number(e.valorPedido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="py-2 px-2 text-center whitespace-nowrap">
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${e.statusEntrega === 'ENTREGUE' ? 'bg-green-100 text-green-700' :
                                                            e.statusEntrega === 'PARCIAL' ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-red-100 text-red-700'
                                                            }`}>
                                                            {e.statusEntrega}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-2 text-xs text-gray-500">
                                                        <div className="flex flex-col gap-0.5">
                                                            {e.pagamentos?.map((p, i) => (
                                                                <span key={i} className={`tabular-nums ${p.debitaCaixa ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                                                                    {p.formaNome}: R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            ))}
                                                            {e.valorDevolvido > 0 && (
                                                                <span className="text-red-500 font-medium tabular-nums">
                                                                    Devolvido: R$ {Number(e.valorDevolvido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-2 px-2 text-right">
                                                        {podeDev && (
                                                            <button
                                                                onClick={() => setModalDevolucao(e)}
                                                                className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded border border-red-200 whitespace-nowrap"
                                                            >
                                                                Devolução
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile (< md) */}
                                <div className="md:hidden space-y-2">
                                    {resumo.entregas.map((e) => {
                                        const podeDev = podeFazerDevolucao && ['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(e.statusEntrega) && !e.devolucaoFinalizada;
                                        const elegivel = isElegivelBaixa(e);
                                        return (
                                        <div key={e.pedidoId} className={`rounded-lg p-3 border ${selectedBaixa.has(e.pedidoId) ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200'}`}>
                                            {/* Linha 1: nº + nome + valor */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1 text-sm">
                                                        <span className="text-gray-400 font-mono">#{e.numero}</span>
                                                        <SeloGps selo={e.seloGps} />
                                                        <span className="font-medium text-gray-900 truncate" title={e.clienteNome}>{e.clienteNome}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-0.5 truncate">{e.condicaoPagamento}</p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="font-bold text-gray-900 text-sm tabular-nums whitespace-nowrap">
                                                        R$ {Number(e.valorPedido || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${e.statusEntrega === 'ENTREGUE' ? 'bg-green-100 text-green-700' :
                                                        e.statusEntrega === 'PARCIAL' ? 'bg-yellow-100 text-yellow-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                        {e.statusEntrega}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Badges */}
                                            {(e.especial || e.quitado || e.devolucaoFinalizada) && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {e.especial && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">ESPECIAL</span>}
                                                    {e.quitado === 'QUITADO' && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">QUITADO</span>}
                                                    {e.quitado === 'PARCIAL' && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">PARCIAL</span>}
                                                    {e.quitado === 'ALTERADO' && <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">ALTERADO</span>}
                                                    {e.devolucaoFinalizada && <span className="text-[10px] font-bold text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">DEV. FEITA</span>}
                                                </div>
                                            )}

                                            {/* Pagamentos */}
                                            {(e.pagamentos?.length > 0 || e.valorDevolvido > 0) && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {e.pagamentos?.map((p, i) => (
                                                        <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded tabular-nums ${p.debitaCaixa ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-100 text-gray-500'}`}>
                                                            {p.formaNome}: R$ {Number(p.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    ))}
                                                    {e.valorDevolvido > 0 && (
                                                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium tabular-nums">
                                                            Devolvido: R$ {Number(e.valorDevolvido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Ações */}
                                            {(isAdmin || (podeBaixarCaixa && elegivel) || podeDev) && (
                                                <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-gray-100">
                                                    <div className="flex items-center gap-3 text-xs">
                                                        {isAdmin && (
                                                            <label className="flex items-center gap-1 text-gray-600">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!e.conferida}
                                                                    onChange={(ev) => handleToggleEntregaConferida(e.pedidoId, ev.target.checked)}
                                                                    className="h-4 w-4 text-green-600 rounded"
                                                                />
                                                                Conferir
                                                            </label>
                                                        )}
                                                        {podeBaixarCaixa && elegivel && (
                                                            <label className="flex items-center gap-1 text-indigo-700">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedBaixa.has(e.pedidoId)}
                                                                    onChange={() => handleToggleBaixa(e.pedidoId)}
                                                                    className="h-4 w-4 text-indigo-600 rounded"
                                                                />
                                                                Baixa CA
                                                            </label>
                                                        )}
                                                    </div>
                                                    {podeDev && (
                                                        <button
                                                            onClick={() => setModalDevolucao(e)}
                                                            className="text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded border border-red-200 whitespace-nowrap"
                                                        >
                                                            Fazer Devolução
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Card Conferência de Devoluções (aparece só quando o dia tem devolução) */}
                    <ConferenciaDevolucaoCard
                        key={`${data}-${vendedorId}-${resumo.conferenciaDevolucao?.status || ''}-${(resumo.entregas || []).reduce((s, e) => s + (e.itensDevolvidos?.length || 0), 0)}`}
                        data={data}
                        vendedorId={vendedorId}
                        caixaStatus={caixa?.status}
                        podeReverter={podeReverter}
                        onChanged={fetchResumo}
                    />

                    {/* Card Conferência do DINHEIRO — quem recebe o dinheiro conta e assina.
                        Sem essa assinatura o caixa não fecha (com a regra ligada). */}
                    <ConferenciaDinheiroCard
                        conferencia={resumo.conferenciaDinheiro}
                        vendedorId={vendedorId || user?.id}
                        vendedorNome={vendedores.find(v => v.id === (vendedorId || user?.id))?.nome || user?.nome}
                        data={data}
                        valorAPrestar={resumo.valorAPrestar}
                        caixaStatus={caixa?.status}
                        onAtualizar={fetchResumo}
                    />

                    {/* Card Cobranças da Rota (títulos cobrados na rua — baixa pelo box) */}
                    <CobrancasRotaCard
                        cobrancas={resumo.cobrancasRota}
                        podeBaixar={podeBaixarCaixa && isAberto}
                        onChanged={fetchResumo}
                    />

                    {/* Card Títulos recebidos — baixa manual de Contas a Receber em espécie.
                        O dinheiro ficou com quem baixou, então entra no "a prestar" deste caixa. */}
                    {(resumo.recebimentosTitulos?.itens?.length > 0) && (
                        <div className="bg-white rounded-lg shadow-sm border border-green-200 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-2">
                                    <DollarSign className="h-5 w-5 text-green-600" />
                                    <h3 className="text-sm font-semibold text-gray-700">Títulos Recebidos</h3>
                                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                        {resumo.recebimentosTitulos.itens.length}
                                    </span>
                                </div>
                                <span className="text-sm font-bold text-green-700">
                                    R$ {Number(resumo.recebimentosTitulos.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">
                                Baixas em dinheiro/cheque feitas em Contas a Receber. O valor entra no que você tem a prestar.
                            </p>
                            <div className="space-y-2">
                                {resumo.recebimentosTitulos.itens.map(r => (
                                    <div key={r.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{r.clienteNome}</p>
                                            <p className="text-xs text-gray-500">
                                                {r.pedidoNumero ? `Pedido #${r.pedidoNumero} · ` : ''}
                                                {r.numeroParcela ? `Parcela ${r.numeroParcela}` : 'Parcela'}
                                                {r.formaPagamento ? ` · ${r.formaPagamento}` : ''}
                                            </p>
                                        </div>
                                        <span className="text-sm font-bold text-gray-900 whitespace-nowrap tabular-nums">
                                            R$ {Number(r.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Card Amostras */}
                    {(resumo.amostrasCount > 0) && (
                        <div className="bg-white rounded-lg shadow-sm border border-orange-200 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-2">
                                    <FlaskConical className="h-5 w-5 text-orange-500" />
                                    <h3 className="text-sm font-semibold text-gray-700">Amostras Entregues</h3>
                                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                        {resumo.amostrasCount}
                                    </span>
                                    <span className="text-xs text-gray-400">(sem valor financeiro)</span>
                                </div>
                                <button
                                    onClick={() => setExpandedAmostras(!expandedAmostras)}
                                    className="text-xs text-gray-500 flex items-center hover:text-gray-700"
                                >
                                    {expandedAmostras ? 'Recolher' : 'Expandir'}
                                    {expandedAmostras ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                                </button>
                            </div>

                            {expandedAmostras && resumo.amostras && (
                                <div className="border-t border-orange-100 pt-3 space-y-2">
                                    {resumo.amostras.map((am) => (
                                        <div key={am.id} className="bg-orange-50 rounded-lg p-3 border border-orange-100">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-medium text-gray-900 text-sm">
                                                        AM#{am.numero} — {am.destinatario}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        Solicitado por: {am.vendedorNome}
                                                    </p>
                                                    {am.itens && am.itens.length > 0 && (
                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                            {am.itens.map((item, i) => (
                                                                <span key={i} className="text-xs bg-white text-orange-700 px-1.5 py-0.5 rounded border border-orange-200">
                                                                    {item.nome} × {item.quantidade}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                    ENTREGUE
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Card Atendimentos + Pedidos do Vendedor */}
                    {(() => {
                        const ats = resumo.atendimentos || [];
                        const peds = resumo.pedidosVendedor || [];
                        const linhas = [
                            ...ats.map(a => ({ ...a, _origem: 'atendimento' })),
                            ...peds.map(p => ({
                                tipo: 'PEDIDO',
                                clienteNome: p.clienteNome,
                                observacao: p.observacao,
                                detalhe: p.bonificacao ? `BN#${p.numero || '—'}` : p.especial ? `ZZ#${p.numero || '—'}` : `#${p.numero || '—'}`,
                                cancelado: p.cancelado,
                                hora: p.createdAt,
                                _origem: 'pedido'
                            }))
                        ].sort((a, b) => new Date(a.hora) - new Date(b.hora));

                        return (
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center space-x-2">
                                        <ClipboardCheck className="h-5 w-5 text-indigo-600" />
                                        <h3 className="text-sm font-semibold text-gray-700">Atendimentos do Dia</h3>
                                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                                            {linhas.length}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setExpandedAtendimentos(!expandedAtendimentos)}
                                        className="text-xs text-gray-500 flex items-center hover:text-gray-700"
                                    >
                                        {expandedAtendimentos ? 'Recolher' : 'Expandir'}
                                        {expandedAtendimentos ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                                    </button>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div className="text-center p-2 bg-indigo-50 rounded">
                                        <p className="text-lg font-bold text-indigo-700">{ats.length}</p>
                                        <p className="text-xs text-indigo-600">Atendimentos</p>
                                    </div>
                                    <div className="text-center p-2 bg-blue-50 rounded">
                                        <p className="text-lg font-bold text-blue-700">{peds.length}</p>
                                        <p className="text-xs text-blue-600">Pedidos</p>
                                    </div>
                                    <div className="text-center p-2 bg-red-50 rounded">
                                        <p className="text-lg font-bold text-red-700">{(resumo.clientesNaoAtendidos || []).length}</p>
                                        <p className="text-xs text-red-600">Não atendidos</p>
                                    </div>
                                </div>

                                {expandedAtendimentos && linhas.length > 0 && (
                                    <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                                        {linhas.map((l, i) => (
                                            <div
                                                key={i}
                                                className={`rounded-lg p-2.5 border text-sm ${
                                                    l._origem === 'pedido'
                                                        ? 'bg-blue-50 border-blue-200'
                                                        : (l.tipo === 'LEAD_NOVO' || l.leadNome)
                                                            ? 'bg-yellow-50 border-yellow-200'
                                                            : 'bg-gray-50 border-gray-200'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-[10px] font-bold bg-white px-1.5 py-0.5 rounded border">
                                                                {l.tipo}
                                                            </span>
                                                            <span className="font-medium text-gray-900 truncate">
                                                                {l.clienteNome || l.leadNome || '—'}
                                                            </span>
                                                            {l.detalhe && (
                                                                <span className={`text-xs font-semibold ${l.cancelado ? 'line-through text-gray-400' : 'text-blue-700'}`}>{l.detalhe}</span>
                                                            )}
                                                            {l.cancelado && (
                                                                <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">CANCELADO</span>
                                                            )}
                                                            {l.canal && (
                                                                <span className="text-xs text-gray-500">Canal: {l.canal}</span>
                                                            )}
                                                            {l.vendedorNome && !l.registradoPeloCaixaOwner && (
                                                                <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">por {l.vendedorNome}</span>
                                                            )}
                                                        </div>
                                                        {l.observacao && (
                                                            <p className="text-xs text-gray-600 mt-1">{l.observacao}</p>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-gray-500 whitespace-nowrap">
                                                        {l.hora ? new Date(l.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {expandedAtendimentos && linhas.length === 0 && (
                                    <div className="border-t border-gray-200 pt-3 mt-3 text-center text-xs text-gray-400 italic">
                                        Nenhum atendimento registrado no dia.
                                    </div>
                                )}

                                {expandedAtendimentos && (resumo.clientesNaoAtendidos || []).length > 0 && (
                                    <div className="border-t border-gray-200 pt-3 mt-3">
                                        <p className="text-xs font-semibold text-red-700 mb-2">
                                            Clientes do dia NÃO atendidos ({resumo.clientesNaoAtendidos.length})
                                        </p>
                                        <div className="space-y-1.5">
                                            {resumo.clientesNaoAtendidos.map((c) => (
                                                <div key={c.clienteId} className="flex items-center justify-between bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                                                    <span className="text-sm font-medium text-gray-900 truncate">{c.clienteNome}</span>
                                                    <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap ml-2">{c.diaVenda}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {/* VALOR A PRESTAR — escondido enquanto o dia não estiver "certo" (inclui conferir devoluções) */}
                    {!diaPronto ? (
                        <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-6">
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <AlertTriangle className="h-5 w-5 text-orange-600" />
                                <p className="text-sm font-bold text-orange-800 uppercase tracking-wide text-center">
                                    Falta para fechar o dia
                                </p>
                            </div>
                            <p className="text-xs text-orange-700 text-center mb-4">
                                O valor a prestar aparece assim que o dia estiver certo.
                            </p>
                            <ul className="space-y-2 max-w-sm mx-auto">
                                {resumo.finalizacaoDia.kmFinalFaltando && (
                                    <li className="flex items-center gap-3 bg-white border border-orange-200 rounded-lg px-4 py-3">
                                        <Truck className="h-5 w-5 text-orange-500 flex-shrink-0" />
                                        <span className="text-sm font-medium text-gray-800">Informar o KM final do veículo</span>
                                    </li>
                                )}
                                {resumo.finalizacaoDia.entregasPendentes > 0 && (
                                    <li className="flex items-center gap-3 bg-white border border-orange-200 rounded-lg px-4 py-3">
                                        <Package className="h-5 w-5 text-orange-500 flex-shrink-0" />
                                        <span className="text-sm font-medium text-gray-800">
                                            {resumo.finalizacaoDia.entregasPendentes} entrega{resumo.finalizacaoDia.entregasPendentes > 1 ? 's' : ''} pendente{resumo.finalizacaoDia.entregasPendentes > 1 ? 's' : ''}
                                        </span>
                                    </li>
                                )}
                                {resumo.finalizacaoDia?.atendimentosPendentes > 0 && (
                                    <li className="flex items-center gap-3 bg-white border border-orange-200 rounded-lg px-4 py-3">
                                        <MapPin className="h-5 w-5 text-orange-500 flex-shrink-0" />
                                        <span className="text-sm font-medium text-gray-800">
                                            {resumo.finalizacaoDia.atendimentosPendentes} cliente{resumo.finalizacaoDia.atendimentosPendentes > 1 ? 's' : ''} da rota sem atendimento
                                        </span>
                                    </li>
                                )}
                                {resumo.pendencias?.devolucoesNaoFeitas > 0 && (
                                    <li>
                                        <button
                                            onClick={irParaEntregas}
                                            className="w-full flex items-center gap-3 bg-white border border-orange-200 rounded-lg px-4 py-3 hover:bg-orange-100/60 hover:border-orange-300 text-left min-h-[44px]"
                                        >
                                            <Undo2 className="h-5 w-5 text-orange-500 flex-shrink-0" />
                                            <span className="text-sm font-medium text-gray-800">
                                                Registrar {resumo.pendencias.devolucoesNaoFeitas} devolução(ões) nas entregas
                                                <span className="block text-xs font-normal text-orange-600 mt-0.5">Toque aqui — abre as entregas; use o botão vermelho "Devolução" na linha</span>
                                            </span>
                                            <ChevronDown className="h-4 w-4 text-orange-400 ml-auto flex-shrink-0" />
                                        </button>
                                    </li>
                                )}
                                {resumo.pendencias?.conferenciaDevolucaoPendente && (
                                    <li className="flex items-center gap-3 bg-white border border-orange-200 rounded-lg px-4 py-3">
                                        <Package className="h-5 w-5 text-orange-500 flex-shrink-0" />
                                        <span className="text-sm font-medium text-gray-800">Conferir a devolução (contar a mercadoria que voltou)</span>
                                    </li>
                                )}
                            </ul>
                        </div>
                    ) : (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-6">
                        <p className="text-sm font-medium text-amber-700 mb-1 text-center">VALOR A PRESTAR</p>
                        <p className="text-4xl font-black text-amber-900 text-center">
                            R$ {Number(resumo.valorAPrestar || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>

                        {/* Detalhamento */}
                        <div className="mt-4 border-t border-amber-200 pt-3 space-y-1 text-sm">
                            {Number(resumo.caixa?.adiantamento || 0) > 0 && (
                                <div className="flex justify-between text-green-700">
                                    <span>+ Adiantamento</span>
                                    <span className="font-medium">R$ {Number(resumo.caixa.adiantamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            {/* Condições que debitam do caixa */}
                            {(resumo.detalhamentoCaixa || []).filter(d => d.debitaCaixa).map((d, i) => (
                                <div key={i} className="flex justify-between text-green-700">
                                    <span>+ {d.condicao}</span>
                                    <span className="font-medium">R$ {Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            ))}

                            {/* Faltas de devolução cobradas do motorista */}
                            {Number(resumo.faltasDevolucao || 0) > 0 && (
                                <div className="flex justify-between text-orange-700">
                                    <span>+ Faltas de devolução</span>
                                    <span className="font-medium">R$ {Number(resumo.faltasDevolucao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            {/* Cobranças em rota recebidas em dinheiro */}
                            {Number(resumo.cobrancasRota?.totalDinheiro || 0) > 0 && (
                                <div className="flex justify-between text-green-700">
                                    <span>+ Cobranças da rota (dinheiro)</span>
                                    <span className="font-medium">R$ {Number(resumo.cobrancasRota.totalDinheiro).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            {/* Títulos quitados na tela de Contas a Receber (dinheiro/cheque em mãos) */}
                            {Number(resumo.recebimentosTitulos?.total || 0) > 0 && (
                                <div className="flex justify-between text-green-700">
                                    <span>+ Títulos recebidos (Contas a Receber)</span>
                                    <span className="font-medium">R$ {Number(resumo.recebimentosTitulos.total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            {/* Despesas */}
                            {Number(resumo.totalDespesas || 0) > 0 && (
                                <div className="flex justify-between text-red-700">
                                    <span>− Despesas</span>
                                    <span className="font-medium">R$ {Number(resumo.totalDespesas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            {/* Separador */}
                            {(resumo.detalhamentoCaixa || []).some(d => !d.debitaCaixa) && (
                                <>
                                    <div className="border-t border-amber-200 my-2"></div>
                                    <p className="text-xs text-amber-600 font-medium">Outros (não debitam do caixa):</p>
                                    {(resumo.detalhamentoCaixa || []).filter(d => !d.debitaCaixa).map((d, i) => (
                                        <div key={i} className="flex justify-between text-gray-500">
                                            <span>{d.condicao}</span>
                                            <span>R$ {Number(d.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    ))}
                                </>
                            )}

                            {/* Devolvidos */}
                            {(resumo.contagens?.devolvidos || 0) > 0 && (
                                <div className="flex justify-between text-gray-400 text-xs italic mt-1">
                                    <span>{resumo.contagens.devolvidos} devolução(ões) — não descontam</span>
                                </div>
                            )}
                        </div>
                    </div>
                    )}

                    {/* Pendências para fechar */}
                    {isAberto && resumo?.pendencias && !resumo.pendencias.podeFechar && (
                        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-2">
                            <p className="text-sm font-bold text-amber-800 mb-1">Pendências para fechar o caixa:</p>
                            <ul className="text-xs text-amber-700 space-y-1">
                                {resumo.pendencias.devolucoesNaoFeitas > 0 && (
                                    <li>
                                        <button onClick={irParaEntregas} className="underline decoration-amber-400 underline-offset-2 hover:text-amber-900 text-left">
                                            • {resumo.pendencias.devolucoesNaoFeitas} devolução(ões) não registrada(s) — toque para abrir as entregas
                                        </button>
                                    </li>
                                )}
                                {resumo.pendencias.quitacoesNaoFeitas > 0 && (
                                    <li>
                                        <button onClick={irParaEntregas} className="underline decoration-amber-400 underline-offset-2 hover:text-amber-900 text-left">
                                            • {resumo.pendencias.quitacoesNaoFeitas} baixa(s) de dinheiro não quitada(s) — toque para abrir as entregas
                                        </button>
                                    </li>
                                )}
                                {resumo.pendencias.conferenciaDevolucaoPendente && (
                                    <li>• Conferência de devoluções pendente (conte a mercadoria que voltou no cartão acima)</li>
                                )}
                                {resumo.pendencias.conferenciaDinheiroPendente && (
                                    <li>
                                        • {resumo.conferenciaDinheiro?.desatualizada
                                            ? 'O valor mudou depois da conferência — o dinheiro precisa ser conferido de novo'
                                            : 'Dinheiro ainda não conferido — alguém precisa contar e confirmar o valor (cartão acima)'}
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}

                    {/* Quem conferiu o dinheiro não fecha o mesmo caixa (dois pares de olhos) */}
                    {isAberto && resumo?.conferenciaDinheiro?.souQuemConferiu && (
                        <div className="bg-mint/50 border border-primary/30 rounded-lg p-3 mb-2 text-sm text-primaryDark">
                            Você conferiu o dinheiro deste caixa — <b>o fechamento é de outra pessoa</b>.
                            Ele já está na agenda de quem tem a permissão de fechar.
                        </div>
                    )}

                    {/* Ações */}
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        {isAberto && podeFecharCaixa && !resumo?.conferenciaDinheiro?.souQuemConferiu && (
                            <button
                                onClick={handleFechar}
                                disabled={resumo?.pendencias && !resumo.pendencias.podeFechar}
                                className={`inline-flex items-center justify-center px-6 py-3 rounded-md font-medium ${
                                    resumo?.pendencias && !resumo.pendencias.podeFechar
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-yellow-600 text-white hover:bg-yellow-700'
                                }`}
                                title={resumo?.pendencias && !resumo.pendencias.podeFechar ? 'Resolva as pendências antes de fechar' : ''}
                            >
                                <Lock className="h-5 w-5 mr-2" /> Fechar Caixa
                            </button>
                        )}

                        {/* Imprimir só quando o dia está pronto (conferência feita etc.) — senão o valor sairia no papel.
                            Imprimir também manda o caixa para a conferência do dinheiro (a folha é a prestação de contas). */}
                        {diaPronto && (
                            <button
                                onClick={handleImprimir}
                                className="inline-flex items-center justify-center px-6 py-3 bg-gray-600 text-white rounded-md font-medium hover:bg-gray-700"
                            >
                                <Printer className="h-5 w-5 mr-2" /> Imprimir
                            </button>
                        )}

                        {/* Conferência pós-fechamento (modelo antigo): sai de cena quando a
                            conferência do DINHEIRO está ligada — ali quem confere é antes de fechar. */}
                        {isAdmin && caixa?.status === 'FECHADO' && !resumo?.conferenciaDinheiro?.ativa && (
                            <div className="flex flex-col sm:flex-row items-center gap-2">
                                <input
                                    type="text"
                                    value={obsAdmin}
                                    onChange={(e) => setObsAdmin(e.target.value)}
                                    placeholder="Observação (opcional)"
                                    className="border border-gray-300 rounded-md px-3 py-2 text-sm shadow-sm w-full sm:w-48 bg-white text-gray-900"
                                />
                                <button
                                    onClick={handleConferir}
                                    className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 whitespace-nowrap"
                                >
                                    <ClipboardCheck className="h-5 w-5 mr-2" /> Conferir Caixa
                                </button>
                            </div>
                        )}

                        {podeReverter && caixa?.status === 'CONFERIDO' && (
                            <button
                                onClick={handleReverterConferencia}
                                className="inline-flex items-center justify-center px-5 py-2.5 bg-amber-500 text-white rounded-md font-medium hover:bg-amber-600 text-sm"
                            >
                                <Undo2 className="h-4 w-4 mr-2" /> Reverter Conferência
                            </button>
                        )}

                        {podeReverter && caixa?.status === 'FECHADO' && (
                            <button
                                onClick={handleReabrirCaixa}
                                className="inline-flex items-center justify-center px-5 py-2.5 bg-amber-500 text-white rounded-md font-medium hover:bg-amber-600 text-sm"
                            >
                                <Undo2 className="h-4 w-4 mr-2" /> Reabrir Caixa
                            </button>
                        )}
                    </div>
                </div>
            )}
            {showDespesaModal && (
                <NovaDespesaModal
                    onClose={() => setShowDespesaModal(false)}
                    onSaved={() => { setShowDespesaModal(false); toast.success('Despesa criada!'); fetchResumo(); }}
                    vendedorId={vendedorId}
                    dataReferencia={data}
                    veiculoDoDia={resumo?.diario?.veiculoId || null}
                />
            )}
            {veiculoFichaId && (
                <VeiculoFicha
                    veiculoId={veiculoFichaId}
                    onClose={() => setVeiculoFichaId(null)}
                    readOnly={true}
                    allowedTabs={['resumo', 'documentos', 'manutencao']}
                />
            )}

            {modalDevolucao && (
                <ModalDevolucao
                    entrega={modalDevolucao}
                    onClose={() => setModalDevolucao(null)}
                    onSalvo={() => {
                        setModalDevolucao(null);
                        toast.success('Devolução registrada!');
                        fetchResumo();
                    }}
                />
            )}
        </div>
    );
};

export default CaixaDiarioPage;
