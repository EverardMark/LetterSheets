'use strict';

/* global FaceEngine, TemporalGate, faceUtils */

/**
 * Kiosk controller: camera loop, matching, enrollment and the clock actions.
 *
 * The recognition loop gathers EVIDENCE_FRAMES of evidence before deciding
 * anything. Single-frame decisions are what make face clocks feel flaky and
 * make them spoofable — one blurred frame rejects a real person, one lucky
 * frame passes a photograph.
 */

// ---------------------------------------------------------------------------
// Thresholds. Kept identical to facebridge's defaults so the two kiosks behave
// the same way on the same roster.
// ---------------------------------------------------------------------------

// Higher than the ~0.4 usually quoted for 1:1 verification, because this is
// 1:N — every enrolled employee is another chance to false-accept, so the
// error compounds with headcount.
const MATCH_THRESHOLD = 0.50;

// The runner-up must be this far behind. Siblings are common in a family
// business; if two people score nearly the same the system cannot tell them
// apart, and clocking in the wrong one is worse than clocking in nobody.
const MATCH_MARGIN = 0.06;

const LIVENESS_THRESHOLD = 0.65;   // median P(real) required across frames
const EVIDENCE_FRAMES = 5;
const FRAME_INTERVAL_MS = 140;

const MIN_DET_SCORE = 0.62;

// ---------------------------------------------------------------------------
// Capture zone.
//
// A fixed outline people stand in, rather than a box that chases whatever face
// is found. Three reasons, in order of how much they matter:
//
//  1. Faces OUTSIDE the outline are ignored entirely. Previously anyone
//     wandering past made it two faces and the kiosk refused to serve the
//     person actually standing at it.
//  2. It tells someone where to stand. A tracking box only confirms they have
//     been seen; it never says the pose is wrong.
//  3. Distance becomes checkable against something fixed, so "step closer" and
//     "step back" are specific instead of a single vague size threshold.
//
// Fractions of the capture frame; portrait, because a head is.
// ---------------------------------------------------------------------------
const ZONE_W = 0.40;
const ZONE_H = 0.66;
const ZONE_CY = 0.47;              // a shade above centre — people stand tall

// Face height as a fraction of the zone height.
const FILL_MIN = 0.42;             // below this, too far to embed reliably
const FILL_MAX = 1.10;             // above this, cropped and badly aligned

function faceZone(w, h) {
  const zw = w * ZONE_W;
  const zh = h * ZONE_H;
  return { x: (w - zw) / 2, y: h * ZONE_CY - zh / 2, w: zw, h: zh };
}

/** Is the face's centre inside the zone? Used only to decide who the subject
 *  is; whether that subject is USABLE is faceQuality()'s job. */
function centreInZone(face, z) {
  const cx = (face.bbox[0] + face.bbox[2]) / 2;
  const cy = (face.bbox[1] + face.bbox[3]) / 2;
  return cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h;
}

// ---------------------------------------------------------------------------
// Pose and completeness gates.
//
// Position and size alone are not enough. A half-visible or turned face still
// detects, still sits in the outline, and still produces an embedding — one
// built from whatever IS visible, which can land above the match threshold and
// sign the person in. That is a false accept, and the fact that it happens
// with a face the camera can barely see is exactly what makes it dangerous.
//
// So: the box must be almost entirely inside the outline, every landmark must
// be present and in frame, and the face must be roughly square-on.
// ---------------------------------------------------------------------------
const MIN_IN_ZONE = 0.92;      // fraction of the face box that must lie inside the outline
const MAX_YAW = 0.22;          // nose offset from the eye midpoint, in interocular units
const MAX_ROLL_DEG = 22;       // head tilt
const EDGE_MARGIN = 6;         // px of frame a landmark must stay clear of

/** Fraction of the face box that lies inside the zone rectangle. */
function zoneOverlap(face, z) {
  const [x1, y1, x2, y2] = face.bbox;
  const iw = Math.min(x2, z.x + z.w) - Math.max(x1, z.x);
  const ih = Math.min(y2, z.y + z.h) - Math.max(y1, z.y);
  if (iw <= 0 || ih <= 0) return 0;
  const area = (x2 - x1) * (y2 - y1);
  return area > 0 ? (iw * ih) / area : 0;
}

/**
 * Returns null when the face is usable, otherwise { title, hint } explaining
 * what is wrong. Ordered so the message names the most actionable problem.
 */
function faceQuality(face, zone, img) {
  if (zoneOverlap(face, zone) < MIN_IN_ZONE) {
    return { title: 'Show your whole face', hint: 'Part of your face is outside the outline.' };
  }

  const k = face.kps;
  if (!k || k.length !== 5) {
    return { title: 'Face not clear enough', hint: 'Look straight at the camera.' };
  }

  // A face running off the edge of the frame reports landmarks at or past the
  // border; those coordinates are guesses, and so is any embedding from them.
  for (const [px, py] of k) {
    if (px < EDGE_MARGIN || py < EDGE_MARGIN ||
        px > img.width - EDGE_MARGIN || py > img.height - EDGE_MARGIN) {
      return { title: 'Show your whole face', hint: 'Move so your whole face is in view.' };
    }
  }

  const [le, re, nose] = k;
  const dx = re[0] - le[0];
  const dy = re[1] - le[1];
  const interocular = Math.hypot(dx, dy);
  if (interocular < 1) {
    return { title: 'Face not clear enough', hint: 'Look straight at the camera.' };
  }

  // Yaw: on a square-on face the nose sits near the midpoint between the eyes.
  // Turn away and it slides toward the nearer eye.
  const midX = (le[0] + re[0]) / 2;
  const midY = (le[1] + re[1]) / 2;
  const yaw = Math.abs(nose[0] - midX) / interocular;
  if (yaw > MAX_YAW) {
    return { title: 'Look straight ahead', hint: 'Turn to face the camera directly.' };
  }

  // Roll: the eye line should be roughly level.
  const roll = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  if (Math.min(roll, 180 - roll) > MAX_ROLL_DEG) {
    return { title: 'Hold your head level', hint: 'Straighten up and look at the camera.' };
  }

  // Pitch, cheaply: looking far up or down collapses the eye-to-nose span.
  if (Math.abs(nose[1] - midY) / interocular < 0.18) {
    return { title: 'Look straight ahead', hint: 'Raise or lower your chin slightly.' };
  }

  return null;
}

const ENROLL_SAMPLES = 5;

// After someone is clocked, the kiosk will not clock again until the frame has
// been EMPTY for this many consecutive checks — i.e. the person stepped away.
//
// A timer alone is not enough. Someone standing in front of the camera reading
// the confirmation is still a match on every pass, so a pure cooldown clocks
// them in, then out, then in again for as long as they stand there: corrupted
// attendance, not merely wasted requests. Requiring departure is also what a
// person already expects a face terminal to do.
const DEPARTURE_FRAMES = 10;       // ~1.4s of empty frame at FRAME_INTERVAL_MS

// Backstop only, for the case where someone leaves and returns immediately.
// Deliberately long: a clock-in reversed seconds later is nearly always a
// mistake rather than intent.
const CLOCK_COOLDOWN_MS = 60000;
const CAPTURE_W = 640, CAPTURE_H = 480;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

let cfg = null;
let engine = null;
let templates = [];          // [{ employeeId, firstName, lastName, embedding }]
let employees = [];
let attendanceByEmp = {};
let stream = null;
let loopTimer = null;
let paused = false;
let busy = false;
const recentlyClocked = new Map();   // employeeId -> timestamp
let alignState = 'idle';             // idle | seeking | aligned — colours the outline
let awaitingDeparture = false;       // set after a clock, cleared once the frame empties
let absentFrames = 0;

/**
 * Stop acting on the face path until this person leaves the frame.
 *
 * Called on EVERY terminal outcome, not just a successful punch. Someone who
 * is already done for the day still matches on every pass, and a failed clock
 * still matches — so any exit that does not hold here becomes a loop for as
 * long as the person stands there: a repeating toast in one case, a retry
 * storm against a failing server in the other.
 */
function holdUntilDeparture() {
  awaitingDeparture = true;
  absentFrames = 0;
}

const temporal = new TemporalGate();
let evidence = [];

// Enrollment
let enrollEmp = null;
let enrollSamples = [];
let enrollRunning = false;

const capture = document.createElement('canvas');
capture.width = CAPTURE_W;
capture.height = CAPTURE_H;
const captureCtx = capture.getContext('2d', { willReadFrequently: true });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', boot);

async function boot() {
  startWallClock();
  wireEvents();

  // macOS may still be showing the camera prompt at this point; when it is
  // answered, bring the camera up rather than leaving a "No camera" kiosk that
  // only a restart would fix.
  window.api.onCameraAccess(({ granted, status }) => {
    if (cfg) cfg.cameraAccess = status;
    if (granted && !stream) startCamera();
  });

  cfg = await window.api.getConfig();
  $('setupServer').textContent = cfg.serverUrl;
  $('companyName').textContent = cfg.companyName || '';

  if (!cfg.authed) return showView('viewSetup');

  await enterClockMode();
}

async function enterClockMode() {
  showView('viewClock');
  $('companyName').textContent = cfg.companyName || '';

  await loadClockData();

  // These three are independent, and two of them are slow: the camera can take
  // seconds to start (or time out), and model load pulls ~15MB through the
  // WASM runtime. Running them in sequence meant the roster sync — which needs
  // neither — waited behind both, so the enrolled count and the "Face" badges
  // appeared long after the screen did, or not at all on a kiosk whose camera
  // never came up.
  await Promise.all([startCamera(), loadModels(), syncTemplates()]);
  startLoop();
}

function startWallClock() {
  const tick = () => {
    const d = new Date();
    $('clockTime').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('clockDate').textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };
  tick();
  setInterval(tick, 10000);
}

function showView(id) {
  for (const v of document.querySelectorAll('.view')) v.classList.add('hidden');
  $(id).classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------
function setChip(id, state, label) {
  const el = $(id);
  el.className = 'chip ' + state;
  $(id + 'Label').textContent = label;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const CAMERA_TIMEOUT_MS = 10000;

async function startCamera(videoEl = $('video')) {
  try {
    // getUserMedia can hang indefinitely on a wedged USB webcam rather than
    // rejecting — seen on Pi-class hardware. Everything after this call
    // (models, template sync) would then never run, leaving a blank kiosk
    // instead of one that has quietly fallen back to name-tap.
    stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('camera did not start')), CAMERA_TIMEOUT_MS)),
    ]);
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    $('camIdle').classList.add('hidden');
    setChip('chipCamera', 'ok', 'Camera ready');
    return true;
  } catch (err) {
    // "No camera" is the wrong thing to say when the camera exists and the OS
    // is refusing it — that sends someone to check cables for a problem that
    // lives in System Settings. Name the actual cause.
    const blocked = cfg && (cfg.cameraAccess === 'denied' || cfg.cameraAccess === 'restricted');
    setChip('chipCamera', 'err', blocked ? 'Camera blocked' : 'No camera');
    $('camIdleText').textContent = blocked
      ? 'macOS is blocking camera access. Allow it in System Settings → Privacy & Security → Camera, then restart. Tap a name below to clock in meanwhile.'
      : 'No camera detected. Tap a name below to clock in or out.';
    $('camIdle').classList.remove('hidden');
    console.error('camera:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
async function loadModels() {
  const status = cfg.models;
  if (!status.ready) {
    setChip('chipModels', 'err', 'Models missing');
    $('fcTitle').textContent = 'Face sign-in is not set up';
    $('fcHint').textContent = 'The recognition models are not installed on this device. Tap a name to clock in.';
    return false;
  }

  setChip('chipModels', 'warn', 'Loading…');
  try {
    engine = new FaceEngine();
    const r = await engine.load((name) => window.api.readModel(name));

    // A face matcher with no liveness check is defeated by a photo held up on
    // a phone — at a time clock that IS buddy punching, the exact fraud the
    // biometric exists to prevent. Refusing is the only safe default: shipping
    // "works, but insecure" would leave every kiosk in that state silently.
    if (!r.liveness) {
      setChip('chipModels', 'err', 'No liveness model');
      $('fcTitle').textContent = 'Face sign-in is disabled';
      $('fcHint').textContent = 'The anti-spoof model is missing, so face sign-in would be defeated by a photo. Tap a name instead.';
      engine = null;
      return false;
    }

    setChip('chipModels', 'ok', 'Models ready');
    return true;
  } catch (err) {
    console.error('models:', err);
    setChip('chipModels', 'err', 'Model error');
    $('fcHint').textContent = 'Recognition models failed to load. Tap a name to clock in.';
    engine = null;
    return false;
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
async function syncTemplates() {
  const r = await window.api.faceSync();
  if (!r.ok) {
    templates = [];

    // Name the cause on the chip. "Sync failed" sends someone hunting the
    // network for a problem that is actually a missing key or a dead session,
    // and those need completely different fixes.
    const noKey = /encryption key/i.test(r.error || '');
    setChip('chipSync', 'err',
      r.code === 401 ? 'Session expired' : noKey ? 'No encryption key' : 'Sync failed');

    if (noKey) {
      $('fcTitle').textContent = 'Face sign-in is unavailable';
      $('fcHint').textContent = 'This device has no encryption key, so face templates cannot be read. ' +
        'Set the device up again (Ctrl+Shift+Alt+Q → Sign out device) with an account whose key unlocks.';
    }
    toast(r.error || 'Could not sync face templates.', 'err');
    return;
  }

  templates = r.data.templates || [];
  const { wrongModel, undecryptable } = r.data;

  if (wrongModel || undecryptable) {
    // Say exactly what was skipped. "12 of 15 synced" with no explanation is
    // how a kiosk quietly stops recognising three people for a month.
    const bits = [];
    if (wrongModel) bits.push(`${wrongModel} from another model`);
    if (undecryptable) bits.push(`${undecryptable} unreadable`);
    setChip('chipSync', 'warn', `${templates.length} enrolled`);
    toast(`Skipped ${bits.join(', ')} — those staff must re-enroll.`, 'err');
  } else {
    setChip('chipSync', templates.length ? 'ok' : 'warn',
      templates.length ? `${templates.length} enrolled` : 'Nobody enrolled');
  }

  // The roster is drawn before the sync completes, so its "Face" badges are
  // stale until it is redrawn here. Without this they only appear once some
  // unrelated event happens to re-render.
  if (employees.length) renderRoster();
}

/**
 * 1:N match. Returns { employeeId, score, runnerUp } or a reason for refusing.
 * Embeddings are L2-normalised, so the dot product is the cosine similarity.
 */
function matchEmbedding(vec) {
  if (!templates.length) return { matched: false, reason: 'nobody is enrolled' };

  let best = -1, bestId = null, second = -1;
  for (const t of templates) {
    const emb = t.embedding;
    let dot = 0;
    for (let i = 0; i < vec.length; i++) dot += vec[i] * emb[i];
    if (dot > best) { second = best; best = dot; bestId = t.employeeId; }
    else if (dot > second) { second = dot; }
  }

  if (best < MATCH_THRESHOLD) return { matched: false, reason: 'not recognised', score: best };
  if (second > -1 && best - second < MATCH_MARGIN) {
    return { matched: false, reason: 'too close to another employee', score: best };
  }
  return { matched: true, employeeId: bestId, score: best };
}

// ---------------------------------------------------------------------------
// Recognition loop
// ---------------------------------------------------------------------------
function startLoop() {
  stopLoop();
  if (!engine) return;
  loopTimer = setInterval(tick, FRAME_INTERVAL_MS);
}

function stopLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
  evidence = [];
  temporal.reset();
}

function grabFrame(videoEl = $('video')) {
  if (!videoEl.videoWidth) return null;
  captureCtx.drawImage(videoEl, 0, 0, CAPTURE_W, CAPTURE_H);
  return captureCtx.getImageData(0, 0, CAPTURE_W, CAPTURE_H);
}

async function tick() {
  if (paused || busy || !engine) return;
  busy = true;
  try {
    const img = grabFrame();
    if (!img) return;

    const faces = await engine.detect(img);
    const zone = faceZone(img.width, img.height);

    // Only what stands in the outline is a subject. Someone crossing the room
    // behind is not competing for the terminal.
    const inZone = faces.filter((f) => centreInZone(f, zone));
    const show = (state, title, hint) => {
      alignState = state;
      drawOverlay($('overlay'), $('video'), inZone, zone);
      resetEvidence(title, hint);
    };

    if (inZone.length === 0) {
      // Nobody in the outline counts as an empty frame for the departure
      // check — the person who just clocked has stepped out of it.
      if (awaitingDeparture && ++absentFrames >= DEPARTURE_FRAMES) {
        awaitingDeparture = false;
        absentFrames = 0;
      }
      show(faces.length ? 'seeking' : 'idle',
        faces.length ? 'Step into the outline' : 'Look at the camera',
        faces.length ? 'Move so your face is inside the frame on screen.'
                     : 'Stand square to the screen and hold still for a moment.');
      return;
    }
    absentFrames = 0;

    if (inZone.length > 1) {
      show('seeking', 'One person at a time', 'Only one person should stand in the outline.');
      return;
    }

    const face = inZone[0];
    const fill = (face.bbox[3] - face.bbox[1]) / zone.h;

    if (face.score < MIN_DET_SCORE) {
      show('seeking', 'Move into the light', 'Your face is hard to see from here.');
      return;
    }
    if (fill < FILL_MIN) {
      show('seeking', 'Step closer', 'Fill the outline with your face.');
      return;
    }
    if (fill > FILL_MAX) {
      show('seeking', 'Step back', 'You are a little too close to the camera.');
      return;
    }

    // Whole and square-on, or nothing. A partial face still embeds, and that
    // embedding can clear the match threshold — a false accept.
    const bad = faceQuality(face, zone, img);
    if (bad) {
      show('seeking', bad.title, bad.hint);
      return;
    }

    alignState = 'aligned';
    drawOverlay($('overlay'), $('video'), inZone, zone);

    // Gather one frame of evidence.
    const spoof = await engine.spoofScore(img, face);
    const moved = temporal.push(faceUtils.greyThumb(img, face.bbox));
    const emb = await engine.embed(img, face);
    evidence.push({ spoof, emb, moved });

    $('fcTitle').textContent = 'Hold still…';
    $('fcHint').textContent = 'Verifying your face';
    setProgress(evidence.length);

    if (evidence.length < EVIDENCE_FRAMES) return;
    await decide();
  } catch (err) {
    console.error('loop:', err);
  } finally {
    busy = false;
  }
}

/** Verification progress. n = 0 hides the bar entirely. */
function setProgress(n, total = EVIDENCE_FRAMES) {
  const wrap = $('fcProgress');
  if (!n) {
    wrap.classList.add('hidden');
    $('fcProgressBar').style.width = '0%';
    return;
  }
  wrap.classList.remove('hidden');
  $('fcProgressBar').style.width = Math.round((Math.min(n, total) / total) * 100) + '%';
}

function resetEvidence(title, hint) {
  evidence = [];
  temporal.reset();
  setProgress(0);
  $('fcTitle').textContent = title;
  $('fcHint').textContent = hint;
  $('fcBadge').classList.add('hidden');
}

function median(list) {
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Both liveness gates must pass, then match. They are independent on purpose:
 * the model catches a convincing replay the correlation check would miss, and
 * the correlation check catches a held-still print the model is unsure about.
 */
async function decide() {
  const spoofScores = evidence.map((e) => e.spoof).filter((s) => s !== null);

  // Median, not mean: one bad frame should not sink a real person, and one
  // lucky frame should not carry a photograph.
  const liveScore = spoofScores.length ? median(spoofScores) : 0;
  const modelSaysReal = spoofScores.length > 0 && liveScore >= LIVENESS_THRESHOLD;
  const movedVerdicts = evidence.map((e) => e.moved).filter((m) => m !== null);
  const movementSeen = movedVerdicts.length === 0 ? false : movedVerdicts.some(Boolean);

  if (!modelSaysReal || !movementSeen) {
    evidence = [];
    temporal.reset();
    setProgress(0);
    $('fcTitle').textContent = 'That looked like a photo';
    $('fcHint').textContent = 'Face sign-in needs a real person at the camera.';
    setBadge('err', 'Rejected');
    toast('Face check failed — tap your name instead.', 'err');
    pauseFor(2600);
    return;
  }

  // Average the frames, then renormalise: averaging suppresses per-frame noise
  // and is why five frames beat the single best one.
  const dims = evidence[0].emb.length;
  const avg = new Float32Array(dims);
  for (const e of evidence) for (let i = 0; i < dims; i++) avg[i] += e.emb[i];
  for (let i = 0; i < dims; i++) avg[i] /= evidence.length;
  faceUtils.l2normalize(avg);

  const m = matchEmbedding(avg);
  evidence = [];
  temporal.reset();
  setProgress(0);

  if (!m.matched) {
    $('fcTitle').textContent = m.reason === 'too close to another employee'
      ? 'Could not tell you apart'
      : 'Not recognised';
    $('fcHint').textContent = m.reason === 'too close to another employee'
      ? 'Please tap your name instead.'
      : 'Try again, or tap your name below.';
    pauseFor(1400);
    return;
  }

  // Recognised, but this person has already been clocked and has not left the
  // frame yet. Nothing is sent — say so rather than silently doing nothing.
  if (awaitingDeparture) {
    $('fcTitle').textContent = 'All done';
    $('fcHint').textContent = 'Step away from the camera — the next person can go now.';
    pauseFor(1200);
    return;
  }

  const last = recentlyClocked.get(m.employeeId) || 0;
  if (Date.now() - last < CLOCK_COOLDOWN_MS) { pauseFor(1500); return; }

  await clockEmployee(m.employeeId);
}

function pauseFor(ms) {
  paused = true;
  setTimeout(() => { paused = false; }, ms);
}

function setBadge(kind, text) {
  const b = $('fcBadge');
  b.className = 'fc-badge ' + kind;
  b.textContent = text;
  b.classList.remove('hidden');
}

function drawOverlay(canvas, videoEl, faces, zone) {
  const w = videoEl.clientWidth, h = videoEl.clientHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!w || !h) return;

  // Frame coords are in CAPTURE space; the preview uses object-fit: cover, so
  // the scale is the larger ratio and the overflow is split evenly.
  const scale = Math.max(w / CAPTURE_W, h / CAPTURE_H);
  const ox = (w - CAPTURE_W * scale) / 2;
  const oy = (h - CAPTURE_H * scale) / 2;
  const toX = (x) => x * scale + ox;
  const toY = (y) => y * scale + oy;

  if (zone) {
    const zx = toX(zone.x), zy = toY(zone.y);
    const zw = zone.w * scale, zh = zone.h * scale;

    // Dim everything outside the outline. The eye goes to the hole in a mask
    // far more reliably than to a thin line, so this is what actually tells
    // someone where to stand.
    ctx.save();
    ctx.fillStyle = 'rgba(16, 32, 29, 0.45)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.ellipse(zx + zw / 2, zy + zh / 2, zw / 2, zh / 2, 0, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();

    const colour = alignState === 'aligned' ? '#2d9e8b'
      : alignState === 'seeking' ? '#f59e0b'
      : 'rgba(255,255,255,0.85)';

    ctx.strokeStyle = colour;
    ctx.lineWidth = alignState === 'aligned' ? 4 : 3;
    ctx.setLineDash(alignState === 'aligned' ? [] : [14, 10]);
    ctx.beginPath();
    ctx.ellipse(zx + zw / 2, zy + zh / 2, zw / 2, zh / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner ticks read as "align here" rather than "you are being watched",
    // and they stay visible against a bright background where the ellipse
    // alone can wash out.
    const t = Math.min(zw, zh) * 0.16;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (const [cx, cy, dx, dy] of [
      [zx, zy, 1, 1], [zx + zw, zy, -1, 1],
      [zx, zy + zh, 1, -1], [zx + zw, zy + zh, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * t, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * t);
      ctx.stroke();
    }
  }

  // The detected face is drawn only once it is accepted — a box that tracks a
  // face the kiosk is ignoring invites people to trust the wrong signal.
  if (alignState === 'aligned' && faces && faces.length) {
    const [x1, y1, x2, y2] = faces[0].bbox;
    ctx.strokeStyle = 'rgba(45, 158, 139, 0.55)';
    ctx.lineWidth = 2;
    roundRect(ctx, toX(x1), toY(y1), (x2 - x1) * scale, (y2 - y1) * scale, 10);
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Clock actions
// ---------------------------------------------------------------------------
/** Refresh only today's attendance — the roster is unchanged by a clock. */
async function refreshAttendance() {
  const r = await window.api.attendanceToday();
  if (!r.ok) {
    if (r.code === 401) return handleExpired();
    return;
  }
  attendanceByEmp = {};
  for (const rec of r.data) attendanceByEmp[rec.employee_id] = rec;
  renderRoster();
}

async function loadClockData() {
  const [empRes, attRes] = await Promise.all([
    window.api.listEmployees(),
    window.api.attendanceToday(),
  ]);

  if (empRes.ok) employees = empRes.data.filter((e) => (e.status || 'Active') === 'Active');
  else if (empRes.code === 401) return handleExpired();

  attendanceByEmp = {};
  if (attRes.ok) for (const rec of attRes.data) attendanceByEmp[rec.employee_id] = rec;

  renderRoster();
}

function empState(emp) {
  const rec = attendanceByEmp[emp.id];
  if (!rec || !rec.clock_in) return { key: 'out', label: 'Not clocked in' };
  if (rec.clock_in && !rec.clock_out) return { key: 'in', label: 'Clocked in', rec };
  return { key: 'done', label: 'Clocked out', rec };
}

function initials(e) {
  return ((e.first_name || '')[0] || '' ).toUpperCase() + ((e.last_name || '')[0] || '').toUpperCase();
}

function renderRoster() {
  const q = $('search').value.trim().toLowerCase();
  const list = $('roster');
  list.innerHTML = '';

  const enrolled = new Set(templates.map((t) => String(t.employeeId)));
  const filtered = employees.filter((e) => {
    if (!q) return true;
    return `${e.first_name} ${e.last_name} ${e.department || ''} ${e.position || ''}`.toLowerCase().includes(q);
  });

  $('rosterEmpty').classList.toggle('hidden', filtered.length > 0);

  let inCount = 0;
  for (const e of employees) if (empState(e).key === 'in') inCount++;
  $('inCount').textContent = inCount;
  $('outCount').textContent = Math.max(employees.length - inCount, 0);

  for (const e of filtered) {
    const st = empState(e);
    const row = document.createElement('div');
    row.className = 'rw';
    row.onclick = () => clockEmployee(e.id);

    const badges = `<span class="badge ${st.key}">${st.label}</span>` +
      (enrolled.has(String(e.id)) ? '<span class="badge face">Face</span>' : '');

    row.innerHTML =
      `<div class="av">${initials(e)}</div>` +
      `<div class="rw-mid"><div class="rw-name">${escapeHtml(e.first_name)} ${escapeHtml(e.last_name)}</div>` +
      `<div class="rw-sub">${escapeHtml(e.department || e.position || '')}</div></div>` +
      `<div style="display:flex;gap:6px">${badges}</div>`;
    list.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function clockEmployee(employeeId) {
  const emp = employees.find((e) => String(e.id) === String(employeeId));
  if (!emp) return;

  paused = true;
  const st = empState(emp);

  let result;
  if (st.key === 'out') result = await window.api.clockIn(emp.id);
  else if (st.key === 'in') result = await window.api.clockOut(st.rec.id);
  else {
    // Already clocked in AND out today. Shown on the panel, not only as a
    // toast that would otherwise reappear every couple of seconds.
    holdUntilDeparture();
    $('fcTitle').textContent = `${emp.first_name} ${emp.last_name}`;
    // Wording states the fact — a complete in/out pair exists — without
    // asserting the shift is over. "Done for today" is a guess the kiosk has
    // no basis for: someone back from lunch, on a split shift, or returning
    // for overtime is not done, and being told they are is both wrong and
    // unhelpful when what they need is who to ask.
    $('fcHint').textContent = 'Your in and out times for today are already recorded — see a supervisor to change them.';
    setBadge('out', 'RECORDED');
    showResult({
      badge: 'RECORDED',
      name: `${emp.first_name} ${emp.last_name}`,
      text: 'Already clocked in and out today',
      kind: 'done',
      ms: 3000,
    });
    return pauseFor(3200);
  }

  if (!result.ok) {
    if (result.code === 401) return handleExpired();
    // Hold here too: without it a server that is down is retried every ~2s
    // for as long as somebody stands in front of the camera.
    holdUntilDeparture();
    $('fcTitle').textContent = 'Could not record that';
    $('fcHint').textContent = 'Step away and try again, or tap your name.';
    setBadge('err', 'ERROR');
    toast(result.error || 'Clock action failed.', 'err');
    return pauseFor(2200);
  }

  const action = st.key === 'out' ? 'clocked in' : 'clocked out';
  recentlyClocked.set(String(employeeId), Date.now());
  holdUntilDeparture();

  $('fcTitle').textContent = `${emp.first_name} ${emp.last_name}`;
  $('fcHint').textContent = `${action[0].toUpperCase() + action.slice(1)} — thank you!`;
  setBadge(st.key === 'out' ? 'in' : 'out', action === 'clocked in' ? 'IN' : 'OUT');
  toast(`${emp.first_name} ${action}`, 'ok');

  // Two calls saved per punch: the employee list cannot have changed here.
  await refreshAttendance();
  pauseFor(2600);
}

function handleExpired() {
  stopLoop();
  toast('This device’s session expired. Set it up again.', 'err');
  showView('viewSetup');
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
let setupUser = null;
let setupCompanies = [];

function setupMsg(text, kind = 'error') {
  const el = $('setupMsg');
  el.textContent = text;
  el.className = 'msg ' + kind;
  el.classList.toggle('hidden', !text);
}

async function setupNext() {
  const email = $('suEmail').value.trim();
  const password = $('suPassword').value;
  if (!email || !password) return setupMsg('Enter your email and password.');

  $('suNext').disabled = true;
  setupMsg('');
  const r = await window.api.login(email, password);
  $('suNext').disabled = false;

  if (!r.ok) return setupMsg(r.error || 'Sign-in failed.');

  setupUser = r.data.user;
  setupCompanies = r.data.companies || [];
  if (!setupCompanies.length) return setupMsg('That account has no companies.');

  const sel = $('suCompany');
  sel.innerHTML = '';
  for (const c of setupCompanies) {
    const opt = document.createElement('option');
    opt.value = c.company_id;
    opt.textContent = c.company_name || c.company_id;
    sel.appendChild(opt);
  }

  $('setupStep1').classList.add('hidden');
  $('setupStep2').classList.remove('hidden');
}

async function setupFinish() {
  const companyId = $('suCompany').value;
  const company = setupCompanies.find((c) => String(c.company_id) === String(companyId));
  if (!company) return setupMsg('Pick a company.');

  $('suFinish').disabled = true;
  setupMsg('Setting up…', 'ok');

  const r = await window.api.selectCompany({
    userId: setupUser.id,
    companyId,
    companyName: company.company_name,
    email: $('suEmail').value.trim(),
    password: $('suPassword').value,
    salt: setupUser.salt,
    wrappedCompanyKey: company.wrapped_company_key,
  });
  $('suFinish').disabled = false;

  if (!r.ok) return setupMsg(r.error || 'Setup failed.');

  // The password only ever existed in these fields; clear them now that the
  // key is unwrapped rather than leaving it in the DOM for the session.
  $('suPassword').value = '';
  $('suEmail').value = '';

  cfg = await window.api.getConfig();
  if (r.data.keyWarning) toast(r.data.keyWarning, 'err');

  setupMsg('');
  $('setupStep2').classList.add('hidden');
  $('setupStep1').classList.remove('hidden');
  await enterClockMode();
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------
function renderEnrollTable() {
  const body = $('enrollBody');
  body.innerHTML = '';
  const enrolled = new Set(templates.map((t) => String(t.employeeId)));

  for (const e of employees) {
    const has = enrolled.has(String(e.id));
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><div class="name-cell"><div class="av">${initials(e)}</div>` +
      `<span class="cell-name">${escapeHtml(e.first_name)} ${escapeHtml(e.last_name)}</span></div></td>` +
      `<td>${escapeHtml(e.department || '—')}</td>` +
      `<td>${has ? '<span class="badge face">Enrolled</span>' : '<span class="badge out">Not enrolled</span>'}</td>` +
      `<td class="right"></td>`;

    const cell = tr.querySelector('td.right');
    const btn = document.createElement('button');
    btn.className = 'btn-mini' + (has ? ' danger' : '');
    btn.textContent = has ? 'Remove' : 'Enroll';
    btn.onclick = () => (has ? removeEnrollment(e) : openEnrollModal(e));
    cell.appendChild(btn);

    body.appendChild(tr);
  }
}

async function removeEnrollment(emp) {
  const r = await window.api.faceDelete(emp.id);
  if (!r.ok) return toast(r.error || 'Could not remove the template.', 'err');
  await syncTemplates();
  renderEnrollTable();
  toast(`${emp.first_name}’s face template removed`, 'ok');
}

function openEnrollModal(emp) {
  if (!engine) return toast('Recognition models are not loaded on this device.', 'err');
  enrollEmp = emp;
  enrollSamples = [];
  enrollRunning = false;

  $('emName').textContent = `Enroll ${emp.first_name} ${emp.last_name}`;
  $('emConsent').checked = false;
  $('emStart').disabled = true;
  $('emStart').textContent = 'Start capture';
  $('emMsg').classList.add('hidden');
  renderPips(0);
  $('enrollModal').classList.remove('hidden');

  startCamera($('emVideo'));
}

function closeEnrollModal() {
  enrollRunning = false;
  enrollEmp = null;
  $('enrollModal').classList.add('hidden');
  // Hand the camera back to the clock view's element.
  startCamera($('video'));
}

function renderPips(n) {
  const wrap = $('emPips');
  wrap.innerHTML = '';
  for (let i = 0; i < ENROLL_SAMPLES; i++) {
    const p = document.createElement('div');
    p.className = 'pip' + (i < n ? ' on' : '');
    wrap.appendChild(p);
  }
}

function enrollMsg(text, kind = 'error') {
  const el = $('emMsg');
  el.textContent = text;
  el.className = 'msg ' + kind;
  el.classList.toggle('hidden', !text);
}

async function runEnrollCapture() {
  if (!enrollEmp || enrollRunning) return;
  enrollRunning = true;
  enrollSamples = [];
  temporal.reset();
  $('emStart').disabled = true;
  enrollMsg('Look at the camera…', 'ok');

  const video = $('emVideo');
  const spoofScores = [];
  let movementSeen = false;
  let attempts = 0;

  while (enrollSamples.length < ENROLL_SAMPLES && enrollRunning && attempts < 90) {
    attempts++;
    await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));

    const img = grabFrame(video);
    if (!img) continue;

    let faces;
    try { faces = await engine.detect(img); } catch { continue; }

    // Enrollment uses the SAME outline as sign-in. A template captured at a
    // different distance or crop than verification sees is a template that
    // scores worse every morning, so the two paths must agree on the pose.
    const zone = faceZone(img.width, img.height);
    const inZone = faces.filter((f) => centreInZone(f, zone));

    if (inZone.length !== 1) {
      alignState = faces.length ? 'seeking' : 'idle';
      drawOverlay($('emOverlay'), video, inZone, zone);
      enrollMsg(inZone.length === 0
        ? 'Position the face inside the outline.'
        : 'Only one person should stand in the outline.', 'warn');
      continue;
    }

    const face = inZone[0];
    const fill = (face.bbox[3] - face.bbox[1]) / zone.h;
    if (face.score < MIN_DET_SCORE || fill < FILL_MIN || fill > FILL_MAX) {
      alignState = 'seeking';
      drawOverlay($('emOverlay'), video, inZone, zone);
      enrollMsg(fill > FILL_MAX ? 'Step back a little.' : 'Fill the outline with the face.', 'warn');
      continue;
    }

    // Enrollment applies the same gate, and it matters more here: a template
    // built from a partial or turned face is wrong for every future check,
    // not just this one.
    const badPose = faceQuality(face, zone, img);
    if (badPose) {
      alignState = 'seeking';
      drawOverlay($('emOverlay'), video, inZone, zone);
      enrollMsg(badPose.hint, 'warn');
      continue;
    }

    alignState = 'aligned';
    drawOverlay($('emOverlay'), video, inZone, zone);

    const spoof = await engine.spoofScore(img, face);
    if (spoof !== null) spoofScores.push(spoof);
    if (temporal.push(faceUtils.greyThumb(img, face.bbox))) movementSeen = true;

    enrollSamples.push(await engine.embed(img, face));
    renderPips(enrollSamples.length);
    enrollMsg(`Captured ${enrollSamples.length} of ${ENROLL_SAMPLES}. Move your head slightly.`, 'ok');
  }

  if (!enrollRunning) return;

  if (enrollSamples.length < ENROLL_SAMPLES) {
    enrollMsg('Could not get enough clear captures. Try again in better light.');
    $('emStart').disabled = false;
    $('emStart').textContent = 'Try again';
    enrollRunning = false;
    return;
  }

  // Enrollment runs the same liveness gates as sign-in. Skipping them here
  // would let someone enroll a photograph — which then passes every future
  // check legitimately, because the stored template IS the attacker's photo.
  const liveScore = spoofScores.length ? median(spoofScores) : 0;
  if (!spoofScores.length || liveScore < LIVENESS_THRESHOLD || !movementSeen) {
    enrollMsg('That did not look like a live person. Enrollment cancelled.');
    $('emStart').disabled = false;
    $('emStart').textContent = 'Try again';
    enrollRunning = false;
    return;
  }

  const dims = enrollSamples[0].length;
  const avg = new Float32Array(dims);
  for (const s of enrollSamples) for (let i = 0; i < dims; i++) avg[i] += s[i];
  for (let i = 0; i < dims; i++) avg[i] /= enrollSamples.length;
  faceUtils.l2normalize(avg);

  // Quality = how tightly the samples agree with their own average. A low
  // value means the captures disagreed, which predicts a template that will
  // reject its owner later.
  let agree = 0;
  for (const s of enrollSamples) {
    let dot = 0;
    for (let i = 0; i < dims; i++) dot += s[i] * avg[i];
    agree += dot;
  }
  const quality = Math.max(0, Math.min(1, agree / enrollSamples.length));

  enrollMsg('Saving…', 'ok');
  const r = await window.api.faceEnroll(enrollEmp.id, Array.from(avg), quality);
  enrollRunning = false;

  if (!r.ok) {
    enrollMsg(r.error || 'Could not save the template.');
    $('emStart').disabled = false;
    $('emStart').textContent = 'Try again';
    return;
  }

  enrollMsg('Enrolled.', 'ok');
  await syncTemplates();
  renderEnrollTable();
  setTimeout(closeEnrollModal, 900);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
// What each dropdown choice does, plus the consequence spelled out. A list of
// three bare verbs gives no warning that two of them end the shift for
// everyone standing at the kiosk.
const ADMIN_ACTIONS = {
  enroll: {
    label: 'Continue',
    danger: false,
    hint: 'Add or remove face templates for employees.',
    run: async () => {
      closeAdmin();
      stopLoop();
      await syncTemplates();
      renderEnrollTable();
      showView('viewEnroll');
    },
  },
  fullscreen: {
    label: () => (winIsFull ? 'Exit full screen' : 'Enter full screen'),
    danger: false,
    hint: () => (winIsFull
      ? 'Return to a normal window.'
      : 'Fill the screen. The window can still be closed — the locked kiosk mode is set at launch with --kiosk.'),
    run: async () => {
      const r = await window.api.setFullScreen(!winIsFull);
      if (r.ok) winIsFull = r.data.full;
      closeAdmin();
    },
  },
  exit: {
    label: 'Exit kiosk',
    danger: true,
    hint: 'Closes the app. Nobody can clock in or out until it is started again.',
    run: async () => { await window.api.exitApp(); },
  },
  signout: {
    label: 'Sign out device',
    danger: true,
    hint: 'Forgets this device’s session and encryption key. Setup must be done again before face sign-in works.',
    run: async () => {
      await window.api.signOut();
      stopLoop();
      closeAdmin();
      cfg = await window.api.getConfig();
      showView('viewSetup');
    },
  },
};

// label and hint may be functions, so an entry can reflect current state
// rather than showing "Enter full screen" on a window that already is.
const resolve = (v) => (typeof v === 'function' ? v() : v);

function renderAdminAction() {
  const a = ADMIN_ACTIONS[$('amAction').value] || ADMIN_ACTIONS.enroll;
  const go = $('amGo');
  go.textContent = resolve(a.label);
  go.classList.toggle('is-danger', a.danger);
  $('amHint').textContent = resolve(a.hint);
}

async function runAdminAction() {
  const a = ADMIN_ACTIONS[$('amAction').value];
  if (!a) return;
  await withAdmin(a.run);
}

let winIsFull = false;

async function openAdmin() {
  const st = await window.api.windowState();
  if (st.ok) winIsFull = st.data.full;
  $('amEmail').value = '';
  $('amPassword').value = '';
  $('amAction').value = 'enroll';
  renderAdminAction();
  $('amMsg').classList.add('hidden');
  $('adminModal').classList.remove('hidden');
  paused = true;
  $('amEmail').focus();
}

function closeAdmin() {
  $('adminModal').classList.add('hidden');
  paused = false;
}

function adminMsg(text, kind = 'error') {
  const el = $('amMsg');
  el.textContent = text;
  el.className = 'msg ' + kind;
  el.classList.toggle('hidden', !text);
}

async function withAdmin(fn) {
  const email = $('amEmail').value.trim();
  const password = $('amPassword').value;
  adminMsg('Checking…', 'ok');
  const r = await window.api.verifyAdmin(email, password);
  if (!r.ok) return adminMsg(r.error || 'Invalid credentials.');
  adminMsg('');
  $('amPassword').value = '';
  await fn();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
function wireEvents() {
  $('suNext').onclick = setupNext;
  $('suFinish').onclick = setupFinish;
  $('suBack').onclick = () => {
    $('setupStep2').classList.add('hidden');
    $('setupStep1').classList.remove('hidden');
    setupMsg('');
  };
  $('suPassword').onkeydown = (e) => { if (e.key === 'Enter') setupNext(); };

  $('search').oninput = renderRoster;

  $('enrollClose').onclick = async () => {
    showView('viewClock');
    startLoop();
  };

  $('emConsent').onchange = (e) => { $('emStart').disabled = !e.target.checked; };
  $('emStart').onclick = runEnrollCapture;
  $('emClose').onclick = closeEnrollModal;
  $('emCancel').onclick = closeEnrollModal;

  $('amCancel').onclick = closeAdmin;
  $('amClose').onclick = closeAdmin;
  $('amAction').onchange = renderAdminAction;
  $('amGo').onclick = runAdminAction;

  // Admin escape hatch. The kiosk has no window chrome and no menu, so this
  // combo is the only way out.
  window.addEventListener('keydown', (e) => {
    // e.code, not e.key: with Option held, macOS composes the character, so
    // Ctrl+Shift+Option+Q arrives as "Œ" and an e.key === 'Q' test never fires
    // — locking the only way out of the kiosk. e.code is the physical key, so
    // it is also correct on non-QWERTY layouts.
    if (e.ctrlKey && e.shiftKey && e.altKey && e.code === 'KeyQ') {
      e.preventDefault();
      openAdmin();
    }
  });

  // Refresh the day's attendance periodically so a kiosk left running
  // overnight rolls onto the new day without a restart.
  setInterval(() => { if (!paused && !document.hidden) loadClockData(); }, 120000);
}

// ---------------------------------------------------------------------------
let resultTimer = null;

/**
 * Centred, large result banner. Auto-dismisses — nobody taps anything on a
 * time clock, so anything that needs acknowledging would just sit there and
 * block the next person.
 */
function showResult({ badge, name, text, kind = '', ms = 2600 }) {
  $('resultBadge').textContent = badge;
  $('resultBadge').className = 'result-badge ' + kind;
  $('resultName').textContent = name;
  $('resultText').textContent = text;
  $('resultOverlay').classList.remove('hidden');
  if (resultTimer) clearTimeout(resultTimer);
  resultTimer = setTimeout(() => $('resultOverlay').classList.add('hidden'), ms);
}

function hideResult() {
  if (resultTimer) clearTimeout(resultTimer);
  $('resultOverlay').classList.add('hidden');
}

let toastTimer = null;
function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast ' + kind;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}
