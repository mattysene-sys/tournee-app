// src/pwaAutoUpdate.js
//
// Force le rechargement automatique de l'app dès qu'une nouvelle version
// est déployée, sans action manuelle (vider le cache, fermer l'app, etc.)
//
// À importer une seule fois, tout en haut de src/main.jsx :
//   import "./pwaAutoUpdate";

import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
  onNeedRefresh() {
    // Une nouvelle version est disponible : on recharge directement,
    // sans demander confirmation à l'utilisateur (usage terrain = pas
    // le temps de cliquer sur une popup).
    window.location.reload();
  },
  onOfflineReady() {
    console.log("Tournée est prêt à fonctionner hors-ligne.");
  },
});
