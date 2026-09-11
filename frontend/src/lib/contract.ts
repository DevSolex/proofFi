/**
 * frontend/src/lib/contract.ts
 *
 * Browser-side contract interaction — calls the local simulation API server.
 *
 * compact-runtime depends on onchain-runtime-v4 which uses readFileSync to
 * load WASM. This cannot run in the browser. All contract simulation runs
 * in frontend/server/api.ts (Node.js) and is exposed via HTTP.
 *
 * Start the API server with: npm run dev:api
 */

import type { AttestationRecord, TierValue } from '../types/index.js';

const API = 'http://localhost:3001';

async function api<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method:  'POST',   // always POST — all simulation endpoints require POST
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? 'API error');
  return data as T;
}

// ─── Fixture wallets (fetched from server) ────────────────────────────────────

export interface FixtureWallet {
  walletId:     string;
  label:        string;
  expectedTier: string;
}

let _fixtures: FixtureWallet[] = [];

export async function getFixtures(): Promise<FixtureWallet[]> {
  if (_fixtures.length > 0) return _fixtures;
  const res = await fetch(`${API}/fixtures`);
  _fixtures = await res.json();
  return _fixtures;
}

// Export for IssueAttestation dropdown pre-render
export const FIXTURE_WALLETS: FixtureWallet[] = [];

// ─── Contract operations ──────────────────────────────────────────────────────

export async function initContract(): Promise<{
  trustedIssuers:   number;
  bronzeMin:        bigint;
  silverMin:        bigint;
  goldMin:          bigint;
  attestationCount: bigint;
}> {
  const d: any = await api('/deploy');
  // Also populate fixtures
  _fixtures = await (await fetch(`${API}/fixtures`)).json();
  FIXTURE_WALLETS.length = 0;
  FIXTURE_WALLETS.push(..._fixtures);
  return {
    trustedIssuers:   d.trustedIssuers,
    bronzeMin:        BigInt(d.bronzeMin),
    silverMin:        BigInt(d.silverMin),
    goldMin:          BigInt(d.goldMin),
    attestationCount: BigInt(d.attestationCount),
  };
}

export async function issueAttestation(
  walletId: string,
  useUnregisteredIssuer = false,
): Promise<AttestationRecord> {
  const d: any = await api('/issueAttestation', { walletId, useUnregisteredIssuer });
  return {
    commitment: d.attestation.commitment,
    tier:       d.attestation.tier,
    issuer:     d.attestation.issuer,
    issuedAt:   d.attestation.issuedAt,
  };
}

export async function verifyAttestation(
  commitmentHex: string,
  minTier: TierValue,
): Promise<boolean> {
  const d: any = await api('/verifyAttestation', { commitment: commitmentHex, minTier });
  return d.result as boolean;
}

export async function registerIssuer(issuerKeyIdHex: string): Promise<void> {
  await api('/registerIssuer', { issuerKeyId: issuerKeyIdHex });
}

export async function revokeIssuer(issuerKeyIdHex: string): Promise<void> {
  await api('/revokeIssuer', { issuerKeyId: issuerKeyIdHex });
}

export async function getLedgerState() {
  try {
    const d: any = await api('/ledger');
    return {
      attestationCount: BigInt(d.attestationCount),
      bronzeMin:        BigInt(d.bronzeMin),
      silverMin:        BigInt(d.silverMin),
      goldMin:          BigInt(d.goldMin),
    };
  } catch {
    return null;
  }
}

export async function getCurrentIssuerKeyId(): Promise<string> {
  const d: any = await api('/issuerKeyId');
  return d.issuerKeyId ?? '';
}
