import { DownloadJob, MediaCandidate, MediaVariant } from '../../shared/types';
import { db } from '../../lib/storage/db';
import { renderFilenameTemplate } from '../../lib/sanitization/filename';
import { nativeBridge } from '../messaging/native-bridge';
import { countActiveJobs, nextQueuedJob, isTerminalState } from '../../lib/media/queue';
import { badgeManager } from '../detection/badge-manager';
import { logger } from '../../lib/utils/logger';

export const downloadManager = {

  /**
   * Queues a download of a detected media candidate or variant.
   * Respects the maxConcurrentDownloads setting; extra jobs stay QUEUED
   * until a slot frees up.
   */
  async startDownload(
    candidate: MediaCandidate,
    variantId?: string,
    customFilename?: string
  ): Promise<DownloadJob> {
    const settings = await db.getSettings();
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Resolve variant or direct URL
    let selectedVariant: MediaVariant | undefined;
    if (candidate.variants && candidate.variants.length > 0) {
      if (variantId) {
        selectedVariant = candidate.variants.find((v) => v.id === variantId);
      }
      if (!selectedVariant) {
        selectedVariant = candidate.variants[0]; // best quality
      }
    }

    const resolution =
      selectedVariant?.resolution ||
      (candidate.height ? `${candidate.height}p` : undefined);
    let ext =
      selectedVariant?.formatContainer ||
      (candidate.type === 'audio' ? 'mp3' : 'mp4');

    let filename = customFilename;
    if (!filename) {
      filename = renderFilenameTemplate(settings.namingTemplate, {
        title: candidate.title,
        resolution,
        ext,
      });
    }

    // Prepend subfolder if configured
    const subfolder = settings.downloadSubfolder.trim().replace(/^[/\\]+|[/\\]+$/g, '');
    const finalPath = subfolder ? `${subfolder}/${filename}` : filename;

    const job: DownloadJob = {
      id: jobId,
      mediaCandidateId: candidate.id,
      selectedVariantId: selectedVariant?.id,
      targetFilename: finalPath,
      state: 'QUEUED',
      progress: {
        downloadedBytes: 0,
        percent: 0,
        speedBytesPerSec: 0,
      },
      engine: 'browser',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tabId: candidate.tabId,
      candidateCount: 0,
      candidate, // snapshot so queued jobs can run after other tabs change
    };

    if (candidate.tabId > 0) {
      const candidates = await db.getTabCandidates(candidate.tabId);
      job.candidateCount = candidates.length;
    }

    await db.saveJob(job);

    // Concurrency gate
    const activeJobs = await db.getActiveJobs();
    if (countActiveJobs(activeJobs) >= settings.maxConcurrentDownloads) {
      logger.info('DownloadManager', `Job ${jobId} queued - concurrency limit reached.`);
      return job;
    }

    await this.runJob(job, candidate, selectedVariant);
    return job;
  },

  /**
   * Dispatches a job to the appropriate engine.
   */
  async runJob(
    job: DownloadJob,
    candidate: MediaCandidate,
    variant?: MediaVariant
  ): Promise<void> {
    // 1. Platform Streams (e.g. YouTube): Requires Native Companion with yt-dlp & FFmpeg
    if (candidate.isPlatformStream || candidate.requiresNativeHelper || candidate.platform === 'youtube') {
      const helperStatus = await nativeBridge.checkStatus();
      if (helperStatus.connected) {
        await this.executeNativeCompanionDownload(
          job,
          candidate.pageUrl || candidate.sourceUrl,
          job.selectedVariantId
        );
      } else {
        job.state = 'COMPANION_REQUIRED';
        job.errorDetails =
          'This platform requires the free Namaw! Companion (yt-dlp + FFmpeg). Click "Install Companion" in Settings, double-click the downloaded installer, then retry.';
        job.updatedAt = Date.now();
        await db.saveJob(job);
      }
      return;
    }

    // 2. Direct downloadable media file -> offscreen verified-fetch pipeline
    if (candidate.type === 'direct' || candidate.type === 'audio' || candidate.type === 'video') {
      const downloadUrl = variant?.url || candidate.sourceUrl;

      if (downloadUrl.startsWith('blob:')) {
        job.state = 'FAILED';
        job.errorDetails =
          'This stream uses a temporary blob URL which is not directly downloadable. Re-detect the media or use the Namaw! Companion.';
        job.updatedAt = Date.now();
        await db.saveJob(job);
        return;
      }

      await this.executeOffscreenJob(job, downloadUrl, candidate, 'direct');
    } else if (candidate.type === 'hls') {
      await this.executeOffscreenJob(job, variant?.url || candidate.sourceUrl, candidate, 'hls');
    } else if (candidate.type === 'dash') {
      // DASH streams separate video and audio tracks which require merging
      const helperStatus = await nativeBridge.checkStatus();
      if (helperStatus.connected) {
        await this.executeNativeCompanionDownload(job, candidate.pageUrl || candidate.sourceUrl, variant?.id);
      } else {
        job.state = 'COMPANION_REQUIRED';
        job.errorDetails =
          'DASH streams separate video and audio tracks and require the free Namaw! Companion to merge them. Click "Install Companion", run the installer, then retry.';
        job.updatedAt = Date.now();
        await db.saveJob(job);
      }
    } else {
      job.state = 'UNSUPPORTED';
      job.errorDetails = 'This media type cannot be downloaded by Namaw.';
      job.updatedAt = Date.now();
      await db.saveJob(job);
    }
  },

  async executeNativeCompanionDownload(
    job: DownloadJob,
    url: string,
    variantId?: string
  ): Promise<void> {
    job.state = 'DOWNLOADING';
    job.engine = 'native_companion';
    job.updatedAt = Date.now();
    await db.saveJob(job);

    logger.info('NativeDL', `Starting ${job.id} url=${url} variant=${variantId || 'auto'}`);
    if (job.tabId) badgeManager.setBadgeDownloading(job.tabId);

    nativeBridge.startNativeDownload(
      job.id,
      url,
      variantId,
      async (progress) => {
        job.state = 'DOWNLOADING';
        job.progress.percent = progress.percent || job.progress.percent;
        job.updatedAt = Date.now();
        await db.saveJob(job);
      },
      async () => {
        await this.finalizeJob(job, 'COMPLETED', {
          format: 'yt-dlp Native',
          pageUrl: url,
        });
      },
      async (errorMsg) => {
        await this.finalizeJob(job, undefined, {
          format: 'yt-dlp Native',
          pageUrl: url,
          error: errorMsg,
        });
      }
    );
  },

  /**
   * Offscreen execution: both direct files (fetch + content verification) and
   * HLS streams (segment fetch + mux.js remux) run inside the offscreen
   * document, which can create Blob URLs - service workers cannot.
   */
  async executeOffscreenJob(
    job: DownloadJob,
    url: string,
    _candidate: MediaCandidate,
    jobType: 'direct' | 'hls' | 'dash'
  ): Promise<void> {
    try {
      job.state = 'ANALYZING';
      job.engine = jobType === 'direct' ? 'browser' : 'offscreen_mux';
      job.updatedAt = Date.now();
      await db.saveJob(job);

      if (job.tabId) badgeManager.setBadgeDownloading(job.tabId);

      await chrome.offscreen
        .createDocument({
          url: 'offscreen.html',
          reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.BLOBS],
          justification: 'Media fetch verification and HLS remuxing with Blob download handoff',
        })
        .catch(() => {
          // Document already active
        });

      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'START_OFFSCREEN_JOB',
        payload: {
          jobId: job.id,
          type: jobType,
          manifestUrl: url,
          targetFilename: job.targetFilename,
        },
      });
    } catch (err: any) {
      logger.error('DownloadManager', 'Offscreen setup failed:', err);
      await this.finalizeJob(job, undefined, {
        format: jobType === 'hls' ? 'HLS' : 'Direct',
        pageUrl: _candidate.pageUrl,
        error: err?.message || 'Failed to initialize offscreen download worker',
      });
    }
  },

  /**
   * Cancels an active download across every possible engine.
   */
  async cancelDownload(jobId: string): Promise<void> {
    const jobs = await db.getActiveJobs();
    const job = jobs[jobId];
    if (!job || isTerminalState(job.state)) return;

    // 1. Browser download cancellation
    if (job.browserDownloadId !== undefined) {
      try {
        await chrome.downloads.cancel(job.browserDownloadId);
      } catch {
        // may already be finished
      }
    }

    // 2. Offscreen fetch/assembly abort (safe to broadcast; ignored if unknown job)
    chrome.runtime
      .sendMessage({ target: 'offscreen', type: 'ABORT_OFFSCREEN_JOB', payload: { jobId } })
      .catch(() => {});

    // 3. Native companion abort
    if (job.engine === 'native_companion') {
      nativeBridge.cancel(jobId);
    }

    job.state = 'CANCELLED';
    job.updatedAt = Date.now();
    await db.saveJob(job);

    await db.addHistoryItem({
      id: job.id,
      title: job.candidate?.title || job.targetFilename,
      filename: job.targetFilename,
      pageUrl: job.candidate?.pageUrl || '',
      format: job.engine,
      completedAt: Date.now(),
      status: 'CANCELLED',
    });

    await this.cleanupAfterTerminal(job);
  },

  /**
   * Marks a job completed or failed, records history, restores the badge,
   * revokes blob URLs, and pumps the queue.
   */
  async finalizeJob(
    job: DownloadJob,
    state: 'COMPLETED' | undefined,
    opts: { format: string; pageUrl: string; error?: string; fileSize?: number }
  ): Promise<void> {
    job.state = state === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
    if (state === 'COMPLETED') job.progress.percent = 100;
    if (opts.error) job.errorDetails = opts.error;
    job.updatedAt = Date.now();
    await db.saveJob(job);

    await db.addHistoryItem({
      id: job.id,
      title: job.candidate?.title || job.targetFilename,
      filename: job.targetFilename,
      fileSize: opts.fileSize,
      pageUrl: opts.pageUrl,
      format: opts.format,
      completedAt: Date.now(),
      status: state === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
      error: opts.error,
    });

    await this.cleanupAfterTerminal(job);
  },

  async cleanupAfterTerminal(job: DownloadJob): Promise<void> {
    if (job.blobUrl) {
      try {
        URL.revokeObjectURL(job.blobUrl);
      } catch {
        // already revoked
      }
    }

    if (job.tabId) {
      await badgeManager.updateBadge(job.tabId, job.candidateCount || 0);
    }

    await this.closeOffscreenIfIdle();
    await this.processQueue();
  },

  async closeOffscreenIfIdle(): Promise<void> {
    const jobs = await db.getActiveJobs();
    const busy = Object.values(jobs).some(
      (j) => j.state === 'ANALYZING' || j.state === 'REMUXING'
    );
    if (!busy) {
      try {
        await chrome.offscreen.closeDocument();
      } catch {
        // no document open
      }
    }
  },

  /**
   * Starts the next queued job whenever a download slot frees up.
   */
  async processQueue(): Promise<void> {
    const jobs = await db.getActiveJobs();
    const settings = await db.getSettings();
    if (countActiveJobs(jobs) >= settings.maxConcurrentDownloads) return;

    const next = nextQueuedJob(jobs);
    if (!next || !next.candidate) return;

    const variant = next.candidate.variants?.find((v) => v.id === next.selectedVariantId);
    await this.runJob(next, next.candidate, variant);
  },

  /**
   * Maps browser download lifecycle events back to their jobs via
   * browserDownloadId so concurrent downloads never cross wires.
   */
  initDownloadListeners() {
    if (!chrome.downloads || !chrome.downloads.onChanged) return;

    chrome.downloads.onChanged.addListener(async (delta) => {
      if (!delta.state) return;

      const jobs = await db.getActiveJobs();
      const job = Object.values(jobs).find((j) => j.browserDownloadId === delta.id);
      if (!job) return;

      if (delta.state.current === 'complete') {
        const [downloadItem] = await chrome.downloads.search({ id: delta.id });
        const isZeroBytes = downloadItem && downloadItem.fileSize === 0;

        if (isZeroBytes) {
          await this.finalizeJob(job, undefined, {
            format: job.candidate?.type === 'hls' ? 'HLS' : 'Direct',
            pageUrl: job.candidate?.pageUrl || '',
            error:
              'The downloaded file is 0 MB (empty). The website rejected direct access or requires the Namaw! Companion.',
          });
        } else {
          await this.finalizeJob(job, 'COMPLETED', {
            format: job.candidate?.type?.toUpperCase() || 'Media',
            pageUrl: job.candidate?.pageUrl || '',
            fileSize: downloadItem?.fileSize,
          });
        }
      } else if (delta.state.current === 'interrupted') {
        const reason = delta.error?.current || 'Network or access error';
        // A user cancellation surfaces as 'USER_CANCELED' - cancelDownload already handled it
        const wasCancelled = job.state === 'CANCELLED';
        if (!wasCancelled) {
          await this.finalizeJob(job, undefined, {
            format: job.candidate?.type?.toUpperCase() || 'Media',
            pageUrl: job.candidate?.pageUrl || '',
            error: `Download interrupted: ${reason}`,
          });
        }
      }
    });
  },
};
