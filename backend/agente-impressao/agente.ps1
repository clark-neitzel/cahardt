# =====================================================================
# Agente de impressao CA-Hardt  -  roda no PC da cozinha (Windows 10, PowerShell 5.1)
#
# O que faz: a cada 3 s pergunta ao sistema se ha etiqueta para imprimir, manda os
# bytes CRUS (EPL2/ZPL) para a impressora pelo spooler do Windows (RAW, sem dialogo)
# e so confirma "IMPRESSO" depois que o trabalho saiu da fila do Windows.
#
# Pasta: C:\CAHardtAgente\  (agente.ps1, config.json, agente.log, feitos.log)
# Este arquivo e baixado do sistema (GET /api/impressao-agente/script) e se
# atualiza sozinho. Mantenha-o SOMENTE em ASCII (PowerShell 5.1 le UTF-8 sem BOM
# como ANSI e estragaria acentos).
# =====================================================================

$VERSAO = '1.0.0'

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$PASTA = 'C:\CAHardtAgente'
$ARQ_SCRIPT = Join-Path $PASTA 'agente.ps1'
$ARQ_CONFIG = Join-Path $PASTA 'config.json'
$ARQ_LOG    = Join-Path $PASTA 'agente.log'
$ARQ_FEITOS = Join-Path $PASTA 'feitos.log'

if (-not (Test-Path $PASTA)) { New-Item -ItemType Directory -Path $PASTA -Force | Out-Null }

# ---------------- log (rotaciona em 1 MB, guarda 5) ----------------
function Log([string]$msg) {
    try {
        if ((Test-Path $ARQ_LOG) -and ((Get-Item $ARQ_LOG).Length -gt 1MB)) {
            for ($i = 4; $i -ge 1; $i--) {
                $de = "$ARQ_LOG.$i"; $para = "$ARQ_LOG." + ($i + 1)
                if (Test-Path $de) { Move-Item -Path $de -Destination $para -Force }
            }
            Move-Item -Path $ARQ_LOG -Destination "$ARQ_LOG.1" -Force
        }
        $linha = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ' + $msg
        Add-Content -Path $ARQ_LOG -Value $linha -Encoding ASCII
    } catch {}
}

# ---------------- instancia unica ----------------
$mutex = New-Object System.Threading.Mutex($false, 'Global\CAHardtAgenteImpressao')
$temMutex = $false
try { $temMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $temMutex = $true }
if (-not $temMutex) { exit 0 }

Log "=== Agente $VERSAO iniciado em $env:COMPUTERNAME ==="

# ---------------- configuracao ----------------
$cfg = $null
while (-not $cfg) {
    try {
        $cfg = Get-Content -Raw -Path $ARQ_CONFIG | ConvertFrom-Json
        if (-not $cfg.url -or -not $cfg.token) { throw 'config.json sem url/token' }
    } catch {
        $cfg = $null
        Log ('ERRO ao ler config.json: ' + $_.Exception.Message + ' (nova tentativa em 30 s)')
        Start-Sleep -Seconds 30
    }
}
$URL = ([string]$cfg.url).TrimEnd('/')
$TOKEN = [string]$cfg.token
$HEAD = @{ 'x-agente-token' = $TOKEN }

# ---------------- envio RAW ao spooler (winspool.drv) ----------------
if (-not ('RawPrinterCah' -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterCah
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);

    // Devolve o numero do job no spooler (> 0) ou 0 em caso de erro (mensagem em err).
    public static int Send(string printer, byte[] data, string docName, out string err)
    {
        err = null;
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero))
        {
            err = "OpenPrinter falhou (codigo " + Marshal.GetLastWin32Error() + ")";
            return 0;
        }
        int jobId = 0;
        try
        {
            DOCINFO di = new DOCINFO();
            di.pDocName = docName;
            di.pOutputFile = null;
            di.pDataType = "RAW";
            jobId = StartDocPrinter(h, 1, di);
            if (jobId <= 0)
            {
                err = "StartDocPrinter falhou (codigo " + Marshal.GetLastWin32Error() + ")";
                return 0;
            }
            if (!StartPagePrinter(h))
            {
                err = "StartPagePrinter falhou (codigo " + Marshal.GetLastWin32Error() + ")";
                EndDocPrinter(h);
                return 0;
            }
            int written;
            bool ok = WritePrinter(h, data, data.Length, out written);
            int codigo = ok ? 0 : Marshal.GetLastWin32Error();
            EndPagePrinter(h);
            EndDocPrinter(h);
            if (!ok || written != data.Length)
            {
                err = "WritePrinter falhou (codigo " + codigo + ", escritos " + written + " de " + data.Length + ")";
                return 0;
            }
            return jobId;
        }
        finally
        {
            ClosePrinter(h);
        }
    }
}
"@
}

# ---------------- API ----------------
function Invoke-Api([string]$metodo, [string]$rota, $corpo) {
    $params = @{ Uri = ($URL + $rota); Method = $metodo; Headers = $HEAD; TimeoutSec = 15; UseBasicParsing = $true }
    if ($null -ne $corpo) {
        $json = $corpo | ConvertTo-Json -Depth 6 -Compress
        $params.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
        $params.ContentType = 'application/json; charset=utf-8'
    }
    return Invoke-RestMethod @params
}

function Codigo-Http($ex) {
    try { return [int]$ex.Exception.Response.StatusCode } catch { return 0 }
}

# ---------------- feitos.log (anti-duplicata) ----------------
$feitos = New-Object 'System.Collections.Generic.HashSet[string]'
if (Test-Path $ARQ_FEITOS) {
    try { Get-Content -Path $ARQ_FEITOS | ForEach-Object { if ($_) { [void]$feitos.Add($_.Trim()) } } } catch {}
}
function Marcar-Feito([string]$id) {
    if ($feitos.Add($id)) {
        try {
            Add-Content -Path $ARQ_FEITOS -Value $id -Encoding ASCII
            $linhas = @(Get-Content -Path $ARQ_FEITOS)
            if ($linhas.Count -gt 600) {
                $linhas | Select-Object -Last 500 | Set-Content -Path $ARQ_FEITOS -Encoding ASCII
            }
        } catch {}
    }
}
function Desmarcar-Feito([string]$id) {
    if ($feitos.Remove($id)) {
        try { @(Get-Content -Path $ARQ_FEITOS) | Where-Object { $_ -and $_.Trim() -ne $id } | Set-Content -Path $ARQ_FEITOS -Encoding ASCII } catch {}
    }
}

# ---------------- resultados (com repeticao se a rede falhar) ----------------
$resultadosPendentes = New-Object System.Collections.ArrayList

function Enviar-Resultado([string]$id, [string]$status, [string]$erro, [int]$ms) {
    $corpo = @{ status = $status; ms = $ms }
    if ($erro) { $corpo.erro = $erro }
    try {
        [void](Invoke-Api 'POST' ("/trabalhos/$id/resultado") $corpo)
        Log "resultado $status enviado (job $id)"
        return $true
    } catch {
        $cod = Codigo-Http $_
        if ($cod -eq 404 -or $cod -eq 400) { Log "resultado recusado ($cod) para o job $id - descartado"; return $true }
        Log "falha ao enviar resultado do job $id (vai repetir): $($_.Exception.Message)"
        return $false
    }
}

function Reenviar-ResultadosPendentes {
    if ($resultadosPendentes.Count -eq 0) { return }
    $restantes = New-Object System.Collections.ArrayList
    foreach ($r in $resultadosPendentes) {
        if (Enviar-Resultado $r.id $r.status $r.erro $r.ms) { continue }
        $r.tentativas++
        if ($r.tentativas -lt 60) { [void]$restantes.Add($r) } else { Log "desistiu de reenviar o resultado do job $($r.id)" }
    }
    $resultadosPendentes.Clear()
    foreach ($r in $restantes) { [void]$resultadosPendentes.Add($r) }
}

function Informar([string]$id, [string]$status, [string]$erro, [int]$ms) {
    if (-not (Enviar-Resultado $id $status $erro $ms)) {
        [void]$resultadosPendentes.Add(@{ id = $id; status = $status; erro = $erro; ms = $ms; tentativas = 1 })
    }
}

# ---------------- impressoras do Windows ----------------
function Texto-StatusImpressora($p) {
    if ($p.WorkOffline) { return 'Offline' }
    switch ([int]$p.PrinterStatus) {
        3 { return 'Pronta' }
        4 { return 'Imprimindo' }
        5 { return 'Aquecendo' }
        7 { return 'Offline' }
        default { return 'Status ' + $p.PrinterStatus }
    }
}

function Listar-Impressoras {
    $lista = @()
    try {
        foreach ($p in @(Get-CimInstance -ClassName Win32_Printer)) {
            $lista += @{
                nome   = [string]$p.Name
                driver = [string]$p.DriverName
                porta  = [string]$p.PortName
                padrao = [bool]$p.Default
                status = (Texto-StatusImpressora $p)
            }
        }
    } catch { Log ('ERRO ao listar impressoras: ' + $_.Exception.Message) }
    return $lista
}

# Devolve $null se a impressora existe e pode imprimir; senao, a mensagem do problema.
function Problema-Impressora([string]$nome) {
    $achada = $null
    try { $achada = @(Get-CimInstance -ClassName Win32_Printer) | Where-Object { $_.Name -eq $nome } | Select-Object -First 1 } catch {}
    if (-not $achada) { return "Impressora '$nome' nao encontrada neste computador." }
    if ($achada.WorkOffline -or [int]$achada.PrinterStatus -eq 7) { return 'Impressora offline (desligada ou cabo solto).' }
    switch ([int]$achada.DetectedErrorState) {
        4  { return 'Impressora sem papel/etiqueta.' }
        7  { return 'Tampa da impressora aberta.' }
        8  { return 'Etiqueta enroscada na impressora.' }
        9  { return 'Impressora offline.' }
        10 { return 'Impressora pede manutencao.' }
    }
    return $null
}

# Marcador de "nao sei": a consulta ao spooler falhou. NUNCA tratar como "o job saiu da fila"
# (senao uma falha transitoria do CIM confirmaria IMPRESSO sem ter imprimido).
$DESCONHECIDO = 'DESCONHECIDO'

# Devolve o job (objeto CIM), $null (consulta OK e o job nao esta mais na fila) ou $DESCONHECIDO (consulta falhou).
function Obter-JobSpooler([string]$impressora, [int]$jobId) {
    try {
        $j = @(Get-CimInstance -ClassName Win32_PrintJob -Filter "JobId=$jobId" -ErrorAction Stop) | Where-Object { $_.Name -like ($impressora + ',*') } | Select-Object -First 1
        return $j
    } catch {
        Log ('aviso: nao consegui consultar a fila do Windows: ' + $_.Exception.Message)
        return $DESCONHECIDO
    }
}

function Remover-JobSpooler([string]$impressora, [int]$jobId) {
    try { Remove-PrintJob -PrinterName $impressora -ID $jobId -ErrorAction Stop } catch {
        try { $j = Obter-JobSpooler $impressora $jobId; if ($j -and $j -ne $DESCONHECIDO) { [void](Invoke-CimMethod -InputObject $j -MethodName Delete) } } catch {}
    }
}

function Job-ComErro($j) {
    $s = ([string]$j.JobStatus + ' ' + [string]$j.Status)
    return ($s -match 'Error|Offline|Paper|Intervention|Blocked|Erro')
}

# Trabalhos que ja estao no spooler mas ainda nao confirmados: @{ id; impressora; jobId; limite; inicio }
$aguardando = New-Object System.Collections.ArrayList
# Ids do lote recebido que ainda nao terminaram de ser processados (entram em emAndamento)
$loteAtual = New-Object System.Collections.ArrayList

function Conferir-Aguardando {
    if ($aguardando.Count -eq 0) { return }
    $restantes = New-Object System.Collections.ArrayList
    foreach ($a in $aguardando) {
        $j = Obter-JobSpooler $a.impressora $a.jobId
        $ms = [int]((Get-Date) - $a.inicio).TotalMilliseconds
        if ($j -is [string] -and $j -eq $DESCONHECIDO) {
            # nao sei: tenta de novo no proximo ciclo (so desiste no limite de tempo)
            if ((Get-Date) -gt $a.limite.AddMinutes(4)) {
                # mantem em feitos.log: pode ter impresso; um reenvio do mesmo id so confirma, nunca imprime de novo
                Informar $a.id 'ERRO' 'Nao consegui confirmar a impressao (falha ao consultar a fila do Windows).' $ms
                continue
            }
            [void]$restantes.Add($a)
            continue
        }
        if (-not $j) { Informar $a.id 'IMPRESSO' '' $ms; continue }
        if (Job-ComErro $j) {
            $motivo = 'Impressora com problema: ' + [string]$j.JobStatus + ' ' + [string]$j.Status
            Remover-JobSpooler $a.impressora $a.jobId
            Desmarcar-Feito $a.id
            Informar $a.id 'ERRO' $motivo $ms
            continue
        }
        if ((Get-Date) -gt $a.limite) {
            Remover-JobSpooler $a.impressora $a.jobId
            Desmarcar-Feito $a.id
            Informar $a.id 'ERRO' 'A impressora nao terminou a tempo (trabalho cancelado na fila do Windows).' $ms
            continue
        }
        [void]$restantes.Add($a)
    }
    $aguardando.Clear()
    foreach ($a in $restantes) { [void]$aguardando.Add($a) }
}

# ---------------- processa um trabalho ----------------
function Processar-Trabalho($t) {
    $inicio = Get-Date
    $id = [string]$t.id
    $nomeWin = [string]$t.impressora.nomeWindows

    # expirado: nunca imprime etiqueta velha
    $exp = $t.expiraEm
    if ($exp -is [string]) { $exp = [DateTime]::Parse($exp, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind) }
    if ($exp.ToUniversalTime() -lt (Get-Date).ToUniversalTime()) {
        Log "job $id expirado - nao imprime"
        Informar $id 'EXPIRADO' 'Expirou antes de o agente imprimir.' 0
        return
    }

    # ja impresso antes (resultado se perdeu na rede): so reenvia o resultado
    if ($feitos.Contains($id)) {
        Log "job $id ja estava em feitos.log - nao imprime de novo, so confirma"
        Informar $id 'IMPRESSO' '' 0
        return
    }

    $problema = Problema-Impressora $nomeWin
    if ($problema) {
        Log "job $id nao enviado: $problema"
        Informar $id 'ERRO' $problema 0
        return
    }

    try { $bytes = [Convert]::FromBase64String([string]$t.conteudoBase64) } catch {
        Informar $id 'ERRO' 'Conteudo do trabalho invalido.' 0
        return
    }

    $copias = 1; try { $copias = [Math]::Max(1, [int]$t.copias) } catch {}
    $err = $null
    $jobId = [RawPrinterCah]::Send($nomeWin, $bytes, "CAHardt etiqueta $($id.Substring(0,8))", [ref]$err)
    if ($jobId -le 0) {
        Log "job $id falhou ao enviar ao spooler: $err"
        Informar $id 'ERRO' $err 0
        return
    }
    Marcar-Feito $id    # a partir daqui ja esta no spooler: nunca reenviar este id
    Log "job $id enviado ao spooler (job Windows $jobId, $($bytes.Length) bytes, impressora '$nomeWin')"

    $espera = [Math]::Min(30, 20 + $copias)
    $fim = (Get-Date).AddSeconds($espera)
    while ((Get-Date) -lt $fim) {
        $j = Obter-JobSpooler $nomeWin $jobId
        if ($j -is [string] -and $j -eq $DESCONHECIDO) { Start-Sleep -Milliseconds 800; continue }   # nao sei: tenta de novo
        if (-not $j) {
            $ms = [int]((Get-Date) - $inicio).TotalMilliseconds
            Informar $id 'IMPRESSO' '' $ms
            return
        }
        if (Job-ComErro $j) {
            $motivo = 'Impressora com problema: ' + [string]$j.JobStatus + ' ' + [string]$j.Status
            Remover-JobSpooler $nomeWin $jobId
            Desmarcar-Feito $id
            Informar $id 'ERRO' $motivo ([int]((Get-Date) - $inicio).TotalMilliseconds)
            return
        }
        Start-Sleep -Milliseconds 400
    }
    # ainda na fila, sem erro: continua acompanhando nos proximos ciclos
    [void]$aguardando.Add(@{ id = $id; impressora = $nomeWin; jobId = $jobId; inicio = $inicio; limite = (Get-Date).AddSeconds(60) })
    Log "job $id ainda na fila do Windows - acompanhando"
}

# ---------------- autoatualizacao ----------------
$ultimaTentativaUpdate = [DateTime]::MinValue

function Atualizar-Agente([string]$versaoServidor) {
    if (((Get-Date) - $ultimaTentativaUpdate).TotalMinutes -lt 10) { return }
    $script:ultimaTentativaUpdate = Get-Date
    if ($aguardando.Count -gt 0) { return }   # nao troca de agente com trabalho em andamento
    try {
        $tmp = Join-Path $PASTA 'agente.ps1.novo'
        Invoke-WebRequest -UseBasicParsing -Uri ($URL + '/script') -Headers $HEAD -OutFile $tmp -TimeoutSec 30
        $erros = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($tmp, [ref]$null, [ref]$erros)
        if ($erros -and $erros.Count -gt 0) { Log 'autoatualizacao: script novo com erro de sintaxe - ignorado'; Remove-Item $tmp -Force; return }
        # Defesa contra arquivo vazio/truncado/trocado: tem que conter $VERSAO = '...' e ser a versao anunciada pelo servidor
        $textoNovo = Get-Content -Raw -Path $tmp
        $m = [regex]::Match([string]$textoNovo, '\$VERSAO\s*=\s*''([^'']+)''')
        if (-not $m.Success -or -not $versaoServidor -or $m.Groups[1].Value -ne $versaoServidor) {
            Log ('autoatualizacao: script baixado nao confere (versao no arquivo: ' + $(if ($m.Success) { $m.Groups[1].Value } else { 'nenhuma' }) + ', esperada: ' + $versaoServidor + ') - descartado')
            Remove-Item $tmp -Force
            return
        }
        Move-Item -Path $tmp -Destination $ARQ_SCRIPT -Force
        Log 'autoatualizacao: script novo instalado, reiniciando'
        try { $mutex.ReleaseMutex() } catch {}
        Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $ARQ_SCRIPT) -WindowStyle Hidden
        exit 0
    } catch {
        Log ('autoatualizacao falhou: ' + $_.Exception.Message)
    }
}

# ---------------- laco principal ----------------
$enviarImpressoras = $true
$ultimaListaImpressoras = [DateTime]::MinValue
$espera = 3
$conectado = $null   # $true / $false: so loga quando muda

while ($true) {
    try {
        Conferir-Aguardando
        Reenviar-ResultadosPendentes

        $corpo = @{ versao = $VERSAO; hostname = $env:COMPUTERNAME; emAndamento = @(@($aguardando | ForEach-Object { $_.id }) + @($loteAtual)) }
        if ($enviarImpressoras -or (((Get-Date) - $ultimaListaImpressoras).TotalMinutes -ge 5)) {
            $corpo.impressoras = @(Listar-Impressoras)
            $ultimaListaImpressoras = Get-Date
            $enviarImpressoras = $false
        }

        $resp = Invoke-Api 'POST' '/sincronizar' $corpo
        if ($conectado -ne $true) { Log 'conectado ao sistema'; $conectado = $true }
        $espera = 3

        if ($resp.pedirImpressoras) { $enviarImpressoras = $true }

        $loteAtual.Clear()
        foreach ($t in @($resp.trabalhos)) { if ($null -ne $t -and $t.id) { [void]$loteAtual.Add([string]$t.id) } }
        foreach ($t in @($resp.trabalhos)) {
            if ($null -eq $t -or -not $t.id) { continue }
            try { Processar-Trabalho $t } catch {
                Log ("ERRO inesperado no job $($t.id): " + $_.Exception.Message)
                Informar ([string]$t.id) 'ERRO' ('Erro no agente: ' + $_.Exception.Message) 0
            }
        }

        $loteAtual.Clear()
        if ($resp.atualizar) { Atualizar-Agente ([string]$resp.versaoServidor) }
    } catch {
        $cod = Codigo-Http $_
        if ($conectado -ne $false) {
            if ($cod -eq 401) { Log 'TOKEN RECUSADO - o agente foi revogado ou o token foi trocado. Reinstale com o novo instalador.' }
            else { Log ("sem conexao com o sistema (HTTP $cod): " + $_.Exception.Message) }
            $conectado = $false
        }
        if ($cod -eq 401) {
            $espera = 30
        } else {
            $espera = [Math]::Min(30, $espera * 2)
        }
        # na falta de rede, continua acompanhando o que ja esta no spooler
        try { Conferir-Aguardando } catch {}
    }
    Start-Sleep -Seconds $espera
}
