import { MediaVariant } from '../../shared/types';

export interface HlsStreamInfo {
  isMaster: boolean;
  variants: MediaVariant[];
  segments?: HlsSegment[];
  isDrmProtected?: boolean;
  drmMethod?: string;
  totalDuration?: number;
  initSegmentUrl?: string;
}

export interface HlsSegment {
  index: number;
  duration: number;
  url: string;
  byteRange?: {
    length: number;
    offset?: number;
  };
}

/**
 * Resolves a relative URL against a base URL.
 */
export function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return relativeOrAbsolute;
  }
}

/**
 * Parses HLS attribute lists like:
 * BANDWIDTH=1280000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
 */
function parseAttributeList(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1].toUpperCase();
    const value = match[2] !== undefined ? match[2] : match[3];
    attrs[key] = value;
  }

  return attrs;
}

/**
 * Parses an HLS .m3u8 playlist string (either master playlist or media playlist).
 */
export function parseHlsPlaylist(m3u8Content: string, manifestUrl: string): HlsStreamInfo {
  const lines = m3u8Content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (!lines.length || !lines[0].startsWith('#EXTM3U')) {
    throw new Error('Invalid HLS playlist: Missing #EXTM3U header');
  }

  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));

  if (isMaster) {
    return parseMasterPlaylist(lines, manifestUrl);
  } else {
    return parseMediaPlaylist(lines, manifestUrl);
  }
}

function parseMasterPlaylist(lines: string[], manifestUrl: string): HlsStreamInfo {
  const variants: MediaVariant[] = [];
  let currentAttrs: Record<string, string> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const attrString = line.slice('#EXT-X-STREAM-INF:'.length);
      currentAttrs = parseAttributeList(attrString);
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const keyAttrs = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
      if (keyAttrs.METHOD && keyAttrs.METHOD !== 'NONE') {
        return {
          isMaster: true,
          variants: [],
          isDrmProtected: true,
          drmMethod: keyAttrs.METHOD,
        };
      }
    } else if (!line.startsWith('#') && currentAttrs) {
      const variantUrl = resolveUrl(line, manifestUrl);
      const bandwidth = currentAttrs.BANDWIDTH
        ? parseInt(currentAttrs.BANDWIDTH, 10)
        : undefined;

      let width: number | undefined;
      let height: number | undefined;
      let resolution: string | undefined;

      if (currentAttrs.RESOLUTION) {
        const parts = currentAttrs.RESOLUTION.split('x');
        if (parts.length === 2) {
          width = parseInt(parts[0], 10);
          height = parseInt(parts[1], 10);
          resolution = `${height}p`;
        }
      }

      variants.push({
        id: `variant_${variants.length + 1}`,
        resolution,
        width,
        height,
        bandwidth,
        codecs: currentAttrs.CODECS,
        url: variantUrl,
        hasVideo: !resolution?.includes('audio') && (height === undefined || height > 0),
        hasAudio: true,
        formatContainer: variantUrl.includes('.m4s') ? 'm4s' : 'ts',
      });

      currentAttrs = null;
    }
  }

  // Sort variants by resolution / bandwidth descending (highest quality first)
  variants.sort((a, b) => {
    if (a.height && b.height) return b.height - a.height;
    if (a.bandwidth && b.bandwidth) return b.bandwidth - a.bandwidth;
    return 0;
  });

  return {
    isMaster: true,
    variants,
  };
}

function parseMediaPlaylist(lines: string[], manifestUrl: string): HlsStreamInfo {
  const segments: HlsSegment[] = [];
  let totalDuration = 0;
  let isDrmProtected = false;
  let drmMethod: string | undefined;
  let initSegmentUrl: string | undefined;

  let currentDuration = 0;
  let currentByteRange: { length: number; offset?: number } | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-KEY:')) {
      const keyAttrs = parseAttributeList(line.slice('#EXT-X-KEY:'.length));
      if (keyAttrs.METHOD && keyAttrs.METHOD !== 'NONE') {
        isDrmProtected = true;
        drmMethod = keyAttrs.METHOD;
      }
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const mapAttrs = parseAttributeList(line.slice('#EXT-X-MAP:'.length));
      if (mapAttrs.URI) {
        initSegmentUrl = resolveUrl(mapAttrs.URI, manifestUrl);
      }
    } else if (line.startsWith('#EXTINF:')) {
      const parts = line.slice('#EXTINF:'.length).split(',');
      currentDuration = parseFloat(parts[0]) || 0;
      totalDuration += currentDuration;
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      const rangeParts = line.slice('#EXT-X-BYTERANGE:'.length).split('@');
      const length = parseInt(rangeParts[0], 10);
      const offset = rangeParts[1] ? parseInt(rangeParts[1], 10) : undefined;
      currentByteRange = { length, offset };
    } else if (!line.startsWith('#')) {
      const segmentUrl = resolveUrl(line, manifestUrl);
      segments.push({
        index: segments.length,
        duration: currentDuration,
        url: segmentUrl,
        byteRange: currentByteRange,
      });
      currentByteRange = undefined;
    }
  }

  return {
    isMaster: false,
    variants: [
      {
        id: 'variant_media',
        url: manifestUrl,
        hasVideo: true,
        hasAudio: true,
      },
    ],
    segments,
    isDrmProtected,
    drmMethod,
    totalDuration,
    initSegmentUrl,
  };
}
