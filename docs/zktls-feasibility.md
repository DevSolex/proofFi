# zkTLS Feasibility Note — Wave 3 Research Spike

**Issue:** #9  
**Scope:** Research spike (no implementation)  
**Author:** DevSolex  
**Status:** Feasible via Variant B pattern; in-circuit verification is a Wave 3+ item

---

## What Problem zkTLS Solves

The current Variant B model has one unresolved trust assumption: **issuer
honesty**. The issuer fetches a balance from a data source (Plaid, a bank API)
and signs it. If the issuer lies about the balance, the resulting attestation
tier is wrong. There is no cryptographic proof binding the signed `avgBalance`
to an actual server response.

zkTLS addresses this by letting a user prove that a specific value (e.g., their
account balance) appeared in a real HTTPS response from a real server, without
revealing their credentials or the full response body. The issuer's role shifts
from "trusted signer of claimed data" to "trusted signer of proven data."

This does **not** replace Variant A (`secp256k1EcdsaVerify`). Variant A
addresses whether the issuer's *signature* is valid. zkTLS addresses whether
the *underlying data* the issuer signed is authentic.

---

## Toolchains Evaluated

### 1. Reclaim Protocol

**What it does:** a user runs an HTTP proxy witness that observes their TLS
session with a target server (e.g., a bank). The witness attests that specific
data appeared in the response. A Groth16 ZK proof is generated off-device,
proving the data is authentic without revealing session secrets.

**Proof output format:** a JSON object containing:
- `claimData`: extracted fields (e.g., `{"balance": "7813"}`)
- `signatures`: array of ECDSA signatures from witness nodes
- `witnesses`: list of witness node addresses that co-signed

**TypeScript SDK:** `@reclaimprotocol/js-sdk` — available on npm, active
maintenance as of 2025. Proof generation runs off-circuit in the browser or
a Node.js backend.

**Compact witness compatibility:**
The Reclaim proof is a JSON blob with ECDSA signatures from witness nodes.
The balance value can be extracted from `claimData` in the TypeScript witness
and passed to the circuit. The witness node signatures could in principle be
verified in-circuit with `secp256k1EcdsaVerify`, but this would require
verifying multiple signatures (one per witness node), significantly increasing
circuit size.

**Verdict: Variant B pattern — feasible.**  
Extract `avgBalance` from `claimData`, verify witness signatures in TypeScript,
pass the verified balance to the circuit. The circuit trusts the TS witness —
same model as the current Variant B, but with a cryptographic proof of data
authenticity backing it rather than just issuer assertion.

### 2. TLSNotary

**What it does:** uses MPC-TLS (multi-party computation over TLS) where a
notary server co-participates in the TLS session key derivation. The notary
can attest that specific data appeared in the response without seeing the
full plaintext. Output is a signed attestation that can be verified by anyone
with the notary's public key.

**Proof output format:** a binary attestation blob (Rust `tlsn` format) plus
a JSON-serialisable `Presentation` containing revealed fields. A TypeScript
library (`tlsn-js`) handles proof generation in the browser via WASM.

**TypeScript SDK:** `tlsn-js` on GitHub/npm — active, browser-focused. Proof
verification requires a Rust verifier server or WASM-compiled verifier in
Node.js.

**Compact witness compatibility:**
The notary's attestation is signed with an Ed25519 or secp256k1 key.
Verifying it in-circuit would require `secp256k1EcdsaVerify` (or an Ed25519
primitive if one becomes available). Off-circuit (Variant B): parse the
`Presentation`, extract `avgBalance`, verify the notary signature in
TypeScript, pass balance to circuit.

**Verdict: Variant B pattern — feasible but operationally heavier than
Reclaim.** Requires running a TLSNotary notary server or using a public one.
The notary is the new trust anchor — if the notary lies, the proof is still
invalid, but the notary must be trusted not to collude with the user.

### 3. DECO (Cornell / Chainlink)

**What it does:** a three-party protocol (user, server, verifier) where the
verifier co-participates in TLS without seeing plaintext. Outputs a ZK proof
that specific predicates hold over the response (e.g., "balance > 5000").

**Compact witness compatibility:** DECO is research-stage with no production
TypeScript SDK as of 2025. Not practical for Wave 3 implementation.

**Verdict: too early — skip for now.**

---

## Integration Model for ProofFi

### Recommended: Reclaim Protocol + Variant B

```
User's wallet (browser/mobile)
  └─ Reclaim SDK fetches bank balance via HTTP proxy witness
  └─ Witness nodes co-sign the extracted balance claim
  └─ Proof JSON returned: { claimData: {avgBalance: "7813"}, signatures: [...] }

TypeScript witness (witnesses/index.ts)
  └─ getSignedBalancePayload():
       1. Receive Reclaim proof JSON from wallet
       2. Verify witness node signatures over claimData (secp256k1, off-circuit)
       3. Check all signing witnesses are in a trusted-witness registry
       4. Extract avgBalance from claimData
       5. Issuer signs the BalancePayload with its own secp256k1 key
       6. Return [payload, issuerSignature] to circuit

Compact circuit (issueAttestation)
  └─ Same as current Variant B — trusts the TS witness
  └─ Asserts trustedIssuers.member(issuerKeyId) as second layer
```

The issuer's role narrows: instead of asserting "I trust this balance came
from a real bank," the issuer asserts "I trust this Reclaim proof was valid
and I signed what it says." The cryptographic burden moves from issuer
assertion to Reclaim witness attestation.

### Optional Wave 3+: In-Circuit Witness Signature Verification (Variant A-style)

If the Reclaim proof's witness signatures are secp256k1, they could be
verified in-circuit with `secp256k1EcdsaVerify`. This would remove the
Variant B trust assumption entirely — a forged witness signature could not
produce a valid proof.

**Cost:** each witness signature verification adds ~50k rows and k=18 to the
circuit (same constraint cost as Variant A). If Reclaim uses 3 witness nodes,
that's 3× the cost. Only viable once the constraint cost is benchmarked on
actual hardware.

---

## Verdict Summary

| Toolchain | Production-ready | TS SDK | Proof in-circuit | Recommended path |
|---|---|---|---|---|
| Reclaim Protocol | ✅ Yes | ✅ Yes | ⚠️ Expensive | Variant B (Wave 3) |
| TLSNotary | ✅ Yes | ✅ Yes (browser) | ⚠️ Expensive | Variant B (Wave 3) |
| DECO | ❌ Research | ❌ No | ✅ Native | Skip |

**Recommendation:** use **Reclaim Protocol** in Wave 3 with the Variant B
integration model. It is production-ready, has a TypeScript SDK, requires no
changes to the Compact contract, and adds meaningful trust guarantees over
the current issuer-assertion model. In-circuit witness signature verification
is a Wave 4+ item pending constraint cost benchmarking.

---

## Prerequisites Before Starting Wave 3 Implementation

- [ ] Reclaim Protocol sandbox tested against a bank/exchange API with
      realistic balance data
- [ ] Trusted witness registry design: which witness nodes are considered
      authoritative? How are they registered? (parallel to `trustedIssuers`)
- [ ] Decision: does the issuer still sign the payload after Reclaim
      verification, or does the Reclaim proof replace the issuer signature
      entirely? (The latter removes the issuer from the trust model.)
- [ ] Constraint cost benchmark for `secp256k1EcdsaVerify` × N witnesses
      (required before deciding whether in-circuit verification is viable)
