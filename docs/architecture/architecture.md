# System Architecture Specification: Namaw!

**System:** Namaw! — Universal Video Downloader Browser Extension  
**Version:** 1.0.0-draft  
**Target Manifest:** Chrome Extensions Manifest V3 (MV3)  

---

## 1. High-Level Architecture

Namaw! operates as a modular, five-layer system spanning the browser frontend, background service worker, offscreen processing sandbox, and an optional operating system native companion:

```
                            ┌──────────────────────────────────────────┐
                            │               Current Tab                │
                            │         Webpage / Media Player           │
                            └────────────────────┬─────────────────────┘
                                                 │
                     ┌───────────────────────────┴───────────────────────────┐
                     │                                                       │
        ┌────────────▼────────────┐                             ┌────────────▼────────────┐
        │     Content Detector    │                             │     Network Detector    │
        │                         │                             │                         │
        │ • <video> / <audio>     │                             │ • webRequest headers    │
        │ • <source> elements     │                             │ • MIME content types    │
        │ • Dynamic DOM mutations │                             │ • Manifest URLs (.m3u8) │
        │ • Player metadata       │                             │ • Segment requests      │
        └────────────┬────────────┘                             └────────────┬────────────┘
                     │                                                       │
                     └───────────────────────────┬───────────────────────────┘
                                                 │
                                     ┌───────────▼───────────┐
                                     │   Correlation Engine   │
                                     │                       │
                                     │ • Canonical normalization
                                     │ • Format grouping     │
                                     │ • Deduplication       │
                                     │ • Confidence scoring  │
                                     └───────────┬───────────┘
                                                 │
                                   chrome.runtime messaging
                                                 │
                     ┌───────────────────────────┼───────────────────────────┐
                     │                           │                           │
        ┌────────────▼───────────┐  ┌────────────▼───────────┐  ┌────────────▼───────────┐
        │       Popup UI         │  │     Service Worker     │  │   Options / History    │
        │                        │  │                        │  │                        │
        │ • Detected media cards │  │ • Orchestration        │  │ • Persistent history   │
        │ • Quality selector     │  │ • Queue management     │  │ • User preferences     │
        │ • Download progress    │  │ • Badge updates        │  │ • Diagnostics exporter │
        │ • Quick actions        │  │ • Session state cache  │  │ • Helper health check  │
        └────────────────────────┘  └────────────┬───────────┘  └────────────────────────┘
                                                 │
                                     ┌───────────▼───────────┐
                                     │  Offscreen Document   │
                                     │                       │
                                     │ • mux.js TS transmux  │
                                     │ • ffmpeg.wasm merging │
                                     │ • Chunk concatenation │
                                     │ • Blob / Object URL   │
                                     └───────────┬───────────┘
                                                 │
                                      (Escalation / Optional)
                                                 │
                                     ┌───────────▼───────────┐
                                     │   Native Companion    │
                                     │                       │
                                     │ • yt-dlp extractor    │
                                     │ • System FFmpeg merge │
                                     │ • Large file handler  │
                                     │ • Protected streams   │
                                     └───────────────────────┘
```

---

## 2. Core Data Models

### 2.1 MediaCandidate
The canonical entity representing a detected media resource on a specific tab:

```typescript
export type MediaType = 'direct' | 'hls' | 'dash' | 'audio' | 'video' | 'unknown';

export interface MediaCandidate {
  id: string;                 // Deterministic hash: sha256(tabId + normalizedUrl)
  tabId: number;              // Chrome Tab ID
  pageUrl: string;            // Top-level document URL
  sourceUrl: string;          // Direct URL or manifest URL
  type: MediaType;
  mimeType?: string;
  
  title: string;              // Resolved media or page title
  filename?: string;          // Proposed sanitized filename
  thumbnailUrl?: string;      // Video poster or page thumbnail
  
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;          // In seconds
  fileSize?: number;          // Bytes, if known
  bitrate?: number;           // bps, if known
  
  hasVideo: boolean;
  hasAudio: boolean;
  
  variants?: MediaVariant[];  // Extracted stream qualities (e.g. from HLS/DASH)
  
  extractor: string;          // 'dom' | 'network' | 'hls' | 'dash' | 'yt-dlp'
  confidence: number;         // 0 to 100 confidence score
  detectedAt: number;         // Unix timestamp (ms)
}

export interface MediaVariant {
  id: string;
  resolution?: string;        // e.g. "1080p", "720p"
  width?: number;
  height?: number;
  bandwidth?: number;
  codecs?: string;
  url: string;
  hasVideo: boolean;
  hasAudio: boolean;
}
```

### 2.2 DownloadJob State Machine
Every download progresses through explicit, deterministic lifecycle states:

```typescript
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
  | 'DRM_PROTECTED';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent: number;            // 0 - 100
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
```

---

## 3. Correlation & Deduplication Engine

The Correlation Engine prevents UI clutter where multiple events (DOM tag, poster image, `.m3u8` request, segment chunks) originate from the same logical media item.

### Correlation Algorithm
1. **URL Normalization:** Remove ephemeral query parameters (`ts`, `nonce`, `token`, `expires`, tracking query strings).
2. **Stream Grouping:**
   - If an `.m3u8` or `.mpd` request is intercepted for a tab containing a `<video>` tag whose `currentSrc` is a `blob:`, correlate the manifest with the DOM player dimensions and title.
   - If audio and video segment URLs share a base path or manifest reference, group them under a single multi-representation candidate.
3. **Confidence Scoring:**
   - Direct video tag with confirmed playback dimensions and Content-Length: **100**
   - Parsed HLS Master Playlist: **95**
   - Media playlist or single variant: **85**
   - Passive network sniff with video MIME type: **75**
   - Unverified blob URL: **40**

---

## 4. Offscreen Remuxing Architecture

When HLS or DASH streams cannot be downloaded as simple static files, the Service Worker coordinates with the Offscreen Document:

1. **Document Instantiation:**
   ```typescript
   await chrome.offscreen.createDocument({
     url: 'offscreen.html',
     reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.BLOBS],
     justification: 'In-browser stream transmuxing and assembly'
   });
   ```
2. **Execution Paths:**
   - **MPEG-TS HLS:** `mux.js` transmuxes `.ts` chunks to ISO BMFF fMP4 in a fast, in-memory pipeline.
   - **DASH (Separate Video & Audio):** Segments are downloaded, buffered, and passed into single-threaded `@ffmpeg/ffmpeg` with `-c copy` to merge video and audio into a single `.mp4` file.
3. **Download Handoff:**
   - Offscreen Document creates a temporary `blob:` Object URL and sends the URL to the Service Worker.
   - The Service Worker triggers `chrome.downloads.download({ url: blobUrl, filename: targetFilename })`.
   - On download completion event (`chrome.downloads.onChanged`), the Object URL is revoked and the Offscreen Document is closed if no other jobs are active.

---

## 5. Native Companion Protocol (JSON-RPC over Stdio)

The Native Companion (`namaw_helper.py`) connects via `chrome.runtime.connectNative("com.namaw.helper")`.

### Message Framing
- 4 bytes unsigned 32-bit integer (little-endian) specifying length, followed by UTF-8 encoded JSON.

### Command Specification
- **`ping`**: `{"action": "ping"}` ➔ `{"status": "ok", "version": "1.0.0", "ytdlp_version": "2026.03.01", "ffmpeg_available": true}`
- **`extract`**: `{"action": "extract", "url": "https://...", "cookies_browser": "chrome"}` ➔ Returns parsed format tree.
- **`download`**: `{"action": "download", "url": "https://...", "format_id": "bestvideo+bestaudio", "output_path": "..."}` ➔ Streams progress events: `{"event": "progress", "percent": 54.2, "speed": 1048576, "eta": 12}`.
- **`cancel`**: `{"action": "cancel", "job_id": "..."}` ➔ Terminates active child process.

---

## 6. Storage Schema

### `chrome.storage.local` (Persistent)
```json
{
  "settings": {
    "namingTemplate": "{title} [{resolution}].{ext}",
    "downloadSubfolder": "Namaw",
    "maxConcurrentDownloads": 3,
    "preferNativeCompanion": false,
    "theme": "system",
    "enableNotifications": true
  },
  "history": [
    {
      "id": "job_1720000000_123",
      "title": "Sample Video",
      "filename": "Sample Video [1080p].mp4",
      "fileSize": 15420000,
      "pageUrl": "https://example.com/watch",
      "format": "1080p MP4",
      "completedAt": 1720000025,
      "status": "COMPLETED"
    }
  ]
}
```

### `chrome.storage.session` (Per-Browser Session Cache)
```json
{
  "tab_candidates_12345": [
    {
      "id": "cand_987",
      "title": "Big Buck Bunny",
      "sourceUrl": "https://commondatastorage.googleapis.com/.../bbb.mp4",
      "confidence": 100
    }
  ],
  "active_jobs": {}
}
```

---

## 7. Site Extractor Plugin Architecture

Extensibility is achieved through a pluggable Extractor interface:

```typescript
export interface Extractor {
  id: string;
  name: string;
  matches(url: URL): boolean;
  detect(context: ExtractionContext): Promise<MediaCandidate[]>;
  getCapabilities(): {
    supportsInBrowser: boolean;
    requiresNativeHelper: boolean;
    supportsQualities: boolean;
  };
}
```

Built-in extractors:
1. `GenericHtml5Extractor`: DOM video/audio tags and `<source>` elements.
2. `GenericHlsExtractor`: `.m3u8` manifests and variant playlists.
3. `GenericDashExtractor`: `.mpd` manifests and adaptation sets.
4. `NativeYtdlpExtractor`: Delegates platform-specific extraction to the native companion.
