-- Amendment 40: restore Final Decision recommendation lineage and override
-- invariants without changing the immutable A25/A31 migrations or authority policy.
create or replace function private.guard_stage01_decision_cycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_record jsonb;
  new_record jsonb;
  recommendation_value text;
  recommendation_outcome text;
  mutable_fields text[] := array[
    'decision_authority_user_id', 'authority_resolution_reference', 'authority_resolution_event_id', 'decision_policy_snapshot_id',
    'final_outcome', 'final_decision_by', 'final_decision_at', 'final_rationale', 'final_recommendation_id', 'override_rationale', 'version'
  ];
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  old_record := to_jsonb(old);
  new_record := to_jsonb(new);

  if (old_record - mutable_fields) is distinct from (new_record - mutable_fields) then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  if old.final_outcome is not null and old_record is distinct from new_record then
    raise exception using errcode = 'P0001', message = 'STAGE01_HISTORY_IMMUTABLE';
  end if;

  if old.decision_policy_snapshot_id is not null
     and old.decision_policy_snapshot_id is distinct from new.decision_policy_snapshot_id then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_POINTER_IMMUTABLE';
  end if;

  if old.decision_policy_snapshot_id is distinct from new.decision_policy_snapshot_id and (
    new.decision_policy_snapshot_id is null or not exists (
      select 1
      from public.opportunity_decision_policy_snapshots policy
      where policy.id = new.decision_policy_snapshot_id
        and policy.tenant_id = new.tenant_id
        and policy.company_id = new.company_id
        and policy.policy_key = 'opportunity.decision_authority'
        and policy.status = 'published'
        and policy.published_at is not null
        and policy.approved_at is not null
    )
  ) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_POLICY_POINTER_INVALID';
  end if;

  if (old.decision_authority_user_id, old.authority_resolution_event_id, old.authority_resolution_reference)
       is distinct from (new.decision_authority_user_id, new.authority_resolution_event_id, new.authority_resolution_reference)
     and ((new.decision_authority_user_id is null)::int
        + (new.authority_resolution_event_id is null)::int
        + (new.authority_resolution_reference is null)::int) not in (0, 3) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_POINTER_INVALID';
  end if;

  if new.authority_resolution_event_id is not null and not exists (
    select 1
    from public.opportunity_decision_authority_events authority_event
    where authority_event.id = new.authority_resolution_event_id
      and authority_event.tenant_id = new.tenant_id
      and authority_event.company_id = new.company_id
      and authority_event.opportunity_id = new.opportunity_id
      and authority_event.decision_cycle_id = new.id
      and authority_event.authority_user_id = new.decision_authority_user_id
      and new.authority_resolution_reference = authority_event.id::text
  ) then
    raise exception using errcode = 'P0001', message = 'OPPORTUNITY_DECISION_AUTHORITY_POINTER_INVALID';
  end if;

  if new.final_outcome is not null then
    select recommendation.recommendation
    into recommendation_value
    from public.stage01_recommendations recommendation
    where recommendation.id = new.final_recommendation_id
      and recommendation.decision_cycle_id = new.id
      and recommendation.tenant_id = new.tenant_id
      and recommendation.company_id = new.company_id;

    if recommendation_value is null then
      raise exception using
        errcode = 'P0001',
        message = 'STAGE01_FINAL_RECOMMENDATION_CYCLE_MISMATCH';
    end if;

    recommendation_outcome := case recommendation_value
      when 'recommend_proceed' then 'proceed'
      when 'recommend_not_proceeding' then 'not_proceeding'
    end;

    if new.final_outcome = recommendation_outcome then
      if new.override_rationale is not null then
        raise exception using errcode = 'P0001', message = 'STAGE01_DECISION_OVERRIDE_INVALID';
      end if;
    elsif nullif(pg_catalog.btrim(new.override_rationale), '') is null then
      raise exception using errcode = 'P0001', message = 'STAGE01_OVERRIDE_RATIONALE_REQUIRED';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_stage01_decision_cycle() from public, anon, authenticated;
