import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against a production build (`next build`) and the local Supabase stack.
// Magic links are read from the local Mailpit inbox; nothing leaves this machine.
const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'off',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm exec next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
