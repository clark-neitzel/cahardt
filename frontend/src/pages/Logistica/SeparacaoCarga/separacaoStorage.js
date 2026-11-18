// Separação de Carga — o que fica GUARDADO NO APARELHO (localStorage). Toda leitura/escrita em try/catch:
// em janela privada ou com a memória cheia o acessor pode falhar, e a tela continua em memória.
// Chaves (PLANO seção 4.1):
//   separacao_carga_v1:<userId>:<embarqueId>:carga   — payload do "baixar" (+ baixadoEm, desvioRelogioMs)
//   separacao_carga_v1:<userId>:<embarqueId>:estado  — toques, fila de envio, fila de etiquetas (regravado a CADA toque)
//   separacao_carga_v1:<userId>:ultima               — { embarqueId } p/ reabrir direto (offline não há lista)
import { estadoVazio } from './separacaoCalculo';

const P = 'separacao_carga_v1';
const kCarga = (u, e) => `${P}:${u}:${e}:carga`;
const kEstado = (u, e) => `${P}:${u}:${e}:estado`;
const kUltima = (u) => `${P}:${u}:ultima`;

const ler = (k) => {
    try {
        const raw = localStorage.getItem(k);
        return raw == null ? null : JSON.parse(raw);
    } catch { return null; }
};

// Devolve false se NÃO coube (QuotaExceededError) — a tela avisa "memória do aparelho cheia".
const gravar = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
};

export const dadosVazios = () => ({ estado: estadoVazio(), sujo: { linhas: [], pedidos: [], ordem: false }, concluir: [], etiquetas: [], mudou: null, etqSeq: 0 });

export const lerCarga = (u, e) => ler(kCarga(u, e));
export const gravarCarga = (u, e, carga) => gravar(kCarga(u, e), carga);

export function lerDados(u, e) {
    const d = ler(kEstado(u, e));
    if (!d || typeof d !== 'object') return dadosVazios();
    const v = dadosVazios();
    return {
        ...v, ...d,
        estado: { ...v.estado, ...(d.estado || {}) },
        sujo: { ...v.sujo, ...(d.sujo || {}) },
    };
}
export const gravarDados = (u, e, dados) => gravar(kEstado(u, e), dados);

export const lerUltima = (u) => ler(kUltima(u))?.embarqueId || null;
export const gravarUltima = (u, embarqueId) => gravar(kUltima(u), { embarqueId });

/** Cargas já baixadas neste aparelho por este usuário (para escolher sem internet). */
export function listarCargasBaixadas(u) {
    const out = [];
    try {
        const pre = `${P}:${u}:`;
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith(pre) || !k.endsWith(':carga')) continue;
            const c = ler(k);
            if (c?.carga?.id) {
                const d = lerDados(u, c.carga.id);
                out.push({
                    id: c.carga.id, numero: c.carga.numero, dataSaida: c.carga.dataSaida, motorista: c.carga.motorista,
                    totalPedidos: (c.carga.pedidos || []).length, baixadoEm: c.baixadoEm,
                    pendentes: (d.sujo.linhas.length + d.sujo.pedidos.length + (d.sujo.ordem ? 1 : 0) + d.concluir.length),
                });
            }
        }
    } catch { /* sem localStorage */ }
    return out.sort((a, b) => String(a.dataSaida).localeCompare(String(b.dataSaida)) || (a.numero - b.numero));
}

/** Limpa só carga já concluída E enviada, com saída há mais de 7 dias. NUNCA apaga toque não enviado. */
export function limparAntigas(u) {
    try {
        const limite = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        listarCargasBaixadas(u).forEach((c) => {
            if (!c.dataSaida || c.dataSaida >= limite || c.pendentes > 0) return;
            const d = lerDados(u, c.id);
            if (d.etiquetas.length || !d.estado.conclusao) return;
            localStorage.removeItem(kCarga(u, c.id));
            localStorage.removeItem(kEstado(u, c.id));
        });
    } catch { /* secundário */ }
}
