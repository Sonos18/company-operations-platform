-- Local deterministic identities only. Authentication credentials are intentionally
-- not committed; browser login/session work is deferred to a separate phase.
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner@vqh.local'),
  ('10000000-0000-4000-8000-000000000101', 'nhu@vqh.local'),
  ('10000000-0000-4000-8000-000000000102', 'long@vqh.local'),
  ('10000000-0000-4000-8000-000000000103', 'hieu@vqh.local'),
  ('10000000-0000-4000-8000-000000000104', 'y@vqh.local'),
  ('10000000-0000-4000-8000-000000000105', 'nhi@vqh.local'),
  ('10000000-0000-4000-8000-000000000106', 'hau@vqh.local'),
  ('20000000-0000-4000-8000-000000000001', 'owner@isolation.local')
on conflict (id) do update
  set email = excluded.email;

insert into public.tenants (id, code, name) values
  ('10000000-0000-4000-8000-000000000010', 'vqh', 'Việt Quốc Huy'),
  ('20000000-0000-4000-8000-000000000010', 'isolation', 'Tenant kiểm thử cách ly')
on conflict (id) do update
  set code = excluded.code,
      name = excluded.name;

insert into public.companies (id, tenant_id, code, name) values
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000010', 'VQH', 'Việt Quốc Huy'),
  ('20000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000010', 'ISO', 'Công ty kiểm thử cách ly')
on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      code = excluded.code,
      name = excluded.name;

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', array['tenant_admin']),
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000010', array['employee']),
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000010', array['employee']),
  ('10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000010', array['employee']),
  ('10000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000010', array['employee']),
  ('10000000-0000-4000-8000-000000000105', '10000000-0000-4000-8000-000000000010', array['employee']),
  ('10000000-0000-4000-8000-000000000106', '10000000-0000-4000-8000-000000000010', array['employee']),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000010', array['tenant_admin'])
on conflict (user_id, tenant_id) do nothing;

insert into public.company_memberships (user_id, tenant_id, company_id, roles, is_active) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true),
  ('10000000-0000-4000-8000-000000000101', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true),
  ('10000000-0000-4000-8000-000000000102', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true),
  ('10000000-0000-4000-8000-000000000103', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true),
  ('10000000-0000-4000-8000-000000000104', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true),
  ('10000000-0000-4000-8000-000000000105', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true),
  ('10000000-0000-4000-8000-000000000106', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['employee'], true),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000020', array['employee'], true)
on conflict (user_id, company_id) do update
  set tenant_id = excluded.tenant_id,
      roles = array['employee']::text[],
      is_active = true;

insert into public.departments (id, tenant_id, company_id, code, name) values
  ('10000000-0000-4000-8000-000000000201', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'BLD', 'Ban lãnh đạo'),
  ('10000000-0000-4000-8000-000000000202', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'HR', 'Phòng Nhân sự'),
  ('10000000-0000-4000-8000-000000000203', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'TECH', 'Phòng Kỹ thuật'),
  ('10000000-0000-4000-8000-000000000204', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'DESIGN', 'Phòng Thiết kế'),
  ('10000000-0000-4000-8000-000000000205', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'CONSTRUCTION', 'Thi công – Hiện trường'),
  ('10000000-0000-4000-8000-000000000206', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'PROCUREMENT', 'Vật tư – Mua hàng'),
  ('10000000-0000-4000-8000-000000000207', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'ACCOUNTING', 'Phòng Kế toán')
on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      company_id = excluded.company_id,
      code = excluded.code,
      name = excluded.name,
      is_active = true;

insert into public.roles (id, tenant_id, company_id, code, name, description, is_privileged, is_system, is_active) values
  ('10000000-0000-4000-8000-000000000301', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'employee', 'Nhân viên', 'Company directory and assigned-work access', false, true, true),
  ('10000000-0000-4000-8000-000000000302', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'hr_manager', 'Quản lý nhân sự', 'Employee records, private details, and account invitations', false, true, true),
  ('10000000-0000-4000-8000-000000000303', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'supplier_sourcing', 'Thu mua', 'Supplier and quotation sourcing', false, true, true),
  ('10000000-0000-4000-8000-000000000304', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'inventory_auditor', 'Kiểm kê kho', 'Inventory and stock count audit', false, true, true),
  ('10000000-0000-4000-8000-000000000305', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'technical_staff', 'Nhân viên kỹ thuật', 'Technical documents and assigned work', false, true, true),
  ('10000000-0000-4000-8000-000000000306', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'designer', 'Nhân viên thiết kế', 'Drawings and assigned work', false, true, true),
  ('10000000-0000-4000-8000-000000000307', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'accountant', 'Kế toán', 'Accounting documents, suppliers, and inventory value', false, true, true),
  ('10000000-0000-4000-8000-000000000308', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', 'company_admin', 'Quản trị công ty', 'Complete explicit company permission set', true, true, true)
on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      company_id = excluded.company_id,
      code = excluded.code,
      name = excluded.name,
      description = excluded.description,
      is_privileged = excluded.is_privileged,
      is_system = excluded.is_system,
      is_active = excluded.is_active;

insert into public.permissions (code, module, name, description) values
  ('employee.read_directory', 'employee', 'Read employee directory', 'Read the company employee directory'),
  ('employee.read_self_private', 'employee', 'Read own private details', 'Read the employee private record linked to the current account'),
  ('employee.read_all', 'employee', 'Read all employee records', 'Read all company employee directory records'),
  ('employee.read_private', 'employee', 'Read employee private details', 'Read private details for company employees'),
  ('employee.create', 'employee', 'Create employees', 'Create employee records during onboarding'),
  ('employee.update', 'employee', 'Update employees', 'Update employee and private-detail records'),
  ('employee.offboard', 'employee', 'Offboard employees', 'Offboard an employee and remove company access'),
  ('account.invite', 'account', 'Invite accounts', 'Invite an Auth account for onboarding'),
  ('account.disable', 'account', 'Disable accounts', 'Disable an Auth account during offboarding'),
  ('role.read', 'role', 'Read roles', 'Read the company role catalog and assignments'),
  ('role.assign', 'role', 'Assign roles', 'Grant company role assignments'),
  ('role.revoke', 'role', 'Revoke roles', 'Revoke company role assignments'),
  ('supplier.read', 'supplier', 'Read suppliers', 'Read supplier records'),
  ('supplier.create', 'supplier', 'Create suppliers', 'Create supplier records'),
  ('supplier.update', 'supplier', 'Update suppliers', 'Update supplier records'),
  ('quotation_request.create', 'quotation_request', 'Create quotation requests', 'Create supplier quotation requests'),
  ('quotation_request.update', 'quotation_request', 'Update quotation requests', 'Update supplier quotation requests'),
  ('inventory.read', 'inventory', 'Read inventory', 'Read inventory context'),
  ('stock_count.create', 'inventory', 'Create stock counts', 'Create stock count records'),
  ('stock_count.update', 'inventory', 'Update stock counts', 'Update stock count records'),
  ('stock_adjustment.read', 'inventory', 'Read stock adjustments', 'Read stock adjustment history'),
  ('stock_adjustment.approve', 'inventory', 'Approve stock adjustments', 'Approve stock adjustments'),
  ('technical_document.read', 'technical_document', 'Read technical documents', 'Read technical documents'),
  ('technical_document.update', 'technical_document', 'Update technical documents', 'Update technical documents'),
  ('drawing.read', 'drawing', 'Read drawings', 'Read design drawings'),
  ('drawing.create', 'drawing', 'Create drawings', 'Create design drawings'),
  ('drawing.update', 'drawing', 'Update drawings', 'Update design drawings'),
  ('accounting_document.read', 'accounting_document', 'Read accounting documents', 'Read accounting documents'),
  ('accounting_document.update', 'accounting_document', 'Update accounting documents', 'Update accounting documents'),
  ('supplier_payment.approve', 'accounting_document', 'Approve supplier payments', 'Approve supplier payments'),
  ('inventory_value.read', 'inventory', 'Read inventory value', 'Read inventory valuation'),
  ('project.read', 'project', 'Read projects', 'Read projects needed for assigned work'),
  ('task.read_assigned', 'task', 'Read assigned tasks', 'Read tasks assigned to the current employee'),
  ('task.update_assigned', 'task', 'Update assigned tasks', 'Update tasks assigned to the current employee')
on conflict (code) do update
  set module = excluded.module,
      name = excluded.name,
      description = excluded.description;

with requested_role_permissions(role_code, permission_code) as (
  values
    ('employee', 'employee.read_directory'),
    ('employee', 'employee.read_self_private'),
    ('employee', 'project.read'),
    ('employee', 'task.read_assigned'),
    ('employee', 'task.update_assigned'),
    ('hr_manager', 'employee.read_directory'),
    ('hr_manager', 'employee.read_all'),
    ('hr_manager', 'employee.read_private'),
    ('hr_manager', 'employee.create'),
    ('hr_manager', 'employee.update'),
    ('hr_manager', 'account.invite'),
    ('hr_manager', 'role.read'),
    ('supplier_sourcing', 'supplier.read'),
    ('supplier_sourcing', 'supplier.create'),
    ('supplier_sourcing', 'supplier.update'),
    ('supplier_sourcing', 'quotation_request.create'),
    ('supplier_sourcing', 'quotation_request.update'),
    ('supplier_sourcing', 'inventory.read'),
    ('inventory_auditor', 'inventory.read'),
    ('inventory_auditor', 'stock_count.create'),
    ('inventory_auditor', 'stock_count.update'),
    ('inventory_auditor', 'stock_adjustment.read'),
    ('technical_staff', 'project.read'),
    ('technical_staff', 'task.read_assigned'),
    ('technical_staff', 'task.update_assigned'),
    ('technical_staff', 'technical_document.read'),
    ('technical_staff', 'technical_document.update'),
    ('designer', 'project.read'),
    ('designer', 'task.read_assigned'),
    ('designer', 'task.update_assigned'),
    ('designer', 'drawing.read'),
    ('designer', 'drawing.create'),
    ('designer', 'drawing.update'),
    ('accountant', 'accounting_document.read'),
    ('accountant', 'accounting_document.update'),
    ('accountant', 'supplier.read'),
    ('accountant', 'inventory_value.read')
)
insert into public.role_permissions (role_id, permission_code)
select company_role.id, requested_role_permissions.permission_code
from requested_role_permissions
join public.roles company_role
  on company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
 and company_role.company_id = '10000000-0000-4000-8000-000000000020'
 and company_role.code = requested_role_permissions.role_code
on conflict do nothing;

insert into public.role_permissions (role_id, permission_code)
select company_role.id, permission.code
from public.roles company_role
cross join public.permissions permission
where company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
  and company_role.company_id = '10000000-0000-4000-8000-000000000020'
  and company_role.code = 'company_admin'
on conflict do nothing;

insert into public.employees (
  id,
  tenant_id,
  company_id,
  user_id,
  employee_code,
  full_name,
  work_email,
  department_id,
  position_id,
  hire_date,
  probation_end_date,
  employment_status,
  created_by
) values
  ('10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000101', 'VQH-NHU', 'Như', 'nhu@vqh.local', '10000000-0000-4000-8000-000000000202', null, null, null, 'active', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000402', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000102', 'VQH-LONG', 'Long', 'long@vqh.local', '10000000-0000-4000-8000-000000000203', null, null, null, 'active', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000403', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000103', 'VQH-HIEU', 'Hiếu', 'hieu@vqh.local', '10000000-0000-4000-8000-000000000203', null, null, null, 'active', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000404', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000104', 'VQH-Y', 'Y', 'y@vqh.local', '10000000-0000-4000-8000-000000000207', null, null, null, 'active', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000405', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000105', 'VQH-NHI', 'Nhi', 'nhi@vqh.local', '10000000-0000-4000-8000-000000000204', null, null, null, 'active', '10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000406', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000106', 'VQH-HAU', 'Hậu', 'hau@vqh.local', '10000000-0000-4000-8000-000000000204', null, null, null, 'active', '10000000-0000-4000-8000-000000000001')
on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      company_id = excluded.company_id,
      user_id = excluded.user_id,
      employee_code = excluded.employee_code,
      full_name = excluded.full_name,
      work_email = excluded.work_email,
      department_id = excluded.department_id,
      position_id = excluded.position_id,
      hire_date = excluded.hire_date,
      probation_end_date = excluded.probation_end_date,
      employment_status = excluded.employment_status,
      created_by = excluded.created_by;

insert into public.employee_private_details (employee_id, tenant_id, company_id)
select employee.id, employee.tenant_id, employee.company_id
from public.employees employee
where employee.tenant_id = '10000000-0000-4000-8000-000000000010'
  and employee.company_id = '10000000-0000-4000-8000-000000000020'
  and employee.employee_code in ('VQH-NHU', 'VQH-LONG', 'VQH-HIEU', 'VQH-Y', 'VQH-NHI', 'VQH-HAU')
on conflict (employee_id) do nothing;

with requested_assignments(user_id, role_code) as (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'company_admin'),
    ('10000000-0000-4000-8000-000000000101'::uuid, 'employee'),
    ('10000000-0000-4000-8000-000000000101'::uuid, 'hr_manager'),
    ('10000000-0000-4000-8000-000000000101'::uuid, 'supplier_sourcing'),
    ('10000000-0000-4000-8000-000000000101'::uuid, 'inventory_auditor'),
    ('10000000-0000-4000-8000-000000000102'::uuid, 'employee'),
    ('10000000-0000-4000-8000-000000000102'::uuid, 'technical_staff'),
    ('10000000-0000-4000-8000-000000000103'::uuid, 'employee'),
    ('10000000-0000-4000-8000-000000000103'::uuid, 'technical_staff'),
    ('10000000-0000-4000-8000-000000000104'::uuid, 'employee'),
    ('10000000-0000-4000-8000-000000000104'::uuid, 'accountant'),
    ('10000000-0000-4000-8000-000000000105'::uuid, 'employee'),
    ('10000000-0000-4000-8000-000000000105'::uuid, 'designer'),
    ('10000000-0000-4000-8000-000000000106'::uuid, 'employee'),
    ('10000000-0000-4000-8000-000000000106'::uuid, 'designer')
)
insert into public.company_role_assignments (
  tenant_id,
  company_id,
  user_id,
  role_id,
  granted_by,
  grant_reason
)
select
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000020',
  requested_assignments.user_id,
  company_role.id,
  '10000000-0000-4000-8000-000000000001',
  'canonical local development seed'
from requested_assignments
join public.roles company_role
  on company_role.tenant_id = '10000000-0000-4000-8000-000000000010'
 and company_role.company_id = '10000000-0000-4000-8000-000000000020'
 and company_role.code = requested_assignments.role_code
on conflict (tenant_id, company_id, user_id, role_id) where revoked_at is null do nothing;
