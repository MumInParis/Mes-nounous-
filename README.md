# Mes Nounous

Petite web-app pour suivre les heures de garde de ses nounous, savoir ce qui a été payé et noter les taxis.

- Créneaux par heure de début/fin ou par nombre d'heures (gère les gardes qui passent minuit)
- Tarif 1 enfant / 2 enfants et +
- Taxi optionnel sur chaque créneau
- Case « payé » sur chaque créneau + bouton « Tout marquer payé » par nounou
- Synthèse mensuelle : total, heures, taxis, reste à payer, heures par enfant
- Export / import JSON (sauvegarde) et export CSV du mois
- Mode clair / sombre automatique, installable sur l'écran d'accueil

Aucun serveur, aucun compte : les données sont stockées dans le navigateur de l'appareil (`localStorage`).
Pense à exporter régulièrement depuis l'onglet **Plus**.

## Mettre en ligne avec GitHub Pages

1. Crée un dépôt sur GitHub (ex. `mes-nounous`).
2. Ajoute tous les fichiers de ce dossier à la racine du dépôt.
3. Va dans **Settings → Pages**, choisis **Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Après une minute, l'app est disponible sur `https://<ton-pseudo>.github.io/mes-nounous/`.

Sur iPhone : ouvre le lien dans Safari → bouton Partager → **Sur l'écran d'accueil**.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `styles.css` | Design |
| `app.js` | Logique et stockage |
| `manifest.webmanifest`, `icon.svg` | Installation sur l'écran d'accueil |
