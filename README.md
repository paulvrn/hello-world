# Frises mémoire

Outil de rétention d'information sous forme de frises chronologiques :
histoire des arts (peinture, sculpture, architecture, musique, danse, cinéma…)
et histoire politique.

Ouvrir `index.html` dans un navigateur, sans installation ni serveur.

## Principe

- On part d'une **page blanche** qui se remplit au fil des entrées.
- Chaque entrée contient : une frise, un titre, une **date de début**, une
  **date de fin** facultative, un **descriptif** et **comment on l'a appris**
  (lieu, moment, personne, contexte : se souvenir du moment aide à retenir).
- Dates acceptées : `1789`, `07/1789`, `14/07/1789`, `14 juillet 1789`,
  `1789-07-14`, `44 av. J.-C.`, `-44`.
- Navigation : un onglet par frise, plus « Toutes » qui empile les frises
  pour les comparer. On se déplace en glissant, on zoome à la molette, en
  pinçant ou avec les boutons.
- On peut ajouter, renommer, recolorer ou supprimer des frises.

## Révision (flashcards à répétition espacée)

Le mode **Réviser** transforme chaque entrée en carte, sans export : ajouter
ou modifier une entrée met la carte à jour, et si sa date change, la carte
repart de zéro.

- Recto : le titre (« Quand ? ») ; verso : la période, le descriptif et
  comment on l'a appris. Une carte inversée « Date → Quoi ? » s'active dans
  les réglages.
- **Indice** : avant de retourner la carte, on peut afficher seulement
  « comment je l'ai appris » pour se remettre dans le contexte.
- Quatre réponses (À revoir, Difficile, Bien, Facile) avec le délai
  suivant affiché sur chaque bouton. L'algorithme est une variante de SM-2,
  celui d'Anki.
- Raccourcis : `Espace` pour retourner la carte puis répondre « Bien »,
  `1`–`4` pour répondre, `H` pour l'indice, `Z` pour annuler.
- Limite de nouvelles cartes par jour réglable, avec « Apprendre 10 cartes
  de plus » ; révision de toutes les frises ou d'une seule via les onglets.
- Le nombre de cartes à réviser s'affiche sur le bouton « Réviser », et la
  fiche de chaque entrée indique sa prochaine révision.

## Livres et films (Goodreads, Letterboxd)

Menu **Exporter / Importer → Livres et films** : on choisit l'export de son
compte, et chaque livre lu ou film vu devient une entrée (carte primaire de
type « objet ») avec sa carte de révision.

- **Goodreads** : *My Books → Import and export → Export Library*, puis le
  fichier `.csv`. Seule l'étagère « read » est prise ; frise Littérature.
- **Letterboxd** : *Settings → Data → Export your data*, puis le `.zip` tel
  quel (ou l'un de ses CSV) ; frise Cinéma.
- Date proposée : année de publication ou de sortie, modifiable avant import
  pour placer l'œuvre à l'époque qu'elle raconte. « Comment je l'ai appris »
  reprend la date de lecture ou de visionnage et la note ; la critique
  Goodreads, s'il y en a une, devient le descriptif.
- Réimporter un export plus récent n'ajoute que les nouveautés.
- Pas de synchronisation automatique : Goodreads n'a plus d'API publique et
  les flux RSS des deux sites ne sont pas lisibles depuis une page statique
  (CORS). Il faudrait un petit serveur relais.

## Export / import

- **Excel (.xlsx)** : une feuille « Toutes les entrées », une feuille par
  frise, et une feuille « Anki » (colonnes Recto / Verso / Tags).
- **CSV pour Anki** : s'importe directement dans Anki (Fichier → Importer).
  Le séparateur, le HTML et la colonne des tags sont déjà déclarés dans le
  fichier. Recto : le titre ; verso : la période, le descriptif et
  « Appris : … ».
- **Sauvegarde JSON** (avec la progression des révisions) et **import** (.json ou .xlsx exporté par l'outil),
  avec fusion et suppression des doublons.

Les données restent dans le navigateur (`localStorage`). Pensez à exporter
une sauvegarde de temps en temps, et à l'importer pour passer d'un appareil
à l'autre.
