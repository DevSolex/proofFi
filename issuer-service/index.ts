/**
 * issuer-service/index.ts
 *
 * Mock issuer signing service.
 *
 * Produces signed BalancePayload objects using secp256k1 ECDSA.
 * The private key is loaded from issuer-service/keys/issuer-private.hex
 * at startup; that file is .gitignored.
 *
 * Variant B implementation: signature verification happens here,
 * before the payload is returned to the contract witness.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BalancePayload {
  walletCommitment: Uint8Array;  // 32 bytes
  avgBalance:       bigint;      // Uint<64>
  issuedAt:         bigint;      // Unix timestamp seconds, Uint<64>
  issuerKeyId:      Uint8Array;  // 32-byte key identifier = sha256(compressedPubKey)
}

export interface SignedPayload {
  payload:   BalancePayload;
  signature: Uint8Array;         // 64 bytes: r (32) || s (32), low-s normalised
}

// ─── Key management ───────────────────────────────────────────────────────────

const KEYS_DIR = join(import.meta.dirname ?? __dirname, 'keys');
const PRIV_KEY_FILE = join(KEYS_DIR, 'issuer-private.hex');
const PUB_KEY_FILE  = join(KEYS_DIR, 'issuer-public.hex');
const KEY_ID_FILE   = join(KEYS_DIR, 'issuer-key-id.hex');

/**
 * Generates a fresh keypair and writes it to keys/.
 * The private key file is .gitignored — never commit it.
 */
export function generateIssuerKey(): void {
  if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR, { recursive: true });
  const privKey = secp256k1.utils.randomPrivateKey();
  const pubKey  = secp256k1.getPublicKey(privKey, true);   // compressed, 33 bytes
  const keyId   = sha256(pubKey);                           // 32 bytes
  writeFileSync(PRIV_KEY_FILE, Buffer.from(privKey).toString('hex'), { mode: 0o600 });
  writeFileSync(PUB_KEY_FILE,  Buffer.from(pubKey).toString('hex'));
  writeFileSync(KEY_ID_FILE,   Buffer.from(keyId).toString('hex'));
  console.log(`Issuer keypair generated.  Key ID: ${Buffer.from(keyId).toString('hex')}`);
}

/**
 * Loads the issuer private key from disk.
 * Throws if the file is missing — callers must run generateIssuerKey() first.
 */
export function loadIssuerPrivateKey(): Uint8Array {
  if (!existsSync(PRIV_KEY_FILE)) {
    throw new Error(
      `Issuer private key not found at ${PRIV_KEY_FILE}.\n` +
      `Run: npx tsx issuer-service/index.ts generate`
    );
  }
  return Buffer.from(readFileSync(PRIV_KEY_FILE, 'utf8').trim(), 'hex');
}

export function loadIssuerPublicKey(): Uint8Array {
  return Buffer.from(readFileSync(PUB_KEY_FILE, 'utf8').trim(), 'hex');
}

export function loadIssuerKeyId(): Uint8Array {
  return Buffer.from(readFileSync(KEY_ID_FILE, 'utf8').trim(), 'hex');
}

// ─── Payload encoding ─────────────────────────────────────────────────────────

/**
 * Serialises a BalancePayload to a canonical 128-byte buffer for signing.
 *
 * Layout (big-endian):
 *   [0..32)   walletCommitment (32 bytes)
 *   [32..40)  avgBalance       (8 bytes, BE uint64)
 *   [40..48)  issuedAt         (8 bytes, BE uint64)
 *   [48..80)  issuerKeyId      (32 bytes)
 *
 * Total: 80 bytes.  The sha256 of this buffer is the message digest signed.
 */
export function encodePayload(p: BalancePayload): Uint8Array {
  const buf = Buffer.alloc(80);
  buf.set(p.walletCommitment, 0);
  buf.writeBigUInt64BE(p.avgBalance, 32);
  buf.writeBigUInt64BE(p.issuedAt, 40);
  buf.set(p.issuerKeyId, 48);
  return new Uint8Array(buf);
}

/**
 * Hash-then-sign: returns sha256(encodePayload(p)) signed with secp256k1 ECDSA.
 * The signature is compact (r||s), 64 bytes, low-s normalised.
 */
export function signPayload(payload: BalancePayload, privateKey: Uint8Array): Uint8Array {
  const msgHash = sha256(encodePayload(payload));
  const sig = secp256k1.sign(msgHash, privateKey, { lowS: true });
  // sig.toCompactRawBytes() returns r||s, 64 bytes
  return sig.toCompactRawBytes();
}

/**
 * Verifies a compact (r||s) signature over a BalancePayload.
 * Returns true if valid, false otherwise.
 */
export function verifyPayloadSignature(
  payload:   BalancePayload,
  signature: Uint8Array,
  publicKey: Uint8Array,   // compressed 33-byte secp256k1 public key
): boolean {
  try {
    const msgHash = sha256(encodePayload(payload));
    const sig = secp256k1.Signature.fromCompact(signature);
    return secp256k1.verify(sig, msgHash, publicKey, { lowS: true });
  } catch {
    return false;
  }
}

// ─── High-level API ───────────────────────────────────────────────────────────

/**
 * Creates and signs a balance payload for a given wallet.
 *
 * @param walletCommitment  The wallet's 32-byte public commitment.
 * @param avgBalance        Average balance in atomic units.
 * @param privateKey        Issuer's private key (never leaves this service).
 * @param issuerKeyId       The 32-byte key identifier stored in the contract.
 * @param issuedAt          Optional timestamp (defaults to now).
 */
export function issuePayload(
  walletCommitment: Uint8Array,
  avgBalance:       bigint,
  privateKey:       Uint8Array,
  issuerKeyId:      Uint8Array,
  issuedAt?:        bigint,
): SignedPayload {
  const timestamp = issuedAt ?? BigInt(Math.floor(Date.now() / 1000));
  const payload: BalancePayload = {
    walletCommitment,
    avgBalance,
    issuedAt: timestamp,
    issuerKeyId,
  };
  const signature = signPayload(payload, privateKey);
  return { payload, signature };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[2] === 'generate') {
  generateIssuerKey();
}
