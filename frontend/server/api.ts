/**
 * frontend/server/api.ts
 *
 * Local simulation API server — runs in Node.js.
 *
 * The compact-runtime package depends on onchain-runtime-v4 which uses
 * readFileSync to load WASM. This cannot run in the browser. This Express
 * server exposes the contract simulation as HTTP endpoints so the React
 * frontend can call it via fetch, keeping all Node.js code server-side.
 *
 * Start with:  npx tsx frontend/server/api.ts
 * Or via:      npm run dev:api  (from repo root)
 */

import express from 'express';
import cors    from 'cors';
import { sha256 }    from '@noble/hashes/sha256';
import { secp256k1 } from '@noble/curves/secp256k1';
import {
  Contract,
  ledger,
} from '../../contract/managed/credit-attestation/contract/index.js';
import {
  createConstructorContext,
  createCircuitContext,
  dummyContractAddress,
  sampleSigningKey,
  signatureVerifyingKey,
} from '@midnight-ntwrk/compact-runtime';

const app  = express();

// Explicit CORS — allow all origins for local dev
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
app.use(express.json());

// ─── In-memory state ─────────────────────────────────────────────────────────

let _contractState: any   = null;
let _contract:     any    = null;
let _coinPubKey:   any    = null;
let _issuerPrivKey: Uint8Array | null = null;
let _issuerKeyId:   Uint8Array | null = null;
let _adminSecret:   Uint8Array | null = null;

const THRESHOLDS = { bronzeMin: 1_000n, silverMin: 5_000n, goldMin: 20_000n };
const FIXTURE_WALLETS = [
  { walletId: 'wallet-alice-broke',       avgBalance:    347n, expectedTier: 'NONE'   },
  { walletId: 'wallet-bob-sparse',        avgBalance:    999n, expectedTier: 'NONE'   },
  { walletId: 'wallet-carol-bronze',      avgBalance:  1_000n, expectedTier: 'BRONZE' },
  { walletId: 'wallet-dave-bronze-mid',   avgBalance:  3_421n, expectedTier: 'BRONZE' },
  { walletId: 'wallet-eve-silver',        avgBalance:  7_813n, expectedTier: 'SILVER' },
  { walletId: 'wallet-frank-silver-high', avgBalance: 19_999n, expectedTier: 'SILVER' },
  { walletId: 'wallet-grace-gold',        avgBalance: 20_000n, expectedTier: 'GOLD'   },
  { walletId: 'wallet-heidi-gold-rich',   avgBalance: 142_857n, expectedTier: 'GOLD'  },
];

const TIER_LABELS: Record<number, string> = { 0:'NONE', 1:'BRONZE', 2:'SILVER', 3:'GOLD' };
const _sessionAttestations = new Map<string, object>();

function encodePayload(p: any): Uint8Array {
  const buf  = new ArrayBuffer(80);
  const view = new DataView(buf);
  const u8   = new Uint8Array(buf);
  u8.set(p.walletCommitment, 0);
  view.setBigUint64(32, p.avgBalance, false);
  view.setBigUint64(40, p.issuedAt,   false);
  u8.set(p.issuerKeyId, 48);
  return u8;
}

function signPayload(payload: any, privKey: Uint8Array): Uint8Array {
  const msgHash = sha256(encodePayload(payload));
  return secp256k1.sign(msgHash, privKey, { lowS: true }).toCompactRawBytes();
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /health
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET /fixtures
app.get('/fixtures', (_req, res) => {
  res.json(FIXTURE_WALLETS.map((w, i) => ({
    walletId:     w.walletId,
    label:        `Fixture Wallet ${i + 1} (expected: ${w.expectedTier})`,
    expectedTier: w.expectedTier,
  })));
});

// POST /deploy
app.post('/deploy', async (_req, res) => {
  try {
    _issuerPrivKey = secp256k1.utils.randomPrivateKey();
    _issuerKeyId   = sha256(secp256k1.getPublicKey(_issuerPrivKey, true));
    _adminSecret   = crypto.getRandomValues(new Uint8Array(32));
    const adminCommit = sha256(_adminSecret);
    _coinPubKey = signatureVerifyingKey(sampleSigningKey());

    _contract = new Contract({
      getSignedBalancePayload: () => { throw new Error('use issueAttestation route'); },
      getWalletSecret:         (ctx: any) => [ctx.privateState, new Uint8Array(32)],
      getAdminSecret:          (ctx: any) => [ctx.privateState, _adminSecret!],
    });

    const ctorCtx = createConstructorContext(null, _coinPubKey);
    const { currentContractState } = await _contract.initialState(
      ctorCtx, adminCommit, _issuerKeyId,
      THRESHOLDS.bronzeMin, THRESHOLDS.silverMin, THRESHOLDS.goldMin,
    );
    _contractState = currentContractState;

    const state = ledger(_contractState.data);
    res.json({
      ok: true,
      issuerKeyId:      Buffer.from(_issuerKeyId).toString('hex'),
      bronzeMin:        state.bronzeMin.toString(),
      silverMin:        state.silverMin.toString(),
      goldMin:          state.goldMin.toString(),
      attestationCount: state.attestationCount.toString(),
      trustedIssuers:   1,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /issueAttestation  { walletId, useUnregisteredIssuer? }
app.post('/issueAttestation', async (req, res) => {
  if (!_contractState) return res.status(400).json({ ok: false, error: 'Not deployed yet.' });
  try {
    const { walletId, useUnregisteredIssuer = false } = req.body;
    const fixture = FIXTURE_WALLETS.find(w => w.walletId === walletId);
    if (!fixture) return res.status(400).json({ ok: false, error: `Unknown wallet: ${walletId}` });

    const walletSecret = crypto.getRandomValues(new Uint8Array(32));
    const commitment   = crypto.getRandomValues(new Uint8Array(32));
    const issuedAt     = BigInt(Math.floor(Date.now() / 1000));

    const signingKey   = useUnregisteredIssuer ? secp256k1.utils.randomPrivateKey() : _issuerPrivKey!;
    const signingKeyId = useUnregisteredIssuer
      ? sha256(secp256k1.getPublicKey(signingKey, true))
      : _issuerKeyId!;

    const payload = { walletCommitment: commitment, avgBalance: fixture.avgBalance, issuedAt, issuerKeyId: signingKeyId };
    const sig     = signPayload(payload, signingKey);

    const c = new Contract({
      getSignedBalancePayload: (ctx: any) => [ctx.privateState, [payload, sig]],
      getWalletSecret:         (ctx: any) => [ctx.privateState, walletSecret],
      getAdminSecret:          (ctx: any) => [ctx.privateState, _adminSecret!],
    });
    const ctx    = createCircuitContext('issueAttestation', dummyContractAddress(), _coinPubKey, _contractState.data, null);
    const result = await c.circuits.issueAttestation(ctx);
    _contractState = { data: result.context.callContext.currentQueryContext.state };

    const onChainCommitment = sha256(walletSecret);
    const commitHex = Buffer.from(onChainCommitment).toString('hex');
    const state  = ledger(result.context.callContext.currentQueryContext.state);
    const record = state.attestations.lookup(onChainCommitment);

    const attestation = {
      commitment: commitHex,
      tier:       Number(record.tier),
      tierLabel:  TIER_LABELS[Number(record.tier)],
      issuer:     Buffer.from(record.issuer).toString('hex').slice(0, 16) + '…',
      issuedAt:   new Date(Number(record.issuedAt) * 1000).toISOString(),
    };
    _sessionAttestations.set(commitHex, attestation);
    res.json({ ok: true, attestation });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /verifyAttestation  { commitment, minTier }
app.post('/verifyAttestation', async (req, res) => {
  if (!_contractState) return res.status(400).json({ ok: false, error: 'Not deployed yet.' });
  try {
    const { commitment, minTier } = req.body;
    const commitBytes = Buffer.from(commitment, 'hex');
    const ctx    = createCircuitContext('verifyAttestation', dummyContractAddress(), _coinPubKey, _contractState.data, null);
    const result = await _contract.circuits.verifyAttestation(ctx, commitBytes, BigInt(minTier));
    res.json({ ok: true, result: result.result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /registerIssuer  { issuerKeyId }
app.post('/registerIssuer', async (req, res) => {
  if (!_contractState) return res.status(400).json({ ok: false, error: 'Not deployed yet.' });
  try {
    const keyId = Buffer.from(req.body.issuerKeyId, 'hex');
    const c   = new Contract({
      getSignedBalancePayload: () => { throw new Error('unused'); },
      getWalletSecret:         (ctx: any) => [ctx.privateState, new Uint8Array(32)],
      getAdminSecret:          (ctx: any) => [ctx.privateState, _adminSecret!],
    });
    const ctx    = createCircuitContext('registerIssuer', dummyContractAddress(), _coinPubKey, _contractState.data, null);
    const result = await c.circuits.registerIssuer(ctx, keyId);
    _contractState = { data: result.context.callContext.currentQueryContext.state };
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /revokeIssuer  { issuerKeyId }
app.post('/revokeIssuer', async (req, res) => {
  if (!_contractState) return res.status(400).json({ ok: false, error: 'Not deployed yet.' });
  try {
    const keyId = Buffer.from(req.body.issuerKeyId, 'hex');
    const c   = new Contract({
      getSignedBalancePayload: () => { throw new Error('unused'); },
      getWalletSecret:         (ctx: any) => [ctx.privateState, new Uint8Array(32)],
      getAdminSecret:          (ctx: any) => [ctx.privateState, _adminSecret!],
    });
    const ctx    = createCircuitContext('revokeIssuer', dummyContractAddress(), _coinPubKey, _contractState.data, null);
    const result = await c.circuits.revokeIssuer(ctx, keyId);
    _contractState = { data: result.context.callContext.currentQueryContext.state };
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET or POST /ledger
app.all('/ledger', (_req, res) => {
  if (!_contractState) return res.json({ ok: false, error: 'Not deployed.' });
  try {
    const state = ledger(_contractState.data);
    res.json({
      ok: true,
      bronzeMin:        state.bronzeMin.toString(),
      silverMin:        state.silverMin.toString(),
      goldMin:          state.goldMin.toString(),
      attestationCount: state.attestationCount.toString(),
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET or POST /issuerKeyId
app.all('/issuerKeyId', (_req, res) => {
  res.json({ ok: true, issuerKeyId: _issuerKeyId ? Buffer.from(_issuerKeyId).toString('hex') : null });
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.API_PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`ProofFi simulation API running on http://localhost:${PORT}`);
});
