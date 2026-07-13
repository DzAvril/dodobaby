import { NextResponse } from "next/server";
import {
  generateAgentToken,
  getAgentAccessStatus,
  revokeAgentToken,
  setAgentAccessEnabled,
} from "@/lib/agent-access";
import { isBrowserSameOrigin, isSessionAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function rejectUnauthorized(request?: Request) {
  if (!(await isSessionAuthenticated())) return json({ error: "请先登录" }, 401);
  if (request && !isBrowserSameOrigin(request)) return json({ error: "请求来源无效" }, 403);
  return null;
}

export async function GET() {
  const rejected = await rejectUnauthorized();
  if (rejected) return rejected;
  return json({ status: getAgentAccessStatus() });
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnauthorized(request);
  if (rejected) return rejected;
  const body = await request.json().catch(() => null) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") return json({ error: "启用状态无效" }, 400);
  try {
    return json({ status: setAgentAccessEnabled(body.enabled) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "更新失败" }, 400);
  }
}

export async function POST(request: Request) {
  const rejected = await rejectUnauthorized(request);
  if (rejected) return rejected;
  return json(generateAgentToken());
}

export async function DELETE(request: Request) {
  const rejected = await rejectUnauthorized(request);
  if (rejected) return rejected;
  return json({ status: revokeAgentToken() });
}
