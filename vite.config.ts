import { defineConfig, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { createApiMiddleware } from "./server/http";
import { resolveDataRoot } from "./server/root";

export default defineConfig(async () => {
  const root = await resolveDataRoot();
  return {
    server: { host: "127.0.0.1" },
    plugins: [
      react(),
      {
        name: "mentat-api",
        configureServer(server: ViteDevServer) {
          server.middlewares.use(createApiMiddleware(root));
        },
      },
    ],
  };
});
