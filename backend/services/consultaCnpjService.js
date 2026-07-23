/**
 * Consulta de dados cadastrais por CNPJ — para agilizar o cadastro de clientes no app.
 *
 * Duas fontes, combinadas:
 *  1. Receita Federal (dados públicos): BrasilAPI como primário, CNPJá open como fallback.
 *     Traz razão social, nome fantasia, endereço completo, telefone, e-mail e situação.
 *  2. Inscrição Estadual: webservice CadConsultaCadastro4 da SEFAZ, autenticado com o
 *     certificado digital A1 já instalado no app (o mesmo usado na captura de NF-e).
 *     A IE não existe em API pública gratuita — só a SEFAZ fornece.
 *
 * Tudo é best-effort: se uma fonte falhar, devolve o que conseguiu (a tela deixa
 * completar na mão). Nunca lança para o chamador da rota.
 */

const axios = require('axios');
const https = require('https');
const prisma = require('../config/database');
const { normalizarDoc } = require('../utils/documento');

const TIMEOUT_MS = 15000;

// ─────────────────────────────────────────────────────────────
// Fonte 1 — Receita Federal (BrasilAPI → fallback CNPJá open)
// ─────────────────────────────────────────────────────────────

function _telefoneDe(ddd, numero) {
    const t = String(ddd || '').replace(/\D/g, '') + String(numero || '').replace(/\D/g, '');
    return t.length >= 10 ? t : '';
}

async function _consultarBrasilApi(cnpj) {
    const { data: d } = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { timeout: TIMEOUT_MS });
    const tipoLogradouro = String(d.descricao_tipo_de_logradouro || '').trim();
    const logradouro = String(d.logradouro || '').trim();
    return {
        fonte: 'BrasilAPI',
        razaoSocial: d.razao_social || '',
        nomeFantasia: d.nome_fantasia || '',
        situacao: d.descricao_situacao_cadastral || '',
        ativa: d.descricao_situacao_cadastral === 'ATIVA',
        email: (d.email || '').toLowerCase(),
        telefone: _telefoneDe('', d.ddd_telefone_1),
        endereco: {
            logradouro: [tipoLogradouro, logradouro].filter(Boolean).join(' '),
            numero: String(d.numero || '').trim(),
            complemento: String(d.complemento || '').trim(),
            bairro: String(d.bairro || '').trim(),
            cidade: String(d.municipio || '').trim(),
            uf: String(d.uf || '').trim().toUpperCase(),
            cep: String(d.cep || '').replace(/\D/g, '')
        }
    };
}

async function _consultarCnpja(cnpj) {
    const { data: d } = await axios.get(`https://open.cnpja.com/office/${cnpj}`, { timeout: TIMEOUT_MS });
    const fone = (d.phones || [])[0];
    return {
        fonte: 'CNPJá',
        razaoSocial: d.company?.name || '',
        nomeFantasia: d.alias || '',
        situacao: d.status?.text || '',
        ativa: d.status?.id === 2,
        email: ((d.emails || [])[0]?.address || '').toLowerCase(),
        telefone: _telefoneDe(fone?.area, fone?.number),
        endereco: {
            logradouro: String(d.address?.street || '').trim(),
            numero: String(d.address?.number || '').trim(),
            complemento: String(d.address?.details || '').trim(),
            bairro: String(d.address?.district || '').trim(),
            cidade: String(d.address?.city || '').trim(),
            uf: String(d.address?.state || '').trim().toUpperCase(),
            cep: String(d.address?.zip || '').replace(/\D/g, '')
        }
    };
}

async function consultarReceita(cnpj) {
    try {
        return await _consultarBrasilApi(cnpj);
    } catch (e1) {
        console.warn(`[ConsultaCNPJ] BrasilAPI falhou (${e1.response?.status || e1.message}), tentando CNPJá...`);
        try {
            return await _consultarCnpja(cnpj);
        } catch (e2) {
            console.warn(`[ConsultaCNPJ] CNPJá também falhou (${e2.response?.status || e2.message})`);
            return null;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// Fonte 2 — Inscrição Estadual via SEFAZ (CadConsultaCadastro4)
// ─────────────────────────────────────────────────────────────

// Autorizador por UF. SVRS atende SC (nosso caso) e a maioria dos vizinhos do Sudeste/Sul.
const URL_SVRS = 'https://cad.svrs.rs.gov.br/ws/cadconsultacadastro/cadconsultacadastro4.asmx';
const CAD_ENDPOINTS = {
    SC: URL_SVRS, RS: URL_SVRS, ES: URL_SVRS, RJ: URL_SVRS, AC: URL_SVRS, AL: URL_SVRS,
    AP: URL_SVRS, DF: URL_SVRS, PB: URL_SVRS, PI: URL_SVRS, RN: URL_SVRS, RO: URL_SVRS,
    RR: URL_SVRS, SE: URL_SVRS, TO: URL_SVRS,
    SP: 'https://nfe.fazenda.sp.gov.br/ws/cadconsultacadastro4.asmx',
    PR: 'https://nfe.sefa.pr.gov.br/nfe/CadConsultaCadastro4',
    MG: 'https://nfe.fazenda.mg.gov.br/nfe2/services/CadConsultaCadastro4',
    BA: 'https://nfe.sefaz.ba.gov.br/webservices/CadConsultaCadastro4/CadConsultaCadastro4.asmx',
    GO: 'https://nfe.sefaz.go.gov.br/nfe/services/CadConsultaCadastro4',
    MS: 'https://nfe.sefaz.ms.gov.br/ws/CadConsultaCadastro4',
    MT: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/CadConsultaCadastro4'
};

function _extrairTag(xml, tag) {
    const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return m ? m[1].trim() : '';
}

/**
 * Consulta a IE de um CNPJ na SEFAZ da UF. Retorna:
 *  { ok: true, ie, situacaoIe, razaoSocial } — contribuinte encontrado
 *  { ok: true, ie: null, motivo }           — consulta funcionou, mas sem IE (não contribuinte)
 *  { ok: false, motivo }                    — não foi possível consultar (sem certificado, UF sem endpoint, erro)
 */
async function consultarIeSefaz(cnpj, uf) {
    const ufNorm = String(uf || '').trim().toUpperCase();
    const url = CAD_ENDPOINTS[ufNorm];
    if (!url) return { ok: false, motivo: `Consulta automática de IE indisponível para a UF ${ufNorm || '?'}` };
    if (!/^\d{14}$/.test(cnpj)) return { ok: false, motivo: 'Consulta de IE na SEFAZ só suporta CNPJ numérico' };

    const cert = await prisma.certificadoDigital.findFirst({ where: { ativo: true }, orderBy: { instaladoEm: 'desc' } });
    if (!cert) return { ok: false, motivo: 'Nenhum certificado digital instalado no app' };

    let pfx, senha;
    try {
        const certificadoService = require('./certificadoService');
        ({ pfx, senha } = certificadoService.descriptografarCertificado(cert));
    } catch (e) {
        return { ok: false, motivo: `Falha ao abrir o certificado: ${e.message}` };
    }

    const envelope =
        `<?xml version="1.0" encoding="utf-8"?>` +
        `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
        `<soap12:Body>` +
        `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4">` +
        `<ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00">` +
        `<infCons><xServ>CONS-CAD</xServ><UF>${ufNorm}</UF><CNPJ>${cnpj}</CNPJ></infCons>` +
        `</ConsCad>` +
        `</nfeDadosMsg>` +
        `</soap12:Body>` +
        `</soap12:Envelope>`;

    try {
        const agent = new https.Agent({ pfx, passphrase: senha, keepAlive: false });
        const { data: xml } = await axios.post(url, envelope, {
            timeout: TIMEOUT_MS,
            httpsAgent: agent,
            headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' }
        });

        const corpo = String(xml);
        const cStat = _extrairTag(corpo, 'cStat');
        const xMotivo = _extrairTag(corpo, 'xMotivo');

        // 111 = uma ocorrência, 112 = múltiplas — ambos são sucesso
        if (cStat !== '111' && cStat !== '112') {
            return { ok: true, ie: null, motivo: xMotivo || `SEFAZ retornou cStat ${cStat}` };
        }

        // Pode vir mais de um <infCad> (matriz/filiais, IEs baixadas). Preferir cSit=1 (habilitado).
        const blocos = corpo.match(/<infCad>[\s\S]*?<\/infCad>/g) || [];
        const cadastros = blocos.map(b => ({
            ie: _extrairTag(b, 'IE').replace(/\D/g, ''),
            cSit: _extrairTag(b, 'cSit'),
            razaoSocial: _extrairTag(b, 'xNome'),
            uf: _extrairTag(b, 'UF')
        })).filter(c => c.ie);

        const habilitado = cadastros.find(c => c.cSit === '1') || cadastros[0];
        if (!habilitado) return { ok: true, ie: null, motivo: 'CNPJ sem inscrição estadual nesta UF (não contribuinte)' };

        return {
            ok: true,
            ie: habilitado.ie,
            situacaoIe: habilitado.cSit === '1' ? 'HABILITADO' : 'NAO_HABILITADO',
            razaoSocial: habilitado.razaoSocial
        };
    } catch (e) {
        const status = e.response?.status ? ` HTTP ${e.response.status}` : '';
        const corpo = e.response?.data ? String(e.response.data).replace(/\s+/g, ' ').slice(0, 200) : '';
        console.warn(`[ConsultaCNPJ] SEFAZ ${ufNorm} falhou${status}: ${e.message} ${corpo}`);
        return { ok: false, motivo: `SEFAZ ${ufNorm}:${status} ${e.message}${corpo ? ' — ' + corpo : ''}`.slice(0, 300) };
    }
}

// ─────────────────────────────────────────────────────────────
// Consulta combinada (o que a rota usa)
// ─────────────────────────────────────────────────────────────

async function consultarCnpj(documento) {
    const cnpj = normalizarDoc(documento);
    if (cnpj.length !== 14) return { encontrado: false, erro: 'Informe um CNPJ com 14 posições' };

    // CNPJ alfanumérico ainda não existe nas APIs públicas — segue direto pro cadastro manual
    if (!/^\d{14}$/.test(cnpj)) {
        return { encontrado: false, erro: 'CNPJ alfanumérico: preencha os dados manualmente' };
    }

    const receita = await consultarReceita(cnpj);
    if (!receita) {
        return { encontrado: false, erro: 'Não foi possível consultar o CNPJ agora (serviços da Receita indisponíveis). Preencha manualmente.' };
    }

    const sefaz = await consultarIeSefaz(cnpj, receita.endereco.uf);

    return {
        encontrado: true,
        ...receita,
        inscricaoEstadual: sefaz.ok ? (sefaz.ie || null) : null,
        indicadorIeSugerido: sefaz.ok
            ? (sefaz.ie ? 'CONTRIBUINTE' : 'NAO_CONTRIBUINTE')
            : null,
        ieConsulta: {
            ok: sefaz.ok,
            situacao: sefaz.situacaoIe || null,
            motivo: sefaz.motivo || null
        }
    };
}

module.exports = { consultarCnpj, consultarReceita, consultarIeSefaz };
