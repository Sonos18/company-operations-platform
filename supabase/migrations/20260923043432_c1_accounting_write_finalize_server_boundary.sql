set local lock_timeout='5s';
set local statement_timeout='90s';
select pg_catalog.pg_advisory_xact_lock(71842,14);

create function public.c1_finalize_cost_evidence_server(target_actor_id uuid,target_company_id uuid,target_id uuid,target_input jsonb,target_idempotency_key uuid,target_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='P0001',message='PERMISSION_DENIED';
  end if;
  if target_actor_id is null then
    raise exception using errcode='P0001',message='INPUT_INVALID';
  end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',target_actor_id,'role','authenticated')::text,true);
  return private.c1_finalize_cost_evidence(target_company_id,target_id,target_input,target_idempotency_key,target_request_id);
end;
$$;

revoke all on function public.c1_finalize_cost_evidence(uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.c1_finalize_cost_evidence_server(uuid,uuid,uuid,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.c1_finalize_cost_evidence_server(uuid,uuid,uuid,jsonb,uuid,uuid) to service_role;

notify pgrst,'reload schema';
