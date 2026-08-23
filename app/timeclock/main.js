'use strict';

const { app, BrowserWindow, ipcMain, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// Kiosk lock. The window can't be closed/minimized/quit by the user; only the
// admin escape combo (Ctrl+Shift+Alt+Q) sets this and lets the app exit.
let allowQuit = false;

// ---------------------------------------------------------------------------
// API base. Mirrors app/web, which uses `VITE_API_BASE`. Defaults to the
// remote deploy; override at launch for local dev, e.g.
// VITE_API_BASE=http://localhost:8080 npm start.
// ---------------------------------------------------------------------------
const SERVER_URL = (process.env.VITE_API_BASE || 'https://api.lettersheets.com')
  .replace(/\/+$/, '');

// In-memory kiosk session (established once when the device signs in).
const session = {
  token: null,        // session_id used as the Bearer token
  companyId: null,
  companyName: null,
  role: null,
  userId: null,
  userEmail: null,
  expiresAt: null,
};

function isAuthed() {
  return Boolean(session.token) &&
    (!session.expiresAt || new Date(session.expiresAt).getTime() > Date.now());
}

// ---------------------------------------------------------------------------
// Server calls. Every request goes through the main process so we (a) avoid
// browser CORS entirely and (b) keep the bearer token out of the renderer.
// The server wraps every response as { success, data, error }.
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
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    });
  } catch (err) {
    return { ok: false, error: 'Cannot reach server: ' + err.message };
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: 'Invalid response from server (HTTP ' + res.status + ').', code: res.status };
  }

  if (!res.ok || (payload && payload.success === false)) {
    return {
      ok: false,
      error: (payload && payload.error) || ('Request failed (HTTP ' + res.status + ').'),
      code: res.status,
    };
  }

  return { ok: true, data: payload ? payload.data : null };
}

// ---------------------------------------------------------------------------
// IPC handlers exposed to the renderer via preload.
// ---------------------------------------------------------------------------
ipcMain.handle('config:get', () => ({
  authed: isAuthed(),
  companyName: session.companyName,
  userEmail: session.userEmail,
}));

// Step 1 of device sign-in: verify credentials, return the companies the
// account can access. Does not create a session yet.
ipcMain.handle('auth:login', async (_e, { email, password }) => {
  const r = await callApi('login', { email, password });
  if (!r.ok) return r;
  return { ok: true, data: { user: r.data.user, companies: r.data.companies || [] } };
});

// Step 2 of device sign-in: pick a company, which creates the kiosk session.
ipcMain.handle('auth:selectCompany', async (_e, { userId, companyId, companyName, email }) => {
  const r = await callApi('select_company', {
    user_id: userId,
    company_id: companyId,
    device_info: 'LetterSheets Time Clock (Electron)',
  });
  if (!r.ok) return r;

  session.token = r.data.session_id;
  session.companyId = companyId;
  session.companyName = companyName || null;
  session.role = r.data.role || null;
  session.userId = userId;
  session.userEmail = email || null;
  session.expiresAt = r.data.expires_at || null;

  return { ok: true, data: { companyName: session.companyName, expiresAt: session.expiresAt } };
});

// Admin-gated exit: verify the entered credentials belong to an admin of the
// kiosk's company (or, if not signed in yet, an admin of any of their companies).
ipcMain.handle('auth:verifyAdmin', async (_e, { email, password }) => {
  if (!email || !password) return { ok: false, error: 'Enter admin email and password.' };
  const r = await callApi('login', { email, password });
  if (!r.ok) return { ok: false, error: r.error || 'Invalid credentials.' };

  const companies = r.data.companies || [];
  const isAdmin = (role) => ['admin', 'superadmin'].includes(String(role || '').toLowerCase());
  const ok = session.companyId
    ? companies.some((c) => c.company_id === session.companyId && isAdmin(c.role))
    : companies.some((c) => isAdmin(c.role));

  if (!ok) return { ok: false, error: 'This account is not an admin for this kiosk.' };
  return { ok: true };
});

// Actually exit — only reachable after auth:verifyAdmin succeeds in the renderer.
ipcMain.handle('app:quit', () => {
  allowQuit = true;
  app.quit();
  return { ok: true };
});

ipcMain.handle('auth:logout', async () => {
  if (session.token) {
    await callApi('logout', {}, { auth: true }); // best effort
  }
  session.token = null;
  session.companyId = null;
  session.companyName = null;
  session.role = null;
  session.userId = null;
  session.userEmail = null;
  session.expiresAt = null;
  return { ok: true };
});

ipcMain.handle('employees:list', async () => {
  const r = await callApi('get_employees', {}, { auth: true });
  if (!r.ok) return r;
  return { ok: true, data: r.data.employees || [] };
});

// Today's attendance rows — used to tell who is currently clocked in and to
// find the open record id needed for clock-out.
ipcMain.handle('attendance:today', async () => {
  const today = localDateString();
  const r = await callApi('get_attendance', { date_from: today, date_to: today }, { auth: true });
  if (!r.ok) return r;
  return { ok: true, data: r.data.attendance || [] };
});

ipcMain.handle('attendance:clockIn', async (_e, { employeeId }) => {
  return callApi('clock_in', { employee_id: employeeId }, { auth: true });
});

ipcMain.handle('attendance:clockOut', async (_e, { attendanceId }) => {
  return callApi('clock_out', { id: attendanceId }, { auth: true });
});

// --- Fingerprint enrollment templates (stored LOCALLY on the kiosk) ---
// Templates never leave this machine. They are kept in a per-company JSON file
// under userData, each linked to an employee_id (which does come from the ERP).
// Biometric data is stored as-is on the local disk; a kiosk should be physically
// secured / disk-encrypted accordingly.
function fpStorePath() {
  if (!session.companyId) return null;
  const safe = String(session.companyId).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(app.getPath('userData'), `fingerprints-${safe}.json`);
}

function fpLoad() {
  const p = fpStorePath();
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

function fpSave(list) {
  const p = fpStorePath();
  if (!p) return false;
  try {
    fs.writeFileSync(p, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('failed to save fingerprints:', err);
    return false;
  }
}

ipcMain.handle('fp:list', async () => {
  if (!isAuthed()) return { ok: false, error: 'Not signed in.', code: 401 };
  const list = fpLoad() || [];
  return { ok: true, data: list };
});

ipcMain.handle('fp:enroll', async (_e, { employeeId, fingerIndex, template, quality }) => {
  if (!isAuthed()) return { ok: false, error: 'Not signed in.', code: 401 };
  if (!employeeId || !template) return { ok: false, error: 'employeeId and template are required.' };
  const idx = fingerIndex == null ? 0 : fingerIndex;
  const list = fpLoad() || [];
  const rec = {
    employee_id: employeeId,
    finger_index: idx,
    template,
    quality: quality || 0,
    created_at: new Date().toISOString(),
  };
  const at = list.findIndex((t) => t.employee_id === employeeId && t.finger_index === idx);
  if (at >= 0) list[at] = rec; else list.push(rec);
  if (!fpSave(list)) return { ok: false, error: 'Could not write local fingerprint store.' };
  return { ok: true, data: { saved: true } };
});

ipcMain.handle('fp:delete', async (_e, { employeeId, fingerIndex }) => {
  if (!isAuthed()) return { ok: false, error: 'Not signed in.', code: 401 };
  const list = fpLoad() || [];
  const before = list.length;
  const kept = list.filter((t) =>
    t.employee_id !== employeeId || (fingerIndex != null && t.finger_index !== fingerIndex));
  if (!fpSave(kept)) return { ok: false, error: 'Could not write local fingerprint store.' };
  return { ok: true, data: { deleted: before - kept.length } };
});

// --- Face recognition templates (stored LOCALLY on the kiosk, ENCRYPTED) ---
//
// Same rule as fingerprints: embeddings never leave this machine, and each one
// is linked to an employee_id that does come from the ERP.
//
// Unlike the fingerprint store, this file is encrypted at rest. A kiosk's disk
// is an SD card anyone can walk off with, and a face embedding is biometric
// data under the Data Privacy Act — sensitive personal information, and no more
// revocable than a fingerprint. Electron's safeStorage binds the key to the OS
// keyring, so a lifted card yields ciphertext rather than a roster of faces.
//
// Caveat worth knowing on a headless kiosk: safeStorage needs an unlocked
// keyring backend. Where none is available Electron falls back to a weak
// "basic_text" scheme, which is barely better than plaintext — faceStoreHealth()
// reports which is in force so setup can verify it rather than assume.

function faceStorePath() {
  if (!session.companyId) return null;
  const safe = String(session.companyId).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(app.getPath('userData'), `faces-${safe}.enc`);
}

// faceStoreHealth reports whether real OS-backed encryption is available.
// Surfaced to the UI so a misconfigured kiosk is visible during setup instead
// of silently storing biometrics under a weak fallback.
function faceStoreHealth() {
  const available = safeStorage.isEncryptionAvailable();
  let backend = 'unknown';
  try {
    // Linux-only API; absent elsewhere, where the platform keychain is used.
    backend = typeof safeStorage.getSelectedStorageBackend === 'function'
      ? safeStorage.getSelectedStorageBackend()
      : process.platform;
  } catch { /* leave as unknown */ }

  const weak = !available || backend === 'basic_text';
  return {
    available,
    backend,
    weak,
    message: weak
      ? 'Face templates are NOT protected by the OS keyring on this machine. '
        + 'Enable a keyring (gnome-keyring / kwallet) before enrolling anyone.'
      : null,
  };
}

function faceLoad() {
  const p = faceStorePath();
  if (!p) return null;
  try {
    const blob = fs.readFileSync(p);
    if (!blob.length) return [];
    const json = safeStorage.decryptString(blob);
    const list = JSON.parse(json);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    // A store that cannot be decrypted must NOT silently become an empty one:
    // that would look like "nobody is enrolled" and quietly re-enroll everyone
    // against a fresh key, leaving the original ciphertext orphaned on disk.
    console.error('face store is unreadable:', err);
    return null;
  }
}

function faceSave(list) {
  const p = faceStorePath();
  if (!p) return false;
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('refusing to write face templates: no encryption available');
    return false;
  }
  try {
    const blob = safeStorage.encryptString(JSON.stringify(list));
    // 0600: even before encryption, the file should not be world-readable.
    fs.writeFileSync(p, blob, { mode: 0o600 });
    return true;
  } catch (err) {
    console.error('failed to save face templates:', err);
    return false;
  }
}

ipcMain.handle('face:health', async () => ({ ok: true, data: faceStoreHealth() }));

ipcMain.handle('face:list', async () => {
  if (!isAuthed()) return { ok: false, error: 'Not signed in.', code: 401 };
  const list = faceLoad();
  if (list === null) {
    return { ok: false, error: 'The local face store could not be decrypted on this machine.' };
  }
  return { ok: true, data: list };
});

ipcMain.handle('face:enroll', async (_e, { employeeId, embedding, quality }) => {
  if (!isAuthed()) return { ok: false, error: 'Not signed in.', code: 401 };
  if (!employeeId || !embedding) {
    return { ok: false, error: 'employeeId and embedding are required.' };
  }
  const health = faceStoreHealth();
  if (health.weak) {
    // Refuse rather than warn. Enrolling biometrics onto a kiosk that cannot
    // protect them is the one outcome there is no way to walk back.
    return { ok: false, error: health.message };
  }

  const list = faceLoad();
  if (list === null) {
    return { ok: false, error: 'The local face store could not be decrypted; enrollment aborted.' };
  }

  const rec = {
    employee_id: employeeId,
    embedding,
    quality: quality || 0,
    created_at: new Date().toISOString(),
  };
  // One face per employee: unlike fingers, there is only one to enroll, so a
  // re-enroll replaces rather than accumulating stale templates that widen the
  // match surface over time.
  const at = list.findIndex((t) => t.employee_id === employeeId);
  if (at >= 0) list[at] = rec; else list.push(rec);

  if (!faceSave(list)) return { ok: false, error: 'Could not write the local face store.' };
  return { ok: true, data: { saved: true } };
});

ipcMain.handle('face:delete', async (_e, { employeeId }) => {
  if (!isAuthed()) return { ok: false, error: 'Not signed in.', code: 401 };
  const list = faceLoad();
  if (list === null) {
    return { ok: false, error: 'The local face store could not be decrypted.' };
  }
  const before = list.length;
  const kept = list.filter((t) => t.employee_id !== employeeId);
  if (!faceSave(kept)) return { ok: false, error: 'Could not write the local face store.' };
  return { ok: true, data: { deleted: before - kept.length } };
});

function localDateString() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 820,
    minHeight: 600,
    backgroundColor: '#0f172a',
    title: 'LetterSheets Time Clock',
    show: false,           // reveal only once maximized, to avoid a flash
    frame: false,          // kiosk: no OS title bar / window controls
    maximizable: true,
    minimizable: false,    // kiosk: no minimize
    closable: false,       // kiosk: no close
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Kiosk: keep the window maximized at all times. Maximize before showing, and
  // re-maximize if the OS/user ever un-maximizes or restores from minimize.
  win.maximize();
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('unmaximize', () => setImmediate(() => win.maximize()));
  win.on('restore', () => win.maximize());

  // Block any close attempt (Alt+F4, Cmd+W, menu) unless an admin unlocked it.
  win.on('close', (e) => { if (!allowQuit) e.preventDefault(); });

  // Swallow quit/close/minimize keyboard shortcuts before the page sees them.
  // Exit is only possible via the ESC → admin-login flow (see app:quit below).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const key = (input.key || '').toLowerCase();
    const mod = input.control || input.meta; // Ctrl (Win/Linux) or Cmd (macOS)

    const blocked =
      (mod && (key === 'q' || key === 'w' || key === 'm')) || // quit / close / minimize
      (input.alt && key === 'f4') ||                          // Windows close
      (mod && input.shift && key === 'q');                    // logout-style quit

    if (blocked) e.preventDefault();
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

// Block app-level quit (e.g. macOS Cmd+Q, Dock → Quit) unless admin-unlocked.
app.on('before-quit', (e) => { if (!allowQuit) e.preventDefault(); });

app.whenReady().then(() => {
  // Remove the application menu so its accelerators (Cmd+Q, Cmd+W, …) don't exist.
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
