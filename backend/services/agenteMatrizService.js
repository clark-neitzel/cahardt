// MATRIZ de permissões da API do agente (módulo × ação): leitura/gravação para a tela do dono e resumo para o agente.
//
// Onde mora o dado: `agente_politicas` — `escopo=MODULO`, `chave=<modulo>.<acao>`, `nivel` LIBERADO|PEDE|BLOQUEADO
// (a API/tela falam SIM|PEDE|NAO). O marcador `escopo=MATRIZ, chave=ativa, nivel=LIBERADO` é o que faz a matriz VALER
// para o agente; sem ele a política antiga segue idêntica (services/agentePoliticaService.js).
// NUNCA em Vendedor.permissoes: "copiar permissões", "restaurar versão" e o agente-criar apagariam a matriz sem erro.
const prisma = require('../config/database');
const politica = require('./agentePoliticaService');
const catalogo = require('./agenteCatalogoRotas');
const padrao = require('../config/agentePoliticaPadrao');
const modulos = require('../config/agenteModulos');
const classificacao = require('../config/agenteClassificacao');
const { rotuloDe } = require('../config/agenteRotulos');

const MAX_CELULAS_POR_LOTE = 200;
const MARCADOR = { escopo: 'MATRIZ', chave: 'ativa' };

function erro(status, msg, codigo) { const e = new Error(msg); e.status = status; if (codigo) e.codigo = codigo; return e; }

// ───────────────────────── o que existe em cada célula (derivado do catálogo real) ─────────────────────────
const cacheMapa = new WeakMap();

/** Para um app: quais funções caem em cada célula, e as listas "fora da matriz". Calculado uma vez por app. */
function mapaDoCatalogo(app) {
    let m = cacheMapa.get(app);
    if (m) return m;
    const cat = catalogo.catalogoDe(app);
    const celulas = new Map();      // `<modulo>.<acao>` -> [entrada]
    const soAdmin = [];             // entradas só de administrador
    const efeitoExterno = [];       // bloqueio fixo por chave
    const naoClassificadas = [];    // escrita sem classificação (nasce em PEDE)
    const excecoesLeitura = [];     // GET fora do `ver` (grava / externo / pesado)
    for (const e of cat.rotas) {
        const mod = modulos.moduloDaFamilia(e.familia);
        if (!mod) continue;
        if (padrao.ehBloqueioFixo(e.metodo, e.exemplo) || padrao.ehSempreLiberado(e.metodo, e.exemplo) || e.complexa) continue;
        if (padrao.ehBloqueioFixoPorChave(e.chave)) { efeitoExterno.push(e); continue; }
        const cls = classificacao.classificar(e.chave);
        if (cls && cls.soAdmin) { soAdmin.push(e); continue; }
        if (cls && cls.morta) continue;
        if (e.metodo === 'GET' && !cls && padrao.EXCECOES_LEITURA[e.chave]) { excecoesLeitura.push(e); continue; }
        let acao = cls ? cls.acao : (e.metodo === 'GET' ? 'ver' : null);
        if (!acao) { naoClassificadas.push(e); acao = 'editar'; }
        const k = modulos.chaveCelula(mod.chave, acao);
        if (!celulas.has(k)) celulas.set(k, []);
        celulas.get(k).push(e);
    }
    m = { celulas, soAdmin, efeitoExterno, naoClassificadas, excecoesLeitura };
    cacheMapa.set(app, m);
    return m;
}

function aplicavel(app, modulo, acao) {
    return (mapaDoCatalogo(app).celulas.get(modulos.chaveCelula(modulo, acao)) || []).length > 0;
}

/** Todas as células aplicáveis: [{ modulo, acao, chave, funcoes }] na ordem dos módulos/ações. */
function celulasAplicaveis(app) {
    const mapa = mapaDoCatalogo(app);
    const saida = [];
    for (const m of modulos.MODULOS) {
        for (const acao of modulos.ACOES) {
            const chave = modulos.chaveCelula(m.chave, acao);
            const n = (mapa.celulas.get(chave) || []).length;
            if (n > 0) saida.push({ modulo: m.chave, acao, chave, funcoes: n });
        }
    }
    return saida;
}

// ───────────────────────── leitura (tela do dono) ─────────────────────────
/** `agente`: { id, nome, permissoes } (permissoes já como objeto). */
async function ler(app, agente) {
    const linhas = await politica.linhasFrescas(agente.id);
    const ov = politica.montarMapas(linhas);
    const linhaDe = new Map();
    for (const l of linhas) if (l.escopo === 'MODULO') linhaDe.set(String(l.chave), l);
    const mapa = mapaDoCatalogo(app);
    const faltamGeral = new Map();
    const lista = modulos.MODULOS.map((m) => {
        const celulas = {};
        for (const acao of modulos.ACOES) {
            const chave = modulos.chaveCelula(m.chave, acao);
            const n = (mapa.celulas.get(chave) || []).length;
            if (!n) { celulas[acao] = { aplicavel: false, nivel: null, funcoes: 0 }; continue; }
            const linha = linhaDe.get(chave);
            let interno = ov.modulo.get(chave) || 'BLOQUEADO';
            if (acao === 'ver' && interno === 'PEDE') interno = 'BLOQUEADO';
            const faltam = interno === 'BLOQUEADO' ? [] : modulos.faltamParaCelula(agente.permissoes, m.chave, acao);
            for (const f of faltam) faltamGeral.set(f.chave, f);
            celulas[acao] = {
                aplicavel: true, nivel: modulos.NIVEL_PARA_TELA[interno], definida: !!linha, funcoes: n,
                padrao: modulos.NIVEL_PARA_TELA[modulos.nivelPadrao(m.chave, acao)],
                niveisAceitos: acao === 'ver' ? ['NAO', 'SIM'] : ['NAO', 'PEDE', 'SIM'],
                prontidao: { ok: faltam.length === 0, faltam },
                ...(linha ? { atualizadoPorNome: linha.atualizadoPorNome, atualizadoEm: linha.atualizadoEm } : {}),
            };
        }
        return { chave: m.chave, rotulo: m.rotulo, familias: m.familias, rotuloBaixar: m.rotuloBaixar, celulas };
    });
    const item = (e) => ({ chave: e.chave, rotulo: rotuloDe(e.chave) });
    return {
        agente: { id: agente.id, nome: agente.nome },
        ativa: ov.matrizAtiva,
        acoes: modulos.ACOES.map((a) => ({ chave: a, rotulo: modulos.ROTULO_ACAO[a] })),
        modulos: lista,
        prontidao: { ok: faltamGeral.size === 0, faltam: [...faltamGeral.values()] },
        sempreBloqueado: [
            { grupo: 'FIXO_DURO', motivo: 'Nunca é do agente: gestão de agentes e usuários, administração, configurações (senhas e chaves), NF-e, SEFAZ, Asaas, WhatsApp e cobrança.', prefixos: padrao.FIXO_DURO_PREFIXOS.map((p) => `/api/${p}`) },
            { grupo: 'EFEITO_EXTERNO', motivo: 'Mandam ou consultam serviço de fora (Conta Azul, Asaas, WhatsApp, mapas).', funcoes: mapa.efeitoExterno.map((e) => ({ ...item(e), motivo: padrao.BLOQUEIO_CHAVES_MATRIZ[e.chave] })) },
            { grupo: 'SO_ADMIN', motivo: 'Só administrador faz (o agente nunca é administrador): configuração e manutenção.', funcoes: mapa.soAdmin.map(item) },
            { grupo: 'FORA_DE_ESCOPO', motivo: 'Módulos com dado pessoal ou sem uso para o agente (RH, ponto, comissões...). Fora da matriz por enquanto.', prefixos: padrao.FORA_DE_ESCOPO_PREFIXOS.map((p) => `/api/${p}`) },
        ],
        excecoesFuncao: linhas.filter((l) => l.escopo === 'FUNCAO').map((l) => ({ chave: l.chave, rotulo: rotuloDe(l.chave), nivel: modulos.NIVEL_PARA_TELA[l.nivel] || l.nivel, motivo: l.motivo || null, atualizadoPorNome: l.atualizadoPorNome, atualizadoEm: l.atualizadoEm })),
        familiasIgnoradas: linhas.filter((l) => l.escopo === 'FAMILIA').map((l) => ({ chave: l.chave, nivel: l.nivel })),
        naoClassificadas: mapa.naoClassificadas.map(item),
        observacao: ov.matrizAtiva
            ? 'Matriz ATIVA: a API do agente obedece a esta tabela (mudança vale em até 15 segundos).'
            : 'Matriz DESLIGADA para este agente: a API segue a política antiga (leitura liberada, toda escrita pede autorização). O que for gravado aqui só passa a valer quando a matriz for ativada.',
    };
}

/** Funções de um módulo (opcionalmente de uma ação), com o nível efetivo de cada uma. */
async function funcoes(app, agenteId, { modulo, acao } = {}) {
    const mod = modulos.moduloPorChave(modulo);
    if (!mod) throw erro(400, 'Informe um módulo válido.');
    if (acao != null && acao !== '' && !modulos.ACOES.includes(String(acao))) throw erro(400, 'Ação inválida.');
    const linhas = await politica.linhasFrescas(agenteId);
    const ovReal = politica.montarMapas(linhas);
    // mostra sempre o que a MATRIZ decidiria (mesmo desligada): a tela é sobre a matriz
    const ov = { ...ovReal, matrizAtiva: true };
    const cat = catalogo.catalogoDe(app);
    const itens = [];
    for (const e of cat.rotas) {
        if (!mod.familias.includes(e.familia)) continue;
        const r = politica.resolverEntrada(e, ov);
        const cls = classificacao.classificar(e.chave);
        const acaoDela = r.acao || (cls ? cls.acao : (e.metodo === 'GET' ? 'ver' : 'editar'));
        if (acao && acaoDela !== acao) continue;
        itens.push({
            chave: e.chave, metodo: e.metodo, rotulo: rotuloDe(e.chave), acao: acaoDela,
            nivel: modulos.NIVEL_PARA_TELA[r.nivel], origem: r.origem, fixo: r.fixo === true,
            soAdmin: !!(cls && cls.soAdmin), semprePede: (cls && cls.semprePede) || null,
            efeitoExterno: (cls && cls.aviso) || null, classificada: !!(cls || e.metodo === 'GET'),
            excecaoLeitura: (e.metodo === 'GET' && padrao.EXCECOES_LEITURA[e.chave]) || null,
        });
    }
    itens.sort((a, b) => a.acao.localeCompare(b.acao) || a.chave.localeCompare(b.chave));
    return { modulo: mod.chave, rotulo: mod.rotulo, acao: acao || null, ativa: ovReal.matrizAtiva, total: itens.length, funcoes: itens };
}

// ───────────────────────── gravação (admin humano) ─────────────────────────
function validarLote(app, body) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const lista = b.celulas === undefined ? [] : b.celulas;
    if (!Array.isArray(lista)) throw erro(400, 'celulas deve ser uma lista de { modulo, acao, nivel }.');
    if (lista.length > MAX_CELULAS_POR_LOTE) throw erro(400, `No máximo ${MAX_CELULAS_POR_LOTE} células por vez.`);
    if (b.ativar !== undefined && typeof b.ativar !== 'boolean') throw erro(400, 'ativar deve ser true ou false.');
    if (!lista.length && b.ativar === undefined) throw erro(400, 'Nada para gravar: informe celulas e/ou ativar.');
    const vistas = new Set();
    const celulas = lista.map((c, i) => {
        const onde = `celulas[${i}]`;
        const mod = modulos.moduloPorChave(c && c.modulo);
        if (!mod) throw erro(400, `${onde}: módulo desconhecido.`);
        const acao = String((c && c.acao) || '');
        if (!modulos.ACOES.includes(acao)) throw erro(400, `${onde}: ação desconhecida.`);
        const bruto = String((c && c.nivel) || '').trim().toUpperCase();
        const nivel = modulos.TELA_PARA_NIVEL[bruto] || (padrao.NIVEIS.includes(bruto) ? bruto : null);
        if (!nivel) throw erro(400, `${onde}: nivel deve ser SIM, PEDE ou NAO.`);
        if (acao === 'ver' && nivel === 'PEDE') throw erro(422, `${onde}: "ver" só aceita SIM ou NAO (não existe pedir autorização para ler).`);
        if (!aplicavel(app, mod.chave, acao)) throw erro(422, `${onde}: "${modulos.ROTULO_ACAO[acao]}" não se aplica a ${mod.rotulo} (não há função desse tipo).`);
        const chave = modulos.chaveCelula(mod.chave, acao);
        if (vistas.has(chave)) throw erro(400, `${onde}: célula repetida no mesmo envio (${chave}).`);
        vistas.add(chave);
        return { modulo: mod.chave, acao, chave, nivel };
    });
    return { celulas, ativar: b.ativar };
}

/**
 * Grava um lote de células (e, se pedido, liga/desliga o marcador). Tudo ou nada.
 * Devolve { ok, ativa, alteradas: [{ modulo, acao, antes, depois }], marcador: 'LIGADO'|'DESLIGADO'|null }.
 * A auditoria é de quem chama, DEPOIS (fora da transação).
 */
async function gravar(app, agenteId, body, autor) {
    const { celulas, ativar } = validarLote(app, body);
    const linhas = await politica.linhasFrescas(agenteId);
    const antes = politica.montarMapas(linhas);
    const mudancas = celulas.filter((c) => antes.modulo.get(c.chave) !== c.nivel);
    const mudaMarcador = ativar !== undefined && ativar !== antes.matrizAtiva;
    if (mudancas.length || mudaMarcador) {
        const quem = { atualizadoPorId: String(autor.id), atualizadoPorNome: autor.nome || 'admin' };
        // Só banco aqui dentro; auditoria fica com a rota, depois, em try/catch próprio.
        await prisma.$transaction(async (tx) => {
            for (const c of mudancas) {
                const onde = { vendedorId: agenteId, escopo: 'MODULO', chave: c.chave };
                await tx.agentePolitica.upsert({
                    where: { vendedorId_escopo_chave: onde },
                    create: { ...onde, nivel: c.nivel, ...quem },
                    update: { nivel: c.nivel, ...quem },
                });
            }
            if (mudaMarcador) {
                const onde = { vendedorId: agenteId, ...MARCADOR };
                if (ativar) {
                    await tx.agentePolitica.upsert({
                        where: { vendedorId_escopo_chave: onde },
                        create: { ...onde, nivel: 'LIBERADO', ...quem },
                        update: { nivel: 'LIBERADO', ...quem },
                    });
                } else {
                    await tx.agentePolitica.deleteMany({ where: onde });
                }
            }
        }, { timeout: 20000, maxWait: 10000 });
        politica.invalidar(agenteId);
    }
    const tela = (n) => (n ? modulos.NIVEL_PARA_TELA[n] : null);
    return {
        ok: true,
        ativa: mudaMarcador ? ativar : antes.matrizAtiva,
        marcador: mudaMarcador ? (ativar ? 'LIGADO' : 'DESLIGADO') : null,
        alteradas: mudancas.map((c) => ({ modulo: c.modulo, acao: c.acao, antes: tela(antes.modulo.get(c.chave)), depois: tela(c.nivel) })),
        semMudanca: !mudancas.length && !mudaMarcador,
    };
}

// ───────────────────────── resumo para o próprio agente (meu-acesso) ─────────────────────────
/** null quando a matriz não está ativa. Usa o cache de overrides (rota quente do agente). */
async function resumoParaAgente(app, vendedorId) {
    const ov = await politica.overridesDe(vendedorId);
    if (!ov.matrizAtiva) return null;
    const porModulo = {};
    for (const c of celulasAplicaveis(app)) {
        let n = ov.modulo.get(c.chave) || 'BLOQUEADO';
        if (c.acao === 'ver' && n === 'PEDE') n = 'BLOQUEADO';
        if (!porModulo[c.modulo]) porModulo[c.modulo] = {};
        porModulo[c.modulo][c.acao] = modulos.NIVEL_PARA_TELA[n];
    }
    return {
        ativa: true,
        modulos: modulos.MODULOS.filter((m) => porModulo[m.chave]).map((m) => ({ modulo: m.chave, rotulo: m.rotulo, familias: m.familias, acoes: porModulo[m.chave] })),
        legenda: 'SIM: executa direto (criar exige o header Idempotency-Key; o servidor pode rebaixar para PEDE por segurança). PEDE: responde 202 e aguarda o dono. NAO: 403 AGENTE_SEM_PERMISSAO. Exceções por função e bloqueios fixos valem acima da matriz.',
    };
}

// ───────────────────────── permissões-base (as do cadastro do usuário) ─────────────────────────
/** Permissões do agente como objeto (aceita string JSON legada). */
async function permissoesDoAgente(agenteId) {
    const { normalizarPermissoes } = require('./agenteCriarService');
    const v = await prisma.vendedor.findUnique({ where: { id: String(agenteId) }, select: { permissoes: true } });
    return normalizarPermissoes(v ? v.permissoes : {});
}

const CHAVES_NUNCA = new Set(['admin', 'usuario_externo']); // agente nunca é admin nem usuário externo
const ehObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const vazio = (v) => v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && v.length === 0);

/** Merge ADITIVO: copia de `origem` só o que FALTA em `alvo`. Nunca apaga nem desliga nada que o alvo já tem. */
function acrescentar(alvo, origem, raiz = true) {
    const saida = { ...alvo };
    for (const [k, v] of Object.entries(origem || {})) {
        if (raiz && CHAVES_NUNCA.has(String(k).trim().toLowerCase())) continue;
        if (ehObjeto(v)) {
            if (ehObjeto(saida[k])) saida[k] = acrescentar(saida[k], v, false);
            else if (vazio(saida[k])) saida[k] = JSON.parse(JSON.stringify(v));
        } else if (vazio(saida[k]) && !vazio(v)) {
            saida[k] = JSON.parse(JSON.stringify(v));
        }
    }
    return saida;
}

/**
 * ACRESCENTA ao agente as permissões que o ADMIN logado tem e o agente não (nunca `admin` nem `Usuario_Externo`).
 * É ADITIVO de propósito: um administrador que só tem `admin: true` não apaga as permissões que o agente já tinha.
 * É o que faz a rota não devolver 403 pelo check dela mesma. O agente NUNCA vira admin.
 * Devolve { ok, alterou, ligadasAntes, ligadasDepois, adicionadas, removidas: [] }. Histórico fora do caminho crítico.
 */
async function sincronizarPermissoesBase(agenteId, admin, { incluirModulos = false } = {}) {
    const { normalizarPermissoes, chavesLigadas } = require('./agenteCriarService');
    const { permissoesBaseDosModulos } = require('./agenteTokenService');
    const origem = normalizarPermissoes(admin.permissoes);
    if (origem.admin !== true) throw erro(403, 'Só um administrador pode servir de referência para as permissões do agente.');
    const antes = await permissoesDoAgente(agenteId);
    const base = incluirModulos ? acrescentar(antes, permissoesBaseDosModulos()) : antes;
    const depois = acrescentar(base, origem);
    if (vazio(depois.Isento_Ponto)) depois.Isento_Ponto = true; // agente não bate ponto
    if (depois.admin === true && antes.admin !== true) throw erro(500, 'Cópia de permissões inválida (o agente nunca é administrador). Nada foi gravado.');
    const la = new Set(chavesLigadas(antes));
    const ld = new Set(chavesLigadas(depois));
    const adicionadas = [...ld].filter((k) => !la.has(k)).sort();
    const removidas = [...la].filter((k) => !ld.has(k)).sort(); // sempre [] (merge aditivo); devolvido para a tela conferir
    if (removidas.length) throw erro(500, 'A sincronização removeria permissões do agente. Nada foi gravado.');
    const alterou = JSON.stringify(antes) !== JSON.stringify(depois);
    if (alterou) {
        await prisma.vendedor.update({ where: { id: String(agenteId) }, data: { permissoes: depois } });
        try {
            await prisma.vendedorPermissoesHistorico.create({
                data: { vendedorId: String(agenteId), alteradoPorId: String(admin.id), alteradoPorNome: admin.nome || 'admin', permissoesAntes: antes, permissoesDepois: depois },
            });
        } catch (e) {
            console.error('[AgenteMatriz] falha ao gravar o histórico de permissões (save já efetivado):', e.message);
        }
    }
    return { ok: true, alterou, ligadasAntes: la.size, ligadasDepois: ld.size, adicionadas, removidas };
}

module.exports = { permissoesDoAgente, sincronizarPermissoesBase, acrescentar, ler, funcoes, gravar, validarLote, resumoParaAgente, mapaDoCatalogo, celulasAplicaveis, aplicavel, MARCADOR, MAX_CELULAS_POR_LOTE };
