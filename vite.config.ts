import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 1420 = konwencja Tauri (tauri.conf.json devUrl)
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
