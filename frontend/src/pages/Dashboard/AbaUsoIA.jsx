import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, AlertTriangle, RefreshCw, Repeat, CalendarDays, Users, Wallet, Info } from 'lucide-react';
import api from '../../services/api';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import EstadoVazio from '../../components/EstadoVazio';
import { Card, Kpi, LinhaBarra, Carregando, fmtInt } from './dashUi';

/**
 * Aba "IA" do Dashboard Gerencial — SÓ para administrador (quem decide é DashboardGeral).
 * Mostra quanto a IA custou, onde, quem usou e se o gasto é "todo dia" ou "pontual".
 * Fetch próprio de GET /ia-uso/resumo (não passa pelo buscarAba do dashboard).
 */

const dmy = (ymd) => (ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');
const dmyFull = (ymd) => (ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '');

// Regra de exibição dos grupos (cores do design system; nada novo)
const GRUPOS = [
    { classe: 'RECORRENTE', titulo: 'Todo dia', badge: 'bg-red-100 text-red-700', borda: 'border-red-200', ajuda: 'Usado em 5 ou mais dos últimos 30 dias. É gasto que se repete sozinho.' },
    { classe: 'OCASIONAL', titulo: 'De vez em quando', badge: 'bg-amber-100 text-amber-700', borda: 'border-amber-200', ajuda: 'Usado em 3 ou 4 dos últimos 30 dias.' },
    { classe: 'PONTUAL', titulo: 'Pontual', badge: 'bg-green-100 text-green-800', borda: 'border-green-200', ajuda: 'Usado em apenas 1 ou 2 dos últimos 30 dias. Foi uma vez ou outra.' },
    { classe: 'POUCOS_DADOS', titulo: 'Ainda sem histórico suficiente', badge: 'bg-gray-100 text-gray-700', borda: 'border-gray-200', ajuda: 'A contagem da IA começou há menos de 5 dias, então ainda não dá para dizer se é diário ou pontual.' },
];
const ROTULO_CLASSE = {
    RECORRENTE: { t: 'TODO DIA', c: 'bg-red-100 text-red-700' },
    OCASIONAL: { t: 'DE VEZ EM QUANDO', c: 'bg-amber-100 text-amber-700' },
    PONTUAL: { t: 'PONTUAL', c: 'bg-green-100 text-green-800' },
    POUCOS_DADOS: { t: 'POUCOS DADOS', c: 'bg-gray-100 text-gray-700' },
    SEM_USO: { t: 'SEM USO EM 30 DIAS', c: 'bg-gray-100 text-gray-700' },
};

const chamadasTxt = (n) => `${fmtInt(n)} ${Number(n) === 1 ? 'chamada' : 'chamadas'}`;

const AbaUsoIA = ({ tick = 0 }) => {
    const [periodo, periodoCtl] = usePeriodoSalvo('dashboard-ia', '30d');
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [diaSel, setDiaSel] = useState(null);
    const seq = useRef(0);
    const graficoRef = useRef(null);
    const arrastando = useRef(false);

    const buscar = useCallback(async () => {
        const meu = ++seq.current;
        setCarregando(true);
        setErro('');
        try {
            const params = periodo.de && periodo.ate ? { de: periodo.de, ate: periodo.ate } : { dias: 90 };
            const res = await api.get('/ia-uso/resumo', { params });
            if (meu !== seq.current) return;
            setDados(res.data);
            // mantém o dia consultado no gráfico se ele ainda existir no novo resultado
            setDiaSel((prev) => (prev && Array.isArray(res.data?.porDia) && res.data.porDia.some((d) => d.dia === prev) ? prev : null));
        } catch (e) {
            if (meu !== seq.current) return;
            const msg = e?.response?.data?.error;
            setErro(typeof msg === 'string' && msg ? msg : 'Não foi possível carregar o uso da IA.');
        } finally {
            if (meu === seq.current) setCarregando(false);
        }
    }, [periodo.de, periodo.ate]);

    // recarrega ao mudar o período E quando DashboardGeral dispara o tick (aba IA re-clicada, voltar ao app, 5 min)
    useEffect(() => { buscar(); }, [buscar, tick]);

    const cot = dados?.kpis?.cotacaoBrl ?? null;
    const emReal = cot != null;
    const cotEstimada = dados?.kpis?.cotacaoEstimada === true || dados?.cotacao?.cotacaoEstimada === true;
    // Valor na moeda disponível. null = sem preço => "—" (nunca 0)
    const moeda = (usd, brl) => {
        const v = emReal ? brl : usd;
        if (v == null) return '—';
        const n = Number(v);
        if (emReal) {
            if (n > 0 && n < 0.01) return '< R$ 0,01';
            return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        if (n > 0 && n < 0.01) return '< US$ 0,01';
        return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    // Só em USD no backend (automático/manual por dia): converte pela cotação quando houver
    const moedaUsd = (usd) => (usd == null ? '—' : moeda(usd, emReal ? Number(usd) * cot : null));
    // custo 0 com chamadas feitas = o backend somou 'sem preço' como zero: mostrar "—", nunca 0
    const moedaChamadas = (usd, brl, chamadas, semPreco) => {
        if (Number(chamadas) > 0 && Number(semPreco || 0) >= Number(chamadas) && Number(usd || 0) === 0) return '—';
        return Number(chamadas) > 0 && Number(usd || 0) === 0 && semPreco == null ? '—' : moeda(usd, brl);
    };
    const avisoSemPreco = (n) => (Number(n || 0) > 0 ? `+ ${fmtInt(n)} sem preço` : '');
    const numMoeda = (usd, brl) => Number((emReal ? brl : usd) ?? 0);

    const barraFiltros = (
        <div className="flex flex-col md:flex-row md:items-center gap-2">
            <FiltroPeriodo periodo={periodo} controle={periodoCtl} className="w-full md:w-auto" />
            {!(erro && !dados) && <p className="text-xs text-gray-500 font-medium md:ml-2">
                {!emReal ? 'Valores em dólar (sem cotação disponível).'
                    : cotEstimada ? `Valores em reais (cotação do dólar estimada em R$ ${Number(cot).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`
                        : 'Valores em reais (cotação do dólar de hoje).'}
            </p>}
        </div>
    );

    if (carregando && !dados) return <><Card>{barraFiltros}</Card><Carregando /></>;

    if (erro && !dados) {
        return (
            <>
                <Card>{barraFiltros}</Card>
                <Card>
                    <EstadoVazio
                        icon={AlertTriangle}
                        titulo="Não foi possível carregar o uso da IA"
                        descricao={erro}
                        acao={{ label: 'Tentar de novo', onClick: buscar }}
                    />
                </Card>
            </>
        );
    }
    if (!dados) return null;

    const k = dados.kpis || {};
    const kp = k.periodo || {};
    const porDia = Array.isArray(dados.porDia) ? dados.porDia : [];
    const porOrigem = Array.isArray(dados.porOrigem) ? dados.porOrigem : [];
    const porUsuario = Array.isArray(dados.porUsuario) ? dados.porUsuario : [];
    const cl = dados.classificacao || {};
    const itens = Array.isArray(cl.itens) ? cl.itens : [];
    const totais = cl.totais || {};
    const vazio = Number(kp.chamadas || 0) === 0;

    // Período devolvido pelo servidor pode ter sido encurtado (máx. 90 dias)
    // preferência: campo explícito da API (periodo.encurtado); ausente = compara as datas pedida x devolvida
    // "Todo o período" (de/até vazios) sempre pede 90 dias: a faixa aparece sempre; nos demais usa periodo.encurtado
    const todoPeriodo = !(periodo.de && periodo.ate);
    const encurtado = todoPeriodo
        || dados.periodo?.encurtado === true
        || (dados.periodo?.encurtado == null && dados.periodo && dados.periodo.de !== periodo.de);
    // serviços ainda sem histórico suficiente (a faixa não cita a cobertura global)
    const qtdPoucosDados = Number.isFinite(Number(cl.itensPoucosDados)) && cl.itensPoucosDados != null
        ? Number(cl.itensPoucosDados)
        : itens.filter((i) => i.classe === 'POUCOS_DADOS').length;

    const somaGrupos = GRUPOS.reduce((a, g) => a + numMoeda(totais[g.classe]?.custoUsd, totais[g.classe]?.custoBrl), 0);
    const pct = (v) => (somaGrupos > 0 ? Math.round((v / somaGrupos) * 100) : 0);
    const valRec = numMoeda(totais.RECORRENTE?.custoUsd, totais.RECORRENTE?.custoBrl);
    const valPon = numMoeda(totais.PONTUAL?.custoUsd, totais.PONTUAL?.custoBrl);
    const valOca = numMoeda(totais.OCASIONAL?.custoUsd, totais.OCASIONAL?.custoBrl);
    const fmtNum = (v) => moeda(emReal ? null : v, emReal ? v : null);

    const semUso = porOrigem.filter((o) => o.classe === 'SEM_USO');

    // gráfico por dia
    const totalDia = (d) => numMoeda(d.custoUsd, d.custoBrl);
    const maxDia = Math.max(0.0001, ...porDia.map(totalDia));
    const diaInfo = diaSel != null ? porDia.find((d) => d.dia === diaSel) : null;
    const escolherPorX = (x) => {
        const el = graficoRef.current;
        if (!el || !porDia.length) return;
        const r = el.getBoundingClientRect();
        const i = Math.min(porDia.length - 1, Math.max(0, Math.floor(((x - r.left) / r.width) * porDia.length)));
        setDiaSel(porDia[i].dia);
    };
    const passoDia = (delta) => {
        if (!porDia.length) return;
        const atual = porDia.findIndex((d) => d.dia === diaSel);
        const i = atual < 0 ? (delta > 0 ? 0 : porDia.length - 1) : Math.min(porDia.length - 1, Math.max(0, atual + delta));
        setDiaSel(porDia[i].dia);
    };

    const maxOrigem = Math.max(0.0001, ...porOrigem.map((o) => numMoeda(o.custoUsd, o.custoBrl)));
    const maxUsuario = Math.max(0.0001, ...porUsuario.map((u) => numMoeda(u.custoUsd, u.custoBrl)));

    return (
        <div className="space-y-3 md:space-y-4">
            <Card>{barraFiltros}</Card>

            {/* 1. Faixas âmbar */}
            {Number(k.semPreco || 0) > 0 && (
                <Faixa>
                    {fmtInt(k.semPreco)} {Number(k.semPreco) === 1 ? 'chamada usou' : 'chamadas usaram'} um modelo ainda sem preço conhecido; o custo {Number(k.semPreco) === 1 ? 'dela' : 'delas'} não entra no total (você pode informar o preço em Configurações → IA).
                </Faixa>
            )}
            {k.desde && k.retroativoAte && (
                <Faixa>
                    Histórico parcial: os dados até {dmy(k.retroativoAte)} foram reconstruídos de registros antigos
                    (contagem exata desde {dmyFull(k.desde)}). Clippy e cupom de despesa contam só a partir do dia da publicação.
                </Faixa>
            )}
            {qtdPoucosDados > 0 && !vazio && (
                <Faixa>
                    {fmtInt(qtdPoucosDados)} {qtdPoucosDados === 1 ? 'serviço com pouco histórico ainda' : 'serviços com pouco histórico ainda'}: a classificação "todo dia × pontual" fica mais confiável com 5 dias ou mais de uso.
                </Faixa>
            )}
            {encurtado && (
                <Faixa>Mostrando os últimos 90 dias (máximo): de {dmyFull(dados.periodo?.de)} até {dmyFull(dados.periodo?.ate)}.</Faixa>
            )}
            {erro && (
                <Faixa>
                    Não foi possível atualizar agora ({erro}). Os números abaixo são da última carga.{' '}
                    <button type="button" onClick={buscar} className="underline font-bold min-h-[44px] px-1">Tentar de novo</button>
                </Faixa>
            )}

            {/* 2. KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                <Kpi
                    label="Custo no período"
                    valor={moeda(kp.custoUsd, kp.custoBrl)}
                    sub={`${chamadasTxt(kp.chamadas)}${Number(kp.falhas || 0) > 0 ? ` · ${fmtInt(kp.falhas)} com falha` : ''}`}
                />
                <Kpi label="Hoje" valor={moeda(k.hoje?.custoUsd, k.hoje?.custoBrl)} sub={chamadasTxt(k.hoje?.chamadas)} />
                <Kpi label="Últimos 7 dias" valor={moeda(k.ultimos7dias?.custoUsd, k.ultimos7dias?.custoBrl)} sub={chamadasTxt(k.ultimos7dias?.chamadas)} />
                <Kpi label="Últimos 30 dias" valor={moeda(k.ultimos30dias?.custoUsd, k.ultimos30dias?.custoBrl)} sub={chamadasTxt(k.ultimos30dias?.chamadas)} />
            </div>
            <p
                className="text-[11px] text-gray-500 font-medium px-1 -mt-1"
                title={kp.tokens != null ? `No período a IA processou ${fmtInt(kp.tokens)} tokens (as "palavrinhas" que a IA lê e escreve; é por elas que a OpenAI cobra).` : undefined}
            >
                Hoje, 7 e 30 dias são fixos; o primeiro cartão segue o período escolhido.
                {kp.tokens != null && <span className="inline-flex items-center gap-1 ml-1 align-middle"><Info className="h-3 w-3" aria-hidden="true" /><span className="underline decoration-dotted">detalhe técnico</span></span>}
            </p>

            {vazio ? (
                <Card>
                    <EstadoVazio
                        icon={Sparkles}
                        titulo="Nenhum uso da IA neste período"
                        descricao="Escolha um período maior para ver quando a IA foi usada."
                        acao={periodo.preset !== '30d' ? { label: 'Voltar aos últimos 30 dias', onClick: () => periodoCtl.escolher('30d') } : undefined}
                    />
                </Card>
            ) : (
                <>
                    {/* 3. Todo dia × Pontual */}
                    <Card icon={Repeat} titulo="Todo dia × Pontual" direita="últimos 30 dias">
                        <div className="bg-mint rounded-xl px-3.5 py-3 text-sm text-gray-800 mb-3">
                            {somaGrupos > 0 ? (
                                <>
                                    <b>{fmtNum(valRec)}</b> ({pct(valRec)}%) vêm de serviços usados <b>todo dia</b>,{' '}
                                    <b>{fmtNum(valOca)}</b> ({pct(valOca)}%) de uso <b>de vez em quando</b> e{' '}
                                    <b>{fmtNum(valPon)}</b> ({pct(valPon)}%) de uso <b>pontual</b>.
                                </>
                            ) : (
                                <>Ainda não há custo com preço calculado nos últimos 30 dias para separar.</>
                            )}
                            <p className="text-xs text-gray-600 mt-1">
                                Regra: conta em quantos dos últimos 30 dias o serviço foi usado. 5 dias ou mais = todo dia; 3 ou 4 = de vez em quando; 1 ou 2 = pontual.
                            </p>
                        </div>

                        <div className="space-y-3">
                            {GRUPOS.map((g) => {
                                const lista = itens.filter((i) => i.classe === g.classe);
                                const t = totais[g.classe] || {};
                                if (!lista.length && g.classe !== 'RECORRENTE' && g.classe !== 'PONTUAL') return null;
                                return (
                                    <div key={g.classe} className={`border ${g.borda} rounded-xl p-3`}>
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${g.badge}`}>{g.titulo.toUpperCase()}</span>
                                            <span className="text-sm font-bold text-gray-900 tabular-nums">
                                                {Number(t.semPreco || 0) > 0 && Number(t.semPreco) >= Number(t.chamadas || 0) ? '—' : moeda(t.custoUsd ?? 0, t.custoBrl ?? 0)}
                                            </span>
                                            {Number(t.semPreco || 0) > 0 && Number(t.semPreco) < Number(t.chamadas || 0) && (
                                                <span className="text-xs text-amber-700 font-semibold">{avisoSemPreco(t.semPreco)}</span>
                                            )}
                                            <span className="text-xs text-gray-500 font-medium">
                                                {fmtInt(t.itens)} {Number(t.itens) === 1 ? 'serviço' : 'serviços'} · {chamadasTxt(t.chamadas)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{g.ajuda}</p>
                                        {lista.length > 0 ? (
                                            <ul className="mt-2 divide-y divide-gray-100">
                                                {lista.map((i) => (
                                                    <li key={`${i.origem}-${i.gatilho || ''}`} className="py-2 flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-semibold text-gray-800 break-words">{i.rotulo || i.origem}</p>
                                                            <p className="text-xs text-gray-500">
                                                                usado em {fmtInt(i.diasAtivos)} de 30 dias · {chamadasTxt(i.chamadas)}{Number(i.semPreco || 0) > 0 && Number(i.semPreco) < Number(i.chamadas) ? ` · ${avisoSemPreco(i.semPreco)}` : ''}
                                                            </p>
                                                        </div>
                                                        <span className="text-[13px] font-bold text-gray-900 whitespace-nowrap tabular-nums">{moedaChamadas(i.custoUsd, i.custoBrl, i.chamadas, i.semPreco ?? 0)}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-xs text-gray-500 mt-2">Nenhum serviço neste grupo.</p>
                                        )}
                                    </div>
                                );
                            })}
                            {semUso.length > 0 && (
                                <div className="border border-dashed border-gray-300 rounded-xl p-3">
                                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">SEM USO NOS ÚLTIMOS 30 DIAS</span>
                                    <p className="text-xs text-gray-500 mt-1">Foram usados no período escolhido, mas não nos últimos 30 dias. Ficam fora da conta acima.</p>
                                    <ul className="mt-2 divide-y divide-gray-100">
                                        {semUso.map((o) => (
                                            <li key={o.origem} className="py-2 flex items-start justify-between gap-3">
                                                <p className="text-[13px] font-semibold text-gray-800 break-words min-w-0">
                                                    {o.rotulo || o.origem}
                                                    {o.ultimoUso && <span className="block text-xs font-medium text-gray-500">último uso em {dmyFull(String(o.ultimoUso).slice(0, 10))}</span>}
                                                </p>
                                                <span className="text-[13px] font-bold text-gray-900 whitespace-nowrap tabular-nums">{moedaChamadas(o.custoUsd, o.custoBrl, o.chamadas, o.semPreco ?? 0)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* 4. Custo por dia */}
                    <Card
                        icon={CalendarDays}
                        titulo="Custo por dia"
                        direita={`${dmy(dados.periodo?.de)} – ${dmy(dados.periodo?.ate)}`}
                    >
                        <div className="flex items-center gap-4 text-xs font-semibold text-gray-700 mb-2">
                            <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-sm bg-house" /> Automático</span>
                            <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-sm bg-primary" /> Manual (alguém clicou)</span>
                        </div>
                        {/* Gráfico: toque/arraste em qualquer ponto da altura escolhe o dia mais próximo (30–90 barras são finas demais para acertar uma a uma) */}
                        <div
                            ref={graficoRef}
                            className="flex items-end gap-px md:gap-[3px] h-40 border-b border-gray-200 cursor-pointer select-none"
                            style={{ touchAction: 'pan-y' }}
                            onPointerDown={(e) => { arrastando.current = true; escolherPorX(e.clientX); }}
                            onPointerMove={(e) => { if (arrastando.current) escolherPorX(e.clientX); }}
                            onPointerUp={() => { arrastando.current = false; }}
                            onPointerCancel={() => { arrastando.current = false; }}
                            onPointerLeave={() => { arrastando.current = false; }}
                            role="group"
                            aria-label="Custo por dia"
                        >
                            {porDia.map((d) => {
                                const alt = Math.max(0, (totalDia(d) / maxDia) * 100);
                                const totUsd = Number(d.custoUsd || 0);
                                const fracAuto = totUsd > 0 ? Number(d.automaticoCustoUsd || 0) / totUsd : 0;
                                const sel = diaSel === d.dia;
                                return (
                                    <div
                                        key={d.dia}
                                        data-dia={d.dia}
                                        title={`${dmy(d.dia)} · ${moeda(d.custoUsd, d.custoBrl)}`}
                                        className={`flex-1 min-w-[2px] h-full flex flex-col justify-end ${sel ? 'bg-mint' : ''}`}
                                    >
                                        <span className="w-full flex flex-col-reverse rounded-t-sm overflow-hidden" style={{ height: `${alt > 0 ? Math.max(alt, 2) : 0}%` }}>
                                            <span className="w-full bg-house" style={{ height: `${fracAuto * 100}%` }} />
                                            <span className="w-full bg-primary" style={{ height: `${(1 - fracAuto) * 100}%` }} />
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-between text-[11px] font-semibold text-gray-500 mt-1">
                            <span>{dmy(porDia[0]?.dia)}</span>
                            <span>{dmy(porDia[porDia.length - 1]?.dia)}</span>
                        </div>
                        {/* Detalhe do dia: fixo abaixo do gráfico (altura constante, não pula) */}
                        <div className="mt-3 flex items-stretch gap-2" data-testid="detalhe-dia">
                            <button type="button" onClick={() => passoDia(-1)} disabled={!porDia.length} aria-label="Dia anterior" className="min-w-[44px] min-h-[44px] rounded-full border border-primary text-primary font-bold disabled:opacity-40">‹</button>
                            <div className="flex-1 min-w-0 bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-2.5 text-sm text-gray-800 min-h-[64px]">
                                {diaInfo ? (
                                    <>
                                        <b>{dmyFull(diaInfo.dia)}</b>: {moeda(diaInfo.custoUsd, diaInfo.custoBrl)} · {fmtInt(diaInfo.chamadas)} {Number(diaInfo.chamadas) === 1 ? 'chamada' : 'chamadas'}
                                        <span className="block text-xs text-gray-600 mt-0.5">
                                            Automático: {fmtInt(diaInfo.automatico)} ({moedaUsd(diaInfo.automaticoCustoUsd)}) · Manual: {fmtInt(diaInfo.manual)} ({moedaUsd(diaInfo.manualCustoUsd)})
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-gray-600">Toque ou arraste no gráfico para ver o dia.</span>
                                )}
                            </div>
                            <button type="button" onClick={() => passoDia(1)} disabled={!porDia.length} aria-label="Próximo dia" className="min-w-[44px] min-h-[44px] rounded-full border border-primary text-primary font-bold disabled:opacity-40">›</button>
                        </div>
                    </Card>

                    {/* 5 e 6. Rankings */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                        <Card icon={Wallet} titulo="Onde gastou mais">
                            {porOrigem.length === 0 ? (
                                <p className="text-sm text-gray-500">Sem dados no período.</p>
                            ) : porOrigem.map((o) => {
                                const c = ROTULO_CLASSE[o.classe];
                                return (
                                    <div key={o.origem} className="mb-2">
                                        <LinhaBarra
                                            nome={o.rotulo || o.origem}
                                            valor={moedaChamadas(o.custoUsd, o.custoBrl, o.chamadas, o.semPreco ?? 0)}
                                            percent={(numMoeda(o.custoUsd, o.custoBrl) / maxOrigem) * 100}
                                        />
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            {c && <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${c.c}`}>{c.t}</span>}
                                            <span className="text-xs text-gray-500 font-medium">{chamadasTxt(o.chamadas)}{o.estimado ? ' · custo estimado' : ''}{Number(o.semPreco || 0) > 0 ? ` · ${avisoSemPreco(o.semPreco)}` : ''}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </Card>
                        <Card icon={Users} titulo="Quem usou">
                            {porUsuario.length === 0 ? (
                                <p className="text-sm text-gray-500">Sem dados no período.</p>
                            ) : porUsuario.map((u, idx) => (
                                <div key={`${u.usuarioId ?? 'sem'}-${idx}`} className="mb-2">
                                    <LinhaBarra
                                        nome={u.nome || 'Sem identificação'}
                                        valor={moedaChamadas(u.custoUsd, u.custoBrl, u.chamadas, u.semPreco ?? 0)}
                                        percent={(numMoeda(u.custoUsd, u.custoBrl) / maxUsuario) * 100}
                                    />
                                    <p className="text-xs text-gray-500 font-medium">
                                        {chamadasTxt(u.chamadas)}{Number(u.semPreco || 0) > 0 ? ` · ${avisoSemPreco(u.semPreco)}` : ''}{u.origemPrincipalRotulo ? ` · mais usou: ${u.origemPrincipalRotulo}` : ''}
                                    </p>
                                </div>
                            ))}
                        </Card>
                    </div>
                </>
            )}

            <p className="text-xs text-gray-500 font-medium px-1 pb-2">
                Mostra só o que o CA-Hardt chamou; é uma estimativa, não a fatura da OpenAI.
            </p>
        </div>
    );
};

const Faixa = ({ children }) => (
    <div className="flex items-start gap-2 bg-amber-100 text-amber-700 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold">
        <AlertTriangle className="h-4 w-4 flex-none mt-0.5" aria-hidden="true" />
        <div className="min-w-0 break-words">{children}</div>
    </div>
);

export default AbaUsoIA;
