import { inspectMediaElement } from './dom-detector';
import { extractYouTubeCandidate, isYouTubePage } from './extractors/youtube';
import { extractFacebookCandidates, isFacebookPage } from './extractors/facebook';
import { MediaCandidate } from '../shared/types';

export function startMediaObserver(onMediaFound: (candidate: MediaCandidate) => void) {
  const seenUrls = new Set<string>();

  const scan = () => {
    // 1. Check for dedicated platform extractors first (YouTube & Facebook)
    if (isYouTubePage(window.location.href)) {
      const ytCandidate = extractYouTubeCandidate();
      if (ytCandidate && !seenUrls.has(ytCandidate.sourceUrl)) {
        seenUrls.add(ytCandidate.sourceUrl);
        onMediaFound(ytCandidate);
        return; // Don't scan raw internal YouTube HTML5 video blob if platform candidate is extracted
      }
    }

    if (isFacebookPage(window.location.href)) {
      const fbCandidates = extractFacebookCandidates();
      if (fbCandidates.length > 0) {
        for (const fbCand of fbCandidates) {
          if (!seenUrls.has(fbCand.sourceUrl)) {
            seenUrls.add(fbCand.sourceUrl);
            onMediaFound(fbCand);
          }
        }
        return; // Don't scan raw internal Facebook HTML5 blob URLs
      }
    }

    // 2. Scan standard HTML5 video and audio elements
    const elements = document.querySelectorAll<HTMLMediaElement>('video, audio');
    elements.forEach((el) => {
      const candidates = inspectMediaElement(el);
      for (const cand of candidates) {
        if (!seenUrls.has(cand.sourceUrl)) {
          seenUrls.add(cand.sourceUrl);
          onMediaFound(cand);
        }
      }
    });
  };

  // Initial scan (and slight delay for SPA elements to mount)
  scan();
  setTimeout(scan, 1000);
  setTimeout(scan, 2500);

  // Watch for dynamic insertions and attribute changes
  let scanTimeout: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (scanTimeout) return;
    scanTimeout = setTimeout(() => {
      scan();
      scanTimeout = null;
    }, 600);
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'currentSrc'],
  });

  // YouTube and SPA Navigation hooks
  window.addEventListener('yt-navigate-finish', () => {
    seenUrls.clear();
    setTimeout(scan, 500);
  });

  window.addEventListener('yt-page-data-updated', () => {
    setTimeout(scan, 500);
  });

  // SPA navigation: pushState does not fire popstate, so poll for URL changes
  // (YouTube watch->watch, Facebook feed->reels, etc.)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      seenUrls.clear();
      setTimeout(scan, 500);
      setTimeout(scan, 1800); // late-loading player payloads (reels etc.)
    }
  }, 800);

  window.addEventListener('popstate', () => {
    setTimeout(scan, 500);
  });

  // Media play events
  window.addEventListener(
    'play',
    (e) => {
      if (e.target instanceof HTMLMediaElement) {
        if (isYouTubePage(window.location.href)) {
          scan();
        } else {
          const candidates = inspectMediaElement(e.target);
          candidates.forEach((cand) => {
            if (!seenUrls.has(cand.sourceUrl)) {
              seenUrls.add(cand.sourceUrl);
              onMediaFound(cand);
            }
          });
        }
      }
    },
    true
  );

  return () => observer.disconnect();
}
