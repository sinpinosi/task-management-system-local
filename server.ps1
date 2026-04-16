
# Task Management Tool - Background Server
# HTTP API (localhost:7890) + Windows Toast Notifications
# Compatible with PowerShell 5.1 (Windows built-in)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# config.json 読み込み
$ConfigFile = Join-Path $ScriptDir "config.json"
if (Test-Path $ConfigFile) {
    $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
} else {
    $Config = [PSCustomObject]@{ port = 7890; browser = "msedge"; dataDir = "" }
}
$Port = [int]$Config.port

# データディレクトリの解決 (config.dataDir が空なら既定の ./data/)
$_cfgDataDir = ""
if ($Config.PSObject.Properties.Name -contains "dataDir") { $_cfgDataDir = [string]$Config.dataDir }
if ($_cfgDataDir -and $_cfgDataDir.Trim() -ne "") {
    $DataDir = $_cfgDataDir.Trim()
} else {
    $DataDir = Join-Path $ScriptDir "data"
}

# dataPaths: ファイル種別ごとの保存先ディレクトリ（未指定の場合は dataDir を使用）
function Resolve-DataPath {
    param([string]$Key, [string]$FileName)
    $dir = $DataDir
    if ($Config.PSObject.Properties.Name -contains "dataPaths") {
        $dp = $Config.dataPaths
        if ($dp.PSObject.Properties.Name -contains $Key) {
            $v = [string]$dp.$Key
            if ($v -and $v.Trim() -ne "") { $dir = $v.Trim() }
        }
    }
    # 相対パスならスクリプトディレクトリ基準で解決
    if (-not [System.IO.Path]::IsPathRooted($dir)) {
        $dir = Join-Path $ScriptDir $dir
    }
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return Join-Path $dir $FileName
}

$ProjectsFile  = Resolve-DataPath "projects"  "projects.json"
$TasksFile     = Resolve-DataPath "tasks"     "tasks.json"
$AlarmsFile    = Resolve-DataPath "alarms"    "alarms.json"
$MemosFile     = Resolve-DataPath "memos"     "memos.json"
$PomodoroFile  = Resolve-DataPath "pomodoro"  "pomodoro.json"
$TemplatesFile = Resolve-DataPath "templates" "templates.json"
$MembersFile   = Join-Path $ScriptDir "members.json"

# ---- Windows Toast (WinRT - no download required) ----
function Show-Toast {
    param([string]$Title, [string]$Message, [switch]$Alarm)
    try {
        $null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
        $null = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
        $AppId = "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe"
        if ($Alarm) {
            $XmlString = "<toast scenario=""alarm"" duration=""long""><visual><binding template=""ToastGeneric""><text>$Title</text><text>$Message</text></binding></visual><actions><action content=""OK"" arguments=""dismiss"" activationType=""system""/></actions><audio silent=""true""/></toast>"
        } else {
            $XmlString = "<toast><visual><binding template=""ToastGeneric""><text>$Title</text><text>$Message</text></binding></visual></toast>"
        }
        $XmlDoc = New-Object Windows.Data.Xml.Dom.XmlDocument
        $XmlDoc.LoadXml($XmlString)
        $Toast = New-Object Windows.UI.Notifications.ToastNotification $XmlDoc
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($AppId).Show($Toast)
        Write-Host "[TOAST] $Title"
    } catch {
        Write-Host "[WARN] Toast failed: $_"
    }
}

# ============================================================
# Data helpers - PowerShell 5.1 safe
# ============================================================

# Read a JSON array file, returns System.Collections.Generic.List[object]
function Get-JsonArray {
    param([string]$Path)
    $list = New-Object 'System.Collections.Generic.List[object]'
    try {
        if (-not (Test-Path $Path)) { Write-Output -NoEnumerate $list; return }
        $raw = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8).Trim()
        if ($raw -eq '' -or $raw -eq 'null' -or $raw -eq '[]') { Write-Output -NoEnumerate $list; return }
        $parsed = $raw | ConvertFrom-Json
        if ($null -eq $parsed) { Write-Output -NoEnumerate $list; return }
        if ($parsed -is [System.Array]) {
            foreach ($item in $parsed) {
                if ($null -ne $item) { [void]$list.Add($item) }
            }
        } else {
            [void]$list.Add($parsed)
        }
    } catch {
        Write-Host "[WARN] Get-JsonArray error for $Path : $_"
    }
    Write-Output -NoEnumerate $list
}

# Read a JSON object file (not array), returns PSCustomObject or $null
function Get-JsonObject {
    param([string]$Path)
    try {
        if (-not (Test-Path $Path)) { return $null }
        $raw = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8).Trim()
        if ($raw -eq '' -or $raw -eq 'null') { return $null }
        return $raw | ConvertFrom-Json
    } catch {
        Write-Host "[WARN] Get-JsonObject error for $Path : $_"
        return $null
    }
}

# Write a List or array of objects to JSON file with proper [] wrapping
function Write-JsonArray {
    param([string]$Path, $Data)
    try {
        $parts = New-Object 'System.Collections.Generic.List[string]'
        if ($null -ne $Data) {
            if ($Data -is [System.Collections.IList]) {
                foreach ($item in $Data) {
                    if ($null -ne $item) { [void]$parts.Add(($item | ConvertTo-Json -Depth 20 -Compress)) }
                }
            } elseif ($Data -is [System.Array]) {
                foreach ($item in $Data) {
                    if ($null -ne $item) { [void]$parts.Add(($item | ConvertTo-Json -Depth 20 -Compress)) }
                }
            }
        }
        $json = if ($parts.Count -eq 0) { "[]" } else { "[" + [string]::Join("," + [System.Environment]::NewLine, $parts.ToArray()) + "]" }
        $tmp = $Path + ".tmp"
        [System.IO.File]::WriteAllText($tmp, $json, [System.Text.Encoding]::UTF8)
        Move-Item -LiteralPath $tmp -Destination $Path -Force
    } catch {
        Write-Host "[ERROR] Write-JsonArray: $_"
    }
}

# Write a single object to JSON file
function Write-JsonObject {
    param([string]$Path, $Data)
    try {
        $json = $Data | ConvertTo-Json -Depth 20
        $tmp = $Path + ".tmp"
        [System.IO.File]::WriteAllText($tmp, $json, [System.Text.Encoding]::UTF8)
        Move-Item -LiteralPath $tmp -Destination $Path -Force
    } catch {
        Write-Host "[ERROR] Write-JsonObject: $_"
    }
}

function New-Id {
    param([string]$Prefix = "id")
    $ts  = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $rnd = -join ((65..90) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    return "${Prefix}_${ts}_${rnd}"
}

# ============================================================
# 排他ロック — 同一マシン上の複数プロセス間で共有データを保護
# 注意: 異なるマシンからのネットワーク共有アクセスには効果なし
# ============================================================
$script:DataMutex = New-Object System.Threading.Mutex($false, "Global\TaskManagerDataLock")

# ============================================================
# グレースフルシャットダウン
# ============================================================
$script:ShuttingDown = $false

function Cleanup-Server {
    if ($script:ShuttingDown) { return }
    $script:ShuttingDown = $true
    Write-Host "[INFO] Shutting down..."
    try {
        if ($null -ne $Listener -and $Listener.IsListening) {
            $Listener.Stop()
            $Listener.Close()
            Write-Host "[INFO] Listener stopped."
        }
    } catch {
        Write-Host "[WARN] Listener cleanup: $($_.Exception.Message)"
    }
    try {
        if ($null -ne $script:DataMutex) {
            $script:DataMutex.Dispose()
            Write-Host "[INFO] Mutex disposed."
        }
    } catch {
        Write-Host "[WARN] Mutex cleanup: $($_.Exception.Message)"
    }
    Write-Host "[INFO] Cleanup complete."
}

Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Cleanup-Server } | Out-Null

function Acquire-DataLock {
    try {
        if (-not $script:DataMutex.WaitOne(15000)) {
            Write-Host "[WARN] Acquire-DataLock: 15秒待機後もロック取得できず — 続行します"
        }
    } catch [System.Threading.AbandonedMutexException] {
        # 前のプロセスがロック解放前に終了した場合 — ロックは取得済み
        Write-Host "[WARN] Acquire-DataLock: 放棄されたミューテックスを取得しました"
    }
}

function Release-DataLock {
    try { $script:DataMutex.ReleaseMutex() } catch { }
}

# ============================================================
# HTTP helpers
# ============================================================
function Send-Response {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [int]$StatusCode = 200,
        [string]$Body = "{}",
        [string]$ContentType = "application/json"
    )
    try {
        $Response.StatusCode = $StatusCode
        $Response.ContentType = "$ContentType; charset=utf-8"
        $Response.Headers.Add("Access-Control-Allow-Origin", "*")
        $Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        $Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
        $Response.ContentLength64 = $bytes.Length
        $Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $Response.OutputStream.Close()
    } catch { }
}

function Send-JsonResponse {
    param([System.Net.HttpListenerResponse]$Response, $Data, [int]$StatusCode = 200)
    $json = $Data | ConvertTo-Json -Depth 20 -Compress
    Send-Response -Response $Response -StatusCode $StatusCode -Body $json
}

function Send-ArrayResponse {
    param([System.Net.HttpListenerResponse]$Response, $List, [int]$StatusCode = 200)
    $parts = New-Object 'System.Collections.Generic.List[string]'
    if ($null -ne $List) {
        if ($List -is [System.Collections.IList]) {
            foreach ($item in $List) {
                if ($null -ne $item) { [void]$parts.Add(($item | ConvertTo-Json -Depth 20 -Compress)) }
            }
        }
    }
    $json = if ($parts.Count -eq 0) { "[]" } else { "[" + [string]::Join(",", $parts.ToArray()) + "]" }
    Send-Response -Response $Response -StatusCode $StatusCode -Body $json
}

function Get-RequestBody {
    param([System.Net.HttpListenerRequest]$Request)
    if ($Request.ContentLength64 -le 0) { return $null }
    try {
        $reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd()
        $reader.Close()
        if ($body -and $body.Trim()) { return ($body | ConvertFrom-Json) }
    } catch { }
    return $null
}

# ============================================================
# API handlers
# ============================================================
function Handle-Request {
    param([System.Net.HttpListenerContext]$Context)
    $req    = $Context.Request
    $res    = $Context.Response
    $method = $req.HttpMethod.ToUpper()
    $rawUrl = $req.RawUrl -replace '\?.*', ''
    $segs   = @($rawUrl.Trim('/') -split '/')

    if ($method -eq "OPTIONS") { Send-Response -Response $res -StatusCode 204 -Body ""; return }

    # Static file serving for non-API requests
    if ($segs[0] -ne "api") {
        if ($method -ne "GET") {
            Send-Response -Response $res -StatusCode 405 -Body '{"error":"Method Not Allowed"}'; return
        }
        $reqPath = $rawUrl.TrimStart('/')
        if ($reqPath -eq "") { $reqPath = "index.html" }
        $reqPath = $reqPath -replace '\.\.[\\/]', ''
        $filePath = Join-Path $ScriptDir ($reqPath -replace '/', '\')
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mimeType = switch ($ext) {
                ".html" { "text/html" }
                ".css"  { "text/css" }
                ".js"   { "application/javascript" }
                ".json" { "application/json" }
                ".ico"  { "image/x-icon" }
                ".png"  { "image/png" }
                default { "application/octet-stream" }
            }
            try {
                $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
                $res.StatusCode = 200
                $res.ContentType = if ($mimeType -like "text/*" -or $mimeType -eq "application/javascript" -or $mimeType -eq "application/json") { "$mimeType; charset=utf-8" } else { $mimeType }
                $res.ContentLength64 = $fileBytes.Length
                $res.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
                $res.OutputStream.Close()
            } catch { }
        } else {
            Send-Response -Response $res -StatusCode 404 -Body "Not Found" -ContentType "text/plain"
        }
        return
    }

    try {
        if ($segs.Count -lt 2) {
            Send-Response -Response $res -StatusCode 404 -Body '{"error":"Not Found"}'; return
        }
        $resource = $segs[1]
        $id = if ($segs.Count -ge 3) { $segs[2] } else { "" }

        if ($resource -eq "ping") {
            Send-JsonResponse -Response $res -Data @{ status = "ok" }
            return
        }

        if ($resource -eq "members") {
            if ($method -eq "GET") { Api-GetAll $res $MembersFile }
            else { Send-Response -Response $res -StatusCode 405 -Body '{"error":"Method Not Allowed"}' }
            return
        }

        if ($resource -eq "shutdown") {
            Send-JsonResponse -Response $res -Data @{ status = "shutting_down" }
            $Listener.Stop()
            return
        }

        if ($resource -eq "projects") {
            if     ($method -eq "GET")    { Api-GetAll    $res $ProjectsFile }
            elseif ($method -eq "POST")   { Api-Create    $res $ProjectsFile $req "proj" }
            elseif ($method -eq "PUT" -and $id -eq "reorder") { Api-ReorderItems $res $req $ProjectsFile }
            elseif ($method -eq "PUT")    { Api-Update    $res $ProjectsFile $req $id }
            elseif ($method -eq "DELETE") { Api-Delete    $res $ProjectsFile $id }
            else   { Send-Response -Response $res -StatusCode 405 -Body '{"error":"Method Not Allowed"}' }
            return
        }

        if ($resource -eq "tasks") {
            if     ($method -eq "GET")    { Api-GetAll      $res $TasksFile }
            elseif ($method -eq "POST")   { Api-CreateTask  $res $req }
            elseif ($method -eq "PUT" -and $id -eq "reorder") { Api-ReorderTasks $res $req }
            elseif ($method -eq "PUT")    { Api-UpdateTask  $res $req $id }
            elseif ($method -eq "DELETE") { Api-Delete      $res $TasksFile $id }
            else   { Send-Response -Response $res -StatusCode 405 -Body '{"error":"Method Not Allowed"}' }
            return
        }

        if ($resource -eq "alarms") {
            if     ($method -eq "GET")    { Api-GetAll  $res $AlarmsFile }
            elseif ($method -eq "POST")   { Api-Create  $res $AlarmsFile $req "alarm" }
            elseif ($method -eq "PUT")    { Api-Update  $res $AlarmsFile $req $id }
            elseif ($method -eq "DELETE") { Api-Delete  $res $AlarmsFile $id }
            else   { Send-Response -Response $res -StatusCode 405 -Body '{"error":"Method Not Allowed"}' }
            return
        }

        if ($resource -eq "memos") {
            if     ($method -eq "GET")    { Api-GetAll  $res $MemosFile }
            elseif ($method -eq "POST")   { Api-Create  $res $MemosFile $req "memo" }
            elseif ($method -eq "PUT")    { Api-Update  $res $MemosFile $req $id }
            elseif ($method -eq "DELETE") { Api-Delete  $res $MemosFile $id }
            else   { Send-Response -Response $res -StatusCode 405 -Body '{"error":"Method Not Allowed"}' }
            return
        }

        if ($resource -eq "templates") {
            if     ($method -eq "GET")    { Api-GetAll  $res $TemplatesFile }
            elseif ($method -eq "POST")   { Api-Create  $res $TemplatesFile $req "tmpl" }
            elseif ($method -eq "PUT" -and $id -eq "reorder") { Api-ReorderItems $res $req $TemplatesFile }
            elseif ($method -eq "PUT")    { Api-Update  $res $TemplatesFile $req $id }
            elseif ($method -eq "DELETE") { Api-Delete  $res $TemplatesFile $id }
            else   { Send-Response -Response $res -StatusCode 405 -Body '{"error":"Method Not Allowed"}' }
            return
        }

        if ($resource -eq "pomodoro") {
            if     ($method -eq "GET" -and $id -eq "settings") { Api-PomodoroGetSettings $res }
            elseif ($method -eq "PUT" -and $id -eq "settings") { Api-PomodoroSetSettings $res $req }
            elseif ($method -eq "GET" -and $id -eq "state")    { Api-PomodoroGetState    $res }
            elseif ($method -eq "PUT" -and $id -eq "state")    { Api-PomodoroSetState    $res $req }
            else   { Send-Response -Response $res -StatusCode 404 -Body '{"error":"Not Found"}' }
            return
        }

        Send-Response -Response $res -StatusCode 404 -Body '{"error":"Not Found"}'

    } catch {
        Write-Host "[ERROR] $resource $method : $($_.Exception.Message)"
        try { Send-Response -Response $res -StatusCode 500 -Body "{`"error`":`"$($_.Exception.Message)`"}" } catch {}
    }
}

function Api-GetAll {
    param($Response, [string]$File)
    $list = Get-JsonArray $File
    Send-ArrayResponse -Response $Response -List $list
}

function Api-Create {
    param($Response, [string]$File, $Request, [string]$Prefix)
    $body = Get-RequestBody $Request
    if ($null -eq $body) { Send-Response -Response $Response -StatusCode 400 -Body '{"error":"Bad Request"}'; return }
    Acquire-DataLock
    try {
        $list = Get-JsonArray $File
        $now  = Get-Date -Format "o"
        $body | Add-Member -Force -NotePropertyName "id"        -NotePropertyValue (New-Id $Prefix)
        $body | Add-Member -Force -NotePropertyName "createdAt" -NotePropertyValue $now
        $body | Add-Member -Force -NotePropertyName "updatedAt" -NotePropertyValue $now
        [void]$list.Add($body)
        Write-JsonArray $File $list
    } finally {
        Release-DataLock
    }
    Send-JsonResponse -Response $Response -Data $body -StatusCode 201
}

function Api-Update {
    param($Response, [string]$File, $Request, [string]$Id)
    if (-not $Id) { Send-Response -Response $Response -StatusCode 400 -Body '{"error":"ID required"}'; return }
    $body = Get-RequestBody $Request
    $existing = $null
    $notFound = $false
    Acquire-DataLock
    try {
        $list = Get-JsonArray $File
        $idx  = -1
        for ($i = 0; $i -lt $list.Count; $i++) { if ($list[$i].id -eq $Id) { $idx = $i; break } }
        if ($idx -lt 0) { $notFound = $true }
        else {
            $existing = $list[$idx]
            $now = Get-Date -Format "o"
            $body.PSObject.Properties | ForEach-Object { $existing | Add-Member -Force -NotePropertyName $_.Name -NotePropertyValue $_.Value }
            $existing | Add-Member -Force -NotePropertyName "updatedAt" -NotePropertyValue $now
            $list[$idx] = $existing
            Write-JsonArray $File $list
        }
    } finally {
        Release-DataLock
    }
    if ($notFound) { Send-Response -Response $Response -StatusCode 404 -Body '{"error":"Not Found"}'; return }
    Send-JsonResponse -Response $Response -Data $existing
}

function Api-Delete {
    param($Response, [string]$File, [string]$Id)
    if (-not $Id) { Send-Response -Response $Response -StatusCode 400 -Body '{"error":"ID required"}'; return }
    Acquire-DataLock
    try {
        $list = Get-JsonArray $File
        $newList = New-Object 'System.Collections.Generic.List[object]'
        foreach ($item in $list) {
            if ($item.id -ne $Id) { [void]$newList.Add($item) }
        }
        Write-JsonArray $File $newList
    } finally {
        Release-DataLock
    }
    Send-JsonResponse -Response $Response -Data @{ deleted = $Id }
}

# Tasks with parent-child sync
function Api-CreateTask {
    param($Response, $Request)
    $body = Get-RequestBody $Request
    if ($null -eq $body) { Send-Response -Response $Response -StatusCode 400 -Body '{"error":"Bad Request"}'; return }
    Acquire-DataLock
    try {
        $list = Get-JsonArray $TasksFile
        $now  = Get-Date -Format "o"
        $body | Add-Member -Force -NotePropertyName "id"        -NotePropertyValue (New-Id "task")
        $body | Add-Member -Force -NotePropertyName "createdAt" -NotePropertyValue $now
        $body | Add-Member -Force -NotePropertyName "updatedAt" -NotePropertyValue $now
        if (-not ($body.PSObject.Properties.Name -contains "childIds"))  { $body | Add-Member -Force -NotePropertyName "childIds"  -NotePropertyValue @() }
        if (-not ($body.PSObject.Properties.Name -contains "deleted"))   { $body | Add-Member -Force -NotePropertyName "deleted"   -NotePropertyValue $false }
        if (-not ($body.PSObject.Properties.Name -contains "archived"))  { $body | Add-Member -Force -NotePropertyName "archived"  -NotePropertyValue $false }

        # sortOrder のデフォルト値: 既存タスクの最大値 + 1
        if (-not ($body.PSObject.Properties.Name -contains "sortOrder")) {
            $maxOrder = -1
            foreach ($t in $list) {
                if ($t.PSObject.Properties.Name -contains "sortOrder") {
                    $v = [int]$t.sortOrder
                    if ($v -gt $maxOrder) { $maxOrder = $v }
                }
            }
            $body | Add-Member -Force -NotePropertyName "sortOrder" -NotePropertyValue ($maxOrder + 1)
        }

        $parentId = ""
        if ($body.PSObject.Properties.Name -contains "parentId") { $parentId = $body.parentId }

        if ($parentId) {
            for ($i = 0; $i -lt $list.Count; $i++) {
                if ($list[$i].id -eq $parentId) {
                    $cids = New-Object 'System.Collections.Generic.List[string]'
                    $existing_cids = $list[$i].childIds
                    if ($null -ne $existing_cids) {
                        foreach ($cid in $existing_cids) { if ($cid) { [void]$cids.Add($cid) } }
                    }
                    [void]$cids.Add($body.id)
                    $list[$i] | Add-Member -Force -NotePropertyName "childIds"  -NotePropertyValue $cids.ToArray()
                    $list[$i] | Add-Member -Force -NotePropertyName "updatedAt" -NotePropertyValue $now
                    break
                }
            }
        }
        [void]$list.Add($body)
        Write-JsonArray $TasksFile $list
    } finally {
        Release-DataLock
    }
    Send-JsonResponse -Response $Response -Data $body -StatusCode 201
}

function Api-ReorderTasks {
    param($Response, $Request)
    $body = Get-RequestBody $Request
    if ($null -eq $body) { Send-Response -Response $Response -StatusCode 400 -Body '{"error":"Bad Request"}'; return }
    Acquire-DataLock
    try {
        $list = Get-JsonArray $TasksFile
        $now  = Get-Date -Format "o"
        # body は [{id, sortOrder}, ...] の配列
        $items = @()
        if ($body -is [System.Array]) { $items = $body }
        elseif ($body -is [System.Collections.IEnumerable]) { $items = @($body) }
        else { $items = @($body) }
        foreach ($item in $items) {
            $tid = $item.id
            $ord = [int]$item.sortOrder
            for ($i = 0; $i -lt $list.Count; $i++) {
                if ($list[$i].id -eq $tid) {
                    $list[$i] | Add-Member -Force -NotePropertyName "sortOrder" -NotePropertyValue $ord
                    $list[$i] | Add-Member -Force -NotePropertyName "updatedAt" -NotePropertyValue $now
                    break
                }
            }
        }
        Write-JsonArray $TasksFile $list
    } finally {
        Release-DataLock
    }
    Send-JsonResponse -Response $Response -Data @{ ok = $true }
}

function Api-ReorderItems {
    param($Response, $Request, [string]$File)
    $body = Get-RequestBody $Request
    if ($null -eq $body) { Send-Response -Response $Response -StatusCode 400 -Body '{"error":"Bad Request"}'; return }
    Acquire-DataLock
    try {
        $list = Get-JsonArray $File
        $now  = Get-Date -Format "o"
        $items = @()
        if ($body -is [System.Array]) { $items = $body }
        elseif ($body -is [System.Collections.IEnumerable]) { $items = @($body) }
        else { $items = @($body) }
        foreach ($item in $items) {
            $tid = $item.id
            $ord = [int]$item.sortOrder
            for ($i = 0; $i -lt $list.Count; $i++) {
                if ($list[$i].id -eq $tid) {
                    $list[$i] | Add-Member -Force -NotePropertyName "sortOrder" -NotePropertyValue $ord
                    $list[$i] | Add-Member -Force -NotePropertyName "updatedAt" -NotePropertyValue $now
                    break
                }
            }
        }
        Write-JsonArray $File $list
    } finally {
        Release-DataLock
    }
    Send-JsonResponse -Response $Response -Data @{ ok = $true }
}

function Api-UpdateTask {
    param($Response, $Request, [string]$Id)
    if (-not $Id) { Send-Response -Response $Response -StatusCode 400 -Body '{"error":"ID required"}'; return }
    $body = Get-RequestBody $Request
    $existing = $null
    $notFound = $false
    Acquire-DataLock
    try {
        $list = Get-JsonArray $TasksFile
        $idx  = -1
        for ($i = 0; $i -lt $list.Count; $i++) { if ($list[$i].id -eq $Id) { $idx = $i; break } }
        if ($idx -lt 0) { $notFound = $true }
        else {
            $existing = $list[$idx]
            $oldParentId = if ($existing.PSObject.Properties.Name -contains "parentId") { $existing.parentId } else { $null }
            $now = Get-Date -Format "o"
            $body.PSObject.Properties | ForEach-Object { $existing | Add-Member -Force -NotePropertyName $_.Name -NotePropertyValue $_.Value }
            $existing | Add-Member -Force -NotePropertyName "updatedAt" -NotePropertyValue $now
            $list[$idx] = $existing
            $newParentId = if ($existing.PSObject.Properties.Name -contains "parentId") { $existing.parentId } else { $null }

            if ($oldParentId -ne $newParentId) {
                if ($oldParentId) {
                    for ($i = 0; $i -lt $list.Count; $i++) {
                        if ($list[$i].id -eq $oldParentId) {
                            $cids = New-Object 'System.Collections.Generic.List[string]'
                            foreach ($cid in $list[$i].childIds) { if ($cid -ne $Id) { [void]$cids.Add($cid) } }
                            $list[$i] | Add-Member -Force -NotePropertyName "childIds" -NotePropertyValue $cids.ToArray()
                            break
                        }
                    }
                }
                if ($newParentId) {
                    for ($i = 0; $i -lt $list.Count; $i++) {
                        if ($list[$i].id -eq $newParentId) {
                            $cids = New-Object 'System.Collections.Generic.List[string]'
                            foreach ($cid in $list[$i].childIds) { if ($cid) { [void]$cids.Add($cid) } }
                            [void]$cids.Add($Id)
                            $list[$i] | Add-Member -Force -NotePropertyName "childIds" -NotePropertyValue $cids.ToArray()
                            break
                        }
                    }
                }
            }
            Write-JsonArray $TasksFile $list
        }
    } finally {
        Release-DataLock
    }
    if ($notFound) { Send-Response -Response $Response -StatusCode 404 -Body '{"error":"Not Found"}'; return }
    Send-JsonResponse -Response $Response -Data $existing
}

# Pomodoro handlers
function Api-PomodoroGetSettings {
    param($Response)
    $data = Get-JsonObject $PomodoroFile
    $s = if ($null -ne $data -and $null -ne $data.settings) { $data.settings } else { @{ workMinutes=25; shortBreakMinutes=5; longBreakMinutes=15; cyclesBeforeLongBreak=3 } }
    Send-JsonResponse -Response $Response -Data $s
}
function Api-PomodoroSetSettings {
    param($Response, $Request)
    $body = Get-RequestBody $Request
    Acquire-DataLock
    try {
        $data = Get-JsonObject $PomodoroFile
        if ($null -eq $data) { $data = [PSCustomObject]@{ settings=@{}; state=@{ phase="idle"; cycleCount=0; startedAt=$null; pausedAt=$null; totalPausedMs=0 } } }
        $data | Add-Member -Force -NotePropertyName "settings" -NotePropertyValue $body
        Write-JsonObject $PomodoroFile $data
    } finally {
        Release-DataLock
    }
    Send-JsonResponse -Response $Response -Data $body
}
function Api-PomodoroGetState {
    param($Response)
    $data = Get-JsonObject $PomodoroFile
    $s = if ($null -ne $data -and $null -ne $data.state) { $data.state } else { @{ phase="idle"; cycleCount=0; startedAt=$null; pausedAt=$null; totalPausedMs=0 } }
    Send-JsonResponse -Response $Response -Data $s
}
function Api-PomodoroSetState {
    param($Response, $Request)
    $body = Get-RequestBody $Request
    Acquire-DataLock
    try {
        $data = Get-JsonObject $PomodoroFile
        if ($null -eq $data) { $data = [PSCustomObject]@{ settings=@{ workMinutes=25; shortBreakMinutes=5; longBreakMinutes=15; cyclesBeforeLongBreak=3 }; state=@{} } }
        $data | Add-Member -Force -NotePropertyName "state" -NotePropertyValue $body
        Write-JsonObject $PomodoroFile $data
    } finally {
        Release-DataLock
    }
    Send-JsonResponse -Response $Response -Data $body
}

# ============================================================
# Background notification checks
# ============================================================
function Check-Alarms {
    try {
        $list = Get-JsonArray $AlarmsFile
        $now  = [DateTimeOffset]::UtcNow
        $changed = $false
        for ($i = 0; $i -lt $list.Count; $i++) {
            $alarm = $list[$i]
            $notified = $false
            if ($alarm.PSObject.Properties.Name -contains "notified") { $notified = [bool]$alarm.notified }
            if ($notified) { continue }
            $dt = ""
            if ($alarm.PSObject.Properties.Name -contains "datetime") { $dt = $alarm.datetime }
            if (-not $dt) { continue }
            try {
                $alarmTime = [DateTimeOffset]::Parse($dt)
                if ($alarmTime -le $now) {
                    $ttl = if ($alarm.PSObject.Properties.Name -contains "title") { $alarm.title } else { "Alarm" }
                    $tms = $alarmTime.LocalDateTime.ToString("yyyy/MM/dd HH:mm")
                    Show-Toast -Title "[Alarm] $ttl" -Message $tms -Alarm
                    $recurrence = ""
                    if ($alarm.PSObject.Properties.Name -contains "recurrence") { $recurrence = $alarm.recurrence }
                    if ($recurrence -eq "daily") {
                        $nextDt = $alarmTime.AddDays(1)
                        while ($nextDt -le $now) { $nextDt = $nextDt.AddDays(1) }
                        $list[$i] | Add-Member -Force -NotePropertyName "datetime" -NotePropertyValue ($nextDt.ToString("o"))
                        $list[$i] | Add-Member -Force -NotePropertyName "notified" -NotePropertyValue $false
                    } elseif ($recurrence -eq "weekly") {
                        $nextDt = $alarmTime.AddDays(7)
                        while ($nextDt -le $now) { $nextDt = $nextDt.AddDays(7) }
                        $list[$i] | Add-Member -Force -NotePropertyName "datetime" -NotePropertyValue ($nextDt.ToString("o"))
                        $list[$i] | Add-Member -Force -NotePropertyName "notified" -NotePropertyValue $false
                    } elseif ($recurrence -eq "monthly") {
                        $nextDt = $alarmTime.AddMonths(1)
                        while ($nextDt -le $now) { $nextDt = $nextDt.AddMonths(1) }
                        $list[$i] | Add-Member -Force -NotePropertyName "datetime" -NotePropertyValue ($nextDt.ToString("o"))
                        $list[$i] | Add-Member -Force -NotePropertyName "notified" -NotePropertyValue $false
                    } else {
                        $list[$i] | Add-Member -Force -NotePropertyName "notified" -NotePropertyValue $true
                    }
                    $changed = $true
                }
            } catch { }
        }
        if ($changed) {
            Acquire-DataLock
            try { Write-JsonArray $AlarmsFile $list } finally { Release-DataLock }
        }
    } catch {
        Write-Host "[WARN] Check-Alarms: $_"
    }
}

function Check-Pomodoro {
    try {
        $data = Get-JsonObject $PomodoroFile
        if ($null -eq $data) { return }
        $state    = $data.state
        $settings = $data.settings
        if ($null -eq $state) { return }
        $phase = if ($state.PSObject.Properties.Name -contains "phase") { $state.phase } else { "idle" }
        if ($phase -eq "idle") { return }
        $pausedAt = if ($state.PSObject.Properties.Name -contains "pausedAt") { $state.pausedAt } else { $null }
        if ($pausedAt) { return }

        $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $workMins  = if ($settings.PSObject.Properties.Name -contains "workMinutes")       { [int]$settings.workMinutes }       else { 25 }
        $shortMins = if ($settings.PSObject.Properties.Name -contains "shortBreakMinutes") { [int]$settings.shortBreakMinutes } else { 5 }
        $longMins  = if ($settings.PSObject.Properties.Name -contains "longBreakMinutes")  { [int]$settings.longBreakMinutes }  else { 15 }
        $cyclesMax = if ($settings.PSObject.Properties.Name -contains "cyclesBeforeLongBreak") { [int]$settings.cyclesBeforeLongBreak } else { 3 }

        $phaseMs = 0
        if ($phase -eq "work")        { $phaseMs = $workMins  * 60000 }
        elseif ($phase -eq "short_break") { $phaseMs = $shortMins * 60000 }
        elseif ($phase -eq "long_break")  { $phaseMs = $longMins  * 60000 }
        else { return }

        $startedAt = if ($state.PSObject.Properties.Name -contains "startedAt") { $state.startedAt } else { $null }
        if (-not $startedAt) { return }
        $startMs = [DateTimeOffset]::Parse($startedAt).ToUnixTimeMilliseconds()
        $pausedMs = 0
        if ($state.PSObject.Properties.Name -contains "totalPausedMs") { $pausedMs = [long]$state.totalPausedMs }
        $elapsed   = $now - $startMs - $pausedMs
        $remaining = $phaseMs - $elapsed

        if ($remaining -le 0) {
            $cycleCount = 0
            if ($state.PSObject.Properties.Name -contains "cycleCount") { $cycleCount = [int]$state.cycleCount }
            $nextPhase  = "idle"
            $nextCycles = $cycleCount
            $toastTitle = ""
            $toastMsg   = ""

            if ($phase -eq "work") {
                $nextCycles = $cycleCount + 1
                if ($nextCycles -ge $cyclesMax) {
                    $nextPhase  = "long_break"
                    $nextCycles = 0
                    $toastTitle = "[Pomodoro] Cycle done!"
                    $toastMsg   = "Long break ($longMins min)"
                } else {
                    $nextPhase  = "short_break"
                    $toastTitle = "[Pomodoro] Cycle done!"
                    $toastMsg   = "Short break ($shortMins min)"
                }
            } elseif ($phase -eq "short_break" -or $phase -eq "long_break") {
                $nextPhase  = "work"
                $toastTitle = "[Pomodoro] Break over!"
                $toastMsg   = "Focus time ($workMins min)"
            }

            if ($toastTitle) { Show-Toast -Title $toastTitle -Message $toastMsg -Alarm }

            Acquire-DataLock
            try {
                $nowIso = [DateTimeOffset]::UtcNow.ToString("o")
                $data.state | Add-Member -Force -NotePropertyName "phase"         -NotePropertyValue $nextPhase
                $data.state | Add-Member -Force -NotePropertyName "startedAt"     -NotePropertyValue $nowIso
                $data.state | Add-Member -Force -NotePropertyName "pausedAt"      -NotePropertyValue $null
                $data.state | Add-Member -Force -NotePropertyName "totalPausedMs" -NotePropertyValue 0
                $data.state | Add-Member -Force -NotePropertyName "cycleCount"    -NotePropertyValue $nextCycles
                Write-JsonObject $PomodoroFile $data
            } finally {
                Release-DataLock
            }
            Write-Host "[POMODORO] $toastTitle phase=$nextPhase"
        }
    } catch {
        Write-Host "[WARN] Check-Pomodoro: $_"
    }
}

# ============================================================
# Main loop
# ============================================================
# フロントエンド用 config.js を生成
$ConfigJs = Join-Path $ScriptDir "js\config.js"
$ConfigJsContent = "// Auto-generated from config.json - do not edit directly`nconst AppConfig = { port: $Port };"
[System.IO.File]::WriteAllText($ConfigJs, $ConfigJsContent, [System.Text.Encoding]::UTF8)

Write-Host "Task Manager Server - http://localhost:$Port"
Write-Host "Data paths:"
Write-Host "  projects:  $ProjectsFile"
Write-Host "  tasks:     $TasksFile"
Write-Host "  alarms:    $AlarmsFile"
Write-Host "  memos:     $MemosFile"
Write-Host "  pomodoro:  $PomodoroFile"
Write-Host "  templates: $TemplatesFile"

# Initialize empty data files if needed
foreach ($f in @($ProjectsFile, $TasksFile, $AlarmsFile, $MemosFile, $TemplatesFile, $MembersFile)) {
    if (-not (Test-Path $f)) {
        [System.IO.File]::WriteAllText($f, "[]", [System.Text.Encoding]::UTF8)
    }
}
if (-not (Test-Path $PomodoroFile)) {
    $defPomo = [PSCustomObject]@{
        settings = [PSCustomObject]@{ workMinutes=25; shortBreakMinutes=5; longBreakMinutes=15; cyclesBeforeLongBreak=3 }
        state    = [PSCustomObject]@{ phase="idle"; cycleCount=0; startedAt=$null; pausedAt=$null; totalPausedMs=0 }
    }
    Write-JsonObject $PomodoroFile $defPomo
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")

trap {
    Write-Host "[INFO] Caught termination signal."
    Cleanup-Server
    break
}

try {
    $Listener.Start()
    Write-Host "[OK] Server started. Press Ctrl+C to stop."

    Check-Alarms
    Check-Pomodoro
    $LastBgCheck = [DateTimeOffset]::UtcNow

    $ContextTask = $null
    while ($Listener.IsListening -and -not $script:ShuttingDown) {
        try {
            if ($null -eq $ContextTask) {
                $ContextTask = $Listener.GetContextAsync()
            }
            if ($ContextTask.Wait(50)) {
                Handle-Request $ContextTask.Result
                $ContextTask = $null
                # 連続リクエストを高速に処理するためバックグラウンドチェックをスキップして次へ
                continue
            }
        } catch [System.AggregateException] {
            if (-not $Listener.IsListening) { break }
            $ContextTask = $null
        } catch {
            Write-Host "[ERROR] Main loop: $($_.Exception.Message)"
            $ContextTask = $null
        }
        $nowLoop = [DateTimeOffset]::UtcNow
        if (($nowLoop - $LastBgCheck).TotalSeconds -ge 15) {
            Check-Alarms
            Check-Pomodoro
            $LastBgCheck = $nowLoop
        }
    }
} finally {
    Cleanup-Server
}
Write-Host "[INFO] Server stopped."
