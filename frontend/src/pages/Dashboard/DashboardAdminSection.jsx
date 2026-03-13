import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, FileText, CheckSquare, DollarSign, TrendingUp, Lock, ListChecks, Clock, Package } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

const DashboardAdminSection = () => {
    const [adminData, setAdminData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAdminData = async () => {
            try {
                const res = await api.get('/admin-dashboard');
                setAdminData(res.data);
            } catch (error) {
                console.error("Erro ao carregar dados admin", error);

            } finally {
                setLoading(false);
            }
        };
        fetchAdminData();
    }, []);

    const formatCurrency = (value) => {
        return `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (loading) {
        return <div className="animate-pulse flex gap-4 my-8">
            <div className="h-24 bg-gray-200 rounded-xl flex-1"></div>
            <div className="h-24 bg-gray-200 rounded-xl flex-1"></div>
            <div className="h-24 bg-gray-200 rounded-xl flex-1"></div>
        </div>;
    }

    if (!adminData) return null;

    return (
        <div className="mb-8">
            <h2 className="text-sm uppercase font-bold text-gray-500 tracking-wider mb-3 flex items-center gap-2">
                <Lock size={16} /> Painel Administrativo
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

                {/* Vendas Hoje */}
                <div className="bg-white border rounded-xl p-4 shadow-sm flex items-start gap-4">
                    <div className="bg-emerald-50 text-emerald-600 p-3 rounded-lg">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Vendas (Hoje)</p>
                        <h4 className="text-xl font-bold text-gray-900">{formatCurrency(adminData.vendasHojeNum)}</h4>
                    </div>
                </div>

                {/* Caixas a Conferir */}
                <Link to="/caixa" className="bg-white hover:border-indigo-500 border rounded-xl p-4 shadow-sm flex items-start gap-4 relative group cursor-pointer transition-all">
                    <div className="bg-indigo-50 text-indigo-600 p-3 rounded-lg group-hover:bg-indigo-100 transition-colors">
                        <CheckSquare size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Caixas a Conferir</p>
                        <h4 className="text-xl font-bold text-gray-900">{adminData.caixasAConferir}</h4>
                        {adminData.caixasAConferir > 0 && (
                            <span className="absolute -top-2 -right-2 flex h-5 w-5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-5 w-5 bg-indigo-500 text-white text-[10px] items-center justify-center font-bold">{adminData.caixasAConferir}</span>
                            </span>
                        )}
                    </div>
                </Link>

                {/* Falhas Sincronização */}
                <Link to="/pedidos?statusEnvio=ERRO" className="bg-white hover:border-red-500 border rounded-xl p-4 shadow-sm flex items-start gap-4 relative group cursor-pointer transition-all">
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg group-hover:bg-red-100 transition-colors">
                        <AlertCircle size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Falhas / Erros ERP</p>
                        <h4 className="text-xl font-bold text-gray-900">{adminData.pedidosComErro}</h4>
                        {adminData.pedidosComErro > 0 && (
                            <span className="absolute -top-2 -right-2 flex h-5 w-5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 text-white text-[10px] items-center justify-center font-bold">{adminData.pedidosComErro}</span>
                            </span>
                        )}
                    </div>
                </Link>

                {/* Pedidos Especiais Pendentes */}
                <Link to="/pedidos?especial=true" className="bg-white hover:border-amber-500 border rounded-xl p-4 shadow-sm flex items-start gap-4 relative group cursor-pointer transition-all">
                    <div className="bg-amber-50 text-amber-600 p-3 rounded-lg group-hover:bg-amber-100 transition-colors">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-500">Notas Pendentes (Especial)</p>
                        <h4 className="text-xl font-bold text-gray-900">{adminData.pedidosEspeciais}</h4>
                    </div>
                </Link>

                {/* Tarefas Vencidas */}
                {adminData.tarefasVencidas > 0 && (
                    <Link to="/tarefas" className="bg-white hover:border-red-500 border rounded-xl p-4 shadow-sm flex items-start gap-4 relative group cursor-pointer transition-all">
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg group-hover:bg-red-100 transition-colors">
                            <ListChecks size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Tarefas Vencidas</p>
                            <h4 className="text-xl font-bold text-red-600">{adminData.tarefasVencidas}</h4>
                            <span className="absolute -top-2 -right-2 flex h-5 w-5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-5 w-5 bg-red-500 text-white text-[10px] items-center justify-center font-bold">{adminData.tarefasVencidas}</span>
                            </span>
                        </div>
                    </Link>
                )}

                {/* Tarefas Hoje */}
                {adminData.tarefasHoje > 0 && (
                    <Link to="/tarefas" className="bg-white hover:border-blue-500 border rounded-xl p-4 shadow-sm flex items-start gap-4 relative group cursor-pointer transition-all">
                        <div className="bg-blue-50 text-blue-600 p-3 rounded-lg group-hover:bg-blue-100 transition-colors">
                            <Clock size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Tarefas (Hoje)</p>
                            <h4 className="text-xl font-bold text-gray-900">{adminData.tarefasHoje}</h4>
                        </div>
                    </Link>
                )}

                {/* Amostras Pendentes */}
                {adminData.amostrasPendentes > 0 && (
                    <Link to="/amostras" className="bg-white hover:border-orange-500 border rounded-xl p-4 shadow-sm flex items-start gap-4 relative group cursor-pointer transition-all">
                        <div className="bg-orange-50 text-orange-600 p-3 rounded-lg group-hover:bg-orange-100 transition-colors">
                            <Package size={24} />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">Amostras Pendentes</p>
                            <h4 className="text-xl font-bold text-gray-900">{adminData.amostrasPendentes}</h4>
                        </div>
                    </Link>
                )}

            </div>
        </div>
    );
};

export default DashboardAdminSection;
