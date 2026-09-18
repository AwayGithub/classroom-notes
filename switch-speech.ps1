$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$jobPath = Join-Path $PSScriptRoot 'logs\speech-switch.json'
$profilePath = Join-Path $PSScriptRoot 'speech-profile.json'
$job = Get-Content -Raw -LiteralPath $jobPath | ConvertFrom-Json
$shellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-JsonFile($path, $value) {
    [IO.File]::WriteAllText("$path.tmp", ($value | ConvertTo-Json -Depth 8), $utf8)
    Move-Item -LiteralPath "$path.tmp" -Destination $path -Force
}
function Start-Selected($wanted) {
    # The prior CPU process may have hidden CUDA in its environment.
    foreach ($key in @('CLASSROOM_BACKEND','CLASSROOM_MODEL','CLASSROOM_DEVICE','CUDA_VISIBLE_DEVICES')) {
        Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
    }
    & $shellPath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start.ps1') -NoBrowser -StartupTimeoutSeconds 120
    if ($LASTEXITCODE -ne 0) { throw 'Selected speech model did not start.' }
    $health = Invoke-RestMethod 'http://127.0.0.1:8765/api/health' -TimeoutSec 5
    $modelName = if ($wanted.backend -eq 'qwen3-streaming') { "Qwen3-ASR-$($wanted.model)" } else { $wanted.model }
    if ($health.backend -ne $wanted.backend -or $health.device -ne $wanted.device -or $health.model -ne $modelName) {
        throw 'The running speech model does not match the selected profile.'
    }
}
Start-Sleep -Milliseconds 800
try {
    $actualPid = [int](Get-Content -LiteralPath (Join-Path $PSScriptRoot 'logs\server.pid'))
    if ($actualPid -ne $job.expected_pid) { throw 'Server PID changed before the model switch.' }
    & $shellPath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop.ps1') -PreserveProcessId $PID
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the verified classroom server.' }
    Write-JsonFile $profilePath $job.target
    try {
        Start-Selected $job.target
        $job.status = 'complete'
    } catch {
        & $shellPath -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop.ps1')
        Write-JsonFile $profilePath $job.previous
        Start-Selected $job.previous
        $job.status = 'rolled_back'
    }
} catch {
    $job.status = 'failed'
    Write-JsonFile $jobPath $job
    throw
}
Write-JsonFile $jobPath $job
