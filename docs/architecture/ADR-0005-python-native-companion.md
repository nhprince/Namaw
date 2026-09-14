# ADR-0005: Python 3 Native Companion Host

## Status
Accepted

## Context
Certain complex websites (YouTube, Instagram, Facebook, encrypted/signature-timestamped streams) employ rapidly changing anti-scraping mechanisms, proprietary player JavaScript, or produce multi-gigabyte files that cannot be safely processed inside a browser sandbox. The extension requires an optional, external native extraction engine.

## Decision
We implement an optional Native Companion host in **Python 3** (`namaw_helper.py`), utilizing Chrome's official Native Messaging protocol.

## Rationale
1. **Direct `yt-dlp` Integration:** `yt-dlp` is written in Python. Using Python allows either direct Python module import or clean subprocess execution with real-time JSON progress event streaming.
2. **Native FFmpeg Execution:** Directly executes system FFmpeg for hardware-accelerated merging and remuxing without browser sandbox memory limits.
3. **Cross-Platform:** Runs seamlessly on Windows, macOS, and Linux.
4. **Standalone Packaging:** Can be frozen into a standalone executable (`namaw-helper.exe`) using PyInstaller, requiring no pre-installed Python runtime for end users.
5. **Clean Windows Registration:** Simple registry keys for Chrome and Brave under `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.namaw.helper` and `HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.namaw.helper`.

## Consequences
- The extension remains 100% useful standalone for all standard web media.
- Users who need advanced extraction on difficult platforms can install the companion with a single setup script.
