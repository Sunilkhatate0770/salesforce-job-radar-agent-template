update public.ats_board_registry
set
  mode = 'live',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'promoted_at', now(),
    'promotion_reason', 'Geo-fit probe found India Salesforce Developer coverage'
  ),
  updated_at = now()
where provider = 'greenhouse'
  and board_key = 'okta'
  and active = true;
