do $$
begin
  if not exists (
    select 1 from public.tenants
    where id = '10000000-0000-4000-8000-000000000010'::uuid
      and code = 'vqh'
      and name = 'Việt Quốc Huy'
  ) then
    raise exception 'VQH_CANONICAL_CATALOG_CONFLICT';
  end if;
  if not exists (
    select 1 from public.companies
    where id = '10000000-0000-4000-8000-000000000020'::uuid
      and tenant_id = '10000000-0000-4000-8000-000000000010'::uuid
      and code = 'VQH'
      and name = 'Việt Quốc Huy'
  ) then
    raise exception 'VQH_CANONICAL_CATALOG_CONFLICT';
  end if;
  if exists (
    select 1
    from public.departments department
    where (department.id, department.code) in (
      ('10000000-0000-4000-8000-000000000201'::uuid, 'BLD'),
      ('10000000-0000-4000-8000-000000000202'::uuid, 'HR'),
      ('10000000-0000-4000-8000-000000000203'::uuid, 'TECH'),
      ('10000000-0000-4000-8000-000000000204'::uuid, 'DESIGN'),
      ('10000000-0000-4000-8000-000000000205'::uuid, 'CONSTRUCTION'),
      ('10000000-0000-4000-8000-000000000206'::uuid, 'PROCUREMENT'),
      ('10000000-0000-4000-8000-000000000207'::uuid, 'ACCOUNTING')
    )
      and (department.tenant_id, department.company_id) is distinct from (
        '10000000-0000-4000-8000-000000000010'::uuid,
        '10000000-0000-4000-8000-000000000020'::uuid
      )
  ) then
    raise exception 'VQH_CANONICAL_CATALOG_CONFLICT';
  end if;
  if exists (
    select 1
    from public.roles role
    where (role.id, role.code) in (
      ('10000000-0000-4000-8000-000000000301'::uuid, 'employee'),
      ('10000000-0000-4000-8000-000000000302'::uuid, 'hr_manager'),
      ('10000000-0000-4000-8000-000000000303'::uuid, 'supplier_sourcing'),
      ('10000000-0000-4000-8000-000000000304'::uuid, 'inventory_auditor'),
      ('10000000-0000-4000-8000-000000000305'::uuid, 'technical_staff'),
      ('10000000-0000-4000-8000-000000000306'::uuid, 'designer'),
      ('10000000-0000-4000-8000-000000000307'::uuid, 'accountant'),
      ('10000000-0000-4000-8000-000000000308'::uuid, 'company_admin')
    )
      and (role.tenant_id, role.company_id) is distinct from (
        '10000000-0000-4000-8000-000000000010'::uuid,
        '10000000-0000-4000-8000-000000000020'::uuid
      )
  ) then
    raise exception 'VQH_CANONICAL_CATALOG_CONFLICT';
  end if;
end $$;

insert into public.departments (id, tenant_id, company_id, code, name) values
  ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'BLD', 'Ban lãnh đạo'),
  ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'HR', 'Phòng Nhân sự'),
  ('10000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'TECH', 'Phòng Kỹ thuật'),
  ('10000000-0000-4000-8000-000000000204', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'DESIGN', 'Phòng Thiết kế'),
  ('10000000-0000-4000-8000-000000000205', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'CONSTRUCTION', 'Thi công – Hiện trường'),
  ('10000000-0000-4000-8000-000000000206', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'PROCUREMENT', 'Vật tư – Mua hàng'),
  ('10000000-0000-4000-8000-000000000207', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'ACCOUNTING', 'Phòng Kế toán')
on conflict do nothing;

insert into public.roles (id, tenant_id, company_id, code, name, description, is_privileged, is_system, is_active) values
  ('10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'employee', 'Nhân viên', 'Company directory and assigned-work access', false, true, true),
  ('10000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'hr_manager', 'Quản lý nhân sự', 'Employee records, private details, and account invitations', false, true, true),
  ('10000000-0000-4000-8000-000000000303', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'supplier_sourcing', 'Thu mua', 'Supplier and quotation sourcing', false, true, true),
  ('10000000-0000-4000-8000-000000000304', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'inventory_auditor', 'Kiểm kê kho', 'Inventory and stock count audit', false, true, true),
  ('10000000-0000-4000-8000-000000000305', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'technical_staff', 'Nhân viên kỹ thuật', 'Technical documents and assigned work', false, true, true),
  ('10000000-0000-4000-8000-000000000306', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'designer', 'Nhân viên thiết kế', 'Drawings and assigned work', false, true, true),
  ('10000000-0000-4000-8000-000000000307', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'accountant', 'Kế toán', 'Accounting documents, suppliers, and inventory value', false, true, true),
  ('10000000-0000-4000-8000-000000000308', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'company_admin', 'Quản trị công ty', 'Complete explicit company permission set', true, true, true)
on conflict do nothing;

insert into public.permissions (code, module, name, description) values
  ('employee.read_directory', 'employee', 'Read employee directory', 'Read the company employee directory'), ('employee.read_self_private', 'employee', 'Read own private details', 'Read the employee private record linked to the current account'), ('employee.read_all', 'employee', 'Read all employee records', 'Read all company employee directory records'), ('employee.read_private', 'employee', 'Read employee private details', 'Read private details for company employees'), ('employee.create', 'employee', 'Create employees', 'Create employee records during onboarding'), ('employee.update', 'employee', 'Update employees', 'Update employee and private-detail records'), ('employee.offboard', 'employee', 'Offboard employees', 'Offboard an employee and remove company access'), ('account.invite', 'account', 'Invite accounts', 'Invite an Auth account for onboarding'), ('account.disable', 'account', 'Disable accounts', 'Disable an Auth account during offboarding'), ('role.read', 'role', 'Read roles', 'Read the company role catalog and assignments'), ('role.assign', 'role', 'Assign roles', 'Grant company role assignments'), ('role.revoke', 'role', 'Revoke roles', 'Revoke company role assignments'), ('supplier.read', 'supplier', 'Read suppliers', 'Read supplier records'), ('supplier.create', 'supplier', 'Create suppliers', 'Create supplier records'), ('supplier.update', 'supplier', 'Update suppliers', 'Update supplier records'), ('quotation_request.create', 'quotation_request', 'Create quotation requests', 'Create supplier quotation requests'), ('quotation_request.update', 'quotation_request', 'Update quotation requests', 'Update supplier quotation requests'), ('inventory.read', 'inventory', 'Read inventory', 'Read inventory context'), ('stock_count.create', 'inventory', 'Create stock counts', 'Create stock count records'), ('stock_count.update', 'inventory', 'Update stock counts', 'Update stock count records'), ('stock_adjustment.read', 'inventory', 'Read stock adjustments', 'Read stock adjustment history'), ('stock_adjustment.approve', 'inventory', 'Approve stock adjustments', 'Approve stock adjustments'), ('technical_document.read', 'technical_document', 'Read technical documents', 'Read technical documents'), ('technical_document.update', 'technical_document', 'Update technical documents', 'Update technical documents'), ('drawing.read', 'drawing', 'Read drawings', 'Read design drawings'), ('drawing.create', 'drawing', 'Create drawings', 'Create design drawings'), ('drawing.update', 'drawing', 'Update drawings', 'Update design drawings'), ('accounting_document.read', 'accounting_document', 'Read accounting documents', 'Read accounting documents'), ('accounting_document.update', 'accounting_document', 'Update accounting documents', 'Update accounting documents'), ('supplier_payment.approve', 'accounting_document', 'Approve supplier payments', 'Approve supplier payments'), ('inventory_value.read', 'inventory', 'Read inventory value', 'Read inventory valuation'), ('project.read', 'project', 'Read projects', 'Read projects needed for assigned work'), ('task.read_assigned', 'task', 'Read assigned tasks', 'Read tasks assigned to the current employee'), ('task.update_assigned', 'task', 'Update assigned tasks', 'Update assigned tasks')
on conflict do nothing;

with expected_role_permissions(role_code, permission_code) as (values
  ('employee','employee.read_directory'), ('employee','employee.read_self_private'), ('employee','project.read'), ('employee','task.read_assigned'), ('employee','task.update_assigned'),
  ('hr_manager','employee.read_directory'), ('hr_manager','employee.read_all'), ('hr_manager','employee.read_private'), ('hr_manager','employee.create'), ('hr_manager','employee.update'), ('hr_manager','account.invite'), ('hr_manager','role.read'),
  ('supplier_sourcing','supplier.read'), ('supplier_sourcing','supplier.create'), ('supplier_sourcing','supplier.update'), ('supplier_sourcing','quotation_request.create'), ('supplier_sourcing','quotation_request.update'), ('supplier_sourcing','inventory.read'),
  ('inventory_auditor','inventory.read'), ('inventory_auditor','stock_count.create'), ('inventory_auditor','stock_count.update'), ('inventory_auditor','stock_adjustment.read'),
  ('technical_staff','project.read'), ('technical_staff','task.read_assigned'), ('technical_staff','task.update_assigned'), ('technical_staff','technical_document.read'), ('technical_staff','technical_document.update'),
  ('designer','project.read'), ('designer','task.read_assigned'), ('designer','task.update_assigned'), ('designer','drawing.read'), ('designer','drawing.create'), ('designer','drawing.update'),
  ('accountant','accounting_document.read'), ('accountant','accounting_document.update'), ('accountant','supplier.read'), ('accountant','inventory_value.read')
)
insert into public.role_permissions (role_id, permission_code)
select role.id, expected_role_permissions.permission_code
from expected_role_permissions
join public.roles role on role.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid and role.company_id = '10000000-0000-4000-8000-000000000020'::uuid and role.code = expected_role_permissions.role_code
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select role.id, permission.code
from public.roles role cross join public.permissions permission
where role.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid and role.company_id = '10000000-0000-4000-8000-000000000020'::uuid and role.code = 'company_admin'
on conflict do nothing;

do $$
begin
  if exists (
    with expected_department(id, code) as (values
      ('10000000-0000-4000-8000-000000000201'::uuid, 'BLD'), ('10000000-0000-4000-8000-000000000202'::uuid, 'HR'), ('10000000-0000-4000-8000-000000000203'::uuid, 'TECH'), ('10000000-0000-4000-8000-000000000204'::uuid, 'DESIGN'), ('10000000-0000-4000-8000-000000000205'::uuid, 'CONSTRUCTION'), ('10000000-0000-4000-8000-000000000206'::uuid, 'PROCUREMENT'), ('10000000-0000-4000-8000-000000000207'::uuid, 'ACCOUNTING')
    )
    select 1 from expected_department expected left join public.departments department on department.id = expected.id
    where department.code is distinct from expected.code or department.tenant_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid or department.company_id is distinct from '10000000-0000-4000-8000-000000000020'::uuid
  ) then
    raise exception 'VQH_CANONICAL_CATALOG_CONFLICT';
  end if;
  if exists (
    with expected_role(id, code) as (values
      ('10000000-0000-4000-8000-000000000301'::uuid, 'employee'), ('10000000-0000-4000-8000-000000000302'::uuid, 'hr_manager'), ('10000000-0000-4000-8000-000000000303'::uuid, 'supplier_sourcing'), ('10000000-0000-4000-8000-000000000304'::uuid, 'inventory_auditor'), ('10000000-0000-4000-8000-000000000305'::uuid, 'technical_staff'), ('10000000-0000-4000-8000-000000000306'::uuid, 'designer'), ('10000000-0000-4000-8000-000000000307'::uuid, 'accountant'), ('10000000-0000-4000-8000-000000000308'::uuid, 'company_admin')
    )
    select 1 from expected_role expected left join public.roles role on role.id = expected.id
    where role.code is distinct from expected.code or role.tenant_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid or role.company_id is distinct from '10000000-0000-4000-8000-000000000020'::uuid
  ) then
    raise exception 'VQH_CANONICAL_CATALOG_CONFLICT';
  end if;
  if (select count(*) from public.departments where tenant_id = '10000000-0000-4000-8000-000000000010'::uuid and company_id = '10000000-0000-4000-8000-000000000020'::uuid and code in ('BLD','HR','TECH','DESIGN','CONSTRUCTION','PROCUREMENT','ACCOUNTING')) <> 7
    or (select count(*) from public.roles where tenant_id = '10000000-0000-4000-8000-000000000010'::uuid and company_id = '10000000-0000-4000-8000-000000000020'::uuid and code in ('employee','hr_manager','supplier_sourcing','inventory_auditor','technical_staff','designer','accountant','company_admin')) <> 8
    or (select count(*) from public.permissions) <> 34
    or (select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.tenant_id = '10000000-0000-4000-8000-000000000010'::uuid and r.company_id = '10000000-0000-4000-8000-000000000020'::uuid and r.code in ('employee','hr_manager','supplier_sourcing','inventory_auditor','technical_staff','designer','accountant','company_admin')) <> 71 then
    raise exception 'VQH_CANONICAL_CATALOG_CONFLICT';
  end if;
end $$;
