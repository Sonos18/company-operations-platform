BEGIN;

do $$
begin
  if has_function_privilege('public', 'public.get_stage01_opportunity_create_options(uuid)', 'execute')
     or has_function_privilege('anon', 'public.get_stage01_opportunity_create_options(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_stage01_opportunity_create_options(uuid)', 'execute') then
    raise exception 'DB-S01-CREATE-OPTIONS function execute contract mismatch';
  end if;
end $$;

insert into auth.users (id, email) values
  ('63000000-0000-4000-8000-000000000001', 'stage01-create-options-both@test.invalid'),
  ('63000000-0000-4000-8000-000000000002', 'stage01-create-options-read@test.invalid'),
  ('63000000-0000-4000-8000-000000000003', 'stage01-create-options-create@test.invalid'),
  ('63000000-0000-4000-8000-000000000004', 'stage01-create-options-config@test.invalid');

insert into public.tenants (id, code, name) values
  ('63000000-0000-4000-8000-000000000010', 'stage01-create-options', 'Stage 01 create options tenant');

insert into public.companies (id, tenant_id, code, name) values
  ('63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000010', 'S01-CREATE-OPTIONS', 'Stage 01 create options company');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000010', array['member']),
  ('63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000010', array['member']),
  ('63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000010', array['member']),
  ('63000000-0000-4000-8000-000000000004', '63000000-0000-4000-8000-000000000010', array['member']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', array['member']),
  ('63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', array['member']),
  ('63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', array['member']),
  ('63000000-0000-4000-8000-000000000004', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', array['member']);

insert into public.roles (id, tenant_id, company_id, code, name, description, is_system) values
  ('63000000-0000-4000-8000-000000000101', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', 'create_options_both', 'Create options both', 'Test fixture role', false),
  ('63000000-0000-4000-8000-000000000102', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', 'create_options_read', 'Create options read', 'Test fixture role', false),
  ('63000000-0000-4000-8000-000000000103', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', 'create_options_create', 'Create options create', 'Test fixture role', false),
  ('63000000-0000-4000-8000-000000000104', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', 'create_options_config', 'Create options config', 'Test fixture role', false);

insert into public.role_permissions (role_id, permission_code) values
  ('63000000-0000-4000-8000-000000000101', 'opportunity.read'),
  ('63000000-0000-4000-8000-000000000101', 'opportunity.create'),
  ('63000000-0000-4000-8000-000000000102', 'opportunity.read'),
  ('63000000-0000-4000-8000-000000000103', 'opportunity.create'),
  ('63000000-0000-4000-8000-000000000104', 'stage01.config.read');

insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000101', '63000000-0000-4000-8000-000000000001', 'Create options both fixture'),
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000102', '63000000-0000-4000-8000-000000000002', 'Create options read fixture'),
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000103', '63000000-0000-4000-8000-000000000003', 'Create options create fixture'),
  ('63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', '63000000-0000-4000-8000-000000000004', '63000000-0000-4000-8000-000000000104', '63000000-0000-4000-8000-000000000004', 'Create options config fixture');

insert into public.workflow_definition_snapshots (id, tenant_id, company_id, workflow_key, template_version, schema_version, definition, definition_hash) values
  ('63000000-0000-4000-8000-000000000030', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', 'vqh.stage01', 1, 1,
   '{"taxonomies":{"customer_type":[{"code":"old_customer","label":"Old customer","semanticKey":"hidden"}],"lead_source":[{"code":"old_referral","label":"Old referral","behavior":{"requiresReferrer":false,"hidden":"no"}}],"engagement_status":[{"code":"old_active","label":"Old active"}],"budget_status":[{"code":"old_unknown","label":"Old unknown"}],"timeline_status":[{"code":"old_unknown","label":"Old unknown"}],"priority":[{"code":"old_normal","label":"Old normal"}],"scope":[{"code":"hidden_scope","label":"Hidden scope"}]},"criteria":[{"key":"hidden"}],"system":{"nodes":[{"key":"hidden"}]}}'::jsonb, 'create-options-v1'),
  ('63000000-0000-4000-8000-000000000031', '63000000-0000-4000-8000-000000000010', '63000000-0000-4000-8000-000000000020', 'vqh.stage01', 2, 1,
   '{"taxonomies":{"customer_type":[{"code":"customer","label":"Khách hàng","semanticKey":"customer_hidden"}],"lead_source":[{"code":"referral","label":"Giới thiệu","behavior":{"requiresReferrer":true,"hidden":"no"}}],"engagement_status":[{"code":"active","label":"Đang trao đổi"}],"budget_status":[{"code":"unknown","label":"Chưa xác định"}],"timeline_status":[{"code":"unknown","label":"Chưa xác định"}],"priority":[{"code":"normal","label":"Bình thường"}],"scope":[{"code":"hidden_scope","label":"Hidden scope"}]},"criteria":[{"key":"hidden"}],"system":{"nodes":[{"key":"hidden"}]}}'::jsonb, 'create-options-v2');

insert into public.workflow_definition_drafts (
  id, tenant_id, company_id, workflow_key, base_snapshot_id, definition, version,
  created_by, updated_by
) values (
  '63000000-0000-4000-8000-000000000032',
  '63000000-0000-4000-8000-000000000010',
  '63000000-0000-4000-8000-000000000020',
  'vqh.stage01',
  '63000000-0000-4000-8000-000000000031',
  '{"taxonomies":{"customer_type":[{"code":"draft_customer","label":"Draft customer"}]},"criteria":[{"key":"draft_only"}]}'::jsonb,
  3,
  '63000000-0000-4000-8000-000000000004',
  '63000000-0000-4000-8000-000000000004'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare result jsonb;
begin
  select public.get_stage01_opportunity_create_options('63000000-0000-4000-8000-000000000020') into result;
  if result <> '{"workflowKey":"vqh.stage01","publishedSnapshotId":"63000000-0000-4000-8000-000000000031","taxonomies":{"customer_type":[{"code":"customer","label":"Khách hàng"}],"lead_source":[{"code":"referral","label":"Giới thiệu","behavior":{"requiresReferrer":true}}],"engagement_status":[{"code":"active","label":"Đang trao đổi"}],"budget_status":[{"code":"unknown","label":"Chưa xác định"}],"timeline_status":[{"code":"unknown","label":"Chưa xác định"}],"priority":[{"code":"normal","label":"Bình thường"}]}}'::jsonb
     or result ? 'draft' or result::text like '%semanticKey%' or result::text like '%hidden_scope%' or result::text like '%criteria%' then
    raise exception 'DB-S01-CREATE-OPTIONS did not return the exact latest narrow payload';
  end if;
  if (select count(*) from public.workflow_definition_snapshots) <> 0
     or (select count(*) from public.workflow_definition_drafts) <> 0 then
    raise exception 'DB-S01-CREATE-OPTIONS operational creator gained direct config access';
  end if;
end $$;
reset role;

do $$
begin
  if not exists (
    select 1
      from public.workflow_definition_drafts
     where id = '63000000-0000-4000-8000-000000000032'
       and definition = '{"taxonomies":{"customer_type":[{"code":"draft_customer","label":"Draft customer"}]},"criteria":[{"key":"draft_only"}]}'::jsonb
  ) then
    raise exception 'DB-S01-CREATE-OPTIONS privileged inspection could not find non-empty draft fixture';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.get_stage01_opportunity_create_options('63000000-0000-4000-8000-000000000020');
    raise exception 'DB-S01-CREATE-OPTIONS read-only actor unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.get_stage01_opportunity_create_options('63000000-0000-4000-8000-000000000020');
    raise exception 'DB-S01-CREATE-OPTIONS create-only actor unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
  end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$ begin
  begin
    perform public.get_stage01_opportunity_create_options('63000000-0000-4000-8000-000000000020');
    raise exception 'DB-S01-CREATE-OPTIONS config-only actor unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PERMISSION_DENIED' then raise; end if;
  end;
  if (select count(*) from public.workflow_definition_snapshots) <> 2
     or (select count(*) from public.workflow_definition_drafts) <> 1 then
    raise exception 'DB-S01-CREATE-OPTIONS existing config direct-read policy changed';
  end if;
end $$;
reset role;

select 'PASS DB-S01-CREATE-OPTIONS narrow RPC authorization and payload contract' as result;

ROLLBACK;
