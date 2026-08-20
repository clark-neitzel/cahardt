/**
 * Configurações → Notas Fiscais / Certificado Digital + Captura SEFAZ (Fase 2).
 *
 * Permissão: admin ou configuracoes.edit
 */

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const uploadCertificado = require('../middlewares/uploadCertificadoMiddleware');
const certificadoService = require('../services/certificadoService');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkConfig = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    const podeConfig = perms.configuracoes && typeof perms.configuracoes === 'object' && perms.configuracoes.edit === true;
    if (!perms.admin && !podeConfig) {
        return res.status(403).json({ error: 'Sem permissão para alterar configurações.' });
    }
    next();
};

// ── GET /certificado — status do certificado ativo ──
router.get('/certificado', verificarAuth, checkConfig, async (req, res) => {
    try {
        const cert = await prisma.certificadoDigital.findFirst({
            where: { ativo: true },
            orderBy: { instaladoEm: 'desc' }
        });
        if (!cert) {
            return res.json({ instalado: false, titular: null, cnpj: null, emissor: null, validade: null, diasRestantes: null });
        }
        const diasRestantes = Math.floor((new Date(cert.validade) - new Date()) / (1000 * 60 * 60 * 24));
        res.json({
            instalado: true,
            titular: cert.titular,
            cnpj: cert.cnpj,
            emissor: cert.emissor,
            validade: cert.validade,
            diasRestantes
        });
    } catch (error) {
        console.error('Erro ao consultar certificado:', error);
        res.status(500).json({ error: 'Erro ao consultar certificado.' });
    }
});

// ── POST /certificado — instalar certificado (.pfx/.p12 + senha) ──
router.post('/certificado', verificarAuth, checkConfig, (req, res) => {
    uploadCertificado.single('arquivo')(req, res, async (uploadErr) => {
        try {
            if (uploadErr) return res.status(400).json({ error: uploadErr.message || 'Falha no upload do arquivo.' });
            if (!req.file?.buffer) return res.status(400).json({ error: 'Envie o arquivo do certificado (.pfx ou .p12).' });

            const senha = req.body?.senha;
            if (!senha) return res.status(400).json({ error: 'Informe a senha do certificado.' });

            // Valida abrindo o PFX com a senha; extrai titular/CNPJ/emissor/validade;
            // criptografa arquivo e senha (AES-256-GCM) e salva em uploads/certificado/.
            let dados;
            try {
                dados = certificadoService.salvarCertificado(req.file.buffer, senha);
            } catch (e) {
                console.warn('[Certificado] Falha ao abrir PFX:', e.message);
                return res.status(400).json({ error: 'Senha incorreta ou arquivo inválido' });
            }

            if (new Date(dados.validade) < new Date()) {
                return res.status(400).json({ error: `Este certificado está VENCIDO (validade: ${new Date(dados.validade).toLocaleDateString('pt-BR')}). Envie um certificado válido.` });
            }

            await prisma.$transaction([
                prisma.certificadoDigital.updateMany({
                    where: { ativo: true },
                    data: { ativo: false }
                }),
                prisma.certificadoDigital.create({
                    data: {
                        titular: dados.titular,
                        cnpj: dados.cnpj,
                        emissor: dados.emissor,
                        validade: dados.validade,
                        arquivoPath: dados.arquivoPath,
                        senhaCriptografada: dados.senhaCriptografada,
                        ativo: true,
                        instaladoPorId: req.user.id
                    }
                })
            ]);

            res.json({ ok: true, titular: dados.titular, cnpj: dados.cnpj, validade: dados.validade });
        } catch (error) {
            console.error('Erro ao instalar certificado:', error);
            res.status(500).json({ error: 'Erro ao instalar certificado.' });
        }
    });
});

// ── GET /captura — status das capturas automáticas: NF-e (SEFAZ) e NFS-e (ADN) ──
router.get('/captura', verificarAuth, checkConfig, async (req, res) => {
    try {
        const sefazDfeService = require('../services/sefazDfeService');
        const nfseAdnService = require('../services/nfseAdnService');
        const [status, statusNfse] = await Promise.all([
            sefazDfeService.statusCaptura(),
            nfseAdnService.statusCaptura()
        ]);
        res.json({
            nfeAtiva: status.ativa,
            ultimaConsulta: status.ultimaConsulta,
            ultimoResultado: status.ultimoResultado,
            totalCapturadas: status.totalCapturadas,
            bloqueadoAte: status.bloqueadoAte,
            nfse: {
                ativa: statusNfse.ativa,
                ultimaConsulta: statusNfse.ultimaConsulta,
                ultimoResultado: statusNfse.ultimoResultado,
                totalCapturadas: statusNfse.totalCapturadas,
                bloqueadoAte: statusNfse.bloqueadoAte
            }
        });
    } catch (error) {
        console.error('Erro ao consultar status da captura de notas:', error);
        res.status(500).json({ error: 'Erro ao consultar status da captura.' });
    }
});

// ── PUT /captura — liga/desliga as capturas automáticas (NF-e e/ou NFS-e) ──
router.put('/captura', verificarAuth, checkConfig, async (req, res) => {
    try {
        const { nfeAtiva, nfseAtiva } = req.body;
        if (typeof nfeAtiva !== 'boolean' && typeof nfseAtiva !== 'boolean') {
            return res.status(400).json({ error: 'Informe nfeAtiva e/ou nfseAtiva como true ou false.' });
        }
        const ops = [];
        if (typeof nfeAtiva === 'boolean') {
            ops.push(prisma.appConfig.upsert({
                where: { key: 'captura_nfe_ativa' },
                update: { value: nfeAtiva ? 'true' : 'false' },
                create: { key: 'captura_nfe_ativa', value: nfeAtiva ? 'true' : 'false' }
            }));
        }
        if (typeof nfseAtiva === 'boolean') {
            ops.push(prisma.appConfig.upsert({
                where: { key: 'captura_nfse_ativa' },
                update: { value: nfseAtiva ? 'true' : 'false' },
                create: { key: 'captura_nfse_ativa', value: nfseAtiva ? 'true' : 'false' }
            }));
        }
        await prisma.$transaction(ops);
        res.json({ ok: true, nfeAtiva, nfseAtiva });
    } catch (error) {
        console.error('Erro ao alterar captura de notas:', error);
        res.status(500).json({ error: 'Erro ao alterar a captura de notas.' });
    }
});

// ── Emissão de NF-e (Simples Nacional) — alíquota do crédito de ICMS, NCM padrão e textos legais ──
// Gravado na chave `focus_nfe_config` (app_configs); é o que `focusNfeEmissaoService.getConfig()` lê
// a cada emissão. Vale para a NF-e de venda E para a NF-e de devolução.

const PADRAO_EMISSAO = {
    aliquotaCreditoSimples: 3.82,
    ncmPadrao: '19022000',
    textosLegais: [
        'DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL.',
        'NAO GERA DIREITO A CREDITO FISCAL DE IPI.',
    ],
};

// ── GET /emissao — configuração fiscal atual da emissão ──
router.get('/emissao', verificarAuth, checkConfig, async (req, res) => {
    try {
        const reg = await prisma.appConfig.findUnique({ where: { key: 'focus_nfe_config' } });
        const salvo = (reg?.value && typeof reg.value === 'object' && !Array.isArray(reg.value)) ? reg.value : {};
        res.json({
            aliquotaCreditoSimples: Number(salvo.aliquotaCreditoSimples ?? PADRAO_EMISSAO.aliquotaCreditoSimples),
            ncmPadrao: String(salvo.ncmPadrao || PADRAO_EMISSAO.ncmPadrao),
            textosLegais: Array.isArray(salvo.textosLegais) ? salvo.textosLegais : PADRAO_EMISSAO.textosLegais,
            personalizado: !!reg,
            atualizadoEm: salvo.atualizadoEm || null,
            atualizadoPorNome: salvo.atualizadoPorNome || null,
            padrao: PADRAO_EMISSAO
        });
    } catch (error) {
        console.error('Erro ao consultar configuração de emissão de NF-e:', error);
        res.status(500).json({ error: 'Erro ao consultar a configuração de emissão.' });
    }
});

// ── PUT /emissao — altera a configuração fiscal da emissão ──
router.put('/emissao', verificarAuth, checkConfig, async (req, res) => {
    try {
        const { aliquotaCreditoSimples, ncmPadrao, textosLegais } = req.body || {};

        // Alíquota do crédito (pCredSN) — aceita "3,82" ou 3.82.
        // Campo vazio NÃO pode virar 0% (zerar o crédito de todos os clientes sem ninguém perceber).
        const aliqTexto = String(aliquotaCreditoSimples ?? '').replace(',', '.').trim();
        const aliqNum = Number(aliqTexto);
        if (aliqTexto === '' || !Number.isFinite(aliqNum)) {
            return res.status(400).json({ error: 'Informe a alíquota do crédito de ICMS (ex.: 3,82).' });
        }
        if (aliqNum < 0 || aliqNum > 15) {
            return res.status(400).json({ error: 'A alíquota do crédito deve ficar entre 0 e 15%. Confira o valor com a contabilidade.' });
        }
        const aliquota = Math.round(aliqNum * 100) / 100;

        // NCM padrão — usado só quando o produto não tem NCM próprio
        const ncm = String(ncmPadrao ?? '').replace(/\D/g, '');
        if (ncm.length !== 8) {
            return res.status(400).json({ error: 'O NCM padrão deve ter 8 dígitos (ex.: 19022000).' });
        }

        // Textos legais — cada linha vira uma linha das Informações Complementares da nota
        let textos = textosLegais;
        if (typeof textos === 'string') textos = textos.split('\n');
        if (!Array.isArray(textos)) {
            return res.status(400).json({ error: 'Os textos legais devem ser uma lista de linhas.' });
        }
        textos = textos.map(t => String(t ?? '').trim()).filter(Boolean);
        if (textos.length > 10) {
            return res.status(400).json({ error: 'No máximo 10 linhas de texto legal.' });
        }
        if (textos.some(t => t.length > 500)) {
            return res.status(400).json({ error: 'Cada linha de texto legal deve ter no máximo 500 caracteres.' });
        }

        const value = {
            aliquotaCreditoSimples: aliquota,
            ncmPadrao: ncm,
            textosLegais: textos,
            atualizadoEm: new Date().toISOString(),
            atualizadoPorId: req.user.id,
            atualizadoPorNome: req.user.nome || null
        };

        await prisma.appConfig.upsert({
            where: { key: 'focus_nfe_config' },
            update: { value },
            create: { key: 'focus_nfe_config', value }
        });

        // Log da alteração (fiscal) — fora de transação, nunca derruba a gravação
        try {
            console.log(`[ConfigNotas] Emissão NF-e alterada por ${req.user.nome || req.user.id}: pCredSN=${aliquota}% NCM=${ncm} textos=${textos.length}`);
        } catch { /* log não bloqueia */ }

        res.json({ ok: true, aliquotaCreditoSimples: aliquota, ncmPadrao: ncm, textosLegais: textos });
    } catch (error) {
        console.error('Erro ao salvar configuração de emissão de NF-e:', error);
        res.status(500).json({ error: 'Erro ao salvar a configuração de emissão.' });
    }
});

module.exports = router;

