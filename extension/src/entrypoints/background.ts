import { defineBackground } from 'wxt/sandbox';
import { db } from '../lib/storage/db';
import { correlateCandidate } from '../background/detection/correlation';
import { badgeManager } from '../background/detection/badge-manager';
import { startNetworkMonitor } from '../background/detection/network-monitor';
import { downloadManager } from '../background/downloads/download-manager';
import { nativeBridge } from '../background/messaging/native-bridge';
import { ExtensionMessageSchema } from '../shared/schemas';
import { isTerminalState } from '../lib/media/queue';
import { logger } from '../lib/utils/logger';

export default defineBackground(() => {
  logger.info('Background', 'Namaw! background service worker initialized.');

  downloadManager.initDownloadListeners();

  // Handle incoming media detections from network monitor
  startNetworkMonitor(async (candidate) => {
    if (candidate.tabId <= 0) return;
    const current = await db.getTabCandidates(candidate.tabId);
    const updated = correlateCandidate(current, candidate);
    await db.saveTabCandidates(candidate.tabId, updated);
    await badgeManager.updateBadge(candidate.tabId, updated.length);
  });

  chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    const handleAsync = async () => {
      // Offscreen-targeted messages are routed to the offscreen document,
      // not handled here
      if ((rawMessage as { target?: string })?.target === 'offscreen') {
        sendResponse({ status: 'ignored' });
        return;
      }

      // Content scripts are untrusted contexts: validate every message shape
      const parsed = ExtensionMessageSchema.safeParse(rawMessage);
      if (!parsed.success) {
        logger.warn(
          'Background',
          'Rejected malformed extension message:',
          parsed.error.issues[0]?.message
        );
        sendResponse({ status: 'error', error: 'Invalid message shape' });
        return;
      }

      const message = parsed.data;

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
          const tabId = message.payload.tabId;
          const candidates = tabId ? await db.getTabCandidates(tabId) : [];
          sendResponse({ candidates });
        } else if (message.type === 'START_DOWNLOAD') {
          const { candidateId, variantId, customFilename } = message.payload;
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          const activeTabId = tabs[0]?.id || 0;
          let candidates = await db.getTabCandidates(activeTabId);
          let candidate = candidates.find((c) => c.id === candidateId);

          // Fallback: scan all stored tabs for snapshots so queued jobs still resolve
          if (!candidate) {
            for (const job of Object.values(await db.getActiveJobs())) {
              if (job.candidate?.id === candidateId) {
                candidate = job.candidate;
                break;
              }
            }
          }

          if (candidate) {
            const job = await downloadManager.startDownload(candidate, variantId, customFilename);
            sendResponse({ status: 'ok', job });
          } else {
            sendResponse({ status: 'error', error: 'Media candidate not found. Re-scan the page.' });
          }
        } else if (message.type === 'CANCEL_DOWNLOAD') {
          await downloadManager.cancelDownload(message.payload.jobId);
          sendResponse({ status: 'ok' });
        } else if (message.type === 'CLEAR_FINISHED_JOBS') {
          const jobs = await db.getActiveJobs();
          for (const job of Object.values(jobs)) {
            if (isTerminalState(job.state)) {
              await db.removeJob(job.id);
            }
          }
          sendResponse({ status: 'ok' });
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
            job.blobUrl = blobUrl;
            job.updatedAt = Date.now();
            await db.saveJob(job);

            const downloadId = await chrome.downloads.download({
              url: blobUrl,
              filename: filename || job.targetFilename,
              conflictAction: 'uniquify',
              saveAs: false,
            });
            job.browserDownloadId = downloadId;
            await db.saveJob(job);
          }
          sendResponse({ status: 'ok' });
        } else if (message.type === 'OFFSCREEN_REMUX_FAILED') {
          const { jobId, error } = message.payload;
          const jobs = await db.getActiveJobs();
          const job = jobs[jobId];
          if (job) {
            if (job.state !== 'CANCELLED') {
              await downloadManager.finalizeJob(job, undefined, {
                format: 'HLS',
                pageUrl: job.candidate?.pageUrl || '',
                error,
              });
            }
          }
          sendResponse({ status: 'ok' });
        }
      } catch (err: any) {
        logger.error('Background', 'Error handling runtime message:', err);
        sendResponse({ status: 'error', error: err?.message });
      }
    };

    handleAsync();
    return true;
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
