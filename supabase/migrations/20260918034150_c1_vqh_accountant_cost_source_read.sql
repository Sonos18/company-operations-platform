do $$
declare
  v_tenant_id uuid := '10000000-0000-4000-8000-000000000010'::uuid;
  v_company_id uuid := '10000000-0000-4000-8000-000000000020'::uuid;
  v_accountant_role_id uuid;
  v_operator_role_id uuid;
  v_accountant_before text[];
  v_accountant_after text[];
  v_operator_before text[];
  v_operator_after text[];
begin
  select id into v_accountant_role_id from public.roles where id = '10000000-0000-4000-8000-000000000307'::uuid and tenant_id = v_tenant_id and company_id = v_company_id and code = 'accountant' and is_active;
  select id into v_operator_role_id from public.roles where tenant_id = v_tenant_id and company_id = v_company_id and code = 'c1_vqh_cost_operator' and is_active;
  if v_accountant_role_id is null or v_operator_role_id is null or not exists (select 1 from public.permissions where code = 'cost.source.read') then raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_SOURCE_READ_SCOPE_DRIFT'; end if;
  select array_agg(permission_code order by permission_code) into v_accountant_before from public.role_permissions where role_id = v_accountant_role_id;
  select array_agg(permission_code order by permission_code) into v_operator_before from public.role_permissions where role_id = v_operator_role_id;
  if v_accountant_before is distinct from array['accounting_document.read','accounting_document.update','cost.read','inventory_value.read','supplier.read'] then raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_SOURCE_READ_PRESTATE_DRIFT'; end if;
  if v_operator_before is distinct from array['cost.correct','cost.manage'] then raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_SOURCE_READ_OPERATOR_DRIFT'; end if;
  insert into public.role_permissions(role_id, permission_code) values (v_accountant_role_id, 'cost.source.read') on conflict do nothing;
  select array_agg(permission_code order by permission_code) into v_accountant_after from public.role_permissions where role_id = v_accountant_role_id;
  select array_agg(permission_code order by permission_code) into v_operator_after from public.role_permissions where role_id = v_operator_role_id;
  if v_accountant_after is distinct from array['accounting_document.read','accounting_document.update','cost.read','cost.source.read','inventory_value.read','supplier.read'] then raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_SOURCE_READ_POSTSTATE_FAILED'; end if;
  if v_operator_after is distinct from array['cost.correct','cost.manage'] then raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_SOURCE_READ_OPERATOR_POSTSTATE_FAILED'; end if;
end;
$$;
