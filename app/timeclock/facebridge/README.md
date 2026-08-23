# facebridge — face recognition for the Time Clock kiosk

The camera counterpart to [`fpbridge-linux/`](../fpbridge-linux/). A native
helper owns the hardware and speaks a small JSON protocol over a loopback
WebSocket, so the Electron app never touches the camera and stays
OS-independent: no helper running means the app shows "No camera" and falls back
to name-tap, exactly as it does with no fingerprint reader attached.

**Templates never leave the kiosk.** Embeddings are held in memory here and
persisted by the Electron main process, encrypted at rest (see
[Privacy and the law](#privacy-and-the-law)).

---

## Why this can ship when fingerprint cannot

The U.are.U path is blocked on a vendor SDK with no aarch64 build; libfprint's
`uru4000` driver covers only the 4500 family, so whether it ever works depends
on which reader model is on the desk.

facebridge has no such dependency. `onnxruntime`, `opencv` and `insightface` all
publish aarch64 wheels, and the hardware is any USB webcam. On a Pi 5 expect
roughly **100–300 ms per frame** for detection plus embedding — comfortable for
someone standing at a terminal.

---

## Protocol

WebSocket, **loopback only**, `ws://127.0.0.1:52101`. One port along from
fpbridge, deliberately the same shape.

**app → helper**

| Message | Meaning |
|---|---|
| `{"cmd":"status"}` | Ask for readiness |
| `{"cmd":"load","templates":[{"employeeId","embedding"}]}` | Load the roster (`embedding` = base64 float32) |
| `{"cmd":"identify"}` | Begin a 1:N identification |
| `{"cmd":"enroll","employeeId":"..."}` | Begin enrollment |
| `{"cmd":"cancel"}` | Stop whatever is running and release the camera |

**helper → app**

| Message | Meaning |
|---|---|
| `{"type":"status","ready","camera","loaded","liveness","error"}` | `liveness:false` means the anti-spoof model is missing and identify will refuse |
| `{"type":"frame","faces","quality"}` | Streamed during an operation, so the UI can say "step closer" or "one person at a time" |
| `{"type":"enrollProgress","captured","needed"}` | |
| `{"type":"enrollComplete","employeeId","embedding","quality"}` | |
| `{"type":"identify","matched","employeeId","score","reason"}` | `reason` explains a non-match — it is not always "not recognised" |
| `{"type":"error","message"}` | |
| `{"type":"canceled"}` | |

---

## Liveness is not optional

A face matcher with no liveness check is defeated by a photo held up on a phone.
At a time clock that **is** buddy punching — the exact fraud the biometric
exists to prevent — so without it, face sign-in is weaker than the name-tap it
replaces.

Two independent gates run, and **both** must pass:

1. **Passive anti-spoof model** (MiniFASNet) scoring print and replay attacks.
   The median across frames is used, so one blink does not sink a real person
   and one lucky frame does not carry a photograph.
2. **Temporal check.** A living face is never pixel-identical between frames;
   micro-movement, blinks and sensor noise guarantee variation. A print or a
   still on a screen is identical. This costs nothing and catches the lazy
   attack even when the model is unsure.

If the anti-spoof model is not installed, **identify and enroll both refuse**
rather than quietly degrading to bare matching. Defaulting to "off when the
model is missing" would ship every kiosk in the insecure configuration, which is
how this class of feature usually fails.

`FACEBRIDGE_LIVENESS=0` disables the gate for bench testing. It logs a warning
on every start. Do not set it on a kiosk.

### Getting the anti-spoof model

facebridge expects a MiniFASNet ONNX export at
`/usr/local/share/facebridge/models/antispoof.onnx` (override with
`FACEBRIDGE_SPOOF_MODEL`). The reference weights come from
[Silent-Face-Anti-Spoofing](https://github.com/minivision-ai/Silent-Face-Anti-Spoofing);
export the PyTorch checkpoint to ONNX at input `1×3×80×80`, output 3 logits
`[print-spoof, real, replay-spoof]`.

> Validate any model you export against real print and replay attempts on the
> actual kiosk hardware before trusting it. Anti-spoof accuracy is strongly
> dependent on camera and lighting, and a model that scores well on its own
> benchmark can do poorly on a specific webcam under office fluorescents.

---

## Matching thresholds

Embeddings are L2-normalised, so scores are cosine similarities in `[-1, 1]`.
Same person typically lands 0.5–0.9; different people −0.1–0.3.

| Setting | Default | Why |
|---|---|---|
| `FACEBRIDGE_MATCH_THRESHOLD` | `0.50` | Higher than the 0.4 usually quoted for 1:1 verification. This is **1:N** — every enrolled employee is another chance to false-accept, so error compounds with headcount. |
| `FACEBRIDGE_MATCH_MARGIN` | `0.06` | The runner-up must be this far behind. Siblings and twins are common in a family business; if two people score nearly the same, the system cannot tell them apart and clocks in **nobody**. |
| `FACEBRIDGE_LIVENESS_THRESHOLD` | `0.65` | Median P(real) required across frames. |
| `FACEBRIDGE_LIVENESS_FRAMES` | `5` | Frames of evidence before a verdict. |

Raising the match threshold trades convenience for safety: more "please try
again", fewer wrong people clocked in. Start at the defaults and only loosen
them against measured false-reject rates on your own roster — never to make a
demo smoother.

Other knobs: `FACEBRIDGE_CAMERA` (V4L2 index), `FACEBRIDGE_MODEL`
(`buffalo_s` default, `buffalo_l` for more accuracy at ~3× the cost),
`FACEBRIDGE_DET_SIZE`, `FACEBRIDGE_ENROLL_SAMPLES`, `FACEBRIDGE_LOG`.

---

## Build and deploy

**Kiosk principle: runtime artifacts only.** No Python, pip, or compilers on the
kiosk — build elsewhere and copy the binary. PyInstaller does not cross-compile,
so build on an **arm64 Linux** machine (a spare Pi, an arm64 VM, or a container
under qemu).

```bash
cd app/timeclock/facebridge
./build.sh                  # runs --selftest first, then packages
# -> dist/facebridge
```

On the kiosk:

```bash
sudo usermod -aG video biometrics
sudo cp facebridge /usr/local/bin/
sudo mkdir -p /usr/local/share/facebridge/models /var/lib/facebridge
sudo cp antispoof.onnx /usr/local/share/facebridge/models/
sudo chown biometrics /var/lib/facebridge
sudo cp facebridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now facebridge
```

Check it:

```bash
systemctl status facebridge
journalctl -u facebridge -f
```

`INSIGHTFACE_HOME=/var/lib/facebridge` must be writable by the service user —
insightface downloads its model pack there on first run, and a permission error
surfaces as what looks like a camera fault.

### Offline checks

```bash
python3 facebridge.py --selftest
```

Runs the pure logic — matching, the ambiguity guard, base64 round-trips, and all
three liveness attack scenarios — with no camera and no models. Works on a dev
machine and in CI. `build.sh` runs it before packaging.

---

## Privacy and the law

Face embeddings are **biometric data**: under the Philippine Data Privacy Act
(RA 10173) that is *sensitive personal information*, which carries consent,
purpose-limitation and security obligations. Practical consequences for a
deployment:

- **Templates stay on the kiosk.** The bridge binds loopback only, and the
  systemd unit enforces that with `IPAddressDeny=any`. Nothing is sent to the
  ERP server; only the resulting `clock_in` is.
- **Templates are encrypted at rest.** The Electron main process writes
  `faces-<companyId>.enc` via `safeStorage`, keyed to the OS keyring. This
  matters on a Pi specifically: the disk is an SD card anyone can pull out.
- **Verify the keyring is real.** On a headless kiosk with no keyring backend,
  Electron falls back to a weak `basic_text` scheme. The app checks this and
  **refuses to enroll** rather than storing biometrics it cannot protect. Check
  it during setup — the Enroll screen surfaces the backend in use.
- **Enrollment needs informed consent**, and employees should have a way to
  decline and use name-tap instead without it being a problem.
- **Deletion must actually work.** `face:delete` removes the template from the
  store; make sure your offboarding checklist calls it.

> The fingerprint store (`fingerprints-<companyId>.json`) is still **plaintext**
> on the same disk. That predates this bridge and is tracked separately — but if
> you are enrolling biometrics on this kiosk at all, fix it at the same time.

---

## Known limits

- **One camera, one operation at a time.** Identify and enroll are serialised;
  overlapping them risks enrolling the wrong person's face.
- **Two faces in frame pauses identification.** Someone standing behind the
  person clocking in should not be clocked in by accident, so the bridge waits
  for a clean single face rather than picking the largest.
- **Accuracy varies across demographics.** Face recognition error rates are not
  uniform across skin tone, age or gender. Keep name-tap available for everyone,
  permanently, and treat repeated false rejects for one employee as a reason to
  take them off face sign-in rather than to lower the threshold for everybody.
- **The camera is released when idle**, so the first frame of an operation costs
  an open. This is intentional: holding `/dev/video0` open would block every
  other process on the Pi, and the clock is idle almost all the time.
