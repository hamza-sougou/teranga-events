'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { CheckCircleIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// Mirrors backend/src/organizations/dto/subscribe-organizer.dto.ts.
const subscribeSchema = z.object({
  email: z.string().min(1, 'Email requis.').email('Adresse email invalide.'),
});
type SubscribeFormValues = z.infer<typeof subscribeSchema>;

type WidgetState = 'idle' | 'subscribed' | 'unsubscribing' | 'unsubscribed';

interface OrganizerSubscribeWidgetProps {
  organizationSlug: string;
  // inline = full-width panel on the profile page; compact = squeezed next
  // to the Contact button in organizer-panel.tsx. Same form/logic either way.
  variant: 'inline' | 'compact';
}

// Local, per-session state only — subscribing is a plain mailing list with no
// account/session, so the backend has no way to tell a returning visitor's
// browser "you're already subscribed" on page load. Accepted limitation
// (see PROGRESS.md), not worked around with an unreliable client-side cookie.
export function OrganizerSubscribeWidget({ organizationSlug, variant }: OrganizerSubscribeWidgetProps) {
  const [state, setState] = useState<WidgetState>('idle');
  const [error, setError] = useState<string | null>(null);

  const subscribeForm = useForm<SubscribeFormValues>({
    resolver: zodResolver(subscribeSchema),
    defaultValues: { email: '' },
  });
  const unsubscribeForm = useForm<SubscribeFormValues>({
    resolver: zodResolver(subscribeSchema),
    defaultValues: { email: '' },
  });

  const subscribeMutation = useMutation({
    mutationFn: (values: SubscribeFormValues) => apiClient.post(`/organizers/${organizationSlug}/subscribe`, values),
    onSuccess: () => {
      setError(null);
      subscribeForm.reset();
      setState('subscribed');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const unsubscribeMutation = useMutation({
    mutationFn: (values: SubscribeFormValues) => apiClient.post(`/organizers/${organizationSlug}/unsubscribe`, values),
    onSuccess: () => {
      setError(null);
      setState('unsubscribed');
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  const inputWidth = variant === 'compact' ? 'w-[150px] sm:w-[170px]' : 'flex-1';

  if (state === 'unsubscribed') {
    return <p className="text-[13px] font-semibold text-text-muted">Vous ne recevrez plus d&apos;emails de cet organisateur.</p>;
  }

  if (state === 'subscribed') {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-strong">
          <CheckCircleIcon className="h-4 w-4" />
          Vous êtes abonné
        </p>
        <button
          type="button"
          onClick={() => setState('unsubscribing')}
          className="mt-1 text-[12px] font-semibold text-text-muted underline hover:text-text"
        >
          Se désabonner
        </button>
      </div>
    );
  }

  if (state === 'unsubscribing') {
    return (
      <form
        onSubmit={unsubscribeForm.handleSubmit((values) => unsubscribeMutation.mutate(values))}
        className="flex items-start gap-2"
      >
        <div className={inputWidth}>
          <Input
            type="email"
            placeholder="Votre email"
            invalid={!!unsubscribeForm.formState.errors.email}
            {...unsubscribeForm.register('email')}
          />
          {unsubscribeForm.formState.errors.email && (
            <p className="mt-1 text-[11px] font-semibold text-danger">{unsubscribeForm.formState.errors.email.message}</p>
          )}
        </div>
        <Button type="submit" variant="ghost" loading={unsubscribeMutation.isPending}>
          Confirmer
        </Button>
      </form>
    );
  }

  return (
    <div>
      {error && (variant === 'inline' ? (
        <InlineBanner tone="error">{error}</InlineBanner>
      ) : (
        <p className="mb-1.5 text-[11px] font-semibold text-danger">{error}</p>
      ))}
      <form
        onSubmit={subscribeForm.handleSubmit((values) => subscribeMutation.mutate(values))}
        className={cn('flex items-start gap-2', variant === 'inline' && 'flex-col sm:flex-row sm:items-start')}
      >
        <div className={inputWidth}>
          <Input
            type="email"
            placeholder="Votre email"
            invalid={!!subscribeForm.formState.errors.email}
            {...subscribeForm.register('email')}
          />
          {subscribeForm.formState.errors.email && (
            <p className="mt-1 text-[11px] font-semibold text-danger">{subscribeForm.formState.errors.email.message}</p>
          )}
        </div>
        <Button type="submit" loading={subscribeMutation.isPending}>
          S&apos;abonner
        </Button>
      </form>
    </div>
  );
}
