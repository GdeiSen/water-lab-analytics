import { createHash, randomBytes } from "node:crypto";

const rawKey = process.argv[2] ?? `WLA-${randomBytes(12).toString("hex").toUpperCase()}`;
const normalized = rawKey.trim().toUpperCase();
const hash = createHash("sha256").update(normalized).digest("hex");

console.log(`LICENSE_KEY=${normalized}`);
console.log(`KEY_HASH=${hash}`);
