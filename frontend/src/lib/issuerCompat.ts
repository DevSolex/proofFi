/**
 * frontend/src/lib/issuerCompat.ts
 *
 * Browser-safe re-exports of the issuer service signing functions.
 *
 * The main issuer-service/index.ts uses Node.js fs APIs for key management
 * (loadIssuerPrivateKey etc.) which cannot run in the browser. This module
 * re-implements only the pure crypto functions needed by the frontend,
 * using the same @noble/curves + @noble/hashes stack as the backend.
 *
 * No file I/O. No key loading from disk. Keys are generated ephemerally
 * per session in contract.ts.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 }    from '@noble/hashes/sha256';

export interface BalancePayload {
  walletCommitment: Uint8Array;
  avgBalance:       bigint;
  issuedAt:         bigint;
  issuerKeyId:      Uint8Array;
}

export interface SignedPayload {
  payload:   BalancePayload;
  signature: Uint8Array;   // 64 bytes r||s, low-s normalised
}

/** Canonical 80-byte encoding — must match issuer-service/index.ts exactly. */
export function encodePayload(p: BalancePayload): Uint8Array {
  const buf = new ArrayBuffer(80);
  const view = new DataView(buf);
  const u8   = new Uint8Array(buf);
  u8.set(p.walletCommitment, 0);
  view.setBigUint64(32, p.avgBalance,  false); // BE
  view.setBigUint64(40, p.issuedAt,    false);
  u8.set(p.issuerKeyId, 48);
  return u8;
}

export function signPayload(payload: BalancePayload, privateKey: Uint8Array): Uint8Array {
  const msgHash = sha256(encodePayload(payload));
  const sig     = secp256k1.sign(msgHash, privateKey, { lowS: true });
  return sig.toCompactRawBytes();
}

export function issuePayload(
  walletCommitment: Uint8Array,
  avgBalance:       bigint,
  privateKey:       Uint8Array,
  issuerKeyId:      Uint8Array,
  issuedAt?:        bigint,
): SignedPayload {
  const timestamp = issuedAt ?? BigInt(Math.floor(Date.now() / 1000));
  const payload: BalancePayload = { walletCommitment, avgBalance, issuedAt: timestamp, issuerKeyId };
  return { payload, signature: signPayload(payload, privateKey) };
}

export function getIssuerKeyId(privateKey: Uint8Array): Uint8Array {
  return sha256(secp256k1.getPublicKey(privateKey, true));
}
