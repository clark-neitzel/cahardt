import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { X, ShieldAlert, Wallet } from 'lucide-react';
import contasReceberService from '../../services/contasReceberService';
import SelectBusca from '../../components/SelectBusca';

// Baixa manual só aceita o que fica fisicamente com alguém — o valor vai para o caixa
// do dia de quem baixou e é cobrado no fechamento. O resto cai no extrato e entra pela
// Conciliação Bancária (é lá que o dinheiro é confrontado com o banco). O backend
// recusa qualquer outra forma (validarFormaManual), inclusive "responsável".
export const FORMAS_BAIXA_MANUAL = ['Dinheiro', 'Cheque'];

// Modal ÚNICO de baixa de parcela do Contas a Receber (usado pela tela em tabela e pela
// tela por conta). Era duplicado: a cópia da tela por conta mandava `valorPago` e a rota
// lê `valorRecebido` — dava 400 em toda tentativa. Uma implementação só evita repetir.
// ── Modal de baixa: valor recebido (parcial ou total) + desconto (até 100%) ──
const BaixaParcelaModal = ({ linha, podeDarDesconto, onClose, onSuccess, saldoRestante, fmt }) => {
    const l = linha;
    const saldo = saldoRestante(l);
    const [valorRecebido, setValorRecebido] = useState(saldo.toFixed(2).replace('.', ','));
    const [aplicarDesconto, setAplicarDesconto] = useState(false);
    const [tipoDesconto, setTipoDesconto] = useState('R$'); // 'R$' | '%'
    const [valorDescontoInput, setValorDescontoInput] = useState('');
    const [motivoDesconto, setMotivoDesconto] = useState('');
    const [formaPagamento, setFormaPagamento] = useState('Dinheiro');
    const [dataPagamento, setDataPagamento] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);
    // Sem seletor de banco/caixa: baixa manual é sempre em espécie e o servidor a lança
    // na conta em dinheiro (a Caixinha) — antes dava para deixar "Não informar" e o
    // dinheiro sumia do relatório Saldos por Conta.

    const parseNum = (v) => parseFloat(String(v).replace(',', '.')) || 0;
    const fmtInput = (n) => n.toFixed(2).replace('.', ',');
    // Desconto em reais, sempre limitado ao saldo (nunca passa do que falta receber)
    const calcDescontoReais = (tipo, input) => {
        const bruto = tipo === '%'
            ? saldo * Math.max(0, parseNum(input)) / 100
            : Math.max(0, parseNum(input));
        return Math.min(bruto, saldo);
    };
    const recebido = Math.max(0, parseNum(valorRecebido));
    const descontoReais = aplicarDesconto ? calcDescontoReais(tipoDesconto, valorDescontoInput) : 0;
    const totalLancado = recebido + descontoReais;
    const saldoDepois = Math.max(0, saldo - totalLancado);
    const novoStatusPreview = totalLancado <= 0 ? null : (saldoDepois <= 0.01 ? 'PAGO' : 'PARCIAL');
    const motivoObrigatorioFaltando = aplicarDesconto && descontoReais > 0 && !motivoDesconto.trim();
    const podeConfirmar = totalLancado > 0 && totalLancado <= saldo + 0.01 && !motivoObrigatorioFaltando;
    // Título cobrado em boleto/Pix sendo quitado em espécie: acontece de verdade (cliente paga
    // no balcão), então só avisa — mas avisa, porque se ele pagou o boleto a baixa certa vem da
    // conciliação e esta aqui deixaria o crédito do banco sem par.
    const cobrancaEletronica = /boleto|pix/i.test(l.condicaoPagamento || '');

    // Motivo pelo qual o botão está travado (ajuda o usuário a entender)
    const bloqueio = totalLancado <= 0
        ? 'Informe um valor recebido ou um desconto.'
        : totalLancado > saldo + 0.01
            ? 'A soma de recebido + desconto passa do que falta receber.'
            : motivoObrigatorioFaltando
                ? 'Preencha o motivo do desconto para continuar.'
                : '';

    // Ao mexer no desconto, o "valor recebido" cai sozinho para (saldo − desconto),
    // evitando que os dois campos somem além do saldo.
    const ajustarRecebidoPeloDesconto = (tipo, input, ativo) => {
        if (!ativo) return;
        setValorRecebido(fmtInput(Math.max(0, saldo - calcDescontoReais(tipo, input))));
    };
    const handleDescontoInput = (v) => { setValorDescontoInput(v); ajustarRecebidoPeloDesconto(tipoDesconto, v, aplicarDesconto); };
    const handleTipoDesconto = (t) => { setTipoDesconto(t); ajustarRecebidoPeloDesconto(t, valorDescontoInput, aplicarDesconto); };
    const handleToggleDesconto = (checked) => {
        setAplicarDesconto(checked);
        if (checked) ajustarRecebidoPeloDesconto(tipoDesconto, valorDescontoInput, true);
        else setValorRecebido(fmtInput(saldo));
    };

    const confirmar = async () => {
        if (totalLancado <= 0) { toast.error('Informe um valor recebido ou desconto.'); return; }
        if (totalLancado > saldo + 0.01) { toast.error('Valor informado é maior que o saldo restante.'); return; }
        if (motivoObrigatorioFaltando) { toast.error('Informe o motivo do desconto.'); return; }
        setSalvando(true);
        try {
            await contasReceberService.darBaixa(l.parcelaId, {
                valorRecebido: recebido,
                valorDesconto: aplicarDesconto ? descontoReais : 0,
                motivoDesconto: aplicarDesconto && descontoReais > 0 ? motivoDesconto.trim() : undefined,
                formaPagamento,
                dataPagamento,
                observacao: observacao || undefined
            });
            toast.success(novoStatusPreview === 'PAGO' ? 'Parcela quitada!' : 'Baixa parcial registrada!');
            onSuccess();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao dar baixa');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center md:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-w-md w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500">Dar baixa — Parcela {l.numeroParcela}/{l.parcelasTotal}</p>
                        <h2 className="font-bold text-gray-900">{l.clienteNome}{l.pedidoNumero ? ` · Pedido #${l.pedidoNumero}` : ''}</h2>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="p-2.5 -mr-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs text-gray-500 mb-1">Valor total</p>
                            <p className="font-bold text-base text-gray-900">R$ {fmt(l.valor)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs text-gray-500 mb-1">Já pago</p>
                            <p className="font-bold text-base text-green-700">R$ {fmt(Number(l.valorPago || 0) + Number(l.valorDescontoTotal || 0))}</p>
                        </div>
                        <div className="col-span-2 md:col-span-1 rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-xs text-gray-500 mb-1">Falta receber</p>
                            <p className="font-bold text-base text-amber-700">R$ {fmt(saldo)}</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Valor recebido agora</label>
                        <div className="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary bg-white">
                            <span className="px-3 py-2.5 md:py-2 bg-gray-50 border-r border-gray-300 text-sm text-gray-500">R$</span>
                            <input inputMode="decimal" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} className="flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-sm outline-none" />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">
                            {aplicarDesconto
                                ? 'Ajustado automaticamente conforme o desconto. Reduza mais para deixar um saldo pendente.'
                                : 'Reduza o valor para registrar um pagamento parcial.'}
                        </p>
                    </div>

                    <div className="rounded-xl border border-dashed border-gray-300 p-3 space-y-3 bg-gray-50">
                        <label className="flex items-center gap-2 min-h-[44px] py-1 cursor-pointer text-sm font-medium text-gray-700">
                            <input type="checkbox" checked={aplicarDesconto} onChange={e => handleToggleDesconto(e.target.checked)} className="h-5 w-5 rounded flex-shrink-0 accent-[#00754A]" disabled={!podeDarDesconto} />
                            Aplicar desconto no que falta receber
                            {!podeDarDesconto && <span className="text-xs text-gray-400 font-normal">(sem permissão)</span>}
                        </label>
                        {aplicarDesconto && podeDarDesconto && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                                        <SelectBusca value={tipoDesconto} onChange={e => handleTipoDesconto(e.target.value)} className="w-full [&>button]:min-h-[44px] md:[&>button]:min-h-0">
                                            <option value="R$">R$ (valor fixo)</option>
                                            <option value="%">% do saldo</option>
                                        </SelectBusca>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Valor do desconto</label>
                                        <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white">
                                            <span className="px-3 py-2.5 md:py-2 bg-gray-50 border-r border-gray-300 text-sm text-gray-500">{tipoDesconto === '%' ? '%' : 'R$'}</span>
                                            <input inputMode="decimal" value={valorDescontoInput} onChange={e => handleDescontoInput(e.target.value)} className="flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-sm outline-none" />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Motivo do desconto <span className="text-red-500">*</span>
                                    </label>
                                    <input value={motivoDesconto} onChange={e => setMotivoDesconto(e.target.value)} placeholder="Ex.: negociação com cliente, produto avariado..."
                                        className={`w-full min-h-[44px] md:min-h-0 border rounded px-3 py-2 text-sm focus:ring-1 focus:outline-none ${motivoObrigatorioFaltando ? 'border-red-400 focus:border-red-500 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:border-primary focus:ring-primary'}`} />
                                    {motivoObrigatorioFaltando && (
                                        <p className="text-[11px] text-red-600 mt-1">Obrigatório para aplicar o desconto.</p>
                                    )}
                                </div>
                                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 inline-flex items-start gap-1.5">
                                    <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                    Isso reduz o valor a receber sem confirmação de pagamento — use com critério.
                                </p>
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
                            <SelectBusca value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className="w-full [&>button]:min-h-[44px] md:[&>button]:min-h-0">
                                {FORMAS_BAIXA_MANUAL.map(f => <option key={f}>{f}</option>)}
                            </SelectBusca>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data do pagamento</label>
                            <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} className="w-full min-h-[44px] md:min-h-0 border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                        </div>
                    </div>

                    {recebido > 0 && cobrancaEletronica && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 flex items-start gap-2">
                            <ShieldAlert className="w-4 h-4 text-blue-700 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-blue-800">
                                Este título é cobrado em <strong>{l.condicaoPagamento}</strong>. Só continue se o cliente
                                pagou mesmo <strong>em espécie</strong> — se ele pagou o boleto/Pix, a baixa certa vem
                                sozinha pela <strong>Conciliação Bancária</strong> (dar baixa aqui deixa o crédito do banco órfão).
                            </p>
                        </div>
                    )}

                    {recebido > 0 && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
                            <Wallet className="w-4 h-4 text-amber-700 mt-0.5 flex-shrink-0" />
                            <div className="text-xs text-amber-800">
                                <p className="font-semibold">R$ {fmt(recebido)} vai entrar no SEU caixa de hoje.</p>
                                <p className="mt-0.5">
                                    O valor soma no seu “a prestar” e você presta contas dele no fechamento do caixa.
                                    Recebimento em boleto, Pix, cartão ou transferência não entra por aqui — ele é baixado
                                    na <strong>Conciliação Bancária</strong>, quando o dinheiro aparece no extrato.
                                </p>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observação (opcional)</label>
                        <textarea rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                    </div>

                    {totalLancado > 0 && (
                        <div className={`rounded-xl border p-3 flex items-center justify-between ${novoStatusPreview === 'PAGO' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
                            <span className={`text-sm font-medium ${novoStatusPreview === 'PAGO' ? 'text-green-800' : 'text-amber-800'}`}>
                                Após esta baixa, a parcela fica:
                            </span>
                            <div className="text-right">
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${novoStatusPreview === 'PAGO' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                    {novoStatusPreview === 'PAGO' ? 'QUITADA (PAGO)' : 'PARCIAL'}
                                </span>
                                {novoStatusPreview === 'PARCIAL' && (
                                    <div className="text-xs text-amber-700 mt-1">Falta receber: R$ {fmt(saldoDepois)}</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-5 pt-4 pb-2 border-t border-gray-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 min-h-[44px] px-4 py-2.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm">Cancelar</button>
                    <button onClick={confirmar} disabled={!podeConfirmar || salvando} className="flex-1 min-h-[44px] px-4 py-2.5 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm disabled:opacity-50">
                        {salvando ? 'Salvando...' : (novoStatusPreview === 'PARCIAL' ? 'Confirmar baixa parcial' : 'Confirmar baixa')}
                    </button>
                </div>
                {bloqueio && !salvando && (
                    <p className="px-5 pb-4 text-xs text-red-600 text-center">{bloqueio}</p>
                )}
            </div>
        </div>
    );
};

export default BaixaParcelaModal;
