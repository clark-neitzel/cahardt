// Impressão direta: fila no servidor + agente Windows (Etiquetas da Cozinha).
// Plano: docs/etiquetas-cozinha/PLANO-ARQUITETO.md (seções 2.2 a 2.4 e 4).
//
// Regras que este arquivo sustenta:
//  - token do agente: `cahp_` + 32 bytes hex; no banco só o SHA-256; comparação em tempo constante;
//    o token em claro NUNCA é logado nem devolvido depois da criação/rotação.
//  - reivindicação de trabalho atômica (FOR UPDATE SKIP LOCKED) — dois ciclos paralelos não pegam o mesmo job.
//  - trabalho nunca fica velho: expira (padrão 15 min) e nunca é entregue depois disso.
//  - sem $transaction aqui: cada passo é uma única instrução atômica no banco.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const { segredoConfere } = require('../utils/segredoConfere');

const PASTA_AGENTE = path.join(__dirname, '../agente-impressao');
const ARQUIVO_SCRIPT = path.join(PASTA_AGENTE, 'agente.ps1');

const EXPIRA_PADRAO_MIN = 15;
const LOTE_MAX = 2;               // trabalhos entregues por ciclo
const TRAVADO_APOS_MS = 90 * 1000; // ENVIANDO sem confirmação há mais disso volta p/ fila (se o agente não o tem)
const GRAVA_CONTATO_MS = 10 * 1000;

// Versão do agente = a constante `$VERSAO` do próprio agente.ps1 (fonte única).
function lerVersaoServidor() {
    try {
        const txt = fs.readFileSync(ARQUIVO_SCRIPT, 'utf8');
        const m = /\$VERSAO\s*=\s*'([^']+)'/.exec(txt);
        return m ? m[1] : '0.0.0';
    } catch (_) { return '0.0.0'; }
}
const VERSAO_SERVIDOR = lerVersaoServidor();

function lerScript() {
    return fs.readFileSync(ARQUIVO_SCRIPT);
}

// ---------- token ----------

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function gerarToken() {
    const token = 'cahp_' + crypto.randomBytes(32).toString('hex');
    return { token, hash: hashToken(token), prefixo: token.slice(0, 8) };
}

// Devolve o agente ativo dono do token, ou null. Compara o hash em tempo constante.
async function autenticarAgente(tokenRecebido) {
    if (typeof tokenRecebido !== 'string' || !tokenRecebido.startsWith('cahp_') || tokenRecebido.length > 200) return null;
    const hash = hashToken(tokenRecebido);
    const agente = await prisma.impressaoAgente.findUnique({ where: { tokenHash: hash } });
    if (!agente || !segredoConfere(hash, agente.tokenHash)) return null;
    if (!agente.ativo) return null;
    return agente;
}

// ---------- estado do agente ----------

const _visto = new Map();        // agenteId -> timestamp do último sincronizar (preciso, em memória)
const _emAndamento = new Map();  // agenteId -> { ids:Set<string>, em:number }

function ultimoVisto(agente) {
    const db = agente.ultimoContato ? new Date(agente.ultimoContato).getTime() : 0;
    return Math.max(db, _visto.get(agente.id) || 0) || null;
}

function estadoAgente(agente) {
    if (agente.ativo === false) return 'OFFLINE'; // revogado: sem esperar o tempo de contato expirar
    const t = ultimoVisto(agente);
    if (!t) return 'OFFLINE';
    const idade = Date.now() - t;
    if (idade < 20 * 1000) return 'ONLINE';
    if (idade < 2 * 60 * 1000) return 'INSTAVEL';
    return 'OFFLINE';
}

// Visão pública de um agente (NUNCA inclui tokenHash).
function agentePublico(agente) {
    const t = ultimoVisto(agente);
    return {
        id: agente.id,
        nome: agente.nome,
        ativo: agente.ativo,
        tokenPrefixo: agente.tokenPrefixo,
        hostname: agente.hostname,
        versaoAgente: agente.versaoAgente,
        ultimoContato: t ? new Date(t) : null,
        estado: estadoAgente(agente),
        online: estadoAgente(agente) === 'ONLINE',
        impressorasWindows: Array.isArray(agente.impressorasWindows) ? agente.impressorasWindows : [],
        impressorasAtualizadasEm: agente.impressorasAtualizadasEm,
        pedirImpressoras: agente.pedirImpressoras,
        versaoServidor: VERSAO_SERVIDOR,
        desatualizado: !!agente.versaoAgente && agente.versaoAgente !== VERSAO_SERVIDOR,
    };
}

// ---------- fila ----------

async function minutosExpiracao() {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'impressao_expira_min' } });
        const n = Number(cfg?.value);
        if (Number.isFinite(n) && n >= 1 && n <= 240) return n;
    } catch (_) { /* usa o padrão */ }
    return EXPIRA_PADRAO_MIN;
}

// Compressão do ^GFA: ajustes.gfCompressao da impressora > appConfig 'impressao_gf_compressao' > 'Z64'.
// 'Z64' (padrão) | 'HEX' (reserva p/ firmware sem :Z64:). Corrigível por configuração, sem deploy.
async function compressaoGf(impressora) {
    const doCadastro = String(impressora?.ajustes?.gfCompressao ?? '').toUpperCase();
    if (doCadastro === 'HEX' || doCadastro === 'Z64') return doCadastro;
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'impressao_gf_compressao' } });
        const v = String(cfg?.value ?? '').toUpperCase();
        if (v === 'HEX' || v === 'Z64') return v;
    } catch (_) { /* usa o padrão */ }
    return 'Z64';
}

// Valida o objeto `ajustes` de uma impressora (PUT /impressoras/:id e admin-exec impressora-ajustes).
// Devolve { ajustes } ou { erro }. Chaves desconhecidas são ignoradas.
function validarAjustes(b) {
    if (typeof b !== 'object' || b === null || Array.isArray(b)) return { erro: 'Ajustes inválidos.' };
    const aj = {};
    for (const k of ['densidade', 'velocidade', 'col1X', 'col2X']) {
        if (b[k] === undefined || b[k] === null || b[k] === '') continue;
        const n = Number(b[k]);
        if (!Number.isFinite(n) || Math.abs(n) > 2000) return { erro: `Ajuste "${k}" inválido.` };
        aj[k] = n;
    }
    for (const k of ['offsetX', 'offsetY']) { // inteiros 0..200 (negativo a impressão recusa)
        if (b[k] === undefined || b[k] === null || b[k] === '') continue;
        const n = Number(b[k]);
        if (!Number.isInteger(n) || n < 0 || n > 200) return { erro: `Ajuste "${k}" deve ser um inteiro de 0 a 200.` };
        aj[k] = n;
    }
    if (b.gwInverter !== undefined && b.gwInverter !== null) {
        if (typeof b.gwInverter !== 'boolean') return { erro: 'Ajuste "gwInverter" deve ser verdadeiro ou falso.' };
        aj.gwInverter = b.gwInverter;
    }
    if (b.gfCompressao !== undefined && b.gfCompressao !== null && b.gfCompressao !== '') {
        if (!['Z64', 'HEX'].includes(b.gfCompressao)) return { erro: 'Ajuste "gfCompressao" deve ser Z64 ou HEX.' };
        aj.gfCompressao = b.gfCompressao;
    }
    return { ajustes: aj };
}

// Estado da impressora na lista que o agente reportou ('Pronta'|'Offline'|...|'nao_listada')
function estadoWindowsDe(agente, nomeWindows) {
    const lista = Array.isArray(agente?.impressorasWindows) ? agente.impressorasWindows : [];
    const p = lista.find((x) => x?.nome === nomeWindows);
    return p ? (p.status || 'desconhecido') : 'nao_listada';
}

// Grava um trabalho PENDENTE. `chaveIdempotencia` repetida devolve o trabalho que já existe.
async function enfileirar({ impressoraId, tipo = 'OUTRO', conteudo, copias = 1, chaveIdempotencia = null, loteId = null, usuario = null, referencia = null }) {
    if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) throw new Error('Conteúdo vazio.');
    if (chaveIdempotencia) {
        const existente = await prisma.impressaoTrabalho.findUnique({ where: { chaveIdempotencia } });
        if (existente) return Object.assign(existente, { reaproveitado: true });
    }
    const min = await minutosExpiracao();
    try {
        return await prisma.impressaoTrabalho.create({
            data: {
                impressoraId, tipo, status: 'PENDENTE', conteudo, conteudoBytes: conteudo.length,
                copias, chaveIdempotencia, loteId,
                referencia: referencia ? String(referencia).slice(0, 200) : null,
                solicitadoPorId: usuario?.id || null, solicitadoPorNome: usuario?.nome || null,
                expiraEm: new Date(Date.now() + min * 60 * 1000),
            },
        });
    } catch (e) {
        if (e.code === 'P2002' && chaveIdempotencia) { // clique duplo simultâneo
            const ja = await prisma.impressaoTrabalho.findUnique({ where: { chaveIdempotencia } });
            if (ja) return Object.assign(ja, { reaproveitado: true });
        }
        throw e;
    }
}

// Reivindicação ATÔMICA: marca até LOTE_MAX trabalhos PENDENTES do agente como ENVIANDO e os devolve.
// FOR UPDATE SKIP LOCKED => chamadas paralelas nunca recebem o mesmo trabalho.
// (NOW() AT TIME ZONE 'UTC': as colunas são timestamp sem fuso e o Prisma grava em UTC.)
async function reivindicar(agenteId) {
    const linhas = await prisma.$queryRaw`
        UPDATE impressao_fila
           SET status = 'ENVIANDO',
               tentativas = tentativas + 1,
               enviado_ao_agente_em = (NOW() AT TIME ZONE 'UTC'),
               agente_id = ${agenteId}
         WHERE id IN (
               SELECT f.id
                 FROM impressao_fila f
                 JOIN impressoras i ON i.id = f.impressora_id
                WHERE f.status = 'PENDENTE'
                  AND f.expira_em > (NOW() AT TIME ZONE 'UTC')
                  AND i.agente_id = ${agenteId}
                  AND (i.ativa = true OR f.tipo = 'TESTE')
                  AND f.conteudo IS NOT NULL
                ORDER BY f.pedido_em
                LIMIT ${LOTE_MAX}
                  FOR UPDATE OF f SKIP LOCKED)
     RETURNING id, impressora_id, tipo, copias, tentativas, expira_em, conteudo`;
    if (!linhas.length) return [];
    const imps = await prisma.impressora.findMany({
        where: { id: { in: [...new Set(linhas.map((l) => l.impressora_id))] } },
        select: { id: true, nomeWindows: true, linguagem: true },
    });
    const porId = new Map(imps.map((i) => [i.id, i]));
    return linhas.map((l) => ({
        id: l.id,
        impressora: porId.get(l.impressora_id) || { id: l.impressora_id },
        tipo: l.tipo,
        copias: l.copias,
        tentativa: l.tentativas,
        expiraEm: new Date(l.expira_em).toISOString(),
        conteudoBase64: Buffer.from(l.conteudo).toString('base64'),
    }));
}

// Ciclo do agente: heartbeat + lista de impressoras + trabalhos. Sem $transaction.
async function sincronizar(agente, corpo = {}, ip = null) {
    const agora = Date.now();
    _visto.set(agente.id, agora);
    if (Array.isArray(corpo.emAndamento)) {
        _emAndamento.set(agente.id, { ids: new Set(corpo.emAndamento.map(String).slice(0, 50)), em: agora });
    } else {
        _emAndamento.set(agente.id, { ids: new Set(), em: agora });
    }

    const dados = {};
    const hostname = typeof corpo.hostname === 'string' ? corpo.hostname.slice(0, 100) : null;
    const versao = typeof corpo.versao === 'string' ? corpo.versao.slice(0, 30) : null;
    if (hostname && hostname !== agente.hostname) dados.hostname = hostname;
    if (versao && versao !== agente.versaoAgente) dados.versaoAgente = versao;
    if (ip && ip !== agente.ultimoIp) dados.ultimoIp = String(ip).slice(0, 80);
    if (Array.isArray(corpo.impressoras)) {
        dados.impressorasWindows = corpo.impressoras.slice(0, 50).map((p) => ({
            nome: String(p?.nome ?? '').slice(0, 200),
            driver: String(p?.driver ?? '').slice(0, 200),
            porta: String(p?.porta ?? '').slice(0, 100),
            padrao: !!p?.padrao,
            status: String(p?.status ?? '').slice(0, 100),
        }));
        dados.impressorasAtualizadasEm = new Date();
        dados.pedirImpressoras = false;
    }
    const ultimoGravado = agente.ultimoContato ? new Date(agente.ultimoContato).getTime() : 0;
    if (Object.keys(dados).length || agora - ultimoGravado > GRAVA_CONTATO_MS) {
        dados.ultimoContato = new Date(agora);
        await prisma.impressaoAgente.update({ where: { id: agente.id }, data: dados });
    }

    // pedirImpressoras pode ter sido ligado pelo botão "Atualizar lista" depois da leitura do `agente`
    const pedir = Array.isArray(corpo.impressoras)
        ? false
        : (await prisma.impressaoAgente.findUnique({ where: { id: agente.id }, select: { pedirImpressoras: true } }))?.pedirImpressoras || false;

    const trabalhos = await reivindicar(agente.id);
    return {
        ok: true,
        agora: new Date(agora).toISOString(),
        pedirImpressoras: !!pedir,
        versaoServidor: VERSAO_SERVIDOR,
        atualizar: !!versao && versao !== VERSAO_SERVIDOR,
        trabalhos,
    };
}

// Resultado enviado pelo agente. Idempotente. Só mexe em trabalho de impressora do próprio agente.
async function registrarResultado(agente, trabalhoId, { status, erro, ms } = {}) {
    const t = await prisma.impressaoTrabalho.findUnique({
        where: { id: String(trabalhoId) },
        include: { impressora: { select: { agenteId: true } } },
    });
    if (!t || t.impressora.agenteId !== agente.id) return { http: 404, corpo: { error: 'Trabalho não encontrado.' } };
    if (t.status === 'IMPRESSO' || t.status === 'CANCELADO') return { http: 200, corpo: { ok: true, status: t.status } };

    if (status === 'IMPRESSO') {
        // Saiu de verdade: vale mesmo que tenha expirado/dado erro antes (a verdade é o papel).
        await prisma.impressaoTrabalho.updateMany({
            where: { id: t.id, status: { notIn: ['IMPRESSO', 'CANCELADO'] } },
            data: { status: 'IMPRESSO', impressoEm: new Date(), erro: null, agenteId: agente.id },
        });
        return { http: 200, corpo: { ok: true, status: 'IMPRESSO' } };
    }
    if (status === 'EXPIRADO') {
        await prisma.impressaoTrabalho.updateMany({
            where: { id: t.id, status: { notIn: ['IMPRESSO', 'CANCELADO'] } },
            data: { status: 'EXPIRADO', erro: String(erro || 'Expirou antes de o agente imprimir.').slice(0, 1000) },
        });
        return { http: 200, corpo: { ok: true, status: 'EXPIRADO' } };
    }
    if (status !== 'ERRO') return { http: 400, corpo: { error: 'status inválido.' } };

    const msg = String(erro || 'Erro não informado pelo agente.').slice(0, 1000);
    const reagendar = t.status === 'ENVIANDO' && t.tentativas < t.maxTentativas && t.expiraEm.getTime() > Date.now();
    await prisma.impressaoTrabalho.updateMany({
        where: { id: t.id, status: { notIn: ['IMPRESSO', 'CANCELADO'] } },
        data: { status: reagendar ? 'PENDENTE' : 'ERRO', erro: msg },
    });
    return { http: 200, corpo: { ok: true, status: reagendar ? 'PENDENTE' : 'ERRO', ms: ms ?? null } };
}

// Worker (a cada 60 s): expira o que venceu, devolve o que travou, limpa o antigo.
let _ultimaLimpeza = 0;
async function expirarELimpar() {
    const res = { expirados: 0, devolvidos: 0, erros: 0, limpos: 0 };
    const agora = new Date();

    const exp = await prisma.impressaoTrabalho.updateMany({
        where: { status: 'PENDENTE', expiraEm: { lte: agora } },
        data: { status: 'EXPIRADO', erro: 'Expirou: o computador da cozinha não buscou a tempo.' },
    });
    res.expirados += exp.count;

    const limite = new Date(Date.now() - TRAVADO_APOS_MS);
    const travados = await prisma.impressaoTrabalho.findMany({
        where: { status: 'ENVIANDO', enviadoAoAgenteEm: { lte: limite } },
        select: { id: true, agenteId: true, tentativas: true, maxTentativas: true, expiraEm: true },
        take: 100,
    });
    for (const t of travados) {
        const em = _emAndamento.get(t.agenteId);
        // Agente ainda diz que está imprimindo esse job (informação recente): não mexe.
        if (em && Date.now() - em.em < 30 * 1000 && em.ids.has(t.id)) continue;
        let status, erro;
        if (t.expiraEm.getTime() <= Date.now()) { status = 'EXPIRADO'; erro = 'Expirou sem confirmação do computador da cozinha.'; }
        else if (t.tentativas >= t.maxTentativas) { status = 'ERRO'; erro = 'O computador da cozinha não confirmou a impressão após várias tentativas.'; }
        else { status = 'PENDENTE'; erro = 'Sem confirmação do computador da cozinha; tentando de novo.'; }
        const r = await prisma.impressaoTrabalho.updateMany({ where: { id: t.id, status: 'ENVIANDO' }, data: { status, erro } });
        if (r.count) { if (status === 'PENDENTE') res.devolvidos++; else if (status === 'EXPIRADO') res.expirados++; else res.erros++; }
    }

    if (Date.now() - _ultimaLimpeza > 24 * 3600 * 1000) {
        _ultimaLimpeza = Date.now();
        const d7 = new Date(Date.now() - 7 * 86400000);
        const d90 = new Date(Date.now() - 90 * 86400000);
        const a = await prisma.impressaoTrabalho.updateMany({ where: { pedidoEm: { lt: d7 }, conteudo: { not: null } }, data: { conteudo: null } });
        const b = await prisma.impressaoTrabalho.deleteMany({ where: { pedidoEm: { lt: d90 } } });
        res.limpos = a.count + b.count;
    }
    return res;
}

// ---------- instalador ----------

// .bat (CRLF, só ASCII) gerado com URL e token. Roda como administrador no PC da cozinha.
function gerarInstaladorBat(baseUrl, token) {
    const url = String(baseUrl).replace(/\/+$/, '') + '/api/impressao-agente';
    const L = [
        '@echo off',
        'setlocal',
        'title Instalador do Agente de Impressao - CA-Hardt',
        `set "CAH_URL=${url}"`,
        `set "CAH_TOKEN=${token}"`,
        'set "CAH_PASTA=C:\\CAHardtAgente"',
        'set "CAH_TAREFA=CAHardt Agente de Impressao"',
        'echo.',
        'echo  ===== Agente de impressao CA-Hardt =====',
        'echo.',
        'net session >nul 2>&1',
        'if errorlevel 1 (',
        '  color 0C',
        '  echo  ERRO: este arquivo precisa rodar como ADMINISTRADOR.',
        '  echo  Feche esta janela, clique com o botao DIREITO no arquivo e escolha',
        '  echo  "Executar como administrador".',
        '  echo.',
        '  pause',
        '  exit /b 1',
        ')',
        'echo  [1/6] Criando a pasta %CAH_PASTA% ...',
        'if not exist "%CAH_PASTA%" mkdir "%CAH_PASTA%"',
        'echo  [2/6] Protegendo a pasta e gravando a configuracao ...',
        'icacls "%CAH_PASTA%" /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" >nul',
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $cfg=(@{url=$env:CAH_URL;token=$env:CAH_TOKEN}|ConvertTo-Json); [IO.File]::WriteAllText($env:CAH_PASTA+'\\config.json',$cfg,(New-Object Text.UTF8Encoding($false)))"`,
        'if errorlevel 1 goto :falhou',
        'echo  [3/6] Baixando o agente ...',
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri ($env:CAH_URL+'/script') -Headers @{'x-agente-token'=$env:CAH_TOKEN} -OutFile ($env:CAH_PASTA+'\\agente.ps1')"`,
        'if errorlevel 1 goto :falhou',
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:CAH_PASTA+'\\agente.ps1',[ref]$null,[ref]$e); if($e -and $e.Count){ exit 1 }"`,
        'if errorlevel 1 goto :falhou',
        'echo  [4/6] Desligando suspensao e hibernacao do PC ...',
        'powercfg /change standby-timeout-ac 0 >nul',
        'powercfg /change hibernate-timeout-ac 0 >nul',
        'powercfg /hibernate off >nul 2>&1',
        'echo  [5/6] Registrando para iniciar com o Windows ...',
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $a=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File '+$env:CAH_PASTA+'\\agente.ps1'); $t1=New-ScheduledTaskTrigger -AtStartup; $t2=New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::FromDays(3650)); $p=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest; $s=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew; Register-ScheduledTask -TaskName $env:CAH_TAREFA -Action $a -Trigger @($t1,$t2) -Principal $p -Settings $s -Force | Out-Null"`,
        'if errorlevel 1 goto :falhou',
        'schtasks /End /TN "%CAH_TAREFA%" >nul 2>&1',
        'schtasks /Run /TN "%CAH_TAREFA%" >nul 2>&1',
        'echo  [6/6] Testando a conexao com o sistema ...',
        'timeout /t 5 /nobreak >nul',
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $r=Invoke-RestMethod -Uri ($env:CAH_URL+'/ping') -Headers @{'x-agente-token'=$env:CAH_TOKEN} -TimeoutSec 20; if(-not $r.ok){ exit 1 }"`,
        'if errorlevel 1 goto :falhou',
        'color 0A',
        'echo.',
        'echo  ==========================================================',
        'echo   Agente instalado e funcionando.',
        'echo   Volte ao sistema: a bolinha do agente deve ficar verde.',
        'echo  ==========================================================',
        'echo.',
        'echo  Este arquivo tem a senha do agente dentro. Por seguranca,',
        'echo  e melhor apaga-lo agora (o agente ja esta instalado).',
        'choice /c SN /m "Apagar este arquivo agora"',
        'if errorlevel 2 goto :fim',
        'endlocal',
        '(goto) 2>nul & del "%~f0"',
        ':fim',
        'pause',
        'exit /b 0',
        ':falhou',
        'color 0C',
        'echo.',
        'echo  ERRO: a instalacao nao terminou. Tire uma foto desta tela e',
        'echo  envie para quem cuida do sistema.',
        'echo.',
        'pause',
        'exit /b 1',
    ];
    return L.join('\r\n') + '\r\n';
}

function gerarDesinstaladorBat() {
    const L = [
        '@echo off',
        'title Remover o Agente de Impressao - CA-Hardt',
        'net session >nul 2>&1',
        'if errorlevel 1 (',
        '  echo  Execute como ADMINISTRADOR (botao direito).',
        '  pause',
        '  exit /b 1',
        ')',
        'schtasks /End /TN "CAHardt Agente de Impressao" >nul 2>&1',
        'schtasks /Delete /TN "CAHardt Agente de Impressao" /F >nul 2>&1',
        'rmdir /S /Q "C:\\CAHardtAgente" >nul 2>&1',
        'echo  Agente removido.',
        'pause',
    ];
    return L.join('\r\n') + '\r\n';
}

// URL pública para o instalador: env explícita > Origin do navegador > Host encaminhado pelo proxy.
// O valor vai para `set "CAH_URL=..."` num .bat: só passa se tiver APENAS [A-Za-z0-9.:/-] (nada de aspas, %, &...).
const URL_SEGURA = /^https?:\/\/[A-Za-z0-9.:-]+(\/[A-Za-z0-9._\/-]*)?$/;
function baseUrlPublica(req) {
    const candidatos = [];
    if (process.env.IMPRESSAO_URL_PUBLICA) candidatos.push(process.env.IMPRESSAO_URL_PUBLICA.trim());
    if (req.headers.origin) candidatos.push(String(req.headers.origin).trim());
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').toString().split(',')[0].trim();
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
    candidatos.push(`${proto}://${host}`);
    for (const c of candidatos) {
        const limpo = c.replace(/\/+$/, '');
        if (URL_SEGURA.test(limpo)) return limpo;
    }
    throw new Error('Não consegui descobrir o endereço público do sistema para o instalador. Defina IMPRESSAO_URL_PUBLICA.');
}

module.exports = {
    VERSAO_SERVIDOR, EXPIRA_PADRAO_MIN,
    lerScript, hashToken, gerarToken, autenticarAgente,
    estadoAgente, agentePublico,
    enfileirar, estadoWindowsDe, compressaoGf, validarAjustes, reivindicar, sincronizar, registrarResultado, expirarELimpar,
    gerarInstaladorBat, gerarDesinstaladorBat, baseUrlPublica,
};
