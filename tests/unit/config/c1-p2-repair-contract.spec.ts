import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseFileRepository } from '../../../server/features/files/file.repository'
import { normalizeSourceLocator } from '../../../server/features/costs/accounting-source.service'
import { sourceReportedFigureSchema } from '../../../shared/schemas/costs/sources'

const root = process.cwd()
const migration = readFileSync(resolve(root, 'supabase/migrations/20260912062227_taskovia_c1_sources_files.sql'), 'utf8')
const securityFixture = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_sources_files_security.test.sql'), 'utf8')
const commandsFixture = readFileSync(resolve(root, 'supabase/tests/database/c1/c1_sources_files_commands.test.sql'), 'utf8')
const companyId = 'c1000000-0000-4000-8000-000000000020'
const fileId = 'c1000000-0000-4000-8000-000000000040'

describe('C1 P2 repair contract', () => {
  it('requires real self-contained P2 fixture assertions and terminal markers', () => {
    expect(securityFixture).toContain('C1_P2_SECURITY_COMPLETE')
    expect(commandsFixture).toContain('C1_P2_COMMANDS_COMPLETE')
    expect(securityFixture).toMatch(/public\.c1_/)
    expect(commandsFixture).toMatch(/public\.c1_/)
  })

  it('passes target company and request scope to file RPCs', async () => {
    const rpc = vi.fn(async () => ({ data: { id: fileId, bucket: 'taskovia-c1-financial', objectKey: 'private/c1/file', originalName: 'source.xlsx', state: 'pending', previewState: 'available', version: 0 }, error: null }))
    const repository = createSupabaseFileRepository({ rpc } as never)
    await repository.createPending({ id: fileId, companyId, requestId: 'c1000000-0000-4000-8000-000000000099', originalName: 'source.xlsx' })
    expect(rpc).toHaveBeenCalledWith('c1_create_file_upload_intent', expect.objectContaining({ target_company_id: companyId, target_request_id: 'c1000000-0000-4000-8000-000000000099', target_input: expect.objectContaining({ id: fileId }) }))
  })

  it('gives equivalent rectangles and whole-file locators one canonical identity', () => {
    const first = normalizeSourceLocator({ kind: 'cell_range', sheetName: ' Nhật ký ', range: 'A1:B2' })
    expect(normalizeSourceLocator({ kind: 'cell_range', sheetName: ' Nhật ký ', range: 'B2:A1' }).locatorKey).toBe(first.locatorKey)
    expect(normalizeSourceLocator({ kind: 'cell_range', sheetName: ' Nhật ký ', range: 'B1:A2' }).locatorKey).toBe(first.locatorKey)
    expect(normalizeSourceLocator({ kind: 'whole_file', note: 'first note' }).locatorKey).toBe(normalizeSourceLocator({ kind: 'whole_file', note: 'second note' }).locatorKey)
  })

  it('requires the complete non-posting figure model and matching DB commands', () => {
    expect(() => sourceReportedFigureSchema.parse({ id: fileId, sourceSelectionId: fileId, figureFamilyId: fileId, revisionNo: 1, replacesFigureId: null, label: 'Balance', metricKind: 'reported_balance', rawValueText: '12.0000', valueState: 'known', amount: '12.0000', currencyCode: 'VND', basis: 'unknown', balanceKind: 'total_outstanding', roundingBasis: 'exact', roundingNote: null, periodBasis: 'cumulative_as_of', periodFrom: null, periodTo: null, asOfDate: '2026-09-12', projectId: null, engagementId: null, scopeKind: 'whole_project', scopeDescription: 'Source scope', confirmation: 'unverified', confirmationReference: null, status: 'draft', version: 0, createdAt: '2026-09-12T00:00:00.000Z', sharedAt: null })).not.toThrow()
    for (const name of ['c1_update_source_reported_figure', 'c1_create_source_figure_revision', 'c1_update_source_selection']) expect(migration).toContain(`function public.${name}`)
  })
})
