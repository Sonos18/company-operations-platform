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
const implementationPlan = read('docs/superpowers/plans/2026-08-15-supabase-cloud-dev-workflow.md')
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

  it('uses the isolated Supabase CLI home for every documented DEV login and link', () => {
    for (const document of [development, deployment, design, implementationPlan]) {
      expect(document).not.toContain('pnpm exec supabase login')
      expect(document).not.toContain('pnpm exec supabase link')
      expect(document).not.toMatch(/(?:pnpm\s+db:dev:login|run-supabase-dev\.mjs)\s+[^\r\n]*--profile/)
    }

    expect(development).toContain('pnpm db:dev:login')
    expect(deployment).toContain('pnpm db:dev:login')
    expect(design).toContain('pnpm db:dev:login')
    expect(implementationPlan).toContain('pnpm db:dev:login')
    expect(development).toContain('SUPABASE_HOME')
    expect(deployment).toContain('company-operations-dev')
  })

  it('provides a guarded, idempotent VQH admin onboarding snippet', () => {
    expect(onboarding).toContain('replace-with-dev-admin@example.com')
    expect(onboarding).toContain("raise exception 'Replace the DEV admin email before running this script'")
    expect(onboarding).toContain("'10000000-0000-4000-8000-000000000010'")
    expect(onboarding).toContain("'10000000-0000-4000-8000-000000000020'")
    expect(onboarding).toContain('on conflict (user_id, tenant_id) do update')
    expect(onboarding).toContain('on conflict (user_id, company_id) do update')
    expect(onboarding).not.toContain('@vqh.local')
  })
})
