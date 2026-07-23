const crypto = require('crypto');
const prisma = require('../config/database');
const consultaCnpjService = require('../services/consultaCnpjService');
const { normalizarDoc, validarDoc, ehCnpj } = require('../utils/documento');

// IE varia por UF; em SC são 9 dígitos. Devolve mensagem de erro ou null se ok.
function validarIe(ie, uf) {
    if (!ie) return null;
    if (!/^\d{2,14}$/.test(ie)) return 'Inscrição Estadual deve ter só números (2 a 14 dígitos)';
    if (String(uf || '').toUpperCase() === 'SC' && ie.length !== 9) {
        return 'Inscrição Estadual de SC deve ter 9 dígitos';
    }
    return null;
}

const clienteController = {
    // Listar clientes com paginação e busca
    // Listar clientes com paginação e busca
    listar: async (req, res) => {
        try {
            const { page = 1, limit = 10, search = '', ativo, idVendedor, diaEntrega, diaVenda, condicaoPagamento, condicaoPermitida } = req.query;
            const skip = (page - 1) * limit;

            const where = {};

            // Filtro de busca textual expandida
            if (search) {
                where.OR = [
                    { Nome: { contains: search, mode: 'insensitive' } },
                    { NomeFantasia: { contains: search, mode: 'insensitive' } },
                    { Documento: { contains: search, mode: 'insensitive' } },
                    { Codigo: { contains: search, mode: 'insensitive' } },
                    { End_Cidade: { contains: search, mode: 'insensitive' } },
                    { End_Bairro: { contains: search, mode: 'insensitive' } },
                    { End_Logradouro: { contains: search, mode: 'insensitive' } },
                    { Telefone: { contains: search, mode: 'insensitive' } },
                    { Telefone_Celular: { contains: search, mode: 'insensitive' } }
                ];
            }

            // Filtros Específicos
            if (ativo !== undefined) {
                where.Ativo = ativo === 'true';
            }
            if (idVendedor) {
                where.idVendedor = idVendedor;
            }
            if (diaEntrega) {
                where.Dia_de_entrega = { contains: diaEntrega };
            }
            if (diaVenda) {
                where.Dia_de_venda = { contains: diaVenda };
            }
            if (condicaoPagamento) {
                where.Condicao_de_pagamento = condicaoPagamento;
            }
            if (condicaoPermitida) {
                where.condicoes_pagamento_permitidas = { has: condicaoPermitida };
            }

            // Controle de visibilidade com base no nível de permissão (Vendedor/Admin)
            if (req.user) {
                const permissaoPedidos = req.user.permissoes?.pedidos || {};
                // Se NÃO tem permissão explícita para ver TODOS OS CLIENTES (ex: regra imposta),
                // Oculta os clientes e exibe apenas os vinculados a ele
                if (permissaoPedidos.clientes !== 'todos') {
                    where.idVendedor = req.user.id;
                }
            }

            const total = await prisma.cliente.count({ where });
            const clientes = await prisma.cliente.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { Nome: 'asc' },
                include: {
                    vendedor: {
                        select: {
                            id: true,
                            nome: true,
                            ativo: true
                        }
                    },
                    categoriaCliente: {
                        select: {
                            id: true,
                            nome: true,
                            isentoFlex: true,
                            semLimiteDesconto: true
                        }
                    },
                    clienteInsights: {
                        select: {
                            insightPrincipalTipo: true,
                            insightPrincipalResumo: true,
                            proximaAcaoSugerida: true,
                            orientacaoIaJson: true,
                            statusRecompra: true,
                            diasSemComprar: true,
                            scoreRisco: true,
                        }
                    }
                }
            });

            // Flag de inadimplência por cliente (parcelas vencidas não pagas)
            const clienteIds = clientes.map(c => c.UUID);
            let delinqMap = {};
            if (clienteIds.length > 0) {
                const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                const hoje = new Date(hojeStr + 'T00:00:00.000Z');
                const contasAbertas = await prisma.contaReceber.findMany({
                    where: {
                        clienteId: { in: clienteIds },
                        status: { in: ['ABERTO', 'PARCIAL'] },
                        parcelas: { some: { status: 'PENDENTE', dataVencimento: { lt: hoje } } },
                        NOT: [
                            { pedido: { statusEnvio: 'EXCLUIDO' } },
                            { pedido: { situacaoCA: 'CANCELADO' } }
                        ]
                    },
                    select: {
                        clienteId: true,
                        parcelas: {
                            where: { status: 'PENDENTE', dataVencimento: { lt: hoje } },
                            select: { valor: true }
                        }
                    }
                });
                for (const cr of contasAbertas) {
                    if (!delinqMap[cr.clienteId]) delinqMap[cr.clienteId] = 0;
                    for (const p of cr.parcelas) delinqMap[cr.clienteId] += Number(p.valor);
                }
            }

            const clientesComFlag = clientes.map(c => ({
                ...c,
                inadimplente: !!delinqMap[c.UUID],
                totalVencido: delinqMap[c.UUID] || 0
            }));

            res.json({
                data: clientesComFlag,
                meta: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('Erro ao listar clientes:', error);
            res.status(500).json({ error: 'Erro interno ao listar clientes' });
        }
    },

    // Busca global leve para "encontrar cliente que pode estar em outra carteira".
    // Retorna apenas campos necessários pra exibição e regras de UI (bloqueio de atendimento).
    // NÃO aplica filtro por idVendedor: qualquer usuário autenticado pode pesquisar,
    // mas o front bloqueia atender/pedido quando o cliente não é dele.
    buscarGlobal: async (req, res) => {
        try {
            const { q = '', limit = 20 } = req.query;
            const termo = String(q).trim();
            if (termo.length < 2) return res.json({ data: [] });

            const clientes = await prisma.cliente.findMany({
                where: {
                    Ativo: true,
                    OR: [
                        { Nome: { contains: termo, mode: 'insensitive' } },
                        { NomeFantasia: { contains: termo, mode: 'insensitive' } },
                        { Documento: { contains: termo, mode: 'insensitive' } },
                        { Codigo: { contains: termo, mode: 'insensitive' } }
                    ]
                },
                take: Math.min(Number(limit) || 20, 50),
                orderBy: { Nome: 'asc' },
                select: {
                    UUID: true,
                    Codigo: true,
                    Nome: true,
                    NomeFantasia: true,
                    Documento: true,
                    Telefone: true,
                    Telefone_Celular: true,
                    Email: true,
                    End_Logradouro: true,
                    End_Numero: true,
                    End_Complemento: true,
                    End_Bairro: true,
                    End_Cidade: true,
                    End_Estado: true,
                    End_CEP: true,
                    Ponto_GPS: true,
                    Dia_de_venda: true,
                    Dia_de_entrega: true,
                    Formas_Atendimento: true,
                    Observacoes_Gerais: true,
                    Situacao_serasa: true,
                    idVendedor: true,
                    vendedor: { select: { id: true, nome: true } }
                }
            });
            res.json({ data: clientes });
        } catch (error) {
            console.error('Erro na busca global de clientes:', error);
            res.status(500).json({ error: 'Erro ao buscar clientes' });
        }
    },

    // Buscar detalhe de um cliente
    detalhar: async (req, res) => {
        try {
            const { uuid } = req.params;

            const cliente = await prisma.cliente.findUnique({
                where: { UUID: uuid },
                include: {
                    arquivos: true,
                    fiscal: true,
                    indicacao: {
                        select: { UUID: true, Nome: true, NomeFantasia: true }
                    }
                }
            });

            if (!cliente) {
                return res.status(404).json({ error: 'Cliente não encontrado' });
            }

            // Achata a IE (tabela separada) para o front continuar usando cliente.Inscricao_Estadual
            cliente.Inscricao_Estadual = cliente.fiscal?.inscricaoEstadual ?? null;

            res.json(cliente);
        } catch (error) {
            console.error('Erro ao detalhar cliente:', error);
            res.status(500).json({ error: 'Erro interno ao buscar cliente' });
        }
    },

    // Consulta dados públicos de um CNPJ (Receita) + IE (SEFAZ, via certificado A1)
    // para pré-preencher o cadastro. Não grava nada.
    consultarCnpj: async (req, res) => {
        try {
            const resultado = await consultaCnpjService.consultarCnpj(req.params.cnpj);
            res.json(resultado);
        } catch (error) {
            console.error('Erro na consulta de CNPJ:', error);
            res.status(500).json({ encontrado: false, erro: 'Erro interno na consulta do CNPJ' });
        }
    },

    // Criar cliente novo (cadastro 100% pelo app — clientes não vêm mais do Conta Azul)
    criar: async (req, res) => {
        try {
            const perms = typeof req.user.permissoes === 'string'
                ? JSON.parse(req.user.permissoes)
                : (req.user.permissoes || {});
            if (!(perms.admin || perms.clientes?.edit)) {
                return res.status(403).json({ error: 'Sem permissão para cadastrar clientes' });
            }

            const b = req.body || {};
            const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
            const docNorm = normalizarDoc(b.Documento);
            const nome = String(b.Nome || '').trim();
            const ufNorm = String(b.End_Estado || '').trim().toUpperCase();

            const erros = [];
            if (!nome) erros.push('Razão social / nome é obrigatório');
            if (!docNorm) erros.push('CNPJ/CPF é obrigatório');
            else if (!validarDoc(docNorm)) erros.push('CNPJ/CPF inválido (confira os dígitos)');
            const emailNorm = String(b.Email || '').trim();
            if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) erros.push('E-mail inválido');
            const celularNorm = soDigitos(b.Telefone_Celular);
            if (celularNorm && (celularNorm.length < 10 || celularNorm.length > 11)) {
                erros.push('Celular deve ter 10 ou 11 dígitos (com DDD)');
            }
            const ieNorm = soDigitos(b.Inscricao_Estadual);
            const erroIe = validarIe(ieNorm, ufNorm);
            if (erroIe) erros.push(erroIe);
            if (erros.length) return res.status(400).json({ error: erros.join('; ') });

            const jaExiste = await prisma.cliente.findUnique({ where: { Documento: docNorm } });
            if (jaExiste) {
                return res.status(409).json({
                    error: `Já existe um cliente com este documento: ${jaExiste.Nome}`,
                    clienteExistente: { UUID: jaExiste.UUID, Nome: jaExiste.Nome }
                });
            }

            // Próximo código sequencial (continua a numeração vinda do Conta Azul)
            const [{ max }] = await prisma.$queryRaw`
                SELECT COALESCE(MAX(NULLIF(regexp_replace("Codigo", '[^0-9]', '', 'g'), '')::bigint), 0) AS max
                FROM clientes`;
            const proximoCodigo = String(Number(max) + 1);

            const cliente = await prisma.cliente.create({
                data: {
                    UUID: crypto.randomUUID(),
                    Codigo: proximoCodigo,
                    Nome: nome,
                    NomeFantasia: String(b.NomeFantasia || '').trim() || null,
                    Documento: docNorm,
                    Tipo_Pessoa: ehCnpj(docNorm) ? 'JURIDICA' : 'FISICA',
                    Email: emailNorm || null,
                    Telefone: soDigitos(b.Telefone) || null,
                    Telefone_Celular: celularNorm || null,
                    End_Logradouro: String(b.End_Logradouro || '').trim() || null,
                    End_Numero: String(b.End_Numero || '').trim() || null,
                    End_Complemento: String(b.End_Complemento || '').trim() || null,
                    End_Bairro: String(b.End_Bairro || '').trim() || null,
                    End_Cidade: String(b.End_Cidade || '').trim() || null,
                    End_Estado: ufNorm || null,
                    End_CEP: soDigitos(b.End_CEP) || null,
                    End_Pais: 'Brasil',
                    Indicador_Inscricao_Estadual: b.Indicador_Inscricao_Estadual || (ieNorm ? 'CONTRIBUINTE' : null),
                    Ativo: true,
                    Perfis: JSON.stringify([{ perfil: 'CLIENTE' }]),
                    Perfil_Filtro: 'PADRAO',
                    Data_Criacao: new Date(),
                    idVendedor: b.idVendedor || req.user.id || null,
                    Observacoes_Gerais: String(b.Observacoes_Gerais || '').trim() || null
                }
            });

            if (ieNorm) {
                await prisma.clienteFiscal.create({
                    data: { clienteUuid: cliente.UUID, inscricaoEstadual: ieNorm }
                });
            }

            cliente.Inscricao_Estadual = ieNorm || null;
            res.status(201).json(cliente);
        } catch (error) {
            console.error('Erro ao criar cliente:', error);
            res.status(500).json({ error: 'Erro ao criar cliente' });
        }
    },

    // Edição do cadastro (100% pelo app — nada é enviado ao Conta Azul)
    atualizar: async (req, res) => {
        try {
            const { uuid } = req.params;
            const {
                Dia_de_entrega,
                Dia_de_venda,
                Ponto_GPS,
                Observacoes_Gerais,
                idVendedor,
                Formas_Atendimento,
                Condicao_de_pagamento,
                condicoes_pagamento_permitidas,
                // Indicação
                indicacaoId,
                // Inteligência Comercial
                categoriaClienteId,
                cicloCompraPersonalizadoDias,
                insightAtivo,
                observacaoComercialFixa,
                // WhatsApp
                recebeAvisoPedido,
                // Cadastro (contato/fiscal)
                Email,
                Telefone_Celular,
                Inscricao_Estadual,
                Indicador_Inscricao_Estadual,
                // Cadastro (identificação/endereço)
                Nome,
                NomeFantasia,
                Documento,
                Telefone,
                Ativo,
                End_Logradouro,
                End_Numero,
                End_Complemento,
                End_Bairro,
                End_Cidade,
                End_Estado,
                End_CEP
            } = req.body;

            // Verificar permissão para editar GPS
            const perms = typeof req.user.permissoes === 'string'
                ? JSON.parse(req.user.permissoes)
                : (req.user.permissoes || {});
            const podeEditarGPS = perms.admin || perms.Pode_Editar_GPS || perms.clientes?.edit || perms.Pode_Executar_Entregas;
            // Gate para editar o cadastro em si (identificação, contato, fiscal, endereço)
            const podeEditarCadastro = perms.admin || perms.clientes?.edit || perms.Pode_Editar_GPS;

            const atual = await prisma.cliente.findUnique({
                where: { UUID: uuid },
                select: { Documento: true, End_Estado: true, fiscal: { select: { inscricaoEstadual: true } } }
            });
            if (!atual) return res.status(404).json({ error: 'Cliente não encontrado' });

            // ---- Validação + normalização ----
            const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
            const erros = [];
            let emailNorm, celularNorm, ieNorm, telefoneNorm, docNorm, nomeNorm;

            if (Email !== undefined) {
                emailNorm = String(Email ?? '').trim();
                if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) erros.push('E-mail inválido');
            }
            if (Telefone_Celular !== undefined) {
                celularNorm = soDigitos(Telefone_Celular);
                if (celularNorm && (celularNorm.length < 10 || celularNorm.length > 11)) {
                    erros.push('Celular deve ter 10 ou 11 dígitos (com DDD)');
                }
            }
            if (Telefone !== undefined) telefoneNorm = soDigitos(Telefone);
            if (Nome !== undefined) {
                nomeNorm = String(Nome ?? '').trim();
                if (!nomeNorm) erros.push('Razão social / nome não pode ficar vazio');
            }
            if (Documento !== undefined) {
                docNorm = normalizarDoc(Documento);
                if (!docNorm) erros.push('CNPJ/CPF não pode ficar vazio');
                else if (!validarDoc(docNorm)) erros.push('CNPJ/CPF inválido (confira os dígitos)');
                else if (docNorm !== atual.Documento) {
                    const outro = await prisma.cliente.findUnique({ where: { Documento: docNorm } });
                    if (outro && outro.UUID !== uuid) erros.push(`Documento já usado pelo cliente ${outro.Nome}`);
                }
            }
            const ufFinal = End_Estado !== undefined ? String(End_Estado || '').trim().toUpperCase() : atual.End_Estado;
            if (Inscricao_Estadual !== undefined) {
                ieNorm = soDigitos(Inscricao_Estadual);
                const erroIe = validarIe(ieNorm, ufFinal);
                if (erroIe) erros.push(erroIe);
            }
            if (erros.length) return res.status(400).json({ error: erros.join('; ') });

            const cadastro = podeEditarCadastro ? {
                Email: emailNorm !== undefined ? (emailNorm || null) : undefined,
                Telefone_Celular: celularNorm !== undefined ? (celularNorm || null) : undefined,
                Indicador_Inscricao_Estadual: Indicador_Inscricao_Estadual !== undefined ? (Indicador_Inscricao_Estadual || null) : undefined,
                Nome: nomeNorm,
                NomeFantasia: NomeFantasia !== undefined ? (String(NomeFantasia || '').trim() || null) : undefined,
                Documento: docNorm,
                Tipo_Pessoa: docNorm !== undefined ? (ehCnpj(docNorm) ? 'JURIDICA' : 'FISICA') : undefined,
                Telefone: telefoneNorm !== undefined ? (telefoneNorm || null) : undefined,
                Ativo: Ativo !== undefined ? !!Ativo : undefined,
                End_Logradouro: End_Logradouro !== undefined ? (String(End_Logradouro || '').trim() || null) : undefined,
                End_Numero: End_Numero !== undefined ? (String(End_Numero || '').trim() || null) : undefined,
                End_Complemento: End_Complemento !== undefined ? (String(End_Complemento || '').trim() || null) : undefined,
                End_Bairro: End_Bairro !== undefined ? (String(End_Bairro || '').trim() || null) : undefined,
                End_Cidade: End_Cidade !== undefined ? (String(End_Cidade || '').trim() || null) : undefined,
                End_Estado: End_Estado !== undefined ? (ufFinal || null) : undefined,
                End_CEP: End_CEP !== undefined ? (soDigitos(End_CEP) || null) : undefined
            } : {};

            const cliente = await prisma.cliente.update({
                where: { UUID: uuid },
                data: {
                    Dia_de_entrega,
                    Dia_de_venda,
                    Ponto_GPS: podeEditarGPS ? Ponto_GPS : undefined,
                    Observacoes_Gerais,
                    idVendedor: idVendedor === "" ? null : idVendedor,
                    Formas_Atendimento,
                    Condicao_de_pagamento: Condicao_de_pagamento === "" ? null : Condicao_de_pagamento,
                    condicoes_pagamento_permitidas,
                    // Indicação
                    indicacaoId: indicacaoId === "" ? null : indicacaoId,
                    // Inteligência Comercial
                    categoriaClienteId: categoriaClienteId === "" ? null : categoriaClienteId,
                    cicloCompraPersonalizadoDias: cicloCompraPersonalizadoDias !== undefined && cicloCompraPersonalizadoDias !== ''
                        ? parseInt(cicloCompraPersonalizadoDias)
                        : null,
                    insightAtivo: insightAtivo !== undefined ? insightAtivo : true,
                    observacaoComercialFixa: observacaoComercialFixa || null,
                    recebeAvisoPedido: recebeAvisoPedido !== undefined ? recebeAvisoPedido : undefined,
                    ...cadastro
                }
            });

            // Número da IE em tabela separada (cliente_fiscal), fora da tabela clientes
            if (podeEditarCadastro && ieNorm !== undefined) {
                await prisma.clienteFiscal.upsert({
                    where: { clienteUuid: uuid },
                    create: { clienteUuid: uuid, inscricaoEstadual: ieNorm || null },
                    update: { inscricaoEstadual: ieNorm || null }
                });
            }

            // Reflete a IE achatada na resposta
            cliente.Inscricao_Estadual = (podeEditarCadastro && ieNorm !== undefined)
                ? (ieNorm || null)
                : (atual.fiscal?.inscricaoEstadual ?? null);

            res.json(cliente);
        } catch (error) {
            console.error('Erro ao atualizar cliente:', error);
            res.status(500).json({ error: 'Erro ao atualizar dados do cliente' });
        }
    },

    // Sync de clientes com o Conta Azul — DESATIVADO em 07/2026: o cadastro agora é 100% do app.
    // A rota continua existindo para versões antigas do frontend não quebrarem.
    sincronizar: async (req, res) => {
        res.json({
            success: false,
            desativado: true,
            message: 'Sincronização de clientes com o Conta Azul foi desativada — o cadastro agora é feito e mantido pelo próprio app.'
        });
    },

    // Retornar status de inadimplência + contas a receber em aberto de um cliente
    obterInadimplencia: async (req, res) => {
        try {
            const { uuid } = req.params;
            const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const hoje = new Date(hojeStr + 'T00:00:00.000Z');

            const contas = await prisma.contaReceber.findMany({
                where: {
                    clienteId: uuid,
                    status: { in: ['ABERTO', 'PARCIAL'] },
                    NOT: [
                        { pedido: { statusEnvio: 'EXCLUIDO' } },
                        { pedido: { situacaoCA: 'CANCELADO' } }
                    ]
                },
                include: {
                    pedido: {
                        select: {
                            numero: true, especial: true, dataVenda: true,
                            nomeCondicaoPagamento: true, statusEntrega: true,
                            itensDevolvidos: { select: { valorBaseItem: true, quantidade: true } },
                            devolucoes: { where: { status: 'ATIVA' }, select: { valorTotal: true, escopo: true } }
                        }
                    },
                    parcelas: {
                        orderBy: { numeroParcela: 'asc' },
                        include: { baixadoPor: { select: { nome: true } } }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            let totalVencido = 0;
            let parcelasVencidas = 0;

            const contasFormatadas = contas.map(c => {
                const valorDevolvido = (c.pedido?.itensDevolvidos || [])
                    .reduce((s, i) => s + Number(i.valorBaseItem) * Number(i.quantidade), 0);
                const devolucaoAtiva = c.pedido?.devolucoes?.[0] || null;

                const parcelas = c.parcelas.map(p => {
                    const vencida = p.status === 'PENDENTE' && new Date(p.dataVencimento) < hoje;
                    const diasAtraso = vencida
                        ? Math.floor((hoje - new Date(p.dataVencimento)) / (1000 * 60 * 60 * 24))
                        : 0;
                    if (vencida) { totalVencido += Number(p.valor); parcelasVencidas++; }
                    return {
                        id: p.id,
                        numeroParcela: p.numeroParcela,
                        valor: Number(p.valor),
                        dataVencimento: p.dataVencimento,
                        dataPagamento: p.dataPagamento,
                        valorPago: p.valorPago ? Number(p.valorPago) : null,
                        formaPagamento: p.formaPagamento,
                        status: p.status,
                        diasAtraso,
                        baixadoPorNome: p.baixadoPor?.nome || null
                    };
                });

                return {
                    id: c.id,
                    status: c.status,
                    origem: c.origem,
                    valorTotal: Number(c.valorTotal),
                    valorDevolvido: valorDevolvido > 0 ? Math.round(valorDevolvido * 100) / 100 : 0,
                    devolucaoEscopo: devolucaoAtiva?.escopo || null,
                    pedidoNumero: c.pedido?.numero || null,
                    pedidoEspecial: c.pedido?.especial || false,
                    dataVenda: c.pedido?.dataVenda || null,
                    condicaoPagamento: c.pedido?.nomeCondicaoPagamento || null,
                    statusEntrega: c.pedido?.statusEntrega || null,
                    parcelasTotal: parcelas.length,
                    parcelasPagas: parcelas.filter(p => p.status === 'PAGO').length,
                    proximoVencimento: parcelas
                        .filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO')
                        .sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento))[0]?.dataVencimento || null,
                    parcelas
                };
            });

            res.json({
                inadimplente: parcelasVencidas > 0,
                totalVencido: Math.round(totalVencido * 100) / 100,
                parcelasVencidas,
                contas: contasFormatadas
            });
        } catch (error) {
            console.error('Erro ao verificar inadimplência:', error);
            res.status(500).json({ error: 'Erro ao verificar inadimplência' });
        }
    },

    // Atualizar clientes em lote
    atualizarLote: async (req, res) => {
        try {
            const { ids, dados } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'Lista de IDs inválida.' });
            }

            if (!dados || Object.keys(dados).length === 0) {
                return res.status(400).json({ error: 'Nenhum dado para atualização fornecido.' });
            }

            // Filtrar apenas campos permitidos para edição em lote
            const dadosAtualizacao = {};
            if (dados.idVendedor !== undefined) dadosAtualizacao.idVendedor = dados.idVendedor;
            if (dados.Dia_de_entrega !== undefined) dadosAtualizacao.Dia_de_entrega = dados.Dia_de_entrega;
            if (dados.Dia_de_venda !== undefined) dadosAtualizacao.Dia_de_venda = dados.Dia_de_venda;
            if (dados.Formas_Atendimento !== undefined) dadosAtualizacao.Formas_Atendimento = dados.Formas_Atendimento;

            if (Object.keys(dadosAtualizacao).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo válido para atualização (Vendedor, Entrega, Venda, Atendimento).' });
            }

            const resultado = await prisma.cliente.updateMany({
                where: {
                    UUID: { in: ids }
                },
                data: dadosAtualizacao
            });

            res.json({
                message: 'Atualização em lote concluída com sucesso.',
                count: resultado.count
            });

        } catch (error) {
            console.error('Erro ao atualizar clientes em lote:', error);
            res.status(500).json({ error: 'Erro interno ao atualizar clientes em lote' });
        }
    }
};

module.exports = clienteController;
