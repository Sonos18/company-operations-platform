import { describe, expect, it, vi } from 'vitest'
import { createSupabaseStage01ConfigRepository } from '../../../server/features/stage01-config/stage01-config.repository'
import { businessTaxonomies, context, criteria, definition, draft, ids } from './stage01-config.fixture'

function query(result: unknown) {
  const builder = {
    select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  return builder
}

describe('Stage 01 configuration repository', () => {
  it('uses the exact create RPC arguments and validates its business-safe draft response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: draft, error: null })
    const repository = createSupabaseStage01ConfigRepository({ rpc } as never)
    const input = { expectedPublishedSnapshotId: ids.snapshot }

    await expect(repository.createDraft(ids.company, input, ids.request)).resolves.toEqual(draft)
    expect(rpc).toHaveBeenCalledWith('create_stage01_config_draft', {
      target_company_id: ids.company,
      target_input: input,
      target_request_id: ids.request,
    })
  })

  it('uses the fixed update, discard, and publish RPC names with only scoped command arguments', async () => {
    const publishResult = {
      snapshotId: ids.snapshot, templateVersion: 2, schemaVersion: 1,
      definitionHash: 'config-hash', publishedAt: '2026-08-31T00:00:00.000Z',
    }
    const rpc = vi.fn((name: string) => Promise.resolve({
      data: name === 'discard_stage01_config_draft' ? {} : name === 'publish_stage01_config_draft' ? publishResult : draft,
      error: null,
    }))
    const repository = createSupabaseStage01ConfigRepository({ rpc } as never)
    const updateInput = { expectedDraftVersion: 0, taxonomies: businessTaxonomies, criteria }
    const versionInput = { expectedDraftVersion: 0 }

    await repository.updateDraft(ids.company, updateInput, ids.request)
    await repository.discardDraft(ids.company, versionInput, ids.request)
    await repository.publishDraft(ids.company, versionInput, ids.request)

    expect(rpc).toHaveBeenNthCalledWith(1, 'update_stage01_config_draft', {
      target_company_id: ids.company, target_input: updateInput, target_request_id: ids.request,
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'discard_stage01_config_draft', {
      target_company_id: ids.company, target_input: versionInput, target_request_id: ids.request,
    })
    expect(rpc).toHaveBeenNthCalledWith(3, 'publish_stage01_config_draft', {
      target_company_id: ids.company, target_input: versionInput, target_request_id: ids.request,
    })
  })

  it('maps every configuration command database failure without leaking its raw message', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'STAGE01_CONFIG_DRAFT_NOT_FOUND', details: 'secret' } })
    const repository = createSupabaseStage01ConfigRepository({ rpc } as never)

    await expect(repository.discardDraft(ids.company, { expectedDraftVersion: 0 }, ids.request))
      .rejects.toMatchObject({ statusCode: 404, code: 'STAGE01_CONFIG_DRAFT_NOT_FOUND' })
  })

  it('reads only the newest scoped Stage 01 snapshot and strips semantic metadata from the business view', async () => {
    const snapshot = query({
      data: {
        id: ids.snapshot, template_version: 2, schema_version: 1, definition_hash: 'config-hash',
        created_at: '2026-08-31T00:00:00.000Z', definition,
      }, error: null,
    })
    const activeDraft = query({
      data: {
        id: ids.draft, base_snapshot_id: ids.snapshot, version: 0, created_by: ids.actor,
        created_at: '2026-08-31T00:00:00.000Z', updated_by: ids.actor,
        updated_at: '2026-08-31T00:00:00.000Z', definition,
      }, error: null,
    })
    const from = vi.fn((table: string) => table === 'workflow_definition_snapshots' ? snapshot : activeDraft)
    const repository = createSupabaseStage01ConfigRepository({ from } as never)

    await expect(repository.get(ids.company)).resolves.toEqual({
      workflowKey: 'vqh.stage01',
      published: {
        snapshotId: ids.snapshot, templateVersion: 2, schemaVersion: 1, definitionHash: 'config-hash',
        publishedAt: '2026-08-31T00:00:00.000Z', taxonomies: businessTaxonomies, criteria,
        system: {
          nodes: definition.nodes, dependencies: definition.dependencies, dimensions: definition.dimensions,
          capabilities: definition.capabilities, gates: definition.gates,
        },
      },
      draft,
    })
    expect(snapshot.eq).toHaveBeenNthCalledWith(1, 'company_id', ids.company)
    expect(snapshot.eq).toHaveBeenNthCalledWith(2, 'workflow_key', 'vqh.stage01')
    expect(snapshot.order).toHaveBeenCalledWith('template_version', { ascending: false })
    expect(snapshot.limit).toHaveBeenCalledWith(1)
    expect(activeDraft.eq).toHaveBeenNthCalledWith(1, 'company_id', ids.company)
    expect(activeDraft.eq).toHaveBeenNthCalledWith(2, 'workflow_key', 'vqh.stage01')
  })

  it('fails closed for missing newest snapshots and malformed database payloads', async () => {
    const missing = createSupabaseStage01ConfigRepository({
      from: vi.fn(() => query({ data: null, error: null })),
    } as never)
    await expect(missing.get(ids.company)).rejects.toMatchObject({
      statusCode: 409, code: 'STAGE01_DEFINITION_CONFIG_UNAVAILABLE',
    })

    const malformed = createSupabaseStage01ConfigRepository({
      rpc: vi.fn().mockResolvedValue({ data: { id: ids.draft }, error: null }),
    } as never)
    await expect(malformed.updateDraft(ids.company, {
      expectedDraftVersion: 0, taxonomies: businessTaxonomies, criteria,
    }, ids.request)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })

    const validSnapshot = query({
      data: {
        id: ids.snapshot, template_version: 2, schema_version: 1, definition_hash: 'config-hash',
        created_at: '2026-08-31T00:00:00.000Z', definition,
      }, error: null,
    })
    const malformedDraft = query({ data: { id: ids.draft, definition: {} }, error: null })
    const malformedRead = createSupabaseStage01ConfigRepository({
      from: vi.fn((table: string) => table === 'workflow_definition_snapshots' ? validSnapshot : malformedDraft),
    } as never)
    await expect(malformedRead.get(ids.company)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })

    const invalidPublished = createSupabaseStage01ConfigRepository({
      from: vi.fn(() => query({ data: { id: ids.snapshot, definition: {} }, error: null })),
    } as never)
    await expect(invalidPublished.get(ids.company)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
  })

  it('validates direct repository inputs before reaching the database boundary', async () => {
    const rpc = vi.fn()
    const repository = createSupabaseStage01ConfigRepository({ rpc } as never)

    await expect(repository.updateDraft(ids.company, {
      expectedDraftVersion: 0,
      taxonomies: { ...businessTaxonomies, customer_type: [{ code: 'customer', label: 'Customer', semanticKey: 'reserved' }] },
      criteria,
    } as never, context.requestId)).rejects.toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
