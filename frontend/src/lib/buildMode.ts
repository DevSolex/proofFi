/**
 * frontend/src/lib/buildMode.ts
 *
 * Detects whether the app is running against a --skip-zk or real ZK build.
 * The check is simple: does the contract/managed/keys directory contain
 * .prover files?  In the frontend context we can't check the filesystem
 * directly, so we rely on a VITE_BUILD_MODE env var set at dev/build time,
 * with a safe default of 'skip-zk'.
 *
 * Set VITE_BUILD_MODE=full-zk when running against a real compiled build.
 */

import type { BuildMode } from '../types/index.js';

export function getBuildMode(): BuildMode {
  // import.meta.env is provided by Vite at build time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mode = (import.meta as any).env?.VITE_BUILD_MODE as string | undefined;
  if (mode === 'full-zk') return 'full-zk';
  return 'skip-zk';
}
