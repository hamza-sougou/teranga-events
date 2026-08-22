import type { EventMediaType } from '@/types';

// Mirrors backend/src/event-media/event-media.constants.ts — client-side
// validation is UX only (early rejection before spending an upload attempt),
// the server always re-validates and is the real boundary.
export const MEDIA_LIMITS: Record<EventMediaType, { maxCount: number; maxSizeBytes: number; allowedMimeTypes: string[] }> = {
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

export function mediaTypeForMimeType(mimeType: string): EventMediaType | null {
  if (MEDIA_LIMITS.IMAGE.allowedMimeTypes.includes(mimeType)) return 'IMAGE';
  if (MEDIA_LIMITS.VIDEO.allowedMimeTypes.includes(mimeType)) return 'VIDEO';
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export const ACCEPTED_MEDIA_MIME_TYPES = [
  ...MEDIA_LIMITS.IMAGE.allowedMimeTypes,
  ...MEDIA_LIMITS.VIDEO.allowedMimeTypes,
].join(',');
