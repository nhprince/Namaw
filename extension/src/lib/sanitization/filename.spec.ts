import { describe, it, expect } from 'vitest';
import { sanitizeFilename, renderFilenameTemplate } from './filename';

describe('sanitizeFilename', () => {
  it('strips illegal characters on Windows (<>:"/\\|?*)', () => {
    const unsafe = 'Video: What? "Awesome" <Clip> | Episode/1\\Test*.mp4';
    const safe = sanitizeFilename(unsafe);
    expect(safe).not.toMatch(/[<>:"/\\|?*]/);
    expect(safe).toBe('Video_ What_ _Awesome_ _Clip_ _ Episode_1_Test_.mp4');
  });

  it('neutralizes path traversal attempts', () => {
    const malicious = '../../../../etc/passwd.mp4';
    const safe = sanitizeFilename(malicious);
    expect(safe).not.toContain('..');
    expect(safe).not.toContain('/');
  });

  it('handles Windows reserved device names (CON, PRN, AUX, NUL)', () => {
    expect(sanitizeFilename('CON.mp4')).toBe('CON_safe.mp4');
    expect(sanitizeFilename('aux.mp4')).toBe('aux_safe.mp4');
    expect(sanitizeFilename('prn.mkv')).toBe('prn_safe.mkv');
    expect(sanitizeFilename('NUL')).toBe('NUL_safe');
  });

  it('strips trailing spaces and periods', () => {
    expect(sanitizeFilename('My Video ...')).toBe('My Video');
    expect(sanitizeFilename('My Video   ')).toBe('My Video');
  });

  it('truncates excessively long filenames safely', () => {
    const longName = 'A'.repeat(300) + '.mp4';
    const safe = sanitizeFilename(longName);
    expect(safe.length).toBeLessThanOrEqual(204); // 200 base + 4 ext
    expect(safe.endsWith('.mp4')).toBe(true);
  });
});

describe('renderFilenameTemplate', () => {
  it('renders standard {title} [{resolution}].{ext}', () => {
    const result = renderFilenameTemplate('{title} [{resolution}].{ext}', {
      title: 'Amazing Tutorial',
      resolution: '1080p',
      ext: 'mp4',
    });
    expect(result).toBe('Amazing Tutorial [1080p].mp4');
  });

  it('handles missing resolution gracefully without empty brackets', () => {
    const result = renderFilenameTemplate('{title} [{resolution}].{ext}', {
      title: 'Amazing Tutorial',
      ext: 'mp4',
    });
    expect(result).toBe('Amazing Tutorial.mp4');
  });

  it('sanitizes unsafe characters inside template variables', () => {
    const result = renderFilenameTemplate('{title} - {resolution}.{ext}', {
      title: 'Cool: Video?',
      resolution: '720p',
      ext: 'mp4',
    });
    expect(result).toBe('Cool_ Video_ - 720p.mp4');
  });
});
