import { defineConfig, devices } from '@playwright/test';

/** CI 請同時設定 PLAYWRIGHT_BASE_URL 與 PLAYWRIGHT_SKIP_WEBSERVER=1（由 workflow 啟動 next start） */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: 'npm run build && npx next start -p 3000',
          url: `${baseURL.replace(/\/$/, '')}/api/health`,
          timeout: 300_000,
          reuseExistingServer: !process.env.CI,
          env: {
            ...process.env,
            DATABASE_URL:
              process.env.DATABASE_URL ||
              'postgresql://user:pass@localhost:5432/e2e?schema=public',
            NEXTAUTH_URL: baseURL,
            NEXTAUTH_SECRET:
              process.env.NEXTAUTH_SECRET ||
              'playwright-e2e-secret-at-least-32-chars-long!!',
            PORT: '3000',
          },
        },
      }),
});
