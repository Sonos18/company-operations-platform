import { spawnSync } from 'node:child_process'
import { dirname, join, posix, resolve } from 'node:path'
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CANONICAL_DEV_PROJECT_REF, assertCloudDevEnvironment, assertCloudDevTarget } from './assert-cloud-dev-target.mjs'

const SUPABASE_DEV_HOME_SEGMENTS = ['SupabaseCLI', 'company-operations-dev']
const VQH_RLS_SMOKE_SQL = String.raw`begin;
do $$
declare
  member_id uuid;
  member_tenant_count integer;
  member_company_count integer;
  non_member_tenant_count integer;
  non_member_company_count integer;
begin
  select user_id into member_id from public.tenant_memberships
    where tenant_id = '10000000-0000-4000-8000-000000000010'
      and roles @> array['tenant_admin']::text[] limit 1;
  if not found then raise exception 'VQH tenant admin membership is missing'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', member_id::text, 'role', 'authenticated')::text, true);
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
  if (select count(*) from public.tenants where id = '10000000-0000-4000-8000-000000000010' and code = 'vqh' and name = 'Việt Quốc Huy') <> 1 then
    raise exception 'canonical VQH tenant boundary/name check failed';
  end if;
  if (select count(*) from public.companies where id = '10000000-0000-4000-8000-000000000020' and tenant_id = '10000000-0000-4000-8000-000000000010' and code = 'VQH' and name = 'Việt Quốc Huy') <> 1 then
    raise exception 'canonical VQH company boundary/name check failed';
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
