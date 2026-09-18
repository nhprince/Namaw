import muxjs from 'mux.js';
import { parseHlsPlaylist, HlsSegment } from '../lib/manifests/hls-parser';
import { sniffMediaType } from '../lib/media/sniff';

export interface HlsOffscreenJobPayload {
  jobId: string;
  type: 'hls';
  manifestUrl: string;
  targetFilename: string;
}

async function fetchSegment(
  seg: HlsSegment,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const headers: Record<string, string> = {};
  if (seg.byteRange) {
    const start = seg.byteRange.offset ?? 0;
    const end = start + seg.byteRange.length - 1;
    headers['Range'] = `bytes=${start}-${end}`;
  }

  const segRes = await fetch(seg.url, { headers, signal });
  if (!segRes.ok && segRes.status !== 206) {
    throw new Error(`Failed to fetch segment #${seg.index + 1}: HTTP ${segRes.status}`);
  }
  const buf = await segRes.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Downloads and remuxes an HLS stream into an in-memory MP4 Blob.
 * - MPEG-TS segments are transmuxed to fMP4 via mux.js
 * - fMP4 HLS (init + .m4s) is concatenated directly
 * - Byte-range segments are fetched with proper Range headers
 */
export async function processHlsStream(
  job: HlsOffscreenJobPayload,
  onProgress: (percent: number, downloadedBytes: number, totalBytes?: number) => void,
  signal?: AbortSignal
): Promise<Blob> {
  const res = await fetch(job.manifestUrl, { signal });
  if (!res.ok) {
    throw new Error(`Failed to fetch HLS playlist: HTTP ${res.status}`);
  }
  const playlistText = await res.text();
  const info = parseHlsPlaylist(playlistText, job.manifestUrl);

  if (info.isDrmProtected) {
    throw new Error(`This stream is DRM-protected (${info.drmMethod || 'DRM'}) and cannot be downloaded.`);
  }

  let mediaPlaylistUrl = job.manifestUrl;
  let segments = info.segments;
  let initSegmentUrl = info.initSegmentUrl;

  if (info.isMaster && info.variants.length > 0) {
    mediaPlaylistUrl = info.variants[0].url;
    const variantRes = await fetch(mediaPlaylistUrl, { signal });
    if (!variantRes.ok) {
      throw new Error(`Failed to fetch media variant: HTTP ${variantRes.status}`);
    }
    const variantText = await variantRes.text();
    const variantInfo = parseHlsPlaylist(variantText, mediaPlaylistUrl);
    segments = variantInfo.segments;
    initSegmentUrl = variantInfo.initSegmentUrl;
    if (variantInfo.isDrmProtected) {
      throw new Error(`This stream is DRM-protected (${variantInfo.drmMethod || 'DRM'}) and cannot be downloaded.`);
    }
  }

  if (!segments || segments.length === 0) {
    throw new Error('No playable segments found in HLS playlist.');
  }

  // Probe the first segment to choose the assembly strategy
  const first = await fetchSegment(segments[0], signal);
  const sniffed = sniffMediaType(first);

  const outputChunks: Uint8Array[] = [];
  let totalDownloaded = 0;

  const isFragmentedMp4 = sniffed === 'fmp4' || sniffed === 'mp4';
  let transmuxer: InstanceType<typeof muxjs.mp4.Transmuxer> | null = null;
  let initEmitted = false;

  if (isFragmentedMp4) {
    // fMP4 HLS: fetch the initialization segment when the playlist declares one
    if (initSegmentUrl) {
      const initRes = await fetch(initSegmentUrl, { signal });
      if (initRes.ok) {
        outputChunks.push(new Uint8Array(await initRes.arrayBuffer()));
      }
    }
  } else {
    // MPEG-TS: transmux to fMP4 in-memory
    transmuxer = new muxjs.mp4.Transmuxer({ keepOriginalTimestamps: true });
    transmuxer.on('data', (segment: { data: Uint8Array; initSegment: Uint8Array }) => {
      if (!initEmitted && segment.initSegment) {
        initEmitted = true;
        outputChunks.push(new Uint8Array(segment.initSegment));
      }
      outputChunks.push(new Uint8Array(segment.data));
    });
  }

  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Download cancelled', 'AbortError');
    }

    const bytes = i === 0 ? first : await fetchSegment(segments[i], signal);
    totalDownloaded += bytes.byteLength;

    if (isFragmentedMp4) {
      outputChunks.push(bytes);
    } else {
      transmuxer!.push(bytes);
    }

    onProgress(Math.round(((i + 1) / segments.length) * 100), totalDownloaded);
  }

  if (transmuxer) transmuxer.flush();

  return new Blob(outputChunks as unknown as BlobPart[], { type: 'video/mp4' });
}
