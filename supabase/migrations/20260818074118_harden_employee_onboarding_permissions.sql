create or replace function private.complete_employee_onboarding(
  target_company_id uuid,
  target_user_id uuid,
  target_employee_code text,
  target_full_name text,
  target_work_email text,
  target_department_id uuid,
  target_position_id uuid,
  target_hire_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_tenant_id uuid;
  v_work_email text;
  v_employee_code text;
  v_auth_email text;
  v_employee_id uuid;
  v_existing_employee_code text;
  v_existing_work_email text;
  v_base_role_id uuid;
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
     and membership.is_active;

  if not found
     or not private.has_company_permission(v_tenant_id, target_company_id, 'account.invite')
     or not private.has_company_permission(v_tenant_id, target_company_id, 'employee.create') then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  v_employee_code := pg_catalog.btrim(target_employee_code);
  v_work_email := pg_catalog.lower(pg_catalog.btrim(target_work_email));
  if coalesce(v_employee_code, '') = ''
     or coalesce(pg_catalog.btrim(target_full_name), '') = ''
     or coalesce(v_work_email, '') = '' then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_INCOMPLETE';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(user_account.email))
    into v_auth_email
    from auth.users user_account
   where user_account.id = target_user_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_INCOMPLETE';
  end if;

  if v_auth_email is distinct from v_work_email then
    raise exception using errcode = 'P0001', message = 'EMPLOYEE_EMAIL_CONFLICT';
  end if;

  if not exists (
    select 1
    from public.departments department_row
    where department_row.id = target_department_id
      and department_row.tenant_id = v_tenant_id
      and department_row.company_id = target_company_id
      and department_row.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_INCOMPLETE';
  end if;

  if target_position_id is not null and not exists (
    select 1
    from public.positions position_row
    where position_row.id = target_position_id
      and position_row.tenant_id = v_tenant_id
      and position_row.company_id = target_company_id
      and position_row.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_INCOMPLETE';
  end if;

  select company_role.id
    into v_base_role_id
    from public.roles company_role
   where company_role.tenant_id = v_tenant_id
     and company_role.company_id = target_company_id
     and company_role.code = 'employee'
     and company_role.is_active;

  if not found then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_INCOMPLETE';
  end if;

  insert into public.tenant_memberships as existing_tenant_membership (user_id, tenant_id, roles)
  values (target_user_id, v_tenant_id, array['employee']::text[])
  on conflict (user_id, tenant_id) do update
    set roles = case
      when 'employee' = any (existing_tenant_membership.roles)
        then existing_tenant_membership.roles
      else pg_catalog.array_append(existing_tenant_membership.roles, 'employee')
    end;

  insert into public.company_memberships as existing_company_membership (user_id, tenant_id, company_id, roles, is_active)
  values (target_user_id, v_tenant_id, target_company_id, array['employee']::text[], true)
  on conflict (user_id, company_id) do update
    set roles = case
          when 'employee' = any (existing_company_membership.roles)
            then existing_company_membership.roles
          else pg_catalog.array_append(existing_company_membership.roles, 'employee')
        end,
        is_active = true;

  select employee.id, employee.employee_code, employee.work_email
    into v_employee_id, v_existing_employee_code, v_existing_work_email
    from public.employees employee
   where employee.company_id = target_company_id
     and employee.user_id = target_user_id
   for update;

  if found then
    if pg_catalog.lower(pg_catalog.btrim(v_existing_work_email)) <> v_work_email then
      raise exception using errcode = 'P0001', message = 'EMPLOYEE_EMAIL_CONFLICT';
    end if;
    if v_existing_employee_code <> v_employee_code then
      raise exception using errcode = 'P0001', message = 'ONBOARDING_INCOMPLETE';
    end if;
  else
    insert into public.employees (
      tenant_id,
      company_id,
      user_id,
      employee_code,
      full_name,
      work_email,
      department_id,
      position_id,
      hire_date,
      created_by
    )
    values (
      v_tenant_id,
      target_company_id,
      target_user_id,
      v_employee_code,
      pg_catalog.btrim(target_full_name),
      v_work_email,
      target_department_id,
      target_position_id,
      target_hire_date,
      v_actor_id
    )
    returning id into v_employee_id;
  end if;

  insert into public.employee_private_details (employee_id, tenant_id, company_id)
  values (v_employee_id, v_tenant_id, target_company_id)
  on conflict (employee_id) do nothing;

  insert into public.company_role_assignments (
    tenant_id,
    company_id,
    user_id,
    role_id,
    granted_by,
    grant_reason
  )
  values (
    v_tenant_id,
    target_company_id,
    target_user_id,
    v_base_role_id,
    v_actor_id,
    'employee onboarding'
  )
  on conflict (tenant_id, company_id, user_id, role_id) where revoked_at is null do nothing;

  return v_employee_id;
end;
$$;

create or replace function public.complete_employee_onboarding(
  target_company_id uuid,
  target_user_id uuid,
  target_employee_code text,
  target_full_name text,
  target_work_email text,
  target_department_id uuid,
  target_position_id uuid default null,
  target_hire_date date default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.complete_employee_onboarding(
    target_company_id,
    target_user_id,
    target_employee_code,
    target_full_name,
    target_work_email,
    target_department_id,
    target_position_id,
    target_hire_date
  );
$$;

revoke all on function private.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) from public, anon, authenticated;
grant execute on function private.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) to authenticated;
revoke all on function public.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) from public, anon;
grant execute on function public.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) to authenticated;
