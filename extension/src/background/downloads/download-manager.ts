import { DownloadJob, MediaCandidate, MediaVariant } from '../../shared/types';
import { db } from '../../lib/storage/db';
import { renderFilenameTemplate } from '../../lib/sanitization/filename';
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

    const resolution = selectedVariant?.resolution || (candidate.height ? `${candidate.height}p` : undefined);
    const ext = candidate.type === 'audio' ? 'mp3' : 'mp4';

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

    // Fast path: Direct downloadable media file
    if (candidate.type === 'direct' || candidate.type === 'audio' || candidate.type === 'video') {
      await this.executeBrowserDownload(job, candidate.sourceUrl);
    } else if (candidate.type === 'hls' || candidate.type === 'dash') {
      await this.executeOffscreenRemux(job, candidate, selectedVariant);
    }

    return job;
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
        // Record completed download
        logger.info('DownloadManager', `Download #${delta.id} completed successfully`);
        // Find matching job if any
        const jobs = await db.getActiveJobs();
        for (const job of Object.values(jobs)) {
          if (job.state === 'DOWNLOADING') {
            job.state = 'COMPLETED';
            job.progress.percent = 100;
            job.updatedAt = Date.now();
            await db.saveJob(job);

            await db.addHistoryItem({
              id: job.id,
              title: job.targetFilename,
              filename: job.targetFilename,
              pageUrl: '',
              format: 'Completed',
              completedAt: Date.now(),
              status: 'COMPLETED',
            });
            break;
          }
        }
      } else if (delta.state.current === 'interrupted') {
        logger.warn('DownloadManager', `Download #${delta.id} interrupted:`, delta.error?.current);
      }
    });
  },
};
