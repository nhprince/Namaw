declare module 'mux.js' {
  export interface TransmuxerOptions {
    keepOriginalTimestamps?: boolean;
    remux?: boolean;
  }

  export class Transmuxer {
    constructor(options?: TransmuxerOptions);
    on(event: 'data', callback: (segment: { data: Uint8Array; initSegment: Uint8Array }) => void): void;
    on(event: 'done', callback: () => void): void;
    push(data: Uint8Array): void;
    flush(): void;
    dispose(): void;
  }

  const muxjs: {
    mp4: {
      Transmuxer: typeof Transmuxer;
    };
  };

  export default muxjs;
}
