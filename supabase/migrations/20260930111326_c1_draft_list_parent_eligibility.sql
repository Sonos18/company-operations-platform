set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_catalog.pg_advisory_xact_lock(71842, 28);

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
