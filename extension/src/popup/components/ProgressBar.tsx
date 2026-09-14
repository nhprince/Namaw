import React from 'react';

interface ProgressBarProps {
  percent: number;
  downloadedBytes?: number;
  totalBytes?: number;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percent,
  downloadedBytes,
  totalBytes,
}) => {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="w-full space-y-1.5">
      <div className="flex justify-between text-xs text-slate-400 font-mono">
        <span>{clamped}%</span>
        <span>
          {formatBytes(downloadedBytes)}
          {totalBytes ? ` / ${formatBytes(totalBytes)}` : ''}
        </span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300 rounded-full"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};
