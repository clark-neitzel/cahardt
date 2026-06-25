const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pedidoService = require('./pedidoService');
const webhookService = require('./webhookService');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';
const money2 = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

// ───────── Helpers ─────────
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const dec = (v) => (v == null ? 0 : Number(v));
const docValido = (d) => d.length === 11 || d.length === 14; // CPF ou CNPJ
// Esconde o meio do telefone: (47) 9****-**76
const mascararTelefone = (t) => {
    const d = soDigitos(t);
    if (d.length < 6) return '•••••';
    return `${d.slice(0, 2)} ${d.slice(2, 3)}••••-••${d.slice(-2)}`;
};

// Tokens de dia salvos no cadastro do cliente (Dia_de_entrega: "SEG,QUA") → rótulo amigável
const DIA_LABEL = { DOM: 'Domingo', SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta', QUI: 'Quinta', SEX: 'Sexta', SAB: 'Sábado' };
function diasEntregaLabels(str) {
    if (!str) return [];
    return String(str).split(/[,;/ ]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
        .map(t => DIA_LABEL[t] || DIA_LABEL[t.slice(0, 3)] || t);
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
        const documento = soDigitos(docRaw);
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
        const documento = soDigitos(docRaw);
        if (!docValido(documento)) throw new Error('Informe um CPF ou CNPJ válido.');
        if (!senha || senha.length < 4) throw new Error('A senha precisa ter ao menos 4 caracteres.');

        const clienteApp = await prisma.cliente.findFirst({
            where: { Documento: { contains: documento } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Telefone: true, Telefone_Celular: true, Email: true },
        });

        const senhaHash = await bcrypt.hash(senha, 10);
        const nomeFinal = nome || clienteApp?.NomeFantasia || clienteApp?.Nome || 'Cliente';

        const existente = await prisma.congeladosCliente.findUnique({ where: { documento } });
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
        const documento = soDigitos(docRaw);
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
        const documento = soDigitos(docRaw);
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
        await webhookService.enviarMensagemCustom(telefone, nome, msg).catch(e => console.error('[Congelados] envio código:', e.message));

        return { enviado: true, telefone: mascararTelefone(telefone) };
    },

    async resetSenha({ documento: docRaw, codigo, novaSenha }) {
        const documento = soDigitos(docRaw);
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
                include: { categoriaCliente: { select: { semLimiteDesconto: true } } },
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
            condicaoPadrao: ctx.condicaoPadrao, // o site usa SÓ a condição padrão do cliente
        };
    },

    async perfil(clienteId) {
        const auth = await prisma.congeladosCliente.findUnique({ where: { id: clienteId } });
        if (!auth) throw new Error('Cliente não encontrado.');
        return this._perfilPublico(auth);
    },

    // ───────── Catálogo / grupos ─────────
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
        return produtos
            .filter(p => p.produto && p.produto.ativo !== false)
            .map(cp => {
                const o = produtoSitePublico(cp);
                const ov = overrides[o.grupo];
                // "preparo": rótulo por categoria que aparece no card (ex.: "Para fritar")
                o.preparo = (ov && typeof ov === 'object' && ov.preparo) ? String(ov.preparo).trim() : '';
                return o;
            });
    },

    // Catálogo do VISITANTE (sem login): aplica a tabela "Site" (acréscimo %) sobre o
    // preço base. Cliente logado tem o catálogo personalizado em meuCatalogo().
    async catalogoVisitante() {
        const [lista, ctx] = await Promise.all([this.catalogoPublico(), contextoPreco(null)]);
        lista.forEach(p => {
            p.preco = precoVendedor({ base: p.preco, acrescimoPct: ctx.acrescimoPct, maxDescontoPct: ctx.maxDescontoPct });
        });
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

    // Produtos comprados nas últimas N compras do cliente (para "Você sempre pede")
    async _produtoIdsHistorico(clienteUuid, ultimas = 3) {
        if (!clienteUuid) return new Set();
        const pedidos = await prisma.pedido.findMany({
            where: { clienteId: clienteUuid },
            orderBy: { createdAt: 'desc' }, // últimas compras = pedidos feitos por último
            take: ultimas,
            include: { itens: { select: { produtoId: true } } },
        });
        const ids = new Set();
        pedidos.forEach(p => p.itens.forEach(i => ids.add(i.produtoId)));
        return ids;
    },

    // Catálogo + flag "comprado" + último pedido (para repetir), tudo personalizado
    async meuCatalogo(clienteId) {
        const auth = await prisma.congeladosCliente.findUnique({ where: { id: clienteId } });
        const clienteUuid = auth?.clienteUuid || null;
        const cliente = clienteUuid
            ? await prisma.cliente.findUnique({ where: { UUID: clienteUuid }, include: { categoriaCliente: { select: { semLimiteDesconto: true } } } }).catch(() => null)
            : null;
        const catalogo = await this.catalogoPublico();

        const compradosIds = await this._produtoIdsHistorico(clienteUuid, 3);
        catalogo.forEach(p => { p.comprado = compradosIds.has(p.produtoId); });

        // Preço idêntico ao que o vendedor vê: condição padrão + último preço real + piso do flex
        const ctx = await contextoPreco(cliente);
        const ultimaMap = await precoUltimaCompraMap(clienteUuid, catalogo.map(p => p.produtoId));
        catalogo.forEach(p => {
            p.preco = precoVendedor({ base: p.preco, acrescimoPct: ctx.acrescimoPct, ultimoPreco: ultimaMap[p.produtoId], maxDescontoPct: ctx.maxDescontoPct });
        });

        // Último pedido (para "repetir último pedido") — mapeado ao catálogo de congelados
        let ultimoPedido = [];
        if (clienteUuid) {
            const ultimo = await prisma.pedido.findFirst({
                where: { clienteId: clienteUuid },
                orderBy: { createdAt: 'desc' }, // o pedido feito por último
                include: { itens: { select: { produtoId: true, quantidade: true } } },
            });
            if (ultimo) {
                const porProduto = {};
                catalogo.forEach(p => { porProduto[p.produtoId] = p.id; });
                ultimoPedido = ultimo.itens
                    .filter(i => porProduto[i.produtoId])
                    .map(i => ({ congeladosProdutoId: porProduto[i.produtoId], quantidade: Math.round(Number(i.quantidade)) || 1 }));
            }
        }
        return { catalogo, ultimoPedido };
    },

    // ───────── Config pública ─────────
    async configPublico() {
        const [rows, site] = await Promise.all([prisma.congeladosConfig.findMany(), tabelaSite()]);
        const map = {};
        rows.forEach(r => { map[r.chave] = r.valor; });
        // minimoSite: mínimo da tabela "Site" — usado para o visitante (sem condição própria).
        return { ...DEFAULT_CONFIG, ...map, minimoSite: dec(site?.valorMinimo) };
    },

    // ───────── Criação de pedido (cliente logado ou visitante) ─────────
    async criarPedidoSite({ clienteId, visitante, itens, diaEntrega, observacoes, telefone }) {
        if (!Array.isArray(itens) || itens.length === 0) throw new Error('Carrinho vazio.');

        let auth;
        let semCadastro = false;
        if (clienteId) {
            auth = await prisma.congeladosCliente.findUnique({ where: { id: clienteId } });
            if (!auth) throw new Error('Cliente não encontrado.');
            semCadastro = !auth.clienteUuid;
        } else {
            const documento = soDigitos(visitante?.documento);
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

        let subtotal = 0;
        let totalCaixas = 0;
        const itensData = [];
        for (const it of itens) {
            const cp = cpMap[it.congeladosProdutoId];
            if (!cp) throw new Error('Produto indisponível no carrinho.');
            const qtd = parseInt(it.quantidade) || 0;
            if (qtd <= 0) continue;
            const base = cp.precoCongelados != null ? dec(cp.precoCongelados) : dec(cp.produto?.valorVenda);
            const preco = precoVendedor({ base, acrescimoPct: ctx.acrescimoPct, ultimoPreco: ultimaMap[cp.produtoId], maxDescontoPct: ctx.maxDescontoPct });
            subtotal += preco * qtd;
            totalCaixas += qtd;
            itensData.push({
                congeladosProdutoId: cp.id,
                nomeProduto: cp.produto?.nome || '',
                quantidade: qtd,
                unidadesPorCaixa: cp.unidadesPorCaixa || 0,
                precoUnitario: preco,
            });
        }
        if (!itensData.length) throw new Error('Carrinho vazio.');

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
                diaEntrega: diaEntrega || null,
                subtotal,
                total: subtotal,
                totalCaixas,
                observacoes: observacoes || null,
                status: semCadastro ? 'PENDENTE_CADASTRO' : 'AGUARDANDO',
                itens: { create: itensData },
            },
            include: { itens: true },
        });

        // NÃO enviamos mais cópia automática pelo nosso WhatsApp (risco de bloqueio).
        // O próprio cliente envia o pedido à loja pelo WhatsApp dele, na tela de confirmação.
        return pedido;
    },

    async meusPedidos(clienteId) {
        return prisma.congeladosPedido.findMany({
            where: { congeladosClienteId: clienteId },
            orderBy: { createdAt: 'desc' },
            include: { itens: true },
        });
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
            const doc = soDigitos(busca);
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
                congeladosCliente: { include: { cliente: { select: { Nome: true, NomeFantasia: true, End_Cidade: true } } } },
                pedido: { select: { id: true, numero: true, especial: true, statusEnvio: true } },
            },
            take: 300,
        });
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
    async adminAprovarPedido(id, { tipoConversao, dataVenda, aprovadoPorId, clienteUuid }) {
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

        const cliente = await prisma.cliente.findUnique({ where: { UUID: cId }, select: { idVendedor: true } });

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

        const novoPedido = await pedidoService.criar({
            clienteId: cId,
            vendedorId: cliente?.idVendedor || null,
            dataVenda: dataVenda || new Date(),
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
    // Nome exibido no site para cada categoria comercial: { [categoriaId]: { nome, ordem, oculto } }
    categoriasNomes: {},
    // Opções de embalagem disponíveis no "Configurar" do produto (lista editável)
    embalagens: ['caixa', 'pacote', 'unidade', 'bandeja', 'saco'],
};

module.exports = congeladosService;
