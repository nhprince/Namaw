import { processHlsStream } from './transmuxer';
import { processDirectUrl, OffscreenJobPayload } from './direct-download';

const jobAbortControllers = new Map<string, AbortController>();

function postProgress(jobId: string, percent: number, downloadedBytes: number, totalBytes?: number) {
  chrome.runtime
    .sendMessage({
      type: 'OFFSCREEN_REMUX_PROGRESS',
      payload: { jobId, percent, downloadedBytes, totalBytes },
    })
    .catch(() => {});
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'ABORT_OFFSCREEN_JOB') {
    const jobId = message.payload?.jobId as string | undefined;
    if (jobId) {
      jobAbortControllers.get(jobId)?.abort();
      jobAbortControllers.delete(jobId);
    }
    return;
  }

  if (message.type === 'START_OFFSCREEN_JOB') {
    const job = message.payload as OffscreenJobPayload;
    const controller = new AbortController();
    jobAbortControllers.set(job.jobId, controller);

    (async () => {
      try {
        let blob: Blob;
        let finalFilename = job.targetFilename;

        if (job.type === 'hls') {
          blob = await processHlsStream(
            { ...job, type: 'hls' },
            (percent, downloadedBytes, totalBytes) =>
              postProgress(job.jobId, percent, downloadedBytes, totalBytes),
            controller.signal
          );
        } else if (job.type === 'direct') {
          const result = await processDirectUrl(
            job,
            (percent, downloadedBytes, totalBytes) =>
              postProgress(job.jobId, percent, downloadedBytes, totalBytes),
            controller.signal
          );
          blob = result.blob;

          // Correct the file extension if the sniffed container differs
          if (result.containerExt && !finalFilename.toLowerCase().endsWith(`.${result.containerExt}`)) {
            finalFilename = finalFilename.replace(/\.[a-z0-9]+$/i, `.${result.containerExt}`);
          }
        } else {
          throw new Error(
            `Stream type "${job.type}" requires the Namaw! Companion (separate audio/video merging).`
          );
        }

        const blobUrl = URL.createObjectURL(blob);

        chrome.runtime
          .sendMessage({
            type: 'OFFSCREEN_REMUX_COMPLETE',
            payload: {
              jobId: job.jobId,
              blobUrl,
              filename: finalFilename,
            },
          })
          .catch(() => {});
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // Cancellation is finalized by the background worker
          return;
        }
        chrome.runtime
          .sendMessage({
            type: 'OFFSCREEN_REMUX_FAILED',
            payload: {
              jobId: job.jobId,
              error: err?.message || 'Processing failed in offscreen document',
            },
          })
          .catch(() => {});
      } finally {
        jobAbortControllers.delete(job.jobId);
      }
    })();
  }
});
