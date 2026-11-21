-- PHONE INTEL V1.0 foundation schema (PostgreSQL)
-- Apply only after configuring authentication, access policies and retention rules.

create table if not exists investigations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  purpose text not null check (purpose in ('research','fraud-awareness','public-business-verification')),
  status text not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists phone_numbers (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  e164 text not null,
  country_code text not null default 'ID',
  created_at timestamptz not null default now()
);

create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null,
  source_url text,
  terms_reviewed boolean not null default false,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references investigations(id) on delete cascade,
  source_id uuid references sources(id),
  finding_type text not null,
  summary text not null,
  source_url text not null,
  observed_at timestamptz not null default now(),
  verification_status text not null default 'unverified'
    check (verification_status in ('verified','corroborated','indicative','unknown')),
  limitations text
);

create table if not exists evidence (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references findings(id) on delete cascade,
  excerpt text,
  captured_at timestamptz not null default now(),
  content_hash text
);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now()
);

-- Before production: enable RLS or equivalent row-level authorization,
-- define retention/deletion jobs, and restrict access by investigation owner.
