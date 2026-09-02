#!/usr/bin/env python3
"""
Export MiniFASNetV2 (Silent-Face-Anti-Spoofing) to models/antispoof.onnx.

Run on a BUILD machine, never on a kiosk — a kiosk carries runtime artifacts
only. Needs torch + onnx; the checkpoint comes from the upstream repo:

    git clone --depth 1 https://github.com/minivision-ai/Silent-Face-Anti-Spoofing
    python3 -m venv venv && ./venv/bin/pip install torch onnx
    ./venv/bin/python tools/export-antispoof.py --repo ./Silent-Face-Anti-Spoofing

Exported contract, matched by renderer/face-engine.js `spoofScore()`:

    input   'input'  1x3x80x80 float32
    output  'logits' 1x3 raw logits — [print-spoof, real, replay-spoof]

Three preprocessing facts about this network are NOT what its own docs say, and
each one silently breaks the liveness gate rather than erroring:

  1. Input range is raw [0,255], NOT [0,1]. The upstream ToTensor has its
     `.div(255)` commented out (src/data_io/functional.py:59) while the
     docstring still promises [0.0, 1.0]. Fed [0,1], the network emits a
     near-constant vector for every input, real or fake.

  2. Channel order is BGR, not RGB — it was trained on cv2.imread output. Fed
     RGB, upstream's own spoof samples score P(real) = 0.96 and 0.99. The gate
     then accepts printed photographs while looking perfectly healthy.

  3. The crop is CropImage._get_new_box, not a square box: width and height are
     scaled independently by 2.7 and then squashed to 80x80, and a box running
     off an edge is shifted back inside rather than clipped.

Softmax is applied by the caller, matching upstream, so raw logits are exported.
"""
import argparse
import os
import sys
from collections import OrderedDict

import torch

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUT = os.path.join(HERE, '..', 'models', 'antispoof.onnx')
CKPT_REL = os.path.join('resources', 'anti_spoof_models', '2.7_80x80_MiniFASNetV2.pth')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--repo', required=True, help='path to a Silent-Face-Anti-Spoofing checkout')
    ap.add_argument('--out', default=DEFAULT_OUT, help='output .onnx path')
    args = ap.parse_args()

    repo = os.path.abspath(args.repo)
    sys.path.insert(0, repo)
    from src.model_lib.MiniFASNet import MiniFASNetV2      # noqa: E402
    from src.utility import get_kernel, parse_model_name    # noqa: E402

    ckpt = os.path.join(repo, CKPT_REL)
    if not os.path.exists(ckpt):
        sys.exit(f'checkpoint not found: {ckpt}')

    name = os.path.basename(ckpt)
    h, w, model_type, scale = parse_model_name(name)
    kernel = get_kernel(h, w)

    # The kiosk hardcodes 80x80 and SPOOF_CROP_SCALE = 2.7. A checkpoint that
    # disagrees would still export and still produce plausible-looking scores,
    # so refuse rather than warn.
    if (h, w) != (80, 80):
        sys.exit(f'expected an 80x80 model, got {h}x{w}')
    if scale != 2.7:
        sys.exit(f'expected crop scale 2.7 (see SPOOF_CROP_SCALE), got {scale}')
    if model_type != 'MiniFASNetV2':
        sys.exit(f'unexpected model type {model_type}')

    print(f'checkpoint : {name}')
    print(f'geometry   : {h}x{w}  conv6_kernel={kernel}  crop scale={scale}')

    model = MiniFASNetV2(conv6_kernel=kernel)
    state = torch.load(ckpt, map_location='cpu', weights_only=True)
    # Saved from DataParallel, so every key carries a "module." prefix.
    if next(iter(state)).startswith('module.'):
        state = OrderedDict((k[7:], v) for k, v in state.items())
    model.load_state_dict(state, strict=True)
    model.eval()
    print(f'weights    : loaded ({sum(p.numel() for p in model.parameters()):,} params)')

    # 3 classes is what the kiosk indexes into; a 4-class variant would shift
    # "real" to another position without any other visible symptom.
    with torch.no_grad():
        probe = model(torch.zeros(1, 3, 80, 80))
    if tuple(probe.shape) != (1, 3):
        sys.exit(f'expected 3 logits, got {tuple(probe.shape)}')
    print(f'head       : {tuple(probe.shape)} logits — OK')

    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    torch.onnx.export(
        model,
        torch.randn(1, 3, 80, 80),
        out,
        input_names=['input'],
        output_names=['logits'],
        opset_version=11,          # well supported by onnxruntime-web's wasm backend
        do_constant_folding=True,
        dynamo=False,
    )
    print(f'exported   : {out} ({os.path.getsize(out) / 1024:.0f} KB)')
    print('\nValidate against real print and replay attempts on the actual kiosk '
          'camera before trusting this in production.')


if __name__ == '__main__':
    main()
