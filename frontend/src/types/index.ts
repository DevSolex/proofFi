/**
 * frontend/src/types/index.ts
 * Shared types used across the frontend.
 */

export type WalletState =
  | { status: 'not-detected' }
  | { status: 'detected'; wallets: WalletInfo[] }
  | { status: 'connecting'; walletName: string }
  | { status: 'connected'; address: string; walletName: string }
  | { status: 'failed'; error: string };

export interface WalletInfo {
  rdns:       string;
  name:       string;
  icon:       string;
  apiVersion: string;
  connect:    (networkId: string) => Promise<unknown>;
}

// Tier encoding matches the contract: 0=NONE 1=BRONZE 2=SILVER 3=GOLD
export const TIER_LABELS: Record<number, string> = {
  0: 'NONE',
  1: 'BRONZE',
  2: 'SILVER',
  3: 'GOLD',
};

export const TIER_VALUES = [0, 1, 2, 3] as const;
export type TierValue = typeof TIER_VALUES[number];

export interface ActivityEntry {
  id:        string;
  timestamp: string;
  circuit:   string;
  params:    string;       // redacted/summarised — never raw balance
  status:    'success' | 'failure';
  result:    string;
}

export interface AttestationRecord {
  commitment: string;     // hex
  tier:       number;
  issuer:     string;     // hex key-id (first 8 chars shown)
  issuedAt:   string;     // ISO date
}

// BUILD MODE — set at build time or runtime
export type BuildMode = 'skip-zk' | 'full-zk';
