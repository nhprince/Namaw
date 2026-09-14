import { describe, it, expect } from 'vitest';
import { parseHlsPlaylist } from './hls-parser';

describe('parseHlsPlaylist', () => {
  it('parses an HLS master playlist with multiple qualities', () => {
    const sampleMaster = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=768x432,CODECS="avc1.42e01e,mp4a.40.2"
mid.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"
high.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=7680000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
super.m3u8`;

    const result = parseHlsPlaylist(sampleMaster, 'https://example.com/video/master.m3u8');
    expect(result.isMaster).toBe(true);
    expect(result.variants.length).toBe(3);

    // Sorted descending by resolution: 1080p -> 720p -> 432p
    expect(result.variants[0].resolution).toBe('1080p');
    expect(result.variants[0].height).toBe(1080);
    expect(result.variants[0].url).toBe('https://example.com/video/super.m3u8');

    expect(result.variants[1].resolution).toBe('720p');
    expect(result.variants[1].url).toBe('https://example.com/video/high.m3u8');

    expect(result.variants[2].resolution).toBe('432p');
    expect(result.variants[2].url).toBe('https://example.com/video/mid.m3u8');
  });

  it('detects DRM-protected master playlists', () => {
    const sampleDrm = `#EXTM3U
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://drm.example.com/key"
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720
video.m3u8`;

    const result = parseHlsPlaylist(sampleDrm, 'https://example.com/master.m3u8');
    expect(result.isDrmProtected).toBe(true);
    expect(result.drmMethod).toBe('SAMPLE-AES');
  });

  it('parses an HLS media playlist with segments and calculates total duration', () => {
    const sampleMedia = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-VERSION:3
#EXTINF:9.009,
segment1.ts
#EXTINF:9.009,
segment2.ts
#EXTINF:4.500,
segment3.ts
#EXT-X-ENDLIST`;

    const result = parseHlsPlaylist(sampleMedia, 'https://cdn.example.com/live/playlist.m3u8');
    expect(result.isMaster).toBe(false);
    expect(result.segments).toBeDefined();
    expect(result.segments?.length).toBe(3);
    expect(result.segments?.[0].url).toBe('https://cdn.example.com/live/segment1.ts');
    expect(result.segments?.[1].url).toBe('https://cdn.example.com/live/segment2.ts');
    expect(result.totalDuration).toBeCloseTo(22.518, 2);
  });
});
