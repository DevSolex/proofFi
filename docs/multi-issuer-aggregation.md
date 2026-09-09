# Multi-Issuer Aggregation — Wave 2 Design

**Issue:** #7  
**Scope:** Wave 2 design sketch (no implementation)  
**Author:** samsolo247

---

## Current State (Wave 1)

`issueAttestation` accepts a single `BalancePayload` signed by one registered
issuer. `computeTier` maps that single balance to a tier. The `trustedIssuers`
Map already supports multiple registered issuers, but only one payload is ever
used per attestation.

---

## Proposed Wave 2 Circuit: `issueAggregatedAttestation`

Rather than modifying `issueAttestation` (which would break existing
attestations), introduce a new circuit alongside it.

### New witness

```compact
// Returns N signed payloads from up to N different issuers.
// The TypeScript witness fetches and verifies each signature before returning.
witness getSignedBalancePayloads(): [[BalancePayload, Bytes<64>]];
```

TypeScript side: for each payload, look up the issuer in the local trusted map,
verify the signature (Variant B), and reject the whole batch if any signature
fails or any issuer is unregistered.

### New circuit

```compact
export circuit issueAggregatedAttestation(): [] {
  const payloads = getSignedBalancePayloads();

  // Require at least one payload
  // (Compact bounded arrays require fixed size N at compile time — see §Limitations)

  // Verify each issuer is trusted and payload is fresh
  // (loop bounded by compile-time constant MAX_ISSUERS)
  for (let i = 0; i < MAX_ISSUERS; i++) {
    const [payload, _sig] = payloads[i];
    const issuerKeyId: Bytes<32> = disclose(payload.issuerKeyId);
    assert(trustedIssuers.member(issuerKeyId), "untrusted issuer");
    assert(trustedIssuers.lookup(issuerKeyId), "issuer revoked");
    const expiry: Uint<64> = (payload.issuedAt + 86400) as Uint<64>;
    assert(blockTimeLt(disclose(expiry)), "stale payload");
  }

  // Aggregate balances and compute tier
  const aggregatedBalance = aggregateBalances(payloads);
  const tier = computeTier(aggregatedBalance);

  const secret = getWalletSecret();
  const commitment = persistentHash<Bytes<32>>(secret);

  attestations.insert(
    disclose(commitment),
    disclose(Attestation {
      tier:     tier,
      issuer:   /* sentinel key-id indicating multi-issuer */ zeroBytes32(),
      issuedAt: /* min(issuedAt across payloads) for freshness */
    })
  );
  attestationCount.increment(1);
}
```

---

## Aggregation Rule Options

### Option 1: Minimum balance (most conservative)

```compact
circuit aggregateBalances(payloads: [[BalancePayload, Bytes<64>]]): Uint<64> {
  let minBalance: Uint<64> = payloads[0].0.avgBalance;
  for (let i = 1; i < MAX_ISSUERS; i++) {
    if (payloads[i].0.avgBalance < minBalance) {
      minBalance = payloads[i].0.avgBalance;
    }
  }
  return minBalance;
}
```

**Privacy:** reveals nothing about individual balances beyond the fact that
all issuers agreed the wallet clears at least the minimum. Safest option.

**Trade-off:** a wallet with $50k at one bank and $0 at another gets tier NONE.
Penalises wallets with uneven distribution.

### Option 2: Average balance

```compact
circuit aggregateBalances(payloads: [[BalancePayload, Bytes<64>]]): Uint<64> {
  let total: Uint<64> = 0;
  for (let i = 0; i < MAX_ISSUERS; i++) {
    total = total + payloads[i].0.avgBalance;
  }
  return total / MAX_ISSUERS;
}
```

**Privacy implications:**
- The resulting tier leaks the *range* of the average (e.g., SILVER means
  average is between 5000 and 19999).
- An adversary who knows one issuer's balance can infer bounds on the other
  issuers' balances from the disclosed tier.
- This is a **worse privacy guarantee** than the minimum rule because it leaks
  relative magnitude information between issuers.

**Trade-off:** more representative of total wealth, but weaker privacy.

### Option 3: Weighted scheme

```compact
circuit aggregateBalances(payloads: [[BalancePayload, Bytes<64>]]): Uint<64> {
  // Weights stored in ledger at deploy time, summing to 100
  let weightedSum: Uint<64> = 0;
  for (let i = 0; i < MAX_ISSUERS; i++) {
    weightedSum = weightedSum + (payloads[i].0.avgBalance * weights[i]) / 100;
  }
  return weightedSum;
}
```

**Privacy implications:** same as averaging but additionally leaks that
certain issuers are considered more authoritative (weights are public ledger
state). An adversary who knows the weights and the resulting tier can narrow
the joint distribution of balances more tightly.

**Recommendation:** use **minimum** for Wave 2. Weakest disclosure, strongest
privacy guarantee. Revisit averaging only if the product story specifically
requires multi-source wealth aggregation and the privacy trade-off is
explicitly accepted.

---

## Does Aggregated Tier Reveal More Than Single-Issuer Tier?

### Single-issuer disclosure
The on-chain record reveals: tier (one of 4 values) + issuer key-id +
timestamp. An observer learns which tier bucket the wallet falls into for
one issuer's balance assessment.

### Multi-issuer disclosure (minimum rule)
The on-chain record reveals: tier (one of 4 values) + sentinel issuer
key-id + timestamp. An observer learns that **all** participating issuers
agreed the wallet meets at least the disclosed tier.

**Conclusion (minimum rule):** the aggregated disclosure is *strictly more
conservative* than a single-issuer disclosure. It reveals the same tier
information but requires all issuers to agree — a stronger statement with
no additional balance information leaked.

### Multi-issuer disclosure (average rule)
An observer who knows one issuer's assessment can infer bounds on others.
This leaks strictly more information than a single-issuer disclosure.

---

## Compact Language Limitations for Wave 2 Implementation

1. **Fixed-size arrays required.** Compact arrays must have compile-time
   constant bounds. `MAX_ISSUERS` must be a compile-time constant (e.g., 3).
   Variable-length payload lists are not supported.

2. **Loop bounds must be constant.** `for` loops must iterate over a
   compile-time-known range. This means padding shorter lists to `MAX_ISSUERS`
   with sentinel payloads (all-zero issuerKeyId, avgBalance=0) and skipping
   them in the aggregation logic.

3. **Constraint cost scales with MAX_ISSUERS.** Each additional issuer adds
   another round of Map lookups, freshness checks, and arithmetic to the
   circuit. Benchmark constraint count before committing to MAX_ISSUERS > 3.

---

## Implementation Prerequisites

- [ ] Wave 1 circuits stable on a full (non-skip-zk) build — **done** (CI run #34294924604)
- [ ] Decide on MAX_ISSUERS constant (suggest starting with 3)
- [ ] Decide on aggregation rule (recommend minimum)
- [ ] Implement `issueAggregatedAttestation` in a feature branch
- [ ] Add unit tests covering: all issuers trusted + fresh → pass; one issuer
      untrusted → fail; one payload stale → fail; correct tier for each
      aggregation rule
