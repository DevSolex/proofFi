# Live Bank/Exchange API Integration — Wave 2 Design

**Issue:** #8  
**Scope:** Wave 2 design sketch (no implementation)  
**Author:** devkryssie  
**Dependency:** Issue #1 resolved ✅ (CI run #34294924604 confirmed ZK proof generation)

---

## Current State (Wave 1)

`issuer-service/index.ts` signs fixture data from `issuer-service/sample-data.ts`.
The signing pipeline (secp256k1 ECDSA, 80-byte payload encoding) is production-ready —
the only gap is the data source feeding into it.

---

## Candidate Data Sources

### Option 1: Plaid (recommended)

**Sandbox availability:** yes — free sandbox with test credentials, no real bank required.  
**Docs:** https://plaid.com/docs/api/  
**Relevant endpoint:** `/accounts/balance/get` — returns real-time account balances.

**Signed payload compatibility:** Plaid API responses are served over HTTPS with
standard TLS but do **not** include a cryptographic signature over the response body.
The issuer service receives the balance figure and signs it with its own secp256k1 key.
This fits the current signed-issuer model exactly — Plaid is the data provider,
the issuer service is the trust anchor that signs the payload.

**Trust model implication:** the issuer trusts Plaid's HTTPS response (standard
TLS, no additional attestation). If Plaid is compromised or lies, the issuer
would sign a fraudulent payload. This is the same trust assumption as the mock —
the issuer is honest and the data source is trusted by the issuer.
zkTLS (issue #9) would remove this assumption.

### Option 2: MX Technologies

**Sandbox availability:** yes — developer sandbox available.  
**Docs:** https://docs.mx.com/  
**Relevant endpoint:** `/users/{user_guid}/accounts` with balance fields.

Same signed payload compatibility story as Plaid — HTTPS only, no body signature.
MX focuses on financial data aggregation and may have broader bank coverage than
Plaid in some regions.

### Option 3: CoinGecko / Binance (exchange balance)

**Sandbox availability:** CoinGecko is fully public (no auth for price data);
Binance has a testnet.  
**Relevant endpoint:** Binance `/api/v3/account` returns wallet balances.

Binance **does** sign API responses with HMAC-SHA256 using a user-provided secret —
closer to a verifiable payload. However HMAC requires the verifier to know the
secret, so it is not independently verifiable without sharing the HMAC key.
Still falls under the "issuer trusts the source and re-signs" model.

### Recommendation

**Start with Plaid sandbox** for Wave 2. Reasons:
- Free sandbox with realistic balance data
- Well-documented TypeScript SDK (`plaid-node`)
- Widely recognised in the fintech/neobank space — fits the product narrative
- If zkTLS becomes available (issue #9), Plaid's HTTPS responses are a
  natural target for a TLS proof

---

## Adapter Architecture

Replace the hardcoded fixture approach with a pluggable `BalanceSource` interface
that both the mock and live paths implement. The signing pipeline in `issuer-service/index.ts`
remains unchanged.

```typescript
// issuer-service/sources/types.ts

export interface BalanceSource {
  /**
   * Fetch the average balance for a given wallet/account identifier.
   * Returns the balance in atomic units (same unit as contract thresholds).
   */
  getAverageBalance(accountId: string): Promise<bigint>;
}
```

```typescript
// issuer-service/sources/mock.ts  (replaces sample-data.ts direct usage)

import { FIXTURE_WALLETS } from '../sample-data.js';
import type { BalanceSource } from './types.js';

export class MockBalanceSource implements BalanceSource {
  async getAverageBalance(accountId: string): Promise<bigint> {
    const fixture = FIXTURE_WALLETS.find(w => w.walletId === accountId);
    if (!fixture) throw new Error(`Unknown fixture wallet: ${accountId}`);
    return fixture.avgBalance;
  }
}
```

```typescript
// issuer-service/sources/plaid.ts  (Wave 2 live source)

import { PlaidApi, PlaidEnvironments, Configuration } from 'plaid';
import type { BalanceSource } from './types.js';

export class PlaidBalanceSource implements BalanceSource {
  private client: PlaidApi;

  constructor(clientId: string, secret: string, env: 'sandbox' | 'production') {
    const config = new Configuration({
      basePath: env === 'sandbox'
        ? PlaidEnvironments.sandbox
        : PlaidEnvironments.production,
      baseOptions: { headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret } },
    });
    this.client = new PlaidApi(config);
  }

  async getAverageBalance(accessToken: string): Promise<bigint> {
    const response = await this.client.accountsBalanceGet({
      access_token: accessToken,
    });
    // Sum available balances across all accounts, convert to atomic units (cents)
    const totalCents = response.data.accounts.reduce((sum, account) => {
      const available = account.balances.available ?? account.balances.current ?? 0;
      return sum + Math.round(available * 100); // dollars → cents
    }, 0);
    return BigInt(totalCents);
  }
}
```

```typescript
// issuer-service/index.ts  (updated issuePayload — Wave 2)

export async function issuePayloadFromSource(
  source: BalanceSource,
  accountId: string,
  walletCommitment: Uint8Array,
  privateKey: Uint8Array,
  issuerKeyId: Uint8Array,
): Promise<SignedPayload> {
  const avgBalance = await source.getAverageBalance(accountId);
  return issuePayload(walletCommitment, avgBalance, privateKey, issuerKeyId);
}
```

### Keeping the fixture path for offline/test use

The `MockBalanceSource` keeps the fixture path available. Tests and the smoke
test continue to use `MockBalanceSource`; the live path uses `PlaidBalanceSource`.
No existing test changes required.

```typescript
// Usage in tests (unchanged behaviour)
const source = new MockBalanceSource();
const signed = await issuePayloadFromSource(source, 'wallet-eve-silver', ...);

// Usage in production (Wave 2)
const source = new PlaidBalanceSource(
  process.env.PLAID_CLIENT_ID!,
  process.env.PLAID_SECRET!,
  'sandbox',
);
const signed = await issuePayloadFromSource(source, plaidAccessToken, ...);
```

---

## Signed Payload Compatibility Confirmation

The current `BalancePayload` struct:

```typescript
interface BalancePayload {
  walletCommitment: Uint8Array;  // 32 bytes — wallet's on-chain commitment
  avgBalance:       bigint;      // Uint<64> — sourced from the data provider
  issuedAt:         bigint;      // Unix timestamp — set by the issuer service
  issuerKeyId:      Uint8Array;  // 32 bytes — sha256(issuerPublicKey)
}
```

Plaid returns a balance figure (`available` or `current`). The issuer service
converts it to atomic units (cents) and populates `avgBalance`. All other
fields are set by the issuer service. The issuer then signs the full payload
with its secp256k1 private key.

**This fits the current signed-issuer model exactly.** No contract changes
are required. The only change is in the data-fetching layer.

If the data source cannot be trusted (i.e., Plaid is suspected of lying),
that requires zkTLS (issue #9) — a fundamentally different architecture.

---

## Implementation Checklist (Wave 2)

- [ ] Add `plaid` npm package (pinned version, e.g. `plaid@^25.0.0`)
- [ ] Create `issuer-service/sources/` directory with `types.ts`, `mock.ts`, `plaid.ts`
- [ ] Update `issuer-service/index.ts` with `issuePayloadFromSource`
- [ ] Add `PLAID_CLIENT_ID` and `PLAID_SECRET` to `.env.example` (never commit real values)
- [ ] Add integration test using Plaid sandbox credentials (separate test file, skipped in CI without credentials)
- [ ] Update smoke test to accept `--live` flag that switches to `PlaidBalanceSource`
- [ ] Confirm dependency: issue #1 ✅ done; issue #9 (zkTLS) is separate path, not a blocker
