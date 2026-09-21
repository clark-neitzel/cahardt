import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HandCoins, X, CheckCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import pedidoService from '../services/pedidoService';

// ─────────────────────────────────────────────────────────────────────────────
// PAGAMENTO QUE CAIU EM PEDIDO JÁ QUITADO — aviso para o ADMIN.
//
// O QUE ACONTECEU (por que este aviso existe)
// O QR Code de PIX gerado na entrega continuava vivo no Asaas depois de o pedido ser
// pago por outra forma e o título quitado no Caixa. O cliente podia escanear aquele QR
// meses depois e pagar de novo — por até 12 meses. O backend passou a cancelar o QR
// quando o Caixa fecha o título; este popup é a rede de segurança para quando MESMO
// ASSIM cair dinheiro num pedido já quitado: alguém precisa DEVOLVER esse dinheiro, e
// ninguém descobre isso sozinho olhando o extrato.
//
// RECEITA: é a mesma família `Alerta*` do App.jsx (AlertaPedidoConvertido = 5 min,
// AlertaFaturamento = 10 min, AlertaDevolucaoRefItem = 10 min). Polling a cada 5 min,
// insiste até alguém dar "Ciente".
//
// DIFERENÇAS PEDIDAS PELO DONO:
//  1. SEM BIP. O de conversão toca porque é fila de trabalho. Este é aviso de dinheiro
//     a devolver — não é para assustar, é para não passar batido.
//  2. SÓ PARA ADMIN (`permissoes.admin`). O backend TAMBÉM filtra; o gate daqui é para
//     não bater na rota com quem nunca vai receber resposta. Não existe coluna nova em
//     `Vendedor` nem entrada no BOOL_INDEX — de propósito.
//  3. O texto diz o que a PESSOA FAZ, não o que o sistema fez.
//
// ─── CONTRATO COM O BACKEND ──────────────────────────────────────────────────
// Estado em 03/09/2026, conferido NO CÓDIGO (não presumido):
//
//  ✅ A TABELA EXISTE — `model PagamentoAposQuitacaoAviso` (schema.prisma:4279,
//     @@map("pagamentos_apos_quitacao_avisos")). Colunas conferidas uma a uma:
//        id, cobrancaAsaasId (@unique), pedidoId, numeroPedido Int?, valor Decimal(12,2),
//        especialNaHora Boolean, cienteEm DateTime?, cientePorId String?, createdAt
//     Quem grava: `asaasService.js` (~linha 443), quando cai dinheiro num pedido cujo
//     `contaReceber.status === 'QUITADO'`. Grava ANTES da conversão do especial, de
//     propósito, para guardar o estado real da hora.
//
//  ✅ Conferido em 21/09/2026: rotas publicadas em pedidoRoutes.js / pedidoController.js,
//     contrato batido.
//
// GET  /api/pedidos/avisos-pagamento-apos-quitacao
//      → 200 { avisos: [ {
//            id: string,                  // id do aviso (é o que volta no POST de ciente)
//            pedidoId: string,
//            numeroPedido: number|null,   // coluna real
//            cliente: string,             // derivado (pedido.cliente.NomeFantasia || .Nome)
//            valor: number|string,        // Decimal do Prisma pode chegar como STRING
//            especialNaHora: boolean,     // coluna real
//            criadoEm: string             // = createdAt (ISO)
//        } ] }
//      → quem não é admin recebe { avisos: [] } (igual `avisosConvertidos` faz quando a
//        chave do vendedor está desligada), nunca 403.
//
// POST /api/pedidos/avisos-pagamento-apos-quitacao/:avisoId/ciente  → 200 { ok: true }
//      (grava cienteEm + cientePorId, igual `avisoConvertidoCiente`)
//
// Enquanto a rota não existir, `normalizar()` abaixo aceita os apelidos plausíveis de
// cada campo (`valorPago`/`valorRecebido`, `numero`, o objeto `pedido` aninhado, a data
// em `pagoEm`/`createdAt`…) e converte `valor` com `Number()` — que também resolve o
// Decimal-como-string. Isso NÃO substitui a conferência: só garante que, se o backend
// vier com um nome vizinho, o aviso apareça com o dado certo em vez de sumir ou
// escrever "undefined" na tela do dono.
// ─────────────────────────────────────────────────────────────────────────────

const INTERVALO_MS = 5 * 60 * 1000; // 5 minutos, igual ao AlertaPedidoConvertido
const DELAY_INICIAL_MS = 9000;      // 9s: entra depois dos outros avisos, sem disputar a abertura

const fmtMoeda = (v) => (v == null || Number.isNaN(Number(v)))
    ? null
    : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDataHora = (d) => {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
};

const primeiroDefinido = (...vs) => vs.find(v => v != null && v !== '') ?? null;

// Aceita o contrato combinado E os apelidos vizinhos — ver bloco CONTRATO acima.
const normalizar = (a) => {
    const numero = primeiroDefinido(a?.numeroPedido, a?.numero, a?.pedido?.numero);
    const valorCru = primeiroDefinido(a?.valor, a?.valorPago, a?.valorRecebido);
    return {
        id: a?.id ?? null,
        numero,
        cliente: primeiroDefinido(
            a?.cliente,
            a?.pedido?.cliente?.NomeFantasia,
            a?.pedido?.cliente?.Nome,
        ),
        valor: valorCru != null && !Number.isNaN(Number(valorCru)) ? Number(valorCru) : null,
        forma: primeiroDefinido(a?.formaPagamento, a?.tipo, a?.tipoCobranca),
        quando: primeiroDefinido(a?.pagoEm, a?.recebidoEm, a?.criadoEm, a?.createdAt),
        // `especialNaHora` existe na tabela (schema.prisma:4286): o pedido era ESPECIAL
        // quando o dinheiro entrou. Importa para quem vai devolver — a regra do dono é que
        // PIX em especial converte o pedido assim mesmo, então pode haver NF-e no meio.
        especial: a?.especialNaHora === true || a?.especial === true,
    };
};

const AlertaPagamentoAposQuitacao = () => {
    const { user } = useAuth();
    const [avisos, setAvisos] = useState([]);
    const [visivel, setVisivel] = useState(false);
    const [marcando, setMarcando] = useState(false);
    const dispensadoRef = useRef(false);
    const erroLogadoRef = useRef(null);   // não floodar o console a cada 5 min com o mesmo erro

    // `permissoes.admin` é o MESMO gate do App.jsx (`isAdmin`, linha ~341) — booleano de
    // verdade, não objeto {view,edit}. Não trocar por `hasPermission(...)`, que devolve
    // true para admin mas também para quem tiver a aba, e a aba aqui não existe.
    const souAdmin = !!user?.permissoes?.admin;

    const verificar = useCallback(async () => {
        try {
            const data = await pedidoService.avisosPagamentoAposQuitacao();
            // Tolera { avisos: [...] } e uma lista crua, sem quebrar se vier vazio/nulo.
            const brutos = Array.isArray(data?.avisos) ? data.avisos : (Array.isArray(data) ? data : []);
            const lista = brutos.map(normalizar).filter(a => a.id);
            erroLogadoRef.current = null;
            if (lista.length > 0) {
                setAvisos(lista);
                if (!dispensadoRef.current) setVisivel(true);   // sem bip, de propósito
            } else {
                setAvisos([]);
                setVisivel(false);
            }
        } catch (error) {
            // Nada na tela do usuário (backend ainda não publicado não é problema dele),
            // mas NUNCA em silêncio no console: se o aviso sumir, tem que dar para achar
            // o motivo aqui. Um log por motivo, não um a cada 5 minutos.
            const status = error?.response?.status;
            const motivo = status === 404
                ? 'a rota GET /pedidos/avisos-pagamento-apos-quitacao não existe neste servidor (backend ainda não publicado?)'
                : status
                    ? `o servidor respondeu HTTP ${status}`
                    : `falha de rede (${error?.message || 'sem detalhe'})`;
            if (erroLogadoRef.current !== motivo) {
                erroLogadoRef.current = motivo;
                console.warn(`[AlertaPagamentoAposQuitacao] aviso NÃO verificado: ${motivo}. Tenta de novo em 5 min.`);
            }
        }
    }, []);

    useEffect(() => {
        if (!souAdmin) return undefined;
        const timer = setTimeout(() => verificar(), DELAY_INICIAL_MS);
        const interval = setInterval(() => {
            dispensadoRef.current = false;   // volta a insistir
            verificar();
        }, INTERVALO_MS);
        return () => { clearTimeout(timer); clearInterval(interval); };
    }, [souAdmin, verificar]);

    const handleLembrar = () => {
        dispensadoRef.current = true;
        setVisivel(false);
    };

    const handleCiente = async () => {
        setMarcando(true);
        try {
            // Um POST por aviso, igual ao AlertaPedidoConvertido. `allSettled` para que um
            // aviso que falhe não impeça os outros de serem marcados.
            const rs = await Promise.allSettled(
                avisos.map(a => pedidoService.avisoPagamentoAposQuitacaoCiente(a.id))
            );
            const falhas = rs.filter(r => r.status === 'rejected');
            if (falhas.length > 0) {
                console.error('[AlertaPagamentoAposQuitacao] falha ao dar ciência:', falhas.map(f => f.reason));
                // Falhar calado faria o popup voltar em 5 min sem explicação nenhuma.
                toast.error(
                    falhas.length === rs.length
                        ? 'Não consegui registrar a ciência. O aviso volta em 5 minutos.'
                        : `${falhas.length} de ${rs.length} avisos não foram registrados. Eles voltam em 5 minutos.`
                );
            }
            setAvisos([]);
            setVisivel(false);
        } finally {
            setMarcando(false);
        }
    };

    if (!souAdmin || !visivel || avisos.length === 0) return null;

    const varios = avisos.length > 1;

    return (
        // z-[9998]: mesmo degrau dos avisos operacionais de apoio (comissão, pedidos não
        // enviados). Abaixo dos bloqueantes (9999) e acima do lembrete de configuração (9990).
        <div className="no-print fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm p-3">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
                {/* Header */}
                <div className="bg-amber-600 px-4 md:px-5 py-3.5 flex items-start justify-between gap-2 shrink-0">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="bg-white/20 rounded-full p-2 shrink-0">
                            <HandCoins className="h-5 w-5 md:h-6 md:w-6 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-white font-bold text-base md:text-lg leading-tight break-words">
                                Dinheiro a devolver ao cliente
                            </h2>
                            <p className="text-amber-50 text-xs md:text-sm leading-snug break-words">
                                {varios
                                    ? `${avisos.length} pagamentos caíram em pedidos que já estavam quitados`
                                    : 'Um pagamento caiu num pedido que já estava quitado'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleLembrar}
                        aria-label="Fechar o aviso"
                        className="text-white/80 hover:text-white transition-colors shrink-0 p-2 -m-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-4 md:px-5 py-4 overflow-y-auto space-y-3">
                    <div className="space-y-2">
                        {avisos.map(a => {
                            const valor = fmtMoeda(a.valor);
                            const quando = fmtDataHora(a.quando);
                            // Cada pedaço é guardado ANTES de entrar na frase: campo que
                            // chega null não pode virar "undefined" na tela do dono.
                            const detalhe = [a.cliente, a.forma, quando].filter(Boolean).join(' · ');
                            return (
                                <div key={a.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                                    <p className="text-sm font-semibold text-gray-800 break-words">
                                        {valor ? <>Caiu <span className="text-amber-700 font-bold">{valor}</span></> : 'Caiu um pagamento'}
                                        {' no pedido '}
                                        <span className="font-bold">#{a.numero ?? '—'}</span>, que já estava quitado.
                                    </p>
                                    {detalhe && (
                                        <p className="text-xs text-gray-600 mt-0.5 break-words">{detalhe}</p>
                                    )}
                                    {a.especial && (
                                        <p className="text-xs text-purple-700 mt-1 break-words">
                                            Era pedido especial quando o dinheiro entrou — confira se virou nota fiscal.
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-sm text-gray-600 leading-snug break-words">
                        {varios ? 'Provavelmente é dinheiro a devolver aos clientes.' : 'Provavelmente é dinheiro a devolver ao cliente.'}
                        {' '}Confira {varios ? 'os pedidos' : 'o pedido'} em Contas a Receber, veja se a cobrança foi paga duas vezes
                        e combine a devolução com {varios ? 'os clientes' : 'o cliente'}.
                    </p>
                </div>

                {/* Footer — no mobile os botões empilham (o principal fica em cima do polegar) */}
                <div className="px-4 md:px-5 py-3 bg-gray-50 border-t border-gray-200 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-2 shrink-0">
                    <button
                        onClick={handleLembrar}
                        className="px-4 py-3 md:py-2 min-h-[44px] text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors rounded-full"
                    >
                        Lembrar depois
                    </button>
                    <button
                        onClick={handleCiente}
                        disabled={marcando}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 md:py-2 min-h-[44px] bg-primary hover:bg-primaryDark text-white text-sm font-semibold rounded-full shadow-sm transition-colors disabled:opacity-60"
                    >
                        {marcando
                            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                            : <CheckCircle className="h-4 w-4 shrink-0" />}
                        Ciente, vou tratar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaPagamentoAposQuitacao;
