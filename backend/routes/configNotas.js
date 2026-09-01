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
const focusNfe = require('../services/focusNfeService');
const emissao = require('../services/focusNfeEmissaoService');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

/**
 * A regra de quem pode ALTERAR configuração, num lugar só.
 * ⚠️ `permissoes.configuracoes` neste projeto é OBJETO, não booleano — `!!perms.configuracoes`
 * liberaria até quem só tem visualização. Tem que ser `.edit === true`.
 * O frontend precisa espelhar exatamente isto (por isso o GET abaixo devolve `podeEditar`
 * já calculado aqui, em vez de a tela repetir a conta e errar).
 */
const podeEditarConfig = (perms) => {
    const p = perms || {};
    const podeConfig = p.configuracoes && typeof p.configuracoes === 'object' && p.configuracoes.edit === true;
    return !!p.admin || podeConfig === true;   // `admin` continua por truthiness, como era antes
};

const checkConfig = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!podeEditarConfig(perms)) {
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

// ═══════════════════════════════════════════════════════════════════════════════
// Referência da nota de origem POR ITEM na NF-e de DEVOLUÇÃO (NT 2025.002)
// Chave `nfe_devolucao_ref_item` em `app_configs`: 'auto' (padrão) | 'sempre' | 'nunca'.
//
// ⚠️ CHAVE SEPARADA — e tem que continuar assim. NUNCA guardar este modo dentro de
// `focus_nfe_config`: o `PUT /emissao` acima reescreve aquele objeto INTEIRO com só três
// campos, então qualquer campo extra ali seria apagado em silêncio na primeira vez que
// alguém salvasse a tela de Configurações.
//
// Quem manda no comportamento da emissão continua sendo `focusNfeEmissaoService.refItemLigada()`.
// O GET abaixo chama a PRÓPRIA função para devolver `ligado`, então o aviso da tela nunca pode
// mostrar um estado diferente do que a emissão vai fazer de verdade. Aqui só se lê o rótulo
// `modo` (o valor cru guardado) e se grava a chave — a lógica de emissão não foi tocada.
// ═══════════════════════════════════════════════════════════════════════════════

const CHAVE_REF_ITEM = 'nfe_devolucao_ref_item';
const MODOS_REF_ITEM = ['auto', 'sempre', 'nunca'];

/**
 * Modo VÁLIDO gravado, ou `null` quando não há escolha utilizável (linha inexistente, valor
 * fora dos três, lixo). Mesma tolerância de `focusNfeEmissaoService.refItemLigada()`: aceita
 * tanto o valor solto `"auto"` quanto o objeto `{ modo: "auto" }`.
 * Duplicação consciente e mínima: o efeito (`ligado`) sempre vem da função do service, então os
 * dois não podem divergir no que importa — isto aqui só nomeia o que está guardado, para a tela.
 */
const lerModoRefItemValido = (reg) => {
    const bruto = (reg && reg.value && typeof reg.value === 'object' && !Array.isArray(reg.value))
        ? reg.value.modo
        : reg?.value;
    const s = String(bruto ?? '').trim().toLowerCase();
    return MODOS_REF_ITEM.includes(s) ? s : null;
};

/** O mesmo, já com o padrão da emissão aplicado (`auto`) — é o que a tela mostra em `modo`. */
const lerModoRefItem = (reg) => lerModoRefItemValido(reg) || 'auto';

/** Data de hoje em Brasília (UTC-3) — mesma conta que a emissão faz para comparar com o prazo. */
const hojeBrasilia = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

// ── GET /devolucao-ref-item — estado do interruptor ──
// SEM `checkConfig` de propósito. Quem consome hoje:
//   1. `frontend/src/components/AlertaDevolucaoRefItem.jsx` — o lembrete periódico, montado no
//      `App.jsx` e portanto ativo em QUALQUER tela do app, fora do bloco de Configurações.
//      (Hoje ele só é exibido para o Clarkson, mas quem decide isso é o componente, não a rota.)
//   2. `frontend/src/pages/Admin/Configuracoes/NotasCertificadoConfig.jsx` — a seção com o botão.
// Ou seja: a rota é aberta porque o lembrete roda fora do bloco de Configurações — NÃO porque
// exista aviso do estado da chave no Caixa ou em Pedidos → Devoluções (não existe; aquelas telas
// não consultam esta rota). Nada aqui é dado sensível: é o modo do interruptor, o prazo da SEFAZ
// e o ambiente da emissão. O BOTÃO de gravar, esse sim, exige permissão (PUT abaixo), e o campo
// `podeEditar` diz à tela se deve mostrar o botão — calculado pela MESMA função do backend,
// para o front não repetir a conta e errar.
router.get('/devolucao-ref-item', verificarAuth, async (req, res) => {
    try {
        const reg = await prisma.appConfig.findUnique({ where: { key: CHAVE_REF_ITEM } });
        const modoValido = lerModoRefItemValido(reg);
        const modo = modoValido || 'auto';
        const ligado = await emissao.refItemLigada();   // fonte da verdade do comportamento

        const obrigatorioEm = emissao.DATA_OBRIGATORIA_REF_ITEM;
        const diasRestantes = Math.round(
            (Date.parse(`${obrigatorioEm}T00:00:00Z`) - Date.parse(`${hojeBrasilia()}T00:00:00Z`)) / 86400000
        );

        const salvo = (reg?.value && typeof reg.value === 'object' && !Array.isArray(reg.value)) ? reg.value : {};
        const perms = req._perms || await getPerms(req.user.id);
        req._perms = perms;

        res.json({
            chave: CHAVE_REF_ITEM,
            modo,                       // 'auto' | 'sempre' | 'nunca' (o que está guardado)
            modos: MODOS_REF_ITEM,      // valores aceitos pelo PUT
            ligado,                     // resultado EFETIVO de refItemLigada()
            // `definido` = existe uma ESCOLHA VÁLIDA gravada — não é só "a linha existe".
            // Se alguém escrever lixo direto no banco (`{"modo":"xyz"}`), `modo` cai para 'auto'
            // e `definido` continua false: o lembrete segue aparecendo e o botão da tela continua
            // habilitado para reescrever a chave, em vez de travar sem saída.
            definido: modoValido !== null,
            obrigatorioEm,              // '2026-10-05'
            diasRestantes,              // negativo depois do prazo
            ambiente: focusNfe.ambiente(),          // 'producao' | 'homologacao'
            atualizadoEm: salvo.atualizadoEm || null,
            atualizadoPorNome: salvo.atualizadoPorNome || null,
            podeEditar: podeEditarConfig(perms)
        });
    } catch (error) {
        console.error('Erro ao consultar o interruptor da referência por item:', error);
        res.status(500).json({ error: 'Erro ao consultar a configuração da NF-e de devolução.' });
    }
});

// ── PUT /devolucao-ref-item — grava o modo (o BOTÃO) ──
// Exige `configuracoes.edit` (ou admin), a mesma regra do resto deste arquivo: virar esta chave
// muda o conteúdo do XML da NF-e de devolução que a empresa emite.
router.put('/devolucao-ref-item', verificarAuth, checkConfig, async (req, res) => {
    try {
        const modo = String(req.body?.modo ?? '').trim().toLowerCase();
        if (!MODOS_REF_ITEM.includes(modo)) {
            return res.status(400).json({
                error: 'Valor inválido. Use "auto" (segue o prazo da SEFAZ), "sempre" (força ligado) ou "nunca" (força desligado).',
                modos: MODOS_REF_ITEM
            });
        }

        const regAnterior = await prisma.appConfig.findUnique({ where: { key: CHAVE_REF_ITEM } });
        const anteriorValido = lerModoRefItemValido(regAnterior);
        const anterior = anteriorValido || 'auto';   // o que a emissão estava fazendo antes
        // No log, distinguir "estava em auto por escolha" de "nunca escolheram nada" — senão a
        // primeira decisão do dono é registrada como "auto → auto" e parece que não mudou nada.
        const anteriorRotulo = anteriorValido || 'auto (padrão, sem escolha gravada)';

        const value = {
            modo,
            atualizadoEm: new Date().toISOString(),
            atualizadoPorId: req.user.id,
            atualizadoPorNome: req.user.nome || null
        };
        await prisma.appConfig.upsert({
            where: { key: CHAVE_REF_ITEM },
            update: { value },
            create: { key: CHAVE_REF_ITEM, value }
        });

        // Estado efetivo DEPOIS de gravar, lido pela mesma função da emissão.
        const ligado = await emissao.refItemLigada();

        // Auditoria FORA do caminho crítico: a chave JÁ está gravada. Log lento ou com defeito
        // nunca pode derrubar nem desfazer a alteração que a pessoa acabou de fazer.
        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'ALTERAR_NFE_DEVOLUCAO_REF_ITEM',
                    entidade: 'AppConfig',
                    entidadeId: CHAVE_REF_ITEM,
                    detalhes: `Referência da nota de origem por item na NF-e de devolução: ${anteriorRotulo} → ${modo} · efeito agora: ${ligado ? 'LIGADO' : 'desligado'} · ambiente ${focusNfe.ambiente()}`,
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || '(sem nome)'
                }
            });
        } catch (logErr) {
            console.error('[ConfigNotas] falha no audit log do interruptor (a chave JÁ foi gravada):', logErr.message);
        }
        try {
            console.log(`[ConfigNotas] nfe_devolucao_ref_item: ${anteriorRotulo} → ${modo} por ${req.user.nome || req.user.id} (efeito: ${ligado ? 'ligado' : 'desligado'})`);
        } catch { /* log não bloqueia */ }

        res.json({ ok: true, chave: CHAVE_REF_ITEM, modo, modoAnterior: anterior, ligado, ambiente: focusNfe.ambiente() });
    } catch (error) {
        console.error('Erro ao salvar o interruptor da referência por item:', error);
        res.status(500).json({ error: 'Erro ao salvar a configuração da NF-e de devolução.' });
    }
});

module.exports = router;

