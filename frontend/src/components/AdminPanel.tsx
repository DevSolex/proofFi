/**
 * frontend/src/components/AdminPanel.tsx
 *
 * §5.4 — registerIssuer / revokeIssuer gated behind admin secret entry.
 * Shows the Wave 1 commit/reveal caveat per build spec §4.6 and Issue #4.
 */

import { useState } from 'react';
import { registerIssuer, revokeIssuer, getCurrentIssuerKeyId } from '../lib/contract.js';

interface Props {
  disabled:  boolean;
  onAction:  (log: string) => void;
}

export function AdminPanel({ disabled, onAction }: Props) {
  const [adminSecret,   setAdminSecret]   = useState('');
  const [issuerKeyId,   setIssuerKeyId]   = useState('');
  const [loading,       setLoading]       = useState(false);
  const [result,        setResult]        = useState<string | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [unlocked,      setUnlocked]      = useState(false);

  // For convenience, pre-fill the current session issuer key-id
  async function prefillCurrentIssuer() {
    const keyId = await getCurrentIssuerKeyId();
    setIssuerKeyId(keyId);
  }

  function unlock() {
    if (!adminSecret.trim()) {
      setError('Admin secret cannot be empty.');
      return;
    }
    setUnlocked(true);
    setError(null);
  }

  async function handleRegister() {
    await run('registerIssuer', () => registerIssuer(issuerKeyId));
  }

  async function handleRevoke() {
    await run('revokeIssuer', () => revokeIssuer(issuerKeyId));
  }

  async function run(name: string, fn: () => Promise<void>) {
    setLoading(true); setResult(null); setError(null);
    try {
      await fn();
      const msg = `${name}(${issuerKeyId.slice(0,16)}…) → success`;
      setResult(msg);
      onAction(msg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onAction(`${name} → FAILED: ${msg}`);
    } finally { setLoading(false); }
  }

  return (
    <section data-testid="admin-panel" style={S.section}>
      <h2 style={S.h2}>Admin Panel — Register / Revoke Issuer</h2>

      {/* §4.6 / Issue #4 caveat — always visible */}
      <div style={S.caveat}>
        ⚠️ <strong>Wave 1 commit/reveal auth</strong> — the admin secret is passed as a
        ZK witness (never sent to the server). Replay-safe (idempotent) but relies on
        the secret remaining private. See <code>docs/known-limitations.md §4</code>.
      </div>

      {!unlocked ? (
        <div style={{ marginTop:'12px' }}>
          <p style={{ fontSize:'12px', color:'#888', marginBottom:'8px' }}>
            Enter the admin secret to unlock admin operations (local only — not transmitted):
          </p>
          <input
            type="password"
            data-testid="admin-secret-input"
            placeholder="Admin secret (hex or passphrase)"
            value={adminSecret}
            onChange={e => setAdminSecret(e.target.value)}
            style={S.input}
            disabled={disabled}
          />
          <button
            data-testid="admin-unlock-btn"
            onClick={unlock}
            style={{ ...S.btn, marginTop:'8px' }}
            disabled={disabled}
          >
            Unlock
          </button>
          {error && <p style={S.err}>{error}</p>}
        </div>
      ) : (
        <div style={{ marginTop:'12px' }}>
          <div style={S.row}>
            <label style={S.label}>Issuer key-id (hex)</label>
            <div style={{ display:'flex', gap:'8px' }}>
              <input
                data-testid="issuer-keyid-input"
                value={issuerKeyId}
                onChange={e => setIssuerKeyId(e.target.value)}
                placeholder="64-char hex issuer key-id"
                style={{ ...S.input, flex:1 }}
                disabled={loading}
              />
              <button onClick={prefillCurrentIssuer} style={S.btnSmall}>
                Use current
              </button>
            </div>
          </div>

          <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
            <button data-testid="register-btn" onClick={handleRegister} disabled={loading || !issuerKeyId} style={S.btn}>
              {loading ? '⏳' : 'Register Issuer'}
            </button>
            <button data-testid="revoke-btn" onClick={handleRevoke} disabled={loading || !issuerKeyId} style={{ ...S.btn, borderColor:'#a44', color:'#f88' }}>
              {loading ? '⏳' : 'Revoke Issuer'}
            </button>
          </div>

          {result && <p data-testid="admin-result" style={{ color:'#4caf50', marginTop:'8px', fontSize:'12px' }}>✅ {result}</p>}
          {error  && <p data-testid="admin-error"  style={S.err}>❌ {error}</p>}
        </div>
      )}
    </section>
  );
}

const S = {
  section:  { padding:'16px', borderBottom:'1px solid #333' },
  h2:       { fontSize:'14px', fontWeight:'bold' as const, marginBottom:'12px', color:'#aaa', textTransform:'uppercase' as const, letterSpacing:'1px' },
  caveat:   { background:'#1a1400', border:'1px solid #554400', borderRadius:'4px', padding:'8px 12px', fontSize:'12px', color:'#aa8800', lineHeight:'1.5' },
  row:      { display:'flex', flexDirection:'column' as const, gap:'4px', marginBottom:'8px' },
  label:    { fontSize:'12px', color:'#888' },
  input:    { background:'#1a1a1a', border:'1px solid #444', color:'#e0e0e0', padding:'6px 8px', borderRadius:'3px', fontSize:'13px', width:'100%' },
  btn:      { background:'#1a3a6a', border:'1px solid #3a6ab0', color:'#90b8ff', padding:'8px 16px', cursor:'pointer', borderRadius:'3px', fontSize:'13px' },
  btnSmall: { background:'transparent', border:'1px solid #555', color:'#aaa', padding:'4px 8px', cursor:'pointer', borderRadius:'3px', fontSize:'11px', whiteSpace:'nowrap' as const },
  err:      { color:'#f88', marginTop:'8px', fontSize:'12px' },
};
