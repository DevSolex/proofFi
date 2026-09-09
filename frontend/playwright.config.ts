import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:  './tests',
  timeout:  60_000,
  retries:  0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace:   'on-first-retry',
  },
  webServer: {
    command:             'npm run dev',
    url:                 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout:             30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
