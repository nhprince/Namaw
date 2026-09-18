import React, { useState, useEffect, useCallback } from 'react';
import { Film, ArrowDownCircle, History, Settings, Sparkles } from 'lucide-react';
import { MediaCandidate, DownloadJob, HistoryItem, UserSettings, NativeHelperStatus } from '../shared/types';
import { db } from '../lib/storage/db';
import { buildRegistrationBat, stageCompanionExe } from '../lib/companion/installer';
import { CurrentPage } from './views/CurrentPage';
import { DownloadQueue } from './views/DownloadQueue';
import { HistoryView } from './views/HistoryView';
import { SettingsView } from './views/SettingsView';

type TabView = 'page' | 'queue' | 'history' | 'settings';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabView>('page');
  const [candidates, setCandidates] = useState<MediaCandidate[]>([]);
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    namingTemplate: '{title} [{resolution}].{ext}',
    downloadSubfolder: 'Namaw',
    maxConcurrentDownloads: 3,
    preferNativeCompanion: false,
    theme: 'system',
    enableNotifications: true,
  });
  const [helperStatus, setHelperStatus] = useState<NativeHelperStatus>({ connected: false });
  const [isLoading, setIsLoading] = useState(false);
  const [installingCompanion, setInstallingCompanion] = useState(false);

  const fetchTabMedia = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const res = await chrome.runtime.sendMessage({
          type: 'GET_TAB_MEDIA',
          payload: { tabId: tab.id },
        });
        if (res?.candidates) {
          setCandidates(res.candidates);
        }
      }
    } catch {
      // Background worker might be idle
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchActiveJobs = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_DOWNLOAD_JOBS' });
      if (res?.jobs) {
        setJobs(res.jobs);
      }
    } catch {
      // ignore
    }
  }, []);

  const checkNativeHelper = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'CHECK_NATIVE_HELPER' });
      if (res?.status) {
        setHelperStatus(res.status);
      }
    } catch {
      setHelperStatus({ connected: false });
    }
  }, []);

  useEffect(() => {
    fetchTabMedia();
    fetchActiveJobs();
    db.getHistory().then(setHistory);
    db.getSettings().then(setSettings);
    checkNativeHelper();

    // Periodic poll for active downloads progress
    const interval = setInterval(fetchActiveJobs, 1000);
    return () => clearInterval(interval);
  }, [fetchTabMedia, fetchActiveJobs, checkNativeHelper]);

  const handleDownload = async (candidate: MediaCandidate, variantId?: string) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'START_DOWNLOAD',
        payload: {
          candidateId: candidate.id,
          variantId,
        },
      });
      // Switch view to download queue
      setCurrentTab('queue');
      fetchActiveJobs();
    } catch {
      // ignore
    }
  };

  const handleCancelJob = (jobId: string) => {
    chrome.runtime.sendMessage({
      type: 'CANCEL_DOWNLOAD',
      payload: { jobId },
    }).then(fetchActiveJobs);
  };

  const handleClearFinished = () => {
    chrome.runtime
      .sendMessage({ type: 'CLEAR_FINISHED_JOBS' })
      .then(fetchActiveJobs);
  };

  const handleInstallCompanion = async () => {
    setInstallingCompanion(true);
    try {
      const { absolutePath } = await stageCompanionExe();
      const bat = buildRegistrationBat(chrome.runtime.id, absolutePath);
      const blobUrl = URL.createObjectURL(bat);
      await chrome.downloads.download({
        url: blobUrl,
        filename: 'namaw-companion-installer.bat',
        conflictAction: 'overwrite',
        saveAs: false,
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
    } catch {
      // ignore - settings view also surfaces this
    } finally {
      setInstallingCompanion(false);
    }
  };

  const handleSaveSettings = async (newSettings: UserSettings) => {
    await db.updateSettings(newSettings);
    setSettings(newSettings);
  };

  const handleClearHistory = async () => {
    await db.clearHistory();
    setHistory([]);
  };

  return (
    <div className="flex flex-col h-[560px] bg-slate-950 text-slate-100 select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              Namaw!
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 rounded">
                v1.0
              </span>
            </h1>
          </div>
        </div>

        {/* Global active indicator */}
        {jobs.some((j) => j.state === 'DOWNLOADING') && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 rounded-full px-2.5 py-0.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span>Downloading</span>
          </div>
        )}
      </header>

      {/* Navigation Tabs */}
      <nav className="flex border-b border-slate-800/80 bg-slate-900/20 px-2 pt-1 gap-1">
        <button
          onClick={() => setCurrentTab('page')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all ${
            currentTab === 'page'
              ? 'bg-slate-900 text-indigo-400 border-b-2 border-indigo-500 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>Detected</span>
          {candidates.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-indigo-600/30 text-indigo-300 rounded-full text-[10px] font-mono">
              {candidates.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setCurrentTab('queue')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all ${
            currentTab === 'queue'
              ? 'bg-slate-900 text-indigo-400 border-b-2 border-indigo-500 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <ArrowDownCircle className="w-3.5 h-3.5" />
          <span>Queue</span>
          {jobs.filter((j) => j.state === 'DOWNLOADING' || j.state === 'QUEUED').length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-emerald-600/30 text-emerald-300 rounded-full text-[10px] font-mono">
              {jobs.filter((j) => j.state === 'DOWNLOADING' || j.state === 'QUEUED').length}
            </span>
          )}
        </button>

        <button
          onClick={() => setCurrentTab('history')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all ${
            currentTab === 'history'
              ? 'bg-slate-900 text-indigo-400 border-b-2 border-indigo-500 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>History</span>
        </button>

        <button
          onClick={() => setCurrentTab('settings')}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all ${
            currentTab === 'settings'
              ? 'bg-slate-900 text-indigo-400 border-b-2 border-indigo-500 font-semibold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Settings</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {currentTab === 'page' && (
          <CurrentPage
            candidates={candidates}
            onDownload={handleDownload}
            onRefresh={fetchTabMedia}
            isLoading={isLoading}
            helperConnected={helperStatus.connected}
            onOpenSettings={() => setCurrentTab('settings')}
            onInstallCompanion={handleInstallCompanion}
            installingCompanion={installingCompanion}
          />
        )}
        {currentTab === 'queue' && (
          <DownloadQueue jobs={jobs} onCancelJob={handleCancelJob} onClearFinished={handleClearFinished} />
        )}
        {currentTab === 'history' && (
          <HistoryView history={history} onClearHistory={handleClearHistory} />
        )}
        {currentTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSaveSettings={handleSaveSettings}
            helperStatus={helperStatus}
            onCheckHelper={checkNativeHelper}
            extensionId={chrome.runtime.id}
            onInstallCompanion={handleInstallCompanion}
            installingCompanion={installingCompanion}
          />
        )}
      </main>
    </div>
  );
};
