param([int]$PreserveProcessId = 0)
$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'logs\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No server PID file.'; exit 0 }
$serverPid = [int](Get-Content -LiteralPath $pidFile)
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
$expected = @((Join-Path $PSScriptRoot '.venv\Scripts\python.exe'), (Join-Path $PSScriptRoot '.venv-sensevoice\Scripts\python.exe'), (Join-Path $PSScriptRoot '.venv-qwen\Scripts\python.exe'))
if ($process -and $process.ExecutablePath -in $expected -and $process.CommandLine -match 'app\.py') {
    # Windows venv's python.exe launches the real interpreter as a child.
    # Stop the verified server tree so the model and ffmpeg are released too.
    if ($PreserveProcessId) {
        # The restart helper descends from the server. Preserve its branch,
        # including this stop command, while releasing all model processes.
        $all = @(Get-CimInstance Win32_Process)
        $tree = [Collections.Generic.List[int]]::new()
        $tree.Add($serverPid)
        for ($i=0; $i -lt $tree.Count; $i++) {
            foreach ($child in $all | Where-Object ParentProcessId -eq $tree[$i]) { $tree.Add([int]$child.ProcessId) }
        }
        if ($PreserveProcessId -eq $serverPid -or $PreserveProcessId -notin $tree) { throw 'Restart helper is not a verified server descendant.' }
        $keep = [Collections.Generic.List[int]]::new()
        $keep.Add($PreserveProcessId)
        for ($i=0; $i -lt $keep.Count; $i++) {
            foreach ($child in $all | Where-Object ParentProcessId -eq $keep[$i]) { $keep.Add([int]$child.ProcessId) }
        }
        for ($i=$tree.Count-1; $i -ge 0; $i--) {
            if ($tree[$i] -notin $keep) { Stop-Process -Id $tree[$i] -ErrorAction SilentlyContinue }
        }
    } else {
        & taskkill.exe /PID $serverPid /T /F | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Could not stop the classroom server process tree.' }
    }
    Write-Host 'Classroom notes stopped.'
} elseif ($process) {
    throw 'PID belongs to another process. No process was stopped.'
} else { Write-Host 'Server already stopped.' }
