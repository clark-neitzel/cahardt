// ==========================================================================
// Divisão de paradas em K grupos (veículos) balanceados por TEMPO de rota E
// coerentes GEOGRAFICAMENTE (sem misturar regiões do mapa).
//
// Módulo PURO quanto a I/O: não conhece Prisma, HTTP nem faz chamada de rede.
// Usa apenas os helpers matemáticos de osrmService.js (haversineKm,
// coordenadaValida) — nenhum deles toca a rede.
//
// Algoritmo (09/2026 — 2ª versão: DISTÂNCIA decide quem concorre, TEMPO decide
// quem ganha). A 1ª versão (setor angular/bearing) foi REPROVADA pelo QA:
// ângulo não separa "mesma direção, distâncias bem diferentes" — ex.: bloco
// denso de clientes em Joinville (9-16 km da base) e o corredor do litoral
// (Itajaí/Balneário Camboriú, 80-85 km) têm bearing quase igual a partir da
// base (128-165° vs 162-165°) e por isso o setor angular misturava os dois
// numa carga só, mesmo com âncora. A distância HAVERSINE não tem esse
// problema: dois pontos na mesma direção mas a 15 km e a 85 km da base NUNCA
// ficam "perto" um do outro nessa métrica.
//
//  0. Sem coordenadas suficientes (nenhuma parada livre com coordenada válida,
//     ou sem `base` válida) → algoritmo ORIGINAL, só por tempo (inalterado):
//       1. Sementes: as K paradas mais distantes entre si e da base (greedy
//          farthest-point) — uma por grupo ainda vazio.
//       2. Cada parada restante entra na rota/posição de menor custo de
//          inserção, escolhendo o grupo de menor tempo acumulado resultante.
//
//  1. Com coordenadas: cada grupo ganha uma REFERÊNCIA GEOGRÁFICA (um ponto
//     {lat,lng}, não mais um ângulo), calculada uma única vez, ANTES da
//     atribuição:
//       - grupo com âncora (`ancorasPorGrupo[g]`) → referência FIXA = a âncora.
//       - grupo sem âncora mas que já tem parada `fixos` (travada) →
//         referência FIXA = centroide (média simples de lat/lng) das paradas
//         fixas dele.
//       - demais grupos → SEM referência ainda; ganham uma referência
//         DINÂMICA (o centroide de tudo que já colocaram) assim que recebem a
//         primeira parada na atribuição abaixo, e ela é recalculada a cada
//         parada nova que entra nesse grupo.
//
//  2. Atribuição — da parada MAIS DISTANTE da base para a MAIS PERTO (mesma
//     ordem de antes: equilibra melhor o horário, quem vai longe decide
//     primeiro o "esqueleto" da rota). Para cada parada livre com coordenada
//     válida `c` (com `distBaseKm` = haversine(base, c) já calculada):
//       a. candidatos = grupos que JÁ TÊM referência (fixa ou dinâmica),
//          ordenados por haversine(c, referência do grupo) — cada vez mais
//          perto primeiro.
//       b. Nenhum candidato ainda (nenhum grupo tem referência) → abre o
//          grupo de MENOR ÍNDICE sem referência; a própria parada vira a
//          semente (referência dinâmica = ela).
//       c. Há candidato, mas o mais próximo está mais longe que
//          `distBaseKm × MARGEM_ABRIR_NOVO_GRUPO` (1,3×) E ainda sobra grupo
//          sem referência → abre esse grupo vazio com a parada, em vez de
//          forçar a entrada num grupo de região claramente diferente. É essa
//          regra que fecha o corredor do litoral sem misturar com Joinville,
//          mesmo os dois tendo bearing parecido.
//       d. Senão → o candidato mais próximo entra na disputa; o 2º só entra
//          junto se `d2 ≤ d1 × (1 + MARGEM_DISPUTA_PROPORCIONAL)` (20%) — só
//          nesse caso de disputa real de fronteira o desempate é por TEMPO
//          (menor durRota(grupo) + custo de inserção, a conta de sempre).
//       e. Parada sem coordenada utilizável → grupo de MENOR tempo acumulado
//          (como sempre foi, sem depender de geografia).
//       f. Toda vez que uma parada entra num grupo cuja referência NÃO é
//          fixa, a referência dinâmica desse grupo é recalculada (centroide
//          de todas as paradas com coordenada válida que já estão nele).
//
//  3. Refino: mesma passada de sempre (mover parada não fixa se reduzir o
//     MAIOR tempo do conjunto), mas os candidatos a receber a parada são só
//     os 2 grupos de referência mais próxima por HAVERSINE — usando as
//     referências já CONGELADAS ao final do passo 2 (não recalcula centroide
//     aqui). Sem coordenada utilizável para a parada → testa todos os grupos,
//     como sempre.
//
// Em qualquer caminho: paradas `fixos` (já roteirizadas/entregues/cobradas)
// nunca são movidas — apenas contam no tempo acumulado do grupo delas.
// ==========================================================================
const { haversineKm, coordenadaValida } = require('./osrmService');

// 2º candidato só disputa a parada com o 1º se a distância dele à referência
// do grupo for no máximo 20% maior que a do 1º — fora disso, nem entra na
// conta de tempo (evita puxar parada pra um grupo claramente mais longe só
// porque a rota dele "por acaso" está com folga).
const MARGEM_DISPUTA_PROPORCIONAL = 0.20;

// O candidato mais próximo só é aceito se a distância dele não for MUITO maior
// que a distância da própria parada até a base — acima disso (e havendo grupo
// livre), é sinal de que a parada pertence a uma região ainda sem grupo, não
// à região do candidato (é essa regra que separa corredores distantes que têm
// bearing parecido ao de um bloco denso mais perto da base — o motivo da 1ª
// versão ter sido reprovada).
// Valor calibrado em testes (09/2026): 1,5× deixava passar um cenário de 3
// clusters SEM âncora bem separados (proporção real ~1,41×, misturava 2
// deles); 1,3× separa esse caso e continua muito acima da proporção real do
// cenário de produção que motivou a correção (corredor do litoral ~4-9× mais
// longe que o bloco denso de Joinville) — folga ampla pros dois lados.
const MARGEM_ABRIR_NOVO_GRUPO = 1.3;

// Centroide (média simples de lat/lng) de uma lista de pontos {lat,lng}.
function centroide(pontos) {
    if (!pontos.length) return null;
    let sLat = 0, sLng = 0;
    for (const p of pontos) { sLat += p.lat; sLng += p.lng; }
    return { lat: sLat / pontos.length, lng: sLng / pontos.length };
}

// Os 2 grupos com referência mais próxima de `c` por distância haversine —
// usado só no refino, sobre as referências já congeladas do passo 2 (sem
// margem de disputa: aqui é só "quais 2 grupos fazem sentido testar mover").
function doisGruposMaisProximos(c, ref, K) {
    const dist = [];
    for (let g = 0; g < K; g++) {
        if (ref[g] == null) continue;
        dist.push({ g, d: haversineKm(c, ref[g]) });
    }
    dist.sort((a, b) => a.d - b.d);
    return dist.slice(0, 2).map(x => x.g);
}

/**
 * @param {number[][]} matriz  (n+1)×(n+1) durações em segundos; linha/coluna 0 = base.
 * @param {number} k           número de grupos (veículos).
 * @param {object} [opcoes]
 * @param {Array<{parada:number, grupo:number}>} [opcoes.fixos]
 *        paradas presas a um grupo (índice 1..n → grupo 0..k-1). Usado para
 *        entregas já roteirizadas/concluídas que não podem trocar de carga.
 * @param {Array<{lat:number,lng:number}|null>} [opcoes.ancorasPorGrupo]
 *        âncora de região por grupo (tamanho k; posição sem âncora = null/ausente).
 * @param {Array<{lat:number,lng:number}>} [opcoes.coordsParadas]
 *        coordenada de cada parada, alinhada por índice: coordsParadas[i] = parada i+1.
 * @param {{lat:number,lng:number}} [opcoes.base]
 *        coordenada da base (origem/retorno), usada como referência das distâncias.
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

    // ── Coordenada e distância-à-base de cada parada livre, quando válida ─────
    const base = opcoes.base;
    const coordsParadas = Array.isArray(opcoes.coordsParadas) ? opcoes.coordsParadas : null;
    const temBase = Boolean(base && coordenadaValida(base));

    const coordUtil = new Map();   // parada -> {lat,lng}, só quando válida
    const distBaseKm = new Map();  // parada -> haversine(base, coordenada)
    if (temBase && coordsParadas) {
        for (const p of livres) {
            const c = coordsParadas[p - 1];
            if (c && coordenadaValida(c)) {
                coordUtil.set(p, c);
                distBaseKm.set(p, haversineKm(base, c));
            }
        }
    }
    const usaCoordenadas = coordUtil.size > 0;

    // Referência geográfica por grupo (ponto {lat,lng}, não ângulo) — vive fora
    // do if/else porque o refino, mais abaixo, também precisa lê-la (já
    // CONGELADA nesse ponto: o refino nunca recalcula).
    const ref = new Array(K).fill(null);
    const refFixa = new Array(K).fill(false); // true = âncora ou centroide dos fixos (nunca recalcula)

    if (!usaCoordenadas) {
        // ── Sem informação geográfica suficiente: algoritmo ORIGINAL (só tempo) ──
        // 1. Sementes para grupos vazios: paradas mais distantes entre si e da base
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

        // 2. Inserção mais barata paralela, balanceando o tempo acumulado
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
    } else {
        // ── NOVO: referência geográfica por PONTO (não por ângulo) ────────────
        // Passo 1 — referência fixa, calculada uma única vez.
        const ancoras = Array.isArray(opcoes.ancorasPorGrupo) ? opcoes.ancorasPorGrupo : [];
        for (let g = 0; g < K; g++) {
            const a = ancoras[g];
            if (a && coordenadaValida(a)) {
                ref[g] = { lat: Number(a.lat), lng: Number(a.lng) };
                refFixa[g] = true;
            }
        }
        // Grupo sem âncora explícita mas que já tem parada FIXA (travada) ganha
        // referência FIXA = centroide das suas paradas fixas — sem isso, o grupo
        // dependeria só da referência dinâmica (que só nasce na atribuição) e
        // podia atrair parada de região errada antes de "aprender" onde está.
        for (let g = 0; g < K; g++) {
            if (ref[g] != null || !grupos[g].length) continue;
            const coordsFixos = grupos[g]
                .map(p => coordsParadas && coordsParadas[p - 1])
                .filter(c => c && coordenadaValida(c));
            if (coordsFixos.length) {
                ref[g] = centroide(coordsFixos);
                refFixa[g] = true;
            }
        }

        // Passo 2 — atribuição, da parada MAIS DISTANTE da base para a MAIS
        // PERTO (mesmo motivo de sempre: equilibra melhor o horário).
        livres.sort((a, b) => matriz[0][b] - matriz[0][a]);
        for (const p of livres) {
            const c = coordUtil.get(p);
            let gEscolhido, posEscolhido;

            if (!c) {
                // Sem coordenada utilizável: grupo de menor tempo acumulado agora.
                let melhorG = 0, melhorT = Infinity;
                for (let gg = 0; gg < K; gg++) {
                    const t = durRota(grupos[gg]);
                    if (t < melhorT) { melhorT = t; melhorG = gg; }
                }
                gEscolhido = melhorG;
                posEscolhido = melhorInsercao(grupos[gEscolhido], p).pos;
            } else {
                const dBase = distBaseKm.get(p);

                const candidatos = [];
                const semReferencia = [];
                for (let g = 0; g < K; g++) {
                    if (ref[g] == null) semReferencia.push(g);
                    else candidatos.push({ g, d: haversineKm(c, ref[g]) });
                }
                candidatos.sort((a, b) => a.d - b.d);

                if (candidatos.length === 0) {
                    // Nenhum grupo com referência ainda: abre o de menor índice —
                    // a própria parada vira a semente (referência dinâmica).
                    gEscolhido = semReferencia[0];
                    posEscolhido = melhorInsercao(grupos[gEscolhido], p).pos;
                } else if (candidatos[0].d > dBase * MARGEM_ABRIR_NOVO_GRUPO && semReferencia.length > 0) {
                    // O candidato mais próximo está bem mais longe do que a própria
                    // parada está da base — sinal de região nova, não de fronteira
                    // com o candidato. Fecha um corredor sem forçar mistura.
                    gEscolhido = semReferencia[0];
                    posEscolhido = melhorInsercao(grupos[gEscolhido], p).pos;
                } else {
                    // Disputa real: 1º candidato + 2º só se estiver na margem de
                    // 20% — entre eles, desempate por tempo (a conta de sempre).
                    const contendores = [candidatos[0].g];
                    if (candidatos.length > 1 && candidatos[1].d <= candidatos[0].d * (1 + MARGEM_DISPUTA_PROPORCIONAL)) {
                        contendores.push(candidatos[1].g);
                    }
                    let melhor = null;
                    for (const gg of contendores) {
                        const ins = melhorInsercao(grupos[gg], p);
                        const total = durRota(grupos[gg]) + ins.custo;
                        if (!melhor || total < melhor.total) melhor = { g: gg, pos: ins.pos, total };
                    }
                    gEscolhido = melhor.g;
                    posEscolhido = melhor.pos;
                }
            }

            grupos[gEscolhido].splice(posEscolhido, 0, p);
            grupoDe.set(p, gEscolhido);

            // Referência dinâmica: recalcula o centroide do grupo (só quando a
            // referência dele não é fixa) toda vez que ele recebe uma parada.
            if (!refFixa[gEscolhido]) {
                const coords = grupos[gEscolhido].map(pp => coordUtil.get(pp)).filter(Boolean);
                if (coords.length) ref[gEscolhido] = centroide(coords);
            }
        }

        // A partir daqui `ref` fica CONGELADA — o refino abaixo só lê, nunca recalcula.
    }

    // ── Refino: uma passada movendo paradas (não fixas) se reduzir o pior tempo.
    // No caminho geográfico, só entre os 2 grupos de referência mais próxima por
    // HAVERSINE (impede o refino de atravessar o mapa); sem coordenada utilizável
    // pra essa parada, testa todos os grupos (igual ao algoritmo original).
    if (K > 1) {
        for (let p = 1; p <= n; p++) {
            if (fixosSet.has(p)) continue;
            const gAtual = grupoDe.get(p);
            if (gAtual == null) continue;

            const duracoes = grupos.map(durRota);
            const maxAtual = Math.max(...duracoes);
            const rotaSem = grupos[gAtual].filter(x => x !== p);
            const durSem = durRota(rotaSem);

            let candidatosG;
            if (usaCoordenadas && coordUtil.has(p)) {
                // `ref` já está CONGELADA aqui (passo 2 terminou) — o refino só lê.
                candidatosG = doisGruposMaisProximos(coordUtil.get(p), ref, K)
                    .filter(g => g !== gAtual);
            } else {
                candidatosG = [];
                for (let g = 0; g < K; g++) if (g !== gAtual) candidatosG.push(g);
            }

            let melhor = null;
            for (const g of candidatosG) {
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
