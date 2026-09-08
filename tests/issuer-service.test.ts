/**
 * tests/issuer-service.test.ts
 *
 * Tests for the issuer signing service:
 *  - sign → verify round-trip for every fixture wallet
 *  - tampered payload causes verification failure
 *  - wrong key causes verification failure
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import {
  issuePayload,
  verifyPayloadSignature,
  encodePayload,
  type BalancePayload,
} from '../issuer-service/index.js';
import { FIXTURE_WALLETS } from '../issuer-service/sample-data.js';

// ─── Test keypair (generated per-run, never touches disk) ─────────────────────

let issuerPrivKey: Uint8Array;
let issuerPubKey:  Uint8Array;
let issuerKeyId:   Uint8Array;

beforeAll(() => {
  issuerPrivKey = secp256k1.utils.randomPrivateKey();
  issuerPubKey  = secp256k1.getPublicKey(issuerPrivKey, true);
  issuerKeyId   = sha256(issuerPubKey);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCommitment(label: string): Uint8Array {
  // Deterministic fake commitment: sha256 of the label bytes
  return sha256(new TextEncoder().encode(label));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('issuer-service sign → verify round-trip', () => {
  for (const fixture of FIXTURE_WALLETS) {
    it(`signs and verifies: ${fixture.walletId} (expected tier: ${fixture.expectedTier})`, () => {
      const commitment = makeCommitment(fixture.walletId);
      const { payload, signature } = issuePayload(
        commitment,
        fixture.avgBalance,
        issuerPrivKey,
        issuerKeyId,
      );

      // Signature should be 64 bytes (compact r||s)
      expect(signature.length).toBe(64);

      // Payload fields should match inputs
      expect(Buffer.from(payload.walletCommitment).toString('hex'))
        .toBe(Buffer.from(commitment).toString('hex'));
      expect(payload.avgBalance).toBe(fixture.avgBalance);
      expect(Buffer.from(payload.issuerKeyId).toString('hex'))
        .toBe(Buffer.from(issuerKeyId).toString('hex'));

      // Verification must pass
      const valid = verifyPayloadSignature(payload, signature, issuerPubKey);
      expect(valid).toBe(true);
    });
  }
});

describe('issuer-service tamper detection', () => {
  it('rejects a payload with one byte mutated (avgBalance altered)', () => {
    const commitment = makeCommitment('tamper-test');
    const { payload, signature } = issuePayload(
      commitment,
      5_000n,
      issuerPrivKey,
      issuerKeyId,
    );

    // Tamper: bump avgBalance by 1
    const tamperedPayload: BalancePayload = {
      ...payload,
      avgBalance: payload.avgBalance + 1n,
    };

    const valid = verifyPayloadSignature(tamperedPayload, signature, issuerPubKey);
    expect(valid).toBe(false);
  });

  it('rejects a payload signed by a different (wrong) key', () => {
    const commitment = makeCommitment('wrong-key-test');
    const wrongPrivKey = secp256k1.utils.randomPrivateKey();
    const { payload, signature } = issuePayload(
      commitment,
      5_000n,
      wrongPrivKey,      // signed with wrong key
      issuerKeyId,
    );

    // Verify against the REGISTERED issuer public key — must fail
    const valid = verifyPayloadSignature(payload, signature, issuerPubKey);
    expect(valid).toBe(false);
  });

  it('rejects a signature with one byte flipped', () => {
    const commitment = makeCommitment('sig-flip-test');
    const { payload, signature } = issuePayload(
      commitment,
      20_000n,
      issuerPrivKey,
      issuerKeyId,
    );

    // Flip byte 0 of the signature
    const tamperedSig = new Uint8Array(signature);
    tamperedSig[0] ^= 0xff;

    const valid = verifyPayloadSignature(payload, tamperedSig, issuerPubKey);
    expect(valid).toBe(false);
  });
});

describe('issuer-service payload encoding', () => {
  it('produces a stable 80-byte encoding for the same inputs', () => {
    const commitment = makeCommitment('encoding-test');
    const payload: BalancePayload = {
      walletCommitment: commitment,
      avgBalance:       12345n,
      issuedAt:         1_750_000_000n,
      issuerKeyId:      issuerKeyId,
    };

    const encoded1 = encodePayload(payload);
    const encoded2 = encodePayload(payload);

    expect(encoded1.length).toBe(80);
    expect(Buffer.from(encoded1).toString('hex'))
      .toBe(Buffer.from(encoded2).toString('hex'));
  });
});
