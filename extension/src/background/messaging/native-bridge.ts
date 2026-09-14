import { NativeHelperStatus } from '../../shared/types';
import { logger } from '../../lib/utils/logger';

const NATIVE_HOST_NAME = 'com.namaw.helper';

export const nativeBridge = {
  port: null as chrome.runtime.Port | null,

  connect(): chrome.runtime.Port | null {
    if (this.port) return this.port;

    try {
      this.port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      this.port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError;
        logger.warn('NativeBridge', 'Disconnected from companion:', err?.message);
        this.port = null;
      });
      return this.port;
    } catch (e) {
      logger.warn('NativeBridge', 'Failed to connect to native host:', e);
      return null;
    }
  },

  async checkStatus(): Promise<NativeHelperStatus> {
    return new Promise((resolve) => {
      try {
        const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
        let responded = false;

        port.onMessage.addListener((response) => {
          responded = true;
          port.disconnect();
          resolve({
            connected: true,
            version: response.version,
            ytdlpVersion: response.ytdlp_version,
            ffmpegAvailable: response.ffmpeg_available,
          });
        });

        port.onDisconnect.addListener(() => {
          if (!responded) {
            const err = chrome.runtime.lastError?.message || 'Host not installed or responded';
            resolve({
              connected: false,
              error: err,
            });
          }
        });

        port.postMessage({ action: 'ping' });

        // 3 second timeout guard
        setTimeout(() => {
          if (!responded) {
            port.disconnect();
            resolve({ connected: false, error: 'Connection timed out' });
          }
        }, 3000);
      } catch (err: any) {
        resolve({ connected: false, error: err?.message || 'Native messaging not supported' });
      }
    });
  },

  startNativeDownload(
    url: string,
    onProgress: (progress: any) => void,
    onComplete: () => void,
    onError: (err: string) => void
  ): { cancel: () => void } {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    port.onMessage.addListener((msg) => {
      if (msg.event === 'progress') {
        onProgress(msg);
      } else if (msg.event === 'completed') {
        port.disconnect();
        onComplete();
      } else if (msg.event === 'error') {
        port.disconnect();
        onError(msg.error || 'Native download failed');
      }
    });

    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message;
      if (err) onError(err);
    });

    port.postMessage({ action: 'download', url });

    return {
      cancel: () => {
        try {
          port.postMessage({ action: 'cancel' });
          port.disconnect();
        } catch {
          // ignore
        }
      },
    };
  },
};
