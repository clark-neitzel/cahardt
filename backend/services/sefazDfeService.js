/**
 * SEFAZ — Distribuição de DF-e (Fase 2 do módulo financeiro).
 *
 * Captura automaticamente as NF-e emitidas CONTRA o CNPJ do certificado ativo:
 *   1. consultaUltNSU em loop (lotes de ~50 docs) até ultNSU == maxNSU;
 *   2. resNFe (resumo)  → NotaEntrada status AGUARDANDO_XML;
 *   3. procNFe (completo) → salva XML em uploads/notas-xml/, NotaEntrada → NOVA
 *      + itens + duplicatas (dedup total: rodar 2x não duplica);
 *   4. eventos de cancelamento (110111) → status CANCELADA_EMITENTE;
 *   5. Manifestação "Ciência da Operação" (210210) em lote — é ela que libera o
 *      XML completo nas consultas seguintes.
 *
 * Regras operacionais:
 *   - cStat 137 = nenhum documento → normal, encerra o ciclo;
 *   - cStat 656 = consumo indevido → bloqueia novas consultas por 1h15;
 *   - toggle AppConfig `captura_nfe_ativa` (default ligada) e certificado ativo
 *     são pré-requisitos — sem eles o worker pula silenciosamente;
 *   - tpAmb=1 (produção), cUFAutor=42 (SC);
 *   - documentos onde o NOSSO CNPJ é o emitente são ignorados (nossas notas).
 *
 * 100% isolado: try/catch total — erro aqui JAMAIS derruba o servidor.
 * O parse do XML é função pura exportada (testável offline, sem SEFAZ).
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const { XMLParser } = require('fast-xml-parser');

const XML_DIR = path.join(__dirname, '..', 'uploads', 'notas-xml');
const DFE_ID = 'dfe';                    // singleton DfeControle
const BLOQUEIO_656_MS = 75 * 60 * 1000;  // 1h15
const INTERVALO_MANUAL_MS = 61 * 60 * 1000; // piso: nunca consultar antes de ~1h (regra SEFAZ — evita o cStat 656)
const INTERVALO_AUTO_PADRAO_H = 3;          // cadência automática padrão (horas); configurável em app_configs.sefaz_intervalo_horas
const MAX_ITERACOES = 30;                // ~50 docs por lote → até 1500 docs/ciclo
const CUF_AUTOR = '42';                  // SC
const TP_AMB = '1';                      // produção

// ─────────────────────────────────────────────────────────────
// Parse (funções puras — sem banco, sem rede)
// ─────────────────────────────────────────────────────────────

const _parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,   // mantém tudo string (preserva zeros à esquerda de cProd/cEAN)
    trimValues: true
});

const toArray = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]));
// CNPJ ALFANUMÉRICO (NT 2026.004): CNPJ do emitente/destinatário e a CHAVE de 44 posições
// podem conter letras. normalizarDoc preserva letras; soDigitos fica só p/ CEP e NSU (numéricos).
const { normalizarDoc, normalizarChaveNFe } = require('../utils/documento');
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const numOuNull = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const dataOuNull = (v) => {
    if (!v) return null;
    // dhEmi vem com timezone (2026-07-01T08:30:00-03:00); dEmi legado só data
    const s = String(v);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00-03:00`) : new Date(s);
    return isNaN(d.getTime()) ? null : d;
};
const eanOuNull = (v) => {
    const s = String(v || '').trim();
    if (!s || /SEM\s*GTIN/i.test(s)) return null;
    return s;
};

/**
 * Parse do XML completo da NF-e (procNFe/nfeProc ou NFe solta).
 * Função PURA — recebe a string do XML e devolve os dados estruturados.
 */
function parseProcNFe(xmlString) {
    const doc = _parser.parse(xmlString);
    const raiz = doc.nfeProc || doc.procNFe || doc;
    const nfe = raiz.NFe || doc.NFe;
    if (!nfe?.infNFe) throw new Error('XML não contém infNFe (não é uma NF-e válida).');
    const inf = nfe.infNFe;

    // Chave: preferir o protocolo; fallback: atributo Id ("NFe<44 posições>").
    // A chave pode ser alfanumérica (emitente com CNPJ alfanumérico) — preservar letras.
    const chaveProt = raiz.protNFe?.infProt?.chNFe;
    const chaveId = normalizarChaveNFe(String(inf['@_Id'] || '').replace(/^NFe/i, ''));
    const chave = normalizarChaveNFe(chaveProt) || chaveId;

    const ide = inf.ide || {};
    const emit = inf.emit || {};
    const dest = inf.dest || {};
    const total = inf.total?.ICMSTot || {};

    const itens = toArray(inf.det).map((det, idx) => {
        const prod = det?.prod || {};
        return {
            numeroItem: Number(det?.['@_nItem']) || idx + 1,
            codigoFornecedor: String(prod.cProd ?? '').trim() || String(idx + 1),
            ean: eanOuNull(prod.cEAN),
            descricao: String(prod.xProd ?? '').trim() || 'Item sem descrição',
            ncm: prod.NCM ? String(prod.NCM).trim() : null,
            unidade: String(prod.uCom ?? 'UN').trim() || 'UN',
            quantidade: numOuNull(prod.qCom) ?? 0,
            valorUnitario: numOuNull(prod.vUnCom) ?? 0,
            valorTotal: numOuNull(prod.vProd) ?? 0,
            cfop: prod.CFOP ? String(prod.CFOP).trim() : null,
            infAdProd: det?.infAdProd ? String(det.infAdProd).trim() || null : null
        };
    });

    const duplicatas = toArray(inf.cobr?.dup)
        .map((dup) => ({
            numero: dup?.nDup ? String(dup.nDup).trim() : null,
            vencimento: dataOuNull(dup?.dVenc),
            valor: numOuNull(dup?.vDup)
        }))
        .filter((d) => d.vencimento && d.valor != null);

    const ender = emit.enderEmit || {};
    const enderDest = dest.enderDest || {};
    const infCpl = inf.infAdic?.infCpl != null ? String(inf.infAdic.infCpl).trim() || null : null;

    return {
        chave,
        numero: ide.nNF ? String(ide.nNF) : null,
        serie: ide.serie != null ? String(ide.serie) : null,
        emissao: dataOuNull(ide.dhEmi || ide.dEmi),
        naturezaOperacao: ide.natOp ? String(ide.natOp).trim() : null,
        valorTotal: numOuNull(total.vNF),
        valorProdutos: numOuNull(total.vProd),
        valorFrete: numOuNull(total.vFrete),
        valorDesconto: numOuNull(total.vDesc),
        infComplementar: infCpl,
        emitente: {
            cnpj: normalizarDoc(emit.CNPJ || emit.CPF),
            nome: String(emit.xNome ?? '').trim() || 'Emitente desconhecido',
            fantasia: emit.xFant ? String(emit.xFant).trim() : null,
            ie: emit.IE ? String(emit.IE) : null,
            uf: ender.UF || null,
            municipio: ender.xMun || null,
            logradouro: ender.xLgr ? String(ender.xLgr).trim() : null,
            numero: ender.nro != null ? String(ender.nro).trim() : null,
            bairro: ender.xBairro ? String(ender.xBairro).trim() : null,
            cep: ender.CEP ? soDigitos(ender.CEP) : null,
            telefone: ender.fone ? String(ender.fone).trim() : null
        },
        destinatario: {
            cnpj: normalizarDoc(dest.CNPJ || dest.CPF) || null,
            nome: dest.xNome ? String(dest.xNome).trim() : null,
            ie: dest.IE ? String(dest.IE) : null,
            uf: enderDest.UF || null,
            municipio: enderDest.xMun || null,
            logradouro: enderDest.xLgr ? String(enderDest.xLgr).trim() : null,
            numero: enderDest.nro != null ? String(enderDest.nro).trim() : null,
            bairro: enderDest.xBairro ? String(enderDest.xBairro).trim() : null,
            cep: enderDest.CEP ? soDigitos(enderDest.CEP) : null
        },
        destinatarioCnpj: normalizarDoc(dest.CNPJ || dest.CPF) || null,
        itens,
        duplicatas
    };
}

/**
 * Parse do resumo da NF-e (resNFe). Função PURA.
 * No resNFe o campo CNPJ é o do EMITENTE (o destinatário é o CNPJ consultado).
 */
function parseResNFe(xmlString) {
    const doc = _parser.parse(xmlString);
    const res = doc.resNFe || doc;
    if (!res?.chNFe) throw new Error('XML não contém resNFe/chNFe.');
    return {
        chave: normalizarChaveNFe(res.chNFe),
        emitenteCnpj: normalizarDoc(res.CNPJ || res.CPF),
        emitenteNome: String(res.xNome ?? '').trim() || 'Emitente desconhecido',
        emissao: dataOuNull(res.dhEmi),
        valorTotal: numOuNull(res.vNF),
        situacao: res.cSitNFe != null ? String(res.cSitNFe) : null, // 1=autorizada 2=denegada 3=cancelada
        tipoNF: res.tpNF != null ? String(res.tpNF) : null,
        protocolo: res.nProt != null ? String(res.nProt) : null
    };
}

/**
 * Extrai { tpEvento, chNFe } de um documento de evento (resEvento ou procEventoNFe).
 * Função PURA. Retorna null se não reconhecer.
 */
function parseEvento(xmlString) {
    const doc = _parser.parse(xmlString);
    const inf = doc.resEvento
        || doc.procEventoNFe?.evento?.infEvento
        || doc.procEventoNFe?.retEvento?.infEvento
        || doc.evento?.infEvento
        || null;
    if (!inf?.chNFe || inf?.tpEvento == null) return null;
    return { tpEvento: String(inf.tpEvento), chNFe: normalizarChaveNFe(inf.chNFe) };
}

// ─────────────────────────────────────────────────────────────
// Configuração / estado
// ─────────────────────────────────────────────────────────────

/** Toggle AppConfig `captura_nfe_ativa` — default LIGADA (só 'false' desliga). */
async function capturaAtiva() {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'captura_nfe_ativa' } });
        const v = cfg?.value;
        return !(v === false || v === 'false');
    } catch (_) {
        return true;
    }
}

async function getControle() {
    return prisma.dfeControle.upsert({
        where: { id: DFE_ID },
        update: {},
        create: { id: DFE_ID }
    });
}

async function certificadoAtivo() {
    return prisma.certificadoDigital.findFirst({
        where: { ativo: true },
        orderBy: { instaladoEm: 'desc' }
    });
}

/** Cadência automática (ms) entre ciclos — configurável em app_configs.sefaz_intervalo_horas. Piso: ~1h. */
async function intervaloAutomaticoMs() {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'sefaz_intervalo_horas' } });
        const h = Number(cfg?.value);
        if (Number.isFinite(h) && h > 0) return Math.max(INTERVALO_MANUAL_MS, h * 3600000);
    } catch (_) { /* sem config: usa o padrão */ }
    return INTERVALO_AUTO_PADRAO_H * 3600000;
}

/**
 * Pré-checagens compartilhadas (ciclo automático, "consultar agora" e busca por chave).
 * Trava anti-656: nunca consulta antes do intervalo — piso de ~1h no modo manual,
 * cadência configurada (3h padrão) no automático. Evita o bloqueio de 1h15 da SEFAZ.
 * @param {{manual?: boolean}} opts
 */
async function podeConsultar({ manual = false } = {}) {
    if (!(await capturaAtiva())) return { ok: false, motivo: 'Captura de NF-e está desligada nas configurações.' };
    const cert = await certificadoAtivo();
    if (!cert) return { ok: false, motivo: 'Nenhum certificado digital instalado.' };
    if (new Date(cert.validade) < new Date()) return { ok: false, motivo: 'Certificado digital vencido.' };
    const ctrl = await getControle();
    if (ctrl.bloqueadoAte && new Date(ctrl.bloqueadoAte) > new Date()) {
        return { ok: false, emEspera: true, proximaConsultaEm: ctrl.bloqueadoAte, motivo: `SEFAZ bloqueou consultas até ${new Date(ctrl.bloqueadoAte).toLocaleString('pt-BR')} (consumo indevido — cStat 656).` };
    }
    const intervaloMs = manual ? INTERVALO_MANUAL_MS : await intervaloAutomaticoMs();
    if (ctrl.ultimaConsulta) {
        const desdeMs = Date.now() - new Date(ctrl.ultimaConsulta).getTime();
        if (desdeMs < intervaloMs) {
            const proxima = new Date(new Date(ctrl.ultimaConsulta).getTime() + intervaloMs);
            return { ok: false, emEspera: true, proximaConsultaEm: proxima, motivo: `Consulta recente à SEFAZ — a próxima é liberada às ${proxima.toLocaleString('pt-BR')} (a SEFAZ permite ~1 consulta por hora).` };
        }
    }
    return { ok: true, cert, ctrl };
}

/** Status resumido para as rotas (lista de notas / config). */
async function statusCaptura() {
    const ativa = await capturaAtiva();
    let ctrl = null;
    try {
        ctrl = await prisma.dfeControle.findUnique({ where: { id: DFE_ID } });
    } catch (_) { /* tabela ainda não criada em prod */ }
    const intervaloMs = await intervaloAutomaticoMs();
    const proximaConsultaEm = ctrl?.ultimaConsulta
        ? new Date(new Date(ctrl.ultimaConsulta).getTime() + intervaloMs)
        : null;
    return {
        ativa,
        ultimaConsulta: ctrl?.ultimaConsulta || null,
        ultimoResultado: ctrl?.ultimoResultado || null,
        bloqueadoAte: (ctrl?.bloqueadoAte && new Date(ctrl.bloqueadoAte) > new Date()) ? ctrl.bloqueadoAte : null,
        proximaConsultaEm,
        intervaloHoras: Math.round(intervaloMs / 3600000),
        totalCapturadas: ctrl?.totalCapturadas || 0
    };
}

// ─────────────────────────────────────────────────────────────
// Persistência dos documentos capturados
// ─────────────────────────────────────────────────────────────

/**
 * Status em que a nota JÁ FOI TRATADA e cujo status NÃO PODE REGREDIR para NOVA quando
 * o XML completo chega depois (`registrarProcNFe`). O XML continua sendo COMPLETADO
 * nessas notas — o que não pode é o status voltar atrás e reabrir a nota para lançamento.
 *
 * Por que cada uma está aqui:
 *   CONFERIDA           já virou conta a pagar;
 *   VINCULADA           já está anexada a parcela lançada (voltar para NOVA deixaria
 *                       gerar uma despesa NOVA em cima da mesma nota = dívida em dobro);
 *   ENTRADA_REGISTRADA  já entrou como bonificação/amostra/remessa;
 *   IGNORADA            o usuário disse que não interessa;
 *   RECUSADA            manifestação 210220/210240 já ACEITA pela SEFAZ — é
 *                       IRREVERSÍVEL na Receita. Se o status voltasse para NOVA, a nota
 *                       passaria de novo em TODAS as travas (gerar-conta, registrar-entrada,
 *                       vincular-parcelas) e viraria despesa + estoque + XML na
 *                       contabilidade para uma nota que a empresa recusou oficialmente;
 *   CANCELADA_EMITENTE  o fornecedor cancelou.
 *
 * ⚠️ RECUSADA e VINCULADA foram acrescentadas em 08/2026. O caminho real que expunha a
 * RECUSADA: a rota de manifestação aceita recusar nota em AGUARDANDO_XML (é o caso
 * natural do Desconhecimento — dá para recusar só pelo resumo); quando o XML completo
 * chegava na consulta seguinte, a nota era jogada de volta para NOVA.
 */
const STATUS_NAO_REGRIDEM = ['CONFERIDA', 'VINCULADA', 'ENTRADA_REGISTRADA', 'IGNORADA', 'RECUSADA', 'CANCELADA_EMITENTE'];

/** Garante o Fornecedor pelo CNPJ do emitente (auto-criado com origem NFE). */
async function garantirFornecedor(cnpj, nome) {
    if (!cnpj) return null;
    try {
        const existente = await prisma.fornecedor.findFirst({ where: { cnpjCpf: cnpj } });
        if (existente) return existente;
        return await prisma.fornecedor.create({
            data: {
                cnpjCpf: cnpj,
                razaoSocial: nome || `Fornecedor ${cnpj}`,
                origem: 'NFE',
                statusEnvioCA: 'NAO_ENVIAR'
            }
        });
    } catch (e) {
        console.warn('[SefazDFe] Falha ao garantir fornecedor', cnpj, e.message);
        return null;
    }
}

/** resNFe → NotaEntrada AGUARDANDO_XML (dedup por chave; não rebaixa status). */
async function registrarResumo(resumo, nsu, cnpjNosso) {
    if (!resumo.chave || resumo.chave.length !== 44) return { capturada: false };
    if (resumo.emitenteCnpj && resumo.emitenteCnpj === cnpjNosso) return { capturada: false }; // nossa própria nota

    const statusInicial = resumo.situacao === '3' ? 'CANCELADA_EMITENTE' : 'AGUARDANDO_XML';
    const existente = await prisma.notaEntrada.findUnique({ where: { chave: resumo.chave } });
    if (existente) {
        await prisma.notaEntrada.update({
            where: { chave: resumo.chave },
            data: {
                nsu: nsu || existente.nsu,
                dadosResumo: resumo,
                // cancelamento informado no resumo vale mesmo se já capturada
                ...(resumo.situacao === '3' && existente.status !== 'CONFERIDA' ? { status: 'CANCELADA_EMITENTE' } : {})
            }
        });
        return { capturada: false };
    }

    const fornecedor = await garantirFornecedor(resumo.emitenteCnpj, resumo.emitenteNome);
    await prisma.notaEntrada.create({
        data: {
            tipo: 'NFE',
            chave: resumo.chave,
            nsu: nsu || null,
            fornecedorCnpj: resumo.emitenteCnpj || '',
            fornecedorNome: resumo.emitenteNome,
            fornecedorId: fornecedor?.id || null,
            emissao: resumo.emissao,
            valorTotal: resumo.valorTotal,
            status: statusInicial,
            dadosResumo: resumo
        }
    });
    return { capturada: true };
}

/** procNFe → salva XML no disco + NotaEntrada NOVA + itens + duplicatas (dedup total). */
async function registrarProcNFe(xmlString, nsu, cnpjNosso) {
    const nota = parseProcNFe(xmlString);
    if (!nota.chave || nota.chave.length !== 44) return { capturada: false };
    if (nota.emitente.cnpj === cnpjNosso) return { capturada: false }; // nossa própria nota

    // Salva o XML no disco (sobrescrever é idempotente)
    if (!fs.existsSync(XML_DIR)) fs.mkdirSync(XML_DIR, { recursive: true });
    const xmlPath = path.posix.join('uploads', 'notas-xml', `${nota.chave}.xml`);
    fs.writeFileSync(path.join(XML_DIR, `${nota.chave}.xml`), xmlString, 'utf8');

    const naoEDestinada = !!(nota.destinatarioCnpj && cnpjNosso && nota.destinatarioCnpj !== cnpjNosso);
    const existente = await prisma.notaEntrada.findUnique({ where: { chave: nota.chave } });

    // Nota já tratada pelo usuário NÃO volta para NOVA — mas o XML completo continua
    // sendo gravado (xmlPath + nsu): é justamente o que dá DANFE, download e relatório
    // fiscal para uma nota conferida/vinculada/recusada. Só o status é que não regride.
    if (existente && STATUS_NAO_REGRIDEM.includes(existente.status)) {
        await prisma.notaEntrada.update({
            where: { chave: nota.chave },
            data: { xmlPath, nsu: nsu || existente.nsu }
        });
        return { capturada: false };
    }

    const fornecedor = await garantirFornecedor(nota.emitente.cnpj, nota.emitente.nome);

    const dados = {
        tipo: 'NFE',
        nsu: nsu || existente?.nsu || null,
        numero: nota.numero,
        serie: nota.serie,
        fornecedorCnpj: nota.emitente.cnpj,
        fornecedorNome: nota.emitente.nome,
        fornecedorId: fornecedor?.id || null,
        emissao: nota.emissao,
        valorTotal: nota.valorTotal,
        infComplementar: nota.infComplementar || null,
        naturezaOperacao: nota.naturezaOperacao || null,
        status: 'NOVA',
        xmlPath,
        // nota onde NÃO somos o destinatário (ex.: transporte): não manifestar ciência
        ...(naoEDestinada ? { manifestada: true } : {})
    };

    let notaId;
    await prisma.$transaction(async (tx) => {
        if (existente) {
            await tx.notaEntrada.update({ where: { id: existente.id }, data: dados });
            notaId = existente.id;
        } else {
            const criada = await tx.notaEntrada.create({ data: { chave: nota.chave, ...dados } });
            notaId = criada.id;
        }
        // Dedup total: zera e recria itens/duplicatas
        await tx.notaEntradaItem.deleteMany({ where: { notaEntradaId: notaId } });
        await tx.notaEntradaDuplicata.deleteMany({ where: { notaEntradaId: notaId } });
        if (nota.itens.length > 0) {
            await tx.notaEntradaItem.createMany({
                // cfop agora É coluna do NotaEntradaItem (detecção de bonificação/amostra/remessa)
                data: nota.itens.map((i) => ({ notaEntradaId: notaId, ...i }))
            });
        }
        if (nota.duplicatas.length > 0) {
            await tx.notaEntradaDuplicata.createMany({
                data: nota.duplicatas.map((d) => ({ notaEntradaId: notaId, ...d }))
            });
        }
    }, { timeout: 20000, maxWait: 10000 });

    // capturada = virou NOVA agora (era inexistente ou só resumo)
    return { capturada: !existente || existente.status === 'AGUARDANDO_XML' };
}

/** Evento de cancelamento (110111) → CANCELADA_EMITENTE (exceto se já CONFERIDA). */
async function registrarEvento(xmlString) {
    const ev = parseEvento(xmlString);
    if (!ev) return;
    if (ev.tpEvento === '110111') {
        await prisma.notaEntrada.updateMany({
            where: { chave: ev.chNFe, status: { not: 'CONFERIDA' } },
            data: { status: 'CANCELADA_EMITENTE' }
        });
        const conferida = await prisma.notaEntrada.findFirst({
            where: { chave: ev.chNFe, status: 'CONFERIDA' },
            select: { id: true, numero: true }
        });
        if (conferida) {
            console.warn(`[SefazDFe] ⚠️ NF-e ${conferida.numero || ev.chNFe} foi CANCELADA pelo emitente mas já tinha conta a pagar gerada — confira a conta!`);
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Manifestação — Ciência da Operação (210210) em lote
// ─────────────────────────────────────────────────────────────

async function manifestarCiencia(cert, pfx, senha) {
    const pendentes = await prisma.notaEntrada.findMany({
        // `manifestacaoTipo: null` é IGUALDADE a null de propósito: no Prisma, `not`/`notIn`
        // EXCLUEM as linhas null — usar `not` aqui deixaria de fora justamente as notas que
        // ainda não têm manifestação nenhuma (ou seja, todas as pendentes).
        // Nota já recusada (Desconhecimento / Não Realizada) NUNCA recebe ciência.
        where: {
            manifestada: false,
            tipo: 'NFE',
            manifestacaoTipo: null,
            status: { notIn: ['CANCELADA_EMITENTE', 'RECUSADA'] }
        },
        select: { id: true, chave: true },
        take: 100,
        orderBy: { criadoEm: 'asc' }
    });
    if (pendentes.length === 0) return { manifestadas: 0 };

    const { RecepcaoEvento } = require('node-mde');
    const recepcao = new RecepcaoEvento({
        pfx,
        passphrase: senha,
        cnpj: normalizarDoc(cert.cnpj),
        tpAmb: TP_AMB
    });

    let manifestadas = 0;
    // Lotes de até 20 eventos (limite do node-mde/SEFAZ)
    for (let i = 0; i < pendentes.length; i += 20) {
        const grupo = pendentes.slice(i, i + 20);
        try {
            const resultado = await recepcao.enviarEvento({
                idLote: String(Date.now()),
                lote: grupo.map((n) => ({ chNFe: n.chave, tipoEvento: 210210 }))
            });
            if (resultado.error) {
                console.warn('[SefazDFe] Falha no lote de manifestação:', resultado.error);
                continue; // tenta de novo no próximo ciclo
            }
            const porChave = new Map(grupo.map((n) => [n.chave, n]));
            for (const ev of resultado.data?.infEvento || []) {
                const nota = porChave.get(normalizarChaveNFe(ev.chNFe));
                if (!nota) continue;
                // 135/136 = registrado; qualquer outro cStat é rejeição determinística —
                // marcar como manifestada evita loop infinito de reenvio (fica logado).
                if (!['135', '136'].includes(String(ev.cStat))) {
                    console.warn(`[SefazDFe] Manifestação ${nota.chave}: cStat ${ev.cStat} — ${ev.xMotivo}`);
                }
                await prisma.notaEntrada.update({ where: { id: nota.id }, data: { manifestada: true } });
                manifestadas++;
            }
        } catch (e) {
            console.warn('[SefazDFe] Erro ao manifestar lote:', e.message);
        }
    }
    return { manifestadas };
}

// ─────────────────────────────────────────────────────────────
// Manifestação do Destinatário — ATO DELIBERADO do usuário (08/2026)
//
// Três eventos, todos no mesmo webservice de RecepcaoEvento (NÃO é a Distribuição
// DF-e, então NÃO passa pela trava de 1h do `podeConsultar` — o cStat 656 não existe
// aqui):
//   210200 Confirmação da Operação    → "recebi a mercadoria"
//   210220 Desconhecimento da Operação → "essa nota não é minha, não comprei nada"
//   210240 Operação não Realizada     → "a mercadoria não chegou / foi recusada"
//
// Regras que NÃO podem ser afrouxadas:
//  1. Só o 210240 leva justificativa. A lib põe `xJust` no XML para QUALQUER evento
//     que receba `justificativa` — e a SEFAZ rejeita 210200/210220 com xJust por schema.
//  2. NUNCA gravar a manifestação na nota quando a SEFAZ não aceitou (é o vício do
//     `manifestarCiencia` acima, que marca `manifestada: true` mesmo em rejeição —
//     lá é aceitável porque só evita reenvio infinito de um evento neutro; aqui seria
//     mentir para o usuário sobre um ato fiscal).
//  3. É IRREVERSÍVEL: `nSeqEvento` é fixo em "1" e o Id do evento é
//     `ID<tpEvento><chNFe>01` — a SEFAZ recusa o mesmo evento repetido para a mesma
//     chave (duplicidade). Isso dá idempotência de graça, mas não há "desfazer".
// ─────────────────────────────────────────────────────────────

const MANIFESTACAO_EVENTOS = {
    CONFIRMACAO: { tpEvento: 210200, marca: 'CONFIRMADA', recusa: false, rotulo: 'Confirmação da Operação' },
    DESCONHECIMENTO: { tpEvento: 210220, marca: 'DESCONHECIDA', recusa: true, rotulo: 'Desconhecimento da Operação' },
    NAO_REALIZADA: { tpEvento: 210240, marca: 'NAO_REALIZADA', recusa: true, rotulo: 'Operação não Realizada' }
};

// cStat de evento REGISTRADO pela SEFAZ. Qualquer outro é recusa.
const CSTAT_EVENTO_ACEITO = ['135', '136'];

// Teto da chamada HTTP à SEFAZ na manifestação (o padrão da lib é 60s — demais).
// Dois tetos DIFERENTES de propósito (decisão do gerente de entrega, 08/2026):
//  - MANUAL (30s): o usuário clicou no botão pedindo AQUELE ato e deve esperar por ele.
//  - AUTOMÁTICA (15s): roda DENTRO do clique de "gerar conta"/"registrar entrada"/
//    "vincular parcela". Ampulheta longa nesse clique faz o usuário clicar de novo —
//    e este projeto já teve estrago por clique repetido. As falhas rápidas (rejeição,
//    403, DNS) voltam em segundos e geram o aviso igual; só a conexão pendurada gasta
//    o teto inteiro, e aí 15s já bastam para concluir que não vai responder. A nota
//    fica sem confirmar, o aviso aparece e o botão manual continua como saída.
const MANIFESTACAO_TIMEOUT_MS = 30000;
const MANIFESTACAO_TIMEOUT_AUTO_MS = 15000;

/**
 * Normaliza a justificativa para o que o schema da SEFAZ aceita no `xJust`:
 *   - sem acento (NFD + remocao dos diacriticos — mesmo tratamento de detectarMotivoEntrada:
 *     "ç" vira "c", "ã" vira "a");
 *   - so ASCII imprimivel: caractere de controle (quebra de linha, tab), travessao,
 *     aspas curvas e emoji NAO passam no schema da NF-e e derrubariam o lote inteiro;
 *   - sem os caracteres proibidos em campo de texto da NF-e (& < > " ');
 *   - espacos colapsados, cortada em 255.
 * Funcao PURA — devolve string (possivelmente vazia; quem chama valida o minimo de 15).
 *
 * ⚠️ EXISTE UM ESPELHO EXATO desta função no frontend, em
 * `frontend/src/pages/Financeiro/NotasRecebidasPage.jsx` (~linha 122) — é ele que faz o
 * contador de caracteres da tela medir o MESMO texto que a SEFAZ vai receber (o mínimo
 * de 15 é validado aqui DEPOIS de normalizar, e a normalização APAGA caracteres:
 * "Nao veio o 'kit'" tem 16 cruas e 14 normalizadas).
 * AS DUAS CÓPIAS ANDAM JUNTAS: mudou a regra aqui, mude lá — e vice-versa. Se elas
 * divergirem o defeito é MUDO: a tela libera o botão e o backend responde 400
 * (ou o contador trava um texto que passaria). Nenhum build nem `node --check` pega isso.
 */
function normalizarJustificativa(texto) {
    return String(texto || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tira acento
        .replace(/[^\x20-\x7E]/g, ' ')                      // so ASCII imprimivel
        .replace(/["&'<>]/g, ' ')                           // proibidos em texto de NF-e (aspas, & e sinais de tag)
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 255)
        .trim();
}

/**
 * Envia UMA manifestação do destinatário para UMA nota.
 *
 * NUNCA lança — devolve sempre um objeto.
 * NUNCA escreve em NotaEntrada quando `aceito === false`.
 *
 * Sobre o histórico (`NotaEntradaManifestacao`), sendo exato:
 *   - grava a tentativa SEMPRE QUE O EVENTO CHEGOU A SER ENVIADO à SEFAZ — aceita,
 *     recusada por cStat, lote rejeitado inteiro ou erro de rede/SOAP;
 *   - NÃO grava nada quando a chamada é barrada ANTES do envio, porque aí não houve
 *     tentativa nenhuma: `TIPO_INVALIDO`, `JUSTIFICATIVA` (texto curto demais),
 *     `NOTA_NAO_ENCONTRADA` e `SEM_CERTIFICADO` retornam antes de falar com a SEFAZ;
 *   - a gravação do histórico e o update da nota NÃO são atômicos de propósito
 *     (ver o comentário no corpo da função) — histórico órfão é melhor do que
 *     evento na Receita sem rastro nenhum no app.
 *
 * @param {object}  p
 * @param {string}  p.notaId
 * @param {'CONFIRMACAO'|'DESCONHECIMENTO'|'NAO_REALIZADA'} p.tipo
 * @param {string} [p.justificativa]  obrigatória nas DUAS recusas (é registro do ato no app);
 *                                    só a de NAO_REALIZADA vai para a SEFAZ, como `xJust`
 * @param {string} [p.usuarioId]
 * @param {boolean} [p.automatica=false]  true = confirmação disparada por dentro de um
 *   lançamento (gerar conta / registrar entrada / vincular parcela). Só muda o TETO de
 *   espera da chamada HTTP: 15s no automático (não travar o clique do usuário) contra
 *   30s no manual (o usuário pediu aquele ato e espera por ele). Nada mais muda.
 * @returns {Promise<{ok:boolean, aceito:boolean, codigo:string, cStat?:string, xMotivo?:string, protocolo?:string, motivo?:string, tipo?:string, marca?:string, status?:string, manifestacaoEm?:Date}>}
 *   `codigo`: OK | TIPO_INVALIDO | JUSTIFICATIVA | NOTA_NAO_ENCONTRADA | SEM_CERTIFICADO
 *             | REDE | REJEITADA | GRAVACAO
 */
async function manifestar({ notaId, tipo, justificativa, usuarioId, automatica = false } = {}) {
    // Único efeito do modo: o teto de espera da chamada HTTP (ver as constantes acima).
    // A regra fiscal é IDÊNTICA nos dois caminhos — nada de "automático marca mais fácil".
    const timeoutMs = automatica ? MANIFESTACAO_TIMEOUT_AUTO_MS : MANIFESTACAO_TIMEOUT_MS;
    const cfg = MANIFESTACAO_EVENTOS[String(tipo || '').toUpperCase().trim()];
    if (!cfg) {
        return { ok: false, aceito: false, codigo: 'TIPO_INVALIDO', motivo: 'Tipo de manifestação inválido.' };
    }

    let nota;
    try {
        nota = await prisma.notaEntrada.findUnique({
            where: { id: String(notaId || '') },
            select: { id: true, chave: true, numero: true }
        });
    } catch (e) {
        console.error('[SefazDFe] manifestar — falha ao ler a nota:', e.message);
        return { ok: false, aceito: false, codigo: 'GRAVACAO', motivo: 'Não foi possível ler a nota no banco.' };
    }
    if (!nota) return { ok: false, aceito: false, codigo: 'NOTA_NAO_ENCONTRADA', motivo: 'Nota não encontrada.' };

    // Justificativa:
    //  - as DUAS recusas exigem justificativa (é o registro do ato dentro do app);
    //  - mas SÓ o 210240 pode mandá-la para a SEFAZ. Enviar `justificativa` junto com
    //    210200/210220 faz a lib escrever `xJust` no XML e a SEFAZ rejeita por schema
    //    (ver regra 1 acima) — por isso `justSefaz` é separado de `just`.
    let just = null;
    if (cfg.recusa) {
        just = normalizarJustificativa(justificativa);
        if (just.length < 15) {
            return { ok: false, aceito: false, codigo: 'JUSTIFICATIVA', motivo: 'A justificativa precisa ter de 15 a 255 caracteres.' };
        }
    }
    const justSefaz = cfg.tpEvento === 210240 ? just : null;

    // Certificado A1 — NÃO usa podeConsultar() (aquela trava é da Distribuição DF-e).
    const cert = await certificadoAtivo().catch(() => null);
    if (!cert || new Date(cert.validade) < new Date()) {
        return { ok: false, aceito: false, codigo: 'SEM_CERTIFICADO', motivo: 'Nenhum certificado digital válido instalado.' };
    }
    let pfx, senha;
    try {
        const certificadoService = require('./certificadoService');
        ({ pfx, senha } = certificadoService.descriptografarCertificado(cert));
    } catch (e) {
        console.error('[SefazDFe] manifestar — falha ao abrir o certificado:', e.message);
        return { ok: false, aceito: false, codigo: 'SEM_CERTIFICADO', motivo: 'Nenhum certificado digital válido instalado.' };
    }

    // ── Chamada de rede: SEMPRE fora de qualquer $transaction ──
    let resultado = null;
    let erroTransporte = null;
    try {
        const { RecepcaoEvento } = require('node-mde');
        const recepcao = new RecepcaoEvento({
            pfx,
            passphrase: senha,
            cnpj: normalizarDoc(cert.cnpj),
            tpAmb: TP_AMB,
            // O padrão da lib é 60s — demais nos dois casos. 15s no automático (roda dentro
            // do clique de "gerar conta"/"registrar entrada"/"vincular parcela") e 30s no
            // manual (o usuário pediu o ato e espera por ele).
            options: { requestOptions: { timeout: timeoutMs } }
        });
        resultado = await recepcao.enviarEvento({
            idLote: String(Date.now()),
            lote: [{
                chNFe: nota.chave,
                tipoEvento: cfg.tpEvento,
                ...(justSefaz ? { justificativa: justSefaz } : {})   // xJust SÓ no 210240
            }]
        });
        if (resultado?.error) erroTransporte = String(resultado.error).substring(0, 2000);
    } catch (e) {
        erroTransporte = String(e?.message || e).substring(0, 2000);
        console.error(`[SefazDFe] manifestar ${cfg.rotulo} ${nota.chave}:`, erroTransporte);
    }

    // Lote rejeitado inteiro → infEvento VAZIO (a SEFAZ responde só no nível do lote).
    const ev = Array.isArray(resultado?.data?.infEvento) ? resultado.data.infEvento[0] : null;
    const cStatEvento = ev?.cStat != null && ev.cStat !== '' ? String(ev.cStat) : null;
    const cStatLote = resultado?.data?.cStat != null && resultado.data.cStat !== '' ? String(resultado.data.cStat) : null;
    const cStat = cStatEvento || cStatLote;
    const xMotivoBruto = ev?.xMotivo || resultado?.data?.xMotivo || null;
    const xMotivo = xMotivoBruto ? String(xMotivoBruto).substring(0, 2000) : null;
    const protocolo = ev?.nProt ? String(ev.nProt) : null;

    const aceito = !erroTransporte && !!ev && CSTAT_EVENTO_ACEITO.includes(cStatEvento);
    const manifestacaoEm = new Date();

    // ── Gravação, em DOIS PASSOS DELIBERADAMENTE NÃO ATÔMICOS ──
    //
    // Aqui NÃO se usa $transaction de propósito (08/2026). Com os dois writes na mesma
    // transação, uma falha no update da nota fazia ROLLBACK e levava junto a linha de
    // histórico — o pior desfecho possível: evento REGISTRADO na Receita e ZERO rastro
    // no app, sem poder reenviar (nSeqEvento é fixo em "1"). Um histórico órfão é
    // muitíssimo melhor do que nenhum registro: ele é a única prova de que o evento saiu.
    // Por isso o histórico é gravado PRIMEIRO e SOZINHO, e a nota depois.

    // Passo 1 — histórico da tentativa (aceita, recusada ou sem resposta). Best-effort:
    // se ele falhar, ainda assim seguimos para marcar a nota, que é o que o usuário vê.
    let historicoGravado = true;
    try {
        await prisma.notaEntradaManifestacao.create({
            data: {
                notaEntradaId: nota.id,
                chave: nota.chave,
                tipoEvento: String(cfg.tpEvento),
                justificativa: just,
                aceito,
                cStat,
                xMotivo,
                protocolo,
                nSeqEvento: ev?.nSeqEvento ? String(ev.nSeqEvento) : null,
                erro: erroTransporte,
                criadoPorId: usuarioId || null
            }
        });
    } catch (e) {
        historicoGravado = false;
        console.error(
            `[SefazDFe] manifestar — FALHA AO GRAVAR O HISTÓRICO (nota ${nota.numero || nota.id}, chave ${nota.chave}, evento ${cfg.tpEvento}, aceito=${aceito}, cStat=${cStat}, protocolo=${protocolo}):`,
            e.message
        );
    }

    // Passo 2 — a nota só é tocada quando a SEFAZ ACEITOU (regra 2 do cabeçalho).
    if (aceito) {
        try {
            await prisma.notaEntrada.update({
                where: { id: nota.id },
                data: {
                    manifestacaoTipo: cfg.marca,
                    manifestacaoEm,
                    manifestacaoJustificativa: just,
                    manifestacaoProtocolo: protocolo,
                    manifestacaoCStat: cStatEvento,
                    manifestacaoPorId: usuarioId || null,
                    // Confirmação NÃO muda o status (a nota segue o fluxo normal);
                    // as duas recusas tiram a nota do fluxo.
                    ...(cfg.recusa ? { status: 'RECUSADA' } : {})
                }
            });
        } catch (e) {
            // A SEFAZ aceitou e o app não conseguiu registrar: avisa alto. O histórico
            // do passo 1 (se gravou) é o rastro que sobra para o conserto manual.
            console.error(
                `[SefazDFe] manifestar — SEFAZ ACEITOU MAS A NOTA NÃO FOI MARCADA (nota ${nota.numero || nota.id}, chave ${nota.chave}, evento ${cfg.tpEvento}, protocolo ${protocolo}, histórico gravado: ${historicoGravado}):`,
                e.message
            );
            return {
                ok: false,
                aceito: true,
                codigo: 'GRAVACAO',
                cStat, xMotivo, protocolo,
                motivo: 'A SEFAZ ACEITOU a manifestação, mas o app não conseguiu registrar isso no banco. Confira a nota antes de tentar de novo — o evento já foi enviado e não pode ser reenviado.'
            };
        }
    }

    if (erroTransporte) {
        return { ok: false, aceito: false, codigo: 'REDE', cStat, xMotivo, motivo: erroTransporte };
    }
    if (!aceito) {
        return { ok: false, aceito: false, codigo: 'REJEITADA', cStat, xMotivo, motivo: xMotivo || 'A SEFAZ não aceitou a manifestação.' };
    }
    return {
        ok: true,
        aceito: true,
        codigo: 'OK',
        cStat: cStatEvento,
        xMotivo,
        protocolo,
        tipo: String(tipo).toUpperCase().trim(),
        marca: cfg.marca,
        rotulo: cfg.rotulo,
        status: cfg.recusa ? 'RECUSADA' : null,
        manifestacaoEm
    };
}

// ─────────────────────────────────────────────────────────────
// Ciclo principal
// ─────────────────────────────────────────────────────────────

let _rodando = false;

async function executarCiclo({ manual = false } = {}) {
    if (_rodando) return { ok: false, motivo: 'Já existe um ciclo de captura em execução.' };
    _rodando = true;
    try {
        const pre = await podeConsultar({ manual });
        if (!pre.ok) {
            // silencioso: sem certificado / desligada / em espera são situações normais
            return pre;
        }
        const { cert } = pre;
        const cnpjNosso = normalizarDoc(cert.cnpj);

        let pfx, senha;
        try {
            const certificadoService = require('./certificadoService');
            ({ pfx, senha } = certificadoService.descriptografarCertificado(cert));
        } catch (e) {
            const motivo = `Falha ao abrir o certificado: ${e.message}`;
            await _salvarResultado(motivo);
            return { ok: false, motivo };
        }

        const { DistribuicaoDFe } = require('node-mde');
        const distribuicao = new DistribuicaoDFe({
            pfx,
            passphrase: senha,
            cnpj: cnpjNosso,
            cUFAutor: CUF_AUTOR,
            tpAmb: TP_AMB
        });

        let capturadas = 0;
        let processados = 0;
        let resultado = '';

        for (let iter = 0; iter < MAX_ITERACOES; iter++) {
            const ctrl = await getControle();
            const consulta = await distribuicao.consultaUltNSU(String(ctrl.ultNSU || '0'));

            if (consulta.error) {
                resultado = `Erro na consulta à SEFAZ: ${String(consulta.error).substring(0, 500)}`;
                break;
            }

            const { cStat, xMotivo, ultNSU, maxNSU, docZip } = consulta.data || {};

            if (cStat === '137') {
                resultado = `Nenhum documento novo (cStat 137). ${processados > 0 ? `${processados} docs processados neste ciclo.` : ''}`.trim();
                if (ultNSU) await _atualizarNSU(ultNSU, maxNSU);
                break;
            }
            if (cStat === '656') {
                const ate = new Date(Date.now() + BLOQUEIO_656_MS);
                await prisma.dfeControle.update({
                    where: { id: DFE_ID },
                    data: { bloqueadoAte: ate }
                });
                resultado = `SEFAZ retornou consumo indevido (cStat 656) — consultas pausadas até ${ate.toLocaleString('pt-BR')}.`;
                break;
            }
            if (cStat !== '138') {
                resultado = `SEFAZ retornou cStat ${cStat}: ${xMotivo || '(sem motivo)'}`;
                break;
            }

            // cStat 138 — documentos localizados
            for (const docItem of docZip || []) {
                processados++;
                try {
                    const schema = String(docItem.schema || '');
                    if (schema.startsWith('resNFe')) {
                        const r = await registrarResumo(parseResNFe(docItem.xml), docItem.nsu, cnpjNosso);
                        if (r.capturada) capturadas++;
                    } else if (schema.startsWith('procNFe') || schema.startsWith('nfeProc')) {
                        const r = await registrarProcNFe(docItem.xml, docItem.nsu, cnpjNosso);
                        if (r.capturada) capturadas++;
                    } else if (schema.startsWith('resEvento') || schema.startsWith('procEventoNFe')) {
                        await registrarEvento(docItem.xml);
                    }
                    // outros schemas (NFS-e etc.): ignorados nesta fase
                } catch (e) {
                    console.warn(`[SefazDFe] Falha ao processar doc NSU ${docItem.nsu} (${docItem.schema}):`, e.message);
                }
            }

            await _atualizarNSU(ultNSU, maxNSU);

            if (!ultNSU || !maxNSU || BigInt(soDigitos(ultNSU) || '0') >= BigInt(soDigitos(maxNSU) || '0')) {
                resultado = `Ciclo completo: ${processados} documento(s) processado(s), ${capturadas} nota(s) nova(s).`;
                break;
            }
            resultado = `Ciclo parcial: ${processados} documento(s) processado(s), ${capturadas} nota(s) nova(s).`;
        }

        // Manifestação de ciência (libera o XML completo nas próximas consultas)
        let manifestadas = 0;
        try {
            ({ manifestadas } = await manifestarCiencia(cert, pfx, senha));
        } catch (e) {
            console.warn('[SefazDFe] Erro geral na manifestação:', e.message);
        }
        if (manifestadas > 0) resultado += ` Ciência da Operação enviada para ${manifestadas} nota(s).`;

        await prisma.dfeControle.update({
            where: { id: DFE_ID },
            data: {
                ultimaConsulta: new Date(),
                ultimoResultado: (resultado || 'Ciclo executado.').substring(0, 2000),
                totalCapturadas: { increment: capturadas }
            }
        });

        console.log(`[SefazDFe] ${resultado || 'Ciclo executado.'}`);
        return { ok: true, capturadas, processados, manifestadas, resultado };
    } catch (error) {
        console.error('[SefazDFe] Erro no ciclo de captura:', error.message);
        try {
            await _salvarResultado(`Erro no ciclo: ${error.message}`.substring(0, 2000));
        } catch (_) { /* nunca derruba */ }
        return { ok: false, motivo: error.message };
    } finally {
        _rodando = false;
    }
}

async function _atualizarNSU(ultNSU, maxNSU) {
    await prisma.dfeControle.update({
        where: { id: DFE_ID },
        data: {
            ultNSU: String(ultNSU || '0'),
            ...(maxNSU ? { maxNSU: String(maxNSU) } : {})
        }
    });
}

async function _salvarResultado(texto) {
    await prisma.dfeControle.upsert({
        where: { id: DFE_ID },
        update: { ultimaConsulta: new Date(), ultimoResultado: texto },
        create: { id: DFE_ID, ultimaConsulta: new Date(), ultimoResultado: texto }
    });
}

/**
 * Busca UMA nota específica na SEFAZ pela CHAVE de acesso (44 dígitos) e a grava,
 * reaproveitando a mesma gravação do ciclo. Se a SEFAZ devolver só o resumo
 * (AGUARDANDO_XML), envia a Ciência da Operação e tenta de novo o XML completo.
 * NÃO mexe no NSU sequencial do ciclo. Retorna { ok, motivo?, cStat? }.
 * A rota consulta a nota gravada pela própria chave.
 */
async function buscarPorChave(chave) {
    const ch = normalizarChaveNFe(chave); // chave pode ser alfanumérica (emitente com CNPJ alfanumérico)
    if (!ch) return { ok: false, motivo: 'A chave de acesso precisa ter 44 posições.' };

    const pre = await podeConsultar({ manual: true });
    if (!pre.ok) return { ok: false, motivo: pre.motivo, emEspera: pre.emEspera, proximaConsultaEm: pre.proximaConsultaEm };
    const { cert } = pre;
    const cnpjNosso = normalizarDoc(cert.cnpj);

    let pfx, senha;
    try {
        const certificadoService = require('./certificadoService');
        ({ pfx, senha } = certificadoService.descriptografarCertificado(cert));
    } catch (e) {
        return { ok: false, motivo: `Falha ao abrir o certificado: ${e.message}` };
    }

    const { DistribuicaoDFe } = require('node-mde');
    const distribuicao = new DistribuicaoDFe({ pfx, passphrase: senha, cnpj: cnpjNosso, cUFAutor: CUF_AUTOR, tpAmb: TP_AMB });

    // Consulta a chave e grava os documentos retornados (mesma lógica do ciclo).
    const consultarEProcessar = async () => {
        const consulta = await distribuicao.consultaChNFe(ch);
        if (consulta.error) return { erro: String(consulta.error).substring(0, 400) };
        const { cStat, xMotivo, docZip } = consulta.data || {};
        if (cStat === '656') {
            const ate = new Date(Date.now() + BLOQUEIO_656_MS);
            await prisma.dfeControle.update({ where: { id: DFE_ID }, data: { bloqueadoAte: ate } }).catch(() => {});
            return { cStat, xMotivo, bloqueadoAte: ate };
        }
        if (cStat === '138') {
            for (const docItem of docZip || []) {
                try {
                    const schema = String(docItem.schema || '');
                    if (schema.startsWith('resNFe')) await registrarResumo(parseResNFe(docItem.xml), docItem.nsu, cnpjNosso);
                    else if (schema.startsWith('procNFe') || schema.startsWith('nfeProc')) await registrarProcNFe(docItem.xml, docItem.nsu, cnpjNosso);
                    else if (schema.startsWith('resEvento') || schema.startsWith('procEventoNFe')) await registrarEvento(docItem.xml);
                } catch (e) { console.warn(`[SefazDFe] buscarPorChave doc (${docItem.schema}):`, e.message); }
            }
        }
        return { cStat, xMotivo };
    };

    try {
        const r = await consultarEProcessar();
        if (r.erro) return { ok: false, motivo: `Erro na consulta à SEFAZ: ${r.erro}` };
        if (r.bloqueadoAte) return { ok: false, emEspera: true, proximaConsultaEm: r.bloqueadoAte, motivo: `SEFAZ pausou as consultas (consumo indevido). Tente após ${r.bloqueadoAte.toLocaleString('pt-BR')}.` };

        // Consulta à SEFAZ efetivada → conta para a trava de intervalo (não consultar de novo antes de ~1h/cadência).
        await prisma.dfeControle.update({ where: { id: DFE_ID }, data: { ultimaConsulta: new Date() } }).catch(() => {});

        // Só veio o resumo? Manda ciência e tenta de novo — pode já vir o XML completo.
        const nota = await prisma.notaEntrada.findUnique({ where: { chave: ch } });
        if (nota && nota.status === 'AGUARDANDO_XML') {
            try { await manifestarCiencia(cert, pfx, senha); } catch (e) { console.warn('[SefazDFe] buscarPorChave ciência:', e.message); }
            await consultarEProcessar();
        }

        return { ok: true, cStat: r.cStat, xMotivo: r.xMotivo };
    } catch (error) {
        console.error('[SefazDFe] Erro na busca por chave:', error.message);
        return { ok: false, motivo: error.message };
    }
}

/**
 * Processa UMA busca por chave agendada (fila `notaBuscaAgendada`), respeitando a trava
 * de intervalo (buscarPorChave já checa `podeConsultar({manual:true})`). Roda no scheduler.
 * Uma por vez: a própria trava garante ~1 consulta por hora.
 */
async function processarBuscasAgendadas() {
    let item;
    try {
        item = await prisma.notaBuscaAgendada.findFirst({ where: { status: 'PENDENTE' }, orderBy: { criadoEm: 'asc' } });
    } catch (_) {
        return { processadas: 0 }; // tabela ainda não migrada em prod
    }
    if (!item) return { processadas: 0 };

    const r = await buscarPorChave(item.chave);
    if (!r.ok) {
        if (r.emEspera) return { processadas: 0, emEspera: true }; // ainda no intervalo — tenta no próximo tick
        const tentativas = (item.tentativas || 0) + 1;
        await prisma.notaBuscaAgendada.update({
            where: { id: item.id },
            data: { tentativas, status: tentativas >= 5 ? 'FALHOU' : 'PENDENTE', resultado: String(r.motivo || 'erro').substring(0, 500) }
        }).catch(() => {});
        return { processadas: 0 };
    }

    const nota = await prisma.notaEntrada.findUnique({ where: { chave: normalizarChaveNFe(item.chave) } });
    await prisma.notaBuscaAgendada.update({
        where: { id: item.id },
        data: {
            status: nota ? 'CONCLUIDA' : 'FALHOU',
            processadoEm: new Date(),
            resultado: nota
                ? `Encontrada (${nota.status}).`
                : 'A SEFAZ não retornou a nota (confira a chave / se a empresa é a destinatária).'
        }
    }).catch(() => {});
    return { processadas: 1, encontrada: !!nota };
}

// ─────────────────────────────────────────────────────────────
// Detecção do MOTIVO de "entrada sem pagamento" (bonificação, amostra,
// remessa/troca, comodato) a partir da natureza da operação e dos CFOPs
// dos itens. Função PURA (testável offline).
//
// Regras:
//  - CFOP 5910/6910 OU natureza com BONIFIC/BRINDE/DOACAO      → BONIFICACAO
//  - CFOP 5911/6911 OU natureza com AMOSTRA                    → AMOSTRA
//  - CFOP 5908/6908 OU natureza com COMODATO                   → COMODATO
//  - CFOP 5915/5916/6915/6916 OU natureza com REMESSA/TROCA/
//    SUBSTITUI/GARANTIA/CONSERTO                               → REMESSA_TROCA
//  - Natureza e CFOP divergindo → vale o da NATUREZA.
//  - Natureza de venda/compra normal não casa com nada → null (sem sugestão).
// ─────────────────────────────────────────────────────────────
const CFOPS_MOTIVO_ENTRADA = {
    BONIFICACAO: new Set(['5910', '6910']),
    AMOSTRA: new Set(['5911', '6911']),
    COMODATO: new Set(['5908', '6908']),
    REMESSA_TROCA: new Set(['5915', '5916', '6915', '6916'])
};

// Palavras-chave por motivo — a ordem importa: os termos ESPECÍFICOS vêm antes de
// REMESSA_TROCA ("REMESSA EM BONIFICACAO" contém REMESSA, mas o motivo é BONIFICACAO).
const NATUREZA_MOTIVO_ENTRADA = [
    ['BONIFICACAO', /BONIFIC|BRINDE|DOACAO/],
    ['AMOSTRA', /AMOSTRA/],
    ['COMODATO', /COMODATO/],
    ['REMESSA_TROCA', /REMESSA|TROCA|SUBSTITUI|GARANTIA|CONSERTO/]
];

/**
 * @param {object} p
 * @param {string|null} p.naturezaOperacao  natOp da nota (qualquer caixa/acentuação)
 * @param {Array<string|null>} p.cfops      CFOPs dos itens
 * @returns {'BONIFICACAO'|'AMOSTRA'|'REMESSA_TROCA'|'COMODATO'|null}
 */
function detectarMotivoEntrada({ naturezaOperacao, cfops } = {}) {
    // normaliza: caixa alta, sem acento
    const nat = String(naturezaOperacao || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();

    let motivoNatureza = null;
    if (nat) {
        for (const [motivo, re] of NATUREZA_MOTIVO_ENTRADA) {
            if (re.test(nat)) { motivoNatureza = motivo; break; }
        }
    }

    let motivoCfop = null;
    const lista = (Array.isArray(cfops) ? cfops : [])
        .map((c) => String(c || '').trim())
        .filter(Boolean);
    for (const [motivo, set] of Object.entries(CFOPS_MOTIVO_ENTRADA)) {
        if (lista.some((c) => set.has(c))) { motivoCfop = motivo; break; }
    }

    // Divergência → vale a natureza (é o que o emitente declarou por extenso)
    return motivoNatureza || motivoCfop || null;
}

module.exports = {
    executarCiclo,
    buscarPorChave,
    processarBuscasAgendadas,
    podeConsultar,
    statusCaptura,
    capturaAtiva,
    // Manifestação do destinatário (ato do usuário — Confirmação / Desconhecimento / Não Realizada)
    manifestar,
    MANIFESTACAO_EVENTOS,
    // gravação (reaproveitada na importação manual de XML — mesma lógica da captura automática)
    registrarProcNFe,
    // funções puras (testáveis offline)
    parseProcNFe,
    parseResNFe,
    parseEvento,
    detectarMotivoEntrada,
    normalizarJustificativa
};
