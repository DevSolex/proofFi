# Known Limitations — Wave 1

This document lists every known gap, trust assumption, and explicitly deferred
feature for the Wave 1 credit attestation contract.  It is not boilerplate —
each item is a real constraint on the current system.

---

## 1. Issuer honesty is out of scope

The contract verifies that a balance payload was signed by a *registered* issuer.
It does **not** verify that the `avgBalance` figure in the payload is accurate.

If the issuer deliberately signs an inflated balance, the resulting attestation
tier will be wrong.  There is no cryptographic mechanism in this contract that
forces the issuer to be honest about the balance figure.

**Mitigation path (Wave 2):** zkTLS-based verification to prove the balance
figure came from a verifiable data source without trusting the issuer's honesty.

---

## 2. Issuer key custody is out of scope

If the issuer's secp256k1 private key is compromised, an attacker can issue
arbitrary attestations for any wallet commitment and any balance they choose.

Key rotation is supported: `registerIssuer` adds a new key, `revokeIssuer`
marks an existing key as inactive.  However, see limitation 3 below.

**Recommended practice (not enforced by the contract):** rotate issuer keys
periodically, store private keys in HSMs, and monitor for anomalous attestation
patterns.

---

## 3. Issuer key revocation does not retroactively invalidate prior attestations

When an issuer key is revoked via `revokeIssuer`, the `trustedIssuers` map
entry for that key is set to `false`.  New calls to `issueAttestation` with
that key will fail the on-chain check.

However, attestations **already committed** to the `attestations` map before
the revocation remain valid indefinitely.  They are not retroactively removed
or marked invalid.

**Why this is hard to fix:** retroactive invalidation would require either
(a) scanning and deleting past attestations keyed by issuer — expensive and
requires off-chain indexing — or (b) including an issuer-revocation epoch
in the attestation record and checking it at `verifyAttestation` time, which
complicates the circuit.  This is deferred to Wave 2.

---

## 4. Admin authentication uses commit/reveal, not an independent signature

The `registerIssuer` and `revokeIssuer` circuits authenticate the admin caller
by checking:

```compact
persistentHash(getAdminSecret()) == adminCommitment
```

where `adminCommitment` is stored on the ledger at deploy time.

This is a ZK-constrained check — to satisfy the constraint, the prover must
know the preimage of the commitment.  This is sound: an attacker who does not
know `adminSecret` cannot generate a valid proof.

**Why `ownPublicKey()` is not used:** `ownPublicKey()` is a witness value that
is unconstrained by the ZK circuit — the prover supplies it without any
protocol-level verification.  A documented Midnight pitfall.  See the security
best practices page on docs.midnight.network for details.

**Residual limitation:** if the admin secret is compromised (e.g., leaked from
the wallet that holds it), an attacker can call `registerIssuer` with their own
key and begin issuing valid attestations.  There is no on-chain mechanism to
change the admin commitment after deploy in Wave 1.  An `updateAdmin` circuit
is a Wave 2 item.

---

## 5. Variant B: signature not verified in-circuit

As documented in `docs/variant-decision.md`, signature verification happens
in the TypeScript witness layer (`witnesses/index.ts`) rather than in the
Compact circuit.

A malicious or modified wallet frontend could bypass the TS witness and supply
a payload signed by a *registered* issuer key with a fabricated balance, or
submit a proof with a handcrafted witness that skips the TS verification step.

The on-chain `trustedIssuers.member()` check provides a second layer: the
issuer key-id in the payload must match a registered, active key.  But the
circuit cannot enforce that the signature is cryptographically valid.

**Wave 2 fix:** upgrade to Variant A (in-circuit `secp256k1EcdsaVerify`) on
hardware that supports AVX2 for ZK key generation.

---

## 6. ZK proof generation — gap not yet closed

This was the single largest gap between "the logic is correct" and "this is a
working ZK submission."

### What has been tested

All 28 unit tests and the 6-step smoke test pass.  Every test runs under
`compact compile --skip-zk`.  This flag:

- Compiles `.compact` source to circuit IR (`.zkir` files) ✅
- Generates TypeScript bindings ✅
- Validates circuit well-formedness (constraint system) ✅
- **Skips** prover/verifier key generation ❌
- **Skips** actual ZK proof generation and verification ❌

The test suite therefore validates:
- Circuit logic and constraint structure
- Witness behaviour (all four circuits: `issueAttestation`, `verifyAttestation`,
  `registerIssuer`, `revokeIssuer`)
- Ledger state transitions
- Issuer signing and tamper-detection in the TypeScript layer

### What has NOT been tested

- Proving keys generated without error from `.zkir` IR
- Verifying keys generated without error
- A real ZK proof generated for any of the four circuits
- The full smoke test run against a non-`--skip-zk` build

### Root cause

**Development machine history:**

1. The original build machine had an AVX-only CPU (no AVX2).  The `zkir`
   binary (v2.2.0) requires AVX2 and crashed immediately:
   ```
   $ zkir compile credit-attestation.zkir credit-attestation.pk credit-attestation.vk
   Compiling circuit "credit-attestation.zkir"
   Illegal instruction (core dumped)
   ```
   CPU evidence from that machine:
   ```
   $ grep -o 'avx[^ ]*' /proc/cpuinfo | sort -u
   avx
   ```

2. The current dev machine **does** have AVX2 (`grep -o 'avx[^ ]*' /proc/cpuinfo`
   shows both `avx` and `avx2`), so the CPU constraint no longer applies.
   However, the `compact` toolchain binary is not installed on this machine
   (`which compact` returns nothing; `npm run compile:full` exits with
   `sh: compact: not found`).

In short: the hardware blocker has been resolved, but the toolchain has not
been reinstalled.

### Acceptance criteria for closing this gap

1. Install the `compact` toolchain (v0.34.0) on a machine where it is
   available (the current machine qualifies — it has AVX2).
2. Run `npm run compile:full` (i.e., `compact` without `--skip-zk`) for
   `credit-attestation.compact` and confirm prover/verifier keys are produced
   for all four circuits without error.
3. Run `npm run smoke-test` against the full build at least once.

**Alternatively** (for CI verification):
- Use a GitHub Actions runner (Ubuntu `ubuntu-latest` runners have AVX2) or
  an AWS EC2 `c5` / `m5` instance (all have AVX2).
- Install the toolchain in the runner and run steps 2–3 above.

**Fix:** generate keys on any AVX2-capable machine with the toolchain
installed — any post-2013 x86-64 server or standard CI runner qualifies —
before mainnet deployment or public demo.  The current machine satisfies the
CPU requirement; only a toolchain install is needed.

---

## 7. `verifyAttestation` accepts a caller-supplied `commitment`

The `verifyAttestation` circuit takes a `Bytes<32>` commitment as input.
Any caller can query any commitment.

This is intentional: the whole point is that a third party can verify a user's
tier without the user revealing their identity — they share only their
commitment.

However, an adversary who can enumerate commitments (or guess them by brute
force) could check whether a particular wallet has an attestation.  Commitments
derived from a high-entropy secret (32 random bytes from a secure RNG) are
computationally indistinguishable from random; the 32-byte space (2^256) makes
enumeration infeasible.  **Callers must use a high-entropy `walletSecret`.**

---

## 8. No UI beyond the smoke test script

Wave 1 ships only a scripted CLI smoke test.  There is no browser wallet
integration, no REST API, and no dashboard.  These are Wave 2 items.

---

## 9. Thresholds are immutable after deploy

The `bronzeMin`, `silverMin`, and `goldMin` values are set at constructor time
and cannot be changed.  An `updateThresholds` admin circuit is a Wave 2 item.
