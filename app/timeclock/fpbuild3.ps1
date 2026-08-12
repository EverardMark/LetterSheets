# fpbuild3.ps1 - build the LetterSheets Time Clock fingerprint bridge from a
# fresh, clean source zip (fpsrc.zip). Always uses the newest zip received,
# so re-fixes just work.

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "[*]  $m" -ForegroundColor Cyan }
function Ok($m){   Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[!]  $m" -ForegroundColor Yellow }
function Die($m){  Write-Host "[X]  $m" -ForegroundColor Red; exit 1 }

# 1. Find DPUruNet.dll (from the installed SDK)
Info "Searching for DPUruNet.dll ..."
$dll = $null
$fast = @("C:\Program Files\DigitalPersona","C:\Program Files (x86)\DigitalPersona","C:\Program Files\HID Global","C:\Program Files (x86)\HID Global") | Where-Object { Test-Path $_ }
foreach ($root in $fast) { $hit = Get-ChildItem $root -Recurse -Filter DPUruNet.dll -ErrorAction SilentlyContinue | Select-Object -First 1; if ($hit) { $dll = $hit.FullName; break } }
if (-not $dll) { $hit = Get-ChildItem "C:\Program Files","C:\Program Files (x86)" -Recurse -Filter DPUruNet.dll -ErrorAction SilentlyContinue | Select-Object -First 1; if ($hit) { $dll = $hit.FullName } }
if (-not $dll) { Die "DPUruNet.dll not found. Install the U.are.U SDK first." }
Ok "DPUruNet.dll = $dll"

# 2. Fresh-extract the newest clean source zip
$zip = Get-ChildItem "$env:USERPROFILE\Downloads" -Filter "fpsrc*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $zip) { Die "fpsrc.zip not found in Downloads. Receive it (Tailscale tray), then re-run." }
$dest = Join-Path "$env:USERPROFILE\Downloads" "fpbridge-build"
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue }
Info ("Extracting " + $zip.Name + " (fresh) ...")
Expand-Archive $zip.FullName $dest -Force
$proj = Get-ChildItem $dest -Recurse -Filter fpbridge.csproj -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'fpbridge.csproj' } | Select-Object -First 1
if (-not $proj) { Die "fpbridge.csproj not found inside the zip." }
$proj = $proj.FullName
$fpdir = Split-Path $proj -Parent
Ok "fpbridge project = $proj"

# 3. DPUruNet.dll into lib
$lib = Join-Path $fpdir "lib"
New-Item -ItemType Directory -Force -Path $lib | Out-Null
Copy-Item $dll (Join-Path $lib "DPUruNet.dll") -Force
Ok "DPUruNet.dll in place."

# 4. Build the exact project
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { Die "dotnet not found. Install the .NET SDK." }
Ok ("dotnet " + (& dotnet --version))
Info "Building fpbridge (Release) ..."
& dotnet build "$proj" -c Release
$code = $LASTEXITCODE
if ($code -ne 0) { Warn "Build failed (exit $code). Copy everything above to Claude."; exit $code }

# 5. Launch
$exe = Join-Path $fpdir "bin\Release\net48\fpbridge.exe"
if (-not (Test-Path $exe)) { Die "Build OK but fpbridge.exe not found at $exe" }
Ok "Built: $exe"
Info "Launching fpbridge in a new window ..."
try { Start-Process -FilePath $exe } catch { Warn "Could not launch (port may need admin). Run once as admin, or: netsh http add urlacl url=http://127.0.0.1:52100/ user=Everyone" }
Write-Host ""
Ok "Done. In the new window, the LAST line is the reader status:"
Write-Host "   reader: (a serial number)  = detected. Restart the Time Clock app; chip turns GREEN." -ForegroundColor Gray
Write-Host "   reader: none               = driver not installed or reader unplugged." -ForegroundColor Gray
