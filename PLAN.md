Project: Namaw! — Universal Video Downloader Browser Extension
1. Project Objective
Build Namaw!, a professional, production-grade browser extension for detecting and downloading playable video and audio media from websites.

The product should aim to provide an experience comparable to the best capabilities of Video DownloadHelper (VDH): automatically detecting media on the current page, identifying available formats and qualities, allowing the user to select a format, downloading media, merging separate video/audio streams when necessary, maintaining download history, supporting batch downloads, and providing robust error handling.

The goal is not merely to build a demo downloader. Build this as a maintainable real-world product that can eventually be released to general users and continuously maintained as websites, browsers, and media-delivery technologies evolve.

The project name is:

Namaw!

Primary target browsers:

Google Chrome
Brave
Secondary/future targets:

Firefox
Other Chromium-based browsers where practical
Do not assume the architecture provided in this prompt is correct. Research current documentation and engineering best practices before implementing major architectural decisions. Replace any part of the proposed architecture when current platform limitations, browser behavior, performance considerations, security requirements, or maintainability indicate a better solution.

2. Extremely Important Product Requirement
The objective is to make Namaw! work on as many legitimate, technically accessible sites as possible, including major social/video platforms and ordinary websites.

Examples may include:

YouTube
Facebook
Instagram
TikTok
X/Twitter
Reddit
Vimeo
Dailymotion
Twitch/VOD platforms
news websites
learning platforms
self-hosted HTML5 video players
HLS websites
DASH websites
MP4/WebM direct media URLs
sites using separate audio/video tracks
sites using dynamically generated media URLs
other sites supported by the chosen extraction architecture
Adult-content websites may technically work where their media is accessible through supported mechanisms,

The product should download media and work exactly like Video Download Helper.

3. Define “Universal” Correctly
Do not make the technically impossible promise that Namaw! can download literally every video from every website.

Instead, engineer toward the strongest practical coverage using multiple extraction layers.

The system should attempt media extraction in a sensible priority order, for example:

Direct browser-detectable media URLs
<video> / <audio> / <source> elements
Blob/media-source related detection where technically possible
Network request observation
HLS manifests
DASH manifests
Embedded-player metadata
Site-specific extraction adapters
Generic extraction engines
Native companion integration using yt-dlp for difficult supported websites
Do not force every site through a single extraction mechanism.

The architecture must be extensible, so that adding support for a newly broken website does not require rewriting the entire extension.

4. Research Before Development
Before writing substantial production code, perform a current technical research pass.

Use authoritative sources first, especially:

Chrome Extensions documentation
Chrome Web Store policies
Mozilla WebExtensions documentation
Chromium/Chrome API documentation
yt-dlp documentation and source
FFmpeg documentation
ffmpeg.wasm documentation/source
relevant browser standards
Vite and relevant extension build-tool documentation
Also inspect reputable real-world open-source browser extensions/download managers for architectural patterns.

Do not blindly copy the architecture in this prompt.

Create a short architectural decision report before implementation that answers:

Browser architecture
What is the correct MV3 architecture in 2026?
Which work belongs in the service worker?
Which work belongs in content scripts?
Which work belongs in an extension page?
When should an offscreen document be used?
Can ffmpeg.wasm reliably operate there?
What are the current WebAssembly/security/CSP restrictions?
What limitations exist around service-worker lifecycle?
What can and cannot be observed with webRequest?
What requires host_permissions?
What permissions should be required versus optional?
Chrome MV3 moved background execution to service workers and removed general remote-hosted executable code. Network modification also changed significantly: normal MV3 extensions do not receive the old unrestricted webRequestBlocking capability, so do not design the application around obsolete MV2 behavior.

Media extraction
Research:

MP4/WebM downloads
HLS master playlists
HLS media playlists
MPEG-TS segments
fragmented MP4 HLS
byte-range HLS
encrypted HLS
DASH MPD
fragmented MP4 DASH
separate video/audio representations
adaptive bitrate streams
expiring signed URLs
redirects
referer requirements
cookie-authenticated media
dynamically generated URLs
Media Source Extensions
blob URLs
Do not assume every .m3u8 or .mpd can be downloaded simply with fetch().

5. Recommended High-Level Architecture
Design Namaw! as a layered system.

                           ┌───────────────────────────┐ 
                           │        Current Tab        │ 
                           │  webpage / video player   │ 
                           └─────────────┬─────────────┘ 
                                         │ 
                  ┌──────────────────────┴──────────────────────┐ 
                  │                                             │ 
        ┌─────────▼─────────┐                         ┌─────────▼──────────┐ 
        │ Content Detector  │                         │ Network Detector  │ 
        │                   │                         │                    │ 
        │ video/audio tags  │                         │ media requests     │ 
        │ source elements   │                         │ manifests          │ 
        │ player metadata   │                         │ segments            │ 
        │ DOM changes       │                         │ redirects           │ 
        └─────────┬─────────┘                         └─────────┬──────────┘ 
                  │                                             │ 
                  └──────────────────┬──────────────────────────┘ 
                                     │ 
                           ┌─────────▼─────────┐ 
                           │ Detection Engine   │ 
                           │                   │ 
                           │ normalize         │ 
                           │ classify          │ 
                           │ deduplicate        │ 
                           │ score confidence   │ 
                           │ correlate streams  │ 
                           └─────────┬─────────┘ 
                                     │ 
                              chrome.runtime 
                                  messaging 
                                     │ 
                    ┌────────────────┼────────────────┐ 
                    │                │                │ 
          ┌─────────▼────────┐ ┌─────▼───────────┐ ┌─▼──────────────────┐ 
          │ Popup / UI       │ │ Service Worker  │ │ Options / History  │ 
          │                  │ │                 │ │                    │ 
          │ detected media   │ │ orchestration   │ │ settings            │ 
          │ quality selector │ │ queues          │ │ history             │ 
          │ download control │ │ state           │ │ diagnostics         │ 
          └──────────────────┘ └────────┬────────┘ └────────────────────┘ 
                                        │ 
                              ┌─────────▼──────────┐ 
                              │ Browser Processing │ 
                              │                    │ 
                              │ Offscreen Document │ 
                              │ Workers            │ 
                              │ ffmpeg.wasm         │ 
                              │ Blob processing     │ 
                              └─────────┬──────────┘ 
                                        │ 
                                optional escalation 
                                        │ 
                          ┌─────────────▼─────────────┐ 
                          │ Native Companion          │ 
                          │                           │ 
                          │ yt-dlp                    │ 
                          │ native FFmpeg             │ 
                          │ extraction adapters       │ 
                          │ large-file processing     │ 
                          │ optional browser cookies  │ 
                          └───────────────────────────┘ 
The exact implementation should be determined after research.

6. Why a Native Companion Must Be Considered
Do not attempt to force yt-dlp itself into the browser extension.

A browser extension should not assume that it can directly execute an installed Python application or native FFmpeg binary.

Instead, design Namaw! so that the browser extension is fully functional by itself for browser-accessible downloads, while a separate optional native companion can be installed for advanced functionality.

The companion can communicate with the extension using Chrome Native Messaging.

Chrome officially supports communication between an extension and a registered native application through native messaging.

This companion can eventually provide:

yt-dlp extraction
native FFmpeg
large-file processing
higher-performance merging
formats difficult to process in-browser
advanced site-specific extraction
authenticated extraction when explicitly authorized by the user
more reliable processing of very large streams
The extension must remain useful without the companion.

Do not make the extension merely a launcher for the companion, because the Chrome Web Store requires extensions to provide their own functionality and prohibits extensions whose sole purpose is launching another application.

7. yt-dlp Integration
Use yt-dlp as a powerful optional extraction backend, not as the only extraction engine.

yt-dlp currently supports a very large number of sites and includes extractors for platforms such as Instagram, while also explicitly noting that site support can break as websites change.

Build the integration so yt-dlp can be updated independently.

The native companion should expose a controlled local API/protocol such as:

EXTENSION 
   ↓ 
Native Messaging 
   ↓ 
Namaw Native Helper 
   ↓ 
yt-dlp / FFmpeg 
   ↓ 
structured JSON events 
   ↓ 
EXTENSION 
The protocol should support:

capability detection
version detection
health checks
extraction requests
format enumeration
download progress
cancellation
retry
error reporting
FFmpeg availability
yt-dlp version
helper version
logs
update compatibility
Do not execute arbitrary shell commands originating from webpage content.

Treat all messages from content scripts as untrusted and validate them before privileged actions. Chrome specifically warns that content-script messages should be treated as potentially attacker-controlled input.

8. Browser-Side Media Detection
Implement several detection mechanisms.

DOM detector
Content scripts should identify:

<video>
<audio>
<source>
relevant media attributes
poster images
player metadata
iframe/embed information
media URLs
source lists
dynamically inserted players
Use MutationObserver so media inserted after initial page load can be detected.

Keep content scripts lightweight.

Do not ship a large React runtime into every webpage.

9. Network Detection
Implement a network detection layer using supported MV3 APIs.

Monitor relevant request information where the browser allows the extension to see it.

Candidate media types:

video/* 
audio/* 
application/vnd.apple.mpegurl 
application/x-mpegURL 
application/dash+xml 
application/octet-stream 
Also identify URLs containing patterns such as:

.m3u8 
.mpd 
.mp4 
.webm 
.m4v 
.mov 
.ts 
.m4s 
.aac 
.mp3 
Do not rely exclusively on file extensions.

Use:

MIME type
URL
initiator
request type
manifest structure
response metadata
content context
duplicate detection
to classify resources.

Chrome's webRequest API can observe request traffic when permissions allow it, but MV3 has important limitations compared with the old blocking model. Design around the modern API instead of trying to recreate MV2 behavior.

10. Media Correlation Engine
A major part of Namaw! should be a media-correlation engine.

For every detected media resource, maintain structured metadata such as:

interface MediaCandidate { 
  id: string; 
  tabId: number; 
  pageUrl: string; 
  sourceUrl: string; 
 
  type: 
    | "direct" 
    | "hls" 
    | "dash" 
    | "audio" 
    | "video" 
    | "unknown"; 
 
  mimeType?: string; 
 
  title?: string; 
  filename?: string; 
 
  width?: number; 
  height?: number; 
  fps?: number; 
 
  bitrate?: number; 
  fileSize?: number; 
  duration?: number; 
 
  hasAudio?: boolean; 
  hasVideo?: boolean; 
 
  protocol?: string; 
 
  requiresAuth?: boolean; 
  requiresReferer?: boolean; 
 
  extractor?: string; 
 
  confidence: number; 
 
  detectedAt: number; 
} 
Normalize duplicate resources.

For example, the same video may appear through:

DOM
network requests
manifest
player metadata
native extractor
These should become one logical media item rather than five entries.

11. Download Strategy
Direct Media
For a real downloadable file such as:

.mp4 
.webm 
.m4v 
.mov 
.mp3 
prefer the browser Downloads API when appropriate.

Chrome's downloads API is specifically designed to initiate and manage downloads and requires the downloads permission.

12. HLS Download Pipeline
For HLS:

Detect .m3u8 
      ↓ 
Fetch manifest with correct permissions/context 
      ↓ 
Parse playlist 
      ↓ 
Determine master/media playlist 
      ↓ 
Enumerate variants 
      ↓ 
Present qualities to user 
      ↓ 
Select representation 
      ↓ 
Download required segments 
      ↓ 
Validate segment sequence 
      ↓ 
Remux / concatenate 
      ↓ 
Generate final media file 
      ↓ 
Download resulting file 
Support as many legitimate HLS structures as practical:

master playlists
variant playlists
MPEG-TS
fragmented MP4
byte-range segments
initialization segments
discontinuities
multiple audio groups
subtitles where practical
Do not assume all HLS streams are interchangeable.

13. DASH Download Pipeline
For DASH:

Detect .mpd 
      ↓ 
Parse MPD 
      ↓ 
Identify Periods 
      ↓ 
Identify AdaptationSets 
      ↓ 
Identify video representations 
      ↓ 
Identify audio representations 
      ↓ 
Build quality list 
      ↓ 
Select compatible representations 
      ↓ 
Download initialization/media segments 
      ↓ 
Merge/remux 
      ↓ 
Generate final file 
      ↓ 
Download 
Handle:

multiple representations
separate video/audio
fragmented MP4
initialization segments
SegmentTemplate
SegmentTimeline
relevant URL templates
multiple periods where feasible
14. ffmpeg.wasm Architecture
Use ffmpeg.wasm for client-side processing where browser constraints make it practical.

However, do not assume that all processing should occur directly inside the MV3 service worker.

Chrome's Offscreen API exists specifically because MV3 service workers lack DOM access and some browser operations require a document context. Offscreen documents can also be used for worker-related processing and Blob/DOM functionality.

Research and implement the best current architecture, likely involving:

Service Worker 
      ↓ 
create/maintain offscreen document 
      ↓ 
worker / ffmpeg.wasm 
      ↓ 
merge/remux 
      ↓ 
return result/progress 
      ↓ 
Downloads API 
Do not load FFmpeg or other executable code from a remote CDN at runtime.

Manifest V3 prohibits remotely hosted executable code such as JavaScript and WASM from being fetched and executed dynamically. Package required executable assets with the extension itself.

15. Large-File Strategy
Do not design the application around loading an entire multi-gigabyte video into a single JavaScript memory buffer.

Implement:

chunking
segment-by-segment processing
progress reporting
bounded concurrency
cancellation
memory cleanup
retry
disk-backed temporary storage where appropriate
native FFmpeg escalation for large jobs
Use ffmpeg.wasm for smaller/moderate jobs where appropriate.

For large or performance-sensitive jobs:

Browser-only mode 
       ↓ 
if too large / unsupported / slow 
       ↓ 
Offer native helper 
       ↓ 
Native FFmpeg 
A browser extension should warn the user rather than silently hanging or exhausting memory.

16. Authentication and Cookies
Authenticated websites are a major technical challenge.

Do not automatically collect or upload browser cookies.

Any authenticated extraction feature must be:

explicitly user-authorized
local whenever possible
minimized in scope
securely handled
never transmitted to a remote Namaw! server without an explicit, justified feature requiring it
yt-dlp supports browser-cookie extraction for authenticated extraction, but its own documentation warns that broad cookie export can expose cookies for many sites. Treat browser cookies as highly sensitive credentials.

Prefer narrowly scoped mechanisms wherever technically possible.

Never log cookies, authorization headers, session tokens, or secrets.

17. Permissions Strategy
Do not request every possible permission by default.

Research which permissions are genuinely required.

Consider:

downloads 
storage 
scripting 
webRequest 
offscreen 
commands 
and appropriate host permissions.

Use optional permissions when practical.

Chrome supports optional permissions and optional host permissions so functionality can request access at runtime rather than demanding maximum permissions at installation.

The goal is to provide strong functionality while minimizing permission warnings and privacy concerns.

18. Storage
Use:

chrome.storage.local
For:

settings
preferences
download history metadata
user configuration
feature flags
UI state
IndexedDB
For:

larger temporary metadata
cached manifest information
resumable download state
larger structured data
temporary segment information where appropriate
Do not store large binary video files permanently in chrome.storage.

Chrome's storage API has quotas and performance considerations, while service workers cannot use normal Web Storage APIs like localStorage.

19. Popup UI
Build a polished React interface.

The popup should feel like a professional product rather than a developer prototype.

Core views:

Current Page
Namaw! 
 
Current page 
-------------------------------- 
 
🎬 Video Title 
 
1080p   MP4   14.2 MB       Download 
720p    MP4    8.1 MB       Download 
480p    MP4    4.4 MB       Download 
 
More formats ▾ 
Support:

detected media list
thumbnails
title
duration
resolution
FPS
bitrate
container
audio/video indicators
source type
extraction engine
download button
format selector
progress
retry
cancel
error details
20. VDH-Style Detection UX
Aim for an interaction model comparable to mature downloader extensions.

Possible toolbar behavior:

No media: 
Namaw! 
 
Media detected: 
Namaw! 3 
 
Multiple formats: 
Namaw! ↓ 
The browser badge should indicate detected media count.

Clicking the extension should immediately show useful detected formats.

Do not make the user manually paste URLs for normal website media.

21. Download History
Implement persistent history.

Each entry should include:

title
filename
timestamp
source website
selected format
resolution
status
local filename where available
Actions:

re-download
open containing folder where supported
remove from history
clear history
retry failed download
Do not retain unnecessary URLs containing secrets or temporary authentication tokens longer than needed.

22. Batch Downloads
Support:

Download all detected media 
with:

queue
concurrency control
pause
resume
cancel
retry
per-item status
overall progress
Avoid aggressive parallel downloading that could trigger site protections or degrade the user's network.

23. Filename System
Implement robust naming templates.

Examples:

{title}.{ext} 
 
{title} - {resolution}.{ext} 
 
{channel} - {title} [{resolution}].{ext} 
Sanitize:

Windows-invalid characters
reserved filenames
excessively long paths
Unicode edge cases
path traversal attempts
malicious filenames
Never trust the filename supplied by a website.

24. Download Organization
Support optional folder organization through browser download filename paths where supported.

Examples:

Namaw/ 
Namaw/YouTube/ 
Namaw/Facebook/ 
Namaw/Instagram/ 
Namaw/Other/ 
Make this configurable.

Default behavior should be conservative and predictable.

25. Site Adapter Architecture
Create an extensible adapter system.

Example:

src/lib/extractors/ 
 
generic/ 
hls/ 
dash/ 
youtube/ 
facebook/ 
instagram/ 
tiktok/ 
vimeo/ 
reddit/ 
... 
Each extractor should follow a common contract:

interface Extractor { 
  id: string; 
  matches(url: URL): boolean; 
 
  detect( 
    context: ExtractionContext 
  ): Promise<MediaResult[]>; 
 
  getCapabilities(): ExtractorCapabilities; 
} 
Do not create hard-coded site-specific logic inside the popup or service worker.

New site support should be addable independently.

26. Generic + Site-Specific Extraction
Use a two-level strategy.

Generic extraction
For ordinary websites:

HTML5 media
HLS
DASH
network discovery
embedded players
Site-specific extraction
For major platforms where generic detection is insufficient:

dedicated extractor
yt-dlp backend
platform-specific adapter
This dramatically improves maintainability.

27. Browser Compatibility
Primary:

Chrome 
Brave 
Use APIs in a way that keeps future Firefox support practical.

Create an abstraction for browser-specific APIs:

src/lib/browser/ 
rather than scattering:

chrome.* 
throughout the entire project.

Prefer a compatibility layer:

browserApi.downloads() 
browserApi.storage() 
browserApi.runtime() 
browserApi.tabs() 
where useful.

Do not sacrifice Chrome/Brave quality merely to prematurely support Firefox.

Firefox is a later milestone.

28. Manifest and Build System
Use:

TypeScript 
Vite 
React 
Tailwind CSS 
Manifest V3 
Use the best-maintained current Vite extension integration after researching the current ecosystem.

Do not blindly select @crxjs/vite-plugin if another maintained solution is better in 2026.

The build must produce:

dist/ 
containing a complete installable extension.

29. State Management
Keep state management lightweight.

Use either:

Zustand
or

React Context
Do not introduce Redux or a large state-management architecture unless the project actually requires it.

30. Suggested Repository Structure
Use a clean modular structure similar to:

namaw/ 
│ 
├── extension/ 
│   ├── src/ 
│   │   ├── background/ 
│   │   │   ├── service-worker.ts 
│   │   │   ├── detection/ 
│   │   │   ├── downloads/ 
│   │   │   ├── messaging/ 
│   │   │   └── orchestration/ 
│   │   │ 
│   │   ├── content/ 
│   │   │   ├── detectors/ 
│   │   │   ├── mutation-observer/ 
│   │   │   └── bridge/ 
│   │   │ 
│   │   ├── popup/ 
│   │   │   ├── components/ 
│   │   │   ├── hooks/ 
│   │   │   ├── views/ 
│   │   │   └── app.tsx 
│   │   │ 
│   │   ├── options/ 
│   │   │ 
│   │   ├── offscreen/ 
│   │   │   ├── ffmpeg/ 
│   │   │   ├── workers/ 
│   │   │   └── processing/ 
│   │   │ 
│   │   ├── lib/ 
│   │   │   ├── detection/ 
│   │   │   ├── manifests/ 
│   │   │   ├── extractors/ 
│   │   │   ├── downloads/ 
│   │   │   ├── storage/ 
│   │   │   ├── browser/ 
│   │   │   ├── security/ 
│   │   │   └── logging/ 
│   │   │ 
│   │   └── shared/ 
│   │       ├── types/ 
│   │       ├── protocol/ 
│   │       └── constants/ 
│   │ 
│   ├── public/ 
│   │   └── icons/ 
│   │ 
│   ├── manifest.config.ts 
│   ├── vite.config.ts 
│   ├── package.json 
│   └── tests/ 
│ 
├── native-helper/ 
│   ├── src/ 
│   ├── yt-dlp/ 
│   ├── ffmpeg/ 
│   ├── protocol/ 
│   ├── installers/ 
│   └── tests/ 
│ 
├── site-fixtures/ 
│ 
├── e2e/ 
│ 
├── docs/ 
│   ├── architecture/ 
│   ├── development/ 
│   ├── releases/ 
│   ├── troubleshooting/ 
│   └── security/ 
│ 
├── scripts/ 
│ 
├── .github/ 
│   └── workflows/ 
│ 
└── README.md 
31. Engineering Standards
Treat this as a serious production repository.

Use:

strict TypeScript
ESLint
Prettier
Husky/lint-staged where useful
conventional commits if beneficial
clear error classes
structured logging
runtime validation
schema validation for IPC messages
dependency auditing
automated security checks
reproducible builds
changelog
semantic versioning
Avoid unnecessary abstractions.

32. Security Requirements
Namaw! handles extremely sensitive browser-adjacent data.

Security must be treated as a first-class feature.

Never:

send browsing history to a server unnecessarily
upload cookies
log cookies
expose authorization tokens
execute arbitrary website-provided commands
execute arbitrary remote JavaScript
dynamically execute remote WASM
trust filenames
trust content-script messages
trust webpage input
evaluate strings as JavaScript
expose native-helper commands directly to webpages
Validate all IPC messages.

Use structured schemas.

Example:

ExtensionMessage 
NativeMessage 
MediaCandidate 
DownloadJob 
ExtractionRequest 
ExtractionResult 
should all have runtime validation.

33. Privacy-First Design
Namaw! should preferably operate locally.

Default architecture:

Website 
   ↓ 
Browser 
   ↓ 
Namaw! 
   ↓ 
Local download 
Do not introduce a Namaw! cloud backend for core downloading unless a genuinely necessary feature requires one.

A future backend may be used for:

extension update metadata
anonymous aggregate diagnostics if explicitly opted in
release management
feature configuration
support information
Never send raw browsing history or private media URLs to a backend by default.

Chrome Web Store policies require transparent disclosure of data handling and impose additional requirements when extensions handle sensitive user data.

34. Remote Code Restriction
This is critical.

All executable code required by the extension must be packaged into the extension.

Do not:

fetch("https://example.com/script.js") 
eval(...) 
load remote wasm 
inject remote JavaScript 
Do not build an architecture where functionality depends on downloading executable code from a Namaw! server.

Manifest V3 explicitly restricts remotely hosted executable code, including JavaScript and WASM.

Remote APIs may provide data/configuration, not executable application logic.

35. Error Handling
Every download must have explicit states.

Example:

DETECTED 
ANALYZING 
READY 
QUEUED 
DOWNLOADING 
PROCESSING 
COMPLETED 
CANCELLED 
RETRYING 
FAILED 
UNSUPPORTED 
DRM_PROTECTED 
AUTH_REQUIRED 
Display meaningful errors.

Examples:

"This media requires authentication." 
 
"Namaw detected the stream, but the website prevented cross-origin access." 
 
"This stream appears to use DRM and cannot be downloaded by Namaw." 
 
"FFmpeg processing failed." 
 
"The media manifest is malformed." 
 
"The stream expired. Try detecting it again." 
 
"The native helper is unavailable." 
Never display generic:

Error: failed 
when a meaningful explanation can be provided.

36. Automatic Fallback Strategy
Implement a smart escalation system.

Example:

Attempt 1: 
Browser DOM detection 
 
↓ no usable result 
 
Attempt 2: 
Network detection 
 
↓ 
 
Attempt 3: 
Manifest parser 
 
↓ 
 
Attempt 4: 
Browser-side extractor 
 
↓ 
 
Attempt 5: 
Native yt-dlp extractor 
 
↓ 
 
Attempt 6: 
Native FFmpeg processing 
 
↓ 
 
If impossible: 
Explain precisely why 
The system should automatically choose the best available extraction mechanism.

The user should not need to understand the underlying architecture.

37. Diagnostics
Add a developer diagnostic mode.

It should allow inspecting:

detected resources
extractor used
MIME type
manifest type
candidate score
request metadata that is safe to expose
processing state
helper status
FFmpeg status
yt-dlp status
errors
timings
Never expose secrets.

Provide a "Copy diagnostic report" button that automatically redacts:

cookies
authorization headers
tokens
passwords
private query parameters where possible
38. Testing Strategy
Testing is a major project requirement.

Do not rely on manually opening a few websites and declaring the extension complete.

Implement automated testing at multiple levels.

Unit tests
Use Vitest for:

URL classification
MIME detection
deduplication
confidence scoring
HLS parsing
DASH parsing
filename sanitization
settings
storage
message validation
download queue
retry behavior
media correlation
39. Integration Tests
Test:

service worker ↔ content script
popup ↔ service worker
service worker ↔ offscreen document
offscreen document ↔ FFmpeg worker
extension ↔ native helper
download lifecycle
40. End-to-End Testing
Use Playwright or another appropriate browser automation framework.

Test against controlled fixture pages rather than relying only on third-party websites.

Create local fixture pages for:

direct MP4 
direct WebM 
HLS TS 
HLS fMP4 
HLS master playlist 
DASH 
separate audio/video 
dynamic video injection 
multiple videos 
duplicate URLs 
large playlist 
download failure 
network interruption 
expired URL 
invalid manifest 
Use stable public test streams where appropriate.

41. GitHub Actions CI/CD
GitHub Actions must actively test the project.

The goal is to catch regressions automatically before release.

Suggested pipeline:

Push / Pull Request 
        ↓ 
Install dependencies 
        ↓ 
Typecheck 
        ↓ 
Lint 
        ↓ 
Unit tests 
        ↓ 
Build extension 
        ↓ 
Validate manifest 
        ↓ 
Integration tests 
        ↓ 
Browser E2E 
        ↓ 
Security/dependency checks 
        ↓ 
Artifact upload 
Run against:

Linux
Windows
macOS where practical
Run browser tests against supported Chromium versions where practical.

Primary browser targets:

Chrome
Brave
Firefox CI should be added when Firefox support begins.

42. Build Verification
CI should fail if:

TypeScript fails
lint fails
tests fail
extension does not build
manifest is invalid
required assets are missing
permissions unexpectedly change
package contains remote executable code
extension size grows abnormally
vulnerable dependencies are detected at the chosen severity threshold
Generate a release artifact automatically.

43. Performance Testing
Measure:

popup startup
detection latency
memory usage
manifest parsing time
FFmpeg processing time
segment throughput
download throughput
large-file behavior
service-worker wake/sleep behavior
Set practical thresholds.

Do not optimize prematurely; measure first.

44. Service Worker Lifecycle
Do not assume the MV3 service worker stays alive permanently.

Persist important state.

Use appropriate storage or messaging mechanisms so that:

downloads survive worker sleep
detection state can be reconstructed
queued jobs do not disappear
progress remains consistent
badges recover correctly
errors are persisted
Chrome's MV3 architecture intentionally uses service workers that run when needed rather than persistent background pages.

45. Offscreen Document Strategy
Research the current Chrome Offscreen API before implementation.

Use it where browser APIs require a document context or where media-processing architecture benefits from a document/worker environment.

Chrome's Offscreen API supports hidden documents specifically for tasks unavailable in service workers and can be used with worker-oriented operations and Blob/DOM-related tasks.

Determine experimentally:

which FFmpeg build works most reliably
whether single-threaded processing should be the baseline
whether multithreading is practical
what SharedArrayBuffer requirements currently apply
whether the extension context can satisfy them
when to escalate to native FFmpeg
Do not assume a solution is correct without testing it in the target browser versions.

46. FFmpeg Strategy
Prefer FFmpeg for:

remuxing
merging audio/video
container conversion where required
stream assembly
Do not unnecessarily re-encode video when remuxing is sufficient.

Prefer:

copy/remux 
over:

decode → encode 
because remuxing is much faster and avoids quality loss.

47. Native Helper Strategy
Build the native helper as an independent component.

Possible implementation:

Python 
or

Node.js 
Choose the better option based on:

yt-dlp integration
FFmpeg integration
packaging
cross-platform installation
startup time
maintenance
security
native messaging support
Research both before deciding.

The helper should eventually support:

Windows 
Linux 
macOS 
even if the first release primarily targets Windows.

48. Companion Installer
The native helper should eventually have a proper installer.

Do not require users to manually edit obscure registry/configuration files in the final product.

Installer responsibilities:

install helper
register native messaging host
install/update required binaries
verify versions
uninstall cleanly
Do not silently install software.

49. Version Management
Maintain separate versions for:

Extension 
Native Helper 
yt-dlp 
FFmpeg 
The extension should check helper compatibility.

Example:

Namaw Extension: 1.0.0 
Namaw Helper:    1.0.3 
yt-dlp:          2026.x 
FFmpeg:          8.x 
Do not automatically update executables from untrusted sources.

50. Future Admin Panel
The product may later have an admin/control panel.

Design the architecture so a future backend can manage:

supported extractor metadata
release channels
feature flags
compatibility information
minimum supported versions
known site issues
announcements
diagnostics
update notifications
However:

Never make the extension depend on remote JavaScript or remotely delivered executable logic.

A future backend may deliver signed/validated data/configuration, while actual application logic remains inside reviewed extension code. Chrome permits certain remote data/configuration use while restricting remotely hosted executable code.

51. Update Architecture
The extension should be designed for long-term maintenance.

Implement:

Extension update 
        ↓ 
Compatibility verification 
        ↓ 
Extractor compatibility check 
        ↓ 
Native helper compatibility check 
        ↓ 
Migration logic 
Storage migrations must be versioned.

Example:

schemaVersion: 1 
schemaVersion: 2 
schemaVersion: 3 
Provide migration functions instead of destroying old settings/history.

52. Logging
Implement levels:

silent 
error 
warn 
info 
debug 
trace 
Default:

info 
Development:

debug 
Never log sensitive authentication material.

53. Accessibility
The popup and options pages should support:

keyboard navigation
visible focus states
ARIA labels
screen readers
appropriate contrast
reduced-motion preference
54. UI/UX Direction
Visual design:

clean
minimal
professional
modern
fast
polished
dark-first but with light mode
subtle animations
no unnecessary visual clutter
Brand:

Namaw!

The interface should feel like a mature browser utility rather than a generic React dashboard.

55. Product Phases
Phase 0 — Research & Architecture
Deliver:

architecture report
API capability matrix
permission matrix
browser compatibility matrix
FFmpeg/ffmpeg.wasm evaluation
yt-dlp integration feasibility analysis
native messaging analysis
Chrome Web Store compliance analysis
technical risk register
final ADRs
Do not begin major implementation until the critical architecture decisions are resolved.

Phase 1 — Working Browser Downloader
Build:

MV3 extension
Vite
TypeScript
React popup
content-script detector
network detector
media normalization
deduplication
direct MP4/WebM downloading
badge count
basic HLS parsing
basic DASH parsing
basic FFmpeg processing
offscreen processing architecture
error handling
unit tests
CI
Acceptance criterion:

A user can install Namaw!, open a normal media website, see detected media, choose an available resource, and successfully download it.

Phase 2 — Advanced Stream Handling
Add:

HLS master playlist handling
DASH representation selection
separate audio/video selection
merging
quality selector
progress UI
retry
cancellation
batch downloads
large-file strategy
improved duplicate detection
resume behavior where practical
Phase 3 — Advanced Site Extraction
Add:

site adapters
yt-dlp native helper
native FFmpeg
Chrome/Brave integration
authenticated extraction with explicit user authorization
helper health/version checks
fallback extraction architecture
Acceptance criterion:

Namaw! should be able to delegate difficult supported sites to yt-dlp while preserving a seamless UI.

Phase 4 — VDH-Class UX
Add:

download history
re-download
automatic folder organization
naming templates
keyboard shortcuts
context menu integration
improved notifications
advanced format information
thumbnails
improved progress display
concurrent queues
pause/resume where practical
Phase 5 — Product Polish
Add:

onboarding
first-run experience
polished branding
dark/light mode
animations
accessibility
diagnostics
settings
advanced preferences
graceful unsupported/DRM messages
Phase 6 — Production Release
Prepare:

privacy policy
terms
support documentation
website
screenshots
store description
permission explanations
release notes
security review
dependency audit
production builds
Chrome Web Store submission package
Chrome Web Store policy requires extensions to provide meaningful functionality, respect a clear single purpose, and handle permissions and user data responsibly.

56. Acceptance Criteria
Do not declare the project complete because "the extension builds."

A milestone is complete only when:

Code builds successfully.
TypeScript passes.
Lint passes.
Unit tests pass.
Integration tests pass.
E2E tests pass.
Chrome/Brave manual smoke testing passes.
No critical console errors remain.
Error states are handled.
Security checks pass.
Documentation is updated.
The feature works from a clean installation.
Existing features do not regress.
57. Autonomous Development Rules
You are acting as a senior autonomous engineering agent.

Do not repeatedly ask for confirmation for ordinary implementation decisions.

When multiple technically valid approaches exist:

Research them.
Compare them.
Choose the strongest option.
Document the reasoning.
Implement it.
Do not stop merely because the original architecture is imperfect.

Improve the architecture.

Do not silently create technical debt simply to finish a milestone faster.

58. Mandatory Research-and-Verify Rule
Whenever you encounter a technical uncertainty, investigate current documentation.

Examples:

"Can this API observe this request?" 
"Can ffmpeg.wasm run here?" 
"Can this permission be optional?" 
"Can Chrome extensions modify this request?" 
"Can an offscreen document perform this operation?" 
"Can this architecture pass Chrome Web Store review?" 
Do not guess.

Use primary documentation whenever possible.

Record significant decisions in:

docs/architecture/ADR-XXXX.md 
59. Important Platform Reality
Namaw! should maximize compatibility, but it must gracefully recognize cases that are fundamentally different from ordinary downloadable media.

Examples:

DRM protected 
Encrypted media 
Authentication required 
CAPTCHA protected 
Expired signed URL 
Region restricted 
Unsupported manifest 
Site-specific anti-automation 
Browser API limitation 
Network/CORS limitation 
Do not attempt to "solve" every failure by bypassing security controls.

The correct behavior may simply be:

This media cannot be downloaded by Namaw. 
Reason: DRM-protected media. 
60. Final Engineering Goal
The finished system should conceptually feel like:

Open any normal supported website 
          ↓ 
Namaw! automatically notices media 
          ↓ 
Click extension 
          ↓ 
See available videos/formats 
          ↓ 
Choose quality 
          ↓ 
Namaw chooses best extraction engine 
          ↓ 
Browser download / HLS / DASH / FFmpeg / yt-dlp 
          ↓ 
Progress 
          ↓ 
Optional merge/remux 
          ↓ 
Final downloadable file 
The key engineering principle is:

Do not build a single downloader. Build a media extraction platform inside a browser extension.

The extension should have a browser-native fast path, a robust manifest-processing path, and an optional native extraction path.

That architecture gives Namaw! a realistic path toward VDH-level functionality while remaining maintainable as browsers and websites evolve.

61. First Task
Before implementing the application:

Task 1 — Research
Create:

docs/architecture/research.md 
containing:

current Chrome MV3 architecture
Brave compatibility
Firefox future compatibility
permission analysis
network detection capabilities
service-worker limitations
offscreen document capabilities
ffmpeg.wasm feasibility
HLS architecture
DASH architecture
yt-dlp architecture
native messaging
native helper options
authentication considerations
security model
Chrome Web Store restrictions
privacy model
testing strategy
CI/CD architecture
known technical limitations
Task 2 — Architecture Decision
Create:

docs/architecture/architecture.md 
with the final chosen architecture.

Task 3 — ADRs
Create ADRs for all major architectural decisions.

Task 4 — Scaffold
Only after the architecture has been verified, scaffold the repository.

Task 5 — Establish CI immediately
GitHub Actions must be operational before large feature development begins.

Task 6 — Build the smallest complete vertical slice
Implement:

detect 
→ display 
→ download 
→ verify 
for a simple direct MP4 fixture.

Then expand to:

HLS 
→ DASH 
→ merging 
→ site extraction 
→ yt-dlp 
→ native helper 
one verified layer at a time.

Never build the entire system blindly before validating the foundations.

62. Definition of Success
Namaw! is successful when it becomes:

reliable
fast
maintainable
secure
privacy-friendly
extensible
testable
production-ready
compatible with Chrome and Brave
architecturally prepared for Firefox
capable of handling both simple and sophisticated media delivery systems
continuously maintainable as websites change
The objective is not to claim that Namaw! can download literally everything.

The objective is to make it intelligently determine how a piece of media can be legitimately obtained, choose the best available extraction mechanism, download it reliably, and clearly explain when it cannot.

Build Namaw! like a real product, not a proof of concept.