/**
 * LetterSheets Zero-Knowledge Client
 *
 * Uses existing companies table with bigint company_id
 * Server never sees plaintext data, private keys, or DEKs
 */

import { ml_dsa87 } from '@noble/post-quantum/ml-dsa';
import { x25519 } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { randomBytes } from '@noble/hashes/utils';
import argon2 from 'argon2';

// ============================================================================
// Constants
// ============================================================================

const KEYFILE_MAGIC = Buffer.from('LSKEY');
const KEYFILE_VERSION = 1;

const WORDLIST = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
    'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
    'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
    'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
    'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
    'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
    'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
    'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
    'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
    'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
    'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
    'army', 'around', 'arrange', 'arrest'
];

// ============================================================================
// Keyfile Class
// ============================================================================

export class Keyfile {
    /**
     * @param {number} companyId - Bigint company ID from companies table
     * @param {string} keyId - Unique key identifier
     * @param {Uint8Array} signingPrivateKey - ML-DSA-87 private key
     * @param {Uint8Array} signingPublicKey - ML-DSA-87 public key
     * @param {Uint8Array} kexPrivateKey - X25519 private key
     * @param {Uint8Array} kexPublicKey - X25519 public key
     * @param {Uint8Array} companyDEK - Company data encryption key
     * @param {string} userLabel - Human-readable label
     * @param {string} role - User role
     */
    constructor(companyId, keyId, signingPrivateKey, signingPublicKey, kexPrivateKey, kexPublicKey, companyDEK, userLabel, role = 'member') {
        this.companyId = companyId;
        this.keyId = keyId;
        this.signingPrivateKey = signingPrivateKey;
        this.signingPublicKey = signingPublicKey;
        this.kexPrivateKey = kexPrivateKey;
        this.kexPublicKey = kexPublicKey;
        this.companyDEK = companyDEK;
        this.userLabel = userLabel;
        this.role = role;
    }

    /**
     * Create keyfile for enabling ZK on an existing company
     * @param {number} companyId - Existing company_id from companies table
     * @param {string} userLabel - Human-readable label
     * @returns {Promise<Keyfile>}
     */
    static async createForExistingCompany(companyId, userLabel) {
        const keyId = generateId();
        const { publicKey: signingPublicKey, secretKey: signingPrivateKey } = ml_dsa87.keygen();
        const kexPrivateKey = randomBytes(32);
        const kexPublicKey = x25519.getPublicKey(kexPrivateKey);
        const companyDEK = randomBytes(32);

        return new Keyfile(companyId, keyId, signingPrivateKey, signingPublicKey, kexPrivateKey, kexPublicKey, companyDEK, userLabel, 'owner');
    }

    /**
     * Create keyfile for joining an existing ZK-enabled company
     * @param {number} companyId - Company ID
     * @param {string} userLabel - Human-readable label
     * @param {string} role - User role
     * @param {Uint8Array} companyDEK - DEK received from admin
     * @returns {Promise<Keyfile>}
     */
    static async createForJoiningCompany(companyId, userLabel, role, companyDEK) {
        const keyId = generateId();
        const { publicKey: signingPublicKey, secretKey: signingPrivateKey } = ml_dsa87.keygen();
        const kexPrivateKey = randomBytes(32);
        const kexPublicKey = x25519.getPublicKey(kexPrivateKey);

        return new Keyfile(companyId, keyId, signingPrivateKey, signingPublicKey, kexPrivateKey, kexPublicKey, companyDEK, userLabel, role);
    }

    encrypt(data) {
        const nonce = randomBytes(12);
        const cipher = gcm(this.companyDEK, nonce);
        const ciphertext = cipher.encrypt(data);
        const result = new Uint8Array(12 + ciphertext.length);
        result.set(nonce, 0);
        result.set(ciphertext, 12);
        return result;
    }

    decrypt(encrypted) {
        const nonce = encrypted.slice(0, 12);
        const ciphertext = encrypted.slice(12);
        const cipher = gcm(this.companyDEK, nonce);
        return cipher.decrypt(ciphertext);
    }

    encryptJSON(obj) {
        return this.encrypt(new TextEncoder().encode(JSON.stringify(obj)));
    }

    decryptJSON(encrypted) {
        return JSON.parse(new TextDecoder().decode(this.decrypt(encrypted)));
    }

    createBlindIndex(value) {
        const normalized = value.toLowerCase().trim();
        return hmac(sha256, this.companyDEK, new TextEncoder().encode(normalized));
    }

    sign(message) {
        return ml_dsa87.sign(this.signingPrivateKey, message);
    }

    signRequest(action, payload = {}) {
        const request = {
            company_id: this.companyId,
            action,
            timestamp: Math.floor(Date.now() / 1000),
            nonce: generateId(),
            payload,
        };

        const requestBytes = new TextEncoder().encode(JSON.stringify(request));
        const signature = this.sign(requestBytes);

        return {
            request: requestBytes,
            signature: signature,  // Keep as Uint8Array
            key_id: this.keyId,
        };
    }

    wrapDEKForUser(recipientPublicKey) {
        const sharedSecret = x25519.getSharedSecret(this.kexPrivateKey, recipientPublicKey);
        const wrapKey = sha256(sharedSecret);
        const nonce = randomBytes(12);
        const cipher = gcm(wrapKey, nonce);
        const wrapped = cipher.encrypt(this.companyDEK);
        const result = new Uint8Array(12 + wrapped.length);
        result.set(nonce, 0);
        result.set(wrapped, 12);
        return result;
    }

    unwrapDEK(senderPublicKey, wrappedDEK) {
        const sharedSecret = x25519.getSharedSecret(this.kexPrivateKey, senderPublicKey);
        const wrapKey = sha256(sharedSecret);
        const nonce = wrappedDEK.slice(0, 12);
        const cipher = gcm(wrapKey, nonce);
        return cipher.decrypt(wrappedDEK.slice(12));
    }

    async serialize(password) {
        const salt = randomBytes(32);
        const key = await argon2.hash(password, {
            salt: Buffer.from(salt),
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4,
            hashLength: 32,
            raw: true,
        });

        const payload = JSON.stringify({
            company_id: this.companyId,
            key_id: this.keyId,
            signing_private_key: Array.from(this.signingPrivateKey),
            signing_public_key: Array.from(this.signingPublicKey),
            kex_private_key: Array.from(this.kexPrivateKey),
            kex_public_key: Array.from(this.kexPublicKey),
            company_dek: Array.from(this.companyDEK),
            user_label: this.userLabel,
            role: this.role,
        });

        const nonce = randomBytes(12);
        const cipher = gcm(key, nonce);
        const encrypted = cipher.encrypt(new TextEncoder().encode(payload));

        const result = Buffer.alloc(5 + 2 + 32 + 12 + encrypted.length);
        let offset = 0;
        KEYFILE_MAGIC.copy(result, offset); offset += 5;
        result.writeUInt16BE(KEYFILE_VERSION, offset); offset += 2;
        Buffer.from(salt).copy(result, offset); offset += 32;
        Buffer.from(nonce).copy(result, offset); offset += 12;
        Buffer.from(encrypted).copy(result, offset);

        return result;
    }

    static async parse(data, password) {
        let offset = 0;
        const magic = data.subarray(offset, offset + 5); offset += 5;
        if (!magic.equals(KEYFILE_MAGIC)) throw new Error('Invalid keyfile');

        const version = data.readUInt16BE(offset); offset += 2;
        if (version !== KEYFILE_VERSION) throw new Error('Unsupported version');

        const salt = data.subarray(offset, offset + 32); offset += 32;
        const nonce = data.subarray(offset, offset + 12); offset += 12;
        const encrypted = data.subarray(offset);

        const key = await argon2.hash(password, {
            salt: Buffer.from(salt),
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 4,
            hashLength: 32,
            raw: true,
        });

        const cipher = gcm(key, new Uint8Array(nonce));
        const decrypted = cipher.decrypt(new Uint8Array(encrypted));
        const p = JSON.parse(new TextDecoder().decode(decrypted));

        return new Keyfile(
            p.company_id, p.key_id,
            new Uint8Array(p.signing_private_key), new Uint8Array(p.signing_public_key),
            new Uint8Array(p.kex_private_key), new Uint8Array(p.kex_public_key),
            new Uint8Array(p.company_dek), p.user_label, p.role
        );
    }

    /**
     * Save keyfile to disk (encrypted with password)
     * @param {string} filepath - Path to save the keyfile
     * @param {string} password - Password to encrypt the keyfile
     */
    async saveToFile(filepath, password) {
        const fs = await import('fs/promises');
        const encrypted = await this.serialize(password);
        await fs.writeFile(filepath, encrypted);
        console.log(`Keyfile saved to: ${filepath}`);
    }

    /**
     * Load keyfile from disk
     * @param {string} filepath - Path to the keyfile
     * @param {string} password - Password to decrypt the keyfile
     * @returns {Promise<Keyfile>}
     */
    static async loadFromFile(filepath, password) {
        const fs = await import('fs/promises');
        const data = await fs.readFile(filepath);
        return Keyfile.parse(data, password);
    }
}

// ============================================================================
// Paper Recovery
// ============================================================================

export function generatePaperRecovery(companyId, companyDEK) {
    const entropy = randomBytes(32);
    const mnemonic = entropyToMnemonic(entropy);
    const recoveryKey = sha256(new TextEncoder().encode(mnemonic));

    const payload = JSON.stringify({ company_id: companyId, dek: Array.from(companyDEK), created: Date.now() });
    const nonce = randomBytes(12);
    const cipher = gcm(recoveryKey, nonce);
    const encrypted = cipher.encrypt(new TextEncoder().encode(payload));

    const recoveryBlob = new Uint8Array(12 + encrypted.length);
    recoveryBlob.set(nonce, 0);
    recoveryBlob.set(encrypted, 12);

    return { mnemonic, recoveryBlob: Array.from(recoveryBlob) };
}

export function recoverFromMnemonic(mnemonic, recoveryBlob) {
    const blob = recoveryBlob instanceof Uint8Array ? recoveryBlob : new Uint8Array(recoveryBlob);
    const recoveryKey = sha256(new TextEncoder().encode(mnemonic));
    const cipher = gcm(recoveryKey, blob.slice(0, 12));
    const decrypted = cipher.decrypt(blob.slice(12));
    return new Uint8Array(JSON.parse(new TextDecoder().decode(decrypted)).dek);
}

function entropyToMnemonic(entropy) {
    const words = [];
    for (let i = 0; i < 24; i++) {
        const idx = (entropy[i % 32] + entropy[(i + 1) % 32] * 256) % WORDLIST.length;
        words.push(WORDLIST[idx]);
    }
    return words.join(' ');
}

// ============================================================================
// ZK Client
// ============================================================================

export class ZKClient {
    constructor(serverUrl = 'http://localhost:8001') {
        this.serverUrl = serverUrl;
    }

    /**
     * Register a new company with ZK encryption
     * @param {string} companyCode - Unique company code
     * @param {Keyfile} keyfile - Owner's keyfile
     * @param {Array} recoveryBlob - Paper recovery encrypted blob
     * @param {string} companyName - Optional company name
     * @returns {Promise<Object>}
     */
    async registerCompany(companyCode, keyfile, recoveryBlob, companyName = '') {
        const url = `${this.serverUrl}/register`;
        const body = {
            company_code: companyCode,
            company_name: companyName || companyCode,
            recovery_blob: Buffer.from(recoveryBlob).toString('base64'),
            owner_key_id: keyfile.keyId,
            owner_signing_public_key: Buffer.from(keyfile.signingPublicKey).toString('base64'),
            owner_kex_public_key: Buffer.from(keyfile.kexPublicKey).toString('base64'),
            owner_label: keyfile.userLabel,
        };

        console.log(`   Calling: POST ${url}`);

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        } catch (e) {
            throw new Error(`Network error: ${e.message}. Is the server running?`);
        }

        const text = await response.text();
        console.log('   Server response:', text.substring(0, 200));

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`Invalid JSON from server: ${text.substring(0, 200)}`);
        }
        if (!response.ok) throw new Error(data.message || 'Registration failed');
        keyfile.companyId = data.data.company_id;
        return data;
    }

    async enableZKByCode(companyCode, keyfile, recoveryBlob) {
        const response = await fetch(`${this.serverUrl}/enable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                company_code: companyCode,
                recovery_blob: Buffer.from(recoveryBlob).toString('base64'),
                owner_key_id: keyfile.keyId,
                owner_signing_public_key: Buffer.from(keyfile.signingPublicKey).toString('base64'),
                owner_kex_public_key: Buffer.from(keyfile.kexPublicKey).toString('base64'),
                owner_label: keyfile.userLabel,
            }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to enable ZK');
        keyfile.companyId = data.data.company_id;
        return data;
    }

    async request(keyfile, action, payload = {}) {
        const signed = keyfile.signRequest(action, payload);
        const response = await fetch(`${this.serverUrl}/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                request: Buffer.from(signed.request).toString('base64'),
                signature: Buffer.from(signed.signature).toString('base64'),
                key_id: signed.key_id,
            }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Request failed');
        return data.data;
    }

    async storeData(keyfile, collection, docId, data, indexFields = []) {
        const encrypted = keyfile.encryptJSON(data);
        const blindIndexes = {};
        for (const field of indexFields) {
            if (data[field] !== undefined) {
                blindIndexes[field] = Buffer.from(keyfile.createBlindIndex(String(data[field]))).toString('base64');
            }
        }
        return this.request(keyfile, 'store_blob', {
            collection, doc_id: docId,
            data: Buffer.from(encrypted).toString('base64'),
            blind_indexes: blindIndexes,
        });
    }

    async getData(keyfile, collection, docId) {
        const result = await this.request(keyfile, 'get_blob', { collection, doc_id: docId });
        if (!result.data) return null;

        // Go encodes []byte as base64 string
        let encrypted;
        if (typeof result.data === 'string') {
            encrypted = Uint8Array.from(Buffer.from(result.data, 'base64'));
        } else {
            encrypted = new Uint8Array(result.data);
        }
        return keyfile.decryptJSON(encrypted);
    }

    async searchByIndex(keyfile, collection, indexName, value) {
        const result = await this.request(keyfile, 'search_blobs', {
            collection, index_name: indexName,
            index_value: Buffer.from(keyfile.createBlindIndex(value)).toString('base64'),
        });
        return result.doc_ids || [];
    }

    async listDocuments(keyfile, collection) {
        const result = await this.request(keyfile, 'list_blobs', { collection });
        return result.doc_ids || [];
    }

    async deleteDocument(keyfile, collection, docId) {
        return this.request(keyfile, 'delete_blob', { collection, doc_id: docId });
    }

    async addUserKey(adminKeyfile, keyId, signingPublicKey, kexPublicKey, userLabel, role = 'member') {
        return this.request(adminKeyfile, 'add_key', {
            key_id: keyId,
            signing_public_key: Array.from(signingPublicKey),
            kex_public_key: Array.from(kexPublicKey),
            user_label: userLabel,
            role,
        });
    }

    async revokeUserKey(adminKeyfile, keyId) {
        return this.request(adminKeyfile, 'revoke_key', { key_id: keyId });
    }

    async listKeys(keyfile) {
        const result = await this.request(keyfile, 'list_keys', {});
        return result.keys || [];
    }

    async getRecoveryBlob(companyCode) {
        const response = await fetch(`${this.serverUrl}/recovery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company_code: companyCode }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed');
        return data.data;
    }
}

// ============================================================================
// Utilities
// ============================================================================

function generateId() {
    return Array.from(randomBytes(16)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Example
// ============================================================================

async function main() {
    console.log('=== LetterSheets ZK Client ===\n');

    const client = new ZKClient(process.env.SERVER_URL || 'http://localhost:8001');
    const command = process.argv[2] || 'help';

    switch (command) {
        case 'register':
            await cmdRegister(client);
            break;
        case 'login':
            await cmdLogin(client);
            break;
        case 'invite':
            await cmdInvite(client, process.argv[3]);
            break;
        case 'join':
            await cmdJoin(client);
            break;
        case 'help':
        default:
            console.log('Usage:');
            console.log('  node client.js register              - Register new company');
            console.log('  node client.js login                 - Login with existing keyfile');
            console.log('  node client.js invite <keyfile>      - Invite a new user (owner/admin)');
            console.log('  node client.js join                  - Join company with invite file');
            console.log('');
            console.log('Environment variables:');
            console.log('  COMPANY_CODE     - Company identifier (required for register)');
            console.log('  COMPANY_NAME     - Company display name (optional)');
            console.log('  KEYFILE_PATH     - Path to keyfile (default: ./keyfile.key)');
            console.log('  KEYFILE_PASSWORD - Password for keyfile (required)');
            console.log('  SERVER_URL       - API server (default: http://localhost:8001)');
            console.log('');
            console.log('For invite:');
            console.log('  USER_LABEL       - Name/label for the new user');
            console.log('  USER_ROLE        - Role: admin or member (default: member)');
            console.log('');
            console.log('For join:');
            console.log('  INVITE_PATH      - Path to invite file');
            break;
    }
}

/**
 * Register new company and create keyfile
 */
async function cmdRegister(client) {
    const COMPANY_CODE = process.env.COMPANY_CODE;
    const COMPANY_NAME = process.env.COMPANY_NAME || COMPANY_CODE;
    const KEYFILE_PATH = process.env.KEYFILE_PATH || './keyfile.key';
    const KEYFILE_PASSWORD = process.env.KEYFILE_PASSWORD;

    if (!COMPANY_CODE) {
        console.error('❌ COMPANY_CODE is required');
        process.exit(1);
    }
    if (!KEYFILE_PASSWORD) {
        console.error('❌ KEYFILE_PASSWORD is required');
        process.exit(1);
    }

    try {
        // 1. Create keyfile with new DEK
        console.log('1. Generating encryption keys...');
        const keyfile = await Keyfile.createForExistingCompany(0, "Owner");
        console.log(`   Key ID: ${keyfile.keyId}`);

        // 2. Generate paper recovery
        console.log('\n2. Generating paper recovery...');
        const recovery = generatePaperRecovery(0, keyfile.companyDEK);
        console.log('');
        console.log('   ╔════════════════════════════════════════════════════════════════╗');
        console.log('   ║  RECOVERY MNEMONIC - WRITE THIS DOWN AND STORE SAFELY!         ║');
        console.log('   ╠════════════════════════════════════════════════════════════════╣');
        console.log(`   ║  ${recovery.mnemonic.split(' ').slice(0, 6).join(' ')}`);
        console.log(`   ║  ${recovery.mnemonic.split(' ').slice(6, 12).join(' ')}`);
        console.log(`   ║  ${recovery.mnemonic.split(' ').slice(12, 18).join(' ')}`);
        console.log(`   ║  ${recovery.mnemonic.split(' ').slice(18, 24).join(' ')}`);
        console.log('   ╠════════════════════════════════════════════════════════════════╣');
        console.log('   ║  This is the ONLY way to recover if all keyfiles are lost!     ║');
        console.log('   ╚════════════════════════════════════════════════════════════════╝');
        console.log('');

        // 3. Register with server
        console.log(`3. Registering company: ${COMPANY_CODE}...`);
        const result = await client.registerCompany(COMPANY_CODE, keyfile, recovery.recoveryBlob, COMPANY_NAME);
        console.log(`   Company ID: ${result.data.company_id}`);

        // 4. Save keyfile
        console.log(`\n4. Saving keyfile to: ${KEYFILE_PATH}`);
        await keyfile.saveToFile(KEYFILE_PATH, KEYFILE_PASSWORD);

        console.log('\n✅ Registration complete!');
        console.log(`\nNext steps:`);
        console.log(`  1. Store the recovery mnemonic in a safe place`);
        console.log(`  2. Login with: KEYFILE_PATH=${KEYFILE_PATH} KEYFILE_PASSWORD=*** node client.js login`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

/**
 * Login with existing keyfile
 */
async function cmdLogin(client) {
    const KEYFILE_PATH = process.env.KEYFILE_PATH || './keyfile.key';
    const KEYFILE_PASSWORD = process.env.KEYFILE_PASSWORD;

    if (!KEYFILE_PASSWORD) {
        console.error('❌ KEYFILE_PASSWORD is required');
        process.exit(1);
    }

    try {
        // 1. Load keyfile
        console.log(`1. Loading keyfile from: ${KEYFILE_PATH}`);
        const keyfile = await Keyfile.loadFromFile(KEYFILE_PATH, KEYFILE_PASSWORD);
        console.log(`   Key ID: ${keyfile.keyId}`);
        console.log(`   Company ID: ${keyfile.companyId}`);
        console.log(`   Role: ${keyfile.role}`);

        // 2. Test: Store data
        console.log('\n2. Storing test data...');
        const testId = `test-${Date.now()}`;
        await client.storeData(keyfile, 'customers', testId, {
            name: 'John Doe', email: 'john@example.com', ssn: '123-45-6789'
        }, ['name', 'email']);
        console.log('   ✓ Data encrypted and stored (server cannot decrypt)');

        // 3. Test: Retrieve data
        console.log('\n3. Retrieving data...');
        const retrieved = await client.getData(keyfile, 'customers', testId);
        console.log(`   ✓ Decrypted: ${JSON.stringify(retrieved)}`);

        // 4. Test: Search
        console.log('\n4. Searching by email...');
        const found = await client.searchByIndex(keyfile, 'customers', 'email', 'john@example.com');
        console.log(`   ✓ Found: ${found.join(', ')}`);

        // 5. List all docs
        console.log('\n5. Listing all customers...');
        const docs = await client.listDocuments(keyfile, 'customers');
        console.log(`   ✓ Documents: ${docs.length} total`);

        console.log('\n✅ Login successful! You are authenticated.');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

/**
 * Invite a new user (owner/admin only)
 */
async function cmdInvite(client, keyfilePath) {
    const KEYFILE_PATH = keyfilePath || process.env.KEYFILE_PATH || './keyfile.key';
    const KEYFILE_PASSWORD = process.env.KEYFILE_PASSWORD;
    const USER_LABEL = process.env.USER_LABEL;
    const USER_ROLE = process.env.USER_ROLE || 'member';

    if (!KEYFILE_PASSWORD) {
        console.error('❌ KEYFILE_PASSWORD is required');
        process.exit(1);
    }
    if (!USER_LABEL) {
        console.error('❌ USER_LABEL is required');
        process.exit(1);
    }
    if (!['admin', 'member'].includes(USER_ROLE)) {
        console.error('❌ USER_ROLE must be admin or member');
        process.exit(1);
    }

    try {
        // 1. Load inviter's keyfile
        console.log(`1. Loading your keyfile from: ${KEYFILE_PATH}`);
        const inviterKeyfile = await Keyfile.loadFromFile(KEYFILE_PATH, KEYFILE_PASSWORD);
        console.log(`   Your role: ${inviterKeyfile.role}`);

        if (inviterKeyfile.role !== 'owner' && inviterKeyfile.role !== 'admin') {
            console.error('❌ Only owner or admin can invite users');
            process.exit(1);
        }

        // 2. Generate new keys for invitee
        console.log(`\n2. Generating keys for: ${USER_LABEL}`);
        const newKeyfile = await Keyfile.createForJoiningCompany(
            inviterKeyfile.companyId,
            USER_LABEL,
            USER_ROLE,
            inviterKeyfile.companyDEK
        );
        console.log(`   New Key ID: ${newKeyfile.keyId}`);

        // 3. Register new user's public key with server (using inviter's auth)
        console.log('\n3. Registering new user with server...');
        await client.addUserKey(
            inviterKeyfile,
            newKeyfile.keyId,
            newKeyfile.signingPublicKey,
            newKeyfile.kexPublicKey,
            USER_LABEL,
            USER_ROLE
        );
        console.log('   ✓ User registered');

        // 4. Create invite file (contains everything needed to join)
        const inviteData = {
            version: 1,
            companyId: inviterKeyfile.companyId,
            keyId: newKeyfile.keyId,
            userLabel: USER_LABEL,
            role: USER_ROLE,
            signingPrivateKey: Buffer.from(newKeyfile.signingPrivateKey).toString('base64'),
            signingPublicKey: Buffer.from(newKeyfile.signingPublicKey).toString('base64'),
            kexPrivateKey: Buffer.from(newKeyfile.kexPrivateKey).toString('base64'),
            kexPublicKey: Buffer.from(newKeyfile.kexPublicKey).toString('base64'),
            inviterKexPublicKey: Buffer.from(inviterKeyfile.kexPublicKey).toString('base64'),
            wrappedDEK: Buffer.from(inviterKeyfile.wrapDEKForUser(newKeyfile.kexPublicKey)).toString('base64'),
            invitedBy: inviterKeyfile.keyId,
            invitedAt: new Date().toISOString(),
        };

        const invitePath = `./invite-${newKeyfile.keyId.substring(0, 8)}.json`;
        const fs = await import('fs/promises');
        await fs.writeFile(invitePath, JSON.stringify(inviteData, null, 2));

        console.log(`\n3. Invite file created: ${invitePath}`);
        console.log('');
        console.log('   ╔════════════════════════════════════════════════════════════════╗');
        console.log('   ║  Send this invite file securely to the new user!               ║');
        console.log('   ╠════════════════════════════════════════════════════════════════╣');
        console.log(`   ║  User: ${USER_LABEL}`);
        console.log(`   ║  Role: ${USER_ROLE}`);
        console.log(`   ║  File: ${invitePath}`);
        console.log('   ╠════════════════════════════════════════════════════════════════╣');
        console.log('   ║  New user should run:                                          ║');
        console.log(`   ║  INVITE_PATH=${invitePath} KEYFILE_PASSWORD=*** node client.js join`);
        console.log('   ╚════════════════════════════════════════════════════════════════╝');

        console.log('\n✅ Invite created successfully!');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

/**
 * Join company using invite file
 */
async function cmdJoin(client) {
    const INVITE_PATH = process.env.INVITE_PATH;
    const KEYFILE_PATH = process.env.KEYFILE_PATH || './keyfile.key';
    const KEYFILE_PASSWORD = process.env.KEYFILE_PASSWORD;

    if (!INVITE_PATH) {
        console.error('❌ INVITE_PATH is required');
        process.exit(1);
    }
    if (!KEYFILE_PASSWORD) {
        console.error('❌ KEYFILE_PASSWORD is required');
        process.exit(1);
    }

    try {
        // 1. Load invite file
        console.log(`1. Loading invite from: ${INVITE_PATH}`);
        const fs = await import('fs/promises');
        const inviteData = JSON.parse(await fs.readFile(INVITE_PATH, 'utf8'));
        console.log(`   User: ${inviteData.userLabel}`);
        console.log(`   Role: ${inviteData.role}`);

        // 2. Reconstruct keyfile from invite
        console.log('\n2. Creating your keyfile...');

        const signingPrivateKey = new Uint8Array(Buffer.from(inviteData.signingPrivateKey, 'base64'));
        const signingPublicKey = new Uint8Array(Buffer.from(inviteData.signingPublicKey, 'base64'));
        const kexPrivateKey = new Uint8Array(Buffer.from(inviteData.kexPrivateKey, 'base64'));
        const kexPublicKey = new Uint8Array(Buffer.from(inviteData.kexPublicKey, 'base64'));
        const inviterKexPublicKey = new Uint8Array(Buffer.from(inviteData.inviterKexPublicKey, 'base64'));
        const wrappedDEK = new Uint8Array(Buffer.from(inviteData.wrappedDEK, 'base64'));

        // Unwrap DEK: use our private key + inviter's public key to get shared secret
        const sharedSecret = x25519.getSharedSecret(kexPrivateKey, inviterKexPublicKey);
        const wrapKey = sha256(sharedSecret);
        const nonce = wrappedDEK.slice(0, 12);
        const cipher = gcm(wrapKey, nonce);
        const companyDEK = cipher.decrypt(wrappedDEK.slice(12));

        const keyfile = new Keyfile(
            inviteData.companyId,
            inviteData.keyId,
            signingPrivateKey,
            signingPublicKey,
            kexPrivateKey,
            kexPublicKey,
            companyDEK,
            inviteData.userLabel,
            inviteData.role
        );
        console.log(`   Key ID: ${keyfile.keyId}`);

        // 3. Key was already registered during invite, just save keyfile
        console.log(`\n3. Saving keyfile to: ${KEYFILE_PATH}`);
        await keyfile.saveToFile(KEYFILE_PATH, KEYFILE_PASSWORD);

        // 4. Delete invite file
        await fs.unlink(INVITE_PATH);
        console.log(`   ✓ Invite file deleted for security`);

        console.log('\n✅ Successfully joined! You can now login with:');
        console.log(`   KEYFILE_PATH=${KEYFILE_PATH} KEYFILE_PASSWORD=*** node client.js login`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main().catch(console.error);


/** COMPANY_CODE=TEST-001 KEYFILE_PASSWORD=secret node client.js register  **/
/** KEYFILE_PASSWORD=secret USER_LABEL="Alice" USER_ROLE=admin node client.js invite ./company.key  **/
/** KEYFILE_PATH=./company.key KEYFILE_PASSWORD=secret USER_LABEL="Alice" node client.js invite  **/
