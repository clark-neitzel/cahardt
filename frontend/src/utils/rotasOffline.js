// Telas que precisam abrir SEM internet (Separação de Carga na câmara fria; Conferência da carga pelo motorista).
// Fonte única: AuthContext, App (PrivateRoute/RootRoute/menu), DiarioContext/Gateway e PendenciaRotaGateway usam isto.
// O prefixo de cada tela é o mesmo de pages/Logistica/SeparacaoCarga/config.js (CONFIG_*.prefixoStorage).
export const ROTAS_OFFLINE = [
    { rota: '/separacao-carga', prefixo: 'separacao_carga_v1', perm: 'Pode_Separar_Carga' },
    { rota: '/conferencia-motorista', prefixo: 'conferencia_motorista_v1', perm: 'Pode_Conferir_Carga_Motorista' },
];

/** O caminho (pathname) é uma tela offline? */
export const ehRotaOffline = (pathname) => ROTAS_OFFLINE.some((r) => String(pathname || '').startsWith(r.rota));

const lerJson = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

/** Qual tela offline abrir para este usuário (snapshot guardado): a que ele pode usar E que tem carga em andamento
 *  neste aparelho (`:ultima`); se as duas, a de carga baixada mais recentemente. null = nenhuma. */
export function rotaOfflinePara(snapshot) {
    const uid = snapshot?.id;
    if (!uid) return null;
    const p = snapshot.permissoes || {};
    let melhor = null;
    let melhorQuando = -1;
    ROTAS_OFFLINE.forEach((r) => {
        if (!(p.admin || p[r.perm] === true)) return;
        const embarqueId = lerJson(`${r.prefixo}:${uid}:ultima`)?.embarqueId;
        if (!embarqueId) return;
        const quando = Date.parse(lerJson(`${r.prefixo}:${uid}:${embarqueId}:carga`)?.baixadoEm || '') || 0;
        if (quando > melhorQuando) { melhorQuando = quando; melhor = r.rota; }
    });
    return melhor;
}
