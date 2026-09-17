-- NojAds :: 0008_rls
-- Row Level Security for every public table.
--
-- Three access tiers:
--   A  read = client access, write = client write access
--   B  read = client access, write = service role only (written by workers)
--   C  read = staff + client access, write = service role only (money)
-- Tables not listed (queue, oauth state, webhook inboxes, token vault) get
-- RLS with no permissive policy at all: only the service role reaches them.

alter table public.profiles          enable row level security;
alter table public.clients           enable row level security;
alter table public.client_members    enable row level security;
alter table public.oauth_states      enable row level security;
alter table public.social_tokens     enable row level security;
alter table public.jobs              enable row level security;
alter table public.scheduled_jobs    enable row level security;
alter table public.webhook_events    enable row level security;
alter table public.billing_events    enable row level security;
alter table public.content_versions  enable row level security;
alter table public.integration_settings enable row level security;
alter table public.app_settings      enable row level security;

-- ------------------------------------------------------------- profiles
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A user may edit their own profile but never their own role.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Apenas um ADMIN pode alterar o papel de um utilizador.'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- -------------------------------------------------------------- clients
create policy clients_select on public.clients
  for select to authenticated
  using (public.has_client_access(id));

create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.is_staff());

create policy clients_update on public.clients
  for update to authenticated
  using (public.can_write_client(id)) with check (public.can_write_client(id));

create policy clients_delete on public.clients
  for delete to authenticated
  using (public.is_admin());

create policy client_members_select on public.client_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy client_members_admin on public.client_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------ generated table policies
do $$
declare
  t text;
  tier_a text[] := array['brand_settings','social_accounts','ad_accounts','tasks',
                         'content','content_assets','audiences','creatives',
                         'ad_campaigns','ad_sets','ads','approvals'];
  tier_b text[] := array['task_runs','publishing_jobs','analytics','ai_generations',
                         'reports','activity_logs','notifications'];
  tier_c text[] := array['billing_accounts','payment_customers','payment_methods',
                         'payment_transactions','invoices','refunds','spend_limits'];
begin
  foreach t in array tier_a loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
                      using (public.has_client_access(client_id))$f$, t);
    execute format($f$create policy %1$s_insert on public.%1$I for insert to authenticated
                      with check (public.can_write_client(client_id))$f$, t);
    execute format($f$create policy %1$s_update on public.%1$I for update to authenticated
                      using (public.can_write_client(client_id))
                      with check (public.can_write_client(client_id))$f$, t);
    execute format($f$create policy %1$s_delete on public.%1$I for delete to authenticated
                      using (public.can_write_client(client_id))$f$, t);
  end loop;

  foreach t in array tier_b loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
                      using (client_id is null or public.has_client_access(client_id))$f$, t);
  end loop;

  foreach t in array tier_c loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %1$s_select on public.%1$I for select to authenticated
                      using (public.is_staff() and public.has_client_access(client_id))$f$, t);
  end loop;
end $$;

-- Notifications are addressed to a person: they only ever see their own.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or (user_id is null and public.has_client_access(client_id)));

create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Activity logs: staff-only, scoped to reachable clients.
drop policy if exists activity_logs_select on public.activity_logs;
create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (public.is_staff() and (client_id is null or public.has_client_access(client_id)));

-- Content versions inherit access from their parent content row.
create policy content_versions_select on public.content_versions
  for select to authenticated
  using (exists (select 1 from public.content c
                  where c.id = content_id and public.has_client_access(c.client_id)));

-- Observability for admins over the queue; writes stay with the service role.
create policy jobs_admin_read on public.jobs
  for select to authenticated using (public.is_admin());
create policy scheduled_jobs_admin_read on public.scheduled_jobs
  for select to authenticated using (public.is_admin());
create policy webhook_events_admin_read on public.webhook_events
  for select to authenticated using (public.is_admin());
create policy billing_events_admin_read on public.billing_events
  for select to authenticated using (public.is_admin());
create policy integration_settings_read on public.integration_settings
  for select to authenticated using (public.is_staff());
create policy app_settings_admin on public.app_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- social_tokens and oauth_states deliberately have NO policy.
-- Nothing holding an end-user JWT can read a token, in any role.

revoke all on public.social_tokens from anon, authenticated;
revoke all on public.oauth_states  from anon, authenticated;
