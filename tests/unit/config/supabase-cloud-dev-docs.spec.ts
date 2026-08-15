import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const readme = read('README.md')
const development = read('docs/development/backend-local.md')
const deployment = read('docs/deployment/supabase-cloud-vercel.md')
const onboarding = read('docs/development/sql/onboard-vqh-dev-admin.sql')
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
