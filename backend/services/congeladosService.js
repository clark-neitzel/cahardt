const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pedidoService = require('./pedidoService');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';

// ───────── Helpers ─────────
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const dec = (v) => (v == null ? 0 : Number(v));
const docValido = (d) => d.length === 11 || d.length === 14; // CPF ou CNPJ

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

// Monta o objeto de produto pro site (preço base — a condição não altera o preço na v1)
function produtoSitePublico(cp) {
    const preco = cp.precoCongelados != null ? dec(cp.precoCongelados) : dec(cp.produto?.valorVenda);
    return {
        id: cp.id,
        produtoId: cp.produtoId,
        codigo: cp.produto?.codigo || '',
        nome: cp.produto?.nome || '',
        descricao: cp.descricaoSite || cp.produto?.descricao || '',
        unidade: cp.produto?.unidade || '',
        unidades: cp.unidadesPorCaixa || 0,
        grupo: cp.produto?.categoriaProduto?.id || null,
        grupoNome: cp.produto?.categoriaProduto?.nome || null,
        preco,
        destaque: cp.destaque,
        ordem: cp.ordem,
        imagem: imagemPrincipal(cp.produto),
    };
}

// Condições (TabelaPreco) liberadas para o cliente → formato do site
async function condicoesDoCliente(cliente) {
    if (!cliente) return [];
    const ids = new Set();
    if (cliente.Condicao_de_pagamento) ids.add(cliente.Condicao_de_pagamento);
    (cliente.condicoes_pagamento_permitidas || []).forEach(id => ids.add(id));
    if (!ids.size) return [];
    const tabelas = await prisma.tabelaPreco.findMany({ where: { id: { in: [...ids] }, ativo: true } });
    // Ordena com a condição padrão primeiro
    const padrao = cliente.Condicao_de_pagamento;
    tabelas.sort((a, b) => (a.id === padrao ? -1 : 0) - (b.id === padrao ? -1 : 0));
    return tabelas.map(t => ({
        id: t.id,
        nome: t.nomeCondicao,
        valorMinimo: dec(t.valorMinimo),
        permiteEspecial: !!t.permiteEspecial,
        permitePedido: !!t.permitePedido,
        padrao: t.id === padrao,
    }));
}

const congeladosService = {
    // ============================================================
    // ───────────────────── PÚBLICO ─────────────────────────────
    // ============================================================

    // Passo 1 do login: descobre o estado do documento (CPF/CNPJ)
    async checkDoc(docRaw) {
        const documento = soDigitos(docRaw);
        if (!docValido(documento)) throw new Error('Informe um CPF ou CNPJ válido.');

        const auth = await prisma.congeladosCliente.findUnique({ where: { documento } });
        const clienteApp = await prisma.cliente.findFirst({
            where: { Documento: { contains: documento } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Telefone: true, Telefone_Celular: true, Email: true },
        });

        if (auth) {
            return {
                situacao: auth.senhaHash ? 'TEM_SENHA' : 'CRIAR_SENHA',
                temCadastroApp: !!auth.clienteUuid || !!clienteApp,
                nome: auth.nome,
            };
        }
        if (clienteApp) {
            return {
                situacao: 'CRIAR_SENHA',
                temCadastroApp: true,
                nome: clienteApp.NomeFantasia || clienteApp.Nome,
                _clienteUuid: clienteApp.UUID,
            };
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
        const auth = await prisma.congeladosCliente.findUnique({ where: { documento } });
        if (!auth || !auth.senhaHash) throw new Error('Documento não cadastrado ou sem senha.');
        const ok = await bcrypt.compare(senha, auth.senhaHash);
        if (!ok) throw new Error('Senha incorreta.');
        await prisma.congeladosCliente.update({ where: { documento }, data: { ultimoAcesso: new Date() } });
        return { token: gerarTokenCliente(auth), cliente: await this._perfilPublico(auth) };
    },

    async esqueciSenha(docRaw) {
        const documento = soDigitos(docRaw);
        const auth = await prisma.congeladosCliente.findUnique({ where: { documento } });
        if (!auth) throw new Error('Documento não encontrado.');
        const token = crypto.randomBytes(4).toString('hex').toUpperCase();
        await prisma.congeladosCliente.update({
            where: { documento },
            data: { resetToken: token, resetTokenExp: new Date(Date.now() + 30 * 60 * 1000) },
        });
        return { codigo: token, telefone: auth.telefone, nome: auth.nome };
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
            cliente = await prisma.cliente.findUnique({ where: { UUID: auth.clienteUuid } }).catch(() => null);
        }
        const condicoes = await condicoesDoCliente(cliente);
        return {
            id: auth.id,
            documento: auth.documento,
            nome: cliente?.NomeFantasia || cliente?.Nome || auth.nome,
            telefone: auth.telefone,
            email: auth.email,
            temCadastroApp: !!auth.clienteUuid,
            diasEntrega: diasEntregaLabels(cliente?.Dia_de_entrega),
            condicoes,
        };
    },

    async perfil(clienteId) {
        const auth = await prisma.congeladosCliente.findUnique({ where: { id: clienteId } });
        if (!auth) throw new Error('Cliente não encontrado.');
        return this._perfilPublico(auth);
    },

    // ───────── Catálogo / grupos ─────────
    async catalogoPublico() {
        const produtos = await prisma.congeladosProduto.findMany({
            where: { ativo: true },
            include: { produto: { include: { imagens: true, categoriaProduto: true } } },
            orderBy: [{ ordem: 'asc' }],
        });
        return produtos
            .filter(p => p.produto && p.produto.ativo !== false)
            .map(produtoSitePublico);
    },

    // Grupos (categorias comerciais) presentes no catálogo de congelados — para os filtros
    async gruposPublico() {
        const produtos = await prisma.congeladosProduto.findMany({
            where: { ativo: true },
            include: { produto: { include: { categoriaProduto: true } } },
        });
        const map = new Map();
        produtos.forEach(p => {
            const c = p.produto?.categoriaProduto;
            if (c && !map.has(c.id)) map.set(c.id, { id: c.id, nome: c.nome, ordem: c.ordemExibicao || 0 });
        });
        return [...map.values()].sort((a, b) => a.ordem - b.ordem);
    },

    // Produtos comprados nas últimas N compras do cliente (para "Você sempre pede")
    async _produtoIdsHistorico(clienteUuid, ultimas = 3) {
        if (!clienteUuid) return new Set();
        const pedidos = await prisma.pedido.findMany({
            where: { clienteId: clienteUuid },
            orderBy: { dataVenda: 'desc' },
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
        const catalogo = await this.catalogoPublico();

        const compradosIds = await this._produtoIdsHistorico(clienteUuid, 3);
        catalogo.forEach(p => { p.comprado = compradosIds.has(p.produtoId); });

        // Último pedido (para "repetir último pedido") — mapeado ao catálogo de congelados
        let ultimoPedido = [];
        if (clienteUuid) {
            const ultimo = await prisma.pedido.findFirst({
                where: { clienteId: clienteUuid },
                orderBy: { dataVenda: 'desc' },
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
        const rows = await prisma.congeladosConfig.findMany();
        const map = {};
        rows.forEach(r => { map[r.chave] = r.valor; });
        return { ...DEFAULT_CONFIG, ...map };
    },

    // ───────── Criação de pedido (cliente logado ou visitante) ─────────
    async criarPedidoSite({ clienteId, visitante, itens, tabelaPrecoId, diaEntrega, observacoes, telefone }) {
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

        let subtotal = 0;
        let totalCaixas = 0;
        const itensData = [];
        for (const it of itens) {
            const cp = cpMap[it.congeladosProdutoId];
            if (!cp) throw new Error('Produto indisponível no carrinho.');
            const qtd = parseInt(it.quantidade) || 0;
            if (qtd <= 0) continue;
            const preco = cp.precoCongelados != null ? dec(cp.precoCongelados) : dec(cp.produto?.valorVenda);
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

        // Condição escolhida → mínimo de compra (em R$)
        let condicaoNome = null;
        let tabela = null;
        if (tabelaPrecoId) {
            tabela = await prisma.tabelaPreco.findUnique({ where: { id: tabelaPrecoId } });
            condicaoNome = tabela?.nomeCondicao || null;
            const minimo = dec(tabela?.valorMinimo);
            if (minimo > 0 && subtotal < minimo) {
                throw new Error(`Pedido mínimo de R$ ${minimo.toFixed(2).replace('.', ',')} para esta condição de pagamento.`);
            }
        }

        const telConfirmado = soDigitos(telefone);
        const telAntigo = soDigitos(auth.telefone);
        const telefoneFinal = telConfirmado.length >= 10 ? telConfirmado : (auth.telefone || null);
        const celularAlterado = telConfirmado.length >= 10 && telConfirmado !== telAntigo;
        if (celularAlterado) {
            await prisma.congeladosCliente.update({ where: { id: auth.id }, data: { telefone: telefoneFinal } }).catch(() => {});
        }

        return prisma.congeladosPedido.create({
            data: {
                congeladosClienteId: auth.id,
                nomeCliente: auth.nome,
                documentoCliente: auth.documento,
                telefoneCliente: telefoneFinal,
                celularAlterado,
                semCadastro,
                tabelaPrecoId: tabelaPrecoId || null,
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
        const where = {};
        if (status) where.status = status;
        if (busca) {
            const doc = soDigitos(busca);
            where.OR = [
                { nomeCliente: { contains: busca, mode: 'insensitive' } },
                doc ? { documentoCliente: { contains: doc } } : undefined,
                { telefoneCliente: { contains: busca } },
            ].filter(Boolean);
        }
        return prisma.congeladosPedido.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { itens: true, congeladosCliente: true, pedido: { select: { id: true, numero: true, especial: true } } },
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
    },
};

module.exports = congeladosService;
