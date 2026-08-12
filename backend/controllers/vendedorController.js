const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/database');
const { calcularFlexBulk } = require('../services/flexService');

const vendedorController = {
    // Listar todos os vendedores (inclui flex dinâmico computado dos últimos 30 dias)
    // Por padrão OMITE quem tem acesso externo (contabilidade/parceiro) — esta rota
    // alimenta praticamente todo seletor de vendedor do app. Só a tela Usuários e o
    // painel de permissões pedem ?incluirExternos=true.
    listar: async (req, res) => {
        try {
            const where = {};
            if (req.query.ativo === 'true') where.ativo = true;
            if (req.query.ativo === 'false') where.ativo = false;
            if (req.query.incluirExternos !== 'true') where.acessoExterno = false;

            const vendedores = await prisma.vendedor.findMany({
                where,
                orderBy: { nome: 'asc' }
            });

            const ids = vendedores.map(v => v.id);
            const flexMap = await calcularFlexBulk(ids);

            const resultado = vendedores.map(v => {
                const flex = flexMap.get(v.id) || { percentualFlex: Number(v.percentualFlex || 0), vendasLiquidas: 0, orcamento: 0, flexUsado: 0, disponivel: 0 };
                return {
                    ...v,
                    percentualFlex: Number(v.percentualFlex || 0),
                    flexDinamico: {
                        vendasLiquidas: flex.vendasLiquidas,
                        orcamento: flex.orcamento,
                        flexUsado: flex.flexUsado,
                        disponivel: flex.disponivel
                    }
                };
            });

            res.json(resultado);
        } catch (error) {
            console.error('Erro ao listar vendedores:', error);
            res.status(500).json({ error: 'Erro ao listar vendedores' });
        }
    },

    // Buscar vendedor por ID
    obter: async (req, res) => {
        try {
            const { id } = req.params;
            const vendedor = await prisma.vendedor.findUnique({ where: { id } });
            if (!vendedor) return res.status(404).json({ error: 'Vendedor não encontrado' });
            res.json(vendedor);
        } catch (error) {
            console.error('Erro ao obter vendedor:', error);
            res.status(500).json({ error: 'Erro ao obter vendedor' });
        }
    },

    // Histórico de permissões (auditoria): quem ligou/desligou o quê e quando.
    // Só admin — o histórico expõe o mapa de permissões e permite restaurar versões.
    historicoPermissoes: async (req, res) => {
        try {
            if (req.user?.permissoes?.admin !== true) {
                return res.status(403).json({ error: 'Apenas administradores podem ver o histórico de permissões.' });
            }
            const { id } = req.params;
            const historico = await prisma.vendedorPermissoesHistorico.findMany({
                where: { vendedorId: id },
                orderBy: { criadoEm: 'desc' },
                take: 50
            });
            res.json(historico);
        } catch (error) {
            console.error('Erro ao listar histórico de permissões:', error);
            res.status(500).json({ error: 'Erro ao listar histórico de permissões' });
        }
    },

    // Criar usuário novo (25/07/2026 — o usuário nasce do app, não mais do sync do Conta Azul).
    // Fluxo: admin busca a pessoa no cadastro de clientes (buscar-global), seleciona e define o acesso.
    criar: async (req, res) => {
        try {
            // Só admin: criação envolve login/senha/permissões (mesma regra dos campos sensíveis do PUT)
            const isAdmin = req.user?.permissoes?.admin === true;
            if (!isAdmin) {
                return res.status(403).json({ error: 'Apenas administradores podem criar usuários.' });
            }

            const { nome, email, telefone, login, senha, clienteUuid, permissoes, percentualFlex, maxDescontoFlex, acessoExterno } = req.body;

            if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Informe o nome completo.' });
            if (!login || !String(login).trim()) return res.status(400).json({ error: 'Informe o login.' });
            if (!senha || String(senha).trim().length < 4) return res.status(400).json({ error: 'Informe uma senha com pelo menos 4 caracteres.' });

            const loginNorm = String(login).trim().toLowerCase();
            const jaExiste = await prisma.vendedor.findUnique({ where: { login: loginNorm } });
            if (jaExiste) {
                return res.status(409).json({ error: `O login "${loginNorm}" já está em uso por ${jaExiste.nome}.` });
            }

            // Vínculo com o cadastro de pessoas (opcional no backend; a tela sempre envia)
            if (clienteUuid) {
                const cadastro = await prisma.cliente.findUnique({ where: { UUID: clienteUuid }, select: { UUID: true } });
                if (!cadastro) return res.status(400).json({ error: 'Cadastro selecionado não encontrado.' });
                const jaVinculado = await prisma.vendedor.findFirst({ where: { clienteUuid }, select: { nome: true } });
                if (jaVinculado) {
                    return res.status(409).json({ error: `Este cadastro já está vinculado ao usuário ${jaVinculado.nome}.` });
                }
            }

            const salt = await bcrypt.genSalt(10);
            const senhaHash = await bcrypt.hash(String(senha).trim(), salt);

            const vendedor = await prisma.vendedor.create({
                data: {
                    id: crypto.randomUUID(), // ID próprio do app (antes vinha do Conta Azul)
                    nome: String(nome).trim(),
                    email: email || null,
                    telefone: telefone || null,
                    login: loginNorm,
                    senha: senhaHash,
                    clienteUuid: clienteUuid || null,
                    permissoes: permissoes !== undefined ? permissoes : {},
                    percentualFlex: percentualFlex !== undefined ? percentualFlex : 0,
                    maxDescontoFlex: maxDescontoFlex !== undefined ? maxDescontoFlex : 100,
                    acessoExterno: acessoExterno === true,
                    ativo: true
                }
            });

            vendedor.senha = undefined;
            res.status(201).json(vendedor);
        } catch (error) {
            console.error('Erro ao criar usuário:', error);
            res.status(500).json({ error: 'Erro ao criar usuário' });
        }
    },

    // Atualizar dados locais (Email, Flex, Permissoes, Auth)
    atualizar: async (req, res) => {
        try {
            const { id } = req.params;

            // --- SEGURANÇA: controle de acesso ---
            // Sem esta checagem, QUALQUER usuário logado podia se tornar admin ou
            // trocar a senha de qualquer pessoa. Espelha o acesso da tela "Vendedores"
            // (hasPermission('vendedores','edit')) e restringe campos sensíveis a admin.
            const perms = req.user?.permissoes || {};
            const isAdmin = perms.admin === true;
            const podeGerenciar = isAdmin
                || perms.vendedores === true
                || (perms.vendedores && perms.vendedores.edit === true);

            if (!podeGerenciar) {
                return res.status(403).json({ error: 'Sem permissão para editar usuários.' });
            }

            const { email, telefone, flexMensal, flexDisponivel, login, senha, permissoes, maxDescontoFlex, percentualFlex, ativo, formasAtendimentoVisiveis, alertaFaturamento, alertaPedidoConvertido, tabelaCobrancaFaltaId, quebraCaixa, clienteUuid, nomeVendedorBotHardt, acessoExterno } = req.body;

            // Campos sensíveis (permissões, login, senha, status) só por admin — evita
            // escalonamento de privilégio e sequestro de conta por um gestor não-admin.
            const tentouCamposSensiveis = permissoes !== undefined || login !== undefined
                || ativo !== undefined || (senha && senha.trim() !== '');
            if (tentouCamposSensiveis && !isAdmin) {
                return res.status(403).json({ error: 'Apenas administradores podem alterar permissões, login, senha ou status de usuários.' });
            }

            const dataToUpdate = {};
            if (email !== undefined) dataToUpdate.email = email;
            if (telefone !== undefined) dataToUpdate.telefone = telefone;
            if (flexMensal !== undefined) dataToUpdate.flexMensal = flexMensal;
            if (flexDisponivel !== undefined) dataToUpdate.flexDisponivel = flexDisponivel;
            if (maxDescontoFlex !== undefined) dataToUpdate.maxDescontoFlex = maxDescontoFlex;
            if (percentualFlex !== undefined) dataToUpdate.percentualFlex = percentualFlex;
            if (ativo !== undefined) dataToUpdate.ativo = ativo;
            if (login !== undefined) dataToUpdate.login = login || null;
            if (permissoes !== undefined) dataToUpdate.permissoes = permissoes;
            if (formasAtendimentoVisiveis !== undefined) dataToUpdate.formasAtendimentoVisiveis = formasAtendimentoVisiveis;
            if (alertaFaturamento !== undefined) dataToUpdate.alertaFaturamento = alertaFaturamento;
            if (alertaPedidoConvertido !== undefined) dataToUpdate.alertaPedidoConvertido = alertaPedidoConvertido;
            if (tabelaCobrancaFaltaId !== undefined) dataToUpdate.tabelaCobrancaFaltaId = tabelaCobrancaFaltaId || null;
            // Integração site ↔ Bot Hardt: acentos e espaços contam na comparação do bot,
            // então só apara as pontas — nunca "normalizar" o valor digitado.
            if (nomeVendedorBotHardt !== undefined) dataToUpdate.nomeVendedorBotHardt = String(nomeVendedorBotHardt || '').trim() || null;
            // Quebra de caixa: diferença que a pessoa fecha sozinha ao conferir o
            // dinheiro do caixa (acima disso exige senha de quem autoriza).
            // Só admin mexe — é limite de tolerância a diferença de dinheiro.
            if (quebraCaixa !== undefined) {
                if (!isAdmin) return res.status(403).json({ error: 'Apenas administradores podem definir a quebra de caixa.' });
                dataToUpdate.quebraCaixa = Math.max(0, Number(quebraCaixa) || 0);
            }

            // Acesso externo (contabilidade/parceiro): tira a pessoa de todo seletor de
            // vendedor/motorista/equipe. Só admin — muda o que a operação inteira enxerga.
            if (acessoExterno !== undefined) {
                if (!isAdmin) return res.status(403).json({ error: 'Apenas administradores podem marcar acesso externo.' });
                dataToUpdate.acessoExterno = acessoExterno === true;
            }

            // Vincular usuário antigo ao cadastro de pessoas (um cadastro por usuário)
            if (clienteUuid !== undefined) {
                if (clienteUuid) {
                    const cadastro = await prisma.cliente.findUnique({ where: { UUID: clienteUuid }, select: { UUID: true } });
                    if (!cadastro) return res.status(400).json({ error: 'Cadastro selecionado não encontrado.' });
                    const jaVinculado = await prisma.vendedor.findFirst({ where: { clienteUuid, NOT: { id } }, select: { nome: true } });
                    if (jaVinculado) {
                        return res.status(409).json({ error: `Este cadastro já está vinculado ao usuário ${jaVinculado.nome}.` });
                    }
                }
                dataToUpdate.clienteUuid = clienteUuid || null;
            }

            if (senha && senha.trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                dataToUpdate.senha = await bcrypt.hash(senha, salt);
            }

            // Histórico de permissões: captura o estado ANTES da gravação
            let permissoesAnteriores;
            if (permissoes !== undefined) {
                const atual = await prisma.vendedor.findUnique({ where: { id }, select: { permissoes: true } });
                permissoesAnteriores = atual?.permissoes ?? {};
                if (typeof permissoesAnteriores === 'string') {
                    try { permissoesAnteriores = JSON.parse(permissoesAnteriores); } catch { permissoesAnteriores = {}; }
                }
            }

            const vendedor = await prisma.vendedor.update({
                where: { id },
                data: dataToUpdate
            });

            vendedor.senha = undefined;

            res.json(vendedor);

            // Auditoria (depois da resposta, em try/catch próprio — falha aqui NUNCA desfaz o save).
            // Senha não entra: só o JSON de permissões.
            if (permissoes !== undefined) {
                try {
                    const mudou = JSON.stringify(permissoesAnteriores) !== JSON.stringify(permissoes);
                    if (mudou) {
                        await prisma.vendedorPermissoesHistorico.create({
                            data: {
                                vendedorId: id,
                                alteradoPorId: req.user?.id || null,
                                alteradoPorNome: req.user?.nome || null,
                                permissoesAntes: permissoesAnteriores,
                                permissoesDepois: permissoes
                            }
                        });
                        // Retenção: mantém as 50 versões mais recentes por usuário
                        const excedentes = await prisma.vendedorPermissoesHistorico.findMany({
                            where: { vendedorId: id },
                            orderBy: { criadoEm: 'desc' },
                            skip: 50,
                            select: { id: true }
                        });
                        if (excedentes.length) {
                            await prisma.vendedorPermissoesHistorico.deleteMany({
                                where: { id: { in: excedentes.map(e => e.id) } }
                            });
                        }
                    }
                } catch (histErr) {
                    console.error('Falha ao gravar histórico de permissões (save já efetivado):', histErr);
                }
            }
        } catch (error) {
            console.error('Erro ao atualizar vendedor:', error);
            res.status(500).json({ error: 'Erro ao atualizar vendedor' });
        }
    }
};

module.exports = vendedorController;
