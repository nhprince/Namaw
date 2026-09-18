# Builds native-helper/bin/namaw_helper.exe - a self-contained native messaging
# host (Python runtime + yt-dlp embedded, no system Python required).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root 'native-helper\.venv-build'
$binDir = Join-Path $root 'native-helper\bin'

if (-not (Test-Path $venv)) {
  Write-Host '[1/4] Creating build venv...'
  py -3 -m venv $venv
  if ($LASTEXITCODE -ne 0) { python -m venv $venv }
}

$pyExe = Join-Path $venv 'Scripts\python.exe'

Write-Host '[2/4] Installing build dependencies (yt-dlp, pyinstaller)...'
& $pyExe -m pip install --quiet --upgrade yt-dlp pyinstaller

Write-Host '[3/4] Freezing helper with PyInstaller...'
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
& $pyExe -m PyInstaller --onefile --console --clean `
  --name namaw_helper `
  --distpath $binDir `
  --workpath (Join-Path $root 'native-helper\build-work') `
  --specpath (Join-Path $root 'native-helper\.build-spec') `
  --collect-submodules yt_dlp `
  (Join-Path $root 'native-helper\src\namaw_helper.py')
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller build failed' }

Write-Host '[4/4] Verifying frozen host...'
$exe = Join-Path $binDir 'namaw_helper.exe'
if (-not (Test-Path $exe)) { throw 'namaw_helper.exe was not produced' }
Write-Host "OK: $exe ($([math]::Round((Get-Item $exe).Length/1MB,1)) MB)"
