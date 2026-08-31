import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ClientError } from '../../../app/errors/client-error'
import repositoriesPlugin from '../../../app/plugins/repositories.client'
import type { RepositoryRegistry } from '../../../app/repositories/contracts'
import { createAuthenticatedHttpClient } from '../../../app/repositories/http/authenticated-http-client'
import { createHttpStage01ConfigRepository } from '../../../app/repositories/http/http-stage01-config-repository'
import {
  publishStage01ConfigResultSchema,
  stage01BusinessConfigViewSchema,
  stage01ConfigDraftSchema,
} from '../../../shared/schemas/stage01-config'
import { businessTaxonomies, criteria, definition, draft, ids } from '../server/stage01-config.fixture'

vi.hoisted(() => {
  vi.stubGlobal('defineNuxtPlugin', <T>(plugin: T) => plugin)
})

const companyId = 'company / VQH'
const timestamp = '2026-08-31T00:00:00.000Z'
const config = {
  workflowKey: 'vqh.stage01' as const,
  published: {
    snapshotId: ids.snapshot,
    templateVersion: 1,
    schemaVersion: 1,
    definitionHash: 'stage01-definition-hash',
    publishedAt: timestamp,
    taxonomies: businessTaxonomies,
    criteria,
    system: {
      nodes: definition.nodes,
      dependencies: definition.dependencies,
      dimensions: definition.dimensions,
      capabilities: definition.capabilities,
      gates: definition.gates,
    },
  },
  draft,
}

const publishResult = {
  snapshotId: ids.snapshot,
  templateVersion: 2,
  schemaVersion: 1,
  definitionHash: 'published-stage01-definition-hash',
  publishedAt: timestamp,
}

function responseClient(responses: unknown[]) {
  return {
    request: vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(responses.shift())),
  }
}

describe('HTTP Stage 01 configuration repository', () => {
  it('uses all five approved encoded company-scoped endpoints with exact parsed bodies', async () => {
    const client = responseClient([config, draft, draft, null, publishResult])
    const repository = createHttpStage01ConfigRepository({ companyId, client: client as never })
    const createInput = { expectedPublishedSnapshotId: ids.snapshot }
    const updateInput = { expectedDraftVersion: 0, taxonomies: businessTaxonomies, criteria }
    const draftVersionInput = { expectedDraftVersion: 0 }

    await expect(repository.get()).resolves.toEqual(config)
    await expect(repository.createDraft(createInput)).resolves.toEqual(draft)
    await expect(repository.updateDraft(updateInput)).resolves.toEqual(draft)
    await expect(repository.discardDraft(draftVersionInput)).resolves.toBeUndefined()
    await expect(repository.publishDraft(draftVersionInput)).resolves.toEqual(publishResult)

    const calls = client.request.mock.calls.map(call => call[0])
    expect(calls).toEqual([
      expect.objectContaining({ url: '/api/companies/company%20%2F%20VQH/stage-01/config', method: 'GET' }),
      expect.objectContaining({ url: '/api/companies/company%20%2F%20VQH/stage-01/config/draft', method: 'POST', body: createInput }),
      expect.objectContaining({ url: '/api/companies/company%20%2F%20VQH/stage-01/config/draft', method: 'PUT', body: updateInput }),
      expect.objectContaining({ url: '/api/companies/company%20%2F%20VQH/stage-01/config/draft', method: 'DELETE', body: draftVersionInput }),
      expect.objectContaining({ url: '/api/companies/company%20%2F%20VQH/stage-01/config/draft/publish', method: 'POST', body: draftVersionInput }),
    ])
    expect(calls.map(call => call.schema)).toEqual([
      stage01BusinessConfigViewSchema,
      stage01ConfigDraftSchema,
      stage01ConfigDraftSchema,
      expect.objectContaining({ safeParse: expect.any(Function) }),
      publishStage01ConfigResultSchema,
    ])
  })

  it('rejects strict system, semantic, and raw-definition fields before invoking the client', async () => {
    const client = responseClient([])
    const repository = createHttpStage01ConfigRepository({ companyId, client: client as never })

    expect(() => repository.updateDraft({
      expectedDraftVersion: 0,
      taxonomies: {
        ...businessTaxonomies,
        customer_type: [{ ...businessTaxonomies.customer_type[0], semanticKey: 'reserved' }],
      },
      criteria,
      definition: definition,
      nodes: definition.nodes,
    } as never)).toThrow()

    expect(client.request).not.toHaveBeenCalled()
  })

  it('supplies the exact shared response schemas and rejects malformed responses', async () => {
    const client = responseClient([{ workflowKey: 'vqh.stage01' }])
    const repository = createHttpStage01ConfigRepository({ companyId, client: client as never })

    await expect(repository.get()).rejects.toThrow()
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ schema: stage01BusinessConfigViewSchema }))
  })

  it.each([
    ['get', () => undefined],
    ['createDraft', () => ({ expectedPublishedSnapshotId: ids.snapshot })],
    ['updateDraft', () => ({ expectedDraftVersion: 0, taxonomies: businessTaxonomies, criteria })],
    ['discardDraft', () => ({ expectedDraftVersion: 0 })],
    ['publishDraft', () => ({ expectedDraftVersion: 0 })],
  ] as const)('propagates the original ClientError from %s', async (method, input) => {
    const failure = new ClientError({ kind: 'api', code: 'VERSION_CONFLICT', message: 'stale', retryable: false })
    const client = { request: vi.fn().mockRejectedValue(failure) }
    const repository = createHttpStage01ConfigRepository({ companyId, client: client as never })

    const operation = method === 'get'
      ? repository.get()
      : repository[method](input() as never)

    await expect(operation).rejects.toBe(failure)
  })
})

describe('Stage 01 configuration repository registration and PUT transport', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('registers the repository against the active company', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    const request = vi.fn(async ({ schema }: { schema: { parse(value: unknown): unknown } }) => schema.parse(config))
    const result = await repositoriesPlugin.setup!({
      $authReady: Promise.resolve(),
      $companyAccessStore: { activeCompanyId: companyId },
      $authenticatedHttpClient: { request },
    } as never) as { provide: { repositories: RepositoryRegistry } }

    await expect(result.provide.repositories.stage01Config.get()).resolves.toEqual(config)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: '/api/companies/company%20%2F%20VQH/stage-01/config',
    }))
  })

  it('forwards PUT unchanged through the authenticated client while preserving internal-path validation', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ value: 1 }), { status: 200 }))
    const client = createAuthenticatedHttpClient({ getAccessToken: () => 'token', fetch })

    await expect(client.request({
      url: '/api/companies/company/stage-01/config/draft',
      method: 'PUT',
      body: { expectedDraftVersion: 0 },
      schema: z.object({ value: z.number() }),
    })).resolves.toEqual({ value: 1 })

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' })
  })
})
