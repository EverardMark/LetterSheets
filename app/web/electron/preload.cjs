// Preload script (CommonJS — required for sandbox:true).
// Add electron ↔ renderer bridge APIs here via contextBridge.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isElectron: true,
});
