create extension if not exists pgcrypto;

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  customer_name text not null,
  status text not null default 'active' check (status in ('active', 'blocked', 'expired')),
  max_devices integer not null default 1 check (max_devices > 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  machine_fingerprint_hash text not null,
  device_label text,
  app_version text,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, machine_fingerprint_hash)
);

create index if not exists activations_license_id_idx
  on public.activations(license_id);

alter table public.licenses enable row level security;
alter table public.activations enable row level security;
