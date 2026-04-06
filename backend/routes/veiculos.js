const express = require('express');
const router = express.Router();
const veiculoController = require('../controllers/veiculoController');
const authMiddleware = require('../middlewares/authMiddleware');
const uploadVeiculo = require('../middlewares/uploadVeiculoMiddleware');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Rotas públicas (para vendedores listarem ao iniciar o dia)
router.get('/', authMiddleware, veiculoController.listarAtivos);

// Alertas pendentes de manutenção (deve vir antes de /:id)
router.get('/alertas-pendentes', authMiddleware, async (req, res) => {
    try {
        const alertas = await prisma.manutencaoAlerta.findMany({
            where: { concluido: false },
            include: { veiculo: { select: { placa: true, modelo: true } } },
            orderBy: { createdAt: 'desc' }
        });

        // Buscar último km de cada veículo (do DiarioVendedor mais recente)
        const veiculoIds = [...new Set(alertas.map(a => a.veiculoId))];
        const ultimosKm = {};
        for (const vid of veiculoIds) {
            const ultimo = await prisma.diarioVendedor.findFirst({
                where: { veiculoId: vid, kmFinal: { not: null } },
                orderBy: { dataReferencia: 'desc' },
                select: { kmFinal: true }
            });
            if (ultimo) ultimosKm[vid] = ultimo.kmFinal;
        }

        const resultado = alertas.map(a => ({
            ...a,
            kmAtual: ultimosKm[a.veiculoId] || null,
            vencido: (a.kmAlerta && ultimosKm[a.veiculoId] && ultimosKm[a.veiculoId] >= a.kmAlerta) ||
                (a.dataAlerta && new Date(a.dataAlerta) <= new Date())
        }));

        res.json(resultado);
    } catch (error) {
        console.error('Erro ao buscar alertas:', error);
        res.status(500).json({ error: 'Erro ao buscar alertas de manutenção.' });
    }
});

router.get('/:id/ultimo-km', authMiddleware, veiculoController.ultimoKmFinal);
router.get('/:id/ultimo-km-abastecimento', authMiddleware, async (req, res) => {
    try {
        const veiculoService = require('../services/veiculoService');
        const dado = await veiculoService.ultimoKmAbastecimento(req.params.id);
        res.json(dado || null);
    } catch (error) {
        console.error('Erro ao buscar último KM abastecimento:', error);
        res.status(500).json({ error: 'Erro ao buscar último KM.' });
    }
});
router.get('/:id/ficha', authMiddleware, veiculoController.obterFicha);
router.get('/:id', authMiddleware, veiculoController.obterPorId);

// Rotas Administrativas (apenas quem gerencia)
router.get('/admin/todos', authMiddleware, veiculoController.listarTodos);
router.post('/', authMiddleware, veiculoController.criar);
router.put('/:id', authMiddleware, veiculoController.atualizar);
router.delete('/:id', authMiddleware, veiculoController.excluir);


// ── Autorização Manual de Uso (admin registra uso interno/avulso) ──

// Validar intervalo de KM para um veículo (verifica overlaps)
router.post('/:id/validar-km', authMiddleware, async (req, res) => {
    try {
        const { kmInicial, kmFinal } = req.body;
        if (!kmInicial || !kmFinal) return res.status(400).json({ error: 'KM inicial e final obrigatórios.' });
        if (kmFinal <= kmInicial) return res.status(400).json({ error: 'KM final deve ser maior que KM inicial.' });

        // Busca todos os registros de uso deste veículo que tenham KM
        const diarios = await prisma.diarioVendedor.findMany({
            where: {
                veiculoId: req.params.id,
                kmInicial: { not: null },
                kmFinal: { not: null }
            },
            select: { kmInicial: true, kmFinal: true, dataReferencia: true, vendedor: { select: { nome: true } } }
        });

        // Verifica se o intervalo [kmInicial, kmFinal] se sobrepõe a algum existente
        const overlap = diarios.find(d =>
            kmInicial < d.kmFinal && kmFinal > d.kmInicial
        );

        if (overlap) {
            return res.json({
                valido: false,
                mensagem: `Conflito com uso registrado: ${overlap.kmInicial} → ${overlap.kmFinal} (${overlap.vendedor?.nome || 'desconhecido'}, ${overlap.dataReferencia})`
            });
        }

        res.json({ valido: true });
    } catch (error) {
        console.error('Erro ao validar KM:', error);
        res.status(500).json({ error: 'Erro ao validar intervalo de KM.' });
    }
});

// Registrar uso manual de veículo (autorização interna)
router.post('/:id/uso-manual', authMiddleware, async (req, res) => {
    try {
        const { motoristaNome, motoristaId, dataReferencia, kmInicial, kmFinal, obs } = req.body;

        if (!dataReferencia || kmInicial === undefined || kmFinal === undefined) {
            return res.status(400).json({ error: 'Data, KM inicial e KM final são obrigatórios.' });
        }
        if (kmFinal <= kmInicial) {
            return res.status(400).json({ error: 'KM final deve ser maior que KM inicial.' });
        }

        // Validar overlap de KM
        const diarios = await prisma.diarioVendedor.findMany({
            where: {
                veiculoId: req.params.id,
                kmInicial: { not: null },
                kmFinal: { not: null }
            },
            select: { kmInicial: true, kmFinal: true }
        });

        const overlap = diarios.find(d =>
            kmInicial < d.kmFinal && kmFinal > d.kmInicial
        );

        if (overlap) {
            return res.status(400).json({
                error: `Intervalo de KM conflita com uso existente: ${overlap.kmInicial} → ${overlap.kmFinal}`
            });
        }

        // Se tem motoristaId (vendedor do sistema), usa. Senão, cria diário usando quem está logado
        const vendedorId = motoristaId || req.user.id;

        // Verifica se já tem diário nesse dia para esse vendedor
        const existente = await prisma.diarioVendedor.findFirst({
            where: { vendedorId, dataReferencia }
        });

        if (existente) {
            return res.status(400).json({
                error: `Já existe um registro de uso para este motorista na data ${dataReferencia}.`
            });
        }

        const diario = await prisma.diarioVendedor.create({
            data: {
                vendedorId,
                dataReferencia,
                modo: 'PRESENCIAL',
                veiculoId: req.params.id,
                kmInicial: parseInt(kmInicial),
                kmFinal: parseInt(kmFinal),
                obs: motoristaNome
                    ? `[Uso Interno - ${motoristaNome}] ${obs || ''}`.trim()
                    : `[Uso Interno] ${obs || ''}`.trim(),
                inicioHora: new Date(),
                fimHora: new Date()
            },
            include: { vendedor: { select: { nome: true } } }
        });

        res.status(201).json(diario);
    } catch (error) {
        console.error('Erro ao registrar uso manual:', error);
        res.status(500).json({ error: 'Erro ao registrar uso do veículo.' });
    }
});

// Registrar abastecimento manual (a partir da ficha do veículo)
router.post('/:id/abastecimento', authMiddleware, async (req, res) => {
    try {
        const { dataReferencia, litros, valor, kmNoAbastecimento, descricao, vendedorId } = req.body;

        if (!dataReferencia || !valor) {
            return res.status(400).json({ error: 'Data e valor são obrigatórios.' });
        }

        if (!kmNoAbastecimento) {
            return res.status(400).json({ error: 'KM do hodômetro é obrigatório.' });
        }

        const kmInt = parseInt(kmNoAbastecimento);

        // Validar que KM é maior que o último abastecimento (exceto admin)
        const isAdmin = req.user?.permissoes?.admin === true;
        if (!isAdmin) {
            const ultimoAbast = await prisma.despesa.findFirst({
                where: { veiculoId: req.params.id, categoria: 'COMBUSTIVEL', kmNoAbastecimento: { not: null } },
                orderBy: { kmNoAbastecimento: 'desc' },
                select: { kmNoAbastecimento: true }
            });
            if (ultimoAbast && kmInt <= ultimoAbast.kmNoAbastecimento) {
                return res.status(400).json({
                    error: `KM informado (${kmInt}) deve ser maior que o último registro (${ultimoAbast.kmNoAbastecimento}).`
                });
            }
        }

        const despesa = await prisma.despesa.create({
            data: {
                vendedorId: vendedorId || req.user.id,
                dataReferencia,
                categoria: 'COMBUSTIVEL',
                descricao: descricao || null,
                valor: parseFloat(valor),
                veiculoId: req.params.id,
                litros: litros ? parseFloat(litros) : null,
                kmNoAbastecimento: kmInt,
                criadoPor: req.user.id
            },
            include: { veiculo: { select: { placa: true, modelo: true } } }
        });

        res.status(201).json(despesa);
    } catch (error) {
        console.error('Erro ao registrar abastecimento:', error);
        res.status(500).json({ error: 'Erro ao registrar abastecimento.' });
    }
});

// Editar uso manual de veículo
router.put('/:id/uso-manual/:diarioId', authMiddleware, async (req, res) => {
    try {
        const { motoristaNome, motoristaId, dataReferencia, kmInicial, kmFinal, obs } = req.body;

        if (!dataReferencia || kmInicial === undefined || kmFinal === undefined) {
            return res.status(400).json({ error: 'Data, KM inicial e KM final são obrigatórios.' });
        }
        if (kmFinal <= kmInicial) {
            return res.status(400).json({ error: 'KM final deve ser maior que KM inicial.' });
        }

        // Validar overlap de KM (excluindo o registro atual)
        const diarios = await prisma.diarioVendedor.findMany({
            where: {
                veiculoId: req.params.id,
                id: { not: req.params.diarioId },
                kmInicial: { not: null },
                kmFinal: { not: null }
            },
            select: { kmInicial: true, kmFinal: true }
        });

        const overlap = diarios.find(d =>
            kmInicial < d.kmFinal && kmFinal > d.kmInicial
        );

        if (overlap) {
            return res.status(400).json({
                error: `Intervalo de KM conflita com uso existente: ${overlap.kmInicial} → ${overlap.kmFinal}`
            });
        }

        const vendedorId = motoristaId || req.user.id;

        const diario = await prisma.diarioVendedor.update({
            where: { id: req.params.diarioId },
            data: {
                vendedorId,
                dataReferencia,
                kmInicial: parseInt(kmInicial),
                kmFinal: parseInt(kmFinal),
                obs: motoristaNome
                    ? `[Uso Interno - ${motoristaNome}] ${obs || ''}`.trim()
                    : `[Uso Interno] ${obs || ''}`.trim(),
            },
            include: { vendedor: { select: { nome: true } } }
        });

        res.json(diario);
    } catch (error) {
        console.error('Erro ao editar uso manual:', error);
        res.status(500).json({ error: 'Erro ao editar uso do veículo.' });
    }
});

// Excluir uso manual de veículo
router.delete('/:id/uso-manual/:diarioId', authMiddleware, async (req, res) => {
    try {
        await prisma.diarioVendedor.delete({
            where: { id: req.params.diarioId }
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao excluir uso manual:', error);
        res.status(500).json({ error: 'Erro ao excluir uso do veículo.' });
    }
});

// Editar abastecimento manual
router.put('/:id/abastecimento/:despesaId', authMiddleware, async (req, res) => {
    try {
        const { dataReferencia, litros, valor, kmNoAbastecimento, descricao } = req.body;

        if (!dataReferencia || !valor) {
            return res.status(400).json({ error: 'Data e valor são obrigatórios.' });
        }

        if (!kmNoAbastecimento) {
            return res.status(400).json({ error: 'KM do hodômetro é obrigatório.' });
        }

        const kmInt = parseInt(kmNoAbastecimento);

        // Validar KM maior que último (excluindo o registro atual), exceto admin
        const isAdmin = req.user?.permissoes?.admin === true;
        if (!isAdmin) {
            const ultimoAbast = await prisma.despesa.findFirst({
                where: {
                    veiculoId: req.params.id,
                    categoria: 'COMBUSTIVEL',
                    kmNoAbastecimento: { not: null },
                    id: { not: req.params.despesaId }
                },
                orderBy: { kmNoAbastecimento: 'desc' },
                select: { kmNoAbastecimento: true }
            });
            if (ultimoAbast && kmInt <= ultimoAbast.kmNoAbastecimento) {
                return res.status(400).json({
                    error: `KM informado (${kmInt}) deve ser maior que o último registro (${ultimoAbast.kmNoAbastecimento}).`
                });
            }
        }

        const despesa = await prisma.despesa.update({
            where: { id: req.params.despesaId },
            data: {
                dataReferencia,
                descricao: descricao || null,
                valor: parseFloat(valor),
                litros: litros ? parseFloat(litros) : null,
                kmNoAbastecimento: kmInt,
            },
            include: { veiculo: { select: { placa: true, modelo: true } } }
        });

        res.json(despesa);
    } catch (error) {
        console.error('Erro ao editar abastecimento:', error);
        res.status(500).json({ error: 'Erro ao editar abastecimento.' });
    }
});

// Excluir abastecimento manual
router.delete('/:id/abastecimento/:despesaId', authMiddleware, async (req, res) => {
    try {
        await prisma.despesa.delete({
            where: { id: req.params.despesaId }
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao excluir abastecimento:', error);
        res.status(500).json({ error: 'Erro ao excluir abastecimento.' });
    }
});

// ── Manutenção de Veículos ──

// Listar alertas de um veículo
router.get('/:id/manutencao', authMiddleware, async (req, res) => {
    try {
        const alertas = await prisma.manutencaoAlerta.findMany({
            where: { veiculoId: req.params.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(alertas);
    } catch (error) {
        console.error('Erro ao listar manutenções:', error);
        res.status(500).json({ error: 'Erro ao listar manutenções.' });
    }
});

// Criar alerta de manutenção
router.post('/:id/manutencao', authMiddleware, async (req, res) => {
    try {
        const { tipo, descricao, kmAlerta, dataAlerta } = req.body;
        if (!tipo) return res.status(400).json({ error: 'Tipo de manutenção obrigatório.' });

        const alerta = await prisma.manutencaoAlerta.create({
            data: {
                veiculoId: req.params.id,
                tipo,
                descricao: descricao || null,
                kmAlerta: kmAlerta || null,
                dataAlerta: dataAlerta ? new Date(dataAlerta) : null,
                criadoPor: req.user.id
            }
        });

        res.status(201).json(alerta);
    } catch (error) {
        console.error('Erro ao criar alerta:', error);
        res.status(500).json({ error: 'Erro ao criar alerta de manutenção.' });
    }
});

// Concluir alerta de manutenção
router.patch('/manutencao/:alertaId/concluir', authMiddleware, async (req, res) => {
    try {
        const alerta = await prisma.manutencaoAlerta.update({
            where: { id: req.params.alertaId },
            data: {
                concluido: true,
                concluidoEm: new Date(),
                concluidoPor: req.user.id
            }
        });

        res.json(alerta);
    } catch (error) {
        console.error('Erro ao concluir alerta:', error);
        res.status(500).json({ error: 'Erro ao concluir alerta.' });
    }
});

// ── Upload de Documento do Veículo ──
router.post('/:id/upload-documento', authMiddleware, uploadVeiculo.single('documento'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        const filePath = `/uploads/veiculos/${req.params.id}/${req.file.filename}`;
        const veiculo = await prisma.veiculo.update({
            where: { id: req.params.id },
            data: { documentoUrl: filePath }
        });
        res.json(veiculo);
    } catch (error) {
        console.error('Erro ao fazer upload do documento:', error);
        res.status(500).json({ error: 'Erro ao salvar documento.' });
    }
});

// ── Upload de Apólice de Seguro ──
router.post('/:id/upload-apolice', authMiddleware, uploadVeiculo.single('apolice'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        const filePath = `/uploads/veiculos/${req.params.id}/${req.file.filename}`;
        const veiculo = await prisma.veiculo.update({
            where: { id: req.params.id },
            data: { seguroApoliceUrl: filePath }
        });
        res.json(veiculo);
    } catch (error) {
        console.error('Erro ao fazer upload da apólice:', error);
        res.status(500).json({ error: 'Erro ao salvar apólice.' });
    }
});

module.exports = router;
