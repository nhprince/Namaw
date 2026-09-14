import { inspectMediaElement } from './dom-detector';
import { MediaCandidate } from '../shared/types';

export function startMediaObserver(onMediaFound: (candidate: MediaCandidate) => void) {
  const seenUrls = new Set<string>();

  const scan = () => {
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

  // Initial scan
  scan();

  // Watch for dynamic insertions and attribute changes (src / currentSrc)
  let scanTimeout: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    if (scanTimeout) return;
    scanTimeout = setTimeout(() => {
      scan();
      scanTimeout = null;
    }, 500); // 500ms debounce
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'currentSrc'],
  });

  // Also hook into media play events
  window.addEventListener(
    'play',
    (e) => {
      if (e.target instanceof HTMLMediaElement) {
        const candidates = inspectMediaElement(e.target);
        candidates.forEach((cand) => {
          if (!seenUrls.has(cand.sourceUrl)) {
            seenUrls.add(cand.sourceUrl);
            onMediaFound(cand);
          }
        });
      }
    },
    true
  );

  return () => observer.disconnect();
}
