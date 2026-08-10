import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { useFiltrosSalvos } from '../hooks/useFiltrosSalvos';

/**
 * FiltroPeriodo — PADRÃO DO SISTEMA para todo filtro de data (estilo Conta Azul).
 *
 * Um controle só, em pílula: [‹] [ Este mês · 01/07 – 31/07 ▾ ] [›]
 *  - Presets: Hoje · Últimos 7 dias · Últimos 30 dias · Este mês · Este ano ·
 *    Todo o período · Período personalizado (De/Até dentro do próprio menu).
 *  - As setas pulam o período inteiro (dia, 7d, 30d, mês, ano, ou o tamanho do
 *    intervalo personalizado). Em "Todo o período" ficam desligadas.
 *  - Persistência POR USUÁRIO (via useFiltrosSalvos): o que fica salvo é o
 *    PRESET — recalculado a cada abertura, ninguém fica preso numa data velha.
 *    Só o personalizado salva as datas exatas. A navegação com as setas (off)
 *    NÃO é salva: ao reabrir, volta ao preset.
 *
 * Uso (a página não precisa saber de nada além das datas resolvidas):
 *   const [periodo, periodoCtl] = usePeriodoSalvo('contas-pagar');   // preset padrão: 'mes'
 *   ... params.de = periodo.de; params.ate = periodo.ate;            // 'YYYY-MM-DD' ('' = sem limite)
 *   <FiltroPeriodo periodo={periodo} controle={periodoCtl} rotulo="Vencimento" />
 */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const ymd = (d) => d.toLocaleDateString('en-CA');
const addDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const parseYMD = (s) => (s ? new Date(`${s}T00:00:00`) : null);
const dmy = (s) => (s ? s.split('-').reverse().join('/') : '');
const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');

export const PRESETS_PERIODO = [
    { id: 'hoje', rotulo: 'Hoje' },
    { id: '7d', rotulo: 'Últimos 7 dias' },
    { id: '30d', rotulo: 'Últimos 30 dias' },
    { id: 'mes', rotulo: 'Este mês' },
    { id: 'ano', rotulo: 'Este ano' },
    { id: 'todo', rotulo: 'Todo o período' },
    { id: 'perso', rotulo: 'Período personalizado' },
];

/** Resolve o preset (+ navegação das setas) em datas concretas 'YYYY-MM-DD'. */
export function resolverPeriodo(preset, off = 0, deBase = '', ateBase = '') {
    const h = hoje();
    switch (preset) {
        case 'hoje': { const d = addDias(h, off); return { de: ymd(d), ate: ymd(d) }; }
        case '7d': { const fim = addDias(h, off * 7); return { de: ymd(addDias(fim, -6)), ate: ymd(fim) }; }
        case '30d': { const fim = addDias(h, off * 30); return { de: ymd(addDias(fim, -29)), ate: ymd(fim) }; }
        case 'ano': { const a = h.getFullYear() + off; return { de: `${a}-01-01`, ate: `${a}-12-31` }; }
        case 'todo': return { de: '', ate: '' };
        case 'perso': {
            const de = parseYMD(deBase), ate = parseYMD(ateBase);
            if (!de || !ate) return { de: '', ate: '' };
            const len = Math.round((ate - de) / 86400000) + 1;
            return { de: ymd(addDias(de, off * len)), ate: ymd(addDias(ate, off * len)) };
        }
        case 'mes':
        default: {
            const d = new Date(h.getFullYear(), h.getMonth() + off, 1);
            return { de: ymd(d), ate: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
        }
    }
}

/** Rótulo humano do período atual (nome do preset ou o intervalo concreto). */
function rotuloPeriodo(preset, off, de, ate) {
    if (preset === 'todo') return { nome: 'Todo o período', datas: '' };
    if (preset === 'hoje') return off === 0 ? { nome: 'Hoje', datas: dmy(de) } : { nome: dmy(de), datas: '' };
    if (preset === 'mes') {
        const d = parseYMD(de);
        const nome = off === 0 ? 'Este mês' : `${MESES[d.getMonth()]}/${d.getFullYear()}`;
        return { nome, datas: `${dm(de)} – ${dm(ate)}` };
    }
    if (preset === 'ano') return { nome: off === 0 ? 'Este ano' : de.slice(0, 4), datas: `${dm(de)} – ${dm(ate)}` };
    if (preset === '7d' || preset === '30d') {
        const nome = off === 0 ? `Últimos ${preset === '7d' ? 7 : 30} dias` : `${dmy(de)} até ${dmy(ate)}`;
        return { nome, datas: off === 0 ? `${dm(de)} – ${dm(ate)}` : '' };
    }
    return { nome: de ? `${dmy(de)} até ${dmy(ate)}` : 'Período personalizado', datas: '' };
}

/**
 * Estado do período com persistência por usuário/tela.
 * Devolve [periodo, controle]:
 *   periodo  = { preset, off, de, ate, padrao: bool }  (de/ate já resolvidos)
 *   controle = { escolher(preset, de?, ate?), navegar(delta), limpar() }
 */
export function usePeriodoSalvo(chave, presetPadrao = 'mes') {
    const [salvo, setSalvo] = useFiltrosSalvos(`${chave}:periodo`, { preset: presetPadrao, de: '', ate: '' });
    // Preset salvo que não existe (tela antiga / chave digitada errada no código) volta
    // ao padrão — senão resolveria como "mes" para sempre e o Limpar parecia não limpar.
    const presetValido = PRESETS_PERIODO.some((p) => p.id === salvo.preset) ? salvo.preset : presetPadrao;
    const [estado, setEstado] = useState({
        preset: presetValido,
        off: 0,
        deBase: salvo.de || '',
        ateBase: salvo.ate || '',
    });

    // Espelha no armazenamento SÓ o preset (e as datas do personalizado) — nunca o off.
    useEffect(() => {
        setSalvo({
            preset: estado.preset,
            de: estado.preset === 'perso' ? estado.deBase : '',
            ate: estado.preset === 'perso' ? estado.ateBase : '',
        });
    }, [estado.preset, estado.deBase, estado.ateBase]); // eslint-disable-line react-hooks/exhaustive-deps

    const periodo = useMemo(() => {
        const { de, ate } = resolverPeriodo(estado.preset, estado.off, estado.deBase, estado.ateBase);
        return {
            preset: estado.preset, off: estado.off, de, ate,
            padrao: estado.preset === presetPadrao && estado.off === 0,
        };
    }, [estado, presetPadrao]);

    const controle = useMemo(() => ({
        escolher: (preset, de = '', ate = '') => setEstado({ preset, off: 0, deBase: de, ateBase: ate }),
        navegar: (delta) => setEstado((e) => (e.preset === 'todo' ? e : { ...e, off: e.off + delta })),
        limpar: () => setEstado({ preset: presetPadrao, off: 0, deBase: '', ateBase: '' }),
    }), [presetPadrao]);

    return [periodo, controle];
}

// `ocultarPresets`: ids de PRESETS_PERIODO a esconder do menu (ex.: ['todo'] quando
// o backend da tela exige um intervalo de datas obrigatório).
const FiltroPeriodo = ({ periodo, controle, rotulo, className = '', ocultarPresets = [] }) => {
    const [aberto, setAberto] = useState(false);
    const [de, setDe] = useState('');
    const [ate, setAte] = useState('');
    const raiz = useRef(null);

    useEffect(() => {
        if (!aberto) return;
        const fora = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAberto(false); };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, [aberto]);

    // Ao abrir o menu, os campos do personalizado partem do período em uso
    useEffect(() => {
        if (aberto) { setDe(periodo.de); setAte(periodo.ate); }
    }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

    const r = rotuloPeriodo(periodo.preset, periodo.off, periodo.de, periodo.ate);
    const setasDesligadas = periodo.preset === 'todo';
    const destacado = !periodo.padrao;

    const escolherPreset = (id) => {
        if (id === 'perso') { controle.escolher('perso', de || periodo.de, ate || periodo.ate); return; } // menu segue aberto p/ escolher as datas
        controle.escolher(id);
        setAberto(false);
    };

    const aplicarPersonalizado = () => {
        if (!de || !ate || de > ate) return;
        controle.escolher('perso', de, ate);
        setAberto(false);
    };

    return (
        <div ref={raiz} className={`relative inline-flex items-stretch h-[40px] bg-white border rounded-full ${destacado ? 'border-primary' : 'border-gray-300'} ${className}`}>
            <button
                type="button"
                onClick={() => controle.navegar(-1)}
                disabled={setasDesligadas}
                title="Período anterior"
                className="w-9 flex items-center justify-center rounded-l-full text-primary hover:bg-mint disabled:text-gray-300 disabled:hover:bg-transparent"
            >
                <ChevronLeft className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={() => setAberto(a => !a)}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-2.5 min-w-0 md:min-w-[190px] border-x border-gray-200 hover:bg-gray-50"
            >
                <span className={`text-[13px] font-bold whitespace-nowrap truncate ${destacado ? 'text-primaryDark' : 'text-house'}`}>
                    {rotulo ? `${rotulo}: ` : ''}{r.nome}
                </span>
                {r.datas && <span className="hidden md:inline text-xs text-gray-500 whitespace-nowrap">{r.datas}</span>}
                <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            </button>
            <button
                type="button"
                onClick={() => controle.navegar(1)}
                disabled={setasDesligadas}
                title="Próximo período"
                className="w-9 flex items-center justify-center rounded-r-full text-primary hover:bg-mint disabled:text-gray-300 disabled:hover:bg-transparent"
            >
                <ChevronRight className="h-4 w-4" />
            </button>

            {aberto && (
                <div className="absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 w-[250px] max-w-[calc(100vw-24px)] bg-white border border-gray-200 rounded-xl shadow-lg p-1.5 z-50">
                    {PRESETS_PERIODO.filter(p => !ocultarPresets.includes(p.id)).map(p => {
                        const ativo = periodo.preset === p.id;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => escolherPreset(p.id)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left ${ativo ? 'bg-mint text-primaryDark font-bold' : 'text-gray-700 hover:bg-gray-100'}`}
                            >
                                {p.rotulo}
                                {ativo && <Check className="h-4 w-4 text-primary" />}
                            </button>
                        );
                    })}
                    {periodo.preset === 'perso' && (
                        <div className="border-t border-gray-100 mt-1.5 px-2 pt-2 pb-1">
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-0.5">De</label>
                            <input
                                type="date" value={de} max={ate || undefined}
                                onChange={e => setDe(e.target.value)}
                                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-2 mb-0.5">Até</label>
                            <input
                                type="date" value={ate} min={de || undefined}
                                onChange={e => setAte(e.target.value)}
                                className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={aplicarPersonalizado}
                                disabled={!de || !ate || de > ate}
                                className="mt-2.5 w-full py-2 bg-primary hover:bg-primaryDark disabled:bg-gray-300 text-white rounded-full text-sm font-semibold"
                            >
                                Aplicar
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FiltroPeriodo;
