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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Observed India remote Salesforce architect roles'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Observed Hyderabad / India Salesforce administrator roles'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Keep shadow until India Salesforce roles recur'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'High-value revenue systems board; validate before promotion'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'India business applications signal; validate Salesforce relevance first'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Shadow until Salesforce / CPQ roles prove current'
    )
  ),
  (
    'greenhouse',
    'Okta',
    'okta',
    'https://boards.greenhouse.io/okta',
    'india_remote',
    72,
    'shadow',
    true,
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Large ATS board; keep discovery-only for now'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Shadow until Salesforce engineering roles recur'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Historically relevant Salesforce solution roles; validate freshness'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Strong Salesforce board but current geo fit is weaker'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'Strong Salesforce engineering signal; keep shadow pending India/remote fit'
    )
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
    jsonb_build_object(
      'seed_version', 'starter_v1',
      'reason', 'RevOps / Salesforce signal; shadow-only for now'
    )
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
