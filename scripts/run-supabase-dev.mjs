import { spawnSync } from 'node:child_process'
import { dirname, join, posix, resolve } from 'node:path'
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevEnvironment, assertCloudDevTarget } from './assert-cloud-dev-target.mjs'

const SUPABASE_DEV_HOME_SEGMENTS = ['SupabaseCLI', 'company-operations-dev']
const VQH_RLS_SMOKE_SQL = String.raw`begin;
do $$
declare
  member_tenant_count integer;
  member_company_count integer;
  non_member_tenant_count integer;
  non_member_company_count integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (
    select assignment.user_id::text
    from public.tenant_memberships tenant_membership
    join public.company_memberships company_membership on company_membership.user_id = tenant_membership.user_id and company_membership.tenant_id = tenant_membership.tenant_id
    join public.company_role_assignments assignment on assignment.user_id = company_membership.user_id and assignment.tenant_id = company_membership.tenant_id and assignment.company_id = company_membership.company_id and assignment.revoked_at is null
    join public.roles role on role.id = assignment.role_id
    where tenant_membership.tenant_id = '10000000-0000-4000-8000-000000000010'
      and tenant_membership.roles @> array['tenant_admin']::text[]
      and company_membership.company_id = '10000000-0000-4000-8000-000000000020'
      and company_membership.is_active
      and role.code = 'company_admin'
      and role.is_active
    limit 1
  ), 'role', 'authenticated')::text, true);
  if auth.uid() is null then raise exception 'VQH active normalized company admin is missing'; end if;
  execute 'set local role authenticated';
  select count(*) into member_tenant_count from public.tenants where id = '10000000-0000-4000-8000-000000000010';
  select count(*) into member_company_count from public.companies where id = '10000000-0000-4000-8000-000000000020' and tenant_id = '10000000-0000-4000-8000-000000000010';
  if member_tenant_count <> 1 or member_company_count <> 1 then raise exception 'VQH member visibility check failed'; end if;
  perform set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  select count(*) into non_member_tenant_count from public.tenants;
  select count(*) into non_member_company_count from public.companies;
  if non_member_tenant_count <> 0 or non_member_company_count <> 0 then raise exception 'VQH non-member visibility check failed'; end if;
end $$;
select 'PASS' as result;
rollback;`
const VQH_CANONICAL_CHECK_SQL = String.raw`begin;
do $$
begin
  if not exists (select 1 from public.tenants where id = '10000000-0000-4000-8000-000000000010' and code = 'vqh' and name = 'Việt Quốc Huy') then
    raise exception 'canonical VQH tenant boundary/name check failed';
  end if;
  if not exists (select 1 from public.companies where id = '10000000-0000-4000-8000-000000000020' and tenant_id = '10000000-0000-4000-8000-000000000010' and code = 'VQH' and name = 'Việt Quốc Huy') then
    raise exception 'canonical VQH company boundary/name check failed';
  end if;
  if exists (
    with expected_departments(id, code, name) as (values
      ('10000000-0000-4000-8000-000000000201'::uuid, 'BLD', 'Ban lãnh đạo'),
      ('10000000-0000-4000-8000-000000000202'::uuid, 'HR', 'Phòng Nhân sự'),
      ('10000000-0000-4000-8000-000000000203'::uuid, 'TECH', 'Phòng Kỹ thuật'),
      ('10000000-0000-4000-8000-000000000204'::uuid, 'DESIGN', 'Phòng Thiết kế'),
      ('10000000-0000-4000-8000-000000000205'::uuid, 'CONSTRUCTION', 'Thi công – Hiện trường'),
      ('10000000-0000-4000-8000-000000000206'::uuid, 'PROCUREMENT', 'Vật tư – Mua hàng'),
      ('10000000-0000-4000-8000-000000000207'::uuid, 'ACCOUNTING', 'Phòng Kế toán')
    )
    select 1 from expected_departments expected
    left join public.departments department on department.id = expected.id
    where department.tenant_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid
      or department.company_id is distinct from '10000000-0000-4000-8000-000000000020'::uuid
      or department.code is distinct from expected.code
      or department.name is distinct from expected.name
      or department.is_active is distinct from true
  ) then
    raise exception 'canonical VQH department catalog metadata check failed';
  end if;
  if exists (
    with expected_roles(id, code, name, description, is_privileged) as (values
      ('10000000-0000-4000-8000-000000000301'::uuid, 'employee', 'Nhân viên', 'Company directory and assigned-work access', false),
      ('10000000-0000-4000-8000-000000000302'::uuid, 'hr_manager', 'Quản lý nhân sự', 'Employee records, private details, and account invitations', false),
      ('10000000-0000-4000-8000-000000000303'::uuid, 'supplier_sourcing', 'Thu mua', 'Supplier and quotation sourcing', false),
      ('10000000-0000-4000-8000-000000000304'::uuid, 'inventory_auditor', 'Kiểm kê kho', 'Inventory and stock count audit', false),
      ('10000000-0000-4000-8000-000000000305'::uuid, 'technical_staff', 'Nhân viên kỹ thuật', 'Technical documents and assigned work', false),
      ('10000000-0000-4000-8000-000000000306'::uuid, 'designer', 'Nhân viên thiết kế', 'Drawings and assigned work', false),
      ('10000000-0000-4000-8000-000000000307'::uuid, 'accountant', 'Kế toán', 'Accounting documents, suppliers, and inventory value', false),
      ('10000000-0000-4000-8000-000000000308'::uuid, 'company_admin', 'Quản trị công ty', 'Complete explicit company permission set', true)
    )
    select 1 from expected_roles expected
    left join public.roles role on role.id = expected.id
    where role.tenant_id is distinct from '10000000-0000-4000-8000-000000000010'::uuid
      or role.company_id is distinct from '10000000-0000-4000-8000-000000000020'::uuid
      or role.code is distinct from expected.code
      or role.name is distinct from expected.name
      or role.description is distinct from expected.description
      or role.is_privileged is distinct from expected.is_privileged
      or role.is_system is distinct from true
      or role.is_active is distinct from true
  ) then
    raise exception 'canonical VQH role catalog metadata check failed';
  end if;
  if exists (
    with expected_permissions(code, module, name, description) as (values
      ('employee.read_directory', 'employee', 'Read employee directory', 'Read the company employee directory'), ('employee.read_self_private', 'employee', 'Read own private details', 'Read the employee private record linked to the current account'), ('employee.read_all', 'employee', 'Read all employee records', 'Read all company employee directory records'), ('employee.read_private', 'employee', 'Read employee private details', 'Read private details for company employees'), ('employee.create', 'employee', 'Create employees', 'Create employee records during onboarding'), ('employee.update', 'employee', 'Update employees', 'Update employee and private-detail records'), ('employee.offboard', 'employee', 'Offboard employees', 'Offboard an employee and remove company access'), ('account.invite', 'account', 'Invite accounts', 'Invite an Auth account for onboarding'), ('account.disable', 'account', 'Disable accounts', 'Disable an Auth account during offboarding'), ('role.read', 'role', 'Read roles', 'Read the company role catalog and assignments'), ('role.assign', 'role', 'Assign roles', 'Grant company role assignments'), ('role.revoke', 'role', 'Revoke roles', 'Revoke company role assignments'), ('supplier.read', 'supplier', 'Read suppliers', 'Read supplier records'), ('supplier.create', 'supplier', 'Create suppliers', 'Create supplier records'), ('supplier.update', 'supplier', 'Update suppliers', 'Update supplier records'), ('quotation_request.create', 'quotation_request', 'Create quotation requests', 'Create supplier quotation requests'), ('quotation_request.update', 'quotation_request', 'Update quotation requests', 'Update supplier quotation requests'), ('inventory.read', 'inventory', 'Read inventory', 'Read inventory context'), ('stock_count.create', 'inventory', 'Create stock counts', 'Create stock count records'), ('stock_count.update', 'inventory', 'Update stock counts', 'Update stock count records'), ('stock_adjustment.read', 'inventory', 'Read stock adjustments', 'Read stock adjustment history'), ('stock_adjustment.approve', 'inventory', 'Approve stock adjustments', 'Approve stock adjustments'), ('technical_document.read', 'technical_document', 'Read technical documents', 'Read technical documents'), ('technical_document.update', 'technical_document', 'Update technical documents', 'Update technical documents'), ('drawing.read', 'drawing', 'Read drawings', 'Read design drawings'), ('drawing.create', 'drawing', 'Create drawings', 'Create design drawings'), ('drawing.update', 'drawing', 'Update drawings', 'Update design drawings'), ('accounting_document.read', 'accounting_document', 'Read accounting documents', 'Read accounting documents'), ('accounting_document.update', 'accounting_document', 'Update accounting documents', 'Update accounting documents'), ('supplier_payment.approve', 'accounting_document', 'Approve supplier payments', 'Approve supplier payments'), ('inventory_value.read', 'inventory', 'Read inventory value', 'Read inventory valuation'), ('project.read', 'project', 'Read projects', 'Read projects needed for assigned work'), ('task.read_assigned', 'task', 'Read assigned tasks', 'Read tasks assigned to the current employee'), ('task.update_assigned', 'task', 'Update assigned tasks', 'Update assigned tasks')
    )
    select 1 from expected_permissions expected
    left join public.permissions permission on permission.code = expected.code
    where permission.module is distinct from expected.module
      or permission.name is distinct from expected.name
      or permission.description is distinct from expected.description
  ) then
    raise exception 'canonical VQH permission catalog metadata check failed';
  end if;
  if exists (
    with expected_permissions(code) as (values
      ('employee.read_directory'), ('employee.read_self_private'), ('employee.read_all'), ('employee.read_private'), ('employee.create'), ('employee.update'), ('employee.offboard'), ('account.invite'), ('account.disable'), ('role.read'), ('role.assign'), ('role.revoke'), ('supplier.read'), ('supplier.create'), ('supplier.update'), ('quotation_request.create'), ('quotation_request.update'), ('inventory.read'), ('stock_count.create'), ('stock_count.update'), ('stock_adjustment.read'), ('stock_adjustment.approve'), ('technical_document.read'), ('technical_document.update'), ('drawing.read'), ('drawing.create'), ('drawing.update'), ('accounting_document.read'), ('accounting_document.update'), ('supplier_payment.approve'), ('inventory_value.read'), ('project.read'), ('task.read_assigned'), ('task.update_assigned')
    ), explicit_role_permissions(role_code, permission_code) as (values
      ('employee','employee.read_directory'), ('employee','employee.read_self_private'), ('employee','project.read'), ('employee','task.read_assigned'), ('employee','task.update_assigned'),
      ('hr_manager','employee.read_directory'), ('hr_manager','employee.read_all'), ('hr_manager','employee.read_private'), ('hr_manager','employee.create'), ('hr_manager','employee.update'), ('hr_manager','account.invite'), ('hr_manager','role.read'),
      ('supplier_sourcing','supplier.read'), ('supplier_sourcing','supplier.create'), ('supplier_sourcing','supplier.update'), ('supplier_sourcing','quotation_request.create'), ('supplier_sourcing','quotation_request.update'), ('supplier_sourcing','inventory.read'),
      ('inventory_auditor','inventory.read'), ('inventory_auditor','stock_count.create'), ('inventory_auditor','stock_count.update'), ('inventory_auditor','stock_adjustment.read'),
      ('technical_staff','project.read'), ('technical_staff','task.read_assigned'), ('technical_staff','task.update_assigned'), ('technical_staff','technical_document.read'), ('technical_staff','technical_document.update'),
      ('designer','project.read'), ('designer','task.read_assigned'), ('designer','task.update_assigned'), ('designer','drawing.read'), ('designer','drawing.create'), ('designer','drawing.update'),
      ('accountant','accounting_document.read'), ('accountant','accounting_document.update'), ('accountant','supplier.read'), ('accountant','inventory_value.read')
    ), expected_role_permissions(role_code, permission_code) as (
      select role_code, permission_code from explicit_role_permissions
      union all select 'company_admin', code from expected_permissions
    ), actual_role_permissions(role_code, permission_code) as (
      select role.code, role_permission.permission_code
      from public.role_permissions role_permission
      join public.roles role on role.id = role_permission.role_id
      where role.id in ('10000000-0000-4000-8000-000000000301'::uuid, '10000000-0000-4000-8000-000000000302'::uuid, '10000000-0000-4000-8000-000000000303'::uuid, '10000000-0000-4000-8000-000000000304'::uuid, '10000000-0000-4000-8000-000000000305'::uuid, '10000000-0000-4000-8000-000000000306'::uuid, '10000000-0000-4000-8000-000000000307'::uuid, '10000000-0000-4000-8000-000000000308'::uuid)
    )
    select 1 from (
      (select role_code, permission_code from expected_role_permissions except select role_code, permission_code from actual_role_permissions)
      union all
      (select role_code, permission_code from actual_role_permissions except select role_code, permission_code from expected_role_permissions)
    ) as matrix_difference
  ) then
    raise exception 'canonical VQH role permission matrix check failed';
  end if;
  if not exists (select 1 from public.company_role_assignments assignment join public.roles role on role.id = assignment.role_id join public.company_memberships membership on membership.user_id = assignment.user_id and membership.tenant_id = assignment.tenant_id and membership.company_id = assignment.company_id where assignment.tenant_id = '10000000-0000-4000-8000-000000000010' and assignment.company_id = '10000000-0000-4000-8000-000000000020' and assignment.revoked_at is null and membership.is_active and role.id = '10000000-0000-4000-8000-000000000308'::uuid and role.is_active) then
    raise exception 'canonical VQH normalized company admin check failed';
  end if;
end $$;
select 'PASS' as result;
rollback;`

const REMOTE_MODE_ARGS = {
  link: ['link', '--project-ref', 'ykrurrumqlsxnqfqunjc'],
  status: ['migration', 'list', '--linked'],
  'dry-run': ['db', 'push', '--linked', '--dry-run'],
  push: ['db', 'push', '--linked'],
  'pg-tap': ['test', 'db', '--linked'],
  'advisors-security': ['db', 'advisors', '--linked', '--type', 'security', '--level', 'warn', '--fail-on', 'error'],
  'advisors-performance': ['db', 'advisors', '--linked', '--type', 'performance', '--level', 'warn', '--fail-on', 'error'],
  'rls-smoke': ['db', 'query', '--linked', VQH_RLS_SMOKE_SQL],
  'canonical-check': ['db', 'query', '--linked', VQH_CANONICAL_CHECK_SQL],
  types: ['gen', 'types', 'typescript', '--linked'],
  'auth-check': ['projects', 'list', '--output-format', 'json'],
}

export function resolveSupabaseDevHome({ env = process.env, platform = process.platform } = {}) {
  const path = platform === 'win32' ? { join } : posix
  const stateHome = platform === 'win32'
    ? env.LOCALAPPDATA ?? (env.USERPROFILE ? join(env.USERPROFILE, 'AppData', 'Local') : undefined) ?? env.APPDATA
    : env.XDG_STATE_HOME ?? (env.HOME ? posix.join(env.HOME, '.local', 'state') : undefined)

  if (!stateHome) throw new Error('A stable local directory is required for isolated Supabase CLI authentication')
  return path.join(stateHome, ...SUPABASE_DEV_HOME_SEGMENTS)
}

function readDedicatedSupabaseDevAccessToken(cwd) {
  let contents
  try {
    contents = readFileSync(resolve(cwd, '.supabase.dev.env.local'), 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error('Dedicated Supabase DEV PAT file is missing', { cause: error })
    }
    throw error
  }

  const assignments = contents.split(/\r?\n/).filter(line => line.startsWith('SUPABASE_DEV_ACCESS_TOKEN='))
  if (assignments.length !== 1) throw new Error('SUPABASE_DEV_ACCESS_TOKEN must be assigned exactly once')
  const token = assignments[0].slice('SUPABASE_DEV_ACCESS_TOKEN='.length).trim()
  if (!token) throw new Error('SUPABASE_DEV_ACCESS_TOKEN is missing or empty')
  return token
}

function isolatedSupabaseEnvironment(cwd, env, platform) {
  const childEnv = { ...env }
  delete childEnv.SUPABASE_ACCESS_TOKEN
  delete childEnv.SUPABASE_CLI_BINARY_OVERRIDE
  delete childEnv.SUPABASE_DB_PASSWORD
  delete childEnv.SUPABASE_DEV_ACCESS_TOKEN
  return {
    ...childEnv,
    SUPABASE_ACCESS_TOKEN: readDedicatedSupabaseDevAccessToken(cwd),
    SUPABASE_HOME: resolveSupabaseDevHome({ env, platform }),
  }
}

function assertExactProjectVisibility(stdout) {
  let response
  try {
    response = JSON.parse(stdout)
  } catch {
    throw new Error('Supabase DEV auth check returned invalid project data')
  }
  const projects = response && typeof response === 'object' && Array.isArray(response.projects)
    ? response.projects
    : undefined
  if (!projects) throw new Error('Supabase DEV auth check returned invalid project data')
  if (!Array.isArray(projects) || !projects.some(project => project && project.ref === CANONICAL_DEV_PROJECT_REF)) {
    throw new Error('Dedicated Supabase DEV PAT cannot access the canonical project')
  }
}

function writeGeneratedTypes(cwd, stdout) {
  if (!/export type Json\s*=/.test(stdout) || !/export type Database\s*=/.test(stdout)) {
    throw new Error('Supabase type generation returned implausible output')
  }

  const target = resolve(cwd, 'shared/types/database.types.ts')
  const tempDirectory = mkdtempSync(join(dirname(target), '.database-types-'))
  const tempTarget = join(tempDirectory, 'database.types.ts')
  try {
    writeFileSync(tempTarget, stdout, 'utf8')
    renameSync(tempTarget, target)
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true })
  }
}

export function runSupabaseDevMode(mode, {
  cwd = process.cwd(),
  env = process.env,
  extraArgs = [],
  platform = process.platform,
  spawn = spawnSync,
} = {}) {
  if (extraArgs.length > 0 || !Object.hasOwn(REMOTE_MODE_ARGS, mode)) {
    throw new Error('Unsupported Cloud DEV operation')
  }

  const cliArgs = REMOTE_MODE_ARGS[mode]
  if (mode === 'auth-check' || mode === 'link') assertCloudDevEnvironment({ cwd })
  else assertCloudDevTarget({ cwd })

  const cliEntrypoint = resolve(cwd, 'node_modules/supabase/dist/supabase.js')
  const result = spawn(process.execPath, [cliEntrypoint, ...cliArgs], {
    cwd,
    encoding: mode === 'types' || mode === 'auth-check' ? 'utf8' : undefined,
    env: isolatedSupabaseEnvironment(cwd, env, platform),
    stdio: mode === 'types' || mode === 'auth-check' ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Supabase ${mode} operation failed`)
  if (mode === 'link') assertCloudDevTarget({ cwd })
  if (mode === 'types') writeGeneratedTypes(cwd, String(result.stdout ?? ''))
  if (mode === 'auth-check') assertExactProjectVisibility(String(result.stdout ?? ''))
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error('Unsupported Cloud DEV operation')
  runSupabaseDevMode(process.argv[2])
}
