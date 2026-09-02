#!/usr/bin/env node
/**
 * Crypto conformance tests for lib/crypto.js.
 *
 *   node tools/test-crypto.mjs                       # plain Node
 *   ./node_modules/.bin/electron tools/test-crypto.mjs --electron
 *
 * BOTH must pass. Electron's main process links BoringSSL, which does not
 * implement AES-KW, so the hand-rolled RFC 3394 in lib/crypto.js is the only
 * thing standing between the kiosk and "the password did not unlock the key"
 * on every account. Running this under plain Node alone would not have caught
 * that — Node's OpenSSL supports AES-KW and hid the problem.
 */
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
const crypto = require('../lib/crypto.js');

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!cond) fails++;
};

// --- RFC 3394 §4.6: 256-bit KEK wrapping 256-bit key data -------------------
// The published vector, so an implementation bug cannot hide behind a
// self-consistent wrap/unwrap round trip.
const KEK = Buffer.from('000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F', 'hex');
const KEY = Buffer.from('00112233445566778899AABBCCDDEEFF000102030405060708090A0B0C0D0E0F', 'hex');
const EXPECTED = '28C9F404C4B810F4CBCCB35CFB87F8263F5786E2D80ED326CBC7F0E71A99F43BFB988B9B7A02DD21';

const wrapped = crypto.aesKeyWrap(KEK, KEY);
ok('RFC 3394 §4.6 wrap matches the published vector',
  wrapped.toString('hex').toUpperCase() === EXPECTED,
  wrapped.toString('hex').toUpperCase());

ok('RFC 3394 §4.6 unwrap recovers the key',
  crypto.aesKeyUnwrap(KEK, Buffer.from(EXPECTED, 'hex')).equals(KEY));

// --- Agreement with WebCrypto's own AES-KW ----------------------------------
// Skipped under Electron, where BoringSSL cannot perform the comparison — that
// absence is the very bug this file exists to guard.
let webCryptoHasKW = true;
try {
  const probe = await webcrypto.subtle.importKey('raw', KEK, 'AES-KW', false, ['wrapKey', 'unwrapKey']);
  const k = await webcrypto.subtle.importKey('raw', KEY, { name: 'AES-GCM' }, true, ['encrypt']);
  const ref = Buffer.from(await webcrypto.subtle.wrapKey('raw', k, probe, 'AES-KW'));
  ok('matches WebCrypto AES-KW byte for byte', ref.equals(wrapped), ref.toString('hex'));
} catch {
  webCryptoHasKW = false;
  console.log('SKIP  WebCrypto AES-KW comparison — unavailable in this runtime (expected under Electron)');
}

// --- Full unlock path -------------------------------------------------------
const password = 'correct horse battery staple';
const salt = '46f55c67-468a-406c-a7bc-293c31a489dc';

const companyKey = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
const wrappedB64 = await crypto.wrapCompanyKey(companyKey, password, salt);
ok('wrapped company key is 40 bytes', Buffer.from(wrappedB64, 'base64').length === 40);

const unlocked = await crypto.unlockCompanyKey(password, salt, wrappedB64);
ok('unlockCompanyKey round-trips', Boolean(unlocked));

const ct = await crypto.encrypt('employee@acme.ph', unlocked);
ok('unlocked key decrypts its own ciphertext', (await crypto.decrypt(ct, unlocked)) === 'employee@acme.ph');

const original = await crypto.exportCompanyKey(companyKey);
const recovered = await crypto.exportCompanyKey(unlocked);
ok('unwrapped key is the original key', original === recovered);

let rejected = false;
try { await crypto.unlockCompanyKey('wrong password', salt, wrappedB64); }
catch { rejected = true; }
ok('wrong password is rejected, not silently wrong', rejected);

let saltRejected = false;
try { await crypto.unlockCompanyKey(password, 'different-salt', wrappedB64); }
catch { saltRejected = true; }
ok('wrong salt is rejected', saltRejected);

console.log(`\nruntime: node ${process.versions.node}` +
  (process.versions.electron ? ` | electron ${process.versions.electron} (BoringSSL)` : ' (OpenSSL)') +
  ` | WebCrypto AES-KW: ${webCryptoHasKW ? 'available' : 'ABSENT'}`);
console.log(fails === 0 ? 'All crypto checks passed.\n' : `${fails} check(s) failed.\n`);

if (process.versions.electron) {
  const { app } = require('electron');
  app.whenReady().then(() => app.exit(fails ? 1 : 0));
} else {
  process.exit(fails ? 1 : 0);
}
