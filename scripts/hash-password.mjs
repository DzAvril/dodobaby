import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error("用法: npm run password:hash -- '至少8位的家庭密码'");
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
console.log(`scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`);
