import { MediaCandidate, MediaVariant } from '../../shared/types';
import { generateCandidateId } from '../../background/detection/correlation';

export function isFacebookPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'www.facebook.com' ||
      host === 'facebook.com' ||
      host === 'm.facebook.com' ||
      host === 'web.facebook.com' ||
      host === 'fb.watch' ||
      host.includes('fb.com') ||
      host.endsWith('.facebook.com')
    );
  } catch {
    return false;
  }
}

/**
 * Facebook JSON payloads escape URLs inconsistently across surfaces
 * (watch pages vs reels vs inline stories). Normalize every variant:
 *  \/  \u0025  \u0026  \u002F  &amp;  \u0026amp;
 */
export function cleanFacebookCdnUrl(rawUrl: string): string {
  let url = rawUrl
    .replace(/\\\//g, '/')
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026amp;/g, '&')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003[dD]/g, '=')
    .replace(/\\u003[fF]/g, '?')
    .replace(/&amp;/g, '&')
    .replace(/\\"/g, '"');

  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('bytestart');
    parsed.searchParams.delete('byteend');
    return parsed.toString();
  } catch {
    return url.replace(/[?&]bytestart=\d+/, '').replace(/&byteend=\d+/, '');
  }
}

export function extractFacebookTitle(): string {
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle && ogTitle.trim() && !ogTitle.includes('Log into Facebook')) {
    return ogTitle.trim();
  }

  const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
  if (ogDesc && ogDesc.trim() && ogDesc.length > 5) {
    return ogDesc.slice(0, 80).trim();
  }

  const captionEl = document.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]');
  if (captionEl && captionEl.textContent) {
    return captionEl.textContent.slice(0, 80).trim();
  }

  return document.title.replace(/\s*\|\s*Facebook$/i, '').trim() || 'Facebook Video';
}

export function extractFacebookThumbnail(): string | undefined {
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage && !ogImage.includes('lookaside.fbsbx.com/lookaside/crawler/media')) {
    return ogImage;
  }

  const videoEl = document.querySelector('video');
  if (videoEl && videoEl.poster) {
    return videoEl.poster;
  }

  return undefined;
}

function extractFirstMatch(haystack: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) return cleanFacebookCdnUrl(match[1]);
  }
  return undefined;
}

/**
 * Scans page scripts and HTML for Facebook URLs:
 *  - progressive: browser_native_hd_url / playable_url_quality_hd / playable_url (SD, with audio)
 *  - fallback reel surfaces: "dash_manifest" inline XML (requires companion to merge)
 */
export function extractFacebookCandidates(tabId = 0): MediaCandidate[] {
  const pageUrl = window.location.href;
  const title = extractFacebookTitle();
  const thumbnailUrl = extractFacebookThumbnail();

  const HD_PATTERNS = [
    /"(?:browser_native_hd_url|playable_url_quality_hd)"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /"hd_src_no_ratelimit"\s*:\s*"((?:\\.|[^"\\])*)"/,
  ];
  const SD_PATTERNS = [
    /"playable_url(?:_quality_[^"]*)?"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /"sd_src_no_ratelimit"\s*:\s*"((?:\\.|[^"\\])*)"/,
    /"sd_src"\s*:\s*"((?:\\.|[^"\\])*)"/,
  ];

  let hdUrl: string | undefined;
  let sdUrl: string | undefined;
  let hasDashManifest = false;

  const haystacks: string[] = [];
  const scripts = document.querySelectorAll('script');
  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i].textContent || '';
    if (content.includes('playable_url') || content.includes('browser_native_') || content.includes('dash_manifest') || content.includes('sd_src')) {
      haystacks.push(content);
    }
  }
  haystacks.push(document.documentElement.innerHTML);

  for (const hay of haystacks) {
    if (!hdUrl) hdUrl = extractFirstMatch(hay, HD_PATTERNS);
    if (!sdUrl) sdUrl = extractFirstMatch(hay, SD_PATTERNS);
    if (!hasDashManifest && hay.includes('"dash_manifest"')) hasDashManifest = true;
    if (hdUrl && sdUrl && hasDashManifest) break;
  }

  // 1. Progressive URLs found -> direct in-browser download (no companion needed)
  if (hdUrl || sdUrl) {
    const variants: MediaVariant[] = [];
    if (hdUrl) {
      variants.push({
        id: 'fb_hd',
        resolution: 'HD',
        url: hdUrl,
        hasVideo: true,
        hasAudio: true,
        formatContainer: 'mp4',
        note: 'may be video-only on some posts',
      });
    }
    if (sdUrl) {
      variants.push({
        id: 'fb_sd',
        resolution: 'SD (with audio)',
        url: sdUrl,
        hasVideo: true,
        hasAudio: true,
        formatContainer: 'mp4',
      });
    }

    // Put the with-audio SD variant first so the default pick always produces sound
    variants.sort((a, b) => (a.id === 'fb_sd' ? -1 : b.id === 'fb_sd' ? 1 : 0));

    const primary = variants[0];
    return [{
      id: generateCandidateId(tabId, primary.url),
      tabId,
      pageUrl,
      sourceUrl: primary.url,
      type: 'direct',
      mimeType: 'video/mp4',
      title,
      thumbnailUrl,
      hasVideo: true,
      hasAudio: true,
      variants,
      extractor: 'platform',
      platform: 'facebook',
      isPlatformStream: false,
      confidence: 95,
      detectedAt: Date.now(),
    }];
  }

  // 2. Reels-style pages only expose DASH / require yt-dlp: route to companion
  const videoEl = document.querySelector('video');
  const hasPlayableDom =
    !!videoEl && (videoEl.readyState > 0 || hasDashManifest || videoEl.src);

  if (hasPlayableDom) {
    return [{
      id: generateCandidateId(tabId, `fb_stream_${pageUrl}`),
      tabId,
      pageUrl,
      sourceUrl: pageUrl,
      type: 'video',
      mimeType: 'video/mp4',
      title,
      thumbnailUrl,
      hasVideo: true,
      hasAudio: true,
      extractor: 'platform',
      platform: 'facebook',
      isPlatformStream: true,
      requiresNativeHelper: true,
      confidence: 80,
      detectedAt: Date.now(),
    }];
  }

  return [];
}
