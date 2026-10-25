import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/diagnose-plant" && request.method === "POST") {
        try {
          const { handleDiagnosePlant } = await import("./server/diagnose");
          const payload = await request.json();
          const result = await handleDiagnosePlant(payload);
          return Response.json(result);
        } catch (err: unknown) {
          console.error("SSR /api/diagnose-plant error:", err);
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      }

      if (url.pathname === "/api/advice-plant" && request.method === "POST") {
        try {
          const { handlePlantAdvice } = await import("./server/advice");
          const payload = await request.json();
          const result = await handlePlantAdvice(payload);
          return Response.json(result);
        } catch (err: unknown) {
          console.error("SSR /api/advice-plant error:", err);
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      }

      if (url.pathname === "/api/defoliation-analyze" && request.method === "POST") {
        try {
          const { handleDefoliationAnalyze } = await import("./server/defoliation");
          const payload = await request.json();
          const result = await handleDefoliationAnalyze(payload);
          return Response.json(result);
        } catch (err: unknown) {
          console.error("SSR /api/defoliation-analyze error:", err);
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      }

      if (url.pathname === "/api/trichome-scan" && request.method === "POST") {
        try {
          const { handleTrichomeScan } = await import("./server/trichome");
          const payload = await request.json();
          const result = await handleTrichomeScan(payload);
          return Response.json(result);
        } catch (err: unknown) {
          console.error("SSR /api/trichome-scan error:", err);
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      }

      if (url.pathname === "/api/doctor-chat" && request.method === "POST") {
        try {
          const { handleDoctorChat } = await import("./server/doctor-chat");
          const payload = await request.json();
          const result = await handleDoctorChat(payload);
          return Response.json(result);
        } catch (err: unknown) {
          console.error("SSR /api/doctor-chat error:", err);
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          );
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
