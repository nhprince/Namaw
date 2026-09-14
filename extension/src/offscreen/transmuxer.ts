import muxjs from 'mux.js';
import { parseHlsPlaylist } from '../lib/manifests/hls-parser';

export interface OffscreenJobPayload {
  jobId: string;
  type: 'hls' | 'dash';
  manifestUrl: string;
  targetFilename: string;
}

/**
 * Downloads and transmuxes an HLS stream into an in-memory MP4 Blob.
 */
export async function processHlsStream(
  job: OffscreenJobPayload,
  onProgress: (percent: number, downloadedBytes: number, totalBytes?: number) => void
): Promise<Blob> {
  // 1. Fetch playlist content
  const res = await fetch(job.manifestUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch HLS playlist: HTTP ${res.status}`);
  }
  const playlistText = await res.text();
  const info = parseHlsPlaylist(playlistText, job.manifestUrl);

  if (info.isDrmProtected) {
    throw new Error(`This stream is DRM-protected (${info.drmMethod || 'DRM'}) and cannot be downloaded.`);
  }

  // If master playlist was passed, select the first/best media variant
  let mediaPlaylistUrl = job.manifestUrl;
  let segments = info.segments;

  if (info.isMaster && info.variants.length > 0) {
    mediaPlaylistUrl = info.variants[0].url;
    const variantRes = await fetch(mediaPlaylistUrl);
    if (!variantRes.ok) {
      throw new Error(`Failed to fetch media variant: HTTP ${variantRes.status}`);
    }
    const variantText = await variantRes.text();
    const variantInfo = parseHlsPlaylist(variantText, mediaPlaylistUrl);
    segments = variantInfo.segments;
  }

  if (!segments || segments.length === 0) {
    throw new Error('No playable segments found in HLS playlist.');
  }

  // 2. Setup mux.js transmuxer
  const transmuxer = new muxjs.mp4.Transmuxer({
    keepOriginalTimestamps: true,
  });

  const outputChunks: Uint8Array[] = [];
  let initSegment: Uint8Array | null = null;

  transmuxer.on('data', (segment: { data: Uint8Array; initSegment: Uint8Array }) => {
    if (!initSegment && segment.initSegment) {
      initSegment = new Uint8Array(segment.initSegment);
      outputChunks.push(initSegment);
    }
    outputChunks.push(new Uint8Array(segment.data));
  });

  // 3. Download segments in sequence
  let totalDownloaded = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segRes = await fetch(seg.url);
    if (!segRes.ok) {
      throw new Error(`Failed to fetch segment #${i + 1}: HTTP ${segRes.status}`);
    }
    const buf = await segRes.arrayBuffer();
    const bytes = new Uint8Array(buf);
    totalDownloaded += bytes.byteLength;

    // Push into transmuxer
    transmuxer.push(bytes);

    const percent = Math.round(((i + 1) / segments.length) * 100);
    onProgress(percent, totalDownloaded);
  }

  transmuxer.flush();

  // Combine into final MP4 blob
  return new Blob(outputChunks as unknown as BlobPart[], { type: 'video/mp4' });
}
