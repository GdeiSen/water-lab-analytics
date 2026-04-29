import { generateKeyPairSync } from "node:crypto";

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
const publicSpki = publicKey.export({ type: "spki", format: "der" });
const publicRaw = Buffer.from(publicSpki).subarray(-32);

console.log("WLA_LICENSE_PUBLIC_KEY=");
console.log(base64url(publicRaw));
console.log("");
console.log("WLA_LICENSE_PRIVATE_KEY=");
console.log(base64url(privatePkcs8));
console.log("");
console.log("Keep WLA_LICENSE_PRIVATE_KEY secret. Put only WLA_LICENSE_PUBLIC_KEY into app build env.");
