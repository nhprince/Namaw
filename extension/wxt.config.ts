import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'Namaw! — Universal Video Downloader',
    description: 'Fast, intelligent media detection and downloader for browser-accessible videos, HLS, DASH, and audio streams.',
    version: '1.0.0',
    permissions: [
      'storage',
      'downloads',
      'webRequest',
      'offscreen',
      'tabs',
    ],
    host_permissions: [
      '<all_urls>',
    ],
    action: {
      default_title: 'Namaw! Media Downloader',
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    icons: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
});
