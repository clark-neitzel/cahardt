// ==========================================================================
// Divisão de paradas em K grupos (veículos) balanceados por TEMPO de rota.
//
// Módulo PURO: não conhece Prisma, OSRM nem HTTP. Recebe a matriz de durações
// e devolve índices — assim o algoritmo pode ganhar restrições novas no futuro
// (capacidade do veículo, janela de horário...) sem mudar o contrato: entram
// como campos novos em `opcoes`.
//
// Algoritmo (inserção mais barata paralela):
//  1. Sementes: as K paradas mais distantes entre si e da base (greedy
//     farthest-point) — uma por grupo ainda vazio.
//  2. Cada parada restante entra na rota/posição de menor custo de inserção,
//     escolhendo o grupo que resulta no menor tempo acumulado (balanceia
//     DURAÇÃO, não contagem de paradas).
//  3. Refino: uma passada tentando mover cada parada para outro grupo quando
//     isso reduz o MAIOR tempo de rota do conjunto.
// ==========================================================================

/**
 * @param {number[][]} matriz  (n+1)×(n+1) durações em segundos; linha/coluna 0 = base.
 * @param {number} k           número de grupos (veículos).
 * @param {object} [opcoes]
 * @param {Array<{parada:number, grupo:number}>} [opcoes.fixos]
 *        paradas presas a um grupo (índice 1..n → grupo 0..k-1). Usado para
 *        entregas já roteirizadas/concluídas que não podem trocar de carga.
 * @returns {{ grupos: number[][] }} índices (1..n) por grupo, na ordem interna da rota.
 */
function particionarParadas(matriz, k, opcoes = {}) {
    const n = (matriz?.length || 1) - 1;
    const K = Math.max(1, k | 0);
    const grupos = Array.from({ length: K }, () => []);
    if (n <= 0) return { grupos };

    const grupoDe = new Map();   // parada -> índice do grupo
    const fixosSet = new Set();

    for (const f of (opcoes.fixos || [])) {
        const p = f?.parada, g = f?.grupo;
        if (Number.isInteger(p) && p >= 1 && p <= n && Number.isInteger(g) && g >= 0 && g < K && !grupoDe.has(p)) {
            grupos[g].push(p);
            grupoDe.set(p, g);
            fixosSet.add(p);
        }
    }

    let livres = [];
    for (let p = 1; p <= n; p++) if (!grupoDe.has(p)) livres.push(p);

    // Duração total da rota base → paradas → base
    const durRota = (rota) => {
        if (!rota.length) return 0;
        let d = matriz[0][rota[0]];
        for (let i = 0; i < rota.length - 1; i++) d += matriz[rota[i]][rota[i + 1]];
        d += matriz[rota[rota.length - 1]][0];
        return d;
    };

    // Melhor posição para inserir p na rota (custo clássico de inserção)
    const melhorInsercao = (rota, p) => {
        if (!rota.length) return { pos: 0, custo: matriz[0][p] + matriz[p][0] };
        let best = null;
        for (let pos = 0; pos <= rota.length; pos++) {
            const antes = pos === 0 ? 0 : rota[pos - 1];
            const depois = pos === rota.length ? 0 : rota[pos];
            const custo = matriz[antes][p] + matriz[p][depois] - matriz[antes][depois];
            if (!best || custo < best.custo) best = { pos, custo };
        }
        return best;
    };

    // ── 1. Sementes para grupos vazios: paradas mais distantes entre si e da base
    const referencias = [0, ...grupoDe.keys()]; // base + paradas já colocadas (fixas)
    for (let g = 0; g < K; g++) {
        if (grupos[g].length > 0 || !livres.length) continue;
        let melhor = null;
        for (const p of livres) {
            const distMin = Math.min(...referencias.map(r => matriz[r][p]));
            if (!melhor || distMin > melhor.distMin) melhor = { p, distMin };
        }
        grupos[g].push(melhor.p);
        grupoDe.set(melhor.p, g);
        referencias.push(melhor.p);
        livres = livres.filter(p => p !== melhor.p);
    }

    // ── 2. Inserção mais barata paralela, balanceando o tempo acumulado
    // Mais distantes da base primeiro: elas definem o "esqueleto" das rotas.
    livres.sort((a, b) => matriz[0][b] - matriz[0][a]);
    for (const p of livres) {
        let melhor = null;
        for (let g = 0; g < K; g++) {
            const ins = melhorInsercao(grupos[g], p);
            const total = durRota(grupos[g]) + ins.custo; // tempo acumulado resultante
            if (!melhor || total < melhor.total) melhor = { g, pos: ins.pos, total };
        }
        grupos[melhor.g].splice(melhor.pos, 0, p);
        grupoDe.set(p, melhor.g);
    }

    // ── 3. Refino: uma passada movendo paradas (não fixas) se reduzir o pior tempo
    if (K > 1) {
        for (let p = 1; p <= n; p++) {
            if (fixosSet.has(p)) continue;
            const gAtual = grupoDe.get(p);
            if (gAtual == null) continue;

            const duracoes = grupos.map(durRota);
            const maxAtual = Math.max(...duracoes);
            const rotaSem = grupos[gAtual].filter(x => x !== p);
            const durSem = durRota(rotaSem);

            let melhor = null;
            for (let g = 0; g < K; g++) {
                if (g === gAtual) continue;
                const ins = melhorInsercao(grupos[g], p);
                const novoMax = Math.max(...duracoes.map((d, i) =>
                    i === gAtual ? durSem : i === g ? d + ins.custo : d
                ));
                if (novoMax < maxAtual - 1 && (!melhor || novoMax < melhor.novoMax)) {
                    melhor = { g, pos: ins.pos, novoMax };
                }
            }
            if (melhor) {
                grupos[gAtual] = rotaSem;
                grupos[melhor.g].splice(melhor.pos, 0, p);
                grupoDe.set(p, melhor.g);
            }
        }
    }

    return { grupos };
}

module.exports = { particionarParadas };
