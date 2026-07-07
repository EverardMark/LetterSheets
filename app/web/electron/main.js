import { app, BrowserWindow, session, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";
const DEV_ORIGIN = "http://localhost:5173";

// Content-Security-Policy applied to every response. script-src is locked to
// 'self' (no inline/remote scripts — the primary XSS mitigation). Styles/fonts
// stay permissive so the existing web-font CDNs keep working; connect-src allows
// reaching the backend API. Tighten connect-src to your API origin, and
// self-host fonts, to close the residual exfiltration surface.
const CSP = isDev
  ? // Dev must permit Vite's HMR (inline + eval scripts, ws) — relaxed on purpose.
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:5173 ws://localhost:5173 http://localhost:8080"
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

  if (isDev) {
    win.loadURL(DEV_ORIGIN);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
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
