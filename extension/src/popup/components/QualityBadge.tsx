import React from 'react';

interface QualityBadgeProps {
  label?: string;
  type?: string;
}

export const QualityBadge: React.FC<QualityBadgeProps> = ({ label, type }) => {
  let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';

  if (label?.includes('1080') || label?.includes('4K') || label?.includes('2160')) {
    badgeColor = 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60 font-semibold';
  } else if (label?.includes('720')) {
    badgeColor = 'bg-sky-950/80 text-sky-300 border-sky-700/60';
  } else if (type === 'hls') {
    badgeColor = 'bg-amber-950/80 text-amber-300 border-amber-700/60';
  } else if (type === 'dash') {
    badgeColor = 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
  } else if (type === 'audio') {
    badgeColor = 'bg-purple-950/80 text-purple-300 border-purple-700/60';
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono border uppercase tracking-wider ${badgeColor}`}
    >
      {label || type || 'MEDIA'}
    </span>
  );
};
