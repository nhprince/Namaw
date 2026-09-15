export type MediaType =
  | 'direct'
  | 'hls'
  | 'dash'
  | 'audio'
  | 'video'
  | 'unknown';

export interface MediaVariant {
  id: string;
  resolution?: string; // e.g., '1080p', '720p', '480p'
  width?: number;
  height?: number;
  bandwidth?: number;
  codecs?: string;
  url: string;
  hasVideo: boolean;
  hasAudio: boolean;
  formatContainer?: string; // 'mp4', 'ts', 'webm', 'm4s'
}

export interface MediaCandidate {
  id: string; // Deterministic hash
  tabId: number;
  pageUrl: string;
  sourceUrl: string;
  type: MediaType;
  mimeType?: string;

  title: string;
  filename?: string;
  thumbnailUrl?: string;

  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  fileSize?: number;
  bitrate?: number;

  hasVideo: boolean;
  hasAudio: boolean;

  variants?: MediaVariant[];

  extractor: string; // 'dom' | 'network' | 'hls' | 'dash' | 'yt-dlp' | 'youtube'
  confidence: number; // 0 to 100
  detectedAt: number;

  isPlatformStream?: boolean;
  requiresNativeHelper?: boolean;
  platform?: 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'twitter' | 'reddit' | 'vimeo' | 'generic';
}

export type DownloadState =
  | 'DETECTED'
  | 'ANALYZING'
  | 'READY'
  | 'QUEUED'
  | 'DOWNLOADING'
  | 'REMUXING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RETRYING'
  | 'FAILED'
  | 'UNSUPPORTED'
  | 'DRM_PROTECTED'
  | 'COMPANION_REQUIRED';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent: number;
  speedBytesPerSec: number;
  etaSeconds?: number;
  currentSegment?: number;
  totalSegments?: number;
}

export interface DownloadJob {
  id: string;
  mediaCandidateId: string;
  selectedVariantId?: string;
  targetFilename: string;
  state: DownloadState;
  progress: DownloadProgress;
  errorDetails?: string;
  engine: 'browser' | 'offscreen_mux' | 'offscreen_ffmpeg' | 'native_companion';
  createdAt: number;
  updatedAt: number;
}

export interface UserSettings {
  namingTemplate: string;
  downloadSubfolder: string;
  maxConcurrentDownloads: number;
  preferNativeCompanion: boolean;
  theme: 'system' | 'dark' | 'light';
  enableNotifications: boolean;
}

export interface HistoryItem {
  id: string;
  title: string;
  filename: string;
  fileSize?: number;
  pageUrl: string;
  format: string;
  completedAt: number;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED';
  error?: string;
}

export interface NativeHelperStatus {
  connected: boolean;
  version?: string;
  ytdlpVersion?: string;
  ffmpegAvailable?: boolean;
  error?: string;
}
