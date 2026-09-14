# ADR-0007: Security Boundaries & Chrome Web Store Compliance

## Status
Accepted

## Context
Extensions that touch web traffic, download files, or integrate with native applications undergo strict automated and manual security reviews by the Chrome Web Store team. Common rejection triggers include:
- Requesting excessive permissions without granular justification.
- Loading or executing remote code at runtime (prohibited in MV3).
- Collecting or transmitting browsing history or cookies to remote servers.
- Insecure filename handling that allows path traversal or disk corruption.

## Decision
We establish a zero-remote-code, privacy-first engineering standard:
1. **Zero Remote Execution:** All code (JS, CSS, HTML, WebAssembly) is bundled locally within the extension. No remote scripts (`eval`, `new Function`, external CDNs) are used.
2. **Local-Only Processing:** Media detection, manifest parsing, and remuxing occur entirely on the user's local machine. No URLs, session data, or browsing activity are transmitted to any remote analytics or Namaw servers.
3. **Strict Filename Sanitization:** Filenames derived from video titles or URLs are sanitized against path traversal (`../`, absolute paths) and operating system reserved characters (`< > : " / \ | ? *`, control codes, and Windows reserved device names like `CON`, `PRN`, `AUX`, `NUL`).
4. **Transparent Store Listing Documentation:** Maintain `CHROMEWEBSTORE.md` with explicit, plain-English justifications for every requested permission.

## Consequences
- Guarantees seamless Chrome Web Store review compliance.
- Assures maximum privacy and trust for end users.
