// À REMPLACER avant déploiement — toutes les valeurs ci-dessous sont des
// placeholders fictifs (étape 4-6/6 du chantier footer : contenu réel des
// pages Légal/Entreprise, voir PROGRESS.md §26). "Zen Events" est le vrai nom
// de marque déjà utilisé partout ailleurs dans le code (layout.tsx metadata,
// register-form, etc.) — ce n'est PAS un placeholder, il n'est donc pas
// répété ici. `hostingProvider` reste volontairement générique : aucun
// hébergeur n'est encore choisi (DigitalOcean ou Render — voir
// docs/INFRASTRUCTURE.md, tâche [Vous] non résolue).
export const legalInfo = {
  legalEntityName: 'RAISON SOCIALE À DÉFINIR SARL',
  legalForm: 'SARL',
  shareCapital: 'Capital social à définir',
  registeredAddress: 'Adresse à définir, Dakar, Sénégal',
  ninea: 'NINEA000000000',
  rccm: 'SN-DKR-0000-A-00000',
  publicationDirector: 'Directeur de publication à définir',
  hostingProvider: {
    name: 'Hébergeur à définir',
    address: 'Adresse à définir',
  },
  contactEmail: 'contact@example.com',
  contactPhone: '+221 00 000 00 00',
};
