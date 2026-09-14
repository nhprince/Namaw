import { MediaCandidate, MediaVariant } from '../../shared/types';

/**
 * Normalizes URLs by removing transient query parameters, tracking tokens,
 * and standardizing protocol/hostname.
 */
export function normalizeMediaUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    // Parameters to strip for comparison
    const ephemeralParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      '_',
      'timestamp',
      't',
    ];

    ephemeralParams.forEach((param) => url.searchParams.delete(param));
    return url.href;
  } catch {
    return rawUrl;
  }
}

/**
 * Generates a deterministic candidate ID based on tabId and normalized URL.
 */
export function generateCandidateId(tabId: number, url: string): string {
  const norm = normalizeMediaUrl(url);
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash << 5) - hash + norm.charCodeAt(i);
    hash |= 0;
  }
  return `cand_${tabId}_${Math.abs(hash).toString(36)}`;
}

/**
 * Calculates a confidence score (0-100) based on candidate metadata completeness.
 */
export function calculateConfidence(candidate: Partial<MediaCandidate>): number {
  let score = 50;

  if (candidate.type === 'direct' && candidate.fileSize && candidate.fileSize > 0) {
    score += 30;
  } else if (candidate.type === 'hls' || candidate.type === 'dash') {
    score += 35;
  }

  if (candidate.width && candidate.height && candidate.height >= 360) {
    score += 10;
  }

  if (candidate.title && candidate.title.trim().length > 0) {
    score += 5;
  }

  if (candidate.variants && candidate.variants.length > 0) {
    score += 10;
  }

  return Math.min(100, Math.max(10, score));
}

/**
 * Merges a newly detected candidate into an existing list of candidates for a tab.
 * Deduplicates exact matches, enriches metadata (e.g. DOM title + Network stream),
 * and correlates variants.
 */
export function correlateCandidate(
  existingList: MediaCandidate[],
  incoming: MediaCandidate
): MediaCandidate[] {
  const normIncomingUrl = normalizeMediaUrl(incoming.sourceUrl);
  const existingIndex = existingList.findIndex((item) => {
    // Direct URL match
    if (normalizeMediaUrl(item.sourceUrl) === normIncomingUrl) return true;

    // Same base stream if one is blob and one is manifest
    if (
      item.sourceUrl.startsWith('blob:') &&
      (incoming.type === 'hls' || incoming.type === 'dash')
    ) {
      return true;
    }

    return false;
  });

  if (existingIndex === -1) {
    const scored = {
      ...incoming,
      id: incoming.id || generateCandidateId(incoming.tabId, incoming.sourceUrl),
      confidence: calculateConfidence(incoming),
    };
    return [scored, ...existingList];
  }

  // Merge into existing candidate
  const current = existingList[existingIndex];

  // Merge variants
  const mergedVariants: MediaVariant[] = [...(current.variants || [])];
  if (incoming.variants) {
    for (const v of incoming.variants) {
      if (!mergedVariants.some((existingV) => existingV.url === v.url || existingV.id === v.id)) {
        mergedVariants.push(v);
      }
    }
  }

  const updated: MediaCandidate = {
    ...current,
    title: current.title || incoming.title,
    thumbnailUrl: current.thumbnailUrl || incoming.thumbnailUrl,
    width: Math.max(current.width || 0, incoming.width || 0) || undefined,
    height: Math.max(current.height || 0, incoming.height || 0) || undefined,
    fileSize: current.fileSize || incoming.fileSize,
    mimeType: incoming.mimeType || current.mimeType,
    type: incoming.type !== 'unknown' ? incoming.type : current.type,
    sourceUrl: !current.sourceUrl.startsWith('blob:') ? current.sourceUrl : incoming.sourceUrl,
    variants: mergedVariants.length > 0 ? mergedVariants : undefined,
    confidence: Math.max(current.confidence, calculateConfidence(incoming)),
    detectedAt: Math.max(current.detectedAt, incoming.detectedAt),
  };

  const nextList = [...existingList];
  nextList[existingIndex] = updated;
  return nextList;
}
