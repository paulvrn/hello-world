# Câblage sur mesure – plateforme de sous-traitance

Outil web permettant à un client de soumettre un projet de câblage filaire, à l'administrateur de présélectionner
des sous-traitants selon des critères, puis de les consulter **sans révéler l'identité du client final**.

## Démarrage

```bash
npm install
ADMIN_EMAIL=vous@domaine.fr ADMIN_PASSWORD='un-mot-de-passe' npm start
# → http://localhost:3000   (admin : /connexion)
```

Node.js ≥ 22.13 requis (base SQLite intégrée à Node, aucun service externe).

| Variable | Rôle |
|---|---|
| `PORT` | Port HTTP (3000 par défaut) |
| `BASE_URL` | URL publique, utilisée dans les liens des e-mails |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Compte admin créé au premier lancement (défaut : admin@example.com / admin) |
| `ADMIN_NOTIFY_EMAIL` | Adresse qui reçoit les notifications (défaut : `ADMIN_EMAIL`) |
| `SMTP_URL` | ex. `smtps://user:pass@smtp.exemple.fr:465`. **Sans SMTP, aucun e-mail ne part** : ils sont journalisés dans *Admin → E-mails* |
| `MAIL_FROM` | Expéditeur des e-mails |
| `SESSION_SECRET` | Secret de session (à fixer en production, sinon les sessions sautent à chaque redémarrage) |
| `DATA_DIR` | Dossier de la base et des fichiers (`./data` par défaut) |
| `COMPANY_NAME` | Société citée dans les mentions de confidentialité (défaut : SP2I) |
| `CONSULT_WAVE_SIZE` / `CONSULT_MAX_PANEL` | Taille d'une vague de consultation (3) et nombre maximal de fabricants consultés par projet (5) |
| `FILE_LINK_SECRET` / `FILE_LINK_TTL_MINUTES` | Signature des liens de téléchargement sous-traitants et durée de validité (60 min) |
| `CONSULTATION_TTL_DAYS` | Durée de validité d'un lien de consultation (60 jours) |

> Le schéma de la base a évolué : supprimez `data/app.db` si vous aviez lancé une version précédente.

## Parcours

**Client** (`/`) : formulaire – plan(s) et nomenclature obligatoires, lieu de fabrication (France / Europe / USA / peu importe),
quantité, cadence et taille des lots, maturité (proto / premier de série / série mature), cadre (nouveau besoin /
élargissement du panel / remplacement de fournisseur / externalisation), délai, prix cible, norme de fabrication
(IPC/WHMA-A-620 classe 1/2/3…), tests et certifications exigés, composants fournis ou approvisionnés, lieu de livraison,
contraintes réglementaires (ITAR/EAR…), précisions libres et documents complémentaires. Le client autorise
explicitement la consultation de partenaires sous accord de confidentialité.
Après envoi : écran avec la frise des 6 étapes (étape 1 terminée), récapitulatif, mention de l'e-mail de confirmation
et invitation à créer un compte. Le lien de suivi permet ensuite de répondre aux précisions et de valider le devis.

**Admin** (`/admin`) : notification par e-mail + badge « nouveau ». Sur la fiche projet :
1. saisie du volume d'heures estimé et de la complexité (1–5) après lecture du plan ;
2. présélection par **score de correspondance** (zone, maturité, quantité, heures, complexité, certifications,
   approvisionnement des composants), avec le détail des critères OK / KO et l'historique de chaque sous-traitant
   (taux de réponse, délai de réponse, taux de gain) ;
3. envoi de la consultation anonymisée **par vagues** : les 3 meilleurs scores sont cochés d'office, 5 fabricants au plus
   par projet sauf élargissement volontaire ; chaque sous-traitant voit combien de fabricants sont consultés ;
4. questions des sous-traitants : l'admin répond (ou relaie au client), et la réponse est partagée à tous les consultés
   sans dire qui a posé la question ;
5. issue de la consultation : offre retenue et retour personnalisé aux autres (écart de prix, délai, projet abandonné…) ;
6. étapes client : demande de précisions (étape 2, optionnelle), devis (3), commande reçue (4), production (5), expédition (6).

**Sous-traitants** : base importable en CSV (*Admin → Sous-traitants*, modèle téléchargeable), ou inscription libre
sur `/sous-traitants/inscription` avec leurs conditions de sollicitation (fourchettes d'heures, de complexité, de
quantités, types de série, zone), procédés maîtrisés, certifications et capacité d'approvisionnement. À l'inscription
— ou à la première consultation pour un sous-traitant importé — il accepte un engagement de confidentialité et de
non-contournement (texte dans `views/partials/nda.ejs`, **à faire valider par votre conseil juridique**). Un sous-traitant déjà présent dans la base qui s'inscrit récupère sa fiche une fois
son e-mail confirmé. Ils répondent (prix, délai, commentaire, ou déclinent) et posent leurs questions via le lien reçu,
sans avoir besoin de compte. Les liens de téléchargement des documents sont signés et expirent au bout d'une heure ;
le lien de consultation lui-même expire au bout de 60 jours.

## Anonymisation – ce qui est fait et ce qui ne l'est pas

- Le sous-traitant ne voit que la référence (`CBL-2026-0001`) et le descriptif rédigé par l'admin (pré-rempli sans
  société, contact, prix cible, contexte ni précisions libres du client).
- Les fichiers sont servis sous un nom neutre (`CBL-2026-0001-plan-1.pdf`).
- Les PDF sont purgés automatiquement de leurs métadonnées (auteur, titre, logiciel…).
- **Le contenu visuel n'est pas modifié** : cartouche, logo, nom du client dessinés sur le plan restent visibles.
  Déposez une version caviardée depuis la fiche projet si nécessaire.
- Les fichiers non-PDF (Excel, DXF…) ne sont pas partagés tant que l'admin n'a pas déposé une version caviardée ou
  confirmé qu'ils ne contiennent aucune information client.

## Tests

```bash
npm test
```

## Limites connues (prototype)

- Sessions en mémoire (déconnexion au redémarrage) ; pas de « mot de passe oublié ».
- Une seule personne admin.
