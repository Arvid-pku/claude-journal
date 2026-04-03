const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8087',
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: {
    command: 'PORT=8087 node server.js',
    port: 8087,
    timeout: 15000,
    reuseExistingServer: true,
  },
});
