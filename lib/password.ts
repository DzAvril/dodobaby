import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const HASH_LENGTH = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, HASH_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyPasswordHash(password: string, encoded: string) {
  const [algorithm, nText, rText, pText, saltText, hashText] = encoded.split(":");
  if (algorithm !== "scrypt" || !saltText || !hashText) throw new Error("密码哈希格式无效");
  const expected = Buffer.from(hashText, "base64url");
  const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(nText),
    r: Number(rText),
    p: Number(pText),
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
