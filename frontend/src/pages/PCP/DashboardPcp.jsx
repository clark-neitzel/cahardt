import { useState, useEffect } from 'react';
import { BarChart3, ClipboardList, AlertTriangle, TrendingUp, Lightbulb, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import pcpSugestaoService from '../../services/pcpSugestaoService';

const KpiCard = ({ icon: Icon, label, value, color = 'blue', subtitle, onClick }) => (
    <div
        onClick={onClick}
        className={`bg-white rounded-xl border border-gray-200 p-5 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
        <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{label}</span>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-${color}-50`}>
                <Icon className={`h-5 w-5 text-${color}-500`} />
            </div>
        </div>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
);

export default function DashboardPcp() {
    const navigate = useNavigate();
    const [kpis, setKpis] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const data = await pcpSugestaoService.dashboard();
                setKpis(data);
            } catch {
                toast.error('Erro ao carregar dashboard PCP');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) return (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
    );

    if (!kpis) return null;

    return (
        <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <BarChart3 className="h-6 w-6 text-blue-500" />
                    Dashboard PCP
                </h1>
                <p className="text-sm text-gray-500 mt-1">Visao geral do planejamento e controle de producao</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <KpiCard
                    icon={ClipboardList}
                    label="Planejadas"
                    value={kpis.ordens.planejadas}
                    color="blue"
                    subtitle="Aguardando inicio"
                    onClick={() => navigate('/pcp/ordens')}
                />
                <KpiCard
                    icon={TrendingUp}
                    label="Em Producao"
                    value={kpis.ordens.emProducao}
                    color="yellow"
                    subtitle="No chao de fabrica"
                    onClick={() => navigate('/pcp/painel')}
                />
                <KpiCard
                    icon={BarChart3}
                    label="Finalizadas"
                    value={kpis.ordens.finalizadas}
                    color="green"
                    subtitle="Total geral"
                />
                <KpiCard
                    icon={Lightbulb}
                    label="Sugestoes Pendentes"
                    value={kpis.sugestoesPendentes}
                    color="yellow"
                    subtitle="Aguardando decisao"
                    onClick={() => navigate('/pcp/sugestoes')}
                />
            </div>

            {/* Producao da Semana */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Producao da Semana</h3>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-800">{kpis.producaoSemana.volume.toFixed(1)}</span>
                        <span className="text-sm text-gray-400">unidades produzidas</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{kpis.producaoSemana.ordens} ordem(ns) finalizada(s) esta semana</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Resumo de Ordens</h3>
                    <div className="space-y-2">
                        {[
                            { label: 'Planejadas', value: kpis.ordens.planejadas, color: 'bg-blue-500' },
                            { label: 'Em Producao', value: kpis.ordens.emProducao, color: 'bg-yellow-500' },
                            { label: 'Finalizadas', value: kpis.ordens.finalizadas, color: 'bg-green-500' },
                            { label: 'Canceladas', value: kpis.ordens.canceladas, color: 'bg-red-500' },
                        ].map(item => {
                            const total = kpis.ordens.planejadas + kpis.ordens.emProducao + kpis.ordens.finalizadas + kpis.ordens.canceladas;
                            const pct = total > 0 ? (item.value / total * 100) : 0;
                            return (
                                <div key={item.label} className="flex items-center gap-3">
                                    <span className="text-xs text-gray-500 w-24">{item.label}</span>
                                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                                        <div className={`${item.color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-xs font-medium text-gray-700 w-8 text-right">{item.value}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Itens Abaixo do Minimo */}
            {kpis.itensAbaixoMinimo.length > 0 && (
                <div className="bg-white rounded-xl border border-red-200 p-5">
                    <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Itens Abaixo do Estoque Minimo ({kpis.itensAbaixoMinimo.length})
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 border-b">
                                    <th className="pb-2 font-medium">Item</th>
                                    <th className="pb-2 font-medium">Tipo</th>
                                    <th className="pb-2 font-medium text-right">Atual</th>
                                    <th className="pb-2 font-medium text-right">Minimo</th>
                                    <th className="pb-2 font-medium text-right">Deficit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {kpis.itensAbaixoMinimo.map(item => {
                                    const atual = parseFloat(item.estoqueAtual);
                                    const minimo = parseFloat(item.estoqueMinimo);
                                    const deficit = minimo - atual;
                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50">
                                            <td className="py-2 font-medium text-gray-800">{item.nome}</td>
                                            <td className="py-2">
                                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{item.tipo}</span>
                                            </td>
                                            <td className="py-2 text-right">{atual.toFixed(1)} {item.unidade}</td>
                                            <td className="py-2 text-right">{minimo.toFixed(1)} {item.unidade}</td>
                                            <td className="py-2 text-right font-semibold text-red-600">-{deficit.toFixed(1)} {item.unidade}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
