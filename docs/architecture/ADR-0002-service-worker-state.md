# ADR-0002: Ephemeral Service Worker State Management

## Status
Accepted

## Context
Chrome MV3 service workers terminate when idle (~30 seconds of inactivity). Storing state in in-memory global variables causes silent state loss, resetting badge counts, dropping queued downloads, and losing detected media when the user reopens the popup.

## Decision
We enforce a strict two-tiered storage model for all state:
1. **`chrome.storage.local`:** For persistent data across browser sessions (User settings, Download history, custom filename templates).
2. **`chrome.storage.session`:** For tab-specific detected media candidates and transient download queues. `chrome.storage.session` persists across service worker restarts within a browser session, avoiding expensive disk writes while preventing state loss during worker sleep.
3. **Port Keep-Alive:** Active stream download/remuxing pipelines establish a `chrome.runtime.Port` between the Offscreen Document and Service Worker to prevent termination during active transfers.

## Consequences
- No module-level mutable state (`let currentDownloads = ...`) is permitted in background code.
- All service worker message handlers asynchronously re-hydrate state from storage before execution.
