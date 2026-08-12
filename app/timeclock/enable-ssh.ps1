# enable-ssh.ps1 - turn on Windows OpenSSH Server and authorize Claude's key so
# Claude can manage this kiosk directly over Tailscale (no more file/photo loop).
# Run elevated (the .bat does that for you).
$ErrorActionPreference = "Stop"
function Info($m){ Write-Host "[*]  $m" -ForegroundColor Cyan }
function Ok($m){   Write-Host "[OK] $m" -ForegroundColor Green }

$pubkey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIA22akpCLN8nrPOg5d7S2JeNZhLa5BXR4PCSwNrD5evK celerius-deploy-mac"

Info "Installing OpenSSH Server (can take a minute) ..."
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null

Info "Starting the SSH service ..."
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd

Info "Setting PowerShell as the SSH shell ..."
New-Item -Path "HKLM:\SOFTWARE\OpenSSH" -Force | Out-Null
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force | Out-Null

Info "Authorizing the access key ..."
New-Item -ItemType Directory -Force -Path "C:\ProgramData\ssh" | Out-Null
$admKeys = "C:\ProgramData\ssh\administrators_authorized_keys"
if (-not (Test-Path $admKeys)) { New-Item -ItemType File -Force -Path $admKeys | Out-Null }
if (-not (Select-String -Path $admKeys -SimpleMatch $pubkey -Quiet)) { Add-Content -Path $admKeys -Value $pubkey }
icacls $admKeys /inheritance:r | Out-Null
icacls $admKeys /grant "Administrators:F" | Out-Null
icacls $admKeys /grant "SYSTEM:F" | Out-Null

$userSsh = Join-Path $env:USERPROFILE ".ssh"
New-Item -ItemType Directory -Force -Path $userSsh | Out-Null
$userKeys = Join-Path $userSsh "authorized_keys"
if (-not (Test-Path $userKeys)) { New-Item -ItemType File -Force -Path $userKeys | Out-Null }
if (-not (Select-String -Path $userKeys -SimpleMatch $pubkey -Quiet)) { Add-Content -Path $userKeys -Value $pubkey }

Info "Opening the firewall for SSH ..."
New-NetFirewallRule -Name sshd -DisplayName "OpenSSH Server (sshd)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -ErrorAction SilentlyContinue | Out-Null

Restart-Service sshd

Write-Host ""
Ok "SSH is ON. Claude can now connect over Tailscale."
Ok ("   Username: " + $env:USERNAME)
Ok  "   Address:  100.118.17.35"
Write-Host ""
Write-Host ">>> Tell Claude the Username shown above. <<<" -ForegroundColor Yellow
