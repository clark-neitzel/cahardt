const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const diarioController = require('../controllers/diarioController');

// Status atual do vendedor
router.get('/status', diarioController.meuStatus);

// Listar veículos em uso hoje (para bloquear no select)
router.get('/veiculos-em-uso-hoje', async (req, res) => {
    try {
        const hoje = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const dataRef = `${hoje.find(p => p.type === 'year').value}-${hoje.find(p => p.type === 'month').value}-${hoje.find(p => p.type === 'day').value}`;

        const diarios = await prisma.diarioVendedor.findMany({
            where: {
                dataReferencia: dataRef,
                modo: 'PRESENCIAL',
                veiculoId: { not: null }
            },
            include: { vendedor: { select: { nome: true } } }
        });

        res.json(diarios.map(d => ({
            veiculoId: d.veiculoId,
            motorista: d.vendedor?.nome || 'Desconhecido'
        })));
    } catch (error) {
        console.error('Erro ao listar veículos em uso:', error);
        res.json([]);
    }
});

// Checkins
router.post('/iniciar', diarioController.iniciar);
router.post('/encerrar', diarioController.encerrar);
// Home Office → pega o veículo depois (mesmo registro do dia vira PRESENCIAL)
router.post('/assumir-veiculo', diarioController.assumirVeiculo);

// Formata 'YYYY-MM-DD' -> 'dd/mm' só para mensagem de erro (mantém string do banco intacta)
function dataRefParaDDMM(dataReferencia) {
    const partes = String(dataReferencia || '').split('-');
    if (partes.length !== 3) return dataReferencia;
    return `${partes[2]}/${partes[1]}`;
}

// Admin: editar KM inicial (e opcionalmente KM final) de um diário.
// Também corrige o KM final do dia anterior do mesmo veículo quando o erro
// de digitação corrigido aqui "empurrava" o odômetro para trás.
router.put('/:id/km', async (req, res) => {
    try {
        const perms = req.user?.permissoes || {};
        if (!perms.admin) {
            return res.status(403).json({ error: 'Apenas administradores podem ajustar KM.' });
        }

        const { kmInicial, kmFinal } = req.body;
        if (kmInicial === undefined || kmInicial === null || kmInicial === '') {
            return res.status(400).json({ error: 'Informe o KM inicial.' });
        }

        // Odômetro real nunca passa de 9.999.999 km — acima disso é dígito a mais
        // (ex.: 159791567966) e o valor não cabe no INT4 do banco (vira erro 500 genérico).
        const KM_MAXIMO = 9999999;

        const novoKmInicial = parseInt(kmInicial, 10);
        if (!Number.isInteger(novoKmInicial) || novoKmInicial < 0 || String(novoKmInicial) !== String(kmInicial).trim()) {
            return res.status(400).json({ error: 'KM inicial inválido.' });
        }
        if (novoKmInicial > KM_MAXIMO) {
            return res.status(400).json({ error: 'KM inválido: valor muito grande, confira os dígitos.' });
        }

        const kmFinalInformado = kmFinal !== undefined && kmFinal !== null && kmFinal !== '';
        let novoKmFinal;
        if (kmFinalInformado) {
            novoKmFinal = parseInt(kmFinal, 10);
            if (!Number.isInteger(novoKmFinal) || String(novoKmFinal) !== String(kmFinal).trim()) {
                return res.status(400).json({ error: 'KM final inválido.' });
            }
            if (novoKmFinal > KM_MAXIMO) {
                return res.status(400).json({ error: 'KM inválido: valor muito grande, confira os dígitos.' });
            }
            if (novoKmFinal <= novoKmInicial) {
                return res.status(400).json({ error: 'KM final deve ser maior que o KM inicial.' });
            }
        }

        const diario = await prisma.diarioVendedor.findUnique({ where: { id: req.params.id } });
        if (!diario) return res.status(404).json({ error: 'Diário não encontrado.' });

        // Se kmFinal não veio no body, ele permanece como está — mas se já existir um
        // kmFinal registrado, o novo kmInicial não pode invalidá-lo.
        if (!kmFinalInformado && diario.kmFinal != null && novoKmInicial >= diario.kmFinal) {
            return res.status(400).json({
                error: `KM inicial (${novoKmInicial}) não pode ser maior ou igual ao KM final já registrado (${diario.kmFinal}). Corrija os dois juntos.`
            });
        }

        // Propagação para o diário anterior do MESMO veículo: o odômetro não anda
        // para trás, então se o fechamento anterior ficou acima do novo kmInicial
        // corrigido, é porque aquele fechamento também estava errado.
        //
        // O veículo pode ter sido usado por duas pessoas no mesmo dia (uso manual
        // pela Ficha do Veículo) — nesse caso não dá para saber qual dos dois
        // diários daquele dia é "o" anterior certo, então NENHUM é corrigido
        // automaticamente; a tela avisa e o admin corrige na Ficha do Veículo.
        let anterior = null;
        let anteriorAmbiguo = null;
        if (diario.veiculoId) {
            const maisRecente = await prisma.diarioVendedor.findFirst({
                where: {
                    veiculoId: diario.veiculoId,
                    dataReferencia: { lt: diario.dataReferencia },
                    kmFinal: { not: null }
                },
                orderBy: [{ dataReferencia: 'desc' }, { inicioHora: 'desc' }, { id: 'desc' }]
            });

            if (maisRecente) {
                const candidatosNaData = await prisma.diarioVendedor.findMany({
                    where: {
                        veiculoId: diario.veiculoId,
                        dataReferencia: maisRecente.dataReferencia,
                        kmFinal: { not: null }
                    }
                });

                if (candidatosNaData.length > 1) {
                    anteriorAmbiguo = { dataReferencia: maisRecente.dataReferencia, quantidade: candidatosNaData.length };
                } else {
                    anterior = candidatosNaData[0];
                }
            }
        }

        const precisaCorrigirAnterior = !!(anterior && anterior.kmFinal > novoKmInicial);

        if (precisaCorrigirAnterior && novoKmInicial <= anterior.kmInicial) {
            return res.status(400).json({
                error: `O KM inicial informado (${novoKmInicial}) é menor que o KM inicial do dia anterior (${dataRefParaDDMM(anterior.dataReferencia)}: ${anterior.kmInicial}). Verifique o valor.`
            });
        }

        const dadosAtualizacao = { kmInicial: novoKmInicial };
        if (kmFinalInformado) dadosAtualizacao.kmFinal = novoKmFinal;

        const [updated, anteriorAtualizado] = await prisma.$transaction(async (tx) => {
            const diarioAtualizado = await tx.diarioVendedor.update({
                where: { id: req.params.id },
                data: dadosAtualizacao
            });

            let anteriorAtt = null;
            if (precisaCorrigirAnterior) {
                anteriorAtt = await tx.diarioVendedor.update({
                    where: { id: anterior.id },
                    data: { kmFinal: novoKmInicial }
                });
            }

            return [diarioAtualizado, anteriorAtt];
        }, { timeout: 20000, maxWait: 10000 });

        const anteriorCorrigido = anteriorAtualizado ? {
            id: anterior.id,
            dataReferencia: anterior.dataReferencia,
            kmFinalAntigo: anterior.kmFinal,
            kmFinalNovo: anteriorAtualizado.kmFinal
        } : null;

        console.log(
            `[Diarios] Editar KM — usuário ${req.user?.nome || req.user?.id || '?'} (${req.user?.id || '?'})`,
            `diario=${diario.id} veiculo=${diario.veiculoId || '-'}`,
            `kmInicial ${diario.kmInicial} -> ${updated.kmInicial}`,
            `kmFinal ${diario.kmFinal} -> ${updated.kmFinal}`,
            anteriorCorrigido
                ? `| propagou p/ diário anterior ${anteriorCorrigido.id} (${anteriorCorrigido.dataReferencia}): kmFinal ${anteriorCorrigido.kmFinalAntigo} -> ${anteriorCorrigido.kmFinalNovo}`
                : anteriorAmbiguo
                    ? `| NÃO propagou — ${anteriorAmbiguo.quantidade} diários do veículo em ${anteriorAmbiguo.dataReferencia}, ambíguo`
                    : '| sem propagação'
        );

        res.json({ ...updated, anteriorCorrigido, anteriorAmbiguo });
    } catch (error) {
        console.error('Erro ao editar KM:', error);
        res.status(500).json({ error: 'Erro ao editar KM.' });
    }
});

// Admin: deletar diário do dia para permitir re-inicio (ex: motorista escolheu modo errado)
router.delete('/:id', async (req, res) => {
    try {
        const perms = req.user?.permissoes || {};
        if (!perms.admin) {
            return res.status(403).json({ error: 'Apenas administradores podem reiniciar o diário.' });
        }

        const diario = await prisma.diarioVendedor.findUnique({ where: { id: req.params.id } });
        if (!diario) return res.status(404).json({ error: 'Diário não encontrado.' });

        await prisma.diarioVendedor.delete({ where: { id: req.params.id } });

        res.json({ ok: true, message: 'Diário removido. O vendedor poderá iniciar novamente.' });
    } catch (error) {
        console.error('Erro ao deletar diário:', error);
        res.status(500).json({ error: 'Erro ao reiniciar diário.' });
    }
});

module.exports = router;
