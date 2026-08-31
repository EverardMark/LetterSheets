'use strict';

/**
 * Face engine — detection, alignment, embedding and liveness, all in-process.
 *
 * Runs the same InsightFace `buffalo_s` models the Python facebridge helper
 * uses (SCRFD 500M detector + w600k_mbf recogniser), so embeddings produced
 * here and there occupy the same vector space and a roster enrolled on one
 * matches on the other. That compatibility is the reason for reimplementing
 * SCRFD decoding and ArcFace alignment below rather than picking a friendlier
 * in-browser face library: a different model means a different space, and
 * comparing across spaces yields confident nonsense.
 *
 * Everything here is pure computation on pixels — no network, no storage.
 */

/* global ort */

// --- Detector -------------------------------------------------------------
// SCRFD is fully convolutional, so the input size is a speed/reach dial rather
// than a fixed property of the weights. 320 keeps a Pi 5 comfortably
// interactive for someone standing at arm's length from the camera.
const DET_SIZE = 320;
const DET_THRESHOLD = 0.5;
const NMS_THRESHOLD = 0.4;
const DET_STRIDES = [8, 16, 32];
const DET_ANCHORS = 2;
const DET_MEAN = 127.5;
const DET_STD = 128.0;

// --- Recogniser -----------------------------------------------------------
const REC_SIZE = 112;
const REC_MEAN = 127.5;
const REC_STD = 127.5;
const EMBEDDING_DIMS = 512;

// ArcFace's canonical 5-point layout for a 112x112 crop: left eye, right eye,
// nose, left mouth corner, right mouth corner. Every embedding the model was
// trained on was aligned to these coordinates, so skipping alignment does not
// merely lose a little accuracy — it moves the face into a pose the network
// never saw.
const ARCFACE_DST = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

// --- Anti-spoof -----------------------------------------------------------
const SPOOF_SIZE = 80;
// MiniFASNet is trained on a context crop, not a tight face box: the giveaways
// for a print or a phone replay (a bezel, a hand, a flat background) live just
// outside the face. Cropping tight throws that evidence away.
const SPOOF_CROP_SCALE = 2.7;

/** Softmax over a small logit array. */
function softmax(logits) {
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / sum);
}

/** Greedy NMS over [x1,y1,x2,y2,score] boxes, highest score first. */
function nms(boxes, threshold) {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[b][4] - boxes[a][4]);
  const keep = [];
  const suppressed = new Set();

  for (const i of order) {
    if (suppressed.has(i)) continue;
    keep.push(i);
    const [ax1, ay1, ax2, ay2] = boxes[i];
    const areaA = (ax2 - ax1) * (ay2 - ay1);

    for (const j of order) {
      if (j === i || suppressed.has(j)) continue;
      const [bx1, by1, bx2, by2] = boxes[j];
      const w = Math.min(ax2, bx2) - Math.max(ax1, bx1);
      const h = Math.min(ay2, by2) - Math.max(ay1, by1);
      if (w <= 0 || h <= 0) continue;
      const inter = w * h;
      const areaB = (bx2 - bx1) * (by2 - by1);
      if (inter / (areaA + areaB - inter) > threshold) suppressed.add(j);
    }
  }
  return keep;
}

/**
 * Least-squares similarity transform (uniform scale + rotation + translation)
 * mapping src onto dst. This is what skimage's SimilarityTransform computes
 * inside InsightFace's norm_crop; the fit matters because five detected
 * landmarks are never an exact similarity of the reference.
 *
 * Solved in closed form rather than via SVD. Writing the 2D problem as a
 * complex multiplication z -> w*z + t makes the least-squares solution exact
 * and two accumulators long, where a hand-rolled 2x2 SVD needs a sign and
 * angle convention that is easy to get subtly wrong.
 *
 *   w = a + bi  gives  scale*R = [[a, -b], [b, a]]
 *
 * Reflections are deliberately not fitted: a similarity transform excludes
 * them, and a mirrored set of face landmarks means the detector failed, not
 * that the crop should be flipped.
 *
 * Returns a 2x3 affine [[a,b,tx],[c,d,ty]].
 */
function umeyama(src, dst) {
  const n = src.length;
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (let i = 0; i < n; i++) {
    msx += src[i][0]; msy += src[i][1];
    mdx += dst[i][0]; mdy += dst[i][1];
  }
  msx /= n; msy /= n; mdx /= n; mdy /= n;

  let num_a = 0, num_b = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - msx, y = src[i][1] - msy;
    const u = dst[i][0] - mdx, v = dst[i][1] - mdy;
    num_a += x * u + y * v;   // Re(conj(z) * w)
    num_b += x * v - y * u;   // Im(conj(z) * w)
    den += x * x + y * y;
  }

  // Degenerate input (all landmarks coincident) leaves the identity rotation
  // rather than a division by zero.
  const a = den > 0 ? num_a / den : 1;
  const b = den > 0 ? num_b / den : 0;

  return [
    [a, -b, mdx - (a * msx - b * msy)],
    [b, a, mdy - (b * msx + a * msy)],
  ];
}

/** Invert a 2x3 affine. */
function invertAffine(M) {
  const [[a, b, tx], [c, d, ty]] = M;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  return [[ia, ib, -(ia * tx + ib * ty)], [ic, id, -(ic * tx + id * ty)]];
}

/**
 * Warp an RGBA ImageData through a 2x3 affine into a size x size RGB float
 * plane set (CHW), sampling bilinearly. Equivalent to cv2.warpAffine followed
 * by blobFromImage, done in one pass so no intermediate canvas is needed.
 */
function warpToTensor(img, M, size, mean, std) {
  const inv = invertAffine(M);
  const out = new Float32Array(3 * size * size);
  if (!inv) return out;

  const { data, width, height } = img;
  const plane = size * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = inv[0][0] * x + inv[0][1] * y + inv[0][2];
      const sy = inv[1][0] * x + inv[1][1] * y + inv[1][2];

      let r = 0, g = 0, b = 0;
      if (sx >= 0 && sy >= 0 && sx < width - 1 && sy < height - 1) {
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const fx = sx - x0, fy = sy - y0;
        const i00 = (y0 * width + x0) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + width * 4;
        const i11 = i01 + 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy, w11 = fx * fy;
        r = data[i00] * w00 + data[i10] * w10 + data[i01] * w01 + data[i11] * w11;
        g = data[i00 + 1] * w00 + data[i10 + 1] * w10 + data[i01 + 1] * w01 + data[i11 + 1] * w11;
        b = data[i00 + 2] * w00 + data[i10 + 2] * w10 + data[i01 + 2] * w01 + data[i11 + 2] * w11;
      }

      const o = y * size + x;
      out[o] = (r - mean) / std;
      out[plane + o] = (g - mean) / std;
      out[2 * plane + o] = (b - mean) / std;
    }
  }
  return out;
}

/** L2-normalise in place so cosine similarity is a plain dot product. */
function l2normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

class FaceEngine {
  constructor() {
    this.detector = null;
    this.recognizer = null;
    this.antispoof = null;
    this.ready = false;
    this.hasLiveness = false;
    // Anchor centres depend only on the input size, so they are built once.
    this._anchorCache = new Map();
  }

  /**
   * Build the ORT sessions. `readModel(name)` returns { ok, data: ArrayBuffer }
   * — the main process owns the filesystem, so models arrive as bytes.
   */
  async load(readModel) {
    // wasmPaths is deliberately NOT set: ORT resolves its .wasm binaries
    // relative to its own bundle, which is the same dist/ directory they ship
    // in. Setting a document-relative path here instead produces a doubled
    // prefix (…/onnxruntime-web/node_modules/onnxruntime-web/dist/) and no
    // backend loads at all.
    ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1);
    ort.env.wasm.simd = true;
    ort.env.logLevel = 'error';

    const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };

    const det = await readModel('detector');
    if (!det.ok) throw new Error(det.error);
    this.detector = await ort.InferenceSession.create(det.data, opts);

    const rec = await readModel('recognizer');
    if (!rec.ok) throw new Error(rec.error);
    this.recognizer = await ort.InferenceSession.create(rec.data, opts);

    // Liveness is optional to LOAD but not optional to USE — see identify().
    const spoof = await readModel('antispoof');
    if (spoof.ok) {
      try {
        this.antispoof = await ort.InferenceSession.create(spoof.data, opts);
        this.hasLiveness = true;
      } catch (err) {
        console.error('anti-spoof model failed to load:', err.message);
      }
    }

    this.ready = true;
    return { ready: true, liveness: this.hasLiveness };
  }

  _anchors(size) {
    const cached = this._anchorCache.get(size);
    if (cached) return cached;

    const perStride = DET_STRIDES.map((stride) => {
      const h = Math.ceil(size / stride);
      const w = Math.ceil(size / stride);
      const centers = new Float32Array(h * w * DET_ANCHORS * 2);
      let k = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Each location carries DET_ANCHORS predictions at the same centre.
          for (let a = 0; a < DET_ANCHORS; a++) {
            centers[k++] = x * stride;
            centers[k++] = y * stride;
          }
        }
      }
      return centers;
    });

    this._anchorCache.set(size, perStride);
    return perStride;
  }

  /**
   * Detect faces in an ImageData. Returns [{ bbox, kps, score }] in the
   * coordinate space of the input image.
   */
  async detect(img) {
    // Letterbox into a square, anchored top-left, exactly as InsightFace does
    // — the decode below assumes that origin.
    const scale = Math.min(DET_SIZE / img.width, DET_SIZE / img.height);
    const M = [[scale, 0, 0], [0, scale, 0]];
    const input = warpToTensor(img, M, DET_SIZE, DET_MEAN, DET_STD);

    const feeds = {};
    feeds[this.detector.inputNames[0]] = new ort.Tensor('float32', input, [1, 3, DET_SIZE, DET_SIZE]);
    const out = await this.detector.run(feeds);

    const names = this.detector.outputNames;
    const fmc = DET_STRIDES.length;
    const anchors = this._anchors(DET_SIZE);
    const boxes = [];
    const kpsList = [];

    for (let i = 0; i < fmc; i++) {
      const stride = DET_STRIDES[i];
      const scores = out[names[i]].data;
      const bboxPreds = out[names[i + fmc]].data;
      const kpsPreds = names.length >= fmc * 3 ? out[names[i + fmc * 2]].data : null;
      const centers = anchors[i];

      for (let n = 0; n < scores.length; n++) {
        if (scores[n] < DET_THRESHOLD) continue;
        const cx = centers[n * 2];
        const cy = centers[n * 2 + 1];

        // SCRFD regresses distances from the anchor centre, in stride units.
        const x1 = cx - bboxPreds[n * 4] * stride;
        const y1 = cy - bboxPreds[n * 4 + 1] * stride;
        const x2 = cx + bboxPreds[n * 4 + 2] * stride;
        const y2 = cy + bboxPreds[n * 4 + 3] * stride;
        boxes.push([x1 / scale, y1 / scale, x2 / scale, y2 / scale, scores[n]]);

        const kps = [];
        if (kpsPreds) {
          for (let p = 0; p < 5; p++) {
            kps.push([
              (cx + kpsPreds[n * 10 + p * 2] * stride) / scale,
              (cy + kpsPreds[n * 10 + p * 2 + 1] * stride) / scale,
            ]);
          }
        }
        kpsList.push(kps);
      }
    }

    return nms(boxes, NMS_THRESHOLD).map((i) => ({
      bbox: boxes[i].slice(0, 4),
      score: boxes[i][4],
      kps: kpsList[i],
    }));
  }

  /** Aligned 512-d embedding for one detected face, L2-normalised. */
  async embed(img, face) {
    if (!face.kps || face.kps.length !== 5) {
      throw new Error('landmarks are required to align a face');
    }
    const M = umeyama(face.kps, ARCFACE_DST);
    const input = warpToTensor(img, M, REC_SIZE, REC_MEAN, REC_STD);

    const feeds = {};
    feeds[this.recognizer.inputNames[0]] = new ort.Tensor('float32', input, [1, 3, REC_SIZE, REC_SIZE]);
    const out = await this.recognizer.run(feeds);
    const raw = out[this.recognizer.outputNames[0]].data;

    return l2normalize(Float32Array.from(raw.slice(0, EMBEDDING_DIMS)));
  }

  /**
   * P(real) for one face from the passive anti-spoof model. Returns null when
   * no model is loaded — callers must treat null as "cannot judge", never as
   * "probably fine".
   */
  async spoofScore(img, face) {
    if (!this.antispoof) return null;

    // Square context crop around the face centre.
    const [x1, y1, x2, y2] = face.bbox;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const side = Math.max(x2 - x1, y2 - y1) * SPOOF_CROP_SCALE;
    const s = SPOOF_SIZE / side;
    const M = [[s, 0, SPOOF_SIZE / 2 - s * cx], [0, s, SPOOF_SIZE / 2 - s * cy]];

    // MiniFASNet is trained on ToTensor() inputs, i.e. plain [0,1] — not the
    // mean/std normalisation the other two models use.
    const input = warpToTensor(img, M, SPOOF_SIZE, 0, 255);

    const feeds = {};
    feeds[this.antispoof.inputNames[0]] = new ort.Tensor('float32', input, [1, 3, SPOOF_SIZE, SPOOF_SIZE]);
    const out = await this.antispoof.run(feeds);
    const logits = Array.from(out[this.antispoof.outputNames[0]].data);

    // [print-spoof, real, replay-spoof]
    const probs = softmax(logits.slice(0, 3));
    return probs[1];
  }
}

/**
 * Temporal liveness: a living face is never pixel-identical between frames.
 * Micro-movement, blinks and sensor noise guarantee variation; a print or a
 * still on a screen held steady does not vary. This costs nothing and catches
 * the lazy attack even when the model is unsure, which is why it runs as a
 * second, independent gate rather than as a tie-breaker.
 */
class TemporalGate {
  constructor(threshold = 0.9985, history = 5) {
    this.threshold = threshold;
    this.history = history;
    this.thumbs = [];
  }

  reset() { this.thumbs = []; }

  /** Push a 32x32 grey thumbnail of the face crop; returns true if it moves. */
  push(thumb) {
    this.thumbs.push(thumb);
    if (this.thumbs.length > this.history) this.thumbs.shift();
    if (this.thumbs.length < 2) return null;

    // Correlate consecutive frames; the MAXIMUM correlation across the window
    // is the giveaway. Averaging would let one twitch excuse a stack of
    // identical frames.
    let maxCorr = 0;
    for (let i = 1; i < this.thumbs.length; i++) {
      maxCorr = Math.max(maxCorr, correlation(this.thumbs[i - 1], this.thumbs[i]));
    }
    return maxCorr < this.threshold;
  }
}

/** Pearson correlation between two equal-length grey vectors. */
function correlation(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;

  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const den = Math.sqrt(da * db);
  // A perfectly flat crop (both variances zero) is as static as it gets.
  return den < 1e-9 ? 1 : num / den;
}

/** 32x32 grey thumbnail of a face box, for the temporal gate. */
function greyThumb(img, bbox, size = 32) {
  const [x1, y1, x2, y2] = bbox;
  const w = x2 - x1, h = y2 - y1;
  const out = new Float32Array(size * size);
  const { data, width, height } = img;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sx = Math.round(x1 + (x + 0.5) * w / size);
      const sy = Math.round(y1 + (y + 0.5) * h / size);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      const i = (sy * width + sx) * 4;
      out[y * size + x] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
  }
  return out;
}

window.FaceEngine = FaceEngine;
window.TemporalGate = TemporalGate;
window.faceUtils = { greyThumb, l2normalize, umeyama, softmax, correlation };
