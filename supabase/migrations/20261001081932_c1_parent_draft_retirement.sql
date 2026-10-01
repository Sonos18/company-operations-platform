-- Forward-only Cloud DEV migration. Authored locally; NOT APPLIED.
-- Target at apply: gtgljlnhwvhqdnwrfdfj. Requires separate apply approval.
-- Before converting to a new forward migration: verify current main, the
-- project identity through the repository's guarded Cloud DEV runner, a
-- restorable backup, and captured function definitions/identity signatures,
-- owner, ACL, security mode, volatility and search_path. The database name
-- 'postgres' is common to Supabase projects and is NOT a project identity check.
-- Owner reports no external legacy parent-draft clients. Still quiesce all
-- parent-write ingress and drain in-flight calls before apply. If direct RPC
-- ingress cannot be quiesced, do not run this migration.
-- Restore order is private helpers, private implementations, public wrappers;
-- restore original owner, security mode, volatility, search_path and exact ACL
-- (including authenticated/service_role) afterward.
-- Do not paste captured definitions or credentials into this draft.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 29);
-- Unlike the advisory lock, this conflicts with ordinary parent INSERT/UPDATE/
-- DELETE writers. Acquire it BEFORE checking for drafts, and hold through
-- commit. Existing conflicting writers finish first; new writers wait. The
-- lock alone does not drain a function call that has not yet touched the table.
-- Verified ingress quiescence and drain remain mandatory.
lock table public.project_cost_items in share row exclusive mode;

do $preflight$
declare
  signatures text[] := array[
    'public.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid)',
    'public.c1_update_project_cost_draft(uuid,uuid,jsonb,uuid)',
    'public.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid)',
    'public.c1_read_project_cost_draft(uuid,uuid)',
    'public.c1_list_project_cost_drafts(uuid,uuid)',
    'public.c1_read_project_cost_draft_operational(uuid,uuid)',
    'public.c1_list_project_cost_drafts_operational(uuid,uuid)',
    'public.c1_publish_project_cost(uuid,uuid,bigint,uuid,uuid)',
    'public.c1_create_project_cost_item(uuid,jsonb,uuid,uuid)',
    'public.c1_update_project_cost_item(uuid,uuid,jsonb,uuid)',
    'private.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid)',
    'private.c1_update_project_cost_draft(uuid,uuid,jsonb,uuid)',
    'private.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid)',
    'private.c1_read_project_cost_draft(uuid,uuid)',
    'private.c1_list_project_cost_drafts(uuid,uuid)',
    'private.c1_read_project_cost_draft_operational(uuid,uuid)',
    'private.c1_list_project_cost_drafts_operational(uuid,uuid)',
    'private.c1_publish_project_cost(uuid,uuid,bigint,uuid,uuid)',
    'private.c1_project_cost_draft_json(uuid,uuid,uuid)',
    'private.c1_project_cost_draft_operational_json(uuid,uuid,uuid)',
    'private.c1_project_cost_publish_readiness(uuid,uuid,uuid)'
  ];
  -- The two older private functions are deliberately retained. No other
  -- overload with a target name is accepted without redesign.
  retained_same_name_signatures text[] := array[
    'private.c1_create_project_cost_item(uuid,jsonb,uuid,uuid)',
    'private.c1_update_project_cost_item(uuid,uuid,jsonb,uuid)'
  ];
  names text[] := array[
    'c1_create_project_cost_draft', 'c1_update_project_cost_draft',
    'c1_prepare_project_cost_financials', 'c1_read_project_cost_draft',
    'c1_list_project_cost_drafts', 'c1_read_project_cost_draft_operational',
    'c1_list_project_cost_drafts_operational', 'c1_publish_project_cost',
    'c1_create_project_cost_item', 'c1_update_project_cost_item',
    'c1_project_cost_draft_json', 'c1_project_cost_draft_operational_json',
    'c1_project_cost_publish_readiness'
  ];
  target_oids oid[];
  allowed_oids oid[];
  signature text;
  name text;
  unexpected text;
begin
  foreach signature in array signatures loop
    if to_regprocedure(signature) is null then
      raise exception 'C1_RETIRE_MISSING_SIGNATURE: %', signature;
    end if;
  end loop;
  foreach signature in array retained_same_name_signatures loop
    if to_regprocedure(signature) is null then
      raise exception 'C1_RETIRE_EXPECTED_RETAINED_SIGNATURE_MISSING: %', signature;
    end if;
  end loop;
  select array_agg(to_regprocedure(s)::oid) into target_oids from unnest(signatures) s;
  select array_agg(to_regprocedure(s)::oid) into allowed_oids
  from unnest(signatures || retained_same_name_signatures) s;
  select n.nspname || '.' || p.proname || '(' ||
    pg_get_function_identity_arguments(p.oid) || ')' into unexpected
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private')
    and p.proname = any(names)
    and not (p.oid = any(allowed_oids))
  limit 1;
  if unexpected is not null then
    raise exception 'C1_RETIRE_UNEXPECTED_OVERLOAD: %', unexpected;
  end if;

  if exists (select 1 from public.project_cost_items where publication_state = 'draft') then
    raise exception 'C1_RETIRE_PARENT_DRAFTS_PRESENT';
  end if;
  if exists (
    select 1 from public.project_cost_items item
    cross join lateral (
      select coalesce(sum(detail.amount_text::numeric), 0) as amount
      from public.project_cost_item_details detail
      where detail.tenant_id = item.tenant_id
        and detail.company_id = item.company_id
        and detail.project_cost_item_id = item.id
        and detail.publication_state = 'published'
    ) totals
    where item.publication_state = 'published'
      and (item.amount is distinct from totals.amount
        or item.amount_text::numeric is distinct from totals.amount)
  ) then
    raise exception 'C1_RETIRE_PUBLISHED_BALANCE_MISMATCH';
  end if;

  -- pg_depend does not enumerate all PL/pgSQL body calls. Check both catalog
  -- dependencies and visible names in non-target function source; RESTRICT
  -- is the final catalog guard. Dynamic names assembled from pieces remain
  -- outside this scan and require manual review.
  select pg_describe_object(d.classid,d.objid,d.objsubid) into unexpected
  from pg_depend d
  where d.refclassid = 'pg_proc'::regclass
    and d.refobjid = any(target_oids)
    and not (d.classid = 'pg_proc'::regclass and d.objid = any(target_oids))
  limit 1;
  if unexpected is not null then
    raise exception 'C1_RETIRE_UNEXPECTED_CATALOG_DEPENDENCY: %', unexpected;
  end if;

  foreach name in array names loop
    select n.nspname || '.' || p.proname into unexpected
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.prokind = 'f'
      and not (p.oid = any(target_oids))
      -- Regex treats underscores literally and allows whitespace before (.
      -- prosrc excludes the function's own declaration, so retained same-name
      -- functions are checked rather than silently skipped.
      and p.prosrc ~* ('(^|[^[:alnum:]_])' || name || '[[:space:]]*\(')
    limit 1;
    if unexpected is not null then
      raise exception 'C1_RETIRE_UNEXPECTED_BODY_CALLER: % calls %', unexpected, name;
    end if;
  end loop;

  if to_regprocedure('public.c1_correct_published_project_cost(uuid,uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('public.c1_read_project_cost_draft_management_metadata(uuid)') is null
    or to_regprocedure('public.c1_create_project_cost_detail_draft(uuid,jsonb,uuid,uuid)') is null
    or to_regprocedure('private.c1_sync_project_cost_item_amount(uuid)') is null then
    raise exception 'C1_RETIRE_REQUIRED_SURVIVOR_MISSING';
  end if;
end;
$preflight$;

-- Public entry points first. No CASCADE and no table or row deletion.
drop function public.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid) restrict;
drop function public.c1_update_project_cost_draft(uuid,uuid,jsonb,uuid) restrict;
drop function public.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid) restrict;
drop function public.c1_read_project_cost_draft(uuid,uuid) restrict;
drop function public.c1_list_project_cost_drafts(uuid,uuid) restrict;
drop function public.c1_read_project_cost_draft_operational(uuid,uuid) restrict;
drop function public.c1_list_project_cost_drafts_operational(uuid,uuid) restrict;
drop function public.c1_publish_project_cost(uuid,uuid,bigint,uuid,uuid) restrict;
drop function public.c1_create_project_cost_item(uuid,jsonb,uuid,uuid) restrict;
drop function public.c1_update_project_cost_item(uuid,uuid,jsonb,uuid) restrict;

drop function private.c1_create_project_cost_draft(uuid,jsonb,uuid,uuid) restrict;
drop function private.c1_update_project_cost_draft(uuid,uuid,jsonb,uuid) restrict;
drop function private.c1_prepare_project_cost_financials(uuid,uuid,jsonb,uuid) restrict;
drop function private.c1_read_project_cost_draft(uuid,uuid) restrict;
drop function private.c1_list_project_cost_drafts(uuid,uuid) restrict;
drop function private.c1_read_project_cost_draft_operational(uuid,uuid) restrict;
drop function private.c1_list_project_cost_drafts_operational(uuid,uuid) restrict;
drop function private.c1_publish_project_cost(uuid,uuid,bigint,uuid,uuid) restrict;

drop function private.c1_project_cost_draft_json(uuid,uuid,uuid) restrict;
drop function private.c1_project_cost_draft_operational_json(uuid,uuid,uuid) restrict;
drop function private.c1_project_cost_publish_readiness(uuid,uuid,uuid) restrict;

-- Shared parent/detail/correction triggers, metadata, history and tables stay.
notify pgrst, 'reload schema';
commit;
