import { MediaCandidate } from '../../shared/types';
import { generateCandidateId } from './correlation';
import { logger } from '../../lib/utils/logger';

const MEDIA_MIME_TYPES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'application/dash+xml',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-m4v',
  'video/mp2t',
  'audio/mp4',
  'audio/mpeg',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
]);

const GENERIC_NAMES = new Set([
  'index.m3u8',
  'master.m3u8',
  'playlist.m3u8',
  'manifest.mpd',
  'manifest.m3u8',
  'videoplayback',
  'media',
  'chunk',
  'segment',
]);

export function startNetworkMonitor(
  onMediaFound: (candidate: MediaCandidate) => void
) {
  if (!chrome.webRequest || !chrome.webRequest.onHeadersReceived) {
    logger.warn('NetworkMonitor', 'chrome.webRequest API not available.');
    return;
  }

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      // Ignore background/extension-internal requests or invalid tabs
      if (details.tabId <= 0 || details.url.startsWith('chrome-extension://')) {
        return;
      }

      const url = details.url;
      const urlLower = url.toLowerCase();
      const initiator = (details.initiator || '').toLowerCase();

      // Suppress raw internal streaming fragments on YouTube
      // (YouTube is handled by the dedicated YouTube extractor to avoid 0MB index.m3u8 noise)
      if (
        initiator.includes('youtube.com') ||
        urlLower.includes('googlevideo.com') ||
        urlLower.includes('youtube.com/api/stats')
      ) {
        return;
      }

      // Suppress partial byte-range buffer chunks on Facebook/Instagram CDN to prevent corrupt downloads
      if (
        (initiator.includes('facebook.com') || urlLower.includes('fbcdn.net')) &&
        (urlLower.includes('bytestart=') || urlLower.includes('byteend='))
      ) {
        return;
      }

      const headers = details.responseHeaders || [];
      let contentType = '';
      let contentLength = 0;
      let hasContentRange = false;

      for (const h of headers) {
        const name = h.name.toLowerCase();
        if (name === 'content-type') {
          contentType = (h.value || '').split(';')[0].trim().toLowerCase();
        } else if (name === 'content-length') {
          contentLength = parseInt(h.value || '0', 10);
        } else if (name === 'content-range') {
          hasContentRange = true;
        }
      }

      const isHls =
        contentType.includes('mpegurl') ||
        urlLower.includes('.m3u8') ||
        urlLower.includes('/playlist.m3u8');

      const isDash =
        contentType.includes('dash+xml') ||
        urlLower.includes('.mpd') ||
        urlLower.includes('/manifest.mpd');

      const isDirectMedia =
        MEDIA_MIME_TYPES.has(contentType) ||
        contentType.startsWith('video/') ||
        contentType.startsWith('audio/') ||
        urlLower.includes('.mp4') ||
        urlLower.includes('.webm') ||
        urlLower.includes('.m4v') ||
        urlLower.includes('.mov');

      // Ignore trivial assets (e.g. tiny tracking pixel, icon, or tiny range slice)
      if (isDirectMedia && !isHls && !isDash && (contentLength > 0 && contentLength < 100000 || (hasContentRange && contentLength < 300000))) {
        return;
      }

      if (isHls || isDash || isDirectMedia) {
        const mediaType = isHls ? 'hls' : isDash ? 'dash' : contentType.startsWith('audio/') ? 'audio' : 'direct';

        // Clean range/chunk query parameters from direct media URL
        let cleanSourceUrl = url;
        if (cleanSourceUrl.includes('bytestart=') || cleanSourceUrl.includes('byteend=')) {
          try {
            const parsed = new URL(cleanSourceUrl);
            parsed.searchParams.delete('bytestart');
            parsed.searchParams.delete('byteend');
            cleanSourceUrl = parsed.toString();
          } catch {
            cleanSourceUrl = cleanSourceUrl.replace(/[?&]bytestart=\d+/, '').replace(/&byteend=\d+/, '');
          }
        }

        // Derive filename from URL path if possible
        let urlFilename = 'media';
        try {
          const parsed = new URL(cleanSourceUrl);
          const parts = parsed.pathname.split('/');
          const last = parts[parts.length - 1];
          if (last && last.includes('.')) {
            urlFilename = decodeURIComponent(last);
          }
        } catch {
          // fallback
        }

        // Asynchronously enrich with tab title if filename is generic
        const emitCandidate = (resolvedTitle: string) => {
          const candidate: MediaCandidate = {
            id: generateCandidateId(details.tabId, cleanSourceUrl),
            tabId: details.tabId,
            pageUrl: details.initiator || cleanSourceUrl,
            sourceUrl: cleanSourceUrl,
            type: mediaType,
            mimeType: contentType || undefined,
            title: resolvedTitle,
            fileSize: contentLength > 0 && !hasContentRange ? contentLength : undefined,
            hasVideo: mediaType !== 'audio',
            hasAudio: true,
            extractor: 'network',
            confidence: isHls || isDash ? 85 : 75,
            detectedAt: Date.now(),
          };

          onMediaFound(candidate);
        };

        if (GENERIC_NAMES.has(urlFilename.toLowerCase())) {
          chrome.tabs.get(details.tabId, (tab) => {
            if (chrome.runtime.lastError || !tab || !tab.title) {
              emitCandidate(urlFilename);
            } else {
              emitCandidate(tab.title);
            }
          });
        } else {
          emitCandidate(urlFilename);
        }
      }
    },
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  );
}
