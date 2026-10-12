# Mes Nounous

Petite web-app pour suivre les heures de garde de ses nounous, savoir ce qui a été payé et noter les taxis.

- Créneaux par heure de début/fin ou par nombre d'heures (gère les gardes qui passent minuit)
- Tarif 1 enfant / 2 enfants et +
- Taxi optionnel sur chaque créneau
- Case « payé » sur chaque créneau + bouton « Tout marquer payé » par nounou
- Synthèse mensuelle : total, heures, taxis, reste à payer, heures par enfant
- Compte par email + mot de passe, données sauvegardées en ligne (Supabase)
- Export / import JSON et export CSV du mois
- Mode clair / sombre automatique, installable sur l'écran d'accueil

Sans configuration, l'app marche aussi sans compte : les données restent alors sur l'appareil.

## 1. Mettre en ligne avec GitHub Pages

1. Dépose **tous les fichiers** de ce dossier à la racine du dépôt (pas le zip, pas un sous-dossier).
2. **Settings → Pages** → Source : **Deploy from a branch**, branche `main`, dossier `/ (root)`.
3. L'app est disponible sur `https://<ton-pseudo>.github.io/<nom-du-depot>/`.

## 2. Activer les comptes (Supabase, gratuit)

1. Crée un compte sur [supabase.com](https://supabase.com), puis **New project** (choisis la région Europe, un mot de passe de base de données que tu notes quelque part).
2. Dans le projet : **SQL Editor → New query**, colle le contenu de `supabase.sql`, puis **Run**.
3. **Authentication → URL Configuration** :
   - *Site URL* : l'adresse de ton app, ex. `https://muminparis.github.io/Mes-nounous-/`
   - *Redirect URLs* : ajoute la même adresse.
4. **Project Settings → API** (ou **Data API**) : copie la *Project URL* et la clé *anon public*.
5. Sur GitHub, ouvre `config.js`, clique sur le crayon ✏️, colle les deux valeurs entre les guillemets, puis **Commit changes**.

Au premier lancement, crée ton compte depuis l'app, puis clique sur le lien reçu par email.
Si tu avais déjà saisi des données sans compte sur ce téléphone, elles sont ajoutées automatiquement à ton compte.

Conseil : une fois ton compte créé, tu peux empêcher d'autres inscriptions dans
**Authentication → Sign In / Providers → Allow new users to sign up** (désactiver).
Pour partager l'app avec ton conjoint, connectez-vous simplement avec le même compte.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `styles.css` | Design |
| `app.js` | Logique, connexion et sauvegarde |
| `config.js` | Adresse et clé de ton projet Supabase |
| `supabase.sql` | Table et règles de sécurité à créer dans Supabase |
| `manifest.webmanifest`, `icon.svg` | Installation sur l'écran d'accueil |
