// Guarda e serve os XMLs das NF-e — tanto as antigas do Conta Azul (backup local antes
// do CA cortar o acesso de vez) quanto as novas emitidas pelo app via Focus NFe.
// Arquivos em backend/uploads/xml-nfe (VOLUME persistido — regra do projeto: ../uploads).
const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');

const DIR = path.join(__dirname, '../uploads/xml-nfe');

function caminhoLocal(chave) {
    return path.join(DIR, `${String(chave).replace(/\D/g, '')}.xml`);
}

function salvarLocal(chave, xml) {
    try {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(caminhoLocal(chave), xml, 'utf8');
    } catch (e) {
        console.error('[XmlNfe] Falha ao salvar XML local:', e.message);
    }
}

/** XML de nota antiga do CA: arquivo local primeiro; senão busca no CA e guarda. */
async function obterXmlNotaCA(chave) {
    const arq = caminhoLocal(chave);
    if (fs.existsSync(arq)) return fs.readFileSync(arq, 'utf8');
    const contaAzulService = require('./contaAzulService');
    const xml = await contaAzulService.buscarXmlNotaFiscal(chave);
    salvarLocal(chave, xml);
    return xml;
}

/** XML de nota emitida pelo app: arquivo local primeiro; senão baixa da Focus e guarda. */
async function obterXmlNotaApp(notaAppId) {
    const nota = await prisma.notaFiscalApp.findUnique({ where: { id: notaAppId } });
    if (!nota) throw new Error('Nota do app não encontrada.');
    if (nota.chave) {
        const arq = caminhoLocal(nota.chave);
        if (fs.existsSync(arq)) return fs.readFileSync(arq, 'utf8');
    }
    const focusNfe = require('./focusNfeService');
    let caminho = nota.caminhoXml;
    if (!caminho) {
        const { data } = await focusNfe.consultar(nota.ref);
        caminho = data?.caminho_xml_nota_fiscal;
        if (!caminho) throw new Error('XML ainda não disponível na Focus.');
    }
    const xml = (await focusNfe.baixarArquivo(caminho)).toString('utf8');
    if (nota.chave) salvarLocal(nota.chave, xml);
    return xml;
}

// ── Backup em massa dos XMLs do CA (roda em segundo plano; sequencial e educado) ──
const backup = { rodando: false, baixados: 0, jaExistiam: 0, erros: 0, periodoAtual: null, terminou: null };

async function backupXmlsCA(meses = 24) {
    if (backup.rodando) return backup;
    Object.assign(backup, { rodando: true, baixados: 0, jaExistiam: 0, erros: 0, periodoAtual: null, terminou: null });
    const contaAzulService = require('./contaAzulService');
    const fmt = (d) => d.toISOString().split('T')[0];
    (async () => {
        try {
            // janelas de 7 dias (limite da API do CA), de hoje para trás
            let fim = new Date(Date.now() + 24 * 3600 * 1000);
            const limite = new Date(Date.now() - meses * 30 * 24 * 3600 * 1000);
            while (fim > limite) {
                const ini = new Date(fim.getTime() - 6 * 24 * 3600 * 1000);
                backup.periodoAtual = `${fmt(ini)} a ${fmt(fim)}`;
                try {
                    const itens = await contaAzulService.listarNotasFiscais({ dataInicial: fmt(ini), dataFinal: fmt(fim) });
                    for (const n of itens || []) {
                        const chave = n.chave_acesso;
                        if (!chave) continue;
                        if (fs.existsSync(caminhoLocal(chave))) { backup.jaExistiam++; continue; }
                        try {
                            const xml = await contaAzulService.buscarXmlNotaFiscal(chave);
                            salvarLocal(chave, xml);
                            backup.baixados++;
                            await new Promise(r => setTimeout(r, 400)); // não martelar a API do CA
                        } catch (e) {
                            backup.erros++;
                            console.error(`[XmlNfe] Backup: falha na chave ${chave}:`, e.message);
                        }
                    }
                } catch (e) {
                    backup.erros++;
                    console.error(`[XmlNfe] Backup: falha no período ${backup.periodoAtual}:`, e.message);
                }
                fim = new Date(ini.getTime() - 24 * 3600 * 1000);
            }
        } finally {
            backup.rodando = false;
            backup.terminou = new Date().toISOString();
        }
    })();
    return backup;
}

function backupStatus() {
    let arquivos = 0;
    try { arquivos = fs.readdirSync(DIR).length; } catch { /* pasta ainda não existe */ }
    return { ...backup, arquivosNoDisco: arquivos };
}

module.exports = { obterXmlNotaCA, obterXmlNotaApp, salvarLocal, backupXmlsCA, backupStatus };
