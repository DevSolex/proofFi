/**
 * frontend/src/components/VerifyAttestation.tsx
 *
 * §5.3 — Smoke test steps 4 & 5.
 */

import { useState } from 'react';
import { verifyAttestation } from '../lib/contract.js';
import type { AttestationRecord, TierValue } from '../types/index.js';
import { TIER_LABELS } from '../types/index.js';

interface Props {
  disabled:     boolean;
  attestations: AttestationRecord[];
  onVerified:   (result: boolean, log: string) => void;
}

export function VerifyAttestation({ disabled, attestations, onVerified }: Props) {
  const [selectedCommitment, setSelectedCommitment] = useState('');
  const [minTier, setMinTier]   = useState<TierValue>(1);
  const [loading, setLoading]   = useState(false);
  const [result,  setResult]    = useState<boolean | null>(null);
  const [error,   setError]     = useState<string | null>(null);

  async function handleVerify() {
    if (!selectedCommitment) return;
    setLoading(true); setResult(null); setError(null);
    try {
      const r = await verifyAttestation(selectedCommitment, minTier);
      setResult(r);
      onVerified(r, `verifyAttestation(minTier=${TIER_LABELS[minTier]}) → ${r}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally { setLoading(false); }
  }

  return (
    <section data-testid="verify-attestation" style={S.section}>
      <h2 style={S.h2}>Steps 4 & 5 — Verify Attestation</h2>

      <div style={S.row}>
        <label style={S.label}>Commitment (from issued attestations this session)</label>
        <select
          data-testid="commitment-selector"
          value={selectedCommitment}
          onChange={e => setSelectedCommitment(e.target.value)}
          style={S.select}
          disabled={disabled || loading || attestations.length === 0}
        >
          <option value="">— select commitment —</option>
          {attestations.map(a => (
            <option key={a.commitment} value={a.commitment}>
              {a.commitment.slice(0, 16)}… (tier: {TIER_LABELS[a.tier]})
            </option>
          ))}
        </select>
      </div>

      <div style={S.row}>
        <label style={S.label}>Minimum tier required</label>
        <select
          data-testid="min-tier-selector"
          value={minTier}
          onChange={e => setMinTier(Number(e.target.value) as TierValue)}
          style={S.select}
          disabled={disabled || loading}
        >
          {([0, 1, 2, 3] as TierValue[]).map(t => (
            <option key={t} value={t}>{TIER_LABELS[t]} ({t})</option>
          ))}
        </select>
      </div>

      <button
        data-testid="verify-btn"
        onClick={handleVerify}
        disabled={disabled || loading || !selectedCommitment}
        style={S.btn}
      >
        {loading ? '⏳ Verifying…' : 'Verify'}
      </button>

      {result !== null && (
        <div
          data-testid="verify-result"
          style={{ ...S.resultBox, borderColor: result ? '#2a5' : '#a44' }}
        >
          <p>
            <strong data-testid="verify-outcome" style={{ fontSize:'18px' }}>
              {result ? '✅ true' : '❌ false'}
            </strong>
          </p>
          <p style={S.mono}>
            Commitment meets minTier={TIER_LABELS[minTier]}:{' '}
            <strong>{result ? 'YES' : 'NO'}</strong>
          </p>
        </div>
      )}

      {error && (
        <div data-testid="verify-error" style={{ ...S.resultBox, borderColor:'#a44' }}>
          <p style={{ color:'#f88' }}>❌ {error}</p>
        </div>
      )}

      {attestations.length === 0 && (
        <p style={{ fontSize:'12px', color:'#555', marginTop:'8px' }}>
          No attestations issued yet in this session. Complete Step 2 first.
        </p>
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
