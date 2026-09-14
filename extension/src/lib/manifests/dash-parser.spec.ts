import { describe, it, expect } from 'vitest';
import { parseDashMpd, resolveSegmentTemplateUrl, parseIsoDuration } from './dash-parser';

describe('parseIsoDuration', () => {
  it('parses PT1H2M30S correctly', () => {
    expect(parseIsoDuration('PT1H2M30S')).toBe(3750);
  });

  it('parses PT45.5S correctly', () => {
    expect(parseIsoDuration('PT45.5S')).toBe(45.5);
  });
});

describe('resolveSegmentTemplateUrl', () => {
  it('substitutes RepresentationID and zero-padded Number', () => {
    const template = 'video/$RepresentationID$/segment-$Number%04d$.m4s';
    const resolved = resolveSegmentTemplateUrl(template, '1080p', 7);
    expect(resolved).toBe('video/1080p/segment-0007.m4s');
  });

  it('substitutes unpadded Number', () => {
    const template = 'chunk-$RepresentationID$-$Number$.m4s';
    const resolved = resolveSegmentTemplateUrl(template, 'v1', 123);
    expect(resolved).toBe('chunk-v1-123.m4s');
  });
});

describe('parseDashMpd', () => {
  it('parses video and audio representations and sorts by quality', () => {
    const sampleMpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT3M20S">
  <Period id="0">
    <AdaptationSet id="1" contentType="video" mimeType="video/mp4">
      <Representation id="video_low" bandwidth="800000" width="640" height="360" codecs="avc1.4d401e"/>
      <Representation id="video_high" bandwidth="4000000" width="1920" height="1080" codecs="avc1.640028"/>
      <Representation id="video_mid" bandwidth="1500000" width="1280" height="720" codecs="avc1.4d401f"/>
    </AdaptationSet>
    <AdaptationSet id="2" contentType="audio" mimeType="audio/mp4">
      <Representation id="audio_en" bandwidth="128000" codecs="mp4a.40.2"/>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashMpd(sampleMpd, 'https://example.com/dash/manifest.mpd');
    expect(result.durationSeconds).toBe(200);
    expect(result.videoVariants.length).toBe(3);
    expect(result.audioVariants.length).toBe(1);

    // Sorted descending: 1080p -> 720p -> 360p
    expect(result.videoVariants[0].resolution).toBe('1080p');
    expect(result.videoVariants[0].id).toBe('video_high');

    expect(result.videoVariants[1].resolution).toBe('720p');
    expect(result.videoVariants[1].id).toBe('video_mid');

    expect(result.videoVariants[2].resolution).toBe('360p');
    expect(result.videoVariants[2].id).toBe('video_low');

    expect(result.isDrmProtected).toBe(false);
  });

  it('detects DRM ContentProtection in DASH MPD', () => {
    const sampleDrmMpd = `<MPD xmlns="urn:mpeg:dash:schema:mpd:2011">
  <Period>
    <AdaptationSet contentType="video">
      <ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"/>
      <Representation id="v1" width="1920" height="1080"/>
    </AdaptationSet>
  </Period>
</MPD>`;

    const result = parseDashMpd(sampleDrmMpd, 'https://example.com/dash/protected.mpd');
    expect(result.isDrmProtected).toBe(true);
    expect(result.drmScheme).toBe('urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed');
  });
});
