import React, { useState } from 'react';
import { Download, Film, Music, Copy, Check, ChevronDown } from 'lucide-react';
import { MediaCandidate } from '../../shared/types';
import { QualityBadge } from './QualityBadge';

interface MediaCardProps {
  candidate: MediaCandidate;
  onDownload: (candidate: MediaCandidate, variantId?: string) => void;
  isDownloading?: boolean;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  candidate,
  onDownload,
  isDownloading,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    candidate.variants?.[0]?.id
  );
  const [copied, setCopied] = useState(false);

  const hasVariants = candidate.variants && candidate.variants.length > 1;
  const currentVariant = candidate.variants?.find((v) => v.id === selectedVariantId);
  const displayResolution =
    currentVariant?.resolution ||
    (candidate.height ? `${candidate.height}p` : undefined) ||
    candidate.variants?.[0]?.resolution;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentVariant?.url || candidate.sourceUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return null;
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 transition-all rounded-xl p-3.5 shadow-lg space-y-3">
      <div className="flex gap-3 items-start">
        {/* Thumbnail / Icon */}
        <div className="relative w-16 h-12 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
          {candidate.thumbnailUrl ? (
            <img
              src={candidate.thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : candidate.hasVideo ? (
            <Film className="w-5 h-5 text-indigo-400" />
          ) : (
            <Music className="w-5 h-5 text-purple-400" />
          )}
        </div>

        {/* Title & Metadata */}
        <div className="flex-1 min-w-0 space-y-1">
          <h3
            className="text-sm font-medium text-slate-100 truncate"
            title={candidate.title}
          >
            {candidate.title || 'Untitled Media'}
          </h3>

          <div className="flex flex-wrap items-center gap-1.5">
            {candidate.platform === 'youtube' && <QualityBadge type="youtube" label="YouTube" />}
            {displayResolution && <QualityBadge label={displayResolution} />}
            <QualityBadge type={candidate.type} />
            {formatFileSize(candidate.fileSize) && (
              <span className="text-[11px] text-slate-400 font-mono">
                {formatFileSize(candidate.fileSize)}
              </span>
            )}
          </div>
        </div>

        {/* Copy Link Button */}
        <button
          onClick={handleCopy}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
          title="Copy stream URL"
        >
          {copied ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Variant Selector (if multi-quality) & Download Action */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
        {hasVariants ? (
          <div className="relative flex-1">
            <select
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 pr-8 appearance-none focus:outline-none focus:border-indigo-500 font-mono"
            >
              {candidate.variants!.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.resolution || 'Auto'} {v.bandwidth ? `(${Math.round(v.bandwidth / 1000)}k)` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        ) : (
          <div className="flex-1 text-xs text-slate-500 truncate">
            {candidate.mimeType || `${candidate.type.toUpperCase()} stream`}
          </div>
        )}

        <button
          onClick={() => onDownload(candidate, selectedVariantId)}
          disabled={isDownloading}
          className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-md transition-all shadow-indigo-600/20"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isDownloading ? 'Starting...' : 'Download'}</span>
        </button>
      </div>
    </div>
  );
};
