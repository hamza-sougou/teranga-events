'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { TrashIcon } from '@/components/ui/icons';
import type { TicketTypeWhitelist } from '@/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface WhitelistModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  eventId: string;
  ticketTypeId: string;
  ticketTypeName: string;
}

export function WhitelistModal({ open, onClose, organizationId, eventId, ticketTypeId, ticketTypeName }: WhitelistModalProps) {
  const queryClient = useQueryClient();
  const [emailsInput, setEmailsInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `/organizations/${organizationId}/events/${eventId}/ticket-types/${ticketTypeId}/whitelist`;
  const key = queryKeys.whitelist(organizationId, eventId, ticketTypeId);

  // Lazy: only fires while the modal is actually open, avoiding one extra
  // GET per PRESALE_WHITELIST ticket type on every edit-page load.
  const whitelistQuery = useQuery<TicketTypeWhitelist[]>({
    queryKey: key,
    queryFn: async () => (await apiClient.get(baseUrl)).data,
    enabled: open,
  });

  const addMutation = useMutation({
    // The endpoint returns the fresh full whitelist, so the cache can be
    // written directly instead of a refetch round-trip.
    mutationFn: (emails: string[]) => apiClient.post<TicketTypeWhitelist[]>(baseUrl, { emails }),
    onSuccess: (res) => {
      setError(null);
      setEmailsInput('');
      queryClient.setQueryData(key, res.data);
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (email: string) => apiClient.delete(`${baseUrl}/${encodeURIComponent(email)}`),
    onSuccess: (_data, email) => {
      setError(null);
      queryClient.setQueryData<TicketTypeWhitelist[]>(key, (current) => (current ?? []).filter((e) => e.email !== email));
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleClose() {
    setError(null);
    setEmailsInput('');
    onClose();
  }

  function handleAdd() {
    const emails = Array.from(
      new Set(
        emailsInput
          .split(/[,\n]/)
          .map((e) => e.trim())
          .filter(Boolean),
      ),
    );
    if (emails.length === 0) return;
    const invalid = emails.find((e) => !EMAIL_RE.test(e));
    if (invalid) {
      setError(`Adresse email invalide : ${invalid}`);
      return;
    }
    addMutation.mutate(emails);
  }

  const whitelist = whitelistQuery.data ?? [];

  return (
    <Modal open={open} onClose={handleClose} title={`Liste blanche — ${ticketTypeName}`}>
      {error && <InlineBanner tone="error">{error}</InlineBanner>}

      <div className="mb-4">
        <Textarea
          rows={3}
          placeholder="email1@exemple.com, email2@exemple.com"
          value={emailsInput}
          onChange={(e) => setEmailsInput(e.target.value)}
        />
        <Button type="button" className="mt-2.5" loading={addMutation.isPending} onClick={handleAdd}>
          Ajouter
        </Button>
      </div>

      {whitelistQuery.isLoading ? (
        <p className="text-sm text-text-muted">Chargement...</p>
      ) : whitelist.length === 0 ? (
        <p className="text-sm text-text-muted">Aucune adresse sur la liste pour l&apos;instant.</p>
      ) : (
        <div className="max-h-[280px] overflow-y-auto">
          {whitelist.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-2.5 border-b border-border py-2.5 last:border-none">
              <div>
                <div className="text-[13px] font-semibold">{entry.email}</div>
                <div className={cn('text-[11px] font-bold', entry.usedAt ? 'text-emerald-strong' : 'text-amber-strong')}>
                  {entry.usedAt ? `Utilisé le ${format(new Date(entry.usedAt), 'd MMM yyyy', { locale: fr })}` : 'En attente'}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Retirer ${entry.email}`}
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(entry.email)}
                className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg hover:text-danger"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
