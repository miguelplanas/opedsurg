import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA: instalable en el iPhone ("Añadir a pantalla de inicio") y offline.
// Se precachean la app y el dataset JSON para poder hacer tests sin conexión.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,json,svg,png}"],
        // el dataset puede crecer con mas examenes
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
      manifest: {
        name: "Opo Tests",
        short_name: "Opo Tests",
        description: "Tests de oposicion tipo test",
        lang: "es",
        theme_color: "#0E5B4E",
        background_color: "#F4F5F3",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
