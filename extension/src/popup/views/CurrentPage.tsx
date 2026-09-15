import React from 'react';
import { Film, RefreshCw, Sparkles, Terminal } from 'lucide-react';
import { MediaCandidate } from '../../shared/types';
import { MediaCard } from '../components/MediaCard';

interface CurrentPageProps {
  candidates: MediaCandidate[];
  onDownload: (candidate: MediaCandidate, variantId?: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  helperConnected?: boolean;
  onOpenSettings?: () => void;
}

export const CurrentPage: React.FC<CurrentPageProps> = ({
  candidates,
  onDownload,
  onRefresh,
  isLoading,
  helperConnected,
  onOpenSettings,
}) => {
  const hasPlatformStream = candidates.some(
    (c) => c.isPlatformStream || c.platform === 'youtube'
  );

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
          <Film className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-slate-200">No media detected</h4>
          <p className="text-xs text-slate-400 max-w-[260px]">
            Play a video on the page or reload the tab to inspect network streams.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium py-1 px-2.5 rounded-md hover:bg-slate-900 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Rescan Page</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3.5">
      {/* Platform Stream Companion Notice (e.g. YouTube) */}
      {hasPlatformStream && !helperConnected && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-200 space-y-2 shadow-md">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-100">Companion App Required for YouTube</p>
              <p className="text-[11px] text-amber-300/80 leading-relaxed mt-0.5">
                YouTube requires yt-dlp + FFmpeg to merge high-quality video and audio without 0MB errors.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-amber-900/40">
            <span className="text-[10px] text-amber-400/90 font-mono">
              run: python native-helper/install.py
            </span>
            <button
              onClick={onOpenSettings}
              className="text-[11px] bg-amber-900/60 hover:bg-amber-800 text-amber-100 font-medium px-2 py-0.5 rounded transition-colors"
            >
              Setup Guide &rarr;
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400 px-0.5">
        <span>
          Detected <strong className="text-indigo-400">{candidates.length}</strong> media stream
          {candidates.length > 1 ? 's' : ''}
        </span>
        <button
          onClick={onRefresh}
          className="hover:text-slate-200 transition-colors flex items-center gap-1"
          title="Refresh detections"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {candidates.map((cand) => (
          <MediaCard key={cand.id} candidate={cand} onDownload={onDownload} />
        ))}
      </div>
    </div>
  );
};
