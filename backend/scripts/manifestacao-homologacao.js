#!/usr/bin/env node
/**
 * Homologação da MANIFESTAÇÃO DO DESTINATÁRIO (SEFAZ) — script de bancada.
 * NÃO toca em nenhuma nota real do app e NÃO escreve no banco.
 *
 * ⚠️ A LÓGICA NÃO MORA MAIS AQUI. Ela está em
 * `backend/services/manifestacaoHomologacaoService.js`, compartilhada com a rota
 * `GET /api/admin-exec/diag-manifestacao-sefaz` — que é o único jeito de rodar isto
 * EM PRODUÇÃO, com o A1 de verdade (não há shell no container do EasyPanel).
 * Este arquivo é só a casca de linha de comando: chama o serviço e imprime.
 * Mexeu na regra? Mexa no serviço, para a bancada e a produção nunca divergirem.
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
 * Ambiente: tpAmb = 2 (HOMOLOGAÇÃO), constante no serviço. Nunca 1 aqui.
 * Chave: FICTÍCIA, gerada com DV válido pelo serviço (emitente de teste
 * 00000000000191). Não se aponta este script para uma nota real de propósito.
 *
 * Uso:
 *   node scripts/manifestacao-homologacao.js              # usa o certificado A1 ativo do banco
 *   node scripts/manifestacao-homologacao.js --so-xml     # NÃO chama a SEFAZ: só monta e mostra o XML
 *
 * Sem certificado A1 no banco o script cai sozinho num certificado autoassinado
 * descartável (gerado na hora, em memória): dá para conferir o ENVELOPE, mas a SEFAZ
 * recusa o TLS/assinatura — nesse modo o passo 2 NÃO fica provado, e o script diz isso.
 */

const prisma = require('../config/database');
const homolog = require('../services/manifestacaoHomologacaoService');

const tem = (nome) => process.argv.includes(nome);

const dataBr = (d) => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch (_) { return String(d); } };

(async () => {
    const soXml = tem('--so-xml');
    const chave = homolog.chaveFicticia();

    console.log('═══ MANIFESTAÇÃO DO DESTINATÁRIO — HOMOLOGAÇÃO (tpAmb=2) ═══');
    console.log('chave fictícia:', chave, '| DV válido:', homolog.chaveTemDvValido(chave) ? 'SIM ✅' : 'NÃO ❌');
    console.log('endpoint      :', homolog.ENDPOINT_HOMOLOGACAO);

    let cred = await homolog.credenciaisDoBanco();
    if (cred.descriptografado) {
        console.log('certificado  : A1 ATIVO do banco (CNPJ', cred.cnpj, '| validade', dataBr(cred.validade), ')');
        console.log('credencial   : { pfx, passphrase } — MESMO caminho do sefazDfeService.manifestar ✅');
    } else {
        console.log('! Sem A1 utilizável:', cred.erro);
        cred = homolog.certificadoDescartavel();
        console.log('certificado  : ⚠️  AUTOASSINADO DESCARTÁVEL (não há A1 ativo neste banco).');
        console.log('credencial   : { cert, key } PEM — NÃO é o caminho da produção ({ pfx, passphrase }).');
        console.log('               O ENVELOPE dá para conferir; a SEFAZ vai recusar o TLS/assinatura,');
        console.log('               então o passo "transporte" NÃO fica provado neste modo.');
    }
    const cnpj = cred.cnpj;

    for (const caso of homolog.CASOS) {
        const justRotulo = caso.xJustEsperado ? 'COM justificativa' : 'SEM justificativa';
        console.log(`\n╔══ ${caso.tpEvento} — ${caso.rotulo} (${justRotulo})`);

        // Envelope offline: dá para ver o XML mesmo sem rede.
        try {
            const xml = homolog.montarXmlOffline(cred, cnpj, chave, caso);
            const temXJust = /<xJust>/.test(xml);
            console.log('  Id do evento :', (xml.match(/Id="([^"]+)"/) || [])[1] || '(não encontrado)');
            console.log('  nSeqEvento   :', (xml.match(/<nSeqEvento>([^<]+)</) || [])[1] || '(?)',
                '| tpAmb:', (xml.match(/<tpAmb>([^<]+)</) || [])[1] || '(?)');
            console.log('  xJust no XML :', temXJust ? 'SIM' : 'NÃO');
            console.log('  >>> xJust esperado:', caso.xJustEsperado ? 'SIM' : 'NÃO',
                temXJust === caso.xJustEsperado ? '✅ bate' : '❌ NÃO BATE');
            console.log('  assinatura   :', /<Signature/.test(xml) ? 'presente ✅' : 'AUSENTE ❌');
        } catch (e) {
            console.log('  ERRO ao montar/assinar o XML:', e.message);
        }

        if (soXml) continue;

        const r = await homolog.enviarCaso(cred, cnpj, chave, caso);
        console.log(`\n── RESPOSTA — ${caso.tpEvento} ──`);
        console.log('  erro de transporte :', r.erroTransporte || '(nenhum)');
        console.log('  cStat do LOTE      :', r.resposta?.cStatLote || '(vazio)', '-', r.resposta?.xMotivoLote || '');
        console.log('  infEvento          :', r.resposta?.infEvento ? JSON.stringify(r.resposta.infEvento) : '(VAZIO — lote rejeitado inteiro)');
        console.log('  >>> ACEITO pelo app:', r.resposta?.aceitoPelaRegraDoApp,
            r.resposta?.aceitoPelaRegraDoApp ? '❌ ERRADO em homologação!' : '✅ correto (nota não seria marcada)');
    }

    console.log('\n═══ fim ═══');
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
})().catch(async (e) => {
    console.error('FALHOU:', e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
});
