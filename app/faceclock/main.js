'use strict';

/**
 * LetterSheets Face Clock — Electron main process.
 *
 * Responsibilities kept in main rather than the renderer:
 *   - every server call, so the bearer token and the company key never exist
 *     in a window that also runs camera and model code;
 *   - unwrapping and sealing the company key;
 *   - decrypting synced templates, and encrypting new enrollments;
 *   - reading model files off disk.
 *
 * The renderer does camera capture, inference and matching. It receives
 * plaintext embeddings — it has to, because matching happens on-device — but
 * it never sees the company key, the session token or the ciphertext.
 */

const { app, BrowserWindow, ipcMain, Menu, safeStorage, session: electronSession } = require('electron');
const path = require('path');
const fs = require('fs');

const crypto = require('./lib/crypto');

const DEV = process.argv.includes('--dev');
const SELFTEST = process.argv.includes('--selftest');

// Kiosk lock. Only the admin escape combo flips this and lets the app exit.
let allowQuit = false;

// ---------------------------------------------------------------------------
// API base. Mirrors app/web (VITE_API_BASE) and app/timeclock so all three
// point at the same deployment by default.
// ---------------------------------------------------------------------------
const SERVER_URL = (process.env.VITE_API_BASE || 'https://api.lettersheets.com')
  .replace(/\/+$/, '');

// ---------------------------------------------------------------------------
// Kiosk session. `companyKey` is a live CryptoKey held only in this process.
// ---------------------------------------------------------------------------
const session = {
  token: null,
  companyId: null,
  companyName: null,
  role: null,
  userId: null,
  userEmail: null,
  expiresAt: null,
  companyKey: null,
};

function isAuthed() {
  return Boolean(session.token) &&
    (!session.expiresAt || new Date(session.expiresAt).getTime() > Date.now());
}

// ---------------------------------------------------------------------------
// Server calls. The server wraps every response as { success, data, error }.
// ---------------------------------------------------------------------------
async function callApi(action, body, { auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    if (!isAuthed()) return { ok: false, error: 'Not signed in.', code: 401 };
    headers['Authorization'] = 'Bearer ' + session.token;
  }

  const url = SERVER_URL + '/api/execute?action=' + encodeURIComponent(action);

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  } catch (err) {
    return { ok: false, error: 'Cannot reach server: ' + err.message };
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: `Invalid response from server (HTTP ${res.status}).`, code: res.status };
  }

  if (!res.ok || (payload && payload.success === false)) {
    return {
      ok: false,
      error: (payload && payload.error) || `Request failed (HTTP ${res.status}).`,
      code: res.status,
    };
  }
  return { ok: true, data: payload ? payload.data : null };
}

function localDateString(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Device state at rest (session token + company key).
//
// Sealed with Electron safeStorage (OS keyring) so the kiosk survives a reboot
// without an admin standing there to retype the password. The trade-off is
// explicit: anyone who can run code AS the kiosk user can unseal it. What this
// does defend against is the realistic attack on a Pi — the SD card is pulled
// and read elsewhere, where the keyring is absent and the file is ciphertext.
//
// If the platform has no real keyring, nothing is written at all. Electron
// silently falls back to a "basic_text" scheme that is barely obfuscation, and
// a company key stored under it would be worse than asking for the password
// again each boot.
// ---------------------------------------------------------------------------
function deviceStatePath() {
  return path.join(app.getPath('userData'), 'device.enc');
}

function keyringUsable() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  // Linux reports which backend won. "basic_text" means no keyring was found.
  if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
    return safeStorage.getSelectedStorageBackend() !== 'basic_text';
  }
  return true;
}

/**
 * Seal the whole device enrolment — session token and company key together.
 *
 * Persisting the key without the token would be pointless: the kiosk would
 * still need an admin at the keyboard after every power cut, which on an
 * unattended Pi is the difference between an appliance and a laptop.
 */
async function saveDeviceState() {
  if (!keyringUsable()) return false;
  try {
    const state = {
      token: session.token,
      companyId: session.companyId,
      companyName: session.companyName,
      role: session.role,
      userId: session.userId,
      userEmail: session.userEmail,
      expiresAt: session.expiresAt,
      companyKeyRaw: session.companyKey ? await crypto.exportCompanyKey(session.companyKey) : null,
    };
    fs.writeFileSync(deviceStatePath(), safeStorage.encryptString(JSON.stringify(state)), { mode: 0o600 });
    return true;
  } catch (err) {
    console.error('could not seal device state:', err.message);
    return false;
  }
}

async function restoreDeviceState() {
  const p = deviceStatePath();
  if (!keyringUsable() || !fs.existsSync(p)) return false;
  try {
    const state = JSON.parse(safeStorage.decryptString(fs.readFileSync(p)));
    session.token = state.token || null;
    session.companyId = state.companyId || null;
    session.companyName = state.companyName || null;
    session.role = state.role || null;
    session.userId = state.userId || null;
    session.userEmail = state.userEmail || null;
    session.expiresAt = state.expiresAt || null;
    if (state.companyKeyRaw) {
      session.companyKey = await crypto.importCompanyKey(state.companyKeyRaw);
    }
    return true;
  } catch (err) {
    // Sealed state that will not open is not the same as no state: it means
    // this device was set up and has now lost its key. Say so in the log and
    // fall back to setup rather than pretending it is a fresh kiosk.
    console.error('sealed device state is unreadable:', err.message);
    return false;
  }
}

function forgetDeviceState() {
  session.companyKey = null;
  try {
    const p = deviceStatePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch { /* nothing to undo */ }
}

// ---------------------------------------------------------------------------
// Face models. Resolved from (in order) FACECLOCK_MODELS, the packaged
// resources dir, then ./models for a dev checkout.
// ---------------------------------------------------------------------------
const MODEL_FILES = {
  detector: 'det_500m.onnx',
  recognizer: 'w600k_mbf.onnx',
  antispoof: 'antispoof.onnx',
};

// Recorded on every template so a kiosk never matches vectors from a model it
// is not itself running. See migrations/026_face_templates.sql.
const MODEL_ID = 'buffalo_s/w600k_mbf';
const EMBEDDING_DIMS = 512;

function modelsDir() {
  if (process.env.FACECLOCK_MODELS) return process.env.FACECLOCK_MODELS;
  if (app.isPackaged) return path.join(process.resourcesPath, 'models');
  return path.join(__dirname, 'models');
}

function modelStatus() {
  const dir = modelsDir();
  const out = { dir, present: {}, ready: false, liveness: false };
  for (const [k, f] of Object.entries(MODEL_FILES)) {
    out.present[k] = fs.existsSync(path.join(dir, f));
  }
  out.ready = out.present.detector && out.present.recognizer;
  out.liveness = out.present.antispoof;
  return out;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#f3f5f4',
    kiosk: !DEV,
    fullscreen: !DEV,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Kiosk lock: the window cannot be closed except through the admin combo.
  win.on('close', (e) => {
    if (!allowQuit) e.preventDefault();
  });

  if (DEV) win.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(async () => {
  // The camera is the only device this app needs. Everything else is denied
  // outright rather than left to Chromium's defaults, so a bug in renderer
  // code cannot reach the microphone or the display capture APIs.
  electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media');
  });

  if (SELFTEST) return runSelftest();

  // Restore a previous enrolment so a power cycle does not strand the kiosk
  // at a login screen with nobody there to type a password.
  await restoreDeviceState();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || allowQuit) app.quit();
});

// ---------------------------------------------------------------------------
// IPC — config & models
// ---------------------------------------------------------------------------
ipcMain.handle('config:get', () => ({
  authed: isAuthed(),
  companyName: session.companyName,
  userEmail: session.userEmail,
  hasCompanyKey: Boolean(session.companyKey),
  keyringUsable: keyringUsable(),
  serverUrl: SERVER_URL,
  models: modelStatus(),
  modelId: MODEL_ID,
  dev: DEV,
}));

ipcMain.handle('models:status', () => modelStatus());

/**
 * Hand a model's bytes to the renderer, which builds the ORT session. Reading
 * here rather than letting the renderer fetch a file:// URL keeps the models
 * working unchanged once packaged into resources.
 */
ipcMain.handle('models:read', async (_e, { name }) => {
  const file = MODEL_FILES[name];
  if (!file) return { ok: false, error: `unknown model "${name}"` };
  const full = path.join(modelsDir(), file);
  try {
    const buf = fs.readFileSync(full);
    // Return the underlying bytes; Electron structured-clones this to the
    // renderer without a base64 round trip.
    return { ok: true, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } catch (err) {
    return { ok: false, error: `could not read ${full}: ${err.message}` };
  }
});

// ---------------------------------------------------------------------------
// IPC — device sign-in
// ---------------------------------------------------------------------------
ipcMain.handle('auth:login', async (_e, { email, password }) => {
  const r = await callApi('login', { email, password });
  if (!r.ok) return r;
  return { ok: true, data: { user: r.data.user, companies: r.data.companies || [] } };
});

/**
 * Step 2: pick a company. This creates the kiosk session AND unwraps the
 * company key from the password still held in this call — the only moment the
 * password exists in the process.
 */
ipcMain.handle('auth:selectCompany', async (_e, { userId, companyId, companyName, email, password, salt, wrappedCompanyKey }) => {
  const r = await callApi('select_company', {
    user_id: userId,
    company_id: companyId,
    device_info: 'LetterSheets Face Clock (Electron)',
  });
  if (!r.ok) return r;

  session.token = r.data.session_id;
  session.companyId = companyId;
  session.companyName = companyName || null;
  session.role = r.data.role || null;
  session.userId = userId;
  session.userEmail = email || null;
  session.expiresAt = r.data.expires_at || null;

  // Without the company key the kiosk can authenticate but cannot read a
  // single template, so a failure here is reported rather than swallowed.
  let keyWarning = null;
  if (!wrappedCompanyKey) {
    keyWarning = 'This account has no encryption key for that company, so face templates cannot be read.';
  } else {
    try {
      session.companyKey = await crypto.unlockCompanyKey(password, salt, wrappedCompanyKey);
    } catch {
      keyWarning = 'The password did not unlock the company encryption key.';
    }
  }

  // Sealed regardless of whether the key unwrapped: the session on its own is
  // still worth keeping, so a restart lands on the clock screen (name-tap
  // working) instead of the setup screen.
  const sealed = await saveDeviceState();
  if (!sealed && !keyWarning) {
    keyWarning = keyringUsable()
      ? 'This device could not be remembered; it will need setting up again after a restart.'
      : 'No OS keyring on this machine, so nothing is stored. This device needs setting up again after each restart.';
  }

  return {
    ok: true,
    data: { companyName: session.companyName, expiresAt: session.expiresAt, keyWarning },
  };
});

ipcMain.handle('auth:verifyAdmin', async (_e, { email, password }) => {
  if (!email || !password) return { ok: false, error: 'Enter admin email and password.' };
  const r = await callApi('login', { email, password });
  if (!r.ok) return { ok: false, error: r.error || 'Invalid credentials.' };

  const companies = r.data.companies || [];
  const match = session.companyId
    ? companies.find((c) => String(c.company_id) === String(session.companyId))
    : companies[0];
  if (!match) return { ok: false, error: 'That account has no access to this kiosk’s company.' };

  const role = String(match.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin' && role !== 'owner') {
    return { ok: false, error: 'That account is not an administrator.' };
  }
  return { ok: true, data: { role } };
});

ipcMain.handle('app:exit', () => {
  allowQuit = true;
  app.quit();
});

ipcMain.handle('auth:signOut', () => {
  forgetDeviceState();
  session.token = null;
  session.companyId = null;
  session.companyName = null;
  session.userId = null;
  session.userEmail = null;
  session.expiresAt = null;
  return { ok: true };
});

// ---------------------------------------------------------------------------
// IPC — roster & attendance
// ---------------------------------------------------------------------------
ipcMain.handle('employees:list', async () => {
  const r = await callApi('get_employees', {}, { auth: true });
  if (!r.ok) return r;
  return { ok: true, data: r.data.employees || [] };
});

ipcMain.handle('attendance:today', async () => {
  const today = localDateString();
  const r = await callApi('get_attendance', { date_from: today, date_to: today }, { auth: true });
  if (!r.ok) return r;
  return { ok: true, data: r.data.attendance || [] };
});

ipcMain.handle('attendance:clockIn', async (_e, { employeeId }) =>
  callApi('clock_in', { employee_id: employeeId }, { auth: true }));

ipcMain.handle('attendance:clockOut', async (_e, { attendanceId }) =>
  callApi('clock_out', { id: attendanceId }, { auth: true }));

// ---------------------------------------------------------------------------
// IPC — face templates
// ---------------------------------------------------------------------------

/**
 * Sync the roster and decrypt it for the matcher.
 *
 * Templates from a different model are dropped here with a count, not matched
 * and not silently ignored: comparing vectors across model families produces
 * confident nonsense, and an operator upgrading models needs to be told that
 * N people must re-enroll.
 */
ipcMain.handle('face:sync', async () => {
  if (!session.companyKey) {
    return { ok: false, error: 'The company encryption key is not loaded on this device.' };
  }

  const r = await callApi('get_face_templates', {}, { auth: true });
  if (!r.ok) return r;

  const rows = r.data.face_templates || [];
  const templates = [];
  let wrongModel = 0;
  let undecryptable = 0;

  for (const row of rows) {
    if (row.model !== MODEL_ID) { wrongModel++; continue; }
    try {
      const b64 = await crypto.decrypt(row.embedding_enc, session.companyKey);
      const vec = crypto.embeddingFromBase64(b64);
      if (vec.length !== row.dims) { undecryptable++; continue; }
      templates.push({
        employeeId: String(row.employee_id),
        firstName: row.first_name,
        lastName: row.last_name,
        quality: row.quality,
        embedding: Array.from(vec),
      });
    } catch {
      // One bad row must not sink the roster; report the count instead.
      undecryptable++;
    }
  }

  return { ok: true, data: { templates, wrongModel, undecryptable, total: rows.length } };
});

ipcMain.handle('face:enroll', async (_e, { employeeId, embedding, quality }) => {
  if (!session.companyKey) {
    return { ok: false, error: 'The company encryption key is not loaded on this device.' };
  }
  if (!employeeId || !Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMS) {
    return { ok: false, error: 'The captured template was not valid.' };
  }

  let embedding_enc;
  try {
    embedding_enc = await crypto.encrypt(
      crypto.embeddingToBase64(Float32Array.from(embedding)),
      session.companyKey
    );
  } catch (err) {
    return { ok: false, error: 'Could not encrypt the template: ' + err.message };
  }

  return callApi('save_face_template', {
    employee_id: employeeId,
    embedding_enc,
    model: MODEL_ID,
    dims: EMBEDDING_DIMS,
    quality: Math.max(0, Math.min(1, Number(quality) || 0)),
    device: require('os').hostname().slice(0, 191),
  }, { auth: true });
});

ipcMain.handle('face:delete', async (_e, { employeeId }) =>
  callApi('delete_face_template', { employee_id: employeeId }, { auth: true }));

// ---------------------------------------------------------------------------
// Selftest — `npm run selftest`.
//
// Checks everything that does not need a camera or a person: crypto round
// trip, model presence, and server reachability. Meant to be runnable on a
// kiosk during commissioning, where the useful question is "is this box
// wired up correctly" and not "does it recognise me".
// ---------------------------------------------------------------------------
async function runSelftest() {
  const lines = [];
  let failed = 0;
  const check = (name, pass, detail = '') => {
    lines.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    if (!pass) failed++;
  };

  // Crypto
  try {
    const key = await crypto.importCompanyKey(Buffer.alloc(32, 7).toString('base64'));
    const vec = new Float32Array([0.5, -0.25, 1 / 3]);
    const ct = await crypto.encrypt(crypto.embeddingToBase64(vec), key);
    const back = crypto.embeddingFromBase64(await crypto.decrypt(ct, key));
    check('crypto: embedding survives encrypt/decrypt', vec.every((v, i) => Object.is(v, back[i])));
  } catch (err) {
    check('crypto: embedding survives encrypt/decrypt', false, err.message);
  }

  // Keyring
  check('keyring: OS-backed encryption available', keyringUsable(),
    keyringUsable() ? '' : 'company key cannot be stored between restarts');

  // Models
  const ms = modelStatus();
  check('models: detector present', ms.present.detector, path.join(ms.dir, MODEL_FILES.detector));
  check('models: recognizer present', ms.present.recognizer, path.join(ms.dir, MODEL_FILES.recognizer));
  check('models: anti-spoof present', ms.present.antispoof,
    ms.present.antispoof ? '' : 'face sign-in will refuse to run without it');

  // Server
  const health = await callApi('health', {});
  check('server: reachable', health.ok, health.ok ? SERVER_URL : health.error);

  console.log('\nLetterSheets Face Clock — selftest\n');
  for (const l of lines) console.log('  ' + l);
  console.log(`\n${failed === 0 ? 'All checks passed.' : failed + ' check(s) failed.'}\n`);

  allowQuit = true;
  app.exit(failed === 0 ? 0 : 1);
}
