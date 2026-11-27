// Kit de Conexão (.md para humanos/IA, sem segredo) e especificação OpenAPI 3.1 viva para o próprio agente.
//
// Regras críticas (plano D3):
//  - NUNCA inclui token, hash nem mesmo o prefixo literal de tokens da casa (nenhum segredo no kit).
//  - O OpenAPI e a lista de funções do kit mostram APENAS o que é SIM (LIBERADO) ou PEDE para ESTE agente;
//    rotas em NÃO (BLOQUEADO), bloqueios fixos e SO_ADMIN nunca entram.
const catalogo = require('./agenteCatalogoRotas');
const politica = require('./agentePoliticaService');
const matriz = require('./agenteMatrizService');
const modulos = require('../config/agenteModulos');
const padrao = require('../config/agentePoliticaPadrao');
const classificacao = require('../config/agenteClassificacao');
const { rotuloDe } = require('../config/agenteRotulos');
const { EXEMPLOS, exemploDe } = require('../config/agenteExemplos');

function baseUrlDe(req) {
    const envUrl = String(process.env.PUBLIC_APP_URL || process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (envUrl) return envUrl;
    const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https').split(',')[0].trim();
    const host = String(req?.headers?.['x-forwarded-host'] || req?.get?.('host') || 'seu-servidor').split(',')[0].trim();
    return `${proto}://${host}`;
}

function slugNome(nome) {
    return String(nome || 'conexao-api')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'conexao-api';
}

/** Coleta todas as rotas acessíveis (LIBERADO ou PEDE) para este agente, excluindo qualquer BLOQUEADO/fixo/SO_ADMIN/morta. */
async function rotasVisiveisParaAgente(app, vendedorId) {
    // Fail-closed: se o banco de políticas estiver indisponível, propaga 503 em vez de cair no seed aberto.
    const ov = await politica.overridesDe(vendedorId);
    let agenteChatId = null;
    try { agenteChatId = (await require('./chatLukeService').lerConfig()).agenteId; } catch (_) { /* sem chat configurado */ }
    const cat = catalogo.catalogoDe(app);
    const itens = [];
    for (const e of cat.rotas) {
        if (e.complexa) continue;
        if (padrao.ehBloqueioFixo(e.metodo, e.exemplo)) continue;
        if (padrao.ehBloqueioFixoPorChave(e.chave)) continue;
        if (e.exemplo.startsWith('/api/agente/v1/chat/') && agenteChatId !== vendedorId) continue;
        const cls = classificacao.classificar(e.chave);
        if (cls && (cls.soAdmin || cls.morta)) continue;
        const r = politica.resolverEntrada(e, ov);
        if (!r || (r.nivel !== 'LIBERADO' && r.nivel !== 'PEDE')) continue;
        const ehChat = e.exemplo.startsWith('/api/agente/v1/chat/');
        const mod = modulos.moduloDaFamilia(e.familia);
        const acao = r.acao || (cls ? cls.acao : (e.metodo === 'GET' ? 'ver' : 'editar'));
        itens.push({
            chave: e.chave,
            metodo: e.metodo,
            caminho: e.chave.slice(e.metodo.length + 1),
            familia: e.familia,
            modulo: mod ? mod.chave : (ehChat ? 'chat_luke' : 'sistema'),
            rotuloModulo: mod ? mod.rotulo : (ehChat ? 'Chat do Luke' : 'Autodescoberta e Solicitações'),
            acao,
            nivel: modulos.NIVEL_PARA_TELA[r.nivel] || (r.nivel === 'LIBERADO' ? 'SIM' : 'PEDE'),
            rotulo: rotuloDe(e.chave),
            semprePede: (cls && cls.semprePede) || null,
            avisoExterno: (cls && cls.aviso) || null,
            ehChat,
        });
    }
    itens.sort((a, b) => a.modulo.localeCompare(b.modulo) || a.acao.localeCompare(b.acao) || a.chave.localeCompare(b.chave));
    return { ov, itens };
}

/** Converte `/api/contas-pagar/:p/parcelas/:p/baixar` em `{ pathOpenApi, parameters }`. */
function caminhoOpenApi(caminhoNormalizado) {
    let idx = 0;
    const parameters = [];
    const pathOpenApi = String(caminhoNormalizado).replace(/:p\b/g, () => {
        idx += 1;
        const name = idx === 1 ? 'id' : `id${idx}`;
        parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
        return `{${name}}`;
    });
    return { pathOpenApi, parameters };
}

/** Gera especificação OpenAPI 3.1.0 filtrada para o agente autenticado (sem rotas NÃO nem fixas). */
async function gerarOpenApi(app, vendedorId, { baseUrl } = {}) {
    const { ov, itens } = await rotasVisiveisParaAgente(app, vendedorId);
    const paths = {};

    for (const it of itens) {
        const { pathOpenApi, parameters } = caminhoOpenApi(it.caminho);
        if (!paths[pathOpenApi]) paths[pathOpenApi] = {};
        const method = it.metodo.toLowerCase();
        const ehEscrita = it.metodo !== 'GET' && it.acao !== 'ver';
        const ex = exemploDe(it.chave);
        const paramsOp = [...parameters];

        if (ov.matrizAtiva === true && ehEscrita && it.nivel === 'SIM' && !it.ehChat) {
            paramsOp.push({
                name: 'Idempotency-Key',
                in: 'header',
                required: true,
                description: 'Identificador único da operação (8 a 200 caracteres visíveis, sem espaço, ex.: UUID). Repita a MESMA chave com o MESMO corpo em caso de falha de rede.',
                schema: { type: 'string', minLength: 8, maxLength: 200 },
            });
        } else if (ehEscrita && it.ehChat) {
            paramsOp.push({
                name: 'Idempotency-Key',
                in: 'header',
                required: false,
                description: 'Identificador de idempotência da resposta no chat (1 a 100 caracteres visíveis, sem espaço).',
                schema: { type: 'string', minLength: 1, maxLength: 100 },
            });
        }

        const responses = {};
        if (!ehEscrita) {
            responses['200'] = { description: 'Consulta realizada com sucesso.' };
        } else if (it.nivel === 'SIM') {
            responses['200'] = { description: 'Operação executada diretamente (ou 201 na criação). Em repetição legítima traz header Idempotent-Replay: true.' };
            responses['201'] = { description: 'Registro criado com sucesso.' };
            responses['202'] = { description: 'Guarda de segurança rebaixou esta chamada para autorização do administrador (acompanhe em /api/agente/v1/solicitacoes/{id}).' };
            responses['400'] = { description: 'Falta header Idempotency-Key (AGENTE_IDEMPOTENCIA_OBRIGATORIA) ou dados inválidos.' };
            responses['409'] = { description: 'Mesma Idempotency-Key ainda em andamento ou com desfecho incerto.' };
            responses['422'] = { description: 'Idempotency-Key reutilizada com outro pedido/corpo (AGENTE_IDEMPOTENCIA_CONFLITO).' };
        } else {
            responses['202'] = { description: 'Pedido guardado na fila de Solicitações para autorização do administrador (AGENTE_PEDE_AUTORIZACAO). Não reenviar; consulte /api/agente/v1/solicitacoes/{id}.' };
            responses['422'] = { description: 'Corpo inválido para a fila de solicitações (AGENTE_SOLICITACAO_INVALIDA).' };
        }
        responses['401'] = { description: 'Token ausente, inválido, revogado ou expirado.' };
        responses['429'] = { description: 'Limite de requisições por minuto atingido (veja header Retry-After).' };

        const op = {
            summary: it.rotulo,
            tags: [it.rotuloModulo],
            'x-nivel-agente': it.nivel,
            'x-modulo': it.modulo,
            'x-acao': it.acao,
            ...(paramsOp.length ? { parameters: paramsOp } : {}),
            responses,
        };

        const notas = [];
        if (it.semprePede) notas.push(`Guarda fixa: ${it.semprePede}`);
        if (it.avisoExterno) notas.push(`Efeito externo suprimido: ${it.avisoExterno}`);
        if (notas.length) op.description = notas.join(' · ');

        if (it.metodo !== 'GET') {
            const ct = ex ? ex.contentType : 'application/json';
            op.requestBody = {
                required: false,
                content: {
                    [ct]: {
                        schema: ct === 'application/xml' ? { type: 'string' } : { type: 'object' },
                        ...(ex ? { example: ex.corpo } : {}),
                    },
                },
            };
        }

        paths[pathOpenApi][method] = op;
    }

    return {
        openapi: '3.1.0',
        info: {
            title: 'CA-Hardt — API da Conexão',
            version: '2.0.0',
            description: 'Catálogo vivo filtrado pelas permissões atuais desta conexão. Funções bloqueadas (NÃO) e bloqueios fixos de segurança são omitidos.',
        },
        ...(baseUrl ? { servers: [{ url: baseUrl }] } : {}),
        security: [{ bearerToken: [] }],
        components: {
            securitySchemes: {
                bearerToken: {
                    type: 'http',
                    scheme: 'bearer',
                    description: 'Envie o token gerado no painel sempre no header Authorization: Bearer <SEU_TOKEN>. Nunca envie na URL.',
                },
            },
        },
        'x-matriz-ativa': ov.matrizAtiva === true,
        paths,
    };
}

/** Gera o Kit de Conexão em Markdown (sem nenhum segredo) + contagens para a tela. */
async function gerarKit(app, agente, { baseUrl } = {}) {
    const base = baseUrl || 'https://seu-servidor';
    const estadoMatriz = await matriz.ler(app, {
        id: agente.id,
        nome: agente.nome,
        permissoes: await matriz.permissoesDoAgente(agente.id),
    });
    const { itens } = await rotasVisiveisParaAgente(app, agente.id);
    const totalSim = itens.filter((i) => i.nivel === 'SIM').length;
    const totalPede = itens.filter((i) => i.nivel === 'PEDE').length;

    const linhas = [];
    linhas.push(`# Kit de Conexão por API — ${agente.nome}`);
    linhas.push('');
    linhas.push(`> Documento técnico para integrar **${agente.nome}** ao sistema CA-Hardt.`);
    linhas.push('> **Segurança:** este kit **não contém o token secreto**. O token é exibido uma única vez no momento da geração e deve ser guardado em variável de ambiente segura.');
    linhas.push('');
    linhas.push('## 1. Endereço base e autenticação');
    linhas.push('');
    linhas.push(`- **Base URL:** \`${base}\``);
    linhas.push('- **Header obrigatório em todas as chamadas:** `Authorization: Bearer $TOKEN_API_HARDT`');
    linhas.push('- **Proibido enviar token na URL/query string:** qualquer tentativa responde `400 TOKEN_NA_URL`. Revogue imediatamente caso um token vaze em URL ou log.');
    linhas.push('- **Limite de taxa:** padrão de 120 requisições/minuto por token (`429` com header `Retry-After`).');
    linhas.push('');
    linhas.push('### Rotas de autodescoberta (sempre liberadas)');
    linhas.push(`- \`GET ${base}/api/agente/v1/meu-acesso\` — validade do token (\`diasRestantes\`), permissões vivas, matriz ativa e contagem de solicitações pendentes.`);
    linhas.push(`- \`GET ${base}/api/agente/v1/openapi.json\` — especificação OpenAPI 3.1 viva contendo apenas o que esta conexão pode acessar hoje.`);
    linhas.push(`- \`GET ${base}/api/agente/v1/solicitacoes\` e \`GET ${base}/api/agente/v1/solicitacoes/{id}\` — acompanhamento dos pedidos que aguardam autorização do administrador.`);
    linhas.push('');
    linhas.push(`## 2. Matriz atual desta conexão (${estadoMatriz.ativa ? 'ATIVA' : 'DESLIGADA — política somente leitura + fila'})`);
    linhas.push('');
    const cols = estadoMatriz.acoes || [];
    linhas.push(`| Módulo | ${cols.map((c) => c.rotulo).join(' | ')} |`);
    linhas.push(`|---|${cols.map(() => ':---:').join('|')}|`);
    for (const m of estadoMatriz.modulos || []) {
        const vals = cols.map((c) => {
            const cel = m.celulas?.[c.chave];
            if (!cel?.aplicavel) return '—';
            if (!estadoMatriz.ativa) return c.chave === 'ver' ? 'SIM' : 'PEDE';
            return cel.nivel === 'NAO' ? 'NÃO' : cel.nivel;
        });
        linhas.push(`| **${m.rotulo}** | ${vals.join(' | ')} |`);
    }
    linhas.push('');
    linhas.push('## 3. Regras de operação obrigatórias');
    linhas.push('');
    linhas.push('### 3.1 Escrita direta (`SIM`) exige `Idempotency-Key`');
    linhas.push('- Toda escrita classificada como **SIM** exige o header `Idempotency-Key: <identificador-unico>` (8 a 200 caracteres visíveis, sem espaço — recomendado UUID v4 por operação).');
    linhas.push('- Sem o header: `400 AGENTE_IDEMPOTENCIA_OBRIGATORIA` (nada é gravado).');
    linhas.push('- **Falha de rede / timeout:** repita a chamada com a **mesma** `Idempotency-Key` e o **mesmo** corpo. Se já havia concluído, o servidor devolve a resposta original com o header `Idempotent-Replay: true`, sem duplicar.');
    linhas.push('- Mesma chave com corpo ou rota diferentes: `422 AGENTE_IDEMPOTENCIA_CONFLITO`.');
    linhas.push('- Desfecho incerto (`409 AGENTE_IDEMPOTENCIA_INDETERMINADA`): **não** gere chave nova às cegas; consulte antes pela rota de leitura se o registro entrou.');
    linhas.push('');
    linhas.push('### 3.2 Guardas de segurança (quando `SIM` vira `202 PEDE`)');
    linhas.push('Mesmo quando o módulo está em **SIM**, o servidor rebaixa automaticamente para **202 `AGENTE_PEDE_AUTORIZACAO`** nos casos sensíveis:');
    linhas.push('- Despesa enviada já quitada (`pago: true` ou `dataPagamento` preenchida) ou despesa que movimenta itens de estoque.');
    linhas.push('- Lotes grandes, `registrar-entrada` de nota, ajustes de saldo/DRE, receita fora de rascunho, produto com estoque inicial, `forcar=true` em extrato, categoria fora da DRE ou suspeita de duplicata.');
    linhas.push('- Efeitos externos (manifestação SEFAZ, gravação no Google Drive, WhatsApp, Asaas, emissão NF-e) nunca são disparados pela conexão; quando aplicável, a resposta inclui `avisosAgente` explicando o que ficou para uma pessoa concluir na tela.');
    linhas.push('');
    linhas.push('### 3.3 Pedidos que exigem autorização (`202 AGENTE_PEDE_AUTORIZACAO`)');
    linhas.push('- Quando uma chamada responde `202`, o pedido **já está salvo na fila do administrador** (`solicitacaoId`). **Não reenvie.**');
    linhas.push('- Consulte `GET /api/agente/v1/solicitacoes/{solicitacaoId}`:');
    linhas.push('  - `PENDENTE` / `EXECUTANDO`: aguarde.');
    linhas.push('  - `AUTORIZADA`: executada com sucesso (`resultadoStatus`, `resultado`, `idsResultado`). Use `idsResultado.id` em chamadas encadeadas.');
    linhas.push('  - `RECUSADA` / `EXPIRADA`: nada foi executado (`observacaoDecisao`).');
    linhas.push('  - `ERRO`: a rota recusou (4xx/5xx); corrija os dados antes de fazer um novo pedido.');
    linhas.push('  - `ERRO_INDETERMINADO`: queda no meio da execução; **não reenvie** — o administrador verifica e decide na tela.');
    linhas.push('');
    linhas.push('## 4. Códigos de resposta da API');
    linhas.push('');
    linhas.push('| HTTP | `codigo` | Significado |');
    linhas.push('|:---:|---|---|');
    linhas.push('| `200` / `201` | — | Executado na hora (verifique `Idempotent-Replay: true` em reenvios e `avisosAgente` quando houver). |');
    linhas.push('| `202` | `AGENTE_PEDE_AUTORIZACAO` | Guardado na fila de Solicitações para o administrador autorizar. |');
    linhas.push('| `400` | `AGENTE_IDEMPOTENCIA_OBRIGATORIA` | Faltou `Idempotency-Key` numa escrita direta (`SIM`). |');
    linhas.push('| `400` | `TOKEN_NA_URL` | Token enviado na URL/query string (proibido). |');
    linhas.push('| `401` | `AGENTE_TOKEN_INVALIDO` | Token inválido, revogado ou vencido. |');
    linhas.push('| `403` | `AGENTE_SEM_PERMISSAO` | Célula marcada como **NÃO** na matriz (`modulo`, `acao`). |');
    linhas.push('| `403` | `AGENTE_SO_ADMIN` | Função exclusiva de administrador humano. |');
    linhas.push('| `403` | `AGENTE_BLOQUEADO` | Rota fora do escopo ou bloqueio fixo de segurança (`fixo: true`). |');
    linhas.push('| `409` | `AGENTE_IDEMPOTENCIA_EM_ANDAMENTO` / `INDETERMINADA` | Chave em processamento ou com falha incerta anterior. |');
    linhas.push('| `422` | `AGENTE_IDEMPOTENCIA_CONFLITO` / `AGENTE_SOLICITACAO_INVALIDA` | Reuso indevido de chave de idempotência ou corpo inválido para a fila. |');
    linhas.push('| `429` | — | Limite por minuto ou excesso de solicitações pendentes (`Retry-After`). |');
    linhas.push('');
    linhas.push('## 5. Exemplos prontos (`curl`)');
    linhas.push('');
    linhas.push('```bash');
    linhas.push('# 1) Conferir acesso, validade do token e matriz viva');
    linhas.push(`curl -s "${base}/api/agente/v1/meu-acesso" \\`);
    linhas.push('  -H "Authorization: Bearer $TOKEN_API_HARDT"');
    linhas.push('');
    linhas.push('# 2) Consultar contas a pagar');
    linhas.push(`curl -s "${base}/api/contas-pagar?limit=20" \\`);
    linhas.push('  -H "Authorization: Bearer $TOKEN_API_HARDT"');
    linhas.push('');
    linhas.push('# 3) Lançar uma conta a pagar (com Idempotency-Key obrigatória)');
    linhas.push(`curl -s -X POST "${base}/api/contas-pagar" \\`);
    linhas.push('  -H "Authorization: Bearer $TOKEN_API_HARDT" \\');
    linhas.push('  -H "Idempotency-Key: desp-2026-11-energia-001" \\');
    linhas.push('  -H "Content-Type: application/json" \\');
    linhas.push(`  -d '${JSON.stringify(EXEMPLOS['POST /api/contas-pagar'].corpo)}'`);
    linhas.push('```');
    linhas.push('');
    linhas.push(`## 6. Funções disponíveis hoje (${totalSim} em SIM · ${totalPede} em PEDE)`);
    linhas.push('');

    const porModulo = new Map();
    for (const it of itens) {
        if (!porModulo.has(it.rotuloModulo)) porModulo.set(it.rotuloModulo, []);
        porModulo.get(it.rotuloModulo).push(it);
    }
    for (const [nomeMod, lista] of porModulo.entries()) {
        linhas.push(`### ${nomeMod}`);
        for (const it of lista) {
            linhas.push(`- \`[${it.nivel}]\` \`${it.chave}\` — ${it.rotulo}`);
        }
        linhas.push('');
    }

    const markdown = linhas.join('\n');
    return {
        agente: { id: agente.id, nome: agente.nome },
        ativa: estadoMatriz.ativa,
        baseUrl: base,
        nomeArquivo: `kit-conexao-${slugNome(agente.nome)}.md`,
        resumo: {
            sim: totalSim,
            pede: totalPede,
            modulosAtivos: (estadoMatriz.modulos || []).filter((m) =>
                Object.values(m.celulas || {}).some((c) => c?.aplicavel && c.nivel !== 'NAO')
            ).length,
        },
        markdown,
    };
}

module.exports = { gerarKit, gerarOpenApi, baseUrlDe, rotasVisiveisParaAgente };
