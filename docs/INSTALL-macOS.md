# Installing LetterSheets on macOS

LetterSheets is distributed outside the Mac App Store, so the first time you open
it macOS will warn that the developer "cannot be verified." **This is normal and
the app is safe** — it just isn't signed with a paid Apple certificate. You only
need to do this **once**; after that it opens like any other app.

This is a **universal** build — it runs natively on both Apple Silicon
(M1/M2/M3/M4) and older Intel Macs. There is only one file to install.

---

## Step 1 — Install

1. Double-click **`LetterSheets-1.0.0-universal.dmg`**.
2. Drag the **LetterSheets** icon onto the **Applications** folder.
3. Eject the disk image.

## Step 2 — Open it the first time

Try double-clicking **LetterSheets** in your Applications folder.

If you see **"LetterSheets can't be opened because Apple cannot check it for
malicious software"**, do this:

### Option A — Privacy & Security settings (easiest)

1. Open  → **System Settings** → **Privacy & Security**.
2. Scroll down to the **Security** section. You'll see:
   *"LetterSheets was blocked to protect your Mac."*
3. Click **Open Anyway**.
4. Confirm with **Open** (enter your password / Touch ID if asked).

The app now opens normally every time.

### Option B — One Terminal command (if Option A doesn't appear)

1. Open **Terminal** (Applications → Utilities → Terminal).
2. Paste this and press **Return**:
   ```
   xattr -cr /Applications/LetterSheets.app
   ```
3. Now double-click **LetterSheets** — it opens normally.

---

## "The app is damaged and can't be opened"

If you ever see *"damaged and can't be opened"*, it's the same quarantine issue —
run the Terminal command in **Option B** above and it will open.

---

*Questions? Contact your LetterSheets administrator.*
