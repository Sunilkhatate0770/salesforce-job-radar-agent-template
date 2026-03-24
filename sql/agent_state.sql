create table if not exists public.agent_state (
  state_key text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists agent_state_updated_at_idx
  on public.agent_state (updated_at desc);
