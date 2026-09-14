/**
 * Manages the extension action badge count and colors for tabs.
 */
export const badgeManager = {
  async updateBadge(tabId: number, count: number): Promise<void> {
    if (tabId <= 0) return;
    try {
      if (count > 0) {
        await chrome.action.setBadgeText({ tabId, text: String(count) });
        await chrome.action.setBadgeBackgroundColor({ tabId, color: '#4f46e5' }); // Indigo
      } else {
        await chrome.action.setBadgeText({ tabId, text: '' });
      }
    } catch {
      // Tab may be closed
    }
  },

  async setBadgeDownloading(tabId: number): Promise<void> {
    if (tabId <= 0) return;
    try {
      await chrome.action.setBadgeText({ tabId, text: '↓' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' }); // Emerald
    } catch {
      // Tab may be closed
    }
  },

  async setBadgeError(tabId: number): Promise<void> {
    if (tabId <= 0) return;
    try {
      await chrome.action.setBadgeText({ tabId, text: '!' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#ef4444' }); // Red
    } catch {
      // Tab may be closed
    }
  },
};
