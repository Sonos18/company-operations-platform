import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(import.meta.dirname, '../../../supabase/migrations/20260911145035_taskovia_c1_foundation.sql'), 'utf8')
const publicRpcs = [
  'public.c1_create_project(uuid,jsonb,uuid)',
  'public.c1_create_business_party(uuid,jsonb,uuid)',
  'public.c1_create_engagement(uuid,uuid,jsonb,uuid)',
  'public.c1_create_engagement_component(uuid,uuid,jsonb,uuid)',
  'public.c1_update_project(uuid,uuid,jsonb,uuid)',
  'public.c1_update_business_party(uuid,uuid,jsonb,uuid)',
  'public.c1_update_engagement(uuid,uuid,jsonb,uuid)',
  'public.c1_update_engagement_component(uuid,uuid,jsonb,uuid)',
]
const privateCommands = [
  'private.c1_master_context(uuid,text)',
  'private.c1_create_project(uuid,jsonb,uuid)',
  'private.c1_create_party(uuid,jsonb,uuid)',
  'private.c1_create_engagement(uuid,uuid,jsonb,uuid)',
  'private.c1_create_component(uuid,uuid,jsonb,uuid)',
  'private.c1_update_project(uuid,uuid,jsonb,uuid)',
  'private.c1_update_party(uuid,uuid,jsonb,uuid)',
  'private.c1_update_engagement(uuid,uuid,jsonb,uuid)',
  'private.c1_update_component(uuid,uuid,jsonb,uuid)',
]

function hasClientRoleRevoke(signature: string) {
  return new RegExp(`revoke all on function (?=[^;]*${signature.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')})(?=[^;]*from public, anon, authenticated;)`, 'iu').test(sql)
}

describe('C1 master-data command boundary', () => {
  it('exposes only explicit public create and update wrappers', () => {
    for (const command of ['project', 'business_party', 'engagement', 'engagement_component']) {
      expect(sql).toContain(`create function public.c1_create_${command}`)
      expect(sql).toContain(`create function public.c1_update_${command}`)
    }
    expect(sql).not.toContain('execute arbitrary c1 command')
  })

  it('enforces scope, permission, module state, and expected version in private commands', () => {
    expect(sql).toContain('private.stage01_actor_context')
    expect(sql).toContain("message = 'MODULE_DISABLED'")
    expect(sql).toContain("message='RESOURCE_NOT_FOUND'")
    expect(sql).toContain("message='VERSION_CONFLICT'")
    expect(sql).toMatch(/version\s*=\s*version\s*\+\s*1/u)
    expect(sql).toContain('revoke all on function private.c1_')
  })

  it('removes default client EXECUTE from every C1 function signature', () => {
    for (const signature of [...publicRpcs, ...privateCommands]) {
      expect(hasClientRoleRevoke(signature)).toBe(true)
    }
  })
})
