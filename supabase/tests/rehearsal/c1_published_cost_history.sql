-- Appended only by the guarded rollback-only migration rehearsal runner.
-- Minimal temporary relations deliberately allow impossible cross-scope links:
-- this proves the production preflight itself scopes its aggregate correctly.
create temporary table c1_history_parents (
  id text primary key, tenant_id text not null default 'tenant-a',
  company_id text not null default 'company-a', project_id text not null default 'project-a',
  amount numeric not null, amount_text text not null,
  publication_state text not null default 'published',
  publication_origin text not null default 'legacy_backfill'
);
create temporary table c1_history_details (
  project_cost_item_id text not null, tenant_id text not null default 'tenant-a',
  company_id text not null default 'company-a', amount_text text,
  publication_state text not null default 'published', detail_kind text not null default 'line_item'
);

create function pg_temp.c1_history_preflight_result() returns jsonb language plpgsql as $history_result$
declare
  v_detail text;
begin
  execute $history_guard$
  -- C1_HISTORY_PREFLIGHT_BODY
  $history_guard$;
  return null;
exception when sqlstate 'P0001' then
  if sqlerrm <> 'C1_PUBLISHED_COST_HISTORY_REQUIRES_REVIEW' then raise; end if;
  get stacked diagnostics v_detail = PG_EXCEPTION_DETAIL;
  return v_detail::jsonb;
end;
$history_result$;

insert into pg_temp.c1_history_parents(id, amount, amount_text) values
  ('parent-only legacy balance', 10, '10.0000'),
  ('draft-only legacy balance', 10, '10.0000'),
  ('mismatched published balance', 10, '10.0000'),
  ('stale stored numeric balance', 9, '10.0000'),
  ('cross-tenant detail', 10, '10.0000'),
  ('cross-company detail', 10, '10.0000'),
  ('zero parent with nonzero detail', 0, '0.0000'),
  ('unprepared published detail', 0, '0.0000'),
  ('zero shell', 0, '0.0000'),
  ('explicit published zero', 0, '0.0000'),
  ('balanced legacy opening balance', 10, '10.0000'),
  ('exact large balance', 9007199254740993.0001, '9007199254740993.0001');
insert into pg_temp.c1_history_parents(id, amount, amount_text, publication_origin) values
  ('parent-only command balance', 10, '10.0000', 'command'),
  ('zero command shell', 0, '0.0000', 'command');
insert into pg_temp.c1_history_parents(id, amount, amount_text, publication_state) values
  ('unpublished parent', 10, '10.0000', 'draft');
insert into pg_temp.c1_history_details(project_cost_item_id, amount_text) values
  ('mismatched published balance', '9.0000'),
  ('stale stored numeric balance', '10.0000'),
  ('zero parent with nonzero detail', '1.0000'),
  ('unprepared published detail', null),
  ('explicit published zero', '0.0000'),
  ('exact large balance', '9007199254740993.0000'),
  ('exact large balance', '0.0001');
insert into pg_temp.c1_history_details(project_cost_item_id, amount_text, detail_kind) values
  ('balanced legacy opening balance', '10.0000', 'opening_balance');
insert into pg_temp.c1_history_details(project_cost_item_id, amount_text, publication_state) values
  ('draft-only legacy balance', '10.0000', 'draft'),
  ('zero command shell', '99.0000', 'draft');
insert into pg_temp.c1_history_details(project_cost_item_id, amount_text, tenant_id) values
  ('cross-tenant detail', '10.0000', 'tenant-b');
insert into pg_temp.c1_history_details(project_cost_item_id, amount_text, company_id) values
  ('cross-company detail', '10.0000', 'company-b');

do $history_assertions$
declare
  v_report jsonb;
  v_before jsonb;
  v_after jsonb;
  v_expected text[] := array['cross-company detail', 'cross-tenant detail', 'draft-only legacy balance',
    'mismatched published balance', 'parent-only command balance', 'parent-only legacy balance',
    'stale stored numeric balance', 'unprepared published detail', 'zero parent with nonzero detail'];
begin
  select jsonb_build_object(
    'parents', (select jsonb_agg(to_jsonb(item) order by item.id) from pg_temp.c1_history_parents item),
    'details', (select jsonb_agg(to_jsonb(detail) order by to_jsonb(detail)::text) from pg_temp.c1_history_details detail)
  ) into v_before;
  v_report := pg_temp.c1_history_preflight_result();
  if v_report is null or (v_report->>'mismatchCount')::integer is distinct from cardinality(v_expected)
    or (select array_agg(row->>'parentId' order by row->>'parentId') from jsonb_array_elements(v_report->'sample') row) is distinct from v_expected then
    raise exception 'C1 history preflight must reject exactly the historical mismatches: %', v_report;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_report->'sample') row
    where row->>'parentId' = 'parent-only legacy balance'
      and row->>'tenantId' = 'tenant-a' and row->>'companyId' = 'company-a'
      and row->>'projectId' = 'project-a' and row->>'parentAmount' = '10.0000'
      and (row->>'publishedDetailAmount')::numeric = 0
      and (row->>'publishedDetailCount')::integer = 0) then
    raise exception 'C1 history preflight must preserve actionable parent-only diagnostics';
  end if;
  select jsonb_build_object(
    'parents', (select jsonb_agg(to_jsonb(item) order by item.id) from pg_temp.c1_history_parents item),
    'details', (select jsonb_agg(to_jsonb(detail) order by to_jsonb(detail)::text) from pg_temp.c1_history_details detail)
  ) into v_after;
  if v_after is distinct from v_before then
    raise exception 'C1 history preflight changed historical balances or detail state';
  end if;

  -- Remove only synthetic failing cases; all valid controls must then pass.
  delete from pg_temp.c1_history_parents where id = any(v_expected);
  if pg_temp.c1_history_preflight_result() is not null then
    raise exception 'C1 history preflight rejected valid zero/opening-balance/draft controls';
  end if;

  -- Diagnostic limits must not turn an incomplete sample into an incomplete count.
  insert into pg_temp.c1_history_parents(id, amount, amount_text)
    select 'bounded mismatch ' || n, 1, '1.0000' from generate_series(1, 25) n;
  v_report := pg_temp.c1_history_preflight_result();
  if (v_report->>'mismatchCount')::integer is distinct from 25 or jsonb_array_length(v_report->'sample') is distinct from 20 then
    raise exception 'C1 history preflight must count every mismatch and bound the diagnostic sample';
  end if;
end;
$history_assertions$;
select 'C1_PUBLISHED_COST_HISTORY_REHEARSAL_COMPLETE' as result;
