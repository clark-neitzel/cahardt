/**
 * ADN NFS-e — Distribuição de DF-e do Ambiente de Dados Nacional (Fase 4 do módulo financeiro).
 *
 * Captura automaticamente as NFS-e (notas de SERVIÇO) onde o nosso CNPJ aparece
 * como interessado (tomador/intermediário) no Sistema Nacional NFS-e:
 *   1. GET https://adn.nfse.gov.br/contribuintes/DFe/{ultNSU} com mTLS (o MESMO
 *      certificado A1 da captura de NF-e), em lotes de até 50 documentos;
 *   2. cada documento vem como XML comprimido (gzip) + base64 → NFSe completa
 *      ou Evento; NFSe → NotaEntrada tipo NFSE status NOVA + 1 item (o serviço);
 *   3. eventos de cancelamento (101101/105102) → status CANCELADA_EMITENTE;
 *   4. NSU do ADN é uma sequência PRÓPRIA (independente da SEFAZ) — o controle
 *      fica numa segunda linha da tabela dfe_controle (id = 'nfse').
 *
 * Regras operacionais:
 *   - toggle AppConfig `captura_nfse_ativa` (default ligada) + certificado ativo
 *     são pré-requisitos — sem eles o ciclo pula silenciosamente;
 *   - lote vazio / HTTP 404 = nenhum documento novo (normal, encerra o ciclo);
 *   - HTTP 429 (consumo indevido) → bloqueia novas consultas por 1h15;
 *   - notas onde o NOSSO CNPJ é o prestador são ignoradas (nossas emissões);
 *   - só aparecem aqui NFS-e de municípios integrados ao Sistema Nacional.
 *
 * A documentação oficial do ADN fica atrás do próprio mTLS, então o parse do
 * JSON de resposta é TOLERANTE a variações de caixa/nome de campo (LoteDFe/
 * loteDFe, ArquivoXml/arquivoXml etc.) e loga o que não reconhecer.
 *
 * 100% isolado: try/catch total — erro aqui JAMAIS derruba o servidor.
 * Parse do XML e do lote são funções puras exportadas (testáveis offline).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const axios = require('axios');
const prisma = require('../config/database');
const { XMLParser } = require('fast-xml-parser');

const XML_DIR = path.join(__dirname, '..', 'uploads', 'notas-xml');
const NFSE_ID = 'nfse';                  // linha própria na tabela dfe_controle
const ADN_DFE_URL = 'https://adn.nfse.gov.br/contribuintes/DFe';
const BLOQUEIO_MS = 75 * 60 * 1000;      // 1h15 (mesma pausa da NF-e)
const MAX_ITERACOES = 20;                // até ~1000 docs por ciclo
const TIMEOUT_MS = 90000;

// ─────────────────────────────────────────────────────────────
// Helpers de parse (funções puras — sem banco, sem rede)
// ─────────────────────────────────────────────────────────────

const _parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,   // mantém tudo string (preserva zeros à esquerda)
    trimValues: true,
    removeNSPrefix: true    // XML da NFS-e vem com namespace — ignora prefixos
});

const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const numOuNull = (v) => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const dataOuNull = (v) => {
    if (!v) return null;
    const s = String(v);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00-03:00`) : new Date(s);
    return isNaN(d.getTime()) ? null : d;
};

/** Busca um campo num objeto ignorando maiúsculas/minúsculas ("LoteDFe" == "loteDFe"). */
function campo(obj, ...nomes) {
    if (!obj || typeof obj !== 'object') return undefined;
    const chaves = Object.keys(obj);
    for (const nome of nomes) {
        const k = chaves.find((c) => c.toLowerCase() === nome.toLowerCase());
        if (k !== undefined && obj[k] != null) return obj[k];
    }
    return undefined;
}

/** base64 (+ gzip opcional) → string XML. Aceita XML puro também. */
function decodificarArquivoXml(valor) {
    const s = String(valor || '').trim();
    if (!s) return null;
    if (s.startsWith('<')) return s; // já é XML puro
    let buf;
    try {
        buf = Buffer.from(s, 'base64');
    } catch (_) {
        return null;
    }
    // gzip magic bytes 1f 8b
    if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
        try {
            return zlib.gunzipSync(buf).toString('utf8');
        } catch (e) {
            return null;
        }
    }
    const texto = buf.toString('utf8');
    return texto.trimStart().startsWith('<') ? texto : null;
}

/**
 * Normaliza o JSON de resposta da distribuição do ADN num array de documentos:
 * [{ nsu:Number, chave, tipoDocumento, xml }]. Função PURA e tolerante.
 */
function extrairLote(data) {
    if (!data) return [];
    let lote = campo(data, 'LoteDFe', 'Lote', 'loteDfe', 'documentos', 'DFes', 'itens');
    if (!lote && Array.isArray(data)) lote = data;
    if (!lote) return [];
    const arr = Array.isArray(lote) ? lote : [lote];

    return arr.map((doc) => {
        if (!doc || typeof doc !== 'object') return null;
        const nsu = numOuNull(campo(doc, 'NSU', 'nsu', 'NsuDistribuicao', 'numeroSequencial'));
        const chave = soDigitos(campo(doc, 'ChaveAcesso', 'chave', 'chaveAcessoNFSe', 'chNFSe'));
        const tipoDocumento = String(campo(doc, 'TipoDocumento', 'tipoDoc', 'tipo') || '').toUpperCase();
        const xml = decodificarArquivoXml(campo(doc, 'ArquivoXml', 'arquivo', 'xml', 'XmlGZipB64', 'dfeXmlGZipB64'));
        return { nsu, chave, tipoDocumento, xml };
    }).filter(Boolean);
}

/**
 * Parse do XML completo da NFS-e nacional (leiaute www.sped.fazenda.gov.br/nfse).
 * Função PURA — recebe a string do XML e devolve os dados estruturados.
 */
function parseNfse(xmlString) {
    const doc = _parser.parse(xmlString);
    const nfse = doc.NFSe || doc.nfse;
    const inf = nfse?.infNFSe;
    if (!inf) throw new Error('XML não contém infNFSe (não é uma NFS-e válida).');

    // Chave de acesso (50 dígitos): atributo Id ("NFS<50 dígitos>")
    const chave = soDigitos(inf['@_Id']);

    const emit = inf.emit || {};                    // prestador (quem emitiu a NFS-e)
    const infDPS = inf.DPS?.infDPS || {};
    const toma = infDPS.toma || {};                 // tomador (nós, normalmente)
    const serv = infDPS.serv || {};
    const valoresNota = inf.valores || {};
    const valoresDps = infDPS.valores || {};

    const vLiq = numOuNull(valoresNota.vLiq);
    const vServ = numOuNull(valoresDps.vServPrest?.vServ);
    const vTotalRet = numOuNull(valoresNota.vTotalRet);

    const descricaoServico = String(serv.cServ?.xDescServ ?? '').trim() || 'Serviço tomado';
    const codigoTributacao = serv.cServ?.cTribNac ? String(serv.cServ.cTribNac).trim() : null;

    const enderEmit = emit.enderNac || emit.end || {};

    return {
        chave,
        numero: inf.nNFSe ? String(inf.nNFSe) : null,
        serie: infDPS.serie != null ? String(infDPS.serie) : null,
        emissao: dataOuNull(infDPS.dhEmi || inf.dhProc),
        // valor a pagar = valor líquido da NFS-e; fallback: valor do serviço
        valorTotal: vLiq ?? vServ,
        valorServico: vServ,
        valorRetencoes: vTotalRet,
        descricaoServico,
        codigoTributacao,
        localEmissao: inf.xLocEmi ? String(inf.xLocEmi).trim() : null,
        localPrestacao: inf.xLocPrestacao ? String(inf.xLocPrestacao).trim() : null,
        prestador: {
            cnpj: soDigitos(emit.CNPJ || emit.CPF),
            nome: String(emit.xNome ?? '').trim() || 'Prestador desconhecido',
            im: emit.IM ? String(emit.IM) : null,
            municipio: enderEmit.xMun ? String(enderEmit.xMun).trim() : null,
            uf: enderEmit.UF || null,
            fone: emit.fone ? String(emit.fone) : null,
            email: emit.email ? String(emit.email) : null
        },
        tomador: {
            cnpj: soDigitos(toma.CNPJ || toma.CPF) || null,
            nome: toma.xNome ? String(toma.xNome).trim() : null
        }
    };
}

/**
 * Parse de um documento de EVENTO da NFS-e nacional.
 * Devolve { chave, cancelamento:Boolean } ou null se não reconhecer.
 * Cancelamento: eventos 101101 (cancelamento) e 105102 (cancelamento por substituição).
 * No leiaute nacional o evento aparece como elemento com o próprio código
 * (<e101101>) dentro de infEvento — detectamos pelos nomes das chaves.
 */
function parseEventoNfse(xmlString) {
    let doc;
    try {
        doc = _parser.parse(xmlString);
    } catch (_) {
        return null;
    }
    const raiz = doc.evento || doc.Evento || doc.procEvento || doc.pedRegEvento || doc;
    const inf = raiz?.infEvento || raiz?.infPedReg || null;
    if (!inf || typeof inf !== 'object') return null;

    const chave = soDigitos(inf.chNFSe || inf.chDFe || inf['@_Id']);
    if (!chave || chave.length < 40) return null;

    const codigos = Object.keys(inf)
        .map((k) => (/^e\d{6}$/i.test(k) ? k.slice(1) : null))
        .filter(Boolean);
    if (inf.tpEvento) codigos.push(soDigitos(inf.tpEvento));

    const cancelamento = codigos.some((c) => ['101101', '105102'].includes(c));
    return { chave, cancelamento, codigos };
}

// ─────────────────────────────────────────────────────────────
// Configuração / estado (linha 'nfse' na dfe_controle)
// ─────────────────────────────────────────────────────────────

/** Toggle AppConfig `captura_nfse_ativa` — default LIGADA (só 'false' desliga). */
async function capturaAtiva() {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'captura_nfse_ativa' } });
        const v = cfg?.value;
        return !(v === false || v === 'false');
    } catch (_) {
        return true;
    }
}

async function getControle() {
    return prisma.dfeControle.upsert({
        where: { id: NFSE_ID },
        update: {},
        create: { id: NFSE_ID }
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
    if (!(await capturaAtiva())) return { ok: false, motivo: 'Captura de NFS-e está desligada nas configurações.' };
    const cert = await certificadoAtivo();
    if (!cert) return { ok: false, motivo: 'Nenhum certificado digital instalado.' };
    if (new Date(cert.validade) < new Date()) return { ok: false, motivo: 'Certificado digital vencido.' };
    const ctrl = await getControle();
    if (ctrl.bloqueadoAte && new Date(ctrl.bloqueadoAte) > new Date()) {
        return { ok: false, motivo: `Ambiente nacional pediu pausa nas consultas até ${new Date(ctrl.bloqueadoAte).toLocaleString('pt-BR')}.` };
    }
    return { ok: true, cert, ctrl };
}

/** Status resumido para as rotas (lista de notas / config). */
async function statusCaptura() {
    const ativa = await capturaAtiva();
    let ctrl = null;
    try {
        ctrl = await prisma.dfeControle.findUnique({ where: { id: NFSE_ID } });
    } catch (_) { /* tabela ainda não criada */ }
    return {
        ativa,
        ultimaConsulta: ctrl?.ultimaConsulta || null,
        ultimoResultado: ctrl?.ultimoResultado || null,
        bloqueadoAte: (ctrl?.bloqueadoAte && new Date(ctrl.bloqueadoAte) > new Date()) ? ctrl.bloqueadoAte : null,
        totalCapturadas: ctrl?.totalCapturadas || 0
    };
}

// ─────────────────────────────────────────────────────────────
// Persistência
// ─────────────────────────────────────────────────────────────

/** Garante o Fornecedor pelo CNPJ do prestador (auto-criado com origem NFSE). */
async function garantirFornecedor(cnpj, nome) {
    if (!cnpj) return null;
    try {
        const existente = await prisma.fornecedor.findFirst({ where: { cnpjCpf: cnpj } });
        if (existente) return existente;
        return await prisma.fornecedor.create({
            data: {
                cnpjCpf: cnpj,
                razaoSocial: nome || `Fornecedor ${cnpj}`,
                origem: 'NFSE',
                statusEnvioCA: 'NAO_ENVIAR'
            }
        });
    } catch (e) {
        console.warn('[NFSe ADN] Falha ao garantir fornecedor', cnpj, e.message);
        return null;
    }
}

/** NFSe completa → salva XML + NotaEntrada NFSE status NOVA + 1 item (o serviço). Dedup por chave. */
async function registrarNfse(xmlString, nsu, cnpjNosso) {
    const nota = parseNfse(xmlString);
    if (!nota.chave || nota.chave.length < 40) return { capturada: false };
    if (nota.prestador.cnpj && nota.prestador.cnpj === cnpjNosso) return { capturada: false }; // nossa emissão

    if (!fs.existsSync(XML_DIR)) fs.mkdirSync(XML_DIR, { recursive: true });
    const xmlPath = path.posix.join('uploads', 'notas-xml', `${nota.chave}.xml`);
    fs.writeFileSync(path.join(XML_DIR, `${nota.chave}.xml`), xmlString, 'utf8');

    const existente = await prisma.notaEntrada.findUnique({ where: { chave: nota.chave } });

    // Notas já tratadas pelo usuário não voltam para NOVA
    if (existente && ['CONFERIDA', 'IGNORADA', 'CANCELADA_EMITENTE'].includes(existente.status)) {
        await prisma.notaEntrada.update({
            where: { chave: nota.chave },
            data: { xmlPath, nsu: nsu != null ? String(nsu) : existente.nsu }
        });
        return { capturada: false };
    }

    const fornecedor = await garantirFornecedor(nota.prestador.cnpj, nota.prestador.nome);

    // Observações da nota: retenções + local (ajuda a conferir o valor líquido)
    const obs = [];
    if (nota.valorRetencoes != null && nota.valorRetencoes > 0) {
        obs.push(`Serviço R$ ${Number(nota.valorServico ?? 0).toFixed(2)} − retenções R$ ${Number(nota.valorRetencoes).toFixed(2)} = líquido R$ ${Number(nota.valorTotal ?? 0).toFixed(2)}.`);
    }
    if (nota.localEmissao) obs.push(`Emitida em ${nota.localEmissao}.`);

    const dados = {
        tipo: 'NFSE',
        nsu: nsu != null ? String(nsu) : existente?.nsu || null,
        numero: nota.numero,
        serie: nota.serie,
        fornecedorCnpj: nota.prestador.cnpj,
        fornecedorNome: nota.prestador.nome,
        fornecedorId: fornecedor?.id || null,
        emissao: nota.emissao,
        valorTotal: nota.valorTotal,
        infComplementar: obs.length > 0 ? obs.join(' ') : null,
        status: 'NOVA',
        xmlPath,
        manifestada: true // NFS-e não tem manifestação de ciência
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
        // Dedup total: 1 item = o serviço da nota
        await tx.notaEntradaItem.deleteMany({ where: { notaEntradaId: notaId } });
        await tx.notaEntradaDuplicata.deleteMany({ where: { notaEntradaId: notaId } });
        await tx.notaEntradaItem.create({
            data: {
                notaEntradaId: notaId,
                numeroItem: 1,
                codigoFornecedor: nota.codigoTributacao || 'SERVICO',
                descricao: nota.descricaoServico.substring(0, 1000),
                unidade: 'SV',
                quantidade: 1,
                valorUnitario: nota.valorTotal ?? 0,
                valorTotal: nota.valorTotal ?? 0
            }
        });
    }, { timeout: 20000, maxWait: 10000 });

    return { capturada: !existente };
}

/** Evento de cancelamento → CANCELADA_EMITENTE (exceto se já CONFERIDA). */
async function registrarEventoNfse(xmlString) {
    const ev = parseEventoNfse(xmlString);
    if (!ev || !ev.cancelamento) return;
    await prisma.notaEntrada.updateMany({
        where: { chave: ev.chave, status: { not: 'CONFERIDA' } },
        data: { status: 'CANCELADA_EMITENTE' }
    });
    const conferida = await prisma.notaEntrada.findFirst({
        where: { chave: ev.chave, status: 'CONFERIDA' },
        select: { id: true, numero: true }
    });
    if (conferida) {
        console.warn(`[NFSe ADN] ⚠️ NFS-e ${conferida.numero || ev.chave} foi CANCELADA pelo prestador mas já tinha conta a pagar gerada — confira a conta!`);
    }
}

// ─────────────────────────────────────────────────────────────
// Ciclo principal
// ─────────────────────────────────────────────────────────────

let _rodando = false;

async function executarCiclo() {
    if (_rodando) return { ok: false, motivo: 'Já existe um ciclo de captura de NFS-e em execução.' };
    _rodando = true;
    try {
        const pre = await podeConsultar();
        if (!pre.ok) return pre; // silencioso: sem certificado / desligada é situação normal
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

        const agent = new https.Agent({ pfx, passphrase: senha, keepAlive: false });

        let capturadas = 0;
        let processados = 0;
        let resultado = '';

        for (let iter = 0; iter < MAX_ITERACOES; iter++) {
            const ctrl = await getControle();
            const ultNSU = String(ctrl.ultNSU || '0');

            let resp;
            try {
                resp = await axios.get(`${ADN_DFE_URL}/${ultNSU}`, {
                    httpsAgent: agent,
                    timeout: TIMEOUT_MS,
                    validateStatus: () => true,
                    headers: { Accept: 'application/json' }
                });
            } catch (e) {
                resultado = `Erro de conexão com o ambiente nacional: ${String(e.message).substring(0, 400)}`;
                break;
            }

            if (resp.status === 404) {
                resultado = `Nenhum documento novo. ${processados > 0 ? `${processados} docs processados neste ciclo.` : ''}`.trim();
                break;
            }
            if (resp.status === 429) {
                const ate = new Date(Date.now() + BLOQUEIO_MS);
                await prisma.dfeControle.update({ where: { id: NFSE_ID }, data: { bloqueadoAte: ate } });
                resultado = `Ambiente nacional pediu pausa (HTTP 429) — consultas pausadas até ${ate.toLocaleString('pt-BR')}.`;
                break;
            }
            if (resp.status < 200 || resp.status >= 300) {
                const corpo = typeof resp.data === 'string'
                    ? resp.data
                    : JSON.stringify(campo(resp.data, 'Erros', 'erros', 'mensagem', 'Mensagem', 'StatusProcessamento') ?? resp.data ?? '');
                resultado = `Ambiente nacional retornou HTTP ${resp.status}: ${String(corpo).substring(0, 400)}`;
                break;
            }

            const lote = extrairLote(resp.data);
            if (lote.length === 0) {
                resultado = `Nenhum documento novo. ${processados > 0 ? `${processados} docs processados neste ciclo.` : ''}`.trim();
                break;
            }

            let maiorNSU = BigInt(soDigitos(ultNSU) || '0');
            for (const docItem of lote) {
                processados++;
                try {
                    if (docItem.nsu != null && BigInt(docItem.nsu) > maiorNSU) maiorNSU = BigInt(docItem.nsu);
                    if (!docItem.xml) {
                        console.warn(`[NFSe ADN] Documento NSU ${docItem.nsu} sem XML legível — ignorado.`);
                        continue;
                    }
                    // NFSe completa ou evento? Decide pelo conteúdo (TipoDocumento nem sempre vem)
                    const ehEvento = docItem.tipoDocumento.includes('EVENTO') || /<(\w+:)?infEvento[\s>]/.test(docItem.xml) || /<(\w+:)?infPedReg[\s>]/.test(docItem.xml);
                    if (ehEvento) {
                        await registrarEventoNfse(docItem.xml);
                    } else if (/<(\w+:)?infNFSe[\s>]/.test(docItem.xml)) {
                        const r = await registrarNfse(docItem.xml, docItem.nsu, cnpjNosso);
                        if (r.capturada) capturadas++;
                    } else {
                        // DPS solta e outros leiautes não interessam para contas a pagar
                    }
                } catch (e) {
                    console.warn(`[NFSe ADN] Falha ao processar doc NSU ${docItem.nsu}:`, e.message);
                }
            }

            // Avança o ponteiro. Se o lote não avançou o NSU, para (evita loop infinito).
            const nsuAnterior = BigInt(soDigitos(ultNSU) || '0');
            if (maiorNSU <= nsuAnterior) {
                resultado = `Ciclo completo: ${processados} documento(s) processado(s), ${capturadas} nota(s) nova(s).`;
                break;
            }
            await prisma.dfeControle.update({
                where: { id: NFSE_ID },
                data: { ultNSU: String(maiorNSU) }
            });

            resultado = `Ciclo ${lote.length < 50 ? 'completo' : 'parcial'}: ${processados} documento(s) processado(s), ${capturadas} nota(s) nova(s).`;
            if (lote.length < 50) break; // lote incompleto = chegamos ao fim
        }

        await prisma.dfeControle.update({
            where: { id: NFSE_ID },
            data: {
                ultimaConsulta: new Date(),
                ultimoResultado: (resultado || 'Ciclo executado.').substring(0, 2000),
                totalCapturadas: { increment: capturadas }
            }
        });

        console.log(`[NFSe ADN] ${resultado || 'Ciclo executado.'}`);
        return { ok: true, capturadas, processados, resultado };
    } catch (error) {
        console.error('[NFSe ADN] Erro no ciclo de captura:', error.message);
        try {
            await _salvarResultado(`Erro no ciclo: ${error.message}`.substring(0, 2000));
        } catch (_) { /* nunca derruba */ }
        return { ok: false, motivo: error.message };
    } finally {
        _rodando = false;
    }
}

async function _salvarResultado(texto) {
    await prisma.dfeControle.upsert({
        where: { id: NFSE_ID },
        update: { ultimaConsulta: new Date(), ultimoResultado: texto },
        create: { id: NFSE_ID, ultimaConsulta: new Date(), ultimoResultado: texto }
    });
}

// ─────────────────────────────────────────────────────────────
// Espelho da NFS-e (HTML para impressão — equivalente à DANFE)
// ─────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmtBRL = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
const fmtCnpjBr = (c) => {
    const d = soDigitos(c);
    return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : (c || '—');
};

/** Monta o espelho (DANFSE simplificada) em HTML a partir do XML salvo. */
function montarEspelhoNfseHtml(xmlString) {
    const n = parseNfse(xmlString);
    const emissao = n.emissao ? new Date(n.emissao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>NFS-e ${esc(n.numero || '')}</title>
<style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; }
    .folha { max-width: 190mm; margin: 0 auto; }
    .cab { border: 1px solid #000; padding: 8px 10px; display: flex; justify-content: space-between; align-items: baseline; }
    .cab h1 { font-size: 15px; margin: 0; }
    .cab .num { font-size: 13px; font-weight: bold; }
    .bloco { border: 1px solid #000; border-top: none; padding: 6px 10px; }
    .titulo { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #444; margin-bottom: 2px; }
    .linha { display: flex; gap: 16px; flex-wrap: wrap; }
    .campo { min-width: 120px; }
    .campo b { display: block; font-size: 12px; font-weight: 600; }
    .desc { white-space: pre-wrap; word-break: break-word; }
    .valores td { padding: 3px 8px; }
    .valores { width: 100%; border-collapse: collapse; }
    .valores .tot { font-size: 14px; font-weight: bold; }
    .chave { font-family: monospace; font-size: 11px; word-break: break-all; }
    .rodape { margin-top: 6px; font-size: 10px; color: #555; }
</style>
</head>
<body>
<div class="folha">
    <div class="cab">
        <h1>NFS-e — Nota Fiscal de Serviço eletrônica</h1>
        <span class="num">Nº ${esc(n.numero || 's/nº')}${n.serie ? ` · Série ${esc(n.serie)}` : ''}</span>
    </div>
    <div class="bloco">
        <div class="linha">
            <div class="campo"><span class="titulo">Emissão</span><b>${esc(emissao)}</b></div>
            ${n.localEmissao ? `<div class="campo"><span class="titulo">Local de emissão</span><b>${esc(n.localEmissao)}</b></div>` : ''}
            ${n.localPrestacao && n.localPrestacao !== n.localEmissao ? `<div class="campo"><span class="titulo">Local da prestação</span><b>${esc(n.localPrestacao)}</b></div>` : ''}
        </div>
    </div>
    <div class="bloco">
        <div class="titulo">Prestador do serviço</div>
        <div class="linha">
            <div class="campo" style="flex:1"><b>${esc(n.prestador.nome)}</b>CNPJ ${esc(fmtCnpjBr(n.prestador.cnpj))}</div>
            ${n.prestador.municipio ? `<div class="campo"><span class="titulo">Município</span><b>${esc(n.prestador.municipio)}${n.prestador.uf ? ` / ${esc(n.prestador.uf)}` : ''}</b></div>` : ''}
        </div>
    </div>
    <div class="bloco">
        <div class="titulo">Tomador do serviço</div>
        <b>${esc(n.tomador.nome || '—')}</b>${n.tomador.cnpj ? ` — CNPJ/CPF ${esc(fmtCnpjBr(n.tomador.cnpj))}` : ''}
    </div>
    <div class="bloco">
        <div class="titulo">Discriminação do serviço${n.codigoTributacao ? ` (cód. trib. nacional ${esc(n.codigoTributacao)})` : ''}</div>
        <div class="desc">${esc(n.descricaoServico)}</div>
    </div>
    <div class="bloco">
        <table class="valores">
            <tr><td>Valor do serviço</td><td style="text-align:right">R$ ${fmtBRL(n.valorServico ?? n.valorTotal)}</td></tr>
            ${n.valorRetencoes != null && n.valorRetencoes > 0 ? `<tr><td>(−) Retenções</td><td style="text-align:right">R$ ${fmtBRL(n.valorRetencoes)}</td></tr>` : ''}
            <tr class="tot"><td>Valor líquido da NFS-e</td><td style="text-align:right">R$ ${fmtBRL(n.valorTotal)}</td></tr>
        </table>
    </div>
    <div class="bloco">
        <div class="titulo">Chave de acesso</div>
        <div class="chave">${esc(n.chave)}</div>
    </div>
    <div class="rodape">Espelho gerado pelo sistema a partir do XML oficial capturado no ambiente nacional da NFS-e (nfse.gov.br). Consulte a nota pela chave de acesso para a via oficial.</div>
</div>
</body>
</html>`;
}

module.exports = {
    executarCiclo,
    podeConsultar,
    statusCaptura,
    capturaAtiva,
    montarEspelhoNfseHtml,
    // gravação (reaproveitada na importação manual de XML — mesma lógica da captura automática)
    registrarNfse,
    // funções puras (testáveis offline)
    parseNfse,
    parseEventoNfse,
    extrairLote,
    decodificarArquivoXml
};
