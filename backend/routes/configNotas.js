/**
 * Configurações → Notas Fiscais / Certificado Digital (Fase 1: só armazenamento).
 * A captura de notas na SEFAZ é Fase 2.
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

module.exports = router;
