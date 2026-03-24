create table if not exists public.agent_run_history (
  run_key text primary key,
  source text not null default 'unknown',
  status text not null default 'running',
  note text not null default '',
  source_summary text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched_count integer,
  salesforce_count integer,
  new_jobs_count integer,
  pending_count integer,
  alerts_sent_count integer,
  error_message text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_run_history_status_started_idx
  on public.agent_run_history (status, started_at desc);

create index if not exists agent_run_history_finished_at_idx
  on public.agent_run_history (finished_at desc);
