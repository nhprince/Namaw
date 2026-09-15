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
      host.endsWith('.facebook.com')
    );
  } catch {
    return false;
  }
}

/**
 * Cleans Facebook CDN URLs by unescaping JSON escape sequences
 * and stripping bytestart/byteend chunk parameters so the full progressive file is fetched.
 */
export function cleanFacebookCdnUrl(rawUrl: string): string {
  let url = rawUrl
    .replace(/\\\//g, '/')
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
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
  // Try OpenGraph title
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle && ogTitle.trim() && !ogTitle.includes('Log into Facebook')) {
    return ogTitle.trim();
  }

  // Try post caption or description
  const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
  if (ogDesc && ogDesc.trim() && ogDesc.length > 5) {
    return ogDesc.slice(0, 80).trim();
  }

  // Try heading or caption in DOM
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

/**
 * Scans page scripts and HTML to extract Facebook HD and SD progressive MP4 URLs.
 */
export function extractFacebookCandidates(tabId = 0): MediaCandidate[] {
  const pageUrl = window.location.href;
  const title = extractFacebookTitle();
  const thumbnailUrl = extractFacebookThumbnail();

  let hdUrl: string | undefined;
  let sdUrl: string | undefined;

  // Search inside script elements
  const scripts = document.querySelectorAll('script');
  for (let i = 0; i < scripts.length; i++) {
    const content = scripts[i].textContent || '';
    if (!content.includes('playable_url') && !content.includes('browser_native_')) {
      continue;
    }

    // Match HD progressive URL
    if (!hdUrl) {
      const hdMatch = content.match(
        /"(?:browser_native_hd_url|playable_url_quality_hd)"\s*:\s*"([^"]+)"/
      );
      if (hdMatch && hdMatch[1]) {
        hdUrl = cleanFacebookCdnUrl(hdMatch[1]);
      }
    }

    // Match SD progressive URL
    if (!sdUrl) {
      const sdMatch = content.match(
        /"(?:browser_native_sd_url|playable_url)"\s*:\s*"([^"]+)"/
      );
      if (sdMatch && sdMatch[1]) {
        sdUrl = cleanFacebookCdnUrl(sdMatch[1]);
      }
    }

    if (hdUrl && sdUrl) break;
  }

  // Fallback: search document HTML if not found in separate scripts
  if (!hdUrl && !sdUrl) {
    const html = document.documentElement.innerHTML;
    const hdMatch = html.match(
      /"(?:browser_native_hd_url|playable_url_quality_hd)"\s*:\s*"([^"]+)"/
    );
    if (hdMatch && hdMatch[1]) {
      hdUrl = cleanFacebookCdnUrl(hdMatch[1]);
    }

    const sdMatch = html.match(
      /"(?:browser_native_sd_url|playable_url)"\s*:\s*"([^"]+)"/
    );
    if (sdMatch && sdMatch[1]) {
      sdUrl = cleanFacebookCdnUrl(sdMatch[1]);
    }
  }

  const primaryUrl = hdUrl || sdUrl;
  if (!primaryUrl) {
    // If no direct progressive URLs found, but video element exists
    const videoEl = document.querySelector('video');
    if (videoEl && videoEl.src && !videoEl.src.startsWith('blob:') && !videoEl.src.startsWith('data:')) {
      return [
        {
          id: generateCandidateId(tabId, videoEl.src),
          tabId,
          pageUrl,
          sourceUrl: cleanFacebookCdnUrl(videoEl.src),
          type: 'direct',
          title,
          thumbnailUrl,
          hasVideo: true,
          hasAudio: true,
          extractor: 'platform',
          platform: 'facebook',
          confidence: 85,
          detectedAt: Date.now(),
        },
      ];
    }
    return [];
  }

  const variants: MediaVariant[] = [];

  if (hdUrl) {
    variants.push({
      id: 'fb_hd',
      resolution: '720p HD',
      url: hdUrl,
      hasVideo: true,
      hasAudio: true,
      formatContainer: 'mp4',
    });
  }

  if (sdUrl) {
    variants.push({
      id: 'fb_sd',
      resolution: '480p SD',
      url: sdUrl,
      hasVideo: true,
      hasAudio: true,
      formatContainer: 'mp4',
    });
  }

  const candidate: MediaCandidate = {
    id: generateCandidateId(tabId, primaryUrl),
    tabId,
    pageUrl,
    sourceUrl: primaryUrl,
    type: 'direct',
    mimeType: 'video/mp4',
    title,
    thumbnailUrl,
    hasVideo: true,
    hasAudio: true,
    variants,
    extractor: 'platform',
    platform: 'facebook',
    isPlatformStream: false, // Direct playable progressive MP4
    confidence: 95,
    detectedAt: Date.now(),
  };

  return [candidate];
}
