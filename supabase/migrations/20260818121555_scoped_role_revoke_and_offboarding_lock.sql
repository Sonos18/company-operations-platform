create or replace function private.revoke_company_role_assignment_scoped(
  target_company_id uuid,
  target_assignment_id bigint,
  target_revoke_reason text
)
returns public.company_role_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_tenant_id uuid;
  v_assignment_id bigint;
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
     or not private.has_company_permission(v_tenant_id, target_company_id, 'role.revoke') then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  select assignment.id
    into v_assignment_id
    from public.company_role_assignments assignment
   where assignment.id = target_assignment_id
     and assignment.tenant_id = v_tenant_id
     and assignment.company_id = target_company_id
     and assignment.revoked_at is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  return private.revoke_company_role_assignment(v_assignment_id, target_revoke_reason);
end;
$$;

create or replace function public.revoke_company_role_assignment_scoped(
  target_company_id uuid,
  target_assignment_id bigint,
  target_revoke_reason text
)
returns public.company_role_assignments
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_company_role_assignment_scoped(
    target_company_id,
    target_assignment_id,
    target_revoke_reason
  );
$$;

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
      v_tenant_id::text || ':' || target_company_id::text || ':company_admin',
      0
    )
  );
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

revoke all on function private.revoke_company_role_assignment_scoped(uuid, bigint, text) from public, anon, authenticated;
grant execute on function private.revoke_company_role_assignment_scoped(uuid, bigint, text) to authenticated;
revoke all on function public.revoke_company_role_assignment_scoped(uuid, bigint, text) from public, anon;
grant execute on function public.revoke_company_role_assignment_scoped(uuid, bigint, text) to authenticated;

revoke all on function private.offboard_employee(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.offboard_employee(uuid, uuid, text) to authenticated;
