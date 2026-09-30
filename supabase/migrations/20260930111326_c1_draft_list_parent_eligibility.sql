set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 28);

-- Deployment preflight only: the Sep 18 opening-balance backfill could not
-- cover parents written by the parent-and-sources-only command before Sep 22.
-- publication_origin is provenance, not an exemption from aggregate integrity.
-- Do not normalize unknown history here: preserve balances and require review.
do $c1_cost_history_preflight$
declare
  v_report jsonb;
begin
  with mismatches as (
    select item.id, item.tenant_id, item.company_id, item.project_id,
      item.amount_text as parent_amount, item.amount as stored_parent_amount,
      totals.published_amount, totals.published_count, totals.unprepared_count
    from public.project_cost_items item
    cross join lateral (
      select coalesce(sum(detail.amount_text::numeric), 0) as published_amount,
        count(*) as published_count,
        count(*) filter (where detail.amount_text is null) as unprepared_count
      from public.project_cost_item_details detail
      where detail.project_cost_item_id = item.id
        and detail.tenant_id = item.tenant_id
        and detail.company_id = item.company_id
        and detail.publication_state = 'published'
    ) totals
    where item.publication_state = 'published'
      and (item.amount_text::numeric is distinct from totals.published_amount
        or item.amount is distinct from totals.published_amount
        or totals.unprepared_count > 0)
  )
  select jsonb_build_object(
    'mismatchCount', coalesce(max(sample.total_count), 0),
    'sample', coalesce(jsonb_agg(jsonb_build_object(
      'parentId', sample.id, 'tenantId', sample.tenant_id,
      'companyId', sample.company_id, 'projectId', sample.project_id,
      'parentAmount', sample.parent_amount,
      'storedParentAmount', sample.stored_parent_amount::text,
      'publishedDetailAmount', sample.published_amount::text,
      'publishedDetailCount', sample.published_count,
      'unpreparedPublishedDetailCount', sample.unprepared_count
    ) order by sample.tenant_id, sample.company_id, sample.id), '[]'::jsonb)
  ) into v_report
  from (
    select mismatches.*, count(*) over () as total_count
    from mismatches
    order by tenant_id, company_id, id
    limit 20
  ) sample;

  if (v_report->>'mismatchCount')::bigint > 0 then
    raise exception using errcode = 'P0001',
      message = 'C1_PUBLISHED_COST_HISTORY_REQUIRES_REVIEW',
      detail = v_report::text,
      hint = 'Stop rollout. Review the scoped parent IDs and original sources; obtain approval for an audited opening-balance/detail repair, then rerun the preflight. Do not zero parent balances or exempt legacy_backfill. Sample limited to 20; mismatchCount includes all affected parents.';
  end if;
end;
$c1_cost_history_preflight$;

do $$
begin
  if to_regprocedure('private.c1_list_project_cost_detail_drafts(uuid,uuid,boolean)') is null
    or to_regprocedure('private.c1_read_project_cost_detail_draft(uuid,uuid,boolean)') is null then
    raise exception using errcode = 'P0001', message = 'C1_DRAFT_LIST_PARENT_ELIGIBILITY_BASELINE_MISSING';
  end if;
end;
$$;

create or replace function private.c1_list_project_cost_detail_drafts(
  target_company_id uuid, target_project_id uuid, target_operational boolean
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_context jsonb;
begin
  v_context := private.c1_detail_context(target_company_id,
    case when target_operational then 'cost.manage' else 'cost.prepare' end);

  -- Match the reader's eligibility before invoking it. Prepared children of a
  -- legacy parent draft belong to that lifecycle, not the ordinary detail list.
  return coalesce((
    select jsonb_agg(
      private.c1_read_project_cost_detail_draft(target_company_id, detail.id, target_operational)
      order by detail.created_at, detail.id
    )
    from public.project_cost_item_details detail
    join public.project_cost_items item
      on item.id = detail.project_cost_item_id
      and item.tenant_id = detail.tenant_id
      and item.company_id = detail.company_id
    join public.cost_categories category
      on category.id = item.cost_category_id
      and category.tenant_id = item.tenant_id
      and category.company_id = item.company_id
    where detail.tenant_id = (v_context->>'tenantId')::uuid
      and detail.company_id = target_company_id
      and item.project_id = target_project_id
      and item.publication_state = 'published'
      and detail.publication_state = 'draft'
  ), '[]'::jsonb);
end;
$$;
