#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";

const token = process.argv[2] ?? randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");

console.log(`DODOBABY_AGENT_TOKEN=${token}`);
console.log(`DODOBABY_AGENT_TOKEN_SHA256=${hash}`);
