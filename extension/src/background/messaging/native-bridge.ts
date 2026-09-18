import { NativeHelperStatus } from '../../shared/types';
import { logger } from '../../lib/utils/logger';

const NATIVE_HOST_NAME = 'com.namaw.helper';

export const nativeBridge = {
  // jobId -> active native messaging port, so downloads can be cancelled
  activePorts: new Map<string, chrome.runtime.Port>(),

  async checkStatus(): Promise<NativeHelperStatus> {
    return new Promise((resolve) => {
      try {
        const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
        let responded = false;

        port.onMessage.addListener((response) => {
          responded = true;
          try { port.disconnect(); } catch {}
          resolve({
            connected: true,
            version: response.version,
            ytdlpVersion: response.ytdlp_version,
            ffmpegAvailable: response.ffmpeg_available,
          });
        });

        port.onDisconnect.addListener(() => {
          if (!responded) {
            const raw = chrome.runtime.lastError?.message || 'Host not installed or responded';
            resolve({ connected: false, error: raw });
          }
        });

        port.postMessage({ action: 'ping' });

        setTimeout(() => {
          if (!responded) {
            try { port.disconnect(); } catch {}
            resolve({ connected: false, error: 'Connection timed out' });
          }
        }, 3000);
      } catch (err: any) {
        resolve({ connected: false, error: err?.message || 'Native messaging not supported' });
      }
    });
  },

  startNativeDownload(
    jobId: string,
    url: string,
    variantId: string | undefined,
    onProgress: (progress: { percent?: number; speed?: string; eta?: string }) => void,
    onComplete: () => void,
    onError: (err: string) => void
  ): void {
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    } catch (e) {
      onError((e as Error)?.message || 'Could not connect to the Namaw! Companion.');
      return;
    }

    this.activePorts.set(jobId, port);
    logger.info('NativeBridge', `Connected. download=${url.slice(0, 80)} job=${jobId}`);

    port.onMessage.addListener((msg) => {
      logger.debug('NativeBridge', `evt ${msg.event || msg.status}`, msg);
      if (msg.event === 'progress') {
        onProgress(msg);
      } else if (msg.event === 'completed') {
        this.activePorts.delete(jobId);
        try { port.disconnect(); } catch {}
        onComplete();
      } else if (msg.event === 'error') {
        this.activePorts.delete(jobId);
        try { port.disconnect(); } catch {}
        onError(msg.error || 'Native download failed');
      }
    });

    port.onDisconnect.addListener(() => {
      const err = chrome.runtime.lastError?.message;
      logger.warn('NativeBridge', `Port disconnected job=${jobId}: ${err || '(clean)'}`);
      if (this.activePorts.has(jobId)) {
        this.activePorts.delete(jobId);
        if (err) onError(err);
      }
    });

    port.postMessage({ action: 'download', url, job_id: jobId, format_id: variantId });
  },

  cancel(jobId: string): void {
    const port = this.activePorts.get(jobId);
    if (!port) return;
    try {
      port.postMessage({ action: 'cancel', job_id: jobId });
      port.disconnect();
    } catch {
      // ignore
    }
    this.activePorts.delete(jobId);
  },
};
