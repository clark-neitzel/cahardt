import React, { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { MessageCircle, Settings, RefreshCw, Send, MessageSquareOff, MessageSquare, Search, ChevronDown, X, AlertCircle, AlertTriangle, Calendar, Printer, Clock, MoreHorizontal } from 'lucide-react';
import CampoHorarioEntrega, { horaValida } from '../../components/CampoHorarioEntrega';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import EntregarEm, { enderecoDoCadastro } from '../../components/EntregarEm';
import deliveryService from '../../services/deliveryService';
import { useAuth } from '../../contexts/AuthContext';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { pedidoDoDelivery, LINK_KIT_FESTA, precarregarFontesEtiqueta } from '../KitFesta/etiquetasCaixas';
import PainelEtiquetas from '../KitFesta/PainelEtiquetas';
import ModalPreviaWhatsapp from './ModalPreviaWhatsapp';
import JanelaMoverEtapa from './JanelaMoverEtapa';

const { ETAPAS, LABELS } = deliveryService;
const COL_COLORS = {
    PEDIDO: 'border-blue-300 bg-blue-50',
    PRODUCAO: 'border-amber-300 bg-amber-50',
    SAINDO: 'border-purple-300 bg-purple-50',
    ENTREGUE: 'border-green-300 bg-green-50'
};
// Rótulos curtos dos 4 botões do topo (celular) e topo colorido de cada botão
const ROTULO_CURTO = { PEDIDO: 'Pedido', PRODUCAO: 'Produção', SAINDO: 'Saindo', ENTREGUE: 'Entregue' };
const COR_TOPO = { PEDIDO: 'border-t-blue-400', PRODUCAO: 'border-t-amber-400', SAINDO: 'border-t-purple-400', ENTREGUE: 'border-t-green-400' };
// Texto do botão grande do card = o PRÓXIMO passo
const ROTULO_PROXIMO = {
    PRODUCAO: '▶ Iniciar produção',
    SAINDO: '🚚 Saiu para entrega',
    ENTREGUE: '✔ Marcar entregue'
};

const fmtBRL = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const soDigits = (s) => (s || '').replace(/\D/g, '');
const whatsappLink = (telefone) => {
    const d = soDigits(telefone);
    if (!d) return null;
    const full = d.length <= 11 ? `55${d}` : d;
    return `https://wa.me/${full}`;
};

const etapaSeguinte = (etapa) => {
    const idx = ETAPAS.indexOf(etapa);
    return idx >= 0 && idx < ETAPAS.length - 1 ? ETAPAS[idx + 1] : null;
};

// Dia da entrega ('YYYY-MM-DD') em UTC — dataVenda é guardada como yyyy-mm-ddT00:00:00Z.
// NUNCA usar getDate() local aqui (fuso muda o dia).
const diaUTC = (dataVenda) => {
    if (!dataVenda) return '';
    const d = new Date(dataVenda);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// Classifica a data de entrega em relação a hoje.
// → { label: 'Hoje'|'Amanhã'|'Atrasado'|'Futuro', dias: number, dataStr: 'dd/mm' }
const classificarEntrega = (dataVenda) => {
    if (!dataVenda) return null;
    const d = new Date(dataVenda);
    // Compara dia-a-dia em UTC, já que dataVenda é armazenado como yyyy-mm-ddT00:00:00Z
    const ent = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const agora = new Date();
    const hoje = new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
    const diffMs = ent.getTime() - hoje.getTime();
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const dataStr = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    let label = 'Futuro';
    if (diffDias < 0) label = 'Atrasado';
    else if (diffDias === 0) label = 'Hoje';
    else if (diffDias === 1) label = 'Amanhã';
    return { label, dias: diffDias, dataStr };
};

// Barra "grudada" sem position: sticky.
// Por quê: o index.css põe `overflow-x: hidden` em html/body, o que faz o body virar o
// "scrollport" do sticky (mesmo sem rolar) e o sticky nunca gruda na janela. Em vez de mexer no CSS
// global, usamos o mesmo recurso de PosicaoEstoque (barra `fixed` abaixo da faixa fixa de cima), só que
// ligado APENAS depois que o espaço reservado (placeholder) sobe até essa faixa — antes disso a barra
// fica no fluxo normal, no lugar de sempre. left/width vêm do placeholder, então acompanham a
// sidebar do desktop/tablet sem depender do layout global.
//
// Altura da faixa fixa de cima — MEDIDA no navegador, nunca fixada no código:
// procura, entre os elementos da raiz do app, quem está `position: fixed`, visível, colado no topo e
// de ponta a ponta da janela (o <nav> do celular, a VisitorBar do desktop, qualquer aviso fixo) e usa o
// `bottom` mais baixo. Sem nenhuma faixa: 0 no md+ (usuário sem VisitorBar) e 56px (h-14) no celular.
// Não usa a variável --topo-extra do App.jsx porque ela vale 38px mesmo quando a VisitorBar não aparece
// (usuário sem permissão) — o que deixaria um vão de 38px acima da barra.
// O mesmo valor serve para a comparação (r.top <= topo) e para o `top` do estilo.
function useBarraGrudada() {
    // ref de CALLBACK: o espaço só existe depois que perm.podeVer fica true; um useRef + efeito [] nunca o veria
    const [espaco, setEspaco] = useState(null);
    const [estado, setEstado] = useState({ grudada: false, top: 0, left: 0, width: 0 });

    useLayoutEffect(() => {
        if (!espaco) return undefined;
        const topoFixo = () => {
            const wr = espaco.closest('[style*="--topo-extra"]');
            const candidatos = [...(wr?.parentElement?.children || []), ...(wr?.children || [])];
            let baixo = 0;
            for (const el of candidatos) {
                const cs = getComputedStyle(el);
                if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
                const r = el.getBoundingClientRect();
                if (Math.abs(r.top) < 1 && r.width >= document.documentElement.clientWidth - 1 && r.height > 0 && r.height < 120) {
                    baixo = Math.max(baixo, r.bottom);
                }
            }
            if (baixo > 0) return Math.round(baixo);
            return window.matchMedia('(min-width: 768px)').matches ? 0 : 56;
        };
        const medir = () => {
            const r = espaco.getBoundingClientRect();
            const top = topoFixo();
            const grudada = r.top <= top && r.width > 0;
            setEstado((e) => (
                e.grudada === grudada && e.top === top
                && Math.abs(e.left - r.left) < 0.5 && Math.abs(e.width - r.width) < 0.5
                    ? e
                    : { grudada, top, left: r.left, width: r.width }
            ));
        };
        medir();
        window.addEventListener('scroll', medir, { passive: true, capture: true });
        window.addEventListener('resize', medir);
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
        if (ro) ro.observe(espaco);
        return () => {
            window.removeEventListener('scroll', medir, { capture: true });
            window.removeEventListener('resize', medir);
            if (ro) ro.disconnect();
        };
    }, [espaco]);

    return [setEspaco, estado];
}

export default function DeliveryKanban() {
    const { user } = useAuth();
    const [buckets, setBuckets] = useState({ PEDIDO: [], PRODUCAO: [], SAINDO: [], ENTREGUE: [] });
    const [perm, setPerm] = useState({ podeVer: false, etapasPermitidas: [], admin: false });
    const [loading, setLoading] = useState(true);
    const [moving, setMoving] = useState(null);

    // Filtros: busca livre não persiste; período (preset) e etapa aberta no celular ficam salvos por usuário.
    // virarDia: a tela fica aberta de um dia para o outro — "Hoje" acompanha a virada.
    const [busca, setBusca] = useState('');
    const [periodo, periodoCtl] = usePeriodoSalvo('delivery-kanban', 'hoje', { virarDia: true });
    const [etapaSalva, setEtapaAtiva] = useFiltroSalvo('delivery-kanban:etapa', 'PEDIDO');
    const etapaAtiva = ETAPAS.includes(etapaSalva) ? etapaSalva : 'PEDIDO';

    // "Ver todas as datas" é TEMPORÁRIO (só nesta visita, nada vai para o localStorage):
    // enquanto ligado, o período é ignorado. Desliga sozinho se o usuário mexer no seletor de período.
    const [verTodasAsDatas, setVerTodasAsDatas] = useState(false);
    const periodoCtlTela = useMemo(() => ({
        escolher: (...a) => { setVerTodasAsDatas(false); periodoCtl.escolher(...a); },
        navegar: (...a) => { setVerTodasAsDatas(false); periodoCtl.navegar(...a); },
        limpar: (...a) => { setVerTodasAsDatas(false); periodoCtl.limpar(...a); }
    }), [periodoCtl]);

    // Guardamos só o ID: o card é derivado dos buckets a cada render, então o polling de 30s
    // nunca deixa a janela/modal com dado velho.
    const [detalheId, setDetalheId] = useState(null);
    const [moverId, setMoverId] = useState(null);
    // Modal de prévia do WhatsApp antes de reenviar
    const [previaCard, setPreviaCard] = useState(null);

    const isAdmin = user?.permissoes?.admin;
    const [refEspacoBarra, barra] = useBarraGrudada();

    const carregar = async () => {
        setLoading(true);
        try {
            const data = await deliveryService.listarPedidos();
            const { minhaPermissao, ...b } = data;
            setBuckets(b);
            setPerm(minhaPermissao);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        carregar();
        const id = setInterval(carregar, 30000);
        return () => clearInterval(id);
    }, []);

    const cardPorId = (id) => {
        if (!id) return null;
        for (const etapa of ETAPAS) {
            const achado = (buckets[etapa] || []).find(c => c.id === id);
            if (achado) return achado;
        }
        return null;
    };
    const cardMover = cardPorId(moverId);
    const cardDetalhe = cardPorId(detalheId);

    // O card sumiu da lista (outra pessoa moveu/cancelou e saiu do corte): fecha a janela, com aviso
    useEffect(() => {
        if (moverId && !cardMover && !loading) {
            setMoverId(null);
            toast('Este pedido saiu da lista e não pôde ser movido.', { icon: 'ℹ️', duration: 5000 });
        }
        if (detalheId && !cardDetalhe && !loading) setDetalheId(null);
    }, [moverId, cardMover, detalheId, cardDetalhe, loading]);

    // Abre a janela de mover. Pedido não faturado só leva o toast de bloqueio (sem abrir nada).
    const abrirMover = (card) => {
        if (card.situacaoCA !== 'FATURADO') {
            toast.error('Este pedido ainda não foi faturado. Fature primeiro para movimentar no Delivery.', {
                duration: 5000,
                style: { maxWidth: '480px' }
            });
            return;
        }
        setMoverId(card.id);
    };

    // Chamada pela janela. Lança Error(mensagem) se falhar (a janela fica aberta e mostra o erro).
    // Nada otimista: o card só muda depois do sucesso.
    const confirmarMover = async (destino, avisar) => {
        const card = cardMover;
        if (!card) throw new Error('Pedido não encontrado na lista.');
        let r;
        try {
            r = await deliveryService.moverEtapa(card.id, destino, avisar);
        } catch (e) {
            throw new Error(e.response?.data?.error || e.message || 'Erro ao mover.');
        }
        // semMudanca vem ANTES de avisarCliente: nesse caso o backend não disparou nada
        if (r?.semMudanca) {
            toast('Pedido já estava nesta etapa — nada foi alterado nem enviado', { icon: 'ℹ️' });
        } else {
            // O envio do WhatsApp é assíncrono e pode ser pulado — nunca afirmar "cliente avisado"
            const pediuAviso = avisar === true && r?.avisarCliente !== false;
            if (destino === 'PEDIDO') {
                // Nesta etapa o backend nunca manda mensagem ao cliente — não dizer "aviso solicitado"
                toast.success(`→ ${LABELS[destino]} · nesta etapa não há mensagem ao cliente`);
            } else {
                toast.success(`→ ${LABELS[destino]} · ${pediuAviso ? 'aviso ao cliente solicitado' : 'sem aviso ao cliente'}`);
            }
        }
        setMoverId(null);
        await carregar();
    };

    // Devolve o resultado (r) para quem chamou decidir se fecha o modal de prévia —
    // sem isso o modal fechava mesmo quando o envio falhava.
    const reenviar = async (card) => {
        setMoving(card.id);
        try {
            const r = await deliveryService.reenviar(card.id);
            if (!r.ok) toast.error(r.motivo || 'Falha ao reenviar.');
            else if (r.enviado) toast.success('Mensagem reenviada');
            else if (r.reagendado) toast(r.motivo || 'Entrou na fila — será enviada em breve', { icon: '⏳' });
            else toast(r.motivo || 'Nada foi enviado.', { icon: 'ℹ️', duration: 6000 });
            return r;
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao reenviar.');
            return { ok: false };
        } finally {
            setMoving(null);
        }
    };

    // Etiquetas das caixas (rolo 40×25 mm da TLP 2844) — mesmo painel/opções da aba Kit Festa.
    // O QR nasce ao abrir a tela porque print() precisa ser síncrono no clique (iOS).
    const [etqCard, setEtqCard] = useState(null);
    const [qrSvg, setQrSvg] = useState('');
    useEffect(() => {
        let ativo = true;
        precarregarFontesEtiqueta();
        import('qrcode')
            .then(QRCode => QRCode.toString(LINK_KIT_FESTA, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }))
            .then(svg => { if (ativo) setQrSvg(svg); })
            .catch(() => { /* sem QR a etiqueta sai só com o texto */ });
        return () => { ativo = false; };
    }, []);
    const imprimirEtiquetas = (card) => setEtqCard(card);

    const toggleSilenciar = async (card) => {
        const novoEstado = !card.silenciarWhatsapp;
        // Atualização otimista — atualiza o card local antes do round-trip
        setBuckets(prev => {
            const copy = { ...prev };
            for (const k of Object.keys(copy)) {
                copy[k] = copy[k].map(c => c.id === card.id ? { ...c, silenciarWhatsapp: novoEstado } : c);
            }
            return copy;
        });
        try {
            await deliveryService.setSilenciarWhatsapp(card.id, novoEstado);
            toast.success(novoEstado ? 'WhatsApp silenciado para este pedido' : 'WhatsApp reativado para este pedido');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao atualizar.');
            await carregar();
        }
    };

    // Horário de entrega (opcional): relógio no cartão -> PATCH -> atualiza só o card local
    const [horaCard, setHoraCard] = useState(null);
    const salvarHoraEntrega = async (card, horaEntrega) => {
        const hora = horaValida(horaEntrega) ? horaEntrega : null;
        try {
            const r = await deliveryService.setHoraEntrega(card.id, hora);
            const novo = r?.horaEntrega !== undefined ? r.horaEntrega : hora;
            // Mesma ordem do backend: dia da entrega, depois horário (sem hora por último). ENTREGUE não é reordenada.
            const dia = (c) => (c.dataVenda ? new Date(c.dataVenda).toISOString().slice(0, 10) : '');
            const ordenar = (a, b) => {
                if (dia(a) !== dia(b)) return dia(a) < dia(b) ? -1 : 1;
                if (a.horaEntrega && b.horaEntrega) return a.horaEntrega.localeCompare(b.horaEntrega);
                if (a.horaEntrega) return -1;
                if (b.horaEntrega) return 1;
                return 0;
            };
            setBuckets(prev => {
                const copy = { ...prev };
                for (const k of Object.keys(copy)) {
                    const lista = copy[k].map(c => c.id === card.id ? { ...c, horaEntrega: novo } : c);
                    // sort estável: empates (mesmo dia/hora) mantêm a ordem que o servidor deu
                    copy[k] = k !== 'ENTREGUE' && lista.some(c => c.id === card.id) ? [...lista].sort(ordenar) : lista;
                }
                return copy;
            });
            toast.success(novo ? `Horário ${novo} salvo` : 'Horário removido');
            return true;
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao salvar o horário.');
            return false;
        }
    };

    // Visibilidade = atrasado (nunca some) OU dentro do período; a busca vale por cima.
    // As contagens dos botões, a lista e o "+N em outras datas" saem TODOS desta mesma classificação.
    const { filtrados, foraDoPeriodo, qtdAtrasados } = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        const de = verTodasAsDatas ? '' : (periodo.de || '');
        const ate = verTodasAsDatas ? '' : (periodo.ate || '');
        const out = {};
        let fora = 0;
        let atrasados = 0;
        for (const etapa of ETAPAS) {
            out[etapa] = [];
            for (const card of (buckets[etapa] || [])) {
                if (termo) {
                    const nome = (card.cliente?.NomeFantasia || card.cliente?.Nome || '').toLowerCase();
                    const numero = String(card.numero || '');
                    if (!nome.includes(termo) && !numero.includes(termo)) continue;
                }
                const atrasado = etapa !== 'ENTREGUE' && classificarEntrega(card.dataVenda)?.label === 'Atrasado';
                const dia = diaUTC(card.dataVenda);
                const noPeriodo = (!de && !ate) || (!!dia && (!de || dia >= de) && (!ate || dia <= ate));
                if (atrasado || noPeriodo) {
                    out[etapa].push(card);
                    if (atrasado) atrasados += 1;
                } else {
                    fora += 1;
                }
            }
        }
        return { filtrados: out, foraDoPeriodo: fora, qtdAtrasados: atrasados };
    }, [buckets, busca, periodo.de, periodo.ate, verTodasAsDatas]);

    const totalFiltrado = ETAPAS.reduce((s, e) => s + (filtrados[e]?.length || 0), 0);
    const filtroAtivo = !!(busca.trim() || !periodo.padrao || verTodasAsDatas);

    return (
        <div className="p-3 md:p-6 max-w-full overflow-x-clip">
            <div className="flex items-center justify-between mb-3 md:mb-4 gap-3">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-2xl font-bold text-gray-900">Delivery — Kit Festa</h1>
                    <p className="text-xs md:text-sm text-gray-500">Pedidos de entrega por etapa</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={carregar}
                        className="text-gray-500 hover:text-primary min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full hover:bg-gray-100"
                        title="Atualizar"
                        aria-label="Atualizar"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {isAdmin && (
                        <Link to="/delivery/config" className="inline-flex items-center gap-1 min-h-[44px] px-4 text-sm font-medium text-primary bg-white border border-primary rounded-full hover:bg-mint/40">
                            <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Configurar</span>
                        </Link>
                    )}
                </div>
            </div>

            {perm.podeVer && (
                <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
                    <div className="relative w-full md:flex-1 md:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="text"
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Buscar por cliente ou nº pedido…"
                            className="w-full pl-9 pr-3 min-h-[44px] md:min-h-[40px] text-sm border border-gray-300 rounded-full focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                    </div>
                    <FiltroPeriodo
                        periodo={periodo}
                        controle={periodoCtlTela}
                        rotulo="Entrega"
                        presets={['hoje', 'amanha', 'prox7', 'prox30', 'mes', 'todo', 'perso']}
                        className="w-full md:w-auto"
                    />
                    {filtroAtivo && (
                        <button
                            onClick={() => { setBusca(''); periodoCtlTela.limpar(); }}
                            className="text-xs text-gray-600 hover:text-gray-900 underline min-h-[44px] md:min-h-0 text-left md:text-center"
                        >
                            Limpar filtros
                        </button>
                    )}
                    {filtroAtivo && (
                        <span className="text-xs text-gray-500 md:ml-auto">
                            {totalFiltrado} pedido{totalFiltrado !== 1 ? 's' : ''} no filtro
                        </span>
                    )}
                </div>
            )}

            {perm.podeVer && (qtdAtrasados > 0 || foraDoPeriodo > 0 || verTodasAsDatas) && (
                <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-bold">
                    {qtdAtrasados > 0 && (
                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-2.5 py-1">
                            <AlertTriangle className="h-3.5 w-3.5" /> {qtdAtrasados} atrasado{qtdAtrasados !== 1 ? 's' : ''}
                        </span>
                    )}
                    {verTodasAsDatas ? (
                        <button
                            type="button"
                            onClick={() => setVerTodasAsDatas(false)}
                            className="inline-flex items-center min-h-[44px] md:min-h-0 px-2.5 py-1 rounded-full bg-mint text-primaryDark underline hover:bg-mint/70"
                        >
                            Mostrando todas as datas · Voltar ao período
                        </button>
                    ) : foraDoPeriodo > 0 && (
                        <button
                            type="button"
                            onClick={() => setVerTodasAsDatas(true)}
                            className="inline-flex items-center min-h-[44px] md:min-h-0 px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 underline hover:bg-gray-200"
                        >
                            +{foraDoPeriodo} em outras datas · ver
                        </button>
                    )}
                </div>
            )}

            {!perm.podeVer && !loading && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                    Você não tem permissão para visualizar o Delivery. Peça ao admin pra liberar.
                </div>
            )}

            {horaCard && (
                <ModalHoraEntrega
                    card={horaCard}
                    onClose={() => setHoraCard(null)}
                    onSalvar={async (h) => { if (await salvarHoraEntrega(horaCard, h)) setHoraCard(null); }}
                />
            )}
            {cardDetalhe && (
                <ModalDetalhes
                    card={cardDetalhe}
                    perm={perm}
                    onClose={() => setDetalheId(null)}
                    onMover={() => abrirMover(cardDetalhe)}
                />
            )}
            {cardMover && (
                <JanelaMoverEtapa
                    card={cardMover}
                    perm={perm}
                    onConfirmar={confirmarMover}
                    onFechar={() => setMoverId(null)}
                />
            )}
            {etqCard && (
                <PainelEtiquetas origem="DELIVERY" pedido={pedidoDoDelivery(etqCard)} qrSvg={qrSvg}
                    titulo={`#${etqCard.numero} ${etqCard.cliente?.NomeFantasia || etqCard.cliente?.Nome || ''}`}
                    onClose={() => setEtqCard(null)} />
            )}

            {previaCard && (
                <ModalPreviaWhatsapp
                    pedidoId={previaCard.id}
                    onClose={() => setPreviaCard(null)}
                    onConfirmar={async () => {
                        const r = await reenviar(previaCard);
                        if (r?.ok) {
                            setPreviaCard(null);
                        } else {
                            // envio falhou (toast já mostrado dentro de reenviar) — mantém o modal
                            // aberto e relança para o ModalPreviaWhatsapp destravar o botão
                            throw new Error('Falha ao enviar WhatsApp');
                        }
                    }}
                />
            )}

            {perm.podeVer && (
                <>
                    {/* Celular/tablet em pé: 4 botões de etapa, uma lista por vez (só classes — sem JS de largura) */}
                    {/* O espaço (h-[68px]) fica sempre no fluxo; a barra vira `fixed` quando ele encosta no topo */}
                    <div ref={refEspacoBarra} className="lg:hidden h-[68px] -mx-3 md:-mx-6">
                        <div
                            className={`h-[68px] px-3 md:px-6 py-2 bg-secondary grid grid-cols-4 gap-1.5 ${barra.grudada ? 'fixed z-20 border-b border-gray-200/60' : ''}`}
                            style={barra.grudada ? { top: barra.top, left: barra.left, width: barra.width } : undefined}
                        >
                            {ETAPAS.map(etapa => {
                                const n = (filtrados[etapa] || []).length;
                                const ativa = etapaAtiva === etapa;
                                return (
                                    <button
                                        key={etapa}
                                        type="button"
                                        onClick={() => setEtapaAtiva(etapa)}
                                        aria-pressed={ativa}
                                        className={`min-h-[52px] rounded-xl border border-t-4 px-1 pt-1 pb-1.5 text-[11px] font-bold leading-tight ${COR_TOPO[etapa]} ${
                                            ativa ? 'bg-mint border-primary border-t-primary text-primaryDark' : 'bg-white border-gray-200 text-gray-600'
                                        }`}
                                    >
                                        <span className={`block text-xl font-extrabold leading-none ${ativa ? 'text-primaryDark' : n === 0 ? 'text-gray-400' : 'text-gray-900'}`}>{n}</span>
                                        {ROTULO_CURTO[etapa]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-start">
                        {ETAPAS.map(etapa => (
                            <div key={etapa} className={`${etapaAtiva === etapa ? 'block' : 'hidden'} lg:block rounded-xl border-2 ${COL_COLORS[etapa]} min-h-[120px] lg:min-h-[200px]`}>
                                <div className="hidden lg:flex px-3 py-2 border-b border-black/5 items-center justify-between">
                                    <span className="font-semibold text-sm">{LABELS[etapa]}</span>
                                    <span className="text-xs bg-white px-2 py-0.5 rounded-full">{(filtrados[etapa] || []).length}</span>
                                </div>
                                <div className="p-2 space-y-2">
                                    {(filtrados[etapa] || []).map(card => (
                                        <Card
                                            key={card.id}
                                            card={card}
                                            perm={perm}
                                            moving={moving === card.id}
                                            onMover={abrirMover}
                                            onReenviar={setPreviaCard}
                                            onToggleSilenciar={toggleSilenciar}
                                            onEtiquetas={imprimirEtiquetas}
                                            onHora={setHoraCard}
                                            onAbrirDetalhes={() => setDetalheId(card.id)}
                                        />
                                    ))}
                                    {!(filtrados[etapa] || []).length && (
                                        <div className="text-center text-xs text-gray-500 py-6">
                                            {filtroAtivo ? 'Nenhum pedido neste filtro' : 'Nenhum pedido'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// Quem pode ir para a etapa `et` (espelha o backend: admin ou etapa liberada)
const podeIrPara = (perm, et) => !!et && !!(perm?.admin || perm?.etapasPermitidas?.includes(et));

// Botão de ícone com alvo de toque de 44px (38px só quando as colunas ficam estreitas, em lg)
const BTN_ICONE = 'min-h-[44px] min-w-[44px] lg:min-w-[38px] inline-flex items-center justify-center rounded-full hover:bg-gray-100';

function Card({ card, perm, moving, onMover, onReenviar, onToggleSilenciar, onAbrirDetalhes, onEtiquetas, onHora }) {
    const tel = card.cliente?.Telefone_Celular || card.cliente?.Telefone;
    const wa = whatsappLink(tel);

    const naoFaturado = card.situacaoCA !== 'FATURADO';
    const proxima = etapaSeguinte(card.etapa);
    const podeProxima = podeIrPara(perm, proxima);
    // "…" abre a janela com as outras etapas — só vale se existir alguma que o usuário possa usar
    const podeAlgumaOutra = ETAPAS.some(e => e !== card.etapa && podeIrPara(perm, e));

    const [itensAbertos, setItensAbertos] = useState(false);

    const entrega = classificarEntrega(card.dataVenda);
    const atrasado = entrega?.label === 'Atrasado' && card.etapa !== 'ENTREGUE';

    const entregaBadgeCls = entrega ? ({
        Atrasado: 'bg-red-100 text-red-800 border-red-300',
        Hoje: 'bg-orange-100 text-orange-800 border-orange-300',
        'Amanhã': 'bg-blue-100 text-blue-800 border-blue-300',
        Futuro: 'bg-gray-100 text-gray-700 border-gray-300'
    }[entrega.label] || 'bg-gray-100 text-gray-700 border-gray-300') : '';

    const entregaBase = entrega
        ? entrega.label === 'Atrasado'
            ? `${entrega.dataStr} · Atrasado ${Math.abs(entrega.dias)}d`
            : entrega.label === 'Futuro'
                ? entrega.dataStr
                : `${entrega.dataStr} · ${entrega.label}`
        : null;
    const entregaTexto = entregaBase && card.horaEntrega ? `${entregaBase} · ${card.horaEntrega}` : entregaBase;

    const pagBadge = {
        QUITADO: 'bg-green-100 text-green-800',
        PARCIAL: 'bg-amber-100 text-amber-800',
        ABERTO: 'bg-red-100 text-red-800'
    }[card.statusPagamento];

    const silenciado = !!card.silenciarWhatsapp;
    const qtdItens = (card.itens || []).length;

    const handleCardClick = (e) => {
        // Não abre detalhes se o clique veio de um botão/link interno
        if (e.target.closest('button, a')) return;
        onAbrirDetalhes && onAbrirDetalhes();
    };

    return (
        <div
            onClick={handleCardClick}
            className={`rounded-xl shadow-sm border p-3 text-xs space-y-2 cursor-pointer transition-colors ${
                naoFaturado
                    ? 'bg-gray-100 border-gray-300 opacity-90 hover:bg-gray-50'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
            } ${atrasado && !naoFaturado ? 'ring-2 ring-red-400' : ''} ${silenciado ? 'border-l-4 border-l-gray-400' : ''}`}
        >
            {naoFaturado && (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>Não faturado — não pode movimentar</span>
                </div>
            )}

            <div className="min-w-0">
                <div className="font-bold text-sm text-gray-900 truncate">
                    {card.cliente?.NomeFantasia || card.cliente?.Nome}
                </div>
                {card.numero && <div className="text-[11px] text-gray-500">Pedido #{card.numero}</div>}
                {entregaTexto && (
                    <div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border ${entregaBadgeCls}`}>
                        <Calendar className="h-3 w-3" />
                        {entregaTexto}
                    </div>
                )}
            </div>

            <EntregarEm
                modo={card.kitFesta?.modo ?? null}
                enderecoPedido={card.kitFesta?.enderecoEntrega ?? null}
                divergeCadastro={card.kitFesta?.divergeCadastro ?? null}
                enderecoCadastro={enderecoDoCadastro(card.cliente)}
            />

            {silenciado && (
                <div className="text-[11px] font-medium text-gray-600 bg-gray-100 rounded px-1.5 py-0.5 inline-block">
                    🔕 Cliente não receberá WhatsApp
                </div>
            )}
            {tel && <div className="text-gray-600 text-[11px]">{tel}</div>}

            {/* Itens recolhidos: o detalhe completo está no modal */}
            <div className="border-t pt-1">
                <button
                    type="button"
                    onClick={() => setItensAbertos(a => !a)}
                    aria-expanded={itensAbertos}
                    className="w-full flex items-center justify-between min-h-[44px] md:min-h-[32px] text-[12px] font-semibold text-gray-700"
                >
                    <span>{qtdItens} {qtdItens === 1 ? 'item' : 'itens'} · {fmtBRL(card.totalPedido)}</span>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${itensAbertos ? 'rotate-180' : ''}`} />
                </button>
                {itensAbertos && (
                    <div className="space-y-0.5 pb-1">
                        {(card.itens || []).map(i => (
                            <div key={i.id} className="flex justify-between text-[11px] text-gray-700">
                                <span className="truncate pr-2">{i.quantidade}× {i.produto?.nome}</span>
                                <span className="text-gray-600 shrink-0">{fmtBRL(i.quantidade * i.valor)}</span>
                            </div>
                        ))}
                        {card.frete > 0 && (
                            <div className="flex justify-between text-[11px] text-gray-700">
                                <span>Frete</span>
                                <span>{fmtBRL(card.frete)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${pagBadge}`}>
                    {card.statusPagamento === 'PARCIAL'
                        ? `Falta ${fmtBRL(card.aberto)}`
                        : card.statusPagamento === 'QUITADO' ? 'Quitado' : 'Em aberto'}
                </span>
            </div>

            {/* Ícones de apoio — linha própria, alvos de toque de 44px */}
            <div className="flex flex-wrap items-center gap-0 border-t pt-1">
                <button
                    onClick={(e) => { e.stopPropagation(); onHora(card); }}
                    title={card.horaEntrega ? `Horário de entrega: ${card.horaEntrega} (clique para alterar)` : 'Definir horário de entrega'}
                    aria-label="Horário de entrega"
                    className={`${card.horaEntrega ? 'text-primary' : 'text-gray-500 hover:text-primary'} ${BTN_ICONE}`}
                >
                    <Clock className="h-4 w-4" />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onEtiquetas(card); }}
                    title="Imprimir etiquetas das caixas (impressora de etiquetas)"
                    aria-label="Imprimir etiquetas"
                    className={`text-gray-500 hover:text-primary ${BTN_ICONE}`}
                >
                    <Printer className="h-4 w-4" />
                </button>
                <button
                    onClick={() => onToggleSilenciar(card)}
                    title={silenciado ? 'WhatsApp silenciado — clique para reativar' : 'Clique para NÃO enviar WhatsApp neste pedido'}
                    aria-label={silenciado ? 'Reativar WhatsApp' : 'Silenciar WhatsApp'}
                    className={`${silenciado ? 'text-gray-500 hover:text-gray-700' : 'text-emerald-600 hover:text-emerald-700'} ${BTN_ICONE}`}
                >
                    {silenciado
                        ? <MessageSquareOff className="h-4 w-4" />
                        : <MessageSquare className="h-4 w-4" />}
                </button>
                <button
                    onClick={() => onReenviar(card)}
                    disabled={moving}
                    title="Reenviar mensagem da etapa atual"
                    aria-label="Reenviar mensagem"
                    className={`text-primary hover:text-primaryDark disabled:opacity-40 ${BTN_ICONE}`}
                >
                    <Send className="h-4 w-4" />
                </button>
                {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" className={`text-green-600 hover:text-green-700 ${BTN_ICONE}`} title="Abrir conversa no WhatsApp" aria-label="Abrir conversa no WhatsApp">
                        <MessageCircle className="h-4 w-4" />
                    </a>
                )}
            </div>

            {/* Ação principal = próximo passo; "…" abre a janela com todas as etapas */}
            <div className="flex gap-2 items-stretch">
                {proxima ? (
                    <button
                        onClick={() => onMover(card)}
                        disabled={!naoFaturado && (!podeProxima || moving)}
                        title={naoFaturado ? 'Fature o pedido para movimentar' : (!podeProxima ? 'Sem permissão para esta etapa' : '')}
                        className={`flex-1 min-h-[44px] rounded-full text-sm font-extrabold transition-colors ${
                            naoFaturado
                                ? 'bg-gray-200 text-gray-600 hover:bg-gray-300 border border-dashed border-gray-400'
                                : podeProxima
                                    ? 'bg-primary hover:bg-primaryDark text-white shadow-sm disabled:opacity-60'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                        {moving ? '...' : ROTULO_PROXIMO[proxima]}
                    </button>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-green-700 font-bold">Entregue ✓</div>
                )}
                <button
                    onClick={() => onMover(card)}
                    disabled={!naoFaturado && (!podeAlgumaOutra || moving)}
                    title={naoFaturado ? 'Fature o pedido para movimentar' : 'Outras etapas (voltar ou pular)'}
                    aria-label="Mais opções de etapa"
                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <MoreHorizontal className="h-5 w-5" />
                </button>
            </div>
        </div>
    );
}

function ModalDetalhes({ card, perm, onClose, onMover }) {
    const cliente = card.cliente || {};
    const tel = cliente.Telefone_Celular || cliente.Telefone;
    const wa = whatsappLink(tel);
    const dataVenda = card.dataVenda ? new Date(card.dataVenda) : null;
    const dataVendaStr = dataVenda
        ? dataVenda.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
        : '-';
    const totalItens = (card.itens || []).reduce((s, i) => s + Number(i.quantidade), 0);
    const naoFaturado = card.situacaoCA !== 'FATURADO';
    const proxima = etapaSeguinte(card.etapa);
    const podeProxima = podeIrPara(perm, proxima);
    const podeAlgumaOutra = ETAPAS.some(e => e !== card.etapa && podeIrPara(perm, e));

    return createPortal(
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 md:p-4"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col"
            >
                <div className="px-4 md:px-5 py-3 border-b flex items-center justify-between shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 truncate">
                            {cliente.NomeFantasia || cliente.Nome || 'Pedido'}
                        </h3>
                        <p className="text-xs text-gray-500">
                            Pedido #{card.numero || '—'} · Entrega {dataVendaStr}{card.horaEntrega ? ` · ${card.horaEntrega}` : ''} · {LABELS[card.etapa]}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="text-gray-500 hover:text-gray-700 shrink-0 ml-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-4 md:px-5 py-4 overflow-y-auto flex-1 space-y-3 text-sm">
                    {/* "Entregar em" é o PRIMEIRO bloco */}
                    <EntregarEm
                        modo={card.kitFesta?.modo ?? null}
                        enderecoPedido={card.kitFesta?.enderecoEntrega ?? null}
                        divergeCadastro={card.kitFesta?.divergeCadastro ?? null}
                        enderecoCadastro={enderecoDoCadastro(cliente)}
                    />

                    {naoFaturado && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg p-2 text-xs text-amber-900">
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <strong>Pedido ainda não foi faturado.</strong> Fature primeiro para movimentar pelo Delivery.
                            </div>
                        </div>
                    )}

                    {tel && (
                        <div className="flex items-center gap-3">
                            <div>
                                <p className="text-[10px] uppercase font-semibold text-gray-500 mb-0.5">Telefone</p>
                                <p className="text-gray-800">{tel}</p>
                            </div>
                            {wa && (
                                <a href={wa} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 min-h-[44px] text-xs text-green-700 hover:text-green-800 underline">
                                    <MessageCircle className="h-3.5 w-3.5" /> Abrir WhatsApp
                                </a>
                            )}
                        </div>
                    )}

                    {card.vendedor?.nome && (
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-500 mb-0.5">Vendedor</p>
                            <p className="text-gray-800">{card.vendedor.nome}</p>
                        </div>
                    )}

                    <div>
                        <p className="text-[10px] uppercase font-semibold text-gray-500 mb-1">
                            Itens ({totalItens} un)
                        </p>
                        <div className="border rounded-lg divide-y">
                            {(card.itens || []).map(i => (
                                <div key={i.id} className="px-2.5 py-1.5 flex justify-between gap-2 text-xs">
                                    <span className="text-gray-800">
                                        <span className="font-medium">{i.quantidade}×</span> {i.produto?.nome}
                                    </span>
                                    <span className="text-gray-600 shrink-0">
                                        {fmtBRL(i.valor)} <span className="text-gray-400">·</span> {fmtBRL(i.quantidade * i.valor)}
                                    </span>
                                </div>
                            ))}
                            {card.frete > 0 && (
                                <div className="px-2.5 py-1.5 flex justify-between text-xs">
                                    <span className="text-gray-700">Frete</span>
                                    <span className="text-gray-700">{fmtBRL(card.frete)}</span>
                                </div>
                            )}
                            <div className="px-2.5 py-1.5 flex justify-between text-sm font-semibold bg-gray-50">
                                <span>Total</span>
                                <span>{fmtBRL(card.totalPedido)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-500 mb-0.5">Pagamento</p>
                            <p className="text-gray-800">
                                {card.statusPagamento === 'QUITADO' && <span className="text-green-700 font-semibold">Quitado</span>}
                                {card.statusPagamento === 'PARCIAL' && <span className="text-amber-700 font-semibold">Parcial — falta {fmtBRL(card.aberto)}</span>}
                                {card.statusPagamento === 'ABERTO' && <span className="text-red-700 font-semibold">Em aberto</span>}
                            </p>
                            {card.totalPago > 0 && (
                                <p className="text-[11px] text-gray-500">Pago: {fmtBRL(card.totalPago)}</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-500 mb-0.5">Faturamento</p>
                            <p className={naoFaturado ? 'text-amber-700 font-semibold' : 'text-green-700 font-semibold'}>
                                {card.situacaoCA || '—'}
                            </p>
                        </div>
                    </div>

                    {card.observacoes && (
                        <div>
                            <p className="text-[10px] uppercase font-semibold text-gray-500 mb-0.5">Observações</p>
                            <p className="text-gray-800 whitespace-pre-wrap text-xs bg-gray-50 border rounded-lg p-2">{card.observacoes}</p>
                        </div>
                    )}
                </div>

                {/* Rodapé fixo: o corpo rola, o botão de avançar fica sempre à vista */}
                <div className="px-4 md:px-5 py-3 border-t bg-gray-50 flex gap-2 shrink-0 rounded-b-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button onClick={onClose} className="min-h-[44px] px-4 text-sm font-medium border border-gray-300 rounded-full bg-white hover:bg-gray-100">
                        Fechar
                    </button>
                    {proxima ? (
                        <button
                            onClick={onMover}
                            disabled={!naoFaturado && !podeProxima}
                            className={`flex-1 min-h-[44px] rounded-full text-sm font-extrabold ${
                                naoFaturado
                                    ? 'bg-gray-200 text-gray-600 border border-dashed border-gray-400'
                                    : podeProxima
                                        ? 'bg-primary hover:bg-primaryDark text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            {ROTULO_PROXIMO[proxima]}
                        </button>
                    ) : (
                        <button
                            onClick={onMover}
                            disabled={!naoFaturado && !podeAlgumaOutra}
                            className="flex-1 min-h-[44px] rounded-full text-sm font-bold border border-primary text-primary bg-white hover:bg-mint/40 disabled:opacity-40"
                        >
                            Mover…
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

// Popover pequeno (modal centralizado, funciona igual no celular) para acertar o horário da entrega
function ModalHoraEntrega({ card, onClose, onSalvar }) {
    const [hora, setHora] = useState(card.horaEntrega || '');
    const [salvando, setSalvando] = useState(false);
    const nome = card.cliente?.NomeFantasia || card.cliente?.Nome || 'Pedido';
    const salvar = async (valor) => {
        setSalvando(true);
        try { await onSalvar(valor); } finally { setSalvando(false); }
    };
    return (
        <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600">Horário de entrega</h3>
                        <p className="text-xs text-gray-500 truncate">{nome}{card.numero ? ` · Pedido #${card.numero}` : ''}</p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="text-gray-500 hover:text-gray-700 min-h-[44px] min-w-[44px] -m-3 inline-flex items-center justify-center shrink-0">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <CampoHorarioEntrega value={hora} onChange={setHora} />
                <p className="text-xs text-gray-500 mt-2">Sem horário, a entrega vale o dia todo.</p>
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={() => salvar(null)}
                        disabled={salvando || !card.horaEntrega}
                        className="min-h-[44px] px-4 rounded-full border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    >
                        Limpar
                    </button>
                    <button
                        onClick={() => salvar(hora || null)}
                        disabled={salvando || (hora || '') === (card.horaEntrega || '')}
                        className="flex-1 min-h-[44px] px-4 rounded-full bg-primary hover:bg-primaryDark text-white text-sm font-semibold shadow-sm disabled:opacity-50"
                    >
                        {salvando ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
