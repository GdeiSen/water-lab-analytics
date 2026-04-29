import { createPrivateKey, sign } from "node:crypto";

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function requiredArg(name) {
  const value = readArg(name) ?? process.env[`WLA_${name.replaceAll("-", "_").toUpperCase()}`];
  if (!value) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return value;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

const privateKeyBase64 = requiredArg("private-key");
const fingerprint = requiredArg("fingerprint");
const customerName = readArg("customer") ?? "Manual customer";
const licenseId = readArg("license-id") ?? `manual-${Date.now()}`;
const expiresAt = readArg("expires");
const source = readArg("source") ?? "manual";

const claims = {
  licenseId,
  customerName,
  fingerprint,
  issuedAt: new Date().toISOString(),
  expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  source,
};

const privateKey = createPrivateKey({
  key: Buffer.from(privateKeyBase64, "base64url"),
  type: "pkcs8",
  format: "der",
});
const payload = base64urlJson(claims);
const signature = sign(null, Buffer.from(payload), privateKey).toString("base64url");
const token = `wla1.${payload}.${signature}`;

console.log(token);
