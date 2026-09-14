# ADR-0003: Multi-Layer Network & DOM Media Detection

## Status
Accepted

## Context
Many modern video players (YouTube, Facebook, Twitter, Reddit, learning platforms) do not expose plain MP4 URLs in static `<video src="...">` HTML tags. Instead, they use Media Source Extensions (MSE) with `blob:http...` URLs fed dynamically by JavaScript chunk requests. Relying solely on DOM scraping fails on most major platforms. Conversely, relying solely on network requests misses static videos, poster metadata, and page titles.

## Decision
We implement a unified multi-layer detection and correlation engine:
1. **Passive `chrome.webRequest` Observer:**
   - Listens to `onHeadersReceived` and `onBeforeRequest` with `<all_urls>` host permissions.
   - Filters for media MIME types (`video/*`, `audio/*`, `application/x-mpegURL`, `application/dash+xml`) and streaming patterns (`.m3u8`, `.mpd`, `.mp4`, `.webm`, `.ts`, `.m4s`).
2. **Lightweight DOM Content Script:**
   - Injected with `run_at: "document_idle"` and `all_frames: true`.
   - Uses `MutationObserver` to watch for newly mounted players.
   - Extracts page metadata, OpenGraph tags, video dimensions, and duration.
3. **Correlation Engine:**
   - Matches network requests to active tab DOM candidates, consolidating duplicate entries into a single `MediaCandidate` with quality variants.

## Consequences
- Accurate detection across both plain HTML5 players and advanced adaptive streaming players.
- Minimal CPU overhead due to passive non-blocking observation.
