import { UserSettings, HistoryItem, MediaCandidate, DownloadJob } from '../../shared/types';

const DEFAULT_SETTINGS: UserSettings = {
  namingTemplate: '{title} [{resolution}].{ext}',
  downloadSubfolder: 'Namaw',
  maxConcurrentDownloads: 3,
  preferNativeCompanion: false,
  theme: 'system',
  enableNotifications: true,
};

/**
 * Type-safe storage wrapper for chrome.storage.local (persistent)
 * and chrome.storage.session (in-memory per browser session).
 */
export const db = {
  // --- Settings ---
  async getSettings(): Promise<UserSettings> {
    const data = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  },

  async updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...updates };
    await chrome.storage.local.set({ settings: updated });
    return updated;
  },

  // --- Download History ---
  async getHistory(): Promise<HistoryItem[]> {
    const data = await chrome.storage.local.get('history');
    return (data.history as HistoryItem[]) || [];
  },

  async addHistoryItem(item: HistoryItem): Promise<void> {
    const history = await this.getHistory();
    // Prepend new item and keep last 100 entries
    const updated = [item, ...history.filter((h) => h.id !== item.id)].slice(0, 100);
    await chrome.storage.local.set({ history: updated });
  },

  async clearHistory(): Promise<void> {
    await chrome.storage.local.set({ history: [] });
  },

  async removeHistoryItem(id: string): Promise<void> {
    const history = await this.getHistory();
    await chrome.storage.local.set({ history: history.filter((h) => h.id !== id) });
  },

  // --- Session Candidates (per Tab) ---
  async getTabCandidates(tabId: number): Promise<MediaCandidate[]> {
    const key = `tab_candidates_${tabId}`;
    const data = await chrome.storage.session.get(key);
    return (data[key] as MediaCandidate[]) || [];
  },

  async saveTabCandidates(tabId: number, candidates: MediaCandidate[]): Promise<void> {
    const key = `tab_candidates_${tabId}`;
    await chrome.storage.session.set({ [key]: candidates });
  },

  async clearTabCandidates(tabId: number): Promise<void> {
    const key = `tab_candidates_${tabId}`;
    await chrome.storage.session.remove(key);
  },

  // --- Active Download Jobs ---
  async getActiveJobs(): Promise<Record<string, DownloadJob>> {
    const data = await chrome.storage.session.get('active_jobs');
    return (data.active_jobs as Record<string, DownloadJob>) || {};
  },

  async saveJob(job: DownloadJob): Promise<void> {
    const jobs = await this.getActiveJobs();
    jobs[job.id] = job;
    await chrome.storage.session.set({ active_jobs: jobs });
  },

  async removeJob(jobId: string): Promise<void> {
    const jobs = await this.getActiveJobs();
    delete jobs[jobId];
    await chrome.storage.session.set({ active_jobs: jobs });
  },
};
