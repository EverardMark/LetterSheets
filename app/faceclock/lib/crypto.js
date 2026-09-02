'use strict';

/**
 * Company-key crypto for the face clock kiosk.
 *
 * This is the Node-side counterpart of app/web/src/utils/crypto.js and MUST
 * stay byte-compatible with it: the ERP and this kiosk read and write the same
 * `*_enc` columns, so a drift in iterations, salt encoding or the IV envelope
 * silently makes one side unable to read the other's data.
 *
 *   KEK          PBKDF2-SHA256, 600,000 iterations, salt = utf8(user.salt)
 *   Company key  AES-256-GCM, wrapped with AES-KW under the KEK
 *   Payloads     base64( iv(12) || AES-256-GCM ciphertext+tag )
 *
 * Only the password-unlock path is implemented here. The ML-KEM key-recovery
 * flow in the web app is for sharing a company key with another user, which a
 * kiosk never does — leaving it out keeps a post-quantum dependency off the
 * device rather than shipping code no kiosk can reach.
 *
 * Node 18+ exposes WebCrypto as the global `crypto`, so the algorithm calls
 * below are the same ones the browser runs.
 */

const nodeCrypto = require('crypto');
const { subtle } = nodeCrypto.webcrypto;

const PBKDF2_ITERATIONS = 600000;
const IV_BYTES = 12;

// RFC 3394 default IV ("initial value"), used as the integrity check.
const KW_IV = Buffer.from('A6A6A6A6A6A6A6A6', 'hex');

/**
 * AES-KW is implemented here by hand rather than through WebCrypto.
 *
 * Electron's main process links BoringSSL, which does NOT implement AES key
 * wrap: `subtle.wrapKey/unwrapKey` with "AES-KW" throws OperationError, and
 * `crypto.getCiphers()` lists no *-wrap cipher either. Node (OpenSSL) and
 * Chromium's renderer both support it, so the same code that works in
 * app/web's browser context and in a plain `node` script fails only here —
 * which is exactly as confusing as it sounds when the symptom is "the
 * password did not unlock the key" for every account.
 *
 * RFC 3394 is AES-ECB in a fixed loop, and ECB *is* available, so the
 * algorithm is reproduced directly. Verified against the RFC's own test
 * vector and against WebCrypto's output — see tools/test-crypto.mjs.
 *
 * Doing this in the main process keeps the company key out of the renderer,
 * which runs camera and model code; moving the unwrap there would have been
 * the easy fix and the wrong one.
 */
function ecbBlock(kek, block, encrypt) {
  const c = encrypt
    ? nodeCrypto.createCipheriv('aes-256-ecb', kek, null)
    : nodeCrypto.createDecipheriv('aes-256-ecb', kek, null);
  c.setAutoPadding(false);
  return Buffer.concat([c.update(block), c.final()]);
}

/** XOR the 64-bit counter t into the low bytes of A, in place. */
function xorCounter(A, t) {
  A[7] ^= t & 0xff;
  A[6] ^= (t >>> 8) & 0xff;
  A[5] ^= (t >>> 16) & 0xff;
  A[4] ^= (t >>> 24) & 0xff;
}

function aesKeyWrap(kek, plaintext) {
  if (plaintext.length % 8 !== 0 || plaintext.length < 16) {
    throw new Error('AES-KW: key data must be a multiple of 8 bytes, at least 16');
  }
  const n = plaintext.length / 8;
  let A = Buffer.from(KW_IV);
  const R = [];
  for (let i = 0; i < n; i++) R.push(Buffer.from(plaintext.subarray(i * 8, i * 8 + 8)));

  for (let j = 0; j <= 5; j++) {
    for (let i = 1; i <= n; i++) {
      const B = ecbBlock(kek, Buffer.concat([A, R[i - 1]]), true);
      A = Buffer.from(B.subarray(0, 8));
      xorCounter(A, n * j + i);
      R[i - 1] = Buffer.from(B.subarray(8, 16));
    }
  }
  return Buffer.concat([A, ...R]);
}

function aesKeyUnwrap(kek, wrapped) {
  if (wrapped.length % 8 !== 0 || wrapped.length < 24) {
    throw new Error('AES-KW: wrapped key has an invalid length');
  }
  const n = wrapped.length / 8 - 1;
  let A = Buffer.from(wrapped.subarray(0, 8));
  const R = [];
  for (let i = 1; i <= n; i++) R.push(Buffer.from(wrapped.subarray(i * 8, i * 8 + 8)));

  for (let j = 5; j >= 0; j--) {
    for (let i = n; i >= 1; i--) {
      const At = Buffer.from(A);
      xorCounter(At, n * j + i);
      const B = ecbBlock(kek, Buffer.concat([At, R[i - 1]]), false);
      A = Buffer.from(B.subarray(0, 8));
      R[i - 1] = Buffer.from(B.subarray(8, 16));
    }
  }

  // A wrong password lands here, so this is the check that must not be
  // short-circuited or made to leak timing.
  if (!nodeCrypto.timingSafeEqual(A, KW_IV)) {
    throw new Error('AES-KW: integrity check failed (wrong password or salt)');
  }
  return Buffer.concat(R);
}

/**
 * Password + per-user salt -> the 32-byte key-encryption key.
 *
 * Identical output to the web app's WebCrypto deriveKey(AES-KW, 256):
 * PBKDF2-SHA256, 600,000 iterations, salt taken as UTF-8 bytes.
 */
function deriveKEK(password, salt) {
  return new Promise((resolve, reject) => {
    nodeCrypto.pbkdf2(
      Buffer.from(String(password), 'utf8'),
      Buffer.from(String(salt), 'utf8'),
      PBKDF2_ITERATIONS, 32, 'sha256',
      (err, key) => (err ? reject(err) : resolve(key))
    );
  });
}

/**
 * Unwrap the company key.
 *
 * A wrong password fails the RFC 3394 integrity check rather than producing a
 * junk key, so this doubles as password verification — which is why device
 * sign-in can trust it without a second round trip.
 */
async function unlockCompanyKey(password, salt, wrappedCompanyKeyB64) {
  const kek = await deriveKEK(password, salt);
  const raw = aesKeyUnwrap(kek, Buffer.from(wrappedCompanyKeyB64, 'base64'));
  return subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Wrap a company key. Present so the unwrap path can be tested round-trip. */
async function wrapCompanyKey(companyKey, password, salt) {
  const kek = await deriveKEK(password, salt);
  const raw = Buffer.from(await subtle.exportKey('raw', companyKey));
  return aesKeyWrap(kek, raw).toString('base64');
}

/** Re-import a raw company key exported earlier by exportCompanyKey. */
async function importCompanyKey(rawB64) {
  return subtle.importKey(
    'raw', Buffer.from(rawB64, 'base64'),
    { name: 'AES-GCM', length: 256 },
    true, ['encrypt', 'decrypt']
  );
}

/** Export the company key so it can be sealed into the OS keyring. */
async function exportCompanyKey(key) {
  const raw = await subtle.exportKey('raw', key);
  return Buffer.from(raw).toString('base64');
}

/** Encrypt a UTF-8 string -> base64(iv || ciphertext). */
async function encrypt(plaintext, companyKey) {
  const iv = require('crypto').randomBytes(IV_BYTES);
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv }, companyKey, new TextEncoder().encode(plaintext)
  );
  return Buffer.concat([iv, Buffer.from(ct)]).toString('base64');
}

/** Decrypt base64(iv || ciphertext) -> UTF-8 string. */
async function decrypt(encoded, companyKey) {
  const combined = Buffer.from(encoded, 'base64');
  if (combined.length <= IV_BYTES) throw new Error('ciphertext is truncated');
  const iv = combined.subarray(0, IV_BYTES);
  const ct = combined.subarray(IV_BYTES);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, companyKey, ct);
  return new TextDecoder().decode(pt);
}

/**
 * Face embeddings are Float32Array; the envelope above carries text. Base64 of
 * the raw little-endian buffer is used rather than a JSON number array: it is
 * ~4x smaller and, more importantly, exactly round-trips the float bits, where
 * JSON.stringify would rewrite them through decimal.
 */
function embeddingToBase64(vec) {
  const f32 = vec instanceof Float32Array ? vec : Float32Array.from(vec);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64');
}

function embeddingFromBase64(b64) {
  const buf = Buffer.from(b64, 'base64');
  if (buf.length % 4 !== 0) throw new Error('embedding is not a float32 buffer');
  // Copy rather than viewing Buffer's pooled memory: a Float32Array over the
  // pool would alias unrelated allocations once the Buffer is released.
  const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

module.exports = {
  PBKDF2_ITERATIONS,
  deriveKEK,
  aesKeyWrap,
  aesKeyUnwrap,
  wrapCompanyKey,
  unlockCompanyKey,
  importCompanyKey,
  exportCompanyKey,
  encrypt,
  decrypt,
  embeddingToBase64,
  embeddingFromBase64,
};
