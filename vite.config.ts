import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: "client",
  plugins: [preact()],
  build: { outDir: "../dist/client", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:3001", ws: true } },
  },
});
