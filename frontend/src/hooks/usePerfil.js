import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

/**
 * Detecção de PERFIL do usuário logado — fonte única, usada pelo Dashboard
 * (escolhe a tela inicial certa) e pelo menu (App.jsx, filtro por perfil, A2
 * do plano de navegação 09/2026). Antes vivia duplicada dentro de
 * DashboardHome.jsx; extraída para cá para os dois lados nunca divergirem.
 *
 * - gestor / entregador / vendedor: critério ORIGINAL do DashboardHome,
 *   preservado sem mudança (não alterar sem checar as duas telas).
 * - escritorio / pcp: novos, só para o filtro de menu (A2) — decisão do
 *   arquiteto: escritório = tem permissão de Financeiro, Notas Fiscais ou
 *   Embarque e não é gestor nem entregador; PCP = tem alguma permissão de
 *   `pcp` e não é gestor. Perfis não são mutuamente exclusivos na permissão
 *   real (alguém pode acumular função) — para o menu, a ordem de prioridade
 *   é gestor > entregador > escritório > pcp > vendedor (default).
 */
export function usePerfil() {
    const { user, hasPermission } = useAuth();
    const p = user?.permissoes || {};

    const gestor = !!p.admin
        || !!p.Pode_Ver_Dashboard_Admin
        || user?.email === 'clarksonneitzel@gmail.com'
        || (user?.login && user.login.toLowerCase().includes('clark'));

    const entregador = !gestor && (!!p.Pode_Executar_Entregas || !!p.Pode_Ver_Todas_Entregas);

    // Entregador que também vende (tem meta) continua vendo o dashboard de
    // vendedor — mesma consulta que já existia dentro do DashboardHome.
    const [temMeta, setTemMeta] = useState(null);
    useEffect(() => {
        if (!entregador) { setTemMeta(null); return undefined; }
        let ativo = true;
        api.get('/metas/dashboard')
            .then((res) => { if (ativo) setTemMeta(!!res.data?.temMeta); })
            .catch(() => { if (ativo) setTemMeta(false); });
        return () => { ativo = false; };
    }, [entregador]);

    const pcpPerms = p.pcp || {};
    const temAlgumaPermissaoPcp = !!p.admin || Object.values(pcpPerms).some(Boolean);

    const escritorio = !gestor && !entregador && (
        hasPermission('Pode_Acessar_Financeiro_Gerencial')
        || hasPermission('Pode_Acessar_Contas_Receber')
        || hasPermission('Pode_Acessar_Contas_Pagar')
        || hasPermission('Pode_Acessar_Caixa')
        || hasPermission('Pode_Acessar_Notas_Fiscais')
        || hasPermission('Pode_Acessar_Notas_Recebidas')
        || hasPermission('Pode_Acessar_Embarque')
    );

    const pcp = !gestor && temAlgumaPermissaoPcp;

    const vendedor = !gestor && !entregador && !escritorio && !pcp;

    return { gestor, entregador, escritorio, pcp, vendedor, temMeta };
}

export default usePerfil;
