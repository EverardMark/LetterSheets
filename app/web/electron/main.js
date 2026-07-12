import { app, BrowserWindow, session, shell, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

// macOS can't auto-INSTALL an unsigned app (Squirrel.Mac verifies the code
// signature), so on Mac we fall back to downloading the .dmg for a manual
// install instead of quitAndInstall. Flip to false once the mac build is
// signed + notarized to get true in-app auto-update on Mac too.
const MAC_MANUAL = process.platform === "darwin";
let pendingDownloadURL = null; // the .dmg URL to open on Mac (set on update-available)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";
const DEV_ORIGIN = "http://localhost:5173";

// The single main window — used to push auto-update status to the renderer.
let mainWindow = null;

// Content-Security-Policy applied to every response. script-src is locked to
// 'self' (no inline/remote scripts — the primary XSS mitigation). Styles/fonts
// stay permissive so the existing web-font CDNs keep working; connect-src allows
// reaching the backend API. Tighten connect-src to your API origin, and
// self-host fonts, to close the residual exfiltration surface.
const CSP = isDev
  ? // Dev must permit Vite's HMR (inline + eval scripts, ws) and reaching whichever
    // backend the DEV_MODE switch points at (local OR remote) — relaxed on purpose.
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:5173 ws://localhost:5173; " +
    "connect-src 'self' http: https: ws: wss:"
  : "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; " +
    "style-src 'self' 'unsafe-inline' https:; font-src 'self' https: data:; " +
    "img-src 'self' data: https:; connect-src 'self' https: http:";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "LetterSheets",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow = win;
  win.on("closed", () => { mainWindow = null; });

  if (isDev) {
    win.loadURL(DEV_ORIGIN);
    // DevTools prints noisy internal errors (Autofill.*, remote-frontend fetch
    // failures). Keep it closed by default; open with OPEN_DEVTOOLS=1 when needed.
    if (process.env.OPEN_DEVTOOLS === "1") win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Silently check for updates once the UI is ready (packaged builds only).
  // The renderer's Update button reflects whatever status arrives.
  win.webContents.once("did-finish-load", () => {
    if (app.isPackaged) autoUpdater.checkForUpdates().catch(() => {});
  });
}

// ── Auto-update (electron-updater) ─────────────────────────────────────────
// Downloads are user-initiated (autoDownload=false) so the header button drives
// the flow: check → download → restart-to-install. All status is forwarded to
// the renderer over the "updater:status" channel. Note: macOS auto-install
// requires a signed + notarized build (build.mac.identity is currently null),
// so on unsigned Mac builds the download works but quitAndInstall won't apply.
function sendUpdaterStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", payload);
  }
}

// Read the update-feed base URL from the bundled app-update.yml (generated from
// build.publish), so the Mac fallback can build the full .dmg download URL
// without hardcoding it.
function feedBaseURL() {
  try {
    const txt = fs.readFileSync(path.join(process.resourcesPath, "app-update.yml"), "utf8");
    const m = txt.match(/^url:\s*(.+)$/m);
    if (!m) return null;
    let u = m[1].trim().replace(/['"]/g, "");
    if (!u.endsWith("/")) u += "/";
    return u;
  } catch { return null; }
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => sendUpdaterStatus({ state: "checking" }));
  autoUpdater.on("update-available", (info) => {
    if (MAC_MANUAL) {
      // Unsigned Mac: can't auto-install → prepare the .dmg for a manual download.
      const dmg = (info?.files || []).find(f => (f.url || "").toLowerCase().endsWith(".dmg"));
      const base = feedBaseURL();
      pendingDownloadURL = (base && dmg?.url) ? base + dmg.url : null;
      sendUpdaterStatus({ state: "available", version: info?.version, manual: true });
    } else {
      sendUpdaterStatus({ state: "available", version: info?.version });
    }
  });
  autoUpdater.on("update-not-available", () => sendUpdaterStatus({ state: "not-available" }));
  autoUpdater.on("download-progress", (p) => sendUpdaterStatus({ state: "downloading", percent: Math.round(p?.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => sendUpdaterStatus({ state: "downloaded", version: info?.version }));
  autoUpdater.on("error", (err) => sendUpdaterStatus({ state: "error", message: String(err?.message || err) }));

  // check → returns immediately; results arrive via the events above.
  ipcMain.handle("updater:check", () => {
    if (!app.isPackaged) return { state: "dev" };
    autoUpdater.checkForUpdates().catch((err) => sendUpdaterStatus({ state: "error", message: String(err?.message || err) }));
    return { state: "checking" };
  });
  ipcMain.handle("updater:download", () => {
    if (!app.isPackaged) return { state: "dev" };
    autoUpdater.downloadUpdate().catch((err) => sendUpdaterStatus({ state: "error", message: String(err?.message || err) }));
    return { state: "downloading" };
  });
  ipcMain.handle("updater:install", () => {
    if (app.isPackaged) autoUpdater.quitAndInstall();
  });
  // Mac fallback: open the .dmg download in the default browser for a manual install.
  ipcMain.handle("updater:open-download", () => {
    if (pendingDownloadURL) { shell.openExternal(pendingDownloadURL); return { opened: true }; }
    return { opened: false };
  });
  ipcMain.handle("updater:getVersion", () => ({ version: app.getVersion(), packaged: app.isPackaged }));
}

app.whenReady().then(() => {
  // Enforce the CSP on every response.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [CSP],
      },
    });
  });

  // Deny device permission requests (camera, geolocation, notifications, …).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  setupAutoUpdater();
  createWindow();
});

// Block in-app navigation to foreign origins and route window.open to the OS browser.
app.on("web-contents-created", (_e, contents) => {
  const allowedPrefix = isDev ? DEV_ORIGIN : "file://";
  contents.on("will-navigate", (e, url) => {
    if (!url.startsWith(allowedPrefix)) e.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
