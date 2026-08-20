import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { CurrentUser } from '@/types';

export function useCurrentUser() {
  const query = useQuery<CurrentUser>({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await apiClient.get<CurrentUser>('/auth/me');
      return data;
    },
    retry: false,
  });

  // No organization switcher in this pass — first ACTIVE membership,
  // consistent with the auto-created "Organisation de {prénom}" flow.
  const activeMembership = query.data?.memberships.find((m) => m.status === 'ACTIVE') ?? null;

  return { ...query, activeMembership };
}
