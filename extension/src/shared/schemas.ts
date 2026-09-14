import { z } from 'zod';

export const MediaVariantSchema = z.object({
  id: z.string(),
  resolution: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  bandwidth: z.number().optional(),
  codecs: z.string().optional(),
  url: z.string().url(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  formatContainer: z.string().optional(),
});

export const MediaCandidateSchema = z.object({
  id: z.string(),
  tabId: z.number(),
  pageUrl: z.string(),
  sourceUrl: z.string(),
  type: z.enum(['direct', 'hls', 'dash', 'audio', 'video', 'unknown']),
  mimeType: z.string().optional(),
  title: z.string(),
  filename: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  duration: z.number().optional(),
  fileSize: z.number().optional(),
  bitrate: z.number().optional(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  variants: z.array(MediaVariantSchema).optional(),
  extractor: z.string(),
  confidence: z.number().min(0).max(100),
  detectedAt: z.number(),
});

export const ExtensionMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MEDIA_DETECTED'),
    payload: MediaCandidateSchema,
  }),
  z.object({
    type: z.literal('GET_TAB_MEDIA'),
    payload: z.object({ tabId: z.number() }),
  }),
  z.object({
    type: z.literal('START_DOWNLOAD'),
    payload: z.object({
      candidateId: z.string(),
      variantId: z.string().optional(),
      customFilename: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('CANCEL_DOWNLOAD'),
    payload: z.object({ jobId: z.string() }),
  }),
  z.object({
    type: z.literal('GET_DOWNLOAD_JOBS'),
  }),
  z.object({
    type: z.literal('CHECK_NATIVE_HELPER'),
  }),
  z.object({
    type: z.literal('OFFSCREEN_REMUX_PROGRESS'),
    payload: z.object({
      jobId: z.string(),
      percent: z.number(),
      downloadedBytes: z.number(),
      totalBytes: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal('OFFSCREEN_REMUX_COMPLETE'),
    payload: z.object({
      jobId: z.string(),
      blobUrl: z.string(),
      filename: z.string(),
    }),
  }),
  z.object({
    type: z.literal('OFFSCREEN_REMUX_FAILED'),
    payload: z.object({
      jobId: z.string(),
      error: z.string(),
    }),
  }),
]);

export type ExtensionMessage = z.infer<typeof ExtensionMessageSchema>;
