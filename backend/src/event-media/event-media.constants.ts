import { EventMediaType } from '@prisma/client';

// Justified in docs/DESIGN_SYSTEM.md-adjacent context (mostly-mobile, limited
// data-plan Senegalese user base): JPEG/PNG/WebP cover every phone without
// conversion (HEIC excluded — not natively renderable in <img> in most
// browsers); MP4/H.264 is the one universally playable video format without a
// plugin. Sizes/counts sized for a promotional gallery/teaser, not a media
// host.
export const MEDIA_LIMITS: Record<
  EventMediaType,
  { maxCount: number; maxSizeBytes: number; allowedMimeTypes: string[] }
> = {
  IMAGE: {
    maxCount: 8,
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  VIDEO: {
    maxCount: 2,
    maxSizeBytes: 50 * 1024 * 1024,
    allowedMimeTypes: ['video/mp4'],
  },
};

// Extension derived from the (server-validated) mime type, never from the
// client-supplied filename — avoids trusting arbitrary user input in a
// storage key.
export const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};
