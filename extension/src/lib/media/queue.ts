import { DownloadJob } from '../../shared/types';

/**
 * Counts jobs currently occupying a download slot (downloading or processing).
 */
export function countActiveJobs(jobs: Record<string, DownloadJob>): number {
  return Object.values(jobs).filter(
    (j) => j.state === 'DOWNLOADING' || j.state === 'ANALYZING' || j.state === 'REMUXING'
  ).length;
}

/**
 * Returns the oldest queued job (FIFO), or null when the queue is empty.
 */
export function nextQueuedJob(jobs: Record<string, DownloadJob>): DownloadJob | null {
  const queued = Object.values(jobs)
    .filter((j) => j.state === 'QUEUED' && j.candidate)
    .sort((a, b) => a.createdAt - b.createdAt);
  return queued[0] || null;
}

/**
 * Terminal states after which a job no longer occupies a download slot.
 */
export function isTerminalState(state: DownloadJob['state']): boolean {
  return (
    state === 'COMPLETED' ||
    state === 'FAILED' ||
    state === 'CANCELLED' ||
    state === 'UNSUPPORTED' ||
    state === 'DRM_PROTECTED' ||
    state === 'COMPANION_REQUIRED'
  );
}
