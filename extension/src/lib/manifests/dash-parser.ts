import { MediaVariant } from '../../shared/types';
import { resolveUrl } from './hls-parser';

export interface DashManifestInfo {
  videoVariants: MediaVariant[];
  audioVariants: MediaVariant[];
  isDrmProtected: boolean;
  drmScheme?: string;
  durationSeconds?: number;
}

/**
 * Parses ISO 8601 duration strings like PT1H2M30S or PT30.5S into seconds.
 */
export function parseIsoDuration(durationStr?: string): number | undefined {
  if (!durationStr) return undefined;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!match) return undefined;

  const hours = parseFloat(match[1] || '0');
  const minutes = parseFloat(match[2] || '0');
  const seconds = parseFloat(match[3] || '0');

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Resolves SegmentTemplate tokens like $RepresentationID$ and $Number$.
 */
export function resolveSegmentTemplateUrl(
  template: string,
  repId: string,
  number?: number,
  time?: number,
  bandwidth?: number
): string {
  let url = template.replace(/\$RepresentationID\$/g, repId);

  if (number !== undefined) {
    url = url.replace(/\$Number%0(\d+)d\$/g, (_, pad) =>
      String(number).padStart(parseInt(pad, 10), '0')
    );
    url = url.replace(/\$Number\$/g, String(number));
  }

  if (time !== undefined) {
    url = url.replace(/\$Time\$/g, String(time));
  }

  if (bandwidth !== undefined) {
    url = url.replace(/\$Bandwidth\$/g, String(bandwidth));
  }

  return url.replace(/\$\$/g, '$');
}

/**
 * Lightweight DASH MPD parser that extracts representations, audio/video streams,
 * duration, and DRM protection flags without requiring browser DOMParser.
 */
export function parseDashMpd(mpdXml: string, manifestUrl: string): DashManifestInfo {
  let isDrmProtected = false;
  let drmScheme: string | undefined;

  // Check for ContentProtection tags (DRM)
  const drmMatch = mpdXml.match(/<ContentProtection[^>]*schemeIdUri=["']([^"']+)["'][^>]*>/i);
  if (drmMatch) {
    isDrmProtected = true;
    drmScheme = drmMatch[1];
  }

  // Extract total presentation duration
  const durationMatch = mpdXml.match(/mediaPresentationDuration=["']([^"']+)["']/i);
  const durationSeconds = parseIsoDuration(durationMatch ? durationMatch[1] : undefined);

  const videoVariants: MediaVariant[] = [];
  const audioVariants: MediaVariant[] = [];

  // Match AdaptationSets
  const adaptationSetRegex = /<AdaptationSet([\s\S]*?)<\/AdaptationSet>/gi;
  let adaptMatch: RegExpExecArray | null;

  while ((adaptMatch = adaptationSetRegex.exec(mpdXml)) !== null) {
    const adaptBlock = adaptMatch[1];
    const isVideo = /mimeType=["']video\/|contentType=["']video/i.test(adaptBlock);
    const isAudio = /mimeType=["']audio\/|contentType=["']audio/i.test(adaptBlock);

    // Extract representations
    const repRegex = /<Representation\b([\s\S]*?)(?:\/?>|<\/Representation>)/gi;
    let repMatch: RegExpExecArray | null;

    while ((repMatch = repRegex.exec(adaptBlock)) !== null) {
      const repAttrs = repMatch[1];

      const idMatch = repAttrs.match(/id=["']([^"']+)["']/i);
      const repId = idMatch ? idMatch[1] : `rep_${videoVariants.length + audioVariants.length + 1}`;

      const bwMatch = repAttrs.match(/bandwidth=["'](\d+)["']/i);
      const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : undefined;

      const widthMatch = repAttrs.match(/width=["'](\d+)["']/i);
      const width = widthMatch ? parseInt(widthMatch[1], 10) : undefined;

      const heightMatch = repAttrs.match(/height=["'](\d+)["']/i);
      const height = heightMatch ? parseInt(heightMatch[1], 10) : undefined;

      const codecsMatch = repAttrs.match(/codecs=["']([^"']+)["']/i);
      const codecs = codecsMatch ? codecsMatch[1] : undefined;

      const variant: MediaVariant = {
        id: repId,
        resolution: height ? `${height}p` : undefined,
        width,
        height,
        bandwidth,
        codecs,
        url: manifestUrl,
        hasVideo: isVideo || (height !== undefined && height > 0),
        hasAudio: isAudio,
        formatContainer: 'mp4',
      };

      if (variant.hasVideo) {
        videoVariants.push(variant);
      } else if (variant.hasAudio) {
        audioVariants.push(variant);
      }
    }
  }

  // Sort video variants descending by resolution / bandwidth
  videoVariants.sort((a, b) => {
    if (a.height && b.height) return b.height - a.height;
    if (a.bandwidth && b.bandwidth) return b.bandwidth - a.bandwidth;
    return 0;
  });

  return {
    videoVariants,
    audioVariants,
    isDrmProtected,
    drmScheme,
    durationSeconds,
  };
}
