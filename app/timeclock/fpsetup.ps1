# fpsetup.ps1 - LetterSheets Time Clock fingerprint bridge, one-shot setup.
#
# Automates the steps after the DigitalPersona U.are.U SDK is installed:
#   1. Locate DPUruNet.dll (installed by the U.are.U SDK).
#   2. Locate the fpbridge-win folder (auto-extracts fpbridge-win-src.zip if needed).
#   3. Copy DPUruNet.dll into fpbridge-win\lib\.
#   4. dotnet build -c Release.
#   5. Launch fpbridge.exe (new window) so you can see the reader status.

param([string]$FpbridgeDir = "")

$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "[*]  $m" -ForegroundColor Cyan }
function Ok($m){   Write-Host "[OK] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "[!]  $m" -ForegroundColor Yellow }
function Die($m){  Write-Host "[X]  $m" -ForegroundColor Red; exit 1 }

# 1. Find DPUruNet.dll (from the installed SDK)
Info "Searching for DPUruNet.dll ..."
$dll = $null
$fast = @(
  "C:\Program Files\DigitalPersona","C:\Program Files (x86)\DigitalPersona",
  "C:\Program Files\HID Global","C:\Program Files (x86)\HID Global"
) | Where-Object { Test-Path $_ }
foreach ($root in $fast) {
  $hit = Get-ChildItem $root -Recurse -Filter DPUruNet.dll -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hit) { $dll = $hit.FullName; break }
}
if (-not $dll) {
  Warn "Not in the usual spot - scanning all of Program Files (slower) ..."
  $hit = Get-ChildItem "C:\Program Files","C:\Program Files (x86)" -Recurse -Filter DPUruNet.dll -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hit) { $dll = $hit.FullName }
}
if (-not $dll) { Die "DPUruNet.dll not found. Install the U.are.U SDK first (SDK\x64\setup.exe)." }
Ok "DPUruNet.dll = $dll"

# 2. Find fpbridge-win (fpbridge.csproj)
$proj = $null
if ($FpbridgeDir -and (Test-Path (Join-Path $FpbridgeDir "fpbridge.csproj"))) {
  $proj = Join-Path $FpbridgeDir "fpbridge.csproj"
} else {
  Info "Locating fpbridge.csproj ..."
  foreach ($root in @("$env:USERPROFILE\Downloads","$env:USERPROFILE\Desktop","$env:USERPROFILE\Documents")) {
    if (Test-Path $root) {
      $hit = Get-ChildItem $root -Recurse -Filter fpbridge.csproj -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { $proj = $hit.FullName; break }
    }
  }
  if (-not $proj) {
    $zip = Get-ChildItem "$env:USERPROFILE\Downloads" -Filter "fpbridge-win-src*.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($zip) {
      $dest = Join-Path "$env:USERPROFILE\Downloads" "fpbridge-src"
      Info "Extracting $($zip.Name) ..."
      Expand-Archive $zip.FullName $dest -Force
      $hit = Get-ChildItem $dest -Recurse -Filter fpbridge.csproj -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { $proj = $hit.FullName }
    }
  }
}
if (-not $proj) { Die "fpbridge.csproj not found. Extract fpbridge-win-src.zip, or pass -FpbridgeDir with the path." }
$fpdir = Split-Path $proj -Parent
Ok "fpbridge-win = $fpdir"

# 3. Copy DPUruNet.dll into lib
$lib = Join-Path $fpdir "lib"
New-Item -ItemType Directory -Force -Path $lib | Out-Null
Copy-Item $dll (Join-Path $lib "DPUruNet.dll") -Force
Ok "Copied DPUruNet.dll into $lib"

# 4. Build
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  Die "dotnet not found. Install the .NET SDK plus the .NET Framework 4.8 Developer Pack, then re-run."
}
Ok ("dotnet " + (& dotnet --version))
Info "Building fpbridge (Release) ..."
Push-Location $fpdir
try {
  & dotnet build -c Release
  $code = $LASTEXITCODE
} finally { Pop-Location }
if ($code -ne 0) {
  Warn "Build failed (exit $code). If it mentions BadImageFormat or bitness, we switch to x86. Copy the output to Claude."
  exit $code
}

# 5. Launch
$exe = Join-Path $fpdir "bin\Release\net48\fpbridge.exe"
if (-not (Test-Path $exe)) { Die "Build succeeded but fpbridge.exe missing at $exe" }
Ok "Built: $exe"
Info "Launching fpbridge in a new window ..."
try { Start-Process -FilePath $exe }
catch {
  Warn "Could not launch (port may need a URL ACL). Run once as admin, or run:"
  Warn "  netsh http add urlacl url=http://127.0.0.1:52100/ user=Everyone"
}
Write-Host ""
Ok "Done. In the new window, look at the last line:"
Write-Host "   reader: (a serial number)  = reader detected. Restart the Time Clock app; chip turns GREEN." -ForegroundColor Gray
Write-Host "   reader: none               = driver not installed or reader unplugged (run RTE\x64\setup.exe)." -ForegroundColor Gray
