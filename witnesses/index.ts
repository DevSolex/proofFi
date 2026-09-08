/**
 * witnesses/index.ts
 *
 * Compact witness implementations for the credit-attestation contract.
 *
 * These are the TypeScript callbacks the Compact runtime invokes when
 * a circuit calls `getSignedBalancePayload()`, `getWalletSecret()`, or
 * `getAdminSecret()`.
 *
 * VARIANT B: `getSignedBalancePayload` verifies the secp256k1 signature
 * before returning.  If verification fails — or if the issuer is not in
 * the caller's local trusted-issuer map — it throws.  The circuit therefore
 * never receives an un-verified payload.
 *
 * The circuit still performs its own on-chain `trustedIssuers.member()` check
 * as a second, authoritative layer.
 */

import { verifyPayloadSignature, loadIssuerPublicKey, type BalancePayload } from '../issuer-service/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The wire format expected by the Compact contract:
 *   [BalancePayload, Bytes<64>]
 * where Bytes<64> is the compact (r||s) secp256k1 signature.
 */
export interface WitnessPayloadResult {
  payload:   BalancePayload;
  signature: Uint8Array;   // 64 bytes
}

// ─── Witness context ──────────────────────────────────────────────────────────

/**
 * WitnessContext holds the per-call inputs that the witness implementations
 * need.  Callers construct this and pass it when building the transaction.
 */
export interface WitnessContext {
  /** The signed payload to hand to the circuit. */
  signedPayload: WitnessPayloadResult;

  /**
   * The caller's private wallet secret (32 bytes).
   * persistentHash(walletSecret) == the commitment stored on-chain.
   * This must be kept private; never pass on-chain state as this value.
   */
  walletSecret: Uint8Array;

  /**
   * Admin secret (32 bytes), only required for registerIssuer / revokeIssuer.
   * persistentHash(adminSecret) == adminCommitment on the ledger.
   */
  adminSecret?: Uint8Array;

  /**
   * Set of currently trusted issuer public keys (compressed, 33 bytes each),
   * keyed by their hex key-id.  Used by getSignedBalancePayload for the
   * Variant B pre-verification step.
   */
  trustedIssuerPublicKeys: Map<string, Uint8Array>;
}

// ─── Witness implementations ──────────────────────────────────────────────────

/**
 * getSignedBalancePayload — Variant B implementation.
 *
 * Steps:
 *  1. Retrieve the signed payload from context.
 *  2. Look up the issuer's compressed public key by key-id.
 *  3. Verify the ECDSA signature.  Throw if verification fails.
 *  4. Return [payload, signature] to the circuit.
 *
 * The circuit will ALSO check trustedIssuers.member() against the on-chain
 * Map.  The check here is a client-side defence-in-depth layer.
 */
export function getSignedBalancePayload(
  ctx: WitnessContext
): [BalancePayload, Uint8Array] {
  const { payload, signature } = ctx.signedPayload;

  // Resolve the issuer's public key by key-id
  const keyIdHex = Buffer.from(payload.issuerKeyId).toString('hex');
  const pubKey   = ctx.trustedIssuerPublicKeys.get(keyIdHex);

  if (!pubKey) {
    throw new Error(
      `[Variant B] Issuer key-id ${keyIdHex} is not in the local trusted-issuer map. ` +
      `Payload rejected before reaching the circuit.`
    );
  }

  // Verify the signature over the payload
  const valid = verifyPayloadSignature(payload, signature, pubKey);
  if (!valid) {
    throw new Error(
      `[Variant B] Signature verification failed for issuer ${keyIdHex}. ` +
      `Payload rejected before reaching the circuit.`
    );
  }

  return [payload, signature];
}

/**
 * getWalletSecret — returns the caller's private wallet secret.
 *
 * The Compact circuit derives the on-chain commitment via:
 *   commitment = persistentHash(walletSecret)
 *
 * This secret must never be derivable from any on-chain state; if it were,
 * the unlinkability property (no link between commitment and real identity)
 * would be void.
 */
export function getWalletSecret(ctx: WitnessContext): Uint8Array {
  return ctx.walletSecret;
}

/**
 * getAdminSecret — returns the admin's private secret.
 *
 * The circuit checks: persistentHash(adminSecret) == adminCommitment
 * to authorise registerIssuer / revokeIssuer calls.
 */
export function getAdminSecret(ctx: WitnessContext): Uint8Array {
  if (!ctx.adminSecret) {
    throw new Error('getAdminSecret: adminSecret not provided in witness context');
  }
  return ctx.adminSecret;
}

// ─── Convenience builder ──────────────────────────────────────────────────────

/**
 * Builds a WitnessContext for the default (issuer-service) setup.
 * In tests, `trustedIssuerPublicKeys` is pre-populated from the generated keys.
 */
export function buildDefaultWitnessContext(
  signedPayload:            WitnessPayloadResult,
  walletSecret:             Uint8Array,
  issuerKeyId:              Uint8Array,
  issuerPublicKey:          Uint8Array,
  adminSecret?:             Uint8Array,
): WitnessContext {
  const trustedIssuerPublicKeys = new Map<string, Uint8Array>();
  trustedIssuerPublicKeys.set(
    Buffer.from(issuerKeyId).toString('hex'),
    issuerPublicKey
  );

  return {
    signedPayload,
    walletSecret,
    adminSecret,
    trustedIssuerPublicKeys,
  };
}
