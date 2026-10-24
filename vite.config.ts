// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
import { handleDiagnosePlant } from "./src/server/diagnose";

function diagnoseApiPlugin(): Plugin {
  return {
    name: "diagnose-api-middleware",
    configureServer(server) {
      server.middlewares.use("/api/diagnose-plant", (req, res, next) => {
        if (req.method !== "POST") return next();
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body);
            const result = await handleDiagnosePlant(payload);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (err: unknown) {
            console.error("API /api/diagnose-plant error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    prerender: {
      routes: ["/"],
    },
  },
  nitro: {
    preset: "node-server",
    output: {
      dir: "dist",
      publicDir: "dist",
      serverDir: "dist/server",
    },
  },
  vite: {
    plugins: [diagnoseApiPlugin()],
    oxc: {
      jsx: {
        development: false,
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: true,
    },
    preview: {
      host: "0.0.0.0",
      port: 3000,
    },
  },
});
