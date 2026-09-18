export type SniffedMediaType =
  | 'mp4'
  | 'webm'
  | 'mpegts'
  | 'fmp4'
  | 'html'
  | 'json'
  | 'unknown';

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = offset; i < offset + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Inspects the leading bytes of a downloaded payload to determine what the
 * server actually returned. Prevents saving HTML error pages or JSON
 * responses as media files.
 */
export function sniffMediaType(bytes: Uint8Array): SniffedMediaType {
  if (!bytes || bytes.length < 12) return 'unknown';

  if (asciiAt(bytes, 4, 4) === 'ftyp') return 'mp4';

  if (asciiAt(bytes, 0, 4) === 'styp') return 'fmp4';

  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'webm';
  }

  if (bytes[0] === 0x47 && (bytes[188] === 0x47 || bytes[192] === 0x47)) {
    return 'mpegts';
  }

  const head = asciiAt(bytes, 0, Math.min(1024, bytes.length)).trim();
  if (/^<(!doctype|html)/i.test(head)) return 'html';
  if (/^\s*</.test(head)) return 'html';

  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      JSON.parse(head.endsWith('}') || head.endsWith(']') ? head : head + '"}');
      return 'json';
    } catch {
      return 'unknown';
    }
  }

  return 'unknown';
}

/**
 * Maps a sniffed media type to the container/file extension it should be saved as.
 */
export function sniffedTypeToContainer(type: SniffedMediaType): string | null {
  switch (type) {
    case 'mp4':
    case 'fmp4':
      return 'mp4';
    case 'webm':
      return 'webm';
    case 'mpegts':
      return 'ts';
    default:
      return null;
  }
}

/**
 * Human-readable failure explanation when the payload is not playable media.
 */
export function describeUnplayablePayload(type: SniffedMediaType, status?: number): string {
  switch (type) {
    case 'html':
      return status && status >= 400
        ? `The website returned an error page (HTTP ${status}) instead of video. The stream URL may have expired - re-detect and try again.`
        : 'The website returned an HTML page instead of video. The stream URL may require authentication or has expired - re-detect and try again.';
    case 'json':
      return 'The website returned a JSON response instead of video. The stream URL may have expired - re-detect and try again.';
    default:
      return 'The server response is not a recognizable media format. The stream may be protected or expired - re-detect and try again.';
  }
}
