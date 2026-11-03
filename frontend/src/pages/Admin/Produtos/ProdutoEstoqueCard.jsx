import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, X, Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import estoqueService from '../../../services/estoqueService';
import SelectBusca from '../../../components/SelectBusca';
import CampoNumero from '../../../components/CampoNumero';

export const MOTIVOS_AJUSTE = [
    { value: 'PERDA_QUEBRA', label: 'Perda/quebra' },
    { value: 'AMOSTRA', label: 'Amostra' },
    { value: 'USO_INTERNO', label: 'Uso interno' },
    { value: 'CORRECAO_CONTAGEM', label: 'Correção de contagem' },
    { value: 'COMPRA_AVULSA', label: 'Compra avulsa' },
    { value: 'OUTRO', label: 'Outro' },
];

const fmt = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

// Card de estoque do produto: números, mínimo/máximo editáveis e botão de ajuste com motivo.
//  - minimo/maximo/onMinimo/onMaximo: estado do formulário da tela (salvos junto com "Salvar").
//  - podeEditar: produtos.edit (mín/máx). A permissão do ajuste vem de /estoque/permissoes.
//  - controla: o produto controla estoque (já considerando a escolha em edição).
export default function ProdutoEstoqueCard({ produto, controla, minimo, maximo, onMinimo, onMaximo, podeEditar, onAjustado }) {
    const [permissoes, setPermissoes] = useState(null);
    const [modal, setModal] = useState(false);

    useEffect(() => {
        let vivo = true;
        estoqueService.getPermissoes().then(p => { if (vivo) setPermissoes(p); }).catch(() => { if (vivo) setPermissoes({ regras: [] }); });
        return () => { vivo = false; };
    }, []);

    // Espelha PainelEstoque: admin tudo; senão regra da categoria do produto (entrada='adicionar', saída='diminuir').
    const podeAjuste = (tipo) => {
        if (!permissoes) return false;
        if (permissoes.admin) return true;
        const acao = tipo === 'ENTRADA' ? 'adicionar' : 'diminuir';
        return (permissoes.regras || []).some(r => {
            const catOk = !r.categoria || r.categoria === produto.categoria;
            return catOk && Array.isArray(r.pode) && r.pode.includes(acao);
        });
    };
    const podeEntrada = podeAjuste('ENTRADA');
    const podeSaida = podeAjuste('SAIDA');
    const podeAlgum = podeEntrada || podeSaida;

    const total = Number(produto.estoqueTotal || 0);
    const disp = Number(produto.estoqueDisponivel || 0);
    const reservado = Math.max(0, total - disp);
    const limitesOff = !controla || !podeEditar;

    const kpis = [
        { label: 'Disponível', valor: fmt(disp), cor: 'text-green-700' },
        { label: 'Total', valor: fmt(total), cor: 'text-gray-900' },
        { label: 'Reservado', valor: fmt(reservado), cor: 'text-amber-700' },
    ];

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <Boxes className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Estoque</span>
            </div>
            <div className="p-4 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                    {kpis.map(k => (
                        <div key={k.label} className="rounded-lg bg-gray-50 px-2 py-2 text-center min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{k.label}</div>
                            <div className={`text-lg font-extrabold font-mono truncate ${k.cor}`}>{k.valor}</div>
                        </div>
                    ))}
                </div>

                {!controla && (
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        Este produto não controla estoque — ajuste indisponível.
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-sm font-medium text-gray-700">Mínimo</label>
                        <CampoNumero step="0.001" min="0" disabled={limitesOff} value={minimo} onChange={e => onMinimo(e.target.value)} placeholder="0"
                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm min-h-[44px] text-right font-mono focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-500" />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-gray-700">Máximo</label>
                        <CampoNumero step="0.001" min="0" disabled={limitesOff} value={maximo} onChange={e => onMaximo(e.target.value)} placeholder="0"
                            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm min-h-[44px] text-right font-mono focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none disabled:bg-gray-100 disabled:text-gray-500" />
                    </div>
                </div>
                {controla && podeEditar && <div className="text-xs text-gray-500 -mt-2">Mínimo e máximo são gravados ao clicar em Salvar.</div>}

                <button type="button" onClick={() => setModal(true)} disabled={!controla || !podeAlgum}
                    title={!podeAlgum && controla ? 'Você não tem permissão para ajustar estoque' : undefined}
                    className="w-full min-h-[44px] px-4 py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    Ajustar estoque
                </button>
            </div>
            {modal && (
                <ModalAjuste produto={produto} total={total} podeEntrada={podeEntrada} podeSaida={podeSaida}
                    onFechar={() => setModal(false)} onSalvo={() => { setModal(false); onAjustado && onAjustado(); }} />
            )}
        </div>
    );
}

function ModalAjuste({ produto, total, podeEntrada, podeSaida, onFechar, onSalvo }) {
    const [tipo, setTipo] = useState(podeEntrada ? 'ENTRADA' : 'SAIDA');
    const [quantidade, setQuantidade] = useState('');
    const [motivo, setMotivo] = useState('');
    const [obs, setObs] = useState('');
    const [confirmando, setConfirmando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const salvandoRef = useRef(false);

    const qtd = Number(quantidade);
    const qtdOk = Number.isFinite(qtd) && qtd > 0;
    const depois = useMemo(() => (qtdOk ? (tipo === 'ENTRADA' ? total + qtd : total - qtd) : total), [qtdOk, tipo, total, qtd]);
    const obsLetras = obs.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
    const saida = tipo === 'SAIDA';

    const revisar = () => {
        if (!qtdOk) return toast.error('Informe uma quantidade válida.');
        if (saida && !motivo) return toast.error('Escolha o motivo da saída.');
        if (saida && obsLetras < 3) return toast.error('Descreva o motivo da saída (mínimo 3 letras).');
        setConfirmando(true);
    };

    const salvar = async () => {
        if (salvandoRef.current) return;
        salvandoRef.current = true;
        setSalvando(true);
        try {
            await estoqueService.ajustar({
                produtoId: produto.id, tipo, quantidade: qtd,
                observacao: obs.trim() || undefined,
                motivoCodigo: motivo || undefined,
            });
            toast.success(`${saida ? 'Saída' : 'Entrada'} de ${fmt(qtd)} lançada.`);
            onSalvo();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Não foi possível lançar o ajuste.');
            setConfirmando(false);
        } finally {
            salvandoRef.current = false;
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4" onClick={() => !salvando && onFechar()}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Ajustar estoque</h2>
                    <button onClick={() => !salvando && onFechar()} className="p-2.5 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100" aria-label="Fechar"><X className="h-5 w-5" /></button>
                </div>
                <div className="text-sm text-gray-600 truncate">{produto.nome}</div>

                {!confirmando ? (
                    <>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" disabled={!podeEntrada} onClick={() => setTipo('ENTRADA')}
                                className={`min-h-[44px] rounded-full text-sm font-semibold inline-flex items-center justify-center gap-1.5 border disabled:opacity-40 ${tipo === 'ENTRADA' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300'}`}>
                                <ArrowDownCircle className="h-4 w-4" /> Entrada
                            </button>
                            <button type="button" disabled={!podeSaida} onClick={() => setTipo('SAIDA')}
                                className={`min-h-[44px] rounded-full text-sm font-semibold inline-flex items-center justify-center gap-1.5 border disabled:opacity-40 ${tipo === 'SAIDA' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300'}`}>
                                <ArrowUpCircle className="h-4 w-4" /> Saída
                            </button>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Quantidade *</label>
                            <CampoNumero step="0.001" min="0" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="0"
                                className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-base min-h-[44px] text-right font-mono focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Motivo{saida ? ' *' : ''}</label>
                            <SelectBusca value={motivo} onChange={e => setMotivo(e.target.value)} className="mt-1 w-full">
                                <option value="">{saida ? 'Escolher motivo…' : 'Sem motivo (opcional)'}</option>
                                {MOTIVOS_AJUSTE.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700">Descrição{saida ? ' *' : ''}</label>
                            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} maxLength={300}
                                placeholder={saida ? 'Ex.: caiu da bandeja na produção' : 'Opcional'}
                                className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 flex items-center justify-between">
                            <span>Estoque total</span>
                            <span className="font-mono font-bold">{fmt(total)} → <span className={depois < 0 ? 'text-red-600' : 'text-primaryDark'}>{fmt(depois)}</span></span>
                        </div>
                        {depois < 0 && <div className="text-xs text-red-700">A saída é maior que o estoque total — o servidor pode recusar.</div>}
                        <div className="flex flex-col-reverse md:flex-row gap-3 pt-1">
                            <button onClick={onFechar} className="w-full md:w-auto min-h-[44px] px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                            <button onClick={revisar} className="w-full md:w-auto min-h-[44px] px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm">Revisar</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className={`rounded-xl border p-4 text-sm ${saida ? 'bg-red-50 border-red-200 text-red-900' : 'bg-green-50 border-green-200 text-green-900'}`}>
                            <div className="font-bold mb-1">Confirmar {saida ? 'saída' : 'entrada'} de {fmt(qtd)}?</div>
                            <div>Estoque total: <span className="font-mono font-bold">{fmt(total)} → {fmt(depois)}</span></div>
                            {motivo && <div>Motivo: {MOTIVOS_AJUSTE.find(m => m.value === motivo)?.label}</div>}
                            {obs.trim() && <div className="break-words">“{obs.trim()}”</div>}
                        </div>
                        <div className="flex flex-col-reverse md:flex-row gap-3 pt-1">
                            <button onClick={() => setConfirmando(false)} disabled={salvando} className="w-full md:w-auto min-h-[44px] px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm disabled:opacity-50">Voltar</button>
                            <button onClick={salvar} disabled={salvando}
                                className={`w-full md:w-auto min-h-[44px] px-4 py-2 text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50 inline-flex items-center justify-center gap-2 ${saida ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primaryDark'}`}>
                                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                                {salvando ? 'Lançando…' : 'Confirmar'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
