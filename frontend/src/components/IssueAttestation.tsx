/**
 * frontend/src/components/IssueAttestation.tsx
 *
 * §5.2 — Smoke test steps 2 & 3.
 * Shows issuer key-id and timestamp from the payload — NEVER the raw balance.
 * The untrusted-issuer failure path (step 6) is triggered via the checkbox.
 */

import { useState } from 'react';
import { issueAttestation, getCurrentIssuerKeyId, FIXTURE_WALLETS } from '../lib/contract.js';
import type { AttestationRecord } from '../types/index.js';
import { TIER_LABELS } from '../types/index.js';

interface Props {
  disabled:   boolean;
  onIssued:   (record: AttestationRecord, log: string) => void;
  onFailed:   (reason: string, log: string) => void;
}

export function IssueAttestation({ disabled, onIssued, onFailed }: Props) {
  const [selectedWallet, setSelectedWallet] = useState<string>(FIXTURE_WALLETS[0].walletId);
  const [useUnregistered, setUseUnregistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<AttestationRecord | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function handleIssue() {
    setLoading(true); setResult(null); setError(null);
    try {
      const record = await issueAttestation(selectedWallet, useUnregistered);
      setResult(record);
      onIssued(record, `issueAttestation(${selectedWallet}) → tier=${TIER_LABELS[record.tier]}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onFailed(msg, `issueAttestation(${selectedWallet}) → FAILED: ${msg}`);
    } finally { setLoading(false); }
  }

  return (
    <section data-testid="issue-attestation" style={S.section}>
      <h2 style={S.h2}>Steps 2 & 3 — Issue Attestation</h2>

      <div style={S.row}>
        <label style={S.label}>Fixture wallet</label>
        <select
          data-testid="wallet-selector"
          value={selectedWallet}
          onChange={e => setSelectedWallet(e.target.value)}
          style={S.select}
          disabled={disabled || loading}
        >
          {FIXTURE_WALLETS.map((w, i) => (
            <option key={w.walletId} value={w.walletId}>
              {/* Generic label per §5.2 — no PII, no balance shown */}
              Fixture Wallet {i + 1} (expected: {w.expectedTier})
            </option>
          ))}
        </select>
      </div>

      <div style={{ ...S.row, alignItems:'center', gap:'8px', margin:'10px 0' }}>
        <input
          type="checkbox"
          id="unregistered"
          data-testid="unregistered-issuer-toggle"
          checked={useUnregistered}
          onChange={e => setUseUnregistered(e.target.checked)}
          disabled={disabled || loading}
        />
        <label htmlFor="unregistered" style={{ fontSize:'12px', color:'#f88', cursor:'pointer' }}>
          Use unregistered issuer key (smoke-test step 6 — expect failure)
        </label>
      </div>

      <button
        data-testid="issue-btn"
        onClick={handleIssue}
        disabled={disabled || loading}
        style={S.btn}
      >
        {loading ? '⏳ Submitting issueAttestation…' : 'Submit issueAttestation'}
      </button>

      {result && !useUnregistered && (
        <div data-testid="issue-result" style={{ ...S.resultBox, borderColor:'#2a5' }}>
          <p>✅ Attestation issued</p>
          <p style={S.mono}>Tier: <strong data-testid="issued-tier">{TIER_LABELS[result.tier]}</strong></p>
          <p style={S.mono}>Commitment: <span data-testid="issued-commitment">{result.commitment.slice(0, 20)}…</span></p>
          <p style={S.mono}>Issuer: {result.issuer}</p>
          <p style={S.mono}>Issued at: {result.issuedAt}</p>
          {/* §0 Non-Negotiable #2: raw balance is NOT shown here — there is none to show */}
          <p style={{ fontSize:'11px', color:'#555', marginTop:'8px' }}>
            ℹ️ Raw balance is not stored on-chain — only the tier is disclosed.
          </p>
        </div>
      )}

      {error && (
        <div data-testid="issue-error" style={{ ...S.resultBox, borderColor:'#a44' }}>
          <p>❌ issueAttestation failed</p>
          <p style={{ ...S.mono, color:'#f88' }}>{error}</p>
        </div>
      )}
    </section>
  );
}

const S = {
  section:   { padding:'16px', borderBottom:'1px solid #333' },
  h2:        { fontSize:'14px', fontWeight:'bold' as const, marginBottom:'12px', color:'#aaa', textTransform:'uppercase' as const, letterSpacing:'1px' },
  row:       { display:'flex', flexDirection:'column' as const, gap:'4px', marginBottom:'12px' },
  label:     { fontSize:'12px', color:'#888' },
  select:    { background:'#1a1a1a', border:'1px solid #444', color:'#e0e0e0', padding:'6px 8px', borderRadius:'3px', fontSize:'13px' },
  btn:       { background:'#1a3a6a', border:'1px solid #3a6ab0', color:'#90b8ff', padding:'8px 16px', cursor:'pointer', borderRadius:'3px' },
  resultBox: { marginTop:'12px', padding:'12px', border:'1px solid #444', borderRadius:'4px', lineHeight:'1.6' },
  mono:      { fontFamily:'monospace', fontSize:'12px' },
};
