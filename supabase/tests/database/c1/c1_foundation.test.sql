begin;

-- P1 Cloud acceptance fixture. It is intentionally transaction-scoped and uses
-- only reserved c100/c101 synthetic identities. It runs after the foundation
-- migration is applied; no fixture row may survive this rollback.
do $$
declare
  a_tenant constant uuid := 'c1000000-0000-4000-8000-000000000010';
  a1_company constant uuid := 'c1000000-0000-4000-8000-000000000020';
  a2_company constant uuid := 'c1000000-0000-4000-8000-000000000021';
  b_tenant constant uuid := 'c1010000-0000-4000-8000-000000000010';
  b1_company constant uuid := 'c1010000-0000-4000-8000-000000000020';
begin
  insert into auth.users(id,email) values
    ('c1000000-0000-4000-8000-000000000901','c1-project@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000902','c1-party@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000903','c1-engagement@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000904','c1-config@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000905','c1-cost-read@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000906','c1-no-permission@taskovia.invalid'),
    ('c1000000-0000-4000-8000-000000000907','c1-inactive@taskovia.invalid');
  insert into public.tenants(id,code,name) values (a_tenant,'c1-a','C1 tenant A'),(b_tenant,'c1-b','C1 tenant B');
  insert into public.companies(id,tenant_id,code,name) values (a1_company,a_tenant,'C1-A1','C1 company A1'),(a2_company,a_tenant,'C1-A2','C1 company A2'),(b1_company,b_tenant,'C1-B1','C1 company B1');
  insert into public.tenant_memberships(user_id,tenant_id,roles) values ('c1000000-0000-4000-8000-000000000901',a_tenant,array['member']),('c1000000-0000-4000-8000-000000000902',a_tenant,array['member']),('c1000000-0000-4000-8000-000000000903',a_tenant,array['member']),('c1000000-0000-4000-8000-000000000905',a_tenant,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values ('c1000000-0000-4000-8000-000000000901',a_tenant,a1_company,array['member'],true);
  insert into public.tenant_memberships(user_id,tenant_id,roles) values ('c1000000-0000-4000-8000-000000000906',a_tenant,array['member']),('c1000000-0000-4000-8000-000000000907',a_tenant,array['member']);
  insert into public.tenant_memberships(user_id,tenant_id,roles) values ('c1000000-0000-4000-8000-000000000904',a_tenant,array['member']);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values ('c1000000-0000-4000-8000-000000000906',a_tenant,a1_company,array['member'],true),('c1000000-0000-4000-8000-000000000907',a_tenant,a1_company,array['member'],false);
  insert into public.company_memberships(user_id,tenant_id,company_id,roles,is_active) values ('c1000000-0000-4000-8000-000000000904',a_tenant,a2_company,array['member'],true),('c1000000-0000-4000-8000-000000000902',a_tenant,a1_company,array['member'],true),('c1000000-0000-4000-8000-000000000903',a_tenant,a1_company,array['member'],true),('c1000000-0000-4000-8000-000000000904',a_tenant,a1_company,array['member'],true),('c1000000-0000-4000-8000-000000000905',a_tenant,a1_company,array['member'],true);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values ('c1000000-0000-4000-8000-000000000911',a_tenant,a1_company,'c1_project_manager','C1 project manager','Synthetic C1 project capability',false);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values ('c1000000-0000-4000-8000-000000000913',a_tenant,a1_company,'c1_party_manager','C1 party manager','Synthetic C1 party capability',false);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values ('c1000000-0000-4000-8000-000000000914',a_tenant,a1_company,'c1_engagement_manager','C1 engagement manager','Synthetic C1 engagement capability',false);
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values ('c1000000-0000-4000-8000-000000000915',a_tenant,a1_company,'c1_cost_config_manager','C1 cost config manager','Synthetic C1 config capability',false),('c1000000-0000-4000-8000-000000000916',a_tenant,a1_company,'c1_cost_read_only','C1 cost read only','Synthetic C1 catalog denial capability',false);
  insert into public.role_permissions(role_id,permission_code) values ('c1000000-0000-4000-8000-000000000911','project.register.manage');
  insert into public.role_permissions(role_id,permission_code) values ('c1000000-0000-4000-8000-000000000913','party.manage');
  insert into public.role_permissions(role_id,permission_code) values ('c1000000-0000-4000-8000-000000000914','engagement.manage');
  insert into public.role_permissions(role_id,permission_code) values ('c1000000-0000-4000-8000-000000000915','cost.config.manage'),('c1000000-0000-4000-8000-000000000916','cost.read');
  insert into public.roles(id,tenant_id,company_id,code,name,description,is_system) values ('c1000000-0000-4000-8000-000000000912',a_tenant,a2_company,'c1_project_manager_a2','C1 project manager A2','Synthetic C1 project capability',false);
  insert into public.role_permissions(role_id,permission_code) values ('c1000000-0000-4000-8000-000000000912','project.register.manage');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values (a_tenant,a1_company,'c1000000-0000-4000-8000-000000000901','c1000000-0000-4000-8000-000000000911','c1000000-0000-4000-8000-000000000901','Synthetic C1 fixture');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values (a_tenant,a1_company,'c1000000-0000-4000-8000-000000000901','c1000000-0000-4000-8000-000000000913','c1000000-0000-4000-8000-000000000901','Synthetic C1 fixture');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values (a_tenant,a1_company,'c1000000-0000-4000-8000-000000000901','c1000000-0000-4000-8000-000000000914','c1000000-0000-4000-8000-000000000901','Synthetic C1 fixture');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values (a_tenant,a1_company,'c1000000-0000-4000-8000-000000000902','c1000000-0000-4000-8000-000000000913','c1000000-0000-4000-8000-000000000901','Synthetic C1 fixture'),(a_tenant,a1_company,'c1000000-0000-4000-8000-000000000903','c1000000-0000-4000-8000-000000000914','c1000000-0000-4000-8000-000000000901','Synthetic C1 fixture'),(a_tenant,a1_company,'c1000000-0000-4000-8000-000000000904','c1000000-0000-4000-8000-000000000915','c1000000-0000-4000-8000-000000000901','Synthetic C1 fixture'),(a_tenant,a1_company,'c1000000-0000-4000-8000-000000000905','c1000000-0000-4000-8000-000000000916','c1000000-0000-4000-8000-000000000901','Synthetic C1 fixture');
  insert into public.company_role_assignments(tenant_id,company_id,user_id,role_id,granted_by,grant_reason) values (a_tenant,a2_company,'c1000000-0000-4000-8000-000000000904','c1000000-0000-4000-8000-000000000912','c1000000-0000-4000-8000-000000000904','Synthetic C1 fixture');
  insert into public.company_cost_settings(company_id,tenant_id,enabled,created_by) values (a1_company,a_tenant,true,'c1000000-0000-4000-8000-000000000901');
  insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values ('c1000000-0000-4000-8000-000000000930',a_tenant,a2_company,'C1-A2-FOREIGN-PROJECT','Synthetic A2 project','manual','c1000000-0000-4000-8000-000000000901'),('c1010000-0000-4000-8000-000000000930',b_tenant,b1_company,'C1-B1-FOREIGN-PROJECT','Synthetic B1 project','manual','c1000000-0000-4000-8000-000000000901');
  insert into public.business_parties(id,tenant_id,company_id,code,display_name,party_kind,created_by) values ('c1000000-0000-4000-8000-000000000931',a_tenant,a2_company,'C1-A2-FOREIGN-PARTY','Synthetic A2 party','crew','c1000000-0000-4000-8000-000000000901'),('c1010000-0000-4000-8000-000000000931',b_tenant,b1_company,'C1-B1-FOREIGN-PARTY','Synthetic B1 party','crew','c1000000-0000-4000-8000-000000000901');
  insert into public.project_engagements(id,tenant_id,company_id,project_id,party_id,code,name,currency_code,created_by) values ('c1000000-0000-4000-8000-000000000932',a_tenant,a2_company,'c1000000-0000-4000-8000-000000000930','c1000000-0000-4000-8000-000000000931','C1-A2-FOREIGN-ENGAGEMENT','Synthetic A2 engagement','VND','c1000000-0000-4000-8000-000000000901'),('c1010000-0000-4000-8000-000000000932',b_tenant,b1_company,'c1010000-0000-4000-8000-000000000930','c1010000-0000-4000-8000-000000000931','C1-B1-FOREIGN-ENGAGEMENT','Synthetic B1 engagement','VND','c1000000-0000-4000-8000-000000000901');
  insert into public.engagement_components(id,tenant_id,company_id,engagement_id,code,name,pricing_method,created_by) values ('c1000000-0000-4000-8000-000000000933',a_tenant,a2_company,'c1000000-0000-4000-8000-000000000932','C1-A2-FOREIGN-COMPONENT','Synthetic A2 component','fixed','c1000000-0000-4000-8000-000000000901'),('c1010000-0000-4000-8000-000000000933',b_tenant,b1_company,'c1010000-0000-4000-8000-000000000932','C1-B1-FOREIGN-COMPONENT','Synthetic B1 component','fixed','c1000000-0000-4000-8000-000000000901');
end $$;

do $$
declare function_id oid;
begin
  foreach function_id in array array[
    'public.c1_create_project(uuid,jsonb,uuid)'::regprocedure,
    'public.c1_create_business_party(uuid,jsonb,uuid)'::regprocedure,
    'public.c1_create_engagement(uuid,uuid,jsonb,uuid)'::regprocedure,
    'public.c1_create_engagement_component(uuid,uuid,jsonb,uuid)'::regprocedure,
    'public.c1_update_project(uuid,uuid,jsonb,uuid)'::regprocedure,
    'public.c1_update_business_party(uuid,uuid,jsonb,uuid)'::regprocedure,
    'public.c1_update_engagement(uuid,uuid,jsonb,uuid)'::regprocedure,
    'public.c1_update_engagement_component(uuid,uuid,jsonb,uuid)'::regprocedure
  ] loop
    if exists (select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl where p.oid=function_id and acl.grantee=0 and lower(acl.privilege_type)='execute') or pg_catalog.has_function_privilege('anon',function_id,'execute') or not pg_catalog.has_function_privilege('authenticated',function_id,'execute') then raise exception 'C1 public RPC ACL failed for %',function_id::regprocedure; end if;
  end loop;
  foreach function_id in array array[
    'private.c1_master_context(uuid,text)'::regprocedure,
    'private.c1_create_project(uuid,jsonb,uuid)'::regprocedure,
    'private.c1_create_party(uuid,jsonb,uuid)'::regprocedure,
    'private.c1_create_engagement(uuid,uuid,jsonb,uuid)'::regprocedure,
    'private.c1_create_component(uuid,uuid,jsonb,uuid)'::regprocedure,
    'private.c1_update_project(uuid,uuid,jsonb,uuid)'::regprocedure,
    'private.c1_update_party(uuid,uuid,jsonb,uuid)'::regprocedure,
    'private.c1_update_engagement(uuid,uuid,jsonb,uuid)'::regprocedure,
    'private.c1_update_component(uuid,uuid,jsonb,uuid)'::regprocedure
  ] loop
    if exists (select 1 from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl where p.oid=function_id and acl.grantee=0 and lower(acl.privilege_type)='execute') or pg_catalog.has_function_privilege('anon',function_id,'execute') or pg_catalog.has_function_privilege('authenticated',function_id,'execute') then raise exception 'C1 private command ACL failed for %',function_id::regprocedure; end if;
  end loop;
end $$;

set local role anon;
do $$ begin
  begin perform public.c1_create_project('c1000000-0000-4000-8000-000000000020',jsonb_build_object('code','C1-DENY-ANON-RPC','name','Denied','origin','manual'),'c1000000-0000-4000-8000-000000000941'); raise exception 'C1 anon public RPC unexpectedly succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.projects where code='C1-DENY-ANON-RPC') then raise exception 'C1 anon public RPC created project'; end if;
end $$;

do $$
begin
  if not exists (select 1 from public.company_memberships where user_id='c1000000-0000-4000-8000-000000000901' and company_id='c1000000-0000-4000-8000-000000000020' and is_active) then raise exception 'C1 party membership setup failed'; end if;
  if not exists (select 1 from public.company_role_assignments a join public.role_permissions p on p.role_id=a.role_id where a.user_id='c1000000-0000-4000-8000-000000000901' and a.company_id='c1000000-0000-4000-8000-000000000020' and p.permission_code='party.manage') then raise exception 'C1 party permission setup failed'; end if;
  if exists (select 1 from public.employees where user_id='c1000000-0000-4000-8000-000000000901' and tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020') then raise exception 'C1 party actor must not require an employee fixture'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='business_parties' and column_name in ('employee_id','user_id')) then raise exception 'C1 business party must not have an employee or user identity link'; end if;
  if not exists (select 1 from public.company_memberships where user_id='c1000000-0000-4000-8000-000000000901' and company_id='c1000000-0000-4000-8000-000000000020' and is_active) then raise exception 'C1 engagement membership setup failed'; end if;
  if not exists (select 1 from public.company_role_assignments a join public.roles r on r.id=a.role_id and r.is_active join public.role_permissions p on p.role_id=a.role_id where a.user_id='c1000000-0000-4000-8000-000000000901' and a.company_id='c1000000-0000-4000-8000-000000000020' and a.revoked_at is null and p.permission_code='engagement.manage') then raise exception 'C1 engagement permission setup failed'; end if;
  if not exists (select 1 from public.company_cost_settings where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and enabled) then raise exception 'C1 engagement module setup failed'; end if;
end $$;

do $$ begin
  if not exists (select 1 from public.company_memberships where user_id='c1000000-0000-4000-8000-000000000904' and company_id='c1000000-0000-4000-8000-000000000021' and is_active) then raise exception 'C1 module membership setup failed'; end if;
  if not exists (select 1 from public.company_role_assignments a join public.role_permissions p on p.role_id=a.role_id where a.user_id='c1000000-0000-4000-8000-000000000904' and a.company_id='c1000000-0000-4000-8000-000000000021' and p.permission_code='project.register.manage') then raise exception 'C1 module permission setup failed'; end if;
  if exists (select 1 from public.company_cost_settings where company_id='c1000000-0000-4000-8000-000000000021' and enabled) then raise exception 'C1 module test company unexpectedly enabled'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000904","role":"authenticated"}',true);
do $$ begin
  begin perform public.c1_create_project('c1000000-0000-4000-8000-000000000021',jsonb_build_object('code','C1-DENY-MODULE','name','Denied','origin','manual'),gen_random_uuid()); raise exception 'C1 disabled module unexpectedly succeeded';
  exception when others then if sqlerrm <> 'MODULE_DISABLED' then raise; end if; end;
end $$;

reset role;
do $$ begin
  if exists (select 1 from public.projects where code='C1-DENY-MODULE') then raise exception 'C1 disabled module created project'; end if;
end $$;

do $$ begin
  if (select count(*) from public.projects where id in ('c1000000-0000-4000-8000-000000000930','c1010000-0000-4000-8000-000000000930')) <> 2 or (select count(*) from public.business_parties where id in ('c1000000-0000-4000-8000-000000000931','c1010000-0000-4000-8000-000000000931')) <> 2 or (select count(*) from public.project_engagements where id in ('c1000000-0000-4000-8000-000000000932','c1010000-0000-4000-8000-000000000932')) <> 2 or (select count(*) from public.engagement_components where id in ('c1000000-0000-4000-8000-000000000933','c1010000-0000-4000-8000-000000000933')) <> 2 then raise exception 'C1 foreign RLS setup missing'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$
declare
  created jsonb; updated jsonb; party_id uuid; party_id_after uuid;
  tenant_before uuid; company_before uuid; tenant_after uuid; company_after uuid;
  version_before bigint; version_after bigint; name_after text;
begin
  select public.c1_create_business_party('c1000000-0000-4000-8000-000000000020',jsonb_build_object('code','C1-PARTY-A1','displayName','Synthetic party','partyKind','crew'),gen_random_uuid()) into created;
  party_id := (created->>'id')::uuid;
  select id,tenant_id,company_id,version,display_name into party_id_after,tenant_before,company_before,version_before,name_after from public.business_parties where id=party_id;
  if party_id is null or party_id_after is distinct from party_id or tenant_before is distinct from 'c1000000-0000-4000-8000-000000000010'::uuid or company_before is distinct from 'c1000000-0000-4000-8000-000000000020'::uuid or version_before is distinct from 0 or name_after is distinct from 'Synthetic party' or (created->>'version')::bigint is distinct from 0 then raise exception 'C1 party create scope/version failed'; end if;
  select public.c1_update_business_party('c1000000-0000-4000-8000-000000000020',party_id,jsonb_build_object('displayName','Synthetic party updated','expectedVersion',version_before),gen_random_uuid()) into updated;
  select id,tenant_id,company_id,version,display_name into party_id_after,tenant_after,company_after,version_after,name_after from public.business_parties where id=party_id;
  if party_id_after is distinct from party_id or tenant_after is distinct from tenant_before or company_after is distinct from company_before or version_after is distinct from version_before + 1 or (updated->>'id')::uuid is distinct from party_id or (updated->>'version')::bigint is distinct from version_after or name_after is distinct from 'Synthetic party updated' then raise exception 'C1 party update scope/version failed'; end if;
end $$;
do $$
declare created jsonb; updated jsonb; project_id uuid; version_before bigint; version_after bigint; name_after text; error_message text;
begin
  select public.c1_create_project('c1000000-0000-4000-8000-000000000020',jsonb_build_object('code','C1-PROJECT-A1','name','Synthetic independent project','origin','manual'),gen_random_uuid()) into created;
  project_id := (created->>'id')::uuid;
  if project_id is null then raise exception 'C1 authorized project command returned no id'; end if;
  if not exists (select 1 from public.projects where id=project_id and tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PROJECT-A1' and name='Synthetic independent project' and source_opportunity_id is null) then
    raise exception 'C1 project command did not create the expected independent scoped project';
  end if;
  select version into version_before from public.projects where id=project_id;
  select public.c1_update_project('c1000000-0000-4000-8000-000000000020',project_id,jsonb_build_object('name','Synthetic independent project updated','expectedVersion',version_before),gen_random_uuid()) into updated;
  select version,name into version_after,name_after from public.projects where id=project_id and tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020';
  if version_after <> version_before + 1 or (updated->>'version')::bigint <> version_after or name_after <> 'Synthetic independent project updated' then raise exception 'C1 authorized project update did not increment version exactly once'; end if;
  begin
    perform public.c1_update_project('c1000000-0000-4000-8000-000000000020',project_id,jsonb_build_object('name','forged stale update','expectedVersion',version_before),gen_random_uuid());
    raise exception 'C1 stale project update unexpectedly succeeded';
  exception when others then
    get stacked diagnostics error_message = message_text;
    if error_message <> 'VERSION_CONFLICT' then raise; end if;
  end;
  if exists (select 1 from public.projects where id=project_id and (version <> version_after or name <> name_after)) then raise exception 'C1 stale project update changed state'; end if;
end $$;

do $$
declare created jsonb; project_id uuid; version_after bigint;
begin
  select public.c1_create_project('c1000000-0000-4000-8000-000000000020',jsonb_build_object('code','C1-LEGACY-PROJECT-A1','name','Synthetic legacy project','origin','legacy_import'),gen_random_uuid()) into created;
  project_id := (created->>'id')::uuid;
  select version into version_after from public.projects where id=project_id and tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-LEGACY-PROJECT-A1' and name='Synthetic legacy project' and origin='legacy_import' and created_by='c1000000-0000-4000-8000-000000000901' and source_opportunity_id is null;
  if project_id is null or version_after is distinct from 0 or (created->>'version')::bigint is distinct from 0 then raise exception 'C1 legacy project create scope/origin failed'; end if;
end $$;

do $$
declare project_id uuid; project_version bigint;
begin
  select id,version into project_id,project_version from public.projects where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PROJECT-A1';
  begin perform private.c1_update_project('c1000000-0000-4000-8000-000000000020',project_id,jsonb_build_object('expectedVersion',project_version),'c1000000-0000-4000-8000-000000000942'); raise exception 'C1 authenticated private command unexpectedly succeeded'; exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$
declare project_id uuid; legacy_project_id uuid;
begin
  select id into project_id from public.projects where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PROJECT-A1';
  select id into legacy_project_id from public.projects where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-LEGACY-PROJECT-A1' and origin='legacy_import' and source_opportunity_id is null;
  if project_id is null or legacy_project_id is null or exists (select 1 from public.workflow_instances where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and subject_id in (project_id,legacy_project_id)) then raise exception 'C1 project command must not create a workflow runtime'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}',true);

do $$
declare
  created jsonb; updated jsonb; project_id uuid; party_id uuid; engagement_id uuid; engagement_id_after uuid;
  tenant_before uuid; company_before uuid; tenant_after uuid; company_after uuid;
  project_before uuid; party_before uuid; project_after uuid; party_after uuid;
  version_before bigint; version_after bigint; name_after text;
begin
  select id into project_id from public.projects where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PROJECT-A1';
  if project_id is null then raise exception 'C1 engagement project prerequisite is missing or out of scope'; end if;
  select id into party_id from public.business_parties where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PARTY-A1';
  if party_id is null then raise exception 'C1 engagement party prerequisite is missing or out of scope'; end if;
  select public.c1_create_engagement('c1000000-0000-4000-8000-000000000020',project_id,jsonb_build_object('partyId',party_id,'code','C1-ENGAGEMENT-A1','name','Synthetic engagement','currencyCode','VND'),gen_random_uuid()) into created;
  engagement_id := (created->>'id')::uuid;
  select id,tenant_id,company_id,project_id,party_id,version,name into engagement_id_after,tenant_before,company_before,project_before,party_before,version_before,name_after from public.project_engagements where id=engagement_id;
  if engagement_id is null or engagement_id_after is distinct from engagement_id or tenant_before is distinct from 'c1000000-0000-4000-8000-000000000010'::uuid or company_before is distinct from 'c1000000-0000-4000-8000-000000000020'::uuid or project_before is distinct from project_id or party_before is distinct from party_id or version_before is distinct from 0 or name_after is distinct from 'Synthetic engagement' or (created->>'version')::bigint is distinct from 0 then raise exception 'C1 engagement create scope/version failed'; end if;
  select public.c1_update_engagement('c1000000-0000-4000-8000-000000000020',engagement_id,jsonb_build_object('name','Synthetic engagement updated','expectedVersion',version_before),gen_random_uuid()) into updated;
  select id,tenant_id,company_id,project_id,party_id,version,name into engagement_id_after,tenant_after,company_after,project_after,party_after,version_after,name_after from public.project_engagements where id=engagement_id;
  if engagement_id_after is distinct from engagement_id or tenant_after is distinct from tenant_before or company_after is distinct from company_before or project_after is distinct from project_before or party_after is distinct from party_before or version_after is distinct from version_before + 1 or (updated->>'id')::uuid is distinct from engagement_id or (updated->>'version')::bigint is distinct from version_after or name_after is distinct from 'Synthetic engagement updated' then raise exception 'C1 engagement update scope/version failed'; end if;
end $$;

do $$
declare
  created jsonb; first_id uuid; second_id uuid; first_project_id uuid; first_party_id uuid;
  first_version bigint; first_name text; second_project_id uuid; second_party_id uuid;
  second_tenant_id uuid; second_company_id uuid; second_version bigint;
begin
  select id,project_id,party_id,version,name into first_id,first_project_id,first_party_id,first_version,first_name from public.project_engagements where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-ENGAGEMENT-A1';
  if first_id is null then raise exception 'C1 first engagement prerequisite is missing'; end if;
  select public.c1_create_engagement('c1000000-0000-4000-8000-000000000020',first_project_id,jsonb_build_object('partyId',first_party_id,'code','C1-ENGAGEMENT-A1-SECOND','name','Synthetic second engagement','currencyCode','VND'),gen_random_uuid()) into created;
  second_id := (created->>'id')::uuid;
  select tenant_id,company_id,project_id,party_id,version into second_tenant_id,second_company_id,second_project_id,second_party_id,second_version from public.project_engagements where id=second_id;
  if second_id is null or second_id is not distinct from first_id or second_tenant_id is distinct from 'c1000000-0000-4000-8000-000000000010'::uuid or second_company_id is distinct from 'c1000000-0000-4000-8000-000000000020'::uuid or second_project_id is distinct from first_project_id or second_party_id is distinct from first_party_id or second_version is distinct from 0 or (created->>'version')::bigint is distinct from 0 then raise exception 'C1 second engagement scope/version failed'; end if;
  if not exists (select 1 from public.project_engagements where id=first_id and project_id=first_project_id and party_id=first_party_id and version=first_version and name=first_name) then raise exception 'C1 second engagement mutated the first engagement'; end if;
end $$;

do $$
declare
  created jsonb; updated jsonb; engagement_id uuid; component_id uuid; component_id_after uuid;
  tenant_before uuid; company_before uuid; tenant_after uuid; company_after uuid;
  engagement_before uuid; engagement_after uuid; version_before bigint; version_after bigint; name_after text;
begin
  select id into engagement_id from public.project_engagements where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-ENGAGEMENT-A1';
  if engagement_id is null then raise exception 'C1 component engagement prerequisite is missing'; end if;
  select public.c1_create_engagement_component('c1000000-0000-4000-8000-000000000020',engagement_id,jsonb_build_object('code','C1-COMPONENT-A1','name','Synthetic component','pricingMethod','fixed'),gen_random_uuid()) into created;
  component_id := (created->>'id')::uuid;
  select id,tenant_id,company_id,engagement_id,version,name into component_id_after,tenant_before,company_before,engagement_before,version_before,name_after from public.engagement_components where id=component_id;
  if component_id is null or component_id_after is distinct from component_id or tenant_before is distinct from 'c1000000-0000-4000-8000-000000000010'::uuid or company_before is distinct from 'c1000000-0000-4000-8000-000000000020'::uuid or engagement_before is distinct from engagement_id or version_before is distinct from 0 or name_after is distinct from 'Synthetic component' or (created->>'version')::bigint is distinct from 0 then raise exception 'C1 component create scope/version failed'; end if;
  select public.c1_update_engagement_component('c1000000-0000-4000-8000-000000000020',component_id,jsonb_build_object('name','Synthetic component updated','expectedVersion',version_before),gen_random_uuid()) into updated;
  select id,tenant_id,company_id,engagement_id,version,name into component_id_after,tenant_after,company_after,engagement_after,version_after,name_after from public.engagement_components where id=component_id;
  if component_id_after is distinct from component_id or tenant_after is distinct from tenant_before or company_after is distinct from company_before or engagement_after is distinct from engagement_before or version_after is distinct from version_before + 1 or (updated->>'id')::uuid is distinct from component_id or (updated->>'version')::bigint is distinct from version_after or name_after is distinct from 'Synthetic component updated' then raise exception 'C1 component update scope/version failed'; end if;
end $$;

do $$
declare a1_party_id uuid; a2_project_id uuid := 'c1000000-0000-4000-8000-000000000930'; b1_project_id uuid := 'c1010000-0000-4000-8000-000000000930';
begin
  select id into a1_party_id from public.business_parties where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PARTY-A1';
  if a1_party_id is null or a2_project_id is null then raise exception 'C1 same-tenant foreign setup missing'; end if;
  begin perform public.c1_create_engagement('c1000000-0000-4000-8000-000000000020',a2_project_id,jsonb_build_object('partyId',a1_party_id,'code','C1-DENY-A2-PROJECT','name','Denied','currencyCode','VND'),gen_random_uuid()); raise exception 'C1 same-tenant cross-company engagement unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'RESOURCE_NOT_FOUND' then raise; end if; end;
  if exists (select 1 from public.project_engagements where company_id='c1000000-0000-4000-8000-000000000020' and code='C1-DENY-A2-PROJECT') then raise exception 'C1 same-tenant cross-company engagement persisted'; end if;
  if b1_project_id is null then raise exception 'C1 cross-tenant foreign setup missing'; end if;
  begin perform public.c1_create_engagement('c1000000-0000-4000-8000-000000000020',b1_project_id,jsonb_build_object('partyId',a1_party_id,'code','C1-DENY-B1-PROJECT','name','Denied','currencyCode','VND'),gen_random_uuid()); raise exception 'C1 cross-tenant engagement unexpectedly succeeded';
  exception when sqlstate 'P0001' then if sqlerrm <> 'RESOURCE_NOT_FOUND' then raise; end if; end;
  if exists (select 1 from public.project_engagements where company_id='c1000000-0000-4000-8000-000000000020' and code='C1-DENY-B1-PROJECT') then raise exception 'C1 cross-tenant engagement persisted'; end if;
end $$;

reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000906","role":"authenticated"}',true);
do $$ begin
  if not exists (select 1 from public.company_memberships where user_id='c1000000-0000-4000-8000-000000000906' and is_active) then raise exception 'C1 missing-permission membership setup failed'; end if;
  begin perform public.c1_create_project('c1000000-0000-4000-8000-000000000020',jsonb_build_object('code','C1-DENY-PERM','name','Denied','origin','manual'),gen_random_uuid()); raise exception 'C1 missing permission unexpectedly succeeded';
  exception when others then if sqlerrm <> 'PERMISSION_DENIED' then raise; end if; end;
  if exists (select 1 from public.projects where code='C1-DENY-PERM') then raise exception 'C1 missing permission created project'; end if;
end $$;

reset role;
do $$ begin
  if exists (select 1 from public.projects where code='C1-DENY-PERM') then raise exception 'C1 missing permission created project'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000907","role":"authenticated"}',true);
do $$ begin
  if not exists (select 1 from public.company_memberships where user_id='c1000000-0000-4000-8000-000000000907' and not is_active) then raise exception 'C1 inactive membership setup failed'; end if;
  begin perform public.c1_create_project('c1000000-0000-4000-8000-000000000020',jsonb_build_object('code','C1-DENY-INACTIVE','name','Denied','origin','manual'),gen_random_uuid()); raise exception 'C1 inactive membership unexpectedly succeeded';
  exception when others then if sqlerrm <> 'COMPANY_FORBIDDEN' then raise; end if; end;
  if exists (select 1 from public.projects where code='C1-DENY-INACTIVE') then raise exception 'C1 inactive membership created project'; end if;
end $$;

reset role;
do $$ begin
  if exists (select 1 from public.projects where code='C1-DENY-INACTIVE') then raise exception 'C1 inactive membership created project'; end if;
end $$;

do $$ begin
  if (select count(*) from public.projects where code in ('C1-PROJECT-A1','C1-A2-FOREIGN-PROJECT','C1-B1-FOREIGN-PROJECT')) <> 3 then raise exception 'C1 RLS project setup missing'; end if;
  if (select count(*) from public.business_parties where code in ('C1-PARTY-A1','C1-A2-FOREIGN-PARTY','C1-B1-FOREIGN-PARTY')) <> 3 then raise exception 'C1 RLS party setup missing'; end if;
  if (select count(*) from public.project_engagements where code in ('C1-ENGAGEMENT-A1','C1-A2-FOREIGN-ENGAGEMENT','C1-B1-FOREIGN-ENGAGEMENT')) <> 3 then raise exception 'C1 RLS engagement setup missing'; end if;
  if (select count(*) from public.engagement_components where code in ('C1-COMPONENT-A1','C1-A2-FOREIGN-COMPONENT','C1-B1-FOREIGN-COMPONENT')) <> 3 then raise exception 'C1 RLS component setup missing'; end if;
  if not exists (select 1 from public.company_cost_settings where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and enabled) then raise exception 'C1 RLS cost setting setup missing'; end if;
  if exists (select 1 from public.company_role_assignments a join public.role_permissions p on p.role_id=a.role_id where a.user_id='c1000000-0000-4000-8000-000000000902' and a.company_id='c1000000-0000-4000-8000-000000000020' and a.revoked_at is null and p.permission_code in ('project.register.manage','engagement.manage','cost.config.manage')) then raise exception 'C1 party actor has excess management permission'; end if;
  if not exists (select 1 from public.company_role_assignments a join public.role_permissions p on p.role_id=a.role_id where a.user_id='c1000000-0000-4000-8000-000000000905' and a.company_id='c1000000-0000-4000-8000-000000000020' and a.revoked_at is null and p.permission_code='cost.read') or exists (select 1 from public.company_role_assignments a join public.role_permissions p on p.role_id=a.role_id where a.user_id='c1000000-0000-4000-8000-000000000905' and a.company_id='c1000000-0000-4000-8000-000000000020' and a.revoked_at is null and p.permission_code in ('project.register.manage','party.manage','engagement.manage','cost.config.manage')) then raise exception 'C1 cost.read actor setup failed'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$ begin
  if not exists (select 1 from public.projects where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PROJECT-A1') then raise exception 'C1 project actor cannot read A1 project'; end if;
  if exists (select 1 from public.projects where code='C1-A2-FOREIGN-PROJECT') or exists (select 1 from public.projects where code='C1-B1-FOREIGN-PROJECT') then raise exception 'C1 project actor can read foreign project'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000902","role":"authenticated"}',true);
do $$ begin
  if not exists (select 1 from public.business_parties where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PARTY-A1') then raise exception 'C1 party actor cannot read A1 party'; end if;
  if exists (select 1 from public.project_engagements where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020') or exists (select 1 from public.engagement_components where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020') then raise exception 'C1 party actor can read engagement catalog'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000903","role":"authenticated"}',true);
do $$ begin
  if not exists (select 1 from public.project_engagements where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-ENGAGEMENT-A1') or not exists (select 1 from public.engagement_components where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-COMPONENT-A1') then raise exception 'C1 engagement actor cannot read A1 catalog'; end if;
  if exists (select 1 from public.project_engagements where code in ('C1-A2-FOREIGN-ENGAGEMENT','C1-B1-FOREIGN-ENGAGEMENT')) or exists (select 1 from public.engagement_components where code in ('C1-A2-FOREIGN-COMPONENT','C1-B1-FOREIGN-COMPONENT')) then raise exception 'C1 engagement actor can read foreign catalog'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000904","role":"authenticated"}',true);
do $$ begin
  if not exists (select 1 from public.company_cost_settings where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and enabled) then raise exception 'C1 cost config actor cannot read A1 setting'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000905","role":"authenticated"}',true);
do $$ begin
  if exists (select 1 from public.projects where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020') or exists (select 1 from public.business_parties where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020') or exists (select 1 from public.project_engagements where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020') or exists (select 1 from public.engagement_components where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020') or exists (select 1 from public.company_cost_settings where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020') then raise exception 'C1 cost.read actor can read management catalogs'; end if;
end $$;
reset role;

do $$
declare table_name text;
begin
  foreach table_name in array array['public.projects','public.business_parties','public.project_engagements','public.engagement_components','public.company_cost_settings'] loop
    if has_table_privilege('authenticated',table_name,'insert') or has_table_privilege('authenticated',table_name,'update') or has_table_privilege('authenticated',table_name,'delete') then raise exception 'C1 authenticated direct write grant exists on %',table_name; end if;
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000901","role":"authenticated"}',true);
do $$
declare project_id uuid;
begin
  select id into project_id from public.projects where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PROJECT-A1';
  if project_id is null then raise exception 'C1 direct write project setup missing'; end if;
  begin insert into public.projects(id,tenant_id,company_id,code,name,origin,created_by) values ('c1000000-0000-4000-8000-000000000940','c1000000-0000-4000-8000-000000000010','c1000000-0000-4000-8000-000000000020','C1-DIRECT-WRITE-DENY','Denied','manual','c1000000-0000-4000-8000-000000000901'); raise exception 'C1 direct insert unexpectedly succeeded'; exception when insufficient_privilege then null; end;
  begin update public.projects set name='Direct write denied' where id=project_id; raise exception 'C1 direct update unexpectedly succeeded'; exception when insufficient_privilege then null; end;
  begin delete from public.projects where id=project_id; raise exception 'C1 direct delete unexpectedly succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.projects where code='C1-DIRECT-WRITE-DENY') or not exists (select 1 from public.projects where tenant_id='c1000000-0000-4000-8000-000000000010' and company_id='c1000000-0000-4000-8000-000000000020' and code='C1-PROJECT-A1' and name='Synthetic independent project updated' and version=1) then raise exception 'C1 direct write denial changed canonical project state'; end if;
end $$;

select 'C1_A01_LEGACY_IMPORT_COMPLETE' as c1_fixture_completion;
select 'C1_FOUNDATION_FIXTURE_COMPLETE' as c1_fixture_completion;

rollback;
