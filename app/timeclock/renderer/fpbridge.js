'use strict';

/**
 * FpBridge — client for the local DigitalPersona reader helper ("fpbridge").
 *
 * The reader can only be driven by a native helper running on the kiosk
 * (Windows). That helper exposes a WebSocket on ws://127.0.0.1:52100 and speaks
 * the small JSON protocol below. This app is OS-independent: if the helper is
 * not running (e.g. on a dev Mac), the bridge simply reports "not connected"
 * and the UI falls back to name-tap.
 *
 * app → helper:
 *   { cmd: "status" }
 *   { cmd: "load", templates: [{ employeeId, fingerIndex, fmd }] }   // fmd = base64
 *   { cmd: "identify" }                                              // begin 1:N loop
 *   { cmd: "enroll", employeeId, fingerIndex }                       // begin 4-scan enroll
 *   { cmd: "cancel" }
 *
 * helper → app (events dispatched by type):
 *   { type: "status", ready, reader, loaded }
 *   { type: "capture", quality }
 *   { type: "enrollProgress", captured, needed }
 *   { type: "enrollComplete", employeeId, fingerIndex, fmd, quality }
 *   { type: "identify", matched, employeeId?, score? }
 *   { type: "error", message }
 *   { type: "canceled" }
 */

const BRIDGE_URL = 'ws://127.0.0.1:52100';

class FpBridge extends EventTarget {
  constructor(url = BRIDGE_URL) {
    super();
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.ready = false;      // reader present + initialized
    this.reader = null;
    this.loaded = 0;
    this._retry = null;
    this._wantOpen = false;
  }

  // Begin connecting and keep retrying while wanted. Safe to call repeatedly.
  start() {
    this._wantOpen = true;
    this._connect();
  }

  stop() {
    this._wantOpen = false;
    clearTimeout(this._retry);
    if (this.ws) { try { this.ws.close(); } catch {} }
    this.ws = null;
  }

  _connect() {
    if (!this._wantOpen) return;
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      return this._scheduleRetry();
    }
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this._emit('connection', { connected: true });
      this.send({ cmd: 'status' });
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'status') {
        this.ready = !!msg.ready;
        this.reader = msg.reader || null;
        this.loaded = msg.loaded || 0;
      }
      this._emit(msg.type, msg);
    };

    ws.onclose = () => {
      this.connected = false;
      this.ready = false;
      this._emit('connection', { connected: false });
      this._scheduleRetry();
    };

    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  _scheduleRetry() {
    if (!this._wantOpen) return;
    clearTimeout(this._retry);
    this._retry = setTimeout(() => this._connect(), 2500);
  }

  send(obj) {
    if (this.ws && this.connected) {
      try { this.ws.send(JSON.stringify(obj)); return true; } catch {}
    }
    return false;
  }

  // Convenience commands
  requestStatus() { return this.send({ cmd: 'status' }); }
  loadTemplates(templates) { return this.send({ cmd: 'load', templates }); }
  identify() { return this.send({ cmd: 'identify' }); }
  enroll(employeeId, fingerIndex) { return this.send({ cmd: 'enroll', employeeId, fingerIndex }); }
  cancel() { return this.send({ cmd: 'cancel' }); }

  on(type, cb) { this.addEventListener(type, (e) => cb(e.detail)); }
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

window.FpBridge = FpBridge;
