param([switch]$NoBrowser, [int]$StartupTimeoutSeconds = 600)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$backend = $env:CLASSROOM_BACKEND
if (-not $backend -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'speech-profile.json'))) {
    $backend = (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'speech-profile.json') | ConvertFrom-Json).backend
}
$environment = switch ($backend) { 'faster-whisper' { '.venv' }; 'qwen3-streaming' { '.venv-qwen' }; default { '.venv-sensevoice' } }
$python = Join-Path $PSScriptRoot "$environment\Scripts\python.exe"
$url = 'http://127.0.0.1:8765'
New-Item -ItemType Directory -Force (Join-Path $PSScriptRoot 'logs') | Out-Null
try {
    $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2
    if ($health.app -ne 'classroom-notes') { throw 'Port 8765 is used by another application.' }
    if (-not $NoBrowser) { Start-Process $url }
    Write-Host "Ready: $url"
    exit 0
} catch { }
$env:HF_HOME = Join-Path $PSScriptRoot 'models'
$env:TORCH_HOME = Join-Path $PSScriptRoot 'models\torch'
$env:HF_HUB_DISABLE_XET = '1'
$env:PYTHONUTF8 = '1'
$process = Start-Process -FilePath $python -ArgumentList 'app.py' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'logs\server.out.log') -RedirectStandardError (Join-Path $PSScriptRoot 'logs\server.err.log')
$process.Id | Set-Content (Join-Path $PSScriptRoot 'logs\server.pid')
Write-Host 'Starting classroom notes. First launch may download the speech model.'
for ($i = 0; $i -lt [math]::Ceiling($StartupTimeoutSeconds / 2); $i++) {
    Start-Sleep -Seconds 2
    $process.Refresh()
    if ($process.HasExited) { Get-Content (Join-Path $PSScriptRoot 'logs\server.err.log') -Tail 30; throw 'Server exited. See logs.' }
    try {
        $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2
        if ($health.app -eq 'classroom-notes' -and $health.ready) {
            Write-Host "Ready: $url"
            if (-not $NoBrowser) { Start-Process $url }
            exit 0
        }
    } catch { }
}
throw 'Startup is taking longer than expected. Check logs\server.err.log.'
