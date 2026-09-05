-- NojAds :: 0010_hardening
-- Pin search_path on every function and take the internal SECURITY DEFINER
-- helpers off the PostgREST surface. Only is_admin/is_staff/has_client_access/
-- can_write_client stay callable, because RLS policies evaluate them as the
-- calling role.

alter function public.touch_updated_at()      set search_path = public;
alter function public.storage_client_id(text) set search_path = public;

revoke execute on function public.claim_jobs(text, text[], int)  from anon, authenticated;
revoke execute on function public.reap_stalled_jobs()            from anon, authenticated;
revoke execute on function public.handle_new_user()              from anon, authenticated;
revoke execute on function public.guard_profile_role()           from anon, authenticated;
revoke execute on function public.current_role_of(uuid)          from anon, authenticated;

revoke execute on function public.is_admin()                     from anon;
revoke execute on function public.is_staff()                     from anon;
revoke execute on function public.has_client_access(uuid)        from anon;
revoke execute on function public.can_write_client(uuid)         from anon;

-- Seed the integration registry so the UI can show, per provider, whether
-- this deployment has actually been configured. No secrets live here.
insert into public.integration_settings (provider, is_configured, api_version, notes) values
  ('META',     false, 'v21.0', 'Facebook + Instagram (Graph API e Marketing API).'),
  ('TIKTOK',   false, null,    'TikTok Business API. Requer app aprovado.'),
  ('YOUTUBE',  false, 'v3',    'YouTube Data API via Google Cloud.'),
  ('LINKEDIN', false, null,    'LinkedIn Marketing Developer Platform. Requer aprovacao.'),
  ('X',        false, 'v2',    'X API v2. Publicacao depende do plano contratado.'),
  ('GOOGLE',   false, null,    'Google Ads API. Requer developer token aprovado.'),
  ('STRIPE',   false, null,    'Gateway de pagamento para taxas NojAds e top-ups.'),
  ('ANTHROPIC',false, null,    'Provider de IA.'),
  ('OPENAI',   false, null,    'Provider de IA alternativo.')
on conflict (provider) do nothing;

insert into public.app_settings (key, value, description) values
  ('platform_capabilities_version', '"1"'::jsonb, 'Versao do registry de capacidades das plataformas.'),
  ('nojads_fee_percent', '0'::jsonb, 'Taxa NojAds aplicada sobre o gasto publicitario, em percentagem.')
on conflict (key) do nothing;
