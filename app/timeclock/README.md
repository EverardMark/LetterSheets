# LetterSheets Time Clock

A small Electron desktop kiosk for recording employee **clock in / clock out**
against the LetterSheets ERP server.

## How it works

1. **Device sign-in** — a manager/admin signs the device in once
   (`login` → `select_company`) with just email + password. This creates a kiosk
   session; the bearer token is held only in the main process (never written to
   disk, never exposed to the renderer).
2. **Clock screen** — every active employee for the company is listed. Each card
   shows whether the person is currently clocked in, and a **Clock In** or
   **Clock Out** button.
   - Clock In → `clock_in { employee_id }`
   - Clock Out → resolves today's open attendance record and calls
     `clock_out { id }`
   - Current state comes from `get_attendance` for today.
3. **Sign out** — invalidates the kiosk session (`logout`).

All server calls go through the Electron main process (IPC), so there are no
browser CORS constraints and the token stays out of the web layer.

## Server endpoints used

`POST {serverUrl}/api/execute?action=...` — `login`, `select_company`,
`logout`, `get_employees`, `get_attendance`, `clock_in`, `clock_out`.
Responses are wrapped as `{ success, data, error }`.

## Fingerprint (DigitalPersona) — optional

The app can identify employees by fingerprint instead of a name tap. Because the
DigitalPersona U.are.U reader is **Windows-only**, the reader is driven by a
separate native helper, **`fpbridge`** (see [`fpbridge-win/`](fpbridge-win/)),
which the app talks to over `ws://127.0.0.1:52100`.

**Templates are stored locally on the kiosk** — never sent to the server. They
live in a per-company JSON file under Electron's `userData`
(`fingerprints-<companyId>.json`), each entry linked to an `employee_id` (the
employee list itself still comes from the ERP). Since this is biometric data on
local disk, keep the kiosk physically secured / disk-encrypted.

- **No reader / dev Mac:** the top-bar chip shows "No reader" and you use the
  name-tap flow. Everything else works.
- **Reader connected (Windows):** the chip turns green. The clock screen shows
  "Place your finger" and identifies employees 1:N. The **Enroll** button (top
  bar) is **admin-gated** — it prompts for an admin sign-in, then shows the
  employee list; pick a person and capture 4 scans → template saved to the local
  file. Templates are loaded into the reader on startup and after each enroll.

### Enrolling employees (admin-supervised, at the kiosk)

1. At the kiosk, tap **Enroll** → sign in with an admin account.
2. Search for and select the employee.
3. Tap **Start capture**; the employee places the **same finger 4 times**.
4. The template is saved locally and linked to that employee. They can now clock
   in/out by finger. **Re-enroll** replaces it; **Remove** deletes it.

> Trade-off: because storage is local, enrollments live on that one machine — a
> second kiosk would need its own enrollments, and re-imaging the box loses them.

## Server address

Like `app/web`, the API base comes from the **`VITE_API_BASE`** environment
variable (not the UI). It defaults to the remote deploy
`https://api.lettersheets.com`. Point it at a different server at launch:

```bash
VITE_API_BASE=http://localhost:8080 npm start   # local dev
```

## Run

```bash
cd app/timeclock
npm install
npm start        # or: npm run dev  (opens DevTools)
```

At the sign-in screen, enter your email and password, then pick the company.
The session is kept in memory only (cleared when the app closes).
