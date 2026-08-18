alter table public.employees
  add column termination_date date,
  add column termination_reason text,
  add constraint employees_termination_metadata_check check (
    (termination_date is null and termination_reason is null)
    or (termination_date is not null and btrim(termination_reason) <> '')
  );

create unique index audit_events_offboarding_auth_failure_once
  on public.audit_events (
    tenant_id,
    company_id,
    actor_id,
    action,
    resource_type,
    resource_id
  )
  where action = 'employee.offboarding_auth_disable_failed';

create or replace function private.offboard_employee(
  target_company_id uuid,
  target_employee_id uuid,
  target_reason text
)
returns table (employee_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_tenant_id uuid;
  v_target_user_id uuid;
  v_target_status text;
  v_reason text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select membership.tenant_id
    into v_tenant_id
    from public.company_memberships membership
   where membership.company_id = target_company_id
     and membership.user_id = v_actor_id
     and membership.is_active
   for key share;

  if not found
     or not private.has_company_permission(v_tenant_id, target_company_id, 'employee.offboard')
     or not private.has_company_permission(v_tenant_id, target_company_id, 'account.disable') then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  v_reason := pg_catalog.btrim(target_reason);
  if coalesce(v_reason, '') = '' then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_tenant_id::text || ':' || target_company_id::text || ':' || target_employee_id::text || ':offboard',
      0
    )
  );

  select employee.user_id, employee.employment_status
    into v_target_user_id, v_target_status
    from public.employees employee
   where employee.id = target_employee_id
     and employee.tenant_id = v_tenant_id
     and employee.company_id = target_company_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_NOT_FOUND';
  end if;
  if v_target_user_id = v_actor_id then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  if v_target_status = 'terminated' then
    return query select target_employee_id, v_target_user_id;
    return;
  end if;

  perform assignment.id
    from public.company_role_assignments assignment
   where assignment.tenant_id = v_tenant_id
     and assignment.company_id = target_company_id
     and assignment.user_id = v_target_user_id
     and assignment.revoked_at is null
   order by assignment.id
   for update;

  update public.company_role_assignments assignment
     set revoked_by = v_actor_id,
         revoked_at = pg_catalog.now(),
         revoke_reason = v_reason
   where assignment.tenant_id = v_tenant_id
     and assignment.company_id = target_company_id
     and assignment.user_id = v_target_user_id
     and assignment.revoked_at is null;

  update public.employees employee
     set employment_status = 'terminated',
         termination_date = current_date,
         termination_reason = v_reason
   where employee.id = target_employee_id
     and employee.tenant_id = v_tenant_id
     and employee.company_id = target_company_id;

  update public.company_memberships membership
     set is_active = false
   where membership.tenant_id = v_tenant_id
     and membership.company_id = target_company_id
     and membership.user_id = v_target_user_id;

  return query select target_employee_id, v_target_user_id;
end;
$$;

create or replace function public.offboard_employee(
  target_company_id uuid,
  target_employee_id uuid,
  target_reason text
)
returns table (employee_id uuid, user_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select * from private.offboard_employee(
    target_company_id,
    target_employee_id,
    target_reason
  );
$$;

create or replace function private.record_employee_offboarding_auth_failure(
  target_company_id uuid,
  target_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_tenant_id uuid;
  v_target_user_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select membership.tenant_id
    into v_tenant_id
    from public.company_memberships membership
   where membership.company_id = target_company_id
     and membership.user_id = v_actor_id
     and membership.is_active
   for key share;

  if not found
     or not private.has_company_permission(v_tenant_id, target_company_id, 'employee.offboard')
     or not private.has_company_permission(v_tenant_id, target_company_id, 'account.disable') then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select employee.user_id
    into v_target_user_id
    from public.employees employee
   where employee.id = target_employee_id
     and employee.tenant_id = v_tenant_id
     and employee.company_id = target_company_id
     and employee.employment_status = 'terminated'
   for key share;

  if not found or v_target_user_id = v_actor_id then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  insert into public.audit_events (
    tenant_id,
    company_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    request_id,
    after_summary
  )
  values (
    v_tenant_id,
    target_company_id,
    v_actor_id,
    'employee.offboarding_auth_disable_failed',
    'employee',
    target_employee_id::text,
    pg_catalog.gen_random_uuid(),
    '{"auth_disable":"failed"}'::jsonb
  )
  on conflict (tenant_id, company_id, actor_id, action, resource_type, resource_id)
    where action = 'employee.offboarding_auth_disable_failed'
    do nothing;
end;
$$;

create or replace function public.record_employee_offboarding_auth_failure(
  target_company_id uuid,
  target_employee_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.record_employee_offboarding_auth_failure(
    target_company_id,
    target_employee_id
  );
$$;

revoke all on function private.offboard_employee(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.offboard_employee(uuid, uuid, text) to authenticated;
revoke all on function public.offboard_employee(uuid, uuid, text) from public, anon;
grant execute on function public.offboard_employee(uuid, uuid, text) to authenticated;

revoke all on function private.record_employee_offboarding_auth_failure(uuid, uuid) from public, anon, authenticated;
grant execute on function private.record_employee_offboarding_auth_failure(uuid, uuid) to authenticated;
revoke all on function public.record_employee_offboarding_auth_failure(uuid, uuid) from public, anon;
grant execute on function public.record_employee_offboarding_auth_failure(uuid, uuid) to authenticated;
