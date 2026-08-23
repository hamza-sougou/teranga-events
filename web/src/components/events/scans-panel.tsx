'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Panel } from '@/components/ui/panel';
import { ScanResultBadge } from '@/components/ui/status-badge';
import type { Scan } from '@/types';

interface ScansPanelProps {
  organizationId: string;
  eventId: string;
}

export function ScansPanel({ organizationId, eventId }: ScansPanelProps) {
  const scansQuery = useQuery<Scan[]>({
    queryKey: queryKeys.scans(organizationId, eventId),
    queryFn: async () => (await apiClient.get(`/organizations/${organizationId}/events/${eventId}/scans`)).data,
    enabled: !!organizationId && !!eventId,
  });
  const scans = scansQuery.data ?? [];

  return (
    <Panel title="Historique de scan">
      {scansQuery.isLoading ? (
        <p className="text-sm text-text-muted">Chargement...</p>
      ) : scans.length === 0 ? (
        <p className="text-sm text-text-muted">Aucun scan pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Résultat', 'Billet', 'Contrôleur', 'Zone', 'Date'].map((h) => (
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
              {scans.map((scan) => (
                <tr key={scan.id}>
                  <td className="border-b border-border py-[13px] text-[13px]">
                    <ScanResultBadge result={scan.result} />
                  </td>
                  <td className="border-b border-border py-[13px] text-[13px]">{scan.ticket.ticketType.name}</td>
                  <td className="border-b border-border py-[13px] text-[13px] text-text-muted">{scan.controller.fullName}</td>
                  <td className="border-b border-border py-[13px] text-[13px] text-text-muted">{scan.gateOrZone ?? '—'}</td>
                  <td className="border-b border-border py-[13px] text-[13px] text-text-muted">
                    {format(new Date(scan.scannedAt), 'd MMM yyyy, HH:mm', { locale: fr })}
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
