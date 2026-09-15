import { DownloadJob, MediaCandidate, MediaVariant } from '../../shared/types';
import { db } from '../../lib/storage/db';
import { renderFilenameTemplate } from '../../lib/sanitization/filename';
import { nativeBridge } from '../messaging/native-bridge';
import { logger } from '../../lib/utils/logger';

export const downloadManager = {
  /**
   * Initiates download of a detected media candidate or variant.
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
    const ext =
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
    const subfolder = settings.downloadSubfolder.trim().replace(/[/\\]+$/, '');
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
    };

    await db.saveJob(job);

    // 1. Platform Streams (e.g. YouTube): Requires Native Companion with yt-dlp & FFmpeg
    if (candidate.isPlatformStream || candidate.requiresNativeHelper || candidate.platform === 'youtube') {
      const helperStatus = await nativeBridge.checkStatus();
      if (helperStatus.connected) {
        await this.executeNativeCompanionDownload(job, candidate.pageUrl || candidate.sourceUrl);
      } else {
        // Do not silently download a 0-byte corrupt file
        job.state = 'COMPANION_REQUIRED';
        job.errorDetails =
          'YouTube & protected platforms require the Namaw! Companion App (yt-dlp + FFmpeg). Run "python native-helper/install.py" or check Settings.';
        job.updatedAt = Date.now();
        await db.saveJob(job);
      }
      return job;
    }

    // 2. Fast path: Direct downloadable media file
    if (candidate.type === 'direct' || candidate.type === 'audio' || candidate.type === 'video') {
      await this.executeBrowserDownload(job, candidate.sourceUrl);
    } else if (candidate.type === 'hls' || candidate.type === 'dash') {
      await this.executeOffscreenRemux(job, candidate, selectedVariant);
    }

    return job;
  },

  async executeNativeCompanionDownload(job: DownloadJob, url: string): Promise<void> {
    job.state = 'DOWNLOADING';
    job.engine = 'native_companion';
    job.updatedAt = Date.now();
    await db.saveJob(job);

    nativeBridge.startNativeDownload(
      url,
      async (progress) => {
        job.state = 'DOWNLOADING';
        job.progress.percent = progress.percent || job.progress.percent;
        job.progress.speedBytesPerSec = 0; // reported in progress string
        job.updatedAt = Date.now();
        await db.saveJob(job);
      },
      async () => {
        job.state = 'COMPLETED';
        job.progress.percent = 100;
        job.updatedAt = Date.now();
        await db.saveJob(job);

        await db.addHistoryItem({
          id: job.id,
          title: job.targetFilename,
          filename: job.targetFilename,
          pageUrl: url,
          format: 'yt-dlp Native',
          completedAt: Date.now(),
          status: 'COMPLETED',
        });
      },
      async (errorMsg) => {
        job.state = 'FAILED';
        job.errorDetails = errorMsg;
        job.updatedAt = Date.now();
        await db.saveJob(job);

        await db.addHistoryItem({
          id: job.id,
          title: job.targetFilename,
          filename: job.targetFilename,
          pageUrl: url,
          format: 'yt-dlp Native',
          completedAt: Date.now(),
          status: 'FAILED',
          error: errorMsg,
        });
      }
    );
  },

  async executeBrowserDownload(job: DownloadJob, url: string): Promise<void> {
    try {
      job.state = 'DOWNLOADING';
      job.updatedAt = Date.now();
      await db.saveJob(job);

      const downloadId = await chrome.downloads.download({
        url,
        filename: job.targetFilename,
        conflictAction: 'uniquify',
        saveAs: false,
      });

      logger.info('DownloadManager', `Started browser download #${downloadId} for ${job.targetFilename}`);
    } catch (err: any) {
      logger.error('DownloadManager', `Failed to start browser download:`, err);
      job.state = 'FAILED';
      job.errorDetails = err?.message || 'Download initiation failed';
      job.updatedAt = Date.now();
      await db.saveJob(job);

      await db.addHistoryItem({
        id: job.id,
        title: job.targetFilename,
        filename: job.targetFilename,
        pageUrl: '',
        format: 'Direct',
        completedAt: Date.now(),
        status: 'FAILED',
        error: job.errorDetails,
      });
    }
  },

  async executeOffscreenRemux(
    job: DownloadJob,
    candidate: MediaCandidate,
    variant?: MediaVariant
  ): Promise<void> {
    try {
      job.state = 'ANALYZING';
      job.engine = candidate.type === 'hls' ? 'offscreen_mux' : 'offscreen_ffmpeg';
      job.updatedAt = Date.now();
      await db.saveJob(job);

      // Ensure offscreen document exists
      await chrome.offscreen
        .createDocument({
          url: 'offscreen.html',
          reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.BLOBS],
          justification: 'In-browser stream remuxing and assembly',
        })
        .catch(() => {
          // Document already active
        });

      // Send instruction to offscreen document
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'START_OFFSCREEN_JOB',
        payload: {
          jobId: job.id,
          type: candidate.type,
          manifestUrl: variant?.url || candidate.sourceUrl,
          targetFilename: job.targetFilename,
        },
      });
    } catch (err: any) {
      logger.error('DownloadManager', 'Offscreen setup failed:', err);
      job.state = 'FAILED';
      job.errorDetails = err?.message || 'Failed to initialize offscreen stream assembly';
      job.updatedAt = Date.now();
      await db.saveJob(job);
    }
  },

  initDownloadListeners() {
    if (!chrome.downloads || !chrome.downloads.onChanged) return;

    chrome.downloads.onChanged.addListener(async (delta) => {
      if (!delta.state) return;

      if (delta.state.current === 'complete') {
        const [downloadItem] = await chrome.downloads.search({ id: delta.id });
        const isZeroBytes = downloadItem && downloadItem.fileSize === 0;

        const jobs = await db.getActiveJobs();
        for (const job of Object.values(jobs)) {
          if (job.state === 'DOWNLOADING') {
            if (isZeroBytes) {
              job.state = 'FAILED';
              job.errorDetails =
                'The downloaded file is 0 MB (empty). The website rejected direct access or requires the Native Companion.';
              job.updatedAt = Date.now();
              await db.saveJob(job);
            } else {
              job.state = 'COMPLETED';
              job.progress.percent = 100;
              job.progress.downloadedBytes = downloadItem?.fileSize || job.progress.downloadedBytes;
              job.updatedAt = Date.now();
              await db.saveJob(job);

              await db.addHistoryItem({
                id: job.id,
                title: job.targetFilename,
                filename: job.targetFilename,
                fileSize: downloadItem?.fileSize,
                pageUrl: '',
                format: 'Completed',
                completedAt: Date.now(),
                status: 'COMPLETED',
              });
            }
            break;
          }
        }
      } else if (delta.state.current === 'interrupted') {
        logger.warn('DownloadManager', `Download #${delta.id} interrupted:`, delta.error?.current);
        const jobs = await db.getActiveJobs();
        for (const job of Object.values(jobs)) {
          if (job.state === 'DOWNLOADING') {
            job.state = 'FAILED';
            job.errorDetails = `Download interrupted: ${delta.error?.current || 'Network or access error'}`;
            job.updatedAt = Date.now();
            await db.saveJob(job);
            break;
          }
        }
      }
    });
  },
};
