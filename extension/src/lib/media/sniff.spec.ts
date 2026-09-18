import { describe, it, expect } from 'vitest';
import { sniffMediaType, sniffedTypeToContainer, describeUnplayablePayload } from './sniff';

function strBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

describe('sniffMediaType', () => {
  it('detects MP4 via ftyp box', () => {
    const bytes = new Uint8Array(16);
    bytes.set([0, 0, 0, 0x18], 0); // box size
    bytes.set(strBytes('ftyp'), 4);
    bytes.set(strBytes('isom'), 8);
    expect(sniffMediaType(bytes)).toBe('mp4');
  });

  it('detects WebM via EBML magic', () => {
    const bytes = new Uint8Array(16);
    bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
    expect(sniffMediaType(bytes)).toBe('webm');
  });

  it('detects MPEG-TS via sync bytes at 0 and 188', () => {
    const bytes = new Uint8Array(200);
    bytes[0] = 0x47;
    bytes[188] = 0x47;
    expect(sniffMediaType(bytes)).toBe('mpegts');
  });

  it('detects HTML error pages served instead of media', () => {
    expect(sniffMediaType(strBytes('<!DOCTYPE html><html>login required</html>'))).toBe('html');
    expect(sniffMediaType(strBytes('  <html><body>expired</body></html>'))).toBe('html');
  });

  it('detects JSON error responses', () => {
    expect(sniffMediaType(strBytes('{"error":"url_expired"}'))).toBe('json');
  });

  it('returns unknown for arbitrary binary data', () => {
    const bytes = new Uint8Array([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7]);
    expect(sniffMediaType(bytes)).toBe('unknown');
  });

  it('returns unknown for tiny buffers', () => {
    expect(sniffMediaType(new Uint8Array([1, 2]))).toBe('unknown');
  });
});

describe('sniffedTypeToContainer', () => {
  it('maps media types to file extensions', () => {
    expect(sniffedTypeToContainer('mp4')).toBe('mp4');
    expect(sniffedTypeToContainer('fmp4')).toBe('mp4');
    expect(sniffedTypeToContainer('webm')).toBe('webm');
    expect(sniffedTypeToContainer('mpegts')).toBe('ts');
    expect(sniffedTypeToContainer('html')).toBeNull();
  });
});

describe('describeUnplayablePayload', () => {
  it('explains HTML pages with HTTP context', () => {
    expect(describeUnplayablePayload('html', 403)).toContain('HTTP 403');
    expect(describeUnplayablePayload('html')).toContain('HTML page');
  });
});
