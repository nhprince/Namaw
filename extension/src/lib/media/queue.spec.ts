import { describe, it, expect } from 'vitest';
import { countActiveJobs, nextQueuedJob, isTerminalState } from './queue';
import { DownloadJob } from '../../shared/types';

function makeJob(id: string, state: DownloadJob['state'], createdAt = 1000): DownloadJob {
  return {
    id,
    mediaCandidateId: 'cand_x',
    targetFilename: `${id}.mp4`,
    state,
    progress: { downloadedBytes: 0, percent: 0, speedBytesPerSec: 0 },
    engine: 'browser',
    createdAt,
    updatedAt: createdAt,
  };
}

describe('countActiveJobs', () => {
  it('counts DOWNLOADING, ANALYZING and REMUXING jobs only', () => {
    const jobs = {
      a: makeJob('a', 'DOWNLOADING'),
      b: makeJob('b', 'QUEUED'),
      c: makeJob('c', 'COMPLETED'),
      d: makeJob('d', 'ANALYZING'),
      e: makeJob('e', 'FAILED'),
    };
    expect(countActiveJobs(jobs)).toBe(2);
  });

  it('returns 0 for empty job maps', () => {
    expect(countActiveJobs({})).toBe(0);
  });
});

describe('nextQueuedJob', () => {
  it('returns the oldest queued job (FIFO)', () => {
    const jobs = {
      newer: makeJob('newer', 'QUEUED', 2000),
      active: makeJob('active', 'DOWNLOADING', 1000),
      older: makeJob('older', 'QUEUED', 1500),
    };
    const queuedJobs = { ...jobs };
    queuedJobs.older.candidate = {} as never;
    queuedJobs.newer.candidate = {} as never;
    expect(nextQueuedJob(queuedJobs)?.id).toBe('older');
  });

  it('returns null when there is nothing queued', () => {
    expect(nextQueuedJob({ a: makeJob('a', 'FAILED') })).toBeNull();
  });

  it('ignores queued jobs without a candidate snapshot', () => {
    expect(nextQueuedJob({ a: makeJob('a', 'QUEUED') })).toBeNull();
  });
});

describe('isTerminalState', () => {
  it('classifies terminal states correctly', () => {
    expect(isTerminalState('COMPLETED')).toBe(true);
    expect(isTerminalState('FAILED')).toBe(true);
    expect(isTerminalState('CANCELLED')).toBe(true);
    expect(isTerminalState('COMPANION_REQUIRED')).toBe(true);
    expect(isTerminalState('DOWNLOADING')).toBe(false);
    expect(isTerminalState('QUEUED')).toBe(false);
  });
});
