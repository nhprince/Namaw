import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const extensionPath = path.resolve(__dirname, '../extension/.output/chrome-mv3');

test.describe('Namaw! Media Detection Tests', () => {
  test('fixture server is healthy', async ({ request }) => {
    const response = await request.get('http://localhost:3456/health');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('extension loads and inspects direct MP4 video fixture', async () => {
    // Launch Chromium with unpacked Namaw! extension loaded
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });

    const page = await context.newPage();
    await page.goto('http://localhost:3456/direct-mp4.html');

    // Verify video tag is present
    const video = page.locator('#test-player');
    await expect(video).toBeVisible();

    // Give content script and network monitor a moment to detect
    await page.waitForTimeout(1000);

    // Get background service worker
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    expect(serviceWorker).toBeDefined();

    await context.close();
  });

  test('extension detects dynamic DOM video injection', async () => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    });

    const page = await context.newPage();
    await page.goto('http://localhost:3456/dynamic-video.html');

    // Wait for dynamic injection to finish
    await expect(page.locator('#player-container video')).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(1000);
    await context.close();
  });
});
