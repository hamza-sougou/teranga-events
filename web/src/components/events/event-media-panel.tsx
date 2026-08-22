'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';
import { InlineBanner } from '@/components/ui/inline-banner';
import { UploadCloudIcon, TrashIcon } from '@/components/ui/icons';
import { ACCEPTED_MEDIA_MIME_TYPES, MEDIA_LIMITS, formatBytes, mediaTypeForMimeType } from '@/lib/media-limits';
import type { EventMedia } from '@/types';

interface EventMediaPanelProps {
  organizationId: string;
  eventId: string;
  // Same semantic as TicketTypesPanel's canEdit — RBAC and the terminal-
  // status lock already folded in by the parent page.
  canEdit: boolean;
}

interface PendingUpload {
  id: string;
  filename: string;
  progress: number;
  error: string | null;
}

// Direct PUT to the presigned R2 URL via XMLHttpRequest, not apiClient/fetch:
// fetch exposes no upload-progress event, and a 50MB video on a limited
// mobile data plan needs a visible bar, not a spinner.
function uploadWithProgress(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Échec de l'upload")));
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'upload"));
    xhr.send(file);
  });
}

export function EventMediaPanel({ organizationId, eventId, canEdit }: EventMediaPanelProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const baseUrl = `/organizations/${organizationId}/events/${eventId}/media`;
  const key = queryKeys.media(organizationId, eventId);

  const mediaQuery = useQuery<EventMedia[]>({
    queryKey: key,
    queryFn: async () => (await apiClient.get(baseUrl)).data,
    enabled: !!organizationId && !!eventId,
  });
  const media = mediaQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (mediaId: string) => apiClient.delete(`${baseUrl}/${mediaId}`),
    onSuccess: (_data, mediaId) => {
      setGlobalError(null);
      queryClient.setQueryData<EventMedia[]>(key, (current) => (current ?? []).filter((m) => m.id !== mediaId));
    },
    onError: (err) => setGlobalError(getApiErrorMessage(err)),
  });

  async function uploadFile(file: File) {
    const type = mediaTypeForMimeType(file.type);
    if (!type) {
      setGlobalError(`Format non supporté : ${file.name}`);
      return;
    }
    const limits = MEDIA_LIMITS[type];
    if (file.size > limits.maxSizeBytes) {
      setGlobalError(`${file.name} dépasse la taille maximale (${formatBytes(limits.maxSizeBytes)}).`);
      return;
    }
    const currentCount = media.filter((m) => m.type === type).length;
    if (currentCount + pendingUploads.length >= limits.maxCount) {
      setGlobalError(`Limite de ${limits.maxCount} atteinte pour ce type de média.`);
      return;
    }

    const localId = `${file.name}-${Date.now()}-${Math.random()}`;
    setPendingUploads((prev) => [...prev, { id: localId, filename: file.name, progress: 0, error: null }]);

    try {
      const presignRes = await apiClient.post(`${baseUrl}/presign`, {
        type,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      const { uploadUrl, storageKey } = presignRes.data;

      await uploadWithProgress(uploadUrl, file, (progress) => {
        setPendingUploads((prev) => prev.map((u) => (u.id === localId ? { ...u, progress } : u)));
      });

      const confirmRes = await apiClient.post<EventMedia>(`${baseUrl}/confirm`, {
        type,
        storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
        originalFilename: file.name,
      });

      queryClient.setQueryData<EventMedia[]>(key, (current) => [...(current ?? []), confirmRes.data]);
      setPendingUploads((prev) => prev.filter((u) => u.id !== localId));
    } catch (err) {
      const message = getApiErrorMessage(err, `Échec de l'upload de ${file.name}.`);
      setPendingUploads((prev) => prev.map((u) => (u.id === localId ? { ...u, error: message } : u)));
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    setGlobalError(null);
    Array.from(files).forEach((file) => uploadFile(file));
  }

  return (
    <Panel title="Médias">
      {globalError && <InlineBanner tone="error">{globalError}</InlineBanner>}

      {canEdit && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded border-[1.5px] border-dashed border-border px-4 py-8 text-center transition-colors',
            isDraggingOver ? 'border-indigo bg-bg' : 'hover:bg-bg',
          )}
        >
          <UploadCloudIcon className="h-6 w-6 text-text-muted" />
          <p className="text-[13px] font-semibold">Glissez des fichiers ici ou cliquez pour en choisir</p>
          <p className="text-[11px] text-text-muted">
            JPEG/PNG/WebP jusqu&apos;à {formatBytes(MEDIA_LIMITS.IMAGE.maxSizeBytes)} ({MEDIA_LIMITS.IMAGE.maxCount} max) —
            MP4 jusqu&apos;à {formatBytes(MEDIA_LIMITS.VIDEO.maxSizeBytes)} ({MEDIA_LIMITS.VIDEO.maxCount} max)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_MEDIA_MIME_TYPES}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {pendingUploads.length > 0 && (
        <div className="mb-4 space-y-2">
          {pendingUploads.map((upload) => (
            <div key={upload.id} className="rounded border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate font-semibold">{upload.filename}</span>
                {upload.error ? (
                  <button
                    type="button"
                    aria-label="Ignorer"
                    onClick={() => setPendingUploads((prev) => prev.filter((u) => u.id !== upload.id))}
                    className="text-text-muted hover:text-danger-strong"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="shrink-0 text-text-muted">{upload.progress}%</span>
                )}
              </div>
              {upload.error ? (
                <p className="mt-1 text-[11px] font-semibold text-danger-strong">{upload.error}</p>
              ) : (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-border">
                  <div className="h-full bg-indigo transition-all" style={{ width: `${upload.progress}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mediaQuery.isLoading ? (
        <p className="text-sm text-text-muted">Chargement...</p>
      ) : media.length === 0 && pendingUploads.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun média pour l&apos;instant.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((item) => (
            <div key={item.id} className="relative overflow-hidden rounded border border-border">
              {item.type === 'IMAGE' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={item.originalFilename ?? ''} className="aspect-square w-full object-cover" />
              ) : (
                <video src={item.url} controls className="aspect-square w-full bg-ink object-cover" />
              )}
              {canEdit && (
                <button
                  type="button"
                  aria-label="Supprimer"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(item.id)}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded bg-overlay text-on-dark hover:bg-danger"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
