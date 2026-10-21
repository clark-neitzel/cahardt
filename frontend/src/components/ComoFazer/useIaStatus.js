import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import iaService from '../../services/comoFazerIaService';

// Os botões ✨ só aparecem para quem edita o Como Fazer (admin ou Pode_Editar_Como_Fazer === true,
// igual ao backend) E quando a IA está ligada com chave no servidor (GET /ia/status).
export function useIaStatus() {
    const { user, hasPermission } = useAuth();
    const podeEditar = !!(user?.isAdmin || user?.permissoes?.admin || hasPermission('Pode_Editar_Como_Fazer') === true);
    const [status, setStatus] = useState(null);

    useEffect(() => {
        if (!podeEditar) { setStatus(null); return undefined; }
        let vivo = true;
        iaService.status().then((s) => { if (vivo) setStatus(s || null); }).catch(() => { if (vivo) setStatus(null); });
        return () => { vivo = false; };
    }, [podeEditar]);

    const ativa = podeEditar && !!status && status.ligado === true && status.temChave === true;
    return { ativa, status, podeEditar };
}
