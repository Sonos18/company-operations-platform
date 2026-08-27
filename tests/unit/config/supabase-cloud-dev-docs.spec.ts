import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const readme = read('README.md')
const development = read('docs/development/backend-local.md')
const deployment = read('docs/deployment/supabase-cloud-vercel.md')
const design = read('docs/superpowers/specs/2026-08-15-supabase-cloud-dev-workflow-design.md')
const onboarding = read('docs/development/sql/onboard-vqh-dev-admin.sql')
const employeeRunbook = read('docs/runbooks/employee-onboarding-and-rbac.md')
const implementationPlan = read('docs/superpowers/plans/2026-08-15-supabase-cloud-dev-workflow.md')
const targetGuard = read('scripts/assert-cloud-dev-target.mjs')
const runner = read('scripts/run-supabase-dev.mjs')
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
  'docs/development/backend-local.md',
  'docs/development/sql/onboard-vqh-dev-admin.sql',
  'docs/deployment/supabase-cloud-vercel.md',
  'docs/runbooks/employee-onboarding-and-rbac.md',
  'docs/superpowers/specs/2026-08-15-supabase-cloud-dev-workflow-design.md',
  'docs/superpowers/plans/2026-08-15-supabase-cloud-dev-workflow.md',
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
const task4Plan = implementationPlan.slice(
  implementationPlan.indexOf('### Task 4:'),
)
const task4OptionalPgtap = task4Plan.slice(
  task4Plan.indexOf('### Optional Docker/container-capable pgTAP verification'),
  task4Plan.indexOf('- [ ] **Step 11:'),
)
const task4ReleaseGate = task4Plan.slice(
  task4Plan.indexOf('- [ ] **Step 13:'),
  task4Plan.indexOf('- [ ] **Step 14:'),
)

describe('Supabase Cloud DEV runbooks', () => {
  it('assigns the one canonical database to Taskovia while preserving VQH as its first tenant/company', () => {
    for (const document of [readme, development, deployment, design, implementationPlan]) {
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
  })

  it('keeps DEV and Vercel Production credentials separate', () => {
    expect(deployment).toContain('Cloud DEV')
    expect(deployment).toContain('Vercel Production')
    expect(deployment).toContain('không dùng project DEV')
    expect(deployment).not.toContain('pnpm db:cloud:')
  })

  it('keeps Task 4 pgTAP optional and outside the no-Docker release gate', () => {
    expect(task4OptionalPgtap).toContain('pnpm db:dev:test')
    expect(task4OptionalPgtap).toContain('Docker/container-capable environment')
    expect(task4OptionalPgtap).toContain('optional')
    expect(commandsIn(task4ReleaseGate)).not.toContain('pnpm db:dev:test')
    expect(task4ReleaseGate).not.toContain('pgTAP, unit tests')
    expect(task4ReleaseGate).toContain('Docker remains stopped')
  })

  it('keeps every active plan and design workflow no-Docker and guarded', () => {
    expect(implementationPlan).not.toContain(
      'pnpm db:dev:status && pnpm db:dev:test && pnpm db:dev:types && pnpm verify:app',
    )
    expect(implementationPlan).not.toContain('pnpm db:dev:push\npnpm db:dev:test\npnpm db:dev:types')
    expect(design).not.toContain('6. Chạy `db:dev:test` và `db:dev:types`.')
    expect(design).toContain('Docker/container-capable')
    expect(development).toContain('canonical DEV target guard')
    expect(deployment).toContain('canonical DEV target guard')
  })

  it('uses the dedicated ignored DEV PAT for every documented DEV authentication check', () => {
    for (const document of [development, deployment, design, implementationPlan]) {
      expect(document).not.toContain('pnpm exec supabase login')
      expect(document).not.toContain('pnpm exec supabase link')
      expect(document).not.toContain('pnpm db:dev:login')
    }

    expect(development).toContain('pnpm db:dev:auth-check')
    expect(deployment).toContain('pnpm db:dev:auth-check')
    expect(design).toContain('pnpm db:dev:auth-check')
    expect(implementationPlan).toContain('pnpm db:dev:auth-check')
    expect(development).toContain('.supabase.dev.env.local')
    expect(deployment).toContain('PAT is authoritative')
    expect(development).toContain('SUPABASE_HOME')
    expect(deployment).toContain('SUPABASE_DEV_ACCESS_TOKEN')
  })

  it('keeps all active linked Cloud DEV operations behind fixed runner modes', () => {
    for (const document of [development, deployment, design, implementationPlan]) {
      expect(document).not.toMatch(/pnpm\s+exec\s+supabase\s+.*--linked/)
      expect(document).not.toMatch(/run-supabase-dev\.mjs\s+(?:db|migration|gen|test)\b/)
    }
    expect(development).toContain('pnpm db:dev:advisors:security')
    expect(deployment).toContain('pnpm db:dev:advisors:performance')
    expect(implementationPlan).toContain('pnpm db:dev:canonical-check')
    expect(implementationPlan).toContain('pnpm db:dev:rls-smoke')
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
