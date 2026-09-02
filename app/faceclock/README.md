# faceclock — face recognition time & attendance

A standalone Electron kiosk. An employee looks at the camera and is clocked in
or out against the LetterSheets API; nobody types anything.

It is a sibling of [`app/timeclock`](../timeclock/), not a replacement — that
app is fingerprint-first with an optional camera helper. This one is camera-only
and self-contained: **no Python, no native helper, no vendor SDK**, which is why
it can ship on hardware where the fingerprint path cannot (see
[Why this exists](#why-this-exists)).

Styled to match the ERP (`app/web`) — same DM Sans, same `#2d9e8b` accent over
`#f3f5f4`, same card and button treatments — so staff meet one product.

---

## How it works

```
  camera ──▶ SCRFD detect ──▶ align ──▶ ArcFace embed ──┐
                    │                                    │
                    └──▶ MiniFASNet + temporal ──▶ live? ─┤
                                                          ▼
                                        match on-device vs synced roster
                                                          │
                                                          ▼
                                    POST /api/execute?action=clock_in|clock_out
```

Everything above the last arrow happens **on the kiosk**. The server sees an
employee id and a timestamp, exactly as it would from a button press.

### Matching is client-side, and templates are end-to-end encrypted

The `face_templates` table stores `embedding_enc`: AES-256-GCM ciphertext under
the **company key**, the same envelope `employees.email_enc` uses. The server
cannot read an embedding, cannot match faces, and a database dump yields
ciphertext rather than a roster of biometrics.

The kiosk unwraps the company key once at device setup (from the admin password
+ user salt, PBKDF2-600k → AES-KW, identical to `app/web/src/utils/crypto.js`),
seals it into the OS keyring, syncs the encrypted roster, and decrypts in
memory to match. So enrollments follow the employee across every kiosk and
survive an SD-card re-image — the things a device-local store cannot do — while
the plaintext biometric still never leaves the device.

`lib/crypto.js` is byte-compatible with the web app's module; the two read and
write each other's data. Verified round-trip both directions, including that a
wrong password fails cleanly instead of yielding a junk key.

---

## Why this exists

The fingerprint path on the Raspberry Pi is blocked on hardware, not software:
HID ships no aarch64 U.are.U SDK, libfprint's `uru4000` driver covers only the
4500 family, and the reader on the bench is a ZKTeco clone that the driver
cannot drive reliably.

Face recognition has no such dependency. The hardware is any USB webcam, and
the whole stack is WebAssembly inside Electron — nothing to compile for ARM,
nothing to install on the kiosk. That last point matters: a client kiosk holds
**runtime artifacts only**, so a design needing `pip install onnxruntime` on the
Pi would be the wrong shape regardless of whether it worked.

---

## Setup

```bash
npm install
./fetch-models.sh          # detector + recogniser; see models/README.md
npm run selftest           # crypto, keyring, models, server reachability
npm start
```

`npm start` opens a normal, closable window. **Fullscreen kiosk mode is opt-in
via `--kiosk`** (`npm run kiosk`), which also disables the close button — the
only exit then is `Ctrl+Shift+Alt+Q` → admin sign-in → Exit kiosk. The systemd
unit passes `--kiosk`; nothing else does, so launching the app to look at it
never traps you fullscreen.

`npm run dev` adds devtools. `VITE_API_BASE=http://localhost:8080 npm start`
points at a local server.

#### macOS: the camera prompt only appears via LaunchServices

On a Mac, run **`npm run dev:macos` the first time**. macOS attributes a camera
request to the *responsible* process, and an Electron started straight from a
shell inherits the terminal — which in a non-interactive shell cannot show a
dialog, so the request is refused in ~20ms with **no prompt at all** and the
kiosk reports "No camera" forever. `dev:macos` launches the same binary through
LaunchServices (`open -n -a`), which gives it its own TCC identity and lets the
dialog appear.

Once permission is granted it persists, and plain `npm run dev` works from then
on. (Note `systemPreferences.getMediaAccessStatus` still reports
`not-determined` when shell-spawned — that is the attribution quirk above, not
a real state; capture succeeds regardless.)

This affects development only. A packaged app launched from Finder, or from the
systemd unit on the Pi, is its own responsible process.

> `npm install` may not fetch Electron's binary if npm is blocking install
> scripts. If `npm start` reports Electron failed to install, run
> `node node_modules/electron/install.js`, or unzip the cached archive from
> `~/Library/Caches/electron/` into `node_modules/electron/dist/` and write
> `Electron.app/Contents/MacOS/Electron` into `node_modules/electron/path.txt`.

### First run

The kiosk asks for an administrator sign-in once. That password unlocks the
company key and is **not stored** — only the unwrapped key is, sealed in the OS
keyring alongside the session token, so a power cut does not strand the kiosk at
a login screen.

If the machine has no real keyring (Electron falls back to a `basic_text` scheme
that is barely obfuscation), nothing is written at all and the device asks for
setup again after each restart. The selftest reports this.

### Enrolling faces

`Ctrl+Shift+Alt+Q` → administrator sign-in → **Manage enrollment**. The same
combo is the only way out of the kiosk.

Enrollment takes five captures, runs the *same* liveness gates as sign-in, and
stores the average. Running liveness at enrollment is not belt-and-braces: it
stops someone enrolling a photograph, which would then pass every future check
legitimately, because the stored template **is** the attacker's photo.

Consent is recorded per employee (`face_templates.consent_at`), and the modal
requires an explicit tick that the subject is present and consenting.

---

## Thresholds

Cosine similarity on L2-normalised embeddings. Same person typically lands
0.5–0.9; different people −0.1–0.3.

| Setting | Default | Why |
|---|---|---|
| `MATCH_THRESHOLD` | `0.50` | Higher than the 0.4 usually quoted for 1:1 verification. This is **1:N** — every enrolled employee is another chance to false-accept, so error compounds with headcount. |
| `MATCH_MARGIN` | `0.06` | The runner-up must be this far behind. Siblings are common in a family business; if two people score nearly the same the kiosk clocks in **nobody**. |
| `LIVENESS_THRESHOLD` | `0.65` | Median P(real) required across frames. |
| `EVIDENCE_FRAMES` | `5` | Frames of evidence before any verdict. Single-frame decisions are what make face clocks feel flaky and make them spoofable. |

They live at the top of `renderer/app.js`. Raising the match threshold trades
convenience for safety: more "please try again", fewer wrong people clocked in.
Only loosen them against measured false-reject rates on your own roster — never
to make a demo smoother.

---

## Degradation

The kiosk stays useful when the face path cannot run, and says why rather than
appearing broken:

| Condition | Behaviour |
|---|---|
| No camera | "No camera" chip, name-tap clocking |
| Models missing | "Models missing" chip, name-tap clocking |
| **Anti-spoof model missing** | Face sign-in **refuses**, name-tap clocking |
| Camera blocked by the OS | Says so and names the settings pane, name-tap clocking |
| Company key unavailable | Templates cannot be decrypted; name-tap clocking |
| Templates from another model | Skipped with a count, and staff told to re-enroll |
| Server unreachable | Clock actions fail loudly; nothing is queued |

The third row is the load-bearing one. A face matcher with no liveness check is
defeated by a photo held up on a phone — at a time clock that **is** buddy
punching, the exact fraud the biometric exists to prevent. Degrading to bare
matching would ship every kiosk in the insecure configuration, so it refuses
instead.

Nothing is queued offline on purpose: a clock-in written hours later against a
stale roster is a payroll dispute, and the kiosk cannot tell a network blip from
a decommissioned server.

---

## Deploying to a Raspberry Pi

Build off-box; the kiosk carries no toolchain.

```bash
npm run package:linux-arm64
rsync -a dist/LetterSheetsFaceClock-linux-arm64/ pi:/opt/lettersheets-faceclock/
```

On the Pi:

```bash
sudo chmod 755 /opt/lettersheets-faceclock          # packager can emit 700
sudo chown root:root /opt/lettersheets-faceclock/chrome-sandbox
sudo chmod 4755 /opt/lettersheets-faceclock/chrome-sandbox
sudo apt install -y libgtk-3-0 libnss3 libasound2       # runtime libs, not dev tools
sudo usermod -aG video <seat-user>                      # /dev/video* access
```

Models go to `/usr/local/share/faceclock/models` (or set `FACECLOCK_MODELS`).
Autostart via `deploy/faceclock.service` — a **user** unit, because the app
needs the seat's display and login keyring; see the comments in that file.

Expect roughly 150–400 ms per frame on a Pi 5 under the WASM backend. That is
comfortable for someone standing at a terminal, and the loop samples every
140 ms rather than every frame.

---

## Server side

Three actions on `/api/execute`, added in `internal/api/handler_face.go`:

| Action | Permission | Notes |
|---|---|---|
| `get_face_templates` | any valid session | Roster sync; returns ciphertext |
| `save_face_template` | `attendance:edit` | Upsert, one template per employee |
| `delete_face_template` | `attendance:delete` | **Hard** delete |

Schema and stored procedures: `server/migrations/026_face_templates.sql`.

Deletion is a real `DELETE`, not `is_deleted = 1`, and deleting an employee
cascades to their template. "Remove my face" has to destroy the record — a soft
delete would keep the biometric on file while telling the employee it was gone.
The audit trail records *that* a face was enrolled, never the template, so
`change_history` does not quietly become a second unencrypted copy.

All three are withheld from the AI assistant (`internal/ai/registry_coverage_test.go`):
enrolling or deleting biometrics is a deliberate act performed at the kiosk with
the subject present, not something to reach through a chat turn.

---

## Legal

Face embeddings are biometric data — irrevocable (unlike a password, you cannot
reissue someone's face) and a special category under GDPR Art. 9, with separate
consent-and-retention statutes in several US states. Before deploying:

- get and record explicit consent per employee (the schema has a column; the UI
  requires the tick — neither is legal advice);
- offer a non-biometric alternative, and mean it — name-tap already works;
- publish a retention policy and honour deletion requests;
- check local law. Some jurisdictions require written consent before capture,
  and some restrict biometric timekeeping outright.

The encryption above reduces exposure. It does not make the data lawful to
collect.

---

## Testing

`npm run selftest` covers what needs no camera: crypto round-trip, keyring
availability, model presence, server reachability. Meant to be run on a kiosk
during commissioning.

Verified during development, on real portraits: SCRFD anchor counts against the
model's true output shapes, landmark ordering and geometry, embedding
determinism and unit norm, same-person-across-scale scoring well above
threshold, and different-people scoring well below it. The anti-spoof model was exported with
`tools/export-antispoof.py` and verified through the kiosk's own JS engine on
upstream's labelled samples (real 1.000; spoofs 0.014 and 0.005, against a 0.65
threshold), with ONNX matching PyTorch to 3.3e-06. Getting there required three
corrections to preprocessing that fail silently rather than loudly — see the
table in `models/README.md`. It **must still be validated against real print and
replay attempts on the actual kiosk hardware** before the deployment is
trusted.

Not yet exercised on real hardware: a live webcam, a Pi 5 build, and end-to-end
clock-in against a live company roster.
