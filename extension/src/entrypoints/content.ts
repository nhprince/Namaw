import { defineContentScript } from 'wxt/sandbox';
import { startMediaObserver } from '../content/mutation-observer';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  allFrames: true,
  main() {
    startMediaObserver((candidate) => {
      // Safely notify the background service worker
      chrome.runtime.sendMessage({
        type: 'MEDIA_DETECTED',
        payload: candidate,
      }).catch(() => {
        // Service worker may be sleeping or context invalidated
      });
    });
  },
});
