'use strict';

/**
 * FaceBridge — client for the local face-recognition helper ("facebridge").
 *
 * Same shape as FpBridge, one port along. The camera can only be driven by a
 * native helper on the kiosk; that helper exposes a WebSocket on
 * ws://127.0.0.1:52101 and speaks the JSON protocol below. This app stays
 * OS-independent: if the helper is not running (a dev Mac, a kiosk with no
 * camera) the bridge reports "not connected" and the UI falls back to name-tap.
 *
 * Two differences from FpBridge, both from what a camera is:
 *
 *   - `frame` events stream while an operation runs, so the UI can tell someone
 *     to step closer or move out of a second person's shot. A fingerprint
 *     reader has nothing to say until a finger lands.
 *   - `identify` carries a `reason` when it fails. "Face not recognised" and
 *     "that looks like a photograph" need different words in front of an
 *     employee, and one of them needs a supervisor.
 *
 * app -> helper:
 *   { cmd: "status" }
 *   { cmd: "load", templates: [{ employeeId, embedding }] }   // embedding = base64
 *   { cmd: "identify" }
 *   { cmd: "enroll", employeeId }
 *   { cmd: "cancel" }
 *
 * helper -> app (events dispatched by type):
 *   { type: "status", ready, camera, loaded, liveness, error }
 *   { type: "frame", faces, quality }
 *   { type: "enrollProgress", captured, needed }
 *   { type: "enrollComplete", employeeId, embedding, quality }
 *   { type: "identify", matched, employeeId?, score?, reason? }
 *   { type: "error", message }
 *   { type: "canceled" }
 */

const FACE_BRIDGE_URL = 'ws://127.0.0.1:52101';

class FaceBridge extends EventTarget {
  constructor(url = FACE_BRIDGE_URL) {
    super();
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.ready = false;       // camera present + models loaded
    this.camera = null;
    this.loaded = 0;
    // liveness reports whether the anti-spoof model is installed. When it is
    // not, the helper refuses to identify at all — so the UI should say face
    // sign-in is unavailable rather than leaving someone waiting at a camera
    // that will never resolve.
    this.liveness = false;
    this.lastError = null;
    this._retry = null;
    this._wantOpen = false;
  }

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
        this.camera = msg.camera || null;
        this.loaded = msg.loaded || 0;
        this.liveness = !!msg.liveness;
        this.lastError = msg.error || null;
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
  enroll(employeeId) { return this.send({ cmd: 'enroll', employeeId }); }
  cancel() { return this.send({ cmd: 'cancel' }); }

  /**
   * Whether face sign-in can actually be offered right now. The helper being
   * connected is not enough — without the anti-spoof model it will refuse every
   * identify, so offering the option would be a dead end.
   */
  usable() { return this.connected && this.ready && this.liveness; }

  on(type, cb) { this.addEventListener(type, (e) => cb(e.detail)); }
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

window.FaceBridge = FaceBridge;
