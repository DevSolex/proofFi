/**
 * frontend/tests/smoke.spec.ts
 *
 * Playwright e2e smoke test — scripted equivalent of build-spec §6
 * driven through the actual UI rather than direct circuit calls.
 *
 * Steps (matching backend smoke test order):
 *  1. App loads; contract deployed via "Deploy Contract" button
 *  2. Select Fixture Wallet 5 (silver-tier, balance=7813); submit issueAttestation
 *  3. Ledger shows SILVER tier; no balance field visible anywhere on screen
 *  4. verifyAttestation(commitment, minTier=BRONZE) → true
 *  5. verifyAttestation(commitment, minTier=GOLD)   → false
 *  6. Toggle unregistered issuer; submit → visible failure state
 */

import { test, expect } from '@playwright/test';

test.describe('ProofFi smoke test — six steps', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Build-mode banner must always be visible
    await expect(page.getByTestId('build-mode-banner')).toBeVisible();
  });

  // ── Step 1: Deploy contract ────────────────────────────────────────────────
  test('Step 1: deploy contract and show ledger summary', async ({ page }) => {
    await page.getByTestId('deploy-btn').click();
    await expect(page.getByTestId('ledger-summary')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('attestation-count')).toHaveText('0');
  });

  // ── Steps 2 & 3: issue SILVER attestation ─────────────────────────────────
  test('Steps 2 & 3: issue SILVER attestation — tier shown, balance absent', async ({ page }) => {
    // Deploy first
    await page.getByTestId('deploy-btn').click();
    await expect(page.getByTestId('ledger-summary')).toBeVisible({ timeout: 15_000 });

    // Select Fixture Wallet 5 (eve-silver, expectedTier=SILVER)
    await page.getByTestId('wallet-selector').selectOption({ index: 4 });

    await page.getByTestId('issue-btn').click();

    // Success result must appear
    await expect(page.getByTestId('issue-result')).toBeVisible({ timeout: 15_000 });

    // Tier must be SILVER
    await expect(page.getByTestId('issued-tier')).toHaveText('SILVER');

    // Commitment must be present
    const commitment = await page.getByTestId('issued-commitment').textContent();
    expect(commitment).toBeTruthy();

    // §0 Non-Negotiable #2: "7813" (the raw balance) must not appear anywhere
    const pageText = await page.locator('body').textContent();
    expect(pageText).not.toContain('7813');
    expect(pageText).not.toContain('avgBalance');
  });

  // ── Step 4: verifyAttestation(BRONZE) → true ──────────────────────────────
  test('Step 4: verifyAttestation(minTier=BRONZE) → true', async ({ page }) => {
    await page.getByTestId('deploy-btn').click();
    await expect(page.getByTestId('ledger-summary')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('wallet-selector').selectOption({ index: 4 }); // silver wallet
    await page.getByTestId('issue-btn').click();
    await expect(page.getByTestId('issue-result')).toBeVisible({ timeout: 15_000 });

    // Select the just-issued commitment
    const commitmentEl = page.getByTestId('commitment-selector');
    await expect(commitmentEl.locator('option')).toHaveCount(2); // placeholder + 1 entry
    await commitmentEl.selectOption({ index: 1 });

    // Select BRONZE (value=1)
    await page.getByTestId('min-tier-selector').selectOption('1');
    await page.getByTestId('verify-btn').click();

    await expect(page.getByTestId('verify-result')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('verify-outcome')).toContainText('true');
  });

  // ── Step 5: verifyAttestation(GOLD) → false ───────────────────────────────
  test('Step 5: verifyAttestation(minTier=GOLD) → false', async ({ page }) => {
    await page.getByTestId('deploy-btn').click();
    await expect(page.getByTestId('ledger-summary')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('wallet-selector').selectOption({ index: 4 });
    await page.getByTestId('issue-btn').click();
    await expect(page.getByTestId('issue-result')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('commitment-selector').selectOption({ index: 1 });

    // Select GOLD (value=3)
    await page.getByTestId('min-tier-selector').selectOption('3');
    await page.getByTestId('verify-btn').click();

    await expect(page.getByTestId('verify-result')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('verify-outcome')).toContainText('false');
  });

  // ── Step 6: unregistered issuer → visible failure ─────────────────────────
  test('Step 6: unregistered issuer → visible, labeled failure state', async ({ page }) => {
    await page.getByTestId('deploy-btn').click();
    await expect(page.getByTestId('ledger-summary')).toBeVisible({ timeout: 15_000 });

    // Toggle unregistered issuer
    await page.getByTestId('unregistered-issuer-toggle').check();
    await page.getByTestId('issue-btn').click();

    // Must show failure — not a silent no-op or raw stack trace
    await expect(page.getByTestId('issue-error')).toBeVisible({ timeout: 10_000 });

    // Activity log must record the failure
    await expect(page.getByTestId('activity-log')).toContainText('FAILED');
  });

  // ── Non-functional: build mode banner always visible ──────────────────────
  test('Build mode banner is always present and describes ZK status', async ({ page }) => {
    const banner = page.getByTestId('build-mode-banner');
    await expect(banner).toBeVisible();
    // Must mention either skip-zk or full-zk — never silent
    const text = await banner.textContent();
    const mentionsZk = text?.includes('skip-zk') || text?.includes('ZK proving');
    expect(mentionsZk).toBe(true);
  });

  // ── Non-functional: admin panel blocked without secret ────────────────────
  test('Admin panel blocks operations without secret', async ({ page }) => {
    await page.getByTestId('deploy-btn').click();
    await expect(page.getByTestId('ledger-summary')).toBeVisible({ timeout: 15_000 });

    // Register button should not be present before unlock
    await expect(page.getByTestId('register-btn')).not.toBeVisible();

    // Unlock with empty secret must be rejected
    await page.getByTestId('admin-unlock-btn').click();
    // Unlock button should still be visible (not unlocked)
    await expect(page.getByTestId('admin-unlock-btn')).toBeVisible();
  });

});
