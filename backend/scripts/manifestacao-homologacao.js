#!/usr/bin/env node
/**
 * Homologação da MANIFESTAÇÃO DO DESTINATÁRIO (SEFAZ) — script de bancada.
 * NÃO é deployado e NÃO toca em nenhuma nota real do app.
 *
 * Para que serve: provar, sem risco, as três partes que só se vê quando o XML sai daqui:
 *   1. ENVELOPE  — que o 210220 (Desconhecimento) vai SEM `xJust` e o 210240 (Operação
 *      não Realizada) vai COM `xJust`. Mandar xJust no 210220 faz a SEFAZ rejeitar por
 *      schema — é o erro mais fácil de cometer, porque a lib põe xJust em QUALQUER evento
 *      que receba `justificativa`.
 *   2. ASSINATURA/TRANSPORTE — que o pacote sai daqui e a SEFAZ responde.
 *   3. CLASSIFICAÇÃO — que uma resposta de rejeição é lida como NÃO ACEITA
 *      (em homologação a nota de teste não existe, então a SEFAZ SEMPRE rejeita —
 *      e é justamente esse "não" que prova que o app não marcaria a nota).
 *
 * Ambiente: tpAmb = 2 (HOMOLOGAÇÃO). Nunca 1 aqui.
 *
 * Uso:
 *   node scripts/manifestacao-homologacao.js              # usa o certificado A1 ativo do banco
 *   node scripts/manifestacao-homologacao.js --so-xml     # NÃO chama a SEFAZ: só monta e mostra o XML
 *   node scripts/manifestacao-homologacao.js --chave <44>
 *
 * Sem certificado A1 no banco o script cai sozinho num certificado autoassinado
 * descartável (gerado na hora, em memória): dá para conferir o ENVELOPE, mas a SEFAZ
 * recusa o TLS/assinatura — nesse modo o passo 2 NÃO fica provado, e o script diz isso.
 */

const forge = require('node-forge');
const prisma = require('../config/database');
const { normalizarDoc } = require('../utils/documento');

const TP_AMB_HOMOLOGACAO = '2';
// Chave de teste (44 posições). Não existe na SEFAZ — é essa a graça: a resposta é
// sempre uma REJEIÇÃO, e é ela que queremos ver o código classificar como "não aceito".
const CHAVE_PADRAO = '42250700000000000191550010000000011000000017';
const JUSTIFICATIVA = 'Teste de homologacao da manifestacao do destinatario do app';

const arg = (nome) => {
    const i = process.argv.indexOf(nome);
    return i > -1 ? process.argv[i + 1] : null;
};
const tem = (nome) => process.argv.includes(nome);

/**
 * Certificado autoassinado descartável (só para montar/assinar o XML offline, quando
 * não há A1 no banco). Entrega PEM porque não existe .pfx nenhum aqui.
 */
function certificadoDescartavel() {
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
        pfx: null,
        senha: null,
        cert: forge.pki.certificateToPem(cert),
        key: forge.pki.privateKeyToPem(keys.privateKey),
        falso: true
    };
}

/**
 * Certificado A1 ATIVO do banco, no MESMO formato que a produção usa: `pfx` + `senha`
 * crus, saídos de `certificadoService.descriptografarCertificado`.
 *
 * ⚠️ Isto é metade da razão de existir deste script: em produção o
 * `sefazDfeService.manifestar` monta o `RecepcaoEvento` com `{ pfx, passphrase }` e deixa
 * a própria lib abrir o PKCS#12. Se aqui a gente já entregasse PEM pronto (`{cert, key}`),
 * o script pularia justamente o passo que mais falha no servidor — senha errada, .pfx
 * corrompido, cadeia incompleta — e "passaria" num caminho que a produção não percorre.
 */
async function certificadoDoBanco() {
    const registro = await prisma.certificadoDigital.findFirst({
        where: { ativo: true },
        orderBy: { instaladoEm: 'desc' }
    });
    if (!registro) return null;
    const certificadoService = require('../services/certificadoService');
    const { pfx, senha } = certificadoService.descriptografarCertificado(registro);
    return {
        pfx,
        senha,
        cnpj: normalizarDoc(registro.cnpj),
        validade: registro.validade,
        falso: false
    };
}

/**
 * O que vai para o construtor do `RecepcaoEvento` — idêntico à produção quando há A1:
 * `{ pfx, passphrase }`. Só o certificado descartável cai no PEM direto.
 */
const credenciaisRecepcao = (c) => (c.pfx
    ? { pfx: c.pfx, passphrase: c.senha }
    : { cert: c.cert, key: c.key });

/**
 * PEM para ASSINAR o XML na inspeção offline. Com A1, abre o .pfx pelo mesmo
 * `Certificado.p12ToPem` que o `CertificadoValidator` da lib usa por dentro — então
 * uma senha errada estoura AQUI também, e não passa despercebida.
 */
function pemParaAssinatura(c) {
    if (!c.pfx) return { cert: c.cert, key: c.key };
    const { Certificado } = require('node-mde/lib/util');
    const pem = Certificado.p12ToPem(c.pfx, c.senha);
    return { cert: pem.cert.toString(), key: pem.key.toString() };
}

/** Mostra o XML que SERIA enviado, sem chamar a SEFAZ. */
function montarXml(credenciais, cnpj, evento) {
    const { RecepcaoHelper } = require('node-mde/lib/helpers');
    const { EventoValidator, LoteValidator } = require('node-mde/lib/validators');
    const Data = require('node-mde/lib/util').Data;

    const idLote = String(Date.now());
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

    const pem = pemParaAssinatura(credenciais);
    return RecepcaoHelper.montarRequest({
        idLote,
        eventos,
        cert: pem.cert,
        key: pem.key
    });
}

async function enviar(credenciais, cnpj, evento, rotulo) {
    const { RecepcaoEvento } = require('node-mde');
    const recepcao = new RecepcaoEvento({
        // MESMO caminho de credencial da produção quando há A1: { pfx, passphrase }.
        ...credenciaisRecepcao(credenciais),
        cnpj,
        tpAmb: TP_AMB_HOMOLOGACAO,
        options: { requestOptions: { timeout: 30000 } }
    });
    const r = await recepcao.enviarEvento({ idLote: String(Date.now()), lote: [evento] });

    const ev = Array.isArray(r?.data?.infEvento) ? r.data.infEvento[0] : null;
    const cStatEvento = ev?.cStat ? String(ev.cStat) : null;
    // MESMA regra do sefazDfeService.manifestar
    const aceito = !r?.error && !!ev && ['135', '136'].includes(cStatEvento);

    console.log(`\n── RESPOSTA — ${rotulo} ──`);
    console.log('  erro de transporte :', r?.error ? String(r.error).substring(0, 300) : '(nenhum)');
    console.log('  cStat do LOTE      :', r?.data?.cStat || '(vazio)', '-', r?.data?.xMotivo || '');
    console.log('  infEvento          :', ev ? JSON.stringify(ev) : '(VAZIO — lote rejeitado inteiro)');
    console.log('  >>> ACEITO pelo app:', aceito, aceito ? '❌ ERRADO em homologação!' : '✅ correto (nota não seria marcada)');
    return aceito;
}

(async () => {
    const chave = arg('--chave') || CHAVE_PADRAO;
    const soXml = tem('--so-xml');

    console.log('═══ MANIFESTAÇÃO DO DESTINATÁRIO — HOMOLOGAÇÃO (tpAmb=2) ═══');
    console.log('chave de teste:', chave);

    let credenciais = null;
    try {
        credenciais = await certificadoDoBanco();
    } catch (e) {
        console.log('! Falha ao abrir o certificado do banco:', e.message);
    }
    if (credenciais) {
        console.log('certificado  : A1 ATIVO do banco (CNPJ', credenciais.cnpj, '| validade', new Date(credenciais.validade).toLocaleDateString('pt-BR'), ')');
        console.log('credencial   : { pfx, passphrase } — MESMO caminho do sefazDfeService.manifestar ✅');
    } else {
        credenciais = certificadoDescartavel();
        credenciais.cnpj = '00000000000191';
        console.log('certificado  : ⚠️  AUTOASSINADO DESCARTÁVEL (não há A1 ativo neste banco).');
        console.log('credencial   : { cert, key } PEM — NÃO é o caminho da produção ({ pfx, passphrase }).');
        console.log('               O ENVELOPE dá para conferir; a SEFAZ vai recusar o TLS/assinatura,');
        console.log('               então o passo "transporte" NÃO fica provado neste modo.');
    }
    const cnpj = credenciais.cnpj;

    const casos = [
        {
            rotulo: '210220 — Desconhecimento da Operação (SEM justificativa)',
            evento: { chNFe: chave, tipoEvento: 210220 }
        },
        {
            rotulo: '210240 — Operação não Realizada (COM justificativa)',
            evento: { chNFe: chave, tipoEvento: 210240, justificativa: JUSTIFICATIVA }
        }
    ];

    for (const caso of casos) {
        console.log(`\n╔══ ${caso.rotulo}`);
        const xml = montarXml(credenciais, cnpj, caso.evento);
        const temXJust = /<xJust>/.test(xml);
        const idEvento = (xml.match(/Id="([^"]+)"/) || [])[1] || '(não encontrado)';
        const nSeq = (xml.match(/<nSeqEvento>([^<]+)</) || [])[1] || '(não encontrado)';
        const tpAmb = (xml.match(/<tpAmb>([^<]+)</) || [])[1] || '(não encontrado)';
        console.log('  Id do evento :', idEvento);
        console.log('  nSeqEvento   :', nSeq, '| tpAmb:', tpAmb);
        console.log('  xJust no XML :', temXJust ? 'SIM' : 'NÃO');
        const esperado = caso.evento.tipoEvento === 210240;
        console.log('  >>> xJust esperado:', esperado ? 'SIM' : 'NÃO', temXJust === esperado ? '✅ bate' : '❌ NÃO BATE');
        console.log('  assinatura   :', /<Signature/.test(xml) ? 'presente ✅' : 'AUSENTE ❌');

        if (!soXml) {
            try {
                await enviar(credenciais, cnpj, caso.evento, caso.rotulo);
            } catch (e) {
                console.log('  ERRO no envio:', e.message);
            }
        }
    }

    console.log('\n═══ fim ═══');
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
})().catch(async (e) => {
    console.error('FALHOU:', e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
});
