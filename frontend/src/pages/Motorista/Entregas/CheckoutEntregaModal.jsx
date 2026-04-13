import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, Package, ArrowRight, Save, Navigation, DollarSign, AlertCircle, Trash2, Plus, Mic, MicOff, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import entregasService from '../../../services/entregasService';
import formasPagamentoService from '../../../services/formasPagamentoService';
import tabelaPrecoService from '../../../services/tabelaPrecoService';
import { useAuth } from '../../../contexts/AuthContext';

const CheckoutEntregaModal = ({ pedido, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [step, setStep] = useState(1); // 1 = Status Físico, 2 = Devoluções (Se Parcial), 3 = Caixa (Dinheiro), 4 = GPS e Conclusão
    const [statusFinal, setStatusFinal] = useState(''); // ENTREGUE, ENTREGUE_PARCIAL, DEVOLVIDO

    // Carrinho Reverso
    const [itensDevolvidos, setItensDevolvidos] = useState([]);

    // Caixa Financeiro
    const [pagamentos, setPagamentos] = useState([]);
    const [formasDisp, setFormasDisp] = useState([]);
    const [loadingFormas, setLoadingFormas] = useState(false);

    // Motivo de Devolução
    const [motivoDevolucao, setMotivoDevolucao] = useState('');
    const [gravandoVoz, setGravandoVoz] = useState(false);
    const recognitionRef = useRef(null);

    // Geolocation
    const [gpsCoords, setGpsCoords] = useState(null);
    const [capturingGps, setCapturingGps] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Diversos
    const [divergencia, setDivergencia] = useState(false);

    // Regras da condição de pagamento do pedido
    const [regrasCondicao, setRegrasCondicao] = useState({ permiteDevolucaoTotal: true, permiteDevolucaoParcial: true, formasRecebimentoPermitidas: [], debitaCaixa: true });

    useEffect(() => {
        const fetchF = async () => {
            setLoadingFormas(true);
            try {
                const [customForms, tabelaForms] = await Promise.all([
                    formasPagamentoService.listar(),
                    tabelaPrecoService.listar(true)
                ]);
                // Formas de entrega personalizadas (Escritório, Vendedor responsável, etc.)
                const ativas = customForms.filter(f => f.ativo).map(f => ({
                    _selectId: f.id,
                    nome: f.nome,
                    formaPagamentoEntregaId: f.id,
                    permiteVendedorResponsavel: f.permiteVendedorResponsavel,
                    permiteEscritorioResponsavel: f.permiteEscritorioResponsavel,
                    _grupo: 'Formas de Entrega'
                }));
                // Condições de pagamento padrão (Dinheiro, PIX, Boleto, etc.) da tabela de preços
                // Filtrar condições que já existem como Formas de Entrega (evitar duplicação)
                const nomesFormas = new Set(ativas.map(f => f.nome.toLowerCase().trim()));
                const tabelas = tabelaForms
                    .filter(t => !nomesFormas.has(t.nomeCondicao.toLowerCase().trim()))
                    .map(t => ({
                        _selectId: 'tabela_' + t.idCondicao,
                        nome: t.nomeCondicao,
                        descricao: t.tipoPagamento || '',
                        debitaCaixa: !!t.debitaCaixa,
                        formaPagamentoEntregaId: null,
                        permiteVendedorResponsavel: false,
                        permiteEscritorioResponsavel: false,
                        _grupo: 'Condições de Pagamento'
                    }));
                // Extrair regras da condição do pedido
                let todasFormas = [...tabelas, ...ativas];
                // Detectar se o pedido é boleto pelo nome da condição ou tipoPagamento
                const nomeCond = (pedido.nomeCondicaoPagamento || pedido.opcaoCondicaoPagamento || '').toLowerCase();
                const tipoPed = (pedido.tipoPagamento || '').toLowerCase();
                const pedidoEhBoleto = nomeCond.includes('boleto') || tipoPed.includes('boleto');

                if (pedido.idCondicaoResolvido) {
                    const condicaoPedido = tabelaForms.find(t => t.idCondicao === pedido.idCondicaoResolvido);
                    if (condicaoPedido) {
                        setRegrasCondicao({
                            permiteDevolucaoTotal: condicaoPedido.permiteDevolucaoTotal !== false,
                            permiteDevolucaoParcial: condicaoPedido.permiteDevolucaoParcial !== false,
                            formasRecebimentoPermitidas: condicaoPedido.formasRecebimentoPermitidas || [],
                            debitaCaixa: !pedidoEhBoleto
                        });
                        // Filtrar formas disponíveis se há restrição explícita
                        if (condicaoPedido.formasRecebimentoPermitidas?.length > 0) {
                            const permitidas = condicaoPedido.formasRecebimentoPermitidas;
                            todasFormas = todasFormas.filter(f => permitidas.includes(f._selectId));
                        }
                    }
                } else {
                    // Sem idCondicaoResolvido (ex: "Funcionário")
                    setRegrasCondicao(prev => ({ ...prev, debitaCaixa: !pedidoEhBoleto }));
                }
                // Filtro automático pelo nome:
                // À vista/Dinheiro/Pix/Cartão → remove condições com "boleto" no nome
                // Boleto → remove condições sem "boleto" no nome
                // Formas de Entrega (Escritório, Vendedor) são mantidas sempre
                // A condição do próprio pedido é SEMPRE preservada (fonte de verdade, ignora filtro por nome)
                const selectIdPedido = pedido.idCondicaoResolvido ? 'tabela_' + pedido.idCondicaoResolvido : null;
                todasFormas = todasFormas.filter(f => {
                    if (f._grupo !== 'Condições de Pagamento') return true;
                    if (selectIdPedido && f._selectId === selectIdPedido) return true;
                    const nomeLower = f.nome.toLowerCase();
                    if (pedidoEhBoleto) return nomeLower.includes('boleto');
                    return !nomeLower.includes('boleto');
                });
                setFormasDisp(todasFormas);
            } catch (error) {
                toast.error('Erro ao buscar Formas de Pagamento.');
            } finally {
                setLoadingFormas(false);
            }
        };
        fetchF();

        // Inicializa o carrinho reverso com os totais de itens zerados pra devolução
        const devs = pedido.itens.map(it => ({
            produtoId: it.produto.id,
            nomeProduto: it.produto.nome,
            quantidadeDevolvida: 0,
            maximo: Number(it.quantidade),
            valorBaseItem: Number(it.valor)
        }));
        setItensDevolvidos(devs);
    }, [pedido]);

    // Guarda o valor-alvo do caixa pra usar quando formasDisp carregar
    const [valorAlvoCaixa, setValorAlvoCaixa] = useState(null);

    // Acha o melhor _selectId default: condição do pedido > primeira condição de pagamento > primeira forma
    const getDefaultSelectId = () => {
        if (formasDisp.length === 0) return null;
        // Tenta a condição original do pedido (idCondicaoResolvido vem do backend, mapeado de opcaoCondicao -> idCondicao)
        if (pedido.idCondicaoResolvido) {
            const match = formasDisp.find(f => f._selectId === 'tabela_' + pedido.idCondicaoResolvido);
            if (match) return match._selectId;
        }
        // Fallback: primeira condição de pagamento
        const primeiraCondicao = formasDisp.find(f => f._grupo === 'Condições de Pagamento');
        if (primeiraCondicao) return primeiraCondicao._selectId;
        // Último recurso: primeira forma disponível
        return formasDisp[0]._selectId;
    };

    // Helper: pré-popula o primeiro pagamento com a forma prevista no pedido
    const autoPopularPagamento = (valorInicial) => {
        const valorArredondado = Number(Number(valorInicial).toFixed(2));
        setValorAlvoCaixa(valorArredondado);
        if (formasDisp.length === 0) return; // useEffect abaixo cuidará quando carregar
        setPagamentos([{ idLocal: Date.now(), _selectId: getDefaultSelectId(), valor: valorArredondado }]);
    };

    // Quando formasDisp carregar e já tem valor-alvo pendente, auto-popula
    useEffect(() => {
        if (formasDisp.length > 0 && valorAlvoCaixa !== null && pagamentos.length === 0 && (step === 3 || step === 4)) {
            setPagamentos([{ idLocal: Date.now(), _selectId: getDefaultSelectId(), valor: valorAlvoCaixa }]);
        }
    }, [formasDisp, valorAlvoCaixa, step]);

    // Verifica se a condição de pagamento é fixa (Boleto) e não precisa de seleção manual
    const isCondicaoFixa = () => !regrasCondicao.debitaCaixa;

    // Navegação Status Físico
    const handleSelectStatus = (s) => {
        setStatusFinal(s);
        if (s === 'ENTREGUE') {
            setItensDevolvidos(itensDevolvidos.map(i => ({ ...i, quantidadeDevolvida: 0 })));
            autoPopularPagamento(totalBrutoOriginal);
            // Boleto e condições que não debitam caixa: pula direto pro GPS (Step 4)
            if (isCondicaoFixa()) {
                setStep(4);
            } else {
                setStep(3);
            }
        } else if (s === 'DEVOLVIDO') {
            setItensDevolvidos(itensDevolvidos.map(i => ({ ...i, quantidadeDevolvida: i.maximo })));
            setStep(5); // Step 5 = Motivo obrigatório
        } else if (s === 'ENTREGUE_PARCIAL') {
            setStep(2);
        }
    };

    // Devoluções Parciais - Carrinho
    const handleIncrementDevolucao = (index) => {
        const newD = [...itensDevolvidos];
        if (newD[index].quantidadeDevolvida < newD[index].maximo) {
            newD[index].quantidadeDevolvida++;
        }
        setItensDevolvidos(newD);
    };

    const handleDecrementDevolucao = (index) => {
        const newD = [...itensDevolvidos];
        if (newD[index].quantidadeDevolvida > 0) {
            newD[index].quantidadeDevolvida--;
        }
        setItensDevolvidos(newD);
    };

    const avancarParaCaixa = () => {
        const temDevolucao = itensDevolvidos.some(i => i.quantidadeDevolvida > 0);
        if (!temDevolucao) {
            return toast.error('Se você marcou PARCIAL, deve registrar ao menos 1 item devolvido ou riscado.');
        }
        if (!motivoDevolucao.trim()) {
            return toast.error('Informe o motivo da devolução antes de avançar.');
        }
        const saldoPos = Number((totalBrutoOriginal - itensDevolvidos.reduce((a, i) => a + (i.quantidadeDevolvida * i.valorBaseItem), 0)).toFixed(2));
        autoPopularPagamento(saldoPos);
        // Boleto e condições fixas: pula direto pro GPS
        if (isCondicaoFixa()) {
            setStep(4);
        } else {
            setStep(3);
        }
    };

    // Bloco Financeiro (Caixa)
    // Calcula a Meta de Recebimento Base do Total do Pedido MENOS (-) as Devoluções Físicas
    const totalBrutoOriginal = pedido.itens.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0);
    const totalDescontoDevolucao = itensDevolvidos.reduce((acc, i) => acc + (i.quantidadeDevolvida * i.valorBaseItem), 0);
    const saldoLiquidoDevedor = Number((totalBrutoOriginal - totalDescontoDevolucao).toFixed(2));

    // Calcula o que já foi apontado no carrinho de Pagamentos
    const totalApontado = pagamentos.reduce((acc, pg) => acc + Number(pg.valor), 0);
    const saldoRestante = Number((saldoLiquidoDevedor - totalApontado).toFixed(2));

    const handleAddPagamento = () => {
        if (formasDisp.length === 0) return toast.error('Nenhuma forma de pagamento configurada no painel web.');
        const defaultId = pagamentos.length === 0 ? getDefaultSelectId() : (formasDisp.find(f => f._grupo === 'Condições de Pagamento')?._selectId || formasDisp[0]._selectId);
        setPagamentos([...pagamentos, { idLocal: Date.now(), _selectId: defaultId, valor: saldoRestante > 0 ? saldoRestante : 0 }]);
    };

    const handleRemovePagamento = (idL) => {
        setPagamentos(pagamentos.filter(p => p.idLocal !== idL));
    };

    const updatePagamento = (idL, field, value) => {
        setPagamentos(pagamentos.map(p => {
            if (p.idLocal === idL) {
                return { ...p, [field]: value };
            }
            return p;
        }));
    };

    const avancarParaGPS = () => {
        // Se a entrega é DEVOLVIDO 100%, já pode ir! (Isso não chega aqui pq Pula do Step 1 pro 4, mas garantia)
        if (statusFinal === 'DEVOLVIDO') {
            setStep(4);
            return;
        }

        // Bloquear pagamentos com valor zerado ou negativo
        const pgtoZerado = pagamentos.find(p => Number(p.valor) <= 0);
        if (pgtoZerado) {
            return toast.error('Remova pagamentos com valor R$ 0,00. Cada linha precisa ter um valor real.');
        }

        // Validação Matemática RIGOROSA (Travada de Segurança contra Calote Cego)
        if (Math.abs(saldoRestante) > 0.05) {
            return toast.error(`Feche o Caixa! Faltam R$ ${saldoRestante.toFixed(2)} para registrar (ou sobrou R$).`);
        }

        // Verifica Divergência do original?
        // O Pedido original tem fields (id_forma_pagamento) mas a API Mobile tem as Formas de Entrega.
        // O sistema pede pro motorista marcar um switch manual se ele notou que a forma mudou.
        setStep(4);
    };

    // Submissão
    const capturarGPS = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocalização não suportada no seu celular/browser.');
            return setGpsCoords('0,0'); // Bypass se for pc desktop sem modulo
        }

        setCapturingGps(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setGpsCoords(`${position.coords.latitude},${position.coords.longitude}`);
                setCapturingGps(false);
                toast.success('Ponto Localizado!');
            },
            (err) => {
                console.warn(err);
                if (err.code === 1) toast.error('Ative o GPS do celular!');
                else toast.error('Sinal de GPS Fraco.');
                setCapturingGps(false);
                // Permite seguir sem GPS rigoroso no pior caso? Melhor botar um dummy se falhar por timeout longo
                setGpsCoords('FalhaSinal');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const handleFinalizar = async () => {
        if (!gpsCoords) return toast.error('Aperte no botão para obter sua Localização Geográfica da Entrega (Obrigatório).');

        try {
            setSubmitting(true);

            // Formatando o Payload
            const payload = {
                statusEntrega: statusFinal,
                gpsEntrega: gpsCoords,
                divergenciaPagamento: divergencia,
                motivoDevolucao: motivoDevolucao.trim() || null,
                pagamentos: [],
                itensDevolvidos: []
            };

            if (statusFinal !== 'DEVOLVIDO') {
                payload.pagamentos = pagamentos.map(p => {
                    const formaConfig = formasDisp.find(f => f._selectId === p._selectId);
                    return {
                        formaPagamentoEntregaId: formaConfig?.formaPagamentoEntregaId || null,
                        formaPagamentoNome: formaConfig?.nome || p._selectId,
                        valor: p.valor,
                        vendedorResponsavelId: formaConfig?.permiteVendedorResponsavel ? user.id : null,
                        escritorioResponsavel: !!formaConfig?.permiteEscritorioResponsavel
                    };
                });
            }

            if (statusFinal === 'ENTREGUE_PARCIAL') {
                payload.itensDevolvidos = itensDevolvidos
                    .filter(i => i.quantidadeDevolvida > 0)
                    .map(i => ({
                        produtoId: i.produtoId,
                        quantidade: i.quantidadeDevolvida,
                        valorBaseItem: i.valorBaseItem
                    }));
            }

            // Manda pro Cloud
            await entregasService.concluirEntrega(pedido.id, payload);

            // Aciona o painel anterior p/ sumir
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro Crítico no fechamento do caixa.');
        } finally {
            setSubmitting(false);
        }
    };

    // Descrição legível da condição de pagamento do pedido
    const descricaoCondicao = pedido.nomeCondicaoPagamento
        || (pedido.tipoPagamento ? `${pedido.tipoPagamento}${pedido.intervaloDias ? ` ${pedido.qtdParcelas || 1}x de ${pedido.intervaloDias}d` : ''}` : null);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-95 p-2">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg h-[90vh] flex flex-col overflow-hidden relative">

                {/* Cabeçalho */}
                <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between bg-sky-600 text-white rounded-t-xl">
                    <div className="flex flex-col flex-1 truncate">
                        <span className="text-xs uppercase font-bold text-sky-200 tracking-wider">Check-in de Doca</span>
                        <h3 className="text-lg font-bold truncate leading-tight">{pedido.cliente?.NomeFantasia}</h3>
                        <p className="text-xs text-sky-100 font-mono">Ped #{pedido.numero || 'X'} / Emb: #{pedido.embarque?.numero}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-sm font-black text-white">R$ {pedido.itens.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0).toFixed(2)}</span>
                            {descricaoCondicao && (
                                <span className="text-[10px] bg-sky-800 text-sky-100 px-2 py-0.5 rounded-full font-bold">{descricaoCondicao}</span>
                            )}
                        </div>
                        {(pedido.vendedor || pedido.usuarioLancamento) && (
                            <p className="text-[10px] text-sky-200 mt-0.5 truncate">
                                {pedido.vendedor && <>Vend: {pedido.vendedor.nome}</>}
                                {pedido.vendedor && pedido.usuarioLancamento && ' · '}
                                {pedido.usuarioLancamento && <>Lanç: {pedido.usuarioLancamento.nome}</>}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 ml-2 bg-sky-700 hover:bg-sky-800 rounded-full text-white">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* STEPS INDICATOR */}
                <div className="flex border-b border-gray-100">
                    <div className={`flex-1 h-1 ${step >= 1 ? 'bg-sky-500' : 'bg-gray-200'}`}></div>
                    <div className={`flex-1 h-1 ${step >= 2 ? 'bg-sky-500' : 'bg-gray-200'}`}></div>
                    <div className={`flex-1 h-1 ${step >= 3 ? 'bg-sky-500' : 'bg-gray-200'}`}></div>
                    <div className={`flex-1 h-1 ${step >= 4 ? 'bg-sky-500' : 'bg-gray-200'}`}></div>
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col relative">

                    {/* =========== STEP 1: STATUS DA ENTREGA =========== */}
                    {step === 1 && (
                        <div className="p-6 space-y-4 animate-in fade-in slide-in-from-right-4">
                            <h4 className="text-xl font-bold text-gray-800 text-center mb-6">O que aconteceu no cliente?</h4>

                            <button
                                onClick={() => handleSelectStatus('ENTREGUE')}
                                className="w-full flex items-center p-4 bg-white border-2 border-green-200 hover:border-green-500 rounded-xl shadow-sm transition-all focus:outline-none"
                            >
                                <CheckCircle className="h-8 w-8 text-green-500 mr-4 flex-shrink-0" />
                                <div className="text-left">
                                    <h5 className="font-bold text-green-800 text-lg">Entregou Tudo! (100%)</h5>
                                    <p className="text-xs text-gray-500 leading-tight mt-1">Nenhum produto rejeitado. Vai p/ Acerto de Contas ($).</p>
                                </div>
                            </button>

                            <button
                                onClick={() => regrasCondicao.permiteDevolucaoParcial ? handleSelectStatus('ENTREGUE_PARCIAL') : toast.error('Esta condição de pagamento não permite devolução parcial.')}
                                className={`w-full flex items-center p-4 bg-white border-2 rounded-xl shadow-sm transition-all focus:outline-none ${regrasCondicao.permiteDevolucaoParcial ? 'border-amber-200 hover:border-amber-500' : 'border-gray-200 opacity-50 cursor-not-allowed'}`}
                            >
                                <Package className={`h-8 w-8 mr-4 flex-shrink-0 ${regrasCondicao.permiteDevolucaoParcial ? 'text-amber-500' : 'text-gray-400'}`} />
                                <div className="text-left">
                                    <h5 className={`font-bold text-lg ${regrasCondicao.permiteDevolucaoParcial ? 'text-amber-800' : 'text-gray-400'}`}>Entregou Parcial</h5>
                                    <p className="text-xs text-gray-500 leading-tight mt-1">
                                        {regrasCondicao.permiteDevolucaoParcial ? 'Cliente não quis 1 ou mais caixas. Abrirei o Carrinho Reverso.' : 'Bloqueado para esta condição de pagamento.'}
                                    </p>
                                </div>
                            </button>

                            <button
                                onClick={() => regrasCondicao.permiteDevolucaoTotal ? handleSelectStatus('DEVOLVIDO') : toast.error('Esta condição de pagamento não permite devolução total.')}
                                className={`w-full flex items-center p-4 bg-white border-2 rounded-xl shadow-sm transition-all focus:outline-none mt-8 ${regrasCondicao.permiteDevolucaoTotal ? 'border-red-200 hover:border-red-500' : 'border-gray-200 opacity-50 cursor-not-allowed'}`}
                            >
                                <ArrowRight className={`h-8 w-8 mr-4 flex-shrink-0 transform rotate-180 ${regrasCondicao.permiteDevolucaoTotal ? 'text-red-500' : 'text-gray-400'}`} />
                                <div className="text-left">
                                    <h5 className={`font-bold text-lg ${regrasCondicao.permiteDevolucaoTotal ? 'text-red-800' : 'text-gray-400'}`}>Voltou Tudo. Rejeitou.</h5>
                                    <p className="text-xs text-gray-500 leading-tight mt-1">
                                        {regrasCondicao.permiteDevolucaoTotal ? 'A loja estava fechada ou ele descartou todo o pedido.' : 'Bloqueado para esta condição de pagamento.'}
                                    </p>
                                </div>
                            </button>
                        </div>
                    )}


                    {/* =========== STEP 2: CARRINHO REVERSO (PARCIAL) =========== */}
                    {step === 2 && (
                        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4">
                            <div className="p-4 bg-amber-50 border-b border-amber-200 px-6">
                                <h4 className="font-bold text-amber-800 flex items-center">
                                    <Package className="h-5 w-5 mr-2" /> Devoluções / Faltas
                                </h4>
                                <p className="text-xs text-amber-700 mt-1">Marque a quantidade e quais caixas estão voltando com você no caminhão. O valor Devedor será arrumado sozinho.</p>
                            </div>

                            <div className="flex-1 overflow-y-auto space-y-2 p-4">
                                {itensDevolvidos.map((item, index) => (
                                    <div key={item.produtoId} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                                        <div className="flex-1 pr-2">
                                            <p className="text-sm font-bold text-gray-800 leading-tight">{item.nomeProduto}</p>
                                            <p className="text-xs text-gray-500">Tinha {item.maximo} original(is) na Nota.</p>
                                        </div>

                                        <div className="flex items-center space-x-3 bg-gray-100 p-1 rounded-lg">
                                            <button
                                                onClick={() => handleDecrementDevolucao(index)}
                                                className="w-8 h-8 rounded-md bg-white text-gray-700 font-bold shadow-sm active:bg-gray-200"
                                            >-</button>
                                            <span className="font-bold text-red-600 w-6 text-center">{item.quantidadeDevolvida}</span>
                                            <button
                                                onClick={() => handleIncrementDevolucao(index)}
                                                disabled={item.quantidadeDevolvida >= item.maximo}
                                                className="w-8 h-8 rounded-md bg-white text-gray-700 font-bold shadow-sm active:bg-gray-200 disabled:opacity-30"
                                            >+</button>
                                        </div>
                                    </div>
                                ))}

                                {/* Campo de Motivo da Devolução Parcial */}
                                <MotivoInput motivo={motivoDevolucao} setMotivo={setMotivoDevolucao} gravandoVoz={gravandoVoz} setGravandoVoz={setGravandoVoz} recognitionRef={recognitionRef} />
                            </div>

                            <div className="p-4 bg-white border-t border-gray-200 px-6">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-sm font-bold text-gray-600">Peças Riscadas NF:</span>
                                    <span className="text-xl font-bold text-red-600">
                                        {itensDevolvidos.reduce((acc, i) => acc + i.quantidadeDevolvida, 0)} Voltas
                                    </span>
                                </div>
                                <div className="flex space-x-3">
                                    <button onClick={() => setStep(1)} className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl active:bg-gray-200">Voltar</button>
                                    <button onClick={avancarParaCaixa} className="flex-[2] py-3 text-sm font-bold text-white bg-sky-600 rounded-xl active:bg-sky-700 shadow-md">Ir para Cobrança</button>
                                </div>
                            </div>
                        </div>
                    )}


                    {/* =========== STEP 3: CAIXA / PAGAMENTOS =========== */}
                    {step === 3 && (
                        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 bg-gray-50">
                            {/* Header Resumo Matemático */}
                            <div className="bg-sky-600 text-white p-6 shadow-md z-10">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-sky-200 text-xs font-bold uppercase tracking-wider mb-1">A Receber Líquido</p>
                                        <h2 className="text-4xl font-black tracking-tighter">
                                            R$ {saldoLiquidoDevedor.toFixed(2)}
                                        </h2>
                                        {totalDescontoDevolucao > 0 && (
                                            <p className="text-sky-100 text-xs mt-1">(Desconto R$ {totalDescontoDevolucao.toFixed(2)} por devolução acatado)</p>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sky-200 text-[10px] font-bold uppercase mb-1">Saldo a Registrar</p>
                                        <h3 className={`text-xl font-bold ${saldoRestante < 0 ? 'text-red-300' : saldoRestante === 0 ? 'text-green-300' : 'text-white'}`}>
                                            R$ {saldoRestante.toFixed(2)}
                                        </h3>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {/* Condição prevista no pedido */}
                                {descricaoCondicao && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                                        <DollarSign className="h-4 w-4 text-blue-500 shrink-0" />
                                        <div>
                                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Previsto no Pedido</span>
                                            <p className="text-sm font-bold text-blue-800">{descricaoCondicao}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Linha informativa de Devolução (quando parcial) */}
                                {totalDescontoDevolucao > 0 && (
                                    <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Package className="h-4 w-4 text-orange-500 shrink-0" />
                                            <div>
                                                <span className="text-[10px] font-bold text-orange-500 uppercase tracking-wide">Devolução de Mercadoria</span>
                                                <p className="text-xs text-orange-700">Itens retornados ao estoque</p>
                                            </div>
                                        </div>
                                        <span className="text-base font-black text-orange-700">- R$ {totalDescontoDevolucao.toFixed(2)}</span>
                                    </div>
                                )}

                                {pagamentos.length === 0 ? (
                                    <div className="text-center py-10 opacity-70">
                                        <DollarSign className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                                        <p className="text-gray-600 font-medium">Nenhum pagamento registrado.</p>
                                        <p className="text-xs text-gray-400">Pressione + para apontar como ele pagou.</p>
                                    </div>
                                ) : (
                                    pagamentos.map((pg, index) => (
                                        <div key={pg.idLocal} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 relative">
                                            <button onClick={() => handleRemovePagamento(pg.idLocal)} className="absolute top-3 right-3 text-red-400 hover:text-red-600 transform active:scale-95">
                                                <Trash2 className="h-5 w-5" />
                                            </button>

                                            <div className="mb-3 pr-8">
                                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wide">Como pagou?</label>
                                                <select
                                                    className="w-full mt-1 border-b-2 border-gray-300 focus:border-sky-500 bg-transparent py-1 text-sm font-bold text-gray-800 focus:outline-none"
                                                    value={pg._selectId}
                                                    onChange={(e) => updatePagamento(pg.idLocal, '_selectId', e.target.value)}
                                                >
                                                    {['Condições de Pagamento', 'Formas de Entrega'].map(grupo => {
                                                        const itens = formasDisp.filter(f => f._grupo === grupo);
                                                        if (itens.length === 0) return null;
                                                        return (
                                                            <optgroup key={grupo} label={grupo}>
                                                                {itens.map(f => (
                                                                    <option key={f._selectId} value={f._selectId}>
                                                                        {f.nome}{f.descricao ? ` (${f.descricao})` : ''}
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        );
                                                    })}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-gray-500 tracking-wide">Valor Recebido (R$)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0.01"
                                                    className="w-full mt-1 border-b-2 border-sky-300 focus:border-sky-600 bg-sky-50 font-mono text-xl py-2 px-2 text-sky-900 rounded font-bold outline-none"
                                                    value={pg.valor}
                                                    onChange={(e) => updatePagamento(pg.idLocal, 'valor', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    ))
                                )}

                                {saldoRestante > 0.01 && (
                                    <button
                                        onClick={handleAddPagamento}
                                        className="w-full py-4 border-2 border-dashed border-sky-300 text-sky-600 font-bold rounded-xl flex items-center justify-center hover:bg-sky-50 active:bg-sky-100 transition-colors"
                                    >
                                        <Plus className="h-5 w-5 mr-1" /> Adicionar Forma de Pagamento
                                    </button>
                                )}

                                <div className="mt-6 bg-amber-50 rounded-xl p-4 border border-amber-200">
                                    <label className="flex items-start cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-1 h-5 w-5 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                                            checked={divergencia}
                                            onChange={(e) => setDivergencia(e.target.checked)}
                                        />
                                        <div className="ml-3">
                                            <span className="text-sm font-bold text-amber-900">Mudar a Previsão Original do Pedido?</span>
                                            <p className="text-[10px] text-amber-700 mt-1 leading-tight">Marque aqui se o cliente havia combinado de pagar Prazo Boleto, mas no guichê pegou e te pagou em PIX por exemplo (Alerte o Administrativo).</p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                                <div className="flex space-x-3">
                                    <button onClick={() => statusFinal === 'ENTREGUE_PARCIAL' ? setStep(2) : setStep(1)} className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl active:bg-gray-200">
                                        Voltar
                                    </button>
                                    <button
                                        onClick={avancarParaGPS}
                                        className={`flex-[2] py-3 text-sm font-bold text-white rounded-xl shadow-md transition-all ${saldoRestante === 0 ? 'bg-green-600 active:bg-green-700 cursor-pointer animate-pulse' : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            }`}
                                    >
                                        {saldoRestante === 0 ? 'Bateu! Ir p/ Concluir' : 'Arrume os Valores!'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}


                    {/* =========== STEP 4: GEOLOCALIZAÇÃO E ENVIO FINAL =========== */}
                    {step === 4 && (
                        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4">
                            <div className="p-6 bg-white flex-1 flex flex-col items-center justify-center text-center space-y-6">
                                <div className="bg-sky-50 w-24 h-24 rounded-full flex items-center justify-center">
                                    <Navigation className="h-10 w-10 text-sky-600" />
                                </div>
                                <div>
                                    <h4 className="text-2xl font-black text-gray-800">Verificação Final GPS</h4>
                                    <p className="text-sm text-gray-500 mt-2 px-6">
                                        O Sistema Logístico Hardt requer que você dispare um "Localizador de Trajeto" neste momento de frente ao estabelecimento.
                                    </p>
                                </div>
                                <div className="w-full">
                                    {gpsCoords ? (
                                        <div className="bg-green-50 border border-green-200 p-4 rounded-xl flex items-center justify-center text-green-700 font-mono text-xs font-bold shadow-sm">
                                            <CheckCircle className="h-4 w-4 mr-2" /> Geo Capturado: {gpsCoords}
                                        </div>
                                    ) : (
                                        <button onClick={capturarGPS} disabled={capturingGps} className="w-full bg-blue-100 text-blue-800 font-bold py-4 rounded-xl border border-blue-200 flex items-center justify-center active:bg-blue-200 transition-colors shadow-sm">
                                            {capturingGps ? 'Pescando Satélites...' : '1. Obter Localização Exata (MAPS)'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="p-4 bg-gray-50 border-t border-gray-200">
                                <div className="flex space-x-3">
                                    <button onClick={() => statusFinal === 'DEVOLVIDO' ? setStep(5) : isCondicaoFixa() ? (statusFinal === 'ENTREGUE_PARCIAL' ? setStep(2) : setStep(1)) : setStep(3)} className="w-1/3 py-4 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-xl active:bg-gray-100">Voltar</button>
                                    <button onClick={handleFinalizar} disabled={submitting || !gpsCoords} className="w-2/3 py-4 text-lg font-black text-white bg-green-500 rounded-xl flex items-center justify-center active:bg-green-600 shadow-xl disabled:opacity-50 disabled:bg-gray-400 disabled:shadow-none transition-all">
                                        {submitting ? 'Transmitindo...' : '2. FINALIZAR Rota'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}


                    {/* =========== STEP 5: MOTIVO DA DEVOLUÇÃO TOTAL =========== */}
                    {step === 5 && (
                        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4">
                            <div className="p-5 bg-red-50 border-b border-red-200">
                                <h4 className="font-bold text-red-800 text-lg flex items-center gap-2">
                                    <ArrowRight className="h-5 w-5 transform rotate-180" /> Devolução Total
                                </h4>
                                <p className="text-xs text-red-700 mt-1">Informe o motivo pelo qual o pedido não foi entregue. Você pode digitar ou usar o microfone.</p>
                            </div>
                            <div className="flex-1 p-5">
                                <MotivoInput motivo={motivoDevolucao} setMotivo={setMotivoDevolucao} gravandoVoz={gravandoVoz} setGravandoVoz={setGravandoVoz} recognitionRef={recognitionRef} />
                            </div>
                            <div className="p-4 bg-white border-t border-gray-200">
                                <div className="flex space-x-3">
                                    <button onClick={() => setStep(1)} className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-100 rounded-xl active:bg-gray-200">Voltar</button>
                                    <button
                                        onClick={() => {
                                            if (!motivoDevolucao.trim()) return toast.error('Informe o motivo da devolução.');
                                            setStep(4);
                                        }}
                                        className="flex-[2] py-3 text-sm font-bold text-white bg-red-600 rounded-xl active:bg-red-700 shadow-md"
                                    >
                                        Ir para Finalização
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Componente auxiliar: Campo de Motivo com Microfone
const MotivoInput = ({ motivo, setMotivo, gravandoVoz, setGravandoVoz, recognitionRef }) => {
    const iniciarGravacao = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return toast.error('Reconhecimento de voz não suportado neste dispositivo.');
        const recognition = new SpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setMotivo(prev => prev ? prev + ' ' + transcript : transcript);
            setGravandoVoz(false);
        };
        recognition.onerror = () => setGravandoVoz(false);
        recognition.onend = () => setGravandoVoz(false);
        recognitionRef.current = recognition;
        recognition.start();
        setGravandoVoz(true);
    };

    const pararGravacao = () => {
        if (recognitionRef.current) recognitionRef.current.stop();
        setGravandoVoz(false);
    };

    return (
        <div className="bg-white border-2 border-orange-200 rounded-xl p-4 mt-2">
            <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-orange-500" />
                <span className="text-xs font-bold text-orange-700 uppercase tracking-wide">Motivo da Devolução *</span>
            </div>
            <textarea
                className="w-full text-sm text-gray-800 bg-orange-50 border border-orange-100 rounded-lg p-3 min-h-[90px] resize-none focus:outline-none focus:border-orange-400"
                placeholder="Ex: Cliente não estava, disse que não pediu, produto errado, sem dinheiro..."
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
            />
            <button
                onClick={gravandoVoz ? pararGravacao : iniciarGravacao}
                className={`mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-sm transition-colors ${gravandoVoz
                    ? 'bg-red-100 text-red-700 border-2 border-red-400 animate-pulse'
                    : 'bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200'
                    }`}
            >
                {gravandoVoz ? <><MicOff className="h-4 w-4" /> Parar Gravação</> : <><Mic className="h-4 w-4" /> Falar pelo Microfone</>}
            </button>
        </div>
    );
};

export default CheckoutEntregaModal;
