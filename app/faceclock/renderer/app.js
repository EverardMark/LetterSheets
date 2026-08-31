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

// A face smaller than this fraction of frame height is too far away to embed
// reliably; prompting beats guessing.
const MIN_FACE_RATIO = 0.16;
const MIN_DET_SCORE = 0.62;

const ENROLL_SAMPLES = 5;
const CLOCK_COOLDOWN_MS = 6000;    // per-person, stops a double punch
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
    setChip('chipCamera', 'err', 'No camera');
    $('camIdleText').textContent = 'No camera detected. Tap a name below to clock in or out.';
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
    setChip('chipSync', 'err', 'Sync failed');
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
    drawOverlay($('overlay'), $('video'), faces);

    if (faces.length === 0) {
      resetEvidence('Look at the camera', 'Stand square to the screen and hold still for a moment.');
      return;
    }
    if (faces.length > 1) {
      // Refusing here is deliberate: with two faces in frame there is no way
      // to know which one is asking to be clocked in.
      resetEvidence('One person at a time', 'Please step up on your own.');
      return;
    }

    const face = faces[0];
    const [x1, y1, x2, y2] = face.bbox;
    const ratio = (y2 - y1) / img.height;

    if (face.score < MIN_DET_SCORE) {
      resetEvidence('Move into the light', 'Your face is hard to see from here.');
      return;
    }
    if (ratio < MIN_FACE_RATIO) {
      resetEvidence('Step closer', 'Move a little nearer to the camera.');
      return;
    }

    // Gather one frame of evidence.
    const spoof = await engine.spoofScore(img, face);
    const moved = temporal.push(faceUtils.greyThumb(img, face.bbox));
    const emb = await engine.embed(img, face);
    evidence.push({ spoof, emb, moved });

    $('fcTitle').textContent = 'Hold still…';
    $('fcHint').textContent = `Checking (${Math.min(evidence.length, EVIDENCE_FRAMES)}/${EVIDENCE_FRAMES})`;

    if (evidence.length < EVIDENCE_FRAMES) return;
    await decide();
  } catch (err) {
    console.error('loop:', err);
  } finally {
    busy = false;
  }
}

function resetEvidence(title, hint) {
  evidence = [];
  temporal.reset();
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

  const last = recentlyClocked.get(m.employeeId) || 0;
  if (Date.now() - last < CLOCK_COOLDOWN_MS) { pauseFor(900); return; }

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

function drawOverlay(canvas, videoEl, faces) {
  const w = videoEl.clientWidth, h = videoEl.clientHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (!faces || !faces.length) return;

  // Frame coords are in CAPTURE space; the preview uses object-fit: cover, so
  // the scale is the larger ratio and the overflow is split evenly.
  const scale = Math.max(w / CAPTURE_W, h / CAPTURE_H);
  const ox = (w - CAPTURE_W * scale) / 2;
  const oy = (h - CAPTURE_H * scale) / 2;

  ctx.strokeStyle = '#2d9e8b';
  ctx.lineWidth = 3;
  for (const f of faces) {
    const [x1, y1, x2, y2] = f.bbox;
    roundRect(ctx, x1 * scale + ox, y1 * scale + oy, (x2 - x1) * scale, (y2 - y1) * scale, 12);
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
    toast(`${emp.first_name} is already done for today`, '');
    return pauseFor(1500);
  }

  if (!result.ok) {
    if (result.code === 401) return handleExpired();
    toast(result.error || 'Clock action failed.', 'err');
    return pauseFor(1800);
  }

  const action = st.key === 'out' ? 'clocked in' : 'clocked out';
  recentlyClocked.set(String(employeeId), Date.now());

  $('fcTitle').textContent = `${emp.first_name} ${emp.last_name}`;
  $('fcHint').textContent = `${action[0].toUpperCase() + action.slice(1)} — thank you!`;
  setBadge(st.key === 'out' ? 'in' : 'out', action === 'clocked in' ? 'IN' : 'OUT');
  toast(`${emp.first_name} ${action}`, 'ok');

  await loadClockData();
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
    drawOverlay($('emOverlay'), video, faces);

    if (faces.length !== 1) {
      enrollMsg(faces.length === 0 ? 'No face detected — look at the camera.' : 'One person at a time.', 'warn');
      continue;
    }

    const face = faces[0];
    const ratio = (face.bbox[3] - face.bbox[1]) / img.height;
    if (face.score < MIN_DET_SCORE || ratio < MIN_FACE_RATIO) {
      enrollMsg('Step closer to the camera.', 'warn');
      continue;
    }

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
function openAdmin() {
  $('amEmail').value = '';
  $('amPassword').value = '';
  $('amMsg').classList.add('hidden');
  $('adminModal').classList.remove('hidden');
  paused = true;
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
  $('amEnroll').onclick = () => withAdmin(async () => {
    closeAdmin();
    stopLoop();
    await syncTemplates();
    renderEnrollTable();
    showView('viewEnroll');
  });
  $('amExit').onclick = () => withAdmin(async () => { await window.api.exitApp(); });
  $('amSignOut').onclick = () => withAdmin(async () => {
    await window.api.signOut();
    stopLoop();
    closeAdmin();
    cfg = await window.api.getConfig();
    showView('viewSetup');
  });

  // Admin escape hatch. The kiosk has no window chrome and no menu, so this
  // combo is the only way out.
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'Q' || e.key === 'q')) {
      e.preventDefault();
      openAdmin();
    }
  });

  // Refresh the day's attendance periodically so a kiosk left running
  // overnight rolls onto the new day without a restart.
  setInterval(() => { if (!paused && !document.hidden) loadClockData(); }, 120000);
}

// ---------------------------------------------------------------------------
let toastTimer = null;
function toast(text, kind = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast ' + kind;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}
