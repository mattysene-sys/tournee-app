import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // CORRECTIF : on enregistre nous-mêmes le service worker via
      // pwaAutoUpdate.js (registerSW), donc on désactive l'injection
      // automatique du plugin. C'est ÇA qui expose le module virtuel
      // "virtual:pwa-register" utilisé dans pwaAutoUpdate.js.
      injectRegister: false,
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Tournée",
        short_name: "Tournée",
        description: "Prochain RDV optimal et plan B en cas d'imprévu",
        theme_color: "#1C2630",
        background_color: "#F5F2EC",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      }
    })
  ]
});
