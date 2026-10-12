// Connexion à Supabase (compte par email + sauvegarde en ligne).
// Colle ici les deux valeurs trouvées dans Supabase → Project Settings → API.
// Si tu laisses vide, l'app fonctionne sans compte, avec les données sur l'appareil.
// La clé « anon » est faite pour être publique : la sécurité est assurée par les règles du fichier supabase.sql.

window.MN_CONFIG = {
  supabaseUrl: '',      // ex : 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: '',  // ex : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....'
};
