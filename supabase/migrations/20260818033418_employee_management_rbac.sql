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
