/**
 * frontend/src/components/WalletConnect.tsx
 *
 * §3 — All five wallet connection states.
 * Uses the DApp Connector API v4 (window.midnight flat object pattern).
 */

import { useState, useEffect } from 'react';
import { discoverWallets, connectWallet, checkStillConnected } from '../lib/wallet.js';
import type { WalletState, WalletInfo } from '../types/index.js';

interface Props {
  onConnected: (address: string, api: unknown) => void;
}

export function WalletConnect({ onConnected }: Props) {
  const [state, setState] = useState<WalletState>({ status: 'not-detected' });
  const [connectedApi, setConnectedApi] = useState<unknown>(null);

  useEffect(() => {
    // Give the extension a moment to inject before checking
    const timer = setTimeout(() => {
      const wallets = discoverWallets();
      if (wallets.length > 0) {
        setState({ status: 'detected', wallets });
      } else {
        setState({ status: 'not-detected' });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  async function handleConnect(wallet: WalletInfo) {
    setState({ status: 'connecting', walletName: wallet.name });
    try {
      const { api, address } = await connectWallet(wallet);
      setConnectedApi(api);
      setState({ status: 'connected', address, walletName: wallet.name });
      onConnected(address, api);
    } catch (err: unknown) {
      setState({
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleDisconnect() {
    setConnectedApi(null);
    const wallets = discoverWallets();
    setState(wallets.length > 0 ? { status: 'detected', wallets } : { status: 'not-detected' });
  }

  async function handleReconnect() {
    if (state.status !== 'connected' || !connectedApi) return;
    const still = await checkStillConnected(connectedApi);
    if (!still) {
      const wallets = discoverWallets();
      setState({ status: 'detected', wallets });
      setConnectedApi(null);
    }
  }

  return (
    <section data-testid="wallet-connect" style={styles.section}>
      <h2 style={styles.h2}>Wallet Connection</h2>

      {state.status === 'not-detected' && (
        <div data-testid="wallet-state-not-detected" style={styles.stateBox}>
          <p>No Midnight wallet extension detected.</p>
          <p style={{ marginTop: '8px' }}>
            Install{' '}
            <a href="https://lace.io" target="_blank" rel="noreferrer" style={styles.link}>
              Lace
            </a>{' '}
            or{' '}
            <a href="https://1am.space" target="_blank" rel="noreferrer" style={styles.link}>
              1AM
            </a>{' '}
            and refresh.
          </p>
        </div>
      )}

      {state.status === 'detected' && (
        <div data-testid="wallet-state-detected" style={styles.stateBox}>
          <p style={{ marginBottom: '12px' }}>
            {state.wallets.length} wallet{state.wallets.length !== 1 ? 's' : ''} detected:
          </p>
          {state.wallets.map((w) => (
            <button
              key={w.rdns}
              data-testid={`connect-btn-${w.rdns}`}
              onClick={() => handleConnect(w)}
              style={styles.btn}
            >
              Connect {w.name}
            </button>
          ))}
        </div>
      )}

      {state.status === 'connecting' && (
        <div data-testid="wallet-state-connecting" style={styles.stateBox}>
          <p>⏳ Connecting to {state.walletName}…</p>
          <p style={{ fontSize: '11px', marginTop: '6px', color: '#888' }}>
            Approve the connection request in your wallet extension.
          </p>
        </div>
      )}

      {state.status === 'connected' && (
        <div data-testid="wallet-state-connected" style={{ ...styles.stateBox, borderColor: '#2a5' }}>
          <p>✅ Connected — <strong>{state.walletName}</strong></p>
          <p style={{ fontFamily: 'monospace', fontSize: '11px', marginTop: '6px', wordBreak: 'break-all' }}>
            Address: {state.address}
          </p>
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
            <button onClick={handleReconnect} style={styles.btnSmall}>Check connection</button>
            <button onClick={handleDisconnect} style={{ ...styles.btnSmall, borderColor: '#a44' }}>
              Disconnect
            </button>
          </div>
        </div>
      )}

      {state.status === 'failed' && (
        <div data-testid="wallet-state-failed" style={{ ...styles.stateBox, borderColor: '#a44' }}>
          <p>❌ Connection failed</p>
          <p style={{ fontSize: '12px', marginTop: '6px', color: '#f88' }}>{state.error}</p>
          <button
            onClick={() => setState({ status: 'detected', wallets: discoverWallets() })}
            style={{ ...styles.btnSmall, marginTop: '10px' }}
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}

const styles = {
  section: { padding: '16px', borderBottom: '1px solid #333' },
  h2:      { fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#aaa', textTransform: 'uppercase' as const, letterSpacing: '1px' },
  stateBox: { border: '1px solid #444', padding: '12px', borderRadius: '4px', lineHeight: '1.5' },
  btn:      { background: '#1a3a6a', border: '1px solid #3a6ab0', color: '#90b8ff', padding: '8px 16px', cursor: 'pointer', borderRadius: '3px', marginRight: '8px' },
  btnSmall: { background: 'transparent', border: '1px solid #555', color: '#aaa', padding: '4px 10px', cursor: 'pointer', borderRadius: '3px', fontSize: '12px' },
  link:     { color: '#90b8ff' },
};
