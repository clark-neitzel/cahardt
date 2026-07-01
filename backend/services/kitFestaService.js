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

// Valida dígitos verificadores de CPF (11) ou CNPJ (14).
function cpfValido(cpf) {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += +cpf[i] * (10 - i);
    let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0;
    if (d1 !== +cpf[9]) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += +cpf[i] * (11 - i);
    let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0;
    return d2 === +cpf[10];
}
function cnpjValido(cnpj) {
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    const calc = (base) => {
        let s = 0, pos = base.length - 7;
        for (let i = 0; i < base.length; i++) { s += +base[i] * pos--; if (pos < 2) pos = 9; }
        const r = s % 11;
        return r < 2 ? 0 : 11 - r;
    };
    const d1 = calc(cnpj.slice(0, 12));
    if (d1 !== +cnpj[12]) return false;
    const d2 = calc(cnpj.slice(0, 13));
    return d2 === +cnpj[13];
}
// Aceita CPF ou CNPJ; retorna os dígitos válidos ou lança erro. Rótulo p/ mensagens.
function normalizarDocumento(raw) {
    const d = soDigitos(raw);
    if (d.length === 11) { if (!cpfValido(d)) throw new Error('CPF inválido — confira os números.'); return d; }
    if (d.length === 14) { if (!cnpjValido(d)) throw new Error('CNPJ inválido — confira os números.'); return d; }
    throw new Error('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.');
}

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

    // Passo 1 do login: descobre o estado do CPF/CNPJ
    async checkCpf(cpfRaw) {
        const cpf = normalizarDocumento(cpfRaw); // aceita CPF (11) ou CNPJ (14) e valida os dígitos

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

    // Cria a senha (primeiro acesso). Vincula ao Cliente do app se o CPF/CNPJ existir lá.
    async criarSenha({ cpf: cpfRaw, senha, nome, telefone, email }) {
        const cpf = normalizarDocumento(cpfRaw); // aceita CPF ou CNPJ e valida
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
        // Saldo de créditos de indicação + resumo de indicados
        const [creds, indicadosCount] = await Promise.all([
            prisma.kitFestaCredito.findMany({ where: { donoId: auth.id }, select: { status: true, valor: true } }),
            prisma.kitFestaCliente.count({ where: { indicadoPorId: auth.id } }),
        ]);
        const disponiveis = creds.filter(c => c.status === 'DISPONIVEL');
        const usados = creds.filter(c => c.status === 'USADO');
        const indicacao = {
            codigo: auth.codigoIndicacao,
            indicados: indicadosCount,
            creditosDisponiveis: disponiveis.length,
            creditosUsados: usados.length,
            valorDisponivel: disponiveis.reduce((s, c) => s + dec(c.valor), 0),
            valorUsado: usados.reduce((s, c) => s + dec(c.valor), 0),
        };
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
            jaIndicado: !!auth.indicadoPorId,
            indicacao,
            endereco,
        };
    },

    // Valida um código de indicação para o cliente logado (o INDICADO).
    async validarIndicacao({ clienteId, codigo }) {
        const cfg = await this.configPublico();
        if (!cfg.indicacao?.ativo) throw new Error('Programa de indicação indisponível.');
        const cod = String(codigo || '').toUpperCase().trim();
        if (!cod) throw new Error('Informe o código.');

        const cliente = await prisma.kitFestaCliente.findUnique({ where: { id: clienteId } });
        if (!cliente) throw new Error('Faça login para usar um código de indicação.');
        if (cliente.indicadoPorId) throw new Error('Você já usou um código de indicação.');
        if ((cliente.codigoIndicacao || '').toUpperCase() === cod) throw new Error('Você não pode usar seu próprio código.');

        const indicador = await prisma.kitFestaCliente.findFirst({ where: { codigoIndicacao: cod } });
        if (!indicador) throw new Error('Código de indicação inválido.');
        if (indicador.id === clienteId) throw new Error('Você não pode usar seu próprio código.');

        // Precisa ser primeira compra (nenhum pedido válido ainda)
        const jaPediu = await prisma.kitFestaPedido.count({ where: { kitFestaClienteId: clienteId, status: { notIn: ['RECUSADO', 'CANCELADO'] } } });
        if (jaPediu > 0) throw new Error('O código de indicação vale só na primeira compra.');

        const tipo = cfg.indicacao.descontoIndicadoTipo === 'pct' ? 'pct' : 'brl';
        const valor = dec(cfg.indicacao.descontoIndicado);
        return { codigo: cod, indicadorId: indicador.id, indicadorNome: indicador.nome, tipo, valor };
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
    // Antecedência mínima: um horário só fica disponível se estiver a pelo menos N horas
    // do momento atual (fuso America/Sao_Paulo, UTC-3). Ex.: 3h → 06:00 fecha para quem entra depois das 03:00.
    _slotFuturo(dataStr, hora, antecedenciaHoras) {
        const ante = Number(antecedenciaHoras) || 0;
        if (ante <= 0) return true;
        const inst = new Date(`${dataStr}T${(hora || '00:00')}:00-03:00`); // instante do slot em SP
        if (isNaN(inst.getTime())) return true;
        return inst.getTime() >= Date.now() + ante * 3600e3;
    },

    // Status por dia (mode-aware) calculado dos slots por data + capacidade + reservas.
    // status: open | few | full | closed. Dia só fica disponível se tiver slots configurados.
    async agendaPublico({ inicio, fim, modo }) {
        const dataInicio = inicio ? new Date(inicio) : new Date();
        const dataFim = fim ? new Date(fim) : new Date(Date.now() + 60 * 864e5);
        const k = (d) => d.toISOString().slice(0, 10);

        const [cfg, closures, slots, reservas] = await Promise.all([
            this.configPublico(),
            prisma.kitFestaAgendaDia.findMany({ where: { data: { gte: dataInicio, lte: dataFim }, status: 'closed' }, select: { data: true } }),
            prisma.kitFestaHorarioDia.findMany({ where: { data: { gte: dataInicio, lte: dataFim }, ...(modo ? { modo } : {}) }, select: { data: true, hora: true, capacidade: true } }),
            prisma.kitFestaPedido.groupBy({ by: ['data'], where: { data: { gte: dataInicio, lte: dataFim }, ...(modo ? { modo } : {}), status: { notIn: ['RECUSADO', 'CANCELADO'] } }, _count: { _all: true } }),
        ]);
        const ante = Number(cfg.agenda?.antecedenciaHoras) || 0;
        const fechado = new Set(closures.map(c => k(c.data)));
        const cap = {};
        slots.forEach(s => {
            const key = k(s.data);
            if (!this._slotFuturo(key, s.hora, ante)) return; // horário já passou da antecedência mínima
            cap[key] = (cap[key] || 0) + s.capacidade;
        });
        const usados = {}; reservas.forEach(r => { usados[k(r.data)] = r._count._all; });

        const map = {};
        Object.keys(cap).forEach(key => {
            if (fechado.has(key)) { map[key] = 'closed'; return; }
            const rem = cap[key] - (usados[key] || 0);
            map[key] = rem <= 0 ? 'full' : (rem <= cap[key] * 0.2 ? 'few' : 'open');
        });
        fechado.forEach(key => { if (!map[key]) map[key] = 'closed'; });
        return map;
    },

    // Horários disponíveis para uma data + modo, com flag de esgotado
    async slotsPublico({ data, modo }) {
        if (!data) throw new Error('Data obrigatória.');
        const dia = await prisma.kitFestaAgendaDia.findUnique({ where: { data: new Date(data) } });
        if (dia && dia.status === 'closed') return [];

        const slots = await prisma.kitFestaHorarioDia.findMany({
            where: { data: new Date(data), modo }, orderBy: { hora: 'asc' },
        });
        if (!slots.length) return [];

        const reservas = await prisma.kitFestaPedido.groupBy({
            by: ['horario'],
            where: { data: new Date(data), modo, status: { notIn: ['RECUSADO', 'CANCELADO'] } },
            _count: { _all: true },
        });
        const usados = {};
        reservas.forEach(r => { usados[r.horario] = r._count._all; });

        const cfg = await this.configPublico();
        const ante = Number(cfg.agenda?.antecedenciaHoras) || 0;
        return slots.map(s => {
            const usado = usados[s.hora] || 0;
            const cedo = !this._slotFuturo(data, s.hora, ante); // fechado por antecedência mínima
            return { hora: s.hora, capacidade: s.capacidade, usado, cedo, full: usado >= s.capacidade || cedo };
        });
    },

    // ───────── Entrega (cobertura por raio) ─────────
    // Descobre coordenadas de um CEP (BrasilAPI v2 → Nominatim por endereço).
    async _geocodeCep(cep, via) {
        try {
            const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`).then(x => x.json());
            const c = r?.location?.coordinates;
            if (c && c.latitude && c.longitude) return { lat: +c.latitude, lng: +c.longitude };
        } catch (_) { }
        try {
            const q = [via?.logradouro, via?.bairro, via?.localidade, via?.uf, 'Brasil'].filter(Boolean).join(', ');
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
            const r = await fetch(url, { headers: { 'User-Agent': 'HardtKitFesta/1.0' } }).then(x => x.json());
            if (r?.[0]?.lat && r?.[0]?.lon) return { lat: +r[0].lat, lng: +r[0].lon };
        } catch (_) { }
        return null;
    },

    // Verifica se o CEP está dentro do raio de entrega da loja.
    // atende: true (dentro) | false (fora) | null (não deu para localizar — segue "a combinar")
    async verificarEntrega({ cep }) {
        const c = soDigitos(cep);
        if (c.length !== 8) throw new Error('CEP inválido.');
        const via = await fetch(`https://viacep.com.br/ws/${c}/json/`).then(x => x.json()).catch(() => null);
        if (!via || via.erro) throw new Error('CEP não encontrado.');

        const cfg = await this.configPublico();
        const raio = Number(cfg.entrega?.raioKm) || 12;
        const loja = { lat: Number(cfg.entrega?.lojaLat) || -26.1901505, lng: Number(cfg.entrega?.lojaLng) || -48.910781 };
        const endereco = { logradouro: via.logradouro || '', bairro: via.bairro || '', cidade: via.localidade || '', uf: via.uf || '', cep: c };

        const geo = await this._geocodeCep(c, via);
        if (!geo) return { atende: null, geocodeOk: false, raioKm: raio, endereco };

        const R = 6371, toRad = (x) => x * Math.PI / 180;
        const dLat = toRad(geo.lat - loja.lat), dLng = toRad(geo.lng - loja.lng);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(loja.lat)) * Math.cos(toRad(geo.lat)) * Math.sin(dLng / 2) ** 2;
        const dist = 2 * R * Math.asin(Math.sqrt(s));
        return { atende: dist <= raio, geocodeOk: true, distanciaKm: Math.round(dist * 10) / 10, raioKm: raio, endereco };
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
    async criarPedidoSite({ clienteId, visitante, itens, modo, data, horario, bairroId, enderecoEntrega, cep, cupomCodigo, indicacaoCodigo, usarCredito, observacoes, telefone }) {
        if (!Array.isArray(itens) || itens.length === 0) throw new Error('Carrinho vazio.');

        // Cliente autenticado ou visitante (cria registro sem cadastro)
        let auth;
        let semCadastro = false;
        if (clienteId) {
            auth = await prisma.kitFestaCliente.findUnique({ where: { id: clienteId } });
            if (!auth) throw new Error('Cliente não encontrado.');
            semCadastro = !auth.clienteUuid;
        } else {
            // Visitante: precisa nome + cpf/cnpj + telefone
            if (!visitante?.nome) throw new Error('Informe nome e CPF/CNPJ para pedido sem cadastro.');
            const cpf = normalizarDocumento(visitante?.cpf); // aceita CPF ou CNPJ e valida
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

        // Antecedência mínima: não deixa fechar pedido para um horário perto demais do agora
        const ante = Number(cfg.agenda?.antecedenciaHoras) || 0;
        if (data && horario && !this._slotFuturo(String(data).slice(0, 10), horario, ante)) {
            throw new Error(`Esse horário já não está mais disponível (precisamos de ${ante}h de antecedência). Escolha outro horário.`);
        }

        // Entrega: taxa é "a combinar" (não cobra no site). Exige endereço e verifica cobertura por raio.
        let taxaEntrega = 0;
        let bairro = null;
        if (modo === 'entrega') {
            if (!enderecoEntrega || !String(enderecoEntrega).trim()) throw new Error('Informe o endereço de entrega.');
            if (cep) {
                try {
                    const cob = await this.verificarEntrega({ cep });
                    if (cob.atende === false) throw new Error('Ainda não entregamos nessa região. Escolha retirar na loja.');
                } catch (e) {
                    if (/não entregamos/i.test(e.message)) throw e; // fora do raio: barra
                    // erro de CEP/geocode: segue (a combinar)
                }
            }
        }

        // Desconto: EXCLUSIVO — cupom OU código de indicação OU crédito (nunca combinados)
        let descontoValor = 0, cupomAplicado = null, origemDesconto = null;
        let indicadorId = null, creditoParaUsar = null;
        const fontes = [!!cupomCodigo, !!indicacaoCodigo, !!usarCredito].filter(Boolean).length;
        if (fontes > 1) throw new Error('Use apenas um desconto: cupom, código de indicação ou crédito.');

        if (cupomCodigo) {
            try {
                const cup = await this.validarCupom({ codigo: cupomCodigo, totalCaixas });
                descontoValor = cup.tipo === 'pct' ? subtotal * cup.valor / 100 : Math.min(cup.valor, subtotal);
                cupomAplicado = cup.codigo; origemDesconto = 'CUPOM';
            } catch (_) { /* cupom inválido: ignora silenciosamente */ }
        } else if (indicacaoCodigo && clienteId) {
            try {
                const ind = await this.validarIndicacao({ clienteId, codigo: indicacaoCodigo });
                descontoValor = ind.tipo === 'pct' ? subtotal * ind.valor / 100 : Math.min(ind.valor, subtotal);
                indicadorId = ind.indicadorId; origemDesconto = 'INDICACAO';
            } catch (_) { /* código inválido: ignora */ }
        } else if (usarCredito && clienteId) {
            creditoParaUsar = await prisma.kitFestaCredito.findFirst({ where: { donoId: auth.id, status: 'DISPONIVEL' }, orderBy: { createdAt: 'asc' } });
            if (creditoParaUsar) { descontoValor = Math.min(dec(creditoParaUsar.valor), subtotal); origemDesconto = 'CREDITO'; }
        }
        descontoValor = Math.round(descontoValor * 100) / 100;

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
                origemDesconto,
                creditoUsadoId: creditoParaUsar?.id || null,
                total,
                totalCaixas,
                observacoes: observacoes || null,
                status: semCadastro ? 'PENDENTE_CADASTRO' : 'AGUARDANDO',
                itens: { create: itensData },
            },
            include: { itens: true, bairro: true },
        });

        // Efeitos do desconto aplicado
        if (origemDesconto === 'INDICACAO' && indicadorId) {
            // vincula o indicador (só na 1ª vez) — o crédito dele nasce quando ESTE pedido for quitado
            await prisma.kitFestaCliente.update({ where: { id: auth.id }, data: { indicadoPorId: indicadorId } }).catch(() => {});
        }
        if (origemDesconto === 'CREDITO' && creditoParaUsar) {
            // consome (reserva) o crédito; se o pedido for recusado/cancelado, é liberado de volta
            await prisma.kitFestaCredito.update({ where: { id: creditoParaUsar.id }, data: { status: 'USADO', usadoPedidoId: pedido.id, usadoEm: new Date() } }).catch(() => {});
        }
        if (origemDesconto === 'CUPOM' && cupomAplicado) {
            const cupRow = await prisma.kitFestaCupom.findUnique({ where: { codigo: cupomAplicado } });
            if (cupRow) {
                await prisma.kitFestaCupomUso.create({ data: { cupomId: cupRow.id, codigo: cupomAplicado, clienteId: auth.id, pedidoId: pedido.id, valor: descontoValor } }).catch(() => {});
                await prisma.kitFestaCupom.update({ where: { id: cupRow.id }, data: { usos: { increment: 1 } } }).catch(() => {});
            }
        }

        // Confirmação automática pelo nosso WhatsApp (BotConversa) para o CELULAR DO CLIENTE.
        // Não bloqueia a resposta: se o webhook falhar, o pedido já está salvo.
        webhookService.notificarPedidoKitFesta(pedido.id).catch(err =>
            console.error('[Webhook-KitFesta] Erro async:', err.message)
        );
        return pedido;
    },

    // Marca/desmarca pagamento (quitação). Ao quitar, gera o crédito do indicador
    // (quem indicou o comprador), 1 crédito por indicado.
    async adminMarcarPago(id, pago) {
        const kp = await prisma.kitFestaPedido.findUnique({ where: { id }, include: { kitFestaCliente: true } });
        if (!kp) throw new Error('Pedido não encontrado.');
        const atualizado = await prisma.kitFestaPedido.update({
            where: { id }, data: { pago: !!pago, pagoEm: pago ? new Date() : null },
        });
        if (pago) await this._gerarCreditoIndicacao(kp);
        return atualizado;
    },

    // Detecta automaticamente quitação via Contas a Receber do Pedido convertido.
    // Um pedido é considerado pago se a Conta a Receber está QUITADA ou a baixa no CA foi feita.
    async sincronizarPagamentos() {
        const abertos = await prisma.kitFestaPedido.findMany({
            where: { pago: false, pedidoId: { not: null } },
            select: { id: true, pedidoId: true },
        });
        let atualizados = 0;
        for (const kp of abertos) {
            try {
                const pedido = await prisma.pedido.findUnique({
                    where: { id: kp.pedidoId },
                    select: { baixaCaRealizada: true, contaReceber: { select: { status: true } } },
                });
                const quitado = pedido && (pedido.baixaCaRealizada === true || pedido.contaReceber?.status === 'QUITADO');
                if (quitado) { await this.adminMarcarPago(kp.id, true); atualizados++; }
            } catch (e) { /* segue para o próximo */ }
        }
        return { atualizados };
    },

    // Gera o crédito do indicador quando o pedido do INDICADO é quitado (idempotente por indicado).
    async _gerarCreditoIndicacao(kp) {
        try {
            const comprador = kp.kitFestaCliente || await prisma.kitFestaCliente.findUnique({ where: { id: kp.kitFestaClienteId } });
            if (!comprador?.indicadoPorId) return;
            // 1 crédito por pessoa indicada
            const jaGerado = await prisma.kitFestaCredito.findFirst({ where: { indicadoId: comprador.id } });
            if (jaGerado) return;
            const cfg = await this.configPublico();
            const valor = dec(cfg.indicacao?.credito);
            if (valor <= 0) return;
            await prisma.kitFestaCredito.create({
                data: { donoId: comprador.indicadoPorId, indicadoId: comprador.id, origemPedidoId: kp.id, valor, status: 'DISPONIVEL' },
            });
        } catch (e) { console.error('[KitFesta] gerar crédito:', e.message); }
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

    // ── Agenda (por dia) ──
    // Resumo do calendário: por dia, status + nº de slots por modo + nº de pedidos.
    async adminListarAgenda({ inicio, fim }) {
        const dataInicio = inicio ? new Date(inicio) : new Date();
        const dataFim = fim ? new Date(fim) : new Date(Date.now() + 60 * 864e5);
        const k = (d) => d.toISOString().slice(0, 10);

        const [dias, slots, pedidos] = await Promise.all([
            prisma.kitFestaAgendaDia.findMany({ where: { data: { gte: dataInicio, lte: dataFim } } }),
            prisma.kitFestaHorarioDia.groupBy({ by: ['data', 'modo'], where: { data: { gte: dataInicio, lte: dataFim } }, _count: { _all: true } }),
            prisma.kitFestaPedido.groupBy({ by: ['data'], where: { data: { gte: dataInicio, lte: dataFim }, status: { notIn: ['RECUSADO', 'CANCELADO'] } }, _count: { _all: true } }),
        ]);

        const out = {};
        const get = (key) => (out[key] ||= { data: key, status: null, slotsRetirada: 0, slotsEntrega: 0, pedidos: 0 });
        dias.forEach(d => { get(k(d.data)).status = d.status; });
        slots.forEach(s => { const e = get(k(s.data)); if (s.modo === 'entrega') e.slotsEntrega = s._count._all; else e.slotsRetirada = s._count._all; });
        pedidos.forEach(p => { get(k(p.data)).pedidos = p._count._all; });
        return Object.values(out);
    },

    // Detalhe de um dia: status + slots de retirada e entrega (com nº de reservas).
    async adminGetDia(dataStr) {
        const d = new Date(dataStr);
        const [dia, slots, reservas] = await Promise.all([
            prisma.kitFestaAgendaDia.findUnique({ where: { data: d } }),
            prisma.kitFestaHorarioDia.findMany({ where: { data: d }, orderBy: [{ modo: 'asc' }, { hora: 'asc' }] }),
            prisma.kitFestaPedido.groupBy({ by: ['modo', 'horario'], where: { data: d, status: { notIn: ['RECUSADO', 'CANCELADO'] } }, _count: { _all: true } }),
        ]);
        const usados = {}; reservas.forEach(r => { usados[`${r.modo}|${r.horario}`] = r._count._all; });
        const porModo = { retirada: [], entrega: [] };
        slots.forEach(s => { (porModo[s.modo] || (porModo[s.modo] = [])).push({ id: s.id, hora: s.hora, capacidade: s.capacidade, usado: usados[`${s.modo}|${s.hora}`] || 0 }); });
        return { data: dataStr, status: dia?.status || null, observacao: dia?.observacao || '', retirada: porModo.retirada, entrega: porModo.entrega };
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

    // Aplicação em LOTE: para cada data, fecha o dia OU abre e (re)define os slots de um modo.
    // datas: ['YYYY-MM-DD'], modo: 'retirada'|'entrega', slots: [{hora, capacidade}], fecharDia: bool
    async adminSalvarLote({ datas, modo, slots = [], fecharDia = false }) {
        if (!Array.isArray(datas) || !datas.length) throw new Error('Selecione ao menos um dia.');
        if (!fecharDia && modo && !['retirada', 'entrega'].includes(modo)) throw new Error('Modo inválido.');
        const ops = [];
        for (const dStr of datas) {
            const d = new Date(dStr);
            if (fecharDia) {
                ops.push(prisma.kitFestaAgendaDia.upsert({ where: { data: d }, create: { data: d, status: 'closed' }, update: { status: 'closed' } }));
            } else {
                ops.push(prisma.kitFestaAgendaDia.upsert({ where: { data: d }, create: { data: d, status: 'open' }, update: { status: 'open' } }));
                ops.push(prisma.kitFestaHorarioDia.deleteMany({ where: { data: d, modo } }));
                for (const s of slots) {
                    if (!s.hora) continue;
                    ops.push(prisma.kitFestaHorarioDia.create({ data: { data: d, modo, hora: s.hora, capacidade: Math.max(1, parseInt(s.capacidade) || 1) } }));
                }
            }
        }
        await prisma.$transaction(ops);
        return { ok: true, dias: datas.length };
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
        // Detecta pagamentos automaticamente (Contas a Receber quitada → libera crédito)
        await this.sincronizarPagamentos().catch(() => {});
        // Sincroniza com o sistema: pedido convertido cujo pedido gerado foi EXCLUÍDO
        // no sistema vira CANCELADO aqui (status do site acompanha o do sistema).
        const convertidos = await prisma.kitFestaPedido.findMany({
            where: { status: 'CONVERTIDO', pedidoId: { not: null } },
            select: { id: true, pedido: { select: { statusEnvio: true } } },
        });
        const cancelar = convertidos.filter(c => c.pedido?.statusEnvio === 'EXCLUIDO').map(c => c.id);
        if (cancelar.length) {
            await prisma.kitFestaPedido.updateMany({ where: { id: { in: cancelar } }, data: { status: 'CANCELADO' } });
        }

        const where = {};
        if (status) where.status = status;
        if (data) where.data = new Date(data);
        if (busca) {
            const cpf = soDigitos(busca);
            // Busca por nome, razão (Nome), fantasia, cidade, CPF/CNPJ e telefone.
            where.OR = [
                { nomeCliente: { contains: busca, mode: 'insensitive' } },
                cpf ? { cpfCliente: { contains: cpf } } : undefined,
                { telefoneCliente: { contains: busca } },
                { kitFestaCliente: { cliente: { Nome: { contains: busca, mode: 'insensitive' } } } },
                { kitFestaCliente: { cliente: { NomeFantasia: { contains: busca, mode: 'insensitive' } } } },
                { kitFestaCliente: { cliente: { End_Cidade: { contains: busca, mode: 'insensitive' } } } },
            ].filter(Boolean);
        }
        return prisma.kitFestaPedido.findMany({
            where,
            orderBy: { createdAt: 'desc' }, // mais recente primeiro
            include: {
                itens: true, bairro: true,
                kitFestaCliente: { include: { cliente: { select: { Nome: true, NomeFantasia: true, End_Cidade: true } } } },
                pedido: { select: { id: true, numero: true, statusEnvio: true } },
            },
            take: 300,
        });
    },

    async adminRecusarPedido(id, motivo) {
        // Libera o crédito reservado (se o pedido usou crédito de indicação)
        const kp = await prisma.kitFestaPedido.findUnique({ where: { id }, select: { creditoUsadoId: true } });
        if (kp?.creditoUsadoId) {
            await prisma.kitFestaCredito.update({ where: { id: kp.creditoUsadoId }, data: { status: 'DISPONIVEL', usadoPedidoId: null, usadoEm: null } }).catch(() => {});
        }
        return prisma.kitFestaPedido.update({
            where: { id },
            data: { status: 'RECUSADO', motivoRecusa: motivo || null },
        });
    },

    // Histórico de uso de cupons (todos ou de um cupom específico)
    async adminCuponsUsos(cupomId) {
        return prisma.kitFestaCupomUso.findMany({
            where: cupomId ? { cupomId } : {},
            orderBy: { createdAt: 'desc' },
            include: { cliente: { select: { nome: true, cpf: true, telefone: true } } },
            take: 500,
        });
    },

    // Painel de indicações: créditos gerados + resumo
    async adminIndicacoes() {
        await this.sincronizarPagamentos().catch(() => {}); // libera créditos de pedidos recém-quitados
        const creditos = await prisma.kitFestaCredito.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                dono: { select: { nome: true, cpf: true, codigoIndicacao: true } },
                indicado: { select: { nome: true, cpf: true } },
            },
            take: 500,
        });
        const resumo = {
            total: creditos.length,
            disponiveis: creditos.filter(c => c.status === 'DISPONIVEL').length,
            usados: creditos.filter(c => c.status === 'USADO').length,
            valorDisponivel: creditos.filter(c => c.status === 'DISPONIVEL').reduce((s, c) => s + dec(c.valor), 0),
            valorUsado: creditos.filter(c => c.status === 'USADO').reduce((s, c) => s + dec(c.valor), 0),
        };
        return { resumo, creditos };
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

        // (uso do cupom já é registrado na criação do pedido — não incrementa aqui)
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
        mapsUrl: 'https://maps.app.goo.gl/DHD5J5xC4toi4sRj6',
        email: 'atendimento@hardtsalgados.com.br',
        instagram: 'hardtsalgados',
        facebook: '',
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
    // credito = R$ que o INDICADOR ganha por indicação (quando o indicado quita)
    // descontoIndicado = desconto que o INDICADO ganha ao usar o código; tipo 'brl' ou 'pct'
    indicacao: {
        ativo: true, credito: 20, descontoIndicado: 20, descontoIndicadoTipo: 'brl',
        avisoCreditos: 'Os créditos de indicação entram na sua conta em até 72h após a conclusão do pedido do seu indicado.',
    },
    freteTexto: 'A taxa de entrega é combinada no WhatsApp conforme seu endereço.',
    // Cobertura por RAIO a partir da loja. lojaLat/lojaLng = coordenadas da Hardt.
    entrega: { raioKm: 12, lojaLat: -26.1901505, lojaLng: -48.910781 },
    // antecedenciaHoras = fecha automaticamente os horários que estão a menos de N horas do agora
    agenda: { antecedenciaHoras: 3 },
};

module.exports = kitFestaService;
