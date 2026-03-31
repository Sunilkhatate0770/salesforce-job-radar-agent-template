-- Starter ATS board seeds for safe rollout.
-- Strong India / remote Lever boards are promoted to `live`.
-- Broader Greenhouse / Ashby boards stay in `shadow` until coverage proves useful.

insert into public.ats_board_registry (
  provider,
  company,
  board_key,
  careers_url,
  geo_scope,
  priority,
  mode,
  active,
  metadata
) values
  (
    'lever',
    'Smart Working',
    'smart-working-solutions',
    'https://jobs.lever.co/smart-working-solutions',
    'india_remote',
    96,
    'live',
    true,
    jsonb_build_object('notes', 'Remote India Salesforce roles observed')
  ),
  (
    'lever',
    'AHEAD',
    'thinkahead',
    'https://jobs.lever.co/thinkahead',
    'india_remote',
    94,
    'live',
    true,
    jsonb_build_object('notes', 'Hyderabad / India Salesforce admin roles observed')
  ),
  (
    'lever',
    'Teikametrics',
    'teikametrics',
    'https://jobs.lever.co/teikametrics',
    'india_remote',
    82,
    'shadow',
    true,
    jsonb_build_object('notes', 'Keep shadow until India Salesforce roles recur')
  ),
  (
    'greenhouse',
    '6sense',
    '6sense',
    'https://boards.greenhouse.io/6sense',
    'india_remote',
    80,
    'shadow',
    true,
    jsonb_build_object('notes', 'India remote revenue / systems board, validate before promotion')
  ),
  (
    'greenhouse',
    'Netskope',
    'Netskope',
    'https://boards.greenhouse.io/Netskope',
    'india_remote',
    78,
    'shadow',
    true,
    jsonb_build_object('notes', 'India board with business applications signal, still validating Salesforce relevance')
  ),
  (
    'greenhouse',
    'LogicMonitor',
    'logicmonitor',
    'https://boards.greenhouse.io/logicmonitor',
    'india_remote',
    74,
    'shadow',
    true,
    jsonb_build_object('notes', 'Shadow until Salesforce / CPQ roles prove current')
  ),
  (
    'greenhouse',
    'Okta',
    'okta',
    'https://boards.greenhouse.io/okta',
    'india_remote',
    72,
    'live',
    true,
    jsonb_build_object('notes', 'Promoted after India Salesforce developer geo-fit probe')
  ),
  (
    'greenhouse',
    'Kaseya',
    'kaseya',
    'https://boards.greenhouse.io/kaseya',
    'india_remote',
    71,
    'shadow',
    true,
    jsonb_build_object('notes', 'Shadow until Salesforce engineering roles recur')
  ),
  (
    'greenhouse',
    'Mitratech',
    'mitratech',
    'https://boards.greenhouse.io/mitratech',
    'india_remote',
    70,
    'shadow',
    true,
    jsonb_build_object('notes', 'Historically relevant Salesforce solution roles, validate freshness')
  ),
  (
    'ashby',
    'Weave',
    'weave',
    'https://jobs.ashbyhq.com/weave',
    'india_remote',
    66,
    'shadow',
    true,
    jsonb_build_object('notes', 'Strong Salesforce board but currently Mexico-heavy')
  ),
  (
    'ashby',
    'Vanta',
    'vanta',
    'https://jobs.ashbyhq.com/vanta',
    'india_remote',
    64,
    'shadow',
    true,
    jsonb_build_object('notes', 'Strong Salesforce engineering signal, keep shadow until geo fit improves')
  ),
  (
    'ashby',
    'Abby Care',
    'abby-care',
    'https://jobs.ashbyhq.com/abby-care',
    'india_remote',
    60,
    'shadow',
    true,
    jsonb_build_object('notes', 'RevOps / Salesforce signal, shadow only for now')
  )
on conflict (provider, board_key) do update
set
  company = excluded.company,
  careers_url = excluded.careers_url,
  geo_scope = excluded.geo_scope,
  priority = excluded.priority,
  mode = excluded.mode,
  active = excluded.active,
  metadata = excluded.metadata,
  updated_at = now();
