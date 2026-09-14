import { describe, it, expect } from 'vitest';
import {
  normalizeMediaUrl,
  generateCandidateId,
  calculateConfidence,
  correlateCandidate,
} from './correlation';
import { MediaCandidate } from '../../shared/types';

describe('Correlation Engine', () => {
  it('normalizes URLs by stripping transient query tracking parameters', () => {
    const raw = 'https://example.com/video.mp4?utm_source=twitter&_ =12345&token=valid_token';
    const norm = normalizeMediaUrl(raw);
    expect(norm).not.toContain('utm_source');
    expect(norm).toContain('token=valid_token');
  });

  it('generates consistent candidate IDs for the same tab and normalized URL', () => {
    const id1 = generateCandidateId(1, 'https://example.com/video.mp4?utm_source=1');
    const id2 = generateCandidateId(1, 'https://example.com/video.mp4?utm_source=2');
    expect(id1).toBe(id2);
  });

  it('deduplicates and merges incoming candidate into existing candidate', () => {
    const initialCandidate: MediaCandidate = {
      id: 'cand_1_abc',
      tabId: 1,
      pageUrl: 'https://example.com/watch',
      sourceUrl: 'blob:https://example.com/stream-id',
      type: 'unknown',
      title: 'Awesome Presentation',
      width: 1920,
      height: 1080,
      hasVideo: true,
      hasAudio: true,
      extractor: 'dom',
      confidence: 50,
      detectedAt: 1000,
    };

    const networkCandidate: MediaCandidate = {
      id: 'cand_1_xyz',
      tabId: 1,
      pageUrl: 'https://example.com/watch',
      sourceUrl: 'https://cdn.example.com/video/master.m3u8',
      type: 'hls',
      title: '',
      hasVideo: true,
      hasAudio: true,
      variants: [
        {
          id: 'v1080',
          resolution: '1080p',
          url: 'https://cdn.example.com/video/1080.m3u8',
          hasVideo: true,
          hasAudio: true,
        },
      ],
      extractor: 'network',
      confidence: 85,
      detectedAt: 1050,
    };

    const list = correlateCandidate([initialCandidate], networkCandidate);
    expect(list.length).toBe(1);
    const merged = list[0];

    // Merged item should preserve the DOM title, upgrade type to HLS, and hold variants
    expect(merged.title).toBe('Awesome Presentation');
    expect(merged.type).toBe('hls');
    expect(merged.sourceUrl).toBe('https://cdn.example.com/video/master.m3u8');
    expect(merged.variants?.length).toBe(1);
    expect(merged.variants?.[0].resolution).toBe('1080p');
  });
});
