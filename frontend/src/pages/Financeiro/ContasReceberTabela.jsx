import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import contasReceberService from '../../services/contasReceberService';
import vendedorService from '../../services/vendedorService';
import pedidoService from '../../services/pedidoService';
import clienteService from '../../services/clienteService';
import categoriaClienteService from '../../services/categoriaClienteService';
import ClientePopup from '../Rota/ClientePopup';
import SelectBusca from '../../components/SelectBusca';
import {
    DollarSign, Search, Filter, X, RefreshCw, CheckCircle, Undo2,
    Download, ArrowUpDown, CheckSquare, Square, Link as LinkIcon,
    ChevronDown, ChevronUp, MoreVertical, Eye, Package, Truck, Wallet,
    Receipt, FileText
} from 'lucide-react';
import asaasService from '../../services/asaasService';
import BoletosAsaasModal from './BoletosAsaasModal';
import BaixaParcelaModal, { FORMAS_BAIXA_MANUAL } from './BaixaParcelaModal';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useFiltrosSalvos, useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import { opcoesVendedorMulti } from '../../utils/vendedoresFiltro';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-';
// YYYY-MM-DD no fuso de SP — mesma data que fmtData mostra, p/ comparar com inputs date.
const toYMD = (d) => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '';

const STATUS_CONTA = {
    ABERTO: 'bg-blue-100 text-blue-800',
    PARCIAL: 'bg-yellow-100 text-yellow-800',
    QUITADO: 'bg-green-100 text-green-800',
    CANCELADO: 'bg-gray-200 text-gray-500'
};
const STATUS_PARC = {
    PENDENTE: 'bg-gray-100 text-gray-700',
    PARCIAL: 'bg-yellow-100 text-yellow-800',
    PAGO: 'bg-green-100 text-green-700',
    VENCIDO: 'bg-red-100 text-red-700',
    CANCELADO: 'bg-gray-100 text-gray-400'
};

// Responsável pela cobrança: o backend manda em `conta.responsaveis` o nome pronto
// para exibir ({ tipo, pessoaId, pessoaNome, valor }), já agrupado por pessoa — um
// título pode ter mais de um (linhas de pagamento diferentes). Aqui achamos, para cada
// LINHA de pagamento, a entrada correspondente.
const responsavelDaLinha = (pg, responsaveis) => {
    const lista = Array.isArray(responsaveis) ? responsaveis : [];
    // Linha com vendedor marcado vence o escritório — mesma regra do backend.
    if (pg?.vendedorResponsavelId) {
        return lista.find(r => r?.tipo === 'VENDEDOR' && r?.pessoaId === pg.vendedorResponsavelId) || null;
    }
    if (pg?.escritorioResponsavel) return lista.find(r => r?.tipo === 'ESCRITORIO') || null;
    return null;
};

// Selo da linha: COR e NOME contam a mesma história. Quando a linha tem as duas
// marcações vale o VENDEDOR (regra do backend) — então o selo é o azul de vendedor com
// o nome dele, nunca o âmbar de escritório com nome de vendedor dentro.
// Sem `responsaveis` (título antigo, ou popup do pedido) cai no nome do vendedor que já
// temos na tela e, em último caso, no rótulo genérico de antes.
const seloResponsavel = (pg, responsaveis, vendedorPorId) => {
    const r = responsavelDaLinha(pg, responsaveis);
    if (pg?.vendedorResponsavelId) {
        const nome = r?.pessoaNome || vendedorPorId?.[pg.vendedorResponsavelId];
        return {
            tipo: 'VENDEDOR',
            texto: nome ? `Vendedor: ${nome}` : 'Vendedor resp.',
            classe: 'bg-blue-100 text-blue-800'
        };
    }
    if (pg?.escritorioResponsavel) {
        return {
            tipo: 'ESCRITORIO',
            // `pessoaNome` do escritório já vem como "Escritório" / "Escritório — lançado
            // por Fulano" — não prefixar de novo.
            texto: r?.pessoaNome || 'Escritório resp.',
            classe: 'bg-amber-100 text-amber-700'
        };
    }
    return null;
};

// Selo pronto para render — um só por linha de pagamento.
const SeloResponsavel = ({ pg, responsaveis, vendedorPorId }) => {
    const selo = seloResponsavel(pg, responsaveis, vendedorPorId);
    if (!selo) return null;
    return (
        <span className={`px-2 py-1 text-xs font-semibold rounded-full truncate ${selo.classe}`} title={selo.texto}>
            {selo.texto}
        </span>
    );
};

const FORMAS = ['Dinheiro', 'Pix', 'Boleto', 'Cartão Crédito', 'Cartão Débito', 'Transferência', 'Cheque', 'Outro'];

// Menu de seleção MÚLTIPLA usado em todos os filtros da tela.
// Fica em escopo de MÓDULO de propósito: declarado dentro da página, o React o
// recriava a cada render (novo tipo de componente) e o menu fechava sozinho a cada
// clique — na prática dava para marcar só uma opção por caixa.
// `options`: array de strings OU de { valor, label }.
const FiltroMulti = ({ label, options, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [busca, setBusca] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [open]);

    const val = (opt) => (typeof opt === 'string' ? opt : opt.valor);
    const lab = (opt) => (typeof opt === 'string' ? opt : opt.label);

    // Valor já escolhido que não está (mais) na lista de opções continua aparecendo:
    // sem isso o usuário não consegue desmarcar o que ele mesmo marcou.
    const todas = useMemo(() => {
        const conhecidos = new Set(options.map(o => (typeof o === 'string' ? o : o.valor)));
        return [...options, ...value.filter(v => !conhecidos.has(v))];
    }, [options, value]);

    const q = busca.trim().toLowerCase();
    const visiveis = q ? todas.filter(o => String(lab(o)).toLowerCase().includes(q)) : todas;
    const labelDoValor = (v) => lab(todas.find(o => val(o) === v) ?? v);
    const toggle = (opt) => {
        const v = val(opt);
        onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
    };
    const resumo = value.length === 0 ? label : value.length === 1 ? labelDoValor(value[0]) : `${value.length} selec.`;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => { setOpen(v => !v); setBusca(''); }}
                className={`w-full min-h-[38px] flex items-center justify-between gap-1.5 border rounded-lg px-2.5 py-1.5 text-sm bg-white text-left hover:bg-gray-50 focus:outline-none ${open || value.length ? 'border-primary' : 'border-gray-300'}`}
            >
                <span className={`truncate ${value.length === 0 ? 'text-gray-400' : 'text-gray-800 font-medium'}`}>{resumo}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    {todas.length > 8 && (
                        <div className="sticky top-0 bg-white p-1.5 border-b border-gray-100">
                            <input
                                autoFocus
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                placeholder="Buscar…"
                                className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    )}
                    {value.length > 0 && (
                        <button type="button" onClick={() => onChange([])} className="w-full text-left text-xs text-primary font-medium px-2.5 py-1.5 border-b border-gray-100 hover:bg-gray-50">
                            Limpar seleção ({value.length})
                        </button>
                    )}
                    {visiveis.length === 0 && <div className="px-2.5 py-2 text-xs text-gray-400">Sem opções</div>}
                    {visiveis.map(opt => (
                        <label key={val(opt)} className="flex items-center gap-2 px-2.5 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={value.includes(val(opt))}
                                onChange={() => toggle(opt)}
                                className="cursor-pointer accent-[#00754A]"
                            />
                            <span className="truncate">{lab(opt)}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

const ContasReceberTabela = () => {
    const { user } = useAuth();
    const podeBaixar = user?.permissoes?.admin || user?.permissoes?.Pode_Baixar_Contas_Receber;
    const podeDarDesconto = user?.permissoes?.admin || user?.permissoes?.Pode_Dar_Desconto_Baixa;
    // Baixa digitada aqui é a exceção (o normal é conciliação ou caixa) — permissão própria
    const podeBaixaManual = user?.permissoes?.admin || user?.permissoes?.Pode_Baixar_Contas_Receber_Manual;

    const [linhas, setLinhas] = useState([]);
    // Mensagem do servidor quando a busca é recusada (ex.: 400 de filtro inválido).
    // Sem isso a tela ficaria vazia sem explicar por quê.
    const [erroLista, setErroLista] = useState(null);
    const [indicadores, setIndicadores] = useState({});
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(null);
    const [syncingTodas, setSyncingTodas] = useState(false);
    const [syncLog, setSyncLog] = useState(null); // { progresso, total, itens: [{pedido, status, msg, aplicadas}], ativo }
    const [pedidoPopup, setPedidoPopup] = useState(null); // pedido completo
    const [pedidoLoading, setPedidoLoading] = useState(false);
    const [clientePopup, setClientePopup] = useState(null);

    const [vendedores, setVendedores] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [tiposCobranca, setTiposCobranca] = useState([]); // [{ valor, label }] — Boleto, Pix, ...
    const [usuariosBaixa, setUsuariosBaixa] = useState([]); // [{ valor, label }] — quem já deu baixa
    const [responsaveisOpc, setResponsaveisOpc] = useState([]); // [{ tipo, pessoaId, valor, label }]

    // Busca por texto livre — não persiste (useState normal)
    const [busca, setBusca] = useState('');
    // Filtros — TODOS são ARRAYS (seleção múltipla): dá para escolher mais de uma
    // opção em cada caixa e combinar quantas caixas quiser.
    // Persistidos por usuário/tela via useFiltrosSalvos (chave v2: o formato mudou —
    // datas saíram daqui para o FiltroPeriodo e origem/vendedor/categoria viraram lista).
    const [filtros, setFiltros] = useFiltrosSalvos('contas-receber-tabela-v2', {
        status: [],
        statusParcela: [],
        origem: [],
        vendedorId: [],
        categoriaClienteId: [],
        condicaoPagamento: [],
        tipoCobranca: [],
        formaPagamentoEntrega: [],
        formaPagamento: [],
        baixadoPorId: [],
        // Responsável pela cobrança: cada valor é o ID do vendedor OU a palavra
        // 'ESCRITORIO' (é o `valor` que o próprio backend manda em /responsaveis).
        responsavel: []
    });
    // Datas no padrão do sistema (FiltroPeriodo). Padrão 'todo' = sem recorte de data,
    // que é como a tela sempre abriu.
    const [periodoVenc, periodoVencCtl] = usePeriodoSalvo('contas-receber-tabela:venc', 'todo');
    const [periodoPag, periodoPagCtl] = usePeriodoSalvo('contas-receber-tabela:pag', 'todo');
    const { de: vencDe, ate: vencAte } = periodoVenc;
    const { de: pagDe, ate: pagAte } = periodoPag;
    const [relatorioFiltros, setRelatorioFiltros] = useState({ vencDe: '', vencAte: '', categoriaClienteId: [] });

    // Ordenação client-side (persistida)
    const [sort, setSort] = useFiltrosSalvos('contas-receber-tabela:sort', { col: 'vencimento', dir: 'asc' });

    // Seleção
    const [sel, setSel] = useState(new Set());

    // UI
    const [filtrosAbertos, setFiltrosAbertos] = useState(false);
    const [detalheLinha, setDetalheLinha] = useState(null);

    // Boletos Asaas (integração configurada no servidor?)
    const [asaasDisponivel, setAsaasDisponivel] = useState(false);
    const [boletosModal, setBoletosModal] = useState(null); // { id, clienteNome, pedidoNumero }
    useEffect(() => {
        asaasService.status()
            .then(s => setAsaasDisponivel(!!s.configurado))
            .catch(() => setAsaasDisponivel(false));
    }, []);
    const [baixaModalLinha, setBaixaModalLinha] = useState(null);

    // Modais
    const [baixaLoteOpen, setBaixaLoteOpen] = useState(false);
    const [baixaLoteForm, setBaixaLoteForm] = useState({ formaPagamento: '', dataPagamento: '', observacao: '' });
    const [salvando, setSalvando] = useState(false);
    const [relatorioOpen, setRelatorioOpen] = useState(false);
    const [relatorioData, setRelatorioData] = useState(null);
    const [relatorioLoading, setRelatorioLoading] = useState(false);
    const [relatorioAgrupamento, setRelatorioAgrupamento] = useFiltroSalvo('contas-receber-tabela:relatorioAgrupamento', 'pedido'); // pedido | cliente | vendedor | nenhum

    // Opções fixas dos menus (condição, condição na entrega, forma da baixa).
    // Vêm do banco INTEIRO, uma vez só. Antes eram deduzidas das linhas já filtradas:
    // ao escolher uma opção as demais sumiam do menu — inclusive a escolhida — e não
    // dava para desmarcar; a lista só voltava limpando todos os filtros.
    const [opcoes, setOpcoes] = useState({ condicoes: [], formasEntrega: [], formasBaixa: [] });

    // Carrega aux
    useEffect(() => {
        // Filtro de consulta: inclui vendedor inativo (título antigo continua no nome dele).
        vendedorService.listarParaFiltro().then(setVendedores).catch(() => {});
        categoriaClienteService.listar().then(setCategorias).catch(() => {});
        contasReceberService.tiposCobranca().then(setTiposCobranca).catch(() => {});
        contasReceberService.baixadoPor().then(setUsuariosBaixa).catch(() => {});
        contasReceberService.opcoesFiltros().then(setOpcoes).catch(() => {});
        contasReceberService.responsaveis().then(r => setResponsaveisOpc(Array.isArray(r) ? r : [])).catch(() => {});
    }, []);

    const condicoes = opcoes.condicoes;
    const formasEntregaUsadas = opcoes.formasEntrega;
    // Formas da baixa: as fixas do sistema + o que já foi usado historicamente
    const formasUsadas = useMemo(
        () => [...new Set([...FORMAS, ...opcoes.formasBaixa])],
        [opcoes.formasBaixa]
    );

    // Opções do filtro "Responsável" — o backend já manda { valor, label } prontos
    // (`valor` = id do vendedor, ou a palavra ESCRITORIO).
    const opcoesResponsavel = useMemo(() => (
        (responsaveisOpc || [])
            .filter(r => r?.valor)
            .map(r => ({ valor: r.valor, label: r.label || r.pessoaNome || 'Sem nome' }))
    ), [responsaveisOpc]);

    // id -> nome do vendedor: rede de segurança para o selo quando a conta não trouxer
    // `responsaveis` (título antigo) ou no popup do pedido.
    const vendedorPorId = useMemo(() => {
        const m = {};
        (vendedores || []).forEach(v => { if (v?.id) m[v.id] = v.nome || v.Nome; });
        (responsaveisOpc || []).forEach(r => { if (r?.pessoaId) m[r.pessoaId] = r.label || r.pessoaNome; });
        return m;
    }, [vendedores, responsaveisOpc]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (busca) params.busca = busca;
            // ABERTO inclui PARCIAL (conta com pagamento parcial ainda está em aberto)
            const statusQuery = filtros.status.includes('ABERTO')
                ? [...new Set([...filtros.status, 'PARCIAL'])]
                : filtros.status;
            if (statusQuery.length) params.status = statusQuery.join(',');
            if (filtros.statusParcela.length) params.statusParcela = filtros.statusParcela.join(',');
            if (filtros.origem.length) params.origem = filtros.origem.join(',');
            if (filtros.vendedorId.length) params.vendedorId = filtros.vendedorId.join(',');
            if (filtros.categoriaClienteId.length) params.categoriaClienteId = filtros.categoriaClienteId.join(',');
            if (filtros.condicaoPagamento.length) params.condicaoPagamento = filtros.condicaoPagamento.join(',');
            if (filtros.tipoCobranca.length) params.tipoCobranca = filtros.tipoCobranca.join(',');
            if (filtros.formaPagamentoEntrega.length) params.formaPagamentoEntrega = filtros.formaPagamentoEntrega.join(',');
            if (filtros.formaPagamento.length) params.formaPagamento = filtros.formaPagamento.join(',');
            if (filtros.baixadoPorId.length) params.baixadoPorId = filtros.baixadoPorId.join(',');
            // Responsável pela cobrança: UMA regra só, no servidor. `responsaveis` aceita
            // lista (id do vendedor e/ou a palavra ESCRITORIO). Recortar no navegador
            // deixava os indicadores no topo somando a empresa inteira numa tela filtrada.
            if (filtros.responsavel?.length) params.responsaveis = filtros.responsavel.join(',');
            if (vencDe) params.vencimentoDe = vencDe;
            if (vencAte) params.vencimentoAte = vencAte;
            if (pagDe) params.pagamentoDe = pagDe;
            if (pagAte) params.pagamentoAte = pagAte;

            const data = await contasReceberService.listar(params);
            // Flatten: uma linha por parcela
            const flat = [];
            (data.contas || []).forEach(c => {
                (c.parcelas || []).forEach(p => {
                    flat.push({
                        contaId: c.id,
                        parcelaId: p.id,
                        clienteNome: c.clienteNome,
                        clienteId: c.clienteId,
                        pedidoId: c.pedidoId,
                        pedidoNumero: c.pedidoNumero,
                        pedidoEspecial: c.pedidoEspecial,
                        idVendaContaAzul: c.idVendaContaAzul,
                        origem: c.origem,
                        condicaoPagamento: c.condicaoPagamento,
                        statusEntrega: c.statusEntrega,
                        pagamentosEntrega: c.pagamentosEntrega || [],
                        // [{ tipo, pessoaId, pessoaNome, valor }] — quem ficou responsável pela cobrança
                        responsaveis: c.responsaveis || [],
                        vendedorNome: c.vendedorNome,
                        vendedorId: c.vendedorId,
                        statusConta: c.status,
                        numeroParcela: p.numeroParcela,
                        parcelasTotal: c.parcelasTotal,
                        valor: p.valor,
                        dataVencimento: p.dataVencimento,
                        statusParcela: p.status,
                        dataPagamento: p.dataPagamento,
                        valorPago: p.valorPago,
                        formaPagamento: p.formaPagamento,
                        baixadoPorId: p.baixadoPorId,
                        baixadoPorNome: p.baixadoPorNome
                    });
                });
            });
            // Filtro client-side extra para statusParcela/forma (quando some: combina em AND)
            let filtered = flat;
            if (filtros.statusParcela.length) {
                filtered = filtered.filter(l => filtros.statusParcela.includes(l.statusParcela));
            } else {
                // Visão padrão de "Contas a Receber": mostra apenas o que falta receber.
                // Os filtros de data de pagamento / forma da baixa miram justamente parcelas
                // pagas, então quando ativos não escondemos nada (os filtros abaixo refinam).
                const filtrandoPagas = !!pagDe || !!pagAte || filtros.formaPagamento.length > 0 || filtros.baixadoPorId.length > 0;
                if (!filtrandoPagas) {
                    filtered = filtered.filter(l => {
                        // Sempre mostra o que ainda falta receber (inclui parcelas com baixa parcial).
                        if (l.statusParcela === 'PENDENTE' || l.statusParcela === 'VENCIDO' || l.statusParcela === 'PARCIAL') return true;
                        // Parcela paga/cancelada só aparece se a CONTA dela tem um status que o
                        // usuário pediu explicitamente (ex.: QUITADO mostra suas pagas; CANCELADO
                        // mostra suas canceladas). Isso impede que escolher QUITADO/CANCELADO
                        // ressuscite as parcelas pagas de contas ainda em aberto (PARCIAL).
                        return filtros.status.includes(l.statusConta);
                    });
                }
            }
            if (filtros.formaPagamento.length) filtered = filtered.filter(l => filtros.formaPagamento.includes(l.formaPagamento || ''));
            // O backend filtra a CONTA (some) — aqui refina para a parcela baixada por quem foi pedido
            if (filtros.baixadoPorId.length) filtered = filtered.filter(l => filtros.baixadoPorId.includes(l.baixadoPorId || ''));
            // Refino de data no nível da PARCELA: o backend filtra a CONTA (some), então sem
            // isto uma conta entraria trazendo parcelas com vencimento/pagamento fora do range.
            if (vencDe) filtered = filtered.filter(l => toYMD(l.dataVencimento) >= vencDe);
            if (vencAte) filtered = filtered.filter(l => toYMD(l.dataVencimento) <= vencAte);
            if (pagDe) filtered = filtered.filter(l => l.dataPagamento && toYMD(l.dataPagamento) >= pagDe);
            if (pagAte) filtered = filtered.filter(l => l.dataPagamento && toYMD(l.dataPagamento) <= pagAte);
            setLinhas(filtered);
            setIndicadores(data.indicadores || {});
            setErroLista(null);
        } catch (e) {
            const msg = e.response?.data?.error || 'Erro ao carregar';
            toast.error(msg);
            // Recusa do servidor (400): a lista antiga não vale mais para os filtros
            // atuais — limpamos e explicamos, em vez de mostrar dado velho como se
            // fosse o resultado do filtro.
            if (e.response?.status === 400) { setLinhas([]); setIndicadores({}); }
            setErroLista(msg);
        } finally {
            setLoading(false);
        }
    }, [filtros, busca, vencDe, vencAte, pagDe, pagAte]);

    useEffect(() => { fetchData(); }, []); // eslint-disable-line

    // Auto-refresh quando qualquer filtro muda (exceto "busca", que usa Enter/botão).
    // Stringifica arrays/strings pra evitar trigger por nova ref a cada render.
    const didMount = useRef(false);
    const filtrosKey = JSON.stringify({ ...filtros, vencDe, vencAte, pagDe, pagAte });
    useEffect(() => {
        if (!didMount.current) { didMount.current = true; return; }
        fetchData();
    }, [filtrosKey]); // eslint-disable-line

    const aplicarFiltros = () => fetchData();
    const limparFiltros = () => {
        setBusca('');
        setFiltros({
            status: [], statusParcela: [], origem: [], vendedorId: [], categoriaClienteId: [],
            condicaoPagamento: [], tipoCobranca: [], formaPagamentoEntrega: [], formaPagamento: [],
            baixadoPorId: [], responsavel: []
        });
        periodoVencCtl.limpar();
        periodoPagCtl.limpar();
        // fetchData é disparado pelo useEffect acima quando filtrosKey muda.
    };

    // Ordenação
    const linhasOrdenadas = useMemo(() => {
        const copy = [...linhas];
        const k = sort.col;
        const dir = sort.dir === 'asc' ? 1 : -1;
        copy.sort((a, b) => {
            let va = a[k], vb = b[k];
            if (k === 'vencimento') { va = a.dataVencimento; vb = b.dataVencimento; }
            if (k === 'pagamento') { va = a.dataPagamento || ''; vb = b.dataPagamento || ''; }
            if (k === 'valor') { va = Number(a.valor); vb = Number(b.valor); }
            if (va == null) va = '';
            if (vb == null) vb = '';
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
        return copy;
    }, [linhas, sort]);

    const toggleSort = (col) => setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));

    // Relatório reflete a tabela: só entram pedidos com alguma parcela visível na lista atual.
    const relatorioPedidos = useMemo(() => {
        const pedidos = relatorioData?.pedidos || [];
        const visiveis = new Set(linhasOrdenadas.map(l => l.pedidoId).filter(Boolean));
        return pedidos.filter(p => visiveis.has(p.pedidoId));
    }, [relatorioData, linhasOrdenadas]);

    // Seleção — baixa em lote só aceita parcela ainda sem nenhum pagamento (valor cheio)
    const elegivel = (l) => l.statusParcela === 'PENDENTE' || l.statusParcela === 'VENCIDO';
    // Baixa individual (com valor parcial/desconto) também aceita parcela já parcialmente paga
    const elegivelBaixa = (l) => elegivel(l) || l.statusParcela === 'PARCIAL';
    const saldoRestante = (l) => Number(l.valor) - Number(l.valorPago || 0) - Number(l.valorDescontoTotal || 0);
    // O que já entrou na parcela: dinheiro recebido + desconto concedido (o desconto abate
    // o que falta receber, então tem que aparecer junto — senão a conta não fecha na tela).
    const recebidoNaParcela = (l) => Number(l.valorPago || 0) + Number(l.valorDescontoTotal || 0);
    const temDesconto = (l) => Number(l.valorDescontoTotal || 0) > 0;
    const selElegiveis = linhasOrdenadas.filter(elegivel);
    const todasSelecionadas = selElegiveis.length > 0 && selElegiveis.every(l => sel.has(l.parcelaId));
    const toggleOne = (id) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleTodas = () => setSel(p => {
        if (todasSelecionadas) { const n = new Set(p); selElegiveis.forEach(l => n.delete(l.parcelaId)); return n; }
        const n = new Set(p); selElegiveis.forEach(l => n.add(l.parcelaId)); return n;
    });

    const valorSel = useMemo(() =>
        linhasOrdenadas.filter(l => sel.has(l.parcelaId)).reduce((s, l) => s + Number(l.valor || 0), 0)
    , [linhasOrdenadas, sel]);

    // Selecionou título cobrado em boleto/Pix? Só avisa (cliente pode ter pago em espécie),
    // mas o aviso evita quitar na mão o que a conciliação já vai baixar sozinha.
    const selTemCobrancaEletronica = useMemo(() =>
        linhasOrdenadas.some(l => sel.has(l.parcelaId) && /boleto|pix/i.test(l.condicaoPagamento || ''))
    , [linhasOrdenadas, sel]);

    // Baixa individual — abre modal com valor recebido/desconto (aceita parcial e 100% desconto)
    const handleBaixar = (l) => {
        if (!podeBaixaManual) return;
        setBaixaModalLinha(l);
    };

    const handleEstornar = async (l) => {
        if (!window.confirm(`Estornar baixa da parcela ${l.numeroParcela}?`)) return;
        try {
            await contasReceberService.estornarBaixa(l.parcelaId);
            toast.success('Estornado');
            fetchData();
        } catch (e) { toast.error(e.response?.data?.error || 'Erro'); }
    };

    const handleSyncCATodas = async () => {
        // Itera pelas contas VISÍVEIS na tela (únicas), uma por uma, com log detalhado.
        const contasUnicas = [];
        const seen = new Set();
        for (const l of linhasOrdenadas) {
            if (seen.has(l.contaId)) continue;
            if (!l.idVendaContaAzul) continue;
            if (l.statusConta === 'QUITADO' || l.statusConta === 'CANCELADO') continue;
            seen.add(l.contaId);
            contasUnicas.push(l);
        }
        if (contasUnicas.length === 0) { toast('Nenhuma conta elegível visível na tela.'); return; }
        if (!window.confirm(`Verificar ${contasUnicas.length} conta(s) visíveis no Conta Azul? Uma por uma, com log detalhado.`)) return;

        setSyncingTodas(true);
        setSyncLog({ progresso: 0, total: contasUnicas.length, itens: [], ativo: true, totalAplicadas: 0, erros: 0 });

        let totalAplicadas = 0;
        let erros = 0;
        const itens = [];
        for (let i = 0; i < contasUnicas.length; i++) {
            const l = contasUnicas[i];
            const label = l.pedidoNumero ? `#${l.pedidoNumero}` : l.contaId.slice(0, 8);
            try {
                const r = await contasReceberService.syncCA(l.contaId);
                const aplicadas = r.aplicadas || 0;
                const vencAt = r.vencimentosAtualizados || 0;
                totalAplicadas += aplicadas;
                itens.push({
                    pedido: label,
                    cliente: l.clienteNome,
                    status: (aplicadas > 0 || vencAt > 0) ? 'ok' : 'semmudanca',
                    msg: r.message || r.mensagem || 'Sem alterações',
                    aplicadas,
                    debug: r.debug || null,
                    raw: r
                });
            } catch (e) {
                erros++;
                itens.push({
                    pedido: label,
                    cliente: l.clienteNome,
                    status: 'erro',
                    msg: e.response?.data?.error || e.message || 'Erro desconhecido',
                    aplicadas: 0,
                    debug: e.response?.data?.detalhe || null,
                    raw: e.response?.data || { error: e.message }
                });
            }
            setSyncLog({ progresso: i + 1, total: contasUnicas.length, itens: [...itens], ativo: i + 1 < contasUnicas.length, totalAplicadas, erros });
            // throttle entre contas pra evitar rate limit do CA (10 req/s)
            if (i + 1 < contasUnicas.length) await new Promise(r => setTimeout(r, 800));
        }

        toast.success(`Concluído: ${totalAplicadas} parcela(s) baixadas em ${contasUnicas.length} conta(s). ${erros} erro(s).`, { duration: 6000 });
        fetchData();
        setSyncingTodas(false);
    };

    const handleSyncCA = async (contaId, idVendaCA) => {
        if (!idVendaCA) { toast.error('Pedido ainda não foi ao CA'); return; }
        setSyncing(contaId);
        try {
            const r = await contasReceberService.syncCA(contaId);
            toast.success(r.message);
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro na sincronização CA');
        } finally { setSyncing(null); }
    };

    const handleBaixaLote = async () => {
        if (sel.size === 0) return;
        setSalvando(true);
        try {
            const r = await contasReceberService.darBaixaLote({
                parcelaIds: [...sel],
                formaPagamento: baixaLoteForm.formaPagamento || null,
                dataPagamento: baixaLoteForm.dataPagamento || null,
                observacao: baixaLoteForm.observacao || null,
                contaFinanceiraCaId: null // servidor lança na conta em espécie (Caixinha)
            });
            toast.success(r.message);
            setBaixaLoteOpen(false);
            setSel(new Set());
            fetchData();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao baixar');
        } finally { setSalvando(false); }
    };

    const exportarCSV = () => {
        const header = ['Pedido','Cliente','Vendedor','Condição','Origem','Status Conta','Parcela','Valor','Vencimento','Status Parcela','Pagamento','Forma','Baixado por'];
        const rows = linhasOrdenadas.map(l => [
            l.pedidoNumero || '',
            l.clienteNome,
            l.vendedorNome || '',
            l.condicaoPagamento || '',
            l.origem,
            l.statusConta,
            `${l.numeroParcela}/${l.parcelasTotal}`,
            Number(l.valor).toFixed(2).replace('.', ','),
            fmtData(l.dataVencimento),
            l.statusParcela,
            fmtData(l.dataPagamento),
            l.formaPagamento || '',
            l.baixadoPorNome || ''
        ]);
        const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `contas-receber-${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    const buscarRelatorio = async (rf) => {
        setRelatorioLoading(true);
        setRelatorioData(null);
        try {
            const params = {};
            if (busca) params.busca = busca;
            const statusQueryRel = filtros.status.includes('ABERTO')
                ? [...new Set([...filtros.status, 'PARCIAL'])]
                : filtros.status;
            if (statusQueryRel.length) params.status = statusQueryRel.join(',');
            if (filtros.statusParcela.length) params.statusParcela = filtros.statusParcela.join(',');
            if (filtros.origem.length) params.origem = filtros.origem.join(',');
            if (filtros.vendedorId.length) params.vendedorId = filtros.vendedorId.join(',');
            if (filtros.condicaoPagamento.length) params.condicaoPagamento = filtros.condicaoPagamento.join(',');
            if (filtros.tipoCobranca.length) params.tipoCobranca = filtros.tipoCobranca.join(',');
            if (filtros.formaPagamentoEntrega.length) params.formaPagamentoEntrega = filtros.formaPagamentoEntrega.join(',');
            if (filtros.formaPagamento.length) params.formaPagamento = filtros.formaPagamento.join(',');
            if (filtros.baixadoPorId.length) params.baixadoPorId = filtros.baixadoPorId.join(',');
            if (pagDe) params.pagamentoDe = pagDe;
            if (pagAte) params.pagamentoAte = pagAte;
            // Filtros do próprio modal de relatório
            if (rf.vencDe) params.vencimentoDe = rf.vencDe;
            if (rf.vencAte) params.vencimentoAte = rf.vencAte;
            if (rf.categoriaClienteId?.length) params.categoriaClienteId = rf.categoriaClienteId.join(',');
            const data = await contasReceberService.relatorioItens(params);
            setRelatorioData(data);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao gerar relatório');
        } finally {
            setRelatorioLoading(false);
        }
    };

    const abrirRelatorio = () => {
        const rf = { vencDe, vencAte, categoriaClienteId: filtros.categoriaClienteId };
        setRelatorioFiltros(rf);
        setRelatorioOpen(true);
        buscarRelatorio(rf);
    };

    // Agrupa pedidos conforme seleção
    const gerarGrupos = (pedidos, agrupamento) => {
        if (agrupamento === 'cliente' || agrupamento === 'vendedor') {
            const map = new Map();
            pedidos.forEach(p => {
                const key = agrupamento === 'cliente' ? p.clienteNome : (p.vendedorNome || '-');
                if (!map.has(key)) map.set(key, { chave: key, total: 0, pedidos: [] });
                const g = map.get(key);
                g.pedidos.push(p);
                g.total += p.subtotal;
            });
            return [...map.values()].sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
        }
        // 'pedido' e 'nenhum' — sem grupos, usa pedidos diretamente
        return [{ chave: null, total: pedidos.reduce((s, p) => s + p.subtotal, 0), pedidos }];
    };

    const exportarRelatorioCSV = () => {
        if (!relatorioData?.pedidos) return;
        const header = agrupamento => agrupamento === 'nenhum'
            ? ['Pedido', 'Cliente', 'Vendedor', 'Data Venda', 'Produto', 'Qtd', 'Valor Unit.', 'Total']
            : ['Grupo', 'Pedido', 'Cliente', 'Vendedor', 'Data Venda', 'Produto', 'Qtd', 'Valor Unit.', 'Total'];
        const rows = [];
        const grupos = gerarGrupos(relatorioPedidos, relatorioAgrupamento);
        grupos.forEach(g => {
            if (g.chave) rows.push([g.chave, '', '', '', '', `--- Total: R$ ${fmt(g.total)}`, '', '', '']);
            g.pedidos.forEach(p => {
                (p.itens || []).forEach(it => {
                    const base = [
                        p.pedidoNumero ? `#${p.pedidoNumero}` : (p.pedidoEspecial ? 'Especial' : '-'),
                        p.clienteNome, p.vendedorNome, fmtData(p.dataVenda),
                        it.produtoNome,
                        Number(it.quantidade).toFixed(3).replace('.', ','),
                        Number(it.valorUnitario).toFixed(2).replace('.', ','),
                        Number(it.total).toFixed(2).replace('.', ',')
                    ];
                    rows.push(g.chave ? [g.chave, ...base] : base);
                });
                const sub = ['', '', '', '', '', 'SUBTOTAL', '', '', Number(p.subtotal).toFixed(2).replace('.', ',')];
                rows.push(g.chave ? [g.chave, ...sub.slice(1)] : sub.slice(1));
            });
        });
        const h = header(relatorioAgrupamento);
        const csv = [h, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `relatorio-itens-${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    const imprimirRelatorio = () => {
        if (!relatorioData?.pedidos) return;
        const grupos = gerarGrupos(relatorioPedidos, relatorioAgrupamento);
        const grandTotal = relatorioPedidos.reduce((s, p) => s + p.subtotal, 0);
        const labelAgrup = { pedido: 'Por Pedido', cliente: 'Por Cliente', vendedor: 'Por Vendedor', nenhum: 'Sem Agrupamento' };
        const tabelaItens = (pedidos, mostrarCliente, mostrarVendedor) => pedidos.map(p => `
            <div class="pedido-bloco">
                <div class="pedido-header">
                    <span class="pedido-num">${p.pedidoNumero ? '#' + p.pedidoNumero : (p.pedidoEspecial ? 'Especial' : '—')}</span>
                    ${mostrarCliente ? `<span>${p.clienteNome}</span>` : ''}
                    ${mostrarVendedor ? `<span class="dim">${p.vendedorNome}</span>` : ''}
                    <span class="dim">${fmtData(p.dataVenda)}</span>
                    <span class="subtotal">R$ ${fmt(p.subtotal)}</span>
                </div>
                <table><colgroup><col class="c-produto"><col class="c-qtd"><col class="c-unit"><col class="c-total"></colgroup><thead><tr>
                    <th>Produto</th><th class="r">Qtd</th><th class="r">Valor Unit.</th><th class="r">Total</th>
                </tr></thead><tbody>
                ${(p.itens || []).length === 0
                    ? '<tr><td colspan="4" class="sem-itens">Nenhum item registrado</td></tr>'
                    : (p.itens || []).map(it => `<tr>
                        <td>${it.produtoNome}</td>
                        <td class="r">${Number(it.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                        <td class="r">R$ ${fmt(it.valorUnitario)}</td>
                        <td class="r bold">R$ ${fmt(it.total)}</td>
                    </tr>`).join('')}
                </tbody></table>
            </div>`).join('');

        const corpoGrupos = relatorioAgrupamento === 'pedido'
            ? tabelaItens(grupos[0].pedidos, true, true)
            : relatorioAgrupamento === 'nenhum'
            ? `<table class="flat"><colgroup><col style="width:55px"><col style="width:auto"><col style="width:auto"><col style="width:70px"><col style="width:auto"><col style="width:55px"><col style="width:90px"><col style="width:90px"></colgroup><thead><tr>
                <th>Pedido</th><th>Cliente</th><th>Vendedor</th><th>Data</th>
                <th>Produto</th><th class="r">Qtd</th><th class="r">Val. Unit.</th><th class="r">Total</th>
               </tr></thead><tbody>
               ${grupos[0].pedidos.flatMap(p => (p.itens || []).map(it => `<tr>
                <td>${p.pedidoNumero ? '#' + p.pedidoNumero : '—'}</td>
                <td>${p.clienteNome}</td><td>${p.vendedorNome}</td><td>${fmtData(p.dataVenda)}</td>
                <td>${it.produtoNome}</td>
                <td class="r">${Number(it.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                <td class="r">R$ ${fmt(it.valorUnitario)}</td>
                <td class="r bold">R$ ${fmt(it.total)}</td>
               </tr>`)).join('')}
               </tbody></table>`
            : grupos.map(g => `
                <div class="grupo-bloco">
                    <div class="grupo-header">
                        <span>${g.chave}</span>
                        <span class="subtotal">R$ ${fmt(g.total)}</span>
                    </div>
                    ${tabelaItens(g.pedidos, relatorioAgrupamento !== 'cliente', relatorioAgrupamento !== 'vendedor')}
                </div>`).join('');

        const html = `<!DOCTYPE html><html lang="pt-BR"><head>
        <meta charset="UTF-8"><title>Relatório de Itens</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 20px; }
            h1 { font-size: 14px; margin-bottom: 2px; }
            .sub { font-size: 10px; color: #555; margin-bottom: 12px; }
            .grupo-bloco { margin-bottom: 16px; }
            .grupo-header { background: #e5e7eb; padding: 5px 8px; font-weight: bold; display: flex; justify-content: space-between; border-radius: 4px; margin-bottom: 4px; }
            .pedido-bloco { margin-bottom: 10px; border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden; }
            .pedido-header { background: #f3f4f6; padding: 4px 8px; display: flex; gap: 12px; align-items: center; font-size: 11px; border-bottom: 1px solid #d1d5db; }
            .pedido-num { font-weight: bold; font-family: monospace; }
            .dim { color: #6b7280; }
            .subtotal { margin-left: auto; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
            table.flat { border: 1px solid #d1d5db; border-radius: 4px; overflow: hidden; }
            th { background: #f9fafb; padding: 3px 6px; text-align: left; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #374151; }
            td { padding: 3px 6px; border-bottom: 1px solid #f3f4f6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            col.c-produto { width: auto; }
            col.c-qtd { width: 55px; }
            col.c-unit { width: 90px; }
            col.c-total { width: 90px; }
            .r { text-align: right; }
            .bold { font-weight: bold; }
            .sem-itens { text-align: center; color: #9ca3af; font-style: italic; padding: 6px; }
            .grand-total { margin-top: 12px; padding: 6px 10px; background: #f3f4f6; border-radius: 4px; display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; }
            thead { display: table-header-group; }
            @media print {
                @page { size: A4 portrait; margin: 24mm 10mm 12mm 10mm; }
                body { margin: 0; }
                .relatorio-header { position: fixed; top: -14mm; left: 0; right: 0; background: white; padding: 3px 0 4px; border-bottom: 1px solid #d1d5db; }
                .grupo-bloco { page-break-inside: avoid; }
                .grupo-bloco + .grupo-bloco { page-break-before: always; }
                .pedido-bloco { page-break-inside: avoid; }
                .grand-total { page-break-inside: avoid; }
            }
        </style></head><body>
        <div class="relatorio-header">
            <h1 style="font-size:14px;margin:0 0 1px;">Relatório de Itens por Pedido</h1>
            <div class="sub" style="margin:0;">
                Agrupamento: ${labelAgrup[relatorioAgrupamento]} &nbsp;|&nbsp;
                ${relatorioFiltros.vencDe || relatorioFiltros.vencAte ? `Venc. ${relatorioFiltros.vencDe || '...'} até ${relatorioFiltros.vencAte || '...'} &nbsp;|&nbsp;` : ''}
                Gerado em: ${new Date().toLocaleString('pt-BR')}
            </div>
        </div>
        ${corpoGrupos}
        <div class="grand-total">
            <span>${relatorioPedidos.length} pedido(s)</span>
            <span>Total Geral: R$ ${fmt(grandTotal)}</span>
        </div>
        </body></html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 400);
    };

    // Conta cada caixa com alguma escolha (não cada opção) + a busca + cada período
    // fora do padrão — mesma regra do resto do sistema.
    const filtrosAtivos = useMemo(() =>
        (busca ? 1 : 0)
        + Object.values(filtros).filter(v => Array.isArray(v) ? v.length > 0 : Boolean(v)).length
        + (periodoVenc.padrao ? 0 : 1)
        + (periodoPag.padrao ? 0 : 1)
    , [filtros, busca, periodoVenc.padrao, periodoPag.padrao]);

    const abrirPedido = async (pedidoId) => {
        if (!pedidoId) return;
        setPedidoLoading(true);
        setPedidoPopup({ carregando: true });
        try {
            const p = await pedidoService.detalhar(pedidoId);
            setPedidoPopup({ ...p, _pedidoIdOrigem: pedidoId });
        } catch (e) {
            toast.error('Erro ao buscar pedido');
            setPedidoPopup(null);
        } finally {
            setPedidoLoading(false);
        }
    };

    const abrirCliente = async (clienteId) => {
        if (!clienteId) return;
        try {
            const c = await clienteService.detalhar(clienteId);
            setClientePopup(c);
        } catch (e) {
            toast.error('Erro ao buscar cliente');
        }
    };

    const Th = ({ col, children, className = '' }) => (
        <th className={`px-2 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide select-none ${className}`}>
            <button onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-gray-900">
                {children} <ArrowUpDown className="w-3 h-3 opacity-50" />
            </button>
        </th>
    );

    return (
        <div className="p-3 md:p-6 w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg">
                        <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Contas a Receber — Tabela</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/financeiro/contas-receber" className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs md:text-sm">
                        Ver resumo ↗
                    </Link>
                    {podeBaixar && (
                        <button
                            onClick={handleSyncCATodas}
                            disabled={syncingTodas}
                            title="Verifica no Conta Azul todas as contas abertas e aplica as baixas que já foram pagas lá"
                            className="px-3 py-1.5 md:px-4 md:py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-xs md:text-sm disabled:opacity-60 inline-flex items-center gap-1.5"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncingTodas ? 'animate-spin' : ''}`} />
                            {syncingTodas ? 'Baixando...' : 'Baixar parcelas do CA'}
                        </button>
                    )}
                    <button onClick={abrirRelatorio} className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs md:text-sm inline-flex items-center gap-1.5" title="Relatório de itens por pedido (filtros atuais)">
                        <Download className="w-4 h-4" /> Relatório
                    </button>
                    <button onClick={exportarCSV} className="px-3 py-1.5 md:px-4 md:py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-xs md:text-sm inline-flex items-center gap-1.5">
                        <Download className="w-4 h-4" /> CSV
                    </button>
                </div>
            </div>

            {/* Indicadores */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs text-gray-500 mb-1">Total em Aberto</div>
                    <div className="text-lg font-bold text-gray-900">R$ {fmt(indicadores.totalEmAberto)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs text-red-600 mb-1">Vencidas</div>
                    <div className="text-lg font-bold text-red-600">R$ {fmt(indicadores.totalVencidas)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs text-yellow-700 mb-1">A vencer (7d)</div>
                    <div className="text-lg font-bold text-yellow-700">R$ {fmt(indicadores.totalAVencer7d)}</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
                    <div className="text-xs text-green-700 mb-1">Quitadas no mês</div>
                    <div className="text-lg font-bold text-green-700">R$ {fmt(indicadores.totalQuitadasMes)}</div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
                <button
                    onClick={() => setFiltrosAbertos(v => !v)}
                    className="w-full flex items-center justify-between px-5 py-3.5 lg:hidden"
                >
                    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-600">
                        <Filter className="w-4 h-4 text-blue-600" /> Filtros
                        {filtrosAtivos > 0 && (
                            <span className="bg-primary text-white text-[10px] rounded-full px-1.5 py-0.5 normal-case tracking-normal font-semibold">{filtrosAtivos}</span>
                        )}
                    </span>
                    {filtrosAbertos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                <div className="hidden lg:flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                    <Filter className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Filtros</span>
                    {filtrosAtivos > 0 && (
                        <span className="bg-primary text-white text-[10px] rounded-full px-1.5 py-0.5 font-semibold">{filtrosAtivos}</span>
                    )}
                </div>
                <div className={`p-5 ${filtrosAbertos ? 'block' : 'hidden'} lg:block`}>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                            <input
                                value={busca}
                                onChange={e => setBusca(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && aplicarFiltros()}
                                placeholder="Buscar..."
                                className="w-full border border-gray-300 rounded pl-9 pr-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status Conta</label>
                        <FiltroMulti
                            label="Todos"
                            options={['ABERTO', 'QUITADO', 'CANCELADO']}
                            value={filtros.status}
                            onChange={(v) => setFiltros(f => ({ ...f, status: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status Parcela</label>
                        <FiltroMulti
                            label="Todas"
                            options={['PENDENTE', 'PARCIAL', 'PAGO', 'VENCIDO', 'CANCELADO']}
                            value={filtros.statusParcela}
                            onChange={(v) => setFiltros(f => ({ ...f, statusParcela: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Origem</label>
                        <FiltroMulti
                            label="Todas"
                            options={[{ valor: 'FATURADO_CA', label: 'Faturado CA' }, { valor: 'ESPECIAL', label: 'Especial' }]}
                            value={filtros.origem}
                            onChange={(v) => setFiltros(f => ({ ...f, origem: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vendedor</label>
                        <FiltroMulti
                            label="Todos"
                            options={opcoesVendedorMulti(vendedores)}
                            value={filtros.vendedorId}
                            onChange={(v) => setFiltros(f => ({ ...f, vendedorId: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Cliente</label>
                        <FiltroMulti
                            label="Todas"
                            options={categorias.map(c => ({ valor: c.id, label: c.nome }))}
                            value={filtros.categoriaClienteId}
                            onChange={(v) => setFiltros(f => ({ ...f, categoriaClienteId: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Condição Pgto</label>
                        <FiltroMulti
                            label="Todas"
                            options={condicoes}
                            value={filtros.condicaoPagamento}
                            onChange={(v) => setFiltros(f => ({ ...f, condicaoPagamento: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Cobrança</label>
                        <FiltroMulti
                            label="Todas"
                            options={tiposCobranca}
                            value={filtros.tipoCobranca}
                            onChange={(v) => setFiltros(f => ({ ...f, tipoCobranca: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Condição na Entrega</label>
                        <FiltroMulti
                            label="Todas"
                            options={formasEntregaUsadas}
                            value={filtros.formaPagamentoEntrega}
                            onChange={(v) => setFiltros(f => ({ ...f, formaPagamentoEntrega: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Forma Pgto (baixa)</label>
                        <FiltroMulti
                            label="Todas"
                            options={formasUsadas}
                            value={filtros.formaPagamento}
                            onChange={(v) => setFiltros(f => ({ ...f, formaPagamento: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Baixado por</label>
                        <FiltroMulti
                            label="Todos"
                            options={usuariosBaixa}
                            value={filtros.baixadoPorId}
                            onChange={(v) => setFiltros(f => ({ ...f, baixadoPorId: v }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Responsável pela cobrança</label>
                        <FiltroMulti
                            label="Todos"
                            options={opcoesResponsavel}
                            value={filtros.responsavel}
                            onChange={(v) => setFiltros(f => ({ ...f, responsavel: v }))}
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                        <FiltroPeriodo periodo={periodoVenc} controle={periodoVencCtl} className="w-full md:w-auto" />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pagamento (baixa)</label>
                        <FiltroPeriodo periodo={periodoPag} controle={periodoPagCtl} className="w-full md:w-auto" />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-3 mt-4">
                    <button onClick={limparFiltros} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm inline-flex items-center gap-1.5">
                        <X className="w-4 h-4" /> Limpar
                    </button>
                    <button onClick={aplicarFiltros} className="px-4 py-2 bg-primary hover:bg-blue-700 text-white rounded-md shadow-sm font-semibold text-sm inline-flex items-center gap-1.5">
                        <Filter className="w-4 h-4" /> Filtrar
                    </button>
                </div>
                </div>
            </div>

            {erroLista && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-800">
                    {erroLista}
                </div>
            )}

            {/* Barra de seleção */}
            {sel.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 flex items-center justify-between">
                    <div className="text-sm text-gray-800">
                        <strong>{sel.size}</strong> parcela(s) selecionada(s) — Total <strong>R$ {fmt(valorSel)}</strong>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setSel(new Set())} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md font-medium text-sm">Limpar</button>
                        {podeBaixaManual && (
                            <button
                                onClick={() => {
                                    setBaixaLoteForm({ formaPagamento: '', dataPagamento: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), observacao: '' });
                                    setBaixaLoteOpen(true);
                                }}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm font-semibold text-sm inline-flex items-center gap-1.5"
                            >
                                <CheckCircle className="w-4 h-4" /> Baixar em lote
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Cards (< xl) */}
            <div className="xl:hidden space-y-2">
                {loading && <div className="bg-white border rounded-lg p-6 text-center text-gray-500">Carregando...</div>}
                {!loading && linhasOrdenadas.length === 0 && (
                    <div className="bg-white border rounded-lg p-6 text-center text-gray-500">Nenhuma parcela encontrada.</div>
                )}
                {!loading && linhasOrdenadas.map(l => {
                    const eleg = elegivel(l);
                    const atrasada = l.statusParcela === 'VENCIDO';
                    return (
                        <div
                            key={l.parcelaId}
                            className={`bg-white rounded-xl border shadow-sm p-4 ${atrasada ? 'border-red-200' : 'border-gray-200'} ${sel.has(l.parcelaId) ? 'ring-2 ring-blue-300' : ''}`}
                        >
                            <div className="flex items-start gap-2">
                                {eleg && (
                                    <button onClick={(e) => { e.stopPropagation(); toggleOne(l.parcelaId); }} className="mt-1 flex-shrink-0">
                                        {sel.has(l.parcelaId) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-400" />}
                                    </button>
                                )}
                                <button
                                    onClick={() => setDetalheLinha(l)}
                                    className="flex-1 min-w-0 text-left"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1 text-sm">
                                                <span className="text-gray-400 font-mono">{l.pedidoNumero ? `#${l.pedidoNumero}` : (l.pedidoEspecial ? 'Esp.' : '-')}</span>
                                                <span
                                                    className="font-medium text-blue-700 hover:underline truncate"
                                                    title={l.clienteNome}
                                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); abrirCliente(l.clienteId); }}
                                                >{l.clienteNome}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5 truncate">
                                                {l.condicaoPagamento || '-'}{l.vendedorNome ? ` · ${l.vendedorNome}` : ''}
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="font-bold text-gray-900 text-sm tabular-nums whitespace-nowrap">R$ {fmt(l.valor)}</div>
                                            <div className="text-[11px] text-gray-500 whitespace-nowrap">Parc. {l.numeroParcela}/{l.parcelasTotal}</div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_PARC[l.statusParcela] || ''}`}>{l.statusParcela}</span>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_CONTA[l.statusConta] || ''}`}>{l.statusConta}</span>
                                        <span className="text-[11px] text-gray-500 tabular-nums">
                                            Venc: {fmtData(l.dataVencimento)}
                                        </span>
                                        {l.dataPagamento && (
                                            <span className="text-[11px] text-green-700 tabular-nums">
                                                Pago: {fmtData(l.dataPagamento)} {l.formaPagamento ? `(${l.formaPagamento})` : ''}
                                            </span>
                                        )}
                                        {l.statusParcela === 'PARCIAL' && (
                                            <>
                                                <span className="text-[11px] text-green-700 tabular-nums font-medium">
                                                    Recebido{temDesconto(l) ? ' + desc.' : ''}: R$ {fmt(recebidoNaParcela(l))}
                                                </span>
                                                <span className="text-[11px] text-amber-700 tabular-nums font-medium">
                                                    Falta receber: R$ {fmt(saldoRestante(l))}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDetalheLinha(l); }}
                                    className="p-1.5 rounded hover:bg-gray-100 flex-shrink-0"
                                    title="Ver detalhes e ações"
                                >
                                    <MoreVertical className="w-4 h-4 text-gray-500" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Tabela (xl+) */}
            <div className="hidden xl:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3 w-8">
                                <button onClick={toggleTodas} title="Selecionar todas elegíveis">
                                    {todasSelecionadas ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                                </button>
                            </th>
                            <Th col="pedidoNumero">Pedido</Th>
                            <Th col="clienteNome">Cliente</Th>
                            <Th col="vendedorNome">Vendedor</Th>
                            <Th col="valor" className="text-right">Valor</Th>
                            <Th col="vencimento">Venc.</Th>
                            <th className="px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr><td colSpan={7} className="py-8 text-center text-gray-500">Carregando...</td></tr>
                        )}
                        {!loading && linhasOrdenadas.length === 0 && (
                            <tr><td colSpan={7} className="py-8 text-center text-gray-500">Nenhuma parcela encontrada.</td></tr>
                        )}
                        {!loading && linhasOrdenadas.map(l => {
                            const eleg = elegivel(l);
                            return (
                                <React.Fragment key={l.parcelaId}>
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-2 pt-2 pb-0.5 align-top">
                                            {eleg ? (
                                                <button onClick={() => toggleOne(l.parcelaId)}>
                                                    {sel.has(l.parcelaId) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-400" />}
                                                </button>
                                            ) : null}
                                        </td>
                                        <td className="px-2 pt-2 pb-0.5 font-mono text-gray-700 whitespace-nowrap">
                                            {l.pedidoNumero ? `#${l.pedidoNumero}` : (l.pedidoEspecial ? 'Esp.' : '-')}
                                        </td>
                                        <td className="px-2 pt-2 pb-0.5 font-medium">
                                            <button
                                                onClick={() => abrirCliente(l.clienteId)}
                                                className="text-blue-700 hover:underline text-left"
                                                title="Ver cliente"
                                            >{l.clienteNome}</button>
                                        </td>
                                        <td className="px-2 pt-2 pb-0.5 text-gray-700">{l.vendedorNome || '-'}</td>
                                        <td className="px-2 pt-2 pb-0.5 text-right font-bold tabular-nums whitespace-nowrap">R$ {fmt(l.valor)}</td>
                                        <td className="px-2 pt-2 pb-0.5 whitespace-nowrap tabular-nums">{fmtData(l.dataVencimento)}</td>
                                        <td className="px-2 pt-2 pb-0.5">
                                            <div className="flex items-center justify-end gap-1">
                                                {podeBaixaManual && elegivelBaixa(l) && (
                                                    <button onClick={() => handleBaixar(l)} title="Dar baixa manual (dinheiro/cheque) — vai para o seu caixa de hoje" className="p-1 rounded hover:bg-green-100 text-green-700">
                                                        <CheckCircle className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {podeBaixar && (l.statusParcela === 'PAGO' || l.statusParcela === 'PARCIAL') && (
                                                    <button onClick={() => handleEstornar(l)} title="Estornar tudo" className="p-1 rounded hover:bg-yellow-100 text-yellow-700">
                                                        <Undo2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {podeBaixar && asaasDisponivel && l.statusConta !== 'CANCELADO' && l.statusConta !== 'QUITADO' && (
                                                    <button
                                                        onClick={() => setBoletosModal({ id: l.contaId, clienteNome: l.clienteNome, pedidoNumero: l.pedidoNumero })}
                                                        title="Boletos Asaas (emitir / enviar / acompanhar)"
                                                        className="p-1 rounded hover:bg-mint text-primary"
                                                    >
                                                        <FileText className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {podeBaixar && l.idVendaContaAzul && l.statusConta !== 'CANCELADO' && (
                                                    <button
                                                        onClick={() => handleSyncCA(l.contaId, l.idVendaContaAzul)}
                                                        disabled={syncing === l.contaId}
                                                        title="Verificar baixas no Conta Azul"
                                                        className="p-1 rounded hover:bg-blue-100 text-blue-700 disabled:opacity-40"
                                                    >
                                                        <RefreshCw className={`w-4 h-4 ${syncing === l.contaId ? 'animate-spin' : ''}`} />
                                                    </button>
                                                )}
                                                <button onClick={() => setDetalheLinha(l)} title="Ver detalhes" className="p-1 rounded hover:bg-gray-100 text-gray-600">
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                {l.pedidoId && (
                                                    <button onClick={() => abrirPedido(l.pedidoId)} title="Ver pedido" className="p-1 rounded hover:bg-gray-100 text-gray-600">
                                                        <LinkIcon className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    <tr className="border-b border-gray-100 hover:bg-gray-50">
                                        <td></td>
                                        <td colSpan={6} className="px-2 pt-0 pb-3 text-xs text-gray-500">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                <span title="Condição"><span className="text-gray-400">Cond.:</span> {l.condicaoPagamento || '-'}</span>
                                                <span title="Origem"><span className="text-gray-400">Orig.:</span> {l.origem === 'FATURADO_CA' ? 'CA' : 'Esp.'}</span>
                                                <span className="inline-flex items-center gap-1"><span className="text-gray-400">Conta:</span>
                                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_CONTA[l.statusConta] || ''}`}>{l.statusConta}</span>
                                                </span>
                                                <span><span className="text-gray-400">Parc.:</span> {l.numeroParcela}/{l.parcelasTotal}</span>
                                                <span className="inline-flex items-center gap-1"><span className="text-gray-400">Status:</span>
                                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_PARC[l.statusParcela] || ''}`}>{l.statusParcela}</span>
                                                </span>
                                                {l.dataPagamento && <span className="tabular-nums"><span className="text-gray-400">Pgto:</span> {fmtData(l.dataPagamento)}</span>}
                                                {l.formaPagamento && <span><span className="text-gray-400">Forma:</span> {l.formaPagamento}</span>}
                                                {l.baixadoPorNome && <span><span className="text-gray-400">Baixado por:</span> {l.baixadoPorNome}</span>}
                                                {l.statusParcela === 'PARCIAL' && (
                                                    <>
                                                        <span className="font-medium text-green-700 tabular-nums">
                                                            <span className="text-gray-400 font-normal">Recebido{temDesconto(l) ? ' + desconto' : ''}:</span> R$ {fmt(recebidoNaParcela(l))}
                                                        </span>
                                                        <span className="font-medium text-amber-700 tabular-nums">
                                                            <span className="text-gray-400 font-normal">Falta receber:</span> R$ {fmt(saldoRestante(l))}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="text-xs text-gray-500 mt-2">
                {linhasOrdenadas.length} linha(s)
            </div>

            {/* Modal baixa em lote */}
            {baixaLoteOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg max-w-md w-full p-5">
                        <h3 className="text-lg font-bold mb-3">Baixar {sel.size} parcela(s) — R$ {fmt(valorSel)}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-gray-500">Forma de pagamento</label>
                                <SelectBusca value={baixaLoteForm.formaPagamento} onChange={e => setBaixaLoteForm(f => ({ ...f, formaPagamento: e.target.value }))} className="w-full">
                                    <option value="">—</option>
                                    {FORMAS_BAIXA_MANUAL.map(f => <option key={f}>{f}</option>)}
                                </SelectBusca>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Data do pagamento</label>
                                <input type="date" value={baixaLoteForm.dataPagamento} onChange={e => setBaixaLoteForm(f => ({ ...f, dataPagamento: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" />
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 flex items-start gap-2">
                                <Wallet className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-amber-800">
                                    <strong>R$ {fmt(valorSel)} vai entrar no seu caixa de hoje</strong> e some no seu “a prestar”.
                                    {selTemCobrancaEletronica && <><br /><strong>Atenção:</strong> há título cobrado em boleto/Pix na seleção — só siga se o cliente pagou em espécie.</>}
                                    Boleto, Pix, cartão e transferência não entram por aqui — esses são baixados na Conciliação Bancária.
                                </p>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500">Observação</label>
                                <textarea value={baixaLoteForm.observacao} onChange={e => setBaixaLoteForm(f => ({ ...f, observacao: e.target.value }))} className="w-full border rounded px-2 py-1.5 text-sm" rows={2} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setBaixaLoteOpen(false)} className="px-3 py-1.5 rounded border">Cancelar</button>
                            <button onClick={handleBaixaLote} disabled={salvando} className="px-3 py-1.5 rounded bg-green-600 text-white disabled:opacity-50">
                                {salvando ? 'Salvando...' : 'Confirmar baixa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal log sync CA */}
            {syncLog && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
                        <div className="px-4 py-3 border-b flex items-center justify-between">
                            <h3 className="font-bold">
                                Sync CA — {syncLog.progresso}/{syncLog.total}
                                {syncLog.ativo && <RefreshCw className="inline w-4 h-4 ml-2 animate-spin text-blue-600" />}
                            </h3>
                            {!syncLog.ativo && (
                                <button onClick={() => setSyncLog(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                            )}
                        </div>
                        <div className="px-4 py-2 border-b bg-gray-50 text-xs text-gray-600 flex gap-4">
                            <span>✅ Baixadas: <strong>{syncLog.totalAplicadas}</strong> parcela(s)</span>
                            <span>⚠️ Erros: <strong className={syncLog.erros > 0 ? 'text-red-600' : ''}>{syncLog.erros}</strong></span>
                        </div>
                        <div className="overflow-y-auto flex-1 divide-y">
                            {syncLog.itens.map((it, idx) => (
                                <details key={idx} className="px-4 py-2 text-sm">
                                    <summary className="flex items-start gap-2 cursor-pointer list-none">
                                        <span className="flex-shrink-0 mt-0.5">
                                            {it.status === 'ok' && <span className="text-green-600">✅</span>}
                                            {it.status === 'semmudanca' && <span className="text-gray-400">➖</span>}
                                            {it.status === 'erro' && <span className="text-red-600">❌</span>}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-gray-900">
                                                {it.pedido} <span className="text-gray-500 font-normal">— {it.cliente}</span>
                                            </div>
                                            <div className={`text-xs ${it.status === 'erro' ? 'text-red-600' : 'text-gray-600'}`}>{it.msg}</div>
                                        </div>
                                        {(it.debug || it.raw) && <span className="text-[10px] text-blue-600">▸ debug</span>}
                                    </summary>
                                    {(it.debug || it.raw) && (
                                        <pre className="mt-2 ml-6 p-2 bg-gray-50 border rounded text-[10px] text-gray-700 overflow-x-auto">
{JSON.stringify(it.debug || it.raw, null, 2)}
                                        </pre>
                                    )}
                                </details>
                            ))}
                            {syncLog.ativo && syncLog.itens.length < syncLog.total && (
                                <div className="px-4 py-2 text-sm text-gray-400 italic">Processando...</div>
                            )}
                        </div>
                        {!syncLog.ativo && (
                            <div className="px-4 py-3 border-t flex justify-end gap-2">
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(JSON.stringify(syncLog.itens, null, 2));
                                        toast.success('Log copiado');
                                    }}
                                    className="px-3 py-2 rounded border text-sm hover:bg-gray-50"
                                >
                                    Copiar log
                                </button>
                                <button onClick={() => setSyncLog(null)} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">Fechar</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal detalhes parcela */}
            {detalheLinha && (
                <DetalheParcelaModal
                    linha={detalheLinha}
                    onClose={() => setDetalheLinha(null)}
                    podeBaixar={podeBaixar}
                    podeBaixaManual={podeBaixaManual}
                    onBaixar={(l) => { setDetalheLinha(null); handleBaixar(l); }}
                    onEstornarTudo={(l) => { handleEstornar(l); setDetalheLinha(null); }}
                    onSyncCA={(contaId, idCA) => { handleSyncCA(contaId, idCA); setDetalheLinha(null); }}
                    syncing={syncing}
                    onAbrirPedido={(id) => { abrirPedido(id); setDetalheLinha(null); }}
                    onEstornoPagamento={fetchData}
                    elegivelBaixa={elegivelBaixa}
                    saldoRestante={saldoRestante}
                    fmt={fmt}
                    fmtData={fmtData}
                    vendedorPorId={vendedorPorId}
                />
            )}

            {/* Modal de baixa (valor recebido + desconto) */}
            {baixaModalLinha && (
                <BaixaParcelaModal
                    linha={baixaModalLinha}
                    podeDarDesconto={podeDarDesconto}
                    onClose={() => setBaixaModalLinha(null)}
                    onSuccess={() => { setBaixaModalLinha(null); fetchData(); }}
                    saldoRestante={saldoRestante}
                    fmt={fmt}
                />
            )}

            {/* Modal pedido completo */}
            {pedidoPopup && (() => {
                const p = pedidoPopup;
                const close = () => setPedidoPopup(null);
                // Responsáveis vêm da CONTA (listagem), não do pedido — pegamos da linha
                // que abriu o popup para o selo mostrar o nome também aqui.
                const respDoPedido = linhas.find(x => x.pedidoId === (p._pedidoIdOrigem || p.id))?.responsaveis || [];
                if (p.carregando) {
                    return (
                        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={close}>
                            <div className="bg-white rounded-lg p-6 inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                                <span className="text-sm text-gray-700">Carregando pedido...</span>
                            </div>
                        </div>
                    );
                }
                const totalItens = (p.itens || []).reduce((s, it) => s + Number(it.quantidade || 0) * Number(it.valor || 0), 0);
                const statusEntregaMap = {
                    PENDENTE: 'bg-gray-100 text-gray-700',
                    ENTREGUE: 'bg-green-100 text-green-700',
                    ENTREGUE_PARCIAL: 'bg-yellow-100 text-yellow-800',
                    DEVOLVIDO: 'bg-red-100 text-red-700'
                };
                return (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={close}>
                        <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10 rounded-t-2xl">
                                <div>
                                    <h3 className="font-bold text-gray-900">
                                        Pedido {p.numero ? `#${p.numero}` : (p.especial ? 'Especial' : '—')}
                                    </h3>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        {fmtData(p.dataVenda)} · {p.vendedor?.nome || '—'}
                                        {p.especial && <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-100 text-purple-700">Especial</span>}
                                        {p.bonificacao && <span className="ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">Bonificação</span>}
                                    </div>
                                </div>
                                <button onClick={close} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                            </div>

                            <div className="p-5 space-y-5">
                                {/* Cliente */}
                                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Cliente</p>
                                    <button
                                        onClick={() => abrirCliente(p.clienteId)}
                                        className="text-sm font-semibold text-blue-700 hover:underline text-left"
                                    >
                                        {p.cliente?.Nome || p.cliente?.NomeFantasia || '—'}
                                    </button>
                                    {p.cliente?.NomeFantasia && p.cliente?.Nome && p.cliente.NomeFantasia !== p.cliente.Nome && (
                                        <div className="text-xs text-gray-500">{p.cliente.NomeFantasia}</div>
                                    )}
                                </div>

                                {/* Resumo financeiro */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500 mb-1">Itens</p>
                                        <p className="font-bold text-base text-gray-900">R$ {fmt(totalItens)}</p>
                                    </div>
                                    {Number(p.valorFrete || 0) > 0 && (
                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                            <p className="text-xs text-gray-500 mb-1">Frete</p>
                                            <p className="font-bold text-base text-gray-900">R$ {fmt(p.valorFrete)}</p>
                                        </div>
                                    )}
                                    {Number(p.flexTotal || 0) > 0 && (
                                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                            <p className="text-xs text-gray-500 mb-1">Flex</p>
                                            <p className="font-bold text-base text-gray-900">R$ {fmt(p.flexTotal)}</p>
                                        </div>
                                    )}
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500 mb-1">Condição</p>
                                        <p className="font-semibold text-sm text-gray-900">{p.nomeCondicaoPagamento || '—'}</p>
                                    </div>
                                </div>

                                {/* Itens */}
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                                        <Package className="h-4 w-4 text-blue-600" />
                                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Itens ({(p.itens || []).length})</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                                                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Qtd</th>
                                                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit.</th>
                                                    <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {(p.itens || []).map(it => (
                                                    <tr key={it.id}>
                                                        <td className="px-5 py-2 text-gray-800">{it.produto?.nome || '—'}</td>
                                                        <td className="px-5 py-2 text-right tabular-nums">{Number(it.quantidade)}</td>
                                                        <td className="px-5 py-2 text-right tabular-nums">R$ {fmt(it.valor)}</td>
                                                        <td className="px-5 py-2 text-right tabular-nums font-medium">R$ {fmt(Number(it.quantidade) * Number(it.valor))}</td>
                                                    </tr>
                                                ))}
                                                {(p.itens || []).length === 0 && (
                                                    <tr><td colSpan={4} className="px-5 py-3 text-center text-gray-400">Sem itens</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Entrega / Embarque */}
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                                        <Truck className="h-4 w-4 text-blue-600" />
                                        <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Entrega</span>
                                    </div>
                                    <div className="p-5 grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">Status</p>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusEntregaMap[p.statusEntrega] || 'bg-gray-100 text-gray-700'}`}>
                                                {p.statusEntrega || 'PENDENTE'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1">Data Entrega</p>
                                            <p className="text-gray-800">{fmtData(p.dataEntrega)}</p>
                                        </div>
                                        {p.embarque && (
                                            <>
                                                <div>
                                                    <p className="text-xs text-gray-500 mb-1">Embarque</p>
                                                    <p className="text-gray-800">#{p.embarque.numero} · {fmtData(p.embarque.dataSaida)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-gray-500 mb-1">Motorista</p>
                                                    <p className="text-gray-800">{p.embarque.responsavel?.nome || '—'}</p>
                                                </div>
                                            </>
                                        )}
                                        {p.observacaoEntrega && (
                                            <div className="col-span-2">
                                                <p className="text-xs text-gray-500 mb-1">Obs. do Motorista</p>
                                                <p className="text-gray-700">{p.observacaoEntrega}</p>
                                            </div>
                                        )}
                                        {p.motivoDevolucao && (
                                            <div className="col-span-2">
                                                <p className="text-xs text-gray-500 mb-1">Motivo Devolução</p>
                                                <p className="text-red-700">{p.motivoDevolucao}</p>
                                            </div>
                                        )}
                                        {(p.pagamentosReais || []).filter(x => Number(x.valor) > 0).length > 0 && (
                                            <div className="col-span-2">
                                                <p className="text-xs text-gray-500 mb-1.5">Pagamentos Registrados na Entrega</p>
                                                <div className="space-y-1.5">
                                                    {p.pagamentosReais.filter(x => Number(x.valor) > 0).map((pg, i) => (
                                                        <div key={i} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                                            <span className="font-medium text-gray-800 shrink-0">{pg.formaPagamentoNome}</span>
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <SeloResponsavel pg={pg} responsaveis={respDoPedido} vendedorPorId={vendedorPorId} />
                                                                <span className="font-bold tabular-nums text-gray-900 shrink-0">R$ {fmt(pg.valor)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Devoluções */}
                                {(p.devolucoes || []).length > 0 && (
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                                            <Undo2 className="h-4 w-4 text-blue-600" />
                                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Devoluções ({p.devolucoes.length})</span>
                                        </div>
                                        <div className="p-5 space-y-3">
                                            {p.devolucoes.map(d => (
                                                <div key={d.id} className={`rounded-xl border border-gray-200 p-3 ${d.status === 'REVERTIDA' ? 'bg-gray-50 opacity-70' : ''}`}>
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                                                <span className="font-semibold text-gray-900">Dev. #{d.numero}</span>
                                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">{d.tipo}</span>
                                                                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">{d.escopo}</span>
                                                                {d.status === 'REVERTIDA' && <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">REVERTIDA</span>}
                                                                <span className="text-gray-500 tabular-nums">{fmtData(d.dataDevolucao)}</span>
                                                                <span className="text-gray-500">por {d.registradoPor?.nome}</span>
                                                            </div>
                                                            <div className="text-xs text-gray-700 mt-1">{d.motivo}</div>
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <div className="text-xs text-gray-500">Total</div>
                                                            <div className="font-bold text-sm text-gray-900">R$ {fmt(d.valorTotal)}</div>
                                                        </div>
                                                    </div>
                                                    {(d.itens || []).length > 0 && (
                                                        <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] space-y-0.5">
                                                            {d.itens.map(it => (
                                                                <div key={it.id} className="flex justify-between">
                                                                    <span className="truncate">{Number(it.quantidade)}× {it.produto?.nome}</span>
                                                                    <span className="tabular-nums text-gray-600">R$ {fmt(it.valorTotal)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Contas a receber / parcelas */}
                                {p.contaReceber && (
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                                            <Wallet className="h-4 w-4 text-blue-600" />
                                            <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Financeiro</span>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ml-1 ${STATUS_CONTA[p.contaReceber.status] || ''}`}>
                                                {p.contaReceber.status}
                                            </span>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Parc.</th>
                                                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                                                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Pago</th>
                                                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Venc.</th>
                                                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                                                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pgto</th>
                                                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Forma</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {(p.contaReceber.parcelas || []).map(pc => (
                                                        <tr key={pc.id}>
                                                            <td className="px-5 py-2 tabular-nums">{pc.numeroParcela}</td>
                                                            <td className="px-5 py-2 text-right tabular-nums font-medium">R$ {fmt(pc.valor)}</td>
                                                            <td className="px-5 py-2 text-right tabular-nums">
                                                                {pc.valorPago != null
                                                                    ? <span className={pc.valorPago < pc.valor ? 'text-orange-600 font-medium' : 'text-green-700'}>R$ {fmt(pc.valorPago)}</span>
                                                                    : <span className="text-gray-400">—</span>}
                                                            </td>
                                                            <td className="px-5 py-2 tabular-nums">{fmtData(pc.dataVencimento)}</td>
                                                            <td className="px-5 py-2">
                                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_PARC[pc.status] || ''}`}>{pc.status}</span>
                                                            </td>
                                                            <td className="px-5 py-2 tabular-nums">{fmtData(pc.dataPagamento)}</td>
                                                            <td className="px-5 py-2">
                                                                <div>{pc.formaPagamento || '-'}</div>
                                                                {pc.observacao && pc.observacao.startsWith('CA:') && (
                                                                    <div className="text-[10px] text-gray-400 mt-0.5">{pc.observacao}</div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {podeBaixar && p.idVendaContaAzul && p.contaReceber.status !== 'CANCELADO' && (
                                            <div className="flex justify-end px-5 py-3">
                                                <button
                                                    onClick={() => { handleSyncCA(p.contaReceber.id, p.idVendaContaAzul); close(); }}
                                                    disabled={syncing === p.contaReceber.id}
                                                    className="px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                                                >
                                                    <RefreshCw className={`w-3.5 h-3.5 ${syncing === p.contaReceber.id ? 'animate-spin' : ''}`} /> Sync CA
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {p.observacoes && (
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">Observações</p>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.observacoes}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Popup cliente (reuso do Rota) */}
            {clientePopup && (
                <ClientePopup cliente={clientePopup} onClose={() => setClientePopup(null)} />
            )}

            {/* Modal de boletos Asaas da conta */}
            {boletosModal && (
                <BoletosAsaasModal
                    conta={boletosModal}
                    onClose={() => setBoletosModal(null)}
                    onAtualizado={() => fetchData()}
                />
            )}

            {/* Modal Relatório de Itens por Pedido */}
            {relatorioOpen && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
                            <div>
                                <h3 className="font-bold text-base">Relatório de Itens por Pedido</h3>
                                {filtrosAtivos > 0 && (
                                    <div className="text-xs text-blue-600 mt-0.5">{filtrosAtivos} filtro(s) ativo(s)</div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {relatorioData && !relatorioLoading && (<>
                                    <button onClick={imprimirRelatorio}
                                        className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50 inline-flex items-center gap-1">
                                        🖨 Imprimir
                                    </button>
                                    <button onClick={exportarRelatorioCSV}
                                        className="text-sm px-3 py-1.5 rounded border hover:bg-gray-50 inline-flex items-center gap-1">
                                        <Download className="w-4 h-4" /> CSV
                                    </button>
                                </>)}
                                <button onClick={() => setRelatorioOpen(false)} className="p-1 rounded hover:bg-gray-100">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Barra do relatório — reflete os filtros e as linhas da tabela */}
                        <div className="px-4 py-2 border-b bg-gray-50 flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className="text-xs text-gray-500">
                                Reflete a tabela
                                {(vencDe || vencAte) && (
                                    <> · Venc. {vencDe ? vencDe.split('-').reverse().join('/') : '…'} até {vencAte ? vencAte.split('-').reverse().join('/') : '…'}</>
                                )}
                            </span>
                            <div className="flex items-center gap-1 ml-auto">
                                <span className="text-xs text-gray-500 whitespace-nowrap">Agrupar:</span>
                                {[['pedido','Por Pedido'],['cliente','Por Cliente'],['vendedor','Por Vendedor'],['nenhum','Sem Agrup.']].map(([val, label]) => (
                                    <button key={val} onClick={() => setRelatorioAgrupamento(val)}
                                        className={`text-xs px-2 py-1 rounded border ${relatorioAgrupamento === val ? 'bg-gray-800 text-white border-gray-800' : 'hover:bg-gray-100'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Body */}
                        <div className="overflow-y-auto flex-1 p-4">
                            {relatorioLoading && (
                                <div className="flex items-center justify-center py-12 text-gray-500">
                                    <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Gerando relatório...
                                </div>
                            )}
                            {!relatorioLoading && relatorioData && relatorioPedidos.length === 0 && (
                                <div className="text-center py-12 text-gray-400">Nenhum pedido encontrado com os filtros atuais.</div>
                            )}
                            {!relatorioLoading && relatorioData && relatorioPedidos.length > 0 && (() => {
                                const grupos = gerarGrupos(relatorioPedidos, relatorioAgrupamento);
                                const PedidoCard = ({ p, mostrarCliente = true, mostrarVendedor = true }) => (
                                    <div className="border rounded-lg overflow-hidden">
                                        <div className="bg-gray-50 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm border-b">
                                            <span className="font-mono font-semibold text-gray-800">
                                                {p.pedidoNumero ? `#${p.pedidoNumero}` : (p.pedidoEspecial ? 'Especial' : '—')}
                                            </span>
                                            {mostrarCliente && <span className="font-medium text-gray-900">{p.clienteNome}</span>}
                                            {mostrarVendedor && <span className="text-gray-500">{p.vendedorNome}</span>}
                                            <span className="text-gray-500 tabular-nums">{fmtData(p.dataVenda)}</span>
                                            <span className="ml-auto font-bold text-gray-900 tabular-nums">R$ {fmt(p.subtotal)}</span>
                                        </div>
                                        <table className="w-full text-xs">
                                            <thead className="bg-gray-50/50 border-b">
                                                <tr>
                                                    <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Produto</th>
                                                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-20">Qtd</th>
                                                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-24">Valor Unit.</th>
                                                    <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-24">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(p.itens || []).length === 0 ? (
                                                    <tr><td colSpan={4} className="px-3 py-2 text-center text-xs text-gray-400 italic">Nenhum item registrado</td></tr>
                                                ) : (p.itens || []).map((it, idx) => (
                                                    <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                                                        <td className="px-3 py-1.5 text-gray-800">{it.produtoNome}</td>
                                                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{Number(it.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                                                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">R$ {fmt(it.valorUnitario)}</td>
                                                        <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">R$ {fmt(it.total)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );

                                if (relatorioAgrupamento === 'nenhum') {
                                    const todosItens = relatorioPedidos.flatMap(p =>
                                        (p.itens || []).map(it => ({ ...it, pedidoNumero: p.pedidoNumero, pedidoEspecial: p.pedidoEspecial, clienteNome: p.clienteNome, vendedorNome: p.vendedorNome, dataVenda: p.dataVenda }))
                                    );
                                    return (
                                        <div className="border rounded-lg overflow-hidden">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50 border-b">
                                                    <tr>
                                                        <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Pedido</th>
                                                        <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Cliente</th>
                                                        <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Vendedor</th>
                                                        <th className="px-3 py-1.5 text-left font-semibold text-gray-600">Produto</th>
                                                        <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-20">Qtd</th>
                                                        <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-24">Val. Unit.</th>
                                                        <th className="px-3 py-1.5 text-right font-semibold text-gray-600 w-24">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {todosItens.map((it, idx) => (
                                                        <tr key={idx} className="border-b last:border-0 hover:bg-gray-50">
                                                            <td className="px-3 py-1.5 font-mono text-gray-700">{it.pedidoNumero ? `#${it.pedidoNumero}` : '—'}</td>
                                                            <td className="px-3 py-1.5 text-gray-800">{it.clienteNome}</td>
                                                            <td className="px-3 py-1.5 text-gray-500">{it.vendedorNome}</td>
                                                            <td className="px-3 py-1.5 text-gray-800">{it.produtoNome}</td>
                                                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{Number(it.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                                                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">R$ {fmt(it.valorUnitario)}</td>
                                                            <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">R$ {fmt(it.total)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                }

                                if (relatorioAgrupamento === 'pedido') {
                                    return <div className="space-y-3">{grupos[0].pedidos.map(p => <PedidoCard key={p.pedidoId} p={p} />)}</div>;
                                }

                                // cliente | vendedor
                                return (
                                    <div className="space-y-5">
                                        {grupos.map(g => (
                                            <div key={g.chave}>
                                                <div className="flex items-center justify-between bg-gray-200 rounded px-3 py-1.5 mb-2">
                                                    <span className="font-semibold text-gray-800 text-sm">{g.chave}</span>
                                                    <span className="font-bold text-gray-900 tabular-nums text-sm">R$ {fmt(g.total)}</span>
                                                </div>
                                                <div className="space-y-2 pl-2">
                                                    {g.pedidos.map(p => (
                                                        <PedidoCard key={p.pedidoId} p={p}
                                                            mostrarCliente={relatorioAgrupamento !== 'cliente'}
                                                            mostrarVendedor={relatorioAgrupamento !== 'vendedor'} />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Footer — total geral */}
                        {!relatorioLoading && relatorioData && relatorioPedidos.length > 0 && (() => {
                            const grandTotal = relatorioPedidos.reduce((s, p) => s + p.subtotal, 0);
                            return (
                                <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between flex-shrink-0 text-sm">
                                    <span className="text-gray-600">{relatorioPedidos.length} pedido(s)</span>
                                    <span className="font-bold text-gray-900 tabular-nums text-base">
                                        Total Geral: R$ {fmt(grandTotal)}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Modal de detalhes da parcela (histórico de pagamentos + ações) ──
const DetalheParcelaModal = ({
    linha, onClose, podeBaixar, podeBaixaManual, onBaixar, onEstornarTudo, onSyncCA, syncing,
    onAbrirPedido, onEstornoPagamento, elegivelBaixa, saldoRestante, fmt, fmtData, vendedorPorId
}) => {
    const l = linha;
    const [pagamentos, setPagamentos] = useState([]);
    const [loadingPag, setLoadingPag] = useState(true);
    const [estornandoId, setEstornandoId] = useState(null);

    useEffect(() => {
        let ativo = true;
        setLoadingPag(true);
        contasReceberService.listarPagamentos(l.parcelaId)
            .then(data => { if (ativo) setPagamentos(Array.isArray(data) ? data : []); })
            .catch(() => {})
            .finally(() => { if (ativo) setLoadingPag(false); });
        return () => { ativo = false; };
    }, [l.parcelaId]);

    const estornarPagamento = async (pagamentoId) => {
        if (!window.confirm('Estornar este pagamento específico?')) return;
        setEstornandoId(pagamentoId);
        try {
            await contasReceberService.estornarPagamento(l.parcelaId, pagamentoId);
            toast.success('Pagamento estornado');
            setPagamentos(prev => prev.map(p => p.id === pagamentoId ? { ...p, estornado: true } : p));
            onEstornoPagamento();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao estornar pagamento');
        } finally {
            setEstornandoId(null);
        }
    };

    const Field = ({ label, value, valueClass = '' }) => (
        <div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
            <div className={`text-sm ${valueClass}`}>{value || '-'}</div>
        </div>
    );

    const saldo = saldoRestante(l);
    const temHistorico = l.statusParcela === 'PARCIAL' || l.statusParcela === 'PAGO';

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10 rounded-t-2xl">
                    <h3 className="font-bold text-gray-900">
                        Parcela {l.numeroParcela}/{l.parcelasTotal}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                            {l.pedidoNumero ? `#${l.pedidoNumero}` : (l.pedidoEspecial ? 'Especial' : '')}
                        </span>
                    </h3>
                    <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Valor total</div>
                            <div className="text-2xl font-bold text-gray-900">R$ {fmt(l.valor)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_PARC[l.statusParcela] || ''}`}>{l.statusParcela}</span>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_CONTA[l.statusConta] || ''}`}>Conta: {l.statusConta}</span>
                        </div>
                    </div>

                    {l.statusParcela === 'PARCIAL' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                <p className="text-xs text-gray-500 mb-1">Recebido + desconto</p>
                                <p className="font-bold text-base text-green-700">R$ {fmt(Number(l.valorPago || 0) + Number(l.valorDescontoTotal || 0))}</p>
                            </div>
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                <p className="text-xs text-gray-500 mb-1">Falta receber</p>
                                <p className="font-bold text-base text-amber-700">R$ {fmt(saldo)}</p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
                        <Field label="Cliente" value={l.clienteNome} />
                        <Field label="Vendedor" value={l.vendedorNome} />
                        <Field label="Condição" value={l.condicaoPagamento} />
                        <Field label="Origem" value={l.origem === 'FATURADO_CA' ? 'Faturado CA' : 'Especial'} />
                        <Field label="Vencimento" value={fmtData(l.dataVencimento)} valueClass={l.statusParcela === 'VENCIDO' ? 'text-red-600 font-medium' : ''} />
                        <Field label="Pagamento" value={fmtData(l.dataPagamento)} valueClass={l.dataPagamento ? 'text-green-700 font-medium' : ''} />
                        <Field label="ID CA" value={l.idVendaContaAzul ? '✓ Sincronizado' : 'Não enviado'} />
                    </div>

                    {temHistorico && (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <Receipt className="h-4 w-4 text-blue-600" />
                                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Histórico de pagamentos</span>
                            </div>
                            <div className="p-4">
                                {loadingPag ? (
                                    <p className="text-xs text-gray-400 text-center py-2">Carregando...</p>
                                ) : pagamentos.length === 0 ? (
                                    <p className="text-xs text-gray-400 text-center py-2">Nenhum pagamento registrado.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {pagamentos.map(pg => (
                                            <div key={pg.id} className={`flex items-center justify-between text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0 ${pg.estornado ? 'opacity-50' : ''}`}>
                                                <div>
                                                    <div className="tabular-nums text-gray-700">{fmtData(pg.dataPagamento)} · {pg.formaPagamento || '-'}</div>
                                                    <div className="text-xs text-gray-400">{pg.registradoPor?.nome}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={pg.estornado ? 'line-through' : 'font-medium text-green-700'}>R$ {fmt(pg.valorRecebido)}</div>
                                                    {Number(pg.valorDesconto) > 0 && (
                                                        <div className="text-xs text-purple-700">desconto R$ {fmt(pg.valorDesconto)}</div>
                                                    )}
                                                </div>
                                                <div className="ml-3">
                                                    {pg.estornado ? (
                                                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-500">Estornado</span>
                                                    ) : podeBaixar ? (
                                                        <button
                                                            onClick={() => estornarPagamento(pg.id)}
                                                            disabled={estornandoId === pg.id}
                                                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md font-medium inline-flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            <Undo2 className="w-3.5 h-3.5" /> Estornar
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Quem ficou responsável pela cobrança deste título (pode ser mais de um:
                        cada linha de pagamento da entrega tem o seu). */}
                    {(l.responsaveis || []).length > 0 && (
                        <div className="border-t border-gray-100 pt-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                                Responsável pela cobrança
                            </div>
                            <div className="space-y-1.5">
                                {l.responsaveis.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full shrink-0 ${r.tipo === 'ESCRITORIO' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-800'}`}>
                                                {r.tipo === 'ESCRITORIO' ? 'Escritório' : 'Vendedor'}
                                            </span>
                                            <span className="font-medium text-gray-800 truncate">{r.pessoaNome || '—'}</span>
                                        </div>
                                        <span className="font-bold tabular-nums text-gray-900 shrink-0">R$ {fmt(r.valor)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {(l.pagamentosEntrega || []).length > 0 && (
                        <div className="border-t border-gray-100 pt-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                                Entrega — {l.statusEntrega || 'PENDENTE'}
                            </div>
                            <div className="space-y-1.5">
                                {l.pagamentosEntrega.map((pg, i) => (
                                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                                        <span className="font-medium text-gray-800 shrink-0">{pg.formaPagamentoNome}</span>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <SeloResponsavel pg={pg} responsaveis={l.responsaveis} vendedorPorId={vendedorPorId} />
                                            <span className="font-bold tabular-nums text-gray-900 shrink-0">R$ {fmt(pg.valor)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-4 flex flex-wrap gap-2 justify-end">
                    {l.pedidoId && (
                        <button onClick={() => onAbrirPedido(l.pedidoId)} className="px-3 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-md text-sm inline-flex items-center gap-1.5 font-medium">
                            <LinkIcon className="w-4 h-4" /> Ver pedido
                        </button>
                    )}
                    {podeBaixar && l.idVendaContaAzul && l.statusConta !== 'CANCELADO' && (
                        <button
                            onClick={() => onSyncCA(l.contaId, l.idVendaContaAzul)}
                            disabled={syncing === l.contaId}
                            className="px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md text-sm inline-flex items-center gap-1.5 font-semibold disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing === l.contaId ? 'animate-spin' : ''}`} /> Sync CA
                        </button>
                    )}
                    {podeBaixar && (l.statusParcela === 'PAGO' || l.statusParcela === 'PARCIAL') && (
                        <button
                            onClick={() => onEstornarTudo(l)}
                            className="px-3 py-2 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 rounded-md text-sm inline-flex items-center gap-1.5 font-semibold"
                        >
                            <Undo2 className="w-4 h-4" /> Estornar tudo
                        </button>
                    )}
                    {podeBaixaManual && elegivelBaixa(l) && (
                        <button
                            onClick={() => onBaixar(l)}
                            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-sm text-sm inline-flex items-center gap-1.5 font-semibold"
                        >
                            <CheckCircle className="w-4 h-4" /> Dar baixa
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


export default ContasReceberTabela;
