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

const { subtle } = require('crypto').webcrypto;

const PBKDF2_ITERATIONS = 600000;
const IV_BYTES = 12;

/** Password + per-user salt -> the AES-KW key-encryption key. */
async function deriveKEK(password, salt) {
  const enc = new TextEncoder();
  const material = await subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Unwrap the company key.
 *
 * A wrong password fails here as an AES-KW integrity error rather than
 * producing a junk key, so this doubles as password verification — which is
 * why device sign-in can trust it without a second round trip.
 */
async function unlockCompanyKey(password, salt, wrappedCompanyKeyB64) {
  const kek = await deriveKEK(password, salt);
  const wrapped = Buffer.from(wrappedCompanyKeyB64, 'base64');
  return subtle.unwrapKey(
    'raw', wrapped, kek, 'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
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
  unlockCompanyKey,
  importCompanyKey,
  exportCompanyKey,
  encrypt,
  decrypt,
  embeddingToBase64,
  embeddingFromBase64,
};
