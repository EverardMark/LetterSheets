# LetterSheets Time Clock — Raspberry Pi Kiosk Setup

The Linux counterpart of [`WINDOWS-KIOSK.md`](WINDOWS-KIOSK.md), for the Raspberry
Pi kiosk. The Electron app connects to `https://api.lettersheets.com` with **zero
config** and clocks employees in/out by name-tap immediately. This doc covers
getting it onto the Pi, auto-starting it, locking it down, and (when unblocked)
the fingerprint reader.

## Target (what this was deployed to)

- **Raspberry Pi 5 Model B** (16 GB), **Ubuntu 26.04 LTS, arm64**, GNOME/Wayland.
- Desktop **seat user `biometrics`** (uid 1000); app installed under `/opt`.
- Remote admin over **Tailscale** (host `biometrics`), SSH as `root` via tailnet
  check-mode approval.

> **Kiosk principle: runtime artifacts only.** No Node, npm, git, or compilers on
> the kiosk. You **build on a dev machine** and copy the packaged output. The
> packaged Electron app bundles its own Chromium/Node runtime, so the Pi needs
> nothing extra.

---

## Part A — Time Clock app (Electron)

### A1. Build — on a dev Mac/Linux box, **not** the kiosk

```bash
cd app/timeclock
npm install
npm run package:linux-arm64      # -> dist/LetterSheetsTimeClock-linux-arm64/
```

`electron-packager` cross-builds from macOS/Linux (it downloads the linux-arm64
Electron runtime; it does not run it). Verify the result is a real Pi binary:

```bash
file dist/LetterSheetsTimeClock-linux-arm64/LetterSheetsTimeClock
# -> ELF 64-bit LSB pie executable, ARM aarch64 ... for GNU/Linux
```

### A2. Deploy to the Pi

```bash
rsync -a dist/LetterSheetsTimeClock-linux-arm64/ root@biometrics:/opt/lettersheets-timeclock/
ssh root@biometrics '
  chown -R root:root /opt/lettersheets-timeclock
  chmod 4755 /opt/lettersheets-timeclock/chrome-sandbox   # Electron SUID sandbox
  chmod +x  /opt/lettersheets-timeclock/LetterSheetsTimeClock
'
```

### A3. Run & verify

In the `biometrics` graphical session:

```bash
/opt/lettersheets-timeclock/LetterSheetsTimeClock
```

The window opens maximized and frameless. It talks to `api.lettersheets.com`
(override with `VITE_API_BASE=http://host:port` for local dev).

**Troubleshooting**
- **Sandbox / user-namespace error at startup** → the `chmod 4755 chrome-sandbox`
  above is the fix (Ubuntu restricts unprivileged user namespaces). Last resort:
  launch with `--no-sandbox`.
- **Missing library** → it's a *runtime* lib (e.g. `libgtk-3`, `libnss3`), not a
  dev tool — `apt install` it. On a GNOME desktop these are already present;
  `ldd .../LetterSheetsTimeClock | grep 'not found'` shows any gaps.
- **Wayland** → under GNOME Wayland it runs via XWayland by default (fine). For
  native Wayland add `--ozone-platform-hint=auto`.

---

## Part B — Auto-start on boot (true kiosk)

Launch the app inside the `biometrics` GNOME session with an XDG autostart entry
`/home/biometrics/.config/autostart/lettersheets-timeclock.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=LetterSheets Time Clock
Exec=/opt/lettersheets-timeclock/LetterSheetsTimeClock
X-GNOME-Autostart-enabled=true
```

Auto-login the kiosk user so power-on → desktop → app is unattended. Ubuntu uses
GDM — in `/etc/gdm3/custom.conf`:

```ini
[daemon]
AutomaticLoginEnable=true
AutomaticLogin=biometrics
```

Exit the kiosk anytime with **`Esc` → admin sign-in → Unlock & exit**.

---

## Part C — Lock-down

As `biometrics`, inside the GNOME session (needs the session D-Bus, so run it on
the box, not over a bare SSH):

```bash
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
```

The app is frameless, maximized, and blocks quit/close/minimize on its own.
(Pointer-hiding on Wayland is limited — `unclutter` is X11-only — but the
maximized window covers the screen.)

---

## Part D — Fingerprint reader (`fpbridge`) — BLOCKED on the ARM SDK

**Not deployed.** The reader path needs the **DigitalPersona U.are.U SDK for Linux
built for aarch64** (`libdpfpdd.so`, `libdpfj.so`). The stock SDK is x86/x86_64;
this Pi is **aarch64** (Cortex-A76), so an x86 SDK will not link or run. **Confirm
HID publishes an ARM/aarch64 build before proceeding** — this is the one true
blocker for fingerprints.

Already staged on the Pi (safe and inert until the bridge exists):
- `/etc/udev/rules.d/99-dp-uareu.rules` — `GROUP="plugdev"`; `biometrics` added to
  `plugdev`, so it can open the reader without root.
- `/opt/lettersheets-timeclock/deploy/fpbridge.service` — `User=biometrics`,
  staged but **not** installed to `/etc/systemd/system` or enabled.

When the aarch64 SDK is in hand, build on a Linux **arm64 build host** (again, not
the kiosk — see [`fpbridge-linux/README.md`](fpbridge-linux/README.md)):

```bash
cd app/timeclock/fpbridge-linux
make selftest                          # transport check — no SDK/reader needed
make SDK=/opt/DigitalPersona/UareUSDK  # -> ./fpbridge (arm64 ELF)
```

Deploy and enable:

```bash
rsync -a fpbridge root@biometrics:/usr/local/bin/fpbridge
# put the SDK runtime .so's on the loader path (or set LD_LIBRARY_PATH in the unit)
ssh root@biometrics '
  install -m0644 /opt/lettersheets-timeclock/deploy/fpbridge.service /etc/systemd/system/
  systemctl daemon-reload && systemctl enable --now fpbridge
'
```

Plug in the U.are.U reader (USB vendor `05ba`); the app's top-bar chip turns green.

### Fix these before production (from the code review)
- **Reader probed once, never re-probed** — `hw_init()` runs once at startup; a
  boot USB race or a replug leaves the bridge permanently "No reader"
  (`Restart=always` can't help — the process never exits). Add a lazy re-probe.
- **Template format** differs from the Windows helper (raw FMD vs `SerializeXml`)
  — enroll per-OS or align the formats.
- **Templates stored unencrypted** under the app's userData (on the SD card) —
  enable disk encryption or accept the physical-security tradeoff.

---

## Remote admin quick reference

| | |
|---|---|
| Reach the Pi | `ssh root@biometrics` (Tailscale; owner approves check-mode) |
| App binary | `/opt/lettersheets-timeclock/LetterSheetsTimeClock` |
| Per-user data (incl. enrolled templates) | `/home/biometrics/.config/LetterSheetsTimeClock` |
| Staged reader config | `/opt/lettersheets-timeclock/deploy/` |
