/**
 * frontend/src/components/Overview.tsx
 *
 * §5.1 — Read-only contract state summary.
 */

import { useEffect, useState } from 'react';
import { initContract, getLedgerState } from '../lib/contract.js';

interface LedgerSummary {
  trustedIssuers:   number;
  bronzeMin:        bigint;
  silverMin:        bigint;
  goldMin:          bigint;
  attestationCount: bigint;
}

interface Props { onReady: () => void; }

export function Overview({ onReady }: Props) {
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function deploy() {
    setLoading(true); setError(null);
    try {
      const result = await initContract();
      setSummary(result);
      onReady();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!summary) return;
    const id = setInterval(async () => {
      const s = await getLedgerState();
      if (s) setSummary(p => p ? { ...p, attestationCount: s.attestationCount } : p);
    }, 2000);
    return () => clearInterval(id);
  }, [!!summary]);

  return (
    <section data-testid="overview" style={S.section}>
      <h2 style={S.h2}>Step 1 — Deploy Contract + Overview</h2>
      {!summary && (
        <>
          <p style={S.hint}>Deploys locally with one registered issuer and default thresholds.</p>
          <button data-testid="deploy-btn" onClick={deploy} disabled={loading} style={S.btn}>
            {loading ? '⏳ Deploying…' : 'Deploy Contract'}
          </button>
          {error && <p data-testid="deploy-error" style={S.err}>❌ {error}</p>}
        </>
      )}
      {summary && (
        <div data-testid="ledger-summary" style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
          <Row label="Trusted issuers"    value={String(summary.trustedIssuers)} />
          <Row label="Bronze threshold"   value={`≥ ${summary.bronzeMin}`} />
          <Row label="Silver threshold"   value={`≥ ${summary.silverMin}`} />
          <Row label="Gold threshold"     value={`≥ ${summary.goldMin}`} />
          <Row label="Attestations issued" value={String(summary.attestationCount)} id="attestation-count" />
        </div>
      )}
    </section>
  );
}

function Row({ label, value, id }: { label: string; value: string; id?: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #222' }}>
      <span style={{ color:'#888', fontSize:'12px' }}>{label}</span>
      <span data-testid={id} style={{ fontFamily:'monospace', fontSize:'12px' }}>{value}</span>
    </div>
  );
}

const S = {
  section: { padding:'16px', borderBottom:'1px solid #333' },
  h2:      { fontSize:'14px', fontWeight:'bold' as const, marginBottom:'12px', color:'#aaa', textTransform:'uppercase' as const, letterSpacing:'1px' },
  btn:     { background:'#1a3a6a', border:'1px solid #3a6ab0', color:'#90b8ff', padding:'8px 16px', cursor:'pointer', borderRadius:'3px' },
  hint:    { marginBottom:'12px', color:'#888', fontSize:'13px' },
  err:     { color:'#f88', marginTop:'8px', fontSize:'13px' },
};
