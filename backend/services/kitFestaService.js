const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pedidoService = require('./pedidoService');
const webhookService = require('./webhookService');

const money2 = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

// Merge: defaults + overrides do banco, mesclando objetos por chave (não substitui
// o objeto inteiro — assim novos campos do default aparecem mesmo com override parcial salvo)
const isPlainObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function mergeConfig(defaults, map) {
    const out = { ...defaults };
    for (const k of Object.keys(map)) {
        out[k] = (isPlainObj(defaults[k]) && isPlainObj(map[k])) ? { ...defaults[k], ...map[k] } : map[k];
    }
    return out;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';

// ───────── Helpers ─────────
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const dec = (v) => (v == null ? 0 : Number(v));

function gerarTokenCliente(c) {
    return jwt.sign(
        { tipo: 'kitfesta', id: c.id, cpf: c.cpf, nome: c.nome },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function gerarCodigoIndicacao(nome) {
    const base = String(nome || 'CLIENTE').split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'CLIENTE';
    const sufixo = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `${base}-${sufixo}`;
}

// Imagem principal de um Produto
function imagemPrincipal(produto) {
    if (!produto?.imagens?.length) return null;
    const p = produto.imagens.find(i => i.principal) || produto.imagens[0];
    return p?.url || null;
}

// Monta o objeto de produto pro site
function produtoSitePublico(kp) {
    const preco = kp.precoKitFesta != null ? dec(kp.precoKitFesta) : dec(kp.produto?.valorVenda);
    return {
        id: kp.id,
        produtoId: kp.produtoId,
        nome: kp.produto?.nome || '',
        descricao: kp.descricaoSite || kp.produto?.descricao || '',
        categoria: kp.categoria?.slug || null,
        categoriaNome: kp.categoria?.nome || null,
        unidades: kp.unidadesPorCaixa,
        preco,
        tags: kp.tags || [],
        opcoes: kp.opcoes || [],
        destaque: kp.destaque,
        ordem: kp.ordem,
        imagem: imagemPrincipal(kp.produto),
    };
}

const kitFestaService = {
    // ============================================================
    // ───────────────────── PÚBLICO ─────────────────────────────
    // ============================================================

    // Passo 1 do login: descobre o estado do CPF
    async checkCpf(cpfRaw) {
        const cpf = soDigitos(cpfRaw);
        if (cpf.length !== 11) throw new Error('CPF inválido.');

        const auth = await prisma.kitFestaCliente.findUnique({ where: { cpf } });
        const clienteApp = await prisma.cliente.findFirst({
            where: { Documento: { contains: cpf } },
            select: { UUID: true, Nome: true, Telefone: true, Telefone_Celular: true, Email: true },
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
                situacao: 'CRIAR_SENHA', // existe no app, ainda sem login no site
                temCadastroApp: true,
                nome: clienteApp.Nome,
                _clienteUuid: clienteApp.UUID,
            };
        }
        // Não existe em lugar nenhum
        return { situacao: 'SEM_CADASTRO', temCadastroApp: false, nome: null };
    },

    // Cria a senha (primeiro acesso). Vincula ao Cliente do app se o CPF existir lá.
    async criarSenha({ cpf: cpfRaw, senha, nome, telefone, email }) {
        const cpf = soDigitos(cpfRaw);
        if (cpf.length !== 11) throw new Error('CPF inválido.');
        if (!senha || senha.length < 4) throw new Error('A senha precisa ter ao menos 4 caracteres.');

        const clienteApp = await prisma.cliente.findFirst({
            where: { Documento: { contains: cpf } },
            select: { UUID: true, Nome: true, Telefone: true, Telefone_Celular: true, Email: true },
        });

        const senhaHash = await bcrypt.hash(senha, 10);
        const nomeFinal = nome || clienteApp?.Nome || 'Cliente';

        const existente = await prisma.kitFestaCliente.findUnique({ where: { cpf } });
        let auth;
        if (existente) {
            auth = await prisma.kitFestaCliente.update({
                where: { cpf },
                data: {
                    senhaHash,
                    nome: existente.nome || nomeFinal,
                    telefone: telefone || existente.telefone || clienteApp?.Telefone_Celular || clienteApp?.Telefone || null,
                    email: email || existente.email || clienteApp?.Email || null,
                    clienteUuid: existente.clienteUuid || clienteApp?.UUID || null,
                },
            });
        } else {
            auth = await prisma.kitFestaCliente.create({
                data: {
                    cpf,
                    nome: nomeFinal,
                    telefone: telefone || clienteApp?.Telefone_Celular || clienteApp?.Telefone || null,
                    email: email || clienteApp?.Email || null,
                    senhaHash,
                    clienteUuid: clienteApp?.UUID || null,
                    codigoIndicacao: gerarCodigoIndicacao(nomeFinal),
                },
            });
        }
        return { token: gerarTokenCliente(auth), cliente: await this._perfilPublico(auth) };
    },

    async login({ cpf: cpfRaw, senha }) {
        const cpf = soDigitos(cpfRaw);
        const auth = await prisma.kitFestaCliente.findUnique({ where: { cpf } });
        if (!auth || !auth.senhaHash) throw new Error('CPF não cadastrado ou sem senha.');
        const ok = await bcrypt.compare(senha, auth.senhaHash);
        if (!ok) throw new Error('Senha incorreta.');
        await prisma.kitFestaCliente.update({ where: { cpf }, data: { ultimoAcesso: new Date() } });
        return { token: gerarTokenCliente(auth), cliente: await this._perfilPublico(auth) };
    },

    // Gera token de reset (o envio por WhatsApp é feito pela camada de rota/controller)
    async esqueciSenha(cpfRaw) {
        const cpf = soDigitos(cpfRaw);
        const auth = await prisma.kitFestaCliente.findUnique({ where: { cpf } });
        if (!auth) throw new Error('CPF não encontrado.');
        const token = crypto.randomBytes(4).toString('hex').toUpperCase(); // código curto p/ WhatsApp
        await prisma.kitFestaCliente.update({
            where: { cpf },
            data: { resetToken: token, resetTokenExp: new Date(Date.now() + 30 * 60 * 1000) },
        });
        return { codigo: token, telefone: auth.telefone, nome: auth.nome };
    },

    async resetSenha({ cpf: cpfRaw, codigo, novaSenha }) {
        const cpf = soDigitos(cpfRaw);
        if (!novaSenha || novaSenha.length < 4) throw new Error('A senha precisa ter ao menos 4 caracteres.');
        const auth = await prisma.kitFestaCliente.findUnique({ where: { cpf } });
        if (!auth || !auth.resetToken || auth.resetToken !== String(codigo || '').toUpperCase()) {
            throw new Error('Código inválido.');
        }
        if (!auth.resetTokenExp || auth.resetTokenExp < new Date()) throw new Error('Código expirado.');
        const senhaHash = await bcrypt.hash(novaSenha, 10);
        await prisma.kitFestaCliente.update({
            where: { cpf },
            data: { senhaHash, resetToken: null, resetTokenExp: null },
        });
        return { token: gerarTokenCliente(auth), cliente: await this._perfilPublico(auth) };
    },

    async _perfilPublico(auth) {
        let endereco = null;
        if (auth.clienteUuid) {
            const c = await prisma.cliente.findUnique({
                where: { UUID: auth.clienteUuid },
                select: { End_Logradouro: true, End_Numero: true, End_Complemento: true, End_Bairro: true, End_Cidade: true, End_CEP: true },
            }).catch(() => null);
            if (c && (c.End_Logradouro || c.End_Bairro)) {
                const completo = [
                    c.End_Logradouro, c.End_Numero ? `nº ${c.End_Numero}` : null, c.End_Complemento,
                    c.End_Bairro, c.End_Cidade,
                ].filter(Boolean).join(', ');
                endereco = {
                    logradouro: c.End_Logradouro || '', numero: c.End_Numero || '', complemento: c.End_Complemento || '',
                    bairro: c.End_Bairro || '', cidade: c.End_Cidade || '', cep: c.End_CEP || '', completo,
                };
            }
        }
        return {
            id: auth.id,
            cpf: auth.cpf,
            nome: auth.nome,
            telefone: auth.telefone,
            email: auth.email,
            pontos: auth.pontos,
            codigoIndicacao: auth.codigoIndicacao,
            creditoIndicacao: dec(auth.creditoIndicacao),
            temCadastroApp: !!auth.clienteUuid,
            endereco,
        };
    },

    async perfil(clienteId) {
        const auth = await prisma.kitFestaCliente.findUnique({ where: { id: clienteId } });
        if (!auth) throw new Error('Cliente não encontrado.');
        return this._perfilPublico(auth);
    },

    // ───────── Catálogo / vitrine ─────────
    async catalogoPublico() {
        const produtos = await prisma.kitFestaProduto.findMany({
            where: { ativo: true },
            include: { produto: { include: { imagens: true } }, categoria: true },
            orderBy: [{ ordem: 'asc' }],
        });
        return produtos
            .filter(p => p.produto && p.produto.ativo !== false)
            .map(produtoSitePublico);
    },

    async categoriasPublico() {
        return prisma.kitFestaCategoria.findMany({
            where: { ativo: true },
            orderBy: { ordem: 'asc' },
            select: { id: true, nome: true, slug: true, ordem: true },
        });
    },

    async avaliacoesPublico() {
        return prisma.kitFestaAvaliacao.findMany({
            where: { ativo: true },
            orderBy: { ordem: 'asc' },
        });
    },

    async bairrosPublico() {
        return prisma.kitFestaBairro.findMany({
            where: { ativo: true },
            orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
            select: { id: true, nome: true, cidade: true, cep: true, taxa: true },
        });
    },

    // Config do site (todas as chaves) — merge com defaults
    async configPublico() {
        const rows = await prisma.kitFestaConfig.findMany();
        const map = {};
        rows.forEach(r => { map[r.chave] = r.valor; });
        return mergeConfig(DEFAULT_CONFIG, map);
    },

    // ───────── Agenda pública ─────────
    // Retorna status por dia para um intervalo (mês). status: open|few|full|closed
    async agendaPublico({ inicio, fim }) {
        const dataInicio = inicio ? new Date(inicio) : new Date();
        const dataFim = fim ? new Date(fim) : new Date(Date.now() + 45 * 864e5);

        const dias = await prisma.kitFestaAgendaDia.findMany({
            where: { data: { gte: dataInicio, lte: dataFim } },
        });
        const map = {};
        dias.forEach(d => { map[d.data.toISOString().slice(0, 10)] = d.status; });
        return map;
    },

    // Horários disponíveis para uma data + modo, com flag de esgotado
    async slotsPublico({ data, modo }) {
        if (!data) throw new Error('Data obrigatória.');
        const d = new Date(data + 'T12:00:00');
        const dow = d.getDay();

        // Dia fechado?
        const dia = await prisma.kitFestaAgendaDia.findUnique({ where: { data: new Date(data) } });
        if (dia && dia.status === 'closed') return [];

        const templates = await prisma.kitFestaHorarioPadrao.findMany({
            where: { modo, ativo: true },
            orderBy: { ordem: 'asc' },
        });
        const doDia = templates.filter(t => !t.diasSemana?.length || t.diasSemana.includes(dow));

        // Conta pedidos já reservados por horário nesta data/modo
        const reservas = await prisma.kitFestaPedido.groupBy({
            by: ['horario'],
            where: {
                data: new Date(data),
                modo,
                status: { notIn: ['RECUSADO', 'CANCELADO'] },
            },
            _count: { _all: true },
        });
        const usados = {};
        reservas.forEach(r => { usados[r.horario] = r._count._all; });

        return doDia.map(t => {
            const usado = usados[t.hora] || 0;
            return { hora: t.hora, capacidade: t.capacidade, usado, full: usado >= t.capacidade };
        });
    },

    // ───────── Cupom ─────────
    async validarCupom({ codigo, totalCaixas }) {
        const c = await prisma.kitFestaCupom.findUnique({ where: { codigo: String(codigo || '').toUpperCase() } });
        if (!c || !c.ativo) throw new Error('Cupom inválido.');
        if (c.validade && c.validade < new Date()) throw new Error('Cupom expirado.');
        if (c.usoMaximo != null && c.usos >= c.usoMaximo) throw new Error('Cupom esgotado.');
        if (c.minCaixas && totalCaixas < c.minCaixas) {
            throw new Error(`Válido a partir de ${c.minCaixas} caixas.`);
        }
        return { codigo: c.codigo, tipo: c.tipo, valor: dec(c.valor), label: c.label, minCaixas: c.minCaixas };
    },

    // ───────── Criação de pedido (cliente logado ou visitante) ─────────
    async criarPedidoSite({ clienteId, visitante, itens, modo, data, horario, bairroId, enderecoEntrega, cupomCodigo, observacoes, telefone }) {
        if (!Array.isArray(itens) || itens.length === 0) throw new Error('Carrinho vazio.');

        // Cliente autenticado ou visitante (cria registro sem cadastro)
        let auth;
        let semCadastro = false;
        if (clienteId) {
            auth = await prisma.kitFestaCliente.findUnique({ where: { id: clienteId } });
            if (!auth) throw new Error('Cliente não encontrado.');
            semCadastro = !auth.clienteUuid;
        } else {
            // Visitante: precisa nome + cpf + telefone
            const cpf = soDigitos(visitante?.cpf);
            if (!visitante?.nome || cpf.length !== 11) throw new Error('Informe nome e CPF para pedido sem cadastro.');
            const existente = await prisma.kitFestaCliente.findUnique({ where: { cpf } });
            auth = existente || await prisma.kitFestaCliente.create({
                data: {
                    cpf,
                    nome: visitante.nome,
                    telefone: visitante.telefone || null,
                    codigoIndicacao: gerarCodigoIndicacao(visitante.nome),
                },
            });
            semCadastro = !auth.clienteUuid;
        }

        // Carrega config dos produtos do site para validar preço/unidades (não confiar no cliente)
        const kpIds = itens.map(i => i.kitFestaProdutoId).filter(Boolean);
        const kps = await prisma.kitFestaProduto.findMany({
            where: { id: { in: kpIds }, ativo: true },
            include: { produto: true },
        });
        const kpMap = {};
        kps.forEach(k => { kpMap[k.id] = k; });

        let subtotal = 0;
        let totalCaixas = 0;
        const itensData = [];
        for (const it of itens) {
            const kp = kpMap[it.kitFestaProdutoId];
            if (!kp) throw new Error('Produto indisponível no carrinho.');
            const qtd = parseInt(it.quantidade) || 0;
            if (qtd <= 0) continue;
            const preco = kp.precoKitFesta != null ? dec(kp.precoKitFesta) : dec(kp.produto?.valorVenda);
            subtotal += preco * qtd;
            totalCaixas += qtd;
            itensData.push({
                kitFestaProdutoId: kp.id,
                nomeProduto: kp.produto?.nome || '',
                opcao: it.opcao || null,
                quantidade: qtd,
                unidadesPorCaixa: kp.unidadesPorCaixa,
                precoUnitario: preco,
            });
        }
        if (!itensData.length) throw new Error('Carrinho vazio.');

        // Mínimo de caixas
        const cfg = await this.configPublico();
        const minCaixas = (cfg.regras && cfg.regras.minCaixas) || DEFAULT_CONFIG.regras.minCaixas;
        if (totalCaixas < minCaixas) throw new Error(`Pedido mínimo de ${minCaixas} caixas.`);

        // Taxa de entrega
        let taxaEntrega = 0;
        let bairro = null;
        if (modo === 'entrega' && bairroId) {
            bairro = await prisma.kitFestaBairro.findUnique({ where: { id: bairroId } });
            taxaEntrega = dec(bairro?.taxa);
        }

        // Cupom
        let descontoValor = 0;
        let cupomAplicado = null;
        if (cupomCodigo) {
            try {
                const cup = await this.validarCupom({ codigo: cupomCodigo, totalCaixas });
                descontoValor = cup.tipo === 'pct' ? subtotal * cup.valor / 100 : Math.min(cup.valor, subtotal);
                cupomAplicado = cup.codigo;
            } catch (_) { /* cupom inválido: ignora silenciosamente no servidor */ }
        }

        const total = Math.max(0, subtotal - descontoValor) + taxaEntrega;

        // Telefone confirmado/informado no checkout. Marca "celular alterado" se
        // diferente do que estava no cadastro do site (admin atualiza no sistema).
        const telConfirmado = soDigitos(telefone);
        const telAntigo = soDigitos(auth.telefone);
        const telefoneFinal = telConfirmado.length >= 10 ? telConfirmado : (auth.telefone || null);
        const celularAlterado = telConfirmado.length >= 10 && telConfirmado !== telAntigo;
        // Atualiza o telefone no perfil do site (pré-preenche da próxima vez)
        if (celularAlterado) {
            await prisma.kitFestaCliente.update({ where: { id: auth.id }, data: { telefone: telefoneFinal } }).catch(() => {});
        }

        const pedido = await prisma.kitFestaPedido.create({
            data: {
                kitFestaClienteId: auth.id,
                nomeCliente: auth.nome,
                cpfCliente: auth.cpf,
                telefoneCliente: telefoneFinal,
                celularAlterado,
                semCadastro,
                modo,
                data: new Date(data),
                horario,
                bairroId: bairro?.id || null,
                taxaEntrega,
                enderecoEntrega: enderecoEntrega || null,
                subtotal,
                cupomCodigo: cupomAplicado,
                descontoValor,
                total,
                totalCaixas,
                observacoes: observacoes || null,
                status: semCadastro ? 'PENDENTE_CADASTRO' : 'AGUARDANDO',
                itens: { create: itensData },
            },
            include: { itens: true, bairro: true },
        });

        // Envia cópia do pedido no WhatsApp do cliente (mesma forma dos outros envios)
        setTimeout(() => { this._enviarCopiaCliente(pedido.id).catch(e => console.error('[KitFesta] cópia WhatsApp:', e.message)); }, 0);

        return pedido;
    },

    // Monta e envia a cópia do pedido no WhatsApp do cliente via webhook (BotConversa)
    async _enviarCopiaCliente(pedidoId) {
        const p = await prisma.kitFestaPedido.findUnique({ where: { id: pedidoId }, include: { itens: true, bairro: true } });
        if (!p || !p.telefoneCliente) return;
        const cfg = await this.configPublico();
        const loja = cfg.loja || {};
        const dataBR = p.data.toISOString().slice(0, 10).split('-').reverse().join('/');
        const linhas = p.itens.map(it => `• ${it.quantidade}x ${it.nomeProduto}${it.opcao ? ` (${it.opcao})` : ''}`).join('\n');
        const partes = [
            `Olá, *${p.nomeCliente}*! 👋`,
            '',
            `Recebemos seu pedido *Kit Festa* #${p.numero} ✅`,
            '',
            linhas,
            '',
            `${p.modo === 'retirada' ? '🏠 Retirada na loja' : `🚚 Entrega${p.bairro ? ` · ${p.bairro.nome}` : ''}`}`,
            (p.modo === 'retirada' && loja.endereco) ? `📍 ${loja.endereco}` : null,
            (p.modo === 'retirada' && loja.mapsUrl) ? `🗺️ Como chegar: ${loja.mapsUrl}` : null,
            `📅 ${dataBR} às ${p.horario}`,
            p.cupomCodigo ? `🎟️ Cupom: ${p.cupomCodigo}` : null,
            `💰 *Total: ${money2(p.total)}*`,
            '',
            'Em breve confirmamos tudo por aqui. O pagamento é combinado depois (pix ou na entrega).',
            `Obrigado! 🙏 — ${loja.nome || 'Hardt'}`,
        ].filter(x => x !== null);
        await webhookService.enviarMensagemCustom(p.telefoneCliente, p.nomeCliente, partes.join('\n'));
    },

    // Exclusão de pedido (apenas teste/admin) — itens caem em cascata
    async adminExcluirPedido(id) {
        const kp = await prisma.kitFestaPedido.findUnique({ where: { id } });
        if (!kp) throw new Error('Pedido não encontrado.');
        await prisma.kitFestaPedido.delete({ where: { id } });
        return { ok: true };
    },

    async meusPedidos(clienteId) {
        return prisma.kitFestaPedido.findMany({
            where: { kitFestaClienteId: clienteId },
            orderBy: { createdAt: 'desc' },
            include: { itens: true },
        });
    },

    // ============================================================
    // ────────────────────── ADMIN ──────────────────────────────
    // ============================================================

    // ── Produtos do site ──
    async adminListarProdutosApp({ busca, categoriaCA, categoriaComercialId }) {
        const where = { ativo: true };
        if (busca) where.nome = { contains: busca, mode: 'insensitive' };
        if (categoriaCA) where.categoria = categoriaCA;
        if (categoriaComercialId) where.categoriaProdutoId = categoriaComercialId;

        const produtos = await prisma.produto.findMany({
            where,
            include: { imagens: true, kitFestaProduto: { include: { categoria: true } }, categoriaProduto: true },
            orderBy: { nome: 'asc' },
            take: 500,
        });
        return produtos.map(p => ({
            produtoId: p.id,
            nome: p.nome,
            codigo: p.codigo,
            valorVenda: dec(p.valorVenda),
            categoriaCA: p.categoria,
            categoriaComercial: p.categoriaProduto?.nome || null,
            imagem: imagemPrincipal(p),
            noSite: !!p.kitFestaProduto,
            site: p.kitFestaProduto ? {
                id: p.kitFestaProduto.id,
                categoriaId: p.kitFestaProduto.categoriaId,
                categoriaNome: p.kitFestaProduto.categoria?.nome || null,
                unidadesPorCaixa: p.kitFestaProduto.unidadesPorCaixa,
                precoKitFesta: p.kitFestaProduto.precoKitFesta != null ? dec(p.kitFestaProduto.precoKitFesta) : null,
                descricaoSite: p.kitFestaProduto.descricaoSite,
                tags: p.kitFestaProduto.tags,
                opcoes: p.kitFestaProduto.opcoes,
                destaque: p.kitFestaProduto.destaque,
                ordem: p.kitFestaProduto.ordem,
                ativo: p.kitFestaProduto.ativo,
            } : null,
        }));
    },

    async adminSalvarProdutoSite(produtoId, dados) {
        const data = {
            categoriaId: dados.categoriaId ?? undefined,
            unidadesPorCaixa: dados.unidadesPorCaixa != null ? parseInt(dados.unidadesPorCaixa) : undefined,
            precoKitFesta: dados.precoKitFesta === '' || dados.precoKitFesta == null ? null : Number(dados.precoKitFesta),
            descricaoSite: dados.descricaoSite ?? undefined,
            tags: Array.isArray(dados.tags) ? dados.tags : undefined,
            opcoes: Array.isArray(dados.opcoes) ? dados.opcoes : undefined,
            destaque: dados.destaque != null ? !!dados.destaque : undefined,
            ordem: dados.ordem != null ? parseInt(dados.ordem) : undefined,
            ativo: dados.ativo != null ? !!dados.ativo : undefined,
        };
        return prisma.kitFestaProduto.upsert({
            where: { produtoId },
            create: {
                produtoId,
                categoriaId: dados.categoriaId || null,
                unidadesPorCaixa: dados.unidadesPorCaixa != null ? parseInt(dados.unidadesPorCaixa) : 25,
                precoKitFesta: dados.precoKitFesta === '' || dados.precoKitFesta == null ? null : Number(dados.precoKitFesta),
                descricaoSite: dados.descricaoSite || null,
                tags: Array.isArray(dados.tags) ? dados.tags : [],
                opcoes: Array.isArray(dados.opcoes) ? dados.opcoes : [],
                destaque: !!dados.destaque,
                ordem: dados.ordem != null ? parseInt(dados.ordem) : 0,
                ativo: dados.ativo != null ? !!dados.ativo : true,
            },
            update: data,
            include: { categoria: true },
        });
    },

    async adminRemoverProdutoSite(produtoId) {
        await prisma.kitFestaProduto.deleteMany({ where: { produtoId } });
        return { ok: true };
    },

    // ── Categorias do site ──
    async adminListarCategorias() {
        return prisma.kitFestaCategoria.findMany({ orderBy: { ordem: 'asc' } });
    },
    async adminSalvarCategoria(id, dados) {
        const slug = (dados.slug || dados.nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (id) {
            return prisma.kitFestaCategoria.update({ where: { id }, data: { nome: dados.nome, slug, ordem: dados.ordem ?? 0, ativo: dados.ativo ?? true } });
        }
        return prisma.kitFestaCategoria.create({ data: { nome: dados.nome, slug, ordem: dados.ordem ?? 0, ativo: dados.ativo ?? true } });
    },
    async adminRemoverCategoria(id) {
        await prisma.kitFestaProduto.updateMany({ where: { categoriaId: id }, data: { categoriaId: null } });
        await prisma.kitFestaCategoria.delete({ where: { id } });
        return { ok: true };
    },

    // ── Agenda ──
    async adminListarAgenda({ inicio, fim }) {
        const dataInicio = inicio ? new Date(inicio) : new Date();
        const dataFim = fim ? new Date(fim) : new Date(Date.now() + 60 * 864e5);
        const dias = await prisma.kitFestaAgendaDia.findMany({
            where: { data: { gte: dataInicio, lte: dataFim } },
            orderBy: { data: 'asc' },
        });
        // contagem de pedidos por dia
        const pedidos = await prisma.kitFestaPedido.groupBy({
            by: ['data'],
            where: { data: { gte: dataInicio, lte: dataFim }, status: { notIn: ['RECUSADO', 'CANCELADO'] } },
            _count: { _all: true },
        });
        const cont = {};
        pedidos.forEach(p => { cont[p.data.toISOString().slice(0, 10)] = p._count._all; });
        return dias.map(d => ({
            data: d.data.toISOString().slice(0, 10),
            status: d.status,
            observacao: d.observacao,
            pedidos: cont[d.data.toISOString().slice(0, 10)] || 0,
        }));
    },

    async adminSetStatusDia({ data, status, observacao }) {
        const validos = ['open', 'few', 'full', 'closed'];
        if (!validos.includes(status)) throw new Error('Status inválido.');
        return prisma.kitFestaAgendaDia.upsert({
            where: { data: new Date(data) },
            create: { data: new Date(data), status, observacao: observacao || null },
            update: { status, observacao: observacao ?? undefined },
        });
    },

    // Define status de vários dias de uma vez (ex: abrir todo o mês, fechar domingos)
    async adminSetStatusLote({ datas, status }) {
        const ops = datas.map(data => prisma.kitFestaAgendaDia.upsert({
            where: { data: new Date(data) },
            create: { data: new Date(data), status },
            update: { status },
        }));
        await prisma.$transaction(ops);
        return { ok: true, total: datas.length };
    },

    // ── Template de horários ──
    async adminListarHorarios() {
        return prisma.kitFestaHorarioPadrao.findMany({ orderBy: [{ modo: 'asc' }, { ordem: 'asc' }] });
    },
    async adminSalvarHorario(id, dados) {
        const payload = {
            modo: dados.modo,
            hora: dados.hora,
            capacidade: parseInt(dados.capacidade) || 10,
            diasSemana: Array.isArray(dados.diasSemana) ? dados.diasSemana.map(Number) : [],
            ativo: dados.ativo != null ? !!dados.ativo : true,
            ordem: dados.ordem != null ? parseInt(dados.ordem) : 0,
        };
        if (id) return prisma.kitFestaHorarioPadrao.update({ where: { id }, data: payload });
        return prisma.kitFestaHorarioPadrao.create({ data: payload });
    },
    async adminRemoverHorario(id) {
        await prisma.kitFestaHorarioPadrao.delete({ where: { id } });
        return { ok: true };
    },

    // ── Bairros ──
    async adminListarBairros() {
        return prisma.kitFestaBairro.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
    },
    async adminSalvarBairro(id, dados) {
        const payload = {
            nome: dados.nome,
            cidade: dados.cidade || 'Joinville',
            cep: dados.cep || null,
            taxa: Number(dados.taxa) || 0,
            ativo: dados.ativo != null ? !!dados.ativo : true,
            ordem: dados.ordem != null ? parseInt(dados.ordem) : 0,
        };
        if (id) return prisma.kitFestaBairro.update({ where: { id }, data: payload });
        return prisma.kitFestaBairro.create({ data: payload });
    },
    async adminRemoverBairro(id) {
        await prisma.kitFestaBairro.delete({ where: { id } });
        return { ok: true };
    },

    // ── Cupons ──
    async adminListarCupons() {
        return prisma.kitFestaCupom.findMany({ orderBy: { createdAt: 'desc' } });
    },
    async adminSalvarCupom(id, dados) {
        const payload = {
            codigo: String(dados.codigo || '').toUpperCase().trim(),
            tipo: dados.tipo === 'brl' ? 'brl' : 'pct',
            valor: Number(dados.valor) || 0,
            label: dados.label || null,
            minCaixas: dados.minCaixas ? parseInt(dados.minCaixas) : null,
            validade: dados.validade ? new Date(dados.validade) : null,
            primeiraCompra: !!dados.primeiraCompra,
            usoMaximo: dados.usoMaximo ? parseInt(dados.usoMaximo) : null,
            ativo: dados.ativo != null ? !!dados.ativo : true,
        };
        if (id) return prisma.kitFestaCupom.update({ where: { id }, data: payload });
        return prisma.kitFestaCupom.create({ data: payload });
    },
    async adminRemoverCupom(id) {
        await prisma.kitFestaCupom.delete({ where: { id } });
        return { ok: true };
    },

    // ── Avaliações ──
    async adminListarAvaliacoes() {
        return prisma.kitFestaAvaliacao.findMany({ orderBy: { ordem: 'asc' } });
    },
    async adminSalvarAvaliacao(id, dados) {
        const payload = {
            nome: dados.nome,
            evento: dados.evento || null,
            texto: dados.texto,
            estrelas: parseInt(dados.estrelas) || 5,
            dataLabel: dados.dataLabel || null,
            ordem: dados.ordem != null ? parseInt(dados.ordem) : 0,
            ativo: dados.ativo != null ? !!dados.ativo : true,
        };
        if (id) return prisma.kitFestaAvaliacao.update({ where: { id }, data: payload });
        return prisma.kitFestaAvaliacao.create({ data: payload });
    },
    async adminRemoverAvaliacao(id) {
        await prisma.kitFestaAvaliacao.delete({ where: { id } });
        return { ok: true };
    },

    // ── Config ──
    async adminGetConfig() {
        const rows = await prisma.kitFestaConfig.findMany();
        const map = {};
        rows.forEach(r => { map[r.chave] = r.valor; });
        return mergeConfig(DEFAULT_CONFIG, map);
    },
    async adminSetConfig(chave, valor) {
        return prisma.kitFestaConfig.upsert({
            where: { chave },
            create: { chave, valor },
            update: { valor },
        });
    },

    // ── Pedidos (fila admin) ──
    async adminListarPedidos({ status, busca, data }) {
        const where = {};
        if (status) where.status = status;
        if (data) where.data = new Date(data);
        if (busca) {
            const cpf = soDigitos(busca);
            where.OR = [
                { nomeCliente: { contains: busca, mode: 'insensitive' } },
                { cpfCliente: cpf ? { contains: cpf } : undefined },
                { telefoneCliente: { contains: busca } },
            ].filter(c => Object.values(c)[0] !== undefined);
        }
        return prisma.kitFestaPedido.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { itens: true, bairro: true, kitFestaCliente: true, pedido: { select: { id: true, numero: true } } },
            take: 300,
        });
    },

    async adminRecusarPedido(id, motivo) {
        return prisma.kitFestaPedido.update({
            where: { id },
            data: { status: 'RECUSADO', motivoRecusa: motivo || null },
        });
    },

    // Vincula um pedido sem cadastro a um Cliente do app (após equipe criar no CA e sincronizar)
    async adminVincularCliente(id, clienteUuid) {
        const kp = await prisma.kitFestaPedido.findUnique({ where: { id } });
        if (!kp) throw new Error('Pedido não encontrado.');
        const cliente = await prisma.cliente.findUnique({ where: { UUID: clienteUuid } });
        if (!cliente) throw new Error('Cliente do app não encontrado.');

        // vincula o auth do site ao cliente do app
        await prisma.kitFestaCliente.update({
            where: { id: kp.kitFestaClienteId },
            data: { clienteUuid },
        }).catch(() => {});

        return prisma.kitFestaPedido.update({
            where: { id },
            data: { semCadastro: false, status: 'AGUARDANDO' },
        });
    },

    // Aprova e converte em Pedido normal/especial/bonificação
    async adminAprovarPedido(id, { tipoConversao, vendedorId, dataVenda, aprovadoPorId, clienteUuid }) {
        const kp = await prisma.kitFestaPedido.findUnique({
            where: { id },
            include: { itens: { include: { kitFestaProduto: true } }, kitFestaCliente: true },
        });
        if (!kp) throw new Error('Pedido não encontrado.');
        if (kp.pedidoId) throw new Error('Pedido já convertido.');

        // Resolve o Cliente do app
        let clienteId = clienteUuid || kp.kitFestaCliente?.clienteUuid;
        if (!clienteId && kp.cpfCliente) {
            const c = await prisma.cliente.findFirst({ where: { Documento: { contains: kp.cpfCliente } }, select: { UUID: true } });
            clienteId = c?.UUID;
        }
        if (!clienteId) {
            throw new Error('Cliente sem cadastro no app. Cadastre no Conta Azul e vincule antes de aprovar.');
        }

        // Monta itens do Pedido (precisa do produtoId do app)
        const itensData = [];
        for (const it of kp.itens) {
            const produtoId = it.kitFestaProduto?.produtoId;
            if (!produtoId) throw new Error(`Item "${it.nomeProduto}" não está mais vinculado a um produto do app.`);
            itensData.push({
                produtoId,
                quantidade: it.quantidade,
                valor: dec(it.precoUnitario),
                valorBase: dec(it.precoUnitario),
            });
        }

        const especial = tipoConversao === 'ESPECIAL';
        const bonificacao = tipoConversao === 'BONIFICACAO';

        const novoPedido = await pedidoService.criar({
            clienteId,
            vendedorId: vendedorId || null,
            dataVenda: dataVenda || kp.data,
            observacoes: `Kit Festa #${kp.numero}${kp.observacoes ? ` · ${kp.observacoes}` : ''}`,
            especial,
            bonificacao,
            itens: itensData,
            valorFrete: dec(kp.taxaEntrega) || null,
            canalOrigem: 'KIT_FESTA',
            statusEnvio: 'ABERTO',
        });

        const atualizado = await prisma.kitFestaPedido.update({
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

        // Incrementa uso do cupom
        if (kp.cupomCodigo) {
            await prisma.kitFestaCupom.updateMany({ where: { codigo: kp.cupomCodigo }, data: { usos: { increment: 1 } } }).catch(() => {});
        }
        return atualizado;
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
        mapsUrl: 'https://maps.app.goo.gl/NyPdgwqKb9mmz1vU6',
    },
    regras: {
        minCaixas: 4,
    },
    hero: {
        kicker: 'Festas · Eventos · Coffee break',
        titulo: 'Salgadinho quentinho na sua festa.',
        subtitulo: 'Os mesmos salgados feitos à mão que você ama, agora a um link de distância. Monte seu pedido, escolha a data e a gente entrega fresquinho.',
    },
    comoFunciona: [
        { titulo: 'Acesse com seu CPF', desc: 'Sua conta guarda pedidos, cupons e endereços.' },
        { titulo: 'Monte seu kit', desc: 'Escolha os sabores. Cada caixa = 1 sabor, 25 unidades.' },
        { titulo: 'Escolha data e hora', desc: 'Veja os horários liberados e reserve o seu.' },
        { titulo: 'Confirme no WhatsApp', desc: 'A gente combina o pagamento (pix ou na entrega).' },
    ],
    indicacao: { ativo: true, credito: 20 },
    freteTexto: 'Entrega em Joinville · taxa conforme o bairro.',
};

module.exports = kitFestaService;
