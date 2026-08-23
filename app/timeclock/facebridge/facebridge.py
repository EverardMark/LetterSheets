#!/usr/bin/env python3
"""facebridge — local face-recognition helper for the LetterSheets Time Clock.

Mirrors fpbridge: a native helper on the kiosk that owns the hardware and speaks
a small JSON protocol over a loopback WebSocket, so the Electron app stays
OS-independent and never touches the camera itself. If this helper is not
running, the app reports "No camera" and falls back to name-tap, exactly as it
does when no fingerprint reader is attached.

Why Python rather than C like fpbridge-linux: the work here is ONNX inference,
not USB I/O. onnxruntime and InsightFace have real aarch64 wheels, which is
precisely what the U.are.U path lacks — so face recognition can ship on the Pi
while fingerprint is still blocked on a vendor SDK. PyInstaller collapses this
into a single binary, so the kiosk keeps its "runtime artifacts only" rule.

Protocol (app -> helper):
    {"cmd": "status"}
    {"cmd": "load",     "templates": [{"employeeId": str, "embedding": b64}]}
    {"cmd": "identify"}
    {"cmd": "enroll",   "employeeId": str}
    {"cmd": "cancel"}

Protocol (helper -> app):
    {"type": "status",         "ready": bool, "camera": str|None, "loaded": int,
                               "liveness": bool}
    {"type": "frame",          "faces": int, "quality": float}
    {"type": "enrollProgress", "captured": int, "needed": int}
    {"type": "enrollComplete", "employeeId": str, "embedding": b64, "quality": float}
    {"type": "identify",       "matched": bool, "employeeId": str|None,
                               "score": float, "reason": str|None}
    {"type": "error",          "message": str}
    {"type": "canceled"}

Biometric data never leaves this machine. Embeddings are held in memory here and
persisted by the Electron main process, encrypted at rest.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import signal
import sys
import time
from dataclasses import dataclass, field
from typing import Any, Iterable

import numpy as np

LOG = logging.getLogger("facebridge")

HOST = os.environ.get("FACEBRIDGE_HOST", "127.0.0.1")
PORT = int(os.environ.get("FACEBRIDGE_PORT", "52101"))
CAMERA_INDEX = int(os.environ.get("FACEBRIDGE_CAMERA", "0"))

# Model pack. buffalo_s is the right default on a Pi: buffalo_l is more accurate
# but roughly 3x the inference cost, and at a time clock the person is standing
# still a foot from the lens under fixed lighting — the easy case for detection.
MODEL_PACK = os.environ.get("FACEBRIDGE_MODEL", "buffalo_s")

# Detection input size. 320 is ample for a kiosk at arm's length and about four
# times cheaper than 640.
DET_SIZE = int(os.environ.get("FACEBRIDGE_DET_SIZE", "320"))

# --- Matching thresholds ---------------------------------------------------
#
# ArcFace embeddings are L2-normalised, so the score is a cosine similarity in
# [-1, 1]. Same person typically lands 0.5-0.9, different people -0.1-0.3.
#
# MATCH_THRESHOLD is deliberately higher than the 0.4 usually quoted for 1:1
# verification. This is 1:N identification: every enrolled employee is a chance
# to false-accept, so the error rate compounds with headcount. A threshold tuned
# for one comparison is wrong for two hundred.
MATCH_THRESHOLD = float(os.environ.get("FACEBRIDGE_MATCH_THRESHOLD", "0.50"))

# The runner-up must be this far behind the winner. Without it, identical twins
# and siblings — common enough in a family business — resolve to whichever
# scored a hair higher. Ambiguity should clock nobody in.
MATCH_MARGIN = float(os.environ.get("FACEBRIDGE_MATCH_MARGIN", "0.06"))

# --- Liveness --------------------------------------------------------------
#
# A face matcher without liveness is defeated by a photo held up on a phone. At
# a time clock that IS buddy punching — the exact fraud the biometric is there
# to prevent — so this is load-bearing, not hardening.
#
# Two independent gates, both of which must pass:
#   1. A passive anti-spoof model (MiniFASNet) scoring print/replay attacks.
#   2. A temporal check: a real face is never pixel-identical across frames.
#      A photo or a still on a screen is. This costs nothing and catches the
#      lazy attack even if the model is unsure.
LIVENESS_THRESHOLD = float(os.environ.get("FACEBRIDGE_LIVENESS_THRESHOLD", "0.65"))
LIVENESS_FRAMES = int(os.environ.get("FACEBRIDGE_LIVENESS_FRAMES", "5"))

# Below this, consecutive crops are too similar to be a living subject.
STATIC_FRAME_CORRELATION = float(os.environ.get("FACEBRIDGE_STATIC_CORR", "0.995"))

# Turning liveness off is supported for bench testing only and shouts about it.
# Defaulting to "off when the model is missing" would ship every kiosk in the
# insecure configuration, which is how this class of feature usually fails.
LIVENESS_REQUIRED = os.environ.get("FACEBRIDGE_LIVENESS", "1") != "0"

ENROLL_SAMPLES = int(os.environ.get("FACEBRIDGE_ENROLL_SAMPLES", "5"))
MIN_FACE_PIXELS = int(os.environ.get("FACEBRIDGE_MIN_FACE", "80"))
IDENTIFY_TIMEOUT = float(os.environ.get("FACEBRIDGE_IDENTIFY_TIMEOUT", "12"))


def b64e(arr: np.ndarray) -> str:
    """Encode an embedding as base64 float32, matching the fmd field's shape."""
    return base64.b64encode(arr.astype(np.float32).tobytes()).decode("ascii")


def b64d(s: str) -> np.ndarray:
    return np.frombuffer(base64.b64decode(s), dtype=np.float32)


def normalise(v: np.ndarray) -> np.ndarray:
    """L2-normalise so a dot product is a cosine similarity."""
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


@dataclass
class Template:
    employee_id: str
    embedding: np.ndarray


@dataclass
class Detection:
    """One detected face in one frame."""
    embedding: np.ndarray
    crop: np.ndarray
    quality: float
    bbox: tuple[int, int, int, int]


class FaceEngine:
    """Wraps detection, embedding and anti-spoofing.

    Models are loaded lazily on first use rather than at import: a kiosk with no
    camera attached should still start, report "not ready", and let the app fall
    back to name-tap — the same behaviour fpbridge has with no reader.
    """

    def __init__(self) -> None:
        self._app: Any = None
        self._spoof: Any = None
        self._camera_name: str | None = None
        self._load_error: str | None = None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def ready(self) -> bool:
        return self._app is not None

    def liveness_available(self) -> bool:
        return self._spoof is not None

    def load(self) -> bool:
        if self._app is not None:
            return True
        try:
            from insightface.app import FaceAnalysis

            app = FaceAnalysis(
                name=MODEL_PACK,
                # CPU only: the Pi has no CUDA, and naming the provider
                # explicitly stops onnxruntime logging a warning per frame.
                providers=["CPUExecutionProvider"],
                allowed_modules=["detection", "recognition"],
            )
            app.prepare(ctx_id=-1, det_size=(DET_SIZE, DET_SIZE))
            self._app = app
            LOG.info("loaded %s at det_size=%d", MODEL_PACK, DET_SIZE)
        except Exception as exc:  # noqa: BLE001 - reported to the app verbatim
            self._load_error = f"could not load face models: {exc}"
            LOG.error("%s", self._load_error)
            return False

        self._load_spoof_model()
        return True

    def _load_spoof_model(self) -> None:
        """Load the passive anti-spoof model, if present.

        Absence is not fatal here, but IdentifySession refuses to run without it
        unless liveness has been explicitly disabled — the check belongs at the
        point of use, so a missing model cannot quietly degrade into an insecure
        kiosk.
        """
        path = os.environ.get("FACEBRIDGE_SPOOF_MODEL", "")
        if not path:
            path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "antispoof.onnx")
        if not os.path.exists(path):
            LOG.warning("anti-spoof model not found at %s", path)
            return
        try:
            import onnxruntime as ort

            self._spoof = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
            LOG.info("loaded anti-spoof model from %s", path)
        except Exception as exc:  # noqa: BLE001
            LOG.error("could not load anti-spoof model: %s", exc)

    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Detect and embed every face in a frame, largest first."""
        if self._app is None:
            return []
        faces = self._app.get(frame)
        out: list[Detection] = []

        for f in faces:
            x1, y1, x2, y2 = (int(v) for v in f.bbox)
            w, h = x2 - x1, y2 - y1
            if w < MIN_FACE_PIXELS or h < MIN_FACE_PIXELS:
                # Too far from the camera to embed reliably. Skipping is better
                # than a low-confidence match against a whole roster.
                continue

            crop = frame[max(y1, 0):y2, max(x1, 0):x2]
            if crop.size == 0:
                continue

            emb = getattr(f, "normed_embedding", None)
            if emb is None:
                emb = normalise(np.asarray(f.embedding, dtype=np.float32))

            out.append(Detection(
                embedding=np.asarray(emb, dtype=np.float32),
                crop=crop,
                quality=float(getattr(f, "det_score", 0.0)),
                bbox=(x1, y1, w, h),
            ))

        out.sort(key=lambda d: d.bbox[2] * d.bbox[3], reverse=True)
        return out

    def spoof_score(self, crop: np.ndarray) -> float | None:
        """Return P(real) for a face crop, or None if no model is loaded."""
        if self._spoof is None:
            return None
        try:
            import cv2

            inp = cv2.resize(crop, (80, 80)).astype(np.float32)
            inp = np.transpose(inp, (2, 0, 1))[None] / 255.0
            name = self._spoof.get_inputs()[0].name
            logits = np.asarray(self._spoof.run(None, {name: inp})[0]).ravel()

            e = np.exp(logits - logits.max())
            probs = e / e.sum()
            # MiniFASNet emits three classes: [spoof/print, real, spoof/replay].
            return float(probs[1]) if probs.size >= 2 else float(probs[0])
        except Exception as exc:  # noqa: BLE001
            LOG.error("anti-spoof inference failed: %s", exc)
            return None


class Camera:
    """V4L2 capture, opened on demand and released the moment it is idle.

    Holding the device open between operations would block every other process
    on the Pi from using it, and a time clock is idle almost all of the time.
    """

    def __init__(self, index: int = CAMERA_INDEX) -> None:
        self.index = index
        self._cap: Any = None

    def open(self) -> bool:
        if self._cap is not None:
            return True
        try:
            import cv2

            cap = cv2.VideoCapture(self.index, cv2.CAP_V4L2)
            if not cap.isOpened():
                cap.release()
                return False
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            # A one-frame buffer keeps identification working on the face in
            # front of the camera now, not one queued several frames ago.
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self._cap = cap
            return True
        except Exception as exc:  # noqa: BLE001
            LOG.error("camera open failed: %s", exc)
            return False

    def read(self) -> np.ndarray | None:
        if self._cap is None:
            return None
        ok, frame = self._cap.read()
        return frame if ok else None

    def close(self) -> None:
        if self._cap is not None:
            try:
                self._cap.release()
            except Exception:  # noqa: BLE001
                pass
            self._cap = None

    def present(self) -> bool:
        """Probe for a camera without holding it.

        fpbridge's equivalent check runs once at startup and is never repeated,
        so a boot race or a replug leaves it permanently reporting "no reader".
        This probes per call for exactly that reason.
        """
        if self._cap is not None:
            return True
        if not self.open():
            return False
        self.close()
        return True


def _grey_thumb(img: np.ndarray, size: int = 64) -> np.ndarray:
    """Nearest-neighbour downscale to a square greyscale thumbnail.

    Deliberately numpy-only. This feeds a liveness decision, so it should be
    testable on any machine — including CI and a dev laptop with no OpenCV — and
    nearest-neighbour is entirely adequate for a correlation statistic.
    """
    if img.ndim == 3:
        img = img.mean(axis=2)
    h, w = img.shape[:2]
    if h == 0 or w == 0:
        return np.zeros((size, size), dtype=np.float32)
    ys = (np.arange(size) * h // size).clip(0, h - 1)
    xs = (np.arange(size) * w // size).clip(0, w - 1)
    return img[np.ix_(ys, xs)].astype(np.float32)


def crop_correlation(a: np.ndarray, b: np.ndarray) -> float:
    """Correlation between two face crops, resized to a common small size.

    A living face varies frame to frame — micro-movement, blinks, lighting
    noise. A printed photo or a still on a screen does not. Near-1.0 here means
    the "face" is not moving at all, which no real person manages.
    """
    ga = _grey_thumb(a).ravel()
    gb = _grey_thumb(b).ravel()

    ga = ga - ga.mean()
    gb = gb - gb.mean()
    denom = float(np.linalg.norm(ga) * np.linalg.norm(gb))
    if denom == 0:
        # Two flat images correlate with nothing, but a flat face crop is not a
        # living one either. Treating it as static is the safe reading.
        return 1.0
    return float(np.dot(ga, gb) / denom)


@dataclass
class LivenessGate:
    """Accumulates evidence across frames that the subject is a live person."""

    engine: FaceEngine
    frames_needed: int = LIVENESS_FRAMES
    scores: list[float] = field(default_factory=list)
    _prev_crop: np.ndarray | None = None
    _motion_seen: bool = False

    def reset(self) -> None:
        self.scores.clear()
        self._prev_crop = None
        self._motion_seen = False

    def observe(self, det: Detection) -> None:
        score = self.engine.spoof_score(det.crop)
        if score is not None:
            self.scores.append(score)

        if self._prev_crop is not None:
            if crop_correlation(self._prev_crop, det.crop) < STATIC_FRAME_CORRELATION:
                self._motion_seen = True
        self._prev_crop = det.crop

    def verdict(self) -> tuple[bool, str]:
        """Return (passed, reason). Reason is user-facing on failure."""
        if not LIVENESS_REQUIRED:
            return True, "liveness disabled"

        if not self.engine.liveness_available():
            # Refusing is the point. A kiosk that silently drops to matching
            # without liveness is worse than one that says it cannot.
            return False, "liveness model not installed"

        if len(self.scores) < self.frames_needed:
            return False, "not enough frames"

        # Median, not mean: one bad frame during a blink should not sink a real
        # person, and one lucky frame should not carry a photo.
        median = float(np.median(self.scores))
        if median < LIVENESS_THRESHOLD:
            return False, "possible photo or screen"

        if not self._motion_seen:
            return False, "no movement detected — hold the camera on a real face"

        return True, "ok"


class Matcher:
    """1:N cosine matching against the loaded templates."""

    def __init__(self) -> None:
        self.templates: list[Template] = []
        self._matrix: np.ndarray | None = None

    def load(self, items: Iterable[dict]) -> int:
        self.templates = []
        for it in items:
            emp = it.get("employeeId")
            raw = it.get("embedding")
            if not emp or not raw:
                continue
            try:
                self.templates.append(Template(str(emp), normalise(b64d(raw))))
            except Exception as exc:  # noqa: BLE001
                LOG.warning("skipping unreadable template for %s: %s", emp, exc)

        self._matrix = (
            np.stack([t.embedding for t in self.templates]) if self.templates else None
        )
        return len(self.templates)

    def identify(self, embedding: np.ndarray) -> tuple[str | None, float, str | None]:
        """Return (employee_id, score, reason_if_unmatched)."""
        if self._matrix is None or not self.templates:
            return None, 0.0, "nobody is enrolled on this kiosk"

        sims = self._matrix @ normalise(embedding)
        order = np.argsort(sims)[::-1]
        best = float(sims[order[0]])

        if best < MATCH_THRESHOLD:
            return None, best, "face not recognised"

        # 1:N ambiguity guard. Two people scoring nearly the same means the
        # system cannot tell them apart, and clocking in the wrong one is worse
        # than asking for a name tap.
        if len(order) > 1:
            second = float(sims[order[1]])
            if best - second < MATCH_MARGIN:
                return None, best, "could not tell two enrolled people apart"

        return self.templates[order[0]].employee_id, best, None


# ---------------------------------------------------------------------------
# Operations
# ---------------------------------------------------------------------------

class Bridge:
    """Owns the hardware and runs one operation at a time.

    Serialising operations is deliberate: identify and enroll both want the
    camera, and the failure mode of letting them overlap is an enrollment that
    silently captures the wrong person's face.
    """

    def __init__(self) -> None:
        self.engine = FaceEngine()
        self.camera = Camera()
        self.matcher = Matcher()
        self.clients: set[Any] = set()
        self._task: asyncio.Task | None = None

    # -- transport ----------------------------------------------------------

    async def send(self, msg: dict) -> None:
        if not self.clients:
            return
        payload = json.dumps(msg)
        for ws in list(self.clients):
            try:
                await ws.send(payload)
            except Exception:  # noqa: BLE001 - a dropped client is not an error
                self.clients.discard(ws)

    async def send_status(self) -> None:
        present = self.camera.present()
        await self.send({
            "type": "status",
            "ready": present and self.engine.ready(),
            "camera": f"/dev/video{self.camera.index}" if present else None,
            "loaded": len(self.matcher.templates),
            "liveness": self.engine.liveness_available(),
            "error": self.engine.load_error,
        })

    async def send_error(self, message: str) -> None:
        await self.send({"type": "error", "message": message})

    # -- lifecycle ----------------------------------------------------------

    async def cancel(self, notify: bool = True) -> None:
        task, self._task = self._task, None
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self.camera.close()
        if notify:
            await self.send({"type": "canceled"})

    async def start(self, coro) -> None:
        # A new operation supersedes whatever was running; the app only ever has
        # one screen active, so this matches what the user sees.
        await self.cancel(notify=False)
        self._task = asyncio.create_task(coro)

    def _prepare(self) -> str | None:
        """Ready the models and camera. Returns an error message, or None."""
        if not self.engine.load():
            return self.engine.load_error or "face models unavailable"
        if not self.camera.open():
            return "No camera detected."
        return None

    # -- identify -----------------------------------------------------------

    async def identify(self) -> None:
        err = self._prepare()
        if err:
            await self.send_error(err)
            return

        gate = LivenessGate(self.engine)
        gate.reset()

        # Refuse before touching the camera rather than after collecting frames:
        # the user should be told the kiosk is misconfigured, not left staring
        # at a lens that never resolves.
        if LIVENESS_REQUIRED and not self.engine.liveness_available():
            await self.send_error(
                "Liveness checking is not installed, so face sign-in is disabled. "
                "Install the anti-spoof model or use name-tap."
            )
            self.camera.close()
            return

        embeddings: list[np.ndarray] = []
        deadline = time.monotonic() + IDENTIFY_TIMEOUT

        try:
            while time.monotonic() < deadline:
                frame = self.camera.read()
                if frame is None:
                    await asyncio.sleep(0.05)
                    continue

                faces = self.engine.detect(frame)
                await self.send({
                    "type": "frame",
                    "faces": len(faces),
                    "quality": round(faces[0].quality, 3) if faces else 0.0,
                })

                if len(faces) != 1:
                    # Two faces at a clock terminal is someone standing behind
                    # the person clocking in. Waiting is correct: picking the
                    # largest would let a bystander be clocked in by accident.
                    gate.reset()
                    embeddings.clear()
                    await asyncio.sleep(0.08)
                    continue

                det = faces[0]
                gate.observe(det)
                embeddings.append(det.embedding)

                passed, reason = gate.verdict()
                if not passed:
                    if reason in ("not enough frames",):
                        await asyncio.sleep(0.08)
                        continue
                    await self.send({
                        "type": "identify", "matched": False,
                        "employeeId": None, "score": 0.0, "reason": reason,
                    })
                    return

                # Average across frames before matching: a single frame can be
                # caught mid-blink or mid-turn, and the mean embedding is
                # measurably more stable than any one of them.
                mean = normalise(np.mean(np.stack(embeddings[-LIVENESS_FRAMES:]), axis=0))
                emp, score, why = self.matcher.identify(mean)

                await self.send({
                    "type": "identify",
                    "matched": emp is not None,
                    "employeeId": emp,
                    "score": round(score, 4),
                    "reason": why,
                })
                return

            await self.send({
                "type": "identify", "matched": False, "employeeId": None,
                "score": 0.0, "reason": "timed out — no steady face in view",
            })
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            LOG.exception("identify failed")
            await self.send_error(f"Face identification failed: {exc}")
        finally:
            self.camera.close()

    # -- enroll -------------------------------------------------------------

    async def enroll(self, employee_id: str) -> None:
        err = self._prepare()
        if err:
            await self.send_error(err)
            return

        if LIVENESS_REQUIRED and not self.engine.liveness_available():
            await self.send_error("Liveness checking is not installed, so enrollment is disabled.")
            self.camera.close()
            return

        gate = LivenessGate(self.engine)
        gate.reset()

        samples: list[np.ndarray] = []
        deadline = time.monotonic() + IDENTIFY_TIMEOUT * 3

        try:
            await self.send({"type": "enrollProgress", "captured": 0, "needed": ENROLL_SAMPLES})

            while len(samples) < ENROLL_SAMPLES and time.monotonic() < deadline:
                frame = self.camera.read()
                if frame is None:
                    await asyncio.sleep(0.05)
                    continue

                faces = self.engine.detect(frame)
                if len(faces) != 1:
                    await asyncio.sleep(0.08)
                    continue

                det = faces[0]
                gate.observe(det)

                # Reject a sample too close to one already taken. Five copies of
                # one pose produce a template that only matches that pose, and
                # the employee is then unrecognisable on any normal morning.
                if samples and max(float(np.dot(det.embedding, s)) for s in samples) > 0.98:
                    await asyncio.sleep(0.15)
                    continue

                samples.append(normalise(det.embedding))
                await self.send({
                    "type": "enrollProgress",
                    "captured": len(samples),
                    "needed": ENROLL_SAMPLES,
                })
                await asyncio.sleep(0.25)

            if len(samples) < ENROLL_SAMPLES:
                await self.send_error(
                    f"Only captured {len(samples)} of {ENROLL_SAMPLES} samples. "
                    "Ask the employee to look at the camera and move slightly between shots."
                )
                return

            passed, reason = gate.verdict()
            if not passed:
                # Enrolling from a photo would permanently install a spoofable
                # template, so this gate matters more here than at identify.
                await self.send_error(f"Enrollment refused: {reason}.")
                return

            template = normalise(np.mean(np.stack(samples), axis=0))
            await self.send({
                "type": "enrollComplete",
                "employeeId": employee_id,
                "embedding": b64e(template),
                "quality": round(float(np.median([float(np.dot(template, s)) for s in samples])), 4),
            })
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            LOG.exception("enroll failed")
            await self.send_error(f"Enrollment failed: {exc}")
        finally:
            self.camera.close()

    # -- dispatch -----------------------------------------------------------

    async def handle(self, msg: dict) -> None:
        cmd = msg.get("cmd")

        if cmd == "status":
            await self.send_status()

        elif cmd == "load":
            await self.cancel(notify=False)
            n = self.matcher.load(msg.get("templates") or [])
            LOG.info("loaded %d templates", n)
            await self.send_status()

        elif cmd == "cancel":
            await self.cancel()

        elif cmd == "identify":
            await self.start(self.identify())

        elif cmd == "enroll":
            emp = msg.get("employeeId")
            if not emp:
                await self.send_error("employeeId is required to enroll.")
                return
            await self.start(self.enroll(str(emp)))

        else:
            await self.send_error(f"Unknown command: {cmd!r}")


async def serve() -> None:
    import websockets

    bridge = Bridge()

    async def handler(ws) -> None:
        bridge.clients.add(ws)
        LOG.info("client connected (%d total)", len(bridge.clients))
        try:
            await bridge.send_status()
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except (ValueError, TypeError):
                    continue
                if isinstance(msg, dict):
                    await bridge.handle(msg)
        except Exception:  # noqa: BLE001 - a client vanishing is routine
            pass
        finally:
            bridge.clients.discard(ws)
            LOG.info("client disconnected (%d left)", len(bridge.clients))
            if not bridge.clients:
                # Nothing is listening, so nothing should be holding the camera.
                await bridge.cancel(notify=False)

    stop = asyncio.get_running_loop().create_future()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            asyncio.get_running_loop().add_signal_handler(sig, lambda: stop.done() or stop.set_result(None))
        except NotImplementedError:
            pass

    # Bound to loopback only. These are biometric templates; the bridge must not
    # be reachable from the network under any configuration.
    async with websockets.serve(handler, HOST, PORT, ping_interval=20):
        LOG.info("facebridge listening on ws://%s:%d", HOST, PORT)
        if not LIVENESS_REQUIRED:
            LOG.warning("LIVENESS IS DISABLED — a photograph will pass. Bench testing only.")
        await stop

    await bridge.cancel(notify=False)
    LOG.info("facebridge stopped")


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("FACEBRIDGE_LOG", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    if "--selftest" in sys.argv:
        return selftest()
    try:
        asyncio.run(serve())
    except KeyboardInterrupt:
        pass
    return 0


def selftest() -> int:
    """Offline checks for the pure logic, mirroring fpbridge's --selftest.

    Everything here runs without a camera or a model, so it is usable on a dev
    machine and in CI.
    """
    failures = 0

    def check(cond: bool, label: str) -> None:
        nonlocal failures
        print(f"{'ok  ' if cond else 'FAIL'}  {label}")
        if not cond:
            failures += 1

    v = np.array([3.0, 4.0], dtype=np.float32)
    check(abs(float(np.linalg.norm(normalise(v))) - 1.0) < 1e-6, "normalise gives a unit vector")

    emb = normalise(np.random.RandomState(0).randn(512).astype(np.float32))
    check(np.allclose(b64d(b64e(emb)), emb, atol=1e-6), "embedding survives base64 round-trip")

    m = Matcher()
    alice = normalise(np.random.RandomState(1).randn(512).astype(np.float32))
    bob = normalise(np.random.RandomState(2).randn(512).astype(np.float32))
    m.load([
        {"employeeId": "alice", "embedding": b64e(alice)},
        {"employeeId": "bob", "embedding": b64e(bob)},
    ])
    check(len(m.templates) == 2, "matcher loads templates")

    emp, score, _ = m.identify(alice)
    check(emp == "alice" and score > 0.99, "exact embedding identifies its owner")

    emp, _, why = m.identify(normalise(np.random.RandomState(3).randn(512).astype(np.float32)))
    check(emp is None and why == "face not recognised", "a stranger is rejected")

    # Ambiguity guard: two near-identical templates must resolve to nobody.
    twin = normalise(alice + 0.01 * np.random.RandomState(4).randn(512).astype(np.float32))
    m.load([
        {"employeeId": "alice", "embedding": b64e(alice)},
        {"employeeId": "alice-twin", "embedding": b64e(twin)},
    ])
    emp, _, why = m.identify(alice)
    check(emp is None and why is not None and "apart" in why, "ambiguous match clocks nobody in")

    m.load([])
    emp, _, why = m.identify(alice)
    check(emp is None and why == "nobody is enrolled on this kiosk", "empty roster is handled")

    m.load([{"employeeId": "x"}, {"embedding": "zzz"}, {"employeeId": "y", "embedding": "!!!not-base64"}])
    check(len(m.templates) == 0, "malformed templates are skipped, not fatal")

    # Liveness must fail closed when no model is installed.
    engine = FaceEngine()
    gate = LivenessGate(engine)
    passed, reason = gate.verdict()
    check(not passed and "not installed" in reason, "liveness fails closed with no model")

    identical = np.full((64, 64, 3), 128, dtype=np.uint8)
    check(crop_correlation(identical, identical) >= STATIC_FRAME_CORRELATION,
          "identical crops read as static")

    rs = np.random.RandomState(7)
    face_a = rs.randint(0, 255, (96, 96, 3)).astype(np.uint8)
    face_b = np.clip(face_a.astype(np.int16) + rs.randint(-40, 40, face_a.shape), 0, 255).astype(np.uint8)
    check(crop_correlation(face_a, face_a) > crop_correlation(face_a, face_b),
          "a moving face correlates less than a frozen one")

    # A stub engine exercises the gate's decisions without a model or a camera.
    class StubEngine:
        def __init__(self, score: float, available: bool = True) -> None:
            self.score, self.available = score, available

        def liveness_available(self) -> bool:
            return self.available

        def spoof_score(self, _crop):
            return self.score if self.available else None

    def det(crop: np.ndarray) -> Detection:
        return Detection(embedding=alice, crop=crop, quality=0.9, bbox=(0, 0, 96, 96))

    # A live subject: confident anti-spoof scores plus frame-to-frame variation.
    live = LivenessGate(StubEngine(0.92))
    for _ in range(LIVENESS_FRAMES):
        live.observe(det(np.clip(face_a.astype(np.int16) + rs.randint(-40, 40, face_a.shape), 0, 255).astype(np.uint8)))
    passed, reason = live.verdict()
    check(passed, f"a live face passes the gate (reason={reason})")

    # A printed photo: the anti-spoof model may be fooled, but the image cannot
    # move. The temporal gate is what catches it.
    photo = LivenessGate(StubEngine(0.95))
    for _ in range(LIVENESS_FRAMES):
        photo.observe(det(face_a.copy()))
    passed, reason = photo.verdict()
    check(not passed and "movement" in reason, "a static photo is rejected on motion")

    # A screen replay: it moves, but the anti-spoof model scores it low.
    replay = LivenessGate(StubEngine(0.20))
    for _ in range(LIVENESS_FRAMES):
        replay.observe(det(np.clip(face_a.astype(np.int16) + rs.randint(-40, 40, face_a.shape), 0, 255).astype(np.uint8)))
    passed, reason = replay.verdict()
    check(not passed and "photo or screen" in reason, "a low anti-spoof score is rejected")

    # Too few frames is "keep looking", not "reject".
    short = LivenessGate(StubEngine(0.92))
    short.observe(det(face_a))
    passed, reason = short.verdict()
    check(not passed and reason == "not enough frames", "an incomplete gate asks for more frames")

    print()
    print("FAILED" if failures else "all checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
