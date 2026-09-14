# ADR-0001: Selection of WXT as Extension Build Framework

## Status
Accepted

## Context
Manifest V3 introduces strict requirements for service workers, content scripts, manifest generation, cross-browser polyfills, and asset hashing. Historically, extensions were built using raw Webpack, raw Vite with manual Rollup inputs, or `@crxjs/vite-plugin`. However, `@crxjs/vite-plugin` has suffered severe maintenance gaps and incompatibility with modern Vite releases. We need an actively maintained, production-grade framework that simplifies MV3 development while supporting Google Chrome, Brave, and future Firefox builds seamlessly.

## Decision
We adopt **WXT** (Next-Gen Web Extension Framework, built on Vite).

## Rationale
1. **First-Class MV3 & Cross-Browser:** Natively generates compliant Manifest V3 manifests for Chromium and Firefox targets from a single TypeScript configuration.
2. **File-Based Entrypoints:** Cleanly handles `popup`, `options`, `content-scripts`, `background`, and `offscreen` documents without fragile multi-page Rollup configs.
3. **Vite Under the Hood:** Retains lightning-fast HMR, ES modules, TypeScript compilation, and PostCSS/Tailwind CSS support.
4. **Active Maintenance:** Dedicated web extension framework with strong ecosystem support in 2026.

## Consequences
- The build outputs directly to standard `.output/chrome-mv3` directory.
- Developers write code using standard web APIs and the unified `browser` namespace.
