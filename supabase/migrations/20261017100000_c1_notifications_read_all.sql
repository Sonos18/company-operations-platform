set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 63);

-- Notification center: one command that marks the signed-in user's notifications read in both
-- sources (spec 2026-10-17 notification center, section 6).
--   * Each source has its own cutoff. Only notifications created at or before the cutoff are
--     marked, so anything that arrived after the list was loaded stays unread. A null cutoff
--     skips that source (the source failed to load, or had nothing to show).
--   * Material notifications (app_notifications) need material.read. Cost approval
--     notifications (cost_workflow_notifications) need cost.notification.read and only the
--     'available' ones are touched; 'undelivered' rows were never shown to the user.
--   * Only the caller's own rows in the given company are ever updated.
--   * Marking read is idempotent by itself (read_at is null in the filter), so there is no
--     command receipt. Returns the number of rows marked in each source.

create function private.c1_mark_notifications_read_all(target_company_id uuid, target_material_up_to timestamptz, target_cost_up_to timestamptz)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tenant uuid;
  v_material bigint := 0;
  v_cost bigint := 0;
begin
  select company.tenant_id into v_tenant
  from public.companies as company where company.id = target_company_id;
  if auth.uid() is null or v_tenant is null or not exists (
    select 1 from public.company_memberships as membership
    where membership.user_id = auth.uid() and membership.company_id = target_company_id and membership.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  if target_material_up_to is not null
    and private.c1_workflow_user_has_permission(v_tenant, target_company_id, auth.uid(), 'material.read')
  then
    update public.app_notifications as notification
    set read_at = now()
    where notification.recipient_id = auth.uid()
      and notification.company_id = target_company_id
      and notification.read_at is null
      and notification.created_at <= target_material_up_to;
    get diagnostics v_material = row_count;
  end if;

  if target_cost_up_to is not null
    and private.c1_workflow_user_has_permission(v_tenant, target_company_id, auth.uid(), 'cost.notification.read')
  then
    update public.cost_workflow_notifications as notification
    set read_at = now()
    where notification.recipient_id = auth.uid()
      and notification.tenant_id = v_tenant
      and notification.company_id = target_company_id
      and notification.delivery_state = 'available'
      and notification.read_at is null
      and notification.created_at <= target_cost_up_to;
    get diagnostics v_cost = row_count;
  end if;

  return jsonb_build_object('material', v_material, 'cost', v_cost);
end;
$$;

create function public.c1_mark_notifications_read_all(target_company_id uuid, target_material_up_to timestamptz, target_cost_up_to timestamptz)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.c1_mark_notifications_read_all(target_company_id, target_material_up_to, target_cost_up_to);
$$;

revoke all on function private.c1_mark_notifications_read_all(uuid, timestamptz, timestamptz)
from public, anon, authenticated, service_role;

revoke all on function public.c1_mark_notifications_read_all(uuid, timestamptz, timestamptz)
from public, anon, authenticated, service_role;

grant execute on function public.c1_mark_notifications_read_all(uuid, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';
