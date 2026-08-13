import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative assets allow both a custom domain and /repository/ on GitHub Pages.
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
  },
  build: {
    target: "es2020",
    sourcemap: true,
  },
});
