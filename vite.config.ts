import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 1420 = konwencja Tauri (tauri.conf.json devUrl)
export default defineConfig({
  // OTA: frontend hostowany na task.kropidlowscy.pl/karteczka/ (deploy-ui.sh),
  // apka natywna laduje go zdalnie - aktualizacje UI bez przebudowy na Macu
  base: "/karteczka/",
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
