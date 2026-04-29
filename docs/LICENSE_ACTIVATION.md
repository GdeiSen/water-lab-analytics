# License activation

This app supports two activation paths:

- Online activation through Supabase Edge Functions.
- Manual offline activation with a locally generated signed license token.

The app stores the activation token in the OS app data directory, so normal app updates and reinstalls should not remove activation.

## 1. Generate signing keys

Run:

```bash
npm run license:keypair
```

The command prints:

- `WLA_LICENSE_PUBLIC_KEY` - safe to put into the app build environment.
- `WLA_LICENSE_PRIVATE_KEY` - secret. Keep it outside GitHub and never commit it.

## 2. Build-time app environment

For release builds, set these environment variables before `npm run tauri:build` or in GitHub Actions secrets:

```bash
WLA_LICENSE_REQUIRED=1
WLA_LICENSE_PUBLIC_KEY=<public key from npm run license:keypair>
WLA_LICENSE_API_URL=https://<project-ref>.functions.supabase.co/activate-license
```

If `WLA_LICENSE_PUBLIC_KEY` is not set, the current build treats licensing as disabled. This keeps local development usable.

## 3. Create Supabase tables

Create a Supabase project, open SQL Editor, and run:

```sql
-- Use docs/supabase-license.sql
```

The SQL file creates:

- `licenses` - license records and device limits.
- `activations` - activated fingerprints per license.

## 4. Create the Supabase Edge Function

Install and login to the Supabase CLI:

```bash
npm install -g supabase
supabase login
```

Create the function:

```bash
supabase functions new activate-license
```

Replace the generated function with the content from:

```text
docs/supabase-activate-function.ts
```

Set Supabase secrets:

```bash
supabase secrets set WLA_LICENSE_PRIVATE_KEY=<private key from npm run license:keypair>
```

Deploy:

```bash
supabase functions deploy activate-license
```

## 5. Create a license key

Generate a user-facing license key and its database hash:

```bash
npm run license:hash-key
```

It prints:

```text
LICENSE_KEY=WLA-...
KEY_HASH=...
```

Insert the hash into Supabase:

```sql
insert into public.licenses (key_hash, customer_name, max_devices, expires_at)
values (
  '<KEY_HASH>',
  'Customer name',
  1,
  null
);
```

Give only `LICENSE_KEY` to the customer.

## 6. Online activation flow

The customer opens the app and enters `LICENSE_KEY`.

The app sends this to Supabase:

- `licenseKey`
- `fingerprint`
- `deviceLabel`
- `appVersion`

Supabase checks the license, checks `max_devices`, stores activation, signs a token, and returns it to the app.

## 7. Manual offline license generation

If Supabase is unavailable, ask the customer to copy the fingerprint from the activation screen.

Generate a license token locally:

```bash
npm run license:generate -- \
  --private-key <WLA_LICENSE_PRIVATE_KEY> \
  --fingerprint <CUSTOMER_FINGERPRINT> \
  --customer "Customer name" \
  --license-id "manual-customer-001" \
  --expires "2027-12-31T23:59:59Z"
```

For a non-expiring license, omit `--expires`.

Send the printed `wla1...` token to the customer. They can paste it into the `Ручной token` tab in the activation screen.

## 8. GitHub Actions release secrets

Add these repository secrets:

- `WLA_LICENSE_REQUIRED`: `1`
- `WLA_LICENSE_PUBLIC_KEY`: public key from `npm run license:keypair`
- `WLA_LICENSE_API_URL`: Supabase function URL

Then expose them in the release workflow before the Tauri build:

```yaml
env:
  WLA_LICENSE_REQUIRED: ${{ secrets.WLA_LICENSE_REQUIRED }}
  WLA_LICENSE_PUBLIC_KEY: ${{ secrets.WLA_LICENSE_PUBLIC_KEY }}
  WLA_LICENSE_API_URL: ${{ secrets.WLA_LICENSE_API_URL }}
```

Do not add `WLA_LICENSE_PRIVATE_KEY` to the app build workflow. The private key belongs only in Supabase secrets and on your local secure machine for manual fallback.
