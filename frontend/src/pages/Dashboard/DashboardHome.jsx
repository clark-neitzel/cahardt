import React from 'react';
import { usePerfil } from '../../hooks/usePerfil';
import DashboardGeral from './DashboardGeral';
import DashboardVendedorPessoal from './DashboardVendedorPessoal';
import DashboardEntregador from './DashboardEntregador';
import { Carregando } from './dashUi';

/**
 * Tela inicial: escolhe o dashboard certo para quem entrou.
 *  - Gestão (admin / Pode_Ver_Dashboard_Admin) → Dashboard Geral (5 abas)
 *  - Entregador (Pode_Executar_Entregas) sem meta de venda → Dashboard do Entregador
 *  - Demais (vendedores) → Dashboard pessoal do vendedor
 *
 * Detecção de perfil vem de `usePerfil` (hooks/usePerfil.js) — mesma fonte
 * usada pelo filtro de menu em App.jsx, para nunca divergir.
 */
const DashboardHome = () => {
    const { gestor, entregador, temMeta } = usePerfil();

    if (gestor) return <DashboardGeral />;
    if (entregador) {
        if (temMeta == null) return <Carregando />;
        return temMeta ? <DashboardVendedorPessoal /> : <DashboardEntregador />;
    }
    return <DashboardVendedorPessoal />;
};

export default DashboardHome;
