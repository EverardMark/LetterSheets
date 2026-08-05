# fpbridge — DigitalPersona reader helper (Linux kiosk)

The Linux counterpart of [`../fpbridge-win/`](../fpbridge-win/). It owns the
DigitalPersona U.are.U reader and exposes the **same** WebSocket protocol on
`ws://127.0.0.1:52100`, so the Electron Time Clock app
([`../renderer/fpbridge.js`](../renderer/fpbridge.js)) connects to it **without
any change** — it can't tell whether Windows or Linux is on the other end.

Unlike macOS (which has no DigitalPersona SDK at all), the U.are.U reader **is**
supported on Linux through HID/DigitalPersona's cross-platform C SDK
(`dpfpdd` = device, `dpfj` = feature-extraction/match). What is Windows-only is
the *.NET* wrapper (`DPUruNet`) used by the other helper — not the reader. This
port talks to the C SDK directly, so no .NET is involved.

> Written as a faithful port of `Program.cs`. The reader-independent parts
> (WebSocket server, SHA-1, base64, JSON) are self-contained and covered by
> `make selftest`. Everything that touches the reader is isolated in the `hw_*`
> section at the bottom of `fpbridge.c`; that is the only code that needs the
> SDK and the only code to check against your exact SDK release.

## Prerequisites

1. **U.are.U reader** — 4500 or 5300 (USB vendor `05ba`).
2. **DigitalPersona U.are.U SDK for Linux** — provides the headers
   (`dpfpdd.h`, `dpfj.h`) and shared libs (`libdpfpdd.so`, `libdpfj.so`) plus
   the runtime/driver. Get it from HID's DigitalPersona developer portal. The
   Makefile expects it under `/opt/DigitalPersona/UareUSDK` (`Include/`, `lib/`);
   override with `make SDK=/your/path`.
3. **A C toolchain** — `cc`/`gcc` + `make`.

## Build & test

```bash
# Transport self-test — needs NO SDK and NO reader. Do this first.
make selftest        # builds a reader-less binary and runs the checks

# Real build against the SDK:
make                 # -> ./fpbridge
make SDK=/opt/DigitalPersona/UareUSDK   # if the SDK lives elsewhere
```

`make selftest` verifies SHA-1, base64, the RFC 6455 `Sec-WebSocket-Accept`
handshake value, and JSON parsing. If it passes, the app-facing protocol layer
is sound and only the reader glue depends on the SDK.

## USB permissions (run without root)

Install the udev rule so the kiosk user can open the reader:

```bash
sudo cp 99-dp-uareu.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
# then unplug/replug the reader
```

## Run

```bash
./fpbridge
# -> fpbridge listening on ws://127.0.0.1:52100/ (reader: <name>)
```

Launch the Time Clock app; the reader chip in its top bar turns green
("Reader ready") once connected. For a real kiosk, start it on boot with the
provided systemd unit:

```bash
sudo cp fpbridge /usr/local/bin/fpbridge
sudo cp fpbridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fpbridge
```

(Edit `User=` / `ExecStart=` in [`fpbridge.service`](fpbridge.service) to match
your setup. If the SDK `.so`s aren't on the default loader path, set
`LD_LIBRARY_PATH` there — or rely on the `-rpath` the Makefile bakes in.)

## Protocol (unchanged from the Windows helper)

| app → bridge | bridge → app |
|---|---|
| `{cmd:"status"}` | `{type:"status", ready, reader, loaded}` |
| `{cmd:"load", templates:[{employeeId,fingerIndex,fmd}]}` | `{type:"status",...}` |
| `{cmd:"enroll", employeeId, fingerIndex}` | `{type:"capture",quality}` · `{type:"enrollProgress",captured,needed}` · `{type:"enrollComplete", employeeId, fingerIndex, fmd, quality}` |
| `{cmd:"identify"}` | `{type:"capture",quality}` · `{type:"identify", matched, employeeId?, score?}` |
| `{cmd:"cancel"}` | `{type:"canceled"}` |

## Template format — parity with Windows

The FMDs are ANSI-378 either way, but the two helpers wrap them differently:

- **This helper:** `fmd` = base64 of the **raw FMD bytes**.
- **Windows helper:** `fmd` = base64 of `Fmd.SerializeXml(...)` (a DPUruNet XML
  envelope).

So a **Linux-only** kiosk is fully self-consistent (enroll on Linux → identify
on Linux). To share **one** `fingerprints-<companyId>.json` across both a
Windows and a Linux kiosk, make them agree: change the Windows helper to store
raw FMD bytes too — replace `Fmd.SerializeXml` / `Fmd.DeserializeXml` with
`fmd.Bytes` / `Fmd.CreateFromFmd(bytes, DPFJ_FMD_ANSI_378_2004)`. Otherwise
just enroll per-OS.

## SDK differences — what to check on the box

Because this can't be built or run without the reader present, verify on the
Linux kiosk (same list as the Windows helper):

- `make` compiles cleanly. If it errors on a `dpfpdd_*` / `dpfj_*` symbol or a
  `DPFPDD_*` / `DPFJ_*` constant, fix it in the **CONFIG** and **`hw_*`** block
  at the bottom of `fpbridge.c` — spellings drift slightly between SDK versions
  (e.g. capture image format, the `DPFPDD_QUALITY_*` enum, the open-priority
  constant, `DPFJ_PROBABILITY_ONE`).
- Reader detected → `status` reports `ready:true` and a reader name.
- Enroll an employee (4 good scans) → `enrollComplete` with a non-empty `fmd`;
  the app saves it and the employee shows "enrolled".
- Restart, place the same finger → `identify` returns that `employeeId` and the
  clock records in/out.
- Tune the match threshold in `hw_match_threshold()` if you see false
  accepts/rejects (it's `DPFJ_PROBABILITY_ONE / 100000` ≈ FAR 1-in-100,000;
  a larger divisor = stricter).

### One app-side cross-check (affects Windows too)

The renderer matches with `employees.find(e => e.id === m.employeeId)`. This
bridge echoes `employeeId` as a **string** (as the Windows helper does). If
`get_employees` returns **numeric** ids, that strict `===` won't match a string
— loosen it to `==` or `String(e.id) === String(m.employeeId)` in
`../renderer/renderer.js`. Verify during the identify test above.
