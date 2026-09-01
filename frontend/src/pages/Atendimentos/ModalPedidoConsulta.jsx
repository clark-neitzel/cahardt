// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ EXISTEM DUAS TELAS DE DETALHE DO PEDIDO NESTE SISTEMA — mexeu numa, olhe a outra
//
//  1) Aba Pedidos → popup de detalhes, embutida em `frontend/src/pages/Pedidos/ListaPedidos.jsx`
//     (a partir do comentário "{/* Modal de Detalhes */}"). É a COMPLETA: além de mostrar,
//     ela AGE sobre o pedido — cancelar, aprovar/reverter especial e bonificação, converter
//     especial em pedido com NF, boleto/PIX Asaas, WhatsApp, cobranças do Conta Azul,
//     reatribuir vendedor, editar. É a tela que a equipe usa o dia inteiro.
//
//  2) ESTA — popup do Painel de Atendimentos (/atendimentos), aberta ao clicar na pílula
//     "Pedido #NNNN" da coluna AÇÃO. É SÓ CONSULTA: nenhum botão que altere o pedido,
//     apenas leitura + fechar.
//
// Por que duas e não uma só: a popup da aba Pedidos não é componente — são ~490 linhas
// coladas dentro do ListaPedidos, amarradas ao estado e aos handlers daquela tela.
// Extrair mexeria na tela mais usada da empresa. O dono escolheu, em 08/2026, pagar o
// preço de ter duas telas para não arriscar aquela. Este comentário é a fatura desse
// preço: **mudou seção/campo aqui, confira se a outra também precisa mudar (e vice-versa)**.
//
// Diferença de dados (de propósito): esta popup mostra também a LINHA DO TEMPO ampliada
// ("tudo o que aconteceu com o pedido") — pedido do dono. Fonte: o MESMO endpoint da aba
// Pedidos, `GET /api/pedidos/:id` (pedidoService.detalhar), mais os atendimentos do
// cliente ligados a este pedido (`GET /api/atendimentos/cliente/:clienteId`, filtrado por
// pedidoId). Nada aqui inventa evento: o que o backend não devolve, não aparece.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import {
    X, Clock, Truck, CircleDollarSign, MapPin, Ban, Zap, FileText,
    Package, User, Loader2, AlertTriangle, ClipboardList, RefreshCw
} from 'lucide-react';
import pedidoService from '../../services/pedidoService';
import atendimentoService from '../../services/atendimentoService';
import { abrirLinkExterno } from '../../utils/linkExterno';

import {
    fmtMoeda, fmtData, fmtDataHora, fmtDataCampo, fmtDataOuHoraCampo,
    montarLinhaDoTempo, avisosDaLinhaDoTempo, resumoPagamentosEntrega,
    textoDataDoEvento, textoRodapeEntrega, ROTULO_ENTREGA_CARTAO, ROTULO_NFE,
} from './linhaDoTempoPedido';

// Mesmo rótulo do painel (backend: atendimentoService.montarLinhaPedido) — pedido
// ainda sem número mostra "(sem número)", nunca "ZZ#?".
const fmtNumero = (p) => {
    if (!p) return '';
    if (p.numero == null) return '(sem número)';
    return p.bonificacao ? `BN#${p.numero}` : p.especial ? `ZZ#${p.numero}` : `#${p.numero}`;
};

// Mesmas cores do badge de status da aba Pedidos (design system — não inventar cor nova)
const COR_STATUS_ENVIO = {
    ABERTO: 'bg-gray-100 text-gray-800',
    ENVIAR: 'bg-blue-100 text-blue-800',
    SINCRONIZANDO: 'bg-yellow-100 text-yellow-800',
    RECEBIDO: 'bg-green-100 text-green-800',
    ERRO: 'bg-red-100 text-red-800',
    EXCLUIDO: 'bg-red-100 text-red-700',
};

const CabecalhoSecao = ({ icone: Icone, children, className = 'text-gray-600' }) => (
    <p className={`text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${className}`}>
        {Icone ? <Icone className="h-3.5 w-3.5 shrink-0" /> : null}{children}
    </p>
);

/**
 * Popup SÓ DE CONSULTA do pedido, para o Painel de Atendimentos.
 * Props:
 *  - pedidoId  (obrigatório) id do pedido a carregar
 *  - resumo    (opcional) a linha do painel — usada só para o cabeçalho enquanto carrega
 *  - onClose   fechar
 */
const ModalPedidoConsulta = ({ pedidoId, resumo, onClose }) => {
    const [pedido, setPedido] = useState(null);
    const [atendimentosDoPedido, setAtendimentosDoPedido] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [tentativa, setTentativa] = useState(0);

    useEffect(() => {
        if (!pedidoId) return;
        let ativo = true;
        setCarregando(true);
        setErro(null);
        pedidoService.detalhar(pedidoId)
            .then(d => {
                if (!ativo) return;
                if (!d || !d.id) {
                    setErro('Este pedido não foi encontrado. Ele pode ter sido excluído.');
                    return;
                }
                setPedido(d);
            })
            .catch(err => {
                if (!ativo) return;
                const st = err?.response?.status;
                // 401 NÃO chega aqui: o interceptor de `services/api.js` (linha 23) apaga o
                // token e manda para /login antes de a popup ver o erro — tratar 401 aqui era
                // código morto. 403 (sem permissão) chega normalmente e continua tratado.
                setErro(
                    st === 403
                        ? 'Você não tem permissão para ver os detalhes deste pedido. Fale com o escritório se precisar consultá-lo.'
                        : st === 404
                            ? 'Este pedido não foi encontrado. Ele pode ter sido excluído.'
                            : 'Não foi possível carregar os detalhes do pedido agora. Confira a internet e tente de novo.'
                );
            })
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [pedidoId, tentativa]);

    // Atendimentos ligados a ESTE pedido — vêm da lista do cliente (endpoint que já existe)
    // e são filtrados aqui por pedidoId. Falhou? A linha do tempo segue sem eles, em silêncio:
    // é informação extra, não pode derrubar a popup.
    useEffect(() => {
        const clienteId = pedido?.clienteId;
        if (!clienteId || !pedidoId) return;
        let ativo = true;
        atendimentoService.listarPorCliente(clienteId)
            .then(lista => {
                if (!ativo) return;
                setAtendimentosDoPedido((Array.isArray(lista) ? lista : []).filter(a => a.pedidoId === pedidoId));
            })
            .catch(() => { /* silencioso de propósito */ });
        return () => { ativo = false; };
    }, [pedido?.clienteId, pedidoId]);

    // ESC fecha a popup (mesmo padrão de `pages/PCP/ReceitaForm.jsx:50-56`).
    // O clique no fundo escuro também fecha, como no `pages/Rota/ClientePopup.jsx:332`.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const p = pedido;
    const nomeCliente = p?.cliente?.NomeFantasia || p?.cliente?.Nome
        || resumo?.cliente?.NomeFantasia || resumo?.cliente?.Nome || '';
    const tituloPedido = p ? `Pedido ${fmtNumero(p)}` : `Pedido ${resumo?.rotuloPedido || ''}`.trim();

    const totalItens = (p?.itens || []).reduce((s, i) => s + Number(i.valor || 0) * Number(i.quantidade || 0), 0);
    const totalGeral = totalItens + Number(p?.valorFrete || 0);
    const linhaDoTempo = montarLinhaDoTempo(p, atendimentosDoPedido);
    const avisosLinhaDoTempo = avisosDaLinhaDoTempo(p);
    const entrega = resumoPagamentosEntrega(p);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
            {/* Fundo escuro: clicar fecha. Fica atrás do painel (z-0 vs relative). */}
            <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
            <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col">

                {/* Cabeçalho */}
                <div className="flex justify-between items-start gap-2 p-3 sm:p-4 border-b border-gray-100">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base sm:text-lg font-black text-gray-900 truncate">{tituloPedido}</h2>
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-gray-100 text-gray-600 uppercase tracking-wide shrink-0">
                                Consulta
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{nomeCliente || '—'}</p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Fechar"
                        className="p-2 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 shrink-0"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-3">

                    {carregando && (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-2">
                            <Loader2 className="h-6 w-6 animate-spin" />
                            <p className="text-sm">Carregando o pedido…</p>
                        </div>
                    )}

                    {!carregando && erro && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center space-y-3">
                            <AlertTriangle className="h-6 w-6 text-amber-600 mx-auto" />
                            <p className="text-sm text-amber-900">{erro}</p>
                            <button
                                onClick={() => setTentativa(t => t + 1)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-sm"
                            >
                                <RefreshCw className="h-4 w-4" /> Tentar de novo
                            </button>
                        </div>
                    )}

                    {!carregando && !erro && p && (<>

                        {/* Situação */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {p.statusEnvio && (
                                <span className={`px-2 py-1 text-[10px] leading-tight font-semibold rounded-full ${COR_STATUS_ENVIO[p.statusEnvio] || 'bg-gray-100 text-gray-800'}`}>
                                    {p.statusEnvio}
                                </span>
                            )}
                            {p.situacaoCA && (
                                <span className={`px-2 py-1 text-[10px] leading-tight font-semibold rounded-full ${p.situacaoCA === 'FATURADO' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                    {p.especial ? '' : 'CA: '}{p.situacaoCA}
                                </span>
                            )}
                            {p.especial && <span className="px-2 py-1 text-[10px] font-semibold rounded-full bg-purple-100 text-purple-700">ESPECIAL</span>}
                            {p.bonificacao && <span className="px-2 py-1 text-[10px] font-semibold rounded-full bg-green-100 text-green-800">BONIFICAÇÃO</span>}
                            {p.cancelado && <span className="px-2 py-1 text-[10px] font-semibold rounded-full bg-red-100 text-red-700">CANCELADO</span>}
                        </div>

                        {/* Cancelado */}
                        {p.cancelado && (
                            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                                <div className="flex items-center gap-2 text-sm font-bold text-red-800">
                                    <Ban className="h-4 w-4 shrink-0" /> Pedido cancelado
                                </div>
                                <p className="mt-1 text-xs text-red-700">
                                    Não entra mais na fila de faturamento e não pode emitir NF-e.
                                    {p.canceladoEm ? ` Cancelado em ${fmtDataHora(p.canceladoEm)}` : ''}
                                    {p.canceladoPorNome ? ` por ${p.canceladoPorNome}` : ''}.
                                </p>
                                {p.motivoCancelamento && (
                                    <p className="mt-1 text-xs text-red-700"><strong>Motivo:</strong> {p.motivoCancelamento}</p>
                                )}
                            </div>
                        )}

                        {/* Especial convertido */}
                        {(p.avisosConversao || []).length > 0 && (() => {
                            const av = p.avisosConversao[0];
                            return (
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-sm text-amber-900">
                                    <p className="font-bold flex items-center gap-1"><Zap className="h-4 w-4" /> Especial convertido</p>
                                    <p className="text-xs mt-1">
                                        Nasceu como pedido especial <b>ZZ#{av.numeroAntigo ?? '?'}</b> e virou o pedido <b>#{av.numeroNovo ?? p.numero ?? '?'}</b> em {fmtDataHora(av.createdAt)}.
                                        {av.valorPago != null ? <> Já recebido na conversão: <b>{fmtMoeda(av.valorPago)}</b>.</> : null}
                                    </p>
                                </div>
                            );
                        })()}

                        {/* Dados do pedido */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <User className="h-4 w-4 text-blue-600" />
                                <CabecalhoSecao>Dados do pedido</CabecalhoSecao>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Entrega</p>
                                    {/* `dataVenda` é campo de DATA PURA (a data de entrega escolhida na venda).
                                        Os 1.141 valores da base se distribuem em QUATRO convenções de data pura —
                                        03:00 UTC (773), 12:00 UTC (354 — o que `NovoPedido.jsx:976` escreve hoje),
                                        13:00 UTC (11) e meia-noite UTC (2) — mais 1 valor que NÃO é convenção
                                        nenhuma: o #999999 (fixture), gravado em 05:57:37.592 UTC. Esse único caso
                                        cai no ramo "instante de verdade" do `fmtDataCampo` e é formatado em
                                        Brasília, que é o comportamento certo para ele. (A rodada 5 escrevia "três
                                        convenções" e listava quatro, sem citar o 05:57.)
                                        `fmtData` formata em Brasília, então a convenção meia-noite UTC voltava às
                                        21:00 do DIA ANTERIOR: os pedidos #97 e #98 (dataVenda 2026-04-01 00:00 UTC)
                                        exibiam 31/03/2026. `fmtDataCampo` lê o dia em UTC quando o valor está numa
                                        das convenções e em Brasília quando é instante de verdade — é a regra do
                                        próprio `linhaDoTempoPedido.js`. Só esses 2 pedidos mudam de texto; os
                                        outros 1.139 com dataVenda continuam idênticos. */}
                                    <p className="font-bold text-gray-900">{fmtDataCampo(p.dataVenda)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Emissão</p>
                                    {/* `createdAt` é `@default(now())` — instante de verdade, NÃO data pura.
                                        Continua com `fmtData` (dia de Brasília) de propósito: passar pelo
                                        `fmtDataCampo` faria uma criação real à meia-noite UTC (21:00 de Brasília)
                                        ser lida como se fosse só o dia, e aí sim trocaria o dia certo pelo errado. */}
                                    <p className="font-medium text-gray-800">{fmtData(p.createdAt)}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Pagamento</p>
                                    <p className="font-medium text-gray-800">{p.nomeCondicaoPagamento || 'Não informado'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Vendedor</p>
                                    <p className="font-medium text-gray-800">{p.vendedor?.nome || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Registrado por</p>
                                    <p className="font-medium text-gray-800">{p.usuarioLancamento?.nome || '—'}</p>
                                </div>
                                <div className="col-span-2">
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Tipo de atendimento informado na venda</p>
                                    <p className="font-medium text-gray-800">{p.canalOrigem || 'não informado'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Itens */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <Package className="h-4 w-4 text-blue-600" />
                                <CabecalhoSecao>Itens</CabecalhoSecao>
                            </div>
                            <div className="p-4 space-y-1">
                                {(p.itens || []).length === 0 && <p className="text-sm text-gray-500">Este pedido não tem itens lançados.</p>}
                                {(p.itens || []).map(item => (
                                    <div key={item.id} className="flex justify-between gap-3 text-sm py-1.5 border-b border-gray-100 last:border-0">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900">{item.produto?.nome || item.descricao || 'Produto'}</p>
                                            <p className="text-[11px] text-gray-500 tabular-nums">
                                                {Number(item.quantidade)} un × {fmtMoeda(item.valor)}
                                            </p>
                                        </div>
                                        <span className="font-bold text-gray-900 whitespace-nowrap tabular-nums">
                                            {fmtMoeda(Number(item.quantidade) * Number(item.valor))}
                                        </span>
                                    </div>
                                ))}
                                {Number(p.valorFrete) > 0 && (
                                    <div className="flex justify-between text-sm pt-2 mt-1 border-t border-gray-200">
                                        <span className="font-semibold text-gray-700">Frete</span>
                                        <span className="font-bold text-gray-900 tabular-nums">{fmtMoeda(p.valorFrete)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Observações */}
                        {p.observacoes && (
                            <div className="bg-yellow-50/60 p-3 rounded-lg border border-yellow-200">
                                <p className="text-[10px] uppercase font-bold text-yellow-700 mb-1">Observações</p>
                                <p className="text-sm italic text-gray-700 whitespace-pre-wrap">{p.observacoes}</p>
                            </div>
                        )}

                        {/* Recebimento */}
                        <div className="bg-green-50/60 p-3 rounded-lg border border-green-200 space-y-1.5">
                            <CabecalhoSecao icone={CircleDollarSign} className="text-green-700">Recebimento</CabecalhoSecao>
                            {(() => {
                                const cr = p.contaReceber;
                                if (!cr) return (
                                    <p className="text-xs text-gray-600">
                                        {p.bonificacao
                                            ? 'Bonificação — não gera conta a receber.'
                                            : 'Ainda sem conta a receber — ela é criada quando o pedido é finalizado/faturado.'}
                                    </p>
                                );
                                const parcelas = cr.parcelas || [];
                                const agora = new Date();
                                const recebido = parcelas.reduce((s, x) => s + Number(x.valorPago || 0), 0);
                                return (<>
                                    {parcelas.map(par => {
                                        const vencida = par.status === 'PENDENTE' && new Date(par.dataVencimento) < agora;
                                        const [rot, cls] = par.status === 'PAGO' ? ['Pago', 'bg-green-100 text-green-800']
                                            : par.status === 'PARCIAL' ? ['Parcial', 'bg-yellow-100 text-yellow-800']
                                                : par.status === 'CANCELADO' ? ['Cancelado', 'bg-gray-100 text-gray-700']
                                                    : vencida ? ['Vencido', 'bg-red-100 text-red-700']
                                                        : ['Em aberto', 'bg-gray-100 text-gray-700'];
                                        return (
                                            <div key={par.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-green-100 last:border-0 flex-wrap">
                                                <span className="text-gray-700">Parcela {par.numeroParcela}/{parcelas.length} · venc. {fmtDataCampo(par.dataVencimento)}</span>
                                                <span className={`px-2 py-0.5 rounded-full font-semibold ${cls}`}>{rot}</span>
                                                <span className="font-bold text-gray-900 tabular-nums">{fmtMoeda(par.valor)}</span>
                                                {Number(par.valorPago) > 0 && (
                                                    <span className="text-gray-600 w-full text-right">
                                                        ↳ baixado {fmtMoeda(par.valorPago)} no total{par.formaPagamento ? ` · ${par.formaPagamento}` : ''}{par.dataPagamento ? ` · última baixa em ${fmtDataCampo(par.dataPagamento)}` : ''}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <div className="flex justify-between text-xs font-bold pt-1 text-green-900">
                                        <span>Recebido até agora</span>
                                        <span className="tabular-nums">{fmtMoeda(recebido)} de {fmtMoeda(cr.valorTotal)}</span>
                                    </div>
                                </>);
                            })()}

                            {/* O QUE ACONTECEU NA ENTREGA — separado do título de propósito.
                                Antes tudo isso era anunciado como "Recebido na entrega", inclusive
                                boleto a vencer, bonificação e "Escritório responsável" (que é
                                justamente o marcador de que NINGUÉM pagou). A separação usa a mesma
                                regra do backend — ver `linhaDoTempoPedido.js`.
                                Os RÓTULOS e o RODAPÉ vêm de lá também (ponto único): na rodada 3 o
                                mesmo balde tinha um nome aqui e outro na linha do tempo, e o rodapé
                                cobrava dívida em pedido que não tem conta a receber. */}
                            {entrega.temLinhas && (
                                <div className="pt-2 mt-1 border-t border-green-200 space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-gray-500">Na entrega, o motorista registrou</p>
                                    {/* Esta linha aparece SEMPRE, mesmo zerada: é o contraste com as de baixo
                                        que deixa claro que "registrado na entrega" não é sinônimo de dinheiro.
                                        O rótulo fala do REGISTRO, não de quem ficou com o valor: a popup não
                                        recebe a `debitaCaixa` da condição e não pode afirmar prestação. */}
                                    <div className="flex justify-between gap-2 text-xs">
                                        <span className="text-gray-700">{ROTULO_ENTREGA_CARTAO.recebido}</span>
                                        <span className="font-bold text-green-800 tabular-nums whitespace-nowrap">{fmtMoeda(entrega.recebido)}</span>
                                    </div>
                                    {/* PIX Asaas confirmado pelo banco: cobrança do app, o valor caiu NA CONTA
                                        da empresa. Linha própria porque o caixa também separa esse valor
                                        (backend/routes/caixa.js:496-498). */}
                                    {entrega.asaasConfirmado > 0 && (
                                        <div className="flex justify-between gap-2 text-xs">
                                            <span className="text-gray-700">{ROTULO_ENTREGA_CARTAO.asaas}</span>
                                            <span className="font-bold text-green-800 tabular-nums whitespace-nowrap">{fmtMoeda(entrega.asaasConfirmado)}</span>
                                        </div>
                                    )}
                                    {entrega.aCobrar > 0 && (
                                        <div className="flex justify-between gap-2 text-xs">
                                            <span className="text-red-700">
                                                {ROTULO_ENTREGA_CARTAO.a_cobrar}
                                                {entrega.responsaveis.length > 0 ? ` (${entrega.responsaveis.map(r => r.rotulo).join(', ')})` : ''}
                                            </span>
                                            <span className="font-bold text-red-700 tabular-nums whitespace-nowrap">{fmtMoeda(entrega.aCobrar)}</span>
                                        </div>
                                    )}
                                    {entrega.combinado > 0 && (
                                        <div className="flex justify-between gap-2 text-xs">
                                            {/* `rotuloCombinado` vem do ponto único: quando TODO o valor deste
                                                balde veio de linha sem forma registrada, o rótulo para de afirmar
                                                "sem dinheiro na hora" (o app não sabe) e usa o 5º rótulo. */}
                                            <span className="text-gray-700">
                                                {entrega.rotuloCombinado}
                                                {entrega.formasCombinadas.length > 0 ? ` (${entrega.formasCombinadas.map(f => f.nome).join(', ')})` : ''}
                                            </span>
                                            <span className="font-bold text-gray-700 tabular-nums whitespace-nowrap">{fmtMoeda(entrega.combinado)}</span>
                                        </div>
                                    )}
                                    {/* O rodapé descreve SÓ o que está na tela e SÓ o que o payload prova —
                                        montado no ponto único (`textoRodapeEntrega`). */}
                                    <p className="text-[11px] text-gray-500 leading-relaxed">
                                        {textoRodapeEntrega(p, entrega)}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Nota fiscal */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <FileText className="h-4 w-4 text-blue-600" />
                                <CabecalhoSecao>Nota fiscal</CabecalhoSecao>
                            </div>
                            <div className="p-4 space-y-2 text-xs">
                                {(p.notasFiscaisApp || []).map(n => (
                                    <div key={n.id} className="flex items-center justify-between gap-2 flex-wrap border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                        <span className="text-gray-700">
                                            {n.tipo === 'DEVOLUCAO' ? 'NF-e de devolução' : 'NF-e de venda'}
                                            {n.numero != null ? <> nº <b>{n.numero}</b></> : null}
                                            {n.serie != null ? ` · série ${n.serie}` : ''}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full font-semibold ${n.status === 'AUTORIZADO' ? 'bg-green-100 text-green-800'
                                            : n.status === 'PROCESSANDO' ? 'bg-yellow-100 text-yellow-800'
                                                : n.status === 'CANCELADO' ? 'bg-gray-100 text-gray-700'
                                                    : 'bg-red-100 text-red-700'}`}>
                                            {ROTULO_NFE[n.status] || n.status}
                                        </span>
                                    </div>
                                ))}
                                {p.nfeChave && (
                                    <div className="space-y-0.5">
                                        <p className="text-gray-700">
                                            NF-e emitida no Conta Azul{p.nfeNumero != null ? <> — nº <b>{p.nfeNumero}</b></> : null}
                                        </p>
                                        <p className="text-[11px] text-gray-500 break-all">Chave: {p.nfeChave}</p>
                                        <p className="text-[11px] text-gray-500">O app não guarda a data de emissão dessa nota, por isso ela não aparece na linha do tempo.</p>
                                    </div>
                                )}
                                {(p.notasFiscaisApp || []).length === 0 && !p.nfeChave && (
                                    <p className="text-gray-600">Este pedido ainda não tem nota fiscal.</p>
                                )}
                            </div>
                        </div>

                        {/* Entrega */}
                        <div className="bg-sky-50/60 p-3 rounded-lg border border-sky-200 space-y-1 text-xs">
                            <CabecalhoSecao icone={Truck} className="text-sky-700">Entrega</CabecalhoSecao>
                            {(!p.embarque && (!p.statusEntrega || p.statusEntrega === 'PENDENTE')) ? (
                                <p className="text-gray-600">Ainda não saiu em carga.</p>
                            ) : (<>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {p.statusEntrega && p.statusEntrega !== 'PENDENTE' && (
                                        <span className={`px-2 py-0.5 rounded-full font-semibold ${p.statusEntrega === 'ENTREGUE' ? 'bg-green-100 text-green-800'
                                            : p.statusEntrega === 'ENTREGUE_PARCIAL' ? 'bg-amber-100 text-amber-700'
                                                : 'bg-red-100 text-red-700'}`}>
                                            {p.statusEntrega === 'ENTREGUE' ? 'Entregue' : p.statusEntrega === 'ENTREGUE_PARCIAL' ? 'Entregue parcial' : 'Devolvido'}
                                        </span>
                                    )}
                                    {p.dataEntrega && <span className="font-bold text-gray-900">{fmtDataHora(p.dataEntrega)}</span>}
                                    {!p.dataEntrega && p.statusEntrega === 'PENDENTE' && <span className="text-gray-600">Entrega pendente</span>}
                                </div>
                                {p.embarque && (
                                    <p className="text-gray-700">
                                        Carga Emb. <b>#{p.embarque.numero}</b>
                                        {p.embarque.responsavel?.nome ? <> · motorista <b>{p.embarque.responsavel.nome}</b></> : null}
                                        {/* `fmtDataOuHoraCampo` é o MESMO texto que a linha do tempo escreve
                                            (`textoDataDoEvento`): quando a saída tem hora de verdade — 8 dos 81
                                            embarques da base —, os dois mostram a hora; quando é só data, os
                                            dois mostram o mesmo dia. Com `fmtDataCampo` aqui e o dia em UTC lá,
                                            o mesmo campo podia sair com dias diferentes na mesma popup. */}
                                        {p.embarque.dataSaida ? ` · saiu em ${fmtDataOuHoraCampo(p.embarque.dataSaida)}` : ''}
                                    </p>
                                )}
                                {p.gpsEntrega && (
                                    <button
                                        type="button"
                                        onClick={() => abrirLinkExterno(`https://www.google.com/maps?q=${encodeURIComponent(p.gpsEntrega)}`)}
                                        className="inline-flex items-center gap-1 min-h-[44px] text-blue-600 font-semibold hover:underline"
                                    >
                                        <MapPin className="h-3.5 w-3.5" /> Ver no mapa onde foi entregue
                                    </button>
                                )}
                                {p.observacaoEntrega && <p className="text-gray-600 italic">Obs. do motorista: “{p.observacaoEntrega}”</p>}
                                {p.motivoDevolucao && <p className="text-red-600">Motivo da devolução: {p.motivoDevolucao}</p>}
                            </>)}
                        </div>

                        {/* Devoluções */}
                        {(p.devolucoes || []).length > 0 && (
                            <div className="bg-red-50 p-3 rounded-lg border border-red-200 space-y-2">
                                <CabecalhoSecao className="text-red-700">Devoluções</CabecalhoSecao>
                                {p.devolucoes.map(dev => (
                                    <div key={dev.id} className="text-sm space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">DEV#{dev.numero}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${dev.tipo === 'CONTA_AZUL' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-700'}`}>
                                                {dev.tipo === 'CONTA_AZUL' ? 'CA' : 'ESPECIAL'}
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-700">{dev.escopo}</span>
                                            {dev.status === 'REVERTIDA' && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-700">REVERTIDA</span>
                                            )}
                                            <span className="text-sm font-bold text-red-700 tabular-nums">{fmtMoeda(dev.valorTotal)}</span>
                                        </div>
                                        {(dev.itens || []).map((item, i) => (
                                            <div key={i} className="flex justify-between gap-2 text-xs text-red-800 py-0.5 pl-2">
                                                <span>{item.produto?.nome || 'Produto'}</span>
                                                <span className="tabular-nums whitespace-nowrap">
                                                    {Number(item.quantidade)} × {fmtMoeda(item.valorUnitario)} = <b>{fmtMoeda(Number(item.quantidade) * Number(item.valorUnitario))}</b>
                                                </span>
                                            </div>
                                        ))}
                                        <p className="text-xs text-gray-700"><span className="font-semibold">Motivo:</span> {dev.motivo}</p>
                                        {dev.notaDevolucaoCA && <p className="text-xs text-blue-700">Nota de devolução: {dev.notaDevolucaoCA}</p>}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Linha do tempo */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                <Clock className="h-4 w-4 text-blue-600" />
                                <CabecalhoSecao>Tudo o que aconteceu com este pedido</CabecalhoSecao>
                            </div>
                            <div className="p-4">
                                {linhaDoTempo.length === 0 ? (
                                    <p className="text-sm text-gray-600">Nada registrado até agora além da criação do pedido.</p>
                                ) : (
                                    <ol className="relative border-l-2 border-gray-200 ml-1.5 space-y-2.5">
                                        {linhaDoTempo.map((e, i) => (
                                            <li key={i} className="pl-3 relative">
                                                <span className={`absolute -left-[5px] top-1.5 h-2 w-2 rounded-full ${e.cor === 'ouro' ? 'bg-[#cba258]'
                                                    : e.cor === 'vermelho' ? 'bg-red-500'
                                                        : e.cor === 'azul' ? 'bg-sky-500'
                                                            : 'bg-primary'}`} />
                                                <p className="text-xs font-bold text-gray-900">{e.titulo}</p>
                                                {/* Evento cujo campo só tem DATA sai sem hora — o app não sabe a hora,
                                                    e escrever "12:00" ou "21:00" era inventar. */}
                                                <p className="text-[11px] text-gray-500">
                                                    {textoDataDoEvento(e)}{e.soData ? ' · sem hora registrada' : ''}{e.sub ? ` · ${e.sub}` : ''}
                                                </p>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                                {avisosLinhaDoTempo.map((aviso, i) => (
                                    <p key={i} className="mt-3 text-[11px] text-gray-500 leading-relaxed">{aviso}</p>
                                ))}
                            </div>
                        </div>

                        {/* Atendimentos ligados a este pedido */}
                        {atendimentosDoPedido.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                                    <ClipboardList className="h-4 w-4 text-blue-600" />
                                    <CabecalhoSecao>Atendimentos deste pedido</CabecalhoSecao>
                                </div>
                                <div className="p-4 space-y-2">
                                    {atendimentosDoPedido.map(a => (
                                        <div key={a.id} className="text-xs border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                                            <p className="font-semibold text-gray-900">{a.acaoLabel || a.tipo}</p>
                                            <p className="text-gray-500">{fmtDataHora(a.criadoEm)}{a.vendedor?.nome ? ` · ${a.vendedor.nome}` : ''}</p>
                                            {a.observacao && <p className="text-gray-600 mt-0.5 whitespace-pre-wrap">{a.observacao}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>)}
                </div>

                {/* Rodapé — total + fechar. NENHUMA ação sobre o pedido, de propósito. */}
                <div className="p-3 sm:p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-2 rounded-b-none sm:rounded-b-2xl">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase font-bold text-gray-500 leading-none">Total geral</p>
                        <p className="text-xl sm:text-2xl font-black text-primary whitespace-nowrap tabular-nums">
                            {p ? fmtMoeda(totalGeral) : '—'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 min-h-[44px] bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-semibold text-sm shrink-0"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ModalPedidoConsulta;
