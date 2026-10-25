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

## Parcours

**Client** (`/`) : formulaire – plan(s) et nomenclature obligatoires, lieu de fabrication (France / Europe / USA / peu importe),
quantité, maturité (proto / premier de série / série mature), cadre (nouveau besoin / élargissement du panel /
remplacement de fournisseur / externalisation), délai, prix cible, précisions libres et documents complémentaires.
Après envoi : écran avec la frise des 6 étapes (étape 1 terminée), récapitulatif, mention de l'e-mail de confirmation
et invitation à créer un compte. Le lien de suivi permet ensuite de répondre aux précisions et de valider le devis.

**Admin** (`/admin`) : notification par e-mail + badge « nouveau ». Sur la fiche projet :
1. saisie du volume d'heures estimé et de la complexité (1–5) après lecture du plan ;
2. présélection automatique des sous-traitants compatibles (zone, maturité, quantité, heures, complexité), avec le
   détail des critères OK / KO ; on peut cocher d'autres sous-traitants ;
3. envoi de la consultation anonymisée ;
4. étapes client : demande de précisions (étape 2, optionnelle), devis (3), commande reçue (4), production (5), expédition (6).

**Sous-traitants** : base importable en CSV (*Admin → Sous-traitants*, modèle téléchargeable), ou inscription libre
sur `/sous-traitants/inscription` avec leurs conditions de sollicitation (fourchettes d'heures, de complexité, de
quantités, types de série, zone). Un sous-traitant déjà présent dans la base qui s'inscrit récupère sa fiche une fois
son e-mail confirmé. Ils répondent (prix, délai, commentaire, ou déclinent) via le lien reçu, sans avoir besoin de compte.

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
