/**
 * Shared edge-function handler utilities.
 *
 * Eliminates manual CORS plumbing and prevents scope bugs by keeping
 * headers completely inside the framework — individual handlers never
 * touch them.
 *
 * Usage:
 *
 *   import { withCors, json } from "../_shared/handler.ts";
 *
 *   Deno.serve(withCors(async (req, ctx) => {
 *     // ctx.corsHeaders is available but rarely needed directly
 *     return json({ ok: true });
 *   }));
 *
 * `json()` and `jsonError()` are header-free helpers — withCors injects
 * the correct CORS headers into every response automatically.
 */

import { getCorsHeaders, errorResponse } from "./cors.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface HandlerContext {
  /** Pre-resolved, request-aware CORS headers. Use only if building
   *  a Response manually (prefer `json()` / `jsonError()` instead). */
  corsHeaders: Record<string, string>;
}

type HandlerResult = Response | Record<string, unknown> | unknown[] | null | undefined;
type HandlerFn = (req: Request, ctx: HandlerContext) => Promise<HandlerResult> | HandlerResult;

// ── Core wrapper ──────────────────────────────────────────────────────

/**
 * Wraps a handler function with automatic CORS handling:
 *
 * 1. OPTIONS preflight → immediate 204 with correct headers
 * 2. Resolves `getCorsHeaders(req)` once per request
 * 3. Normalises the handler's return value:
 *    - `Response`        → used as-is (CORS merged)
 *    - plain object/array → auto-wrapped via `json(data)`
 *    - `null`/`undefined` → 500 "No response returned"
 * 4. Catches any unhandled error and returns `errorResponse(err, req)`
 *
 * This means:
 * - Handlers can `return { ok: true }` without calling `json()` at all
 * - No handler can accidentally omit headers
 * - No handler needs `corsHeaders` as a function parameter
 * - Errors always produce a valid, CORS-enabled JSON response
 *
 * @example
 *   Deno.serve(withCors(async (req) => {
 *     return { users: rows };           // plain object — auto-wrapped
 *   }));
 *
 *   Deno.serve(withCors(async (req) => {
 *     return json({ ok: true }, 201);   // explicit Response — also fine
 *   }));
 */
export function withCors(handler: HandlerFn): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = getCorsHeaders(req);

    // ── Preflight ──
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const ctx: HandlerContext = { corsHeaders: cors };
      let result = await handler(req, ctx);

      // ── Normalise return value ──
      let response: Response;
      if (result instanceof Response) {
        response = result;
      } else if (result == null) {
        // null or undefined — defensive 500 so we never send an empty body
        response = jsonError("No response returned", 500);
      } else {
        // Plain object or array — auto-wrap as JSON 200
        response = json(result);
      }

      // Merge CORS headers into the response (preserving any the handler set)
      for (const [key, value] of Object.entries(cors)) {
        if (!response.headers.has(key)) {
          response.headers.set(key, value);
        }
      }

      return response;
    } catch (error) {
      return errorResponse(error, req);
    }
  };
}

// ── Response helpers ──────────────────────────────────────────────────

/**
 * Return a JSON success response.  CORS headers are injected by `withCors`.
 *
 *   return json({ users: rows });
 *   return json({ created: true }, 201);
 */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Return a JSON error response.  CORS headers are injected by `withCors`.
 *
 *   return jsonError("Not found", 404);
 *   return jsonError("Validation failed", 400, { fields: ["email"] });
 */
export function jsonError(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
