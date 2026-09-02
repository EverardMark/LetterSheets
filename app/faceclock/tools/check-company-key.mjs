#!/usr/bin/env node
/**
 * Diagnose whether an account's company key actually unwraps.
 *
 *   node tools/check-company-key.mjs
 *
 * Prompts for email and password, calls the same two API actions the ERP and
 * the kiosk call, and runs the identical unwrap. Reports per company whether
 * the key opens.
 *
 * Why this exists: the ERP swallows this failure — app/web's login does
 * `catch (cryptoErr) { console.warn("Key unlock failed:", cryptoErr) }` and
 * carries on — so an account whose key never opens looks fine there while the
 * kiosk, which depends on it, just says "No encryption key". This tells you
 * which it is in one run, without guessing at accounts.
 *
 * Prints no password, no key material, and no ciphertext.
 */
import readline from 'node:readline';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const crypto = require('../lib/crypto.js');

const API = (process.env.VITE_API_BASE || 'https://api.lettersheets.com').replace(/\/+$/, '');

function ask(question, { hidden = false } = {}) {
  // Echo is suppressed by overriding readline's own write hook, NOT by
  // swapping `output` for a substitute Writable: readline needs a real TTY
  // there for cursor handling, and giving it anything else leaves the prompt
  // unprinted and the process looking hung.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  let muted = false;
  rl._writeToOutput = (str) => {
    if (!muted) rl.output.write(str);
  };

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
    // Set after question() so the prompt itself is printed, then keystrokes
    // are swallowed.
    muted = hidden;
  });
}

async function call(action, body) {
  const res = await fetch(`${API}/api/execute?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload || payload.success === false) {
    throw new Error((payload && payload.error) || `HTTP ${res.status}`);
  }
  return payload.data;
}

const main = async () => {
  console.log(`\nserver: ${API}\n`);
  const email = await ask('email: ');
  const password = await ask('password: ', { hidden: true });

  let data;
  try {
    data = await call('login', { email, password });
  } catch (err) {
    console.error(`\nlogin FAILED: ${err.message}`);
    console.error('The password is wrong, or the account is locked/inactive.\n');
    process.exit(1);
  }

  const user = data.user || {};
  const companies = data.companies || [];
  console.log(`\nlogin OK — the password is correct for this account.`);
  console.log(`user id   : ${user.id}`);
  console.log(`salt      : ${user.salt ? `present (${String(user.salt).length} chars)` : 'MISSING'}`);
  console.log(`companies : ${companies.length}\n`);

  if (!user.salt) {
    console.error('No salt on the account — the key cannot be derived at all.\n');
    process.exit(1);
  }

  let anyOk = false;
  for (const c of companies) {
    const name = c.company_name || c.company_id;
    const wrapped = c.wrapped_company_key;

    if (!wrapped) {
      console.log(`  ✗ ${name}: no wrapped_company_key stored for this user`);
      continue;
    }
    const bytes = Buffer.from(String(wrapped), 'base64').length;
    console.log(`     inputs: pwd len=${password.length} | salt len=${String(user.salt).length}` +
      ` | wrapped len=${String(wrapped).length} | wrapped head=${String(wrapped).slice(0, 6)}`);
    try {
      await crypto.unlockCompanyKey(password, user.salt, wrapped);
      console.log(`  ✓ ${name}: key UNWRAPS (${bytes} bytes) — usable for the kiosk`);
      anyOk = true;
    } catch {
      console.log(`  ✗ ${name}: key does NOT unwrap (${bytes} bytes)` +
        (bytes === 40 ? ' — well-formed AES-KW, so it was wrapped under a different password' : ' — unexpected size'));
    }
  }

  console.log();
  if (anyOk) {
    console.log('Use a ✓ account/company on the kiosk setup screen.\n');
  } else {
    console.log('This account cannot open any company key.');
    console.log('Its password was almost certainly changed without re-wrapping the');
    console.log('company key (see rewrapCompanyKeys in app/web/src/utils/crypto.js).');
    console.log('Try the account that originally registered the company.\n');
  }
};

main().catch((err) => {
  console.error('\nerror:', err.message, '\n');
  process.exit(1);
});
