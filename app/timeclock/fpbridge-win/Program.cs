using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using DPUruNet;

// ---------------------------------------------------------------------------
// fpbridge — local DigitalPersona U.are.U reader helper for the LetterSheets
// Time Clock (Electron) app.
//
// Exposes a WebSocket on ws://127.0.0.1:52100 speaking the JSON protocol the
// Electron renderer (renderer/fpbridge.js) expects:
//
//   app  -> { cmd: "status" | "load" | "identify" | "enroll" | "cancel", ... }
//   app <-  { type: "status" | "capture" | "enrollProgress" |
//                    "enrollComplete" | "identify" | "error" | "canceled", ... }
//
// Templates are DigitalPersona enrollment FMDs, serialized with Fmd.SerializeXml
// and carried as base64(UTF8(xml)) so they're opaque to the app and the ERP.
//
// This file targets .NET Framework 4.8 + DPUruNet. It cannot be built or tested
// on macOS — build and run it on the Windows kiosk (see README.md).
// ---------------------------------------------------------------------------

namespace FpBridge
{
    internal static class Program
    {
        private const string Prefix = "http://127.0.0.1:52100/";

        // FMD comparison threshold. DigitalPersona scores are dissimilarity:
        // lower = better match. PROBABILITY_ONE / 100000 ≈ FAR 1 in 100,000.
        private static readonly int MatchThreshold = Constants.PROBABILITY_ONE / 100000;

        private const int CaptureTimeoutMs = 15000;
        private const int EnrollScansNeeded = 4;

        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        // Loaded enrolled templates (parallel lists: fmd[i] belongs to employeeId[i]).
        private static readonly List<Fmd> _enrolledFmds = new List<Fmd>();
        private static readonly List<string> _enrolledEmpIds = new List<string>();

        private static Reader _reader;
        private static CancellationTokenSource _opCts; // cancels the running capture op

        private static async Task Main()
        {
            OpenReader();

            var listener = new HttpListener();
            listener.Prefixes.Add(Prefix);
            try
            {
                listener.Start();
            }
            catch (HttpListenerException ex)
            {
                Console.Error.WriteLine(
                    "Failed to bind " + Prefix + " (" + ex.Message + ").\n" +
                    "Run once elevated, or add a URL ACL:\n" +
                    "  netsh http add urlacl url=" + Prefix + " user=Everyone");
                return;
            }

            Console.WriteLine("fpbridge listening on " + Prefix + " (reader: " +
                              (_reader != null ? _reader.Description.SerialNumber : "none") + ")");

            while (true)
            {
                HttpListenerContext ctx;
                try { ctx = await listener.GetContextAsync(); }
                catch { break; }

                if (!ctx.Request.IsWebSocketRequest)
                {
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                    continue;
                }

                HttpListenerWebSocketContext wsCtx;
                try { wsCtx = await ctx.AcceptWebSocketAsync(null); }
                catch { continue; }

                // Handle one kiosk client at a time (a kiosk has a single app).
                await HandleClient(wsCtx.WebSocket);
            }
        }

        private static void OpenReader()
        {
            try
            {
                var readers = ReaderCollection.GetReaders();
                if (readers.Count == 0) { _reader = null; return; }
                _reader = readers[0];
                var r = _reader.Open(Constants.CapturePriority.DP_PRIORITY_COOPERATIVE);
                if (r != Constants.ResultCode.DP_SUCCESS) _reader = null;
            }
            catch { _reader = null; }
        }

        // ------------------------------------------------------------------
        // Client message pump
        // ------------------------------------------------------------------
        private static async Task HandleClient(WebSocket ws)
        {
            var buffer = new byte[8192];
            try
            {
                while (ws.State == WebSocketState.Open)
                {
                    var sb = new StringBuilder();
                    WebSocketReceiveResult res;
                    do
                    {
                        res = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                        if (res.MessageType == WebSocketMessageType.Close)
                        {
                            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                            return;
                        }
                        sb.Append(Encoding.UTF8.GetString(buffer, 0, res.Count));
                    } while (!res.EndOfMessage);

                    await Dispatch(ws, sb.ToString());
                }
            }
            catch { /* client dropped */ }
            finally { CancelOp(); }
        }

        private static async Task Dispatch(WebSocket ws, string text)
        {
            Dictionary<string, object> msg;
            try { msg = Json.Deserialize<Dictionary<string, object>>(text); }
            catch { return; }
            if (msg == null || !msg.ContainsKey("cmd")) return;

            switch (Convert.ToString(msg["cmd"]))
            {
                case "status":
                    await SendStatus(ws);
                    break;

                case "load":
                    LoadTemplates(msg);
                    await SendStatus(ws);
                    break;

                case "cancel":
                    CancelOp();
                    await Send(ws, new { type = "canceled" });
                    break;

                case "identify":
                    CancelOp();
                    _opCts = new CancellationTokenSource();
                    _ = Task.Run(() => IdentifyLoop(ws, _opCts.Token));
                    break;

                case "enroll":
                    CancelOp();
                    _opCts = new CancellationTokenSource();
                    string empId = msg.ContainsKey("employeeId") ? Convert.ToString(msg["employeeId"]) : null;
                    int finger = msg.ContainsKey("fingerIndex") ? Convert.ToInt32(msg["fingerIndex"]) : 0;
                    _ = Task.Run(() => EnrollLoop(ws, empId, finger, _opCts.Token));
                    break;
            }
        }

        private static void CancelOp()
        {
            try { _opCts?.Cancel(); } catch { }
            _opCts = null;
        }

        private static Task SendStatus(WebSocket ws) => Send(ws, new
        {
            type = "status",
            ready = _reader != null,
            reader = _reader != null ? _reader.Description.SerialNumber : null,
            loaded = _enrolledFmds.Count,
        });

        // ------------------------------------------------------------------
        // load: rebuild in-memory FMD list from stored base64(xml) templates
        // ------------------------------------------------------------------
        private static void LoadTemplates(Dictionary<string, object> msg)
        {
            _enrolledFmds.Clear();
            _enrolledEmpIds.Clear();
            if (!msg.ContainsKey("templates")) return;

            foreach (var item in (msg["templates"] as IEnumerable<object>) ?? Enumerable.Empty<object>())
            {
                if (!(item is Dictionary<string, object> t)) continue;
                if (!t.ContainsKey("employeeId") || !t.ContainsKey("fmd")) continue;
                try
                {
                    string xml = Encoding.UTF8.GetString(Convert.FromBase64String(Convert.ToString(t["fmd"])));
                    Fmd fmd = Fmd.DeserializeXml(xml);
                    if (fmd == null) continue;
                    _enrolledFmds.Add(fmd);
                    _enrolledEmpIds.Add(Convert.ToString(t["employeeId"]));
                }
                catch { /* skip malformed template */ }
            }
        }

        // ------------------------------------------------------------------
        // identify: capture one finger, 1:N match against loaded templates
        // ------------------------------------------------------------------
        private static async Task IdentifyLoop(WebSocket ws, CancellationToken ct)
        {
            if (_reader == null) { await Send(ws, Err("No reader connected.")); return; }

            Fmd probe = await CaptureFmd(ws, ct);
            if (probe == null) return; // canceled or errored (already reported)

            if (_enrolledFmds.Count == 0)
            {
                await Send(ws, new { type = "identify", matched = false });
                return;
            }

            int bestScore = int.MaxValue;
            int bestIdx = -1;
            for (int i = 0; i < _enrolledFmds.Count; i++)
            {
                CompareResult cr = Comparison.Compare(probe, 0, _enrolledFmds[i], 0);
                if (cr.ResultCode != Constants.ResultCode.DP_SUCCESS) continue;
                if (cr.Score < bestScore) { bestScore = cr.Score; bestIdx = i; }
            }

            bool matched = bestIdx >= 0 && bestScore < MatchThreshold;
            await Send(ws, new
            {
                type = "identify",
                matched,
                employeeId = matched ? _enrolledEmpIds[bestIdx] : null,
                score = bestScore,
            });
        }

        // ------------------------------------------------------------------
        // enroll: capture N scans, build an enrollment FMD, return base64(xml)
        // ------------------------------------------------------------------
        private static async Task EnrollLoop(WebSocket ws, string employeeId, int fingerIndex, CancellationToken ct)
        {
            if (_reader == null) { await Send(ws, Err("No reader connected.")); return; }

            var pre = new List<Fmd>();
            for (int i = 0; i < EnrollScansNeeded; i++)
            {
                Fmd fmd = await CaptureFmd(ws, ct);
                if (fmd == null) return; // canceled/errored
                pre.Add(fmd);
                await Send(ws, new { type = "enrollProgress", captured = i + 1, needed = EnrollScansNeeded });
            }

            DataResult<Fmd> er = Enrollment.CreateEnrollmentFmd(Constants.Formats.Fmd.ANSI, pre);
            if (er.ResultCode != Constants.ResultCode.DP_SUCCESS || er.Data == null)
            {
                await Send(ws, Err("Enrollment failed — please try again."));
                return;
            }

            string xml = Fmd.SerializeXml(er.Data);
            string b64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(xml));
            await Send(ws, new
            {
                type = "enrollComplete",
                employeeId,
                fingerIndex,
                fmd = b64,
                quality = 100,
            });
        }

        // Capture a single fingerprint and extract an ANSI FMD. Emits "capture"
        // on each scan; returns null on cancel/timeout/error (already reported).
        private static async Task<Fmd> CaptureFmd(WebSocket ws, CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                CaptureResult cap;
                try
                {
                    cap = _reader.Capture(
                        Constants.Formats.Fid.ANSI,
                        Constants.CaptureProcessing.DP_IMG_PROC_DEFAULT,
                        CaptureTimeoutMs,
                        _reader.Capabilities.Resolutions[0]);
                }
                catch (Exception ex)
                {
                    await Send(ws, Err("Capture error: " + ex.Message));
                    return null;
                }

                if (ct.IsCancellationRequested) return null;

                if (cap == null || cap.ResultCode != Constants.ResultCode.DP_SUCCESS)
                {
                    // Timeout with no finger: loop and wait again.
                    if (cap != null && cap.ResultCode == Constants.ResultCode.DP_ERROR_TIMED_OUT) continue;
                    await Send(ws, Err("Capture failed — try again."));
                    return null;
                }

                if (cap.Quality != Constants.CaptureQuality.DP_QUALITY_GOOD)
                {
                    await Send(ws, new { type = "capture", quality = "low" });
                    continue; // ask for a cleaner scan
                }

                await Send(ws, new { type = "capture", quality = "good" });

                DataResult<Fmd> fe = FeatureExtraction.CreateFmdFromFid(cap.Data, Constants.Formats.Fmd.ANSI);
                if (fe.ResultCode != Constants.ResultCode.DP_SUCCESS || fe.Data == null)
                {
                    await Send(ws, Err("Could not read that scan — try again."));
                    continue;
                }
                return fe.Data;
            }
            return null;
        }

        // ------------------------------------------------------------------
        private static object Err(string message) => new { type = "error", message };

        private static readonly SemaphoreSlim _sendLock = new SemaphoreSlim(1, 1);

        private static async Task Send(WebSocket ws, object payload)
        {
            if (ws.State != WebSocketState.Open) return;
            byte[] bytes = Encoding.UTF8.GetBytes(Json.Serialize(payload));
            await _sendLock.WaitAsync();
            try
            {
                await ws.SendAsync(new ArraySegment<byte>(bytes),
                    WebSocketMessageType.Text, true, CancellationToken.None);
            }
            catch { }
            finally { _sendLock.Release(); }
        }
    }
}
