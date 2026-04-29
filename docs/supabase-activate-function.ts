// @ts-nocheck
import { createClient } from "npm:@supabase/supabase-js@2";

type ActivationRequest = {
  licenseKey?: string;
  fingerprint?: string;
  deviceLabel?: string;
  appVersion?: string;
};

type LicenseRow = {
  id: string;
  key_hash: string;
  customer_name: string;
  status: "active" | "blocked" | "expired";
  max_devices: number;
  expires_at: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function base64url(bytes: ArrayBuffer | Uint8Array) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signToken(claims: Record<string, unknown>) {
  const privateKey = Deno.env.get("WLA_LICENSE_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("WLA_LICENSE_PRIVATE_KEY is not configured");
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    fromBase64url(privateKey),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const payload = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(payload));
  return `wla1.${payload}.${base64url(signature)}`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Server is not configured" }, 500);
  }

  const body = (await request.json().catch(() => null)) as ActivationRequest | null;
  const licenseKey = body?.licenseKey?.trim().toUpperCase();
  const fingerprint = body?.fingerprint?.trim();
  if (!licenseKey || !fingerprint) {
    return json({ error: "licenseKey and fingerprint are required" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const keyHash = await sha256Hex(licenseKey);
  const { data: license, error: licenseError } = await supabase
    .from("licenses")
    .select("id,key_hash,customer_name,status,max_devices,expires_at")
    .eq("key_hash", keyHash)
    .maybeSingle<LicenseRow>();

  if (licenseError) {
    return json({ error: licenseError.message }, 500);
  }
  if (!license) {
    return json({ error: "License key not found" }, 404);
  }
  if (license.status !== "active") {
    return json({ error: "License is not active" }, 403);
  }
  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) {
    return json({ error: "License has expired" }, 403);
  }

  const fingerprintHash = await sha256Hex(fingerprint);
  const { data: existingActivations, error: activationReadError } = await supabase
    .from("activations")
    .select("machine_fingerprint_hash")
    .eq("license_id", license.id);

  if (activationReadError) {
    return json({ error: activationReadError.message }, 500);
  }

  const alreadyActivated = existingActivations?.some(
    (item) => item.machine_fingerprint_hash === fingerprintHash,
  );
  if (!alreadyActivated && (existingActivations?.length ?? 0) >= license.max_devices) {
    return json({ error: "Activation limit reached" }, 403);
  }

  const { error: upsertError } = await supabase.from("activations").upsert(
    {
      license_id: license.id,
      machine_fingerprint_hash: fingerprintHash,
      device_label: body?.deviceLabel ?? null,
      app_version: body?.appVersion ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "license_id,machine_fingerprint_hash" },
  );

  if (upsertError) {
    return json({ error: upsertError.message }, 500);
  }

  const token = await signToken({
    licenseId: license.id,
    customerName: license.customer_name,
    fingerprint,
    issuedAt: new Date().toISOString(),
    expiresAt: license.expires_at,
    source: "supabase",
  });

  return json({ token });
});
