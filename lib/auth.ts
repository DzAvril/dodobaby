import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

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

export function verifyPassword(password: string): boolean {
  const encoded = process.env.DODOBABY_PASSWORD_HASH;
  if (!encoded) throw new Error("尚未配置 DODOBABY_PASSWORD_HASH");
  const [algorithm, nText, rText, pText, saltText, hashText] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltText || !hashText) throw new Error("DODOBABY_PASSWORD_HASH 格式无效");
  const expected = Buffer.from(hashText, "base64url");
  const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(nText),
    r: Number(rText),
    p: Number(pText),
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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
  return verifySessionToken(cookieStore.get(COOKIE_NAME)?.value);
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
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const expected = process.env.APP_URL;
  if (expected) return new URL(origin).origin === new URL(expected).origin;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(host && new URL(origin).host === host);
}
