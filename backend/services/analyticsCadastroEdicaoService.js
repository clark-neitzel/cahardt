// Editar o cadastro pelo PAINEL DO BOT (nov/2026, pedido do Clarkson 13/11):
// "Tem que corrigir ali, na aba do bot mesmo. Corrigir os dados do cliente, deixar tudo certinho
// ali dentro e salvar. Aí altera no sistema e já some da lista de clientes pra arrumar, ou inativa."
//
// Rotas (analyticsRoutes): GET  /v1/cadastro-opcoes            — listas dos campos (vendedor, tabela, dias…)
//                          PATCH /v1/clientes/:id/cadastro      — grava os campos da regra da Ana + telefones + classificação
//                          POST /v1/clientes/:id/inativar       — inativa NA HORA (ação da equipe, com confirmação no painel)
//                          GET  /v1/clientes/:id/contexto       — visitas, pedidos, alterações e auditoria (só leitura)
//
// 13/11 (2ª rodada, Clarkson: "todas as alterações que precisa ser feita possam ser feitas dentro do bot"):
// o PATCH também grava identificação (razão social, fantasia, CNPJ/CPF), e-mail, IE + indicador,
// endereço (cidade só da lista oficial, com a trilha do endereço), observações, aviso comercial
// fixado, condições permitidas, canais de atendimento, categoria (segmento) e nome/papel das pessoas
// do WhatsApp — as MESMAS validações do PATCH /clientes/:uuid do app. Fica de fora de propósito:
// ponto GPS (passa pela aprovação do módulo de GPS), reativar, indicação, ciclo/insight e o
// espelho "também fornecedor" (a classificação cobre o uso do bot).
//
// Segurança: mesma chave da API (x-analytics-key) + x-analytics-agent OBRIGATÓRIO e com prefixo de
// quem pode editar cadastro (env ANALYTICS_CADASTRO_AGENTES, padrão "painel" — o bot manda
// "painel-<nome de quem salvou>"). Agente comercial (ana, luke) continua só pedindo inativação.
// Tudo vai pro histórico de alterações (cliente_alteracoes, autor = o agente) e para o audit_logs
// (CLIENTE_ALTERADO), igual ao PATCH do app. Nada aqui manda WhatsApp.
//
// Telefone: precisa ter DDD + número (régua utils/telefoneWhatsapp). Grava SEM o 55 (o 55 é posto
// na hora do envio). Número incompleto é recusado com o motivo.
const prisma = require('../config/database');
const { erro, idOpcional, dec, num } = require('./analyticsComum');
const { exigirAgente } = require('./clienteContatoRegras');
const { avaliarTelefone } = require('../utils/telefoneWhatsapp');
const historico = require('./clienteHistoricoService');
const classif = require('./clienteClassificacaoService');
const telefonesSvc = require('./clienteTelefonesService');
const contatosSvc = require('./clienteContatoService');
const inativacao = require('./clienteInativacaoService');
const whatsCliente = require('./whatsappClienteService');
const { normalizarDoc, validarDoc, ehCnpj } = require('../utils/documento');
const cidadeService = require('./cidadeService');                       // cidade só da lista oficial (modo estrito)
const enderecoHistorico = require('./clienteEnderecoHistoricoService'); // trilha do endereço (quem/quando/restaurar)

// carregado na hora (a ficha também é usada pelas rotas; evita ciclo de require)
const fichaSvc = () => require('./analyticsClienteFichaService');

const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
const TELA = 'Painel do bot > Ficha do cliente';
// mesmos do app (CAMPOS_AUDITADOS_CLIENTE: rotaHistoricaService lê) + a tabela de preço
const CAMPOS_AUDITADOS = ['Dia_de_entrega', 'Dia_de_venda', 'idVendedor', 'categoriaClienteId', 'Telefone_Celular', 'Ativo', 'Condicao_de_pagamento'];
const CAMPOS_ENDERECO = { logradouro: 'End_Logradouro', numero: 'End_Numero', complemento: 'End_Complemento', bairro: 'End_Bairro', cidade: 'End_Cidade', estado: 'End_Estado', cep: 'End_CEP' };
const CANAIS = ['Presencial', 'Whatsapp', 'Telefone'];                    // "Canais de Atendimento Preferenciais" do app
const INDICADORES_IE = ['CONTRIBUINTE', 'CONTRIBUINTE_ISENTO', 'NAO_CONTRIBUINTE'];
const MAX_TABELAS = 30;
const MAX_WHATSAPPS = 10;
const MAX_CONTATOS = 20;

/** Quem pode EDITAR cadastro por esta API (prefixos do x-analytics-agent). */
function prefixosPermitidos() {
    const bruto = String(process.env.ANALYTICS_CADASTRO_AGENTES || 'painel');
    return bruto.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function exigirAgenteCadastro(agente) {
    const quem = exigirAgente(agente);
    const q = quem.toLowerCase();
    if (!prefixosPermitidos().some((p) => q === p || q.startsWith(`${p}-`) || q.startsWith(`${p}:`) || q.startsWith(`${p} `))) {
        throw erro(403, 'Este agente não pode editar cadastro. Só a equipe, pelo painel do bot.', 'AGENTE_SEM_PERMISSAO');
    }
    return quem;
}

const erroValidacao = (erros) => {
    const e = erro(400, erros.map((x) => x.mensagem).join(' '), 'DADOS_INVALIDOS');
    e.erros = erros;
    return e;
};

/** ["seg","QUA"] ou "SEG,QUA" → "SEG,QUA" (ordem da semana). [] / "" → null. */
function lerDias(v, campo, erros) {
    const lista = Array.isArray(v) ? v : String(v ?? '').split(',');
    const limpos = lista.map((d) => String(d || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3)).filter(Boolean);
    const invalidos = limpos.filter((d) => !DIAS.includes(d));
    if (invalidos.length) { erros.push({ campo, mensagem: `Dia inválido: ${invalidos.join(', ')}. Use ${DIAS.join(', ')}.` }); return undefined; }
    const ord = DIAS.filter((d) => limpos.includes(d));
    return ord.length ? ord.join(',') : null;
}

/** Telefone do cadastro: '' limpa; senão precisa de DDD + número. Devolve só dígitos SEM o 55. */
function lerTelefone(v, campo, rotulo, uf, erros) {
    const bruto = String(v ?? '').trim();
    if (!bruto.replace(/\D/g, '')) return null;
    const av = avaliarTelefone(bruto, { uf });
    if (!av.numero) { erros.push({ campo, mensagem: `${rotulo} "${bruto}": ${av.rotulo || 'número inválido'}. Informe DDD + número (ex.: 47 99999-8888).` }); return undefined; }
    return av.numero.slice(2);
}

const SEL_CLIENTE = {
    UUID: true, Nome: true, NomeFantasia: true, Ativo: true, Documento: true, Tipo_Pessoa: true, Perfis: true, Email: true,
    Telefone: true, Telefone_Celular: true, Telefone_Comercial: true, whatsapp: { select: { numeros: true } },
    Dia_de_venda: true, Dia_de_entrega: true, Condicao_de_pagamento: true, condicoes_pagamento_permitidas: true, idVendedor: true,
    End_Logradouro: true, End_Numero: true, End_Complemento: true, End_Bairro: true, End_Cidade: true, End_Estado: true, End_CEP: true, Ponto_GPS: true,
    Indicador_Inscricao_Estadual: true, Observacoes_Gerais: true, observacaoComercialFixa: true, Formas_Atendimento: true, categoriaClienteId: true,
    fiscal: { select: { inscricaoEstadual: true } },
};

/** Texto livre: '' / null limpa. `linhas` mantém quebras (observações). */
function lerTexto(v, max, { linhas = false } = {}) {
    let s = String(v ?? '');
    s = linhas ? s.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim() : s.replace(/\s+/g, ' ').trim();
    return s ? s.slice(0, max) : null;
}

// IE varia por UF; em SC são 9 dígitos (mesma régua do app — clienteController.validarIe)
function validarIe(ie, uf) {
    if (!ie) return null;
    if (!/^\d{2,14}$/.test(ie)) return 'Inscrição Estadual deve ter só números (2 a 14 dígitos).';
    if (String(uf || '').toUpperCase() === 'SC' && ie.length !== 9) return 'Inscrição Estadual de SC deve ter 9 dígitos.';
    return null;
}

async function exigirCliente(clienteId) {
    const id = idOpcional(clienteId, 'clienteId');
    if (!id) throw erro(400, 'Informe o cliente.', 'CAMPO_OBRIGATORIO');
    const cli = await prisma.cliente.findUnique({ where: { UUID: id }, select: SEL_CLIENTE });
    if (!cli) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    return cli;
}

async function auditar(cli, depois, agente) {
    try {
        const mudancas = {};
        for (const campo of CAMPOS_AUDITADOS) {
            const de = cli[campo] == null || cli[campo] === '' ? null : String(cli[campo]);
            const para = depois[campo] == null || depois[campo] === '' ? null : String(depois[campo]);
            if (campo in depois && de !== para) mudancas[campo] = { de, para };
        }
        if (!Object.keys(mudancas).length) return;
        await prisma.auditLog.create({
            data: {
                acao: 'CLIENTE_ALTERADO', entidade: 'Cliente', entidadeId: cli.UUID,
                usuarioId: `agente:${agente}`.slice(0, 180), usuarioNome: agente.slice(0, 180),
                detalhes: JSON.stringify({ origem: TELA, cliente: cli.NomeFantasia || cli.Nome || null, mudancas }).slice(0, 8000),
            },
        });
    } catch (e) {
        console.error('[CadastroPainel] auditoria falhou (cadastro já salvo):', e?.message || e);
    }
}

// ── opções dos campos ─────────────────────────────────────────────────────────
async function opcoes() {
    const [vendedores, tabelas, categorias] = await Promise.all([
        prisma.vendedor.findMany({ where: { ativo: true, acessoExterno: false }, orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
        prisma.tabelaPreco.findMany({ where: { ativo: true }, orderBy: { nomeCondicao: 'asc' }, select: { id: true, nomeCondicao: true, acrescimoPreco: true, valorMinimo: true } }),
        prisma.categoriaCliente?.findMany
            ? prisma.categoriaCliente.findMany({ where: { ativo: true }, orderBy: { nome: 'asc' }, select: { id: true, nome: true, cicloPadraoDias: true } }).catch(() => [])
            : [],
    ]);
    return {
        dias: DIAS,
        vendedores: vendedores.map((v) => ({ id: v.id, nome: v.nome })),
        tabelas: tabelas.map((t) => ({ id: t.id, nome: t.nomeCondicao, acrescimoPct: num(t.acrescimoPreco), valorMinimo: t.valorMinimo == null ? null : dec(t.valorMinimo) })),
        classificacoes: [
            { valor: 'CLIENTE', rotulo: 'Cliente' },
            { valor: 'FORNECEDOR', rotulo: 'Fornecedor' },
            { valor: 'CLIENTE_FORNECEDOR', rotulo: 'Cliente e fornecedor' },
            { valor: 'automatica', rotulo: 'Automática (pelo financeiro e pedidos)' },
        ],
        motivosInativacao: inativacao.MOTIVOS.map((m) => ({ valor: m, rotulo: inativacao.ROTULO_MOTIVO[m] || m })),
        categorias: (categorias || []).map((c) => ({ id: c.id, nome: c.nome, cicloPadraoDias: c.cicloPadraoDias ?? null })),
        canais: CANAIS,
        indicadoresIe: [
            { valor: 'CONTRIBUINTE', rotulo: 'Contribuinte' },
            { valor: 'CONTRIBUINTE_ISENTO', rotulo: 'Contribuinte isento' },
            { valor: 'NAO_CONTRIBUINTE', rotulo: 'Não contribuinte' },
        ],
    };
}

// ── pendências depois de salvar (mesma régua da lista cadastros-pendentes) ──────
function pendenciasDaFicha(ficha) {
    const k = ficha?.classificacao || {};
    const ehCliente = k.valor === 'CLIENTE' || k.valor === 'CLIENTE_FORNECEDOR';
    const faltando = ficha?.cadastro?.faltando || [];
    const tel = ficha?.telefonesWhatsapp?.pendencia || null;
    const grupos = [];
    if (ficha?.cliente?.ativo === false) return { resolvido: true, grupos, pendencias: [], inativo: true };
    if (ehCliente && (faltando.length || tel)) grupos.push('acertar');
    if (ehCliente && tel) grupos.push('telefone');
    if (k.valor === classif.A_CLASSIFICAR) grupos.push('classificar');
    const pendencias = ehCliente ? [...faltando, ...(tel ? [{ campo: tel.campo, rotulo: tel.rotulo }] : [])] : (k.valor === classif.A_CLASSIFICAR ? [{ campo: 'classificacao', rotulo: 'Classificar (cliente ou fornecedor)' }] : []);
    return { resolvido: grupos.length === 0, grupos, pendencias, inativo: false };
}

// ── editar ──────────────────────────────────────────────────────────────────
/**
 * body (tudo opcional; campo ausente = não mexe):
 *  diaVenda, diaEntrega: ['SEG', …] ou "SEG,QUA" ([] limpa)
 *  tabelaPrecoId, vendedorId: id (null/'' limpa)
 *  telefones: { celular, telefone, comercial } ('' limpa) · whatsapps: [números]
 *  contatos: [{ id, telefone }] — telefone das pessoas do WhatsApp deste cliente
 *  telefonePreferido: número (vira o 1º da ordem) · classificacao: CLIENTE | FORNECEDOR | CLIENTE_FORNECEDOR | automatica
 *  contatos: [{ id, telefone?, nome?, papel? }] — corrigir número e/ou nome/papel da pessoa
 *  razaoSocial, nomeFantasia, documento (CNPJ/CPF, validado e único), email
 *  inscricaoEstadual, indicadorIe: CONTRIBUINTE | CONTRIBUINTE_ISENTO | NAO_CONTRIBUINTE ('' limpa)
 *  endereco: { logradouro, numero, complemento, bairro, cidade (só da lista oficial), estado (UF), cep }
 *  observacoes, observacaoComercial (aviso fixado) · tabelasPermitidas: [ids] · canais: ['Presencial','Whatsapp','Telefone']
 *  categoriaId: id da categoria (segmento) ('' limpa)
 */
async function editar(clienteId, body, { agente } = {}) {
    const quem = exigirAgenteCadastro(agente);
    const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const tem = (k) => Object.prototype.hasOwnProperty.call(src, k);
    const cli = await exigirCliente(clienteId);
    if (!cli.Ativo) throw erro(409, 'O cliente está inativo. Reative no CA-Hardt antes de editar.', 'CLIENTE_INATIVO');
    const erros = [];
    const data = {};

    // UF primeiro: a régua de telefone e de IE usa a UF que vai ficar gravada
    const end = tem('endereco') && src.endereco && typeof src.endereco === 'object' && !Array.isArray(src.endereco) ? src.endereco : null;
    if (tem('endereco') && !end) erros.push({ campo: 'endereco', mensagem: 'Envie o endereço como { logradouro, numero, bairro, cidade, estado, cep }.' });
    const temEnd = (k) => !!end && Object.prototype.hasOwnProperty.call(end, k);
    if (temEnd('estado')) {
        const e = String(end.estado ?? '').trim().toUpperCase();
        if (e && !/^[A-Z]{2}$/.test(e)) erros.push({ campo: 'endereco.estado', mensagem: 'UF deve ter 2 letras (ex.: SC).' });
        else data.End_Estado = e || null;
    }
    const uf = ('End_Estado' in data ? data.End_Estado : cli.End_Estado) || null;

    if (tem('diaVenda')) { const v = lerDias(src.diaVenda, 'diaVenda', erros); if (v !== undefined) data.Dia_de_venda = v; }
    if (tem('diaEntrega')) { const v = lerDias(src.diaEntrega, 'diaEntrega', erros); if (v !== undefined) data.Dia_de_entrega = v; }

    if (tem('tabelaPrecoId')) {
        const id = src.tabelaPrecoId == null || src.tabelaPrecoId === '' ? null : idOpcional(src.tabelaPrecoId, 'tabelaPrecoId');
        if (id) {
            const t = await prisma.tabelaPreco.findUnique({ where: { id }, select: { id: true, ativo: true } });
            if (!t || !t.ativo) erros.push({ campo: 'tabelaPrecoId', mensagem: 'Tabela de preço não existe ou está inativa.' });
            else {
                data.Condicao_de_pagamento = t.id;
                // lista de permitidas não vazia precisa conter a favorita, senão o pedido não aceita a condição
                const perm = (cli.condicoes_pagamento_permitidas || []).filter(Boolean);
                if (perm.length && !perm.includes(t.id)) data.condicoes_pagamento_permitidas = [...perm, t.id];
            }
        } else data.Condicao_de_pagamento = null;
    }

    if (tem('vendedorId')) {
        const id = src.vendedorId == null || src.vendedorId === '' ? null : idOpcional(src.vendedorId, 'vendedorId');
        if (id) {
            const v = await prisma.vendedor.findUnique({ where: { id }, select: { id: true, ativo: true } });
            if (!v || !v.ativo) erros.push({ campo: 'vendedorId', mensagem: 'Vendedor não existe ou está inativo.' });
            else data.idVendedor = v.id;
        } else data.idVendedor = null;
    }

    if (tem('telefones') && src.telefones && typeof src.telefones === 'object') {
        const t = src.telefones;
        const mapa = [['celular', 'Telefone_Celular', 'Celular'], ['telefone', 'Telefone', 'Telefone'], ['comercial', 'Telefone_Comercial', 'Telefone comercial']];
        for (const [k, col, rot] of mapa) {
            if (!Object.prototype.hasOwnProperty.call(t, k)) continue;
            const v = lerTelefone(t[k], `telefones.${k}`, rot, uf, erros);
            if (v !== undefined) data[col] = v;
        }
    }

    // ── identificação e contato ──
    if (tem('razaoSocial')) {
        const v = lerTexto(src.razaoSocial, 200);
        if (!v) erros.push({ campo: 'razaoSocial', mensagem: 'Razão social / nome não pode ficar vazio.' });
        else data.Nome = v;
    }
    if (tem('nomeFantasia')) data.NomeFantasia = lerTexto(src.nomeFantasia, 200);
    if (tem('documento')) {
        const d = normalizarDoc(src.documento);
        if (!d) erros.push({ campo: 'documento', mensagem: 'CNPJ/CPF não pode ficar vazio.' });
        else if (!validarDoc(d)) erros.push({ campo: 'documento', mensagem: 'CNPJ/CPF inválido (confira os dígitos).' });
        else if (d !== normalizarDoc(cli.Documento)) {
            const outro = await prisma.cliente.findUnique({ where: { Documento: d }, select: { UUID: true, Nome: true } });
            if (outro && outro.UUID !== cli.UUID) erros.push({ campo: 'documento', mensagem: `Documento já usado pelo cliente ${outro.Nome}.` });
            else { data.Documento = d; data.Tipo_Pessoa = ehCnpj(d) ? 'JURIDICA' : 'FISICA'; }
        }
    }
    if (tem('email')) {
        const v = String(src.email ?? '').trim();
        if (v && (v.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))) erros.push({ campo: 'email', mensagem: 'E-mail inválido.' });
        else data.Email = v || null;
    }
    let ie;
    if (tem('inscricaoEstadual')) {
        const v = String(src.inscricaoEstadual ?? '').replace(/\D/g, '');
        const e = validarIe(v, uf);
        if (e) erros.push({ campo: 'inscricaoEstadual', mensagem: e });
        else ie = v || null;
    }
    if (tem('indicadorIe')) {
        const v = String(src.indicadorIe ?? '').trim().toUpperCase();
        if (v && !INDICADORES_IE.includes(v)) erros.push({ campo: 'indicadorIe', mensagem: `Indicador de IE inválido. Use ${INDICADORES_IE.join(', ')}.` });
        else data.Indicador_Inscricao_Estadual = v || null;
    }

    // ── endereço (cidade só da lista oficial — mesma régua estrita do app) ──
    if (end) {
        for (const k of ['logradouro', 'numero', 'complemento', 'bairro']) if (temEnd(k)) data[CAMPOS_ENDERECO[k]] = lerTexto(end[k], 200);
        if (temEnd('cep')) {
            const c = String(end.cep ?? '').replace(/\D/g, '');
            if (c && c.length !== 8) erros.push({ campo: 'endereco.cep', mensagem: 'CEP deve ter 8 dígitos.' });
            else data.End_CEP = c || null;
        }
        if (temEnd('cidade')) {
            try {
                data.End_Cidade = await cidadeService.resolver(end.cidade, { modo: 'estrito' });
            } catch (e) {
                if (!e?.codigo) throw e;
                erros.push({ campo: 'endereco.cidade', mensagem: e.message, sugestoes: (e.sugestoes || []).map((x) => x.nome) });
            }
        }
    }

    // ── observações e comercial ──
    if (tem('observacoes')) data.Observacoes_Gerais = lerTexto(src.observacoes, 5000, { linhas: true });
    if (tem('observacaoComercial')) data.observacaoComercialFixa = lerTexto(src.observacaoComercial, 2000, { linhas: true });
    if (tem('canais')) {
        const l = Array.isArray(src.canais) ? src.canais.map((c) => CANAIS.find((x) => x.toLowerCase() === String(c || '').trim().toLowerCase())) : null;
        if (!l || l.some((x) => !x)) erros.push({ campo: 'canais', mensagem: `Canais inválidos. Use ${CANAIS.join(', ')}.` });
        else data.Formas_Atendimento = CANAIS.filter((x) => l.includes(x));
    }
    if (tem('categoriaId')) {
        const id = src.categoriaId == null || src.categoriaId === '' ? null : idOpcional(src.categoriaId, 'categoriaId');
        if (id) {
            const c = await prisma.categoriaCliente.findUnique({ where: { id }, select: { id: true, ativo: true } });
            if (!c || !c.ativo) erros.push({ campo: 'categoriaId', mensagem: 'Categoria não existe ou está inativa.' });
            else data.categoriaClienteId = c.id;
        } else data.categoriaClienteId = null;
    }
    if (tem('tabelasPermitidas')) {
        if (!Array.isArray(src.tabelasPermitidas) || src.tabelasPermitidas.length > MAX_TABELAS) erros.push({ campo: 'tabelasPermitidas', mensagem: 'Envie a lista de tabelas permitidas.' });
        else {
            const ids = [...new Set(src.tabelasPermitidas.map((x) => String(x || '').trim()).filter(Boolean))];
            const achadas = ids.length ? await prisma.tabelaPreco.findMany({ where: { id: { in: ids } }, select: { id: true, ativo: true } }) : [];
            const ok = new Set(achadas.filter((t) => t.ativo).map((t) => t.id));
            const ruins = ids.filter((x) => !ok.has(x));
            if (ruins.length) erros.push({ campo: 'tabelasPermitidas', mensagem: 'Tabela permitida não existe ou está inativa.' });
            else {
                // lista não vazia precisa conter a favorita (senão o pedido não aceita a condição)
                const fav = 'Condicao_de_pagamento' in data ? data.Condicao_de_pagamento : cli.Condicao_de_pagamento;
                data.condicoes_pagamento_permitidas = ids.length && fav && !ids.includes(fav) ? [...ids, fav] : ids;
            }
        }
    }

    let whatsapps;
    if (tem('whatsapps')) {
        if (!Array.isArray(src.whatsapps) || src.whatsapps.length > MAX_WHATSAPPS) erros.push({ campo: 'whatsapps', mensagem: `Envie a lista de WhatsApps (no máximo ${MAX_WHATSAPPS}).` });
        else {
            const lista = [];
            src.whatsapps.forEach((n, i) => { const v = lerTelefone(n, `whatsapps.${i}`, 'WhatsApp', uf, erros); if (v) lista.push(v); });
            whatsapps = [...new Set(lista)];
        }
    }

    const contatos = [];
    if (tem('contatos')) {
        if (!Array.isArray(src.contatos) || src.contatos.length > MAX_CONTATOS) erros.push({ campo: 'contatos', mensagem: 'Envie a lista de contatos ({ id, telefone }).' });
        else {
            for (const [i, c] of src.contatos.entries()) {
                const cid = idOpcional(c?.id, 'contato');
                const row = cid ? await prisma.clienteContato.findUnique({ where: { id: cid } }) : null;
                if (!row || row.clienteUuid !== cli.UUID) { erros.push({ campo: `contatos.${i}`, mensagem: 'Pessoa do WhatsApp não é deste cliente.' }); continue; }
                const mud = {};
                if (Object.prototype.hasOwnProperty.call(c, 'telefone')) {
                    const v = lerTelefone(c.telefone, `contatos.${i}`, `Telefone de ${row.nome || 'pessoa do WhatsApp'}`, uf, erros);
                    if (v === null) erros.push({ campo: `contatos.${i}`, mensagem: 'A pessoa do WhatsApp precisa de um telefone (esta API não apaga contato).' });
                    else if (v && String(row.telefone || '').replace(/\D/g, '') !== v) mud.telefone = v;
                }
                if (Object.prototype.hasOwnProperty.call(c, 'nome')) { const n = lerTexto(c.nome, 120); if (n !== (row.nome || null)) mud.nome = n; }
                if (Object.prototype.hasOwnProperty.call(c, 'papel')) { const p = lerTexto(c.papel, 40); if (p !== (row.papel || null)) mud.papel = p; }
                if (Object.keys(mud).length) contatos.push({ id: row.id, mud });
            }
        }
    }

    let classificacao;
    if (tem('classificacao')) {
        const b = src.classificacao;
        const limpar = b === null || String(b ?? '').trim().toLowerCase() === 'automatica';
        const val = limpar ? 'automatica' : String(b ?? '').trim().toUpperCase();
        if (!limpar && !classif.VALORES.includes(val)) erros.push({ campo: 'classificacao', mensagem: `Classificação inválida. Use ${classif.VALORES.join(', ')} ou automatica.` });
        else classificacao = val;
    }

    let preferido;
    if (tem('telefonePreferido') && String(src.telefonePreferido ?? '').trim()) {
        const v = lerTelefone(src.telefonePreferido, 'telefonePreferido', 'Telefone preferido', uf, erros);
        if (v) preferido = v;
    }

    if (erros.length) throw erroValidacao(erros);

    const ator = { agente: quem };
    const mudou = [];
    if (Object.keys(data).length) {
        const depois = await prisma.cliente.update({ where: { UUID: cli.UUID }, data, select: SEL_CLIENTE });
        await historico.registrarDiff({ clienteId: cli.UUID, ator, tela: TELA, antes: cli, depois, campos: Object.keys(data) });
        await auditar(cli, Object.fromEntries(Object.keys(data).map((k) => [k, depois[k]])), quem);
        mudou.push(...Object.keys(data));
        if (Object.values(CAMPOS_ENDERECO).some((k) => k in data)) {
            // trilha do endereço (quem/quando/restaurar) — registrar nunca lança
            await enderecoHistorico.registrar({ clienteUuid: cli.UUID, antes: cli, depois, tipo: 'ALTERACAO', origem: 'CADASTRO', autor: { id: null, nome: quem } });
        }
        if ('Telefone_Celular' in data) {
            try { await whatsCliente.sincronizarTemNumero(cli.UUID, data.Telefone_Celular || null); } catch (e) { console.error('[CadastroPainel] temNumero:', e?.message || e); }
        }
    }
    if (whatsapps) {
        const antes = cli.whatsapp?.numeros || [];
        await prisma.clienteWhatsapp.upsert({ where: { clienteUuid: cli.UUID }, create: { clienteUuid: cli.UUID, numeros: whatsapps }, update: { numeros: whatsapps } });
        await historico.registrarDiff({ clienteId: cli.UUID, ator, tela: TELA, antes: { Whatsapps: antes }, depois: { Whatsapps: whatsapps } });
        mudou.push('Whatsapps');
    }
    for (const c of contatos) {
        await contatosSvc.atualizar(c.id, c.mud, ator, cli.UUID);
        mudou.push(`contato:${c.id}`);
    }
    if (ie !== undefined && ie !== (cli.fiscal?.inscricaoEstadual ?? null)) {
        await prisma.clienteFiscal.upsert({ where: { clienteUuid: cli.UUID }, create: { clienteUuid: cli.UUID, inscricaoEstadual: ie }, update: { inscricaoEstadual: ie } });
        await historico.registrarDiff({ clienteId: cli.UUID, ator, tela: TELA, antes: { Inscricao_Estadual: cli.fiscal?.inscricaoEstadual ?? null }, depois: { Inscricao_Estadual: ie } });
        mudou.push('Inscricao_Estadual');
    }
    if (classificacao !== undefined) {
        await classif.classificar(cli.UUID, { classificacao }, ator);
        mudou.push('classificacao');
    }
    if (preferido) {
        await telefonesSvc.definirOrdem(cli.UUID, { ordem: [preferido] }, ator);
        mudou.push('ordemTelefones');
    }

    const ficha = await fichaSvc().ficha(cli.UUID);
    return { ok: true, mudou, ficha, ...pendenciasDaFicha(ficha) };
}

// ── inativar (ação da equipe pelo painel) ───────────────────────────────────────
async function inativar(clienteId, body, { agente } = {}) {
    const quem = exigirAgenteCadastro(agente);
    const { motivo, detalhe } = inativacao.validar(body);
    const cli = await exigirCliente(clienteId);
    if (!cli.Ativo) throw erro(409, 'O cliente já está inativo.', 'CLIENTE_JA_INATIVO');
    await prisma.cliente.update({ where: { UUID: cli.UUID }, data: { Ativo: false } });
    const resumo = inativacao.resumoPedido({ motivo, detalhe, solicitadoPor: quem });
    await historico.registrar({
        clienteId: cli.UUID, ator: { agente: quem }, tela: TELA,
        mudancas: [{ campo: 'Ativo', de: 'true', para: 'false' }, { campo: 'inativacao', de: null, para: historico.normalizarValor(resumo) }],
    });
    await auditar(cli, { Ativo: false }, quem);
    // pedido de inativação pendente deste cliente (feito pela Ana ou pelo painel) fica resolvido
    let pedidosFechados = 0;
    try {
        const r = await prisma.clienteInativacaoSolicitacao.updateMany({
            where: { clienteId: cli.UUID, status: 'pendente' },
            data: { status: 'aprovada', decididoPorId: null, decididoPorNome: quem.slice(0, 180), decididoEm: new Date(), observacaoDecisao: 'Inativado pelo painel do bot' },
        });
        pedidosFechados = r?.count || 0;
    } catch (e) { console.error('[CadastroPainel] fechar pedidos de inativação:', e?.message || e); }
    return { ok: true, cliente: { id: cli.UUID, nome: cli.NomeFantasia || cli.Nome, ativo: false }, motivo, pedidosFechados };
}

// ── contexto (só leitura) ─────────────────────────────────────────────────────
const LIM_ATEND = 15;
const LIM_PEDIDOS = 8;
const LIM_ALT = 30;
const LIM_AUDIT = 30;

function lerJson(s) { try { return JSON.parse(s || 'null'); } catch { return null; } }

async function contexto(clienteId) {
    const id = idOpcional(clienteId, 'clienteId');
    if (!id) throw erro(400, 'Informe o cliente.', 'CAMPO_OBRIGATORIO');
    const cli = await prisma.cliente.findUnique({ where: { UUID: id }, select: { UUID: true, Nome: true, NomeFantasia: true, Ativo: true, Observacoes_Gerais: true, observacaoComercialFixa: true } });
    if (!cli) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    const [atend, pedidos, alt, audit, inat] = await Promise.all([
        prisma.atendimento.findMany({
            where: { clienteId: id, tipo: { notIn: ['FINANCEIRO'] } }, orderBy: { criadoEm: 'desc' }, take: LIM_ATEND,
            select: { id: true, tipo: true, observacao: true, acaoLabel: true, criadoEm: true, proximaVisita: true, vendedor: { select: { nome: true } } },
        }),
        prisma.pedido.findMany({
            where: { clienteId: id, bonificacao: false }, orderBy: { dataVenda: 'desc' }, take: LIM_PEDIDOS,
            select: { id: true, numero: true, dataVenda: true, cancelado: true, especial: true, statusEntrega: true, situacaoCA: true, itens: { select: { quantidade: true, valor: true } } },
        }),
        historico.listar(id, { limite: LIM_ALT }).catch(() => ({ data: [] })),
        prisma.auditLog.findMany({ where: { entidade: 'Cliente', entidadeId: id }, orderBy: { createdAt: 'desc' }, take: LIM_AUDIT, select: { acao: true, usuarioNome: true, createdAt: true, detalhes: true } }),
        inativacao.listar({ clienteId: id, status: 'todas', limit: 5 }).catch(() => ({ data: [] })),
    ]);
    // nomes dos vendedores citados na auditoria (idVendedor de/para)
    const idsVend = new Set();
    const audits = audit.map((a) => {
        const d = lerJson(a.detalhes) || {};
        const m = d.mudancas && typeof d.mudancas === 'object' ? d.mudancas : {};
        if (m.idVendedor) { if (m.idVendedor.de) idsVend.add(m.idVendedor.de); if (m.idVendedor.para) idsVend.add(m.idVendedor.para); }
        return { acao: a.acao, quem: a.usuarioNome, em: a.createdAt, origem: d.origem || null, mudancas: m };
    });
    const nomes = idsVend.size ? new Map((await prisma.vendedor.findMany({ where: { id: { in: [...idsVend] } }, select: { id: true, nome: true } })).map((v) => [v.id, v.nome])) : new Map();
    for (const a of audits) {
        const v = a.mudancas.idVendedor;
        if (v) a.mudancas.idVendedor = { de: v.de ? (nomes.get(v.de) || v.de) : null, para: v.para ? (nomes.get(v.para) || v.para) : null };
    }
    return {
        cliente: { id: cli.UUID, nome: cli.NomeFantasia || cli.Nome, ativo: !!cli.Ativo, observacoes: cli.Observacoes_Gerais || null, observacaoComercial: cli.observacaoComercialFixa || null },
        atendimentos: atend.map((a) => ({ id: a.id, tipo: a.tipo, acao: a.acaoLabel || null, observacao: a.observacao || null, em: a.criadoEm, proximaVisita: a.proximaVisita || null, vendedor: a.vendedor?.nome || null })),
        pedidos: pedidos.map((p) => ({ id: p.id, numero: p.numero, data: p.dataVenda, total: dec(p.itens.reduce((s, i) => s + num(i.valor) * num(i.quantidade), 0)), cancelado: !!p.cancelado, especial: !!p.especial, status: p.statusEntrega || null, situacaoCA: p.situacaoCA || null })),
        alteracoes: Array.isArray(alt?.data) ? alt.data : [],
        auditoria: audits,
        inativacoes: Array.isArray(inat?.data) ? inat.data : [],
        avisos: [
            'alteracoes = histórico campo a campo (existe desde nov/2026); auditoria = audit_logs CLIENTE_ALTERADO (dia de venda/entrega, vendedor, celular, ativo), mais antigo.',
            'Mudança feita antes desses registros existirem não tem quem/quando.',
        ],
    };
}

module.exports = { DIAS, prefixosPermitidos, exigirAgenteCadastro, opcoes, editar, inativar, contexto, pendenciasDaFicha, lerDias, lerTelefone };
