# startup.ps1 — 統合ランチャー（起動.bat から呼ばれる）
# config読み込み → ポートチェック → サーバー起動 → ブラウザ起動 を1プロセスで実行

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── config.json 読み込み ──
$ConfigFile = Join-Path $ScriptDir "config.json"
if (Test-Path $ConfigFile) {
    $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
} else {
    $Config = [PSCustomObject]@{ port = 7890; browser = "msedge"; dataDir = "" }
}
$Port = [int]$Config.port
$Browser = if ($Config.PSObject.Properties.Name -contains "browser" -and $Config.browser) { $Config.browser } else { "msedge" }

Write-Host "Port: $Port"
Write-Host "Browser: $Browser"

# ── ポート使用中チェック＆サーバー起動 ──
$needStart = $true

$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    # ポートが占有されている → ping で応答確認
    try {
        Invoke-WebRequest -Uri "http://localhost:$Port/api/ping" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
        Write-Host "Server already running."
        $needStart = $false
    } catch {
        # 応答なし → server.ps1 を実行中の PowerShell プロセスを kill
        # HttpListener は HTTP.sys (PID 4) を使うため、ポートの OwningProcess では検出できない
        Write-Host "Port $Port is occupied by stale process. Killing..."
        $stale = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'server\.ps1' }
        foreach ($p in $stale) {
            try {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
                Write-Host ("Killed PID " + $p.ProcessId)
            } catch { }
        }
        Start-Sleep -Seconds 2
    }
}

if ($needStart) {
    Write-Host "Starting server..."
    Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $ScriptDir 'server.ps1')

    # サーバーの起動を待つ（最大20秒、500ms間隔）
    Write-Host "Waiting for server..."
    $max = 40  # 40 x 500ms = 20秒
    $i = 0
    do {
        try {
            Invoke-WebRequest -Uri "http://localhost:$Port/api/ping" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop | Out-Null
            Write-Host "Server ready."
            break
        } catch { }
        Start-Sleep -Milliseconds 500
        $i++
    } while ($i -lt $max)

    if ($i -ge $max) {
        Write-Host "Warning: server timeout"
    }
}

# ── ブラウザでアプリを開く ──
Start-Process $Browser "http://localhost:$Port/"

Write-Host "Done!"
