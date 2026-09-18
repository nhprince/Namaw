import { sniffMediaType, SniffedMediaType, sniffedTypeToContainer } from '../lib/media/sniff';

export interface OffscreenJobPayload {
  jobId: string;
  type: 'hls' | 'dash' | 'direct';
  manifestUrl: string;
  targetFilename: string;
}

const MAX_IN_MEMORY_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB safety cap

/**
 * Fetches a direct media URL in the offscreen document (cookies included via
 * host permissions), verifies the payload is genuinely playable media (never
 * an HTML error page), and returns it as a Blob.
 */
export async function processDirectUrl(
  job: OffscreenJobPayload,
  onProgress: (percent: number, downloadedBytes: number, totalBytes?: number) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; sniffed: SniffedMediaType; containerExt: string | null }> {
  const res = await fetch(job.manifestUrl, { signal, credentials: 'include' });

  if (!res.ok && res.status !== 206) {
    throw new Error(
      `The server rejected the download (HTTP ${res.status}). The stream URL may have expired - re-detect and try again.`
    );
  }

  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

  if (contentType && (contentType.startsWith('text/html') || contentType === 'application/json')) {
    throw new Error(
      `The website returned ${contentType.startsWith('text/html') ? 'an HTML page' : 'a JSON response'} instead of video. The stream URL may have expired - re-detect and try again.`
    );
  }

  const totalBytes = parseInt(res.headers.get('content-length') || '0', 10) || undefined;
  if (!res.body) {
    throw new Error('The server returned an empty response body.');
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  let sniffed: SniffedMediaType = 'unknown';
  let lastProgressAt = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      chunks.push(value);
      downloaded += value.byteLength;

      if (sniffed === 'unknown') {
        sniffed = sniffMediaType(value);
        if (sniffed === 'html' || sniffed === 'json') {
          throw new Error(
            sniffed === 'html'
              ? 'The website returned an error page instead of video. The stream URL may have expired - re-detect and try again.'
              : 'The website returned a JSON response instead of video. The stream URL may require authentication - re-detect and try again.'
          );
        }
      }

      if (downloaded > MAX_IN_MEMORY_BYTES) {
        throw new Error(
          'This stream is too large for in-browser download (over 2 GB). Install the Namaw! Companion for large-file support.'
        );
      }

      const now = Date.now();
      if (now - lastProgressAt > 400) {
        lastProgressAt = now;
        onProgress(totalBytes ? Math.round((downloaded / totalBytes) * 100) : 0, downloaded, totalBytes);
      }
    }
  } finally {
    reader.releaseLock();
  }

  onProgress(100, downloaded, totalBytes);

  if (downloaded === 0) {
    throw new Error('The downloaded file is 0 MB (empty). The website rejected direct access.');
  }

  const containerExt = sniffedTypeToContainer(sniffed);
  const mime =
    containerExt === 'ts' ? 'video/mp2t' : containerExt ? `video/${containerExt}` : contentType || 'video/mp4';
  const blob = new Blob(chunks as unknown as BlobPart[], { type: mime });
  chunks.length = 0;

  return { blob, sniffed, containerExt };
}
