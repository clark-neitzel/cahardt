import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft, Save, User, ChevronDown, ChevronUp, Calendar,
    FileText, AlertCircle, X, CheckCircle, Minus, Plus, Clock,
    ShoppingBag, Search, Trash2, Package, Tag, Phone
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

const DIA_SEMANA_MAP = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

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
    { value: 'AMOSTRA', label: 'Amostra' },
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

    // Core Data
    const [clientes, setClientes] = useState([]);
    const [produtos, setProdutos] = useState([]);
    const [todasCondicoes, setTodasCondicoes] = useState([]);
    const [vendedores, setVendedores] = useState([]);

    // Form State
    const [clienteId, setClienteId] = useState('');
    const [vendedorId, setVendedorId] = useState(null);
    const [condicaoPagamentoId, setCondicaoPagamentoId] = useState('');
    const [dataEntrega, setDataEntrega] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
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
    const searchInputRef = useRef(null);

    // Pré-selecionar cliente quando vindo da tela Rota (?clienteId=...)
    const clienteIdFromUrl = searchParams.get('clienteId');

    useEffect(() => { carregarDadosBase(); }, []);

    const carregarDadosBase = async () => {
        try {
            let cats = [];
            try { cats = await configService.get('categorias_vendas'); } catch (e) { }
            const paramsProd = { limit: 1000, ativo: true };
            if (Array.isArray(cats) && cats.length > 0) paramsProd.categorias = cats.join(',');

            const [clientesData, produtosData, condicoesData, vendedoresData] = await Promise.all([
                clienteService.listar({ limit: 2000 }),
                produtoService.listar(paramsProd),
                tabelaPrecoService.listar(),
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
                        setClienteId(pd.clienteId);
                        setObservacoes(pd.observacoes || '');
                        if (pd.dataVenda) setDataEntrega(pd.dataVenda.split('T')[0]);
                        if (pd.canalOrigem) setCanalOrigem(pd.canalOrigem);
                        const cond = condicoesData.find(c => c.tipoPagamento === pd.tipoPagamento && c.opcaoCondicao === pd.opcaoCondicaoPagamento);
                        if (cond) setTimeout(() => setCondicaoPagamentoId(cond.idCondicao), 500);

                        if (pd.itens && pd.itens.length > 0) {
                            const map = new Map();
                            pd.itens.forEach(i => {
                                map.set(i.produtoId, {
                                    quantidade: i.quantidade,
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

                        if (mesmoCLiente) {
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
                            setDataEntrega(calcularProximaData(pCliente.Dia_de_entrega));
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
                itensMap: Array.from(itensMap.entries())
            };
            try {
                localStorage.setItem('@CAHardt:NovoPedido_Draft', JSON.stringify(dataToSave));
            } catch (e) { }
        }
    }, [clienteId, clienteSearchText, dataEntrega, condicaoPagamentoId, isEncaixe, observacoes, canalOrigem, itensMap, loading, editId]);

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
            setClienteSelecionado(cliente);
            setVendedorId(cliente.idVendedor);
            setVendedorSelecionado(vendedores.find(v => v.id === cliente.idVendedor) || null);
            setClienteSearchText(cliente.NomeFantasia || cliente.Nome);
            verificarDataEntrega(dataEntrega, cliente);

            let idsArray = [];
            if (Array.isArray(cliente.condicoes_pagamento_permitidas)) idsArray = cliente.condicoes_pagamento_permitidas;
            else if (typeof cliente.condicoes_pagamento_permitidas === 'string' && cliente.condicoes_pagamento_permitidas.trim().length > 0)
                idsArray = cliente.condicoes_pagamento_permitidas.split(',').map(s => s.trim());

            let permitidas = idsArray.length > 0
                ? todasCondicoes.filter(c => idsArray.includes(c.idCondicao) || idsArray.includes(c.id))
                : (cliente.Condicao_de_pagamento ? [todasCondicoes.find(c => c.idCondicao === cliente.Condicao_de_pagamento || c.id === cliente.Condicao_de_pagamento)].filter(Boolean) : []);

            setCondicoesPermitidas(permitidas);

            if (!editId || !carregouDraftRef.current) {
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
        }
    }, [clienteId, clientes, todasCondicoes]);

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
        if (cond) recalcularItens(cond);
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
        const limitePerc = vendedorSelecionado?.maxDescontoFlex !== undefined ? Number(vendedorSelecionado.maxDescontoFlex) : 100;

        mapAtual.forEach((item, pid) => {
            const produto = listaProdutos.find(p => p.id === pid);
            if (!produto) return;
            const promoAtiva = todasPromos.get(pid);
            const liberada = checkPromoLiberada(promoAtiva, mapAtual);

            const acrescimo = condicaoSel ? Number(condicaoSel.acrescimoPreco) : 0;
            const precoTabela = Number(produto.valorVenda) || 0;
            const precoBaseInicial = liberada ? Number(promoAtiva.precoPromocional) : precoTabela;
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

            novoMapa.set(pid, {
                ...item,
                emPromocao: liberada,
                valorUnitario: Number(novoValorUnitario.toFixed(2)),
                valorBase: Number(novoValorBase.toFixed(2)),
                flexUnitario: Number((novoValorUnitario - novoValorBase).toFixed(2))
            });
        });
        return novoMapa;
    }, [checkPromoLiberada, vendedorSelecionado]);

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

                const limiteBasePerc = vendedorSelecionado?.maxDescontoFlex !== undefined ? Number(vendedorSelecionado.maxDescontoFlex) : 100;
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

                                    const limiteBasePerc = vendedorSelecionado?.maxDescontoFlex !== undefined ? Number(vendedorSelecionado.maxDescontoFlex) : 100;
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
            const limiteBasePerc = vendedorSelecionado?.maxDescontoFlex !== undefined ? Number(vendedorSelecionado.maxDescontoFlex) : 100;
            const limitePerc = it.emPromocao ? 0 : limiteBasePerc;
            const valorMinimoPermitido = Number((it.valorBase * (1 - limitePerc / 100)).toFixed(2));

            if (vp < valorMinimoPermitido && valorMinimoPermitido > 0) {
                toast.error(`⚠️ O limite máximo de desconto foi excedido.\nO menor valor permitido é R$ ${valorMinimoPermitido.toFixed(2).replace('.', ',')}`, { duration: 6000, style: { maxWidth: "600px" } });
                vp = valorMinimoPermitido;
            }

            m.set(produtoId, { ...it, valorUnitario: vp, flexUnitario: Number((vp - it.valorBase).toFixed(2)) });
            return m;
        });
    }, [vendedorSelecionado]);

    const handleSalvar = (statusEnvio) => {
        if (!clienteId || itensMap.size === 0) { toast.error("Preencha cliente e adicione itens.", { duration: 6000, style: { maxWidth: "600px" } }); return; }
        if (!especial && !condicaoPagamentoId) { toast.error("Selecione uma condição de pagamento.", { duration: 6000, style: { maxWidth: "600px" } }); return; }
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
            itens: itensLimpos
        };

        try {
            if (editId) await pedidoService.atualizar(editId, payload);
            else await pedidoService.criar(payload);

            localStorage.removeItem('@CAHardt:NovoPedido_Draft');
            navigate('/pedidos');
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
        const jaCompradosIds = new Set(historicoPorData.map(([pid]) => pid));

        const jaC = [];
        historicoPorData.forEach(([pid, hist]) => {
            const prod = filtrados.find(p => p.id === pid);
            if (prod) jaC.push({ ...prod, hist });
        });

        const promoC = [];
        const outC = [];
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
    }, [produtos, produtoSearch, historicoMap, promocoesMap]);

    const handleExcluir = async () => {
        if (!editId) return;
        if (!window.confirm("Tem certeza que deseja excluir permanentemente este rascunho?")) return;
        setSaving(true);
        try {
            await pedidoService.excluir(editId);
            localStorage.removeItem('@CAHardt:NovoPedido_Draft');
            navigate('/pedidos');
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
                    className={`flex items-center gap-2 px-2 py-2 ${temExpand ? 'cursor-pointer active:bg-gray-50' : ''}`}
                    onClick={toggleExpand}
                >
                    {/* Foto do produto — mobile: esquerda / desktop: direita */}
                    <div className="w-12 h-12 rounded overflow-hidden bg-gray-100 shrink-0 border border-gray-200 md:order-last">
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
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            {/* Tag de Promoção */}
                            {(() => {
                                if (!promo) return null;

                                // Acréscimo da tabela selecionada (mesma regra do preço normal)
                                const acrescimo = condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0;
                                const precoPromoComTabela = Number(promo.precoPromocional) * (1 + acrescimo / 100);

                                // Avalia condições em tempo real para tipo CONDICIONAL
                                if (promo.tipo === 'CONDICIONAL') {
                                    const liberada = checkPromoLiberada(promo, itensMap);
                                    if (!liberada) return (
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-dashed border-gray-300 flex items-center gap-1">
                                            <Tag className="h-3 w-3" /> Promo Cond.
                                        </span>
                                    );
                                }
                                return (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300 font-semibold flex items-center gap-1"
                                        title={`Base: R$ ${Number(promo.precoPromocional).toFixed(2)} + ${condicaoSelecionada ? Number(condicaoSelecionada.acrescimoPreco) : 0}% tabela`}>
                                        <Tag className="h-3 w-3" /> R$ {precoPromoComTabela.toFixed(2).replace('.', ',')}
                                    </span>
                                );
                            })()}

                            {/* Preço / input de preço */}
                            {qtd > 0 ? (
                                <div className="flex items-center gap-1">
                                    {/* Indica preço riscado se estiver sofrendo desconto ou se tiver promoção */}
                                    {item && (Number(item.valorBase) > Number(item.valorUnitario) || promo) && (
                                        <span className="text-xs text-gray-400 line-through mr-1" title={`Tabela: R$ ${Number(item.valorBase).toFixed(2)}`}>
                                            R$ {Number(item.valorBase).toFixed(2).replace('.', ',')}
                                        </span>
                                    )}
                                    <span
                                        className="text-xs font-bold text-blue-700"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <input
                                            type="number"
                                            min="0" step="any"
                                            className="w-16 sm:w-20 border border-blue-300 bg-white text-blue-800 rounded px-1.5 py-0.5 text-xs font-bold text-center"
                                            value={valor}
                                            onFocus={e => e.target.select()}
                                            onChange={e => setValorUnitario(produto.id, e.target.value)}
                                            onBlur={() => verificarTravaValorUnitario(produto.id)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.target.blur();
                                                }
                                            }}
                                        />
                                    </span>
                                </div>
                            ) : (
                                <span className="text-xs font-bold text-orange-600">
                                    R$ {Number(produto.valorVenda || 0).toFixed(2).replace('.', ',')}
                                </span>
                            )}
                            {/* Flex badge */}
                            {qtd > 0 && item && (
                                <span className={`text-[10px] sm:text-xs font-semibold px-1 py-0 rounded-full ${item.flexUnitario >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {item.flexUnitario >= 0 ? '+' : ''}{item.flexUnitario.toFixed(2)}
                                </span>
                            )}
                            {/* Peso */}
                            {produto.pesoLiquido > 0 && (
                                <span className="text-xs text-gray-400">{Number(produto.pesoLiquido).toFixed(0)}g</span>
                            )}
                            {/* Estoque */}
                            <span className={`text-xs font-semibold ${Number(produto.estoqueDisponivel) > 0 ? 'text-green-600' : 'text-red-500'
                                }`}>
                                Est: {Number(produto.estoqueDisponivel || 0).toFixed(0)} {produto.unidade || 'un'}
                            </span>
                            {/* Chevron para expand (histórico ou promo) */}
                            {temExpand && (
                                <span className="text-gray-400 ml-auto">
                                    {expandido ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Controles de quantidade — mobile: direita / desktop: esquerda */}
                    <div
                        className="flex items-center gap-1 shrink-0 md:order-first"
                        onClick={e => e.stopPropagation()}
                    >
                        {qtd > 0 && (
                            <button
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => setQuantidade(produto.id, qtd - 1)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-red-100 text-red-600 active:bg-red-200"
                            >
                                <Minus className="h-4 w-4" />
                            </button>
                        )}
                        {qtd > 0 && (
                            <input
                                type="number" min="1"
                                className="w-9 text-center border border-gray-300 rounded bg-white text-gray-900 text-sm font-bold py-0.5"
                                value={qtd}
                                onFocus={e => e.target.select()}
                                onChange={e => {
                                    const v = Number(e.target.value);
                                    if (v >= 0) setQuantidade(produto.id, v);
                                }}
                            />
                        )}
                        <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => setQuantidade(produto.id, qtd + 1)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white active:bg-blue-700 shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
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
                            {editId ? 'Editar Pedido' : 'Novo Pedido'}
                        </h1>
                        {isEncaixe && (
                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">ENCAIXE</span>
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
                <div className={`px-4 py-1 flex justify-between items-center text-xs font-bold text-white ${flexTotal >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                    <span>Flex: {flexTotal > 0 && '+'}{flexTotal.toFixed(2).replace('.', ',')}</span>
                    <span className="font-normal opacity-80">
                        {itensMap.size} {itensMap.size === 1 ? 'item' : 'itens'} · Total: R$ {vTotal.toFixed(2).replace('.', ',')}
                    </span>
                </div>
            </div>

            {/* ===== FORMULÁRIO (cliente + data + condição) ===== */}
            <div className="bg-white shadow-sm">
                {/* Campo cliente (agora um gatilho de modal) */}
                <div className="px-3 py-3 border-b border-gray-100 bg-white">
                    <button
                        className="w-full relative flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 active:bg-gray-100 transition-colors text-left"
                        onClick={() => setShowClienteModal(true)}
                    >
                        <div className="flex items-center gap-2 overflow-hidden items-center">
                            <User className="h-5 w-5 text-gray-500 shrink-0" />
                            {clienteId && clienteSelecionado ? (
                                <span className="text-[14px] font-bold text-gray-900 truncate tracking-tight leading-tight pt-0.5">
                                    {clienteSelecionado.NomeFantasia || clienteSelecionado.Nome || clienteSearchText}
                                </span>
                            ) : (
                                <span className="text-[14px] font-semibold text-gray-400 tracking-tight leading-tight pt-0.5">
                                    Toque p/ buscar cliente...
                                </span>
                            )}
                        </div>
                        {clienteId && (
                            <div
                                className="text-gray-400 p-0.5 shrink-0 bg-white rounded-full border border-gray-200 ml-2 shadow-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setClienteId('');
                                    setClienteSearchText('');
                                    setClienteSelecionado(null);
                                }}
                            >
                                <X className="h-4 w-4 text-red-500" />
                            </div>
                        )}
                    </button>
                </div>

                {/* Data + Condição compactas (collapsível) */}
                {clienteId && (
                    <>
                        <button
                            className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                            onClick={() => setMostrarFormulario(!mostrarFormulario)}
                        >
                            <span className="flex items-center gap-2">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>{dataEntrega.split('-').reverse().join('/')}</span>
                                <span className="text-gray-300">·</span>
                                <span className="font-semibold text-gray-700 truncate max-w-[150px]">
                                    {condicaoSelecionada?.nomeCondicao || 'Sem condição'}
                                </span>
                                {condicaoSelecionada && <span className="text-gray-400">({condicaoSelecionada.acrescimoPreco}%)</span>}
                            </span>
                            {mostrarFormulario ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        {mostrarFormulario && (
                            <div className="px-3 pb-3 pt-1 space-y-2 border-t border-gray-100">
                                {/* Data */}
                                <div>
                                    <label className="text-xs text-gray-500 font-medium">Data de Entrega</label>
                                    <input
                                        type="date"
                                        className="w-full mt-0.5 border border-gray-300 rounded-md p-2 bg-white text-gray-900 text-sm focus:ring-blue-500 focus:border-blue-500"
                                        value={dataEntrega}
                                        onChange={e => setDataEntrega(e.target.value)}
                                        onClick={e => { try { if (e.target.showPicker) e.target.showPicker(); } catch (err) { } }}
                                    />
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
                                </div>

                                {/* Toggle Pedido Especial */}
                                {(user?.permissoes?.Pode_Criar_Especial || user?.permissoes?.admin) && (
                                    <div className="flex items-center justify-between bg-purple-50 p-2.5 rounded-md border border-purple-200">
                                        <div>
                                            <span className="text-xs font-bold text-purple-900">Pedido Especial</span>
                                            <p className="text-[10px] text-purple-700">Sem nota fiscal - pagamento à vista em dinheiro</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={especial}
                                                onChange={(e) => {
                                                    setEspecial(e.target.checked);
                                                    if (e.target.checked) {
                                                        setCondicaoPagamentoId('__especial__');
                                                        setMostrarFormulario(false);
                                                    } else {
                                                        setCondicaoPagamentoId('');
                                                    }
                                                }}
                                            />
                                            <div className="w-9 h-5 bg-gray-300 peer-checked:bg-purple-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                                        </label>
                                    </div>
                                )}

                                {/* Condição de pagamento */}
                                {especial ? (
                                    <div className="bg-purple-50 border border-purple-200 rounded-md p-2.5">
                                        <label className="text-xs text-gray-500 font-medium">Condição de Pagamento</label>
                                        <p className="text-sm font-semibold text-purple-900 mt-0.5">Especial - À vista em Dinheiro</p>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <label className="text-xs text-gray-500 font-medium">Condição de Pagamento</label>
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
                                                        onClick={() => { setCondicaoPagamentoId(c.idCondicao); setMostrarCondicoesDropdown(false); setMostrarFormulario(false); }}>
                                                        {c.nomeCondicao}
                                                        {condicaoPagamentoId === c.idCondicao && <CheckCircle className="h-4 w-4 text-blue-600" />}
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        {condicoesPermitidas.length === 0 && (
                                            <p className="text-red-500 text-xs mt-1">Nenhuma tabela de preço habilitada para este cliente.</p>
                                        )}
                                    </div>
                                )}

                                {/* Observações */}
                                <div>
                                    <button
                                        onClick={() => setObsAberta(!obsAberta)}
                                        className="text-xs text-gray-500 flex items-center gap-1"
                                    >
                                        <FileText className="h-3.5 w-3.5" />
                                        {obsAberta ? 'Fechar observações' : 'Adicionar observações'}
                                    </button>
                                    {obsAberta && (
                                        <textarea
                                            className="w-full mt-1.5 border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
                                            rows="2"
                                            placeholder="Restrições de doca, horários..."
                                            value={observacoes}
                                            onChange={e => setObservacoes(e.target.value)}
                                        />
                                    )}
                                </div>

                                {/* Tipo de Atendimento Escolha */}
                                <div className="pt-2 border-t border-gray-100 mt-2">
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
                                                    setMostrarFormulario(false);
                                                }}
                                                className={`px-2.5 py-1.5 rounded text-[12px] font-semibold border transition-colors ${canalOrigem === t.value ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                            >
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ===== LISTA DE PRODUTOS ===== */}
            {clienteId && condicaoPagamentoId && canalOrigem && (
                <div className="flex-1">
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

            {/* Placeholder quando sem condição/qualidade */}
            {clienteId && (!condicaoPagamentoId || !canalOrigem) && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50 bg-opacity-70">
                    <div className="max-w-xs space-y-6">
                        {!condicaoPagamentoId ? (
                            <div>
                                <AlertCircle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
                                <p className="text-sm text-gray-900 font-bold">Selecione a Condição de Pagamento</p>
                                <p className="text-xs text-gray-500 mt-1 font-medium">Você precisa definir a tabela e juros base no topo.</p>
                            </div>
                        ) : (
                            <div>
                                <Phone className="h-10 w-10 text-blue-500 mx-auto mb-3" />
                                <p className="text-sm text-gray-900 font-bold">Qualidade do Atendimento Pendente</p>
                                <p className="text-xs text-gray-500 mt-1 font-medium">Escolha no topo se foi visita, WhatsApp, ligação, etc para liberar os produtos.</p>
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
                                {saving ? 'ENVIANDO...' : `FECHAR PEDIDO · R$ ${vTotal.toFixed(2).replace('.', ',')}`}
                            </button>
                        );
                    })()}
                </div>
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
                                        setClienteId(c.UUID);
                                        setShowClienteModal(false);
                                        setClienteSearchText(c.NomeFantasia || c.Nome);
                                        if (c.Dia_de_entrega) {
                                            setDataEntrega(calcularProximaData(c.Dia_de_entrega));
                                        }
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
