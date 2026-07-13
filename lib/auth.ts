import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { hashPassword, verifyPasswordHash } from "@/lib/password";

const COOKIE_NAME = "dodobaby_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string) {
  const secret = process.env.DODOBABY_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("DODOBABY_SESSION_SECRET 至少需要 32 个字符");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function verifyAgentToken(token?: string): boolean {
  const expectedHash = process.env.DODOBABY_AGENT_TOKEN_SHA256;
  if (!token || !expectedHash || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(sha256Hex(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function bearerToken(authorization?: string | null) {
  const [scheme, token] = authorization?.split(/\s+/, 2) ?? [];
  return scheme?.toLowerCase() === "bearer" ? token : undefined;
}

function hasAgentAuthorization(authorization?: string | null) {
  return verifyAgentToken(bearerToken(authorization));
}

async function getPasswordHash() {
  const [setting] = await getDb().select().from(appSettings).where(eq(appSettings.key, "password_hash")).limit(1);
  const encoded = setting?.value ?? process.env.DODOBABY_PASSWORD_HASH;
  if (!encoded) throw new Error("尚未配置 DODOBABY_PASSWORD_HASH");
  return encoded;
}

export async function verifyPassword(password: string) {
  return verifyPasswordHash(password, await getPasswordHash());
}

export async function setPassword(password: string) {
  const now = new Date();
  const value = hashPassword(password);
  await getDb()
    .insert(appSettings)
    .values({ key: "password_hash", value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
}

function createSessionToken() {
  const payload = base64url(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS, nonce: randomBytes(12).toString("hex") }),
  );
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token?: string): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof decoded.exp === "number" && decoded.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export async function isAuthenticated() {
  const cookieStore = await cookies();
  if (verifySessionToken(cookieStore.get(COOKIE_NAME)?.value)) return true;
  const headerStore = await headers();
  return hasAgentAuthorization(headerStore.get("authorization"));
}

export async function createSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export function isSameOrigin(request: Request) {
  if (hasAgentAuthorization(request.headers.get("authorization"))) return true;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const expected = process.env.APP_URL;
  if (expected) return new URL(origin).origin === new URL(expected).origin;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(host && new URL(origin).host === host);
}
