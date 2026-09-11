/**
 * frontend/src/App.tsx
 */

import { useState, useCallback } from 'react';
import { BuildModeBanner }    from './components/BuildModeBanner.js';
import { WalletConnect }      from './components/WalletConnect.js';
import { Overview }           from './components/Overview.js';
import { IssueAttestation }   from './components/IssueAttestation.js';
import { VerifyAttestation }  from './components/VerifyAttestation.js';
import { AdminPanel }         from './components/AdminPanel.js';
import { ActivityLog }        from './components/ActivityLog.js';
import { getFixtures }        from './lib/contract.js';
import type { ActivityEntry, AttestationRecord } from './types/index.js';
import type { FixtureOption } from './components/IssueAttestation.js';

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
  const [fixtures,      setFixtures]      = useState<FixtureOption[]>([]);
  const [attestations,  setAttestations]  = useState<AttestationRecord[]>([]);
  const [log,           setLog]           = useState<ActivityEntry[]>([]);

  function addLog(entry: ActivityEntry) {
    setLog(prev => [entry, ...prev].slice(0, 10));
  }

  const handleContractReady = useCallback(async () => {
    setContractReady(true);
    try {
      const f = await getFixtures();
      setFixtures(f);
    } catch {
      // fixtures unavailable — component will show placeholder
    }
  }, []);

  const handleIssued = useCallback((record: AttestationRecord, logMsg: string) => {
    setAttestations(prev => [...prev, record]);
    addLog(makeEntry('issueAttestation', logMsg, 'success'));
  }, []);

  const handleIssueFailed = useCallback((_reason: string, logMsg: string) => {
    addLog(makeEntry('issueAttestation', logMsg, 'failure'));
  }, []);

  const handleVerified = useCallback((_result: boolean, logMsg: string) => {
    addLog(makeEntry('verifyAttestation', logMsg, 'success'));
  }, []);

  const handleAdminAction = useCallback((logMsg: string) => {
    const status = logMsg.includes('FAILED') ? 'failure' : 'success';
    addLog(makeEntry('admin', logMsg, status));
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
      <BuildModeBanner />

      <header style={{ padding: '16px', borderBottom: '1px solid #333' }}>
        <h1 style={{ fontSize: '18px', fontWeight: 'bold' }}>
          ProofFi — Credit Attestation Test Harness
        </h1>
        <p style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
          Wave 1 · smoke test UI · not a consumer product
        </p>
      </header>

      <WalletConnect onConnected={() => {}} />
      <Overview onReady={handleContractReady} />

      <IssueAttestation
        disabled={!contractReady}
        fixtures={fixtures}
        onIssued={handleIssued}
        onFailed={handleIssueFailed}
      />

      <VerifyAttestation
        disabled={!contractReady}
        attestations={attestations}
        onVerified={handleVerified}
      />

      <AdminPanel
        disabled={!contractReady}
        onAction={handleAdminAction}
      />

      <ActivityLog entries={log} />
    </div>
  );
}
