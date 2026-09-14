import { defineBackground } from 'wxt/sandbox';
import { db } from '../lib/storage/db';
import { correlateCandidate } from '../background/detection/correlation';
import { badgeManager } from '../background/detection/badge-manager';
import { startNetworkMonitor } from '../background/detection/network-monitor';
import { downloadManager } from '../background/downloads/download-manager';
import { nativeBridge } from '../background/messaging/native-bridge';
import { logger } from '../lib/utils/logger';

export default defineBackground(() => {
  logger.info('Background', 'Namaw! background service worker initialized.');

  // Initialize download state observers
  downloadManager.initDownloadListeners();

  // Handle incoming media detections from network monitor
  startNetworkMonitor(async (candidate) => {
    if (candidate.tabId <= 0) return;
    const current = await db.getTabCandidates(candidate.tabId);
    const updated = correlateCandidate(current, candidate);
    await db.saveTabCandidates(candidate.tabId, updated);
    await badgeManager.updateBadge(candidate.tabId, updated.length);
  });

  // Handle runtime messages across extension components
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Return true to indicate asynchronous response where applicable
    const handleAsync = async () => {
      try {
        if (message.type === 'MEDIA_DETECTED') {
          const tabId = sender.tab?.id || message.payload?.tabId;
          if (tabId && tabId > 0) {
            const current = await db.getTabCandidates(tabId);
            const candidate = { ...message.payload, tabId };
            const updated = correlateCandidate(current, candidate);
            await db.saveTabCandidates(tabId, updated);
            await badgeManager.updateBadge(tabId, updated.length);
          }
          sendResponse({ status: 'ok' });
        } else if (message.type === 'GET_TAB_MEDIA') {
          const tabId = message.payload?.tabId;
          const candidates = tabId ? await db.getTabCandidates(tabId) : [];
          sendResponse({ candidates });
        } else if (message.type === 'START_DOWNLOAD') {
          const { candidateId, variantId, customFilename } = message.payload;
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = tabs[0]?.id || 0;
          const candidates = await db.getTabCandidates(tabId);
          const candidate = candidates.find((c) => c.id === candidateId);

          if (candidate) {
            const job = await downloadManager.startDownload(candidate, variantId, customFilename);
            sendResponse({ status: 'ok', job });
          } else {
            sendResponse({ status: 'error', error: 'Media candidate not found' });
          }
        } else if (message.type === 'GET_DOWNLOAD_JOBS') {
          const jobs = await db.getActiveJobs();
          sendResponse({ jobs: Object.values(jobs) });
        } else if (message.type === 'CHECK_NATIVE_HELPER') {
          const status = await nativeBridge.checkStatus();
          sendResponse({ status });
        } else if (message.type === 'OFFSCREEN_REMUX_PROGRESS') {
          const { jobId, percent, downloadedBytes, totalBytes } = message.payload;
          const jobs = await db.getActiveJobs();
          const job = jobs[jobId];
          if (job) {
            job.progress.percent = percent;
            job.progress.downloadedBytes = downloadedBytes;
            job.progress.totalBytes = totalBytes;
            job.state = 'DOWNLOADING';
            job.updatedAt = Date.now();
            await db.saveJob(job);
          }
          sendResponse({ status: 'ok' });
        } else if (message.type === 'OFFSCREEN_REMUX_COMPLETE') {
          const { jobId, blobUrl, filename } = message.payload;
          const jobs = await db.getActiveJobs();
          const job = jobs[jobId];
          if (job) {
            job.state = 'DOWNLOADING';
            job.progress.percent = 100;
            job.updatedAt = Date.now();
            await db.saveJob(job);

            // Trigger real browser download for assembled blob
            await chrome.downloads.download({
              url: blobUrl,
              filename: filename || job.targetFilename,
              conflictAction: 'uniquify',
              saveAs: false,
            });
          }
          sendResponse({ status: 'ok' });
        } else if (message.type === 'OFFSCREEN_REMUX_FAILED') {
          const { jobId, error } = message.payload;
          const jobs = await db.getActiveJobs();
          const job = jobs[jobId];
          if (job) {
            job.state = 'FAILED';
            job.errorDetails = error;
            job.updatedAt = Date.now();
            await db.saveJob(job);
          }
          sendResponse({ status: 'ok' });
        }
      } catch (err: any) {
        logger.error('Background', 'Error handling runtime message:', err);
        sendResponse({ status: 'error', error: err?.message });
      }
    };

    handleAsync();
    return true; // Keep message channel open for async response
  });

  // Tab navigation cleanup
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      db.clearTabCandidates(tabId);
      badgeManager.updateBadge(tabId, 0);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    db.clearTabCandidates(tabId);
  });
});
