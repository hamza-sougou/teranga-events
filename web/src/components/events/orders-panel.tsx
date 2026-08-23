'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Panel } from '@/components/ui/panel';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { OrderStatusBadge } from '@/components/ui/status-badge';
import { DownloadIcon } from '@/components/ui/icons';
import type { Order } from '@/types';

function formatPrice(amount: string, currency: string) {
  return `${new Intl.NumberFormat('fr-FR').format(Number(amount))} ${currency}`;
}

function summarizeItems(order: Order) {
  return order.items.map((item) => `${item.quantity}× ${item.ticketType?.name ?? 'Billet'}`).join(', ');
}

interface OrdersPanelProps {
  organizationId: string;
  eventId: string;
  eventSlug: string;
}

export function OrdersPanel({ organizationId, eventId, eventSlug }: OrdersPanelProps) {
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const baseUrl = `/organizations/${organizationId}/events/${eventId}`;

  const ordersQuery = useQuery<Order[]>({
    queryKey: queryKeys.orders(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`${baseUrl}/orders`)).data,
    enabled: !!organizationId && !!eventId,
  });
  const orders = ordersQuery.data ?? [];

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      const res = await apiClient.get(`${baseUrl}/orders/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `commandes-${eventSlug}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(getApiErrorMessage(err, "Échec de l'export CSV."));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Panel
      title="Ventes"
      action={
        <Button type="button" variant="ghost" loading={isExporting} onClick={handleExport}>
          <DownloadIcon className="h-3.5 w-3.5" /> Exporter CSV
        </Button>
      }
    >
      {exportError && <InlineBanner tone="error">{exportError}</InlineBanner>}

      {ordersQuery.isLoading ? (
        <p className="text-sm text-text-muted">Chargement...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-text-muted">Aucune commande pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Acheteur', 'Billets', 'Statut', 'Montant', 'Date'].map((h) => (
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
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="border-b border-border py-[13px] text-[13px]">
                    <div className="font-bold">{order.buyerEmail}</div>
                    {order.buyerPhone && <div className="text-xs text-text-muted">{order.buyerPhone}</div>}
                  </td>
                  <td className="border-b border-border py-[13px] text-[13px] text-text-muted">{summarizeItems(order)}</td>
                  <td className="border-b border-border py-[13px] text-[13px]">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="border-b border-border py-[13px] text-[13px]">
                    {formatPrice(order.totalAmount, order.currency)}
                  </td>
                  <td className="border-b border-border py-[13px] text-[13px] text-text-muted">
                    {format(new Date(order.createdAt), 'd MMM yyyy, HH:mm', { locale: fr })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
