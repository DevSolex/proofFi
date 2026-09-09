/**
 * frontend/src/lib/contract.ts
 *
 * Contract interaction helpers.
 *
 * For Wave 1, these functions simulate the contract calls using the same
 * compact-runtime local simulation approach as the backend smoke test.
 * When a real wallet is connected, they can be upgraded to use the full
 * Midnight.js provider stack.
 *
 * The important invariant: RAW BALANCE NEVER LEAVES THIS LAYER.
 * Only tier (0-3), issuer key-id, timestamp, and commitment are returned.
 */

import { sha256 } from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  Contract,
  ledger,
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — path resolved via vite alias to contract/managed output
} from '@contract/index.js';
import {
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
  sampleSigningKey,
  signatureVerifyingKey,
} from '@midnight-ntwrk/compact-runtime';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — relative path to monorepo sibling
import { issuePayload, getIssuerKeyId } from './issuerCompat.js';

// Fixture wallet data — inline the relevant subset to avoid Node.js imports
const FIXTURE_WALLETS = [
  { walletId: 'wallet-alice-broke',      avgBalance:    347n, expectedTier: 'NONE'   },
  { walletId: 'wallet-bob-sparse',       avgBalance:    999n, expectedTier: 'NONE'   },
  { walletId: 'wallet-carol-bronze',     avgBalance:  1_000n, expectedTier: 'BRONZE' },
  { walletId: 'wallet-dave-bronze-mid',  avgBalance:  3_421n, expectedTier: 'BRONZE' },
  { walletId: 'wallet-eve-silver',       avgBalance:  7_813n, expectedTier: 'SILVER' },
  { walletId: 'wallet-frank-silver-high',avgBalance: 19_999n, expectedTier: 'SILVER' },
  { walletId: 'wallet-grace-gold',       avgBalance: 20_000n, expectedTier: 'GOLD'   },
  { walletId: 'wallet-heidi-gold-rich',  avgBalance:142_857n, expectedTier: 'GOLD'   },
] as const;

const THRESHOLDS = { bronzeMin: 1_000n, silverMin: 5_000n, goldMin: 20_000n };

export { FIXTURE_WALLETS };

import type { AttestationRecord, TierValue } from '../types/index.js';


// ─── Module state (single deployed instance per session) ──────────────────────

let _contractState: any = null;
let _contract: Contract | null = null;
let _coinPubKey: any = null;
let _issuerPrivKey: Uint8Array | null = null;
let _issuerPubKey: Uint8Array | null = null;
let _issuerKeyId: Uint8Array | null = null;
let _adminSecret: Uint8Array | null = null;

// Map commitment hex → AttestationRecord (session-local)
const _sessionAttestations = new Map<string, AttestationRecord>();

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initContract(): Promise<{
  trustedIssuers: number;
  bronzeMin: bigint;
  silverMin: bigint;
  goldMin: bigint;
  attestationCount: bigint;
}> {
  _issuerPrivKey = secp256k1.utils.randomPrivateKey();
  _issuerPubKey  = secp256k1.getPublicKey(_issuerPrivKey, true);
  _issuerKeyId   = getIssuerKeyId(_issuerPrivKey);
  _adminSecret   = crypto.getRandomValues(new Uint8Array(32));
  const adminCommit = sha256(_adminSecret);

  _coinPubKey = signatureVerifyingKey(sampleSigningKey());
  _contract = new Contract({
    getSignedBalancePayload: (_ctx: unknown) => { throw new Error('use issueAttestation instead'); },
    getWalletSecret:         (ctx: any) => [ctx.privateState, new Uint8Array(32)] as [unknown, Uint8Array],
    getAdminSecret:          (ctx: any) => [ctx.privateState, _adminSecret!] as [unknown, Uint8Array],
  });

  const ctorCtx = createConstructorContext(null, _coinPubKey);
  const { currentContractState } = await _contract.initialState(
    ctorCtx,
    adminCommit,
    _issuerKeyId,
    THRESHOLDS.bronzeMin,
    THRESHOLDS.silverMin,
    THRESHOLDS.goldMin,
  );
  _contractState = currentContractState;

  const state = ledger(_contractState.data);
  return {
    trustedIssuers:  1,
    bronzeMin:       state.bronzeMin,
    silverMin:       state.silverMin,
    goldMin:         state.goldMin,
    attestationCount: state.attestationCount,
  };
}

function requireInit() {
  if (!_contract || !_contractState || !_issuerPrivKey || !_issuerKeyId) {
    throw new Error('Contract not initialised. Call initContract() first.');
  }
}

// ─── issueAttestation ─────────────────────────────────────────────────────────

export async function issueAttestation(
  fixtureWalletId: string,
  useUnregisteredIssuer = false,
): Promise<AttestationRecord> {
  requireInit();

  const fixture = FIXTURE_WALLETS.find((w: any) => w.walletId === fixtureWalletId);
  if (!fixture) throw new Error(`Unknown fixture wallet: ${fixtureWalletId}`);

  // Generate a per-call wallet secret (never the balance — this derives the commitment)
  const walletSecret = crypto.getRandomValues(new Uint8Array(32));
  const commitment   = crypto.getRandomValues(new Uint8Array(32));

  // Issue a signed payload. avgBalance stays in the signing pipeline only.
  const signingKey = useUnregisteredIssuer
    ? secp256k1.utils.randomPrivateKey()  // not in trustedIssuers
    : _issuerPrivKey!;
  const signingKeyId = useUnregisteredIssuer
    ? sha256(secp256k1.getPublicKey(signingKey, true))
    : _issuerKeyId!;

  const issuedAt = BigInt(Math.floor(Date.now() / 1000));
  const { payload, signature } = issuePayload(
    commitment,
    fixture.avgBalance,      // ← balance used only here, never returned to UI
    signingKey,
    signingKeyId,
    issuedAt,
  );

  const witnesses = {
    getSignedBalancePayload: (ctx: any) => [ctx.privateState, [payload, signature]],
    getWalletSecret:         (ctx: any) => [ctx.privateState, walletSecret],
    getAdminSecret:          (ctx: any) => [ctx.privateState, _adminSecret],
  };
  const c = new Contract(witnesses as any);

  const ctx = createCircuitContext(
    'issueAttestation',
    dummyContractAddress(),
    _coinPubKey,
    _contractState.data,
    null,
  );
  const result = await c.circuits.issueAttestation(ctx);
  _contractState = { data: result.context.callContext.currentQueryContext.state };

  // Derive the on-chain commitment (persistentHash = sha256 of walletSecret)
  const onChainCommitment = sha256(walletSecret);
  const commitHex = Buffer.from(onChainCommitment).toString('hex');

  // Read the stored attestation — confirms no balance is present
  const state   = ledger(result.context.callContext.currentQueryContext.state);
  const record  = state.attestations.lookup(onChainCommitment);

  const attestation: AttestationRecord = {
    commitment: commitHex,
    tier:       Number(record.tier),
    issuer:     Buffer.from(record.issuer).toString('hex').slice(0, 16) + '…',
    issuedAt:   new Date(Number(record.issuedAt) * 1000).toISOString(),
  };
  _sessionAttestations.set(commitHex, attestation);
  return attestation;
}

// ─── verifyAttestation ────────────────────────────────────────────────────────

export async function verifyAttestation(
  commitmentHex: string,
  minTier: TierValue,
): Promise<boolean> {
  requireInit();
  const commitment = Buffer.from(commitmentHex, 'hex');
  const ctx = createCircuitContext(
    'verifyAttestation',
    dummyContractAddress(),
    _coinPubKey,
    _contractState.data,
    null,
  );
  const result = await _contract!.circuits.verifyAttestation(ctx, commitment, BigInt(minTier));
  return result.result as boolean;
}

// ─── registerIssuer ───────────────────────────────────────────────────────────

export async function registerIssuer(issuerKeyIdHex: string): Promise<void> {
  requireInit();
  const issuerKeyId = Buffer.from(issuerKeyIdHex, 'hex');
  const c = new Contract({
    getSignedBalancePayload: (_ctx: any) => { throw new Error('unused'); },
    getWalletSecret:         (ctx: any) => [ctx.privateState, new Uint8Array(32)] as [unknown, Uint8Array],
    getAdminSecret:          (ctx: any) => [ctx.privateState, _adminSecret!] as [unknown, Uint8Array],
  });
  const ctx = createCircuitContext(
    'registerIssuer',
    dummyContractAddress(),
    _coinPubKey,
    _contractState.data,
    null,
  );
  const result = await c.circuits.registerIssuer(ctx, issuerKeyId);
  _contractState = { data: result.context.callContext.currentQueryContext.state };
}

// ─── revokeIssuer ─────────────────────────────────────────────────────────────

export async function revokeIssuer(issuerKeyIdHex: string): Promise<void> {
  requireInit();
  const issuerKeyId = Buffer.from(issuerKeyIdHex, 'hex');
  const c = new Contract({
    getSignedBalancePayload: (_ctx: any) => { throw new Error('unused'); },
    getWalletSecret:         (ctx: any) => [ctx.privateState, new Uint8Array(32)] as [unknown, Uint8Array],
    getAdminSecret:          (ctx: any) => [ctx.privateState, _adminSecret!] as [unknown, Uint8Array],
  });
  const ctx = createCircuitContext(
    'revokeIssuer',
    dummyContractAddress(),
    _coinPubKey,
    _contractState.data,
    null,
  );
  const result = await c.circuits.revokeIssuer(ctx, issuerKeyId);
  _contractState = { data: result.context.callContext.currentQueryContext.state };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getSessionAttestations(): AttestationRecord[] {
  return [..._sessionAttestations.values()];
}

export function getCurrentIssuerKeyId(): string {
  if (!_issuerKeyId) return '';
  return Buffer.from(_issuerKeyId).toString('hex');
}

export async function getLedgerState() {
  if (!_contractState) return null;
  const state = ledger(_contractState.data);
  return {
    attestationCount: state.attestationCount,
    bronzeMin:        state.bronzeMin,
    silverMin:        state.silverMin,
    goldMin:          state.goldMin,
  };
}
