import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { verifyAgentToken } from "@/lib/agent-access";
import { createDodoBabyMcpServer, type DodoBabyApiFetch } from "@/scripts/dodobaby-mcp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(request: Request) {
  const [scheme, token] = request.headers.get("authorization")?.split(/\s+/, 2) ?? [];
  return scheme?.toLowerCase() === "bearer" ? token : undefined;
}

function jsonRpcError(status: number, message: string, headers?: HeadersInit) {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    { status, headers: { "cache-control": "no-store", ...headers } },
  );
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

function publicAppUrl(request: Request) {
  return normalizeBaseUrl(process.env.APP_URL ?? new URL(request.url).origin);
}

function internalAppUrl(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
  }
  return new URL(request.url).origin;
}

function createApiFetch(request: Request, token: string): DodoBabyApiFetch {
  const baseUrl = internalAppUrl(request);
  return async (path, init = {}) => {
    const response = await fetch(new URL(path, baseUrl), {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        origin: new URL(baseUrl).origin,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(Number(process.env.DODOBABY_MCP_TIMEOUT_MS ?? 15_000)),
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body ? String(body.error) : text;
      throw new Error(`${init.method ?? "GET"} ${path} failed with HTTP ${response.status}: ${message}`);
    }
    return body;
  };
}

function authorizedToken(request: Request) {
  const token = bearerToken(request);
  return token && verifyAgentToken(token) ? token : null;
}

export async function POST(request: Request) {
  const token = authorizedToken(request);
  if (!token) {
    return jsonRpcError(401, "Unauthorized", { "www-authenticate": 'Bearer realm="dodobaby-mcp"' });
  }

  try {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createDodoBabyMcpServer({
      apiFetch: createApiFetch(request, token),
      appUrl: publicAppUrl(request),
    });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    console.error("Failed to handle DodoBaby MCP request", error);
    return jsonRpcError(500, "Internal server error");
  }
}

function methodNotAllowed(request: Request) {
  if (!authorizedToken(request)) {
    return jsonRpcError(401, "Unauthorized", { "www-authenticate": 'Bearer realm="dodobaby-mcp"' });
  }
  return jsonRpcError(405, "Method not allowed", { allow: "POST" });
}

export async function GET(request: Request) {
  return methodNotAllowed(request);
}

export async function DELETE(request: Request) {
  return methodNotAllowed(request);
}
