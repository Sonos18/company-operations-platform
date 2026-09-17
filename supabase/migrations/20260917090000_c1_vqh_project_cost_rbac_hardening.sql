do $$
declare
  v_tenant_id uuid := '10000000-0000-4000-8000-000000000010'::uuid;
  v_company_id uuid := '10000000-0000-4000-8000-000000000020'::uuid;
  v_accountant_role_id uuid;
  v_operator_role_id uuid;
  v_required_permissions text[] := array[
    'accounting_document.read',
    'accounting_document.update',
    'supplier.read',
    'inventory_value.read',
    'cost.read',
    'cost.manage',
    'cost.correct'
  ];
  v_accountant_before text[];
  v_operator_before text[];
  v_accountant_after text[];
  v_operator_after text[];
  v_operator_obsolete text[] := array[
    'project.register.manage',
    'party.manage',
    'engagement.manage',
    'cost.source.read',
    'cost.prepare',
    'cost.config.manage'
  ];
begin
  select role.id into v_accountant_role_id
    from public.roles role
   where role.id = '10000000-0000-4000-8000-000000000307'::uuid
     and role.tenant_id = v_tenant_id
     and role.company_id = v_company_id
     and role.code = 'accountant'
     and role.is_active;

  if v_accountant_role_id is null then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_ROLE_SCOPE_DRIFT';
  end if;

  select role.id into v_operator_role_id
    from public.roles role
   where role.tenant_id = v_tenant_id
     and role.company_id = v_company_id
     and role.code = 'c1_vqh_cost_operator'
     and role.is_active;

  if v_operator_role_id is null then
    raise exception using errcode = 'P0001', message = 'C1_COST_OPERATOR_ROLE_SCOPE_DRIFT';
  end if;

  if (select array_agg(permission.code order by permission.code)
        from public.permissions permission
       where permission.code = any(v_required_permissions)) is distinct from
     (select array_agg(permission_code order by permission_code)
        from unnest(v_required_permissions) permission_code) then
    raise exception using errcode = 'P0001', message = 'C1_PROJECT_COST_PERMISSION_CATALOG_DRIFT';
  end if;

  select array_agg(permission.permission_code order by permission.permission_code)
    into v_accountant_before
    from public.role_permissions permission
   where permission.role_id = v_accountant_role_id;

  if v_accountant_before is distinct from array[
    'accounting_document.read',
    'accounting_document.update',
    'inventory_value.read',
    'supplier.read'
  ] then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_PERMISSION_SCOPE_DRIFT';
  end if;

  select array_agg(permission.permission_code order by permission.permission_code)
    into v_operator_before
    from public.role_permissions permission
   where permission.role_id = v_operator_role_id;

  if v_operator_before is distinct from array[
    'cost.config.manage',
    'cost.correct',
    'cost.manage',
    'cost.prepare',
    'cost.source.read',
    'engagement.manage',
    'party.manage',
    'project.register.manage'
  ] then
    raise exception using errcode = 'P0001', message = 'C1_COST_OPERATOR_PERMISSION_SCOPE_DRIFT';
  end if;

  insert into public.role_permissions(role_id, permission_code)
  values (v_accountant_role_id, 'cost.read')
  on conflict do nothing;

  delete from public.role_permissions
   where role_id = v_operator_role_id
     and permission_code = any(v_operator_obsolete);

  select array_agg(permission.permission_code order by permission.permission_code)
    into v_accountant_after
    from public.role_permissions permission
   where permission.role_id = v_accountant_role_id;

  if v_accountant_after is distinct from array[
    'accounting_document.read',
    'accounting_document.update',
    'cost.read',
    'inventory_value.read',
    'supplier.read'
  ] then
    raise exception using errcode = 'P0001', message = 'C1_ACCOUNTANT_PERMISSION_POSTCONDITION_FAILED';
  end if;

  select array_agg(permission.permission_code order by permission.permission_code)
    into v_operator_after
    from public.role_permissions permission
   where permission.role_id = v_operator_role_id;

  if v_operator_after is distinct from array[
    'cost.correct',
    'cost.manage'
  ] then
    raise exception using errcode = 'P0001', message = 'C1_COST_OPERATOR_PERMISSION_POSTCONDITION_FAILED';
  end if;
end;
$$;
