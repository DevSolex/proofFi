/**
 * frontend/src/lib/wallet.ts
 *
 * Wallet discovery and connection helpers using the DApp Connector API v4.
 *
 * Key points (from docs.midnight.network/guides/react-wallet-connect and
 * the DApp Connector API v4 release notes):
 *
 * - Wallets inject under window.midnight as a flat object keyed by arbitrary
 *   UUID strings. Values are InitialAPI instances with .rdns, .name, .icon,
 *   .apiVersion, and .connect().
 * - .connect(networkId) triggers the wallet permission prompt.
 * - For local/Wave 1 testing, networkId = 'undeployed'.
 * - Never render wallet.name or wallet.icon via innerHTML (XSS risk).
 */

import '@midnight-ntwrk/dapp-connector-api';
import { ErrorCodes } from '@midnight-ntwrk/dapp-connector-api';
import type { WalletInfo } from '../types/index.js';

// Network ID — use 'testnet-02' for Lace on testnet, 'undeployed' for local node.
// Wave 1 smoke test uses the local simulation API (no wallet needed for circuit calls).
// Wallet connection here is for display/demo purposes only.
export const NETWORK_ID = 'testnet-02';

export function discoverWallets(): WalletInfo[] {
  if (typeof window === 'undefined' || !window.midnight) return [];
  // window.midnight is a flat object of InitialAPI instances keyed by UUID
  return Object.values(window.midnight as Record<string, WalletInfo>).filter(
    (w) => w && typeof w.connect === 'function'
  );
}

export async function connectWallet(
  wallet: WalletInfo
): Promise<{ api: unknown; address: string }> {
  try {
    const api = await wallet.connect(NETWORK_ID);
    // Get the shielded address for display
    const { shieldedAddress } = await (api as any).getShieldedAddresses();
    return { api, address: shieldedAddress ?? 'unknown' };
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as any).type === 'DAppConnectorAPIError'
    ) {
      const code = (err as any).code;
      if (code === ErrorCodes.Rejected) {
        throw new Error('Connection request rejected by user.');
      }
      throw new Error(
        `Wallet error (code ${code}): ${(err as any).reason ?? 'unknown'}`
      );
    }
    throw err;
  }
}

export async function checkStillConnected(api: unknown): Promise<boolean> {
  try {
    const status = await (api as any).getConnectionStatus();
    return status?.status === 'connected';
  } catch {
    return false;
  }
}
