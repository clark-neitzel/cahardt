const crypto = require('crypto');
const prisma = require('../config/database');
const consultaCnpjService = require('../services/consultaCnpjService');
const { normalizarDoc, validarDoc, ehCnpj } = require('../utils/documento');

// WhatsApps vinculados ao cadastro (tabela lateral cliente_whatsapps — usados pelo painel do
// bot de WhatsApp para achar o cliente). Normaliza para só dígitos, sem vazios nem repetidos.
// Devolve null quando o campo não veio no body (= não mexer no que está salvo).
function normalizarWhatsapps(lista, erros) {
    if (!Array.isArray(lista)) return null;
    const nums = [...new Set(lista.map(v => String(v ?? '').replace(/\D/g, '')).filter(Boolean))];
    for (const n of nums) {
        if (n.length < 10 || n.length > 13) {
            erros.push(`WhatsApp "${n}" inválido — informe DDD + número (10 a 13 dígitos)`);
        }
    }
    return nums;
}

// IE varia por UF; em SC são 9 dígitos. Devolve mensagem de erro ou null se ok.
function validarIe(ie, uf) {
    if (!ie) return null;
    if (!/^\d{2,14}$/.test(ie)) return 'Inscrição Estadual deve ter só números (2 a 14 dígitos)';
    if (String(uf || '').toUpperCase() === 'SC' && ie.length !== 9) {
        return 'Inscrição Estadual de SC deve ter 9 dígitos';
    }
    return null;
}

// Mantém a tabela `fornecedores` (usada pelo Contas a Pagar e Notas de Entrada) em dia
// com um cadastro que também é fornecedor. Upsert por documento; reativa se estava inativo.
async function upsertFornecedorDoCadastro(dados) {
    const doc = dados.Documento;
    const base = {
        razaoSocial: dados.Nome,
        nomeFantasia: dados.NomeFantasia || null,
        inscricaoEstadual: dados.InscricaoEstadual || null,
        email: dados.Email || null,
        telefone: dados.Telefone_Celular || dados.Telefone || null,
        cidade: dados.End_Cidade || null,
        uf: dados.End_Estado || null,
        ativo: true
    };
    const existente = await prisma.fornecedor.findFirst({ where: { cnpjCpf: doc } });
    if (existente) {
        return prisma.fornecedor.update({ where: { id: existente.id }, data: base });
    }
    return prisma.fornecedor.create({
        data: { ...base, cnpjCpf: doc, origem: 'APP', statusEnvioCA: 'ENVIAR' }
    });
}

const clienteController = {
    // Listar clientes com paginação e busca
    // Listar clientes com paginação e busca
    listar: async (req, res) => {
        try {
            const { page = 1, limit = 10, search = '', ativo, idVendedor, diaEntrega, diaVenda, condicaoPagamento, condicaoPermitida, semVenda, semVendaDe, semVendaAte, perfil } = req.query;
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
            // Padrão: SÓ ativos. Cliente desativado (ex.: virou só fornecedor) não pode
            // aparecer em rota, novo pedido, catálogo nem autocomplete. A lista de
            // clientes pede explicitamente ativo=false na aba "Inativos"; ativo=todos traz os dois.
            if (ativo === undefined) {
                where.Ativo = true;
            } else if (ativo !== 'todos') {
                where.Ativo = ativo === 'true';
            }
            if (idVendedor) {
                where.idVendedor = idVendedor;
            }
            // Tempo sem vendas (pela data de venda do pedido; pedido válido = não bonificação,
            // não excluído, não cancelado/devolvido no CA):
            //   semVenda='nunca'      → nunca teve pedido válido
            //   semVendaDe=X          → última compra há X dias ou mais (quem nunca comprou NÃO entra —
            //                           para isso existe o 'nunca'; senão a faixa vira sempre "todo mundo")
            //   semVendaAte=Y         → última compra há no máximo Y dias
            //   De+Até juntos         → faixa: última compra entre X e Y dias atrás
            // (semVenda numérico é o formato antigo do filtro — tratado como semVendaDe)
            if (semVenda || semVendaDe || semVendaAte) {
                const pedidoValido = {
                    bonificacao: false,
                    statusEnvio: { not: 'EXCLUIDO' },
                    OR: [{ situacaoCA: null }, { situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO', 'EXCLUIDO'] } }]
                };
                if (semVenda === 'nunca') {
                    where.pedidos = { none: pedidoValido };
                } else {
                    const de = parseInt(semVendaDe !== undefined && semVendaDe !== '' ? semVendaDe : semVenda);
                    const ate = parseInt(semVendaAte);
                    const conds = [];
                    if (!isNaN(de) && de > 0) {
                        const corteDe = new Date(Date.now() - de * 24 * 60 * 60 * 1000);
                        conds.push({ pedidos: { none: { ...pedidoValido, dataVenda: { gte: corteDe } } } });
                        conds.push({ pedidos: { some: pedidoValido } }); // já comprou alguma vez
                    }
                    if (!isNaN(ate) && ate > 0) {
                        const corteAte = new Date(Date.now() - ate * 24 * 60 * 60 * 1000);
                        conds.push({ pedidos: { some: { ...pedidoValido, dataVenda: { gte: corteAte } } } });
                    }
                    if (conds.length > 0) where.AND = [...(where.AND || []), ...conds];
                }
            }
            // Perfil do cadastro: 'fornecedor' = também é fornecedor; 'cliente' = só cliente
            // (o toggle "Também é fornecedor" mantém o campo Perfis em dia)
            if (perfil === 'fornecedor') {
                where.Perfis = { contains: 'fornecedor', mode: 'insensitive' };
            } else if (perfil === 'cliente') {
                where.NOT = [...(where.NOT || []), { Perfis: { contains: 'fornecedor', mode: 'insensitive' } }];
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
                    whatsapp: true,
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
            // Achata os WhatsApps vinculados (tabela separada) — front usa cliente.Whatsapps
            cliente.Whatsapps = cliente.whatsapp?.numeros ?? [];

            // Este cadastro também é fornecedor? (tabela fornecedores, por documento)
            const docNorm = normalizarDoc(cliente.Documento);
            cliente.tambemFornecedor = docNorm
                ? !!(await prisma.fornecedor.findFirst({ where: { cnpjCpf: docNorm, ativo: true }, select: { id: true } }))
                : false;

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

    // Criar cadastro novo (100% pelo app — nada vem do Conta Azul).
    // body.perfil: 'CLIENTE' (padrão) | 'FORNECEDOR' | 'AMBOS'.
    // FORNECEDOR grava na tabela fornecedores (Contas a Pagar / Notas de Entrada);
    // AMBOS grava nas duas.
    criar: async (req, res) => {
        try {
            const perms = typeof req.user.permissoes === 'string'
                ? JSON.parse(req.user.permissoes)
                : (req.user.permissoes || {});
            if (!(perms.admin || perms.clientes?.edit)) {
                return res.status(403).json({ error: 'Sem permissão para cadastrar clientes' });
            }

            const b = req.body || {};
            const perfil = ['CLIENTE', 'FORNECEDOR', 'AMBOS'].includes(b.perfil) ? b.perfil : 'CLIENTE';
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
            const whatsappsNorm = normalizarWhatsapps(b.Whatsapps, erros);
            if (erros.length) return res.status(400).json({ error: erros.join('; ') });

            const criaCliente = perfil === 'CLIENTE' || perfil === 'AMBOS';
            const criaFornecedor = perfil === 'FORNECEDOR' || perfil === 'AMBOS';

            // Ponto GPS no cadastro novo: mesma validação do módulo de GPS
            // (duplicado/empresa bloqueiam; perto de outro cliente exige autorização)
            let pontoGpsNovo = null;
            if (criaCliente && b.Ponto_GPS) {
                const gpsClientesService = require('../services/gpsClientesService');
                const problema = await gpsClientesService.validarPonto(b.Ponto_GPS, null);
                if (problema && problema.codigo !== 'PROXIMO') {
                    return res.status(422).json({ error: problema.mensagem, codigo: problema.codigo });
                }
                if (problema?.codigo === 'PROXIMO') {
                    if (!b.gpsAutorizacao) {
                        return res.status(422).json({ error: problema.mensagem, codigo: 'PROXIMO', clienteConflito: problema.clienteConflito });
                    }
                    try {
                        await gpsClientesService.validarAutorizador(b.gpsAutorizacao, 'Pode_Autorizar_Ponto_Gps');
                    } catch (autErr) {
                        return res.status(autErr.status || 403).json({ error: autErr.message });
                    }
                }
                pontoGpsNovo = String(b.Ponto_GPS).trim();
            }
            const marcarBalcao = criaCliente && b.clienteBalcao === true && (perms.admin || perms.Pode_Liberar_Cliente_Balcao);

            // Duplicidade — nunca deixar dois cadastros com o mesmo documento
            if (criaCliente) {
                const jaExiste = await prisma.cliente.findUnique({ where: { Documento: docNorm } });
                if (jaExiste) {
                    return res.status(409).json({
                        error: `Já existe um cliente com este documento: ${jaExiste.Nome}`,
                        clienteExistente: { UUID: jaExiste.UUID, Nome: jaExiste.Nome }
                    });
                }
            }
            if (perfil === 'FORNECEDOR') {
                const fornExiste = await prisma.fornecedor.findFirst({ where: { cnpjCpf: docNorm, ativo: true } });
                if (fornExiste) {
                    return res.status(409).json({ error: `Já existe um fornecedor com este documento: ${fornExiste.razaoSocial}` });
                }
            }

            const dadosComuns = {
                Documento: docNorm,
                Nome: nome,
                NomeFantasia: String(b.NomeFantasia || '').trim() || null,
                InscricaoEstadual: ieNorm || null,
                Email: emailNorm || null,
                Telefone: soDigitos(b.Telefone) || null,
                Telefone_Celular: celularNorm || null,
                End_Cidade: String(b.End_Cidade || '').trim() || null,
                End_Estado: ufNorm || null
            };

            // Só fornecedor: grava na tabela fornecedores e pronto
            if (!criaCliente) {
                const fornecedor = await upsertFornecedorDoCadastro(dadosComuns);
                return res.status(201).json({ fornecedor });
            }

            // Próximo código sequencial (continua a numeração vinda do Conta Azul)
            const [{ max }] = await prisma.$queryRaw`
                SELECT COALESCE(MAX(NULLIF(regexp_replace("Codigo", '[^0-9]', '', 'g'), '')::bigint), 0) AS max
                FROM clientes`;
            const proximoCodigo = String(Number(max) + 1);

            const perfis = [{ perfil: 'CLIENTE' }];
            if (criaFornecedor) perfis.push({ perfil: 'FORNECEDOR' });

            const cliente = await prisma.cliente.create({
                data: {
                    UUID: crypto.randomUUID(),
                    Codigo: proximoCodigo,
                    Nome: nome,
                    NomeFantasia: dadosComuns.NomeFantasia,
                    Documento: docNorm,
                    Tipo_Pessoa: ehCnpj(docNorm) ? 'JURIDICA' : 'FISICA',
                    Email: emailNorm || null,
                    Telefone: dadosComuns.Telefone,
                    Telefone_Celular: celularNorm || null,
                    End_Logradouro: String(b.End_Logradouro || '').trim() || null,
                    End_Numero: String(b.End_Numero || '').trim() || null,
                    End_Complemento: String(b.End_Complemento || '').trim() || null,
                    End_Bairro: String(b.End_Bairro || '').trim() || null,
                    End_Cidade: dadosComuns.End_Cidade,
                    End_Estado: ufNorm || null,
                    End_CEP: soDigitos(b.End_CEP) || null,
                    End_Pais: 'Brasil',
                    Indicador_Inscricao_Estadual: b.Indicador_Inscricao_Estadual || (ieNorm ? 'CONTRIBUINTE' : null),
                    Ativo: true,
                    Perfis: JSON.stringify(perfis),
                    Perfil_Filtro: 'PADRAO',
                    Data_Criacao: new Date(),
                    idVendedor: b.idVendedor || req.user.id || null,
                    Observacoes_Gerais: String(b.Observacoes_Gerais || '').trim() || null,
                    Ponto_GPS: pontoGpsNovo
                }
            });

            // Auditoria do GPS / cliente balcão (best-effort — o cadastro já foi criado)
            try {
                const autorGpsNome = (await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } }))?.nome || null;
                if (pontoGpsNovo) {
                    await prisma.clienteGpsLog.create({
                        data: {
                            clienteUuid: cliente.UUID, tipo: 'MUDANCA', status: 'APLICADO',
                            pontoAntigo: null, pontoNovo: pontoGpsNovo,
                            autorId: req.user.id, autorNome: autorGpsNome, origem: 'CADASTRO'
                        }
                    });
                }
                if (marcarBalcao) {
                    const gpsClientesService = require('../services/gpsClientesService');
                    await gpsClientesService.setBalcao(cliente.UUID, true, { id: req.user.id, nome: autorGpsNome });
                    cliente.clienteBalcao = true;
                }
            } catch (gpsLogErr) { console.error('Cadastro criado; falhou log de GPS/balcão:', gpsLogErr.message); }

            if (ieNorm) {
                await prisma.clienteFiscal.create({
                    data: { clienteUuid: cliente.UUID, inscricaoEstadual: ieNorm }
                });
            }

            if (whatsappsNorm && whatsappsNorm.length) {
                await prisma.clienteWhatsapp.create({
                    data: { clienteUuid: cliente.UUID, numeros: whatsappsNorm }
                });
            }
            cliente.Whatsapps = whatsappsNorm || [];

            // "Os dois": espelha também na tabela de fornecedores (best-effort, não derruba a criação)
            if (criaFornecedor) {
                try { await upsertFornecedorDoCadastro(dadosComuns); }
                catch (fornErr) { console.error('Cliente criado, mas falhou o espelho em fornecedores:', fornErr); }
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
                Whatsapps,
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
                End_CEP,
                // Perfil fornecedor (tabela fornecedores)
                tambemFornecedor
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
            const whatsappsNorm = normalizarWhatsapps(Whatsapps, erros);
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

            // Ponto GPS nunca é gravado direto: passa pela validação (duplicado/empresa/
            // próximo) e auditoria do módulo de GPS. Mudança grande de ponto confirmado
            // vira pendência para a logística — os demais campos salvam normalmente.
            let gpsResultado = null;
            if (podeEditarGPS && Ponto_GPS !== undefined) {
                const atualGpsCli = await prisma.cliente.findUnique({ where: { UUID: uuid }, select: { Ponto_GPS: true } });
                const mudou = String(Ponto_GPS || '').trim() !== String(atualGpsCli?.Ponto_GPS || '').trim();
                if (mudou && Ponto_GPS) {
                    const gpsClientesService = require('../services/gpsClientesService');
                    const autorGps = await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } });
                    try {
                        gpsResultado = await gpsClientesService.registrarMudanca({
                            clienteUuid: uuid,
                            pontoNovo: Ponto_GPS,
                            autor: { id: req.user.id, nome: autorGps?.nome || null },
                            origem: req.body.gpsOrigem || 'CADASTRO',
                            posicaoAutor: req.body.gpsPosicaoAutor || null,
                            autorizacao: req.body.gpsAutorizacao || null
                        });
                    } catch (gpsErr) {
                        return res.status(gpsErr.status || 422).json({
                            error: gpsErr.message,
                            codigo: gpsErr.codigo || undefined,
                            clienteConflito: gpsErr.clienteConflito || undefined
                        });
                    }
                } else if (mudou && !Ponto_GPS) {
                    // Limpar o ponto: permitido, mas fica no histórico
                    await prisma.cliente.update({ where: { UUID: uuid }, data: { Ponto_GPS: null } });
                    try {
                        const autorGps = await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } });
                        await prisma.clienteGpsLog.create({
                            data: {
                                clienteUuid: uuid, tipo: 'MUDANCA', status: 'APLICADO',
                                pontoAntigo: atualGpsCli?.Ponto_GPS || null, pontoNovo: null,
                                autorId: req.user.id, autorNome: autorGps?.nome || null, origem: 'CADASTRO'
                            }
                        });
                    } catch (logErr) { console.error('Log de limpeza de GPS (já aplicada):', logErr.message); }
                }
            }

            const cliente = await prisma.cliente.update({
                where: { UUID: uuid },
                data: {
                    Dia_de_entrega,
                    Dia_de_venda,
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

            // WhatsApps vinculados em tabela separada (cliente_whatsapps), fora da tabela clientes
            if (podeEditarCadastro && whatsappsNorm) {
                await prisma.clienteWhatsapp.upsert({
                    where: { clienteUuid: uuid },
                    create: { clienteUuid: uuid, numeros: whatsappsNorm },
                    update: { numeros: whatsappsNorm }
                });
                cliente.Whatsapps = whatsappsNorm;
            }

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

            // Perfil fornecedor: liga/desliga o espelho na tabela fornecedores (best-effort)
            if (podeEditarCadastro && tambemFornecedor !== undefined) {
                const docFinal = normalizarDoc(cliente.Documento);
                try {
                    if (tambemFornecedor && docFinal) {
                        await upsertFornecedorDoCadastro({
                            Documento: docFinal,
                            Nome: cliente.Nome,
                            NomeFantasia: cliente.NomeFantasia,
                            InscricaoEstadual: cliente.Inscricao_Estadual,
                            Email: cliente.Email,
                            Telefone: cliente.Telefone,
                            Telefone_Celular: cliente.Telefone_Celular,
                            End_Cidade: cliente.End_Cidade,
                            End_Estado: cliente.End_Estado
                        });
                    } else if (!tambemFornecedor && docFinal) {
                        await prisma.fornecedor.updateMany({ where: { cnpjCpf: docFinal }, data: { ativo: false } });
                    }
                    // Mantém o campo Perfis coerente com o toggle
                    let perfis = [];
                    try { perfis = JSON.parse(cliente.Perfis || '[]'); } catch { perfis = []; }
                    if (!Array.isArray(perfis)) perfis = [];
                    const semFornecedor = perfis.filter(p => (p?.perfil || p) !== 'FORNECEDOR');
                    const novosPerfis = tambemFornecedor ? [...semFornecedor, { perfil: 'FORNECEDOR' }] : semFornecedor;
                    await prisma.cliente.update({ where: { UUID: uuid }, data: { Perfis: JSON.stringify(novosPerfis) } });
                    cliente.Perfis = JSON.stringify(novosPerfis);
                } catch (fornErr) {
                    console.error('Falha ao atualizar espelho de fornecedor (cliente já salvo):', fornErr);
                }
                cliente.tambemFornecedor = !!tambemFornecedor;
            }

            // GPS que virou pendência: informar (o cadastro salvou, mas o ponto espera aprovação)
            if (gpsResultado?.pendente) {
                cliente.gpsPendente = true;
            } else if (gpsResultado?.aplicado) {
                cliente.Ponto_GPS = await prisma.cliente.findUnique({ where: { UUID: uuid }, select: { Ponto_GPS: true } }).then(c => c?.Ponto_GPS || null);
            }

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

            // Desativar/reativar e perfil fornecedor em lote — mesma permissão do toggle da ficha.
            if (dados.Ativo !== undefined || dados.tambemFornecedor !== undefined) {
                const perms = typeof req.user.permissoes === 'string'
                    ? JSON.parse(req.user.permissoes)
                    : (req.user.permissoes || {});
                if (!(perms.admin || perms.clientes?.edit || perms.Pode_Editar_GPS)) {
                    return res.status(403).json({ error: 'Sem permissão para alterar o perfil (cliente/fornecedor) em lote.' });
                }
                if (dados.Ativo !== undefined) dadosAtualizacao.Ativo = !!dados.Ativo;
            }

            if (Object.keys(dadosAtualizacao).length === 0 && dados.tambemFornecedor === undefined) {
                return res.status(400).json({ error: 'Nenhum campo válido para atualização (Vendedor, Entrega, Venda, Atendimento, Cliente/Fornecedor).' });
            }

            const resultado = Object.keys(dadosAtualizacao).length > 0
                ? await prisma.cliente.updateMany({
                    where: { UUID: { in: ids } },
                    data: dadosAtualizacao
                })
                : { count: ids.length };

            // Espelho de fornecedor em lote (best-effort por cliente; precisa de documento)
            let semDocumento = 0;
            if (dados.tambemFornecedor !== undefined) {
                const ligar = !!dados.tambemFornecedor;
                const clientesSel = await prisma.cliente.findMany({
                    where: { UUID: { in: ids } },
                    select: {
                        UUID: true, Documento: true, Nome: true, NomeFantasia: true, Email: true,
                        Telefone: true, Telefone_Celular: true, End_Cidade: true, End_Estado: true,
                        Perfis: true, fiscal: { select: { inscricaoEstadual: true } }
                    }
                });
                for (const c of clientesSel) {
                    const doc = normalizarDoc(c.Documento);
                    if (!doc) { semDocumento++; continue; }
                    try {
                        if (ligar) {
                            await upsertFornecedorDoCadastro({
                                Documento: doc,
                                Nome: c.Nome,
                                NomeFantasia: c.NomeFantasia,
                                InscricaoEstadual: c.fiscal?.inscricaoEstadual || null,
                                Email: c.Email,
                                Telefone: c.Telefone,
                                Telefone_Celular: c.Telefone_Celular,
                                End_Cidade: c.End_Cidade,
                                End_Estado: c.End_Estado
                            });
                        } else {
                            await prisma.fornecedor.updateMany({ where: { cnpjCpf: doc }, data: { ativo: false } });
                        }
                        // Mantém o campo Perfis coerente com o toggle (mesma regra da ficha)
                        let perfis = [];
                        try { perfis = JSON.parse(c.Perfis || '[]'); } catch { perfis = []; }
                        if (!Array.isArray(perfis)) perfis = [];
                        const semFornecedor = perfis.filter(p => String(p?.perfil || p).toUpperCase() !== 'FORNECEDOR');
                        const novosPerfis = ligar ? [...semFornecedor, { perfil: 'FORNECEDOR' }] : semFornecedor;
                        await prisma.cliente.update({ where: { UUID: c.UUID }, data: { Perfis: JSON.stringify(novosPerfis) } });
                    } catch (fornErr) {
                        console.error(`Falha no espelho de fornecedor (lote) para ${c.UUID}:`, fornErr.message);
                    }
                }
            }

            res.json({
                message: semDocumento > 0
                    ? `Atualização concluída. ${semDocumento} cadastro(s) sem CNPJ/CPF não puderam virar fornecedor.`
                    : 'Atualização em lote concluída com sucesso.',
                count: resultado.count,
                semDocumento
            });

        } catch (error) {
            console.error('Erro ao atualizar clientes em lote:', error);
            res.status(500).json({ error: 'Erro interno ao atualizar clientes em lote' });
        }
    }
};

module.exports = clienteController;
