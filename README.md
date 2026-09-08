# ProofFi — Credit Attestation Contract (Wave 1)

A privacy-preserving credit-tier attestation system built on Midnight Network using the Compact language. Users prove they meet a minimum credit tier (NONE / BRONZE / SILVER / GOLD) without revealing their actual balance.

---

## Signature Verification Variant

**Variant B (witness-side verification)** was implemented for Wave 1.

The Compact standard library for toolchain 0.34.0 does include `secp256k1EcdsaVerify` as an in-circuit primitive (added in 0.34.0-rc per the release notes). However:

1. **Constraint cost**: `secp256k1EcdsaVerify` involves elliptic-curve arithmetic in-circuit, which produces a large circuit (typically k ≥ 18, tens of thousands of rows). Given the Wave 1 time budget and the fact that ZK key generation was blocked by a hardware limitation on the build machine (AVX2 required, only AVX available), completing a Variant A integration with full key generation was not feasible within the time box.

2. **Decision rule applied**: the spec states "constraint cost would consume the rest of the Wave → build Variant B." This decision was made on Day 1-2. See `docs/variant-decision.md` for the complete rationale and compiler evidence.

**What Variant B means for security**: the TypeScript witness layer (`witnesses/index.ts`) verifies the secp256k1 signature before returning any payload to the circuit. A malicious wallet frontend that bypasses the TS witness could supply an unverified payload. This is an explicitly stated trust assumption — see Trust Model below.

---

## Trust Model

This system does **not** provide trustless, self-attested credit scores. The trust model is:

1. **Issuer honesty**: the attestation is only as trustworthy as the issuer. The issuer signs a `BalancePayload` containing the wallet's average balance. The contract verifies the issuer is registered; it does not independently verify the balance figure.

2. **Issuer key custody**: if the issuer's private key is compromised, an attacker can issue arbitrary attestations. Key rotation is supported (registerIssuer / revokeIssuer), but retroactive invalidation is not implemented in Wave 1.

3. **Variant B witness trust**: in the Variant B implementation, the wallet's TS witness code performs signature verification. A modified or malicious wallet frontend could bypass this check. The on-chain `trustedIssuers.member()` assertion provides a second layer, but it cannot enforce signature correctness in-circuit.

4. **Balance privacy**: the raw average balance (`avgBalance`) never appears in ledger state. Only the tier (0–3) is stored. This privacy guarantee holds regardless of Variant A/B.

---

## Known Limitations

See `docs/known-limitations.md` for the full list. Key items:

- **Issuer honesty and key custody are out of scope.** The contract trusts whatever the registered issuer signs.
- **Admin caller-check is commit/reveal, not signature-based.** Robust but relies on admin secret remaining private. See `docs/known-limitations.md`.
- **Key revocation does not retroactively invalidate prior attestations.** Attestations issued before a key revocation remain valid on-chain.
- **Variant B: signature not verified in-circuit.** A modified wallet frontend can bypass the TS-side check. Variant A would eliminate this; it is documented as a Wave 2 improvement.
- **ZK key generation disabled on this build machine.** The `--skip-zk` flag is used because the `zkir` binary requires AVX2 CPU instructions. The generated circuits are correct; proofs cannot be generated on this hardware. Proving keys should be generated on compatible hardware before mainnet deployment.

---

## Repository Structure

```
/contract
  credit-attestation.compact       # the contract
  hello.compact                    # hello-world toolchain verification
  /managed                          # compiler output (gitignored)
/issuer-service
  index.ts                          # signing service + key management
  sample-data.ts                    # fixture wallets spanning all tier bands
  keys/                             # issuer keypair (gitignored, never commit)
/witnesses
  index.ts                          # Variant B witness implementations
/tests
  contract.test.ts                  # unit tests for witness layer and tier logic
  issuer-service.test.ts            # sign→verify round-trip and tamper tests
  smoke-test.ts                     # scripted six-step smoke test (§6)
/docs
  variant-decision.md
  known-limitations.md
README.md
```

---

## Reproducing the Smoke Test (§6)

Prerequisites:
- Node.js 22+
- The compact toolchain installed and on PATH (see §1)

```bash
# 1. Install dependencies
npm install

# 2. Generate issuer keypair (writes to issuer-service/keys/ — gitignored)
npm run issuer:generate

# 3. Compile the contract
npm run compile

# 4. Run unit tests
npm test

# 5. Run the six-step smoke test
npm run smoke-test
```

The smoke test (`tests/smoke-test.ts`) runs all six steps uninterrupted and exits with code 0 on success, 1 on any failure.

### Six steps, explicitly:

1. Deploy contract with one registered issuer and thresholds (bronze=1000, silver=5000, gold=20000).
2. Issuer service signs a "silver-tier" balance (7813) for a test wallet.
3. Call `issueAttestation`; confirm the ledger shows a `SILVER` attestation and no balance figure anywhere.
4. Call `verifyAttestation` for that commitment with `minTier = BRONZE` → expect `true`.
5. Call `verifyAttestation` for that commitment with `minTier = GOLD` → expect `false`.
6. Attempt `issueAttestation` with a payload signed by an unregistered key → expect failure (witness rejects at step 6 with "not in the local trusted-issuer map").

---

## Wave 2 Non-Goals (named, not built)

- Live bank/exchange API integration
- Multi-issuer aggregation
- zkTLS-based verification
- Retroactive revocation of attestations on issuer key revoke
- Variant A (in-circuit secp256k1 verification)
- Any UI beyond the smoke test script
