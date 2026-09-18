import React from 'react';
import { ArrowDownCircle, CheckCircle, XCircle, AlertCircle, Trash2, Ban } from 'lucide-react';
import { DownloadJob } from '../../shared/types';
import { ProgressBar } from '../components/ProgressBar';

interface DownloadQueueProps {
  jobs: DownloadJob[];
  onCancelJob: (jobId: string) => void;
  onClearFinished: () => void;
}

export const DownloadQueue: React.FC<DownloadQueueProps> = ({ jobs, onCancelJob, onClearFinished }) => {
  const finishedCount = jobs.filter(
    (j) => j.state === 'COMPLETED' || j.state === 'FAILED' || j.state === 'CANCELLED' || j.state === 'COMPANION_REQUIRED'
  ).length;

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-2">
        <ArrowDownCircle className="w-10 h-10 text-slate-600" />
        <p className="text-sm text-slate-300">No active downloads</p>
        <p className="text-xs text-slate-500">
          Items currently downloading or assembling will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3.5 space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Jobs ({jobs.length})</span>
        {finishedCount > 0 && (
          <button
            onClick={onClearFinished}
            className="hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear finished</span>
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2.5 shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-medium text-slate-200 truncate" title={job.targetFilename}>
                  {job.targetFilename}
                </h4>
                <span className="text-[11px] text-slate-500 font-mono">
                  Engine: {job.engine} • State: {job.state}
                </span>
              </div>

              {job.state === 'COMPLETED' ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : job.state === 'FAILED' ? (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              ) : job.state === 'CANCELLED' ? (
                <Ban className="w-4 h-4 text-slate-500 flex-shrink-0" />
              ) : (
                <button
                  onClick={() => onCancelJob(job.id)}
                  className="text-slate-500 hover:text-red-400 transition-colors p-1"
                  title="Cancel download"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            {job.state === 'FAILED' || job.state === 'COMPANION_REQUIRED' ? (
              <p className="text-xs text-red-400/90 font-mono bg-red-950/40 border border-red-900/50 rounded-md p-1.5">
                {job.errorDetails || 'Download failed'}
              </p>
            ) : (
              <ProgressBar
                percent={job.progress.percent}
                downloadedBytes={job.progress.downloadedBytes}
                totalBytes={job.progress.totalBytes}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
