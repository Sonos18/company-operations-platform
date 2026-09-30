set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,6);

do $$ begin
  if to_regprocedure('private.c1_legacy_parent_correction_detail_metadata()') is null then
    raise exception using errcode='P0001',message='C1_LEGACY_CORRECTION_BASELINE_MISSING';
  end if;
end $$;

create or replace function private.c1_legacy_parent_correction_detail_metadata()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.action='c1.project_cost_item.corrected' and new.resource_type='project_cost_item' and new.request_id is not null then
    update public.project_cost_item_details detail
    set publication_state='published',publication_origin='command',published_by=new.actor_id,published_at=new.created_at,publication_request_id=new.request_id,version=detail.version+1,updated_at=now()
    where detail.project_cost_item_id=new.resource_id::uuid and detail.tenant_id=new.tenant_id and detail.company_id=new.company_id
      and detail.publication_state='published'
      and exists (
        select 1 from jsonb_array_elements(coalesce(new.after_summary->'details','[]'::jsonb)) snapshot
        where snapshot->>'id'=detail.id::text
      )
      and not exists (
        select 1 from jsonb_array_elements(coalesce(new.before_summary->'details','[]'::jsonb)) snapshot
        where snapshot->>'id'=detail.id::text
      );
  end if;
  return new;
end;
$$;
