# ADR-0008: Automated Testing & Continuous Integration Strategy

## Status
Accepted

## Context
Video downloader extensions are prone to regressions due to changes in browser APIs, manifest specs, player behaviors, and asynchronous event ordering. Manual testing is insufficient for verifying detection latency, manifest parsing edge cases, and download lifecycle state transitions.

## Decision
We implement a three-tiered automated testing pyramid accompanied by a strict GitHub Actions CI pipeline:
1. **Unit Testing (Vitest):**
   - HLS master and media playlist parsers.
   - DASH MPD XML parser and template expansion.
   - Media candidate correlation, deduplication, and confidence scoring.
   - Filename sanitization and template substitution.
   - IPC Zod schema validation.
2. **Local HTTP Fixtures (`site-fixtures/`):**
   - A standalone Node/Express fixture server providing controlled test streams: direct MP4, direct WebM, HLS MPEG-TS multi-quality, HLS fMP4, DASH multi-representation, and dynamically injected DOM video elements.
3. **End-to-End (E2E) Browser Testing (Playwright):**
   - Runs headless/headed Chromium with the unpacked Namaw! extension loaded.
   - Navigates to fixture pages, verifies extension action badge updates, opens the popup, verifies format card rendering, and initiates downloads.
4. **Continuous Integration (GitHub Actions):**
   - Workflow runs on every push and pull request: Lint -> Typecheck -> Unit Tests -> Extension Build -> E2E Test Suite.

## Consequences
- Every commit is automatically verified against real browser execution and manifest edge cases before release.
