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

    // Chave: preferir o protocolo; fallback: atributo Id ("NFe<44 dígitos>")
    const chaveProt = raiz.protNFe?.infProt?.chNFe;
    const chaveId = soDigitos(inf['@_Id']);
    const chave = soDigitos(chaveProt) || chaveId;

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
            cnpj: soDigitos(emit.CNPJ || emit.CPF),
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
            cnpj: soDigitos(dest.CNPJ || dest.CPF) || null,
            nome: dest.xNome ? String(dest.xNome).trim() : null,
            ie: dest.IE ? String(dest.IE) : null,
            uf: enderDest.UF || null,
            municipio: enderDest.xMun || null,
            logradouro: enderDest.xLgr ? String(enderDest.xLgr).trim() : null,
            numero: enderDest.nro != null ? String(enderDest.nro).trim() : null,
            bairro: enderDest.xBairro ? String(enderDest.xBairro).trim() : null,
            cep: enderDest.CEP ? soDigitos(enderDest.CEP) : null
        },
        destinatarioCnpj: soDigitos(dest.CNPJ || dest.CPF) || null,
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
        chave: soDigitos(res.chNFe),
        emitenteCnpj: soDigitos(res.CNPJ || res.CPF),
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
    return { tpEvento: String(inf.tpEvento), chNFe: soDigitos(inf.chNFe) };
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

/** Pré-checagens compartilhadas (rota "consultar agora" e ciclo). */
async function podeConsultar() {
    if (!(await capturaAtiva())) return { ok: false, motivo: 'Captura de NF-e está desligada nas configurações.' };
    const cert = await certificadoAtivo();
    if (!cert) return { ok: false, motivo: 'Nenhum certificado digital instalado.' };
    if (new Date(cert.validade) < new Date()) return { ok: false, motivo: 'Certificado digital vencido.' };
    const ctrl = await getControle();
    if (ctrl.bloqueadoAte && new Date(ctrl.bloqueadoAte) > new Date()) {
        return { ok: false, motivo: `SEFAZ bloqueou consultas até ${new Date(ctrl.bloqueadoAte).toLocaleString('pt-BR')} (consumo indevido — cStat 656).` };
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
    return {
        ativa,
        ultimaConsulta: ctrl?.ultimaConsulta || null,
        ultimoResultado: ctrl?.ultimoResultado || null,
        bloqueadoAte: (ctrl?.bloqueadoAte && new Date(ctrl.bloqueadoAte) > new Date()) ? ctrl.bloqueadoAte : null,
        totalCapturadas: ctrl?.totalCapturadas || 0
    };
}

// ─────────────────────────────────────────────────────────────
// Persistência dos documentos capturados
// ─────────────────────────────────────────────────────────────

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

    // Notas já tratadas pelo usuário não voltam para NOVA — só completam o XML
    if (existente && ['CONFERIDA', 'IGNORADA', 'CANCELADA_EMITENTE'].includes(existente.status)) {
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
                // cfop existe no parse (para a DANFE) mas não é coluna do NotaEntradaItem → não persistir
                data: nota.itens.map(({ cfop, ...i }) => ({ notaEntradaId: notaId, ...i }))
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
        where: { manifestada: false, tipo: 'NFE', status: { not: 'CANCELADA_EMITENTE' } },
        select: { id: true, chave: true },
        take: 100,
        orderBy: { criadoEm: 'asc' }
    });
    if (pendentes.length === 0) return { manifestadas: 0 };

    const { RecepcaoEvento } = require('node-mde');
    const recepcao = new RecepcaoEvento({
        pfx,
        passphrase: senha,
        cnpj: soDigitos(cert.cnpj),
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
                const nota = porChave.get(soDigitos(ev.chNFe));
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
// Ciclo principal
// ─────────────────────────────────────────────────────────────

let _rodando = false;

async function executarCiclo() {
    if (_rodando) return { ok: false, motivo: 'Já existe um ciclo de captura em execução.' };
    _rodando = true;
    try {
        const pre = await podeConsultar();
        if (!pre.ok) {
            // silencioso: sem certificado / desligada é situação normal
            return pre;
        }
        const { cert } = pre;
        const cnpjNosso = soDigitos(cert.cnpj);

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

module.exports = {
    executarCiclo,
    podeConsultar,
    statusCaptura,
    capturaAtiva,
    // funções puras (testáveis offline)
    parseProcNFe,
    parseResNFe,
    parseEvento
};
