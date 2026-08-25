import React, { useEffect, useState } from 'react';
import { PackageCheck, Lock, Plus, CheckCircle, Undo2, Loader2, X, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import caixaService from '../../services/caixaService';
import produtoService from '../../services/produtoService';
import configService from '../../services/configService';
import SelectBusca from '../../components/SelectBusca';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const fmtQtd = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const MOTIVOS = [
    'Não foi carregado pela manhã',
    'Mercadoria avariada/imprópria',
    'Outro'
];

// Modal para pedir autorização (ou, para quem pode, "autorizar eu mesmo" com senha).
const ModalPedirAutorizacao = ({ item, falta, data, vendedorId, autorizadores, podeAutorizarEuMesmo, onClose, onDone }) => {
    const [quantidade, setQuantidade] = useState(String(falta));
    const [motivo, setMotivo] = useState(MOTIVOS[0]);
    const [motivoOutro, setMotivoOutro] = useState('');
    const [autorizadorId, setAutorizadorId] = useState('');
    const [modoEuMesmo, setModoEuMesmo] = useState(false);
    const [senha, setSenha] = useState('');
    const [salvando, setSalvando] = useState(false);

    const qtdNum = Number(quantidade) || 0;
    const qtdValida = qtdNum > 0 && qtdNum <= falta;
    const restanteCobrado = Math.max(0, falta - qtdNum);
    const valorRestante = restanteCobrado * Number(item.valorUnitCobranca || 0);
    const motivoFinal = () => (motivo === 'Outro' ? (motivoOutro.trim() || 'Outro') : motivo);

    const handleEnviarPedido = async () => {
        if (!qtdValida) { toast.error('Quantidade inválida.'); return; }
        if (!autorizadorId) { toast.error('Escolha quem vai autorizar.'); return; }
        try {
            setSalvando(true);
            const res = await caixaService.solicitarAutorizacaoDevolucao({
                vendedorId, data, produtoId: item.produtoId,
                quantidade: qtdNum, motivo: motivoFinal(), autorizadorId
            });
            toast.success(`Pedido enviado para ${res.autorizadorNome}. Aguardando autorização.`);
            onDone();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao enviar pedido.');
        } finally {
            setSalvando(false);
        }
    };

    const handleAutorizarEuMesmo = async () => {
        if (!qtdValida) { toast.error('Quantidade inválida.'); return; }
        if (!senha) { toast.error('Digite sua senha.'); return; }
        try {
            setSalvando(true);
            const res = await caixaService.autorizarDesconsiderarDevolucao({
                vendedorId, data, produtoId: item.produtoId,
                quantidade: qtdNum, motivo: motivoFinal(), senha
            });
            toast.success(`Autorizado por ${res.autorizadoPorNome}.`);
            onDone();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao autorizar.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
            <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 bg-house text-white rounded-t-2xl">
                    <div className="flex items-center gap-2 font-bold text-sm">
                        {modoEuMesmo ? <><Lock className="h-4 w-4" /> Autorizar eu mesmo</> : <><Send className="h-4 w-4" /> Pedir autorização</>}
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                        <span className="font-medium text-gray-900">{item.produtoNome}</span>
                        <span className="font-bold text-red-700 tabular-nums whitespace-nowrap">
                            falta de {fmtQtd(falta)} · R$ {fmt(falta * Number(item.valorUnitCobranca || 0))}
                        </span>
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Quantas unidades desconsiderar?</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number" min="0" max={falta} step="any"
                                value={quantidade}
                                onChange={(e) => setQuantidade(e.target.value)}
                                className="w-24 border border-gray-300 rounded px-3 py-2 text-sm text-center focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <span className="text-sm text-gray-500">de {fmtQtd(falta)} em falta</span>
                        </div>
                        {restanteCobrado > 0 && qtdValida && (
                            <p className="mt-2 text-xs bg-yellow-100 text-yellow-800 rounded px-3 py-2">
                                O restante ({fmtQtd(restanteCobrado)}) continua cobrado do motorista: <b>R$ {fmt(valorRestante)}</b>
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Motivo</label>
                        <SelectBusca value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full">
                            {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                        </SelectBusca>
                        {motivo === 'Outro' && (
                            <input
                                type="text" value={motivoOutro}
                                onChange={(e) => setMotivoOutro(e.target.value)}
                                placeholder="Descreva o motivo"
                                className="mt-2 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                        )}
                    </div>

                    {!modoEuMesmo ? (
                        <>
                            <div>
                                <label className="text-sm font-medium text-gray-700 block mb-1">Quem vai autorizar?</label>
                                <SelectBusca value={autorizadorId} onChange={(e) => setAutorizadorId(e.target.value)} className="w-full">
                                    <option value="">Selecione o responsável...</option>
                                    {autorizadores.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                                </SelectBusca>
                                <p className="text-xs text-gray-500 mt-1">
                                    O pedido vai para o app dessa pessoa. A senha é digitada por ela, no aparelho dela.
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 pt-1">
                                <button
                                    onClick={handleEnviarPedido}
                                    disabled={salvando || !qtdValida}
                                    className="w-full px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-[44px]"
                                >
                                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar pedido
                                </button>
                                {podeAutorizarEuMesmo && (
                                    <button onClick={() => setModoEuMesmo(true)} className="text-xs text-primary hover:underline text-center">
                                        Prefiro autorizar eu mesmo agora
                                    </button>
                                )}
                                <button onClick={onClose} className="text-xs text-gray-500 hover:underline text-center">Cancelar</button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="text-sm font-medium text-gray-700 block mb-1">Sua senha para autorizar</label>
                                <input
                                    type="password" value={senha} autoComplete="off"
                                    onChange={(e) => setSenha(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>
                            <div className="flex flex-col gap-2 pt-1">
                                <button
                                    onClick={handleAutorizarEuMesmo}
                                    disabled={salvando || !qtdValida}
                                    className="w-full px-5 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2 min-h-[44px]"
                                >
                                    {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Autorizar eu mesmo
                                </button>
                                <button onClick={() => setModoEuMesmo(false)} className="text-xs text-primary hover:underline text-center">
                                    Voltar para pedir a outra pessoa
                                </button>
                            </div>
                        </>
                    )}

                    <p className="text-xs text-gray-500">
                        Fica registrado: quem autorizou, quando, o motivo e as quantidades — visível no caixa e no relatório impresso.
                    </p>
                </div>
            </div>
        </div>
    );
};

// Cartão "Conferência de Devoluções" do Caixa Diário
const ConferenciaDevolucaoCard = ({ data, vendedorId, caixaStatus, podeReverter, onChanged }) => {
    const [conf, setConf] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recebidas, setRecebidas] = useState({}); // { produtoId: '2' }
    const [sobras, setSobras] = useState([]); // [{ produtoId, nome, quantidade }]
    const [modalPedir, setModalPedir] = useState(null); // { item, falta }
    const [addSobra, setAddSobra] = useState(false);
    const [sobraProdutoId, setSobraProdutoId] = useState('');
    const [sobraQtd, setSobraQtd] = useState('1');
    const [produtos, setProdutos] = useState([]);
    const [confirmando, setConfirmando] = useState(false);

    // silent=true não mexe na contagem em digitação (usado pelo polling)
    const fetchConferencia = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const res = await caixaService.getConferenciaDevolucao(data, vendedorId);
            setConf(res);
            if (!silent) {
                const iniciais = {};
                (res.itens || []).forEach(i => {
                    if (i.qtdRecebida != null) iniciais[i.produtoId] = String(i.qtdRecebida);
                });
                setRecebidas(iniciais);
                setSobras([]);
            }
        } catch (error) {
            console.error('Erro ao buscar conferência de devoluções:', error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        if (data && vendedorId) fetchConferencia(false);
    }, [data, vendedorId]);

    // Enquanto houver pedido de autorização pendente, checa a cada 10s se já respondeu
    useEffect(() => {
        if (!conf?.temSolicitacaoPendente) return;
        const t = setInterval(() => fetchConferencia(true), 10000);
        return () => clearInterval(t);
    }, [conf?.temSolicitacaoPendente, data, vendedorId]);

    // Lista de produtos só quando o usuário quer registrar sobra avulsa.
    // Filtra por TODAS as categorias existentes nos produtos (configService.getCategorias()
    // → GET /config/categorias, um groupBy da coluna categoria) — NÃO é a lista
    // 'categorias_vendas' da tela Catálogo. Na prática isso só descarta produto ativo
    // sem categoria nenhuma (senão apareciam os 448 itens do banco, com peça de caminhão etc.);
    // as categorias marcadas como "não vende" já são cortadas pelo próprio /produtos.
    // A rota /produtos devolve { data, meta } paginado — pedir limite alto e ler .data
    useEffect(() => {
        if (addSobra && produtos.length === 0) {
            (async () => {
                try {
                    const cats = await configService.getCategorias().catch(() => []);
                    const params = { ativo: 'true', limit: 1000 };
                    if (Array.isArray(cats) && cats.length > 0) params.categorias = cats.join(',');
                    const res = await produtoService.listar(params);
                    setProdutos(Array.isArray(res) ? res : (res?.data || res?.produtos || []));
                } catch {
                    toast.error('Erro ao carregar produtos.');
                }
            })();
        }
    }, [addSobra]);

    if (loading || !conf || !conf.temDevolucoes) return null;

    const confirmada = conf.status === 'CONFERIDA';
    const podeEditar = conf.podeConferir && !confirmada && caixaStatus === 'ABERTO';
    const itensEsperados = conf.itens.filter(i => !i.sobra);
    const itensSobraSalvos = conf.itens.filter(i => i.sobra);

    const calcLinha = (item) => {
        const recebida = confirmada
            ? Number(item.qtdRecebida || 0)
            : (recebidas[item.produtoId] === undefined || recebidas[item.produtoId] === ''
                ? null
                : Math.max(0, Number(recebidas[item.produtoId]) || 0));
        const contada = recebida ?? 0;
        const diferenca = contada - item.qtdEsperada;
        const faltaBruta = Math.max(0, item.qtdEsperada - contada);
        const desconsiderada = Math.min(Number(item.qtdDesconsiderada || 0), faltaBruta);
        const cobrada = Math.max(0, faltaBruta - desconsiderada);
        return { recebida, diferenca, faltaBruta, desconsiderada, cobrada, valorCobrar: cobrada * Number(item.valorUnitCobranca || 0) };
    };

    const totalCobrar = confirmada
        ? Number(conf.totalCobrado || 0)
        : itensEsperados.reduce((s, i) => s + calcLinha(i).valorCobrar, 0);

    const handleAddSobra = () => {
        if (!sobraProdutoId || !(Number(sobraQtd) > 0)) { toast.error('Escolha o produto e a quantidade.'); return; }
        if (itensEsperados.some(i => i.produtoId === sobraProdutoId) || sobras.some(s => s.produtoId === sobraProdutoId)) {
            toast.error('Este produto já está na lista — informe a quantidade na linha dele.');
            return;
        }
        const p = produtos.find(pr => pr.id === sobraProdutoId);
        setSobras(prev => [...prev, { produtoId: sobraProdutoId, nome: p?.nome || 'Produto', quantidade: Number(sobraQtd) }]);
        setSobraProdutoId('');
        setSobraQtd('1');
        setAddSobra(false);
    };

    const handleCancelarSolic = async (id) => {
        try {
            await caixaService.cancelarSolicitacaoDevolucao({ id });
            toast.success('Pedido de autorização cancelado.');
            fetchConferencia(true);
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao cancelar pedido.');
        }
    };

    const handleConfirmar = async () => {
        if (conf.temSolicitacaoPendente) {
            toast.error('Há um pedido de autorização aguardando resposta. Espere ou cancele antes de confirmar.');
            return;
        }
        const semContagem = itensEsperados.filter(i => recebidas[i.produtoId] === undefined || recebidas[i.produtoId] === '');
        if (semContagem.length > 0) {
            toast.error(`Informe quanto voltou de: ${semContagem.map(i => i.produtoNome).join(', ')} (use 0 se nada voltou).`);
            return;
        }
        const linhasCobradas = itensEsperados.filter(i => calcLinha(i).cobrada > 0);
        let msg = 'Confirmar a conferência de devoluções?';
        if (totalCobrar > 0) {
            msg = `Confirmar a conferência?\n\nFaltas a cobrar do motorista: R$ ${fmt(totalCobrar)}\n${linhasCobradas.map(i => `• ${i.produtoNome}: ${fmtQtd(calcLinha(i).cobrada)}`).join('\n')}\n\nO valor será somado ao valor a prestar do caixa.`;
        }
        if (!confirm(msg)) return;

        try {
            setConfirmando(true);
            const res = await caixaService.confirmarConferenciaDevolucao({
                vendedorId,
                data,
                itens: itensEsperados.map(i => ({ produtoId: i.produtoId, qtdRecebida: Number(recebidas[i.produtoId]) || 0 })),
                sobras: sobras.map(s => ({ produtoId: s.produtoId, quantidade: s.quantidade }))
            });
            toast.success(res.totalCobrado > 0
                ? `Conferência confirmada! R$ ${fmt(res.totalCobrado)} somado ao caixa.`
                : 'Conferência confirmada!');
            fetchConferencia(false);
            onChanged?.();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao confirmar conferência.');
        } finally {
            setConfirmando(false);
        }
    };

    const handleReabrir = async () => {
        if (!confirm('Reabrir a conferência de devoluções? A cobrança será recalculada ao confirmar de novo.')) return;
        try {
            await caixaService.reabrirConferenciaDevolucao({ vendedorId, data });
            toast.success('Conferência reaberta.');
            fetchConferencia(false);
            onChanged?.();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao reabrir conferência.');
        }
    };

    const badgeSituacao = (item) => {
        const { recebida, diferenca, desconsiderada, cobrada, valorCobrar } = calcLinha(item);
        const badges = [];
        if (item.sobra || (recebida != null && diferenca > 0)) {
            badges.push(
                <span key="sobra" className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    {item.sobra ? 'Sobra — registrada' : `Sobra de ${fmtQtd(diferenca)} — registrada`}
                </span>
            );
        }
        if (recebida != null && diferenca === 0 && !item.sobra) {
            badges.push(
                <span key="ok" className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                    Confere ✓
                </span>
            );
        }
        if (desconsiderada > 0) {
            badges.push(
                <span key="desc" className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                    {fmtQtd(desconsiderada)} desconsiderada(s) · aut. {item.autorizadoPorNome || '—'} ✓
                </span>
            );
        }
        if (recebida != null && cobrada > 0) {
            badges.push(
                <span key="cobrar" className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                    {confirmada ? 'Cobrado' : 'Cobrar'} {fmtQtd(cobrada)} — R$ {fmt(valorCobrar)}
                </span>
            );
        }
        return badges;
    };

    // Estado do pedido de autorização por item (aguardando / rejeitado / botão pedir)
    const autorizacaoUI = (item, faltaRestante, recebida) => {
        const sol = item.solicitacao;
        if (sol?.status === 'PENDENTE') {
            return (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Aguardando autorização de {sol.autorizadorNome}
                    </span>
                    {podeEditar && (
                        <button
                            onClick={() => handleCancelarSolic(sol.id)}
                            className="inline-flex items-center px-3 py-1 bg-white border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-full font-medium text-xs"
                        >
                            Cancelar pedido
                        </button>
                    )}
                </div>
            );
        }
        if (!podeEditar || item.sobra || recebida == null || faltaRestante <= 0) return null;
        if (sol?.status === 'REJEITADA') {
            return (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span title={sol.motivoRejeicao || ''} className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                        Rejeitado por {sol.autorizadorNome}
                    </span>
                    <button
                        onClick={() => setModalPedir({ item, falta: faltaRestante })}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs"
                    >
                        Pedir de novo
                    </button>
                </div>
            );
        }
        return (
            <button
                onClick={() => setModalPedir({ item, falta: faltaRestante })}
                className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs"
            >
                <Lock className="h-3 w-3" /> Pedir autorização
            </button>
        );
    };

    const pedidosOrigemInfo = (item) => (
        (item.pedidosOrigem || []).length > 0 && (
            <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                {item.pedidosOrigem.map((po, i) => (
                    <div key={i} className="truncate">
                        Ped. <b className="text-gray-600">{po.numero || '?'}</b> · {po.cliente} — {fmtQtd(po.quantidade)}
                    </div>
                ))}
            </div>
        )
    );

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            {/* Header */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                <PackageCheck className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Conferência de Devoluções</span>
                {confirmada ? (
                    <span className="ml-auto px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                        Conferida ✓ {conf.conferidoPorNome ? `por ${conf.conferidoPorNome}` : ''}
                        {conf.conferidoEm ? ` · ${new Date(conf.conferidoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${new Date(conf.conferidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </span>
                ) : (
                    <span className="ml-auto px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">
                        Aguardando conferência
                    </span>
                )}
            </div>

            <div className="p-4 md:p-5">
                {!conf.podeConferir && !confirmada && (
                    <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 mb-3">
                        A contagem é feita por quem tem a permissão <b>Pode conferir devoluções no caixa</b>. Você está vendo em modo consulta.
                    </p>
                )}

                {/* Desktop: tabela */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Deveria voltar</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Voltou (contado)</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Diferença</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {[...itensEsperados, ...itensSobraSalvos].map(item => {
                                const { recebida, diferenca, faltaBruta, desconsiderada } = calcLinha(item);
                                const faltaRestante = Math.max(0, faltaBruta - desconsiderada);
                                return (
                                    <tr key={item.produtoId} className="hover:bg-gray-50 align-top">
                                        <td className="px-4 py-3 text-gray-900 font-medium">
                                            {item.produtoNome}
                                            {pedidosOrigemInfo(item)}
                                            {item.sobra && <div className="text-xs text-gray-500 mt-1">Sem devolução registrada — sobra avulsa</div>}
                                        </td>
                                        <td className="px-4 py-3 text-center tabular-nums">{fmtQtd(item.qtdEsperada)}</td>
                                        <td className="px-4 py-3 text-center">
                                            {podeEditar && !item.sobra ? (
                                                <input
                                                    type="number" min="0" step="any"
                                                    value={recebidas[item.produtoId] ?? ''}
                                                    onChange={(e) => setRecebidas(prev => ({ ...prev, [item.produtoId]: e.target.value }))}
                                                    placeholder="0"
                                                    className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm text-center focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                                />
                                            ) : (
                                                <span className="tabular-nums">{recebida != null ? fmtQtd(recebida) : '—'}</span>
                                            )}
                                        </td>
                                        <td className={`px-4 py-3 text-center font-bold tabular-nums ${recebida == null ? 'text-gray-400' : diferenca > 0 ? 'text-blue-700' : diferenca < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {recebida == null ? '—' : diferenca > 0 ? `+${fmtQtd(diferenca)}` : fmtQtd(diferenca)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1.5 items-center">
                                                {badgeSituacao(item)}
                                                {autorizacaoUI(item, faltaRestante, recebida)}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sobras.map(s => (
                                <tr key={s.produtoId} className="bg-blue-50/40">
                                    <td className="px-4 py-3 text-gray-900 font-medium">
                                        {s.nome}
                                        <div className="text-xs text-gray-500 mt-1">Sem devolução registrada — sobra avulsa</div>
                                    </td>
                                    <td className="px-4 py-3 text-center tabular-nums">0</td>
                                    <td className="px-4 py-3 text-center tabular-nums">{fmtQtd(s.quantidade)}</td>
                                    <td className="px-4 py-3 text-center font-bold text-blue-700 tabular-nums">+{fmtQtd(s.quantidade)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Sobra — só registrar</span>
                                            <button onClick={() => setSobras(prev => prev.filter(x => x.produtoId !== s.produtoId))} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile: cards */}
                <div className="md:hidden space-y-3">
                    {[...itensEsperados, ...itensSobraSalvos].map(item => {
                        const { recebida, diferenca, faltaBruta, desconsiderada } = calcLinha(item);
                        const faltaRestante = Math.max(0, faltaBruta - desconsiderada);
                        return (
                            <div key={item.produtoId} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                <div className="font-semibold text-gray-900 text-sm">{item.produtoNome}</div>
                                {pedidosOrigemInfo(item)}
                                {item.sobra && <div className="text-xs text-gray-500 mt-1">Sem devolução registrada — sobra avulsa</div>}
                                <div className="flex items-center gap-3 mt-3 text-sm">
                                    <div className="text-center">
                                        <div className="text-xs text-gray-500">Deveria voltar</div>
                                        <div className="font-bold tabular-nums">{fmtQtd(item.qtdEsperada)}</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs text-gray-500">Voltou</div>
                                        {podeEditar && !item.sobra ? (
                                            <input
                                                type="number" min="0" step="any"
                                                value={recebidas[item.produtoId] ?? ''}
                                                onChange={(e) => setRecebidas(prev => ({ ...prev, [item.produtoId]: e.target.value }))}
                                                placeholder="0"
                                                className="w-20 border border-gray-300 rounded px-2 py-2 text-sm text-center focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                            />
                                        ) : (
                                            <div className="font-bold tabular-nums">{recebida != null ? fmtQtd(recebida) : '—'}</div>
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs text-gray-500">Diferença</div>
                                        <div className={`font-bold tabular-nums ${recebida == null ? 'text-gray-400' : diferenca > 0 ? 'text-blue-700' : diferenca < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                            {recebida == null ? '—' : diferenca > 0 ? `+${fmtQtd(diferenca)}` : fmtQtd(diferenca)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5 items-center mt-3">
                                    {badgeSituacao(item)}
                                    {autorizacaoUI(item, faltaRestante, recebida)}
                                </div>
                            </div>
                        );
                    })}
                    {sobras.map(s => (
                        <div key={s.produtoId} className="bg-blue-50/40 rounded-xl border border-blue-200 p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-semibold text-gray-900 text-sm">{s.nome}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">Sobra avulsa — voltou {fmtQtd(s.quantidade)}</div>
                                </div>
                                <button onClick={() => setSobras(prev => prev.filter(x => x.produtoId !== s.produtoId))} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Adicionar sobra avulsa */}
                {podeEditar && (
                    <div className="mt-4">
                        {addSobra ? (
                            <div className="flex flex-col md:flex-row gap-2 md:items-center bg-gray-50 rounded-lg p-3">
                                <SelectBusca value={sobraProdutoId} onChange={(e) => setSobraProdutoId(e.target.value)} className="w-full md:flex-1">
                                    <option value="">Escolha o produto que voltou...</option>
                                    {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                </SelectBusca>
                                <input
                                    type="number" min="0" step="any"
                                    value={sobraQtd}
                                    onChange={(e) => setSobraQtd(e.target.value)}
                                    className="w-full md:w-24 border border-gray-300 rounded px-3 py-2 text-sm text-center focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    placeholder="Qtd"
                                />
                                <div className="flex gap-2">
                                    <button onClick={handleAddSobra} className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm min-h-[40px]">
                                        Adicionar
                                    </button>
                                    <button onClick={() => setAddSobra(false)} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-sm min-h-[40px]">
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setAddSobra(true)}
                                className="inline-flex items-center gap-1 px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm min-h-[40px]"
                            >
                                <Plus className="h-4 w-4" /> Adicionar produto que voltou sem devolução
                            </button>
                        )}
                    </div>
                )}

                {/* Total a cobrar */}
                <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                    <div className="text-sm text-orange-900">
                        Faltas {confirmada ? 'cobradas' : 'a cobrar'} do motorista
                        {conf.tabelaCobranca?.nome ? <span className="text-orange-700/70"> (tabela: {conf.tabelaCobranca.nome})</span> : ''}
                    </div>
                    <div className="font-bold text-orange-800 tabular-nums">
                        R$ {fmt(totalCobrar)} {totalCobrar > 0 && <span className="font-medium text-xs">→ somado ao valor a prestar</span>}
                    </div>
                </div>

                {conf.temSolicitacaoPendente && !confirmada && (
                    <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 inline-flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando autorização — a tela atualiza sozinha quando o responsável responder.
                    </p>
                )}

                {/* Ações */}
                <div className="flex justify-end gap-3 mt-4">
                    {confirmada && podeReverter && caixaStatus === 'ABERTO' && (
                        <button
                            onClick={handleReabrir}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-full font-medium text-sm hover:bg-gray-50 min-h-[44px]"
                        >
                            <Undo2 className="h-4 w-4" /> Reabrir conferência
                        </button>
                    )}
                    {podeEditar && (
                        <button
                            onClick={handleConfirmar}
                            disabled={confirmando || conf.temSolicitacaoPendente}
                            title={conf.temSolicitacaoPendente ? 'Aguarde a resposta do pedido de autorização' : ''}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                        >
                            {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            Confirmar conferência
                        </button>
                    )}
                </div>
            </div>

            {modalPedir && (
                <ModalPedirAutorizacao
                    item={modalPedir.item}
                    falta={modalPedir.falta}
                    data={data}
                    vendedorId={vendedorId}
                    autorizadores={conf.autorizadores || []}
                    podeAutorizarEuMesmo={conf.podeAutorizarEuMesmo}
                    onClose={() => setModalPedir(null)}
                    onDone={() => { setModalPedir(null); fetchConferencia(true); }}
                />
            )}
        </div>
    );
};

export default ConferenciaDevolucaoCard;
