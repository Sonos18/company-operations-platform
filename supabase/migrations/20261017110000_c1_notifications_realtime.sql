set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 64);

-- Notification center realtime (spec 2026-10-17 notification realtime).
--   * Publishes the two notification tables through supabase_realtime so the bell can refresh
--     as soon as a row arrives. Realtime only carries the signal; the list is still loaded
--     through the existing reads, so RLS on both tables keeps deciding what the user sees.
--     A table that is already published is skipped, which makes the migration safe to rerun.
--     A project without the publication fails loudly instead of silently not publishing.
--   * The order-created notification names the user who created the order (actorName), the
--     same display name rule as the proposal notifications: employee name, else sign-in email.
--     Recipients, link, dedupe key and summary are unchanged, and the deferred constraint
--     trigger on material_orders is left as it is.

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception using errcode = 'P0001', message = 'REALTIME_PUBLICATION_MISSING';
  end if;
  foreach v_table in array array['app_notifications', 'cost_workflow_notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

-- Latest definition is 20261017090100; only the actorName key is new. create or replace keeps
-- the grants of the function, which stay revoked from every API role.
create or replace function private.c1_material_notify_order_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_supplier_name text;
begin
  select party.display_name into v_supplier_name from public.business_parties as party
  where party.id = new.supplier_id and party.tenant_id = new.tenant_id and party.company_id = new.company_id;
  perform private.c1_material_notify_permission(
    new.tenant_id, new.company_id, new.project_id, 'material.contract.record',
    'material.order.created', 'material_order', new.id,
    '/materials/' || new.project_id::text || '/orders/' || new.id::text,
    jsonb_build_object(
      'supplierName', v_supplier_name,
      'actorName', private.c1_material_user_display_name(new.tenant_id, new.company_id, new.created_by)
    ) || private.c1_material_summary_payload(private.c1_material_order_summary(new.id)),
    'order:' || new.id::text
  );
  return null;
end;
$$;

notify pgrst, 'reload schema';
