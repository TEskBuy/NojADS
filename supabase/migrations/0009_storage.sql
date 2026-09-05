-- NojAds :: 0009_storage
-- Buckets and object policies. Object paths are always
--   clients/{clientId}/{area}/{filename}
-- so the second path segment is the tenancy key the policies check.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('client-logos',   'client-logos',   true,  10485760,  array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('client-content', 'client-content', false, 104857600, null),
  ('client-videos',  'client-videos',  false, 524288000, array['video/mp4','video/quicktime','video/webm']),
  ('client-ads',     'client-ads',     false, 104857600, null),
  ('invoices',       'invoices',       false, 20971520,  array['application/pdf'])
on conflict (id) do nothing;

-- Extracts the client id from clients/{uuid}/...
create or replace function public.storage_client_id(object_name text)
returns uuid language plpgsql immutable as $$
declare
  parts text[];
begin
  parts := string_to_array(object_name, '/');
  if array_length(parts,1) < 2 or parts[1] <> 'clients' then
    return null;
  end if;
  begin
    return parts[2]::uuid;
  exception when others then
    return null;
  end;
end $$;

create policy nojads_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('client-logos','client-content','client-videos','client-ads','invoices')
    and public.has_client_access(public.storage_client_id(name))
  );

create policy nojads_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('client-logos','client-content','client-videos','client-ads')
    and public.can_write_client(public.storage_client_id(name))
  );

create policy nojads_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('client-logos','client-content','client-videos','client-ads')
    and public.can_write_client(public.storage_client_id(name))
  );

create policy nojads_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('client-logos','client-content','client-videos','client-ads')
    and public.can_write_client(public.storage_client_id(name))
  );
