create type public.deployment_mode as enum ('shared', 'dedicated');

create table public.tenants (
  id uuid primary key,
  code text not null unique,
  name text not null,
  deployment_mode public.deployment_mode not null default 'shared',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (id, tenant_id)
);

create table public.tenant_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  roles text[] not null check (cardinality(roles) > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

create table public.company_memberships (
  user_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  roles text[] not null check (cardinality(roles) > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, company_id),
  foreign key (user_id, tenant_id)
    references public.tenant_memberships(user_id, tenant_id) on delete cascade,
  foreign key (company_id, tenant_id)
    references public.companies(id, tenant_id) on delete cascade
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  request_id uuid not null,
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz not null default now(),
  foreign key (company_id, tenant_id)
    references public.companies(id, tenant_id) on delete restrict
);

create index tenant_memberships_tenant_user_idx
  on public.tenant_memberships (tenant_id, user_id);
create index company_memberships_scope_user_idx
  on public.company_memberships (tenant_id, company_id, user_id);
create index audit_events_scope_created_idx
  on public.audit_events (tenant_id, company_id, created_at desc);

create function public.is_tenant_member(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships m
    where m.user_id = (select auth.uid())
      and m.tenant_id = target_tenant_id
  );
$$;

create function public.is_company_member(target_tenant_id uuid, target_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.user_id = (select auth.uid())
      and m.tenant_id = target_tenant_id
      and m.company_id = target_company_id
  );
$$;

revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.is_company_member(uuid, uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_company_member(uuid, uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.companies enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.company_memberships enable row level security;
alter table public.audit_events enable row level security;

create policy tenants_select_member on public.tenants
for select to authenticated using (public.is_tenant_member(id));
create policy companies_select_member on public.companies
for select to authenticated using (public.is_company_member(tenant_id, id));
create policy tenant_memberships_select_self on public.tenant_memberships
for select to authenticated using (user_id = (select auth.uid()));
create policy company_memberships_select_self on public.company_memberships
for select to authenticated using (user_id = (select auth.uid()));
create policy audit_events_select_company_member on public.audit_events
for select to authenticated using (public.is_company_member(tenant_id, company_id));

revoke all on table public.tenants, public.companies, public.tenant_memberships,
  public.company_memberships, public.audit_events from anon, authenticated;

grant select on public.tenants, public.companies, public.tenant_memberships,
  public.company_memberships, public.audit_events to authenticated;
