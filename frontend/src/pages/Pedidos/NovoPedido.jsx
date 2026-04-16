import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, Save, User, ChevronDown, ChevronUp, Calendar,
    FileText, AlertCircle, X, CheckCircle, Minus, Plus, Clock,
    ShoppingBag, Search, Trash2, Package, Tag, Phone, Mic, MicOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import clienteService from '../../services/clienteService';
import produtoService from '../../services/produtoService';
import tabelaPrecoService from '../../services/tabelaPrecoService';
import pedidoService from '../../services/pedidoService';
import configService from '../../services/configService';
import promocaoService from '../../services/promocaoService';
import vendedorService from '../../services/vendedorService';
import { API_URL } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import ClientePopup from '../Rota/ClientePopup';

const DIA_SEMANA_MAP = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

// Componente de input de quantidade que suporta frações (0,200 / 0.5 etc)
const QuantidadeInput = ({ value, permiteFracao, onChange }) => {
    const [text, setText] = useState(String(value));
    const [editing, setEditing] = useState(false);

    // Sync externo → interno quando NÃO está editando
    useEffect(() => {
        if (!editing) setText(String(value));
    }, [value, editing]);

    const commit = (raw) => {
        // aceita tanto vírgula quanto ponto
        const normalized = raw.replace(',', '.');
        const num = parseFloat(normalized);
        if (!isNaN(num) && num > 0) {
            onChange(permiteFracao ? Math.round(num * 1000) / 1000 : Math.round(num));
        } else if (raw === '' || num === 0) {
            onChange(0);
        }
        setEditing(false);
    };

    if (permiteFracao) {
        return (
            <input
                type="text"
                inputMode="decimal"
                className="w-14 text-center border border-gray-300 rounded bg-white text-gray-900 text-sm font-bold py-0.5"
                value={editing ? text : String(value)}
                onFocus={e => { setEditing(true); setText(String(value)); e.target.select(); }}
                onChange={e => {
                    // permite dígitos, vírgula e ponto durante digitação
                    const v = e.target.value.replace(/[^0-9.,]/g, '');
                    setText(v);
                }}
                onBlur={e => commit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
            />
        );
    }

    // Inteiro: input numérico simples
    return (
        <input
            type="number" min="1"
            className="w-12 text-center border border-gray-300 rounded bg-white text-gray-900 text-sm font-bold py-0.5"
            value={value}
            onFocus={e => e.target.select()}
            onChange={e => {
                const v = Number(e.target.value);
                if (v >= 0) onChange(v);
            }}
        />
    );
};

const calcularProximaData = (diasAbertosStr) => {
    if (!diasAbertosStr) return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

    const hojeApp = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const baseDate = new Date(hojeApp + 'T12:00:00Z');
    const diasPermitidos = diasAbertosStr.split(',').map(s => s.trim().toUpperCase());

    for (let i = 0; i <= 7; i++) {
        const d = new Date(baseDate.getTime());
        d.setUTCDate(baseDate.getUTCDate() + i);
        const dayOfWeekStr = DIA_SEMANA_MAP[d.getUTCDay()];

        if (diasPermitidos.includes(dayOfWeekStr)) {
            return d.toISOString().split('T')[0];
        }
    }
    return hojeApp;
};

const TIPOS_ATENDIMENTO = [
    { value: 'VISITA', label: 'Visita Presencial' },
    { value: 'LIGACAO', label: 'Ligação' },
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'OUTROS', label: 'Outros' }
];

// Formata data para exibição dd/mm
const fmtData = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
};

const NovoPedido = () => {
    const navigate = useNavigate();
    const { id: editId } = useParams();
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [especial, setEspecial] = useState(false);
    const [bonificacao, setBonificacao] = useState(false);
    const [tipoPedido, setTipoPedido] = useState(null); // 'PEDIDO' | 'ESPECIAL' | 'BONIFICACAO' | null
    const [showClientePopup, setShowClientePopup] = useState(false);

    // Speech recognition para observações
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    const originalTextRef = useRef('');

    // Core Data
    const [clientes, setClientes] = useState([]);
    const [produtos, setProdutos] = useState([]);
    const [todasCondicoes, setTodasCondicoes] = useState([]);
    const [vendedores, setVendedores] = useState([]);

    // Form State
    const [clienteId, setClienteId] = useState('');
    const [vendedorId, setVendedorId] = useState(null);
    const [condicaoPagamentoId, setCondicaoPagamentoId] = useState('');
    const [dataEntrega, setDataEntrega] = useState('');
    const [valorFrete, setValorFrete] = useState('');
    const [dataSugerida, setDataSugerida] = useState('');
    const [isEncaixe, setIsEncaixe] = useState(false);
    const [observacoes, setObservacoes] = useState('');
    const [canalOrigem, setCanalOrigem] = useState('');

    // itens: Map produtoId → { quantidade, valorUnitario, valorBase, flexUnitario }
    const [itensMap, setItensMap] = useState(new Map());

    // Client/Product Search State
    const [clienteSearchText, setClienteSearchText] = useState('');
    const [showClienteModal, setShowClienteModal] = useState(false);
    const [mostrarCondicoesDropdown, setMostrarCondicoesDropdown] = useState(false);
    const [mostrarFormulario, setMostrarFormulario] = useState(true);
    const [produtoSearch, setProdutoSearch] = useState('');
    const [obsAberta, setObsAberta] = useState(false);
    const [expandidosProduto, setExpandidosProduto] = useState(new Set());

    // Histórico de compras do cliente por produto
    const [historicoMap, setHistoricoMap] = useState(new Map()); // produtoId → { ultimoPreco, ultimaCompra, compras[] }

    // Promoções ativas por produto (produtoId → promoção)
    const [promocoesMap, setPromocoesMap] = useState(new Map());

    // Computed/Derived
    const [condicoesPermitidas, setCondicoesPermitidas] = useState([]);
    const [clienteSelecionado, setClienteSelecionado] = useState(null);
    const [vendedorSelecionado, setVendedorSelecionado] = useState(null);
    const [condicaoSelecionada, setCondicaoSelecionada] = useState(null);
    const [flexTotal, setFlexTotal] = useState(0);

    const carregouDraftRef = useRef(false);
    const isRestoringDraftRef = useRef(false);
    const searchInputRef = useRef(null);
    const categoriasNormalRef = useRef([]);

    // Pré-selecionar cliente quando vindo da tela Rota (?clienteId=...)
    const clienteIdFromUrl = searchParams.get('clienteId');

    useEffect(() => { carregarDadosBase(); }, []);

    const recarregarProdutos = async (cats) => {
        const paramsProd = { limit: 1000, ativo: true };
        if (Array.isArray(cats) && cats.length > 0) paramsProd.categorias = cats.join(',');
        const produtosData = await produtoService.listar(paramsProd);
        const listaProdutos = produtosData.data || produtosData || [];
        setProdutos(listaProdutos);
    };

    const carregarDadosBase = async () => {
        try {
            let cats = [];
            try { cats = await configService.get('categorias_vendas'); } catch (e) { }
            categoriasNormalRef.current = Array.isArray(cats) ? cats : [];

            const paramsProd = { limit: 1000, ativo: true };
            if (Array.isArray(cats) && cats.length > 0) paramsProd.categorias = cats.join(',');

            const [clientesData, produtosData, condicoesData, vendedoresData] = await Promise.all([
                clienteService.listar({ limit: 2000 }),
                produtoService.listar(paramsProd),
                tabelaPrecoService.listar(true),
                vendedorService.listar()
            ]);

            const clientesList = clientesData.data?.filter(c => c.Ativo) || clientesData?.filter(c => c.Ativo) || [];
            setClientes(clientesList);

            const listaProdutos = produtosData.data || produtosData || [];
            setProdutos(listaProdutos);
            setTodasCondicoes(condicoesData);
            setVendedores(vendedoresData || []);

            // Carregar TODAS as promoções ativas em 1 única chamada (evita N requests por produto)
            try {
                const mapaPromos = await promocaoService.buscarAtivasLote();
                // mapaPromos = { produtoId: promocao, ... }
                const promoMap = new Map(Object.entries(mapaPromos));
                setPromocoesMap(promoMap);
            } catch (e) {
                // Falha silenciosa — promoções são opcionais, não devem travar o pedido
                console.warn('Não foi possível carregar promoções:', e.message);
            }

            if (editId) {
                try {
                    const pd = await pedidoService.detalhar(editId);
                    if (pd) {
                        // Restaurar flag especial/bonificacao — produtos serão carregados quando a condição for selecionada (via useEffect)
                        if (pd.especial) {
                            setEspecial(true);
                            setTipoPedido('ESPECIAL');
                        } else if (pd.bonificacao) {
                            setBonificacao(true);
                            setTipoPedido('BONIFICACAO');
                        } else {
                            setTipoPedido('PEDIDO');
                        }

                        setClienteId(pd.clienteId);
                        setObservacoes(pd.observacoes || '');
                        if (pd.dataVenda) setDataEntrega(pd.dataVenda.split('T')[0]);
                        if (pd.valorFrete != null) setValorFrete(String(pd.valorFrete));
                        if (pd.canalOrigem) setCanalOrigem(pd.canalOrigem);
                        const cond = condicoesData.find(c => c.tipoPagamento === pd.tipoPagamento && c.opcaoCondicao === pd.opcaoCondicaoPagamento);
                        if (cond) setTimeout(() => setCondicaoPagamentoId(cond.idCondicao), 500);

                        if (pd.itens && pd.itens.length > 0) {
                            const map = new Map();
                            pd.itens.forEach(i => {
                                map.set(i.produtoId, {
                                    quantidade: i.quantidade,
                                    veioDeHistorico: true,
                                    valorUnitario: Number(i.valor),
                                    valorBase: Number(i.valorBase),
                                    flexUnitario: Number((Number(i.valor) - Number(i.valorBase)).toFixed(2))
                                });
                            });
                            setItensMap(map);
                        }
                        carregouDraftRef.current = true;
                    }
                } catch (e) {
                    toast.error("Erro ao carregar o rascunho de pedido.", { duration: 6000, style: { maxWidth: "600px" } });
                    navigate('/pedidos');
                }
            } else {
                // Tenta carregar auto-save local (novo pedido)
                try {
                    const draft = localStorage.getItem('@CAHardt:NovoPedido_Draft');
                    if (draft) {
                        const pd = JSON.parse(draft);

                        // Se veio um clienteId pela URL, só restaura os itens se for o mesmo cliente do draft
                        // Caso contrário, começa limpo (apenas aplica o cliente da URL)
                        const clienteAlvo = clienteIdFromUrl || pd.clienteId;
                        const mesmoCLiente = !clienteIdFromUrl || (clienteIdFromUrl === pd.clienteId);

                        if (clienteAlvo) setTimeout(() => setClienteId(clienteAlvo), 100);
                        if (pd.clienteSearchText && mesmoCLiente) setClienteSearchText(pd.clienteSearchText);
                        if (pd.dataEntrega) setDataEntrega(pd.dataEntrega);
                        if (pd.isEncaixe !== undefined) setIsEncaixe(pd.isEncaixe);
                        if (pd.observacoes && mesmoCLiente) setObservacoes(pd.observacoes);
                        if (pd.canalOrigem && mesmoCLiente) setCanalOrigem(pd.canalOrigem);
                        if (pd.tipoPedido && mesmoCLiente) {
                            setTipoPedido(pd.tipoPedido);
                            if (pd.tipoPedido === 'ESPECIAL') setEspecial(true);
                            else if (pd.tipoPedido === 'BONIFICACAO') setBonificacao(true);
                        }

                        if (mesmoCLiente) {
                            isRestoringDraftRef.current = true;
                            // Mesmo cliente: restaura itens e condição de pagamento
                            if (pd.condicaoPagamentoId) setTimeout(() => setCondicaoPagamentoId(pd.condicaoPagamentoId), 600);
                            if (pd.itensMap && Array.isArray(pd.itensMap)) {
                                setItensMap(new Map(pd.itensMap));
                            }
                        }
                        // Cliente diferente: itens e condição ficam vazios (serão preenchidos pelo useEffect do cliente)
                    } else if (clienteIdFromUrl) {
                        // Sem draft nenhum mas tem clienteId na URL
                        setTimeout(() => setClienteId(clienteIdFromUrl), 100);
                        const pCliente = clientesList.find(c => c.UUID === clienteIdFromUrl);
                        if (pCliente && pCliente.Dia_de_entrega) {
                            setDataSugerida(calcularProximaData(pCliente.Dia_de_entrega));
                        }
                    }
                } catch (e) { }
            }
        } catch (error) {
            toast.error("Erro ao carregar dados básicos para o pedido.", { duration: 6000, style: { maxWidth: "600px" } });
        } finally {
            setLoading(false);
        }
    };

    // Auto-Save: Sincroniza o rascunho a cada alteração pertinente
    useEffect(() => {
        if (!loading && !editId) {
            const dataToSave = {
                clienteId,
                clienteSearchText,
                dataEntrega,
                condicaoPagamentoId,
                isEncaixe,
                observacoes,
                canalOrigem,
                tipoPedido,
                itensMap: Array.from(itensMap.entries())
            };
            try {
                localStorage.setItem('@CAHardt:NovoPedido_Draft', JSON.stringify(dataToSave));
            } catch (e) { }
        }
    }, [clienteId, clienteSearchText, dataEntrega, condicaoPagamentoId, isEncaixe, observacoes, canalOrigem, tipoPedido, itensMap, loading, editId]);

    // Auto-recolher formulário quando todas as etapas estão preenchidas (edição / draft restaurado)
    useEffect(() => {
        if (!loading && tipoPedido && condicaoPagamentoId && dataEntrega && canalOrigem && clienteId) {
            setMostrarFormulario(false);
        }
    }, [loading]);

    // Recalcular flex sempre que itensMap mudar
    useEffect(() => {
        let total = 0;
        itensMap.forEach(item => { total += item.flexUnitario * item.quantidade; });
        setFlexTotal(total);
    }, [itensMap]);

    // Quando cliente muda
    useEffect(() => {
        if (!clienteId) {
            setClienteSelecionado(null);
            setVendedorId(null);
            setVendedorSelecionado(null);
            setCondicoesPermitidas([]);
            setCondicaoPagamentoId('');
            setIsEncaixe(false);
            setHistoricoMap(new Map());
            return;
        }
        const cliente = clientes.find(c => c.UUID === clienteId);
        if (cliente) {
            if (!cliente.idVendedor) {
                toast.error("Este cliente não tem um vendedor associado! Não é possível criar pedido.", { duration: 6000, style: { maxWidth: "600px" } });
                setClienteId(''); setClienteSearchText(''); return;
            }
            const vendedorDoCliente = vendedores.find(v => v.id === cliente.idVendedor);
            if (vendedorDoCliente && vendedorDoCliente.ativo === false) {
                toast.error(`O vendedor ${vendedorDoCliente.nome} está INATIVO. Atualize o vendedor no cadastro do cliente antes de emitir o pedido.`, { duration: 8000, style: { maxWidth: "600px" } });
                setClienteId(''); setClienteSearchText(''); return;
            }
            setClienteSelecionado(cliente);
            setVendedorId(cliente.idVendedor);
            setVendedorSelecionado(vendedorDoCliente || null);
            setClienteSearchText(cliente.NomeFantasia || cliente.Nome);

            // Calcular sugestão de data de entrega do cliente (apenas em novo pedido)
            if (!editId && !isRestoringDraftRef.current && cliente.Dia_de_entrega) {
                const proximaData = calcularProximaData(cliente.Dia_de_entrega);
                setDataSugerida(proximaData);
                // Não preenche dataEntrega — vendedor deve escolher obrigatoriamente
            } else if (dataEntrega) {
                verificarDataEntrega(dataEntrega, cliente);
            }

            let idsArray = [];
            if (Array.isArray(cliente.condicoes_pagamento_permitidas)) idsArray = cliente.condicoes_pagamento_permitidas;
            else if (typeof cliente.condicoes_pagamento_permitidas === 'string' && cliente.condicoes_pagamento_permitidas.trim().length > 0)
                idsArray = cliente.condicoes_pagamento_permitidas.split(',').map(s => s.trim());

            let permitidas;
            if (especial) {
                // Para especial: apenas condições marcadas como permiteEspecial E que o cliente tenha (padrão ou extras)
                const condicoesDoCliente = idsArray.length > 0
                    ? todasCondicoes.filter(c => idsArray.includes(c.idCondicao) || idsArray.includes(c.id))
                    : (cliente.Condicao_de_pagamento ? [todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento)].filter(Boolean) : []);
                permitidas = condicoesDoCliente.filter(c => c.ativo !== false && c.permiteEspecial === true);
            } else if (bonificacao) {
                // Para bonificação: apenas condições marcadas como permiteBonificacao E que o cliente tenha
                const condicoesDoCliente = idsArray.length > 0
                    ? todasCondicoes.filter(c => idsArray.includes(c.idCondicao) || idsArray.includes(c.id))
                    : (cliente.Condicao_de_pagamento ? [todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento)].filter(Boolean) : []);
                permitidas = condicoesDoCliente.filter(c => c.ativo !== false && c.permiteBonificacao === true);
            } else {
                const condicoesDoCliente = idsArray.length > 0
                    ? todasCondicoes.filter(c => idsArray.includes(c.idCondicao) || idsArray.includes(c.id))
                    : (cliente.Condicao_de_pagamento ? [todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento)].filter(Boolean) : []);
                permitidas = condicoesDoCliente.filter(c => c.ativo !== false && c.permitePedido !== false && c.permiteBonificacao !== true);
            }

            setCondicoesPermitidas(permitidas);

            if (!editId && !isRestoringDraftRef.current) {
                const padrao = todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento);
                if (permitidas.length === 1) setCondicaoPagamentoId(permitidas[0].idCondicao);
                else if (padrao && permitidas.some(c => c.idCondicao === padrao.idCondicao)) setCondicaoPagamentoId(padrao.idCondicao);
                else setCondicaoPagamentoId('');
            }

            // Carregar histórico de compras do cliente
            pedidoService.historicoComprasCliente(clienteId).then(historico => {
                const map = new Map();
                if (Array.isArray(historico)) {
                    historico.forEach(h => map.set(h.produtoId, h));
                }
                setHistoricoMap(map);
            }).catch(() => { });

            // Abrir o formulário (Data/Condição) para o vendedor configurar
            setMostrarFormulario(true);

            if (isRestoringDraftRef.current) {
                setTimeout(() => { isRestoringDraftRef.current = false; }, 500);
            }
        }
    }, [clienteId, clientes, todasCondicoes, especial, bonificacao]);

    useEffect(() => {
        if (clienteSelecionado) verificarDataEntrega(dataEntrega, clienteSelecionado);
    }, [dataEntrega]);

    const verificarDataEntrega = (dataStr, cliente) => {
        if (!dataStr || !cliente) return;
        const d = new Date(dataStr + 'T12:00:00Z');
        const dayOfWeekStr = DIA_SEMANA_MAP[d.getUTCDay()];
        const diasVisita = cliente.Dia_de_entrega || '';
        if (diasVisita && !diasVisita.includes(dayOfWeekStr)) {
            if (!isEncaixe) toast.error(`Aviso de Encaixe: A data escolhida não cai em um dia da semana cadastrado para entrega p/ este cliente. Este pedido será marcado como Encaixe.`, { duration: 6000, style: { maxWidth: "600px" } });
            setIsEncaixe(true);
        } else {
            setIsEncaixe(false);
        }
    };

    useEffect(() => {
        const cond = todasCondicoes.find(c => c.idCondicao === condicaoPagamentoId);
        setCondicaoSelecionada(cond || null);
        if (cond) {
            const catsEspecial = Array.isArray(cond.categoriasEspecial) ? cond.categoriasEspecial : [];
            if (especial && catsEspecial.length > 0) {
                // Especial: usa exclusivamente as categorias definidas na condição
                const cats = catsEspecial;
                (async () => {
                    const paramsProd = { limit: 1000, ativo: true, categorias: cats.join(',') };
                    const produtosData = await produtoService.listar(paramsProd);
                    const listaProdutos = produtosData.data || produtosData || [];
                    setProdutos(listaProdutos);
                    setItensMap(prev => reavaliarMapaItens(prev, cond, promocoesMap, listaProdutos));
                })();
            } else if (!especial && !bonificacao && catsEspecial.length > 0) {
                // Pedido comum: expande categorias padrão com as extras definidas na condição
                const catsPadrao = categoriasNormalRef.current || [];
                const cats = Array.from(new Set([...catsPadrao, ...catsEspecial]));
                (async () => {
                    const paramsProd = { limit: 1000, ativo: true };
                    if (cats.length > 0) paramsProd.categorias = cats.join(',');
                    const produtosData = await produtoService.listar(paramsProd);
                    const listaProdutos = produtosData.data || produtosData || [];
                    setProdutos(listaProdutos);
                    setItensMap(prev => reavaliarMapaItens(prev, cond, promocoesMap, listaProdutos));
                })();
            } else {
                recalcularItens(cond);
            }
        }
    }, [condicaoPagamentoId]);

    const checkPromoLiberada = useCallback((promo, mapRef) => {
        if (!promo) return false;
        if (promo.tipo === 'SIMPLES') return true;

        const itensList = Array.from(mapRef.entries()).map(([pid, it]) => ({
            produtoId: pid,
            quantidade: it.quantidade
        }));
        const valorTotal = Array.from(mapRef.values()).reduce((s, it) => s + it.valorUnitario * it.quantidade, 0);

        return promo.grupos?.some(grupo =>
            grupo.condicoes?.every(cond => {
                if (cond.tipo === 'PRODUTO_QUANTIDADE') {
                    const found = itensList.find(i => i.produtoId === cond.produtoId);
                    return found && Number(found.quantidade) >= Number(cond.quantidadeMinima);
                }
                if (cond.tipo === 'VALOR_TOTAL') return valorTotal >= Number(cond.valorMinimo);
                return false;
            })
        ) || false;
    }, []);

    const reavaliarMapaItens = useCallback((mapAtual, condicaoSel, todasPromos, listaProdutos) => {
        const novoMapa = new Map();
        const catSemLimite = clienteSelecionado?.categoriaCliente?.semLimiteDesconto || false;
        const limitePerc = catSemLimite ? 100 : (vendedorSelecionado?.maxDescontoFlex !== undefined ? Number(vendedorSelecionado.maxDescontoFlex) : 100);
        const regras = (especial && condicaoSel?.regrasCategoria) || [];

        mapAtual.forEach((item, pid) => {
            const produto = listaProdutos.find(p => p.id === pid);
            if (!produto) return;
            const promoAtiva = todasPromos.get(pid);
            const liberada = checkPromoLiberada(promoAtiva, mapAtual);

            // Verificar se há regra específica para a categoria CA do produto (somente em especiais)
            const regraCategoria = especial && produto.categoria
                ? regras.find(r => r.categoria === produto.categoria)
                : null;

            let acrescimo, precoBaseInicial;
            if (regraCategoria) {
                acrescimo = Number(regraCategoria.acrescimo) || 0;
                if (regraCategoria.precoBase === 'custoMedio') {
                    precoBaseInicial = Number(produto.custoMedio) || Number(produto.valorVenda) || 0;
                } else {
                    precoBaseInicial = Number(produto.valorVenda) || 0;
                }
                if (liberada) precoBaseInicial = Number(promoAtiva.precoPromocional);
            } else {
                acrescimo = condicaoSel ? Number(condicaoSel.acrescimoPreco) : 0;
                const precoTabela = Number(produto.valorVenda) || 0;
                precoBaseInicial = liberada ? Number(promoAtiva.precoPromocional) : precoTabela;
            }
            const novoValorBase = precoBaseInicial * (1 + acrescimo / 100);

            let novoValorUnitario = item.valorUnitario;

            // Auto-atualizar o valor unitário SE o usuário não tiver forçado um preço customizado
            // i.e., se o preço dele era exatamente igual ao valor base anterior
            if (Math.abs(Number(item.valorUnitario || 0) - Number(item.valorBase || 0)) < 0.01) {
                // garante que nao zere caso seja a 1a vez
                // REGRA HISTÓRICA DO USUÁRIO: Se tem PREÇO HISTÓRICO MANUAL, NUNCA AUTORESETE SE FOR MAIOR QUE A PROMO.
                // Usar a flag veioDeHistorico
                if (!item.veioDeHistorico) {
                    if (novoValorBase > 0) novoValorUnitario = novoValorBase;
                }
            }

            // NOVA REGRA CASCATA: Se a promo caiu (ou entrou), o limite base muda.
            // Precisamos garantir que o preço unitário atual do cara continue respeitando o novo base * (1 - limite)
            // REGRA EXTRA (PROMO_LIMIT): Se o item estiver com promo liberada, o desconto máximo passa a ser 0% sobre a Tabela Promocional!
            const limiteAplicado = liberada ? 0 : limitePerc;
            const valorMinimoPermitido = Number((novoValorBase * (1 - limiteAplicado / 100)).toFixed(2));
            if (novoValorUnitario < valorMinimoPermitido && valorMinimoPermitido > 0) {
                // Removemos o alerta daqui para não pipocar desespero durante carregamento mudo de promocoes de tela, o vendedor vê o chutar de volta
                novoValorUnitario = valorMinimoPermitido;
            }

            // Flag: preço abaixo do custo médio (para detecção de fraude em especiais)
            const custoMedio = Number(produto.custoMedio) || 0;
            const abaixoCustoMedio = especial && custoMedio > 0 && novoValorUnitario < custoMedio;

            novoMapa.set(pid, {
                ...item,
                emPromocao: liberada,
                valorUnitario: Number(novoValorUnitario.toFixed(2)),
                valorBase: Number(novoValorBase.toFixed(2)),
                flexUnitario: Number((novoValorUnitario - novoValorBase).toFixed(2)),
                abaixoCustoMedio,
                regraCategoria: regraCategoria?.categoria || null
            });
        });
        return novoMapa;
    }, [checkPromoLiberada, vendedorSelecionado, especial]);

    const recalcularItens = useCallback((condicao) => {
        if (!condicao) return;
        setItensMap(prev => reavaliarMapaItens(prev, condicao, promocoesMap, produtos));
    }, [reavaliarMapaItens, promocoesMap, produtos]);

    // Adicionar/atualizar quantidade de um produto
    const setQuantidade = useCallback(async (produtoId, novaQtd) => {
        if (novaQtd <= 0) {
            setItensMap(prev => {
                const m = new Map(prev);
                m.delete(produtoId);
                return reavaliarMapaItens(m, condicaoSelecionada, promocoesMap, produtos);
            });
            return;
        }
        setItensMap(prev => {
            const m = new Map(prev);
            const existente = m.get(produtoId);
            if (existente) {
                // Se existe e estamos SÓ mexendo na qtd
                const mCopia = new Map(m);
                mCopia.set(produtoId, { ...existente, quantidade: novaQtd });

                // Se mexeu na quantidade e a promo caiu, AVISA
                const antesTinhaPromo = existente.emPromocao;
                const depoisComPromo = checkPromoLiberada(promocoesMap.get(produtoId), mCopia);

                if (antesTinhaPromo && !depoisComPromo) {
                    toast.error(`⚠️ Promoção do Produto Perdida.\nSe o preço era promocional, será reajustado em cascata para Tabela Normal.`, { duration: 6000, style: { maxWidth: "600px" } });
                }

                m.set(produtoId, { ...existente, quantidade: novaQtd });
            } else {
                // Item novo no carrinho - chuta um valor inicial, depois reavaliarMapaItens ajusta perfeitamente
                const produto = produtos.find(p => p.id === produtoId);
                const precoTabela = Number(produto?.valorVenda || 0);
                const acrescimo = condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0;
                let valorBase = precoTabela * (1 + acrescimo / 100);
                let valorUnitario = valorBase;

                const hist = historicoMap.get(produtoId);
                let usouHistorico = false;
                if (hist && hist.ultimoPreco) {
                    valorUnitario = hist.ultimoPreco; // puxa historico do cliente
                    usouHistorico = true;
                }

                // Restrição: Se o Vendedor atual sofreu redução de limite Flex e o histórico é muito velho, corrige para a Tabela.
                const promoNova = promocoesMap.get(produtoId);
                // Prevemos temporariamente se a promo estaria ativa pra essa 1 unidade adicionada
                const temporarioLiberado = (promoNova?.tipo === 'SIMPLES'); // CONDICIONAL nao bate meta de cara, só dps.

                const catSemLimite = clienteSelecionado?.categoriaCliente?.semLimiteDesconto || false;
                const limiteBasePerc = catSemLimite ? 100 : (vendedorSelecionado?.maxDescontoFlex !== undefined ? Number(vendedorSelecionado.maxDescontoFlex) : 100);
                // Mínimo Tolerável no Adicionar
                const limitePerc = temporarioLiberado ? 0 : limiteBasePerc;
                const minDePromo = temporarioLiberado ? Number(promoNova.precoPromocional) : valorBase;
                const valorMinimoRealPermitido = Number((minDePromo * (1 - limitePerc / 100)).toFixed(2));

                // Exemplo Cliente Comprou a 42. Promo pede mínimo 39. Histórico 42 prevalece e o auto-atualizar ignora.
                if (valorUnitario < valorMinimoRealPermitido && valorMinimoRealPermitido > 0) {
                    if (usouHistorico) {
                        toast.error(`⚠️ O último preço pago (R$ ${valorUnitario.toFixed(2).replace('.', ',')}) excede o piso desta promoção/limite atual.\nO valor será ajustado para R$ ${valorMinimoRealPermitido.toFixed(2).replace('.', ',')}`, { duration: 6000, style: { maxWidth: "600px" } });
                    }
                    valorUnitario = valorMinimoRealPermitido; // Joga pro preço promo, ou pro limite normal.
                }

                m.set(produtoId, {
                    quantidade: novaQtd,
                    veioDeHistorico: usouHistorico,
                    valorUnitario: Number(valorUnitario.toFixed(2)),
                    valorBase: Number(valorBase.toFixed(2)),
                    flexUnitario: Number((valorUnitario - valorBase).toFixed(2))
                });

                // Buscar último preço real no backend silenciosamente se nao houver no historicoMap cacheado
                if (!usouHistorico && clienteId) {
                    pedidoService.obterUltimoPreco(clienteId, produtoId).then(res => {
                        if (res?.valor) {
                            setItensMap(prev2 => {
                                const m2 = new Map(prev2);
                                const it = m2.get(produtoId);
                                if (it) {
                                    let vp = Number(res.valor);

                                    const catSemLimite2 = clienteSelecionado?.categoriaCliente?.semLimiteDesconto || false;
                                    const limiteBasePerc = catSemLimite2 ? 100 : (vendedorSelecionado?.maxDescontoFlex !== undefined ? Number(vendedorSelecionado.maxDescontoFlex) : 100);
                                    const lPerc = it.emPromocao ? 0 : limiteBasePerc;
                                    const vMin = Number((it.valorBase * (1 - lPerc / 100)).toFixed(2));

                                    if (vp < vMin && vMin > 0) {
                                        toast.error(`⚠️ O último preço pago (R$ ${vp.toFixed(2).replace('.', ',')}) excede o limite de desconto atual.\nO valor foi ajustado para R$ ${vMin.toFixed(2).replace('.', ',')}`, { duration: 6000, style: { maxWidth: "600px" } });
                                        vp = vMin;
                                    }

                                    m2.set(produtoId, { ...it, valorUnitario: vp, flexUnitario: Number((vp - it.valorBase).toFixed(2)) });
                                }
                                return reavaliarMapaItens(m2, condicaoSelecionada, promocoesMap, produtos);
                            });
                        }
                    }).catch(() => { });
                }
            }
            return reavaliarMapaItens(m, condicaoSelecionada, promocoesMap, produtos);
        });
    }, [produtos, condicaoSelecionada, historicoMap, clienteId, reavaliarMapaItens, promocoesMap]);

    const setValorUnitario = useCallback((produtoId, valor) => {
        setItensMap(prev => {
            const m = new Map(prev);
            const it = m.get(produtoId);
            if (!it) return prev;

            // Apenas atualiza o estado para não travar a digitação do usuário
            // A validação de limite será feita no onBlur (verificarTravaValorUnitario)
            let vp = Number(valor.toString().replace(',', '.')) || 0;
            // Permitir deixar zerado temporariamente durante a digitação para não pular casas indesejadas
            m.set(produtoId, { ...it, valorUnitario: valor === '' ? '' : vp, flexUnitario: Number((vp - it.valorBase).toFixed(2)) });
            return m;
        });
    }, []);

    const verificarTravaValorUnitario = useCallback((produtoId) => {
        setItensMap(prev => {
            const m = new Map(prev);
            const it = m.get(produtoId);
            if (!it) return prev;

            let vp = Number(it.valorUnitario) || 0;

            // Trava de Desconto Máximo Flex por Vendedor
            // SE O PRODUTO ESTOU EM PROMO, DESCONTO MAX = 0
            const catSemLimite = clienteSelecionado?.categoriaCliente?.semLimiteDesconto || false;
            const limiteBasePerc = catSemLimite ? 100 : (vendedorSelecionado?.maxDescontoFlex !== undefined ? Number(vendedorSelecionado.maxDescontoFlex) : 100);
            const limitePerc = it.emPromocao ? 0 : limiteBasePerc;
            const valorMinimoPermitido = Number((it.valorBase * (1 - limitePerc / 100)).toFixed(2));

            if (vp < valorMinimoPermitido && valorMinimoPermitido > 0) {
                toast.error(`⚠️ O limite máximo de desconto foi excedido.\nO menor valor permitido é R$ ${valorMinimoPermitido.toFixed(2).replace('.', ',')}`, { duration: 6000, style: { maxWidth: "600px" } });
                vp = valorMinimoPermitido;
            }

            m.set(produtoId, { ...it, valorUnitario: vp, flexUnitario: Number((vp - it.valorBase).toFixed(2)) });
            return m;
        });
    }, [vendedorSelecionado, clienteSelecionado]);

    const validarHorarioEntrega = (dataStr) => {
        if (!dataStr || !user) return null;
        const perms = user.permissoes || {};
        if (perms.admin) return null;

        const agora = new Date();
        const horaAtual = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit' });
        const diaSemanaAtual = agora.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
        const hojeStr = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

        const d = new Date(dataStr + 'T12:00:00Z');
        const diaSemanaEntrega = d.getUTCDay();

        if ((diaSemanaEntrega === 0 || diaSemanaEntrega === 6) && !perms.Pode_Entregar_Fim_Semana) {
            return 'Você não tem permissão para criar pedidos com entrega no sábado ou domingo.';
        }

        const criadoNoFimDeSemana = diaSemanaAtual === 'Sat' || diaSemanaAtual === 'Sun';
        if (!criadoNoFimDeSemana) {
            const amanhaDate = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
            amanhaDate.setDate(amanhaDate.getDate() + 1);
            const amanhaStr = amanhaDate.toLocaleDateString('en-CA');

            if (dataStr === hojeStr) {
                const limite = perms.horarioLimiteHoje || '12:00';
                if (horaAtual >= limite) return `Horário limite para pedidos com entrega hoje já passou (${limite}). Atual: ${horaAtual}.`;
            } else if (dataStr === amanhaStr) {
                const limite = perms.horarioLimiteAmanha || '18:00';
                if (horaAtual >= limite) return `Horário limite para pedidos com entrega amanhã já passou (${limite}). Atual: ${horaAtual}.`;
            }
        }
        return null;
    };

    const handleSalvar = (statusEnvio) => {
        if (!clienteId || itensMap.size === 0) { toast.error("Preencha cliente e adicione itens.", { duration: 6000, style: { maxWidth: "600px" } }); return; }
        if (!tipoPedido) { toast.error("Selecione o tipo de pedido (Pedido, Especial ou Bonificação).", { duration: 6000, style: { maxWidth: "600px" } }); return; }
        if (!condicaoPagamentoId) { toast.error("Selecione uma condição de pagamento.", { duration: 6000, style: { maxWidth: "600px" } }); return; }
        if (!dataEntrega) { toast.error("Selecione a data de entrega.", { duration: 6000, style: { maxWidth: "600px" } }); return; }

        const erroHorario = validarHorarioEntrega(dataEntrega);
        if (erroHorario) { toast.error(erroHorario, { duration: 6000, style: { maxWidth: "600px" } }); return; }
        if (statusEnvio === 'ENVIAR' && !canalOrigem) { toast.error("Informe o Tipo de Atendimento que resultou nesta venda.", { duration: 6000, style: { maxWidth: "600px" } }); return; }

        // Bloqueio de valor mínimo
        const valorMinimoReq = Number(condicaoSelecionada?.valorMinimo) || 0;
        const total = Array.from(itensMap.values()).reduce((acc, i) => acc + (Number(i.valorUnitario) * Number(i.quantidade)), 0);

        if (total < valorMinimoReq) {
            toast.error(`ATENÇÃO: Este pedido não atingiu o valor mínimo exigido para esta tabela/condição (R$ ${valorMinimoReq.toFixed(2).replace('.', ',')}). Adicione mais itens ou escolha outra condição.`, { duration: 6000, style: { maxWidth: "600px" } });
            return;
        }

        setSaving(true);
        if (navigator.geolocation && statusEnvio === 'ENVIAR') {
            navigator.geolocation.getCurrentPosition(
                pos => salvarPedido(statusEnvio, `${pos.coords.latitude},${pos.coords.longitude}`),
                () => salvarPedido(statusEnvio, null),
                { enableHighAccuracy: true, timeout: 5000 }
            );
        } else {
            salvarPedido(statusEnvio, null);
        }
    };

    const salvarPedido = async (statusEnvio, latLng) => {
        let obsFinal = observacoes;
        if (isEncaixe) obsFinal = obsFinal ? `ENCAIXE DE ENTREGA\n${obsFinal}` : `ENCAIXE DE ENTREGA`;

        const itensLimpos = [];
        itensMap.forEach((item, pid) => {
            itensLimpos.push({
                produtoId: pid,
                quantidade: Number(item.quantidade.toString().replace(',', '.')),
                valor: Number(item.valorUnitario.toString().replace(',', '.')),
                valorBase: item.valorBase
            });
        });

        const payload = {
            clienteId, vendedorId,
            dataVenda: new Date(dataEntrega + 'T12:00:00Z').toISOString(),
            observacoes: obsFinal,
            tipoPagamento: condicaoSelecionada?.tipoPagamento,
            opcaoCondicaoPagamento: condicaoSelecionada?.opcaoCondicao,
            nomeCondicaoPagamento: condicaoSelecionada?.nomeCondicao || null,
            qtdParcelas: condicaoSelecionada?.qtdParcelas || 1,
            primeiroVencimento: null,
            intervaloDias: condicaoSelecionada?.parcelasDias || 0,
            idContaFinanceira: condicaoSelecionada?.bancoPadrao || null,
            idCategoria: null, latLng, statusEnvio,
            canalOrigem: canalOrigem || null,
            especial: !!especial,
            bonificacao: !!bonificacao,
            valorFrete: valorFrete !== '' && Number(valorFrete) > 0 ? Number(valorFrete) : null,
            itens: itensLimpos
        };

        try {
            let pedidoResult;
            if (editId) pedidoResult = await pedidoService.atualizar(editId, payload);
            else pedidoResult = await pedidoService.criar(payload);

            localStorage.removeItem('@CAHardt:NovoPedido_Draft');
            const highlightId = pedidoResult?.id || (editId ? Number(editId) : null);
            navigate('/pedidos', {
                state: {
                    highlightId,
                    especial: !!especial,
                    bonificacao: !!bonificacao,
                }
            });
        } catch (error) {
            toast.error(error.response?.data?.error || "Erro ao salvar pedido.", { duration: 6000, style: { maxWidth: "600px" } });
        } finally {
            setSaving(false);
        }
    };

    const clientesBusca = useMemo(() => {
        if (!showClienteModal) return [];
        const lowerSearch = clienteSearchText.toLowerCase().trim();
        return clientes.filter(c =>
            !lowerSearch ||
            (c.NomeFantasia || c.Nome)?.toLowerCase().includes(lowerSearch) ||
            (c.Documento || '').includes(lowerSearch)
        );
    }, [clientes, clienteSearchText, showClienteModal]);

    // Otimização: Cachear as listas de produtos (só recalcula quando necessário)
    const { produtosJaComprados, produtosComPromoNaoComprados, produtosOutros } = useMemo(() => {
        const termoBusca = produtoSearch.toLowerCase().trim();
        const filtrados = produtos.filter(p => {
            if (!termoBusca) return true;
            return (p.nome && p.nome.toLowerCase().includes(termoBusca))
                || (p.codigo && p.codigo.toLowerCase().includes(termoBusca));
        });

        const historicoPorData = Array.from(historicoMap.entries())
            .sort((a, b) => new Date(b[1].ultimaCompra) - new Date(a[1].ultimaCompra));

        // Apenas produtos do histórico de compras (sem incluir itensMap para evitar que itens pulem de seção)
        const jaCompradosIds = new Set(historicoPorData.map(([pid]) => pid));

        const jaC = [];
        const promoC = [];
        const outC = [];

        // Adiciona itens que estão no histórico ou no carrinho ativo (itensMap)
        jaCompradosIds.forEach(pid => {
            const prod = filtrados.find(p => p.id === pid);
            if (prod) {
                const hist = historicoMap.get(pid) || null;
                jaC.push({ ...prod, hist });
            }
        });

        filtrados
            .filter(p => !jaCompradosIds.has(p.id))
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
            .forEach(p => {
                if (promocoesMap.has(p.id)) {
                    promoC.push({ ...p, hist: null });
                } else {
                    outC.push({ ...p, hist: null });
                }
            });

        return {
            produtosJaComprados: jaC,
            produtosComPromoNaoComprados: promoC,
            produtosOutros: outC
        };
    }, [produtos, produtoSearch, historicoMap, promocoesMap, itensMap]);

    const handleExcluir = async () => {
        if (!editId) return;
        if (!window.confirm("Tem certeza que deseja excluir permanentemente este rascunho?")) return;
        setSaving(true);
        try {
            await pedidoService.excluir(editId);
            localStorage.removeItem('@CAHardt:NovoPedido_Draft');
            navigate('/rotas');
        } catch (error) {
            toast.error(error.response?.data?.error || "Erro ao excluir o pedido.", { duration: 6000, style: { maxWidth: "600px" } });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-sm text-gray-500">Carregando...</p>
            </div>
        </div>
    );

    const vTotal = Array.from(itensMap.values()).reduce(
        (acc, i) => acc + (Number(i.valorUnitario) * Number(i.quantidade)), 0
    );

    // Speech recognition para observações
    const toggleMicrophone = () => {
        if (isListening) {
            if (recognitionRef.current) recognitionRef.current.stop();
            recognitionRef.current = null;
            setIsListening(false);
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            toast.error('Reconhecimento de voz não suportado neste navegador/dispositivo.');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = true;
        originalTextRef.current = observacoes;
        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }
            const updatedBase = (originalTextRef.current + ' ' + finalTranscript).replace(/\s+/g, ' ').trim();
            setObservacoes((updatedBase + ' ' + interimTranscript).trim());
            if (finalTranscript !== '') {
                originalTextRef.current = updatedBase;
            }
        };
        recognition.onerror = (event) => {
            if (event.error !== 'aborted') toast.error('Grave de mais perto ou verifique sua conexão.');
            setIsListening(false);
        };
        recognition.onend = () => { recognitionRef.current = null; setIsListening(false); };
        recognitionRef.current = recognition;
        try { recognition.start(); } catch (e) { console.error(e); }
    };

    const renderProdutoRow = (produto) => {
        const item = itensMap.get(produto.id);
        const qtd = item?.quantidade || 0;
        const valor = item?.valorUnitario;
        const hist = produto.hist;
        const promo = promocoesMap.get(produto.id);
        const expandido = expandidosProduto.has(produto.id);
        const temExpand = !!hist || !!promo; // expandível se tem histórico ou promoção

        // Imagem principal do produto
        const imgUrl = produto.imagens && produto.imagens.length > 0
            ? `${API_URL}${produto.imagens[0].url}`
            : null;

        const toggleExpand = () => {
            if (!temExpand) return;
            setExpandidosProduto(prev => {
                const n = new Set(prev);
                n.has(produto.id) ? n.delete(produto.id) : n.add(produto.id);
                return n;
            });
        };

        return (
            <div className={`border-b border-gray-100 ${qtd > 0 ? 'bg-blue-50/40' : 'bg-white'}`}>
                {/* Linha principal — clicável para expandir histórico nos Já Comprados */}
                <div
                    className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 ${temExpand ? 'cursor-pointer active:bg-gray-50' : ''}`}
                    onClick={toggleExpand}
                >
                    <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                        {/* Foto do produto */}
                        <div className="w-12 h-12 rounded overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                            {imgUrl ? (
                                <img src={imgUrl} alt={produto.nome} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                    <Package className="h-5 w-5 text-gray-300" />
                                </div>
                            )}
                        </div>

                        {/* Info do produto */}
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{produto.nome}</div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                                {/* Tag de Promoção */}
                                {(() => {
                                    if (!promo) return null;

                                    const acrescimo = condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0;
                                    const precoPromoComTabela = Number(promo.precoPromocional) * (1 + acrescimo / 100);

                                    if (promo.tipo === 'CONDICIONAL') {
                                        const liberada = checkPromoLiberada(promo, itensMap);
                                        if (!liberada) return (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-dashed border-gray-300 flex items-center gap-1">
                                                <Tag className="h-3 w-3" /> P. Cond.
                                            </span>
                                        );
                                    }
                                    return (
                                        <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 font-semibold flex items-center gap-1">
                                            <Tag className="h-3 w-3" /> R$ {precoPromoComTabela.toFixed(2).replace('.', ',')}
                                        </span>
                                    );
                                })()}

                                {/* Preço / input de preço */}
                                {qtd > 0 ? (
                                    <div className="flex items-center gap-1">
                                        {item && (Number(item.valorBase) > Number(item.valorUnitario) || promo) && (
                                            <span className="text-[10px] sm:text-xs text-gray-400 line-through mr-1">
                                                R$ {Number(item.valorBase).toFixed(2).replace('.', ',')}
                                            </span>
                                        )}
                                        <span className="text-xs font-bold text-blue-700" onClick={e => e.stopPropagation()}>
                                            <input
                                                type="number"
                                                min="0" step="any"
                                                className="w-[60px] sm:w-[72px] border border-blue-300 bg-white text-blue-800 rounded px-1.5 py-0.5 text-xs font-bold text-center"
                                                value={valor}
                                                onFocus={e => e.target.select()}
                                                onChange={e => setValorUnitario(produto.id, e.target.value)}
                                                onBlur={() => verificarTravaValorUnitario(produto.id)}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); } }}
                                            />
                                        </span>
                                    </div>
                                ) : (
                                    (() => {
                                        const acrescimoTabela = condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0;
                                        const regras = (especial && condicaoSelecionada?.regrasCategoria) || [];
                                        const regraCategoria = especial && produto.categoria ? regras.find(r => r.categoria === produto.categoria) : null;
                                        let precoExibido;
                                        if (regraCategoria) {
                                            const base = regraCategoria.precoBase === 'custoMedio' ? (Number(produto.custoMedio) || Number(produto.valorVenda) || 0) : (Number(produto.valorVenda) || 0);
                                            precoExibido = base * (1 + (Number(regraCategoria.acrescimo) || 0) / 100);
                                        } else {
                                            precoExibido = Number(produto.valorVenda || 0) * (1 + acrescimoTabela / 100);
                                        }
                                        return (
                                            <span className="text-xs font-bold text-orange-600 border border-orange-200 bg-orange-50 px-1 rounded">
                                                R$ {precoExibido.toFixed(2).replace('.', ',')}
                                            </span>
                                        );
                                    })()
                                )}
                                {/* Flex badge */}
                                {qtd > 0 && item && (
                                    <span className={`text-[10px] font-semibold px-1 py-0 rounded ${item.flexUnitario >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {item.flexUnitario >= 0 ? '+' : ''}{item.flexUnitario.toFixed(2)}
                                    </span>
                                )}
                                {/* Abaixo do custo médio */}
                                {qtd > 0 && item?.abaixoCustoMedio && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse">
                                        ABAIXO CM
                                    </span>
                                )}
                                {/* Peso */}
                                {produto.pesoLiquido > 0 && (
                                    <span className="text-[10px] sm:text-xs text-gray-400 font-medium">{Number(produto.pesoLiquido).toFixed(0)}g</span>
                                )}
                                {/* Estoque */}
                                <span className={`text-[10px] sm:text-xs font-semibold ${Number(produto.estoqueDisponivel) > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    Est: {Number(produto.estoqueDisponivel || 0).toFixed(0)} {produto.unidade || 'un'}
                                </span>
                            </div>
                        </div>
                        {/* Chevron (Desktop/Tablet) */}
                        <div className="hidden sm:flex text-gray-400 ml-auto shrink-0 self-center pl-2">
                            {temExpand && (expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                        </div>
                    </div>

                    {/* Controles de quantidade (E Chevron Mobile) */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 mt-1 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-gray-100" onClick={e => e.stopPropagation()}>
                        <div className="flex sm:hidden text-gray-400 pl-1">
                            {temExpand && (expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-auto">
                            {qtd > 0 && (
                                <button
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={() => {
                                        const step = produto.categoriaProduto?.permiteFracao ? 0.1 : 1;
                                        const next = Math.round((qtd - step) * 1000) / 1000;
                                        setQuantidade(produto.id, next > 0 ? next : 0);
                                    }}
                                    className="w-8 h-8 flex items-center justify-center rounded-md bg-red-100 text-red-600 active:bg-red-200"
                                >
                                    <Minus className="h-4 w-4" />
                                </button>
                            )}
                            {qtd > 0 && (
                                <QuantidadeInput
                                    value={qtd}
                                    permiteFracao={!!produto.categoriaProduto?.permiteFracao}
                                    onChange={v => setQuantidade(produto.id, v)}
                                />
                            )}
                            <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => setQuantidade(produto.id, qtd + 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-md bg-blue-600 text-white active:bg-blue-700 shadow-sm"
                            >
                                <Plus className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Painel de Promoção expansível */}
                {expandido && promo && (() => {
                    const acrescimo = condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0;
                    const precoPromoComTabela = Number(promo.precoPromocional) * (1 + acrescimo / 100);
                    // Revaliar para mostrar status atual
                    let liberada = true;
                    if (promo.tipo === 'CONDICIONAL') {
                        const itensList = Array.from(itensMap.entries()).map(([pid, it]) => ({ produtoId: pid, quantidade: it.quantidade }));
                        const valorTotal = Array.from(itensMap.values()).reduce((s, it) => s + it.valorUnitario * it.quantidade, 0);
                        liberada = promo.grupos?.some(grupo =>
                            grupo.condicoes?.every(cond => {
                                if (cond.tipo === 'PRODUTO_QUANTIDADE') {
                                    const found = itensList.find(i => i.produtoId === cond.produtoId);
                                    return found && Number(found.quantidade) >= Number(cond.quantidadeMinima);
                                }
                                if (cond.tipo === 'VALOR_TOTAL') return valorTotal >= Number(cond.valorMinimo);
                                return false;
                            })
                        );
                    }
                    return (
                        <div className="pl-14 pr-3 pb-2 pt-1.5 bg-green-50/70 border-t border-green-100">
                            <div className="flex items-center gap-2 mb-1">
                                <Tag className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-xs font-bold text-green-700">{promo.nome}</span>
                                <span className={`text-xs px-1.5 py-0 rounded-full font-medium ml-auto ${promo.tipo === 'SIMPLES' ? 'bg-blue-100 text-blue-700' : liberada ? 'bg-green-200 text-green-800' : 'bg-orange-100 text-orange-700'
                                    }`}>
                                    {promo.tipo === 'SIMPLES' ? 'SIMPLES' : liberada ? '✓ LIBERADA' : 'CONDICIONAL'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-500">Preço promo:</span>
                                <span className="font-bold text-green-700">R$ {precoPromoComTabela.toFixed(2).replace('.', ',')}</span>
                                {acrescimo > 0 && <span className="text-gray-400">(base R$ {Number(promo.precoPromocional).toFixed(2)} + {acrescimo}%)</span>}
                                <span className="text-gray-400 ml-auto">{new Date(promo.dataInicio).toLocaleDateString('pt-BR')} → {new Date(promo.dataFim).toLocaleDateString('pt-BR')}</span>
                            </div>
                            {promo.tipo === 'CONDICIONAL' && promo.grupos?.map((g, gi) => (
                                <div key={g.id}>
                                    {/* OU entre grupos */}
                                    {gi > 0 && (
                                        <div className="text-center text-xs font-bold text-orange-500 my-0.5">— OU —</div>
                                    )}
                                    <div className="mt-1 text-xs bg-white/70 border border-green-100 rounded px-2 py-1.5 space-y-1">
                                        {g.condicoes?.map((c, ci) => {
                                            const nomeProd = c.tipo === 'PRODUTO_QUANTIDADE'
                                                ? (produtos.find(p => p.id === c.produtoId)?.nome || c.produtoId)
                                                : null;
                                            return (
                                                <div key={c.id}>
                                                    {/* E entre condições do mesmo grupo */}
                                                    {ci > 0 && (
                                                        <div className="text-xs text-center text-gray-400 font-semibold py-0.5">E</div>
                                                    )}
                                                    {c.tipo === 'PRODUTO_QUANTIDADE' ? (
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-gray-700 font-medium truncate mr-2">{nomeProd}</span>
                                                            <span className="text-purple-700 font-bold shrink-0">≥ {c.quantidadeMinima} un</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-gray-700 font-medium">Valor do pedido</span>
                                                            <span className="text-purple-700 font-bold shrink-0">≥ R$ {Number(c.valorMinimo).toFixed(2).replace('.', ',')}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                        </div>
                    );
                })()}

                {/* Histórico de compras expansível */}
                {expandido && hist && hist.compras && hist.compras.length > 0 && (
                    <div className="pl-16 pr-3 pb-2 bg-amber-50/60 border-t border-amber-100">
                        <table className="w-full text-xs mt-1.5">
                            <thead>
                                <tr className="text-gray-500">
                                    <th className="text-left font-medium pb-1">Pedido</th>
                                    <th className="text-center font-medium pb-1">Qtde</th>
                                    <th className="text-right font-medium pb-1">R$ Un</th>
                                    <th className="text-right font-medium pb-1">Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hist.compras.map((c, i) => (
                                    <tr key={i} className="border-t border-amber-100">
                                        <td className="py-0.5 text-gray-600">#{c.numero || '-'}</td>
                                        <td className="py-0.5 text-center font-semibold text-gray-800">{c.quantidade}</td>
                                        <td className="py-0.5 text-right font-semibold text-gray-800">{Number(c.valor).toFixed(2).replace('.', ',')}</td>
                                        <td className="py-0.5 text-right text-gray-500">{fmtData(c.data)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-gray-50 min-h-screen flex flex-col">
            {/* ===== HEADER COMPACTO ===== */}
            <div className="bg-white shadow-sm sticky top-0 z-20">
                <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                localStorage.removeItem('@CAHardt:NovoPedido_Draft');
                                navigate(-1);
                            }}
                            className="text-gray-600 p-1"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <h1 className="text-base font-bold text-gray-900">
                            {editId ? 'Editar Pedido' : bonificacao ? 'Nova Bonificação' : especial ? 'Novo Especial' : 'Novo Pedido'}
                        </h1>
                        {isEncaixe && (
                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">ENCAIXE</span>
                        )}
                        {bonificacao && (
                            <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">BONIFICAÇÃO</span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {editId && (
                            <button onClick={handleExcluir} className="text-red-500 text-xs font-semibold">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        )}
                        <button onClick={() => handleSalvar('ABERTO')} className="text-blue-600 font-semibold text-xs">
                            Salvar
                        </button>
                    </div>
                </div>

                {/* Barra flex */}
                <div className={`px-4 py-1 flex justify-between items-center text-xs font-bold text-white ${bonificacao ? 'bg-green-700' : flexTotal >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                    <span>{bonificacao ? 'Bonificação' : `Flex: ${flexTotal > 0 ? '+' : ''}${flexTotal.toFixed(2).replace('.', ',')}`}</span>
                    <span className="font-normal opacity-80">
                        {itensMap.size} {itensMap.size === 1 ? 'item' : 'itens'} · Total: R$ {bonificacao ? '0,00' : vTotal.toFixed(2).replace('.', ',')}
                    </span>
                </div>
            </div>

            {/* ===== FORMULÁRIO (cliente + etapas sequenciais) ===== */}
            <div className="bg-white shadow-sm">
                {/* Campo cliente — abre info (read-only) se já selecionado, busca se não */}
                <div className="px-3 py-3 border-b border-gray-100 bg-white">
                    <button
                        className="w-full relative flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 active:bg-gray-100 transition-colors text-left"
                        onClick={() => {
                            if (clienteId && clienteSelecionado) {
                                setShowClientePopup(true);
                            } else {
                                setShowClienteModal(true);
                            }
                        }}
                    >
                        <div className="flex items-center gap-2 overflow-hidden">
                            <User className="h-5 w-5 text-gray-500 shrink-0" />
                            {clienteId && clienteSelecionado ? (
                                <>
                                    <span className="text-[14px] font-bold text-gray-900 truncate tracking-tight leading-tight pt-0.5">
                                        {clienteSelecionado.Documento ? `${clienteSelecionado.Documento.replace(/\D/g, '').slice(-6)} ` : ''}
                                        {clienteSelecionado.NomeFantasia || clienteSelecionado.Nome || clienteSearchText}
                                    </span>
                                </>
                            ) : (
                                <span className="text-[14px] font-semibold text-gray-400 tracking-tight leading-tight pt-0.5">
                                    Toque p/ buscar cliente...
                                </span>
                            )}
                        </div>
                    </button>
                </div>

                {/* Etapas sequenciais — cada uma só aparece após a anterior estar preenchida */}
                {clienteId && (
                    <>
                        {/* Resumo compacto (quando formulário recolhido e tudo preenchido) */}
                        {!mostrarFormulario && tipoPedido && condicaoPagamentoId && canalOrigem && (
                            <button
                                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                                onClick={() => setMostrarFormulario(true)}
                            >
                                <span className="flex items-center gap-2">
                                    <Calendar className="h-3.5 w-3.5" />
                                    <span>{dataEntrega.split('-').reverse().join('/')}</span>
                                    <span className="text-gray-300">·</span>
                                    <span className="font-semibold text-gray-700 truncate max-w-[150px]">
                                        {condicaoSelecionada?.nomeCondicao || 'Sem condição'}
                                    </span>
                                    {condicaoSelecionada && <span className="text-gray-400">({condicaoSelecionada.acrescimoPreco}%)</span>}
                                    <span className="text-gray-300">·</span>
                                    <span className="text-gray-600">{TIPOS_ATENDIMENTO.find(t => t.value === canalOrigem)?.label}</span>
                                </span>
                                <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                        )}

                        {/* Formulário expandido com etapas */}
                        {mostrarFormulario && (
                            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-100">

                                {/* ── ETAPA 1: Tipo de Pedido ── */}
                                <div className="pt-2">
                                    <label className="text-xs text-gray-500 font-medium mb-1.5 block">Tipo de Pedido *</label>
                                    <div className="flex gap-2">
                                        {/* Pedido Normal — sempre visível */}
                                        <button
                                            type="button"
                                            className={`flex-1 px-3 py-2.5 rounded-md text-xs font-bold border transition-colors ${tipoPedido === 'PEDIDO' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
                                            onClick={async () => {
                                                setTipoPedido('PEDIDO');
                                                setEspecial(false);
                                                setBonificacao(false);
                                                setCondicaoPagamentoId('');
                                                setCondicaoSelecionada(null);
                                                await recarregarProdutos(categoriasNormalRef.current);
                                            }}
                                        >
                                            Pedido
                                        </button>

                                        {/* Especial — só se tem permissão */}
                                        {(user?.permissoes?.Pode_Criar_Especial || user?.permissoes?.admin) && (
                                            <button
                                                type="button"
                                                className={`flex-1 px-3 py-2.5 rounded-md text-xs font-bold border transition-colors ${tipoPedido === 'ESPECIAL' ? 'bg-purple-600 text-white border-purple-600 shadow-sm' : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'}`}
                                                onClick={async () => {
                                                    setTipoPedido('ESPECIAL');
                                                    setEspecial(true);
                                                    setBonificacao(false);
                                                    setCondicaoPagamentoId('');
                                                    setCondicaoSelecionada(null);
                                                    setProdutos([]);
                                                }}
                                            >
                                                Especial
                                            </button>
                                        )}

                                        {/* Bonificação — só se tem permissão */}
                                        {(user?.permissoes?.Pode_Criar_Bonificacao || user?.permissoes?.admin) && (
                                            <button
                                                type="button"
                                                className={`flex-1 px-3 py-2.5 rounded-md text-xs font-bold border transition-colors ${tipoPedido === 'BONIFICACAO' ? 'bg-green-600 text-white border-green-600 shadow-sm' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}
                                                onClick={async () => {
                                                    setTipoPedido('BONIFICACAO');
                                                    setBonificacao(true);
                                                    setEspecial(false);
                                                    setCondicaoPagamentoId('');
                                                    setCondicaoSelecionada(null);
                                                    await recarregarProdutos(categoriasNormalRef.current);
                                                }}
                                            >
                                                Bonificação
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* ── ETAPA 2: Condição de Pagamento (só após tipo escolhido) ── */}
                                {tipoPedido && (
                                    <div className="relative pt-2 border-t border-gray-100">
                                        <label className="text-xs text-gray-500 font-medium">
                                            Condição de Pagamento *
                                            {especial && <span className="text-purple-600 ml-1">(Especial)</span>}
                                            {bonificacao && <span className="text-green-600 ml-1">(Bonificação)</span>}
                                        </label>
                                        <div
                                            className="mt-0.5 w-full border border-gray-300 rounded-md p-2 bg-white text-gray-900 text-sm font-semibold flex justify-between items-center cursor-pointer"
                                            onClick={() => setMostrarCondicoesDropdown(!mostrarCondicoesDropdown)}
                                        >
                                            <span className={condicaoSelecionada ? 'text-gray-900' : 'text-gray-400 font-normal'}>
                                                {condicaoSelecionada ? condicaoSelecionada.nomeCondicao : 'Selecione...'}
                                            </span>
                                            <ChevronDown className="h-4 w-4 text-gray-400" />
                                        </div>
                                        {mostrarCondicoesDropdown && (
                                            <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 shadow-xl max-h-52 rounded-md overflow-auto">
                                                {condicoesPermitidas.map(c => (
                                                    <li key={c.idCondicao}
                                                        className={`py-2.5 px-3 text-sm font-semibold cursor-pointer hover:bg-gray-50 border-b border-gray-50 flex justify-between ${condicaoPagamentoId === c.idCondicao ? 'bg-blue-50 text-blue-800' : 'text-gray-900'}`}
                                                        onClick={() => { setCondicaoPagamentoId(c.idCondicao); setMostrarCondicoesDropdown(false); }}>
                                                        {c.nomeCondicao}
                                                        {condicaoPagamentoId === c.idCondicao && <CheckCircle className="h-4 w-4 text-blue-600" />}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {condicoesPermitidas.length === 0 && (
                                            <p className="text-red-500 text-xs mt-1">
                                                {especial
                                                    ? 'Este cliente não possui condição de pagamento habilitada para pedido especial. Solicite ao administrador.'
                                                    : bonificacao
                                                    ? 'Este cliente não está autorizado para bonificação. Solicite a liberação ao administrador.'
                                                    : 'Nenhuma tabela de preço habilitada para este cliente.'}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* ── ETAPA 3: Data de Entrega (só após condição selecionada) ── */}
                                {tipoPedido && condicaoPagamentoId && (
                                    <div className="pt-2 border-t border-gray-100">
                                        <label className="text-xs text-gray-500 font-medium">Data de Entrega *</label>
                                        {dataSugerida && !dataEntrega && (
                                            <p className="text-xs text-blue-500 mt-0.5 font-medium">
                                                Sugestão: <b>{dataSugerida.split('-').reverse().join('/')}</b>
                                                <button
                                                    type="button"
                                                    className="ml-2 text-blue-600 underline font-bold"
                                                    onClick={() => setDataEntrega(dataSugerida)}
                                                >
                                                    Usar esta data
                                                </button>
                                            </p>
                                        )}
                                        <div className="relative mt-0.5">
                                            <input
                                                type="date"
                                                className={`w-full border rounded-md p-2 bg-white text-sm focus:ring-blue-500 focus:border-blue-500 ${validarHorarioEntrega(dataEntrega) ? 'border-red-400 bg-red-50 text-red-700' : dataEntrega ? 'border-gray-300 text-gray-900' : 'border-blue-300 text-gray-400'}`}
                                                value={dataEntrega}
                                                onChange={e => setDataEntrega(e.target.value)}
                                                onClick={e => { try { if (e.target.showPicker) e.target.showPicker(); } catch (err) { } }}
                                            />
                                        </div>
                                        {dataEntrega && validarHorarioEntrega(dataEntrega) && (
                                            <p className="text-xs text-red-600 font-semibold mt-1 bg-red-50 rounded px-2 py-1 border border-red-200">
                                                {validarHorarioEntrega(dataEntrega)}
                                            </p>
                                        )}
                                        {isEncaixe && (
                                            <div className="mt-1 flex">
                                                <span className="text-xs text-amber-600 font-bold bg-amber-50 rounded px-2 py-1 border border-amber-200 shadow-sm uppercase tracking-wide">
                                                    Encaixe
                                                </span>
                                            </div>
                                        )}
                                        {clienteSelecionado?.Dia_de_entrega && (
                                            <p className="text-xs text-gray-400 mt-1">Dias do cliente: <b>{clienteSelecionado.Dia_de_entrega}</b></p>
                                        )}

                                        <div className="mt-3">
                                            <label className="text-xs text-gray-500 font-medium">Frete <span className="text-gray-400">(opcional)</span></label>
                                            <div className="relative mt-0.5">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    placeholder="0,00"
                                                    className="w-full border border-gray-300 rounded-md p-2 pl-9 bg-white text-sm focus:ring-blue-500 focus:border-blue-500"
                                                    value={valorFrete}
                                                    onChange={e => setValorFrete(e.target.value)}
                                                />
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-0.5">Se informado, será enviado ao Conta Azul como frete da venda.</p>
                                        </div>
                                    </div>
                                )}

                                {/* ── ETAPA 4: Qualidade do Atendimento (só após data) ── */}
                                {tipoPedido && condicaoPagamentoId && dataEntrega && (
                                    <div className="pt-2 border-t border-gray-100">
                                        <label className="text-xs text-gray-500 font-medium mb-1.5 flex items-center gap-1.5">
                                            <Phone className="h-3.5 w-3.5" />
                                            Qualidade do Atendimento *
                                        </label>
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                            {TIPOS_ATENDIMENTO.map(t => (
                                                <button
                                                    key={t.value}
                                                    onClick={() => {
                                                        setCanalOrigem(t.value);
                                                    }}
                                                    className={`px-2.5 py-1.5 rounded text-[12px] font-semibold border transition-colors ${canalOrigem === t.value ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── ETAPA 5: Observações (só após qualidade, NÃO obrigatória) ── */}
                                {tipoPedido && condicaoPagamentoId && dataEntrega && canalOrigem && (
                                    <div className="pt-2 border-t border-gray-100">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="text-xs text-gray-500 font-medium flex items-center gap-1">
                                                <FileText className="h-3.5 w-3.5" />
                                                Observações <span className="text-gray-400">(opcional)</span>
                                            </label>
                                            <button
                                                type="button"
                                                onClick={toggleMicrophone}
                                                className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${isListening
                                                    ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                            >
                                                {isListening ? (
                                                    <><MicOff className="h-3 w-3" /> Ouvindo...</>
                                                ) : (
                                                    <><Mic className="h-3 w-3" /> Ditar</>
                                                )}
                                            </button>
                                        </div>
                                        <textarea
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                                            rows="3"
                                            placeholder="Restrições de doca, horários, observações gerais..."
                                            value={observacoes}
                                            onChange={e => setObservacoes(e.target.value)}
                                        />

                                        {/* Botão para recolher e ir para itens */}
                                        <button
                                            onClick={() => setMostrarFormulario(false)}
                                            className="w-full mt-3 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-md active:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <ShoppingBag className="h-4 w-4" />
                                            Escolher Itens
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ===== LISTA DE PRODUTOS ===== */}
            {clienteId && tipoPedido && condicaoPagamentoId && canalOrigem && !mostrarFormulario && (
                <div className="flex-1 pb-28">
                    {/* Campo de busca de produto fixo */}
                    <div className="bg-gray-100 px-3 py-2 sticky top-[72px] z-10 border-b border-gray-200">
                        <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 gap-2 shadow-sm">
                            <Search className="h-4 w-4 text-gray-400 shrink-0" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder-gray-400"
                                placeholder="Buscar produto por nome ou código..."
                                value={produtoSearch}
                                onChange={e => setProdutoSearch(e.target.value)}
                            />
                            {produtoSearch && (
                                <button onClick={() => setProdutoSearch('')} className="text-gray-400">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Produtos já comprados */}
                    {produtosJaComprados.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-amber-600" />
                                <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">Já Comprados</span>
                            </div>
                            {produtosJaComprados.map(p => <React.Fragment key={p.id}>{renderProdutoRow(p)}</React.Fragment>)}
                        </div>
                    )}

                    {/* Produtos em promoção (não comprados antes) */}
                    {produtosComPromoNaoComprados.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 bg-green-50 border-b border-green-100 flex items-center gap-1.5">
                                <Tag className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Em Promoção</span>
                            </div>
                            {produtosComPromoNaoComprados.map(p => <React.Fragment key={p.id}>{renderProdutoRow(p)}</React.Fragment>)}
                        </div>
                    )}

                    {/* Outros produtos */}
                    {produtosOutros.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-200 flex items-center gap-1.5">
                                <ShoppingBag className="h-3.5 w-3.5 text-gray-500" />
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                                    {produtosJaComprados.length > 0 ? 'Outros Produtos' : 'Produtos'}
                                </span>
                            </div>
                            {produtosOutros.map(p => <React.Fragment key={p.id}>{renderProdutoRow(p)}</React.Fragment>)}
                        </div>
                    )}

                    {produtosJaComprados.length === 0 && produtosComPromoNaoComprados.length === 0 && produtosOutros.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <Search className="h-10 w-10 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Nenhum produto encontrado</p>
                        </div>
                    )}
                </div>
            )}

            {/* Placeholder quando etapas incompletas */}
            {clienteId && mostrarFormulario && (!tipoPedido || !condicaoPagamentoId || !canalOrigem) && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 bg-opacity-70">
                    <div className="max-w-xs space-y-6">
                        {!tipoPedido ? (
                            <div>
                                <Package className="h-10 w-10 text-blue-400 mx-auto mb-3" />
                                <p className="text-sm text-gray-900 font-bold">Escolha o Tipo de Pedido</p>
                                <p className="text-xs text-gray-500 mt-1 font-medium">Selecione acima se é Pedido, Especial ou Bonificação.</p>
                            </div>
                        ) : !condicaoPagamentoId ? (
                            <div>
                                <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
                                <p className="text-sm text-gray-900 font-bold">Selecione a Condição de Pagamento</p>
                                <p className="text-xs text-gray-500 mt-1 font-medium">{especial ? 'As categorias de produtos serão definidas pela condição selecionada.' : bonificacao ? 'Selecione a condição de pagamento para o pedido bonificação.' : 'Você precisa definir a tabela e juros base.'}</p>
                            </div>
                        ) : (
                            <div>
                                <Phone className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                                <p className="text-sm text-gray-900 font-bold">Qualidade do Atendimento Pendente</p>
                                <p className="text-xs text-gray-500 mt-1 font-medium">Escolha acima se foi visita, WhatsApp, ligação, etc para liberar os produtos.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Placeholder sem cliente */}
            {!clienteId && (
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                    <div>
                        <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-sm text-gray-500 font-medium">Busque um cliente para começar</p>
                    </div>
                </div>
            )}

            {/* ===== FOOTER FECHAR PEDIDO ===== */}
            {itensMap.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
                    {(() => {
                        const min = Number(condicaoSelecionada?.valorMinimo) || 0;
                        const bloqueado = min > 0 && vTotal < min;

                        if (bloqueado) {
                            return (
                                <div className="flex flex-col gap-2">
                                    <div className="bg-red-50 text-red-700 px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 border border-red-100">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>Faltam R$ {(min - vTotal).toFixed(2).replace('.', ',')} para atingir o mínimo desta tabela (R$ {min.toFixed(2).replace('.', ',')})</span>
                                    </div>
                                    <button
                                        disabled
                                        className="w-full bg-gray-300 text-gray-500 font-bold py-3.5 rounded-lg text-[15px] cursor-not-allowed uppercase tracking-wide"
                                    >
                                        VALOR MÍNIMO NÃO ATINGIDO
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <button
                                onClick={() => handleSalvar('ENVIAR')}
                                disabled={saving}
                                className="w-full bg-green-600 active:bg-green-700 text-white font-bold py-3.5 rounded-lg shadow-sm text-[15px] disabled:opacity-50 transition-colors flex items-center justify-center gap-2 tracking-wide"
                            >
                                <CheckCircle className="h-5 w-5" />
                                {saving ? 'ENVIANDO...' : bonificacao ? `FECHAR BONIFICAÇÃO · R$ 0,00` : `FECHAR PEDIDO · R$ ${vTotal.toFixed(2).replace('.', ',')}`}
                            </button>
                        );
                    })()}
                </div>
            )}
            {/* Popup de info do cliente (read-only) */}
            {showClientePopup && clienteSelecionado && (
                <ClientePopup
                    cliente={clienteSelecionado}
                    onClose={() => setShowClientePopup(false)}
                />
            )}

            {/* Modal de Busca de Cliente (Tela Cheia) */}
            {showClienteModal && (
                <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
                    <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-200 bg-white shadow-sm">
                        <button onClick={() => setShowClienteModal(false)} className="text-gray-600 p-1.5 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors">
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <input
                                autoFocus
                                type="text"
                                className="w-full pl-10 pr-10 py-2.5 text-base font-semibold text-gray-900 bg-gray-50 border border-transparent rounded outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white placeholder-gray-400 transition-colors"
                                placeholder="Fantasia ou CNPJ..."
                                value={clienteSearchText}
                                onChange={e => setClienteSearchText(e.target.value)}
                            />
                            {clienteSearchText && (
                                <button onClick={() => setClienteSearchText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 p-1.5 hover:text-gray-600 bg-white rounded-full">
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-gray-50 px-3 pb-6 pt-3">
                        <div className="space-y-2">
                            {clientesBusca.slice(0, 50).map(c => (
                                <div
                                    key={c.UUID}
                                    className="bg-white p-4 rounded shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-gray-100 cursor-pointer active:bg-blue-50 active:border-blue-100 transition-colors"
                                    onClick={() => {
                                        if (clienteId && clienteId !== c.UUID) {
                                            setItensMap(new Map());
                                            setCondicaoPagamentoId('');
                                            setObservacoes('');
                                            setCanalOrigem('');
                                            setIsEncaixe(false);
                                        }
                                        setClienteId(c.UUID);
                                        setShowClienteModal(false);
                                        setClienteSearchText(c.NomeFantasia || c.Nome);
                                        // A data e a condição de pagamento padrão serão atualizadas pelo useEffect de clienteId
                                    }}
                                >
                                    <div className="font-bold text-[15px] text-gray-900 mb-1 leading-tight tracking-tight">{c.NomeFantasia || c.Nome}</div>
                                    <div className="text-[13px] text-gray-500 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium">
                                        <span>{c.Documento || 'S/ Documento'}</span>
                                        {c.End_Cidade && (
                                            <>
                                                <span className="text-gray-300">•</span>
                                                <span>{c.End_Cidade}</span>
                                            </>
                                        )}
                                    </div>
                                    {c.Dia_de_entrega && (
                                        <div className="mt-2.5 inline-block bg-blue-50/70 text-blue-700 text-[11px] font-bold tracking-tight px-1.5 py-0.5 rounded border border-blue-100">
                                            Rota: {c.Dia_de_entrega}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {clientesBusca.length === 0 && (
                                <div className="p-10 text-center text-gray-500 flex flex-col items-center">
                                    <Search className="h-10 w-10 text-gray-300 mb-2" />
                                    <p className="text-[15px] font-bold text-gray-700">Nenhum cliente com esse nome</p>
                                    <p className="text-[13px] mt-1 text-gray-400">Tente buscar de outra forma ou pelo CNPJ.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NovoPedido;
