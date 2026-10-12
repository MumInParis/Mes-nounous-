# Mes Nounous

Le carnet des heures de garde : nounous régulières ou ponctuelles, paiements, taxis.

- Une garde se note en quelques touches (bouton + en bas) : avec qui, quel jour, horaires ou durée, enfants, taxi.
- **Ponctuelle** : pour une baby-sitter de dépannage, à l'heure ou au forfait, sans l'ajouter à la liste des nounous.
- Accueil : ce qu'il reste à régler dans le mois, par personne, avec « C'est réglé ».
- Journal : toutes les gardes du mois, avec un bouton Réglé / À régler sur chacune.
- Compte par email (Supabase), sauvegarde en ligne, export JSON / CSV, suppression du compte.
- Statistiques d'inscriptions visibles uniquement par l'administratrice.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `styles.css`, `app.js` | L'app |
| `config.js` | Adresse et clé du projet Supabase, email de contact |
| `supabase.sql` | Table des données (installation) |
| `supabase-mise-a-jour.sql` | Suppression de compte + statistiques admin |
| `manifest.webmanifest`, `icon.svg` | Installation sur l'écran d'accueil |

## Installation

1. Déposer tous les fichiers à la racine du dépôt GitHub ; Settings → Pages → Deploy from a branch, `main`, `/ (root)`.
2. Supabase → SQL Editor : exécuter `supabase.sql`, puis `supabase-mise-a-jour.sql` (après y avoir mis ton email).
3. Supabase → Authentication → URL Configuration : mettre l'adresse de l'app dans *Site URL* et *Redirect URLs*.
4. Remplir `config.js`.
