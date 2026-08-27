/**
 * Fornecedores — Fase 1 do módulo financeiro (Contas a Pagar).
 *
 * Permissões:
 *   ver              → admin ou Pode_Acessar_Fornecedores
 *   escrever/importar → admin ou Pode_Editar_Fornecedores
 */

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { normalizarCidade } = require('../utils/cidade'); // grafia oficial da cidade (Fase 1)
const verificarAuth = require('../middlewares/authMiddleware');
const contasPagarCaSyncService = require('../services/contasPagarCaSyncService');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkAcesso = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Acessar_Fornecedores) {
        return res.status(403).json({ error: 'Sem permissão para acessar fornecedores.' });
    }
    next();
};

const checkEscrita = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Editar_Fornecedores) {
        return res.status(403).json({ error: 'Sem permissão para editar fornecedores.' });
    }
    next();
};

// Documento preserva letras (CNPJ ALFANUMÉRICO) e valida DV — módulo único.
const { normalizarDoc, validarDoc } = require('../utils/documento');
const normDoc = (v) => normalizarDoc(v) || null;

// ── GET /?busca= — listar ──
router.get('/', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { busca } = req.query;
        const where = {};
        if (busca) {
            where.OR = [
                { razaoSocial: { contains: busca, mode: 'insensitive' } },
                { nomeFantasia: { contains: busca, mode: 'insensitive' } },
                { cnpjCpf: { contains: normDoc(busca) || busca } }
            ];
        }
        const fornecedores = await prisma.fornecedor.findMany({
            where,
            orderBy: { razaoSocial: 'asc' }
        });
        res.json(fornecedores);
    } catch (error) {
        console.error('Erro ao listar fornecedores:', error);
        res.status(500).json({ error: 'Erro ao listar fornecedores.' });
    }
});

// ── POST / — criar (entra na fila de envio ao CA) ──
router.post('/', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const {
            cnpjCpf, razaoSocial, nomeFantasia, inscricaoEstadual,
            email, telefone, cidade, uf, observacoes, ativo
        } = req.body;

        if (!razaoSocial?.trim()) return res.status(400).json({ error: 'Informe a razão social.' });

        const doc = normDoc(cnpjCpf);
        if (doc && !validarDoc(doc)) {
            return res.status(400).json({ error: 'CNPJ/CPF inválido — confira o número (o dígito verificador não bate).' });
        }
        if (doc) {
            const duplicado = await prisma.fornecedor.findFirst({ where: { cnpjCpf: doc } });
            if (duplicado) return res.status(400).json({ error: `Já existe um fornecedor com este documento: ${duplicado.razaoSocial}.` });
        }

        const fornecedor = await prisma.fornecedor.create({
            data: {
                cnpjCpf: doc,
                razaoSocial: razaoSocial.trim(),
                nomeFantasia: nomeFantasia?.trim() || null,
                inscricaoEstadual: inscricaoEstadual?.trim() || null,
                email: email?.trim() || null,
                telefone: telefone?.trim() || null,
                cidade: normalizarCidade(cidade),
                uf: uf?.trim()?.toUpperCase()?.substring(0, 2) || null,
                observacoes: observacoes?.trim() || null,
                ativo: ativo !== false,
                origem: 'APP',
                statusEnvioCA: 'ENVIAR' // worker envia ao CA em até 60s
            }
        });
        res.status(201).json(fornecedor);
    } catch (error) {
        console.error('Erro ao criar fornecedor:', error);
        res.status(500).json({ error: 'Erro ao criar fornecedor.' });
    }
});

// ── PUT /:id — editar ──
router.put('/:id', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const fornecedor = await prisma.fornecedor.findUnique({ where: { id: req.params.id } });
        if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado.' });

        const {
            cnpjCpf, razaoSocial, nomeFantasia, inscricaoEstadual,
            email, telefone, cidade, uf, observacoes, ativo
        } = req.body;

        const data = {};
        if (razaoSocial !== undefined) {
            if (!razaoSocial?.trim()) return res.status(400).json({ error: 'Razão social não pode ficar vazia.' });
            data.razaoSocial = razaoSocial.trim();
        }
        if (cnpjCpf !== undefined) {
            const doc = normDoc(cnpjCpf);
            if (doc && !validarDoc(doc)) {
                return res.status(400).json({ error: 'CNPJ/CPF inválido — confira o número (o dígito verificador não bate).' });
            }
            if (doc && doc !== fornecedor.cnpjCpf) {
                const duplicado = await prisma.fornecedor.findFirst({ where: { cnpjCpf: doc, id: { not: fornecedor.id } } });
                if (duplicado) return res.status(400).json({ error: `Já existe um fornecedor com este documento: ${duplicado.razaoSocial}.` });
            }
            data.cnpjCpf = doc;
        }
        if (nomeFantasia !== undefined) data.nomeFantasia = nomeFantasia?.trim() || null;
        if (inscricaoEstadual !== undefined) data.inscricaoEstadual = inscricaoEstadual?.trim() || null;
        if (email !== undefined) data.email = email?.trim() || null;
        if (telefone !== undefined) data.telefone = telefone?.trim() || null;
        if (cidade !== undefined) data.cidade = normalizarCidade(cidade);
        if (uf !== undefined) data.uf = uf?.trim()?.toUpperCase()?.substring(0, 2) || null;
        if (observacoes !== undefined) data.observacoes = observacoes?.trim() || null;
        if (ativo !== undefined) data.ativo = ativo !== false;

        // Se tinha dado erro no envio ao CA, uma edição recoloca na fila
        if (fornecedor.statusEnvioCA === 'ERRO') {
            data.statusEnvioCA = 'ENVIAR';
            data.erroEnvioCA = null;
        }

        const atualizado = await prisma.fornecedor.update({ where: { id: fornecedor.id }, data });
        res.json(atualizado);
    } catch (error) {
        console.error('Erro ao editar fornecedor:', error);
        res.status(500).json({ error: 'Erro ao editar fornecedor.' });
    }
});

// ── POST /:id/excluir — exclui um fornecedor. Se tiver despesas/notas ligadas, exige
// um fornecedor de DESTINO (mesmo CNPJ) e MESCLA (repontar) tudo nele antes de excluir. ──
router.post('/:id/excluir', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const { mesclarComId } = req.body || {};
        const fornecedor = await prisma.fornecedor.findUnique({
            where: { id: req.params.id },
            include: { _count: { select: { contasPagar: true, notasEntrada: true } } }
        });
        if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado.' });

        const nContas = fornecedor._count?.contasPagar || 0;
        const nNotas = fornecedor._count?.notasEntrada || 0;
        const refs = nContas + nNotas;

        // Sem nada ligado → exclui direto.
        if (refs === 0) {
            await prisma.fornecedor.delete({ where: { id: fornecedor.id } });
            return res.json({ message: 'Fornecedor excluído.' });
        }

        // Tem vínculos → precisa mesclar num destino.
        if (!mesclarComId) {
            return res.status(409).json({
                error: `Este fornecedor tem ${nContas} despesa(s) e ${nNotas} nota(s) ligadas. Escolha o fornecedor que fica para mesclar.`,
                precisaMesclar: true, contas: nContas, notas: nNotas
            });
        }
        if (mesclarComId === fornecedor.id) {
            return res.status(400).json({ error: 'Não é possível mesclar um fornecedor com ele mesmo.' });
        }
        const destino = await prisma.fornecedor.findUnique({ where: { id: mesclarComId } });
        if (!destino) return res.status(404).json({ error: 'Fornecedor de destino não encontrado.' });
        if (fornecedor.cnpjCpf && destino.cnpjCpf && fornecedor.cnpjCpf !== destino.cnpjCpf) {
            return res.status(400).json({ error: 'Só dá para mesclar fornecedores com o mesmo CNPJ/CPF.' });
        }

        await prisma.$transaction([
            prisma.contaPagar.updateMany({ where: { fornecedorId: fornecedor.id }, data: { fornecedorId: destino.id } }),
            prisma.notaEntrada.updateMany({ where: { fornecedorId: fornecedor.id }, data: { fornecedorId: destino.id } }),
            prisma.fornecedor.delete({ where: { id: fornecedor.id } })
        ]);

        res.json({ message: `Mesclado em "${destino.razaoSocial}" e excluído (${refs} vínculo(s) movido(s)).` });
    } catch (error) {
        console.error('Erro ao excluir/mesclar fornecedor:', error);
        res.status(500).json({ error: 'Erro ao excluir o fornecedor.' });
    }
});

// ── POST /:id/cadastro-pessoa — cria (ou devolve) o cadastro de pessoa deste fornecedor ──
// Usado pelo "Novo Usuário"/"Vincular cadastro" da tela de Usuários: usuário só se vincula a
// um cadastro de pessoa (tabela clientes), e fornecedor importado do CA não tem um. Cria a
// pessoa DESATIVADA para vendas (Ativo=false, perfil FORNECEDOR) — padrão "só fornecedor":
// não aparece em rota, pedido nem catálogo. Idempotente pelo documento.
router.post('/:id/cadastro-pessoa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const fornecedor = await prisma.fornecedor.findUnique({ where: { id: req.params.id } });
        if (!fornecedor) return res.status(404).json({ error: 'Fornecedor não encontrado.' });

        if (fornecedor.cnpjCpf) {
            const existente = await prisma.cliente.findUnique({ where: { Documento: fornecedor.cnpjCpf } });
            if (existente) return res.json({ cliente: existente, jaExistia: true });
        }

        const [{ max }] = await prisma.$queryRaw`
            SELECT COALESCE(MAX(NULLIF(regexp_replace("Codigo", '[^0-9]', '', 'g'), '')::bigint), 0) AS max
            FROM clientes`;

        // ── Endereço herdado do fornecedor: ESTE É UM PONTO DE ESCRITA EM `clientes` ──
        // O fornecedor pode ser LEGADO (importado do CA antes da Fase 1), e aí `cidade`/`uf`
        // vêm sujos — é por aqui que a grafia errada nasceria em `clientes`, que é exatamente
        // o que a Fase 1 existe para impedir. `GET /api/cidades` lê `clientes` sem filtrar
        // `Ativo`, então a sujeira reapareceria no dropdown mesmo com o cadastro desativado.
        const cidadeCliente = normalizarCidade(fornecedor.cidade);

        // UF: mesmo tratamento das rotas de fornecedor acima (trim + MAIÚSCULO, 2 letras),
        // com uma trava a mais. `Fornecedor.uf` é `text` livre e o worker do CA grava POR
        // EXTENSO ("SANTA CATARINA" — contasPagarCaSyncService.js, dívida pré-existente já
        // registrada para o dono decidir). `clientes.End_Estado` é sempre a sigla de 2 letras
        // (é o que `clienteController` grava e o que `validarIe(ie, uf)` e o catálogo esperam).
        // Cortar em 2 sem conferir daria "SA" — uma UF FALSA que parece válida e quebra a
        // validação de IE em silêncio. Só aceita o que já é sigla; o resto vira null, e o
        // usuário completa o endereço na tela do cliente.
        const ufBruta = String(fornecedor.uf || '').trim().toUpperCase();
        const ufCliente = /^[A-Z]{2}$/.test(ufBruta) ? ufBruta : null;

        const cliente = await prisma.cliente.create({
            data: {
                Codigo: String(Number(max) + 1),
                Nome: fornecedor.razaoSocial,
                NomeFantasia: fornecedor.nomeFantasia || null,
                Documento: fornecedor.cnpjCpf || null,
                Tipo_Pessoa: fornecedor.cnpjCpf ? (fornecedor.cnpjCpf.length === 11 ? 'FISICA' : 'JURIDICA') : null,
                Email: fornecedor.email || null,
                Telefone: fornecedor.telefone || null,
                End_Cidade: cidadeCliente,
                End_Estado: ufCliente,
                Ativo: false, // só fornecedor: fora das telas de venda
                Perfis: JSON.stringify([{ perfil: 'FORNECEDOR' }]),
                Data_Criacao: new Date()
            }
        });
        res.status(201).json({ cliente });
    } catch (error) {
        console.error('Erro ao criar cadastro de pessoa do fornecedor:', error);
        res.status(500).json({ error: 'Erro ao criar o cadastro de pessoa do fornecedor.' });
    }
});

// ── POST /importar-ca — importa fornecedores do Conta Azul (paginado, upsert) ──
router.post('/importar-ca', verificarAuth, checkEscrita, async (req, res) => {
    try {
        const resultado = await contasPagarCaSyncService.importarFornecedoresCA();
        res.json({
            message: `Importação concluída: ${resultado.importados} novo(s), ${resultado.atualizados} atualizado(s).`,
            ...resultado
        });
    } catch (error) {
        console.error('Erro ao importar fornecedores do CA:', error?.response?.data || error);
        res.status(500).json({ error: error.message || 'Erro ao importar fornecedores do Conta Azul.' });
    }
});

module.exports = router;
