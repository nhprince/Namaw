# ADR-0006: Runtime IPC Schema Validation with Zod

## Status
Accepted

## Context
Chrome extension communication crosses multiple security boundaries: Content Scripts (which run in the untrusted context of arbitrary webpages), Service Worker (privileged background context), Popup UI, Offscreen Document, and Native Messaging Host. Chrome security guidelines emphasize that messages originating from content scripts must be treated as untrusted and potentially malicious.

## Decision
We enforce strict runtime schema validation using **Zod** for every inter-process message:
1. All message types are defined as discriminated unions (`{ type: 'MEDIA_DETECTED', payload: ... }`).
2. Incoming messages in the Service Worker and Native Host are validated through Zod schemas before triggering any state mutations or privileged actions.
3. Any message that fails schema validation is rejected immediately with a logged warning.

## Consequences
- Prevents prototype pollution, type confusion, or command injection attacks originating from compromised web pages or malicious iframes.
- Provides static TypeScript inference from runtime schemas.
