import { defineConfig } from '@playwright/test';

// Browser tests run against the production build. Headless Chromium uses
// SwiftShader (software WebGL), so frame rates here are NOT representative of
// real hardware; the tests check correctness, flows and CPU-side streaming cost.
export default defineConfig({
  testDir: 'e2e',
  timeout: 8 * 60 * 1000,
  expect: { timeout: 60 * 1000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 180 * 1000,
  },
});
