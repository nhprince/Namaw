# Chrome Web Store Metadata & Publishing Reference: Namaw!

**Extension Name:** Namaw! — Universal Video Downloader  
**Version:** 1.0.0  
**Last Updated:** 2026-09-15  

---

## 1. Store Listing Metadata

### Short Description (max 132 chars)
Fast, intelligent media detection and downloader for browser-accessible videos, HLS, DASH, and audio streams.

### Detailed Description
Namaw! is a privacy-first, professional media detection and extraction extension for Google Chrome and Brave.

Key Features:
- **Intelligent Multi-Layer Detection:** Automatically detects playable videos, HTML5 media elements, HLS (.m3u8), and DASH (.mpd) manifests on the current webpage.
- **Unified Quality Selector:** Correlates multiple qualities (1080p, 720p, 480p, audio-only) into a single, clean dropdown selector.
- **In-Browser Remuxing:** Fast, client-side stream transmuxing and assembly using lightweight in-memory remuxing.
- **Safe Filenames:** Automatically sanitizes filenames against illegal operating system characters and formats names cleanly using customizable templates.
- **Persistent History:** Keep track of downloaded videos with one-click re-downloading.
- **Optional Native Companion:** Integrates optionally with yt-dlp and system FFmpeg for large-file processing and difficult platforms.
- **Privacy-First:** Operates 100% locally on your machine. Zero tracking, zero telemetry, and zero remote code execution.

### Category
Photos & Video / Productivity

### Single Purpose Description
Namaw! serves a single focused purpose: detecting media resources playing or requested within the active browser tab and enabling the user to download them locally.

---

## 2. Permissions Justification

| Permission / Host | Plain-English Justification for Review Team |
| :--- | :--- |
| `storage` | Required to save user preferences (filename templates, download folders) and store persistent download history locally on the user's device. |
| `downloads` | Required to save detected media files and transmuxed streams to the user's Downloads directory and display download completion status. |
| `webRequest` | Required to passively observe network response headers (`Content-Type: video/*`, `audio/*`, `application/x-mpegURL`, `application/dash+xml`) to detect media manifests and streaming segments that are not exposed as static HTML tags. |
| `offscreen` | Required to host a sandboxed offscreen document for in-browser stream transmuxing (converting MPEG-TS HLS chunks into playable MP4 files using WebAssembly and standard Blobs). |
| `tabs` | Required to read the active tab's title for meaningful filename suggestions and manage per-tab action badge counts. |
| `nativeMessaging` | Required for the optional, user-initiated local companion integration: enables communication with a locally installed host process (yt-dlp + FFmpeg) for sites whose streams cannot be assembled by a browser extension in a standards-compliant way. |
| `<all_urls>` (host_permissions) | Required for the `webRequest` API to passively observe media requests and for verified media fetching across websites where the user chooses to watch videos. |

---

## 3. Privacy & Data Handling Disclosures

- **Does this extension collect user data?** No.
- **Does this extension transmit data to external servers?** No. All detection, manifest parsing, and stream assembly execute entirely on the user's local machine.
- **Does this extension collect or sell personal information?** No.
- **Remote Code Compliance:** 100% compliant with MV3. No remote JavaScript, CSS, or WASM binaries are loaded or executed at runtime. All assets are packaged within the extension.

---

## 4. Version History

- **v1.0.2 (2026-09-17):** Companion is now a self-contained frozen executable (Python + yt-dlp embedded) with an in-process download engine - no system Python and no child processes required; 1-click installer stages the exe from the extension package. Facebook reels/DASH fallback detection, SPA navigation rescanning, stronger CDN URL de-escaping.
- **v1.0.1 (2026-09-17):** Fixed native companion registration (exact extension IDs instead of invalid wildcards), verified in-browser direct-download pipeline (error pages can no longer be saved as videos), byte-range and fMP4 HLS support, download cancellation, concurrency queueing.
