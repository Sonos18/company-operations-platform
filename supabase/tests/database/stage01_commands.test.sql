begin;

do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.create_stage01_opportunity(uuid,jsonb,uuid)',
    'public.update_opportunity_current_data(uuid,uuid,jsonb,uuid)',
    'public.create_contact(uuid,jsonb,uuid)',
    'public.update_contact(uuid,uuid,jsonb,uuid)',
    'public.add_contact_method(uuid,uuid,jsonb,uuid)',
    'public.update_contact_method(uuid,uuid,uuid,jsonb,uuid)',
    'public.link_opportunity_contact(uuid,uuid,jsonb,uuid)',
    'public.set_opportunity_primary_contact(uuid,uuid,jsonb,uuid)',
    'public.end_opportunity_contact(uuid,uuid,uuid,jsonb,uuid)',
    'public.add_opportunity_scope(uuid,uuid,jsonb,uuid)',
    'public.retire_opportunity_scope(uuid,uuid,uuid,jsonb,uuid)',
    'public.add_opportunity_referrer(uuid,uuid,jsonb,uuid)',
    'public.set_opportunity_primary_referrer(uuid,uuid,jsonb,uuid)',
    'public.end_opportunity_referrer(uuid,uuid,uuid,jsonb,uuid)',
    'public.append_opportunity_intake_record(uuid,uuid,jsonb,uuid)',
    'public.correct_opportunity_intake_record(uuid,uuid,uuid,jsonb,uuid)',
    'public.raise_opportunity_duplicate_concern(uuid,uuid,jsonb,uuid)'
  ] loop
    if to_regprocedure(function_signature) is null then
      raise exception 'DB-S01-CMD missing function %', function_signature;
    end if;
  end loop;
end $$;

insert into auth.users (id, email) values
  ('55000000-0000-4000-8000-000000000001', 'stage01-commands@test.invalid');

insert into public.tenants (id, code, name) values
  ('55000000-0000-4000-8000-000000000010', 'stage01-commands', 'Stage 01 commands test');

insert into public.companies (id, tenant_id, code, name) values
  ('55000000-0000-4000-8000-000000000020', '55000000-0000-4000-8000-000000000010', 'S01-CMD', 'Stage 01 commands company');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000010', '55000000-0000-4000-8000-000000000020', array['member']);

insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
  (
    '55000000-0000-4000-8000-000000000100', '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'stage01_command_actor',
    'Stage 01 command actor', 'Test-only Opportunity command role', false
  );

insert into public.role_permissions (role_id, permission_code) values
  ('55000000-0000-4000-8000-000000000100', 'opportunity.update'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.contact.manage'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.scope.manage'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.referrer.manage'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.intake_record.create'),
  ('55000000-0000-4000-8000-000000000100', 'opportunity.duplicate.raise');

insert into public.company_role_assignments (
  tenant_id, company_id, user_id, role_id, granted_by, grant_reason
) values (
  '55000000-0000-4000-8000-000000000010', '55000000-0000-4000-8000-000000000020',
  '55000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000100',
  '55000000-0000-4000-8000-000000000001', 'Stage 01 command fixture'
);

insert into public.opportunities (id, tenant_id, company_id, primary_customer_name, created_by) values
  (
    '55000000-0000-4000-8000-000000000030', '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'Command Opportunity',
    '55000000-0000-4000-8000-000000000001'
  ),
  (
    '55000000-0000-4000-8000-000000000031', '55000000-0000-4000-8000-000000000010',
    '55000000-0000-4000-8000-000000000020', 'Suspected duplicate',
    '55000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  company_id constant uuid := '55000000-0000-4000-8000-000000000020';
  opportunity_id constant uuid := '55000000-0000-4000-8000-000000000030';
  result jsonb;
  first_contact_id uuid;
  second_contact_id uuid;
  scope_id uuid;
  current_referrer_id uuid;
  intake_id uuid;
begin
  result := public.create_contact(
    company_id, '{"displayName":"Primary contact"}'::jsonb,
    '55000000-0000-4000-8000-000000000201'
  );
  first_contact_id := (result ->> 'contactId')::uuid;

  perform public.add_contact_method(
    company_id, first_contact_id,
    '{"methodType":"phone","value":"0900000000","isUsable":true,"reliabilityState":"disputed","expectedContactVersion":0}'::jsonb,
    '55000000-0000-4000-8000-000000000202'
  );

  begin
    perform public.update_contact(
      company_id, first_contact_id,
      '{"displayName":"Stale update","expectedContactVersion":0}'::jsonb,
      '55000000-0000-4000-8000-000000000203'
    );
    raise exception 'DB-S01-CMD stale Contact mutation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  perform public.update_contact(
    company_id, first_contact_id,
    '{"displayName":"Primary contact updated","expectedContactVersion":1}'::jsonb,
    '55000000-0000-4000-8000-000000000204'
  );

  result := public.create_contact(
    company_id, '{"displayName":"Replacement contact"}'::jsonb,
    '55000000-0000-4000-8000-000000000205'
  );
  second_contact_id := (result ->> 'contactId')::uuid;

  perform public.update_opportunity_current_data(
    company_id, opportunity_id,
    '{"needDescription":"A governed command update","expectedOpportunityVersion":0}'::jsonb,
    '55000000-0000-4000-8000-000000000206'
  );

  perform public.set_opportunity_primary_contact(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'contactId', first_contact_id, 'relationshipCode', 'decision_maker',
      'reliabilityState', 'disputed', 'expectedOpportunityVersion', 1
    ),
    '55000000-0000-4000-8000-000000000207'
  );

  perform public.set_opportunity_primary_contact(
    company_id, opportunity_id,
    pg_catalog.jsonb_build_object(
      'contactId', second_contact_id, 'relationshipCode', 'decision_maker',
      'expectedOpportunityVersion', 2
    ),
    '55000000-0000-4000-8000-000000000208'
  );

  begin
    perform public.set_opportunity_primary_contact(
      company_id, opportunity_id,
      pg_catalog.jsonb_build_object(
        'contactId', first_contact_id, 'relationshipCode', 'stale',
        'expectedOpportunityVersion', 2
      ),
      '55000000-0000-4000-8000-000000000209'
    );
    raise exception 'DB-S01-CMD stale Opportunity mutation unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'VERSION_CONFLICT' then raise; end if;
  end;

  result := public.add_opportunity_scope(
    company_id, opportunity_id,
    '{"scopeCode":"design","reliabilityState":"unverified","expectedOpportunityVersion":3}'::jsonb,
    '55000000-0000-4000-8000-000000000210'
  );
  scope_id := (result ->> 'scopeId')::uuid;

  perform public.retire_opportunity_scope(
    company_id, opportunity_id, scope_id,
    '{"retireReason":"Scope replaced","expectedOpportunityVersion":4}'::jsonb,
    '55000000-0000-4000-8000-000000000211'
  );

  begin
    perform public.retire_opportunity_scope(
      company_id, opportunity_id, scope_id,
      '{"retireReason":"Second retirement","expectedOpportunityVersion":5}'::jsonb,
      '55000000-0000-4000-8000-000000000212'
    );
    raise exception 'DB-S01-CMD repeated retirement unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'STAGE01_RESOURCE_ALREADY_RETIRED' then raise; end if;
  end;

  perform public.add_opportunity_referrer(
    company_id, opportunity_id,
    '{"referrerTypeCode":"partner","displayName":"Initial referrer","isPrimary":true,"expectedOpportunityVersion":5}'::jsonb,
    '55000000-0000-4000-8000-000000000213'
  );

  result := public.set_opportunity_primary_referrer(
    company_id, opportunity_id,
    '{"referrerTypeCode":"partner","displayName":"Replacement referrer","expectedOpportunityVersion":6}'::jsonb,
    '55000000-0000-4000-8000-000000000214'
  );
  current_referrer_id := (result ->> 'referrerId')::uuid;

  perform public.end_opportunity_referrer(
    company_id, opportunity_id, current_referrer_id,
    '{"endReason":"No longer active","expectedOpportunityVersion":7}'::jsonb,
    '55000000-0000-4000-8000-000000000215'
  );

  result := public.append_opportunity_intake_record(
    company_id, opportunity_id,
    '{"channelCode":"phone","summary":"Original intake","expectedOpportunityVersion":8}'::jsonb,
    '55000000-0000-4000-8000-000000000216'
  );
  intake_id := (result ->> 'intakeRecordId')::uuid;

  perform public.correct_opportunity_intake_record(
    company_id, opportunity_id, intake_id,
    '{"channelCode":"phone","summary":"Corrected intake","correctionReason":"Clarified wording","expectedOpportunityVersion":9}'::jsonb,
    '55000000-0000-4000-8000-000000000217'
  );

  perform public.raise_opportunity_duplicate_concern(
    company_id, opportunity_id,
    '{"suspectedDuplicateOpportunityId":"55000000-0000-4000-8000-000000000031","description":"Possible same need","expectedOpportunityVersion":10}'::jsonb,
    '55000000-0000-4000-8000-000000000218'
  );

  begin
    perform public.update_opportunity_current_data(
      company_id, opportunity_id,
      '{"unexpectedField":true,"expectedOpportunityVersion":11}'::jsonb,
      '55000000-0000-4000-8000-000000000219'
    );
    raise exception 'DB-S01-CMD unknown command key unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end $$;

reset role;

do $$
begin
  if (select version from public.opportunities where id = '55000000-0000-4000-8000-000000000030') <> 11 then
    raise exception 'DB-S01-CMD Opportunity version sequence is incorrect';
  end if;
  if (select count(*) from public.opportunity_contacts
      where opportunity_id = '55000000-0000-4000-8000-000000000030' and is_primary and ended_at is null) <> 1 then
    raise exception 'DB-S01-CMD Primary Contact replacement is not atomic';
  end if;
  if (select count(*) from public.opportunity_referrers
      where opportunity_id = '55000000-0000-4000-8000-000000000030' and is_primary and ended_at is null) <> 0 then
    raise exception 'DB-S01-CMD Referrer end lifecycle is incorrect';
  end if;
  if (select count(*) from public.opportunity_intake_records
      where opportunity_id = '55000000-0000-4000-8000-000000000030') <> 2 then
    raise exception 'DB-S01-CMD Intake correction did not append a second record';
  end if;
  if not exists (
    select 1 from public.opportunity_intake_records
    where opportunity_id = '55000000-0000-4000-8000-000000000030'
      and correction_of_record_id is not null
      and correction_reason = 'Clarified wording'
  ) then
    raise exception 'DB-S01-CMD Intake correction linkage is missing';
  end if;
  if (select count(*) from public.audit_events
      where company_id = '55000000-0000-4000-8000-000000000020'
        and action like 'opportunity.%') < 10 then
    raise exception 'DB-S01-CMD Opportunity command audit evidence is incomplete';
  end if;
end $$;

select 'PASS DB-S01-CMD Task 8 Opportunity commands' as result;

rollback;
