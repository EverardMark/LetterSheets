# Models

Three ONNX files belong in this directory. `../fetch-models.sh` installs the
first two; the third has to be exported by hand.

| File | Purpose | Input | Source |
|---|---|---|---|
| `det_500m.onnx` | Face detection (SCRFD 500M) | `1x3xHxW` | InsightFace `buffalo_s` |
| `w600k_mbf.onnx` | 512-d embedding (MobileFaceNet/ArcFace) | `1x3x112x112` | InsightFace `buffalo_s` |
| `antispoof.onnx` | Passive liveness (MiniFASNet) | `1x3x80x80` | Silent-Face-Anti-Spoofing, exported |

These are the same models `app/timeclock/facebridge` runs. That is deliberate:
embeddings are only comparable within the model that produced them, so keeping
both kiosks on `buffalo_s` means a face enrolled at one works at the other. If
you change the recogniser here, change `MODEL_ID` in `main.js` too — the server
records it per template and the kiosk refuses to match across a mismatch, which
is what stops a model upgrade producing confident wrong matches.

## Anti-spoof

`fetch-models.sh` cannot install this one: the reference weights ship as
PyTorch `.pth`, and there is no official ONNX release. Until it is present,
**face sign-in stays disabled** and the kiosk falls back to name-tap. That
refusal is intentional — see the note below.

To produce it, on a machine with PyTorch:

```bash
git clone https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
```

Load a checkpoint from its `resources/anti_spoof_models/` (the `80x80` variant),
then export with `torch.onnx.export` at a fixed input of `1x3x80x80`. The graph
must emit **3 logits** in the order `[print-spoof, real, replay-spoof]`; the
kiosk softmaxes them and reads index 1 as P(real).

The kiosk feeds this model a **2.7x context crop** around the face box, scaled
to 80x80 and normalised to `[0,1]` — matching the reference implementation's
`ToTensor()` preprocessing. If you export a variant trained with a different
crop scale or normalisation, update `SPOOF_CROP_SCALE` and the `warpToTensor`
call in `renderer/face-engine.js` to match, or the scores will be meaningless
while still looking plausible.

> **Validate any model you export against real print and replay attempts on the
> actual kiosk hardware before trusting it.** Anti-spoof accuracy depends
> heavily on the specific camera and lighting; a model that scores well on its
> own benchmark can do poorly on one webcam under office fluorescents. Test by
> holding a printed photo and a phone screen up to the camera and confirming
> both are rejected.

## Why liveness is not optional

A face matcher with no liveness check is defeated by a photo held up on a
phone. At a time clock that **is** buddy punching — the exact fraud the
biometric exists to prevent — so without it, face sign-in is weaker than the
name-tap it replaces.

The kiosk therefore refuses to run face sign-in when `antispoof.onnx` is
missing, rather than quietly degrading to bare matching. Defaulting to "off
when the model is absent" would ship every kiosk in the insecure configuration,
which is how this class of feature usually fails.

Two independent gates run and **both** must pass:

1. **The model**, median-scored across five frames, so one bad frame does not
   sink a real person and one lucky frame does not carry a photograph.
2. **A temporal check** — a living face is never pixel-identical between
   frames; micro-movement, blinks and sensor noise guarantee variation. A print
   or a still on a screen is identical. This costs nothing and catches the lazy
   attack even when the model is unsure.

## Licensing

These weights come from third-party projects under their own licences
(InsightFace models are for non-commercial research use; check the current
terms before a commercial deployment). This directory is `.gitignore`d — models
are fetched or exported per build host, not committed.
