/**
 * MANIFESTAÇÃO DO DESTINATÁRIO — PROVA DE BANCADA EM HOMOLOGAÇÃO (tpAmb = 2).
 *
 * Este módulo NÃO faz parte do fluxo fiscal do app. Ele existe por um motivo só:
 * provar, SEM RISCO, as três partes da manifestação que só aparecem quando o XML
 * de verdade sai daqui assinado pelo certificado A1 REAL:
 *
 *   1. ENVELOPE      — que o 210220 (Desconhecimento) vai SEM `xJust` e o 210240
 *                      (Operação não Realizada) vai COM `xJust`. A lib do node-mde
 *                      escreve `xJust` em QUALQUER evento que receba `justificativa`,
 *                      e a SEFAZ rejeita 210200/210220 com xJust por schema.
 *   2. ASSINATURA/TRANSPORTE — que o .pfx abre com a senha guardada, que o XML sai
 *                      assinado e que a SEFAZ responde de verdade.
 *   3. CLASSIFICAÇÃO — que uma REJEIÇÃO é lida como "não aceita" pela mesma regra do
 *                      `sefazDfeService.manifestar` (`cStat` ∈ 135/136 = aceito).
 *
 * ═══ POR QUE ISTO É SEGURO ═══
 *
 *  a) `tpAmb` é a CONSTANTE `TP_AMB_HOMOLOGACAO = '2'`. Não há parâmetro, env, nem
 *     argumento que mude isso. O tpAmb decide o endpoint dentro da própria lib
 *     (`node-mde/lib/env/recepcao.js`): 2 → hom1.nfe.fazenda.gov.br. Produção é 1 e
 *     esse 1 não é alcançável a partir daqui.
 *  b) A chave de acesso é FICTÍCIA e gerada aqui (`chaveFicticia()`), com o CNPJ de
 *     teste `00000000000191` como emitente. Nunca vem de fora e nunca é a chave de
 *     uma nota real — nem do banco, nem de query string. Ninguém detém certificado
 *     desse CNPJ, então nenhuma NF-e com essa chave pode existir nem em homologação:
 *     a resposta da SEFAZ é SEMPRE uma rejeição, e é exatamente essa rejeição que
 *     prova que assinatura e transporte funcionaram.
 *  c) NÃO escreve nada no banco. A única ida ao banco é a LEITURA do certificado
 *     ativo (`certificados_digitais`). Nada de `NotaEntrada`, nada de
 *     `NotaEntradaManifestacao`.
 *  d) NÃO reaproveita `sefazDfeService.manifestar` de propósito: aquela função é
 *     tpAmb=1 e grava histórico. Aqui se fala com o `RecepcaoEvento` do node-mde
 *     direto — o MESMO caminho de credencial (`{ pfx, passphrase }`), que é o ponto
 *     que se quer provar.
 *
 * Consumidores: `routes/adminExec.js` (GET /diag-manifestacao-sefaz, é o único jeito
 * de rodar isto em produção — não há shell no container) e o script de bancada
 * `scripts/manifestacao-homologacao.js`.
 */

const { normalizarDoc } = require('../utils/documento');

/** Ambiente FIXO. Mudar isto para '1' manifestaria notas de verdade — não faça. */
const TP_AMB_HOMOLOGACAO = '2';

/** Endpoint que a lib usa quando tpAmb = 2 (só para o relatório dizer para onde foi). */
const ENDPOINT_HOMOLOGACAO = 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx?wsdl';

/** MESMA regra do `sefazDfeService.manifestar`: só 135/136 é evento registrado. */
const CSTAT_EVENTO_ACEITO = ['135', '136'];

/** Teto curto de propósito: é diagnóstico dentro de uma requisição HTTP. */
const TIMEOUT_PADRAO_MS = 15000;

const JUSTIFICATIVA_TESTE = 'Teste de homologacao da manifestacao do destinatario do app';

// CNPJ de teste consagrado. Não pertence a ninguém que possa emitir NF-e — é o que
// garante que a chave gerada aqui não bate com nota nenhuma, real ou de homologação.
const CNPJ_EMITENTE_FICTICIO = '00000000000191';

/** Os dois eventos que valem a pena provar: o que NÃO pode levar xJust e o que precisa levar. */
const CASOS = [
    { tpEvento: 210220, rotulo: 'Desconhecimento da Operação', xJustEsperado: false },
    { tpEvento: 210240, rotulo: 'Operação não Realizada', xJustEsperado: true }
];

// ─────────────────────────────────────────────────────────────
// Chave de acesso fictícia
// ─────────────────────────────────────────────────────────────

/**
 * Dígito verificador da chave de acesso da NF-e: módulo 11, pesos 2..9 ciclando da
 * DIREITA para a esquerda sobre os 43 primeiros dígitos. Resto 0 ou 1 → DV 0.
 * (Conferido contra 4 chaves autorizadas reais de produção: acertou as 4.)
 * @param {string} chave43
 * @returns {string} um dígito
 */
function dvChaveAcesso(chave43) {
    let peso = 2;
    let soma = 0;
    for (let i = chave43.length - 1; i >= 0; i--) {
        soma += Number(chave43[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    return String(resto === 0 || resto === 1 ? 0 : 11 - resto);
}

/** true se a chave tem 44 dígitos E o DV fecha. */
function chaveTemDvValido(chave) {
    const c = String(chave || '');
    return /^\d{44}$/.test(c) && dvChaveAcesso(c.slice(0, 43)) === c[43];
}

/**
 * Monta uma chave de acesso de 44 dígitos com DV válido e emitente FICTÍCIO.
 * Layout: cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) DV(1).
 *
 * O DV precisa fechar: com DV errado a SEFAZ responde "dígito verificador inválido"
 * e a gente não descobre se o problema era a chave ou a assinatura. Com DV certo, a
 * resposta esperada é "NF-e não consta na base de dados" — que é o que prova o resto.
 *
 * @param {Date} [agora]
 * @returns {string} 44 dígitos
 */
function chaveFicticia(agora = new Date()) {
    const aa = String(agora.getFullYear()).slice(-2);
    const mm = String(agora.getMonth() + 1).padStart(2, '0');
    const base = [
        '42',                       // cUF — SC
        aa + mm,                    // AAMM da emissão
        CNPJ_EMITENTE_FICTICIO,     // emitente que não existe
        '55',                       // modelo NF-e
        '001',                      // série
        '000000001',                // nNF
        '1',                        // tpEmis — normal
        '00000001'                  // cNF
    ].join('');
    return base + dvChaveAcesso(base);
}

// ─────────────────────────────────────────────────────────────
// Certificado A1 real — MESMO caminho da produção
// ─────────────────────────────────────────────────────────────

/**
 * Lê o certificado A1 ATIVO do banco e o devolve no MESMO formato que a produção usa:
 * `pfx` (Buffer) + `senha` crus, saídos de `certificadoService.descriptografarCertificado`.
 *
 * Isto é metade da razão de existir deste módulo: em produção o
 * `sefazDfeService.manifestar` entrega `{ pfx, passphrase }` e deixa a própria lib abrir
 * o PKCS#12. Se aqui a gente já entregasse PEM pronto, o teste pularia justamente o
 * passo que mais falha no servidor — senha errada, .pfx corrompido, cadeia incompleta.
 *
 * SOMENTE LEITURA. Nunca lança: devolve o erro descrito.
 * @returns {Promise<{encontrado:boolean, descriptografado:boolean, pfx?:Buffer, senha?:string,
 *                    cnpj?:string, titular?:string, validade?:Date, erro:string|null}>}
 */
async function credenciaisDoBanco() {
    const prisma = require('../config/database');
    let registro = null;
    try {
        registro = await prisma.certificadoDigital.findFirst({
            where: { ativo: true },
            orderBy: { instaladoEm: 'desc' }
        });
    } catch (e) {
        return { encontrado: false, descriptografado: false, erro: `Falha ao ler o certificado no banco: ${e.message}` };
    }
    if (!registro) {
        return { encontrado: false, descriptografado: false, erro: 'Nenhum certificado A1 ativo cadastrado.' };
    }

    const comum = {
        encontrado: true,
        cnpj: normalizarDoc(registro.cnpj),
        titular: registro.titular || null,
        validade: registro.validade
    };

    try {
        const certificadoService = require('./certificadoService');
        const { pfx, senha } = certificadoService.descriptografarCertificado(registro);
        return { ...comum, descriptografado: true, pfx, senha, erro: null };
    } catch (e) {
        // Aqui cai o clássico: CERT_ENC_KEY/JWT_SECRET trocado, ou o arquivo do .pfx
        // sumiu do volume num deploy.
        return { ...comum, descriptografado: false, erro: `Falha ao descriptografar o certificado: ${e.message}` };
    }
}

/**
 * O que vai para o construtor do `RecepcaoEvento` — idêntico à produção quando há A1:
 * `{ pfx, passphrase }`. Só o certificado descartável do script cai no PEM direto.
 */
function credenciaisRecepcao(cred) {
    return cred.pfx ? { pfx: cred.pfx, passphrase: cred.senha } : { cert: cred.cert, key: cred.key };
}

/**
 * Abre o .pfx com a senha pelo MESMO `Certificado.p12ToPem` que o `CertificadoValidator`
 * da lib usa por dentro — então uma senha errada estoura AQUI, com mensagem clara, em vez
 * de virar um erro cru do node-forge lá dentro do construtor.
 * Nunca lança.
 * @returns {{ok:boolean, cert?:string, key?:string, erro:string|null}}
 */
function abrirPfx(cred) {
    if (!cred.pfx) return { ok: true, cert: cred.cert, key: cred.key, erro: null };
    try {
        const { Certificado } = require('node-mde/lib/util');
        const pem = Certificado.p12ToPem(cred.pfx, cred.senha);
        return { ok: true, cert: pem.cert.toString(), key: pem.key.toString(), erro: null };
    } catch (e) {
        return { ok: false, erro: `O .pfx não abriu com a senha guardada: ${e.message}` };
    }
}

// ─────────────────────────────────────────────────────────────
// Envio a UM evento em homologação
// ─────────────────────────────────────────────────────────────

/**
 * Condensa o erro de transporte. Quando a SEFAZ recusa o certificado do cliente ela
 * devolve uma PÁGINA HTML de erro inteira (403 do IIS) — despejar isso cru na resposta
 * enterra a informação útil. Aqui as tags caem e sobra o texto.
 */
function _resumirErro(bruto) {
    if (bruto == null) return null;
    const texto = String(bruto);
    const limpo = /<\s*(html|!doctype)/i.test(texto)
        ? texto.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
        : texto.replace(/\s+/g, ' ').trim();
    return limpo.substring(0, 400) || null;
}

/** Recorta um pedaço do XML sem estourar a resposta. */
function _trecho(xml, abre, fecha) {
    if (typeof xml !== 'string') return null;
    const i = xml.indexOf(abre);
    if (i < 0) return null;
    const f = xml.indexOf(fecha, i);
    if (f < 0) return null;
    return xml.substring(i, f + fecha.length).substring(0, 1200);
}

/**
 * Monta, ASSINA e envia UM evento de manifestação para a SEFAZ de HOMOLOGAÇÃO.
 * NUNCA lança — devolve sempre um objeto com o que deu.
 *
 * @param {object} cred          saída de `credenciaisDoBanco()` (ou o descartável do script)
 * @param {string} cnpj          CNPJ do destinatário (o do certificado)
 * @param {string} chave         chave FICTÍCIA de 44 dígitos
 * @param {{tpEvento:number, rotulo:string, xJustEsperado:boolean}} caso
 * @param {number} [timeoutMs]
 */
async function enviarCaso(cred, cnpj, chave, caso, timeoutMs = TIMEOUT_PADRAO_MS) {
    const inicio = Date.now();
    const saida = {
        tpEvento: caso.tpEvento,
        rotulo: caso.rotulo,
        xJustEsperado: caso.xJustEsperado,
        enviado: false,
        erroTransporte: null,
        envelope: null,
        resposta: null,
        msDecorridos: 0
    };

    let resultado = null;
    try {
        const { RecepcaoEvento } = require('node-mde');
        const recepcao = new RecepcaoEvento({
            // MESMO caminho de credencial da produção: { pfx, passphrase }.
            ...credenciaisRecepcao(cred),
            cnpj,
            tpAmb: TP_AMB_HOMOLOGACAO,   // constante — jamais parametrizável
            options: { requestOptions: { timeout: timeoutMs } }
        });
        resultado = await recepcao.enviarEvento({
            idLote: String(Date.now()),
            lote: [{
                chNFe: chave,
                tipoEvento: caso.tpEvento,
                // xJust SÓ no 210240 — é esta linha que o teste existe para provar.
                ...(caso.xJustEsperado ? { justificativa: JUSTIFICATIVA_TESTE } : {})
            }]
        });
        saida.enviado = true;
        if (resultado?.error) saida.erroTransporte = _resumirErro(resultado.error);
    } catch (e) {
        // Cai aqui o .pfx que não abre, o lote que não valida e qualquer estouro da lib.
        saida.erroTransporte = _resumirErro(e?.message || e);
    }
    saida.msDecorridos = Date.now() - inicio;

    // ── O ENVELOPE que REALMENTE saiu (a lib devolve o XML da requisição em `reqXml`) ──
    // Vale mais do que remontar o XML aqui: é o pacote que a SEFAZ recebeu.
    const xml = typeof resultado?.reqXml === 'string' ? resultado.reqXml : null;
    if (xml) {
        const temXJust = /<xJust>/.test(xml);
        saida.envelope = {
            temXJust,
            xJustBate: temXJust === caso.xJustEsperado,
            assinado: /<Signature/.test(xml),
            tpAmbNoXml: (xml.match(/<tpAmb>([^<]+)</) || [])[1] || null,
            idEvento: (xml.match(/Id="([^"]+)"/) || [])[1] || null,
            nSeqEvento: (xml.match(/<nSeqEvento>([^<]+)</) || [])[1] || null,
            chNFeNoXml: (xml.match(/<chNFe>([^<]+)</) || [])[1] || null,
            // Só o miolo do evento (não vai o certificado nem a assinatura inteira).
            infEventoXml: _trecho(xml, '<infEvento', '</infEvento>')
        };
    }

    // ── Leitura da resposta, com a MESMA regra do sefazDfeService.manifestar ──
    const ev = Array.isArray(resultado?.data?.infEvento) ? resultado.data.infEvento[0] : null;
    const cStatEvento = ev?.cStat != null && ev.cStat !== '' ? String(ev.cStat) : null;
    const cStatLote = resultado?.data?.cStat != null && resultado.data.cStat !== '' ? String(resultado.data.cStat) : null;
    const aceito = !saida.erroTransporte && !!ev && CSTAT_EVENTO_ACEITO.includes(cStatEvento);

    saida.resposta = {
        statusHttp: resultado?.status ?? null,
        cStatLote,
        xMotivoLote: resultado?.data?.xMotivo ? String(resultado.data.xMotivo).substring(0, 500) : null,
        cStatEvento,
        xMotivoEvento: ev?.xMotivo ? String(ev.xMotivo).substring(0, 500) : null,
        protocolo: ev?.nProt ? String(ev.nProt) : null,
        infEvento: ev || null,
        aceitoPelaRegraDoApp: aceito,
        // Em homologação, com chave que não existe, ACEITO seria o alarme.
        esperado: 'REJEITADA (a nota fictícia não consta na base da SEFAZ)'
    };
    return saida;
}

// ─────────────────────────────────────────────────────────────
// Diagnóstico completo (o que a rota devolve)
// ─────────────────────────────────────────────────────────────

/**
 * Roda os dois casos contra a SEFAZ de HOMOLOGAÇÃO com o certificado A1 real.
 * NUNCA lança — devolve sempre o relatório, mesmo quando tudo falha.
 * NÃO escreve no banco.
 *
 * @param {{timeoutMs?:number}} [opts]
 */
async function diagnosticar({ timeoutMs = TIMEOUT_PADRAO_MS } = {}) {
    const inicio = Date.now();
    const chave = chaveFicticia();

    const relatorio = {
        ok: false,
        ambiente: {
            tpAmb: TP_AMB_HOMOLOGACAO,
            rotulo: 'HOMOLOGAÇÃO',
            endpoint: ENDPOINT_HOMOLOGACAO,
            observacao: 'tpAmb é constante no código. Não há parâmetro que aponte esta rota para produção.'
        },
        chaveFicticia: {
            chave,
            dvValido: chaveTemDvValido(chave),
            cnpjEmitente: CNPJ_EMITENTE_FICTICIO,
            observacao: 'Gerada aqui. Emitente de teste, nota inexistente — a rejeição da SEFAZ é o resultado esperado.'
        },
        certificado: null,
        casos: [],
        veredito: null,
        msTotal: 0
    };

    const cred = await credenciaisDoBanco();
    relatorio.certificado = {
        encontrado: cred.encontrado,
        descriptografado: cred.descriptografado,
        cnpj: cred.cnpj || null,
        titular: cred.titular || null,
        validade: cred.validade || null,
        vencido: cred.validade ? new Date(cred.validade) < new Date() : null,
        pfxAbriuComASenha: null,
        erro: cred.erro
    };

    if (!cred.descriptografado) {
        relatorio.veredito = `NÃO PROVADO — ${cred.erro}`;
        relatorio.msTotal = Date.now() - inicio;
        return relatorio;
    }

    // Trava de sanidade: a chave fictícia JAMAIS pode carregar o nosso CNPJ.
    if (cred.cnpj && chave.slice(6, 20) === cred.cnpj) {
        relatorio.veredito = 'ABORTADO — a chave gerada bateu com o CNPJ do certificado. Não enviado.';
        relatorio.msTotal = Date.now() - inicio;
        return relatorio;
    }

    const pem = abrirPfx(cred);
    relatorio.certificado.pfxAbriuComASenha = pem.ok;
    if (!pem.ok) {
        relatorio.certificado.erro = pem.erro;
        relatorio.veredito = `NÃO PROVADO — ${pem.erro}`;
        relatorio.msTotal = Date.now() - inicio;
        return relatorio;
    }

    for (const caso of CASOS) {
        // eslint-disable-next-line no-await-in-loop
        relatorio.casos.push(await enviarCaso(cred, cred.cnpj, chave, caso, timeoutMs));
    }

    // ── Veredito ──
    const envelopesOk = relatorio.casos.every(c => c.envelope?.xJustBate === true);
    const assinados = relatorio.casos.every(c => c.envelope?.assinado === true);
    const ambienteOk = relatorio.casos.every(c => c.envelope?.tpAmbNoXml === TP_AMB_HOMOLOGACAO);
    const responderam = relatorio.casos.every(c => !c.erroTransporte && (c.resposta?.cStatEvento || c.resposta?.cStatLote));
    const nenhumAceito = relatorio.casos.every(c => c.resposta?.aceitoPelaRegraDoApp === false);

    relatorio.conferencia = { envelopesOk, assinados, ambienteOk, responderam, nenhumAceito };
    relatorio.ok = envelopesOk && assinados && ambienteOk && responderam && nenhumAceito;
    relatorio.veredito = relatorio.ok
        ? 'PROVADO — o A1 real assinou, a SEFAZ de homologação respondeu, o xJust saiu só no 210240 e a rejeição foi lida como NÃO aceita.'
        : !responderam
            ? 'NÃO PROVADO — a SEFAZ de homologação não respondeu (ver erroTransporte de cada caso). Assinatura/envelope podem estar certos, mas o transporte não ficou provado.'
            : !envelopesOk
                ? 'FALHOU — o xJust saiu no evento errado. Corrigir antes de confiar na manifestação.'
                : !nenhumAceito
                    ? 'ALARME — a SEFAZ ACEITOU um evento para uma nota fictícia. Investigar antes de usar.'
                    : 'INCONCLUSIVO — ver a conferência item a item.';

    relatorio.msTotal = Date.now() - inicio;
    return relatorio;
}

// ─────────────────────────────────────────────────────────────
// Só para o script de bancada (não usado pela rota)
// ─────────────────────────────────────────────────────────────

/**
 * Certificado autoassinado descartável, gerado em memória. Serve só para conferir o
 * ENVELOPE quando não há A1 no banco (máquina de desenvolvimento): a SEFAZ recusa o
 * TLS/assinatura, então nesse modo o passo "transporte" NÃO fica provado.
 */
function certificadoDescartavel() {
    const forge = require('node-forge');
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 86400000);
    const attrs = [{ name: 'commonName', value: 'TESTE HOMOLOGACAO CA-HARDT' }];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return {
        encontrado: false,
        descriptografado: true,
        pfx: null,
        senha: null,
        cert: forge.pki.certificateToPem(cert),
        key: forge.pki.privateKeyToPem(keys.privateKey),
        cnpj: CNPJ_EMITENTE_FICTICIO,
        titular: 'TESTE HOMOLOGACAO CA-HARDT',
        validade: cert.validity.notAfter,
        falso: true,
        erro: null
    };
}

/**
 * Monta e ASSINA o XML sem chamar a SEFAZ (modo `--so-xml` do script de bancada).
 * Útil quando não há rede/A1: dá para conferir envelope e assinatura offline.
 */
function montarXmlOffline(cred, cnpj, chave, caso) {
    const { RecepcaoHelper } = require('node-mde/lib/helpers');
    const { EventoValidator, LoteValidator } = require('node-mde/lib/validators');
    const { Data } = require('node-mde/lib/util');

    const idLote = String(Date.now());
    const evento = {
        chNFe: chave,
        tipoEvento: caso.tpEvento,
        ...(caso.xJustEsperado ? { justificativa: JUSTIFICATIVA_TESTE } : {})
    };
    const lote = new LoteValidator({ idLote, lote: [evento] });
    if (!lote.isValid()) throw new Error(lote.getError());

    const eventos = lote.getValues().lote.map((e) => {
        const v = new EventoValidator(e);
        if (!v.isValid()) throw new Error(v.getError());
        const { chNFe, justificativa, tpEvento, descEvento } = v.getValues();
        const item = {};
        if (justificativa) item.xJust = justificativa;
        item.idLote = idLote;
        item.nSeqEvento = '1';
        item.cOrgao = '91';
        item.tpAmb = TP_AMB_HOMOLOGACAO;
        item.cnpj = cnpj;
        item.tpEvento = tpEvento;
        item.descEvento = descEvento;
        item.chNFe = chNFe;
        item.infEventoId = `ID${tpEvento}${chNFe}01`;
        item.dhEvento = Data.toFormat(new Date(), 'America/Sao_Paulo');
        return item;
    });

    const pem = abrirPfx(cred);
    if (!pem.ok) throw new Error(pem.erro);
    return RecepcaoHelper.montarRequest({ idLote, eventos, cert: pem.cert, key: pem.key });
}

module.exports = {
    TP_AMB_HOMOLOGACAO,
    ENDPOINT_HOMOLOGACAO,
    CSTAT_EVENTO_ACEITO,
    TIMEOUT_PADRAO_MS,
    JUSTIFICATIVA_TESTE,
    CNPJ_EMITENTE_FICTICIO,
    CASOS,
    dvChaveAcesso,
    chaveTemDvValido,
    chaveFicticia,
    credenciaisDoBanco,
    credenciaisRecepcao,
    abrirPfx,
    enviarCaso,
    diagnosticar,
    certificadoDescartavel,
    montarXmlOffline
};
