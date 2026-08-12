# fpbuild.ps1 - build the LetterSheets Time Clock fingerprint bridge.
# Builds the exact project (no "which project?" ambiguity) and makes the
# net48 reference assemblies available so the Developer Pack is optional.

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
  $hit = Get-ChildItem "C:\Program Files","C:\Program Files (x86)" -Recurse -Filter DPUruNet.dll -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hit) { $dll = $hit.FullName }
}
if (-not $dll) { Die "DPUruNet.dll not found. Install the U.are.U SDK first (SDK\x64\setup.exe)." }
Ok "DPUruNet.dll = $dll"

# 2. Find fpbridge.csproj
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
}
if (-not $proj) { Die "fpbridge.csproj not found. Run the setup that extracts the source first." }
$fpdir = Split-Path $proj -Parent
Ok "fpbridge project = $proj"

# 3. Copy DPUruNet.dll into lib
$lib = Join-Path $fpdir "lib"
New-Item -ItemType Directory -Force -Path $lib | Out-Null
Copy-Item $dll (Join-Path $lib "DPUruNet.dll") -Force
Ok "DPUruNet.dll in place: $lib"

# 4. Ensure net48 reference assemblies (so the Developer Pack is optional)
$raw = Get-Content $proj -Raw
if ($raw -notmatch 'Microsoft\.NETFramework\.ReferenceAssemblies') {
  $ig = "  <ItemGroup>`n    <PackageReference Include=""Microsoft.NETFramework.ReferenceAssemblies"" Version=""1.0.3"" PrivateAssets=""all"" />`n  </ItemGroup>`n</Project>"
  $raw = $raw -replace '</Project>', $ig
  Set-Content -Path $proj -Value $raw -Encoding UTF8
  Ok "Added net48 reference assemblies to the project."
}

# 5. Build the EXACT project (avoids the 'more than one project' error)
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  Die "dotnet not found. Install the .NET SDK, then re-run."
}
Ok ("dotnet " + (& dotnet --version))
Info "Building fpbridge (Release) ..."
& dotnet build "$proj" -c Release
$code = $LASTEXITCODE
if ($code -ne 0) {
  Warn "Build failed (exit $code)."
  Warn "Files next to the project (for diagnosis):"
  Get-ChildItem $fpdir | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host "     $_" }
  Warn "Copy everything above to Claude."
  exit $code
}

# 6. Launch
$exe = Join-Path $fpdir "bin\Release\net48\fpbridge.exe"
if (-not (Test-Path $exe)) { Die "Build OK but fpbridge.exe not found at $exe" }
Ok "Built: $exe"
Info "Launching fpbridge in a new window ..."
try { Start-Process -FilePath $exe }
catch {
  Warn "Could not launch (port may need admin). Run once as admin, or run:"
  Warn "  netsh http add urlacl url=http://127.0.0.1:52100/ user=Everyone"
}
Write-Host ""
Ok "Done. In the new window, the LAST line tells us the reader status:"
Write-Host "   reader: (a serial number)  = detected. Restart the Time Clock app; chip turns GREEN." -ForegroundColor Gray
Write-Host "   reader: none               = driver not installed or reader unplugged." -ForegroundColor Gray
