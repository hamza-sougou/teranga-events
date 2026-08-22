'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { TicketCategoryTag } from '@/components/ui/category-tag';
import { PlusIcon, PencilIcon, MailIcon } from '@/components/ui/icons';
import { TicketTypeModal } from './ticket-type-modal';
import { WhitelistModal } from './whitelist-modal';
import type { TicketType } from '@/types';

function formatPrice(price: string, currency: string) {
  return `${new Intl.NumberFormat('fr-FR').format(Number(price))} ${currency}`;
}

function saleWindowState(saleStart: string, saleEnd: string): { label: string; className: string } {
  const now = new Date();
  if (now < new Date(saleStart)) return { label: 'Pas encore', className: 'text-text-muted' };
  if (now > new Date(saleEnd)) return { label: 'Terminée', className: 'text-text-muted' };
  return { label: 'En vente', className: 'text-emerald-strong' };
}

interface TicketTypesPanelProps {
  organizationId: string;
  eventId: string;
  // Governs every mutating action here (create/edit a ticket type, manage
  // the whitelist) — already folds in both the RBAC check and the
  // terminal-status lock, same semantic as EventForm's `disabled`.
  canEdit: boolean;
}

export function TicketTypesPanel({ organizationId, eventId, canEdit }: TicketTypesPanelProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTicketType, setEditingTicketType] = useState<TicketType | null>(null);
  const [whitelistTarget, setWhitelistTarget] = useState<TicketType | null>(null);

  const ticketTypesQuery = useQuery<TicketType[]>({
    queryKey: queryKeys.ticketTypes(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}/ticket-types`)).data,
    enabled: !!organizationId && !!eventId,
  });

  const ticketTypes = ticketTypesQuery.data ?? [];

  return (
    <Panel
      title="Types de billets"
      action={
        canEdit ? (
          <Button type="button" variant="ghost" onClick={() => setShowCreateModal(true)}>
            <PlusIcon className="h-3.5 w-3.5" /> Type de billet
          </Button>
        ) : undefined
      }
    >
      {ticketTypesQuery.isLoading ? (
        <p className="text-sm text-text-muted">Chargement...</p>
      ) : ticketTypes.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun type de billet pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Nom', 'Catégorie', 'Prix', 'Vendus', 'Vente', ''].map((h) => (
                  <th
                    key={h}
                    className="border-b-[1.5px] border-border pb-2.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ticketTypes.map((tt) => {
                const saleState = saleWindowState(tt.saleStart, tt.saleEnd);
                return (
                  <tr key={tt.id}>
                    <td className="border-b border-border py-[13px] text-[13px] font-bold">{tt.name}</td>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      <TicketCategoryTag category={tt.category} />
                    </td>
                    <td className="border-b border-border py-[13px] text-[13px]">{formatPrice(tt.price, tt.currency)}</td>
                    <td className="border-b border-border py-[13px] text-[13px]">
                      {tt.quantitySold} / {tt.quantityTotal}
                    </td>
                    <td className={cn('border-b border-border py-[13px] text-[13px] font-semibold', saleState.className)}>
                      {saleState.label}
                    </td>
                    <td className="border-b border-border py-[13px] text-right text-[13px]">
                      <div className="flex items-center justify-end gap-1.5">
                        {canEdit && (
                          <button
                            type="button"
                            aria-label="Modifier"
                            onClick={() => setEditingTicketType(tt)}
                            className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                        )}
                        {canEdit && tt.accessMode === 'PRESALE_WHITELIST' && (
                          <button
                            type="button"
                            aria-label="Gérer la liste"
                            onClick={() => setWhitelistTarget(tt)}
                            className="flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-bg"
                          >
                            <MailIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <TicketTypeModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          organizationId={organizationId}
          eventId={eventId}
        />
      )}
      {editingTicketType && (
        <TicketTypeModal
          open={!!editingTicketType}
          onClose={() => setEditingTicketType(null)}
          organizationId={organizationId}
          eventId={eventId}
          ticketType={editingTicketType}
        />
      )}
      {whitelistTarget && (
        <WhitelistModal
          open={!!whitelistTarget}
          onClose={() => setWhitelistTarget(null)}
          organizationId={organizationId}
          eventId={eventId}
          ticketTypeId={whitelistTarget.id}
          ticketTypeName={whitelistTarget.name}
        />
      )}
    </Panel>
  );
}
