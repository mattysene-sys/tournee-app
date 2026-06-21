# Tournée — guide de mise en ligne

Cette appli est prête à être déployée gratuitement sur Vercel, puis installée comme une appli sur ton téléphone Android.

## Étape 1 — Mettre le projet sur GitHub

1. Va sur https://github.com et crée un compte gratuit si tu n'en as pas.
2. Clique sur "New repository", nomme-le par exemple `tournee-app`, laisse-le en "Public" ou "Private", clique "Create repository".
3. Sur la page qui s'affiche, clique sur "uploading an existing file" et dépose tous les fichiers de ce dossier (en gardant la structure : `src/App.jsx`, `src/main.jsx`, `public/icon-192.png`, `public/icon-512.png`, `index.html`, `package.json`, `vite.config.js`, `.gitignore`).
4. Clique "Commit changes".

## Étape 2 — Déployer sur Vercel

1. Va sur https://vercel.com et crée un compte gratuit avec "Continue with GitHub" (le plus simple).
2. Clique "Add New" → "Project".
3. Choisis le repo `tournee-app` que tu viens de créer.
4. Vercel détecte automatiquement que c'est un projet Vite — ne change rien aux réglages proposés.
5. Clique "Deploy". Attends 1 à 2 minutes.
6. Tu obtiens une adresse du type `https://tournee-app-xxxx.vercel.app` — c'est ton appli, en ligne, accessible depuis n'importe quel appareil.

## Étape 3 — L'installer sur ton téléphone Android

1. Ouvre Chrome sur ton téléphone et va sur l'adresse Vercel obtenue à l'étape précédente.
2. Un bandeau "Ajouter à l'écran d'accueil" devrait apparaître automatiquement en bas de l'écran. Sinon :
   - Appuie sur les 3 points en haut à droite de Chrome
   - Choisis "Ajouter à l'écran d'accueil" (ou "Installer l'application")
3. Confirme. Une icône "Tournée" apparaît sur ton écran d'accueil, comme une vraie appli.
4. En l'ouvrant depuis cette icône, elle s'affiche en plein écran, sans barre d'adresse Chrome.

## Mises à jour futures

Si tu veux modifier l'appli plus tard (demander une nouvelle fonctionnalité à Claude), il suffira de remplacer le fichier `src/App.jsx` sur GitHub avec la nouvelle version — Vercel redéploiera automatiquement en 1 à 2 minutes, et la mise à jour apparaîtra sur ton téléphone à la prochaine ouverture.

## Notes importantes

- Tes données (clients, planning, départs) sont stockées **localement sur ton téléphone**, dans le navigateur. Si tu changes de téléphone ou vides le cache de Chrome, tu devras réimporter ton fichier Excel.
- Le géocodage utilise un service gratuit (Nominatim/OpenStreetMap) ; au premier import, laisse l'appli terminer la barre de progression sans fermer l'onglet.
