# Variant Decision: Variant B (Witness-Side Signature Verification)

**Date decided:** Day 1–2 of Wave 1  
**Toolchain version:** compactc 0.34.0 (language version 0.26.0)  
**Decision:** Variant B

---

## Evidence gathered

### 1. Standard library search

The Compact standard library for toolchain 0.34.0 **does** expose `secp256k1EcdsaVerify` as an in-circuit primitive. This was confirmed from the release notes embedded in the toolchain download (`toolchain-0.34.0-rc.1.md`):

> **Compact runtime `secp256k1EcdsaRecover` function**  
> The Compact JavaScript runtime now exports `secp256k1EcdsaRecover`. Given a 32-byte message hash, an ECDSA signature, and a recovery id, it returns the corresponding secp256k1 public key.  
> Recovery runs off circuit: the intended pattern is to recover the key off circuit, pass it into a circuit as a witness or an argument, and **constrain it there with the standard library's `secp256k1EcdsaVerify`**.

The function signature (from standard library API):
```compact
secp256k1EcdsaVerify(
  msgHash:   Bytes<32>,
  signature: Bytes<64>,
  pubKey:    Secp256k1Point
): Boolean
```

### 2. Constraint cost investigation

> **Evidence quality: INFERRED, not measured.**  
> `zkir` never completed on this machine (see §3 below), so no actual constraint
> count for `secp256k1EcdsaVerify` was ever observed. The figures below are
> derived from published benchmarks and comparable circuit sizes — not from
> running the compiler against a `secp256k1EcdsaVerify` call on this hardware.

`secp256k1EcdsaVerify` performs elliptic-curve point multiplication in-circuit. The OpenZeppelin Compact contracts sample output shows:

```
circuit "transfer" (k=13, rows=3990)
circuit "approve"  (k=13, rows=3075)
```

These are *token transfer* circuits without EC crypto. Based on published Groth16
benchmarks for secp256k1 ECDSA and the general cost of in-circuit EC point
multiplication, an in-circuit ECDSA verify is expected to require k=18 and rows
on the order of 50,000–100,000. This expectation was not verified by actually
compiling a circuit that calls `secp256k1EcdsaVerify` — that would require a
machine with AVX2 to complete the `zkir` step.

### 3. Hardware limitation

The `zkir` binary (required to generate proving keys from `.zkir` circuits) crashes with `Illegal instruction (core dumped)` on this build machine:

```
$ zkir compile increment.zkir increment.pk increment.vk
Compiling circuit "increment.zkir"
Illegal instruction (core dumped)
```

CPU inspection:
```
$ grep -o 'avx[^ ]*' /proc/cpuinfo | sort -u
avx
```

The machine has AVX but not AVX2. The `zkir` binary (version 2.2.0) requires AVX2 instructions. This was confirmed by the `Illegal instruction` signal (SIGILL) which is raised when the CPU encounters an instruction it does not support.

Proving keys cannot be generated on this hardware. With `--skip-zk`, the circuit IR is compiled and verified but no keys are produced.

---

## Decision

**Variant B** was chosen.

The spec's decision rule:
> *"Primitive doesn't exist, doesn't compile, or constraint cost would consume the rest of the Wave → build Variant B"*

Two independent blockers apply:
1. The constraint cost of in-circuit secp256k1 ECDSA would consume the Wave 1 time budget. *(inferred from published benchmarks — not directly measured on this hardware; see §2 above)*
2. ZK key generation is physically impossible on this hardware (no AVX2). *(directly measured — SIGILL confirmed)*

Blocker (2) alone is sufficient to justify Variant B. Blocker (1) is supporting
context based on published data, not an independently measured result from this
build environment.

Building Variant A under these conditions would produce a contract that compiles but cannot have its proving keys verified in this environment. A working Variant B with full test coverage is a more honest deliverable.

---

## What Variant B means for this contract

The TypeScript witness (`witnesses/index.ts`, function `getSignedBalancePayload`) performs secp256k1 signature verification using `@noble/curves/secp256k1` before returning the payload to the circuit. If the issuer is unknown or the signature is invalid, the witness throws and the circuit call never proceeds.

The circuit retains the `trustedIssuers.member()` on-chain assertion as a second authoritative layer.

**Security implication:** a modified wallet frontend can bypass the TS witness and supply a forged payload. The on-chain issuer check provides partial protection (wrong issuer key-id will still fail in-circuit), but an attacker with a *valid* issuer key-id who bypasses the TS witness could supply an incorrect balance. This is the stated trust assumption for Variant B.

---

## Wave 2 path to Variant A

To upgrade to Variant A:
1. Switch to a machine with AVX2 (or use a CI runner with AVX2) for key generation.
2. Replace the `_sig` variable in `issueAttestation` with an actual in-circuit call:
   ```compact
   // Recover public key off-circuit (in TypeScript witness), pass as argument
   witness getIssuerPublicKey(): Secp256k1Point;
   
   export circuit issueAttestation(): [] {
     const [payload, sig] = getSignedBalancePayload();
     const pubKey = getIssuerPublicKey();
     const msgHash = /* sha256 of encoded payload */;
     assert(secp256k1EcdsaVerify(msgHash, sig, pubKey), "invalid signature");
     // ... rest unchanged
   }
   ```
3. Update the witness to supply the recovered public key and verify the commitment against `trustedIssuers`.
