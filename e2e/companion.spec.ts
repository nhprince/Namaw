import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// This suite verifies the real Chrome <-> companion native messaging path.
// It requires the companion exe to be built and registered on this machine:
//   scripts/build-helper.ps1  &&  python native-helper/install.py
// Run explicitly with: NAMAW_E2E_COMPANION=1 npm run test:e2e -- --grep companion
const RUN = process.env.NAMAW_E2E_COMPANION === '1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '../extension/.output/chrome-mv3');

async function launchWithExtension() {
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  });
}

test.describe('Namaw! Native Companion', () => {
  test.skip(!RUN, 'requires installed native companion (NAMAW_E2E_COMPANION=1)');

  test('extension connects to native host and receives ping', async () => {
    const context = await launchWithExtension();
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');

    const status = await sw.evaluate(
      () =>
        new Promise((resolve) => {
          try {
            const port = chrome.runtime.connectNative('com.namaw.helper');
            const timer = setTimeout(() => resolve({ connected: false, error: 'timeout' }), 8000);
            port.onMessage.addListener((msg: unknown) => {
              clearTimeout(timer);
              port.disconnect();
              resolve({ connected: true, response: msg });
            });
            port.onDisconnect.addListener(() => {
              clearTimeout(timer);
              resolve({
                connected: false,
                error: (chrome.runtime as { lastError?: { message?: string } }).lastError?.message,
              });
            });
            port.postMessage({ action: 'ping' });
          } catch (e) {
            resolve({ connected: false, error: String(e) });
          }
        })
    );

    await context.close();

    expect(status).toMatchObject({ connected: true });
    const response = (status as { response: Record<string, unknown> }).response;
    expect(response.status).toBe('ok');
    expect(String(response.version)).toMatch(/^\d+\.\d+\.\d+$/);
    expect(String(response.ytdlp_version)).toMatch(/^\d{4}\./);
  });

  test('drives a real yt-dlp download through the extension', async () => {
    const context = await launchWithExtension();
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');

    const result = await sw.evaluate(
      () =>
        new Promise((resolve) => {
          const events: { event: string; percent?: number }[] = [];
          const timer = setTimeout(() => resolve({ done: false, events }), 60000);
          try {
            const port = chrome.runtime.connectNative('com.namaw.helper');
            port.onMessage.addListener((msg: { event?: string; percent?: number; error?: string }) => {
              if (msg.event) events.push(msg as { event: string; percent?: number });
              if (msg.event === 'completed' || msg.event === 'error' || msg.event === 'cancelled') {
                clearTimeout(timer);
                port.disconnect();
                resolve({ done: true, last: msg.event, error: msg.error, events });
              }
            });
            port.onDisconnect.addListener(() => {
              clearTimeout(timer);
              resolve({ done: false, error: 'disconnected', events });
            });
            port.postMessage({
              action: 'download',
              url: 'http://localhost:3456/media/sample.mp4',
              job_id: 'e2e_test_job',
            });
          } catch (e) {
            resolve({ done: false, error: String(e), events });
          }
        })
    );

    await context.close();

    expect(result).toMatchObject({ done: true, last: 'completed' });
    const events = (result as { events: { event: string; percent?: number }[] }).events;
    expect(events.some((e) => e.event === 'progress' && (e.percent || 0) > 0)).toBe(true);
  });
});
