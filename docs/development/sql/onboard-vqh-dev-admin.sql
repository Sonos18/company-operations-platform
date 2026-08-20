-- Run only in the approved Cloud DEV SQL Editor after the catalog migration is applied.
do $$
declare
  target_email constant text := 'replace-with-dev-admin@example.com';
  target_user_id uuid;
  company_admin_role_id uuid;
begin
  if target_email = 'replace-with-dev-admin@example.com' then
    raise exception 'Replace the DEV admin email before running this script';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(target_email);
  if target_user_id is null then
    raise exception 'No Supabase Auth user found for the supplied DEV admin email';
  end if;

  select id into company_admin_role_id
  from public.roles
  where tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
    and company_id = '10000000-0000-4000-8000-000000000020'::uuid
    and code = 'company_admin'
    and is_system
    and is_active;
  if company_admin_role_id is null
     or exists (
       with expected_permissions(code, module, name, description) as (values
         ('employee.read_directory', 'employee', 'Read employee directory', 'Read the company employee directory'), ('employee.read_self_private', 'employee', 'Read own private details', 'Read the employee private record linked to the current account'), ('employee.read_all', 'employee', 'Read all employee records', 'Read all company employee directory records'), ('employee.read_private', 'employee', 'Read employee private details', 'Read private details for company employees'), ('employee.create', 'employee', 'Create employees', 'Create employee records during onboarding'), ('employee.update', 'employee', 'Update employees', 'Update employee and private-detail records'), ('employee.offboard', 'employee', 'Offboard employees', 'Offboard an employee and remove company access'), ('account.invite', 'account', 'Invite accounts', 'Invite an Auth account for onboarding'), ('account.disable', 'account', 'Disable accounts', 'Disable an Auth account during offboarding'), ('role.read', 'role', 'Read roles', 'Read the company role catalog and assignments'), ('role.assign', 'role', 'Assign roles', 'Grant company role assignments'), ('role.revoke', 'role', 'Revoke roles', 'Revoke company role assignments'), ('supplier.read', 'supplier', 'Read suppliers', 'Read supplier records'), ('supplier.create', 'supplier', 'Create suppliers', 'Create supplier records'), ('supplier.update', 'supplier', 'Update suppliers', 'Update supplier records'), ('quotation_request.create', 'quotation_request', 'Create quotation requests', 'Create supplier quotation requests'), ('quotation_request.update', 'quotation_request', 'Update quotation requests', 'Update supplier quotation requests'), ('inventory.read', 'inventory', 'Read inventory', 'Read inventory context'), ('stock_count.create', 'inventory', 'Create stock counts', 'Create stock count records'), ('stock_count.update', 'inventory', 'Update stock counts', 'Update stock count records'), ('stock_adjustment.read', 'inventory', 'Read stock adjustments', 'Read stock adjustment history'), ('stock_adjustment.approve', 'inventory', 'Approve stock adjustments', 'Approve stock adjustments'), ('technical_document.read', 'technical_document', 'Read technical documents', 'Read technical documents'), ('technical_document.update', 'technical_document', 'Update technical documents', 'Update technical documents'), ('drawing.read', 'drawing', 'Read drawings', 'Read design drawings'), ('drawing.create', 'drawing', 'Create drawings', 'Create design drawings'), ('drawing.update', 'drawing', 'Update drawings', 'Update design drawings'), ('accounting_document.read', 'accounting_document', 'Read accounting documents', 'Read accounting documents'), ('accounting_document.update', 'accounting_document', 'Update accounting documents', 'Update accounting documents'), ('supplier_payment.approve', 'accounting_document', 'Approve supplier payments', 'Approve supplier payments'), ('inventory_value.read', 'inventory', 'Read inventory value', 'Read inventory valuation'), ('project.read', 'project', 'Read projects', 'Read projects needed for assigned work'), ('task.read_assigned', 'task', 'Read assigned tasks', 'Read tasks assigned to the current employee'), ('task.update_assigned', 'task', 'Update assigned tasks', 'Update assigned tasks')
       )
       select 1 from expected_permissions expected
       left join public.permissions permission on permission.code = expected.code
       where permission.module is distinct from expected.module
         or permission.name is distinct from expected.name
         or permission.description is distinct from expected.description
     )
     or exists (
       select 1
       from public.permissions permission
       left join public.role_permissions role_permission
         on role_permission.role_id = company_admin_role_id
        and role_permission.permission_code = permission.code
       where role_permission.permission_code is null
     ) then
    raise exception 'VQH canonical RBAC catalog is missing or incomplete';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      '10000000-0000-4000-8000-000000000010:10000000-0000-4000-8000-000000000020:company_admin',
      0
    )
  );

  insert into public.tenant_memberships (user_id, tenant_id, roles)
  values (target_user_id, '10000000-0000-4000-8000-000000000010', array['tenant_admin'])
  on conflict (user_id, tenant_id) do update
    set roles = excluded.roles;

  insert into public.company_memberships (user_id, tenant_id, company_id, roles, is_active)
  values (target_user_id, '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true)
  on conflict (user_id, company_id) do update
    set tenant_id = excluded.tenant_id,
        roles = array['employee']::text[],
        is_active = true;

  -- The assignment audit trigger uses auth.uid(); attribute this self-bootstrap explicitly.
  perform set_config('request.jwt.claims', json_build_object('sub', target_user_id::text, 'role', 'authenticated')::text, true);
  insert into public.company_role_assignments (tenant_id, company_id, user_id, role_id, granted_by, grant_reason)
  values (
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020',
    target_user_id,
    company_admin_role_id,
    target_user_id,
    'manual Cloud DEV normalized company-admin bootstrap'
  )
  on conflict (tenant_id, company_id, user_id, role_id) where revoked_at is null do nothing;
end
$$;
