// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";
import { handleDiagnosePlant } from "./src/server/diagnose";

import { handlePlantAdvice } from "./src/server/advice";
import { handleDefoliationAnalyze } from "./src/server/defoliation";
import { handleTrichomeScan } from "./src/server/trichome";
import { handleGrowChat } from "./src/server/grow-chat";
import { handleWeatherRequest } from "./src/server/weather";
import { handleGrowthVisualize } from "./src/server/growth-visualizer";

function registerApiMiddlewares(middlewares: {
  use: (
    route: string,
    fn: (
      req: {
        method?: string;
        url?: string;
        on: (event: string, cb: (chunk?: unknown) => void) => void;
      },
      res: {
        statusCode: number;
        setHeader: (name: string, value: string) => void;
        end: (body: string) => void;
      },
      next: () => void,
    ) => void,
  ) => void;
}) {
  middlewares.use("/api/weather", async (req, res, next) => {
    if (req.method !== "GET") return next();
    try {
      const parsed = new URL(req.url || "/", "http://localhost");
      const lat = parseFloat(parsed.searchParams.get("lat") ?? "-36.85");
      const lon = parseFloat(parsed.searchParams.get("lon") ?? "174.76");
      const result = await handleWeatherRequest(lat, lon);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } catch (err: unknown) {
      console.error("API /api/weather error:", err);
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endpoints: Record<string, (payload: any) => Promise<unknown>> = {
    "/api/diagnose-plant": handleDiagnosePlant,
    "/api/advice-plant": handlePlantAdvice,
    "/api/defoliation-analyze": handleDefoliationAnalyze,
    "/api/trichome-scan": handleTrichomeScan,
    "/api/grow-chat": handleGrowChat,
    "/api/ai-assistant": handleGrowChat,
    "/api/growth-visualize": handleGrowthVisualize,
  };

  for (const [path, handler] of Object.entries(endpoints)) {
    middlewares.use(path, (req, res, next) => {
      if (req.method !== "POST") return next();
      let body = "";
      req.on("data", (chunk) => {
        body += String(chunk ?? "");
      });
      req.on("end", async () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const result = await handler(payload);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch (err: unknown) {
          console.error(`API ${path} error:`, err);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    });
  }
}

function apiMiddlewarePlugin(): Plugin {
  return {
    name: "api-middleware",
    configureServer(server) {
      registerApiMiddlewares(server.middlewares);
    },
    configurePreviewServer(server) {
      registerApiMiddlewares(server.middlewares);
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
    plugins: [apiMiddlewarePlugin()],
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
