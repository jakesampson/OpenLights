import { defineConfig } from '@playwright/test'

export default defineConfig({
  use: {
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/usr/bin/chromium' },
    viewport: { width: 1600, height: 1000 }
  }
})
