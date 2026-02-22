/**
 * Lettersheets Client-Side Encryption
 *
 * Flow:
 * 1. Registration:
 *    - Generate AES-256 company master key
 *    - Derive KEK from password + salt using PBKDF2
 *    - Wrap (encrypt) company key with KEK
 *    - Generate RSA-OAEP keypair for key exchange
 *    - Send wrapped_company_key + public_key to server
 *
 * 2. Login + Select Company:
 *    - Server returns wrapped_company_key
 *    - Derive KEK from password + salt using PBKDF2
 *    - Unwrap (decrypt) company key with KEK
 *    - Use company key to encrypt/decrypt employee data
 *
 * 3. Inviting users:
 *    - Admin fetches new user's public key
 *    - Admin encrypts company key with user's public key
 *    - Server stores the wrapped key for the new user
 *    - New user unwraps with their private key, then re-wraps with their own KEK
 */

// ============================================================
// KEY DERIVATION (Password → KEK)
// ============================================================

/**
 * Derive a Key-Encryption-Key from password + salt using PBKDF2
 * @param {string} password - User's plaintext password
 * @param {string} salt - Unique salt (stored per user)
 * @returns {Promise<CryptoKey>} AES-KW key for wrapping/unwrapping
 */
export async function deriveKEK(password, salt) {
  const encoder = new TextEncoder();

  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
  );

  // Derive AES-KW key using PBKDF2
  return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 600000, // OWASP recommended minimum
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

/**
 * Generate a random AES-256-GCM company master key
 * @returns {Promise<CryptoKey>} Extractable AES-GCM key
 */
export async function generateCompanyKey() {
  return crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true, // extractable so it can be wrapped
      ["encrypt", "decrypt"]
  );
}

// ============================================================
// KEY WRAPPING (Encrypt company key with KEK)
// ============================================================

/**
 * Wrap (encrypt) the company key with the KEK
 * @param {CryptoKey} companyKey - AES-GCM company key
 * @param {CryptoKey} kek - AES-KW key derived from password
 * @returns {Promise<ArrayBuffer>} Wrapped key bytes
 */
export async function wrapCompanyKey(companyKey, kek) {
  return crypto.subtle.wrapKey("raw", companyKey, kek, "AES-KW");
}

/**
 * Unwrap (decrypt) the company key with the KEK
 * @param {ArrayBuffer} wrappedKey - Wrapped key bytes from server
 * @param {CryptoKey} kek - AES-KW key derived from password
 * @returns {Promise<CryptoKey>} Decrypted AES-GCM company key
 */
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
// RSA KEYPAIR (For key exchange when inviting users)
// ============================================================

/**
 * Generate RSA-OAEP keypair
 * @returns {Promise<CryptoKeyPair>} { publicKey, privateKey }
 */
export async function generateKeyPair() {
  return crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true, // extractable
      ["encrypt", "decrypt"]
  );
}

/**
 * Export public key to SPKI format (for sending to server)
 * @param {CryptoKey} publicKey
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportPublicKey(publicKey) {
  return crypto.subtle.exportKey("spki", publicKey);
}

/**
 * Import public key from SPKI format (received from server)
 * @param {ArrayBuffer} spkiBytes
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKey(spkiBytes) {
  return crypto.subtle.importKey(
      "spki",
      spkiBytes,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
  );
}

/**
 * Export private key to PKCS8 format (for local storage)
 * @param {CryptoKey} privateKey
 * @returns {Promise<ArrayBuffer>}
 */
export async function exportPrivateKey(privateKey) {
  return crypto.subtle.exportKey("pkcs8", privateKey);
}

/**
 * Import private key from PKCS8 format
 * @param {ArrayBuffer} pkcs8Bytes
 * @returns {Promise<CryptoKey>}
 */
export async function importPrivateKey(pkcs8Bytes) {
  return crypto.subtle.importKey(
      "pkcs8",
      pkcs8Bytes,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"]
  );
}

// ============================================================
// KEY EXCHANGE (Admin wraps company key for invited user)
// ============================================================

/**
 * Wrap company key with a user's RSA public key
 * Used when admin invites a new user
 * @param {CryptoKey} companyKey - AES-GCM company key
 * @param {CryptoKey} recipientPublicKey - New user's RSA public key
 * @returns {Promise<ArrayBuffer>} RSA-encrypted company key
 */
export async function wrapKeyForUser(companyKey, recipientPublicKey) {
  const rawKey = await crypto.subtle.exportKey("raw", companyKey);
  return crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPublicKey, rawKey);
}

/**
 * Unwrap company key received from admin via RSA
 * @param {ArrayBuffer} encryptedKey - RSA-encrypted company key
 * @param {CryptoKey} privateKey - User's RSA private key
 * @returns {Promise<CryptoKey>} AES-GCM company key
 */
export async function unwrapKeyFromAdmin(encryptedKey, privateKey) {
  const rawKey = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedKey
  );
  return crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
  );
}

// ============================================================
// DATA ENCRYPTION / DECRYPTION
// ============================================================

/**
 * Encrypt a string with the company key
 * @param {string} plaintext - Data to encrypt
 * @param {CryptoKey} companyKey - AES-GCM key
 * @returns {Promise<string>} Base64 encoded (iv + ciphertext)
 */
export async function encrypt(plaintext, companyKey) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

  const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      companyKey,
      encoder.encode(plaintext)
  );

  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return bufferToBase64(combined);
}

/**
 * Decrypt a string with the company key
 * @param {string} encrypted - Base64 encoded (iv + ciphertext)
 * @param {CryptoKey} companyKey - AES-GCM key
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decrypt(encrypted, companyKey) {
  const combined = base64ToBuffer(encrypted);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      companyKey,
      ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

// ============================================================
// REGISTRATION HELPER
// ============================================================

/**
 * Generate all keys needed for registration
 * @param {string} password - User's password
 * @param {string} salt - User's salt
 * @returns {Promise<{wrappedCompanyKey: string, publicKey: string, privateKey: string}>}
 *   All values are base64-encoded
 */
export async function generateRegistrationKeys(password, salt) {
  // 1. Generate company master key
  const companyKey = await generateCompanyKey();

  // 2. Derive KEK from password
  const kek = await deriveKEK(password, salt);

  // 3. Wrap company key with KEK
  const wrappedCompanyKey = await wrapCompanyKey(companyKey, kek);

  // 4. Generate RSA keypair
  const keyPair = await generateKeyPair();

  // 5. Export public key
  const publicKeyBytes = await exportPublicKey(keyPair.publicKey);

  // 6. Export private key (user stores this locally, encrypted)
  const privateKeyBytes = await exportPrivateKey(keyPair.privateKey);

  // 7. RSA-encrypt company key for recovery (doesn't need password to decrypt)
  const recoveryKey = await wrapKeyForUser(companyKey, keyPair.publicKey);

  return {
    wrappedCompanyKey: bufferToBase64(wrappedCompanyKey),
    publicKey: bufferToBase64(publicKeyBytes),
    privateKey: bufferToBase64(privateKeyBytes),
    recoveryWrappedKey: bufferToBase64(recoveryKey),
  };
}

// ============================================================
// LOGIN HELPER
// ============================================================

/**
 * Unlock the company key after login
 * @param {string} password - User's password
 * @param {string} salt - User's salt (returned by login)
 * @param {string} wrappedCompanyKeyB64 - Base64 wrapped key (from select_company)
 * @returns {Promise<CryptoKey>} Usable AES-GCM company key
 */
export async function unlockCompanyKey(password, salt, wrappedCompanyKeyB64) {
  const kek = await deriveKEK(password, salt);
  const wrappedBytes = base64ToBuffer(wrappedCompanyKeyB64);
  return unwrapCompanyKey(wrappedBytes, kek);
}

// ============================================================
// PASSWORD RECOVERY (Using recovery key file)
// ============================================================

/**
 * Recover and re-wrap company key using recovery file + new password
 * @param {string} recoveryWrappedKeyB64 - RSA-encrypted company key from recovery file
 * @param {string} privateKeyB64 - RSA private key from recovery file
 * @param {string} newPassword - User's new password
 * @param {string} newSalt - New salt for the new password
 * @returns {Promise<{wrappedCompanyKey: string, publicKey: string, privateKey: string, recoveryWrappedKey: string}>}
 */
export async function recoverKeys(recoveryWrappedKeyB64, privateKeyB64, newPassword, newSalt) {
  // 1. Import RSA private key from recovery file
  const privateKeyBytes = base64ToBuffer(privateKeyB64);
  const privateKey = await importPrivateKey(privateKeyBytes);

  // 2. Decrypt company key using RSA private key
  const recoveryWrappedBytes = base64ToBuffer(recoveryWrappedKeyB64);
  const companyKey = await unwrapKeyFromAdmin(recoveryWrappedBytes, privateKey);

  // 3. Derive new KEK from new password
  const newKek = await deriveKEK(newPassword, newSalt);

  // 4. Re-wrap company key with new KEK
  const newWrappedKey = await wrapCompanyKey(companyKey, newKek);

  // 5. Generate new RSA keypair
  const newKeyPair = await generateKeyPair();
  const newPublicKeyBytes = await exportPublicKey(newKeyPair.publicKey);
  const newPrivateKeyBytes = await exportPrivateKey(newKeyPair.privateKey);

  // 6. RSA-encrypt company key for new recovery file
  const newRecoveryKey = await wrapKeyForUser(companyKey, newKeyPair.publicKey);

  return {
    wrappedCompanyKey: bufferToBase64(newWrappedKey),
    publicKey: bufferToBase64(newPublicKeyBytes),
    privateKey: bufferToBase64(newPrivateKeyBytes),
    recoveryWrappedKey: bufferToBase64(newRecoveryKey),
  };
}

// ============================================================
// UTILITY
// ============================================================

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
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
