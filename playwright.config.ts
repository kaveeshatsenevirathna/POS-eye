import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: [
    { command: 'npm run api', url: 'http://127.0.0.1:3001/api/health', reuseExistingServer: !process.env.CI },
    { command: 'npm run dev -- --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  ],
});
