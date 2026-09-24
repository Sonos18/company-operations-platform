begin;

do $$
declare
  tenant_a constant uuid := 'c1010000-0000-4000-8000-000000000010';
  tenant_b constant uuid := 'c1010000-0000-4000-8000-000000000011';
  company_a constant uuid := 'c1010000-0000-4000-8000-000000000020';
  company_b constant uuid := 'c1010000-0000-4000-8000-000000000021';
  reader constant uuid := 'c1010000-0000-4000-8000-000000000901';
  denied constant uuid := 'c1010000-0000-4000-8000-000000000902';
  manager constant uuid := 'c1010000-0000-4000-8000-000000000903';
begin
  insert into auth.users(id, email) values
    (reader, 'c101-detail-reader@taskovia.invalid'),
    (denied, 'c101-detail-denied@taskovia.invalid'),
    (manager, 'c101-detail-manager@taskovia.invalid');
  insert into public.tenants(id, code, name) values
    (tenant_a, 'C101-DA', 'C101 detail tenant A'),
    (tenant_b, 'C101-DB', 'C101 detail tenant B');
  insert into public.companies(id, tenant_id, code, name) values
    (company_a, tenant_a, 'C101-DA1', 'C101 detail company A'),
    (company_b, tenant_b, 'C101-DB1', 'C101 detail company B');
  insert into public.tenant_memberships(user_id, tenant_id, roles) values
    (reader, tenant_a, array['member']),
    (denied, tenant_a, array['member']),
    (manager, tenant_a, array['member']);
  insert into public.company_memberships(user_id, tenant_id, company_id, roles, is_active) values
    (reader, tenant_a, company_a, array['member'], true),
    (denied, tenant_a, company_a, array['member'], true),
    (manager, tenant_a, company_a, array['member'], true);
  insert into public.roles(id, tenant_id, company_id, code, name, description, is_system) values
    ('c1010000-0000-4000-8000-000000000911', tenant_a, company_a, 'c101_detail_reader', 'C101 detail reader', 'Synthetic detail read role', false),
    ('c1010000-0000-4000-8000-000000000912', tenant_a, company_a, 'c101_detail_denied', 'C101 detail denied', 'Synthetic detail denied role', false);
  insert into public.role_permissions(role_id, permission_code)
  values ('c1010000-0000-4000-8000-000000000911', 'cost.read');
  insert into public.company_role_assignments(tenant_id, company_id, user_id, role_id, granted_by, grant_reason) values
    (tenant_a, company_a, reader, 'c1010000-0000-4000-8000-000000000911', manager, 'C101 detail fixture'),
    (tenant_a, company_a, denied, 'c1010000-0000-4000-8000-000000000912', manager, 'C101 detail fixture');
  insert into public.company_cost_settings(company_id, tenant_id, enabled, created_by) values
    (company_a, tenant_a, true, manager),
    (company_b, tenant_b, true, manager);
  insert into public.projects(id, tenant_id, company_id, code, name, origin, created_by) values
    ('c1010000-0000-4000-8000-000000000101', tenant_a, company_a, 'C101-DETAIL-A', 'C101 detail project A', 'manual', manager),
    ('c1010000-0000-4000-8000-000000000102', tenant_b, company_b, 'C101-DETAIL-B', 'C101 detail project B', 'manual', manager);
  insert into public.project_cost_items(id, tenant_id, company_id, project_id, description, amount, amount_text, currency_code, work_status, publication_state, publication_origin, published_at, created_by) values
    ('c1010000-0000-4000-8000-000000000301', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'C101 detail reader parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1010000-0000-4000-8000-000000000302', tenant_b, company_b, 'c1010000-0000-4000-8000-000000000102', 'C101 detail foreign parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1010000-0000-4000-8000-000000000303', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'C101 insert parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1010000-0000-4000-8000-000000000304', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'C101 sum parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1010000-0000-4000-8000-000000000305', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'C101 retention parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1010000-0000-4000-8000-000000000306', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'C101 move source parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1010000-0000-4000-8000-000000000307', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'C101 move destination parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1010000-0000-4000-8000-000000000308', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'C101 validation parent', 0, '0', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager),
    ('c1010000-0000-4000-8000-000000000309', tenant_a, company_a, 'c1010000-0000-4000-8000-000000000101', 'C101 equal-total parent', 100, '100', 'VND', 'unknown', 'published', 'legacy_backfill', now(), manager);
end;
$$;

insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_at, created_by) values
  ('c1010000-0000-4000-8000-000000000601', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000301', 1, 'C101 reader detail', '10', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903'),
  ('c1010000-0000-4000-8000-000000000602', 'c1010000-0000-4000-8000-000000000011', 'c1010000-0000-4000-8000-000000000021', 'c1010000-0000-4000-8000-000000000302', 1, 'C101 foreign detail', '10', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903');
set constraints all immediate;
set constraints all deferred;

insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_at, created_by)
values ('c1010000-0000-4000-8000-000000000632', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000309', 1, 'C101 equal-total detail', '100', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903');
set constraints all immediate;
do $$
begin
  if (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000309') <> 100
    or (select amount_text from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000309') <> '100'
    or (select version from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000309') <> 0 then
    raise exception 'C1_PCD_DERIVED_EQUAL_TOTAL_NO_VERSION_CHURN';
  end if;
  raise notice 'C1_PCD_DERIVED_EQUAL_TOTAL_NO_VERSION_CHURN';
end;
$$;
set constraints all deferred;

do $$
begin
  if not pg_catalog.has_table_privilege('authenticated', 'public.project_cost_item_details', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'public.project_cost_item_details', 'insert')
    or pg_catalog.has_table_privilege('authenticated', 'public.project_cost_item_details', 'update')
    or pg_catalog.has_table_privilege('authenticated', 'public.project_cost_item_details', 'delete')
    or pg_catalog.has_table_privilege('authenticated', 'public.project_cost_item_details', 'truncate') then
    raise exception 'C1_PCD_DIRECT_WRITE_DENIED';
  end if;
  raise notice 'C1_PCD_DIRECT_WRITE_DENIED';
end;
$$;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"sub":"c1010000-0000-4000-8000-000000000901","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.project_cost_item_details where company_id = 'c1010000-0000-4000-8000-000000000020') <> 2 then
    raise exception 'C1_PCD_RLS_READ_ALLOWED';
  end if;
  if (select count(*) from public.project_cost_item_details where company_id = 'c1010000-0000-4000-8000-000000000021') <> 0 then
    raise exception 'C1_PCD_RLS_SCOPE_ISOLATION';
  end if;
  raise notice 'C1_PCD_RLS_READ_ALLOWED';
  raise notice 'C1_PCD_RLS_SCOPE_ISOLATION';
end;
$$;
reset role;

set local role authenticated;
select pg_catalog.set_config('request.jwt.claims', '{"sub":"c1010000-0000-4000-8000-000000000902","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.project_cost_item_details where company_id = 'c1010000-0000-4000-8000-000000000020') <> 0 then
    raise exception 'C1_PCD_RLS_READ_DENIED';
  end if;
  raise notice 'C1_PCD_RLS_READ_DENIED';
end;
$$;
reset role;

insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_at, created_by)
values ('c1010000-0000-4000-8000-000000000611', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000303', 1, 'C101 inserted detail', '40', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903');
do $$
begin
  if (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000303') <> 0 then
    raise exception 'C1_PCD_DEFERRED_TRIGGER_BEFORE_CHECKPOINT';
  end if;
end;
$$;
set constraints all immediate;
do $$
begin
  if (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000303') <> 40
    or (select amount_text::numeric from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000303') <> 40 then
    raise exception 'C1_PCD_INSERT_DERIVES_PARENT';
  end if;
  raise notice 'C1_PCD_INSERT_DERIVES_PARENT';
end;
$$;
set constraints all deferred;

insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_at, created_by) values
  ('c1010000-0000-4000-8000-000000000621', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000304', 1, 'C101 sum detail A', '40', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903'),
  ('c1010000-0000-4000-8000-000000000622', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000304', 2, 'C101 sum detail B', '60', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903');
set constraints all immediate;
do $$
begin
  if (select sum(detail.amount_text::numeric) from public.project_cost_item_details detail where detail.project_cost_item_id = 'c1010000-0000-4000-8000-000000000304') <> 100
    or (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000304') <> 100
    or (select amount_text::numeric from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000304') <> 100 then
    raise exception 'C1_PCD_DETAIL_SUM_PARENT_INVARIANT';
  end if;
  raise notice 'C1_PCD_DETAIL_SUM_PARENT_INVARIANT';
end;
$$;
set constraints all deferred;

insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_kind, retention_rate_bps, retention_amount_text, publication_state, publication_origin, published_at, created_by)
values ('c1010000-0000-4000-8000-000000000631', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000305', 1, 'C101 retention detail', '100', 'warranty', 500, '5', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903');
set constraints all immediate;
do $$
begin
  if not exists (select 1 from public.project_cost_item_details where id = 'c1010000-0000-4000-8000-000000000631' and retention_kind = 'warranty' and retention_rate_bps = 500 and retention_amount_text = '5')
    or (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000305') <> 100
    or (select amount_text::numeric from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000305') in (95, 105) then
    raise exception 'C1_PCD_RETENTION_EXCLUDED_FROM_PARENT';
  end if;
  raise notice 'C1_PCD_RETENTION_EXCLUDED_FROM_PARENT';
end;
$$;
set constraints all deferred;

do $$
begin
  begin
    update public.project_cost_items set amount = 99, amount_text = '99' where id = 'c1010000-0000-4000-8000-000000000305';
    raise exception 'C1_PCD_PARENT_AMOUNT_GUARD direct parent amount update accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'PROJECT_COST_AMOUNT_DERIVED' then raise; end if;
  end;
  raise notice 'C1_PCD_PARENT_AMOUNT_GUARD';
end;
$$;

update public.project_cost_item_details set amount_text = '70' where id = 'c1010000-0000-4000-8000-000000000622';
set constraints all immediate;
do $$
begin
  if (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000304') <> 110
    or (select version from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000304') <> 2 then
    raise exception 'C1_PCD_UPDATE_REDERIVES_PARENT';
  end if;
  raise notice 'C1_PCD_UPDATE_REDERIVES_PARENT';
end;
$$;
set constraints all deferred;
update public.project_cost_item_details set amount_text = '70' where id = 'c1010000-0000-4000-8000-000000000622';
set constraints all immediate;
do $$
begin
  if (select version from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000304') <> 2 then
    raise exception 'C1_PCD_DERIVED_VERSION_CHANGE_ONLY';
  end if;
  raise notice 'C1_PCD_DERIVED_VERSION_CHANGE_ONLY';
end;
$$;
set constraints all deferred;

delete from public.project_cost_item_details where id = 'c1010000-0000-4000-8000-000000000621';
set constraints all immediate;
do $$
begin
  if (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000304') <> 70 then
    raise exception 'C1_PCD_DELETE_REDERIVES_PARENT';
  end if;
  raise notice 'C1_PCD_DELETE_REDERIVES_PARENT';
end;
$$;
set constraints all deferred;

insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_at, created_by) values
  ('c1010000-0000-4000-8000-000000000641', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000306', 1, 'C101 moved detail', '40', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903'),
  ('c1010000-0000-4000-8000-000000000642', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000307', 1, 'C101 destination detail', '10', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903');
set constraints all immediate;
set constraints all deferred;
update public.project_cost_item_details
set project_cost_item_id = 'c1010000-0000-4000-8000-000000000307',
    line_no = 2
where id = 'c1010000-0000-4000-8000-000000000641';
set constraints all immediate;
do $$
begin
  if (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000306') <> 0
    or (select amount from public.project_cost_items where id = 'c1010000-0000-4000-8000-000000000307') <> 50 then
    raise exception 'C1_PCD_MOVE_REDERIVES_BOTH_PARENTS';
  end if;
  raise notice 'C1_PCD_MOVE_REDERIVES_BOTH_PARENTS';
end;
$$;
set constraints all deferred;

insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, publication_state, publication_origin, published_at, created_by)
values ('c1010000-0000-4000-8000-000000000651', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 1, 'C101 validation detail', '1', 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903');
set constraints all immediate;
set constraints all deferred;

do $$
begin
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 1, 'C101 duplicate line', '1', 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_DUPLICATE_LINE_NO_REJECTED duplicate accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 0, 'C101 zero line', '1', 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_INVALID_LINE_NO_REJECTED zero accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 2, 'C101 invalid decimal', '1.00000', 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_INVALID_DECIMAL_REJECTED decimal accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_kind, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 3, 'C101 retention kind only', '1', 'warranty', 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_RETENTION_SHAPE_REJECTED kind only accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_amount_text, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 4, 'C101 retention amount only', '1', '1', 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_RETENTION_SHAPE_REJECTED amount only accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_rate_bps, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 5, 'C101 retention rate only', '1', 500, 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_RETENTION_SHAPE_REJECTED rate only accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_kind, retention_amount_text, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 6, 'C101 invalid retention kind', '1', 'unsupported', '1', 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_RETENTION_KIND_REJECTED invalid kind accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_kind, retention_amount_text, retention_rate_bps, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 7, 'C101 negative rate', '1', 'warranty', '1', -1, 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_RETENTION_RATE_REJECTED negative accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_kind, retention_amount_text, retention_rate_bps, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 8, 'C101 excessive rate', '1', 'warranty', '1', 10001, 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_RETENTION_RATE_REJECTED excessive accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.project_cost_item_details(tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_kind, retention_amount_text, created_by)
    values ('c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 9, 'C101 excessive retention', '100', 'warranty', '101', 'c1010000-0000-4000-8000-000000000903');
    raise exception 'C1_PCD_RETENTION_AMOUNT_EXCEEDS_COST_REJECTED excessive retention accepted';
  exception when check_violation then null;
  end;
  raise notice 'C1_PCD_DUPLICATE_LINE_NO_REJECTED';
  raise notice 'C1_PCD_INVALID_LINE_NO_REJECTED';
  raise notice 'C1_PCD_INVALID_DECIMAL_REJECTED';
  raise notice 'C1_PCD_RETENTION_SHAPE_REJECTED';
  raise notice 'C1_PCD_RETENTION_KIND_REJECTED';
  raise notice 'C1_PCD_RETENTION_RATE_REJECTED';
  raise notice 'C1_PCD_RETENTION_AMOUNT_EXCEEDS_COST_REJECTED';
end;
$$;

insert into public.project_cost_item_details(id, tenant_id, company_id, project_cost_item_id, line_no, description, amount_text, retention_kind, retention_amount_text, retention_rate_bps, publication_state, publication_origin, published_at, created_by) values
  ('c1010000-0000-4000-8000-000000000661', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 10, 'C101 zero rate', '1', 'warranty', '1', 0, 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903'),
  ('c1010000-0000-4000-8000-000000000662', 'c1010000-0000-4000-8000-000000000010', 'c1010000-0000-4000-8000-000000000020', 'c1010000-0000-4000-8000-000000000308', 11, 'C101 full rate', '1', 'warranty', '1', 10000, 'published', 'legacy_backfill', now(), 'c1010000-0000-4000-8000-000000000903');
set constraints all immediate;
set constraints all deferred;

select 'C1_PROJECT_COST_ITEM_DETAILS_COMPLETE' as c1_fixture_completion;

rollback;
