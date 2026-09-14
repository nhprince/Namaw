# Comprehensive Technical Research Report: Namaw! Architecture

**Project:** Namaw! — Universal Video Downloader Browser Extension  
**Status:** Approved  
**Target Browsers:** Google Chrome, Brave (Primary); Firefox & Chromium derivatives (Secondary/Future)  
**Manifest Target:** Manifest V3 (MV3)  

---

## Executive Summary
This document fulfills the requirements of Task 1 of the Namaw! technical roadmap. It synthesizes current engineering realities, platform limitations, security and sandbox constraints, media transport specifications, and architectural patterns for high-throughput browser-based media detection and extraction.

---

## 1. Current Chrome MV3 Architecture & Runtime Contexts
In modern Chromium (Chrome 120+, 2026 baseline), Manifest V3 divides execution across isolated execution contexts:

| Context | Lifetime | DOM Access | Web APIs | `chrome.*` Access | Primary Responsibility in Namaw! |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Service Worker** | Ephemeral (~30s idle timeout) | None | Standard JS, `fetch`, `caches`, `crypto` | Full access (`downloads`, `webRequest`, `storage`, `offscreen`, `tabs`, `action`) | Orchestration, network monitoring, correlation, state sync, download initiation. |
| **Content Script** | Tied to tab DOM | Full DOM | Window DOM APIs, `MutationObserver` | Restricted (`runtime.sendMessage`, `storage.local`) | Inspects `<video>`, `<audio>`, `<source>`, player metadata, DOM mutations. |
| **Popup / UI** | Active while open | Full DOM | Standard DOM, React 19, WebGL, Canvas | Standard extension APIs | User interface, quality selector, download progress display, history view. |
| **Offscreen Document** | Programmatic lifecycle | Full DOM | DOM, Web Workers, AudioContext, Canvas, WASM, Blobs | Severely restricted (`runtime.sendMessage`, `runtime.onMessage`, `runtime.getURL`) | In-browser remuxing (`mux.js`, `ffmpeg.wasm`), blob URL creation, stream merging. |
| **Native Companion** | Independent OS process | Full OS | Python 3, native binaries, filesystem | Standard I/O Native Messaging protocol | `yt-dlp` extraction, native FFmpeg, large-file assembly, protected platform extraction. |

---

## 2. Brave Compatibility & Specifics
Brave is built on the Chromium engine and natively supports Chrome Extensions and Manifest V3.
- **Shields & Privacy Protections:** Brave's built-in Shields aggressively block trackers and fingerprinting. Extension requests made via `chrome.webRequest` or `fetch` inside the background service worker are exempt from page-level adblock rules, provided proper `host_permissions` are declared.
- **Native Messaging Registry:** On Windows, Brave looks for Native Messaging hosts in:
  `HKEY_CURRENT_USER\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\<host_name>`
  Namaw's native helper installer must register both Chrome and Brave keys simultaneously.

---

## 3. Firefox Future Compatibility
Firefox supports Manifest V3 with a few distinct architectural advantages and differences:
- **Event Pages vs Service Workers:** Firefox supports non-persistent event background pages (which retain DOM access) as well as background service workers.
- **`browser.*` Namespace:** Firefox natively uses the Promise-based `browser.*` namespace.
- **Polyfill & Framework Solution:** By adopting **WXT**, all `browser.*` API calls are standardized through the `webextension-polyfill` abstraction layer, enabling single-codebase cross-compilation for Chrome and Firefox targets.

---

## 4. Permission Analysis & Least Privilege Strategy
To ensure maximum user trust, transparent Chrome Web Store review approval, and minimal security footprint, permissions are separated into required and optional tiers:

### Required Core Permissions
- `webRequest`: Required for passive observation of media URLs, manifests, and content types across tabs.
- `storage`: Required for persisting download history, user settings, and session correlation state.
- `downloads`: Required to save files to the user's Downloads directory and track download progress.
- `offscreen`: Required to launch the Offscreen Document for WASM/mux.js remuxing.
- `tabs`: Required to access `tab.url`, `tab.title`, and display per-tab badges.
- `host_permissions: ["<all_urls>"]`: Required so `webRequest` can observe media traffic across all legitimate sites.

### Optional Permissions (Requested On-Demand)
- `notifications`: Requested when the user enables desktop notifications for completed or failed downloads.
- `contextMenus`: Requested if the user enables "Download with Namaw!" context menu on right-clicked links or video elements.

---

## 5. Network Detection Capabilities (`webRequest` in MV3)
While MV3 restricted `webRequestBlocking` (the synchronous blocking/modifying capability) for public extensions, **passive observation** remains fully supported:
- `chrome.webRequest.onHeadersReceived`: Enables reading response headers such as `Content-Type`, `Content-Length`, `Content-Range`, and `Content-Disposition`.
  - Target MIME types: `video/*`, `audio/*`, `application/vnd.apple.mpegurl`, `application/x-mpegURL`, `application/dash+xml`, `application/octet-stream`.
- `chrome.webRequest.onBeforeRequest`: Enables URL pattern matching before payloads download:
  - Patterns: `.m3u8`, `.mpd`, `.mp4`, `.webm`, `.m4v`, `.mov`, `.ts`, `.m4s`, `.aac`, `.mp3`.
- By maintaining an in-memory ring-buffer in `chrome.storage.session`, network requests are correlated with the active `tabId`.

---

## 6. Service Worker Lifetime Limitations & Mitigations
Service workers terminate after 30 seconds of inactivity.
- **State Storage:** All persistent data (settings, download history) is stored in `chrome.storage.local`.
- **Ephemeral Session Data:** Active media detections per tab are stored in `chrome.storage.session` (fast, persists across service worker restarts until browser closes).
- **Download Keep-Alive:** When executing a multi-segment download, opening a long-lived `chrome.runtime.Port` between the Offscreen Document and the Service Worker keeps the worker active until the job completes. Native browser downloads (`chrome.downloads`) continue independently of service worker lifetime.

---

## 7. Offscreen Document Capabilities & Boundaries
Chrome's `chrome.offscreen` API creates a hidden HTML document running with full DOM access.
- **Allowed Reasons:** `WORKERS`, `BLOBS`.
- **Limitations:**
  - An extension can only have **one** active offscreen document at any time.
  - Offscreen documents **do not have access** to `chrome.downloads`, `chrome.tabs`, `chrome.action`.
- **Communication Flow:**
  `Service Worker` ─── `chrome.runtime.sendMessage` ───► `Offscreen Document`
  `Offscreen Document` ─── `chrome.runtime.sendMessage` ───► `Service Worker`
  The offscreen document performs fetching, parsing, transmuxing, and produces a final Blob / Object URL or streams chunks, signaling the Service Worker to trigger `chrome.downloads.download()`.

---

## 8. In-Browser Remuxing: `mux.js` vs `ffmpeg.wasm`

### The Problem with Pure `ffmpeg.wasm`
- `ffmpeg.wasm` multi-threaded builds require `SharedArrayBuffer`, which mandates `cross_origin_embedder_policy: "require-corp"`. Under `require-corp`, fetching CDN video segments that lack `Cross-Origin-Resource-Policy: cross-origin` headers will be blocked by the browser.
- Furthermore, packaging the 30MB+ WASM binary increases extension bundle size and startup latency.

### The Namaw! Two-Tier Solution
1. **Tier 1 (mux.js Fast-Path):**
   - For standard MPEG-TS HLS streams, `mux.js` transmuxes MPEG-TS chunks directly into fragmented MP4 (fMP4) in JavaScript.
   - It is lightweight (<100KB), fast, and requires zero WASM or cross-origin isolation headers.
2. **Tier 2 (Single-Threaded `@ffmpeg/ffmpeg`):**
   - For DASH streams requiring merging of separate video and audio streams (`.m4v` + `.m4a`), use single-threaded `@ffmpeg/ffmpeg` inside the Offscreen Document.
   - Single-threaded mode operates without `SharedArrayBuffer`, avoiding `require-corp` CORS collisions.
   - Remuxing uses `-c copy` (stream copy), avoiding heavy re-encoding and finishing in seconds.

---

## 9. HLS (HTTP Live Streaming) Architecture
- **Master Playlist:** Contains `#EXT-X-STREAM-INF` tags indicating available variants with `BANDWIDTH`, `RESOLUTION`, `CODECS`, and audio group associations.
- **Media Playlist:** Contains:
  - Sequence of segments (`#EXTINF:<duration>,<uri>`).
  - Byte-range addressing (`#EXT-X-BYTERANGE: <length>[@<offset>]`).
  - Initialization maps for fragmented MP4 (`#EXT-X-MAP:URI="<init.mp4>"`).
  - DRM / AES encryption markers (`#EXT-X-KEY:METHOD=SAMPLE-AES|AES-128`).
- **Segment Fetching:** Managed with a bounded concurrency pool (default 4 concurrent HTTP requests) with automatic exponential backoff retry.

---

## 10. DASH (Dynamic Adaptive Streaming over HTTP) Architecture
- **MPD Manifest:** XML document containing `<Period>` -> `<AdaptationSet>` -> `<Representation>`.
- **Stream Separation:** Video and audio are almost always served in separate adaptation sets.
- **Addressing Schemes:**
  - `<SegmentTemplate>`: Uses `$RepresentationID$`, `$Number$`, `$Time$` substitution with `<SegmentTimeline>`.
  - `<SegmentList>`: Explicit `<SegmentURL>` entries.
- **Assembly Strategy:** Video track segments and audio track segments are downloaded concurrently, concatenated with their respective initialization segments (`<Initialization sourceURL="...">`), and merged into a single MP4 container via Offscreen Remuxer or Native Companion.

---

## 11. Native Companion Architecture (`yt-dlp` + FFmpeg)
When media is protected, uses dynamic chunk signature verification, or exceeds in-browser memory limits (e.g. >500MB):
- **Host Binary:** Python 3 Native Messaging Host (`namaw_helper.py`).
- **Communication Protocol:** Chrome Native Messaging over standard I/O (4-byte unsigned integer prefix indicating JSON payload size).
- **yt-dlp Integration:** Direct programmatic invocation or subprocess execution with `--newline` JSON progress hooks.
- **Native FFmpeg:** Fast hardware-accelerated remuxing and merging on the user's OS without browser memory ceilings.

---

## 12. Security & Chrome Web Store Policy Compliance
- **No Remote Code Execution:** All JS, WASM, and CSS are bundled locally within the extension package. Zero runtime `eval()`, `new Function()`, or dynamic `<script src="https://...">` loading.
- **Strict Content Security Policy (CSP):**
  `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`
- **Input Sanitization:**
  - All filenames are sanitized against Windows/Linux/macOS reserved words (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) and characters (`< > : " / \ | ? *`).
  - URLs and message payloads validated using strict Zod schemas before execution.
- **Privacy Model:**
  - Zero external analytics or telemetry tracking.
  - Media URLs and browsing history are never transmitted outside the user's machine.

---

## 13. Testing Strategy & CI/CD Architecture
- **Unit Testing:** Vitest for manifest parsers (HLS & DASH), filename sanitization, deduplication, and schema validation.
- **Integration Testing:** Testing message routing between Content Script, Service Worker, and Offscreen Document.
- **End-to-End (E2E) Testing:** Playwright driving Chromium with the unpacked extension loaded, running against local HTTP test fixtures (`site-fixtures`).
- **Continuous Integration (CI):** GitHub Actions matrix testing on push/PR:
  1. `npm run lint`
  2. `npm run typecheck`
  3. `npm run test` (Vitest)
  4. `npm run build` (WXT extension packaging)
  5. `npm run test:e2e` (Playwright)
