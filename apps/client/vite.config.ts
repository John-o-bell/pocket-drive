import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/matchmake": "http://127.0.0.1:2567" },
  },
  build: { target: "es2022" },
});
