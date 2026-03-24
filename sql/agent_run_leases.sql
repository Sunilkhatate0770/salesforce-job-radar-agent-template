create table if not exists public.agent_run_leases (
  lease_key text primary key,
  holder text not null,
  source text not null default 'unknown',
  note text not null default '',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists agent_run_leases_expires_at_idx
  on public.agent_run_leases (expires_at);
