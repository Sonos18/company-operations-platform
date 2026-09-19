create table if not exists public.project_cost_item_details (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  company_id uuid not null,
  project_cost_item_id uuid not null,
  line_no integer not null,
  detail_kind text not null default 'line_item',
  description text not null,
  quantity_text text,
  unit_code text,
  unit_price_text text,
  amount_text text not null,
  relevant_date date,
  reference text,
  note text,
  version bigint not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_kind text,
  retention_rate_bps integer,
  retention_amount_text text
);

alter table public.project_cost_item_details add column if not exists retention_kind text;
alter table public.project_cost_item_details add column if not exists retention_rate_bps integer;
alter table public.project_cost_item_details add column if not exists retention_amount_text text;

do $$
declare
  v_table regclass := 'public.project_cost_item_details'::regclass;
  v_expected record;
  v_actual pg_attribute%rowtype;
  v_expected_default text;
  v_actual_default text;
  v_expected_constraint record;
  v_actual_constraint pg_constraint%rowtype;
  v_expected_expr text;
  v_actual_expr text;
begin
  create temp table c1_pcd_contract (
    id uuid not null default gen_random_uuid(),
    tenant_id uuid not null,
    company_id uuid not null,
    project_cost_item_id uuid not null,
    line_no integer not null constraint project_cost_item_details_line_no_check check (line_no > 0),
    detail_kind text not null default 'line_item' constraint project_cost_item_details_detail_kind_check check (detail_kind in ('opening_balance', 'line_item')),
    description text not null constraint project_cost_item_details_description_check check (btrim(description) <> ''),
    quantity_text text constraint project_cost_item_details_quantity_text_check check (quantity_text is null or quantity_text ~ '^\d{1,16}(\.\d{1,4})?$'),
    unit_code text constraint project_cost_item_details_unit_code_check check (unit_code is null or btrim(unit_code) <> ''),
    unit_price_text text constraint project_cost_item_details_unit_price_text_check check (unit_price_text is null or unit_price_text ~ '^\d{1,16}(\.\d{1,4})?$'),
    amount_text text not null constraint project_cost_item_details_amount_text_check check (amount_text ~ '^\d{1,16}(\.\d{1,4})?$'),
    relevant_date date,
    reference text constraint project_cost_item_details_reference_check check (reference is null or btrim(reference) <> ''),
    note text,
    version bigint not null default 0 constraint project_cost_item_details_version_check check (version >= 0),
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    retention_kind text constraint project_cost_item_details_retention_kind_check check (retention_kind is null or retention_kind in ('warranty', 'other')),
    retention_rate_bps integer constraint project_cost_item_details_retention_rate_bps_check check (retention_rate_bps is null or retention_rate_bps between 0 and 10000),
    retention_amount_text text constraint project_cost_item_details_retention_amount_text_check check (retention_amount_text is null or retention_amount_text ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'),
    constraint project_cost_item_details_retention_amount_lte_amount_check check (retention_amount_text is null or retention_amount_text::numeric <= amount_text::numeric),
    constraint project_cost_item_details_retention_shape_check check ((retention_kind is null and retention_rate_bps is null and retention_amount_text is null) or (retention_kind is not null and retention_amount_text is not null))
  ) on commit drop;

  for v_expected in
    select attribute.*, pg_get_expr(default_value.adbin, default_value.adrelid) as default_expr
    from pg_attribute attribute
    left join pg_attrdef default_value on default_value.adrelid = attribute.attrelid and default_value.adnum = attribute.attnum
    where attribute.attrelid = 'pg_temp.c1_pcd_contract'::regclass and attribute.attnum > 0 and not attribute.attisdropped
    order by attribute.attnum
  loop
    select * into v_actual from pg_attribute attribute
    where attribute.attrelid = v_table and attribute.attname = v_expected.attname and not attribute.attisdropped;
    if not found then
      raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_COLUMN_' || v_expected.attname;
    end if;
    select pg_get_expr(default_value.adbin, default_value.adrelid) into v_actual_default
    from pg_attrdef default_value where default_value.adrelid = v_table and default_value.adnum = v_actual.attnum;
    v_expected_default := v_expected.default_expr;
    if v_actual.atttypid <> v_expected.atttypid
      or v_actual.attnotnull is distinct from v_expected.attnotnull
      or regexp_replace(coalesce(v_actual_default, ''), '\s+', '', 'g') is distinct from regexp_replace(coalesce(v_expected_default, ''), '\s+', '', 'g') then
      raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_COLUMN_' || v_expected.attname;
    end if;
  end loop;

  for v_expected_constraint in
    select constraint_row.*, pg_get_expr(constraint_row.conbin, constraint_row.conrelid) as constraint_expr
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'pg_temp.c1_pcd_contract'::regclass and constraint_row.contype = 'c'
    order by constraint_row.conname
  loop
    select * into v_actual_constraint from pg_constraint constraint_row
    where constraint_row.conrelid = v_table and constraint_row.conname = v_expected_constraint.conname;
    if not found then
      execute format('alter table public.project_cost_item_details add constraint %I %s not valid', v_expected_constraint.conname, pg_get_constraintdef(v_expected_constraint.oid, true));
      execute format('alter table public.project_cost_item_details validate constraint %I', v_expected_constraint.conname);
    else
      v_actual_expr := pg_get_expr(v_actual_constraint.conbin, v_actual_constraint.conrelid);
      v_expected_expr := v_expected_constraint.constraint_expr;
      if v_actual_constraint.contype <> 'c'
        or regexp_replace(lower(v_actual_expr), '\s+', '', 'g') is distinct from regexp_replace(lower(v_expected_expr), '\s+', '', 'g') then
        raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_CHECK_' || v_expected_constraint.conname;
      end if;
      if not v_actual_constraint.convalidated then
        execute format('alter table public.project_cost_item_details validate constraint %I', v_actual_constraint.conname);
      end if;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_table regclass := 'public.project_cost_item_details'::regclass;
  v_expected record;
  v_constraint pg_constraint%rowtype;
  v_columns text[];
  v_column_sql text;
  v_duplicates boolean;
begin
  for v_expected in
    select * from (values
      ('project_cost_item_details_pkey', 'p'::"char", array['id']::text[]),
      ('project_cost_item_details_id_tenant_id_company_id_key', 'u'::"char", array['id', 'tenant_id', 'company_id']::text[]),
      ('project_cost_item_details_project_cost_item_id_line_no_key', 'u'::"char", array['project_cost_item_id', 'line_no']::text[])
    ) as expected(conname, contype, columns)
  loop
    select * into v_constraint from pg_constraint constraint_row where constraint_row.conrelid = v_table and constraint_row.conname = v_expected.conname;
    if found then
      select array_agg(attribute.attname::text order by key_column.ordinality) into v_columns
      from unnest(v_constraint.conkey) with ordinality as key_column(attnum, ordinality)
      join pg_attribute attribute on attribute.attrelid = v_table and attribute.attnum = key_column.attnum;
      if v_constraint.contype <> v_expected.contype or v_columns is distinct from v_expected.columns then
        raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_KEY_' || v_expected.conname;
      end if;
    else
      select * into v_constraint from pg_constraint constraint_row
      where constraint_row.conrelid = v_table and constraint_row.contype = v_expected.contype
        and (select array_agg(attribute.attname::text order by key_column.ordinality) from unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality) join pg_attribute attribute on attribute.attrelid = v_table and attribute.attnum = key_column.attnum) = v_expected.columns
      limit 1;
      if not found then
        if v_expected.contype = 'p' and exists (select 1 from pg_constraint where conrelid = v_table and contype = 'p') then
          raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_KEY_PRIMARY_KEY';
        end if;
        select string_agg(format('%I', column_name), ', ' order by ordinality) into v_column_sql
        from unnest(v_expected.columns) with ordinality as expected_column(column_name, ordinality);
        execute format('select exists (select 1 from (select %1$s from public.project_cost_item_details group by %1$s having count(*) > 1) duplicate_rows)', v_column_sql) into v_duplicates;
        if v_duplicates then
          raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_KEY_DUPLICATE_' || v_expected.conname;
        end if;
        execute format('alter table public.project_cost_item_details add constraint %I %s (%s)', v_expected.conname, case when v_expected.contype = 'p' then 'primary key' else 'unique' end, v_column_sql);
      end if;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_table regclass := 'public.project_cost_item_details'::regclass;
  v_expected record;
  v_constraint pg_constraint%rowtype;
  v_local_columns text[];
  v_referenced_columns text[];
  v_local_sql text;
  v_referenced_sql text;
begin
  for v_expected in
    select * from (values
      ('project_cost_item_details_company_id_tenant_id_fkey', array['company_id', 'tenant_id']::text[], 'public.companies'::regclass, array['id', 'tenant_id']::text[], 'a'::"char"),
      ('project_cost_item_details_project_cost_item_id_tenant_id_company_id_fkey', array['project_cost_item_id', 'tenant_id', 'company_id']::text[], 'public.project_cost_items'::regclass, array['id', 'tenant_id', 'company_id']::text[], 'c'::"char"),
      ('project_cost_item_details_created_by_fkey', array['created_by']::text[], 'auth.users'::regclass, array['id']::text[], 'a'::"char")
    ) as expected(conname, local_columns, referenced_table, referenced_columns, delete_type)
  loop
    select * into v_constraint from pg_constraint constraint_row where constraint_row.conrelid = v_table and constraint_row.conname = v_expected.conname;
    if not found then
      select * into v_constraint from pg_constraint constraint_row
      where constraint_row.conrelid = v_table and constraint_row.contype = 'f'
        and (select array_agg(attribute.attname::text order by key_column.ordinality) from unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality) join pg_attribute attribute on attribute.attrelid = v_table and attribute.attnum = key_column.attnum) = v_expected.local_columns
      limit 1;
    end if;
    if found then
      select array_agg(attribute.attname::text order by key_column.ordinality) into v_local_columns from unnest(v_constraint.conkey) with ordinality as key_column(attnum, ordinality) join pg_attribute attribute on attribute.attrelid = v_table and attribute.attnum = key_column.attnum;
      select array_agg(attribute.attname::text order by key_column.ordinality) into v_referenced_columns from unnest(v_constraint.confkey) with ordinality as key_column(attnum, ordinality) join pg_attribute attribute on attribute.attrelid = v_constraint.confrelid and attribute.attnum = key_column.attnum;
      if v_constraint.contype <> 'f'
        or v_local_columns is distinct from v_expected.local_columns
        or v_constraint.confrelid <> v_expected.referenced_table
        or v_referenced_columns is distinct from v_expected.referenced_columns
        or v_constraint.confdeltype <> v_expected.delete_type then
        raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_FOREIGN_KEY_' || v_expected.conname;
      end if;
      if not v_constraint.convalidated then
        execute format('alter table public.project_cost_item_details validate constraint %I', v_constraint.conname);
      end if;
    else
      select string_agg(format('%I', column_name), ', ' order by ordinality) into v_local_sql from unnest(v_expected.local_columns) with ordinality as expected_column(column_name, ordinality);
      select string_agg(format('%I', column_name), ', ' order by ordinality) into v_referenced_sql from unnest(v_expected.referenced_columns) with ordinality as expected_column(column_name, ordinality);
      execute format('alter table public.project_cost_item_details add constraint %I foreign key (%s) references %s (%s)%s not valid', v_expected.conname, v_local_sql, v_expected.referenced_table, v_referenced_sql, case when v_expected.delete_type = 'c' then ' on delete cascade' else '' end);
      execute format('alter table public.project_cost_item_details validate constraint %I', v_expected.conname);
    end if;
  end loop;
end;
$$;

do $$
declare
  v_table regclass := 'public.project_cost_item_details'::regclass;
  v_index pg_index%rowtype;
  v_index_relid oid;
  v_expected_attnums smallint[];
  v_actual_attnums smallint[];
  v_indexdef text;
begin
  select array_agg(attribute.attnum::smallint order by expected_column.ordinality) into v_expected_attnums
  from unnest(array['tenant_id', 'company_id', 'project_cost_item_id', 'line_no']::text[]) with ordinality as expected_column(column_name, ordinality)
  join pg_attribute attribute on attribute.attrelid = v_table and attribute.attname = expected_column.column_name;
  select index_class.oid into v_index_relid from pg_class index_class join pg_namespace namespace on namespace.oid = index_class.relnamespace where namespace.nspname = 'public' and index_class.relname = 'project_cost_item_details_scope_idx';
  if v_index_relid is null then
    create index project_cost_item_details_scope_idx on public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no);
  else
    select * into v_index from pg_index index_row where index_row.indexrelid = v_index_relid;
    if not found then
      raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_INDEX_SCOPE', detail = 'missing pg_index row';
    end if;
    select array(
      select key_column.key_attnum::smallint
      from unnest(v_index.indkey::smallint[]) with ordinality as key_column(key_attnum, ordinality)
      order by key_column.ordinality
    ) into v_actual_attnums;
    select pg_get_indexdef(v_index_relid) into v_indexdef;
    if v_index.indrelid <> v_table
      or v_index.indisunique
      or v_index.indpred is not null
      or not v_index.indisvalid
      or not v_index.indisready
      or v_index.indnkeyatts <> 4
      or v_index.indnatts <> 4
      or v_actual_attnums is distinct from v_expected_attnums
      or not exists (select 1 from pg_class index_class join pg_am access_method on access_method.oid = index_class.relam where index_class.oid = v_index_relid and access_method.amname = 'btree') then
      raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_INDEX_SCOPE', detail = coalesce(v_indexdef, 'missing pg_index row');
    end if;
  end if;
end;
$$;

alter table public.project_cost_item_details enable row level security;
alter table public.project_cost_item_details force row level security;
revoke all on table public.project_cost_item_details from public, anon, authenticated;
grant select on table public.project_cost_item_details to authenticated;

do $$
declare
  v_table regclass := 'public.project_cost_item_details'::regclass;
  v_policy pg_policy%rowtype;
  v_qual text;
begin
  if exists (select 1 from pg_policy policy_row where policy_row.polrelid = v_table and policy_row.polname <> 'c1_project_cost_item_details_select') then
    raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_POLICY_UNEXPECTED';
  end if;
  select * into v_policy from pg_policy policy_row where policy_row.polrelid = v_table and policy_row.polname = 'c1_project_cost_item_details_select';
  if not found then
    create policy c1_project_cost_item_details_select on public.project_cost_item_details for select to authenticated using (private.c1_can_read_project_cost(tenant_id, company_id));
  else
    v_qual := pg_get_expr(v_policy.polqual, v_policy.polrelid);
    if v_policy.polcmd <> 'r'
      or not v_policy.polpermissive
      or v_policy.polroles is distinct from array['authenticated'::regrole::oid]
      or v_policy.polwithcheck is not null
      or regexp_replace(lower(coalesce(v_qual, '')), '\s+', '', 'g') is distinct from 'private.c1_can_read_project_cost(tenant_id,company_id)' then
      raise exception using errcode = 'P0001', message = 'C1_PCD_SCHEMA_DRIFT_POLICY_c1_project_cost_item_details_select';
    end if;
  end if;
end;
$$;

create or replace function private.c1_sync_project_cost_item_amount(target_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_company_id uuid;
  v_amount numeric;
begin
  select item.tenant_id, item.company_id into v_tenant_id, v_company_id from public.project_cost_items item where item.id = target_id for update;
  if not found then return; end if;
  select coalesce(sum(detail.amount_text::numeric), 0) into v_amount
  from public.project_cost_item_details detail
  where detail.project_cost_item_id = target_id and detail.tenant_id = v_tenant_id and detail.company_id = v_company_id;
  if exists (select 1 from public.project_cost_items item where item.id = target_id and item.amount is distinct from v_amount) then
    perform set_config('taskovia.project_cost_detail_sync', '1', true);
    update public.project_cost_items item set amount = v_amount, amount_text = v_amount::text, version = item.version + 1, updated_at = now() where item.id = target_id;
    perform set_config('taskovia.project_cost_detail_sync', '0', true);
  end if;
end;
$$;

create or replace function private.c1_project_cost_detail_sync_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.c1_sync_project_cost_item_amount(old.project_cost_item_id);
  elsif tg_op = 'UPDATE' and (old.project_cost_item_id, old.tenant_id, old.company_id) is distinct from (new.project_cost_item_id, new.tenant_id, new.company_id) then
    perform private.c1_sync_project_cost_item_amount(old.project_cost_item_id);
    perform private.c1_sync_project_cost_item_amount(new.project_cost_item_id);
  else
    perform private.c1_sync_project_cost_item_amount(new.project_cost_item_id);
  end if;
  return null;
end;
$$;

create or replace function private.c1_guard_derived_project_cost_amount()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.amount is distinct from old.amount or new.amount_text is distinct from old.amount_text)
    and exists (select 1 from public.project_cost_item_details detail where detail.project_cost_item_id = new.id and detail.tenant_id = new.tenant_id and detail.company_id = new.company_id)
    and current_setting('taskovia.project_cost_detail_sync', true) is distinct from '1' then
    raise exception using errcode = 'P0001', message = 'PROJECT_COST_AMOUNT_DERIVED';
  end if;
  return new;
end;
$$;

revoke all on function private.c1_sync_project_cost_item_amount(uuid), private.c1_project_cost_detail_sync_trigger(), private.c1_guard_derived_project_cost_amount() from public, anon, authenticated;

drop trigger if exists c1_project_cost_item_details_sync on public.project_cost_item_details;
create constraint trigger c1_project_cost_item_details_sync after insert or delete or update on public.project_cost_item_details deferrable initially deferred for each row execute function private.c1_project_cost_detail_sync_trigger();
drop trigger if exists c1_project_cost_items_amount_derived_guard on public.project_cost_items;
create trigger c1_project_cost_items_amount_derived_guard before update of amount, amount_text on public.project_cost_items for each row execute function private.c1_guard_derived_project_cost_amount();

insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, detail_kind, description, amount_text, created_by)
select item.tenant_id, item.company_id, item.id, 1, 'opening_balance', 'Số liệu ban đầu — ' || item.description, item.amount_text, item.created_by
from public.project_cost_items item
where not exists (
  select 1 from public.project_cost_item_details detail
  where detail.project_cost_item_id = item.id and detail.tenant_id = item.tenant_id and detail.company_id = item.company_id
);

do $$
begin
  if exists (select 1 from public.project_cost_item_details detail group by detail.project_cost_item_id, detail.line_no having count(*) > 1) then
    raise exception using errcode = 'P0001', message = 'PROJECT_COST_DETAIL_RECONCILIATION_DRIFT_DUPLICATE_LINE_NO';
  end if;
  if exists (
    select 1 from public.project_cost_items item
    join (
      select detail.project_cost_item_id, detail.tenant_id, detail.company_id, sum(detail.amount_text::numeric) as total
      from public.project_cost_item_details detail
      group by detail.project_cost_item_id, detail.tenant_id, detail.company_id
    ) detail_total on detail_total.project_cost_item_id = item.id and detail_total.tenant_id = item.tenant_id and detail_total.company_id = item.company_id
    where item.amount is distinct from detail_total.total or item.amount_text::numeric is distinct from detail_total.total
  ) then
    raise exception using errcode = 'P0001', message = 'PROJECT_COST_DETAIL_RECONCILIATION_DRIFT';
  end if;
end;
$$;
