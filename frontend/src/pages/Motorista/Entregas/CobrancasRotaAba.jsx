import React, { useState, useEffect, useRef } from 'react';
import { X, Search, HandCoins, CheckCircle, Undo2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import cobrancasRotaService from '../../../services/cobrancasRotaService';

const fmtMoeda = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
const fmtData = (d) => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

const FORMAS = ['Dinheiro', 'Pix', 'Cartão', 'Outro'];

// Modal fullscreen mobile: registrar a cobrança (total/parcial) ou "não consegui cobrar"
const CobrarTituloModal = ({ alvo, onClose, onSuccess }) => {
    // alvo: { cobrancaId? , parcelaId, clienteNome, numeroParcela, totalParcelas, saldo, dataVencimento }
    const [modo, setModo] = useState('cobrar'); // 'cobrar' | 'nao-cobrada'
    const [tipoValor, setTipoValor] = useState('total'); // 'total' | 'parcial'
    const [valorParcial, setValorParcial] = useState('');
    const [forma, setForma] = useState('Dinheiro');
    const [observacao, setObservacao] = useState('');
    const [respTipo, setRespTipo] = useState('ESCRITORIO');
    const [salvando, setSalvando] = useState(false);

    const valor = tipoValor === 'total' ? Number(alvo.saldo) : Number(String(valorParcial).replace(',', '.')) || 0;

    const handleCobrar = async () => {
        if (!(valor > 0)) { toast.error('Informe o valor recebido.'); return; }
        if (valor > Number(alvo.saldo) + 0.01) { toast.error('Valor maior que o saldo do título.'); return; }
        try {
            setSalvando(true);
            const dados = { valor, formaPagamentoNome: forma, observacao: observacao.trim() || undefined };
            const r = alvo.cobrancaId
                ? await cobrancasRotaService.cobrar(alvo.cobrancaId, dados)
                : await cobrancasRotaService.cobrarAvulsa({ parcelaId: alvo.parcelaId, ...dados });
            toast.success(r.message || 'Cobrança registrada!');
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao registrar a cobrança.');
        } finally {
            setSalvando(false);
        }
    };

    const handleNaoCobrada = async () => {
        if (!alvo.cobrancaId) { toast.error('"Não consegui cobrar" só vale para cobranças da carga.'); return; }
        try {
            setSalvando(true);
            const r = await cobrancasRotaService.naoCobrada(alvo.cobrancaId, {
                responsavelTipo: respTipo,
                observacao: observacao.trim() || undefined
            });
            toast.success(r.message || 'Registrado.');
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao registrar.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center sm:justify-center">
            <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="bg-mint p-1.5 rounded-lg flex-shrink-0"><HandCoins className="h-4 w-4 text-primaryDark" /></div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-bold text-gray-900 truncate">{alvo.clienteNome}</h3>
                            <p className="text-xs text-gray-500">
                                Parcela {alvo.numeroParcela}{alvo.totalParcelas ? `/${alvo.totalParcelas}` : ''} · venc. {fmtData(alvo.dataVencimento)} · saldo {fmtMoeda(alvo.saldo)}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 active:text-gray-600 rounded-full flex-shrink-0"><X className="h-5 w-5" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {modo === 'cobrar' ? (
                        <>
                            <div>
                                <p className="text-sm font-medium text-gray-700 mb-2">Quanto recebeu?</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setTipoValor('total')}
                                        className={`flex-1 py-3 rounded-full text-sm font-bold min-h-[44px] ${tipoValor === 'total' ? 'bg-primary text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
                                    >
                                        Total · {fmtMoeda(alvo.saldo)}
                                    </button>
                                    <button
                                        onClick={() => setTipoValor('parcial')}
                                        className={`flex-1 py-3 rounded-full text-sm font-bold min-h-[44px] ${tipoValor === 'parcial' ? 'bg-primary text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
                                    >
                                        Parcial…
                                    </button>
                                </div>
                                {tipoValor === 'parcial' && (
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        min="0"
                                        autoFocus
                                        value={valorParcial}
                                        onChange={e => setValorParcial(e.target.value)}
                                        placeholder="Valor recebido (R$)"
                                        className="mt-2 w-full border border-gray-300 rounded px-3 py-3 text-base focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                    />
                                )}
                                {tipoValor === 'parcial' && valor > 0 && valor <= Number(alvo.saldo) + 0.01 && (
                                    <p className="text-xs text-gray-500 mt-1">Restante em aberto: {fmtMoeda(Number(alvo.saldo) - valor)}</p>
                                )}
                            </div>

                            <div>
                                <p className="text-sm font-medium text-gray-700 mb-2">Forma de pagamento</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {FORMAS.map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setForma(f)}
                                            className={`py-3 rounded-full text-sm font-bold min-h-[44px] ${forma === f ? 'bg-primary text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
                                        >
                                            {f === 'Dinheiro' ? '💵 ' : f === 'Pix' ? '📱 ' : f === 'Cartão' ? '💳 ' : ''}{f}
                                        </button>
                                    ))}
                                </div>
                                {forma === 'Dinheiro' && (
                                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                                        O dinheiro entra no seu caixa de hoje (valor a prestar).
                                    </p>
                                )}
                            </div>

                            <div>
                                <p className="text-sm font-medium text-gray-700 mb-2">Observação (opcional)</p>
                                <textarea
                                    value={observacao}
                                    onChange={e => setObservacao(e.target.value)}
                                    rows={2}
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-600">
                                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-gray-500" />
                                <span>Só registro: o título <b>continua em aberto</b> e nada entra no seu caixa. Marque quem fica responsável por resolver.</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setRespTipo('ESCRITORIO')}
                                    className={`flex-1 py-3 rounded-full text-sm font-bold min-h-[44px] ${respTipo === 'ESCRITORIO' ? 'bg-primary text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
                                >
                                    Escritório responsável
                                </button>
                                <button
                                    onClick={() => setRespTipo('VENDEDOR')}
                                    className={`flex-1 py-3 rounded-full text-sm font-bold min-h-[44px] ${respTipo === 'VENDEDOR' ? 'bg-primary text-white' : 'bg-white border border-gray-300 text-gray-600'}`}
                                >
                                    Vendedor responsável
                                </button>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-700 mb-2">O que aconteceu? (opcional)</p>
                                <textarea
                                    value={observacao}
                                    onChange={e => setObservacao(e.target.value)}
                                    rows={2}
                                    placeholder="Ex.: cliente fechado, pediu para voltar semana que vem…"
                                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 space-y-2 flex-shrink-0">
                    {modo === 'cobrar' ? (
                        <>
                            <button
                                onClick={handleCobrar}
                                disabled={salvando}
                                className="w-full py-3 bg-primary active:bg-primaryDark text-white rounded-full font-bold text-sm shadow-sm disabled:opacity-50 min-h-[44px]"
                            >
                                {salvando ? 'Registrando…' : `Confirmar cobrança de ${fmtMoeda(valor)}`}
                            </button>
                            {alvo.cobrancaId && (
                                <button
                                    onClick={() => setModo('nao-cobrada')}
                                    className="w-full py-3 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm min-h-[44px]"
                                >
                                    😕 Não consegui cobrar
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                onClick={handleNaoCobrada}
                                disabled={salvando}
                                className="w-full py-3 bg-primary active:bg-primaryDark text-white rounded-full font-bold text-sm shadow-sm disabled:opacity-50 min-h-[44px]"
                            >
                                {salvando ? 'Registrando…' : 'Registrar: não consegui cobrar'}
                            </button>
                            <button
                                onClick={() => setModo('cobrar')}
                                className="w-full py-3 bg-white border border-gray-300 text-gray-600 rounded-full font-medium text-sm min-h-[44px]"
                            >
                                Voltar
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// Cobranças em rota. Dois usos:
//  - `embutido` (padrão de uso real): seção dentro da aba Entregas da tela Rota
//  - solto: aba própria no painel do motorista (/minhas-entregas)
const CobrancasRotaAba = ({ embutido = false, vendedorId, somenteLeitura = false }) => {
    const [dados, setDados] = useState({ pendentes: [], trabalhadasHoje: [], souEu: true });
    const [loading, setLoading] = useState(true);
    const [alvoCobranca, setAlvoCobranca] = useState(null);
    const [q, setQ] = useState('');
    const [buscaAberta, setBuscaAberta] = useState(!embutido);
    const [resultadosBusca, setResultadosBusca] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const debounceRef = useRef(null);

    const fetchMinhas = async () => {
        try {
            setLoading(true);
            const data = await cobrancasRotaService.minhas(vendedorId);
            setDados(data);
        } catch {
            toast.error('Erro ao carregar cobranças. Verifique seu 4G.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchMinhas(); }, [vendedorId]);

    // Só quem está vendo a PRÓPRIA lista cobra (o escritório olhando a rota alheia não registra por ele)
    const podeRegistrar = !somenteLeitura && dados.souEu !== false;

    // Busca livre por cliente (imprevisto: cliente quer pagar na hora)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const termo = q.trim();
        if (termo.length < 2) { setResultadosBusca([]); return; }
        debounceRef.current = setTimeout(async () => {
            try {
                setBuscando(true);
                const data = await cobrancasRotaService.buscarParcelasAbertas(termo);
                setResultadosBusca(data);
            } catch {
                toast.error('Erro na busca.');
            } finally {
                setBuscando(false);
            }
        }, 350);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [q]);

    const handleDesfazer = async (c) => {
        if (!window.confirm(`Desfazer o registro de ${c.clienteNome}?`)) return;
        try {
            await cobrancasRotaService.desfazer(c.id);
            toast.success('Registro desfeito.');
            setQ('');
            fetchMinhas();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao desfazer.');
        }
    };

    const abrirCobranca = (c) => setAlvoCobranca({
        cobrancaId: c.id,
        parcelaId: c.parcelaId,
        clienteNome: c.clienteNome,
        numeroParcela: c.numeroParcela,
        totalParcelas: c.totalParcelas,
        saldo: c.saldoParcela,
        dataVencimento: c.dataVencimento
    });

    const abrirAvulsa = (p) => setAlvoCobranca({
        cobrancaId: null,
        parcelaId: p.parcelaId,
        clienteNome: p.clienteNome,
        numeroParcela: p.numeroParcela,
        totalParcelas: p.totalParcelas,
        saldo: p.saldo,
        dataVencimento: p.dataVencimento
    });

    // Embutido na aba Entregas: o cabeçalho "Cobranças a fazer" aparece SEMPRE
    // (senão ninguém descobre a função); só a lista é que ocupa espaço quando existe.
    const vazio = !loading && dados.pendentes.length === 0 && dados.trabalhadasHoje.length === 0;

    return (
        <div className={embutido ? 'mb-4' : 'px-4 space-y-4'}>
            {embutido && (
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-[13px] font-bold text-primaryDark flex items-center gap-1.5">
                        <HandCoins className="h-4 w-4" /> Cobranças a fazer
                    </h3>
                    <span className="bg-mint text-primaryDark text-[11px] font-bold px-2 py-0.5 rounded-full">{dados.pendentes.length}</span>
                    {vazio && (
                        <span className="text-[11px] text-gray-500">
                            {podeRegistrar ? 'nenhum título pendurado na carga' : 'nenhuma cobrança deste motorista hoje'}
                        </span>
                    )}
                    {podeRegistrar && (
                        <button
                            onClick={() => setBuscaAberta(v => !v)}
                            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 bg-white border border-primary text-primary hover:bg-mint/40 text-[11px] font-bold rounded-lg"
                        >
                            <Search className="h-3.5 w-3.5" /> {buscaAberta ? 'Fechar busca' : 'Cobrar um título'}
                        </button>
                    )}
                    {!podeRegistrar && (
                        <span className="ml-auto text-[11px] text-gray-500">somente visualização</span>
                    )}
                </div>
            )}

            {/* Busca livre */}
            {buscaAberta && podeRegistrar && (
            <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-3 ${embutido ? 'mb-3' : ''}`}>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Buscar cliente para cobrar…"
                        className="w-full border border-gray-300 rounded px-3 py-2.5 pl-9 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                </div>
                {buscando && <p className="text-xs text-gray-500 mt-2">Buscando…</p>}
                {!buscando && q.trim().length >= 2 && resultadosBusca.length === 0 && (
                    <p className="text-xs text-gray-500 mt-2">Nenhum título em aberto para essa busca.</p>
                )}
                {resultadosBusca.map(p => (
                    <div key={p.parcelaId} className="flex items-center gap-2 border-t border-gray-100 py-2.5 mt-2 first:mt-0">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.clienteNome}</p>
                            <p className="text-xs text-gray-500">
                                Parc. {p.numeroParcela}/{p.totalParcelas} · venc. {fmtData(p.dataVencimento)}
                                {p.vencida ? ' · vencida' : ''}
                            </p>
                        </div>
                        <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{fmtMoeda(p.saldo)}</span>
                        {p.jaEmRota ? (
                            <span className="px-2 py-1 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">Já em rota</span>
                        ) : (
                            <button
                                onClick={() => abrirAvulsa(p)}
                                className="px-3 py-2 bg-primary active:bg-primaryDark text-white rounded-full text-xs font-bold min-h-[36px]"
                            >
                                Cobrar
                            </button>
                        )}
                    </div>
                ))}
            </div>
            )}

            {loading ? (
                <div className={embutido ? 'text-[12px] text-gray-500 py-2' : 'text-center py-10 opacity-60'}>
                    {embutido ? 'Carregando cobranças…' : (
                        <>
                            <HandCoins className="h-10 w-10 text-primary animate-pulse mb-3 mx-auto" />
                            <p className="font-semibold text-gray-600">Carregando cobranças…</p>
                        </>
                    )}
                </div>
            ) : (
                <>
                    {/* Pendentes das minhas cargas */}
                    {vazio && !embutido && (
                        <div className="text-center py-10 bg-white rounded-xl shadow-sm border border-gray-100">
                            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-2" />
                            <p className="text-lg font-bold text-gray-800">Nenhuma cobrança na carga</p>
                            <p className="text-sm text-gray-500 mt-1 px-6">Se um cliente quiser pagar um título, use a busca acima.</p>
                        </div>
                    )}

                    <div className={embutido ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2' : 'space-y-4'}>
                    {dados.pendentes.map(c => (
                        <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-base font-bold text-gray-900 truncate">{c.clienteNome}</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Parcela {c.numeroParcela}{c.totalParcelas ? `/${c.totalParcelas}` : ''}
                                        {c.pedidoNumero ? ` · Pedido #${c.pedidoNumero}` : ''} · venc. {fmtData(c.dataVencimento)}
                                        {c.embarqueNumero ? ` · Carga #${c.embarqueNumero}` : ''}
                                    </p>
                                </div>
                                <span className="text-base font-bold text-gray-900 whitespace-nowrap">{fmtMoeda(c.saldoParcela)}</span>
                            </div>
                            {podeRegistrar && (
                                <button
                                    onClick={() => abrirCobranca(c)}
                                    className="mt-3 w-full py-2.5 bg-primary active:bg-primaryDark text-white rounded-full text-sm font-bold shadow-sm min-h-[44px]"
                                >
                                    <HandCoins className="inline h-4 w-4 mr-1 -mt-0.5" /> Cobrar
                                </button>
                            )}
                        </div>
                    ))}
                    </div>

                    {/* Trabalhadas hoje */}
                    {dados.trabalhadasHoje.length > 0 && (
                        <div className={embutido ? 'mt-3' : ''}>
                            <p className="text-xs font-bold uppercase tracking-widest text-gray-600 mb-2 px-1">Registradas hoje</p>
                            <div className={embutido ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2' : 'space-y-2'}>
                                {dados.trabalhadasHoje.map(c => (
                                    <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{c.clienteNome}</p>
                                            <p className="text-xs text-gray-500">
                                                {c.status === 'NAO_COBRADA'
                                                    ? `Não cobrada · ${c.responsavelTipo === 'VENDEDOR' ? 'vendedor responsável' : 'escritório responsável'}`
                                                    : `${fmtMoeda(c.valorCobrado)} · ${c.formaPagamentoNome || ''}${c.status === 'BAIXADA' ? ' · baixada no caixa' : ' · aguarda caixa'}`}
                                            </p>
                                        </div>
                                        {c.status === 'NAO_COBRADA' ? (
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">Não cobrada</span>
                                        ) : c.status === 'BAIXADA' ? (
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">Baixada ✓</span>
                                        ) : (
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">Cobrada ✓</span>
                                        )}
                                        {c.status !== 'BAIXADA' && podeRegistrar && (
                                            <button
                                                onClick={() => handleDesfazer(c)}
                                                className="p-2 text-gray-500 active:text-gray-700 rounded-full active:bg-gray-100"
                                                title="Desfazer registro"
                                            >
                                                <Undo2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}

            {alvoCobranca && (
                <CobrarTituloModal
                    alvo={alvoCobranca}
                    onClose={() => setAlvoCobranca(null)}
                    onSuccess={() => { setAlvoCobranca(null); setQ(''); fetchMinhas(); }}
                />
            )}
        </div>
    );
};

export default CobrancasRotaAba;
