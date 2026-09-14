# Namaw! — Universal Video Downloader

Namaw! is a production-grade, privacy-first Manifest V3 browser extension and media extraction platform for Google Chrome and Brave (architecturally prepared for Firefox).

Designed with the capabilities of mature tools like Video DownloadHelper (VDH), Namaw! automatically detects playable videos, HTML5 media elements, HLS (`.m3u8`), and DASH (`.mpd`) streams, correlates representations into unified quality pickers, performs client-side remuxing, and provides an optional Python native companion for `yt-dlp` and system FFmpeg integration.

---

## Key Features

- **Multi-Layer Detection Engine:** Passively monitors network requests (`chrome.webRequest.onHeadersReceived`) and page DOM mutations (`MutationObserver`) to detect both static media and dynamic MSE streams.
- **Smart Correlation & Deduplication:** Normalizes URLs, groups related variants, merges DOM metadata with network manifests, and scores detection confidence.
- **In-Browser Remuxing:** Transmuxes MPEG-TS HLS streams into standard fragmented MP4 directly in an isolated Offscreen Document using `mux.js`.
- **Quality & Variant Selector:** Automatically parses HLS master playlists and DASH adaptation sets into 1080p, 720p, 480p, and audio-only choices.
- **Filename Sanitization:** Formats filenames with customizable templates (`{title} [{resolution}].{ext}`) while neutralizing path traversal attempts and Windows reserved names.
- **Persistent History & Queue:** Local SQLite/IndexedDB/`chrome.storage` tracking of download jobs and completed downloads.
- **Optional Native Companion:** A standalone Python 3 Native Messaging Host providing `yt-dlp` and native FFmpeg extraction for difficult sites and multi-gigabyte streams.
- **Zero Remote Code Execution:** 100% Manifest V3 compliant. Zero remote scripts, zero telemetry, and zero tracking.

---

## Architecture Overview

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
        │ <video>, <audio>, DOM   │                             │ webRequest, MIME types  │
        └────────────┬────────────┘                             └────────────┬────────────┘
                     │                                                       │
                     └───────────────────────────┬───────────────────────────┘
                                                 │
                                     ┌───────────▼───────────┐
                                     │   Correlation Engine   │
                                     └───────────┬───────────┘
                                                 │
                     ┌───────────────────────────┼───────────────────────────┐
                     │                           │                           │
        ┌────────────▼───────────┐  ┌────────────▼───────────┐  ┌────────────▼───────────┐
        │       Popup UI         │  │     Service Worker     │  │   Options / History    │
        └────────────────────────┘  └────────────┬───────────┘  └────────────────────────┘
                                                 │
                                     ┌───────────▼───────────┐
                                     │  Offscreen Document   │
                                     │   mux.js Transmuxer   │
                                     └───────────┬───────────┘
                                                 │
                                     ┌───────────▼───────────┐
                                     │   Native Companion    │
                                     │   yt-dlp & FFmpeg     │
                                     └───────────────────────┘
```

For in-depth architectural specifications and Architectural Decision Records (ADRs), see:
- [docs/architecture/research.md](file:///d:/Workspace/Namaw/docs/architecture/research.md)
- [docs/architecture/architecture.md](file:///d:/Workspace/Namaw/docs/architecture/architecture.md)
- [docs/architecture/ADR-0001-wxt-framework.md](file:///d:/Workspace/Namaw/docs/architecture/ADR-0001-wxt-framework.md) through [ADR-0008-testing-and-ci-strategy.md](file:///d:/Workspace/Namaw/docs/architecture/ADR-0008-testing-and-ci-strategy.md)

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Extension in Development Mode
```bash
npm run dev
```
WXT will launch a dedicated browser profile with the extension pre-loaded and Hot Module Replacement (HMR) active.

### 3. Build for Production
```bash
npm run build
```
The compiled, store-ready Manifest V3 extension is emitted to `extension/.output/chrome-mv3/`.

### 4. Load in Chrome or Brave
1. Open `chrome://extensions` (or `brave://extensions`).
2. Toggle on **Developer mode** in the upper right.
3. Click **Load unpacked** and select `d:/Workspace/Namaw/extension/.output/chrome-mv3`.

### 5. (Optional) Install Native Companion
To enable `yt-dlp` extraction for difficult platforms and native FFmpeg merging:
```bash
python native-helper/install.py
```

---

## Running Automated Tests

### Unit Tests (Vitest)
Runs tests for HLS/DASH parsers, filename sanitization, correlation engine, and IPC schemas:
```bash
npm test
```

### Test Fixtures Server
Starts the local fixture server:
```bash
npm run fixtures:start
```
Serves test pages on `http://localhost:3456`:
- `/direct-mp4.html`: Standard HTML5 video fixture
- `/hls-stream.html`: HLS adaptive playlist fixture
- `/dynamic-video.html`: MutationObserver dynamic video injection fixture

---

## Security & Privacy

- **Local Execution:** All processing happens directly in your browser or local companion process.
- **Sanitized Inputs:** All filenames and IPC payloads undergo runtime validation via Zod and strict OS path sanitization.
- **No Analytics:** Namaw! does not track your browsing history or transmit your media URLs to third-party servers.
- **Store Compliance:** See [CHROMEWEBSTORE.md](file:///d:/Workspace/Namaw/CHROMEWEBSTORE.md) for full permission justifications and listing disclosures.
