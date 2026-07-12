// Preload script (CommonJS — required for sandbox:true).
// Add electron ↔ renderer bridge APIs here via contextBridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isElectron: true,
});

// Auto-update bridge — the header Update button uses this. All methods return
// promises; onStatus subscribes to push events and returns an unsubscribe fn.
contextBridge.exposeInMainWorld("updater", {
  check: () => ipcRenderer.invoke("updater:check"),
  download: () => ipcRenderer.invoke("updater:download"),
  install: () => ipcRenderer.invoke("updater:install"),
  openDownload: () => ipcRenderer.invoke("updater:open-download"),
  getVersion: () => ipcRenderer.invoke("updater:getVersion"),
  onStatus: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },
});
