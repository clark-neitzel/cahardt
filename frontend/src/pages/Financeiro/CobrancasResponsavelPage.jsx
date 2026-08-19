import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    UserCheck, Printer, RefreshCw, ChevronDown, ChevronUp, Loader2, AlertTriangle, ExternalLink
} from 'lucide-react';
import contasReceberService from '../../services/contasReceberService';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import { useFiltroSalvo } from '../../hooks/useFiltrosSalvos';
import { imprimirNaPagina, escaparHtml } from '../../utils/imprimirNaPagina';
import { CLASSE_PAPEL, ROTULO_PAPEL_CURTO } from '../../utils/responsavelCobranca';

// ── Helpers ──
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const hojeExtenso = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// Resposta de GET /contas-receber/por-responsavel (nomes CANÔNICOS — um número, um nome):
//   { periodo: { de, ate },
//     responsaveis: [{ tipo, pessoaId, pessoaNome, quantidadeTitulos, valorTotal, valorMarcado,
//                      maisAntigo: { dataVencimento, diasAtraso, clienteNome, pedidoNumero, valor },
//                      titulos: [{ contaId, parcelaId, numeroParcela, statusParcela, clienteId,
//                                  clienteNome, pedidoId, pedidoNumero, pedidoEspecial, dataVenda,
//                                  lancadoPor, valor, valorMarcado, compartilhado,
//                                  dataVencimento, diasAtraso }] }],
//     totais: { pessoas, titulos, valorTotal, maisAntigo } }
//
// `valor`        = saldo em aberto HOJE (é o que o dono vai cobrar — o número principal).
// `valorMarcado` = o que foi anotado na entrega. Divergem quando houve baixa parcial ou
//                  devolução; quando divergem, os dois aparecem na tela.
const listaDeGrupos = (dados) => dados?.responsaveis || [];

// Chave de agrupamento: tipo + pessoa (o escritório é um balde só, sem pessoaId).
const chaveGrupo = (g) => `${g?.tipo || 'X'}:${g?.pessoaId || ''}`;

const dataMaisAntigo = (g) => g?.maisAntigo?.dataVencimento || null;

// ── BAIXA PARCIAL — por que este aviso existe ────────────────────────────────
// O registro de pagamento NÃO guarda DE QUEM era a dívida. Então, quando um
// título já recebeu baixa parcial, o relatório não tem como saber se quem pagou
// foi justamente a pessoa que aparece na linha. Dois casos reais:
//   1) o vendedor deposita a parte dele ANTES da conferência do Caixa: o saldo
//      cai, mas continua >= o que ele marcou, e o vale sai com o valor dele
//      DE NOVO;
//   2) título dividido (vendedor + escritório) em que um dos dois já quitou:
//      o rateio proporcional devolve os dois com metade cada, cobrando quem
//      já pagou.
// Nenhuma regra de rateio resolve — é limitação do dado. Por isso a linha é
// MARCADA para o operador conferir antes de descontar de alguém.
// Detecção: `statusParcela === 'PARCIAL'` é o sinal direto (o backend só calcula
// saldo menor que o valor cheio nesse status). A segunda condição é rede de
// segurança: a fatia devida ficou MENOR que o valor assumido, o que só acontece
// quando o saldo do título já caiu (alguém pagou / houve devolução).
const AVISO_PARCIAL = 'este título teve baixa parcial — confira a quem pertence antes de descontar';
const temBaixaParcial = (t) => {
    if (String(t?.statusParcela || '').toUpperCase() === 'PARCIAL') return true;
    const devido = Number(t?.valor || 0);
    const marcado = Number(t?.valorMarcado || 0);
    return marcado > 0 && devido < marcado - 0.005;
};
const qtdBaixaParcial = (g) => (g?.titulos || []).filter(temBaixaParcial).length;

// Rótulo do grupo. São TRÊS baldes desde 08/2026 — e a MESMA pessoa pode aparecer duas
// vezes (como vendedor e como motorista), com dívidas diferentes. Por isso o papel entra
// no texto e na cor; sem isso o dono via dois grupos com o mesmo nome e sem saber qual
// era qual. (`chaveGrupo` já separava tipo+pessoa: só o rótulo estava mentindo.)
const rotuloTipo = (tipo) => ROTULO_PAPEL_CURTO[tipo] || 'Responsável';

const BadgeTipo = ({ tipo }) => (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${CLASSE_PAPEL[tipo] || 'bg-gray-100 text-gray-700'}`}>
        {rotuloTipo(tipo)}
    </span>
);

const Kpi = ({ titulo, valor, cor = 'text-gray-900' }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 md:p-4">
        <div className="text-xs text-gray-500 mb-1">{titulo}</div>
        <div className={`text-lg font-bold ${cor}`}>{valor}</div>
    </div>
);

const CobrancasResponsavelPage = () => {
    const [dados, setDados] = useState(null);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState(null);
    const [abertos, setAbertos] = useState({});   // chave do grupo -> expandido?

    // Período do relatório (padrão do sistema). 'todo' de propósito: no fechamento do
    // dia 01 o dono quer TUDO que está em aberto — recorte de data esconde dívida velha.
    const [periodo, periodoCtl] = usePeriodoSalvo('cobrancas-responsavel', 'todo');
    const [ordem, setOrdem] = useFiltroSalvo('cobrancas-responsavel:ordem', 'valor'); // valor | nome | antigo

    const carregar = useCallback(async () => {
        setLoading(true);
        setErro(null);
        try {
            const params = {};
            if (periodo.de) params.de = periodo.de;
            if (periodo.ate) params.ate = periodo.ate;
            const resp = await contasReceberService.porResponsavel(params);
            setDados(resp);
        } catch (e) {
            const msg = e.response?.data?.error || 'Não foi possível carregar o relatório.';
            setErro(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, [periodo.de, periodo.ate]);

    useEffect(() => { carregar(); }, [carregar]);

    const grupos = useMemo(() => {
        const copia = [...listaDeGrupos(dados)];
        if (ordem === 'nome') copia.sort((a, b) => String(a.pessoaNome || '').localeCompare(String(b.pessoaNome || ''), 'pt-BR'));
        else if (ordem === 'antigo') copia.sort((a, b) => String(dataMaisAntigo(a) || '9999').localeCompare(String(dataMaisAntigo(b) || '9999')));
        else copia.sort((a, b) => Number(b.valorTotal || 0) - Number(a.valorTotal || 0));
        return copia;
    }, [dados, ordem]);

    // Totais vêm prontos do servidor — é ele que faz o rateio do título compartilhado e
    // conta os títulos DISTINTOS (parcela dividida entre duas pessoas é um título só).
    // A tela nunca recalcula esses números.
    const totais = dados?.totais || { pessoas: 0, titulos: 0, valorTotal: 0, maisAntigo: null };
    // Rótulo do total: quem manda é o servidor (`rotulos.total`), para tela e folha
    // dizerem a mesma coisa. O texto abaixo é só a rede de segurança.
    const rotuloTotal = dados?.rotulos?.total || 'Saldo em aberto hoje';

    const toggle = (chave) => setAbertos(a => ({ ...a, [chave]: !a[chave] }));
    const expandirTodos = () => setAbertos(Object.fromEntries(grupos.map(g => [chaveGrupo(g), true])));
    const recolherTodos = () => setAbertos({});

    // ── Impressão (na própria página — nunca window.open/iframe: iPad) ──
    const imprimir = () => {
        if (!grupos.length) { toast.error('Nada para imprimir.'); return; }
        const periodoTxt = periodo.de || periodo.ate
            ? `Vencimento de ${periodo.de ? fmtData(`${periodo.de}T12:00:00`) : '—'} a ${periodo.ate ? fmtData(`${periodo.ate}T12:00:00`) : '—'}`
            : 'Todo o período';

        const estilos = `
            @page { size: A4 portrait; margin: 12mm; }
            * { box-sizing: border-box; }
            body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111; font-size: 11px; }
            h1 { font-size: 16px; margin: 0 0 2px; }
            .sub { font-size: 10px; color: #555; margin-bottom: 10px; }
            .totais { border: 1px solid #999; padding: 6px 8px; margin-bottom: 12px; font-size: 11px; }
            .grupo { margin-bottom: 14px; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
            .gcab { background: #111; color: #fff; padding: 5px 8px; font-weight: bold; font-size: 12px;
                    display: flex; justify-content: space-between; }
            .ginfo { font-size: 10px; color: #444; padding: 3px 8px; border-left: 1px solid #999;
                     border-right: 1px solid #999; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #eee; text-align: left; font-size: 10px; padding: 4px 6px; border: 1px solid #999; }
            td { padding: 4px 6px; border: 1px solid #ccc; font-size: 10px; }
            .num { text-align: right; font-variant-numeric: tabular-nums; }
            .atraso { color: #b00; font-weight: bold; }
            .marcado { font-size: 8px; color: #666; font-weight: normal; }
            .nota { font-size: 9px; color: #555; font-weight: normal; margin-top: 3px; }
            /* Baixa parcial: precisa sobreviver em preto e branco — marcador de texto
               em negrito + fundo cinza (o fundo é reforço, nunca a única pista). */
            tr.parcial td { background: #ececec; }
            .marca-parcial { font-weight: bold; white-space: nowrap; }
            .rodape-aviso { font-size: 9px; color: #222; padding: 3px 8px; border: 1px solid #999;
                            border-top: none; font-weight: bold; }
            .assin { margin-top: 8px; font-size: 10px; }
            .linha-assin { border-top: 1px solid #111; width: 60mm; margin-top: 16px; padding-top: 2px; }
        `;

        const corpo = `
            <h1>Cobranças sob responsabilidade</h1>
            <div class="sub">${escaparHtml(periodoTxt)} · emitido em ${escaparHtml(hojeExtenso())}</div>
            <div class="totais">
                <strong>${totais.pessoas}</strong> responsável(is) ·
                <strong>${totais.titulos}</strong> título(s) ·
                ${escaparHtml(rotuloTotal.toLowerCase())} <strong>R$ ${fmt(totais.valorTotal)}</strong>
                <div class="nota">Saldo em aberto hoje = o que ainda falta receber de cada título (já sem baixa
                parcial e devolução). Pode ficar menor que o &ldquo;Total em aberto&rdquo; de Contas a Receber,
                que soma o valor cheio das parcelas.</div>
            </div>
            ${grupos.map(g => `
                <div class="grupo">
                    <div class="gcab">
                        <span>${escaparHtml(g.pessoaNome)} (${escaparHtml(rotuloTipo(g.tipo))})</span>
                        <span>R$ ${fmt(g.valorTotal)}</span>
                    </div>
                    <div class="ginfo">
                        ${g.quantidadeTitulos} título(s)${dataMaisAntigo(g) ? ` · mais antigo: ${escaparHtml(fmtData(dataMaisAntigo(g)))}` : ''}${Number(g.valorMarcado || 0) !== Number(g.valorTotal || 0) ? ` · anotado na entrega: R$ ${fmt(g.valorMarcado)}` : ''}${qtdBaixaParcial(g) > 0 ? ` · <strong>${qtdBaixaParcial(g)} título(s) com baixa parcial — conferir</strong>` : ''}
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Cliente</th><th>Pedido</th><th>Vencimento</th>
                                ${g.tipo === 'ESCRITORIO' ? '<th>Lançado por</th>' : ''}
                                <th class="num">Atraso</th><th class="num">Saldo hoje</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${g.titulos.map(t => `
                                <tr class="${temBaixaParcial(t) ? 'parcial' : ''}">
                                    <td>${escaparHtml(t.clienteNome)}${temBaixaParcial(t) ? ' <span class="marca-parcial">‡ BAIXA PARCIAL</span>' : ''}</td>
                                    <td>${escaparHtml(t.pedidoNumero ?? '—')}</td>
                                    <td>${escaparHtml(fmtData(t.dataVencimento))}</td>
                                    ${g.tipo === 'ESCRITORIO' ? `<td>${escaparHtml(t.lancadoPor || '—')}</td>` : ''}
                                    <td class="num ${t.diasAtraso > 0 ? 'atraso' : ''}">${t.diasAtraso > 0 ? `${t.diasAtraso}d` : '—'}</td>
                                    <td class="num">${fmt(t.valor)}${t.compartilhado ? ' *' : ''}${Number(t.valorMarcado || 0) !== Number(t.valor || 0) ? `<div class="marcado">anotado: ${fmt(t.valorMarcado)}</div>` : ''}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${g.titulos.some(t => t.compartilhado) ? '<div class="ginfo">* valor é a parte desta pessoa num título dividido com outro responsável.</div>' : ''}
                    ${qtdBaixaParcial(g) > 0 ? `<div class="rodape-aviso">‡ ${escaparHtml(AVISO_PARCIAL)}. O sistema não registra de quem era a dívida na baixa parcial — pode ser que esta pessoa já tenha pago.</div>` : ''}
                    <div class="assin">
                        <div class="linha-assin">Ciente / assinatura</div>
                    </div>
                </div>
            `).join('')}
        `;
        imprimirNaPagina(estilos, corpo);
    };

    return (
        <div className="p-3 md:p-6 w-full max-w-full overflow-x-hidden">
            {/* Topbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg shrink-0">
                        <UserCheck className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base md:text-2xl font-bold text-gray-900 truncate">Cobranças sob responsabilidade</h1>
                        <p className="text-xs text-gray-500 hidden md:block">
                            Títulos em aberto no nome de cada vendedor ou do escritório — base do fechamento do dia 01.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={carregar}
                        disabled={loading}
                        className="min-h-[44px] md:min-h-0 px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-full font-medium text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
                    </button>
                    <button
                        onClick={imprimir}
                        className="min-h-[44px] md:min-h-0 px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full shadow-sm font-semibold text-sm inline-flex items-center gap-1.5"
                    >
                        <Printer className="w-4 h-4" /> Imprimir
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 p-3 md:p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
                        <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ordenar por</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { id: 'valor', rot: 'Maior valor' },
                                { id: 'antigo', rot: 'Mais antigo' },
                                { id: 'nome', rot: 'Nome' }
                            ].map(o => (
                                <button
                                    key={o.id}
                                    onClick={() => setOrdem(o.id)}
                                    className={`min-h-[44px] md:min-h-0 px-4 py-2 rounded-full text-sm font-medium border ${ordem === o.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                                >
                                    {o.rot}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Indicadores */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Kpi titulo={rotuloTotal} valor={`R$ ${fmt(totais.valorTotal)}`} cor="text-amber-700" />
                <Kpi titulo="Responsáveis" valor={String(totais.pessoas)} />
                <Kpi titulo="Títulos" valor={String(totais.titulos)} />
                <Kpi titulo="Mais antigo" valor={totais.maisAntigo ? fmtData(totais.maisAntigo?.dataVencimento || totais.maisAntigo) : '—'} />
            </div>

            <p className="text-xs text-gray-500 mb-4">
                <strong className="font-semibold text-gray-600">{rotuloTotal}</strong> = o que ainda falta receber
                de cada título, já descontando baixa parcial e devolução. Por isso o número pode ficar
                menor que o &ldquo;Total em aberto&rdquo; de Contas a Receber, que soma o valor cheio das parcelas.
            </p>

            {grupos.length > 0 && (
                <div className="flex justify-end gap-2 mb-2">
                    <button onClick={expandirTodos} className="text-xs font-medium text-primary hover:underline px-3 py-3 min-h-[44px] md:min-h-0 md:py-2">Expandir todos</button>
                    <button onClick={recolherTodos} className="text-xs font-medium text-gray-600 hover:underline px-3 py-3 min-h-[44px] md:min-h-0 md:py-2">Recolher todos</button>
                </div>
            )}

            {/* Conteúdo */}
            {loading && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 flex items-center justify-center text-gray-500 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
                </div>
            )}

            {!loading && erro && (
                <div className="bg-white rounded-xl border border-red-200 shadow-sm p-6 text-center">
                    <AlertTriangle className="w-6 h-6 text-red-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-700 mb-3">{erro}</p>
                    <button onClick={carregar} className="px-4 py-2 bg-primary hover:bg-primaryDark text-white rounded-full font-semibold text-sm">
                        Tentar novamente
                    </button>
                </div>
            )}

            {!loading && !erro && grupos.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-500 text-sm">
                    Nenhum título em aberto sob responsabilidade de alguém neste período.
                </div>
            )}

            {!loading && !erro && grupos.map(g => {
                const aberto = !!abertos[chaveGrupo(g)];
                const antigo = dataMaisAntigo(g);
                return (
                    <div key={chaveGrupo(g)} className="bg-white rounded-xl border border-gray-200 shadow-sm mb-3">
                        <button
                            onClick={() => toggle(chaveGrupo(g))}
                            className="w-full text-left px-3 md:px-5 py-3.5 flex items-start md:items-center justify-between gap-3 min-h-[44px]"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <BadgeTipo tipo={g.tipo} />
                                    <span className="font-semibold text-gray-900 truncate">{g.pessoaNome}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {g.quantidadeTitulos} título(s){antigo ? ` · mais antigo ${fmtData(antigo)}` : ''}
                                </div>
                                {Number(g.valorMarcado || 0) !== Number(g.valorTotal || 0) && (
                                    <div className="text-xs text-gray-500">
                                        Anotado na entrega: R$ {fmt(g.valorMarcado)} — o saldo em aberto hoje é R$ {fmt(g.valorTotal)}
                                    </div>
                                )}
                                {qtdBaixaParcial(g) > 0 && (
                                    <div className="mt-1 inline-flex items-start gap-1 text-xs font-semibold text-amber-700">
                                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                                        <span>{qtdBaixaParcial(g)} título(s) com baixa parcial — conferir antes de descontar</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-base md:text-lg font-bold text-gray-900 tabular-nums">R$ {fmt(g.valorTotal)}</span>
                                {aberto ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                            </div>
                        </button>

                        {aberto && (
                            <div className="border-t border-gray-100">
                                {/* Mobile: cards */}
                                <div className="md:hidden space-y-3 p-3">
                                    {g.titulos.map((t, i) => (
                                        <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <span className="font-semibold text-gray-900 text-sm truncate">{t.clienteNome}</span>
                                                <span className="font-bold tabular-nums text-gray-900 text-sm shrink-0">R$ {fmt(t.valor)}</span>
                                            </div>
                                            <div className="text-xs text-gray-600">
                                                {t.pedidoNumero ? `Pedido ${t.pedidoNumero} · ` : ''}vence {fmtData(t.dataVencimento)}
                                            </div>
                                            {g.tipo === 'ESCRITORIO' && t.lancadoPor && (
                                                <div className="text-xs text-gray-500 mt-0.5">Lançado por {t.lancadoPor}</div>
                                            )}
                                            {Number(t.valorMarcado || 0) !== Number(t.valor || 0) && (
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    Anotado na entrega: R$ {fmt(t.valorMarcado)} — o saldo de hoje é o valor acima
                                                </div>
                                            )}
                                            {t.compartilhado && (
                                                <div className="text-xs text-gray-500 mt-0.5">Valor é a parte desta pessoa no título</div>
                                            )}
                                            {temBaixaParcial(t) && (
                                                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                                                    <span className="text-xs text-amber-800">
                                                        <strong className="font-semibold">Baixa parcial:</strong> {AVISO_PARCIAL.replace('este título teve baixa parcial — ', '')}
                                                    </span>
                                                </div>
                                            )}
                                            {t.diasAtraso > 0 && (
                                                <span className="inline-block mt-2 px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                                                    {t.diasAtraso} dia(s) em atraso
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {g.titulos.length === 0 && (
                                        <div className="text-xs text-gray-500 py-2">Sem detalhamento dos títulos.</div>
                                    )}
                                </div>

                                {/* Desktop: tabela */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pedido</th>
                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimento</th>
                                                {g.tipo === 'ESCRITORIO' && (
                                                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Lançado por</th>
                                                )}
                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Atraso</th>
                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo hoje</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                            {g.titulos.map((t, i) => (
                                                <tr key={i} className="hover:bg-gray-50">
                                                    <td className="px-5 py-3 text-gray-900">
                                                        <span>{t.clienteNome}</span>
                                                        {temBaixaParcial(t) && (
                                                            <span
                                                                title={AVISO_PARCIAL}
                                                                className="ml-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 align-middle"
                                                            >
                                                                <AlertTriangle className="w-3 h-3" /> Baixa parcial
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-gray-700">{t.pedidoNumero ?? '—'}</td>
                                                    <td className="px-5 py-3 text-gray-700">{fmtData(t.dataVencimento)}</td>
                                                    {g.tipo === 'ESCRITORIO' && (
                                                        <td className="px-5 py-3 text-gray-600">{t.lancadoPor || '—'}</td>
                                                    )}
                                                    <td className="px-5 py-3 text-right">
                                                        {t.diasAtraso > 0
                                                            ? <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">{t.diasAtraso}d</span>
                                                            : <span className="text-gray-400">—</span>}
                                                    </td>
                                                    <td className="px-5 py-3 text-right font-semibold text-gray-900 tabular-nums">
                                                        R$ {fmt(t.valor)}
                                                        {Number(t.valorMarcado || 0) !== Number(t.valor || 0) && (
                                                            <div className="text-[10px] font-normal text-gray-500">
                                                                anotado na entrega: R$ {fmt(t.valorMarcado)}
                                                            </div>
                                                        )}
                                                        {t.compartilhado && (
                                                            <div className="text-[10px] font-normal text-gray-500">parte do título</div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {g.titulos.length === 0 && (
                                                <tr><td colSpan={g.tipo === 'ESCRITORIO' ? 6 : 5} className="px-5 py-4 text-center text-gray-500">Sem detalhamento dos títulos.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {qtdBaixaParcial(g) > 0 && (
                                    <div className="hidden md:flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-5 py-3">
                                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                                        <p className="text-xs text-amber-800">
                                            <strong className="font-semibold">Baixa parcial</strong> (linhas marcadas acima): {AVISO_PARCIAL.replace('este título teve baixa parcial — ', '')}.
                                            O sistema não registra de quem era a dívida quando alguém dá baixa parcial —
                                            pode ser que esta pessoa já tenha pago. Não confundir com o
                                            &ldquo;anotado na entrega&rdquo;, que só compara o valor marcado com o saldo de hoje.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            <div className="mt-4">
                <Link to="/financeiro/contas-receber/tabela" className="text-sm text-primary font-medium inline-flex items-center gap-1 hover:underline">
                    Ver em Contas a Receber <ExternalLink className="w-3.5 h-3.5" />
                </Link>
            </div>
        </div>
    );
};

export default CobrancasResponsavelPage;
