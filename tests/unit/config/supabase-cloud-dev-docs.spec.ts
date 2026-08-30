import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const readme = read('README.md')
const development = read('docs/development/backend-cloud-dev.md')
const deployment = read('docs/deployment/supabase-cloud-vercel.md')
const onboarding = read('docs/development/sql/onboard-vqh-dev-admin.sql')
const employeeRunbook = read('docs/runbooks/employee-onboarding-and-rbac.md')
const backendFoundationPlan = read('docs/superpowers/plans/2026-08-14-backend-foundation-auth-tenancy.md')
const localCloudEnvironmentsPlan = read('docs/superpowers/plans/2026-08-14-supabase-local-cloud-environments.md')
const oldVqhProjectRef = ['ykrurrum', 'qlsxnqfqunjc'].join('')
const activeTrackedSetupPaths = [
  '.env.example',
  '.supabase.dev.env.example',
  'README.md',
  'package.json',
  'nuxt.config.ts',
  'scripts/assert-cloud-dev-target.mjs',
  'scripts/run-supabase-dev.mjs',
  'supabase/config.toml',
  'docs/development/backend-cloud-dev.md',
  'docs/development/sql/onboard-vqh-dev-admin.sql',
  'docs/deployment/supabase-cloud-vercel.md',
  'docs/runbooks/employee-onboarding-and-rbac.md',
  'tests/unit/config/supabase-advisor-remediation.spec.ts',
  'tests/unit/config/supabase-cloud-dev-data.spec.ts',
  'tests/unit/config/supabase-cloud-dev-docs.spec.ts',
  'tests/unit/config/supabase-cloud-dev-pgtap.spec.ts',
  'tests/unit/config/supabase-cloud-dev-rls-smoke.spec.ts',
  'tests/unit/config/supabase-cloud-dev-runner.spec.ts',
  'tests/unit/config/supabase-cloud-dev-target.spec.ts',
  'tests/unit/config/supabase-environment.spec.ts',
  'tests/unit/server/supabase-config.spec.ts',
]
const activeTrackedSetupFiles = activeTrackedSetupPaths.map(path => ({ path, contents: read(path) }))
const commandsIn = (section: string) => section.match(/```powershell\s*([\s\S]*?)```/)?.[1] ?? ''
const dailyWorkflow = development.slice(
  development.indexOf('## Daily database workflow'),
  development.indexOf('## Optional Docker-backed pgTAP check'),
)
const deploymentWorkflow = deployment.slice(
  deployment.indexOf('## Deliver a Cloud DEV database migration'),
  deployment.indexOf('## Configure Vercel Production'),
)
const dailyCommands = commandsIn(dailyWorkflow)
const deploymentCommands = commandsIn(deploymentWorkflow)
describe('Supabase Cloud DEV runbooks', () => {
  it('directs operators to the existing canonical Taskovia Cloud DEV project only', () => {
    for (const document of [development, deployment]) {
      expect(document).toContain('existing canonical Taskovia Cloud DEV project')
      expect(document).toContain('Do not create or choose another Supabase project.')
      expect(document).not.toContain('Create a dedicated Taskovia Cloud DEV project')
    }
  })

  it('assigns the one canonical database to Taskovia while preserving VQH as its first tenant/company', () => {
    for (const document of [readme, development, deployment]) {
      expect(document).toContain('Taskovia owns the one canonical Supabase Cloud DEV database.')
      expect(document).toContain('VQH is its first tenant/company; there is no separate VQH database.')
    }

    for (const { path, contents } of activeTrackedSetupFiles) {
      expect(contents, `${path} must not retain the retired VQH project ref`).not.toContain(oldVqhProjectRef)
    }
  })

  it('makes Cloud DEV the default local-app backend without requiring Docker', () => {
    expect(readme).toContain('Supabase Cloud DEV')
    expect(readme).toContain('optional Docker-backed pgTAP check')
    expect(development).toContain('pnpm db:dev:dry-run')
    expect(development).toContain('## Optional Docker-backed pgTAP check')
    expect(development).toContain('pnpm db:dev:test')
    expect(development).toContain('Docker/container-capable environment')
    expect(dailyCommands).not.toContain('pnpm db:dev:test')
    expect(deploymentCommands).not.toContain('pnpm db:dev:test')
    expect(development).not.toContain('Docker Desktop running')
    expect(development).not.toContain('pnpm supabase:start')
    expect(development).not.toContain('## CI/fallback')
    expect(development).not.toContain('db:local:')
    expect(readme).not.toContain('Supabase local only for CI/fallback')
  })

  it('keeps DEV and Vercel Production credentials separate', () => {
    expect(deployment).toContain('Cloud DEV')
    expect(deployment).toContain('Vercel Production')
    expect(deployment).toContain('không dùng project DEV')
    expect(deployment).not.toContain('pnpm db:cloud:')
  })

  it('documents the server-only Taskovia Admin credential without treating it as a CLI PAT', () => {
    for (const document of [development, deployment]) {
      expect(document).toContain('NUXT_SUPABASE_SERVICE_ROLE_KEY')
      expect(document).toContain('NUXT_PUBLIC_SUPABASE_URL')
      expect(document).toContain('NUXT_PUBLIC_SUPABASE_ANON_KEY')
      expect(document).not.toMatch(/NUXT_(?:PUBLIC_)?TASKOVIA_SUPABASE/)
    }
    expect(development).toContain('SUPABASE_DEV_ACCESS_TOKEN')
    expect(deployment).toContain('SUPABASE_DEV_ACCESS_TOKEN')
  })

  it('keeps the optional Cloud DEV pgTAP command outside the daily no-Docker workflow', () => {
    expect(development).toContain('pnpm db:dev:test')
    expect(development).toContain('Docker/container-capable environment')
    expect(dailyCommands).not.toContain('pnpm db:dev:test')
  })

  it('uses the dedicated ignored DEV PAT for every documented DEV authentication check', () => {
    for (const document of [development, deployment]) {
      expect(document).not.toContain('pnpm exec supabase login')
      expect(document).not.toContain('pnpm exec supabase link')
      expect(document).not.toContain('pnpm db:dev:login')
    }

    expect(development).toContain('pnpm db:dev:auth-check')
    expect(deployment).toContain('pnpm db:dev:auth-check')
    expect(development).toContain('.supabase.dev.env.local')
    expect(deployment).toContain('PAT is authoritative')
    expect(development).toContain('SUPABASE_HOME')
    expect(deployment).toContain('SUPABASE_DEV_ACCESS_TOKEN')
  })

  it('describes PAT access to the canonical Taskovia DEV project without claiming exclusive visibility', () => {
    expect(development).toContain('The PAT can access the canonical Taskovia DEV project.')
    expect(development).not.toContain('PAT can see only the canonical DEV project ref')
  })

  it('keeps all active linked Cloud DEV operations behind fixed runner modes', () => {
    for (const document of [development, deployment]) {
      expect(document).not.toMatch(/pnpm\s+exec\s+supabase\s+.*--linked/)
      expect(document).not.toMatch(/run-supabase-dev\.mjs\s+(?:db|migration|gen|test)\b/)
    }
    expect(development).toContain('pnpm db:dev:advisors:security')
    expect(deployment).toContain('pnpm db:dev:advisors:performance')
  })

  it('defines Cloud DEV as the sole development database in active AI policy', () => {
    const agents = read('AGENTS.md')
    const workflow = read('docs/ai-workflow/README.md')
    const implementationPacket = read('docs/ai-workflow/templates/implementation-packet.md')
    const fixPacket = read('docs/ai-workflow/templates/fix-packet.md')

    expect(agents).toContain('Supabase Cloud DEV is the only supported development database target.')
    expect(agents).toContain('must BLOCK rather than fall back to a Local DB')
    for (const document of [agents, workflow, implementationPacket, fixPacket]) {
      expect(document).not.toContain('local_db_destructive')
    }
  })

  it('keeps the renamed backend-guide links resolvable in historical plans', () => {
    expect(backendFoundationPlan).toContain(
      '[Cloud DEV backend development](../../development/backend-cloud-dev.md)',
    )
    expect(localCloudEnvironmentsPlan).toContain(
      '[Cloud DEV backend development](../../development/backend-cloud-dev.md)',
    )
    expect(localCloudEnvironmentsPlan).toContain(
      '[Supabase Cloud and Vercel production](../../deployment/supabase-cloud-vercel.md)',
    )
  })

  it('provides a guarded, idempotent VQH admin onboarding snippet', () => {
    expect(onboarding).toContain('replace-with-dev-admin@example.com')
    expect(onboarding).toContain("raise exception 'Replace the DEV admin email before running this script'")
    expect(onboarding).toContain("'10000000-0000-4000-8000-000000000010'")
    expect(onboarding).toContain("'10000000-0000-4000-8000-000000000020'")
    expect(onboarding).toContain('on conflict (user_id, tenant_id) do update')
    expect(onboarding).toContain('on conflict (user_id, company_id) do update')
    expect(onboarding).toContain("array['employee']::text[]")
    expect(onboarding).toContain('company_role_assignments')
    expect(onboarding).toContain("'company_admin'")
    expect(onboarding).toContain('pg_advisory_xact_lock')
    expect(onboarding).toContain("set_config('request.jwt.claims'")
    expect(onboarding).toContain('expected_permissions(code, module, name, description)')
    expect(onboarding).toContain('select code from public.permissions except select code from expected_permissions')
    expect(onboarding).toContain('select permission_code from public.role_permissions where role_id = company_admin_role_id')
    expect(onboarding).not.toContain('@vqh.local')
  })

  it('requires the restricted manual DEV admin bootstrap before the normalized-admin RLS smoke check', () => {
    const releaseProcedure = employeeRunbook.slice(
      employeeRunbook.indexOf('## Cloud DEV release procedure'),
      employeeRunbook.indexOf('## Optional Docker/container check'),
    )

    expect(releaseProcedure).toContain('docs/development/sql/onboard-vqh-dev-admin.sql')
    expect(releaseProcedure).toContain('replace-with-dev-admin@example.com')
    expect(releaseProcedure).toContain('restricted Cloud DEV SQL Editor')
    expect(releaseProcedure).toContain('controlled role')
    expect(releaseProcedure).toContain('does not commit identity')
    expect(releaseProcedure.indexOf('pnpm db:dev:canonical-check')).toBeLessThan(
      releaseProcedure.indexOf('pnpm db:dev:rls-smoke'),
    )
    expect(releaseProcedure).toContain('versioned contract of 34 permissions and 71 mappings')
    expect(releaseProcedure).toContain('does not support custom permission codes')
  })
})
