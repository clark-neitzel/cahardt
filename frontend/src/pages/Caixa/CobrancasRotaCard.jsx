import React, { useState } from 'react';
import { HandCoins, CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import caixaService from '../../services/caixaService';

const fmtMoeda = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

// Card "Cobranças da Rota" do Caixa Diário: títulos cobrados na rua chegam aqui
// como "Aberto"; quem confere marca o box e faz a baixa oficial da parcela —
// mesmo ritual da Baixa CA das entregas.
const CobrancasRotaCard = ({ cobrancas, podeBaixar, onChanged }) => {
    const [selecionadas, setSelecionadas] = useState(new Set());
    const [baixando, setBaixando] = useState(false);

    const itens = cobrancas?.itens || [];
    if (itens.length === 0) return null;

    const abertas = itens.filter(c => c.status === 'COBRADA');

    const toggle = (id) => {
        setSelecionadas(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleTodas = () => {
        setSelecionadas(prev => {
            const todas = abertas.map(c => c.id);
            const allSelected = todas.length > 0 && todas.every(id => prev.has(id));
            return allSelected ? new Set() : new Set(todas);
        });
    };

    const handleBaixar = async () => {
        const ids = Array.from(selecionadas);
        if (ids.length === 0) { toast.error('Selecione ao menos uma cobrança para baixar.'); return; }
        const nomes = itens.filter(c => ids.includes(c.id)).map(c => c.clienteNome).join(', ');
        if (!window.confirm(`Dar baixa em ${ids.length} cobrança(s) de rota?\n\n${nomes}`)) return;
        try {
            setBaixando(true);
            const r = await caixaService.baixarCobrancasRota(ids);
            const ok = r.resultados?.filter(x => x.status === 'OK') || [];
            const jaBaixadas = r.resultados?.filter(x => x.status === 'JA_BAIXADO') || [];
            const erros = r.resultados?.filter(x => x.status === 'ERRO') || [];
            if (ok.length > 0) toast.success(`${ok.length} título(s) baixado(s)!`);
            if (jaBaixadas.length > 0) toast(`${jaBaixadas.length} já estava(m) baixado(s).`);
            erros.forEach(e => toast.error(`${e.cliente || ''}: ${e.motivo}`, { duration: 7000 }));
            setSelecionadas(new Set());
            if (onChanged) onChanged();
        } catch (error) {
            toast.error(error.response?.data?.error || 'Erro ao baixar as cobranças.');
        } finally {
            setBaixando(false);
        }
    };

    const badge = (c) => {
        if (c.status === 'BAIXADA') return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 whitespace-nowrap">Baixada ✓</span>;
        if (c.status === 'NAO_COBRADA') {
            return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
                {c.responsavelTipo === 'VENDEDOR' ? `Vendedor resp.${c.responsavelVendedorNome ? ` (${c.responsavelVendedorNome})` : ''}` : 'Escritório resp.'}
            </span>;
        }
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">Aberto</span>;
    };

    const linhaDetalhe = (c) => {
        if (c.status === 'NAO_COBRADA') return 'não conseguiu cobrar';
        const partes = [];
        if (c.parcial) partes.push(`parcial (de ${fmtMoeda(c.valorParcela)})`);
        if (c.formaPagamentoNome) partes.push(c.formaPagamentoNome);
        return partes.join(' · ');
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center space-x-2">
                    <HandCoins className="h-5 w-5 text-primaryDark" />
                    <h3 className="text-sm font-semibold text-gray-700">Cobranças da Rota</h3>
                    <span className="bg-mint text-primaryDark text-xs font-bold px-2 py-0.5 rounded-full">{itens.length}</span>
                    {cobrancas.semBaixa > 0 && (
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">{cobrancas.semBaixa} sem baixa</span>
                    )}
                </div>
                {podeBaixar && abertas.length > 0 && (
                    <div className="flex items-center gap-2">
                        <button onClick={toggleTodas} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 min-h-[36px]">
                            {abertas.every(c => selecionadas.has(c.id)) && abertas.length > 0
                                ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            Todas
                        </button>
                        <button
                            onClick={handleBaixar}
                            disabled={baixando || selecionadas.size === 0}
                            className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-xs disabled:opacity-50"
                        >
                            {baixando ? 'Baixando…' : `Baixar selecionadas (${selecionadas.size})`}
                        </button>
                    </div>
                )}
            </div>

            <div className="space-y-2">
                {itens.map(c => {
                    const selecionavel = c.status === 'COBRADA' && podeBaixar;
                    const marcada = selecionadas.has(c.id);
                    const apagada = c.status === 'NAO_COBRADA';
                    return (
                        <div
                            key={c.id}
                            onClick={() => selecionavel && toggle(c.id)}
                            className={`border rounded-xl p-3 flex items-center gap-3 ${selecionavel ? 'cursor-pointer' : ''} ${marcada ? 'border-primary bg-mint/30' : 'border-gray-200'} ${apagada ? 'opacity-60' : ''}`}
                        >
                            {selecionavel ? (
                                <span className={`flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center ${marcada ? 'bg-primary border-primary text-white' : 'border-gray-300'}`}>
                                    {marcada && <span className="text-xs font-bold">✓</span>}
                                </span>
                            ) : (
                                <span className="flex-shrink-0 w-5" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                    {c.clienteNome}
                                    <span className="font-normal text-gray-500"> · parc. {c.numeroParcela}{c.pedidoNumero ? ` · #${c.pedidoNumero}` : ''}{c.embarqueNumero ? ` · carga #${c.embarqueNumero}` : ''}</span>
                                </p>
                                <p className="text-xs text-gray-500">{linhaDetalhe(c)}{c.observacao ? ` · ${c.observacao}` : ''}</p>
                            </div>
                            <span className={`text-sm font-bold whitespace-nowrap ${apagada ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                {fmtMoeda(c.status === 'NAO_COBRADA' ? c.valorParcela : c.valorCobrado)}
                            </span>
                            {badge(c)}
                        </div>
                    );
                })}
            </div>

            <div className="mt-3 border-t border-gray-100 pt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                {Number(cobrancas.totalDinheiro || 0) > 0 && (
                    <span>💵 Dinheiro (soma no valor a prestar): <b>{fmtMoeda(cobrancas.totalDinheiro)}</b></span>
                )}
                {Number(cobrancas.totalOutros || 0) > 0 && (
                    <span>Outras formas (não passam pelo caixa): <b>{fmtMoeda(cobrancas.totalOutros)}</b></span>
                )}
            </div>
        </div>
    );
};

export default CobrancasRotaCard;
