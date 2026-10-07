import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, Settings, Target, Scale, LineChart, PackageCheck, Factory, Siren, Users, Package, AlertTriangle, Landmark } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import FiltroPeriodo, { usePeriodoSalvo } from '../../components/FiltroPeriodo';
import SelectBusca from '../../components/SelectBusca';
import EstadoVazio from '../../components/EstadoVazio';
import { useAuth } from '../../contexts/AuthContext';
import { useFiltrosSalvos } from '../../hooks/useFiltrosSalvos';
import { useIndicador } from './indicadores/useIndicador';
import Bloco, { Chip } from './indicadores/Bloco';
import KpiCard from './indicadores/KpiCard';
import Cascata from './indicadores/Cascata';
import Equilibrio from './indicadores/Equilibrio';
import CurvaInsumos from './indicadores/CurvaInsumos';
import EntradasSemana from './indicadores/EntradasSemana';
import TabelaProdutos, { ORDENS_DONO, ORDENS_PROD } from './indicadores/TabelaProdutos';
import ProducaoEstoque from './indicadores/ProducaoEstoque';
import Alertas, { contarAlertas } from './indicadores/Alertas';
import TabelaClientes from './indicadores/TabelaClientes';
import GuiaLeitura from './indicadores/GuiaLeitura';
import ConfigImpostoModal from './indicadores/ConfigImpostoModal';
import MetasModal from './indicadores/MetasModal';
import { AJUDA } from './indicadores/guia';
import { fmtNum, fmtPct, fmtPctSinal, fmtRSk, temValor, MESES } from './indicadores/formatos';

// Tela "Indicadores de Gestão" (Etapa 2 do plano). Duas visões:
//  - Dono: tudo (cascata, equilíbrio, clientes, produtos com revenda marcada).
//  - Gerente de produção: FOCO em produção — só fabricados e insumos de receita, nada financeiro.
// O SERVIDOR decide o que entra em cada visão (?foco=producao); o front só escolhe o layout.
// Permissão: completo = Pode_Ver_Indicadores_Gestao (hasPermission já trata admin e booleano);
// produção-only = só Pode_Ver_Indicadores_Producao (visão fixa, sem alternância).

const sinal = (v, casas = 1) => (temValor(v) ? `${Number(v) > 0 ? '▲' : Number(v) < 0 ? '▼' : '='} ${fmtNum(Math.abs(v), casas)}` : null);
const tomMaisEBom = (v) => (!temValor(v) || Number(v) === 0 ? 'neutro' : Number(v) > 0 ? 'bom' : 'ruim');
const mesRot = (mes) => (typeof mes === 'string' && /^\d{4}-\d{2}/.test(mes) ? `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}` : '');

// Curva do cartão "custo dos insumos" (visão produção): média por semana IGNORANDO semanas sem preço
// (null não vira 0). Só desenho — o número e o semáforo vêm do SERVIDOR (insumos.dados.kpi).
function sparkInsumos(ins) {
    const l = Array.isArray(ins?.insumos) ? ins.insumos : [];
    const n = Math.max(0, ...l.map((i) => (Array.isArray(i.indice) ? i.indice.length : 0)));
    const spark = [];
    for (let k = 0; k < n; k++) {
        const vs = l.map((i) => i.indice?.[k]).filter((v) => temValor(v)).map(Number);
        if (vs.length) spark.push(vs.reduce((a, b) => a + b, 0) / vs.length);
    }
    return spark;
}

export default function IndicadoresGestao() {
    const { user, hasPermission } = useAuth();
    const completo = hasPermission('Pode_Ver_Indicadores_Gestao');
    const soProducao = !completo && hasPermission('Pode_Ver_Indicadores_Producao');
    const ehAdmin = !!user?.permissoes?.admin;

    const [periodo, periodoCtl] = usePeriodoSalvo('indicadores-gestao');
    const [filtros, setFiltros] = useFiltrosSalvos('indicadores-gestao', { visao: 'dono', ordemDono: 'mcTotal', ordemProd: 'quantidadeVendida' });
    const [semanaOffset, setSemanaOffset] = useState(0); // navegação pontual, não persiste
    const [modalImposto, setModalImposto] = useState(false);
    const [modalMetas, setModalMetas] = useState(false);

    const visao = completo ? (filtros.visao === 'producao' ? 'producao' : 'dono') : 'producao';
    const dono = visao === 'dono';
    const foco = dono ? 'todos' : 'producao';
    const ordemAtual = dono ? filtros.ordemDono : filtros.ordemProd;
    const opcoesOrdem = dono ? ORDENS_DONO : ORDENS_PROD;

    const base = { de: periodo.de, ate: periodo.ate, foco };
    const pode = completo || soProducao;
    const resumo = useIndicador('resumo', base, pode && dono);
    const cascata = useIndicador('cascata', base, pode && dono);
    // equilíbrio é do MÊS: nunca de um mês futuro (ex.: "Este ano" termina em dezembro)
    const hoje = new Date(); const hojeIso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    const mesEq = (periodo.ate && periodo.ate < hojeIso ? periodo.ate : hojeIso).slice(0, 7);
    const equilibrio = useIndicador('equilibrio', { mes: mesEq }, pode && dono);
    const clientes = useIndicador('clientes', { ...base, limite: 6 }, pode && dono);
    const insumos = useIndicador('insumos-semanal', { foco, semanas: 8 }, pode);
    const entradas = useIndicador('entradas-semana', { foco, semanaOffset }, pode);
    const produtos = useIndicador('produtos', base, pode);
    const producao = useIndicador('producao', base, pode);
    const alertas = useIndicador('alertas', { ...base }, pode);

    const algumExemplo = [resumo, cascata, equilibrio, clientes, insumos, entradas, produtos, producao, alertas].some((r) => r.exemplo);
    const contagem = useMemo(() => contarAlertas(alertas.dados?.itens), [alertas.dados]);
    const sparkIns = useMemo(() => sparkInsumos(insumos.dados), [insumos.dados]);

    if (!pode) {
        return <EstadoVazio icon={Gauge} titulo="Você não tem acesso aos Indicadores de Gestão" descricao="Peça ao administrador para liberar a permissão." />;
    }

    // ---------- KPIs ----------
    const kr = resumo.dados?.kpis;
    const sp = resumo.dados?.sparks || {};
    const sem = (s) => (s && s.status !== 'sem_dado' ? s : null);
    const insResumo = kr?.custoInsumos;
    const destaquesTxt = (lista) => (Array.isArray(lista) && lista.length ? lista.map((d) => `${d.nome} ${fmtPctSinal(d.variacaoPct, 0)}`).join(' · ') : null);
    const cartaoInsumos = (insResumo && dono)
        ? { variacaoPct: insResumo.variacaoPct, semanas: insResumo.semanas, semaforo: sem(insResumo.semaforo), spark: sp.custoInsumosIdx, destaque: destaquesTxt(insResumo.destaques) }
        : insumos.dados?.kpi ? { variacaoPct: insumos.dados.kpi.variacaoPct, semanas: insumos.dados.kpi.semanas, semaforo: sem(insumos.dados.kpi.semaforo), spark: sparkIns, destaque: destaquesTxt(insumos.dados.kpi.destaques) }
            : { variacaoPct: null, semanas: 8, semaforo: null, spark: null, destaque: null }; // sem compras (ou servidor antigo): cartão com "—", sem selo

    const cardInsumos = cartaoInsumos && (
        <KpiCard
            rotulo="Custo médio dos insumos" ajuda={AJUDA.custoInsumos} semaforo={cartaoInsumos.semaforo}
            valor={fmtPctSinal(cartaoInsumos.variacaoPct)} unidade={temValor(cartaoInsumos.variacaoPct) ? `em ${cartaoInsumos.semanas || 8} sem.` : null}
            detalhe={temValor(cartaoInsumos.variacaoPct) ? null : 'sem compras suficientes para comparar'}
            variacao={cartaoInsumos.destaque || null} tom={temValor(cartaoInsumos.variacaoPct) && cartaoInsumos.variacaoPct > 0 ? 'ruim' : 'bom'}
            spark={cartaoInsumos.spark}
        />
    );

    const fabricadosQtd = produtos.dados?.resumo?.qtdProdutos;
    const linhasProd = Array.isArray(produtos.dados?.linhas) ? produtos.dados.linhas : [];
    // só afirma "0 / no alvo" quando o dado chegou E tem conteúdo; senão "—" sem selo
    const produtosOk = !!produtos.dados && !produtos.erro && linhasProd.length > 0;
    const insumosLista = Array.isArray(insumos.dados?.insumos) ? insumos.dados.insumos : [];
    const insumosOk = !!insumos.dados && !insumos.erro && insumosLista.length > 0;
    const fichasAtencao = linhasProd.filter((l) => l.fichaDesatualizada || l.temCustoFaltando).length;
    const insAlta = insumosLista.filter((i) => Number(i.altasSeguidas) >= 3);

    const blocoKpisDono = (resumo.carregando && !resumo.dados) || resumo.erro ? (
        <Bloco titulo="Indicadores do período" icon={Gauge} estado={resumo}>{null}</Bloco>
    ) : kr ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard rotulo="Receita líquida" ajuda={AJUDA.receitaLiquida} semaforo={sem(kr.receitaLiquida?.semaforo)}
                valor={fmtRSk(kr.receitaLiquida?.valor)} variacao={temValor(kr.receitaLiquida?.variacaoPct) ? `${sinal(kr.receitaLiquida.variacaoPct)}%` : null}
                tom={tomMaisEBom(kr.receitaLiquida?.variacaoPct)} variacaoRef="vs período anterior" detalhe={temValor(kr.receitaLiquida?.anterior) ? `antes ${fmtRSk(kr.receitaLiquida.anterior)}` : null} spark={sp.receitaLiquida} />
            <KpiCard rotulo="Margem de contribuição" ajuda={AJUDA.margemContribuicao} semaforo={sem(kr.margemContribuicao?.semaforo)}
                valor={fmtNum(kr.margemContribuicao?.pct, 1)} unidade="%" variacao={temValor(kr.margemContribuicao?.deltaPt) ? `${sinal(kr.margemContribuicao.deltaPt)} pt` : null}
                deltaMedia={kr.margemContribuicao?.deltaMedia3mPt} tom={tomMaisEBom(kr.margemContribuicao?.deltaPt)} variacaoRef="vs período anterior"
                detalhe={[fmtRSk(kr.margemContribuicao?.valor), temValor(kr.margemContribuicao?.pctAnterior) ? `antes ${fmtPct(kr.margemContribuicao.pctAnterior)}` : null].filter((x) => x && x !== '—').join(' · ')} spark={sp.mcPct} />
            <KpiCard rotulo="Resultado operacional" ajuda={AJUDA.resultadoOperacional} semaforo={sem(kr.resultadoOperacional?.semaforo)}
                valor={fmtNum(kr.resultadoOperacional?.pct, 1)} unidade="%" variacao={temValor(kr.resultadoOperacional?.deltaPt) ? `${sinal(kr.resultadoOperacional.deltaPt)} pt` : null}
                deltaMedia={kr.resultadoOperacional?.deltaMedia3mPt} tom={tomMaisEBom(kr.resultadoOperacional?.deltaPt)} variacaoRef="vs período anterior"
                detalhe={[fmtRSk(kr.resultadoOperacional?.valor), temValor(kr.resultadoOperacional?.pctAnterior) ? `antes ${fmtPct(kr.resultadoOperacional.pctAnterior)}` : null].filter((x) => x && x !== '—').join(' · ')} spark={sp.resultadoPct} />
            {cardInsumos || <div />}
        </div>
    ) : null;

    const blocoKpisProducao = ((insumos.carregando && !insumos.dados) || insumos.erro) ? (
        <Bloco titulo="Indicadores do período" icon={Gauge} estado={insumos}>{null}</Bloco>
    ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cardInsumos}
            <KpiCard rotulo="Insumos em alta" ajuda="Insumos com 3 ou mais altas de preço seguidas nas compras conferidas." valor={insumosOk ? String(insAlta.length) : '—'}
                semaforo={!insumosOk ? null : insAlta.length >= 2 ? { status: 'agir', palavra: 'agir' } : insAlta.length === 1 ? { status: 'atencao', palavra: 'atenção' } : { status: 'ok', palavra: 'no alvo' }}
                detalhe={!insumosOk ? 'sem compras para avaliar' : insAlta.length ? insAlta.slice(0, 2).map((i) => i.nome).join(' · ') : 'nenhum com 3 altas seguidas'} />
            <KpiCard rotulo="Produtos fabricados vendidos" valor={temValor(fabricadosQtd) ? String(fabricadosQtd) : '—'} detalhe="só produtos com ficha técnica" />
            <KpiCard rotulo="Fichas pedindo atenção" ajuda={AJUDA.custoFicha} valor={produtosOk ? String(fichasAtencao) : '—'}
                semaforo={!produtosOk ? null : fichasAtencao > 0 ? { status: 'atencao', palavra: 'atenção' } : { status: 'ok', palavra: 'no alvo' }}
                detalhe={!produtosOk ? 'sem produtos fabricados no período' : fichasAtencao > 0 ? 'desatualizada ou com custo faltando' : 'todas em dia'} />
        </div>
    );

    // ---------- faixa de avisos (dono) ----------
    const avisos = [];
    if (dono) {
        const vistos = new Set();
        [...(resumo.dados?.cobertura?.avisos || []), ...(cascata.dados?.cobertura?.avisos || [])].forEach((a) => {
            if (!a || vistos.has(a)) return;
            vistos.add(a);
            avisos.push({ k: `cob-${a}`, txt: a, link: /categoria/i.test(a) });
        });
    }

    const ordemSelect = (
        <div className="w-56">
            <SelectBusca value={ordemAtual} onChange={(e) => setFiltros((f) => ({ ...f, [dono ? 'ordemDono' : 'ordemProd']: e.target.value }))} className="w-full h-11 md:h-auto">
                {opcoesOrdem.map((o) => <option key={o.v} value={o.v}>Ordenar: {o.t}</option>)}
            </SelectBusca>
        </div>
    );

    const segBtn = (ativo) => `px-4 min-h-[44px] rounded-full text-sm font-bold transition-colors ${ativo ? 'bg-primary text-white' : 'text-gray-600 hover:bg-white'}`;

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            <PageHeader
                icon={Gauge} cor="red" titulo="Indicadores de Gestão"
                subtitulo={dono ? 'Estamos ganhando dinheiro? O custo está subindo? Onde agir primeiro?' : 'Custos de produção: insumos, fichas técnicas e entradas de mercadoria'}
                acoes={<>
                    {algumExemplo && <Chip cls="bg-gray-100 text-gray-700">dados de exemplo</Chip>}
                    {ehAdmin && (
                        <button type="button" onClick={() => setModalMetas(true)} aria-label="Metas dos indicadores" title="Metas dos indicadores"
                            className="w-11 h-11 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100">
                            <Target className="h-4 w-4" />
                        </button>
                    )}
                    {ehAdmin && dono && (
                        <button type="button" onClick={() => setModalImposto(true)} aria-label="Configurar imposto sobre a venda" title="Imposto sobre a venda"
                            className="w-11 h-11 flex items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100">
                            <Settings className="h-4 w-4" />
                        </button>
                    )}
                </>}
            />

            <div className="px-3 md:px-6 pb-8 space-y-3 md:space-y-4">
                {/* Controles */}
                <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-2">
                    {/* "Todo o período" fica de fora: o backend só calcula até 13 meses e o preset mandaria um intervalo vazio */}
                    <FiltroPeriodo periodo={periodo} controle={periodoCtl} ocultarPresets={['todo']} className="w-full md:w-auto" />
                    {completo && (
                        <div role="group" aria-label="Visão da tela" className="inline-flex self-start bg-gray-100 rounded-full p-1">
                            <button type="button" aria-pressed={dono} onClick={() => setFiltros((f) => ({ ...f, visao: 'dono' }))} className={segBtn(dono)}>Dono</button>
                            <button type="button" aria-pressed={!dono} onClick={() => setFiltros((f) => ({ ...f, visao: 'producao' }))} className={segBtn(!dono)}>Gerente de produção</button>
                        </div>
                    )}
                </div>

                {!dono && (
                    <div className="flex items-start gap-2 bg-mint text-primaryDark text-xs font-semibold rounded-xl px-3 py-2.5">
                        <Factory className="h-4 w-4 flex-none mt-0.5" />
                        <span>Visão da gerente de produção: só produtos fabricados (com ficha técnica) e os insumos das receitas. Resultado financeiro, vendas por cliente e revenda não aparecem aqui.</span>
                    </div>
                )}

                {avisos.length > 0 && (
                    <div className="space-y-2">
                        {avisos.map((a) => (
                            <div key={a.k} className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2.5 text-sm">
                                <AlertTriangle className="h-4 w-4 flex-none mt-0.5" />
                                <span className="flex-1">{a.txt}{a.link && <> <Link to="/financeiro/categorias-despesa" className="inline-flex items-center min-h-[44px] md:min-h-0 font-bold underline">Classificar agora</Link></>}</span>
                            </div>
                        ))}
                    </div>
                )}

                {dono ? blocoKpisDono : blocoKpisProducao}

                {dono && (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4">
                        <Bloco className="lg:col-span-3" titulo="Custos e resultado — de onde o dinheiro vem e para onde vai" icon={Landmark} estado={cascata}
                            direita={<><Chip cls="bg-gray-100 text-gray-700">R$ mil</Chip>
                                {cascata.dados?.impostoOrigem && <Chip cls="bg-gray-100 text-gray-700">{cascata.dados.impostoOrigem === 'ALIQUOTA' ? 'imposto por alíquota' : 'imposto real pago'}</Chip>}
                                {cascata.dados?.despesasProporcionais && <Chip cls="bg-gray-100 text-gray-700">despesas proporcionais aos dias</Chip>}</>}>
                            {(cascata.dados?.linhas || []).some((l) => Number(l.valor) !== 0)
                                ? <Cascata linhas={cascata.dados?.linhas} />
                                : <EstadoVazio icon={Landmark} titulo="Sem vendas nem despesas neste período" descricao="Escolha outro período no filtro acima." />}
                        </Bloco>
                        <Bloco className="lg:col-span-2" titulo={`Meta do mês${equilibrio.dados?.mes ? ` — ${mesRot(equilibrio.dados.mes)}` : ''}`} icon={Scale} estado={equilibrio}>
                            {equilibrio.dados && equilibrio.dados.pontoEquilibrio == null && !Number(equilibrio.dados.acumulado)
                                ? <EstadoVazio icon={Scale} titulo="Sem dados para o ponto de equilíbrio" descricao="Faltam despesas fixas classificadas ou vendas no mês." />
                                : <Equilibrio d={equilibrio.dados} />}
                        </Bloco>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 md:gap-4">
                    <Bloco className="lg:col-span-3" titulo="Evolução do custo dos insumos — últimas 8 semanas" icon={LineChart} estado={insumos}
                        direita={<><Chip>base 100 = 1ª semana</Chip><Chip cls="bg-gray-100 text-gray-700">R$ no detalhe</Chip></>}>
                        {insumos.dados?.insumos?.length ? <CurvaInsumos d={insumos.dados} /> : <EstadoVazio icon={LineChart} titulo="Sem compras de insumos para mostrar" descricao="A curva aparece quando há entradas de mercadoria conferidas nas últimas semanas." />}
                    </Bloco>
                    <Bloco className="lg:col-span-2" titulo={semanaOffset === 0 ? 'Entradas desta semana' : 'Entradas da semana passada'} icon={PackageCheck} estado={entradas} semPadding
                        direita={<div role="group" aria-label="Semana" className="inline-flex bg-gray-100 rounded-full p-0.5">
                            <button type="button" aria-pressed={semanaOffset === 0} onClick={() => setSemanaOffset(0)} className={`px-3 min-h-[44px] md:min-h-[32px] rounded-full text-xs font-bold ${semanaOffset === 0 ? 'bg-primary text-white' : 'text-gray-600'}`}>Esta</button>
                            <button type="button" aria-pressed={semanaOffset === -1} onClick={() => setSemanaOffset(-1)} className={`px-3 min-h-[44px] md:min-h-[32px] rounded-full text-xs font-bold ${semanaOffset === -1 ? 'bg-primary text-white' : 'text-gray-600'}`}>Passada</button>
                        </div>}>
                        <EntradasSemana d={entradas.dados} />
                    </Bloco>
                </div>

                <Bloco titulo={dono ? 'Custo e margem por produto' : 'Custo dos produtos fabricados'} icon={Package} estado={produtos} semPadding
                    direita={<><Chip cls="bg-gray-100 text-gray-700">custo-base = ficha técnica</Chip>{ordemSelect}</>}>
                    <TabelaProdutos linhas={produtos.dados?.linhas} completa={dono} ordem={ordemAtual} />
                    <p className="px-4 md:px-5 py-3 text-xs text-gray-600 border-t border-gray-100">
                        {dono
                            ? <><b>MC total</b> diz quem mais paga a empresa; <b>MC %</b> diz a eficiência da venda. Itens de <Chip cls="bg-purple-100 text-purple-700">revenda</Chip> usam custo de compra (CMV), não ficha (CPV); <Chip cls="bg-gray-100 text-gray-700">sem ficha</Chip> ainda precisa ser classificado.</>
                            : <>Só produtos fabricados (com ficha técnica vigente). <b>Δ custo 4 sem.</b> mostra se o custo da ficha subiu nas últimas 4 semanas.</>}
                    </p>
                </Bloco>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
                    <Bloco titulo="Produção e estoque" icon={Factory} estado={producao}>
                        <ProducaoEstoque d={producao.dados} />
                    </Bloco>
                    <Bloco titulo="Onde agir primeiro" icon={Siren} estado={alertas}
                        direita={<>{contagem.urgente > 0 && <Chip cls="bg-red-100 text-red-700">{contagem.urgente} urgente{contagem.urgente > 1 ? 's' : ''}</Chip>}{contagem.atencao > 0 && <Chip cls="bg-amber-100 text-amber-700">{contagem.atencao} atenção</Chip>}</>}>
                        <Alertas itens={alertas.dados?.itens} />
                    </Bloco>
                </div>

                {dono && (
                    <Bloco titulo="Clientes e pedidos — quem vende muito e deixa pouco" icon={Users} estado={clientes} semPadding direita={<Chip cls="bg-gray-100 text-gray-700">top 6 por receita</Chip>}>
                        <TabelaClientes d={clientes.dados} />
                    </Bloco>
                )}

                <GuiaLeitura visao={visao} />
            </div>

            {modalMetas && <MetasModal visaoDono={dono} onFechar={() => setModalMetas(false)} onSalvou={() => { resumo.recarregar(); insumos.recarregar(); producao.recarregar(); alertas.recarregar(); }} />}
            {modalImposto && <ConfigImpostoModal onFechar={() => setModalImposto(false)} onSalvou={() => { resumo.recarregar(); cascata.recarregar(); equilibrio.recarregar(); clientes.recarregar(); }} />}
        </div>
    );
}
