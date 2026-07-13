# fpbridge — DigitalPersona reader helper (Windows kiosk)

The DigitalPersona U.are.U reader can only be driven by a native process on the
kiosk. `fpbridge` is that process: a small .NET app that owns the reader and
exposes a WebSocket (`ws://127.0.0.1:52100`) which the Electron Time Clock app
connects to. It does capture, 4-scan **enrollment**, and 1:N **identification**
locally; templates are stored locally by the Electron app (a per-company JSON
file under its `userData`, not the server) and pushed here via the `load`
command on startup and after each enroll.

> ⚠️ Windows only. U.are.U has no macOS SDK — this cannot be built or run on a
> Mac. Develop the UI on any OS; run this on the Windows kiosk.

## Prerequisites

1. **DigitalPersona U.are.U reader** (e.g. 4500 / 5300) plugged in.
2. **DigitalPersona U.are.U SDK / Runtime Environment (RTE)** installed — this
   provides the reader driver and the native `dpfpdd` / `dpfj` DLLs. Get it from
   the HID DigitalPersona developer center.
3. **DPUruNet.dll** (the .NET wrapper from the SDK) copied to `./lib/DPUruNet.dll`.
4. **.NET SDK / MSBuild** (Visual Studio 2022 or `dotnet` with the .NET
   Framework 4.8 targeting pack).

## Build

```powershell
cd app\timeclock\fpbridge-win
# put DPUruNet.dll in .\lib\ first
dotnet build -c Release
```

If you hit `BadImageFormatException` at startup, the DPUruNet/native DLLs are
32-bit — set `<PlatformTarget>x86</PlatformTarget>` in `fpbridge.csproj` and
rebuild.

## Run

```powershell
.\bin\Release\net48\fpbridge.exe
```

You should see: `fpbridge listening on http://127.0.0.1:52100/ (reader: <serial>)`.

If binding fails with *Access denied*, either run the exe elevated once, or add a
URL reservation (one-time):

```powershell
netsh http add urlacl url=http://127.0.0.1:52100/ user=Everyone
```

Then launch the Time Clock app — the reader chip in its top bar turns green
("Reader ready") once connected. For a real kiosk, set `fpbridge.exe` to start on
login (Task Scheduler or the Startup folder).

## Protocol (for reference)

The Electron client is `../renderer/fpbridge.js`. Messages:

| app → bridge | bridge → app |
|---|---|
| `{cmd:"status"}` | `{type:"status", ready, reader, loaded}` |
| `{cmd:"load", templates:[{employeeId,fingerIndex,fmd}]}` | `{type:"status",...}` |
| `{cmd:"enroll", employeeId, fingerIndex}` | `{type:"capture",quality}` · `{type:"enrollProgress",captured,needed}` · `{type:"enrollComplete", employeeId, fingerIndex, fmd, quality}` |
| `{cmd:"identify"}` | `{type:"capture",quality}` · `{type:"identify", matched, employeeId?, score?}` |
| `{cmd:"cancel"}` | `{type:"canceled"}` |

`fmd` is `base64(UTF8(Fmd.SerializeXml(...)))` — an opaque enrollment template,
stored verbatim in the app's local per-company file (never on the server).

## To validate on the Windows box

Because this can't run on the dev Mac, confirm on the kiosk:
- Reader detected → status `ready:true`.
- Enroll an employee (4 good scans) → `enrollComplete` with a non-empty `fmd`;
  the app saves it and the employee shows "enrolled".
- Restart the app, place the same finger → `identify` returns that `employeeId`
  and the clock records in/out.
- Tune `MatchThreshold` in `Program.cs` if you get false accepts/rejects
  (lower = stricter).
