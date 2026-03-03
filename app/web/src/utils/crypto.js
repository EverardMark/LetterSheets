/**
 * Lettersheets Client-Side Encryption — Post-Quantum Edition
 *
 * Algorithms:
 *   Key Encapsulation: ML-KEM-768 (NIST FIPS 203, replaces RSA-OAEP)
 *   Digital Signatures: ML-DSA-65  (NIST FIPS 204, new)
 *   Symmetric Encryption: AES-256-GCM (quantum-safe at 256-bit)
 *   Key Wrapping: AES-KW (unchanged)
 *   Key Derivation: PBKDF2-SHA256-600000 (unchanged)
 *
 * Install: npm install @noble/post-quantum
 */

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

// ============================================================
// KEY DERIVATION (Password → KEK)
// ============================================================

export async function deriveKEK(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 600000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-KW", length: 256 },
      false,
      ["wrapKey", "unwrapKey"]
  );
}

// ============================================================
// COMPANY KEY GENERATION
// ============================================================

export async function generateCompanyKey() {
  return crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
  );
}

// ============================================================
// KEY WRAPPING (AES-KW)
// ============================================================

export async function wrapCompanyKey(companyKey, kek) {
  return crypto.subtle.wrapKey("raw", companyKey, kek, "AES-KW");
}

export async function unwrapCompanyKey(wrappedKey, kek) {
  return crypto.subtle.unwrapKey(
      "raw",
      wrappedKey,
      kek,
      "AES-KW",
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
  );
}

// ============================================================
// ML-KEM-768 (replaces RSA-OAEP for key exchange)
// ============================================================

/**
 * Generate ML-KEM-768 keypair
 * encapsulationKey = public  (1184 bytes) — send to server
 * decapsulationKey = private (2400 bytes) — keep local
 */
export function generateKEMKeyPair() {
  const keys = ml_kem768.keygen();
  return {
    encapsulationKey: keys.publicKey,
    decapsulationKey: keys.secretKey,
  };
}

export function kemEncapsulate(encapsulationKey) {
  const result = ml_kem768.encapsulate(encapsulationKey);
  return {
    ciphertext: result.cipherText,
    sharedSecret: result.sharedSecret,
  };
}

export function kemDecapsulate(ciphertext, decapsulationKey) {
  return ml_kem768.decapsulate(ciphertext, decapsulationKey);
}

// ============================================================
// ML-DSA-65 (digital signatures)
// ============================================================

/**
 * Generate ML-DSA-65 keypair
 * verificationKey = public  (1952 bytes) — send to server
 * signingKey      = private (4032 bytes) — keep local
 */
export function generateDSAKeyPair() {
  const keys = ml_dsa65.keygen();
  return {
    verificationKey: keys.publicKey,
    signingKey: keys.secretKey,
  };
}

export function dsaSign(signingKey, message) {
  const msgBytes =
      typeof message === "string" ? new TextEncoder().encode(message) : message;
  return ml_dsa65.sign(msgBytes, signingKey);
}

export function dsaVerify(verificationKey, message, signature) {
  const msgBytes =
      typeof message === "string" ? new TextEncoder().encode(message) : message;
  return ml_dsa65.verify(signature, msgBytes, verificationKey);
}

// ============================================================
// KEM-BASED KEY EXCHANGE (replaces RSA encrypt/decrypt)
// ============================================================

/**
 * Wrap company key for a user using their KEM public key
 * Returns kemCiphertext (send to user) + wrappedKey (iv + AES-GCM encrypted)
 */
export async function wrapKeyForUser(companyKey, recipientEncapsulationKey) {
  const { ciphertext, sharedSecret } = kemEncapsulate(recipientEncapsulationKey);

  const aesKey = await crypto.subtle.importKey(
      "raw", sharedSecret, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );

  const rawKey = await crypto.subtle.exportKey("raw", companyKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, rawKey);

  const wrappedKey = new Uint8Array(iv.length + encrypted.byteLength);
  wrappedKey.set(iv);
  wrappedKey.set(new Uint8Array(encrypted), iv.length);

  return { kemCiphertext: ciphertext, wrappedKey };
}

/**
 * Unwrap company key received via KEM exchange
 */
export async function unwrapKeyFromUser(kemCiphertext, wrappedKey, decapsulationKey) {
  const sharedSecret = kemDecapsulate(kemCiphertext, decapsulationKey);

  const aesKey = await crypto.subtle.importKey(
      "raw", sharedSecret, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );

  const iv = wrappedKey.slice(0, 12);
  const ciphertext = wrappedKey.slice(12);
  const rawKey = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);

  return crypto.subtle.importKey(
      "raw", rawKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  );
}

// ============================================================
// DATA ENCRYPTION / DECRYPTION
// ============================================================

export async function encrypt(plaintext, companyKey) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, companyKey, encoder.encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bufferToBase64(combined);
}

export async function decrypt(encrypted, companyKey) {
  const combined = base64ToBuffer(encrypted);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv }, companyKey, ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

// ============================================================
// REGISTRATION HELPER (PQ)
// ============================================================

export async function generateRegistrationKeys(password, salt) {
  const companyKey = await generateCompanyKey();
  const kek = await deriveKEK(password, salt);
  const wrappedCompanyKey = await wrapCompanyKey(companyKey, kek);

  const kemPair = generateKEMKeyPair();
  const dsaPair = generateDSAKeyPair();

  const recovery = await wrapKeyForUser(companyKey, kemPair.encapsulationKey);

  return {
    wrappedCompanyKey: bufferToBase64(wrappedCompanyKey),
    kemPublicKey: bufferToBase64(kemPair.encapsulationKey),
    kemPrivateKey: bufferToBase64(kemPair.decapsulationKey),
    dsaPublicKey: bufferToBase64(dsaPair.verificationKey),
    dsaPrivateKey: bufferToBase64(dsaPair.signingKey),
    recoveryKemCiphertext: bufferToBase64(recovery.kemCiphertext),
    recoveryWrappedKey: bufferToBase64(recovery.wrappedKey),
  };
}

// ============================================================
// LOGIN HELPER
// ============================================================

export async function unlockCompanyKey(password, salt, wrappedCompanyKeyB64) {
  const kek = await deriveKEK(password, salt);
  const wrappedBytes = base64ToBuffer(wrappedCompanyKeyB64);
  return unwrapCompanyKey(wrappedBytes, kek);
}

// ============================================================
// PASSWORD RECOVERY (PQ)
// ============================================================

export async function recoverKeys(
    recoveryKemCiphertextB64,
    recoveryWrappedKeyB64,
    kemPrivateKeyB64,
    newPassword,
    newSalt
) {
  const kemCiphertext = new Uint8Array(base64ToBuffer(recoveryKemCiphertextB64));
  const wrappedKey = new Uint8Array(base64ToBuffer(recoveryWrappedKeyB64));
  const kemPrivateKey = new Uint8Array(base64ToBuffer(kemPrivateKeyB64));

  const companyKey = await unwrapKeyFromUser(kemCiphertext, wrappedKey, kemPrivateKey);

  const newKek = await deriveKEK(newPassword, newSalt);
  const newWrappedKey = await wrapCompanyKey(companyKey, newKek);

  const kemPair = generateKEMKeyPair();
  const dsaPair = generateDSAKeyPair();
  const recovery = await wrapKeyForUser(companyKey, kemPair.encapsulationKey);

  return {
    wrappedCompanyKey: bufferToBase64(newWrappedKey),
    kemPublicKey: bufferToBase64(kemPair.encapsulationKey),
    kemPrivateKey: bufferToBase64(kemPair.decapsulationKey),
    dsaPublicKey: bufferToBase64(dsaPair.verificationKey),
    dsaPrivateKey: bufferToBase64(dsaPair.signingKey),
    recoveryKemCiphertext: bufferToBase64(recovery.kemCiphertext),
    recoveryWrappedKey: bufferToBase64(recovery.wrappedKey),
  };
}

// ============================================================
// UTILITY
// ============================================================

function bufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
