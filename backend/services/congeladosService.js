const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pedidoService = require('./pedidoService');
const webhookService = require('./webhookService');
// v1.6.0 da API da IA: objeto único de produto/pedido, promoções vigentes e hora de corte.
// Só usados no caminho da IA (parâmetro `paraIA`/`criarPedidoIA`) — o site público não muda.
const promocaoService = require('./promocaoService');
const iaProduto = require('./iaProdutoSerializer');
const iaPedidoService = require('./iaPedidoService');
const iaConsultaConfig = require('../config/iaConsultaConfig');

const JWT_SECRET = require('../config/jwtSecret');
const money2 = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

// ───────── Helpers ─────────
// normalizarDoc preserva letras (CNPJ ALFANUMÉRICO); validarDoc confere DV de CPF/CNPJ.
const { normalizarDoc, validarDoc } = require('../utils/documento');
const soDigitos = (s) => String(s || '').replace(/\D/g, ''); // só p/ telefone/CEP — NÃO p/ documento
const dec = (v) => (v == null ? 0 : Number(v));
const docValido = (d) => validarDoc(d); // CPF (11) ou CNPJ (14), agora com dígito verificador
// Esconde o meio do telefone: (47) 9****-**76
const mascararTelefone = (t) => {
    const d = soDigitos(t);
    if (d.length < 6) return '•••••';
    return `${d.slice(0, 2)} ${d.slice(2, 3)}••••-••${d.slice(-2)}`;
};
// Chave canônica de telefone (DDD + 8 dígitos), pra comparar números com formatação diferente
// (com/sem DDI 55, com/sem o 9º dígito do celular, parênteses/traço). Ex.: "+55 (47) 99999-8888"
// e "47999998888" e "4799998888" caem todos na mesma chave.
function chaveTelefone(raw) {
    let d = soDigitos(raw);
    if (!d) return '';
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
    return d;
}

// Tokens de dia salvos no cadastro do cliente (Dia_de_entrega: "SEG,QUA") → rótulo amigável
const DIA_LABEL = { DOM: 'Domingo', SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta', QUI: 'Quinta', SEX: 'Sexta', SAB: 'Sábado' };
const DIA_NUM = { DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6 }; // 0=Domingo .. 6=Sábado (igual JS getUTCDay)
const TOKEN_POR_NUM = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
function diasEntregaLabels(str) {
    if (!str) return [];
    return String(str).split(/[,;/ ]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
        .map(t => DIA_LABEL[t] || DIA_LABEL[t.slice(0, 3)] || t);
}
// Dias de entrega do cadastro como números da semana (0=Dom..6=Sáb), para sugerir a próxima data.
function diasEntregaNums(str) {
    if (!str) return [];
    return String(str).split(/[,;/ ]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
        .map(t => (DIA_NUM[t] != null ? DIA_NUM[t] : DIA_NUM[t.slice(0, 3)]))
        .filter(n => n != null);
}

function gerarTokenCliente(c) {
    return jwt.sign({ tipo: 'congelados', id: c.id, documento: c.documento, nome: c.nome }, JWT_SECRET, { expiresIn: '30d' });
}

function imagemPrincipal(produto) {
    if (!produto?.imagens?.length) return null;
    const p = produto.imagens.find(i => i.principal) || produto.imagens[0];
    return p?.url || null;
}

// Todas as imagens do produto, a principal primeiro (para o carrossel do card e da ficha).
function imagensProduto(produto) {
    if (!produto?.imagens?.length) return [];
    return [...produto.imagens]
        .sort((a, b) => (b.principal === true ? 1 : 0) - (a.principal === true ? 1 : 0))
        .map(i => i.url)
        .filter(Boolean);
}

// Produto sem estoque disponível fica "Indisponível" no site (regra simples do dono:
// o site só tem os produtos selecionados; estoque 0 = não tem).
function produtoIndisponivel(produto) {
    if (!produto) return false;
    return Number(produto.estoqueDisponivel || 0) <= 0;
}

// Monta o objeto de produto pro site (preço base — a condição não altera o preço na v1)
function produtoSitePublico(cp) {
    const preco = cp.precoCongelados != null ? dec(cp.precoCongelados) : dec(cp.produto?.valorVenda);
    return {
        id: cp.id,
        produtoId: cp.produtoId,
        codigo: cp.produto?.codigo || '',
        nome: cp.nomeSite || cp.produto?.nome || '',
        descricao: cp.descricaoSite || cp.produto?.descricao || '',
        unidade: cp.produto?.unidade || '',
        unidades: cp.unidadesPorCaixa || 0,
        embalagem: cp.embalagem || 'caixa',
        grupo: cp.produto?.categoriaProduto?.id || null,
        grupoNome: cp.produto?.categoriaProduto?.nome || null,
        preco,
        destaque: cp.destaque,
        ordem: cp.ordem,
        imagem: imagemPrincipal(cp.produto),
        imagens: imagensProduto(cp.produto),
    };
}

// Preço EXATAMENTE como o vendedor vê na tela de pedido (NovoPedido), para a
// condição PADRÃO do cliente:
//   valorBase     = preço de tabela × (1 + acréscimo% da condição)
//   valorUnitário = último preço real do cliente naquele produto (negociado, pra
//                   mais OU menos); se não houver histórico, usa o valorBase
//   piso          = valorBase × (1 − maxDescontoFlex% do vendedor do cliente)
// O valor nunca fica abaixo do piso (política de desconto do flex).
function precoVendedor({ base, acrescimoPct, ultimoPreco, maxDescontoPct }) {
    const valorBase = dec(base) * (1 + dec(acrescimoPct) / 100);
    let valor = (ultimoPreco != null && dec(ultimoPreco) > 0) ? dec(ultimoPreco) : valorBase;
    const piso = valorBase * (1 - dec(maxDescontoPct) / 100);
    if (valor < piso && piso > 0) valor = piso;
    return Math.round(valor * 100) / 100;
}

// Último preço real pago pelo cliente em cada produto (pedido mais recente, não excluído).
async function precoUltimaCompraMap(clienteUuid, produtoIds) {
    if (!clienteUuid || !produtoIds.length) return {};
    const itens = await prisma.pedidoItem.findMany({
        where: { produtoId: { in: produtoIds }, pedido: { clienteId: clienteUuid, statusEnvio: { not: 'EXCLUIDO' } } },
        select: { produtoId: true, valor: true },
        // "Último" = pedido FEITO por último (data de criação), igual ao vendedor.
        orderBy: { pedido: { createdAt: 'desc' } },
    });
    const map = {};
    for (const it of itens) {
        if (map[it.produtoId] == null) map[it.produtoId] = dec(it.valor); // 1º = mais recente
    }
    return map;
}

// Tabela de preço "Site" (id/idCondicao = SITE): usada para quem NÃO tem condição
// cadastrada (visitante do site). Tem acréscimo % sobre o preço de venda + valor mínimo.
async function tabelaSite() {
    return prisma.tabelaPreco.findFirst({
        where: {
            ativo: true,
            OR: [
                { id: 'SITE' },
                { idCondicao: { equals: 'SITE', mode: 'insensitive' } },
                { nomeCondicao: { equals: 'Site', mode: 'insensitive' } },
            ],
        },
    }).catch(() => null);
}

// Contexto de preço: acréscimo + limite de desconto do flex.
//   • Cliente COM condição cadastrada → usa a condição dele.
//   • Sem condição (visitante do site, ou cliente sem condição) → usa a tabela "Site".
async function contextoPreco(cliente) {
    const ctx = { acrescimoPct: 0, maxDescontoPct: 100, condicaoPadrao: null };
    if (cliente?.Condicao_de_pagamento) {
        const t = await prisma.tabelaPreco.findUnique({ where: { id: cliente.Condicao_de_pagamento } });
        if (t) {
            ctx.acrescimoPct = dec(t.acrescimoPreco);
            ctx.condicaoPadrao = { id: t.id, nome: t.nomeCondicao, valorMinimo: dec(t.valorMinimo), permiteEspecial: !!t.permiteEspecial, permitePedido: !!t.permitePedido };
        }
    }
    // Visitante / cliente sem condição própria → preço e mínimo pela tabela "Site".
    if (!ctx.condicaoPadrao) {
        const s = await tabelaSite();
        if (s) {
            ctx.acrescimoPct = dec(s.acrescimoPreco);
            ctx.condicaoPadrao = { id: s.id, nome: s.nomeCondicao, valorMinimo: dec(s.valorMinimo), permiteEspecial: !!s.permiteEspecial, permitePedido: !!s.permitePedido };
        }
    }
    // Limite de desconto do flex só se aplica a cliente com vendedor.
    if (cliente && !cliente.categoriaCliente?.semLimiteDesconto && cliente.idVendedor) {
        const v = await prisma.vendedor.findUnique({ where: { id: cliente.idVendedor }, select: { maxDescontoFlex: true } });
        ctx.maxDescontoPct = v ? dec(v.maxDescontoFlex) : 100;
    }
    return ctx;
}

const congeladosService = {
    // ============================================================
    // ───────────────────── PÚBLICO ─────────────────────────────
    // ============================================================

    // Passo 1 do login: descobre o estado do documento (CPF/CNPJ).
    // A senha do Kit Festa serve para o site de congelados (mesma conta, por CPF).
    async checkDoc(docRaw) {
        const documento = normalizarDoc(docRaw);
        if (!docValido(documento)) throw new Error('Informe um CPF ou CNPJ válido.');

        const auth = await prisma.congeladosCliente.findUnique({ where: { documento } });
        const clienteApp = await prisma.cliente.findFirst({
            where: { Documento: { contains: documento } },
            select: { UUID: true, Nome: true, NomeFantasia: true },
        });
        // Kit Festa só tem CPF (11 dígitos)
        const kf = documento.length === 11
            ? await prisma.kitFestaCliente.findUnique({ where: { cpf: documento } }).catch(() => null)
            : null;

        if (auth?.senhaHash) {
            return { situacao: 'TEM_SENHA', temCadastroApp: !!auth.clienteUuid || !!clienteApp, nome: auth.nome };
        }
        if (kf?.senhaHash) {
            // tem senha no Kit Festa → usa a mesma
            return { situacao: 'TEM_SENHA', origem: 'kitfesta', temCadastroApp: !!clienteApp || !!kf.clienteUuid, nome: clienteApp?.NomeFantasia || clienteApp?.Nome || auth?.nome || kf.nome };
        }
        if (auth) {
            return { situacao: 'CRIAR_SENHA', temCadastroApp: !!auth.clienteUuid || !!clienteApp, nome: auth.nome };
        }
        if (clienteApp) {
            return { situacao: 'CRIAR_SENHA', temCadastroApp: true, nome: clienteApp.NomeFantasia || clienteApp.Nome };
        }
        return { situacao: 'SEM_CADASTRO', temCadastroApp: false, nome: null };
    },

    async criarSenha({ documento: docRaw, senha, nome, telefone, email }) {
        const documento = normalizarDoc(docRaw);
        if (!docValido(documento)) throw new Error('Informe um CPF ou CNPJ válido.');
        if (!senha || senha.length < 4) throw new Error('A senha precisa ter ao menos 4 caracteres.');

        const existente = await prisma.congeladosCliente.findUnique({ where: { documento } });
        // Nunca sobrescrever silenciosamente uma senha já existente (isso seria um "sequestro de
        // conta" para quem só sabe o CPF/CNPJ da vítima). Quem já tem senha usa esqueciSenha/resetSenha.
        if (existente?.senhaHash) throw new Error('Esta conta já tem senha. Use "Esqueci minha senha" para trocar.');

        const clienteApp = await prisma.cliente.findFirst({
            where: { Documento: { contains: documento } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Telefone: true, Telefone_Celular: true, Email: true },
        });

        const senhaHash = await bcrypt.hash(senha, 10);
        const nomeFinal = nome || clienteApp?.NomeFantasia || clienteApp?.Nome || 'Cliente';
        let auth;
        if (existente) {
            auth = await prisma.congeladosCliente.update({
                where: { documento },
                data: {
                    senhaHash,
                    nome: existente.nome || nomeFinal,
                    telefone: telefone || existente.telefone || clienteApp?.Telefone_Celular || clienteApp?.Telefone || null,
                    email: email || existente.email || clienteApp?.Email || null,
                    clienteUuid: existente.clienteUuid || clienteApp?.UUID || null,
                },
            });
        } else {
            auth = await prisma.congeladosCliente.create({
                data: {
                    documento,
                    nome: nomeFinal,
                    telefone: telefone || clienteApp?.Telefone_Celular || clienteApp?.Telefone || null,
                    email: email || clienteApp?.Email || null,
                    senhaHash,
                    clienteUuid: clienteApp?.UUID || null,
                },
            });
        }
        return { token: gerarTokenCliente(auth), cliente: await this._perfilPublico(auth) };
    },

    async login({ documento: docRaw, senha }) {
        const documento = normalizarDoc(docRaw);
        let auth = await prisma.congeladosCliente.findUnique({ where: { documento } });

        // 1) Senha do próprio site de congelados
        if (auth?.senhaHash && await bcrypt.compare(senha, auth.senhaHash)) {
            await prisma.congeladosCliente.update({ where: { documento }, data: { ultimoAcesso: new Date() } });
            return { token: gerarTokenCliente(auth), cliente: await this._perfilPublico(auth) };
        }

        // 2) Senha do Kit Festa (mesma conta por CPF) → adota a mesma senha aqui
        if (documento.length === 11) {
            const kf = await prisma.kitFestaCliente.findUnique({ where: { cpf: documento } }).catch(() => null);
            if (kf?.senhaHash && await bcrypt.compare(senha, kf.senhaHash)) {
                const clienteApp = await prisma.cliente.findFirst({ where: { Documento: { contains: documento } }, select: { UUID: true, Nome: true, NomeFantasia: true, Telefone: true, Telefone_Celular: true } });
                auth = await prisma.congeladosCliente.upsert({
                    where: { documento },
                    create: {
                        documento, nome: clienteApp?.NomeFantasia || clienteApp?.Nome || kf.nome,
                        senhaHash: kf.senhaHash,
                        telefone: kf.telefone || clienteApp?.Telefone_Celular || clienteApp?.Telefone || null,
                        clienteUuid: kf.clienteUuid || clienteApp?.UUID || null,
                        ultimoAcesso: new Date(),
                    },
                    update: { senhaHash: auth?.senhaHash || kf.senhaHash, clienteUuid: auth?.clienteUuid || kf.clienteUuid || clienteApp?.UUID || null, ultimoAcesso: new Date() },
                });
                return { token: gerarTokenCliente(auth), cliente: await this._perfilPublico(auth) };
            }
        }

        if (!auth || !auth.senhaHash) throw new Error('Documento não cadastrado ou sem senha.');
        throw new Error('Senha incorreta.');
    },

    // Gera o código de recuperação e ENVIA por WhatsApp (não retorna o código pro front).
    async esqueciSenha(docRaw) {
        const documento = normalizarDoc(docRaw);
        if (!docValido(documento)) throw new Error('Informe um CPF ou CNPJ válido.');
        let auth = await prisma.congeladosCliente.findUnique({ where: { documento } });

        // Junta telefone/nome do cadastro do app e do Kit Festa
        const clienteApp = await prisma.cliente.findFirst({ where: { Documento: { contains: documento } }, select: { UUID: true, Nome: true, NomeFantasia: true, Telefone: true, Telefone_Celular: true } });
        const kf = documento.length === 11 ? await prisma.kitFestaCliente.findUnique({ where: { cpf: documento } }).catch(() => null) : null;

        let nome = auth?.nome || clienteApp?.NomeFantasia || clienteApp?.Nome || kf?.nome;
        let telefone = auth?.telefone || clienteApp?.Telefone_Celular || clienteApp?.Telefone || kf?.telefone;
        const clienteUuid = auth?.clienteUuid || clienteApp?.UUID || kf?.clienteUuid || null;

        if (!auth && !nome) throw new Error('Documento não encontrado.');
        if (!auth) {
            auth = await prisma.congeladosCliente.create({ data: { documento, nome: nome || 'Cliente', telefone: telefone || null, clienteUuid } });
        }
        if (!telefone) throw new Error('Não há um WhatsApp no seu cadastro. Fale com a gente para recuperar o acesso.');

        const codigo = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 caracteres
        await prisma.congeladosCliente.update({ where: { documento }, data: { resetToken: codigo, resetTokenExp: new Date(Date.now() + 30 * 60 * 1000) } });

        const msg = `Olá, *${nome}*! 🔐\n\nSeu código para criar uma nova senha no site da Hardt é:\n\n*${codigo}*\n\nVálido por 30 minutos. Se não foi você, ignore esta mensagem.`;
        // referencia ÚNICA por código: com a mesma, o bot devolveria `duplicado`
        // e o cliente nunca receberia o 2º código (ficaria travado fora do site).
        await webhookService.enviarMensagemCustom(telefone, nome, msg, {
            tipo: 'verificacao',
            origem: 'site-congelados',
            referencia: `verificacao-congelados-${documento}-${codigo}`,
        }).catch(e => console.error('[Congelados] envio código:', e.message));

        return { enviado: true, telefone: mascararTelefone(telefone) };
    },

    async resetSenha({ documento: docRaw, codigo, novaSenha }) {
        const documento = normalizarDoc(docRaw);
        if (!novaSenha || novaSenha.length < 4) throw new Error('A senha precisa ter ao menos 4 caracteres.');
        const auth = await prisma.congeladosCliente.findUnique({ where: { documento } });
        if (!auth || !auth.resetToken || auth.resetToken !== String(codigo || '').toUpperCase()) {
            throw new Error('Código inválido.');
        }
        if (!auth.resetTokenExp || auth.resetTokenExp < new Date()) throw new Error('Código expirado.');
        const senhaHash = await bcrypt.hash(novaSenha, 10);
        await prisma.congeladosCliente.update({
            where: { documento },
            data: { senhaHash, resetToken: null, resetTokenExp: null },
        });
        return { token: gerarTokenCliente(auth), cliente: await this._perfilPublico(auth) };
    },

    async _perfilPublico(auth) {
        let cliente = null;
        if (auth.clienteUuid) {
            cliente = await prisma.cliente.findUnique({
                where: { UUID: auth.clienteUuid },
                include: {
                    categoriaCliente: { select: { semLimiteDesconto: true } },
                    // Integração site ↔ Bot Hardt: só nome de exibição e nome usado no bot.
                    // Telefone/e-mail do vendedor NUNCA saem para o site.
                    vendedor: { select: { nome: true, ativo: true, nomeVendedorBotHardt: true } },
                },
            }).catch(() => null);
        }
        const ctx = await contextoPreco(cliente);
        return {
            id: auth.id,
            documento: auth.documento,
            nome: cliente?.NomeFantasia || cliente?.Nome || auth.nome,
            telefone: auth.telefone,
            email: auth.email,
            temCadastroApp: !!auth.clienteUuid,
            diasEntrega: diasEntregaLabels(cliente?.Dia_de_entrega),
            diasEntregaNums: diasEntregaNums(cliente?.Dia_de_entrega), // dias regulares como números da semana

            condicaoPadrao: ctx.condicaoPadrao, // o site usa SÓ a condição padrão do cliente

            // Vendedor do cliente para o botão "Falar com meu vendedor" (WhatsApp da empresa).
            // vendedorBotNome é o "Nome usado no Bot Hardt" — o site confere se ele está na
            // lista oficial (/vendedores-site) antes de oferecer o atalho direto.
            vendedorNome: (cliente?.vendedor?.ativo !== false && cliente?.vendedor?.nome) || null,
            vendedorBotNome: (cliente?.vendedor?.ativo !== false && cliente?.vendedor?.nomeVendedorBotHardt) || null,
        };
    },

    async perfil(clienteId) {
        const auth = await prisma.congeladosCliente.findUnique({ where: { id: clienteId } });
        if (!auth) throw new Error('Cliente não encontrado.');
        return this._perfilPublico(auth);
    },

    // ───────── Catálogo / grupos ─────────
    // Decisão do dono (16/09/2026): o rótulo de preparo do card passa a vir da ETIQUETA (Dados
    // da Etiqueta do PCP, `EtiquetaProduto.modoPreparo`, classificado com segurança por
    // `iaProdutoSerializer.preparoLabelDeEtiqueta`) quando ela permitir classificar com
    // segurança; o texto por categoria (config "categoriasNomes") vira RESERVA — só usado quando
    // não há etiqueta ativa ou o texto dela não bate com nenhum verbo reconhecido. Antes o rótulo
    // vinha só da categoria e 25 dos 51 produtos do site mostravam "Somente Aquecer" enquanto a
    // etiqueta mandava fritar/assar.
    async catalogoPublico() {
        const [produtos, cfgRow] = await Promise.all([
            prisma.congeladosProduto.findMany({
                where: { ativo: true },
                include: { produto: { include: { imagens: true, categoriaProduto: true } } },
                orderBy: [{ ordem: 'asc' }],
            }),
            prisma.congeladosConfig.findUnique({ where: { chave: 'categoriasNomes' } }).catch(() => null),
        ]);
        const overrides = (cfgRow && cfgRow.valor) || {}; // { [categoriaId]: { nome, ordem, oculto, preparo } }
        const produtosAtivos = produtos.filter(p => p.produto && p.produto.ativo !== false);
        // SÓ etiquetas (1 query) — o site público não usa promoção, então não carrega
        // (revisão de código 16/09/2026: `carregarExtrasProdutos` completo, com promoções vigentes
        // e seus grupos/condições, rodava em TODA visita do site só para tirar `preparo`, sem
        // nenhum uso do resto). `_enriquecerCatalogoParaIA` reaproveita via `lista._etiquetas`
        // quando o caminho da IA precisar também de promoção.
        const extrasEtiquetas = await iaProduto.carregarEtiquetasProdutos(produtosAtivos.map(p => p.produto));
        const lista = produtosAtivos.map(cp => {
            const o = produtoSitePublico(cp);
            const ov = overrides[o.grupo];
            const preparoCategoria = (ov && typeof ov === 'object' && ov.preparo) ? String(ov.preparo).trim() : '';
            const etiqueta = extrasEtiquetas.etiquetas.get(cp.produtoId) || null;
            const preparoEtiqueta = etiqueta ? iaProduto.preparoLabelDeEtiqueta(etiqueta.modoPreparo) : null;
            // "preparo": rótulo que aparece no card (ex.: "Para fritar") — etiqueta manda, categoria
            // é reserva. "preparoOrigem": de onde veio ("ETIQUETA"/"CATEGORIA"/null — campo NOVO,
            // aditivo). "modoPreparo": texto completo da etiqueta, até 300 chars (campo NOVO).
            o.preparo = preparoEtiqueta || preparoCategoria;
            o.preparoOrigem = preparoEtiqueta ? 'ETIQUETA' : (preparoCategoria ? 'CATEGORIA' : null);
            o.modoPreparo = etiqueta?.modoPreparo ? String(etiqueta.modoPreparo).trim().slice(0, 300) : null;
            // "indisponivel": sem estoque disponível
            o.indisponivel = produtoIndisponivel(cp.produto);
            // Registro cru pendurado como propriedade NÃO enumerável: JSON.stringify e
            // `{...spread}` ignoram — o site público continua recebendo o mesmo JSON. Só o
            // caminho da IA (_enriquecerCatalogoParaIA) lê isso, sem query extra.
            Object.defineProperty(o, '_cp', { value: cp, enumerable: false, writable: false });
            return o;
        });
        // Etiquetas já carregadas penduradas (não enumerável) na lista — _enriquecerCatalogoParaIA
        // reaproveita (não rebusca etiqueta; só busca promoção quando `paraIA`).
        Object.defineProperty(lista, '_etiquetas', { value: extrasEtiquetas, enumerable: false, writable: false });
        return lista;
    },

    // Catálogo do VISITANTE (sem login): aplica a tabela "Site" (acréscimo %) sobre o
    // preço base. Cliente logado tem o catálogo personalizado em meuCatalogo().
    // `paraIA` (v1.6.0): soma o objeto único de produto da IA em cada item (só a rota da IA
    // passa true; a rota pública do site continua sem os campos novos).
    async catalogoVisitante({ paraIA = false } = {}) {
        const [lista, ctx] = await Promise.all([this.catalogoPublico(), contextoPreco(null)]);
        lista.forEach(p => {
            p.preco = precoVendedor({ base: p.preco, acrescimoPct: ctx.acrescimoPct, maxDescontoPct: ctx.maxDescontoPct });
        });
        if (paraIA) await this._enriquecerCatalogoParaIA(lista, { acrescimoPct: ctx.acrescimoPct, comPrecoCliente: false });
        return lista;
    },

    // v1.6.0 — soma ao catálogo já serializado os campos do objeto único de produto da IA
    // (nomeCurto, nomeCompleto, embalagemInfo, tamanho, pesoUnidadeG, preparoTipo, precoTabela,
    // precoCliente, disponivel, previsaoRetorno, promocao…). Nunca sobrescreve campo existente.
    // Extras (etiquetas, promoções) carregados em LOTE — sem N+1.
    // `extras` (revisor 09/2026): se o chamador já carregou (catalogoPorTelefone monta o union
    // com os produtos dos pedidos do reconhecimento e carrega uma vez só), reaproveita em vez de
    // buscar de novo. Sem o parâmetro, reaproveita as etiquetas já penduradas por catalogoPublico()
    // em `lista._etiquetas` (revisão de código 16/09/2026) — só a query de PROMOÇÃO roda aqui,
    // nenhuma query de etiqueta duplicada.
    async _enriquecerCatalogoParaIA(lista, { acrescimoPct = 0, comPrecoCliente = false, extras = null } = {}) {
        const cps = lista.map(p => p._cp).filter(Boolean);
        const extrasFinal = extras || await iaProduto.carregarExtrasProdutos(cps.map(cp => cp.produto), { etiquetasBase: lista._etiquetas || null });
        for (const p of lista) {
            const cp = p._cp;
            if (!cp?.produto) continue;
            const novos = iaProduto.produtoParaIA({
                produto: cp.produto,
                cp,
                etiqueta: extrasFinal.etiquetas.get(cp.produtoId) || null,
                promo: extrasFinal.promos.get(cp.produtoId) || null,
                preparoLabel: p.preparo || '',
                preparoOrigem: p.preparoOrigem || null,
                acrescimoPct,
                precoCliente: comPrecoCliente ? p.preco : null,
                nomePorProdutoId: extrasFinal.nomes,
            });
            iaProduto.enriquecerItem(p, novos);
        }
        return lista;
    },

    // Grupos (categorias comerciais) presentes no catálogo de congelados — para os filtros.
    // O nome exibido pode ser personalizado pelo admin (config "categoriasNomes").
    async gruposPublico() {
        const [produtos, cfgRow] = await Promise.all([
            prisma.congeladosProduto.findMany({ where: { ativo: true }, include: { produto: { include: { categoriaProduto: true } } } }),
            prisma.congeladosConfig.findUnique({ where: { chave: 'categoriasNomes' } }).catch(() => null),
        ]);
        const overrides = (cfgRow && cfgRow.valor) || {}; // { [categoriaId]: { nome, ordem, oculto } | "nome" }
        const map = new Map();
        produtos.forEach(p => {
            const c = p.produto?.categoriaProduto;
            if (!c || map.has(c.id)) return;
            const ov = overrides[c.id];
            const nome = typeof ov === 'string' ? ov : (ov?.nome || c.nome);
            const ordem = (ov && typeof ov === 'object' && ov.ordem != null) ? ov.ordem : (c.ordemExibicao || 0);
            const oculto = ov && typeof ov === 'object' && !!ov.oculto;
            if (!oculto) map.set(c.id, { id: c.id, nome, ordem });
        });
        return [...map.values()].sort((a, b) => a.ordem - b.ordem);
    },

    // Ficha do produto (popup) — puxa os dados da etiqueta pelo código/produto
    async fichaPublico(congeladosProdutoId) {
        const cp = await prisma.congeladosProduto.findUnique({
            where: { id: congeladosProdutoId },
            include: { produto: { include: { imagens: true, categoriaProduto: true } } },
        });
        if (!cp || !cp.produto) throw new Error('Produto não encontrado.');
        const p = cp.produto;

        let et = await prisma.etiquetaProduto.findFirst({ where: { produtoId: p.id, ativo: true }, orderBy: { updatedAt: 'desc' } });
        if (!et && p.codigo) et = await prisma.etiquetaProduto.findFirst({ where: { codigoProduto: p.codigo, ativo: true }, orderBy: { updatedAt: 'desc' } });

        return {
            id: cp.id,
            nome: cp.nomeSite || p.nome,
            codigo: p.codigo,
            unidade: p.unidade,
            unidades: cp.unidadesPorCaixa || 0,
            embalagem: cp.embalagem || 'caixa',
            descricao: cp.descricaoSite || p.descricao || '',
            grupoNome: p.categoriaProduto?.nome || null,
            imagem: imagemPrincipal(p),
            imagens: imagensProduto(p),
            etiqueta: et ? {
                pesoUnitario: et.pesoUnitario,
                pesoPorcao: et.pesoTabelaNutricional,
                quantidadeEmbalagem: et.quantidadeEmbalagem,
                quantidadeAproximada: et.quantidadeAproximada,
                pesoPacote: et.pesoPacote, // gramas; null = sem peso fixo cadastrado
                // valores nutricionais crus (ex.: "169kcal (12% VD)") — o front calcula 100g/porção/%VD
                nutricional: {
                    valorEnergetico: et.valorEnergetico,
                    carboidratos: et.carboidratos,
                    acucaresTotais: et.acucaresTotais,
                    acucaresAdicionados: et.acucaresAdicionados,
                    proteinas: et.proteinas,
                    gordurasTotais: et.gordurasTotais,
                    gordurasSaturadas: et.gordurasSaturadas,
                    gordurasTrans: et.gordurasTrans,
                    fibraAlimentar: et.fibraAlimentar,
                    sodio: et.sodio,
                },
                composicao: et.composicao,
                modoPreparo: et.modoPreparo,
                armazenamento: et.armazenamento,
                validadeDias: et.validadeDias,
                // declaração de alérgenos (padrão ANVISA RDC 26/2015 + IN 75/2020)
                contemGluten: et.contemGluten,
                contemLactose: et.contemLactose,
                alergenos: Array.isArray(et.alergenos) ? et.alergenos : [],
                especieCrustaceos: et.especieCrustaceos,
                especiePeixes: et.especiePeixes,
                avisosRotulo: et.avisosRotulo,
            } : null,
        };
    },

    // Produtos das últimas N compras REAIS do cliente (para "Você sempre pede").
    // Regras: últimos N pedidos NÃO bonificação e não excluídos; desconta o que foi
    // devolvido (devolução ATIVA) — produto totalmente devolvido e ausente nos demais
    // pedidos não entra na lista. Sem limite de itens: traz todos os que sobraram.
    async _produtoIdsHistorico(clienteUuid, ultimas = 5) {
        if (!clienteUuid) return new Set();
        const pedidos = await prisma.pedido.findMany({
            where: { clienteId: clienteUuid, bonificacao: false, statusEnvio: { not: 'EXCLUIDO' } },
            orderBy: { createdAt: 'desc' }, // últimas compras = pedidos feitos por último
            take: ultimas,
            select: { id: true, itens: { select: { produtoId: true, quantidade: true } } },
        });
        if (!pedidos.length) return new Set();

        // quantidade pedida por produto nesses pedidos
        const net = {};
        pedidos.forEach(p => p.itens.forEach(i => {
            if (!i.produtoId) return;
            net[i.produtoId] = (net[i.produtoId] || 0) + Number(i.quantidade || 0);
        }));

        // subtrai as devoluções ATIVAS desses pedidos
        const devs = await prisma.devolucao.findMany({
            where: { pedidoOriginalId: { in: pedidos.map(p => p.id) }, status: 'ATIVA' },
            select: { itens: { select: { produtoId: true, quantidade: true } } },
        });
        devs.forEach(d => d.itens.forEach(i => {
            if (net[i.produtoId] == null) return;
            net[i.produtoId] -= Number(i.quantidade || 0);
        }));

        const ids = new Set();
        Object.keys(net).forEach(pid => { if (net[pid] > 0.0001) ids.add(pid); });
        return ids;
    },

    // Catálogo + flag "comprado" + último pedido (para repetir), tudo personalizado.
    // `paraIA` (v1.6.0): só a rota da IA passa true — soma o objeto único de produto.
    async meuCatalogo(clienteId, { paraIA = false } = {}) {
        const auth = await prisma.congeladosCliente.findUnique({ where: { id: clienteId } });
        const clienteUuid = auth?.clienteUuid || null;
        const cliente = clienteUuid
            ? await prisma.cliente.findUnique({ where: { UUID: clienteUuid }, include: { categoriaCliente: { select: { semLimiteDesconto: true } } } }).catch(() => null)
            : null;
        const catalogo = await this.catalogoPublico();

        const compradosIds = await this._produtoIdsHistorico(clienteUuid, 5);
        catalogo.forEach(p => { p.comprado = compradosIds.has(p.produtoId); });

        // Preço idêntico ao que o vendedor vê: condição padrão + último preço real + piso do flex
        const ctx = await contextoPreco(cliente);
        const ultimaMap = await precoUltimaCompraMap(clienteUuid, catalogo.map(p => p.produtoId));
        catalogo.forEach(p => {
            p.preco = precoVendedor({ base: p.preco, acrescimoPct: ctx.acrescimoPct, ultimoPreco: ultimaMap[p.produtoId], maxDescontoPct: ctx.maxDescontoPct });
        });

        // Último pedido (para "repetir último pedido"), remontado sobre o catálogo já com o preço do
        // cliente. Mesma regra do reconhecimento por telefone — helper único _ultimoPedidoCliente.
        const ultimoPedido = await this._ultimoPedidoCliente(clienteUuid, catalogo);
        if (paraIA) {
            await this._enriquecerCatalogoParaIA(catalogo, { acrescimoPct: ctx.acrescimoPct, comPrecoCliente: true });
            this._anexarProdutoNoUltimoPedido(ultimoPedido, catalogo);
        }
        return { catalogo, ultimoPedido };
    },

    // v1.6.0 — cada item de `ultimoPedido[]` (array, formato INALTERADO) ganha o sub-objeto
    // `produto`, copiado do item já enriquecido do catálogo (mesmo congeladosProdutoId).
    _anexarProdutoNoUltimoPedido(ultimoPedido, catalogo) {
        if (!Array.isArray(ultimoPedido) || !ultimoPedido.length) return;
        const porId = new Map(catalogo.map(p => [p.id, p]));
        for (const it of ultimoPedido) {
            const p = porId.get(it.id);
            it.produto = p ? { ...p } : null; // spread não copia o _cp (não enumerável)
        }
    },

    // Último pedido REAL do cliente (não bonificação, não excluído), remontado sobre o catálogo já
    // precificado para ele — é o "quero o de sempre" do bot. Desconta devoluções ATIVAS (item
    // totalmente devolvido não volta) e ignora produto que não está mais no site. Cada item traz
    // `id` (= congeladosProdutoId, para recriar o carrinho) + nome/unidade/precoUnit (para a conversa).
    async _ultimoPedidoCliente(clienteUuid, catalogo) {
        if (!clienteUuid) return [];
        const ultimo = await prisma.pedido.findFirst({
            where: { clienteId: clienteUuid, bonificacao: false, statusEnvio: { not: 'EXCLUIDO' } },
            orderBy: { createdAt: 'desc' }, // o pedido real feito por último
            select: { id: true, itens: { select: { produtoId: true, quantidade: true } } },
        });
        if (!ultimo) return [];
        const porProduto = {}; // produtoId -> item do catálogo (com preço do cliente)
        catalogo.forEach(p => { porProduto[p.produtoId] = p; });
        const qtd = {};
        ultimo.itens.forEach(i => { if (i.produtoId && porProduto[i.produtoId]) qtd[i.produtoId] = (qtd[i.produtoId] || 0) + Number(i.quantidade || 0); });
        const devs = await prisma.devolucao.findMany({
            where: { pedidoOriginalId: ultimo.id, status: 'ATIVA' },
            select: { itens: { select: { produtoId: true, quantidade: true } } },
        });
        devs.forEach(d => d.itens.forEach(i => { if (qtd[i.produtoId] != null) qtd[i.produtoId] -= Number(i.quantidade || 0); }));
        return Object.keys(qtd)
            .filter(pid => qtd[pid] > 0.0001)
            .map(pid => {
                const p = porProduto[pid];
                return {
                    id: p.id,                    // congeladosProdutoId — usar em itens[].id ao criar pedido
                    congeladosProdutoId: p.id,   // legado (mantido para não quebrar consumidores antigos)
                    produtoId: p.produtoId,
                    nome: p.nome,
                    unidade: p.unidade,
                    quantidade: Math.round(qtd[pid]) || 1,
                    precoUnit: p.preco,
                };
            });
    },

    // Acha o Cliente cadastrado cujo telefone bate com o informado (Telefone, Telefone_Celular ou
    // Telefone_Comercial), tolerando diferenças de formatação. Base do reconhecimento automático:
    // o número de quem manda mensagem no WhatsApp já vem autenticado pelo próprio WhatsApp, então
    // é uma identificação mais forte que pedir CPF/CNPJ digitado (qualquer um pode digitar um CPF
    // alheio; ninguém consegue mandar mensagem de um WhatsApp que não é o seu).
    async _clientePorTelefone(telefoneRaw) {
        const chaveAlvo = chaveTelefone(telefoneRaw);
        if (!chaveAlvo) return null;
        const candidatos = await prisma.cliente.findMany({
            where: {
                Ativo: true,
                OR: [
                    { Telefone: { not: null } }, { Telefone_Celular: { not: null } },
                    { Telefone_Comercial: { not: null } }, { whatsapp: { isNot: null } },
                ],
            },
            include: {
                categoriaCliente: { select: { semLimiteDesconto: true } },
                whatsapp: { select: { numeros: true } },
            },
        });
        return candidatos.find(c =>
            chaveTelefone(c.Telefone) === chaveAlvo ||
            chaveTelefone(c.Telefone_Celular) === chaveAlvo ||
            chaveTelefone(c.Telefone_Comercial) === chaveAlvo ||
            (c.whatsapp?.numeros || []).some(n => chaveTelefone(n) === chaveAlvo)
        ) || null;
    },

    // Catálogo + condição comercial do cliente reconhecido pelo telefone de quem está mandando
    // mensagem — SEM pedir CPF nem senha. Se não achar por telefone, devolve reconhecido:false;
    // o app consumidor deve então cair no fluxo por CPF (checkDoc + login/criarSenha/esqueciSenha).
    async catalogoPorTelefone(telefoneRaw) {
        const cliente = await this._clientePorTelefone(telefoneRaw);
        if (!cliente) return { reconhecido: false };

        const catalogo = await this.catalogoPublico();
        const ctx = await contextoPreco(cliente);
        const ultimaMap = await precoUltimaCompraMap(cliente.UUID, catalogo.map(p => p.produtoId));
        catalogo.forEach(p => {
            p.preco = precoVendedor({ base: p.preco, acrescimoPct: ctx.acrescimoPct, ultimoPreco: ultimaMap[p.produtoId], maxDescontoPct: ctx.maxDescontoPct });
        });

        // "de sempre" liberado pela identificação por telefone (sem login): marca cada produto já
        // comprado (últimos 5 pedidos) e monta o último pedido para o bot oferecer "quero o de sempre".
        const compradosIds = await this._produtoIdsHistorico(cliente.UUID, 5);
        catalogo.forEach(p => { p.comprado = compradosIds.has(p.produtoId); });
        const ultimoPedido = await this._ultimoPedidoCliente(cliente.UUID, catalogo);

        // ── v1.6.0 (tudo aditivo; `ultimoPedido` continua ARRAY, `condicaoPadrao` continua objeto) ──
        // Revisor 09/2026 (caminho quente — roda a cada mensagem do bot): busca os registros CRUS
        // do último pedido e da fila/em-aberto primeiro, monta o UNION de produtos com o catálogo
        // e carrega etiquetas/promoções/preparo por categoria UMA vez só — antes eram até 3 cargas
        // (catálogo + ultimoPedidoDetalhe + pedidosEmAberto) para praticamente o mesmo conjunto.
        const [regUltimoPedido, regsAberto] = await Promise.all([
            iaPedidoService.buscarUltimoPedidoRegistro(cliente),
            iaPedidoService.buscarPedidosEmAbertoRegistros(cliente),
        ]);
        const entradasPedidos = [
            ...(regUltimoPedido ? [{ fonte: 'PEDIDO', reg: regUltimoPedido }] : []),
            ...regsAberto.fila.map(reg => ({ fonte: 'FILA', reg })),
            ...regsAberto.pedidos.map(reg => ({ fonte: 'PEDIDO', reg })),
        ];
        const produtosCatalogo = catalogo.map(p => p._cp?.produto).filter(Boolean);
        const produtosPedidos = iaPedidoService.produtosDeEntradas(entradasPedidos);
        const [extras, preparos] = await Promise.all([
            iaProduto.carregarExtrasProdutos([...produtosCatalogo, ...produtosPedidos]),
            iaPedidoService.preparoPorCategoria(),
        ]);

        await this._enriquecerCatalogoParaIA(catalogo, { acrescimoPct: ctx.acrescimoPct, comPrecoCliente: true, extras });
        this._anexarProdutoNoUltimoPedido(ultimoPedido, catalogo);
        const precoClientePorProduto = {};
        catalogo.forEach(p => { precoClientePorProduto[p.produtoId] = p.preco; });
        const ctxPedido = { acrescimoPct: ctx.acrescimoPct, precoClientePorProduto, extras, preparos, regUltimoPedido, regsAberto };
        const [ultimoPedidoDetalhe, pedidosEmAberto, horaCorte, tabela, vendedor] = await Promise.all([
            iaPedidoService.ultimoPedidoDetalhe(cliente, ctxPedido),
            iaPedidoService.pedidosEmAberto(cliente, ctxPedido),
            iaConsultaConfig.horaCorte(),
            ctx.condicaoPadrao?.id
                ? prisma.tabelaPreco.findUnique({ where: { id: ctx.condicaoPadrao.id }, select: { qtdParcelas: true, parcelasDias: true, tipoPagamento: true } }).catch(() => null)
                : Promise.resolve(null),
            cliente.idVendedor
                ? prisma.vendedor.findUnique({ where: { id: cliente.idVendedor }, select: { nome: true, ativo: true, nomeVendedorBotHardt: true } }).catch(() => null)
                : Promise.resolve(null),
        ]);
        const condicaoPadrao = ctx.condicaoPadrao
            ? { ...ctx.condicaoPadrao, prazoDias: tabela?.parcelasDias ?? null, parcelas: tabela?.qtdParcelas ?? null, tipoPagamento: tabela?.tipoPagamento ?? null }
            : null;
        const ultimaCompraEm = ultimoPedidoDetalhe?.data ? iaProduto.dataSP(ultimoPedidoDetalhe.data) : null;
        const diasSemComprar = ultimaCompraEm
            ? Math.max(0, Math.round((Date.parse(iaPedidoService.hojeSP()) - Date.parse(ultimaCompraEm)) / 86400000))
            : null;

        return {
            reconhecido: true,
            cliente: { nome: cliente.NomeFantasia || cliente.Nome, documento: cliente.Documento },
            condicaoPadrao,
            diasEntrega: diasEntregaLabels(cliente.Dia_de_entrega),
            diasEntregaNums: diasEntregaNums(cliente.Dia_de_entrega),
            catalogo,
            ultimoPedido,
            // v1.6.0
            ultimoPedidoDetalhe,
            pedidosEmAberto,
            proximasEntregas: iaPedidoService.proximasEntregas(diasEntregaNums(cliente.Dia_de_entrega), 2),
            horaCorte,
            ultimaCompraEm,
            diasSemComprar,
            // Mesma regra do site: só se o vendedor está ativo. Telefone do vendedor nunca sai.
            vendedorInfo: vendedor && vendedor.ativo !== false
                ? { nome: vendedor.nome, nomeBot: vendedor.nomeVendedorBotHardt || null, ativo: true }
                : null,
        };
    },

    // v1.6.0 — promoções vigentes dos produtos que estão no site (contexto: tabela "Site").
    // No reconhecimento por telefone, `catalogo[].promocao.precoPromo` já vem com o acréscimo
    // da condição do cliente — é esse que a Ana deve falar.
    // v1.6.1 — soma `regras`: explicação de como as promoções funcionam NESTE sistema (a Ana
    // já recebia a LISTA de promoções, mas não o "manual" delas). Escrito a partir do código
    // real de promocaoService.avaliarLiberada / calcularFlexComPromocao e da 1ª passada de
    // criarPedidoSite (subtotalNormal = soma a preço de tabela, ANTES do desconto — é o valor
    // usado para avaliar a condição VALOR_TOTAL).
    async promocoesVigentes() {
        const catalogo = await this.catalogoVisitante({ paraIA: true });
        return {
            promocoes: catalogo
                .filter(p => p.promocao)
                .map(p => ({ ...p.promocao, id_site: p.id, nome: p.nome, produto: { ...p } })),
            regras: {
                resumo: 'Existem dois tipos de promoção: PRECO (preço promocional vale sempre, qualquer '
                    + 'quantidade, dentro do período) e CONDICIONAL (só é liberada se o carrinho atender pelo '
                    + 'menos um dos grupos de condições cadastrados). O preço com desconto só é aplicado ao '
                    + 'item cuja promoção está vigente e, no caso CONDICIONAL, liberada — os demais itens do '
                    + 'pedido seguem o preço normal.',
                tipos: {
                    PRECO: 'Preço promocional (precoPromo) vale no período (validoDe–validoAte) para qualquer '
                        + 'quantidade do produto — não depende do resto do carrinho.',
                    CONDICIONAL: 'Só é liberada se pelo menos UM grupo de "condicoes" for atendido (grupos são '
                        + '"ou" entre si). Dentro de um grupo, TODAS as condições precisam ser verdadeiras ao '
                        + 'mesmo tempo ("e" entre elas). Cada condição é de um destes tipos: PRODUTO_QUANTIDADE '
                        + '(quantidade mínima de um produto específico no pedido) ou VALOR_TOTAL (valor mínimo '
                        + 'do pedido inteiro).',
                },
                precos: 'precoPromo já inclui o acréscimo % da condição de pagamento do cliente (mesma conta '
                    + 'da tela de pedido do vendedor) — é o valor que a Ana deve falar para o cliente. '
                    + 'precoPromoBase é o preço promocional cadastrado, sem esse acréscimo.',
                validade: 'validoDe/validoAte (formato AAAA-MM-DD) — fora desse período a promoção nem aparece '
                    + 'nesta lista, porque ela só traz promoções VIGENTES.',
                naoExiste: ['LEVE_MAIS'],
                comoUsar: 'Para aplicar uma promoção ao criar o pedido, mande o campo "promocaoId" no item '
                    + '(POST /congelados/pedido, itens[].promocaoId). O servidor SEMPRE valida de novo e '
                    + 'recalcula o preço — nunca confia em preço mandado pelo cliente/bot. Se a promoção não '
                    + 'existir/não estiver mais vigente, o erro vem com code "PROMOCAO_INVALIDA"; se existir '
                    + 'mas a condição do carrinho ainda não foi atendida, vem com code "PROMOCAO_NAO_LIBERADA" '
                    + '(a mensagem de erro já descreve a condição em português).',
                observacao: 'A condição VALOR_TOTAL (e a quantidade mínima de PRODUTO_QUANTIDADE) é avaliada '
                    + 'com os preços NORMAIS de tabela, somados ANTES de qualquer desconto de promoção — '
                    + 'ou seja, o cliente não consegue "se qualificar" para uma promoção usando o preço já '
                    + 'promocional de outro item.',
            },
        };
    },

    // v1.6.0 — produtos do site sem estoque (opção b do item 6). Não existe previsão de retorno
    // no cadastro: `previsaoRetorno` é sempre null.
    // v1.6.1 — soma `orientacao` (campo fixo): instrução curta para a Ana, já que o sistema não
    // tem essa data — evita a IA inventar prazo.
    async indisponiveis() {
        const catalogo = await this.catalogoVisitante({ paraIA: true });
        return {
            produtos: catalogo
                .filter(p => p.indisponivel)
                .map(p => ({ id: p.id, produtoId: p.produtoId, nome: p.nome, previsaoRetorno: null, produto: { ...p } })),
            orientacao: 'Sem previsão no sistema — a Ana deve perguntar ao responsável.',
        };
    },

    // Cria a senha do site direto pelo WhatsApp, sem precisar acessar o site — só é seguro porque
    // o telefone de quem está pedindo já bate com o cadastro (mesma checagem do catalogoPorTelefone
    // acima). A senha criada aqui é a MESMA conta usada no login do site (congeladosCliente por
    // documento), então funciona depois tanto no WhatsApp quanto no site normalmente.
    async criarSenhaPorTelefone({ telefone, senha }) {
        const cliente = await this._clientePorTelefone(telefone);
        if (!cliente) throw new Error('Não localizei seu cadastro por este WhatsApp. Informe seu CPF/CNPJ para continuar.');
        if (!cliente.Documento) throw new Error('Cadastro sem CPF/CNPJ definido — fale com um atendente.');
        return this.criarSenha({ documento: cliente.Documento, senha, nome: cliente.NomeFantasia || cliente.Nome, telefone });
    },

    // ───────── Config pública ─────────
    async configPublico() {
        const [rows, site] = await Promise.all([prisma.congeladosConfig.findMany(), tabelaSite()]);
        const map = {};
        rows.forEach(r => { map[r.chave] = r.valor; });
        // minimoSite: mínimo da tabela "Site" — usado para o visitante (sem condição própria).
        // horaCorte (v1.6.0): hora de corte do pedido (app_configs.ia_consulta_config); null = não configurada.
        const horaCorte = await iaConsultaConfig.horaCorte();
        return { ...DEFAULT_CONFIG, ...map, minimoSite: dec(site?.valorMinimo), horaCorte };
    },

    // ───────── Criação de pedido (cliente logado ou visitante) ─────────
    // Parâmetros INTERNOS (v1.6.0 — só criarPedidoIA passa; a rota pública do site nunca chega
    // aqui com eles, mesmo que o JSON traga `promocaoId`/`origem`/`observacaoInterna`):
    //   permitirPromocao — aceita itens[].promocaoId (validada e recalculada no servidor);
    //   origem           — SITE (padrão) | WHATSAPP_IA;
    //   observacaoInterna— texto só da equipe (coluna própria; nunca vai para Pedido.observacoes).
    async criarPedidoSite({ clienteId, visitante, itens, diaEntrega, dataEntrega, modo, observacoes, telefone, idempotencyKey }, { permitirPromocao = false, origem = 'SITE', observacaoInterna = null } = {}) {
        if (!Array.isArray(itens) || itens.length === 0) throw new Error('Carrinho vazio.');

        let auth;
        let semCadastro = false;
        if (clienteId) {
            auth = await prisma.congeladosCliente.findUnique({ where: { id: clienteId } });
            if (!auth) throw new Error('Cliente não encontrado.');
            semCadastro = !auth.clienteUuid;
        } else {
            const documento = normalizarDoc(visitante?.documento);
            if (!visitante?.nome || !docValido(documento)) throw new Error('Informe nome e CPF/CNPJ para pedido sem cadastro.');
            const existente = await prisma.congeladosCliente.findUnique({ where: { documento } });
            auth = existente || await prisma.congeladosCliente.create({
                data: { documento, nome: visitante.nome, telefone: visitante.telefone || null },
            });
            semCadastro = !auth.clienteUuid;
        }

        // Valida itens contra o catálogo (não confiar no preço do cliente)
        const cpIds = itens.map(i => i.congeladosProdutoId).filter(Boolean);
        const cps = await prisma.congeladosProduto.findMany({
            where: { id: { in: cpIds }, ativo: true },
            include: { produto: true },
        });
        const cpMap = {};
        cps.forEach(k => { cpMap[k.id] = k; });

        // Preço idêntico ao do vendedor, usando a condição PADRÃO do cliente.
        const cliente = auth.clienteUuid
            ? await prisma.cliente.findUnique({ where: { UUID: auth.clienteUuid }, include: { categoriaCliente: { select: { semLimiteDesconto: true } } } }).catch(() => null)
            : null;
        const ctx = await contextoPreco(cliente);
        const condicaoNome = ctx.condicaoPadrao?.nome || null;
        const tabelaIdFinal = ctx.condicaoPadrao?.id || null;
        const minimo = dec(ctx.condicaoPadrao?.valorMinimo);

        const produtoIds = cps.map(c => c.produtoId);
        const ultimaMap = await precoUltimaCompraMap(auth.clienteUuid, produtoIds);

        // 1ª passada: preço normal de cada item (é também o "subtotal a preços normais" que a
        // promoção CONDICIONAL de VALOR_TOTAL avalia — mesma estimativa da tela do vendedor,
        // feita ANTES do desconto).
        let subtotalNormal = 0;
        const carrinho = []; // { cp, qtd, precoNormal, promocaoId }
        for (const it of itens) {
            const cp = cpMap[it.congeladosProdutoId];
            if (!cp) throw new Error('Produto indisponível no carrinho.');
            if (produtoIndisponivel(cp.produto)) throw new Error(`"${cp.produto?.nome || 'Produto'}" está indisponível (sem estoque). Remova-o do carrinho.`);
            const qtd = parseInt(it.quantidade) || 0;
            if (qtd <= 0) continue;
            const base = cp.precoCongelados != null ? dec(cp.precoCongelados) : dec(cp.produto?.valorVenda);
            const precoNormal = precoVendedor({ base, acrescimoPct: ctx.acrescimoPct, ultimoPreco: ultimaMap[cp.produtoId], maxDescontoPct: ctx.maxDescontoPct });
            subtotalNormal += precoNormal * qtd;
            // promocaoId SÓ conta com permitirPromocao (caminho da IA); o site público ignora.
            carrinho.push({ cp, qtd, precoNormal, promocaoId: permitirPromocao && it.promocaoId ? String(it.promocaoId) : null });
        }
        if (!carrinho.length) throw new Error('Carrinho vazio.');

        // 2ª passada: promoção por item (v1.6.0). O preço NUNCA vem do bot — ele só referencia a
        // promoção; o servidor valida (vigente, do produto certo, condição atendida) e recalcula:
        // precoPromocional × (1 + acréscimo% da condição) — a mesma conta da tela do vendedor.
        // Ignora o último preço negociado e o piso do flex: promoção é preço sancionado.
        let subtotal = 0;
        let totalCaixas = 0;
        const itensData = [];
        const itensCarrinho = carrinho.map(c => ({ produtoId: c.cp.produtoId, quantidade: c.qtd }));
        for (const c of carrinho) {
            let preco = c.precoNormal;
            let promoAplicada = null;
            if (c.promocaoId) {
                const promo = await promocaoService.buscarVigentePorId(c.promocaoId);
                if (!promo) {
                    const e = new Error(`Promoção ${c.promocaoId} não está vigente.`);
                    e.code = 'PROMOCAO_INVALIDA';
                    throw e;
                }
                if (promo.produtoId !== c.cp.produtoId) {
                    const e = new Error(`A promoção "${promo.nome}" não é do produto "${c.cp.produto?.nome || ''}".`);
                    e.code = 'PROMOCAO_INVALIDA';
                    throw e;
                }
                if (!promocaoService.avaliarLiberada(promo, itensCarrinho, subtotalNormal)) {
                    const nomes = {};
                    cps.forEach(k => { nomes[k.produtoId] = k.nomeSite || k.produto?.nome; });
                    const cond = promocaoService.descreverCondicao(promo, nomes);
                    const e = new Error(`A promoção "${promo.nome}" exige: ${cond || 'condição não atendida'}.`);
                    e.code = 'PROMOCAO_NAO_LIBERADA';
                    throw e;
                }
                preco = Math.round(dec(promo.precoPromocional) * (1 + dec(ctx.acrescimoPct) / 100) * 100) / 100;
                promoAplicada = promo;
            }
            subtotal += preco * c.qtd;
            totalCaixas += c.qtd;
            itensData.push({
                congeladosProdutoId: c.cp.id,
                nomeProduto: c.cp.produto?.nome || '',
                quantidade: c.qtd,
                unidadesPorCaixa: c.cp.unidadesPorCaixa || 0,
                precoUnitario: preco,
                promocaoId: promoAplicada ? promoAplicada.id : null,
                nomePromocao: promoAplicada ? promoAplicada.nome : null,
            });
        }
        // Mínimo da condição continua sendo checado sobre o subtotal FINAL (com promoção).

        if (minimo > 0 && subtotal < minimo) {
            throw new Error(`Pedido mínimo de R$ ${minimo.toFixed(2).replace('.', ',')} para esta condição de pagamento.`);
        }

        // Telefone: cliente COM cadastro tem WhatsApp interno (não muda pelo site, por segurança).
        // Só visitante sem cadastro informa/atualiza o telefone.
        let telefoneFinal = auth.telefone || null;
        let celularAlterado = false;
        if (!auth.clienteUuid) {
            const telConfirmado = soDigitos(telefone);
            const telAntigo = soDigitos(auth.telefone);
            telefoneFinal = telConfirmado.length >= 10 ? telConfirmado : (auth.telefone || null);
            celularAlterado = telConfirmado.length >= 10 && telConfirmado !== telAntigo;
            if (celularAlterado) {
                await prisma.congeladosCliente.update({ where: { id: auth.id }, data: { telefone: telefoneFinal } }).catch(() => {});
            }
        }

        // ── Data de entrega + "encaixe" ──
        // - Cliente usando o dia regular do cadastro → pedido normal.
        // - Data fora do dia regular (ou cliente sem dia / visitante) → "encaixe": a equipe verifica.
        // - Fim de semana só é permitido em datas de calendário se o admin liberar (regular do cadastro é sempre honrado).
        const modoFinal = modo === 'retirada' ? 'retirada' : 'entrega';
        let dataEntregaFinal = null;
        let encaixe = false;
        let diaEntregaLabel = diaEntrega || null;
        if (dataEntrega) {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dataEntrega));
            if (!m) throw new Error('Data inválida.');
            const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
            const wd = dt.getUTCDay(); // 0=Dom..6=Sáb
            const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const palavra = modoFinal === 'retirada' ? 'retirada' : 'entrega';
            if (String(dataEntrega) <= hojeStr) throw new Error(`A data de ${palavra} deve ser a partir de amanhã.`);
            // Retirada: não considera o dia regular do cadastro e nunca é "encaixe".
            const regularNums = (modoFinal === 'entrega' && cliente) ? diasEntregaNums(cliente.Dia_de_entrega) : [];
            const ehRegular = regularNums.includes(wd);
            if (!ehRegular) {
                const cfg = await this.configPublico();
                if (wd === 0 && !cfg.entregas?.domingo) throw new Error(`Não atendemos ${palavra} aos domingos.`);
                if (wd === 6 && !cfg.entregas?.sabado) throw new Error(`Não atendemos ${palavra} aos sábados.`);
            }
            encaixe = modoFinal === 'entrega' && !ehRegular;
            dataEntregaFinal = dt;
            diaEntregaLabel = DIA_LABEL[TOKEN_POR_NUM[wd]];
        }

        const pedido = await prisma.congeladosPedido.create({
            data: {
                congeladosClienteId: auth.id,
                nomeCliente: auth.nome,
                documentoCliente: auth.documento,
                telefoneCliente: telefoneFinal,
                celularAlterado,
                semCadastro,
                tabelaPrecoId: tabelaIdFinal,
                condicaoNome,
                diaEntrega: diaEntregaLabel,
                dataEntrega: dataEntregaFinal,
                modo: modoFinal,
                encaixe,
                subtotal,
                total: subtotal,
                totalCaixas,
                observacoes: observacoes || null,
                // v1.6.0: colunas próprias — nada disso vai parar em Pedido.observacoes (NF-e/recibo).
                origem: origem === 'WHATSAPP_IA' ? 'WHATSAPP_IA' : 'SITE',
                observacaoInterna: observacaoInterna || null,
                status: semCadastro ? 'PENDENTE_CADASTRO' : 'AGUARDANDO',
                idempotencyKey: idempotencyKey || null,
                itens: { create: itensData },
            },
            include: { itens: true },
        });

        // NÃO enviamos mais cópia automática pelo nosso WhatsApp (risco de bloqueio).
        // O próprio cliente envia o pedido à loja pelo WhatsApp dele, na tela de confirmação.
        return pedido;
    },

    // ───────── Criação de pedido pela IA (WhatsApp/Antigravity) ─────────
    // Espelho fino do criarPedidoSite, mas identificando o cliente pelo TELEFONE de quem manda a
    // mensagem (autenticado pelo WhatsApp) — nunca por CPF digitado. Cliente reconhecido nasce
    // AGUARDANDO com o preço da condição dele; telefone novo exige nome+CPF e nasce PENDENTE_CADASTRO.
    // O pedido cai na MESMA fila de aprovação do site; o faturamento aprova escolhendo tipo/data.
    // v1.6.0 (aditivo): aceita `itens[].promocaoId` (validada/recalculada no servidor — `precoUnit`
    // do body é IGNORADO), `observacaoInterna` (só a equipe vê, coluna própria, 500 chars) e
    // `origem` (aceito e ignorado: aqui é sempre WHATSAPP_IA). A resposta ganhou `origem` e
    // `itens[]` (com sub-objeto `produto`), inclusive no caminho idempotente.
    async criarPedidoIA({ telefone, itens, data, modo, observacoes, visitante, idempotencyKey, observacaoInterna }) {
        if (!Array.isArray(itens) || itens.length === 0) throw new Error('Carrinho vazio.');

        // Idempotência: se a mesma chave já criou um pedido, devolve o mesmo (retry/timeout do bot).
        if (idempotencyKey) {
            const existente = await prisma.congeladosPedido.findFirst({ where: { idempotencyKey }, select: { id: true } }).catch(() => null);
            if (existente) return this._respostaPedidoIA(existente.id);
        }

        const itensMap = itens.map(i => ({ congeladosProdutoId: i.id, quantidade: i.quantidade, promocaoId: i.promocaoId || null }));
        const obs = observacoes ? `[WhatsApp IA] ${observacoes}` : '[WhatsApp IA]';
        const obsInterna = observacaoInterna
            ? String(observacaoInterna).replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 500) || null
            : null;
        const opcoesIA = { permitirPromocao: true, origem: 'WHATSAPP_IA', observacaoInterna: obsInterna };

        const cliente = await this._clientePorTelefone(telefone);
        let pedido;
        if (cliente) {
            const cc = await this._congeladosClienteVinculado(cliente, telefone);
            pedido = await this.criarPedidoSite({ clienteId: cc.id, itens: itensMap, dataEntrega: data, modo, observacoes: obs, telefone, idempotencyKey }, opcoesIA);
        } else {
            if (!visitante?.nome || !docValido(normalizarDoc(visitante?.cpf))) {
                const e = new Error('Cliente novo (telefone não reconhecido): informe nome e CPF/CNPJ para criar o pedido.');
                e.code = 'VISITANTE_SEM_CPF';
                throw e;
            }
            pedido = await this.criarPedidoSite({
                visitante: { documento: visitante.cpf, nome: visitante.nome, telefone: visitante.telefone || telefone },
                itens: itensMap, dataEntrega: data, modo, observacoes: obs, telefone: visitante.telefone || telefone, idempotencyKey,
            }, opcoesIA);
        }
        return this._respostaPedidoIA(pedido.id);
    },

    // Resposta do POST /congelados/pedido da IA: campos antigos (id, numero, status, total) +
    // origem + itens[] com o objeto único de produto. Recarrega o pedido com os produtos.
    async _respostaPedidoIA(congeladosPedidoId) {
        const cp = await prisma.congeladosPedido.findUnique({
            where: { id: congeladosPedidoId },
            include: { itens: { include: { congeladosProduto: { include: { produto: { include: iaProduto.PRODUTO_INCLUDE_IA } } } } } },
        });
        if (!cp) throw new Error('Pedido não encontrado.');
        const acrescimoPct = cp.tabelaPrecoId
            ? dec((await prisma.tabelaPreco.findUnique({ where: { id: cp.tabelaPrecoId }, select: { acrescimoPreco: true } }).catch(() => null))?.acrescimoPreco)
            : 0;
        const extras = await iaProduto.carregarExtrasProdutos(cp.itens.map(i => i.congeladosProduto?.produto).filter(Boolean));
        const cfgRow = await prisma.congeladosConfig.findUnique({ where: { chave: 'categoriasNomes' } }).catch(() => null);
        const overrides = (cfgRow && cfgRow.valor) || {};
        return {
            id: cp.id,
            numero: cp.numero,
            status: cp.status,
            total: dec(cp.total),
            origem: cp.origem || 'SITE',
            itens: cp.itens.map(it => {
                const prod = it.congeladosProduto?.produto || null;
                const catId = prod?.categoriaProduto?.id;
                const ov = catId ? overrides[catId] : null;
                // Preparo: etiqueta manda, categoria é reserva (mesma prioridade do catálogo —
                // decisão do dono 16/09/2026).
                const etiqueta = prod ? (extras.etiquetas.get(prod.id) || null) : null;
                const preparoCategoria = (ov && typeof ov === 'object' && ov.preparo) ? String(ov.preparo).trim() : '';
                const preparoEtiqueta = etiqueta ? iaProduto.preparoLabelDeEtiqueta(etiqueta.modoPreparo) : null;
                return {
                    id: it.congeladosProdutoId,
                    produtoId: it.congeladosProduto?.produtoId || null,
                    nome: it.nomeProduto,
                    quantidade: it.quantidade,
                    unidade: prod?.unidade || null,
                    precoUnit: dec(it.precoUnitario),
                    precoTotal: Math.round(dec(it.precoUnitario) * it.quantidade * 100) / 100,
                    promocaoId: it.promocaoId || null,
                    nomePromocao: it.nomePromocao || null,
                    produto: prod ? iaProduto.produtoParaIA({
                        produto: prod,
                        cp: it.congeladosProduto,
                        etiqueta,
                        promo: extras.promos.get(prod.id) || null,
                        preparoLabel: preparoEtiqueta || preparoCategoria,
                        preparoOrigem: preparoEtiqueta ? 'ETIQUETA' : (preparoCategoria ? 'CATEGORIA' : null),
                        acrescimoPct,
                        precoCliente: dec(it.precoUnitario),
                        nomePorProdutoId: extras.nomes,
                    }) : null,
                };
            }),
        };
    },

    // Garante uma conta do site (CongeladosCliente) vinculada ao Cliente reconhecido, para o pedido
    // do bot nascer AGUARDANDO (não PENDENTE_CADASTRO) e com o preço da condição real do cliente.
    async _congeladosClienteVinculado(cliente, telefoneRaw) {
        let cc = await prisma.congeladosCliente.findUnique({ where: { clienteUuid: cliente.UUID } }).catch(() => null);
        if (cc) return cc;
        const documento = normalizarDoc(cliente.Documento);
        if (!documento) throw new Error('Cadastro do cliente sem CPF/CNPJ — não é possível criar o pedido pelo bot.');
        const telefone = soDigitos(telefoneRaw) || null;
        cc = await prisma.congeladosCliente.findUnique({ where: { documento } }).catch(() => null);
        if (cc) {
            if (!cc.clienteUuid) cc = await prisma.congeladosCliente.update({ where: { id: cc.id }, data: { clienteUuid: cliente.UUID } }).catch(() => cc);
            return cc;
        }
        try {
            return await prisma.congeladosCliente.create({ data: { documento, nome: cliente.NomeFantasia || cliente.Nome, telefone, clienteUuid: cliente.UUID } });
        } catch (e) {
            // corrida/violação de unicidade — tenta reler pelo documento
            cc = await prisma.congeladosCliente.findUnique({ where: { documento } }).catch(() => null);
            if (cc) return cc;
            throw e;
        }
    },

    async meusPedidos(clienteId) {
        const lista = await prisma.congeladosPedido.findMany({
            where: { congeladosClienteId: clienteId },
            orderBy: { createdAt: 'desc' },
            include: { itens: true },
        });
        // A observação interna (combinado da Ana com a equipe) NUNCA sai para o cliente no site.
        return lista.map(({ observacaoInterna, ...p }) => p);
    },

    // ============================================================
    // ────────────────────── ADMIN ──────────────────────────────
    // ============================================================

    async adminListarProdutosApp({ busca, categoriaComercialId }) {
        const where = { ativo: true };
        if (busca) where.nome = { contains: busca, mode: 'insensitive' };
        if (categoriaComercialId) where.categoriaProdutoId = categoriaComercialId;

        const produtos = await prisma.produto.findMany({
            where,
            include: { imagens: true, congeladosProduto: true, categoriaProduto: true, kitFestaProduto: true },
            orderBy: { nome: 'asc' },
            take: 500,
        });
        return produtos.map(p => ({
            produtoId: p.id,
            nome: p.nome,
            codigo: p.codigo,
            unidade: p.unidade,
            valorVenda: dec(p.valorVenda),
            categoriaComercial: p.categoriaProduto?.nome || null,
            categoriaComercialId: p.categoriaProdutoId || null,
            imagem: imagemPrincipal(p),
            noKitFesta: !!p.kitFestaProduto,
            noSite: !!p.congeladosProduto,
            site: p.congeladosProduto ? {
                id: p.congeladosProduto.id,
                unidadesPorCaixa: p.congeladosProduto.unidadesPorCaixa,
                embalagem: p.congeladosProduto.embalagem || 'caixa',
                nomeSite: p.congeladosProduto.nomeSite || '',
                precoCongelados: p.congeladosProduto.precoCongelados != null ? dec(p.congeladosProduto.precoCongelados) : null,
                descricaoSite: p.congeladosProduto.descricaoSite,
                destaque: p.congeladosProduto.destaque,
                ordem: p.congeladosProduto.ordem,
                ativo: p.congeladosProduto.ativo,
            } : null,
        }));
    },

    async adminSalvarProdutoSite(produtoId, dados) {
        const data = {
            unidadesPorCaixa: dados.unidadesPorCaixa != null ? parseInt(dados.unidadesPorCaixa) : undefined,
            embalagem: dados.embalagem != null && String(dados.embalagem).trim() !== '' ? String(dados.embalagem).trim() : undefined,
            nomeSite: dados.nomeSite !== undefined ? (String(dados.nomeSite).trim() || null) : undefined,
            precoCongelados: dados.precoCongelados === '' || dados.precoCongelados == null ? null : Number(dados.precoCongelados),
            descricaoSite: dados.descricaoSite ?? undefined,
            destaque: dados.destaque != null ? !!dados.destaque : undefined,
            ordem: dados.ordem != null ? parseInt(dados.ordem) : undefined,
            ativo: dados.ativo != null ? !!dados.ativo : undefined,
        };
        return prisma.congeladosProduto.upsert({
            where: { produtoId },
            create: {
                produtoId,
                unidadesPorCaixa: dados.unidadesPorCaixa != null ? parseInt(dados.unidadesPorCaixa) : 0,
                embalagem: dados.embalagem != null && String(dados.embalagem).trim() !== '' ? String(dados.embalagem).trim() : 'caixa',
                nomeSite: dados.nomeSite ? String(dados.nomeSite).trim() : null,
                precoCongelados: dados.precoCongelados === '' || dados.precoCongelados == null ? null : Number(dados.precoCongelados),
                descricaoSite: dados.descricaoSite || null,
                destaque: !!dados.destaque,
                ordem: dados.ordem != null ? parseInt(dados.ordem) : 0,
                ativo: dados.ativo != null ? !!dados.ativo : true,
            },
            update: data,
        });
    },

    async adminRemoverProdutoSite(produtoId) {
        await prisma.congeladosProduto.deleteMany({ where: { produtoId } });
        return { ok: true };
    },

    // ── Config ──
    async adminGetConfig() {
        const rows = await prisma.congeladosConfig.findMany();
        const map = {};
        rows.forEach(r => { map[r.chave] = r.valor; });
        return { ...DEFAULT_CONFIG, ...map };
    },
    async adminSetConfig(chave, valor) {
        return prisma.congeladosConfig.upsert({ where: { chave }, create: { chave, valor }, update: { valor } });
    },

    // ── Pedidos (fila) ──
    async adminListarPedidos({ status, busca }) {
        // Sincroniza com o sistema: pedido convertido cujo pedido gerado foi EXCLUÍDO
        // no sistema vira CANCELADO aqui (status do site acompanha o do sistema).
        const convertidos = await prisma.congeladosPedido.findMany({
            where: { status: 'CONVERTIDO', pedidoId: { not: null } },
            select: { id: true, pedido: { select: { statusEnvio: true } } },
        });
        const cancelar = convertidos.filter(c => c.pedido?.statusEnvio === 'EXCLUIDO').map(c => c.id);
        if (cancelar.length) {
            await prisma.congeladosPedido.updateMany({ where: { id: { in: cancelar } }, data: { status: 'CANCELADO' } });
        }

        const where = {};
        if (status) where.status = status;
        if (busca) {
            const doc = normalizarDoc(busca); // preserva letras do CNPJ alfanumérico
            // Busca por nome, razão (Nome), fantasia, cidade, CPF/CNPJ e telefone.
            where.OR = [
                { nomeCliente: { contains: busca, mode: 'insensitive' } },
                doc ? { documentoCliente: { contains: doc } } : undefined,
                { telefoneCliente: { contains: busca } },
                { congeladosCliente: { cliente: { Nome: { contains: busca, mode: 'insensitive' } } } },
                { congeladosCliente: { cliente: { NomeFantasia: { contains: busca, mode: 'insensitive' } } } },
                { congeladosCliente: { cliente: { End_Cidade: { contains: busca, mode: 'insensitive' } } } },
            ].filter(Boolean);
        }
        return prisma.congeladosPedido.findMany({
            where,
            orderBy: { createdAt: 'desc' }, // mais recente primeiro
            include: {
                itens: true,
                congeladosCliente: { include: { cliente: { select: { Nome: true, NomeFantasia: true, End_Cidade: true, vendedor: { select: { nome: true } } } } } },
                pedido: { select: { id: true, numero: true, especial: true, statusEnvio: true } },
            },
            take: 300,
        });
    },

    // Pedidos NOVOS do site (Kit Festa + Congelados) aguardando aprovação — para o popup de alerta.
    async pedidosNovosSite() {
        const novos = { status: { in: ['AGUARDANDO', 'PENDENTE_CADASTRO'] } };
        const [kf, cg] = await Promise.all([
            prisma.kitFestaPedido.findMany({
                where: novos, orderBy: { createdAt: 'desc' },
                select: { id: true, numero: true, nomeCliente: true, total: true, totalCaixas: true, status: true, createdAt: true },
            }).catch(() => []),
            prisma.congeladosPedido.findMany({
                where: novos, orderBy: { createdAt: 'desc' },
                select: { id: true, numero: true, nomeCliente: true, total: true, totalCaixas: true, status: true, createdAt: true, encaixe: true },
            }).catch(() => []),
        ]);
        return { total: kf.length + cg.length, kitFesta: kf, congelados: cg };
    },

    async adminRecusarPedido(id, motivo) {
        return prisma.congeladosPedido.update({ where: { id }, data: { status: 'RECUSADO', motivoRecusa: motivo || null } });
    },

    // Vincula um pedido sem cadastro a um Cliente do app
    async adminVincularCliente(id, clienteUuid) {
        const cp = await prisma.congeladosPedido.findUnique({ where: { id } });
        if (!cp) throw new Error('Pedido não encontrado.');
        const cliente = await prisma.cliente.findUnique({ where: { UUID: clienteUuid } });
        if (!cliente) throw new Error('Cliente do app não encontrado.');

        await prisma.congeladosCliente.update({ where: { id: cp.congeladosClienteId }, data: { clienteUuid } }).catch(() => {});
        return prisma.congeladosPedido.update({ where: { id }, data: { semCadastro: false, status: 'AGUARDANDO' } });
    },

    // Aprova e converte em Pedido normal/especial/bonificação
    async adminAprovarPedido(id, { tipoConversao, dataVenda, dataEntrega, recalcular, aprovadoPorId, clienteUuid }) {
        const cp = await prisma.congeladosPedido.findUnique({
            where: { id },
            include: { itens: { include: { congeladosProduto: true } }, congeladosCliente: true },
        });
        if (!cp) throw new Error('Pedido não encontrado.');
        if (cp.pedidoId) throw new Error('Pedido já convertido.');

        let cId = clienteUuid || cp.congeladosCliente?.clienteUuid;
        if (!cId && cp.documentoCliente) {
            const c = await prisma.cliente.findFirst({ where: { Documento: { contains: cp.documentoCliente } }, select: { UUID: true } });
            cId = c?.UUID;
        }
        if (!cId) throw new Error('Cliente sem cadastro no app. Cadastre no Conta Azul e vincule antes de aprovar.');

        const cliente = await prisma.cliente.findUnique({ where: { UUID: cId }, select: { idVendedor: true, Dia_de_entrega: true } });

        // ── Data de entrega do Pedido (Pedido.dataVenda É a data de entrega no sistema) ──
        // Prioridade: dataEntrega do body (YYYY-MM-DD, não vazia) → recálculo explícito
        // (body com dataEntrega:'' ou recalcular:true — o operador limpou o campo de
        // propósito) → cp.dataEntrega (o que o cliente escolheu no site/IA), MAS só se
        // ainda não passou → próximo dia regular do cliente a partir de amanhã → amanhã.
        // NUNCA "hoje" por padrão (bug real: aprovar no dia seguinte ao pedido fazia a
        // entrega sair um dia antes do escolhido) e NUNCA reaproveitar uma data do site
        // que já ficou no passado (aprovação atrasada não pode gerar entrega retroativa).
        const modoAtual = cp.modo === 'retirada' ? 'retirada' : 'entrega';
        const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const amanhaStr = (() => {
            const [y, m, d] = hojeStr.split('-').map(Number);
            return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
        })();
        const proximoDiaRegular = () => {
            const proximas = iaPedidoService.proximasEntregas(diasEntregaNums(cliente?.Dia_de_entrega), 1);
            return proximas[0] || amanhaStr;
        };

        const recalcularExplicito = recalcular === true || dataEntrega === '';
        let dataEntregaStr = null;
        if (dataEntrega != null && dataEntrega !== '') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataEntrega))) throw new Error('Data de entrega inválida.');
            if (String(dataEntrega) < hojeStr) throw new Error('A data de entrega não pode ser no passado.');
            // Retirada pode ser hoje; entrega precisa ser a partir de amanhã.
            if (modoAtual !== 'retirada' && String(dataEntrega) < amanhaStr) throw new Error('A data de entrega deve ser a partir de amanhã.');
            dataEntregaStr = String(dataEntrega);
        } else if (recalcularExplicito) {
            // Campo limpo pelo operador (ou recálculo pedido explicitamente): ignora
            // cp.dataEntrega de propósito, mesmo que ela ainda seja uma data válida.
            dataEntregaStr = proximoDiaRegular();
        } else if (cp.dataEntrega) {
            const cpStr = cp.dataEntrega.toISOString().slice(0, 10); // gravada com Date.UTC → mesmo dia em UTC
            dataEntregaStr = cpStr >= hojeStr ? cpStr : proximoDiaRegular(); // já passou: recalcula sozinho, sem erro
        } else if (dataVenda) {
            // compatibilidade: quem já mandava dataVenda continua valendo se não vier dataEntrega
            dataEntregaStr = null; // dataVenda tratado mais abaixo, mantém comportamento antigo
        } else {
            dataEntregaStr = proximoDiaRegular();
        }
        const dataVendaFinal = dataEntregaStr ? new Date(dataEntregaStr + 'T12:00:00Z') : (dataVenda || new Date());

        // Condição de pagamento do pedido (respeita permissão de especial)
        const especial = tipoConversao === 'ESPECIAL';
        const bonificacao = tipoConversao === 'BONIFICACAO';
        let condPag = {};
        if (cp.tabelaPrecoId) {
            const t = await prisma.tabelaPreco.findUnique({ where: { id: cp.tabelaPrecoId } });
            if (t) {
                if (especial && !t.permiteEspecial) {
                    throw new Error(`A condição "${t.nomeCondicao}" não permite pedido especial.`);
                }
                if (!especial && !bonificacao && !t.permitePedido) {
                    throw new Error(`A condição "${t.nomeCondicao}" não permite pedido comum.`);
                }
                condPag = {
                    tipoPagamento: t.tipoPagamento || null,
                    opcaoCondicaoPagamento: t.opcaoCondicao || null,
                    nomeCondicaoPagamento: t.nomeCondicao || null,
                    qtdParcelas: t.qtdParcelas || 1,
                    intervaloDias: t.parcelasDias || 0,
                };
            }
        }

        const itensData = [];
        for (const it of cp.itens) {
            const produtoId = it.congeladosProduto?.produtoId;
            if (!produtoId) throw new Error(`Item "${it.nomeProduto}" não está mais vinculado a um produto do app.`);
            itensData.push({
                produtoId,
                quantidade: it.quantidade,
                valor: dec(it.precoUnitario),
                valorBase: dec(it.precoUnitario),
            });
        }

        // Pedido.observacoes vai para a NF-e (infCpl) e para o recibo: só a observação do cliente
        // entra aqui. `cp.observacaoInterna` (v1.6.0) fica SÓ na fila — o model Pedido não tem
        // campo de observação interna, e criar um está fora do escopo desta entrega.
        const novoPedido = await pedidoService.criar({
            clienteId: cId,
            vendedorId: cliente?.idVendedor || null,
            dataVenda: dataVendaFinal,
            observacoes: `Site Congelados #${cp.numero}${cp.observacoes ? ` · ${cp.observacoes}` : ''}`,
            especial,
            bonificacao,
            itens: itensData,
            canalOrigem: 'SITE_CONGELADOS',
            statusEnvio: 'ABERTO',
            ...condPag,
        });

        return prisma.congeladosPedido.update({
            where: { id },
            data: {
                status: 'CONVERTIDO',
                tipoConversao,
                pedidoId: novoPedido.id,
                aprovadoPorId: aprovadoPorId || null,
                aprovadoEm: new Date(),
            },
            include: { pedido: true },
        });
    },

    async adminExcluirPedido(id) {
        const cp = await prisma.congeladosPedido.findUnique({ where: { id } });
        if (!cp) throw new Error('Pedido não encontrado.');
        await prisma.congeladosPedido.delete({ where: { id } });
        return { ok: true };
    },
};

// ───────── Config padrão do site ─────────
const DEFAULT_CONFIG = {
    loja: {
        nome: 'Hardt Doces e Salgados',
        slogan: 'Salgados de festa feitos à mão',
        desde: 'desde 2007',
        endereco: 'Rua XV de Outubro, 170 — Pirabeiraba, Joinville/SC',
        telefone: '(47) 98854-8476',
        whatsapp: '5547988548476',
        instagram: 'hardtsalgados',
        facebook: '', // usuário/página ou link completo; vazio = não mostra
        email: 'atendimento@hardtsalgados.com.br',
        mapsUrl: 'https://maps.app.goo.gl/DHD5J5xC4toi4sRj6',
    },
    logoUrl: null, // logo enviada pelo admin (sobrepõe a padrão)
    // Frases da PÁGINA PRINCIPAL (home)
    hero: {
        kicker: 'Joinville/SC · Frota própria refrigerada',
        titulo: 'Salgado de verdade, feito à mão.',
        subtitulo: 'Desde 2007 levando coxinha, bolinha e empadinha pra festa, o coffee break e o freezer da sua casa. Peça pelo link, combine retirada ou entrega e pague depois — sem complicação.',
    },
    caminhos: {
        titulo: 'Dois jeitos de pedir',
        subtitulo: 'Salgados prontos pra sua festa ou congelados pra revender e ter sempre em estoque. Escolha por onde começar.',
    },
    // Faixa de diferenciais (4 destaques) da home — editável no admin
    diferenciais: [
        { num: 'desde 2007', titulo: 'Tradição', texto: 'Quase 20 anos fazendo salgado em Pirabeiraba, Joinville.' },
        { num: 'à mão', titulo: 'Feito artesanal', texto: 'Massa fininha, recheio caprichado e padrão em cada caixa.' },
        { num: '-18°C', titulo: 'Frota própria', texto: 'Entrega em veículos refrigerados, do nosso freezer ao seu.' },
        { num: 'no link', titulo: 'Pedido fácil', texto: 'Monte, escolha o horário e finalize pelo WhatsApp.' },
    ],
    // Seção "Nossa História" da home (texto + carrossel de imagens enviadas pelo admin)
    historia: {
        titulo: 'Nossa História',
        texto: 'A Hardt Salgados nasceu da paixão de uma família pela culinária e pelo sabor autêntico. Tudo começou em Joinville, em 2007, quando uma receita de família virou o sonho de levar o salgado feito à mão para a mesa de mais gente.\nDe uma cozinha pequena para uma produção que abastece festas, eventos e revendedores de toda a região — sempre com o mesmo cuidado: massa fininha, recheio caprichado e o ponto certo da fritura.',
        frase: '— do mesmo jeitinho, desde o primeiro dia',
        imagens: [],
    },
    // Texto da área de congelados (login)
    congelados: {
        loginTitulo: 'Área do cliente',
        loginSub: 'Entre para ver seus produtos, preços e condições e fazer seu pedido de congelados.',
    },
    // Entrega no fim de semana — liberada pelo admin (vale para datas escolhidas no calendário).
    entregas: { sabado: false, domingo: false },
    // Nome exibido no site para cada categoria comercial: { [categoriaId]: { nome, ordem, oculto } }
    categoriasNomes: {},
    // Opções de embalagem disponíveis no "Configurar" do produto (lista editável)
    embalagens: ['caixa', 'pacote', 'unidade', 'bandeja', 'saco'],
};

module.exports = congeladosService;
