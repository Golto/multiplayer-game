import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "client",
  plugins: [preact()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./client/index.html", import.meta.url)),
        station: fileURLToPath(new URL("./client/station.html", import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:3001", ws: true } },
  },
});
