create temporary table workflow_taxonomy_values_pretransition_checkpoint
on commit drop
as
select
  count(*)::bigint as row_count,
  encode(
    extensions.digest(
      coalesce(
        string_agg(
          jsonb_build_array(
            id, tenant_id, company_id, taxonomy_key, code, label,
            semantic_key, behavior, is_active,
            to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          )::text,
          E'\n'
          order by id, tenant_id, company_id, taxonomy_key, code, label,
            semantic_key, behavior::text, is_active, created_at, updated_at
        ),
        ''
      ),
      'sha256'
    ),
    'hex'
  ) as fingerprint
from public.stage01_taxonomy_values;

alter table public.stage01_taxonomy_values rename to workflow_taxonomy_values;

alter table public.workflow_taxonomy_values
  rename constraint stage01_taxonomy_values_pkey to workflow_taxonomy_values_pkey;

alter table public.workflow_taxonomy_values
  rename constraint stage01_taxonomy_values_company_fk to workflow_taxonomy_values_company_fk;

alter table public.workflow_taxonomy_values
  rename constraint stage01_taxonomy_values_key_not_blank to workflow_taxonomy_values_key_not_blank;

alter table public.workflow_taxonomy_values
  rename constraint stage01_taxonomy_values_code_not_blank to workflow_taxonomy_values_code_not_blank;

alter table public.workflow_taxonomy_values
  rename constraint stage01_taxonomy_values_label_not_blank to workflow_taxonomy_values_label_not_blank;

alter table public.workflow_taxonomy_values
  rename constraint stage01_taxonomy_values_semantic_not_blank to workflow_taxonomy_values_semantic_not_blank;

alter table public.workflow_taxonomy_values
  rename constraint stage01_taxonomy_values_behavior_object to workflow_taxonomy_values_behavior_object;

alter table public.workflow_taxonomy_values
  rename constraint stage01_taxonomy_values_id_scope_key to workflow_taxonomy_values_id_scope_key;

alter table public.workflow_taxonomy_values
  add column workflow_key text;

update public.workflow_taxonomy_values
   set workflow_key = 'vqh.stage01';

alter table public.workflow_taxonomy_values
  alter column workflow_key set not null,
  add constraint workflow_taxonomy_values_workflow_key_not_blank
    check (btrim(workflow_key) <> ''),
  drop constraint stage01_taxonomy_values_company_key_code,
  add constraint workflow_taxonomy_values_company_workflow_taxonomy_code_key
    unique (company_id, workflow_key, taxonomy_key, code);

drop index public.stage01_taxonomy_values_scope_key_idx;

create index workflow_taxonomy_values_scope_key_idx
  on public.workflow_taxonomy_values (
    tenant_id, company_id, workflow_key, taxonomy_key, is_active, code
  );

alter policy stage01_stage01_taxonomy_values_read
  on public.workflow_taxonomy_values
  rename to workflow_taxonomy_values_read;

alter table public.workflow_taxonomy_values enable row level security;
revoke all on table public.workflow_taxonomy_values from anon, authenticated;
grant select on table public.workflow_taxonomy_values to authenticated;

alter policy workflow_taxonomy_values_read
  on public.workflow_taxonomy_values
  to authenticated
  using (
    workflow_key = 'vqh.stage01'
    and private.has_company_permission(tenant_id, company_id, 'opportunity.read')
  );

create or replace function private.sync_stage01_config_taxonomy_values(
  target_tenant_id uuid,
  target_company_id uuid,
  target_definition jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  taxonomy_keys constant text[] := array[
    'customer_type', 'contact_relationship', 'scope', 'lead_source',
    'referrer_type', 'engagement_status', 'invalid_reason', 'budget_status',
    'timeline_status', 'priority', 'intake_channel', 'blocker_category'
  ];
begin
  perform private.assert_valid_stage01_config_definition(target_definition);

  if exists (
    select 1
    from public.workflow_taxonomy_values as catalog
    where catalog.tenant_id = target_tenant_id
      and catalog.company_id = target_company_id
      and catalog.workflow_key = 'vqh.stage01'
      and catalog.taxonomy_key = any(taxonomy_keys)
      and catalog.semantic_key is not null
      and (
        not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            target_definition #> array['taxonomies', catalog.taxonomy_key]
          ) as candidate_entry(value)
          where candidate_entry.value ->> 'code' = catalog.code
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            target_definition #> array['taxonomies', catalog.taxonomy_key]
          ) as candidate_entry(value)
          where candidate_entry.value ->> 'code' = catalog.code
            and (candidate_entry.value ->> 'semanticKey') is distinct from catalog.semantic_key
        )
      )
  ) or exists (
    select 1
    from public.workflow_taxonomy_values as catalog
    join lateral pg_catalog.jsonb_array_elements(
      target_definition #> array['taxonomies', catalog.taxonomy_key]
    ) as candidate_entry(value) on true
    where catalog.tenant_id = target_tenant_id
      and catalog.company_id = target_company_id
      and catalog.workflow_key = 'vqh.stage01'
      and catalog.taxonomy_key = any(taxonomy_keys)
      and catalog.semantic_key is not null
      and candidate_entry.value ? 'semanticKey'
      and candidate_entry.value ->> 'semanticKey' = catalog.semantic_key
      and candidate_entry.value ->> 'code' is distinct from catalog.code
  ) then
    raise exception using errcode = 'P0001', message = 'STAGE01_DEFINITION_CONFIG_INVALID';
  end if;

  insert into public.workflow_taxonomy_values as catalog (
    tenant_id, company_id, workflow_key, taxonomy_key, code, label, semantic_key,
    behavior, is_active, updated_at
  )
  select
    target_tenant_id,
    target_company_id,
    'vqh.stage01',
    taxonomy.taxonomy_key,
    entry.value ->> 'code',
    entry.value ->> 'label',
    entry.value ->> 'semanticKey',
    coalesce(entry.value -> 'behavior', '{}'::jsonb),
    true,
    pg_catalog.statement_timestamp()
  from pg_catalog.jsonb_each(target_definition -> 'taxonomies') as taxonomy(taxonomy_key, values_json)
  cross join lateral pg_catalog.jsonb_array_elements(taxonomy.values_json) as entry(value)
  on conflict (company_id, workflow_key, taxonomy_key, code) do update
    set label = excluded.label,
        semantic_key = coalesce(catalog.semantic_key, excluded.semantic_key),
        behavior = excluded.behavior,
        is_active = true,
        updated_at = excluded.updated_at;

  update public.workflow_taxonomy_values as catalog
     set is_active = false,
         updated_at = pg_catalog.statement_timestamp()
   where catalog.tenant_id = target_tenant_id
     and catalog.company_id = target_company_id
     and catalog.workflow_key = 'vqh.stage01'
     and catalog.taxonomy_key = any(taxonomy_keys)
     and catalog.semantic_key is null
     and catalog.is_active
     and not exists (
       select 1
       from pg_catalog.jsonb_array_elements(
         target_definition #> array['taxonomies', catalog.taxonomy_key]
       ) as published_entry(value)
       where published_entry.value ->> 'code' = catalog.code
     );
end;
$$;

revoke all on function private.sync_stage01_config_taxonomy_values(uuid, uuid, jsonb)
  from public, anon, authenticated;

do $$
declare
  before_row_count bigint;
  before_fingerprint text;
  after_row_count bigint;
  after_fingerprint text;
begin
  select row_count, fingerprint
    into before_row_count, before_fingerprint
    from workflow_taxonomy_values_pretransition_checkpoint;

  select
    count(*)::bigint,
    encode(
      extensions.digest(
        coalesce(
          string_agg(
            jsonb_build_array(
              id, tenant_id, company_id, taxonomy_key, code, label,
              semantic_key, behavior, is_active,
              to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
              to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
            )::text,
            E'\n'
            order by id, tenant_id, company_id, taxonomy_key, code, label,
              semantic_key, behavior::text, is_active, created_at, updated_at
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    )
    into after_row_count, after_fingerprint
    from public.workflow_taxonomy_values
   where workflow_key = 'vqh.stage01';

  if after_row_count is distinct from before_row_count
     or after_fingerprint is distinct from before_fingerprint
     or exists (
       select 1
       from public.workflow_taxonomy_values
       where workflow_key is distinct from 'vqh.stage01'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'WORKFLOW_TAXONOMY_VALUES_TRANSITION_MISMATCH';
  end if;
end;
$$;
