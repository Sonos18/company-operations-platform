import { describe, expect, it } from 'vitest'
import { compareProjectDirectoryEntries } from '../../../shared/utils/project-directory-order'
import { ProjectFinanceMetadataReader } from '../../../server/features/costs/finance/project-finance.queries'
import { CostEvidenceRepository } from '../../../server/features/costs/evidence/cost-evidence.repository'
import { ProjectFinanceWriteRepository } from '../../../server/features/costs/finance/project-finance-write.repository'
import { createSupabaseProjectRegisterRepository } from '../../../server/features/project-register/project-register.repository'
import { existsSync, readFileSync } from 'node:fs'
import { runCompletedProjectsRehearsal, validateC1CloudDevSql } from '../../../scripts/run-c1-cloud-dev-tests.mjs'
import { ProjectCostRepository } from '../../../server/features/costs/project-cost.repository'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const entry = (n: number, operationalState: 'active' | 'paused' | 'unknown' | 'completed', updatedAt: string) => ({ projectId: id(n), projectCode: 'P', projectName: 'Project', operationalState, updatedAt })
describe('completed project policy', () => {
  it('groups states before comparing update instants, with UUID as a stable tie break', () => {
    const values = [entry(1, 'completed', '2026-10-03T12:00:00Z'), entry(2, 'active', '2026-01-01T00:00:00Z'), entry(3, 'paused', '2026-10-01T00:00:00Z'), entry(4, 'unknown', '2026-10-02T00:00:00Z'), entry(6, 'active', '2026-10-02T07:00:00+07:00'), entry(5, 'active', '2026-10-02T00:00:00Z')]
    expect(values.sort(compareProjectDirectoryEntries).map(p => p.projectId)).toEqual([id(5), id(6), id(2), id(3), id(4), id(1)])
  })
  it('preserves PostgreSQL microsecond ordering', () => {
    expect(compareProjectDirectoryEntries(entry(1, 'active', '2026-10-03T00:00:00.000001Z'), entry(2, 'active', '2026-10-03T00:00:00.000002Z'))).toBeGreaterThan(0)
  })
  it('accepts globally sorted pages whose UUIDs decrease and rejects misordered or duplicate pages', async () => {
    const projects = [entry(8, 'active', '2026-10-03T00:00:00Z'), entry(2, 'completed', '2026-10-03T00:00:00Z')]
    const payload = { defaultCurrencyCode: 'VND', moneyScale: 0, timeZone: 'Asia/Ho_Chi_Minh', projects, nextCursor: id(2) }
    const reader = new ProjectFinanceMetadataReader({ rpc: async () => ({ data: payload, error: null }) })
    await expect(reader.directory(id(20), id(9), 25)).resolves.toMatchObject({ projects })
    payload.projects = [...projects].reverse()
    await expect(reader.directory(id(20), null, 25)).rejects.toThrow()
    payload.projects = [projects[0]!, projects[0]!]
    await expect(reader.directory(id(20), null, 25)).rejects.toThrow()
  })
  it('prepares rollback-only database verification through the guarded DEV runner', () => {
    const sql = readFileSync('supabase/tests/database/c1/c1_completed_projects.test.sql', 'utf8')
    expect(() => validateC1CloudDevSql('c1_completed_projects.test.sql', sql)).not.toThrow()
    expect(() => validateC1CloudDevSql('c1_completed_projects.test.sql', sql.replace(/rollback;\s*$/, 'commit;'))).toThrow()
  })
  it.each(['[{"result":"C1_COMPLETED_PROJECTS_REHEARSAL_COMPLETE"}]', '{"rows":[{"result":"C1_COMPLETED_PROJECTS_REHEARSAL_COMPLETE"}]}'])('rehearses migration and synthetic fixtures in one rollback-only session and removes the temporary query (%s)', (stdout) => {
    let queryFile = ''
    let guarded = false
    runCompletedProjectsRehearsal({
      env: { TASKOVIA_DEV_CONFIG_SOURCE: 'environment', SUPABASE_DEV_ACCESS_TOKEN: 'sbp_fixture', HOME: '/tmp', LOCALAPPDATA: 'C:\\Temp' },
      assertTarget: () => { guarded = true },
      spawn: (_command: string, args: string[]) => {
        expect(guarded).toBe(true)
        expect(args.slice(1, 6)).toEqual(['db', 'query', '--linked', '--output-format', 'json'])
        queryFile = args.at(-1)!
        const sql = readFileSync(queryFile, 'utf8')
        expect(sql.trim()).toMatch(/^begin;[\s\S]*rollback;$/)
        expect(sql).toContain('CREATE FUNCTION private.c1_lock_writable_project')
        expect(sql).toContain('C1F4_DIRECTORY_ORDER')
        expect(() => validateC1CloudDevSql('c1_completed_projects.test.sql', sql)).not.toThrow()
        return { status: 0, stdout, stderr: '' }
      },
    })
    expect(queryFile).not.toBe('')
    expect(existsSync(queryFile)).toBe(false)
  })
  it('does not launch a database query if the guarded DEV target check rejects it', () => {
    let launched = false
    expect(() => runCompletedProjectsRehearsal({
      assertTarget: () => { throw new Error('Target rejected') },
      spawn: () => { launched = true },
    })).toThrow('Target rejected')
    expect(launched).toBe(false)
  })
  it('maps register, payment and evidence writes to the completed-project conflict', async () => {
    const client = { rpc: async () => ({ data: null, error: { code: 'P0001', message: 'PROJECT_COMPLETED' } }) } as never
    const context = { companyId: id(20), tenantId: id(10), requestId: id(40) }
    const expected = { statusCode: 409, code: 'PROJECT_COMPLETED' }
    await expect(createSupabaseProjectRegisterRepository(client).update(id(20), id(10), id(1), { expectedVersion: 0, name: 'change' }, id(40))).rejects.toMatchObject(expected)
    await expect(new ProjectFinanceWriteRepository(client).recordPayment(context, id(1), id(2), {} as never, id(3))).rejects.toMatchObject(expected)
    await expect(new CostEvidenceRepository(client).linkDetail(context, id(1), { evidenceFileId: id(2), evidenceKind: 'invoice' }, id(3))).rejects.toMatchObject(expected)
  })
  it('returns an actionable conflict when a stale client writes to a completed project', async () => {
    const repository = new ProjectCostRepository({ rpc: async () => ({ data: null, error: { code: 'P0001', message: 'PROJECT_COMPLETED' } }) } as never)
    await expect(repository.updateDetailDraft({ companyId: id(20), tenantId: id(10), actorId: id(30), requestId: id(40), permissions: [] } as never, id(1), { expectedVersion: 0, description: 'changed' })).rejects.toMatchObject({ statusCode: 409, code: 'PROJECT_COMPLETED' })
  })
})
