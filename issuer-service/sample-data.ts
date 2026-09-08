/**
 * issuer-service/sample-data.ts
 *
 * Fixture wallets with plausible non-round average balances.
 * Tier thresholds (set at deploy time): bronzeMin=1000, silverMin=5000, goldMin=20000
 *
 * All balance figures are in USD-cents or equivalent atomic units; the specific
 * unit is irrelevant — only the tier bracket matters.
 */

export interface WalletFixture {
  walletId: string;         // human-readable label
  avgBalance: bigint;       // same unit as contract thresholds
  expectedTier: 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD';
}

/**
 * Tier thresholds used in tests and the smoke-test deploy script.
 * These must match the constructor arguments passed at deploy time.
 */
export const THRESHOLDS = {
  bronzeMin: 1_000n,   // ≥ $10.00
  silverMin: 5_000n,   // ≥ $50.00
  goldMin:   20_000n,  // ≥ $200.00
} as const;

export const FIXTURE_WALLETS: WalletFixture[] = [
  // Below BRONZE
  {
    walletId:    'wallet-alice-broke',
    avgBalance:  347n,      // $3.47 — well below bronze threshold
    expectedTier: 'NONE',
  },
  {
    walletId:    'wallet-bob-sparse',
    avgBalance:  999n,      // $9.99 — one cent below bronze
    expectedTier: 'NONE',
  },

  // BRONZE band  [1000, 5000)
  {
    walletId:    'wallet-carol-bronze',
    avgBalance:  1_000n,    // $10.00 — exactly at bronze floor
    expectedTier: 'BRONZE',
  },
  {
    walletId:    'wallet-dave-bronze-mid',
    avgBalance:  3_421n,    // $34.21
    expectedTier: 'BRONZE',
  },

  // SILVER band  [5000, 20000)
  {
    walletId:    'wallet-eve-silver',
    avgBalance:  7_813n,    // $78.13
    expectedTier: 'SILVER',
  },
  {
    walletId:    'wallet-frank-silver-high',
    avgBalance:  19_999n,   // $199.99 — one cent below gold
    expectedTier: 'SILVER',
  },

  // GOLD band  [20000, ∞)
  {
    walletId:    'wallet-grace-gold',
    avgBalance:  20_000n,   // $200.00 — exactly at gold floor
    expectedTier: 'GOLD',
  },
  {
    walletId:    'wallet-heidi-gold-rich',
    avgBalance:  142_857n,  // $1,428.57
    expectedTier: 'GOLD',
  },
];
