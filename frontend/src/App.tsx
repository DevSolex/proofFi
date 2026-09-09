/**
 * frontend/src/App.tsx
 *
 * Main app shell. Orchestrates all five sections mapped to the six smoke-test steps.
 */

import { useState, useCallback } from 'react';
import { BuildModeBanner }    from './components/BuildModeBanner.js';
import { WalletConnect }      from './components/WalletConnect.js';
import { Overview }           from './components/Overview.js';
import { IssueAttestation }   from './components/IssueAttestation.js';
import { VerifyAttestation }  from './components/VerifyAttestation.js';
import { AdminPanel }         from './components/AdminPanel.js';
import { ActivityLog }        from './components/ActivityLog.js';
import type { ActivityEntry, AttestationRecord } from './types/index.js';

function makeEntry(circuit: string, result: string, status: 'success' | 'failure'): ActivityEntry {
  return {
    id:        Math.random().toString(36).slice(2),
    timestamp: new Date().toLocaleTimeString(),
    circuit,
    params:    '',
    status,
    result,
  };
}

export function App() {
  const [contractReady, setContractReady] = useState(false);
  const [attestations,  setAttestations]  = useState<AttestationRecord[]>([]);
  const [log,           setLog]           = useState<ActivityEntry[]>([]);

  function addLog(entry: ActivityEntry) {
    setLog(prev => [entry, ...prev].slice(0, 10));
  }

  const handleIssued = useCallback((record: AttestationRecord, logMsg: string) => {
    setAttestations(prev => [...prev, record]);
    addLog(makeEntry('issueAttestation', logMsg, 'success'));
  }, []);

  const handleIssueFailed = useCallback((_reason: string, logMsg: string) => {
    addLog(makeEntry('issueAttestation', logMsg, 'failure'));
  }, []);

  const handleVerified = useCallback((result: boolean, logMsg: string) => {
    addLog(makeEntry('verifyAttestation', logMsg, 'success'));
  }, []);

  const handleAdminAction = useCallback((logMsg: string) => {
    const status = logMsg.includes('FAILED') ? 'failure' : 'success';
    addLog(makeEntry('admin', logMsg, status));
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
      <BuildModeBanner />

      <header style={{ padding:'16px', borderBottom:'1px solid #333' }}>
        <h1 style={{ fontSize:'18px', fontWeight:'bold' }}>
          ProofFi — Credit Attestation Test Harness
        </h1>
        <p style={{ fontSize:'12px', color:'#555', marginTop:'4px' }}>
          Wave 1 · smoke test UI · not a consumer product
        </p>
      </header>

      {/* §5.1 */}
      <WalletConnect onConnected={(_addr, _api) => {}} />
      <Overview onReady={() => setContractReady(true)} />

      {/* §5.2 — steps 2, 3, and 6 */}
      <IssueAttestation
        disabled={!contractReady}
        onIssued={handleIssued}
        onFailed={handleIssueFailed}
      />

      {/* §5.3 — steps 4 & 5 */}
      <VerifyAttestation
        disabled={!contractReady}
        attestations={attestations}
        onVerified={handleVerified}
      />

      {/* §5.4 */}
      <AdminPanel
        disabled={!contractReady}
        onAction={handleAdminAction}
      />

      {/* §5.5 */}
      <ActivityLog entries={log} />
    </div>
  );
}
