'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/api-errors';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/ui/form-field';
import { Button } from '@/components/ui/button';
import { InlineBanner } from '@/components/ui/inline-banner';
import { CheckCircleIcon } from '@/components/ui/icons';

// Mirrors backend/src/organizations/dto/contact-organizer.dto.ts exactly.
const contactSchema = z.object({
  name: z.string().min(1, 'Nom requis.').max(200, 'Maximum 200 caractères.'),
  email: z.string().min(1, 'Email requis.').email('Adresse email invalide.'),
  subject: z.string().min(1, 'Objet requis.').max(200, 'Maximum 200 caractères.'),
  message: z.string().min(1, 'Message requis.').max(5000, 'Maximum 5000 caractères.'),
});
type ContactFormValues = z.infer<typeof contactSchema>;

interface OrganizerContactModalProps {
  open: boolean;
  onClose: () => void;
  organizationSlug: string;
  organizationName: string;
}

export function OrganizerContactModal({ open, onClose, organizationSlug, organizationName }: OrganizerContactModalProps) {
  const [phase, setPhase] = useState<'form' | 'success'>('form');
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', subject: '', message: '' },
  });

  // Reset to a fresh form every time the modal is reopened — mirrors
  // TicketSidesheet's own open-keyed reset for its local state.
  useEffect(() => {
    if (open) {
      setPhase('form');
      setError(null);
      reset();
    }
  }, [open, reset]);

  const mutation = useMutation({
    mutationFn: (values: ContactFormValues) => apiClient.post(`/organizers/${organizationSlug}/contact`, values),
    onSuccess: () => setPhase('success'),
    onError: (err) => {
      // The page reached this modal by successfully loading this organizer's
      // profile/event — a 404 from this specific mutation can only mean "no
      // contactEmail configured" (see organizer-profile.service.ts#contact),
      // never "organizer not found". Never surface the raw backend string.
      if (isAxiosError(err) && err.response?.status === 404) {
        setError("Cet organisateur n'accepte pas les messages pour le moment.");
      } else {
        setError(getApiErrorMessage(err));
      }
    },
  });

  function handleClose() {
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Contacter ${organizationName}`}>
      {phase === 'success' ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircleIcon className="h-10 w-10 text-emerald" />
          <p className="text-[13px] font-bold text-text">Votre message a été envoyé.</p>
          <Button variant="ghost" onClick={handleClose}>
            Fermer
          </Button>
        </div>
      ) : (
        <>
          {error && <InlineBanner tone="error">{error}</InlineBanner>}
          <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
            <FormField label="Nom" htmlFor="contact-name" required error={errors.name?.message}>
              <Input id="contact-name" invalid={!!errors.name} {...register('name')} />
            </FormField>
            <FormField label="Email" htmlFor="contact-email" required error={errors.email?.message}>
              <Input id="contact-email" type="email" invalid={!!errors.email} {...register('email')} />
            </FormField>
            <FormField label="Objet" htmlFor="contact-subject" required error={errors.subject?.message}>
              <Input id="contact-subject" invalid={!!errors.subject} {...register('subject')} />
            </FormField>
            <FormField label="Message" htmlFor="contact-message" required error={errors.message?.message}>
              <Textarea id="contact-message" rows={5} invalid={!!errors.message} {...register('message')} />
            </FormField>
            <Button type="submit" loading={mutation.isPending}>
              Envoyer
            </Button>
          </form>
        </>
      )}
    </Modal>
  );
}
