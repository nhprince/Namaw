# ADR-0004: Two-Tier In-Browser Stream Remuxing

## Status
Accepted

## Context
Downloaded HLS streams (MPEG-TS chunks) and DASH streams (separate fragmented MP4 video and audio tracks) cannot be played directly without container remuxing. While `ffmpeg.wasm` is capable of handling complex remuxing, multithreaded builds require `SharedArrayBuffer` and `cross_origin_embedder_policy: "require-corp"`. Under `require-corp`, segment fetches from arbitrary video CDNs fail if the CDN does not supply `Cross-Origin-Resource-Policy: cross-origin` headers. Furthermore, shipping a 30MB WASM binary for simple TS transmuxing creates excessive bundle bloat and memory usage.

## Decision
We implement a two-tier remuxing strategy inside the Offscreen Document:
1. **Tier 1 (Fast-Path TS Transmuxing via `mux.js`):**
   - For MPEG-TS HLS streams, use `mux.js` to repackage MPEG-TS packets into ISO BMFF (fMP4) entirely in memory.
   - Requires zero WASM binaries, runs instantly, and does not require cross-origin isolation headers.
2. **Tier 2 (Single-Threaded `@ffmpeg/ffmpeg` Remuxing):**
   - For DASH separate video/audio streams requiring multiplexing into a single `.mp4` file, use single-threaded `@ffmpeg/ffmpeg` with `-c copy`.
   - Single-threaded mode avoids `SharedArrayBuffer` / `require-corp` restrictions while remuxing without CPU-intensive re-encoding.
3. **Tier 3 Escalation:**
   - Large jobs exceeding browser memory limits (>500MB) prompt the user to escalate to the Native Companion.

## Consequences
- Fast, reliable remuxing for 95% of browser-based streams without CDN CORS/CORP fetch failures.
- Extension bundle size remains lean and fast to load.
