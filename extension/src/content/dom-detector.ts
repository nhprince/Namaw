import { MediaCandidate } from '../shared/types';
import { generateCandidateId } from '../background/detection/correlation';

/**
 * Resolves the most descriptive title available on the current webpage.
 */
export function extractPageMediaTitle(): string {
  // Check OpenGraph title
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle && ogTitle.trim()) return ogTitle.trim();

  // Check Twitter title
  const twTitle = document.querySelector('meta[name="twitter:title"]')?.getAttribute('content');
  if (twTitle && twTitle.trim()) return twTitle.trim();

  // Check Schema.org video name
  const schemaTitle = document.querySelector('[itemprop="name"]')?.textContent;
  if (schemaTitle && schemaTitle.trim()) return schemaTitle.trim();

  // Check main heading
  const h1 = document.querySelector('h1')?.textContent;
  if (h1 && h1.trim()) return h1.trim();

  return document.title || 'Web Video';
}

/**
 * Resolves poster image or thumbnail for the media element.
 */
export function extractThumbnailUrl(mediaEl: HTMLMediaElement): string | undefined {
  if (mediaEl instanceof HTMLVideoElement && mediaEl.poster) {
    return mediaEl.poster;
  }

  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage) return ogImage;

  return undefined;
}

/**
 * Inspects an HTML5 media element (<video> or <audio>) and generates MediaCandidate objects.
 */
export function inspectMediaElement(
  mediaEl: HTMLMediaElement,
  tabId = 0
): MediaCandidate[] {
  const candidates: MediaCandidate[] = [];
  const title = extractPageMediaTitle();
  const thumbnailUrl = extractThumbnailUrl(mediaEl);
  const isVideo = mediaEl instanceof HTMLVideoElement;

  const width = isVideo ? (mediaEl as HTMLVideoElement).videoWidth || undefined : undefined;
  const height = isVideo ? (mediaEl as HTMLVideoElement).videoHeight || undefined : undefined;
  const duration = isFinite(mediaEl.duration) && mediaEl.duration > 0 ? mediaEl.duration : undefined;

  const candidateUrls = new Set<string>();

  if (mediaEl.currentSrc) candidateUrls.add(mediaEl.currentSrc);
  if (mediaEl.src) candidateUrls.add(mediaEl.src);

  // Check child <source> elements
  const sources = mediaEl.querySelectorAll('source');
  sources.forEach((source) => {
    if (source.src) candidateUrls.add(source.src);
  });

  for (const rawUrl of candidateUrls) {
    if (!rawUrl || rawUrl.startsWith('data:')) continue;

    const isBlob = rawUrl.startsWith('blob:');
    const isHls = rawUrl.includes('.m3u8');
    const isDash = rawUrl.includes('.mpd');

    const candidate: MediaCandidate = {
      id: generateCandidateId(tabId, rawUrl),
      tabId,
      pageUrl: window.location.href,
      sourceUrl: rawUrl,
      type: isHls ? 'hls' : isDash ? 'dash' : isBlob ? 'unknown' : isVideo ? 'direct' : 'audio',
      title,
      thumbnailUrl,
      width,
      height,
      duration,
      hasVideo: isVideo,
      hasAudio: true,
      extractor: 'dom',
      confidence: isBlob ? 40 : 80,
      detectedAt: Date.now(),
    };

    candidates.push(candidate);
  }

  return candidates;
}
