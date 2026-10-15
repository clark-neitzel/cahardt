import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Clock, X, Loader, MessageCircle, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import clienteService from '../services/clienteService';
import cobrancaService from '../services/cobrancaService';
import { useAuth } from '../contexts/AuthContext';

const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

const PARCELA_STATUS = {
    PENDENTE: { label: 'Pendente', cls: 'bg-gray-100 text-gray-700' },
    PARCIAL: { label: 'Parcial', cls: 'bg-yellow-100 text-yellow-800' },
    PAGO: { label: 'Pago', cls: 'bg-green-100 text-green-800' },
    VENCIDO: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
    CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-500' },
};
const CONTA_STATUS = {
    ABERTO: { label: 'Em aberto', cls: 'bg-blue-100 text-blue-800' },
    PARCIAL: { label: 'Parcial', cls: 'bg-yellow-100 text-yellow-800' },
};
// Situação da conta classificada pelo servidor (fonte única)
const SITUACAO_CONTA = {
    A_CONFIRMAR: { label: 'A confirmar', cls: 'bg-amber-100 text-amber-800' },
    EM_ESPERA: { label: 'Em conferência', cls: 'bg-mint text-primaryDark' },
    FORA: { label: 'Fora da cobrança', cls: 'bg-gray-100 text-gray-700' },
};
const MOTIVO_FORA = {
    FUNCIONARIO: 'compra de funcionário',
    ESPECIAL_NAO_ENTREGUE: 'especial ainda não entregue',
    TOLERANCIA: 'valor abaixo da tolerância',
};

/** Botões "Cobrar agora (WhatsApp)" e "Abrir no Contas a Receber" — por permissão, iguais no popup e na ficha. */
export function AcoesContasEmAberto({ clienteId, clienteNome, detalhe, onNavegar, className = '' }) {
    const { hasPermission } = useAuth();
    const navigate = useNavigate();
    const [cobrando, setCobrando] = useState(false);
    // espelha o back: admin || Pode_Editar_Cobranca  /  admin || Pode_Acessar_Contas_Receber
    const podeCobrar = hasPermission('Pode_Editar_Cobranca') && !!detalhe?.inadimplente;
    const podeAbrirCR = hasPermission('Pode_Acessar_Contas_Receber');
    if (!podeCobrar && !podeAbrirCR) return null;

    const cobrarAgora = async () => {
        if (cobrando) return;
        if (!window.confirm(`Enviar a cobrança de ${clienteNome || 'este cliente'} agora?`)) return;
        setCobrando(true);
        try {
            const r = await cobrancaService.cobrarCliente(clienteId);
            if (r?.ok) toast.success('Cobrança enviada!');
            else if (r?.reagendado) toast('A mensagem entrou na fila e sai em instantes.');
            else toast.error(r?.motivo || 'Envio falhou — veja o painel da Régua de Cobrança');
        } catch (e) {
            toast.error(e?.response?.data?.error || 'Erro ao enviar cobrança');
        } finally {
            setCobrando(false);
        }
    };

    const abrirCR = () => {
        if (onNavegar) onNavegar();
        const q = new URLSearchParams({ clienteId });
        if (clienteNome) q.set('clienteNome', clienteNome);
        navigate(`/financeiro/contas-receber/tabela?${q.toString()}`);
    };

    return (
        <div className={`flex flex-col md:flex-row gap-2 ${className}`}>
            {podeCobrar && (
                <button type="button" onClick={cobrarAgora} disabled={cobrando}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primaryDark disabled:opacity-60 text-white rounded-full shadow-sm font-semibold text-sm">
                    {cobrando ? <Loader className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    {cobrando ? 'Enviando...' : 'Cobrar agora (WhatsApp)'}
                </button>
            )}
            {podeAbrirCR && (
                <button type="button" onClick={abrirCR}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm">
                    <ExternalLink className="h-4 w-4" />
                    Abrir no Contas a Receber
                </button>
            )}
        </div>
    );
}

/** Totalizador + contas (nota a nota, parcela a parcela). Usado no popup e na aba Financeiro da ficha. */
export function ContasEmAbertoLista({ detalhe }) {
    const ac = detalhe.aConfirmar;
    const em = !!detalhe.inadimplente;
    return (
        <>
            <div className={`flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 border-b shrink-0 ${em ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${em ? 'text-red-600' : 'text-gray-600'}`}>Total vencido</p>
                    <p className={`text-lg font-bold ${em ? 'text-red-700' : 'text-gray-800'}`}>{fmtMoeda(detalhe.totalVencido)}</p>
                </div>
                <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${em ? 'text-red-600' : 'text-gray-600'}`}>Parcelas vencidas</p>
                    <p className={`text-lg font-bold ${em ? 'text-red-700' : 'text-gray-800'}`}>{detalhe.parcelasVencidas ?? 0}</p>
                </div>
                <div>
                    <p className={`text-[10px] font-semibold uppercase tracking-wide ${em ? 'text-red-600' : 'text-gray-600'}`}>Notas em aberto</p>
                    <p className={`text-lg font-bold ${em ? 'text-red-700' : 'text-gray-800'}`}>{detalhe.contas?.length || 0}</p>
                </div>
            </div>
            {ac && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-800 flex items-start gap-2">
                    <Clock className="h-4 w-4 shrink-0 mt-px" />
                    <span>
                        <b>{fmtMoeda(ac.valor)}</b> a confirmar — apontado na entrega{ac.dias != null ? ` há ${ac.dias} dias` : ''}, aguardando conciliação do escritório. Não é cobrança do cliente.
                    </span>
                </div>
            )}
            <div className="overflow-y-auto flex-1 p-3 space-y-3">
                {(detalhe.contas || []).length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-6">Nenhuma conta em aberto.</p>
                )}
                {(detalhe.contas || []).map(conta => {
                    const stBadge = CONTA_STATUS[conta.status] || CONTA_STATUS.ABERTO;
                    const sit = SITUACAO_CONTA[conta.situacao];
                    const motivo = conta.situacao === 'FORA' && conta.foraMotivo ? MOTIVO_FORA[conta.foraMotivo] : null;
                    return (
                        <div key={conta.id} className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-3 py-2.5 flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {conta.pedidoNumero && (
                                            <span className="text-xs font-bold text-gray-800">{conta.pedidoEspecial ? 'ZZ' : ''}#{conta.pedidoNumero}</span>
                                        )}
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${stBadge.cls}`}>{stBadge.label}</span>
                                        {sit && <span title={motivo || ''} className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${sit.cls}`}>{sit.label}{motivo ? ` · ${motivo}` : ''}</span>}
                                        {conta.condicaoPagamento && (
                                            <span className="text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{conta.condicaoPagamento}</span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 mt-0.5 text-[10px] text-gray-600">
                                        {conta.dataVenda && <span>Venda: {fmtData(conta.dataVenda)}</span>}
                                        <span>{conta.parcelasPagas}/{conta.parcelasTotal} pagas</span>
                                        {conta.valorDevolvido > 0 && <span className="text-red-600 font-medium">Dev: {fmtMoeda(conta.valorDevolvido)}</span>}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-xs font-bold text-gray-800">{fmtMoeda(conta.valorTotal)}</p>
                                    {conta.proximoVencimento && <p className="text-[10px] text-gray-600">Próx: {fmtData(conta.proximoVencimento)}</p>}
                                </div>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {(conta.parcelas || []).map(p => {
                                    const vencida = p.status !== 'PAGO' && p.status !== 'CANCELADO' && p.diasAtraso > 0;
                                    const pb = vencida ? PARCELA_STATUS.VENCIDO : (PARCELA_STATUS[p.status] || PARCELA_STATUS.PENDENTE);
                                    return (
                                        <div key={p.id} className={`px-3 py-2 flex items-center justify-between gap-2 ${vencida ? 'bg-red-50/60' : p.status === 'PAGO' ? 'bg-green-50/40' : ''}`}>
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                                <span className="text-[11px] font-bold text-gray-500 shrink-0 w-5 text-center">{p.numeroParcela}</span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-xs font-semibold text-gray-800">{fmtMoeda(p.valor)}</span>
                                                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${pb.cls}`}>{pb.label}</span>
                                                        {vencida && <span className="text-[10px] font-bold text-red-600">{p.diasAtraso}d</span>}
                                                    </div>
                                                    <div className="text-[10px] text-gray-600 mt-0.5 flex flex-wrap gap-x-2">
                                                        <span>Venc: {fmtData(p.dataVencimento)}</span>
                                                        {p.dataPagamento && <span className="text-green-700">Pago: {fmtData(p.dataPagamento)}</span>}
                                                        {p.valorPago > 0 && p.valorPago !== p.valor && <span className="text-green-700">({fmtMoeda(p.valorPago)} recebido)</span>}
                                                        {p.formaPagamento && <span>{p.formaPagamento}</span>}
                                                        {p.baixadoPorNome && <span>· {p.baixadoPorNome}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}

/**
 * Popup "Contas em aberto" — UM só para o app inteiro (Clientes, Rota, Atendimentos, Pedidos, Caixa...).
 * Props: clienteId (UUID), clienteNome, onClose.
 * No celular sobe de baixo (bottom-sheet); no computador é janela centralizada.
 */
export default function PopupContasEmAberto({ clienteId, clienteNome, onClose }) {
    const [detalhe, setDetalhe] = useState(null);
    const [estado, setEstado] = useState('loading'); // loading | ok | erro

    useEffect(() => {
        let vivo = true;
        setEstado('loading');
        clienteService.obterInadimplencia(clienteId)
            .then(d => { if (vivo) { setDetalhe(d); setEstado('ok'); } })
            .catch(() => { if (vivo) setEstado('erro'); });
        return () => { vivo = false; };
    }, [clienteId]);

    const vermelho = estado === 'ok' ? !!detalhe?.inadimplente : true;
    const amarelo = estado === 'ok' && !detalhe?.inadimplente && !!detalhe?.aConfirmar;
    const corHeader = vermelho ? 'bg-red-600' : amarelo ? 'bg-amber-500' : 'bg-gray-700';

    // Portal no body: dentro de painel/folha com `transform` o `fixed` ficaria preso ao painel.
    return createPortal(
        <div className="fixed inset-0 z-[999] flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4" onClick={onClose}>
            <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className={`flex items-center justify-between px-4 py-3 rounded-t-2xl shrink-0 ${corHeader}`}>
                    <div className="flex items-center gap-2 min-w-0">
                        {amarelo ? <Clock className="h-4 w-4 text-white shrink-0" /> : <AlertCircle className="h-4 w-4 text-white shrink-0" />}
                        <span className="text-sm font-bold text-white truncate">Contas em Aberto — {clienteNome || 'Cliente'}</span>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="text-white/80 hover:text-white p-2 -mr-2">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {estado === 'loading' && (
                    <div className="flex items-center justify-center py-12 text-gray-500 text-sm gap-2">
                        <Loader className="h-4 w-4 animate-spin" /> Carregando...
                    </div>
                )}
                {estado === 'erro' && <div className="text-center py-10 text-red-600 text-sm">Erro ao carregar dados.</div>}
                {estado === 'ok' && detalhe && (
                    <>
                        <ContasEmAbertoLista detalhe={detalhe} />
                        <AcoesContasEmAberto clienteId={clienteId} clienteNome={clienteNome} detalhe={detalhe} onNavegar={onClose}
                            className="px-4 pt-3 border-t border-gray-100 shrink-0" />
                    </>
                )}

                <div className="px-4 py-2 shrink-0">
                    <button type="button" onClick={onClose} className="w-full min-h-[44px] text-sm font-medium text-gray-600 hover:text-gray-900">Fechar</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
