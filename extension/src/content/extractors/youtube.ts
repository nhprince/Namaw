import { MediaCandidate, MediaVariant } from '../../shared/types';
import { generateCandidateId } from '../../background/detection/correlation';

export function isYouTubePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'www.youtube.com' ||
      parsed.hostname === 'youtube.com' ||
      parsed.hostname === 'm.youtube.com' ||
      parsed.hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }
    if (parsed.pathname.startsWith('/shorts/')) {
      const parts = parsed.pathname.split('/');
      return parts[2] || null;
    }
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1);
    }
  } catch {
    // fallback
  }
  return null;
}

export function extractYouTubeTitle(): string {
  // Try modern YouTube watch metadata element
  const watchTitle = document.querySelector(
    'h1.style-scope.ytd-watch-metadata yt-formatted-string'
  )?.textContent;
  if (watchTitle && watchTitle.trim()) return watchTitle.trim();

  // Try legacy video title element
  const legacyTitle = document.querySelector('#title h1 yt-formatted-string')?.textContent;
  if (legacyTitle && legacyTitle.trim()) return legacyTitle.trim();

  // Try meta tags
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle && ogTitle.trim()) return ogTitle.trim();

  const metaTitle = document.querySelector('meta[name="title"]')?.getAttribute('content');
  if (metaTitle && metaTitle.trim()) return metaTitle.trim();

  // Fallback to document.title stripped of " - YouTube" suffix
  return document.title.replace(/ - YouTube$/, '').trim() || 'YouTube Video';
}

export function extractYouTubeCandidate(tabId = 0): MediaCandidate | null {
  const currentUrl = window.location.href;
  if (!isYouTubePage(currentUrl)) return null;

  const videoId = extractYouTubeVideoId(currentUrl);
  if (!videoId) return null;

  const title = extractYouTubeTitle();
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Standard YouTube quality representations supported by companion yt-dlp
  const variants: MediaVariant[] = [
    {
      id: 'best',
      resolution: 'Best (Up to 4K)',
      url: pageUrl,
      hasVideo: true,
      hasAudio: true,
      formatContainer: 'mp4',
    },
    {
      id: '1080p',
      resolution: '1080p (Full HD)',
      height: 1080,
      url: pageUrl,
      hasVideo: true,
      hasAudio: true,
      formatContainer: 'mp4',
    },
    {
      id: '720p',
      resolution: '720p (HD)',
      height: 720,
      url: pageUrl,
      hasVideo: true,
      hasAudio: true,
      formatContainer: 'mp4',
    },
    {
      id: '480p',
      resolution: '480p',
      height: 480,
      url: pageUrl,
      hasVideo: true,
      hasAudio: true,
      formatContainer: 'mp4',
    },
    {
      id: 'audio_only',
      resolution: 'Audio Only (MP3)',
      url: pageUrl,
      hasVideo: false,
      hasAudio: true,
      formatContainer: 'mp3',
    },
  ];

  return {
    id: generateCandidateId(tabId, pageUrl),
    tabId,
    pageUrl,
    sourceUrl: pageUrl,
    type: 'video',
    title,
    thumbnailUrl,
    hasVideo: true,
    hasAudio: true,
    variants,
    extractor: 'youtube',
    platform: 'youtube',
    isPlatformStream: true,
    requiresNativeHelper: true,
    confidence: 100,
    detectedAt: Date.now(),
  };
}
