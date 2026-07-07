import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Printer, ChevronDown, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import tarefaService, { hojeStr } from '../../services/tarefaService';

// Parecer do dia — relatório por funcionário (admin / Pode_Ver_Parecer_Tarefas)
const fmtBR = (s) => (s ? s.split('-').reverse().join('/') : '');

const STATUS_BADGE = {
    CONCLUIDA_NO_HORARIO: ['bg-green-100 text-green-800', '✓ no horário'],
    CONCLUIDA_ATRASO: ['bg-yellow-100 text-yellow-800', '✓ com atraso'],
    NAO_CONCLUIDA: ['bg-red-100 text-red-700', '✗ não concluída'],
    AGUARDANDO: ['bg-gray-100 text-gray-700', 'aguardando horário'],
};

const situacaoFuncionario = (f) => {
    if (f.naoConcluidas > 0) return ['bg-red-100 text-red-700', `${f.naoConcluidas} não feita${f.naoConcluidas > 1 ? 's' : ''}`];
    if (f.comAtraso > 0) return ['bg-yellow-100 text-yellow-800', 'Com atrasos'];
    if (f.aguardando > 0) return ['bg-blue-100 text-blue-800', 'Em andamento'];
    return ['bg-green-100 text-green-800', 'Dia completo'];
};

// imprime NA PRÓPRIA PÁGINA (@media print) — padrão do projeto (iPad/PWA)
function imprimirParecer(data, parecer) {
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();
    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    style.textContent = `
        @page { size: A4 portrait; margin: 12mm; }
        #area-impressao { display: none; }
        @media print {
            html, body { margin:0!important; padding:0!important; background:#fff!important; height:auto!important; }
            body > *:not(#area-impressao) { display: none !important; }
            #root { display: none !important; }
            #area-impressao { display: block !important; font-family: -apple-system, sans-serif; color: #111; }
            #area-impressao * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            #area-impressao h1 { font-size: 16pt; margin: 0 0 2mm; }
            #area-impressao .sub { color: #555; font-size: 9pt; margin-bottom: 6mm; }
            #area-impressao table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 6mm; }
            #area-impressao th { background: #1E3932; color: #fff; text-align: left; padding: 2mm; }
            #area-impressao td { border-bottom: 0.3mm solid #ddd; padding: 2mm; }
            #area-impressao .func { font-size: 11pt; font-weight: bold; margin: 4mm 0 2mm; }
        }`;
    document.head.appendChild(style);

    const linhas = (parecer?.funcionarios || []).map(f => `
        <div class="func">${f.nome} — ${f.total} tarefa(s) · ${f.noHorario} no horário · ${f.comAtraso} com atraso · ${f.naoConcluidas} não feita(s) · adiou ${f.adiamentos}×</div>
        <table><tr><th>Hora</th><th>Tarefa</th><th>Criada por</th><th>Situação</th></tr>
        ${f.tarefas.map(t => `<tr><td>${t.hora}</td><td>${t.titulo}</td><td>${t.criadoPor}</td><td>${(STATUS_BADGE[t.status] || ['', t.status])[1]}${t.concluidaHora ? ` (${t.concluidaHora})` : ''}${t.adiamentos ? ` · adiou ${t.adiamentos}×` : ''}</td></tr>`).join('')}
        </table>`).join('');

    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = `
        <h1>Parecer do dia — Tarefas da Equipe</h1>
        <div class="sub">Dia ${fmtBR(data)} · ${parecer?.totais?.total || 0} tarefas ·
            ${parecer?.totais?.noHorario || 0} no horário · ${parecer?.totais?.comAtraso || 0} com atraso ·
            ${parecer?.totais?.naoConcluidas || 0} não concluídas</div>
        ${linhas || '<p>Nenhuma tarefa neste dia.</p>'}`;
    document.body.appendChild(area);

    const limpar = () => { area.remove(); style.remove(); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 60000);
    void area.offsetHeight;
    window.print();
}

const TarefasParecer = () => {
    const [data, setData] = useState(hojeStr());
    const [parecer, setParecer] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [aberto, setAberto] = useState({});

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            setParecer(await tarefaService.parecer(data));
        } catch (e) {
            toast.error(e.response?.data?.error || 'Erro ao carregar o parecer.');
        } finally {
            setCarregando(false);
        }
    }, [data]);

    useEffect(() => { carregar(); }, [carregar]);

    const t = parecer?.totais || { total: 0, noHorario: 0, comAtraso: 0, naoConcluidas: 0, aguardando: 0 };

    return (
        <div className="max-w-full overflow-x-hidden -mx-4 sm:-mx-6 lg:-mx-8">
            {/* Topbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 md:p-6 bg-white border-b border-gray-200">
                <div className="flex items-center gap-2">
                    <Link to="/tarefas" className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" title="Voltar para a agenda">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    <div className="bg-mint p-1.5 md:p-2 rounded-lg">
                        <BarChart3 className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                    </div>
                    <h1 className="text-base md:text-2xl font-bold text-gray-900">Parecer do dia — Tarefas</h1>
                </div>
                <div className="flex items-center gap-2">
                    <input type="date" value={data} onChange={e => setData(e.target.value)}
                        className="border border-gray-300 rounded px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none" />
                    <button onClick={() => imprimirParecer(data, parecer)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 bg-white border border-primary text-primary hover:bg-mint/40 rounded-full font-medium text-xs md:text-sm min-h-[36px]">
                        <Printer className="h-4 w-4" /> Imprimir
                    </button>
                </div>
            </div>

            <div className="p-3 md:p-6 space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"><div className="text-2xl font-bold text-gray-900">{t.total}</div><div className="text-xs text-gray-500 font-medium">Tarefas do dia</div></div>
                    <div className="bg-green-50 rounded-xl border border-green-100 p-4"><div className="text-2xl font-bold text-green-700">{t.noHorario}</div><div className="text-xs text-green-700 font-medium">Concluídas no horário</div></div>
                    <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-4"><div className="text-2xl font-bold text-yellow-700">{t.comAtraso}</div><div className="text-xs text-yellow-700 font-medium">Concluídas com atraso</div></div>
                    <div className="bg-red-50 rounded-xl border border-red-100 p-4"><div className="text-2xl font-bold text-red-700">{t.naoConcluidas}</div><div className="text-xs text-red-600 font-medium">Não concluídas</div></div>
                </div>

                {carregando ? (
                    <div className="p-10 text-center text-gray-400 text-sm">Carregando parecer…</div>
                ) : (parecer?.funcionarios || []).length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">Nenhuma tarefa neste dia.</div>
                ) : (
                    <div className="space-y-3">
                        {parecer.funcionarios.map(f => {
                            const [cls, label] = situacaoFuncionario(f);
                            const abertoF = aberto[f.vendedorId] !== false; // aberto por padrão
                            return (
                                <div key={f.vendedorId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <button onClick={() => setAberto(a => ({ ...a, [f.vendedorId]: !abertoF }))}
                                        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 md:px-5 py-3.5 hover:bg-gray-50 text-left min-h-[44px]">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${abertoF ? '' : '-rotate-90'}`} />
                                            <span className="font-semibold text-gray-900 truncate">{f.nome}</span>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${cls}`}>{label}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 whitespace-nowrap">
                                            {f.total} tarefa{f.total > 1 ? 's' : ''} · {f.noHorario} no horário
                                            {f.comAtraso > 0 && ` · ${f.comAtraso} atraso`}
                                            {f.aguardando > 0 && ` · ${f.aguardando} aguardando`}
                                            {f.adiamentos > 0 && ` · adiou ${f.adiamentos}×`}
                                        </div>
                                    </button>
                                    {abertoF && (
                                        <div className="border-t border-gray-100 p-3 md:p-4 space-y-2">
                                            {f.tarefas.map(tr => {
                                                const [bCls, bLabel] = STATUS_BADGE[tr.status] || ['bg-gray-100 text-gray-700', tr.status];
                                                return (
                                                    <div key={`${tr.id}-${tr.hora}`} className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 rounded-lg px-3.5 py-2.5">
                                                        <span className="text-sm text-gray-800 min-w-0 truncate">
                                                            <span className="font-semibold">{tr.hora}</span> · {tr.titulo}
                                                            <span className="text-gray-400"> — por {tr.criadoPor}</span>
                                                        </span>
                                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${bCls}`}>
                                                            {bLabel}{tr.concluidaHora ? ` — ${tr.concluidaHora}` : ''}{tr.adiamentos > 0 ? ` (adiou ${tr.adiamentos}×)` : ''}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TarefasParecer;
