/**
 * Utilitário único de NOME DE CIDADE (padronização de grafia).
 * Espelho: frontend/src/utils/cidade.js — mantenha os dois em sincronia.
 * (O espelho do frontend nasce na Fase 4; até lá este arquivo é a única fonte.)
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * ---------------------------
 * Cidade é string livre em todo o sistema e a mesma cidade convive no banco em
 * várias grafias: "Joinville" / "JOINVILLE", "Itapoá" / "ITAPOA", "  itapoa  ".
 * A origem principal é `services/consultaCnpjService.js`: a BrasilAPI devolve o
 * município em MAIÚSCULO e a CNPJá devolve em Title Case — como uma é fallback da
 * outra, o MESMO CNPJ grava caixa diferente dependendo de qual respondeu.
 *
 * O estrago aparece longe: quem casa cidade faz lookup EXATO. Em
 * `services/comissaoService.js` o realizado por cidade é lido com
 * `realizadoPorCidade[mc.cidade] || 0` — se a meta diz "Itapoá" e os pedidos
 * dizem "ITAPOA", o realizado cai em 0, `bateu` fica `false` em silêncio e o
 * vendedor perde bônus sem ninguém ver erro nenhum. Metas e dashboards sofrem do
 * mesmo mal (dropdown com a cidade repetida, número dividido em duas linhas).
 *
 * AS DUAS FUNÇÕES FAZEM COISAS OPOSTAS — não trocar uma pela outra
 * ---------------------------------------------------------------
 *   chaveCidade(v)      → forma CANÔNICA DE COMPARAÇÃO: sem acento, minúscula.
 *                         Serve para CASAR e AGRUPAR. **NUNCA gravar isto no banco
 *                         nem mostrar na tela** — "itapoa" não é nome de cidade.
 *   normalizarCidade(v) → forma OFICIAL DE GRAVAÇÃO: "Itapoá", "Jaraguá do Sul".
 *                         Decisão do dono: nome com acento, caixa normal.
 *                         Nada de CAIXA ALTA.
 *
 * POR QUE EXISTE O DICIONÁRIO `CIDADES_CANONICAS`
 * -----------------------------------------------
 * `normalizarCidade` SOZINHA não consegue transformar "ITAPOA" em "Itapoá": o
 * acento se perdeu no dado e Title Case não inventa acento — sairia "Itapoa",
 * uma TERCEIRA grafia errada. O dicionário é o único lugar que devolve o acento
 * perdido, e também o único lugar onde erro de digitação ("Jonville" →
 * "Joinville") pode ser corrigido.
 *
 * Nesta fase (Fase 0) o dicionário está VAZIO de propósito: ele é preenchido
 * depois que o dono aprovar a saída de `GET /api/admin-exec/diag-cidades`, que
 * lista as grafias reais do banco e propõe o nome final de cada grupo.
 */

/** Preposições que ficam em minúscula no meio do nome (pt-BR). Nunca na 1ª palavra. */
const PREPOSICOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * DICIONÁRIO DE NOMES OFICIAIS: chaveCidade → nome como deve ser GRAVADO.
 *
 * ⚠️ VAZIO NA FASE 0 — de propósito. Preencher só depois que o dono aprovar a
 * saída de `GET /api/admin-exec/diag-cidades` (cada grupo com
 * `precisaAprovacao: true` vira uma linha aqui). Preencher no chute reescreveria
 * dado de produção com um nome que ninguém conferiu.
 *
 * Regras para preencher:
 *   - A CHAVE é sempre o resultado de `chaveCidade(...)` (sem acento, minúscula).
 *   - O VALOR é o nome oficial do IBGE, com acento e caixa normal.
 *   - Serve também para erro de digitação: a chave errada aponta para o nome certo.
 *     Isso NUNCA é decidido pelo código — só entra aqui com aprovação do dono.
 *
 * Exemplos (comentados até a aprovação):
 *   // 'itapoa':            'Itapoá',
 *   // 'balneario camboriu': 'Balneário Camboriú',
 *   // 'jonville':          'Joinville',   // erro de digitação conhecido
 */
const CIDADES_CANONICAS = {
    // ═══════════════════════════════════════════════════════════════════════════
    // FASE 1 — PREENCHIDO EM 2026-08 COM A APROVAÇÃO DO DONO, UMA LINHA POR VEZ.
    // Base: `GET /api/admin-exec/diag-cidades` rodado contra PRODUÇÃO (PostgreSQL
    // 17.10): 121 grafias para 103 cidades, 82 registros a corrigir.
    // NÃO acrescentar linha aqui sem aprovação — cada uma REESCREVE dado real.
    // ═══════════════════════════════════════════════════════════════════════════

    // --- 1) GRAFIAS DIVERGENTES (a MESMA cidade escrita de vários jeitos) --------
    // O que o dicionário resolve aqui é o acento que o dado perdeu: sem estas linhas
    // "ITAPOA" viraria "Itapoa" (Title Case não inventa acento) — uma TERCEIRA grafia
    // errada. As sem acento ('joinville', 'araquari'...) entram do mesmo jeito porque
    // travam a grafia oficial: sem a linha, o nome final passa a depender de qual
    // grafia é a mais frequente no banco NAQUELE dia.
    'joinville':          'Joinville',
    'jaragua do sul':     'Jaraguá do Sul',
    'itajai':             'Itajaí',
    'itapoa':             'Itapoá',
    'camboriu':           'Camboriú',
    'araquari':           'Araquari',
    'guaramirim':         'Guaramirim',
    'barra velha':        'Barra Velha',
    'balneario picarras': 'Balneário Piçarras',
    'luiz alves':         'Luiz Alves',
    'salvador':           'Salvador',
    'sao francisco do sul': 'São Francisco do Sul',

    // --- 2) ERRO DE DIGITAÇÃO -> Joinville (10 leads, aprovados um a um) ---------
    // ⚠️ ESTAS LINHAS **FUNDEM CHAVES DIFERENTES**, e é o único lugar do sistema que faz
    // isso. `chaveCidade('Joiville')` é 'joiville' — uma chave DISTINTA de 'joinville'.
    // Consequências, já tratadas em quem consome:
    //   · `GET /api/admin-exec/diag-cidades` agrupa por chave, então "Joiville" continua
    //     sendo um GRUPO separado — mas com o mesmo `nomeFinal` do grupo 'joinville'. A
    //     rota sinaliza isso em `fundeCom` / `fusoesPorNomeFinal` para o dono não ler
    //     "Joiville" como cidade à parte.
    //   · Pode nascer colisão NOVA de `meta_cidades` (@@unique[meta, cidade]) que o
    //     diagnóstico anterior não via: meta em "Joiville" + meta em "Joinville" viram a
    //     mesma linha. Por isso o diagnóstico foi rodado DE NOVO depois deste dicionário.
    // Levantamento aprovado: Joiville (4) · Joinvile (2) · Joinvlle (1) · Noinville (1)
    // · Joinvillevile (1) · Joinyille (1) — todos em `leads`, nenhum em `clientes`.
    //
    // 'joinyille' entrou DEPOIS das outras: o diagnóstico o apontava como distância 1 de
    // Joinville, mas ele não estava na primeira lista aprovada e por isso ficou de fora de
    // propósito (código não decide erro de digitação sozinho). O dono aprovou na conferência
    // da Fase 1 — são 10 leads no total agora.
    'joiville':      'Joinville',
    'joinvile':      'Joinville',
    'joinvlle':      'Joinville',
    'noinville':     'Joinville',
    'joinvillevile': 'Joinville',
    'joinyille':     'Joinville',

    // --- 3) NOME INCOMPLETO NO CADASTRO ----------------------------------------
    // "São Francisco " (2 leads) é São Francisco do Sul — o dono confirmou (já existem
    // 56 clientes na grafia completa). Também FUNDE CHAVES: 'sao francisco' -> o nome
    // da chave 'sao francisco do sul'. Se um dia aparecer o São Francisco de MG/SP/PB
    // na base, esta linha precisa ser revista.
    'sao francisco': 'São Francisco do Sul',

    // --- 4) SENTINELA: "Sem cidade" NÃO É CIDADE -------------------------------
    // Existem 2 linhas em `meta_cidades` com o texto literal "Sem cidade" (é o rótulo
    // que `adminDashboard.js`/`dashboards.js` usam para cliente sem cidade, e alguém o
    // salvou como se fosse uma cidade). O dono mandou NÃO MEXER — vai olhar depois.
    //
    // Esta linha existe justamente para NÃO mexer: sem ela, o Title Case transformaria
    // "Sem cidade" em "Sem Cidade" e o backfill da Fase 2 reescreveria as duas linhas,
    // criando a cidade fantasma "Sem Cidade" nos dropdowns. Mapeando a chave para o
    // texto EXATO que já está no banco, `normalizarCidade` vira no-op e o backfill não
    // encosta nelas. Quando o dono decidir o que fazer, esta linha sai junto.
    'sem cidade': 'Sem cidade',

    // --- MUNICÍPIOS COM "D'" MAIÚSCULO (Rondônia) — DESATIVADOS DE PROPÓSITO ---
    // O Title Case sozinho NÃO acerta estes: ver o aviso em `capitalizarPalavra`. O IBGE
    // grafa "d'" minúsculo em SP e "D'" MAIÚSCULO em RO, e a regra do código segue SP.
    // Sem estas linhas ativas, o backfill da Fase 1 reescreveria o nome oficial errado.
    //
    // Ficam COMENTADAS porque (a) o dicionário só é preenchido com aprovação do dono e
    // (b) a base é de SC/PR — cidade de RO é improvável. Se alguma aparecer no
    // `GET /api/admin-exec/diag-cidades`, é só descomentar a linha correspondente ANTES
    // de a Fase 1 rodar. As chaves abaixo já são o resultado de `chaveCidade(...)`.
    //
    // "alta floresta d'oeste":     "Alta Floresta D'Oeste",
    // "espigao d'oeste":           "Espigão D'Oeste",
    // "machadinho d'oeste":        "Machadinho D'Oeste",
    // "nova brasilandia d'oeste":  "Nova Brasilândia D'Oeste",
    // "santa luzia d'oeste":       "Santa Luzia D'Oeste",
    // "sao felipe d'oeste":        "São Felipe D'Oeste",
};

/**
 * Forma canônica de COMPARAÇÃO: sem acento, minúscula, espaços colapsados.
 * "ITAPOA", "Itapoá" e "  itapoa  " → todos "itapoa".
 *
 * ⚠️ SÓ para casar/agrupar/deduplicar. NUNCA gravar no banco nem exibir.
 * Vazio, nulo, indefinido ou só espaços → '' (string vazia).
 *
 * Quem chama tem que tratar '' como "sem cidade" e NUNCA criar um grupo com ele:
 * `routes/adminDashboard.js` e `routes/dashboards.js` usam o rótulo 'Sem cidade'
 * para o vazio — deixar '' virar grupo criaria a cidade fantasma "Sem Cidade"
 * nos dropdowns.
 *
 * NFC × NFD: esta função JÁ é imune, e por isso NÃO leva o `.normalize('NFC')` que
 * `normalizarCidade` leva. O `.normalize('NFD')` da 1ª linha é uma normalização
 * canônica: duas strings canonicamente equivalentes ("á" de um caractere e "a" +
 * acento combinante) viram exatamente a MESMA string NFD antes de qualquer outra
 * coisa acontecer. Logo `chaveCidade(NFC) === chaveCidade(NFD)` sempre — está
 * coberto por teste em `scripts/teste-cidade.js`. Acrescentar NFC aqui seria só
 * custo: a saída perde os acentos de todo jeito.
 */
function chaveCidade(v) {
    return String(v == null ? '' : v)
        .normalize('NFD')                     // separa a letra do acento (á → a + U+0301)
        .replace(/[\u0300-\u036f]/g, '')     // remove os acentos (inclui o cedilha do ç)
        .toLowerCase()
        .replace(/\s+/g, ' ')        // colapsa espaço duplo / tab / quebra de linha
        .trim();
}

/** A string tem algum acento/cedilha? Usado para escolher a grafia melhor num grupo. */
function temAcento(v) {
    const decomposta = String(v == null ? '' : v).normalize('NFD');
    return decomposta.replace(/[\u0300-\u036f]/g, '') !== decomposta;
}

/** Deixa maiúscula a primeira LETRA do trecho (pula pontuação: "s." → "S."). */
function capitalizarTrecho(trecho) {
    const baixo = trecho.toLowerCase();
    const i = baixo.search(/\p{L}/u);
    if (i < 0) return baixo; // sem letra nenhuma (número, pontuação) — deixa como está
    return baixo.slice(0, i) + baixo[i].toUpperCase() + baixo.slice(i + 1);
}

/**
 * Capitaliza uma palavra respeitando hífen e apóstrofo do português:
 *   "mogi-guacu"  → "Mogi-Guacu"   (cada lado do hífen é capitalizado)
 *   "d'oeste"     → "d'Oeste"      (a partícula "d" fica minúscula)
 *   "sant'ana"    → "Sant'Ana"     (não é partícula — capitaliza os dois lados)
 * `primeira` = é a primeira palavra do nome? (aí nem partícula fica minúscula)
 *
 * ⚠️ O IBGE NÃO É UNIFORME NO "d'" — e não há como o Title Case adivinhar qual é qual:
 *   São Paulo grafa MINÚSCULO:  "Santa Bárbara d'Oeste", "Palmeira d'Oeste"  ← esta regra acerta
 *   Rondônia  grafa MAIÚSCULO:  "Alta Floresta D'Oeste", "Espigão D'Oeste",
 *                               "Machadinho D'Oeste", "Nova Brasilândia D'Oeste",
 *                               "Santa Luzia D'Oeste", "São Felipe D'Oeste"  ← esta regra ERRA
 * A mesma palavra, o mesmo formato, duas grafias oficiais diferentes: é impossível
 * decidir olhando só a string. A regra fica como está (minúsculo, que é o caso de SP e
 * o mais comum) e os municípios com D' MAIÚSCULO **precisam entrar em
 * `CIDADES_CANONICAS`** — é exatamente para isso que o dicionário existe. Sem a entrada,
 * o backfill da Fase 1 reescreveria "Alta Floresta D'Oeste" como "Alta Floresta d'Oeste",
 * ou seja, trocaria o nome oficial por uma grafia errada.
 * Ver a lista pronta (comentada) em `CIDADES_CANONICAS`.
 */
function capitalizarPalavra(palavra, primeira) {
    return palavra
        .split('-')
        .map((pedacoHifen, iHifen) => {
            const partes = pedacoHifen.split(/['’]/);
            if (partes.length === 1) return capitalizarTrecho(pedacoHifen);
            const separadores = pedacoHifen.match(/['’]/g) || [];
            return partes
                .map((parte, i) => {
                    // A partícula de elisão "d'" fica minúscula, exceto abrindo o nome.
                    const ehParticula = i === 0 && parte.toLowerCase() === 'd'
                        && !(primeira && iHifen === 0);
                    return ehParticula ? 'd' : capitalizarTrecho(parte);
                })
                .reduce((acc, parte, i) => (i === 0 ? parte : acc + separadores[i - 1] + parte), '');
        })
        .join('-');
}

/**
 * Fixa a forma UNICODE do nome em NFC (composta). `null` continua `null`.
 *
 * POR QUE ISTO EXISTE — não é firula de Unicode, é o mesmo bug de comissão
 * ---------------------------------------------------------------------
 * O mesmo "Itapoá" chega ao sistema de duas formas invisivelmente diferentes:
 *   NFC → o "á" é UM caractere  (U+00E1)
 *   NFD → o "á" são DOIS        ("a" + U+0301, o acento combinante)
 * Na tela são idênticas; para o JavaScript são strings DIFERENTES — `===` devolve
 * `false`, `Object.keys` conta duas chaves, `Map`/`Set` guardam duas entradas.
 * (`localeCompare(..., 'pt-BR')` devolve 0 porque compara o TEXTO, não os bytes:
 * é por isso que o problema não aparece lendo a tela.)
 *
 * E `===` é exatamente como o sistema casa cidade:
 *   - `services/comissaoService.js` faz `realizadoPorCidade[mc.cidade] || 0` — meta
 *     em NFC contra pedido em NFD cai em 0, `bateu` fica `false` em silêncio e o
 *     vendedor perde bônus. É o bug que motivou este projeto, agora por um motivo
 *     que nem olhando o banco dá para ver.
 *   - o `Map` de candidatos de `utils/cidadeNomeFinal.js` criaria DOIS candidatos
 *     para o mesmo nome, empatando consigo mesmo e caindo no Title Case sem acento.
 *
 * Como `normalizarCidade` é a função de GRAVAÇÃO, fixar a forma aqui é o que impede
 * o banco de sair da Fase 1 com NFC e NFD misturados.
 *
 * NFC (e não NFD) porque é a forma que praticamente todo dado brasileiro já usa —
 * a medição do banco local em 08/2026 achou 0 de 72 grafias em NFD — e a que
 * Postgres, JSON e HTML tratam como natural.
 *
 * `chaveCidade` NÃO precisa disto: ela já começa com `.normalize('NFD')`, que é
 * canônico e faz as duas formas convergirem sozinhas (ver o comentário lá).
 */
function fixarNFC(nome) {
    return nome == null ? null : String(nome).normalize('NFC');
}

/**
 * Forma OFICIAL DE GRAVAÇÃO do nome da cidade.
 *
 *   1. tira espaço sobrando (bordas e duplicados);
 *   2. se a chave está em `CIDADES_CANONICAS`, devolve o nome oficial de lá
 *      (é o ÚNICO caminho que devolve acento que o dado perdeu);
 *   3. senão, aplica Title Case pt-BR — 1ª palavra sempre maiúscula, preposições
 *      (de/da/do/das/dos/e) em minúscula, respeitando hífen e "d'";
 *   4. vazio / nulo / indefinido / só espaços → `null` (nunca '' e nunca um nome).
 *   5. o que sair de qualquer um dos caminhos acima passa por `fixarNFC` — a forma
 *      Unicode é FIXA, senão duas gravações visualmente iguais não se casam com `===`.
 *
 * Atenção: sem entrada no dicionário, "ITAPOA" vira "Itapoa" (sem acento) — está
 * certo do ponto de vista do código e ERRADO do ponto de vista do nome. Por isso a
 * Fase 1 só roda depois que o dono aprovar o dicionário.
 */
function normalizarCidade(v) {
    // Ponto ÚNICO de saída: o `fixarNFC` embrulha a função inteira de propósito, para
    // que qualquer caminho — dicionário, Title Case, ou o que a Fase 1 acrescentar —
    // saia na mesma forma Unicode sem ninguém precisar lembrar disso.
    return fixarNFC(nomeDeGravacao(v));
}

/** Miolo do `normalizarCidade` (sem a fixação de forma Unicode). Não exportado de propósito. */
function nomeDeGravacao(v) {
    const bruto = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!bruto) return null;

    // hasOwnProperty: sem isso uma cidade chamada "constructor"/"toString" acharia um
    // método do Object.prototype e devolveria uma FUNÇÃO no lugar do nome.
    const chave = chaveCidade(bruto);
    if (Object.prototype.hasOwnProperty.call(CIDADES_CANONICAS, chave)) {
        // O dicionário é escrito à mão: nada garante que o autor da linha digitou o
        // acento em NFC. Sai por `fixarNFC` junto com todo o resto.
        return CIDADES_CANONICAS[chave];
    }

    return bruto
        .split(' ')
        .map((palavra, i) => {
            if (i > 0 && PREPOSICOES.has(chaveCidade(palavra))) return palavra.toLowerCase();
            return capitalizarPalavra(palavra, i === 0);
        })
        .join(' ');
}

module.exports = {
    PREPOSICOES,
    CIDADES_CANONICAS,
    chaveCidade,
    temAcento,
    fixarNFC,
    normalizarCidade,
};
