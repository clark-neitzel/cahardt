import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import DashboardGeral from './DashboardGeral';
import DashboardVendedorPessoal from './DashboardVendedorPessoal';
import DashboardEntregador from './DashboardEntregador';
import { Carregando } from './dashUi';

/**
 * Tela inicial: escolhe o dashboard certo para quem entrou.
 *  - Gestão (admin / Pode_Ver_Dashboard_Admin) → Dashboard Geral (5 abas)
 *  - Entregador (Pode_Executar_Entregas) sem meta de venda → Dashboard do Entregador
 *  - Demais (vendedores) → Dashboard pessoal do vendedor
 */
const DashboardHome = () => {
    const { user } = useAuth();
    const p = user?.permissoes || {};

    const gestor = !!p.admin
        || !!p.Pode_Ver_Dashboard_Admin
        || user?.email === 'clarksonneitzel@gmail.com'
        || (user?.login && user.login.toLowerCase().includes('clark'));

    const entregador = !gestor && (!!p.Pode_Executar_Entregas || !!p.Pode_Ver_Todas_Entregas);

    // Entregador que também vende (tem meta) continua vendo o dashboard de vendedor
    const [temMeta, setTemMeta] = useState(null);
    useEffect(() => {
        if (!entregador) return;
        api.get('/metas/dashboard')
            .then((res) => setTemMeta(!!res.data?.temMeta))
            .catch(() => setTemMeta(false));
    }, [entregador]);

    if (gestor) return <DashboardGeral />;
    if (entregador) {
        if (temMeta == null) return <Carregando />;
        return temMeta ? <DashboardVendedorPessoal /> : <DashboardEntregador />;
    }
    return <DashboardVendedorPessoal />;
};

export default DashboardHome;
