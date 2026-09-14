import React from 'react';
import { History, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { HistoryItem } from '../../shared/types';

interface HistoryViewProps {
  history: HistoryItem[];
  onClearHistory: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ history, onClearHistory }) => {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-2">
        <History className="w-10 h-10 text-slate-600" />
        <p className="text-sm text-slate-300">History is empty</p>
        <p className="text-xs text-slate-500">
          Completed downloads will be safely logged here.
        </p>
      </div>
    );
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="p-3.5 space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Recorded Downloads ({history.length})</span>
        <button
          onClick={onClearHistory}
          className="hover:text-red-400 transition-colors flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear History</span>
        </button>
      </div>

      <div className="space-y-2">
        {history.map((item) => (
          <div
            key={item.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-start gap-3 shadow-md"
          >
            <div className="mt-0.5">
              {item.status === 'COMPLETED' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-0.5">
              <h4 className="text-xs font-medium text-slate-200 truncate" title={item.filename}>
                {item.title || item.filename}
              </h4>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                <span>{new Date(item.completedAt).toLocaleTimeString()}</span>
                {item.fileSize && <span>• {formatBytes(item.fileSize)}</span>}
                <span>• {item.format}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
