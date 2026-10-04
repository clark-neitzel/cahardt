import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, Loader2 } from 'lucide-react';
import caixaService from '../../services/caixaService';
import SelectBusca from '../../components/SelectBusca';

// Barra "‹ data › + Hoje" e faixa de pílulas de status dos caixas do dia
// (navegação dia-a-dia aprovada no mockup docs/mockups/caixa-diario-navegacao.html).
//
// Consome GET /api/caixa/resumo-dia (contrato em docs/caixa-pilulas/plano.md) de forma
// ISOLADA: se a rota falhar, a navegação de data continua funcionando (ela é 100% local,
// não depende do backend) e só a faixa de pílulas some, com um aviso discreto — nunca
// derruba o resto do Caixa.

const ORDEM_STATUS = ['A_CONFERIR', 'DEVOLUCAO_PENDENTE', 'ABERTO', 'A_FECHAR', 'FECHADO', 'CONFERIDO'];

// Cores exatas do mockup aprovado — mapeiam 1:1 para tons já existentes no Tailwind
// (amber-200/900, red-100/800, blue-100/800, mint/primaryDark, gray-200/700, primary/white),
// nenhuma cor nova inventada.
const PILL_STATUS = {
    A_CONFERIR: { label: 'A conferir', cls: 'bg-amber-200 text-amber-900', pisca: true },
    DEVOLUCAO_PENDENTE: { label: 'Devolução p/ conferir', cls: 'bg-red-100 text-red-800', pisca: true },
    // ABERTO aqui é a cor de NAVEGAÇÃO do mockup (azul), diferente do badge semântico
    // "Aberto" (verde) usado no topo da página — são contextos distintos. bg-blue-100/
    // text-blue-800 NÃO são remapeados pela camada do tema Starbucks (index.css confirma).
    ABERTO: { label: 'Aberto', cls: 'bg-blue-100 text-blue-800', pisca: false },
    A_FECHAR: { label: 'A fechar', cls: 'bg-mint text-primaryDark', pisca: false },
    FECHADO: { label: 'Fechado', cls: 'bg-gray-200 text-gray-700', pisca: false },
    CONFERIDO: { label: 'Conferido', cls: 'bg-primary text-white', pisca: false, check: true },
};

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const iniciais = (nome) => String(nome || '').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();

// Datas tratadas sempre como texto 'YYYY-MM-DD' — nunca via Date(string) direto, que o
// navegador lê como UTC e pode "voltar" um dia dependendo do fuso (mesmo cuidado já usado
// em fmtDataCurtaSemFuso, no arquivo da página principal).
const parseYMD = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};
const toYMD = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
const addDias = (ymd, n) => {
    const d = parseYMD(ymd);
    d.setDate(d.getDate() + n);
    return toYMD(d);
};
const fmtDiaMes = (ymd) => {
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}` : String(ymd || '');
};

const CaixaPilulasDia = ({
    data,
    onChangeData,
    vendedorId,
    onChangeVendedor,
    podeVerHistorico,
    podeVerOutros,
    today,
    vendedoresDoDia = [],
    refreshSignal,
}) => {
    const [pillsData, setPillsData] = useState(null); // resposta crua de /resumo-dia
    const [loadingPills, setLoadingPills] = useState(false);
    const [erroPills, setErroPills] = useState(null);
    const [mostrarOutros, setMostrarOutros] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);
    const dateInputRef = useRef(null);

    useEffect(() => {
        let cancelado = false;
        setLoadingPills(true);
        setErroPills(null);
        caixaService.getResumoDia(data)
            .then((res) => {
                if (cancelado) return;
                // Fim de semana sem caixa: o /resumo da página principal já trata o
                // aviso/redirecionamento; aqui só escondemos a faixa.
                if (res?.diaSemCaixa) { setPillsData(null); return; }
                setPillsData(res || null);
            })
            .catch((err) => {
                if (cancelado) return;
                console.error('Erro ao carregar faixa de caixas do dia:', err);
                setErroPills('Não foi possível carregar os caixas do dia.');
                setPillsData(null);
            })
            .finally(() => { if (!cancelado) setLoadingPills(false); });
        return () => { cancelado = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, refreshSignal, reloadTick]);

    // Setas do teclado — só fora de campo editável e sem modal aberto (padrão de overlay
    // deste app: "fixed inset-0", usado em todos os modais de Caixa/Pedidos).
    useEffect(() => {
        const handler = (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            if (!podeVerHistorico) return;
            const ativo = document.activeElement;
            const tag = ativo?.tagName;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || ativo?.isContentEditable) return;
            if (document.querySelector('.fixed.inset-0')) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); onChangeData(addDias(data, -1)); }
            // Quem tem histórico navega livremente para o futuro também (ex.: lançar
            // adiantamento no caixa de amanhã) — a trava de data já é feita acima.
            else if (e.key === 'ArrowRight') { e.preventDefault(); onChangeData(addDias(data, 1)); }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [data, today, podeVerHistorico, onChangeData]);

    const abrirCalendario = () => {
        if (!podeVerHistorico) return;
        const el = dateInputRef.current;
        if (!el) return;
        if (typeof el.showPicker === 'function') {
            try { el.showPicker(); return; } catch { /* cai no fallback abaixo */ }
        }
        el.focus();
        el.click();
    };

    const tituloBloqueado = !podeVerHistorico ? 'Você só pode visualizar o caixa do dia atual.' : '';
    const diaSemana = parseYMD(data).toLocaleDateString('pt-BR', { weekday: 'long' });
    const dataFmt = parseYMD(data).toLocaleDateString('pt-BR');
    const ehHoje = data === today;
    // Rótulo "· amanhã" / "· futuro" para quem navegou para frente (só quem tem
    // podeVerHistorico consegue chegar aqui) — sem isso a tela fica ambígua sobre
    // qual dia está sendo exibido.
    const ehAmanha = !ehHoje && data === addDias(today, 1);
    const ehFuturo = !ehHoje && !ehAmanha && data > today;

    const pills = pillsData?.caixas || [];
    const resumoContagem = pillsData?.resumoContagem || {};
    const pendenciasAnteriores = pillsData?.pendenciasAnteriores || [];

    return (
        <div className="space-y-3">
            {/* Navegação de data */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-white border border-gray-300 rounded-full shadow-sm h-11 flex-1 min-w-[230px] sm:flex-none sm:min-w-[260px]">
                    <button
                        type="button"
                        onClick={() => onChangeData(addDias(data, -1))}
                        disabled={!podeVerHistorico}
                        title={tituloBloqueado || 'Dia anterior'}
                        aria-label="Dia anterior"
                        className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                        type="button"
                        onClick={abrirCalendario}
                        disabled={!podeVerHistorico}
                        title={tituloBloqueado || 'Clique para escolher no calendário'}
                        className="flex-1 min-w-0 h-11 px-2 flex flex-col items-center justify-center border-l border-r border-gray-200 leading-tight disabled:cursor-not-allowed"
                    >
                        <span className="text-[13px] sm:text-sm font-bold text-gray-800 truncate">{dataFmt}</span>
                        <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 capitalize truncate">
                            {diaSemana}{ehHoje ? ' · hoje' : ehAmanha ? ' · amanhã' : ehFuturo ? ' · futuro' : ''}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onChangeData(addDias(data, 1))}
                        disabled={!podeVerHistorico}
                        title={tituloBloqueado || 'Próximo dia'}
                        aria-label="Próximo dia"
                        className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                    {/* Input real escondido (sr-only, não display:none) só para abrir o calendário nativo */}
                    <input
                        ref={dateInputRef}
                        type="date"
                        value={data}
                        max={!podeVerHistorico ? today : undefined}
                        disabled={!podeVerHistorico}
                        onChange={(e) => e.target.value && onChangeData(e.target.value)}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="sr-only"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => onChangeData(today)}
                    className="h-11 px-4 rounded-full border border-primary text-primary font-bold text-sm hover:bg-mint/40 shrink-0"
                >
                    Hoje
                </button>
            </div>

            {/* Faixa de pílulas */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-600">Caixas do dia</span>
                    <div className="flex gap-1.5 flex-wrap">
                        {ORDEM_STATUS.filter((s) => (resumoContagem?.[s] || 0) > 0).map((s) => (
                            <span key={s} className={`text-xs font-bold px-2.5 py-1 rounded-full ${PILL_STATUS[s].cls}`}>
                                {resumoContagem[s]} {PILL_STATUS[s].label.toLowerCase()}
                            </span>
                        ))}
                    </div>
                </div>

                {erroPills ? (
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 py-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                        <span>{erroPills}</span>
                        <button
                            type="button"
                            onClick={() => setReloadTick((t) => t + 1)}
                            className="text-primary font-semibold underline underline-offset-2"
                        >
                            tentar de novo
                        </button>
                    </div>
                ) : loadingPills && !pillsData ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-3">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando caixas do dia...
                    </div>
                ) : (
                    <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
                        {pills.length === 0 && (
                            <span className="text-sm text-gray-400 py-2 shrink-0">Nenhum caixa com movimento neste dia.</span>
                        )}
                        {pills.map((c) => {
                            const st = PILL_STATUS[c.status] || PILL_STATUS.ABERTO;
                            const selecionada = c.vendedorId === vendedorId;
                            return (
                                <button
                                    key={c.vendedorId}
                                    type="button"
                                    onClick={() => onChangeVendedor(c.vendedorId)}
                                    title={`${c.vendedorNome} — ${st.label} — ${brl(c.valorAPrestar)}`}
                                    className={`flex-none flex items-center gap-2 rounded-full pl-1.5 pr-3 min-h-11 border-2 ${st.cls} ${selecionada ? 'border-house' : 'border-transparent'} active:scale-[0.97] transition-transform`}
                                >
                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${c.status === 'CONFERIDO' ? 'bg-white/25 text-white' : 'bg-white/70'}`}>
                                        {iniciais(c.vendedorNome)}
                                    </span>
                                    <span className="flex flex-col items-start leading-tight">
                                        <span className="font-bold text-sm whitespace-nowrap">{c.vendedorNome}</span>
                                        <span className="text-[11px] font-semibold opacity-85 whitespace-nowrap">
                                            {st.check ? '✓ ' : ''}{st.label}
                                        </span>
                                    </span>
                                    <span className="font-extrabold text-xs whitespace-nowrap">{brl(c.valorAPrestar)}</span>
                                    {st.pisca && <span className="w-2 h-2 rounded-full bg-current animate-pulse shrink-0" />}
                                </button>
                            );
                        })}
                        {podeVerOutros && (
                            <button
                                type="button"
                                onClick={() => setMostrarOutros((v) => !v)}
                                className="flex-none flex items-center gap-1.5 rounded-full px-3 min-h-11 bg-white border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50"
                            >
                                <Plus className="h-4 w-4" />
                                <span className="text-sm font-semibold">outros</span>
                            </button>
                        )}
                    </div>
                )}

                {podeVerOutros && mostrarOutros && (
                    <div className="mt-2">
                        <SelectBusca
                            value={vendedorId}
                            onChange={(e) => { onChangeVendedor(e.target.value); setMostrarOutros(false); }}
                            className="w-full sm:w-64"
                        >
                            <option value="">Selecione vendedor...</option>
                            {vendedoresDoDia.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.ativo === false ? `${v.nome} (inativo · teve caixa)` : v.nome}
                                </option>
                            ))}
                        </SelectBusca>
                    </div>
                )}

                {pendenciasAnteriores.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-xs sm:text-sm bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-amber-900">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>Caixas de outros dias esperando conferência:</span>
                        {pendenciasAnteriores.map((p) => (
                            <button
                                key={p.data}
                                type="button"
                                onClick={() => onChangeData(p.data)}
                                className="font-bold underline underline-offset-2 hover:text-amber-700"
                            >
                                {fmtDiaMes(p.data)} ({p.qtd})
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CaixaPilulasDia;
