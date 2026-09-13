import L from 'leaflet';
import { COR_SELECAO } from './coresMapa';

// Pino do Mapa de Clientes: círculo de 18 px dividido em fatias iguais
// (conic-gradient) — cliente com entrega SEG e QUI mostra as duas cores.
// A área de toque é maior que o desenho (44 px, regra mobile do CLAUDE.md):
// o divIcon tem 44×44 transparente com o círculo no centro.
//
// Animação do destaque (par de vizinhos) só com transform/opacity — nunca
// box-shadow (trava o scroll no Android Chrome).

const TAM = 18;      // círculo desenhado
const HIT = 44;      // área de toque
const ID_ESTILO = 'estilo-mapa-clientes-pino';

function garantirEstilo() {
    if (typeof document === 'undefined' || document.getElementById(ID_ESTILO)) return;
    const style = document.createElement('style');
    style.id = ID_ESTILO;
    style.textContent = `
@keyframes mc-pulso { 0% { transform: scale(1); opacity: .85; } 100% { transform: scale(2.4); opacity: 0; } }
.mc-anel { position:absolute; inset:0; border-radius:50%; border:3px solid ${COR_SELECAO}; will-change: transform, opacity; animation: mc-pulso 1.4s ease-out infinite; pointer-events:none; }
@media (prefers-reduced-motion: reduce) { .mc-anel { animation: none; opacity: .9; } }
`;
    document.head.appendChild(style);
}

export function fundoFatias(cores) {
    const lista = (cores && cores.length) ? cores : ['#6b7280'];
    if (lista.length === 1) return lista[0];
    const passo = 100 / lista.length;
    const partes = lista.map((c, i) => `${c} ${(i * passo).toFixed(2)}% ${((i + 1) * passo).toFixed(2)}%`);
    return `conic-gradient(${partes.join(', ')})`;
}

// cores: array de cores (1 = sólido, N = fatias)
// opts.selecionado → contorno dourado; opts.esmaecido → opacidade baixa;
// opts.destaque → anel pulsante (par de vizinhos)
export function criarIconeFatias(cores, { selecionado = false, esmaecido = false, destaque = false } = {}) {
    garantirEstilo();
    const off = (HIT - TAM) / 2;
    const html =
        `<div style="position:relative;width:${HIT}px;height:${HIT}px">` +
        (destaque ? `<div class="mc-anel" style="left:${off - 4}px;top:${off - 4}px;width:${TAM + 8}px;height:${TAM + 8}px;inset:auto"></div>` : '') +
        `<div style="position:absolute;left:${off}px;top:${off}px;width:${TAM}px;height:${TAM}px;border-radius:50%;` +
        `background:${fundoFatias(cores)};border:2px solid #fff;box-sizing:border-box;` +
        `box-shadow:0 1px 4px rgba(0,0,0,.45);${esmaecido ? 'opacity:.35;' : ''}` +
        `${selecionado ? `outline:3px solid ${COR_SELECAO};outline-offset:1px;` : ''}"></div></div>`;
    return L.divIcon({ className: '', html, iconSize: [HIT, HIT], iconAnchor: [HIT / 2, HIT / 2] });
}
