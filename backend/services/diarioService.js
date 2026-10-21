const prisma = require('../config/database');
// Função auxiliar para pegar data no formato YYYY-MM-DD baseado no horário de Brasília
// (extraída para backend/utils/dataReferenciaBrasilia.js — reaproveitada por outros
// services, ex.: atendimentoService.buscarPendenciasRota).
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');

// ── Checklist por foto (Dia 1) ──────────────────────────────────────────
// Nada aqui pode barrar o início do dia: qualquer falha só loga.
async function derivarChecklist(checklistId, vendedorId, veiculoId, checklistDoCorpo) {
    try {
        const r = await require('./checklistVeiculoService').resumoParaDiario({ checklistId, vendedorId, veiculoId });
        if (r.ok) return r.resumo;
        console.warn(`[Diario] checklistId ignorado (${r.motivo}): ${checklistId}`);
    } catch (e) {
        console.error('[Diario] falha ao derivar checklist por foto:', e.message);
    }
    return checklistDoCorpo || {};
}

async function amarrarChecklist(checklistId, diarioId, vendedorId, veiculoId) {
    try {
        const svc = require('./checklistVeiculoService');
        const ok = await svc.amarrarAoDiario(String(checklistId), diarioId, vendedorId, veiculoId);
        if (!ok) console.warn(`[Diario] checklist ${checklistId} NÃO amarrado ao diário ${diarioId} (outro dono/veículo, já amarrado ou não é rascunho)`);
    } catch (e) {
        console.error('[Diario] falha ao amarrar checklist ao diário (dia já aberto):', e.message);
    }
}

const diarioService = {
    // 1. Validar Status Atual do Usuário (Se ele tem que fechar o dia anterior, ou se já abriu hoje)
    statusDoDia: async (vendedorId) => {
        const hojeDateRef = getDataReferencia();

        // Checar se ele já preencheu HOJE
        const diarioHoje = await prisma.diarioVendedor.findFirst({
            where: {
                vendedorId,
                dataReferencia: hojeDateRef
            },
            include: { veiculo: true }
        });

        // Checar se ele deixou pendência ONTEM (ou último dia presencial sem KM Final)
        const ultimoDiarioPresencial = await prisma.diarioVendedor.findFirst({
            where: {
                vendedorId,
                modo: 'PRESENCIAL',
                kmFinal: null, // não informou o KM final
                dataReferencia: { not: hojeDateRef } // que não seja hoje
            },
            orderBy: { dataReferencia: 'desc' },
            include: { veiculo: true }
        });

        // Dia 3 (aditivo): dia anterior sem foto da volta. Nunca lança nem atrasa a abertura do dia.
        let pendenciaVolta = null;
        try {
            pendenciaVolta = await require('./checklistPendenciasService').pendenciaVoltaDoMotorista(vendedorId);
        } catch (e) {
            console.error('[Diario] pendenciaVolta indisponível:', e.message);
        }

        return {
            hojeStatus: diarioHoje ? 'iniciado' : 'nao_iniciado',
            diarioHoje,
            pendenciaAnterior: ultimoDiarioPresencial ? true : false,
            diarioPendente: ultimoDiarioPresencial,
            pendenciaVolta
        };
    },

    // 2. Iniciar o dia
    // `permissoes` vem do req.user do controller (objeto já parseado pelo authMiddleware) —
    // só serve para a isenção admin/Isento_Ponto da trava de pendência de rota abaixo.
    iniciarDia: async (vendedorId, dados, permissoes) => {
        const { modo, veiculoId, kmInicial, obs } = dados;
        let { checklist } = dados;
        const checklistId = dados.checklistId || null;
        const hojeDateRef = getDataReferencia();

        // Bloqueia duplo check-in
        const existente = await prisma.diarioVendedor.findFirst({
            where: { vendedorId, dataReferencia: hojeDateRef }
        });
        if (existente) {
            throw new Error('O dia de hoje já foi iniciado.');
        }

        // Bloqueia ignorar pendência de KM
        const status = await diarioService.statusDoDia(vendedorId);
        if (status.pendenciaAnterior) {
            throw new Error('Você precisa informar o KM final do seu último dia de trabalho Presencial antes de iniciar outro!');
        }

        // Bloqueia início do dia com cliente da rota do dia útil anterior sem atendimento
        // (antes só o frontend barrava — PendenciaRotaGateway.jsx — dava para contornar
        // chamando a API direto). Mesma isenção do frontend: admin ou Isento_Ponto.
        // Require tardio (dentro da função, igual a outros pontos do arquivo) para não
        // criar dependência circular caso atendimentoService algum dia precise de diarioService.
        const permsNorm = typeof permissoes === 'string'
            ? (() => { try { return JSON.parse(permissoes); } catch { return {}; } })()
            : (permissoes || {});
        const isento = !!(permsNorm.admin || permsNorm.Isento_Ponto);
        if (!isento) {
            const atendimentoService = require('./atendimentoService');
            const pendencia = await atendimentoService.buscarPendenciasRota(vendedorId);
            if (pendencia?.pendente && pendencia.diaPendente) {
                const dia = pendencia.diaPendente;
                const dataFormatada = new Date(`${dia.data}T12:00:00`).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit'
                });
                const erro = new Error(
                    `Você tem ${dia.pendentes} cliente(s) da rota de ${dataFormatada} sem atendimento. ` +
                    `Registre o atendimento (ou 'Sem resposta / Ausente') antes de iniciar o dia.`
                );
                erro.codigo = 'PENDENCIA_ROTA';
                throw erro;
            }
        }

        // Valida modo Presencial
        if (modo === 'PRESENCIAL') {
            // Checklist por foto: deriva o resumo compatível (*Ok). checklistId inválido NÃO barra o dia:
            // loga e segue com o `checklist` do corpo (ou {}). Payload antigo (só `checklist`) segue igual.
            if (checklistId) checklist = await derivarChecklist(checklistId, vendedorId, veiculoId, checklist);
            if (!veiculoId || kmInicial === undefined || kmInicial === null || !checklist) {
                throw new Error('Para o modo presencial, informe Veículo, KM Inicial e Checklist.');
            }

            // Bloqueia veículo já em uso por outro motorista hoje
            const veiculoEmUso = await prisma.diarioVendedor.findFirst({
                where: {
                    veiculoId,
                    dataReferencia: hojeDateRef,
                    vendedorId: { not: vendedorId }
                },
                include: { vendedor: { select: { nome: true } } }
            });
            if (veiculoEmUso) {
                throw new Error(`Este veículo já está sendo usado hoje por ${veiculoEmUso.vendedor?.nome || 'outro motorista'}.`);
            }
        }

        const diarioCriado = await prisma.diarioVendedor.create({
            data: {
                vendedorId,
                dataReferencia: hojeDateRef,
                modo,
                veiculoId: modo === 'PRESENCIAL' ? veiculoId : null,
                kmInicial: modo === 'PRESENCIAL' ? kmInicial : null,
                checklist: modo === 'PRESENCIAL' ? checklist : null,
                obs: obs || null,
                inicioHora: new Date()
            }
        });
        if (modo === 'PRESENCIAL' && checklistId) await amarrarChecklist(checklistId, diarioCriado.id, vendedorId, veiculoId);
        return diarioCriado;
    },

    // 2b. Pegar o veículo DEPOIS de ter iniciado o dia em Home Office
    // (motorista abre o app em casa, chega na empresa e só então assume o carro).
    // Converte o MESMO registro do dia para PRESENCIAL — todos os relatórios que
    // olham `modo === 'PRESENCIAL' && veiculoId` (Caixa, Veículos) passam a enxergá-lo.
    assumirVeiculo: async (vendedorId, dados) => {
        const { veiculoId, kmInicial, obs } = dados;
        let { checklist } = dados;
        const checklistId = dados.checklistId || null;
        const hojeDateRef = getDataReferencia();

        const diarioHoje = await prisma.diarioVendedor.findFirst({
            where: { vendedorId, dataReferencia: hojeDateRef }
        });
        if (!diarioHoje) throw new Error('Você ainda não iniciou o dia de hoje.');
        if (diarioHoje.modo === 'PRESENCIAL' && diarioHoje.veiculoId) {
            throw new Error('Você já está com um veículo hoje. Encerre o expediente antes de pegar outro.');
        }

        if (checklistId) checklist = await derivarChecklist(checklistId, vendedorId, veiculoId, checklist);

        if (!veiculoId || kmInicial === undefined || kmInicial === null || !checklist) {
            throw new Error('Informe Veículo, KM Inicial e Checklist.');
        }

        const veiculoEmUso = await prisma.diarioVendedor.findFirst({
            where: {
                veiculoId,
                dataReferencia: hojeDateRef,
                vendedorId: { not: vendedorId }
            },
            include: { vendedor: { select: { nome: true } } }
        });
        if (veiculoEmUso) {
            throw new Error(`Este veículo já está sendo usado hoje por ${veiculoEmUso.vendedor?.nome || 'outro motorista'}.`);
        }

        const hora = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit'
        }).format(new Date());
        let novaObs = diarioHoje.obs || '';
        novaObs += `${novaObs ? '\n' : ''}[Começou em Home Office — pegou o veículo às ${hora}]`;
        if (obs) novaObs += `\n${obs}`;

        const diarioAtualizado = await prisma.diarioVendedor.update({
            where: { id: diarioHoje.id },
            data: {
                modo: 'PRESENCIAL',
                veiculoId,
                kmInicial,
                checklist,
                obs: novaObs
            },
            include: { veiculo: true }
        });
        if (checklistId) await amarrarChecklist(checklistId, diarioAtualizado.id, vendedorId, veiculoId);
        return diarioAtualizado;
    },

    // 3. Finalizar o dia/Pendência
    // Com `checklistId` (foto de volta, Dia 3) o SERVIDOR decide o KM: se o motorista confirmou o painel, vale o KM lido
    // pela IA. Sem checklistId (ou checklist inválido) vale o KM digitado (D11: sempre dá para encerrar o dia).
    // Idempotente: se o diário já tem KM final, devolve o registro atual (repetir não sobrescreve KM nem observação).
    encerrarDia: async (vendedorId, dados) => {
        const { diarioId, kmFinal, obsFinal, checklistId } = dados;

        const diario = await prisma.diarioVendedor.findUnique({
            where: { id: diarioId, vendedorId } // Protegido pelo vendedor
        });

        if (!diario) throw new Error('Diário não encontrado.');
        if (diario.modo !== 'PRESENCIAL') throw new Error('Apenas o modo presencial exige fechamento com KM.');

        // Foto de volta informada: só vale se for do próprio motorista, deste diário, momento VOLTA.
        let volta = null;
        if (checklistId) {
            try {
                const c = await prisma.checklistVeiculo.findUnique({ where: { id: String(checklistId) } });
                if (c && c.vendedorId === vendedorId && c.diarioId === diario.id && c.momento === 'VOLTA'
                    && (c.status === 'RASCUNHO' || c.status === 'CONCLUIDO')) {
                    volta = c;
                } else {
                    console.warn(`[Diario] checklistId de volta ignorado (outro dono/diário/momento): ${checklistId}`);
                }
            } catch (e) {
                console.error('[Diario] falha ao ler checklist de volta (segue com KM digitado):', e.message);
            }
        }

        // Já encerrado: não regrava KM/observação. Se veio uma volta válida ainda aberta, só conclui o checklist
        // (é assim que o motorista resolve depois uma pendência de "volta sem foto").
        if (diario.kmFinal !== null && diario.kmFinal !== undefined) {
            if (volta && volta.status === 'RASCUNHO') {
                await prisma.checklistVeiculo.updateMany({
                    where: { id: volta.id, status: 'RASCUNHO' },
                    data: { status: 'CONCLUIDO', concluidoEm: new Date() },
                });
            }
            return diario;
        }

        let km = kmFinal;
        let kmOrigemPainel = false;
        if (volta && volta.kmOrigem === 'PAINEL_CONFIRMADO' && volta.kmLido != null) {
            // Painel confirmado: o servidor usa o KM lido; o digitado (se vier) só pode diferir até a tolerância.
            const tol = require('./checklistVeiculoService').REGRAS.kmOk;
            if (km !== undefined && km !== null && km !== '' && Math.abs(Number(km) - volta.kmLido) > tol) {
                const err = new Error(`O KM que você mandou (${Number(km).toLocaleString('pt-BR')}) não bate com o painel da foto (${volta.kmLido.toLocaleString('pt-BR')}). Confere o painel.`);
                err.codigo = 'KM_DIVERGE_DO_PAINEL';
                throw err;
            }
            km = volta.kmLido;
            kmOrigemPainel = true;
        }

        if (km === undefined || km === null || km === '') {
            throw new Error('Informe a quilometragem final do veículo.');
        }
        km = Number(km);
        if (!Number.isInteger(km) || km < 0 || km > 9999999) {
            throw new Error('Quilometragem final inválida. Confere os números.');
        }

        if (km < diario.kmInicial) {
            throw new Error('A quilometragem final não pode ser menor que a inicial.');
        }

        let novaObs = diario.obs || '';
        if (obsFinal) {
            novaObs += `\n[Fim do Dia]: ${obsFinal}`;
        }

        // Atômico: KM final + conclusão da volta andam juntos (só banco; sem IA/WhatsApp aqui dentro)
        const atualizado = await prisma.$transaction(async (tx) => {
            const d = await tx.diarioVendedor.update({
                where: { id: diarioId },
                data: { kmFinal: km, fimHora: new Date(), obs: novaObs },
            });
            if (volta && volta.status === 'RASCUNHO') {
                await tx.checklistVeiculo.updateMany({
                    where: { id: volta.id, status: 'RASCUNHO' },
                    data: { status: 'CONCLUIDO', concluidoEm: new Date(), ...(kmOrigemPainel ? {} : { kmDigitado: km }) },
                });
            }
            return d;
        }, { timeout: 20000, maxWait: 10000 });
        return atualizado;
    }
};

module.exports = diarioService;
