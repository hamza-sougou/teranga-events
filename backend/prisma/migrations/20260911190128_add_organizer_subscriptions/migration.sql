-- Liste de diffusion email du profil public d'un organisateur
-- (/organizers/[slug]) — pas un compte participant, aucun mot de passe ni
-- session. L'id sert directement de token de désabonnement.
-- CreateTable
CREATE TABLE "organizer_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "organizer_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizer_subscriptions_organization_id_email_key" ON "organizer_subscriptions"("organization_id", "email");

-- AddForeignKey
ALTER TABLE "organizer_subscriptions" ADD CONSTRAINT "organizer_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notification: contexte pour type = 'organizer_new_event'. Le destinataire
-- est un OrganizerSubscription (pas un user), event_id porte le contexte de
-- rendu du message. ON DELETE CASCADE sur organizer_subscription_id : un
-- désabonnement supprime aussi toute notification encore en attente pour
-- cet abonné.
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "event_id" UUID;
ALTER TABLE "notifications" ADD COLUMN "organizer_subscription_id" UUID;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizer_subscription_id_fkey" FOREIGN KEY ("organizer_subscription_id") REFERENCES "organizer_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
