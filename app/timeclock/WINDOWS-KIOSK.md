# LetterSheets Time Clock — Windows Kiosk Setup

The Electron app (`LetterSheetsTimeClock.exe`) already runs and connects to
`https://api.lettersheets.com` with **zero config** — it clocks employees in/out
by name-tap immediately. This doc covers the two remaining pieces:

- **Part A — Fingerprint** (DigitalPersona U.are.U, via `fpbridge-win`)
- **Part B — Auto-start on boot** (true kiosk)

> You need the **repo on the NUC** for Part A (the `fpbridge-win` source). If you
> only copied the built `.exe`, also `git clone` the repo (or copy the
> `app/timeclock/fpbridge-win` folder) onto the NUC.

---

## Part A — Fingerprint reader (`fpbridge-win`)

The reader is driven by a small native helper, **`fpbridge.exe`**, which owns the
device and exposes `ws://127.0.0.1:52100`. The Time Clock app connects to it
automatically — the top-bar chip turns **green** when the reader is ready.

### A1. Prerequisites (the gating download)

1. **DigitalPersona U.are.U SDK for Windows** — from HID's DigitalPersona
   developer portal (free account). This one package provides:
   - the **reader driver / Runtime Environment (RTE)** — so Windows sees the reader
     and the native `dpfpdd.dll` / `dpfj.dll` exist,
   - **`DPUruNet.dll`** — the .NET wrapper `fpbridge` references.

   > ⚠️ Plugging the reader in is **not** enough. Without the RTE/driver installed,
   > Windows has no DigitalPersona stack and `fpbridge` cannot open the reader.

2. **.NET build tools** — either **Visual Studio 2022** (".NET desktop
   development" workload) **or** the **`dotnet` SDK** + the **.NET Framework 4.8
   targeting pack**.

### A2. Build

1. Install the SDK/RTE, reboot if prompted. Confirm the reader shows in
   **Device Manager** (a "DigitalPersona" / "U.are.U" device).
2. Copy **`DPUruNet.dll`** from the SDK install into
   `app\timeclock\fpbridge-win\lib\` (create the `lib` folder).
3. Build:
   ```powershell
   cd app\timeclock\fpbridge-win
   dotnet build -c Release
   ```
   Output: `bin\Release\net48\fpbridge.exe`.

### A3. Run & verify

```powershell
.\bin\Release\net48\fpbridge.exe
```
Expected: `fpbridge listening on http://127.0.0.1:52100/ (reader: <serial>)`.

**Troubleshooting**
- **`BadImageFormatException` at startup** → the DigitalPersona DLLs are 32-bit.
  Set `<PlatformTarget>x86</PlatformTarget>` in `fpbridge.csproj` and rebuild.
- **Port bind "Access denied"** → run once elevated, or reserve the URL:
  ```powershell
  netsh http add urlacl url=http://127.0.0.1:52100/ user=Everyone
  ```
- **Reader not found** → RTE/driver missing, or a flaky USB hub; verify it in
  Device Manager.

With `fpbridge.exe` running, **restart the Time Clock app** so it connects and
loads templates — the chip turns **green ("Reader ready")**.

### A4. Enroll employees (admin-supervised, at the kiosk)

1. Top bar → **Enroll** → sign in with an admin account.
2. Search for and select the employee.
3. **Start capture** → the employee places the **same finger 4 times**.
4. The template is saved **locally on the NUC** (`fingerprints-<companyId>.json`
   in the app's userData — never sent to the server). **Re-enroll** replaces it;
   **Remove** deletes it. Keep the NUC physically secured / disk-encrypted.
5. Test: place the finger on the clock screen → it should identify the employee
   and record in/out.

> **Watch during the identify test:** if a good scan is captured but *no* employee
> is matched, it's a known string-vs-number id mismatch (the bridge echoes
> `employeeId` as a string; `get_employees` may return numeric ids). Tell me and
> I'll loosen the `===` compare in `renderer/renderer.js` — a one-line fix.

---

## Part B — Auto-start on boot (true kiosk)

Two things should launch at login: **fpbridge** (reader) and the **Time Clock app**.

### B1. fpbridge at logon
Task Scheduler → **Create Task** → Trigger *At log on* → Action: start
`…\fpbridge-win\bin\Release\net48\fpbridge.exe` → tick **Run with highest
privileges** (skips the port-ACL prompt).

### B2. Time Clock app at logon
`Win+R` → `shell:startup` → drop a shortcut to `LetterSheetsTimeClock.exe` there.

### B3. (Optional) boot straight into the kiosk
Set the NUC to **auto-login** the kiosk user (`netplwiz` → uncheck "Users must
enter a user name and password"). Power-on → login → app, unattended.

Exit the kiosk anytime with **`Esc` → admin sign-in → Unlock & exit**.
