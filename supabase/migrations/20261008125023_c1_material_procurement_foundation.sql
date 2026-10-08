set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 41);

create table public.material_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  code text not null check (btrim(code) <> '' and char_length(code) <= 200),
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  specification text not null check (btrim(specification) <> '' and char_length(specification) <= 2000),
  unit text not null check (btrim(unit) <> '' and char_length(unit) <= 200),
  is_active boolean not null default true,
  version bigint not null default 0 check (version >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id),
  unique (company_id, code),
  foreign key (company_id, tenant_id) references public.companies(id, tenant_id) on delete restrict
);

create table public.material_supplier_names (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  material_id uuid not null,
  supplier_id uuid not null,
  document_kind text not null check (document_kind in ('quotation', 'invoice')),
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  version bigint not null default 0 check (version >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, tenant_id, company_id),
  unique (material_id, supplier_id, document_kind, name),
  foreign key (material_id, tenant_id, company_id) references public.material_items(id, tenant_id, company_id) on delete restrict,
  foreign key (supplier_id, tenant_id, company_id) references public.business_parties(id, tenant_id, company_id) on delete restrict
);

create table public.material_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  review_state text not null default 'draft' check (review_state in ('draft', 'submitted', 'approved', 'returned')),
  needed_on date not null,
  delivery_address text not null check (btrim(delivery_address) <> '' and char_length(delivery_address) <= 2000),
  notes text check (notes is null or (btrim(notes) <> '' and char_length(notes) <= 2000)),
  current_revision_id uuid,
  approved_revision_id uuid,
  version bigint not null default 0 check (version >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  foreign key (project_id, tenant_id, company_id) references public.projects(id, tenant_id, company_id) on delete restrict
);

create table public.material_proposal_lines (
  id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  proposal_id uuid not null,
  material_id uuid not null,
  quantity numeric(20,4) not null check (quantity > 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, proposal_id, tenant_id, company_id, project_id),
  foreign key (proposal_id, tenant_id, company_id, project_id) references public.material_proposals(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (material_id, tenant_id, company_id) references public.material_items(id, tenant_id, company_id) on delete restrict
);

create table public.material_proposal_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  proposal_id uuid not null,
  revision_no bigint not null check (revision_no > 0),
  needed_on date not null,
  delivery_address text not null check (btrim(delivery_address) <> ''),
  notes text,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  unique (id, proposal_id, tenant_id, company_id, project_id),
  unique (proposal_id, revision_no),
  foreign key (proposal_id, tenant_id, company_id, project_id) references public.material_proposals(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_proposal_revision_lines (
  revision_id uuid not null,
  proposal_line_id uuid not null,
  proposal_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  material_id uuid not null,
  material_name text not null,
  specification text not null,
  unit text not null,
  quantity numeric(20,4) not null check (quantity > 0),
  primary key (revision_id, proposal_line_id),
  unique (revision_id, proposal_line_id, tenant_id, company_id, project_id),
  foreign key (revision_id, proposal_id, tenant_id, company_id, project_id) references public.material_proposal_revisions(id, proposal_id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (proposal_line_id, proposal_id, tenant_id, company_id, project_id) references public.material_proposal_lines(id, proposal_id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (material_id, tenant_id, company_id) references public.material_items(id, tenant_id, company_id) on delete restrict
);

alter table public.material_proposals
  add constraint material_proposals_current_revision_fk
  foreign key (current_revision_id, id, tenant_id, company_id, project_id)
  references public.material_proposal_revisions(id, proposal_id, tenant_id, company_id, project_id) on delete restrict,
  add constraint material_proposals_approved_revision_fk
  foreign key (approved_revision_id, id, tenant_id, company_id, project_id)
  references public.material_proposal_revisions(id, proposal_id, tenant_id, company_id, project_id) on delete restrict;

create table public.material_proposal_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  proposal_id uuid not null,
  revision_id uuid not null,
  proposal_version bigint not null check (proposal_version >= 0),
  decision text not null check (decision in ('approve', 'return')),
  reason text,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  check (decision <> 'return' or (reason is not null and btrim(reason) <> '')),
  unique (proposal_id, proposal_version),
  foreign key (proposal_id, tenant_id, company_id, project_id) references public.material_proposals(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (revision_id, proposal_id, tenant_id, company_id, project_id) references public.material_proposal_revisions(id, proposal_id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  proposal_id uuid not null,
  approved_revision_id uuid not null,
  supplier_id uuid not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  unsigned_quotation_evidence_file_id uuid not null,
  state text not null default 'active' check (state in ('active', 'suspended', 'cancelled')),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  unique (id, proposal_id, approved_revision_id, tenant_id, company_id, project_id),
  foreign key (proposal_id, tenant_id, company_id, project_id) references public.material_proposals(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (approved_revision_id, proposal_id, tenant_id, company_id, project_id) references public.material_proposal_revisions(id, proposal_id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (supplier_id, tenant_id, company_id) references public.business_parties(id, tenant_id, company_id) on delete restrict,
  foreign key (unsigned_quotation_evidence_file_id, tenant_id, company_id, project_id) references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_order_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  order_id uuid not null,
  proposal_id uuid not null,
  approved_revision_id uuid not null,
  proposal_line_id uuid not null,
  quantity numeric(20,4) not null check (quantity > 0),
  unit_price numeric(20,4) not null check (unit_price > 0),
  quotation_material_name text not null check (btrim(quotation_material_name) <> '' and char_length(quotation_material_name) <= 200),
  mapping_confirmed boolean not null check (mapping_confirmed),
  created_at timestamptz not null default now(),
  unique (id, tenant_id, company_id, project_id),
  unique (order_id, proposal_line_id),
  foreign key (order_id, proposal_id, approved_revision_id, tenant_id, company_id, project_id) references public.material_orders(id, proposal_id, approved_revision_id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (approved_revision_id, proposal_line_id, tenant_id, company_id, project_id) references public.material_proposal_revision_lines(revision_id, proposal_line_id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_order_contracts (
  order_id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  contract_id uuid not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (order_id, tenant_id, company_id, project_id),
  foreign key (order_id, tenant_id, company_id, project_id) references public.material_orders(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (contract_id, tenant_id, company_id, project_id) references public.cost_workflow_contracts(id, tenant_id, company_id, project_id) on delete restrict
);

create table public.material_evidence_scopes (
  evidence_file_id uuid primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  target_kind text not null check (target_kind in ('material_proposal', 'material_order')),
  proposal_id uuid,
  revision_id uuid,
  order_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (target_kind = 'material_proposal' and proposal_id is not null and revision_id is not null and order_id is null)
    or (target_kind = 'material_order' and proposal_id is null and revision_id is null and order_id is not null)
  ),
  foreign key (evidence_file_id, tenant_id, company_id, project_id) references public.cost_evidence_files(id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (revision_id, proposal_id, tenant_id, company_id, project_id) references public.material_proposal_revisions(id, proposal_id, tenant_id, company_id, project_id) on delete restrict,
  foreign key (order_id, tenant_id, company_id, project_id) references public.material_orders(id, tenant_id, company_id, project_id) on delete restrict
);

create index material_supplier_names_material_idx on public.material_supplier_names(tenant_id, company_id, material_id);
create index material_supplier_names_supplier_idx on public.material_supplier_names(tenant_id, company_id, supplier_id);
create index material_proposals_project_idx on public.material_proposals(tenant_id, company_id, project_id, updated_at, id);
create index material_proposals_owner_idx on public.material_proposals(tenant_id, company_id, created_by, updated_at, id);
create index material_proposal_lines_proposal_idx on public.material_proposal_lines(tenant_id, company_id, project_id, proposal_id, id);
create index material_proposal_lines_material_idx on public.material_proposal_lines(tenant_id, company_id, material_id);
create index material_proposal_revisions_proposal_idx on public.material_proposal_revisions(tenant_id, company_id, project_id, proposal_id, revision_no);
create index material_revision_lines_line_idx on public.material_proposal_revision_lines(tenant_id, company_id, project_id, proposal_line_id);
create index material_revision_lines_material_idx on public.material_proposal_revision_lines(tenant_id, company_id, material_id);
create index material_proposal_decisions_proposal_idx on public.material_proposal_decisions(tenant_id, company_id, project_id, proposal_id, decided_at);
create index material_orders_proposal_idx on public.material_orders(tenant_id, company_id, project_id, proposal_id, created_at);
create index material_orders_supplier_idx on public.material_orders(tenant_id, company_id, supplier_id);
create index material_orders_quote_idx on public.material_orders(tenant_id, company_id, project_id, unsigned_quotation_evidence_file_id);
create index material_order_allocations_order_idx on public.material_order_allocations(tenant_id, company_id, project_id, order_id);
create index material_order_allocations_line_idx on public.material_order_allocations(tenant_id, company_id, project_id, proposal_line_id);
create index material_order_contracts_contract_idx on public.material_order_contracts(tenant_id, company_id, project_id, contract_id);
create index material_evidence_scopes_proposal_idx on public.material_evidence_scopes(tenant_id, company_id, project_id, proposal_id, revision_id) where target_kind = 'material_proposal';
create index material_evidence_scopes_order_idx on public.material_evidence_scopes(tenant_id, company_id, project_id, order_id) where target_kind = 'material_order';

create function private.c1_material_retain_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'MATERIAL_HISTORY_IMMUTABLE';
end;
$$;

create trigger material_revision_history_immutable before update or delete on public.material_proposal_revisions
for each row execute function private.c1_material_retain_history();
create trigger material_revision_lines_history_immutable before update or delete on public.material_proposal_revision_lines
for each row execute function private.c1_material_retain_history();
create trigger material_decisions_history_immutable before update or delete on public.material_proposal_decisions
for each row execute function private.c1_material_retain_history();
create trigger material_order_contracts_history_immutable before update or delete on public.material_order_contracts
for each row execute function private.c1_material_retain_history();
create trigger material_evidence_scopes_history_immutable before update or delete on public.material_evidence_scopes
for each row execute function private.c1_material_retain_history();

create function private.c1_material_guard_signed_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.material_order_contracts as contract_link
    where contract_link.order_id = old.id
      and contract_link.tenant_id = old.tenant_id
      and contract_link.company_id = old.company_id
      and contract_link.project_id = old.project_id
  ) then
    if tg_op = 'DELETE' then
      raise exception using errcode = 'P0001', message = 'SIGNED_ORDER_IMMUTABLE';
    end if;
    if row(new.proposal_id, new.approved_revision_id, new.supplier_id, new.currency_code, new.unsigned_quotation_evidence_file_id, new.state)
      is distinct from
       row(old.proposal_id, old.approved_revision_id, old.supplier_id, old.currency_code, old.unsigned_quotation_evidence_file_id, old.state)
    then
      raise exception using errcode = 'P0001', message = 'SIGNED_ORDER_IMMUTABLE';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger material_signed_order_guard before update or delete on public.material_orders
for each row execute function private.c1_material_guard_signed_order();

create function private.c1_material_guard_signed_allocation()
returns trigger language plpgsql set search_path = '' as $$
declare v_order_id uuid;
begin
  if tg_op = 'DELETE' then v_order_id := old.order_id; else v_order_id := new.order_id; end if;
  if exists (
    select 1 from public.material_order_contracts as contract_link
    where contract_link.order_id = v_order_id
  ) then
    raise exception using errcode = 'P0001', message = 'SIGNED_ALLOCATION_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger material_signed_allocation_guard before insert or update or delete on public.material_order_allocations
for each row execute function private.c1_material_guard_signed_allocation();

revoke all on function private.c1_material_retain_history(), private.c1_material_guard_signed_order(), private.c1_material_guard_signed_allocation()
from public, anon, authenticated, service_role;
