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

Use the bundled exporter:

```bash
git clone --depth 1 https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
python3 -m venv venv && ./venv/bin/pip install torch onnx
./venv/bin/python tools/export-antispoof.py --repo ./Silent-Face-Anti-Spoofing
```

It exports `2.7_80x80_MiniFASNetV2.pth` at a fixed `1x3x80x80` input, emitting
**3 raw logits** in the order `[print-spoof, real, replay-spoof]`; the kiosk
softmaxes them and reads index 1 as P(real). Python 3.9–3.13 (torch has no 3.14
wheels yet).

### Preprocessing this model actually needs

Three details are **not** what the upstream docs say. Each one silently breaks
the gate rather than raising an error, so all three are asserted or commented
at the call site in `renderer/face-engine.js`:

| | Correct | Naive guess | Effect of getting it wrong |
|---|---|---|---|
| Range | raw `[0,255]` | `[0,1]` | Network emits a near-constant vector for *every* input |
| Channels | **BGR** | RGB | Upstream's own spoof samples score P(real) 0.96 / 0.99 — photos accepted |
| Crop | `_get_new_box`: w and h scaled independently by 2.7, squashed to 80x80, edge boxes shifted not clipped | square box of `max(w,h)*2.7` | Real faces score 0.000 — everyone rejected |

The range one is the nastiest: upstream's `ToTensor` has its `.div(255)`
commented out (`src/data_io/functional.py:59`) while the docstring still
promises `[0.0, 1.0]`.

If you export a variant trained with a different crop scale or normalisation,
update `SPOOF_CROP_SCALE` and the `warpToTensor` call in
`renderer/face-engine.js` to match, or the scores will be meaningless while
still looking plausible.

### Verified

The exported model was checked end to end through the kiosk's own JS engine on
upstream's three labelled samples, at the kiosk's `LIVENESS_THRESHOLD` of 0.65:

| Sample | Expected | P(real) | Verdict |
|---|---|---|---|
| `image_T1.jpg` | real | 1.000 | real |
| `image_F1.jpg` | spoof | 0.014 | spoof |
| `image_F2.jpg` | spoof | 0.005 | spoof |

ONNX also matches the PyTorch graph to 3.3e-06 max absolute logit difference.

> **That is a correctness check, not a field validation. Still test against real
> print and replay attempts on the actual kiosk hardware before trusting it.**
> Anti-spoof accuracy depends heavily on the specific camera and lighting; a
> model that scores well on its own benchmark can do poorly on one webcam under
> office fluorescents. Hold a printed photo and a phone screen up to the camera
> and confirm both are rejected.

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
