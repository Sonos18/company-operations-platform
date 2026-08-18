alter table public.company_memberships
  add column is_active boolean not null default true,
  add constraint company_memberships_scope_user_key
    unique (tenant_id, company_id, user_id);

create index company_memberships_active_scope_user_idx
  on public.company_memberships (tenant_id, company_id, user_id)
  where is_active;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete cascade,
  constraint departments_code_not_blank check (btrim(code) <> ''),
  constraint departments_name_not_blank check (btrim(name) <> ''),
  constraint departments_company_code_key unique (company_id, code),
  constraint departments_id_tenant_company_key unique (id, tenant_id, company_id)
);

create index departments_scope_active_name_idx
  on public.departments (tenant_id, company_id, is_active, name);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  code text not null,
  name text not null,
  level smallint,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positions_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete cascade,
  constraint positions_code_not_blank check (btrim(code) <> ''),
  constraint positions_name_not_blank check (btrim(name) <> ''),
  constraint positions_level_positive check (level is null or level > 0),
  constraint positions_company_code_key unique (company_id, code),
  constraint positions_id_tenant_company_key unique (id, tenant_id, company_id)
);

create index positions_scope_active_name_idx
  on public.positions (tenant_id, company_id, is_active, name);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  employee_code text not null,
  full_name text not null,
  work_email text not null,
  department_id uuid not null,
  position_id uuid,
  manager_employee_id uuid,
  hire_date date,
  probation_end_date date,
  employment_status text not null default 'active',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employees_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete cascade,
  constraint employees_membership_fk foreign key (tenant_id, company_id, user_id)
    references public.company_memberships (tenant_id, company_id, user_id) on delete restrict,
  constraint employees_department_fk foreign key (tenant_id, company_id, department_id)
    references public.departments (tenant_id, company_id, id) on delete restrict,
  constraint employees_position_fk foreign key (tenant_id, company_id, position_id)
    references public.positions (tenant_id, company_id, id) on delete restrict,
  constraint employees_manager_fk foreign key (tenant_id, company_id, manager_employee_id)
    references public.employees (tenant_id, company_id, id) on delete restrict,
  constraint employees_code_not_blank check (btrim(employee_code) <> ''),
  constraint employees_name_not_blank check (btrim(full_name) <> ''),
  constraint employees_work_email_not_blank check (btrim(work_email) <> ''),
  constraint employees_employment_status_check
    check (employment_status in ('probation', 'active', 'on_leave', 'terminated')),
  constraint employees_probation_after_hire_check
    check (probation_end_date is null or hire_date is null or probation_end_date >= hire_date),
  constraint employees_manager_not_self_check
    check (manager_employee_id is null or manager_employee_id <> id),
  constraint employees_company_user_key unique (company_id, user_id),
  constraint employees_company_employee_code_key unique (company_id, employee_code),
  constraint employees_id_tenant_company_key unique (id, tenant_id, company_id)
);

create unique index employees_company_work_email_key
  on public.employees (company_id, lower(work_email));
create index employees_scope_status_name_idx
  on public.employees (tenant_id, company_id, employment_status, full_name);
create index employees_department_scope_idx
  on public.employees (tenant_id, company_id, department_id);
create index employees_position_scope_idx
  on public.employees (tenant_id, company_id, position_id);
create index employees_manager_scope_idx
  on public.employees (tenant_id, company_id, manager_employee_id);
create index employees_user_id_idx
  on public.employees (user_id);

create table public.employee_private_details (
  employee_id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  date_of_birth date,
  gender text,
  personal_email text,
  personal_phone text,
  current_address text,
  permanent_address text,
  tax_code text,
  social_insurance_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_private_details_employee_fk foreign key (tenant_id, company_id, employee_id)
    references public.employees (tenant_id, company_id, id) on delete cascade,
  constraint employee_private_details_gender_check
    check (gender is null or gender in ('female', 'male', 'other', 'undisclosed')),
  constraint employee_private_details_personal_email_not_blank
    check (personal_email is null or btrim(personal_email) <> '')
);

create index employee_private_details_scope_employee_idx
  on public.employee_private_details (tenant_id, company_id, employee_id);
create unique index employee_private_details_company_tax_code_key
  on public.employee_private_details (company_id, tax_code)
  where tax_code is not null;
create unique index employee_private_details_company_social_insurance_number_key
  on public.employee_private_details (company_id, social_insurance_number)
  where social_insurance_number is not null;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  code text not null,
  name text not null,
  description text not null,
  is_privileged boolean not null default false,
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_company_fk foreign key (company_id, tenant_id)
    references public.companies (id, tenant_id) on delete cascade,
  constraint roles_code_not_blank check (btrim(code) <> ''),
  constraint roles_name_not_blank check (btrim(name) <> ''),
  constraint roles_company_code_key unique (company_id, code),
  constraint roles_id_tenant_company_key unique (id, tenant_id, company_id)
);

create index roles_scope_active_code_idx
  on public.roles (tenant_id, company_id, is_active, code);

create table public.permissions (
  code text primary key,
  module text not null,
  name text not null,
  description text not null,
  created_at timestamptz not null default now(),
  constraint permissions_code_not_blank check (btrim(code) <> ''),
  constraint permissions_module_not_blank check (btrim(module) <> ''),
  constraint permissions_name_not_blank check (btrim(name) <> '')
);

create index permissions_module_code_idx
  on public.permissions (module, code);

create table public.role_permissions (
  role_id uuid not null,
  permission_code text not null,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_code),
  constraint role_permissions_role_fk foreign key (role_id)
    references public.roles (id) on delete restrict,
  constraint role_permissions_permission_fk foreign key (permission_code)
    references public.permissions (code) on delete restrict
);

create index role_permissions_permission_code_idx
  on public.role_permissions (permission_code);

create table public.company_role_assignments (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  user_id uuid not null,
  role_id uuid not null,
  granted_by uuid not null references auth.users (id) on delete restrict,
  granted_at timestamptz not null default now(),
  grant_reason text not null,
  revoked_by uuid references auth.users (id) on delete restrict,
  revoked_at timestamptz,
  revoke_reason text,
  constraint company_role_assignments_membership_fk foreign key (tenant_id, company_id, user_id)
    references public.company_memberships (tenant_id, company_id, user_id) on delete restrict,
  constraint company_role_assignments_role_fk foreign key (tenant_id, company_id, role_id)
    references public.roles (tenant_id, company_id, id) on delete restrict,
  constraint company_role_assignments_grant_reason_not_blank check (btrim(grant_reason) <> ''),
  constraint company_role_assignments_revocation_check check (
    (revoked_by is null and revoked_at is null and revoke_reason is null)
    or (revoked_by is not null and revoked_at is not null and revoke_reason is not null and revoked_at >= granted_at)
  )
);

create unique index company_role_assignments_one_active
  on public.company_role_assignments (tenant_id, company_id, user_id, role_id)
  where revoked_at is null;
create index company_role_assignments_permission_lookup
  on public.company_role_assignments (tenant_id, company_id, user_id)
  where revoked_at is null;
create index company_role_assignments_role_revoked_idx
  on public.company_role_assignments (role_id, revoked_at);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger departments_set_updated_at
  before update on public.departments
  for each row execute function public.set_updated_at();
create trigger positions_set_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();
create trigger employees_set_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();
create trigger employee_private_details_set_updated_at
  before update on public.employee_private_details
  for each row execute function public.set_updated_at();
create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;
alter table public.employee_private_details enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.company_role_assignments enable row level security;

revoke all on table public.departments, public.positions, public.employees,
  public.employee_private_details, public.roles, public.permissions,
  public.role_permissions, public.company_role_assignments from anon, authenticated;

-- Elevated implementations stay in the unexposed private schema.  The public
-- routines below are security-invoker RPC wrappers with narrowly granted
-- EXECUTE privileges; no public routine is security definer.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.user_id = auth.uid()
      and membership.tenant_id = target_tenant_id
  );
$$;

create or replace function private.is_company_member(
  target_tenant_id uuid,
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = auth.uid()
      and membership.tenant_id = target_tenant_id
      and membership.company_id = target_company_id
      and membership.is_active
  );
$$;

create or replace function private.has_any_active_company_membership()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = auth.uid()
      and membership.is_active
  );
$$;

create or replace function private.is_own_employee_record(
  target_employee_id uuid,
  target_tenant_id uuid,
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees employee
    join public.company_memberships membership
      on membership.tenant_id = employee.tenant_id
     and membership.company_id = employee.company_id
     and membership.user_id = employee.user_id
     and membership.is_active
    where employee.id = target_employee_id
      and employee.tenant_id = target_tenant_id
      and employee.company_id = target_company_id
      and employee.user_id = auth.uid()
  );
$$;

create or replace function private.is_active_employee_directory_record(
  target_employee_id uuid,
  target_tenant_id uuid,
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees employee
    join public.company_memberships membership
      on membership.tenant_id = employee.tenant_id
     and membership.company_id = employee.company_id
     and membership.user_id = employee.user_id
     and membership.is_active
    join public.company_role_assignments assignment
      on assignment.tenant_id = employee.tenant_id
     and assignment.company_id = employee.company_id
     and assignment.user_id = employee.user_id
     and assignment.revoked_at is null
    join public.roles base_role
      on base_role.id = assignment.role_id
     and base_role.tenant_id = assignment.tenant_id
     and base_role.company_id = assignment.company_id
     and base_role.code = 'employee'
     and base_role.is_active
    where employee.id = target_employee_id
      and employee.tenant_id = target_tenant_id
      and employee.company_id = target_company_id
  );
$$;

create or replace function private.has_company_permission(
  target_tenant_id uuid,
  target_company_id uuid,
  target_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.company_role_assignments assignment
      on assignment.tenant_id = membership.tenant_id
     and assignment.company_id = membership.company_id
     and assignment.user_id = membership.user_id
     and assignment.revoked_at is null
    join public.roles assigned_role
      on assigned_role.id = assignment.role_id
     and assigned_role.tenant_id = assignment.tenant_id
     and assigned_role.company_id = assignment.company_id
     and assigned_role.is_active
    join public.role_permissions role_permission
      on role_permission.role_id = assignment.role_id
    join public.permissions permission
      on permission.code = role_permission.permission_code
    where membership.tenant_id = target_tenant_id
      and membership.company_id = target_company_id
      and membership.user_id = auth.uid()
      and membership.is_active
      and permission.code = target_permission
  );
$$;

create or replace function private.get_my_company_access(target_company_id uuid)
returns table (roles text[], permissions text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select pg_catalog.array_agg(role_codes.code order by role_codes.code)
      from (
        select distinct assigned_role.code
        from public.company_role_assignments assignment
        join public.roles assigned_role
          on assigned_role.id = assignment.role_id
         and assigned_role.tenant_id = assignment.tenant_id
         and assigned_role.company_id = assignment.company_id
         and assigned_role.is_active
        where assignment.tenant_id = membership.tenant_id
          and assignment.company_id = membership.company_id
          and assignment.user_id = membership.user_id
          and assignment.revoked_at is null
      ) role_codes
    ), '{}'::text[]),
    coalesce((
      select pg_catalog.array_agg(permission_codes.code order by permission_codes.code)
      from (
        select distinct permission.code
        from public.company_role_assignments assignment
        join public.roles assigned_role
          on assigned_role.id = assignment.role_id
         and assigned_role.tenant_id = assignment.tenant_id
         and assigned_role.company_id = assignment.company_id
         and assigned_role.is_active
        join public.role_permissions role_permission
          on role_permission.role_id = assignment.role_id
        join public.permissions permission
          on permission.code = role_permission.permission_code
        where assignment.tenant_id = membership.tenant_id
          and assignment.company_id = membership.company_id
          and assignment.user_id = membership.user_id
          and assignment.revoked_at is null
      ) permission_codes
    ), '{}'::text[])
  from public.company_memberships membership
  where membership.user_id = auth.uid()
    and membership.company_id = target_company_id
    and membership.is_active;
$$;

create or replace function private.can_read_role_catalog(
  target_tenant_id uuid,
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_company_permission(target_tenant_id, target_company_id, 'role.read')
      or private.has_company_permission(target_tenant_id, target_company_id, 'role.assign')
      or private.has_company_permission(target_tenant_id, target_company_id, 'role.revoke');
$$;

-- Relocate legacy security-definer membership checks behind public invoker
-- wrappers so existing RLS policies retain their stable public interfaces.
create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_tenant_member(target_tenant_id);
$$;

create or replace function public.is_company_member(
  target_tenant_id uuid,
  target_company_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_company_member(target_tenant_id, target_company_id);
$$;

create or replace function public.get_my_company_access(target_company_id uuid)
returns table (roles text[], permissions text[])
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_my_company_access(target_company_id);
$$;

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

create or replace function private.grant_company_role_assignment(
  target_company_id uuid,
  target_user_id uuid,
  target_role_id uuid,
  target_grant_reason text
)
returns public.company_role_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_tenant_id uuid;
  v_assignment public.company_role_assignments%rowtype;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if target_user_id = v_actor_id then
    raise exception using errcode = 'P0001', message = 'SELF_ROLE_CHANGE_FORBIDDEN';
  end if;
  if coalesce(pg_catalog.btrim(target_grant_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'ROLE_ASSIGNMENT_CONFLICT';
  end if;

  select membership.tenant_id
    into v_tenant_id
    from public.company_memberships membership
   where membership.company_id = target_company_id
     and membership.user_id = v_actor_id
     and membership.is_active;

  if not found
     or not private.has_company_permission(v_tenant_id, target_company_id, 'role.assign') then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  if not exists (
    select 1
    from auth.users user_account
    where user_account.id = target_user_id
  ) or not exists (
    select 1
    from public.company_memberships membership
    where membership.tenant_id = v_tenant_id
      and membership.company_id = target_company_id
      and membership.user_id = target_user_id
      and membership.is_active
  ) or not exists (
    select 1
    from public.roles company_role
    where company_role.id = target_role_id
      and company_role.tenant_id = v_tenant_id
      and company_role.company_id = target_company_id
      and company_role.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_INCOMPLETE';
  end if;

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
    target_role_id,
    v_actor_id,
    pg_catalog.btrim(target_grant_reason)
  )
  on conflict (tenant_id, company_id, user_id, role_id) where revoked_at is null do nothing
  returning * into v_assignment;

  if not found then
    raise exception using errcode = 'P0001', message = 'ROLE_ASSIGNMENT_CONFLICT';
  end if;

  return v_assignment;
end;
$$;

create or replace function public.grant_company_role_assignment(
  target_company_id uuid,
  target_user_id uuid,
  target_role_id uuid,
  target_grant_reason text
)
returns public.company_role_assignments
language sql
security invoker
set search_path = ''
as $$
  select private.grant_company_role_assignment(
    target_company_id,
    target_user_id,
    target_role_id,
    target_grant_reason
  );
$$;

create or replace function private.revoke_company_role_assignment(
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
  v_assignment public.company_role_assignments%rowtype;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if coalesce(pg_catalog.btrim(target_revoke_reason), '') = '' then
    raise exception using errcode = 'P0001', message = 'ROLE_ASSIGNMENT_CONFLICT';
  end if;

  select assignment.*
    into v_assignment
    from public.company_role_assignments assignment
   where assignment.id = target_assignment_id
     and assignment.revoked_at is null;

  if not found then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;
  if v_assignment.user_id = v_actor_id then
    raise exception using errcode = 'P0001', message = 'SELF_ROLE_CHANGE_FORBIDDEN';
  end if;
  if not private.has_company_permission(
    v_assignment.tenant_id,
    v_assignment.company_id,
    'role.revoke'
  ) then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  update public.company_role_assignments assignment
     set revoked_by = v_actor_id,
         revoked_at = pg_catalog.now(),
         revoke_reason = pg_catalog.btrim(target_revoke_reason)
   where assignment.id = v_assignment.id
     and assignment.revoked_at is null
  returning * into v_assignment;

  if not found then
    raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED';
  end if;

  return v_assignment;
end;
$$;

create or replace function public.revoke_company_role_assignment(
  target_assignment_id bigint,
  target_revoke_reason text
)
returns public.company_role_assignments
language sql
security invoker
set search_path = ''
as $$
  select private.revoke_company_role_assignment(target_assignment_id, target_revoke_reason);
$$;

create or replace function private.prevent_last_company_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_code text;
  v_active_admin_count bigint;
  v_removes_admin boolean := false;
begin
  if old.revoked_at is null then
    select company_role.code
      into v_role_code
      from public.roles company_role
     where company_role.id = old.role_id
       and company_role.tenant_id = old.tenant_id
       and company_role.company_id = old.company_id;

    if v_role_code = 'company_admin' then
      if tg_op = 'DELETE' then
        v_removes_admin := true;
      elsif new.revoked_at is not null or new.role_id is distinct from old.role_id then
        v_removes_admin := true;
      end if;
    end if;
  end if;

  if v_removes_admin then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        old.tenant_id::text || ':' || old.company_id::text || ':company_admin',
        0
      )
    );

    perform assignment.id
      from public.company_role_assignments assignment
      join public.roles company_role
        on company_role.id = assignment.role_id
       and company_role.tenant_id = assignment.tenant_id
       and company_role.company_id = assignment.company_id
     where assignment.tenant_id = old.tenant_id
       and assignment.company_id = old.company_id
       and assignment.revoked_at is null
       and company_role.code = 'company_admin'
       and company_role.is_active
     order by assignment.id
     for update of assignment;

    select pg_catalog.count(*)
      into v_active_admin_count
      from public.company_role_assignments assignment
      join public.roles company_role
        on company_role.id = assignment.role_id
       and company_role.tenant_id = assignment.tenant_id
       and company_role.company_id = assignment.company_id
     where assignment.tenant_id = old.tenant_id
       and assignment.company_id = old.company_id
       and assignment.revoked_at is null
       and company_role.code = 'company_admin'
       and company_role.is_active;

    if v_active_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'LAST_COMPANY_ADMIN_REQUIRED';
    end if;
  end if;

  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'ROLE_ASSIGNMENT_HISTORY_REQUIRED';
  end if;
  return new;
end;
$$;

create trigger company_role_assignments_prevent_last_admin_removal
  before update of revoked_at, role_id or delete on public.company_role_assignments
  for each row execute function private.prevent_last_company_admin_removal();

create or replace function private.prevent_system_role_lifecycle_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active_admin_count bigint;
  v_removes_company_admin boolean := false;
begin
  if tg_op = 'UPDATE'
     and new.code is not distinct from old.code
     and new.is_active is not distinct from old.is_active
     and new.is_system is not distinct from old.is_system then
    return new;
  end if;

  if old.code = 'company_admin' and old.is_active then
    if tg_op = 'DELETE' then
      v_removes_company_admin := true;
    elsif new.code is distinct from 'company_admin' or not new.is_active then
      v_removes_company_admin := true;
    end if;
  end if;

  if v_removes_company_admin then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        old.tenant_id::text || ':' || old.company_id::text || ':company_admin',
        0
      )
    );

    perform assignment.id
      from public.company_role_assignments assignment
      join public.roles company_role
        on company_role.id = assignment.role_id
       and company_role.tenant_id = assignment.tenant_id
       and company_role.company_id = assignment.company_id
     where assignment.tenant_id = old.tenant_id
       and assignment.company_id = old.company_id
       and assignment.revoked_at is null
       and company_role.code = 'company_admin'
       and company_role.is_active
     order by assignment.id
     for update of assignment;

    select pg_catalog.count(*)
      into v_active_admin_count
      from public.company_role_assignments assignment
      join public.roles company_role
        on company_role.id = assignment.role_id
       and company_role.tenant_id = assignment.tenant_id
       and company_role.company_id = assignment.company_id
     where assignment.tenant_id = old.tenant_id
       and assignment.company_id = old.company_id
       and assignment.revoked_at is null
       and company_role.code = 'company_admin'
       and company_role.is_active;

    if v_active_admin_count <= 1 then
      raise exception using errcode = 'P0001', message = 'LAST_COMPANY_ADMIN_REQUIRED';
    end if;
  end if;

  if not old.is_system then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception using errcode = 'P0001', message = 'SYSTEM_ROLE_LIFECYCLE_FORBIDDEN';
end;
$$;

create trigger roles_prevent_system_role_lifecycle_change
  before update of code, is_active, is_system or delete on public.roles
  for each row execute function private.prevent_system_role_lifecycle_change();

create or replace function private.prevent_audit_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'AUDIT_EVENTS_APPEND_ONLY';
  return null;
end;
$$;

create trigger audit_events_prevent_mutation
  before update or delete on public.audit_events
  for each row execute function private.prevent_audit_event_mutation();

create or replace function private.audit_employee_rbac_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_tenant_id uuid;
  v_company_id uuid;
  v_resource_id text;
  v_action text;
  v_resource_type text;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_request_id uuid;
  v_headers text;
begin
  if tg_op = 'INSERT' then
    v_new := pg_catalog.to_jsonb(new);
  else
    v_new := pg_catalog.to_jsonb(new);
    v_old := pg_catalog.to_jsonb(old);
  end if;

  v_tenant_id := (v_new ->> 'tenant_id')::uuid;
  v_company_id := (v_new ->> 'company_id')::uuid;

  if tg_table_name = 'employees' then
    v_resource_id := v_new ->> 'id';
    v_resource_type := 'employee';
    if tg_op = 'INSERT' then
      v_action := 'employee.created';
    elsif (v_old ->> 'employment_status') is distinct from (v_new ->> 'employment_status') then
      v_action := 'employee.status_changed';
    else
      v_action := 'employee.updated';
    end if;
    v_before_summary := case when v_old is null then null else pg_catalog.jsonb_build_object(
      'employee_code', v_old ->> 'employee_code',
      'department_id', v_old -> 'department_id',
      'position_id', v_old -> 'position_id',
      'employment_status', v_old ->> 'employment_status'
    ) end;
    v_after_summary := pg_catalog.jsonb_build_object(
      'employee_code', v_new ->> 'employee_code',
      'department_id', v_new -> 'department_id',
      'position_id', v_new -> 'position_id',
      'employment_status', v_new ->> 'employment_status'
    );
  elsif tg_table_name = 'employee_private_details' then
    v_resource_id := v_new ->> 'employee_id';
    v_resource_type := 'employee_private_details';
    v_action := case when tg_op = 'INSERT' then 'employee.private_created' else 'employee.private_updated' end;
    v_before_summary := case when v_old is null then null else '{"profile_present": true}'::jsonb end;
    v_after_summary := '{"profile_present": true}'::jsonb;
  elsif tg_table_name = 'company_role_assignments' then
    v_resource_id := v_new ->> 'id';
    v_resource_type := 'company_role_assignment';
    if tg_op = 'INSERT' then
      v_action := 'role.granted';
    elsif (v_old ->> 'revoked_at') is null and (v_new ->> 'revoked_at') is not null then
      v_action := 'role.revoked';
    else
      v_action := 'role.updated';
    end if;
    v_before_summary := case when v_old is null then null else pg_catalog.jsonb_build_object(
      'role_id', v_old -> 'role_id',
      'revoked', (v_old ->> 'revoked_at') is not null
    ) end;
    v_after_summary := pg_catalog.jsonb_build_object(
      'role_id', v_new -> 'role_id',
      'revoked', (v_new ->> 'revoked_at') is not null
    );
  else
    raise exception using errcode = 'P0001', message = 'AUDIT_TRIGGER_SCOPE_INVALID';
  end if;

  v_headers := pg_catalog.current_setting('request.headers', true);
  begin
    v_request_id := (v_headers::jsonb ->> 'x-request-id')::uuid;
  exception when others then
    v_request_id := null;
  end;
  if v_request_id is null then
    v_request_id := pg_catalog.gen_random_uuid();
  end if;

  insert into public.audit_events (
    tenant_id,
    company_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    request_id,
    before_summary,
    after_summary
  )
  values (
    v_tenant_id,
    v_company_id,
    auth.uid(),
    v_action,
    v_resource_type,
    v_resource_id,
    v_request_id,
    v_before_summary,
    v_after_summary
  );

  return new;
end;
$$;

create trigger employees_audit_employee_rbac_change
  after insert or update on public.employees
  for each row execute function private.audit_employee_rbac_change();
create trigger employee_private_details_audit_employee_rbac_change
  after insert or update on public.employee_private_details
  for each row execute function private.audit_employee_rbac_change();
create trigger company_role_assignments_audit_employee_rbac_change
  after insert or update on public.company_role_assignments
  for each row execute function private.audit_employee_rbac_change();

create or replace function private.audit_role_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_row jsonb;
  v_tenant_id uuid;
  v_company_id uuid;
  v_resource_id text;
  v_action text;
  v_resource_type text;
  v_before_summary jsonb;
  v_after_summary jsonb;
  v_request_id uuid;
  v_headers text;
  v_role_id uuid;
begin
  if tg_op = 'DELETE' then
    v_old := pg_catalog.to_jsonb(old);
    v_row := v_old;
  elsif tg_op = 'INSERT' then
    v_new := pg_catalog.to_jsonb(new);
    v_row := v_new;
  else
    v_new := pg_catalog.to_jsonb(new);
    v_old := pg_catalog.to_jsonb(old);
    v_row := v_new;
  end if;

  if tg_table_name = 'roles' then
    v_tenant_id := (v_row ->> 'tenant_id')::uuid;
    v_company_id := (v_row ->> 'company_id')::uuid;
    v_resource_id := v_row ->> 'id';
    v_resource_type := 'role';
    v_action := case tg_op
      when 'INSERT' then 'role.catalog_created'
      when 'UPDATE' then 'role.catalog_updated'
      else 'role.catalog_deleted'
    end;
    v_before_summary := case when v_old is null then null else pg_catalog.jsonb_build_object(
      'code', v_old ->> 'code',
      'is_system', v_old -> 'is_system',
      'is_active', v_old -> 'is_active',
      'is_privileged', v_old -> 'is_privileged'
    ) end;
    v_after_summary := case when v_new is null then null else pg_catalog.jsonb_build_object(
      'code', v_new ->> 'code',
      'is_system', v_new -> 'is_system',
      'is_active', v_new -> 'is_active',
      'is_privileged', v_new -> 'is_privileged'
    ) end;
  elsif tg_table_name = 'role_permissions' then
    v_role_id := (v_row ->> 'role_id')::uuid;
    select company_role.tenant_id, company_role.company_id
      into v_tenant_id, v_company_id
      from public.roles company_role
     where company_role.id = v_role_id;

    if v_tenant_id is null or v_company_id is null then
      raise exception using errcode = 'P0001', message = 'AUDIT_TRIGGER_SCOPE_INVALID';
    end if;

    v_resource_id := v_role_id::text || ':' || (v_row ->> 'permission_code');
    v_resource_type := 'role_permission';
    v_action := case tg_op
      when 'INSERT' then 'role_permission.created'
      when 'UPDATE' then 'role_permission.updated'
      else 'role_permission.deleted'
    end;
    v_before_summary := case when v_old is null then null else pg_catalog.jsonb_build_object(
      'role_id', v_old -> 'role_id',
      'permission_code', v_old ->> 'permission_code'
    ) end;
    v_after_summary := case when v_new is null then null else pg_catalog.jsonb_build_object(
      'role_id', v_new -> 'role_id',
      'permission_code', v_new ->> 'permission_code'
    ) end;
  else
    raise exception using errcode = 'P0001', message = 'AUDIT_TRIGGER_SCOPE_INVALID';
  end if;

  v_headers := pg_catalog.current_setting('request.headers', true);
  begin
    v_request_id := (v_headers::jsonb ->> 'x-request-id')::uuid;
  exception when others then
    v_request_id := null;
  end;
  if v_request_id is null then
    v_request_id := pg_catalog.gen_random_uuid();
  end if;

  insert into public.audit_events (
    tenant_id,
    company_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    request_id,
    before_summary,
    after_summary
  )
  values (
    v_tenant_id,
    v_company_id,
    auth.uid(),
    v_action,
    v_resource_type,
    v_resource_id,
    v_request_id,
    v_before_summary,
    v_after_summary
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger roles_audit_role_catalog_change
  after insert or update or delete on public.roles
  for each row execute function private.audit_role_catalog_change();
create trigger role_permissions_audit_role_catalog_change
  after insert or update or delete on public.role_permissions
  for each row execute function private.audit_role_catalog_change();

drop policy if exists audit_events_select_company_member on public.audit_events;

create policy departments_select_active_company_catalog on public.departments
  for select to authenticated
  using (is_active and public.is_company_member(tenant_id, company_id));

create policy positions_select_active_company_catalog on public.positions
  for select to authenticated
  using (is_active and public.is_company_member(tenant_id, company_id));

create policy employees_select_directory_or_hr on public.employees
  for select to authenticated
  using (
    private.is_active_employee_directory_record(id, tenant_id, company_id)
    and (
      (employment_status <> 'terminated' and public.is_company_member(tenant_id, company_id))
      or private.has_company_permission(tenant_id, company_id, 'employee.read_private')
      or private.has_company_permission(tenant_id, company_id, 'employee.update')
    )
  );

create policy employees_update_hr on public.employees
  for update to authenticated
  using (private.has_company_permission(tenant_id, company_id, 'employee.update'))
  with check (private.has_company_permission(tenant_id, company_id, 'employee.update'));

create policy employee_private_details_select_self_or_hr on public.employee_private_details
  for select to authenticated
  using (
    private.is_own_employee_record(employee_id, tenant_id, company_id)
    or private.has_company_permission(tenant_id, company_id, 'employee.read_private')
    or private.has_company_permission(tenant_id, company_id, 'employee.update')
  );

create policy employee_private_details_update_hr on public.employee_private_details
  for update to authenticated
  using (private.has_company_permission(tenant_id, company_id, 'employee.update'))
  with check (private.has_company_permission(tenant_id, company_id, 'employee.update'));

create policy roles_select_company_role_catalog on public.roles
  for select to authenticated
  using (
    is_active
    and private.can_read_role_catalog(tenant_id, company_id)
  );

create policy permissions_select_active_company_member on public.permissions
  for select to authenticated
  using (private.has_any_active_company_membership());

create policy role_permissions_select_company_role_catalog on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1
      from public.roles company_role
      where company_role.id = role_permissions.role_id
        and private.can_read_role_catalog(company_role.tenant_id, company_role.company_id)
    )
  );

create policy company_role_assignments_select_self_or_role_manager on public.company_role_assignments
  for select to authenticated
  using (
    (user_id = auth.uid() and public.is_company_member(tenant_id, company_id))
    or private.can_read_role_catalog(tenant_id, company_id)
  );

-- Directory access is intentionally column-scoped.  The account linkage,
-- provenance, and probation fields are not Data API columns for authenticated
-- callers; private data has a separate RLS-protected table.
revoke all on table public.departments, public.positions, public.employees,
  public.employee_private_details, public.roles, public.permissions,
  public.role_permissions, public.company_role_assignments, public.audit_events
  from public, anon, authenticated;

grant select on public.departments, public.positions, public.roles,
  public.permissions, public.role_permissions, public.employee_private_details,
  public.company_role_assignments to authenticated;
grant select (
  id,
  tenant_id,
  company_id,
  employee_code,
  full_name,
  work_email,
  department_id,
  position_id,
  manager_employee_id,
  employment_status,
  created_at,
  updated_at
) on public.employees to authenticated;
grant update (
  full_name,
  work_email,
  department_id,
  position_id,
  manager_employee_id,
  hire_date,
  probation_end_date,
  employment_status
) on public.employees to authenticated;
grant update on public.employee_private_details to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_tenant_member(uuid) from public, anon;
revoke all on function public.is_company_member(uuid, uuid) from public, anon;
revoke all on function private.get_my_company_access(uuid) from public, anon, authenticated;
revoke all on function public.get_my_company_access(uuid) from public, anon, authenticated;
revoke all on function public.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) from public, anon;
revoke all on function public.grant_company_role_assignment(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.revoke_company_role_assignment(bigint, text) from public, anon;
revoke all on all functions in schema private from public, anon, authenticated;

grant execute on function private.is_tenant_member(uuid) to authenticated;
grant execute on function private.is_company_member(uuid, uuid) to authenticated;
grant execute on function private.has_any_active_company_membership() to authenticated;
grant execute on function private.is_own_employee_record(uuid, uuid, uuid) to authenticated;
grant execute on function private.is_active_employee_directory_record(uuid, uuid, uuid) to authenticated;
grant execute on function private.has_company_permission(uuid, uuid, text) to authenticated;
grant execute on function private.get_my_company_access(uuid) to authenticated;
grant execute on function private.can_read_role_catalog(uuid, uuid) to authenticated;
grant execute on function private.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) to authenticated;
grant execute on function private.grant_company_role_assignment(uuid, uuid, uuid, text) to authenticated;
grant execute on function private.revoke_company_role_assignment(bigint, text) to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_company_member(uuid, uuid) to authenticated;
grant execute on function public.get_my_company_access(uuid) to authenticated;
grant execute on function public.complete_employee_onboarding(uuid, uuid, text, text, text, uuid, uuid, date) to authenticated;
grant execute on function public.grant_company_role_assignment(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.revoke_company_role_assignment(bigint, text) to authenticated;
