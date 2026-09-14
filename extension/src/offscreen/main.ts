import { processHlsStream, OffscreenJobPayload } from './transmuxer';

// Offscreen message listener
chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'START_OFFSCREEN_JOB') {
    const job = message.payload as OffscreenJobPayload;

    (async () => {
      try {
        let blob: Blob;

        if (job.type === 'hls') {
          blob = await processHlsStream(job, (percent, downloadedBytes, totalBytes) => {
            chrome.runtime.sendMessage({
              type: 'OFFSCREEN_REMUX_PROGRESS',
              payload: {
                jobId: job.jobId,
                percent,
                downloadedBytes,
                totalBytes,
              },
            }).catch(() => {});
          });
        } else {
          throw new Error(`Stream type ${job.type} requires Native Companion or FFmpeg.`);
        }

        const blobUrl = URL.createObjectURL(blob);

        chrome.runtime.sendMessage({
          type: 'OFFSCREEN_REMUX_COMPLETE',
          payload: {
            jobId: job.jobId,
            blobUrl,
            filename: job.targetFilename,
          },
        }).catch(() => {});
      } catch (err: any) {
        chrome.runtime.sendMessage({
          type: 'OFFSCREEN_REMUX_FAILED',
          payload: {
            jobId: job.jobId,
            error: err?.message || 'Processing failed in offscreen document',
          },
        }).catch(() => {});
      }
    })();
  }
});
